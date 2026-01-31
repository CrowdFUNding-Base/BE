import { Request, Response } from "express";
import axios from "axios";
import { ethers } from "ethers";
import pool from "../config/database";
import {
  getIDRXContract,
  getCampaignContract,
  getContractAddress,
} from "../config/contracts";

/**
 * Create QRIS payment for a campaign
 * POST /api/contribution/qris
 */
export const createQRIS = async (req: Request, res: Response) => {
  const url = "https://app.sandbox.midtrans.com/snap/v1/transactions";

  try {
    const { campaign_id, amount, customer_details } = req.body;

    // Validate input
    if (!campaign_id || !amount) {
      return res.status(400).json({
        success: false,
        message: "campaign_id and amount are required",
      });
    }

    // Create order_id with format: campaignId-timestamp
    const orderId = `qris-${campaign_id}-${Date.now()}`;

    const response = await axios.post(
      url,
      {
        transaction_details: {
          order_id: orderId,
          gross_amount: amount,
        },
        customer_details: customer_details || {
          first_name: "Donatur",
          email: "donatur@crowdfunding.id",
        },
        credit_card: { secure: true },
      },
      {
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: process.env.MIDTRANS_AUTH,
        },
      },
    );
    console.log("QRIS Created:", response.data);

    res.status(200).json({
      success: true,
      data: {
        order_id: orderId,
        campaign_id: campaign_id,
        amount: amount,
        token: response.data.token,
        redirect_url: response.data.redirect_url,
      },
    });
  } catch (err: any) {
    console.error("Create QRIS error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.response?.data || err.message,
    });
  }
};

/**
 * Check QRIS payment status and mint+donate if settled
 * POST /api/contribution/qris-status/:orderId
 */
export const getQRISStatus = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { orderId } = req.params;
    const url = `https://api.sandbox.midtrans.com/v2/${orderId}/status`;

    // Check if this transaction has already been processed (anti-reentrancy)
    // We use blockchain_donations to check if tx with this order_id pattern exists
    const checkQuery = `
      SELECT * FROM blockchain_donations 
      WHERE id LIKE $1
    `;
    const existingTransaction = await client.query(checkQuery, [
      `qris-${orderId}%`,
    ]);

    if (existingTransaction.rows.length > 0) {
      return res.status(200).json({
        success: true,
        message: "Transaction already processed",
        data: existingTransaction.rows[0],
      });
    }

    const response = await axios.get(url, {
      headers: {
        accept: "application/json",
        authorization: process.env.MIDTRANS_AUTH,
      },
    });

    console.log("QRIS Status:", response.data);

    if (response.data.transaction_status === "settlement") {
      // Extract campaign_id from order_id (format: qris-{campaignId}-{timestamp})
      const orderParts = response.data.order_id.split("-");
      const campaignId = parseInt(orderParts[1]);
      const amount = parseFloat(response.data.gross_amount);

      if (isNaN(campaignId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order_id format",
        });
      }

      // Verify campaign exists in blockchain_campaigns
      const campaignQuery = `
        SELECT id, name FROM blockchain_campaigns WHERE id = $1
      `;

      const campaignResult = await client.query(campaignQuery, [campaignId]);
      console.log("campaign result:", campaignResult);
      if (campaignResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Campaign not found",
        });
      }

      // Mint IDRX and donate to Campaign contract
      const donateResult = await mintAndDonateIDRX(amount, campaignId);
      console.log("DONATE RESULT:", donateResult);
      if (!donateResult.success) {
        return res.status(500).json({
          success: false,
          message: "Minting and donation failed",
          error: donateResult.message,
        });
      }

      // Note: blockchain_donations will be populated by Ponder sync
      // after the donate transaction is confirmed on-chain

      res.status(200).json({
        success: true,
        data: {
          transaction: response.data,
          donation: donateResult.data,
          campaignId: campaignId,
          amount: amount,
          paymentMethod: "QRIS",
        },
      });
    } else {
      res.status(200).json({
        success: false,
        message: "Transaction not settled",
        status: response.data.transaction_status,
      });
    }
  } catch (err: any) {
    console.error("Get QRIS status error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Mint IDRX to backend wallet, then donate to Campaign contract
 */
const mintAndDonateIDRX = async (amount: number, campaignId: number) => {
  if (!amount || campaignId === undefined) {
    return {
      success: false,
      message: "Amount and campaignId are required",
    };
  }

  try {
    // Get contract instances
    const idrxContract = getIDRXContract();
    const campaignContract = getCampaignContract();
    const wallet = idrxContract.signer as ethers.Wallet;

    // Get contract addresses
    const idrxAddress = getContractAddress("IDRX");
    console.log("IDRXADDRESS", idrxAddress);
    const campaignAddress = getContractAddress("CAMPAIGN");

    console.log(`IDRX: ${idrxAddress}, Campaign: ${campaignAddress}`);

    // IDRX has 2 decimals
    const amountToMint = ethers.utils.parseUnits(amount.toString(), 2);

    // Step 1: Mint IDRX to backend wallet
    console.log(`[1/3] Minting ${amount} IDRX to backend wallet...`);
    const mintTx = await idrxContract.mint(wallet.address, amountToMint);
    await mintTx.wait();
    console.log(`Minted! TX: ${mintTx.hash}`);

    // Step 2: Approve Campaign contract to spend IDRX
    console.log(`[2/3] Approving Campaign contract...`);
    const approveTx = await idrxContract.approve(campaignAddress, amountToMint);
    await approveTx.wait();
    console.log(`Approved! TX: ${approveTx.hash}`);

    // Step 3: Donate IDRX to Campaign
    console.log(`[3/3] Donating to Campaign #${campaignId}...`);
    const donateTx = await campaignContract.donate(
      campaignId,
      amountToMint,
      idrxAddress,
    );
    const donateReceipt = await donateTx.wait();
    console.log(
      `Donated! TX: ${donateTx.hash}, Block: ${donateReceipt.blockNumber}`,
    );

    return {
      success: true,
      data: {
        mintTxHash: mintTx.hash,
        approveTxHash: approveTx.hash,
        donateTxHash: donateReceipt.transactionHash,
        blockNumber: donateReceipt.blockNumber,
        amount: amount,
        campaignId: campaignId,
        idrxAddress: idrxAddress,
        campaignAddress: campaignAddress,
      },
    };
  } catch (err: any) {
    console.error("Mint and donate error:", err);
    return {
      success: false,
      message: err.message || "Failed to mint and donate IDRX",
    };
  }
};
