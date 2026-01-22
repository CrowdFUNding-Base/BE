import { Request, Response } from "express";
import { ethers } from "ethers";
import pool from "../config/database";
import { getCampaignContract, getProvider } from "../config/contracts";

/**
 * Create a new vault (creates campaign on-chain and saves to DB)
 * POST /api/vaults/create
 */
export const createVault = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { title, description, targetAmount, endDate, crowdfunderEmail } =
      req.body;

    // Validate input
    if (!title || !targetAmount || !endDate) {
      return res.status(400).json({
        success: false,
        message: "title, targetAmount, and endDate are required",
      });
    }

    // Setup blockchain connection
    const campaignContract = getCampaignContract();

    // Convert targetAmount to IDRX units (2 decimals)
    const targetAmountInIDRX = ethers.utils.parseUnits(
      targetAmount.toString(),
      2,
    );

    await client.query("BEGIN");

    // Step 1: Create campaign on-chain
    console.log(`Creating campaign on-chain: ${title}`);
    const tx = await campaignContract.createCampaign(
      title,
      req.body.creatorName || "Anonymous",
      targetAmountInIDRX,
    );
    const receipt = await tx.wait();

    // Extract campaignId from event
    const campaignCreatedEvent = receipt.events?.find(
      (e: any) => e.event === "CampaignCreated",
    );
    const campaignId = campaignCreatedEvent?.args?.campaignId?.toNumber();

    if (!campaignId && campaignId !== 0) {
      await client.query("ROLLBACK");
      return res.status(500).json({
        success: false,
        message: "Failed to get campaignId from blockchain",
      });
    }

    console.log(`Campaign created on-chain with ID: ${campaignId}`);

    // Step 2: Create vault in database
    const vaultId = `vault-${Date.now()}`;
    const insertVaultQuery = `
      INSERT INTO vaults (
        vault_id, 
        campaign_id,
        crowdfunder_email,
        title, 
        description, 
        target_amount, 
        current_amount,
        currency,
        status,
        end_date,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const vaultResult = await client.query(insertVaultQuery, [
      vaultId,
      campaignId,
      crowdfunderEmail || "anonymous@example.com",
      title,
      description || "",
      targetAmount,
      0, // current_amount starts at 0
      "IDRX",
      "active",
      endDate,
    ]);

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Vault and campaign created successfully",
      data: {
        vault: vaultResult.rows[0],
        blockchain: {
          campaignId: campaignId,
          transactionHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
        },
      },
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Create vault error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create vault",
    });
  } finally {
    client.release();
  }
};

/**
 * Update vault details and/or status
 * PUT /api/vaults/:vaultId
 */
export const updateVaultDetails = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { vaultId } = req.params;
    const { title, description, endDate, status, targetAmount } = req.body;

    // Get vault to find campaign_id
    const vaultQuery = await client.query(
      "SELECT campaign_id, title, target_amount FROM vaults WHERE vault_id = $1",
      [vaultId],
    );

    if (vaultQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Vault not found",
      });
    }

    const vault = vaultQuery.rows[0];
    const campaignId = vault.campaign_id;

    await client.query("BEGIN");

    let blockchainTxHash = null;

    // If title or targetAmount changed, update blockchain
    if (title || targetAmount) {
      const campaignContract = getCampaignContract();

      // Use current values if not provided
      const newTitle = title || vault.title;
      const newTargetAmount = targetAmount || vault.target_amount;

      const targetAmountInIDRX = ethers.utils.parseUnits(
        newTargetAmount.toString(),
        2,
      );

      // ✅ UPDATE BLOCKCHAIN
      console.log(`Updating campaign #${campaignId} on blockchain...`);
      const tx = await campaignContract.updateCampaign(
        campaignId,
        newTitle,
        targetAmountInIDRX,
      );
      const receipt = await tx.wait();
      blockchainTxHash = receipt.transactionHash;
      console.log(`Campaign updated on-chain: ${blockchainTxHash}`);
    }

    // Validate status if provided
    if (
      status &&
      !["active", "completed", "cancelled", "expired"].includes(status)
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message:
          "Invalid status. Must be: active, completed, cancelled, expired",
      });
    }

    // ✅ UPDATE DATABASE
    const updateQuery = `
      UPDATE vaults 
      SET 
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        end_date = COALESCE($3, end_date),
        status = COALESCE($4, status),
        target_amount = COALESCE($5, target_amount),
        updated_at = CURRENT_TIMESTAMP
      WHERE vault_id = $6
      RETURNING *
    `;

    const result = await client.query(updateQuery, [
      title,
      description,
      endDate,
      status,
      targetAmount,
      vaultId,
    ]);

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: blockchainTxHash
        ? "Vault updated successfully (blockchain + database)"
        : "Vault updated successfully (database only)",
      data: {
        vault: result.rows[0],
        blockchain: blockchainTxHash
          ? {
              transactionHash: blockchainTxHash,
              campaignId: campaignId,
            }
          : null,
      },
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Update vault error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update vault",
    });
  } finally {
    client.release();
  }
};

/**
 * Get vault details (reads from blockchain + database)
 * GET /api/vaults/:vaultId
 */
export const getVaultDetails = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { vaultId } = req.params;

    // Get vault from database
    const vaultQuery = await client.query(
      "SELECT * FROM vaults WHERE vault_id = $1",
      [vaultId],
    );

    if (vaultQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Vault not found",
      });
    }

    const vault = vaultQuery.rows[0];
    const campaignId = vault.campaign_id;

    // Get campaign data from blockchain
    const campaignContract = getCampaignContract(getProvider());

    // ✅ READ FROM BLOCKCHAIN
    const campaignInfo = await campaignContract.getCampaignInfo(campaignId);

    res.status(200).json({
      success: true,
      data: {
        vault: vault,
        blockchain: {
          campaignId: campaignId,
          name: campaignInfo.name,
          creatorName: campaignInfo.creatorName,
          balance: ethers.utils.formatUnits(campaignInfo.balance, 2),
          targetAmount: ethers.utils.formatUnits(campaignInfo.targetAmount, 2),
          creationTime: campaignInfo.creationTime.toNumber(),
          owner: campaignInfo.owner,
        },
      },
    });
  } catch (err: any) {
    console.error("Get vault details error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to get vault details",
    });
  } finally {
    client.release();
  }
};
