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
 * Mock Withdraw to Bank (For Demo)
 * POST /api/vaults/withdraw-mock
 */
export const mockWithdrawFiat = async (req: Request, res: Response) => {
  try {
    const { campaignId, amount, bankName, accountNumber, accountHolder } = req.body;

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log(`[MOCK] Processing payout for Campaign #${campaignId}`);
    console.log(`[MOCK] Amount: Rp ${amount} -> ${bankName} (${accountNumber})`);

    // In a real app, this would trigger Xendit Payout / Midtrans Iris
    
    res.status(200).json({
      success: true,
      message: "Withdrawal request processed successfully",
      data: {
        transactionId: `payout-${Date.now()}`,
        status: "COMPLETED",
        amount: amount,
        bank: bankName,
        recipient: accountHolder
      }
    });
  } catch (error) {
    console.error("Mock withdrawal error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
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
 * Get vault details (reads from PostgreSQL cache)
 * GET /api/vaults/:vaultId
 */
export const getVaultDetails = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { vaultId } = req.params;

    // ✅ SINGLE QUERY: Join vaults + blockchain_campaigns (from cache)
    const query = `
      SELECT 
        v.*,
        bc.id as blockchain_campaign_id,
        bc.name as blockchain_name,
        bc.creator_name as blockchain_creator_name,
        bc.owner as blockchain_owner,
        bc.balance as blockchain_balance,
        bc.target_amount as blockchain_target_amount,
        bc.creation_time as blockchain_creation_time,
        bc.last_synced_at as blockchain_last_synced
      FROM vaults v
      LEFT JOIN blockchain_campaigns bc ON v.campaign_id = bc.id
      WHERE v.vault_id = $1
    `;

    const result = await client.query(query, [vaultId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Vault not found",
      });
    }

    const data = result.rows[0];

    res.status(200).json({
      success: true,
      data: {
        vault: {
          vaultId: data.vault_id,
          campaignId: data.campaign_id,
          crowdfunderEmail: data.crowdfunder_email,
          title: data.title,
          description: data.description,
          targetAmount: data.target_amount,
          currentAmount: data.current_amount,
          currency: data.currency,
          status: data.status,
          endDate: data.end_date,
          createdAt: data.created_at,
        },
        blockchain: data.blockchain_campaign_id
          ? {
              campaignId: data.blockchain_campaign_id,
              name: data.blockchain_name,
              creatorName: data.blockchain_creator_name,
              owner: data.blockchain_owner,
              balance: data.blockchain_balance,
              targetAmount: data.blockchain_target_amount,
              creationTime: data.blockchain_creation_time,
              lastSyncedAt: data.blockchain_last_synced,
            }
          : null,
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

/**
 * Get all vaults with blockchain data (from PostgreSQL cache)
 * GET /api/vaults
 */
export const getAllVaults = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { status = "active", limit = 20, offset = 0 } = req.query;

    // ✅ SINGLE QUERY: Join vaults + blockchain_campaigns (from cache)
    const query = `
      SELECT 
        v.*,
        bc.id as blockchain_campaign_id,
        bc.name as blockchain_name,
        bc.creator_name as blockchain_creator_name,
        bc.owner as blockchain_owner,
        bc.balance as blockchain_balance,
        bc.target_amount as blockchain_target_amount,
        bc.creation_time as blockchain_creation_time,
        bc.last_synced_at as blockchain_last_synced
      FROM vaults v
      LEFT JOIN blockchain_campaigns bc ON v.campaign_id = bc.id
      WHERE v.status = $1
      ORDER BY v.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await client.query(query, [status, limit, offset]);

    // Get total count
    const countResult = await client.query(
      "SELECT COUNT(*) FROM vaults WHERE status = $1",
      [status],
    );

    const vaults = result.rows.map((data: any) => ({
      vault: {
        vaultId: data.vault_id,
        campaignId: data.campaign_id,
        title: data.title,
        description: data.description,
        targetAmount: data.target_amount,
        currentAmount: data.current_amount,
        currency: data.currency,
        status: data.status,
        endDate: data.end_date,
        createdAt: data.created_at,
      },
      blockchain: data.blockchain_campaign_id
        ? {
            campaignId: data.blockchain_campaign_id,
            name: data.blockchain_name,
            creatorName: data.blockchain_creator_name,
            owner: data.blockchain_owner,
            balance: data.blockchain_balance,
            targetAmount: data.blockchain_target_amount,
            creationTime: data.blockchain_creation_time,
            lastSyncedAt: data.blockchain_last_synced,
          }
        : null,
    }));

    res.status(200).json({
      success: true,
      data: vaults,
      meta: {
        total: parseInt(countResult.rows[0].count),
        limit: Number(limit),
        offset: Number(offset),
        source: "PostgreSQL Cache",
      },
    });
  } catch (err: any) {
    console.error("Get all vaults error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to get vaults",
    });
  } finally {
    client.release();
  }
};

/**
 * Get vault statistics (from PostgreSQL cache)
 * GET /api/vaults/statistics
 */
export const getVaultStatistics = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    // ✅ All data from PostgreSQL (no external HTTP calls!)
    const statsQuery = `
      SELECT 
        -- Vault stats
        (SELECT COUNT(*) FROM vaults) as total_vaults,
        (SELECT COUNT(*) FROM vaults WHERE status = 'active') as active_vaults,
        (SELECT COUNT(*) FROM vaults WHERE status = 'completed') as completed_vaults,
        (SELECT COUNT(*) FROM vaults WHERE status = 'cancelled') as cancelled_vaults,
        (SELECT SUM(current_amount) FROM vaults) as total_raised_app,
        (SELECT SUM(target_amount) FROM vaults) as total_target_app,
        
        -- Blockchain stats (from cache)
        (SELECT COUNT(*) FROM blockchain_campaigns) as total_campaigns,
        (SELECT COALESCE(SUM(balance), 0) FROM blockchain_campaigns) as total_balance_blockchain,
        (SELECT COALESCE(SUM(target_amount), 0) FROM blockchain_campaigns) as total_target_blockchain,
        (SELECT COUNT(*) FROM blockchain_donations) as total_donations,
        (SELECT COALESCE(SUM(amount), 0) FROM blockchain_donations) as total_donated,
        (SELECT COUNT(*) FROM blockchain_badges) as total_badges,
        (SELECT COUNT(*) FROM blockchain_withdrawals) as total_withdrawals,
        (SELECT COALESCE(SUM(amount), 0) FROM blockchain_withdrawals) as total_withdrawn
    `;

    const result = await client.query(statsQuery);
    const stats = result.rows[0];

    // Calculate progress
    const totalTarget = parseFloat(stats.total_target_blockchain) || 1;
    const totalBalance = parseFloat(stats.total_balance_blockchain) || 0;
    const averageProgress = ((totalBalance / totalTarget) * 100).toFixed(2);

    res.status(200).json({
      success: true,
      data: {
        application: {
          totalVaults: parseInt(stats.total_vaults) || 0,
          activeVaults: parseInt(stats.active_vaults) || 0,
          completedVaults: parseInt(stats.completed_vaults) || 0,
          cancelledVaults: parseInt(stats.cancelled_vaults) || 0,
          totalRaisedApp: parseFloat(stats.total_raised_app) || 0,
          totalTargetApp: parseFloat(stats.total_target_app) || 0,
        },
        blockchain: {
          totalCampaigns: parseInt(stats.total_campaigns) || 0,
          totalDonations: parseInt(stats.total_donations) || 0,
          totalBadges: parseInt(stats.total_badges) || 0,
          totalWithdrawals: parseInt(stats.total_withdrawals) || 0,
          totalBalance: stats.total_balance_blockchain || "0",
          totalTarget: stats.total_target_blockchain || "0",
          totalDonated: stats.total_donated || "0",
          totalWithdrawn: stats.total_withdrawn || "0",
          averageProgress: `${averageProgress}%`,
        },
        source: "PostgreSQL Cache (synced by Ponder)",
      },
    });
  } catch (err: any) {
    console.error("Get vault statistics error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to get statistics",
    });
  } finally {
    client.release();
  }
};

/**
 * Get donations for a vault (from PostgreSQL cache)
 * GET /api/vaults/:vaultId/donations
 */
export const getVaultDonations = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { vaultId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Get campaign_id from vault
    const vaultResult = await client.query(
      "SELECT campaign_id FROM vaults WHERE vault_id = $1",
      [vaultId],
    );

    if (vaultResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Vault not found",
      });
    }

    const campaignId = vaultResult.rows[0].campaign_id;

    // Get donations from cache
    const donationsQuery = `
      SELECT * FROM blockchain_donations 
      WHERE campaign_id = $1 
      ORDER BY timestamp DESC 
      LIMIT $2 OFFSET $3
    `;

    const result = await client.query(donationsQuery, [
      campaignId,
      limit,
      offset,
    ]);

    // Get total count
    const countResult = await client.query(
      "SELECT COUNT(*) FROM blockchain_donations WHERE campaign_id = $1",
      [campaignId],
    );

    res.status(200).json({
      success: true,
      data: result.rows,
      meta: {
        total: parseInt(countResult.rows[0].count),
        limit: Number(limit),
        offset: Number(offset),
        campaignId: campaignId,
        source: "PostgreSQL Cache",
      },
    });
  } catch (err: any) {
    console.error("Get vault donations error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to get donations",
    });
  } finally {
    client.release();
  }
};

/**
 * Get user's donations by wallet address (from PostgreSQL cache)
 * GET /api/donations/user/:walletAddress
 */
export const getUserDonations = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { walletAddress } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const query = `
      SELECT 
        d.*,
        bc.name as campaign_name,
        bc.creator_name as campaign_creator
      FROM blockchain_donations d
      LEFT JOIN blockchain_campaigns bc ON d.campaign_id = bc.id
      WHERE LOWER(d.donor) = LOWER($1)
      ORDER BY d.timestamp DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await client.query(query, [walletAddress, limit, offset]);

    // Get total count
    const countResult = await client.query(
      "SELECT COUNT(*) FROM blockchain_donations WHERE LOWER(donor) = LOWER($1)",
      [walletAddress],
    );

    res.status(200).json({
      success: true,
      data: result.rows,
      meta: {
        total: parseInt(countResult.rows[0].count),
        limit: Number(limit),
        offset: Number(offset),
        walletAddress: walletAddress,
        source: "PostgreSQL Cache",
      },
    });
  } catch (err: any) {
    console.error("Get user donations error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to get user donations",
    });
  } finally {
    client.release();
  }
};

/**
 * Get user's badges by wallet address (from PostgreSQL cache)
 * GET /api/badges/user/:walletAddress
 */
export const getUserBadges = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { walletAddress } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const query = `
      SELECT * FROM blockchain_badges 
      WHERE LOWER(owner) = LOWER($1)
      ORDER BY timestamp DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await client.query(query, [walletAddress, limit, offset]);

    // Get total count
    const countResult = await client.query(
      "SELECT COUNT(*) FROM blockchain_badges WHERE LOWER(owner) = LOWER($1)",
      [walletAddress],
    );

    res.status(200).json({
      success: true,
      data: result.rows,
      meta: {
        total: parseInt(countResult.rows[0].count),
        limit: Number(limit),
        offset: Number(offset),
        walletAddress: walletAddress,
        source: "PostgreSQL Cache",
      },
    });
  } catch (err: any) {
    console.error("Get user badges error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to get user badges",
    });
  } finally {
    client.release();
  }
};

/**
 * Get all blockchain campaigns (from PostgreSQL cache)
 * GET /api/campaigns
 */
export const getAllCampaigns = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { limit = 50, offset = 0 } = req.query;

    const query = `
      SELECT * FROM blockchain_campaigns 
      ORDER BY creation_time DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await client.query(query, [limit, offset]);

    // Get total count
    const countResult = await client.query(
      "SELECT COUNT(*) FROM blockchain_campaigns",
    );

    res.status(200).json({
      success: true,
      data: result.rows,
      meta: {
        total: parseInt(countResult.rows[0].count),
        limit: Number(limit),
        offset: Number(offset),
        source: "PostgreSQL Cache",
      },
    });
  } catch (err: any) {
    console.error("Get all campaigns error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to get campaigns",
    });
  } finally {
    client.release();
  }
};

/**
 * Get single campaign by ID (from PostgreSQL cache)
 * GET /api/campaigns/:id
 */
export const getCampaignById = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    // JOIN with vaults table to get description
    const query = `
      SELECT bc.*, v.description, v.vault_id
      FROM blockchain_campaigns bc
      LEFT JOIN vaults v ON bc.id = v.campaign_id
      WHERE bc.id = $1
    `;

    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    const data = result.rows[0];

    res.status(200).json({
      success: true,
      data: {
        campaign: {
          id: data.id,
          name: data.name,
          creatorName: data.creator_name,
          owner: data.owner,
          balance: data.balance,
          targetAmount: data.target_amount,
          creationTime: data.creation_time,
          lastSyncedAt: data.last_synced_at,
          description: data.description || `Campaign by ${data.creator_name}`,
        },
        vault: data.vault_id ? {
          vaultId: data.vault_id,
          description: data.description,
        } : null,
      },
    });
  } catch (err: any) {
    console.error("Get campaign by ID error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to get campaign",
    });
  } finally {
    client.release();
  }
};
