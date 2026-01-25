import { Request, Response } from "express";
import axios from "axios";
import { ethers } from "ethers";
import pool from "../config/database";
import {
  getIDRXContract,
  getCampaignContract,
  getContractAddress,
} from "../config/contracts";

export const createQRIS = async (req: Request, res: Response) => {
  const url = "https://app.sandbox.midtrans.com/snap/v1/transactions";

  try {
    const { vault_id, amount, customer_details } = req.body;

    // Validate input
    if (!vault_id || !amount) {
      res.status(400).json({
        success: false,
        message: "vault_id and amount are required",
      });
    }

    // Create order_id with format: vaultId-timestamp
    const orderId = `${vault_id}-${Date.now()}`;

    const response = await axios.post(
      url,
      {
        transaction_details: {
          order_id: orderId,
          gross_amount: amount,
        },
        customer_details: customer_details || {
          first_name: "Customer",
          email: "customer@example.com",
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
    console.log(response.data);

    res.status(200).json({
      success: true,
      data: {
        order_id: orderId,
        token: response.data.token,
        redirect_url: response.data.redirect_url,
      },
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.response?.data || err.message,
    });
  }
};

export const getQRISStatus = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { orderId } = req.params;
    const url = `https://api.sandbox.midtrans.com/v2/${orderId}/status`;

    // Check if this transaction has already been processed (anti-reentrancy)
    const checkQuery = `
      SELECT * FROM contributors 
      WHERE qris_transaction_id = $1 AND status = 'completed'
    `;
    const existingTransaction = await client.query(checkQuery, [orderId]);

    if (existingTransaction.rows.length > 0) {
      res.status(400).json({
        success: false,
        message: "Transaction already processed",
      });
    }

    const response = await axios.get(url, {
      headers: {
        accept: "application/json",
        authorization: process.env.MIDTRANS_AUTH,
      },
    });

    console.log(response.data);

    if (response.data.transaction_status === "settlement") {
      // Extract vault_id from order_id
      const vaultId = response.data.order_id.split("-")[0];
      const amount = parseFloat(response.data.gross_amount);

      // Get vault details
      const vaultQuery = `
        SELECT vault_id, campaign_id, current_amount, target_amount 
        FROM vaults 
        WHERE vault_id = $1
      `;
      const vaultResult = await client.query(vaultQuery, [vaultId]);

      if (vaultResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Vault not found",
        });
      }

      const vault = vaultResult.rows[0];
      const campaignId = vault.campaign_id;

      // Start transaction
      await client.query("BEGIN");

      // Insert contributor record
      await client.query(
        `INSERT INTO contributors (
          vault_id, amount, currency, payment_method, 
          qris_transaction_id, status
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [vaultId, amount, "IDRX", "QRIS", orderId, "minting"],
      );

      // Mint IDRX and donate to Campaign contract
      const donateResult = await mintAndDonateIDRX(amount, campaignId);

      if (!donateResult.success) {
        await client.query("ROLLBACK");
        return res.status(500).json({
          success: false,
          message: "Minting and donation failed",
          error: donateResult.message,
        });
      }

      // Update contributor status
      await client.query(
        `UPDATE contributors 
         SET status = 'completed', transaction_hash = $1
         WHERE qris_transaction_id = $2`,
        [donateResult.data?.donateTxHash || "N/A", orderId],
      );

      // Update vault current_amount
      await client.query(
        `UPDATE vaults 
         SET current_amount = current_amount + $1, updated_at = CURRENT_TIMESTAMP
         WHERE vault_id = $2`,
        [amount, vaultId],
      );

      await client.query("COMMIT");

      res.status(200).json({
        success: true,
        data: {
          transaction: response.data,
          donation: donateResult.data,
          vaultId: vaultId,
          campaignId: campaignId,
          amount: amount,
        },
      });
    } else {
      res.status(200).json({
        success: false,
        message: "Transaction not settled",
        status: response.data.transaction_status,
      });
    }
  } catch (err) {
    // Rollback on any error
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
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
