import { Request, Response, NextFunction } from "express";
import pool from "../config/database";
import env from "dotenv";

env.config();

// API Key untuk Ponder webhook (opsional, untuk keamanan)
const PONDER_API_KEY = process.env.PONDER_SYNC_API_KEY || "ponder-sync-key";

/**
 * Middleware untuk validasi API key dari Ponder
 */
export const validatePonderApiKey = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const apiKey = req.headers["x-ponder-api-key"];

  if (apiKey !== PONDER_API_KEY) {
    res.status(401).json({
      success: false,
      message: "Invalid API key",
    });
    return;
  }

  next();
};

/**
 * Sync Campaign dari Ponder
 * POST /api/sync/campaign
 */
export const syncCampaign = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const client = await pool.connect();

  try {
    const {
      id,
      name,
      creatorName,
      owner,
      balance,
      targetAmount,
      creationTime,
    } = req.body;

    // Validasi input
    if (id === undefined || !name || !owner || !targetAmount || !creationTime) {
      res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
      return;
    }

    // Upsert campaign
    await client.query(
      `
      INSERT INTO blockchain_campaigns (
        id, name, creator_name, owner, balance, target_amount, 
        creation_time, last_synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        creator_name = EXCLUDED.creator_name,
        owner = EXCLUDED.owner,
        balance = EXCLUDED.balance,
        target_amount = EXCLUDED.target_amount,
        last_synced_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `,
      [
        id,
        name,
        creatorName || "",
        owner,
        balance || "0",
        targetAmount,
        creationTime,
      ],
    );

    // Update sync status
    await updateSyncStatus(client, "campaign");

    console.log(`✅ Campaign synced: ID ${id}`);

    res.status(200).json({
      success: true,
      message: "Campaign synced successfully",
      data: { id },
    });
  } catch (error: any) {
    console.error("❌ Sync campaign error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to sync campaign",
    });
  } finally {
    client.release();
  }
};

/**
 * Update Campaign Balance
 * POST /api/sync/campaign-balance
 */
export const syncCampaignBalance = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const client = await pool.connect();

  try {
    const { campaignId, newBalance } = req.body;

    console.log("📊 Received campaign balance update:", {
      campaignId,
      newBalance,
      body: req.body,
    });

    if (campaignId === undefined || newBalance === undefined) {
      console.error("❌ Validation failed - missing fields:", {
        campaignId,
        newBalance,
      });
      res.status(400).json({
        success: false,
        message: "Missing campaignId or newBalance",
      });
      return;
    }

    await client.query(
      `
      UPDATE blockchain_campaigns 
      SET balance = $1, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `,
      [newBalance, campaignId],
    );

    console.log(
      `✅ Campaign balance updated: ID ${campaignId}, Balance: ${newBalance}`,
    );

    res.status(200).json({
      success: true,
      message: "Campaign balance updated",
    });
  } catch (error: any) {
    console.error("❌ Sync campaign balance error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to sync campaign balance",
    });
  } finally {
    client.release();
  }
};

/**
 * Sync Donation dari Ponder
 * POST /api/sync/donation
 */
export const syncDonation = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const client = await pool.connect();

  try {
    const {
      id,
      campaignId,
      donor,
      amount,
      transactionHash,
      blockNumber,
      timestamp,
    } = req.body;

    // Validasi input
    if (
      id === undefined ||
      campaignId === undefined ||
      !donor ||
      !amount ||
      !transactionHash ||
      !blockNumber ||
      !timestamp
    ) {
      console.error("❌ Validation failed:", {
        id,
        campaignId,
        donor,
        amount,
        transactionHash,
        blockNumber,
        timestamp,
      });
      res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
      return;
    }

    // Insert donation (ignore if exists)
    await client.query(
      `
      INSERT INTO blockchain_donations (
        id, campaign_id, donor, amount, transaction_hash, 
        block_number, timestamp, last_synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO NOTHING
    `,
      [id, campaignId, donor, amount, transactionHash, blockNumber, timestamp],
    );

    // Update sync status
    await updateSyncStatus(client, "donation", blockNumber);

    console.log(`✅ Donation synced: ${id}`);

    res.status(200).json({
      success: true,
      message: "Donation synced successfully",
      data: { id, campaignId },
    });
  } catch (error: any) {
    console.error("❌ Sync donation error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to sync donation",
    });
  } finally {
    client.release();
  }
};

/**
 * Sync Withdrawal dari Ponder
 * POST /api/sync/withdrawal
 */
export const syncWithdrawal = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const client = await pool.connect();

  try {
    const {
      id,
      campaignId,
      name,
      owner,
      creatorName,
      amount,
      transactionHash,
      blockNumber,
      timestamp,
    } = req.body;

    // Validasi input
    if (
      id === undefined ||
      campaignId === undefined ||
      !owner ||
      !amount ||
      !transactionHash
    ) {
      res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
      return;
    }

    // Insert withdrawal (ignore if exists)
    await client.query(
      `
      INSERT INTO blockchain_withdrawals (
        id, campaign_id, name, owner, creator_name, amount, 
        transaction_hash, block_number, timestamp, last_synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO NOTHING
    `,
      [
        id,
        campaignId,
        name || "",
        owner,
        creatorName || "",
        amount,
        transactionHash,
        blockNumber,
        timestamp,
      ],
    );

    // Update sync status
    await updateSyncStatus(client, "withdrawal", blockNumber);

    console.log(`✅ Withdrawal synced: ${id}`);

    res.status(200).json({
      success: true,
      message: "Withdrawal synced successfully",
      data: { id, campaignId },
    });
  } catch (error: any) {
    console.error("❌ Sync withdrawal error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to sync withdrawal",
    });
  } finally {
    client.release();
  }
};

/**
 * Sync Badge dari Ponder
 * POST /api/sync/badge
 */
export const syncBadge = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const { tokenId, owner, name, transactionHash, blockNumber, timestamp } =
      req.body;

    // Validasi input
    if (tokenId === undefined || !owner || !name || !transactionHash) {
      res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
      return;
    }

    // Upsert badge (update owner if transferred)
    await client.query(
      `
      INSERT INTO blockchain_badges (
        token_id, owner, name, transaction_hash, 
        block_number, timestamp, last_synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (token_id) DO UPDATE SET
        owner = EXCLUDED.owner,
        last_synced_at = CURRENT_TIMESTAMP
    `,
      [tokenId, owner, name, transactionHash, blockNumber, timestamp],
    );

    // Update sync status
    await updateSyncStatus(client, "badge", blockNumber);

    console.log(`✅ Badge synced: Token ID ${tokenId}`);

    res.status(200).json({
      success: true,
      message: "Badge synced successfully",
      data: { tokenId, owner },
    });
  } catch (error: any) {
    console.error("❌ Sync badge error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to sync badge",
    });
  } finally {
    client.release();
  }
};

/**
 * Batch sync multiple records
 * POST /api/sync/batch
 */
export const syncBatch = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();

  try {
    const { campaigns, donations, withdrawals, badges } = req.body;

    await client.query("BEGIN");

    let syncedCount = {
      campaigns: 0,
      donations: 0,
      withdrawals: 0,
      badges: 0,
    };

    // Sync campaigns
    if (campaigns && Array.isArray(campaigns)) {
      for (const c of campaigns) {
        await client.query(
          `
          INSERT INTO blockchain_campaigns (id, name, creator_name, owner, balance, target_amount, creation_time, last_synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name, balance = EXCLUDED.balance, 
            target_amount = EXCLUDED.target_amount, last_synced_at = CURRENT_TIMESTAMP
        `,
          [
            c.id,
            c.name,
            c.creatorName,
            c.owner,
            c.balance,
            c.targetAmount,
            c.creationTime,
          ],
        );
        syncedCount.campaigns++;
      }
    }

    // Sync donations
    if (donations && Array.isArray(donations)) {
      for (const d of donations) {
        await client.query(
          `
          INSERT INTO blockchain_donations (id, campaign_id, donor, amount, transaction_hash, block_number, timestamp, last_synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO NOTHING
        `,
          [
            d.id,
            d.campaignId,
            d.donor,
            d.amount,
            d.transactionHash,
            d.blockNumber,
            d.timestamp,
          ],
        );
        syncedCount.donations++;
      }
    }

    // Sync withdrawals
    if (withdrawals && Array.isArray(withdrawals)) {
      for (const w of withdrawals) {
        await client.query(
          `
          INSERT INTO blockchain_withdrawals (id, campaign_id, name, owner, creator_name, amount, transaction_hash, block_number, timestamp, last_synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO NOTHING
        `,
          [
            w.id,
            w.campaignId,
            w.name,
            w.owner,
            w.creatorName,
            w.amount,
            w.transactionHash,
            w.blockNumber,
            w.timestamp,
          ],
        );
        syncedCount.withdrawals++;
      }
    }

    // Sync badges
    if (badges && Array.isArray(badges)) {
      for (const b of badges) {
        await client.query(
          `
          INSERT INTO blockchain_badges (token_id, owner, name, transaction_hash, block_number, timestamp, last_synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
          ON CONFLICT (token_id) DO UPDATE SET owner = EXCLUDED.owner, last_synced_at = CURRENT_TIMESTAMP
        `,
          [
            b.tokenId,
            b.owner,
            b.name,
            b.transactionHash,
            b.blockNumber,
            b.timestamp,
          ],
        );
        syncedCount.badges++;
      }
    }

    await client.query("COMMIT");

    console.log(`✅ Batch sync completed:`, syncedCount);

    res.status(200).json({
      success: true,
      message: "Batch sync completed",
      data: syncedCount,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ Batch sync error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to batch sync",
    });
  } finally {
    client.release();
  }
};

/**
 * Get sync status
 * GET /api/sync/status
 */
export const getSyncStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT 
        entity_type,
        last_block_number,
        last_synced_at,
        total_synced,
        status,
        error_message
      FROM sync_status
      ORDER BY entity_type
    `);

    // Get counts from each table
    const countsResult = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM blockchain_campaigns) as campaigns_count,
        (SELECT COUNT(*) FROM blockchain_donations) as donations_count,
        (SELECT COUNT(*) FROM blockchain_withdrawals) as withdrawals_count,
        (SELECT COUNT(*) FROM blockchain_badges) as badges_count
    `);

    res.status(200).json({
      success: true,
      data: {
        syncStatus: result.rows,
        counts: countsResult.rows[0],
        lastChecked: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Get sync status error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get sync status",
    });
  } finally {
    client.release();
  }
};

/**
 * Helper: Update sync status
 */
async function updateSyncStatus(
  client: any,
  entityType: string,
  blockNumber?: number,
) {
  try {
    await client.query(
      `
      UPDATE sync_status 
      SET 
        last_block_number = COALESCE($1, last_block_number),
        last_synced_at = CURRENT_TIMESTAMP,
        total_synced = total_synced + 1,
        status = 'healthy',
        error_message = NULL
      WHERE entity_type = $2
    `,
      [blockNumber, entityType],
    );
  } catch (error) {
    console.error("Failed to update sync status:", error);
  }
}
