import axios from "axios";
import pool from "../config/database";

const PONDER_URL = process.env.PONDER_URL || "http://localhost:42069";
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS || "10000"); // Default: 10 seconds

console.log("🔧 PONDER_URL configured as:", PONDER_URL);

let isRunning = false;

/**
 * Sync all data from Ponder Indexer to PostgreSQL
 */
async function syncFromPonder() {
  if (isRunning) {
    console.log("⏳ Sync already in progress, skipping...");
    return;
  }

  isRunning = true;
  const client = await pool.connect();

  try {
    console.log(
      `🔄 [${new Date().toISOString()}] Auto-sync from Ponder started...`,
    );

    let syncedCounts = {
      campaigns: 0,
      donations: 0,
      badges: 0,
      withdrawals: 0,
    };

    // 1. Sync Campaigns
    try {
      const campaignsResponse = await axios.post(`${PONDER_URL}/graphql`, {
        query: `
          query {
            campaignss(limit: 1000) {
              items {
                id
                name
                creatorName
                balance
                targetAmount
                creationTime
                owner
              }
            }
          }
        `,
      });

      const campaigns = campaignsResponse.data?.data?.campaignss?.items || [];

      for (const campaign of campaigns) {
        await client.query(
          `
          INSERT INTO blockchain_campaigns (
            id, name, creator_name, balance, target_amount, 
            creation_time, owner, last_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            creator_name = EXCLUDED.creator_name,
            balance = EXCLUDED.balance,
            target_amount = EXCLUDED.target_amount,
            last_synced_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        `,
          [
            campaign.id,
            campaign.name,
            campaign.creatorName || "",
            campaign.balance || "0",
            campaign.targetAmount,
            campaign.creationTime,
            campaign.owner,
          ],
        );
        syncedCounts.campaigns++;
      }
    } catch (error: any) {
      console.error("❌ Failed to sync campaigns:", error.message || error);
    }

    // 2. Sync Donations
    try {
      const donationsResponse = await axios.post(`${PONDER_URL}/graphql`, {
        query: `
          query {
            donationss(limit: 1000) {
              items {
                id
                campaignId
                donor
                amount
                transactionHash
                blockNumber
                timestamp
              }
            }
          }
        `,
      });
      const donations = donationsResponse.data?.data?.donationss?.items || [];

      for (const donation of donations) {
        await client.query(
          `
          INSERT INTO blockchain_donations (
            id, campaign_id, donor, amount, transaction_hash, 
            block_number, timestamp, last_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO NOTHING
        `,
          [
            donation.id,
            donation.campaignId,
            donation.donor,
            donation.amount,
            donation.transactionHash,
            donation.blockNumber,
            donation.timestamp,
          ],
        );

        syncedCounts.donations++;
      }
    } catch (error: any) {
      console.error("❌ Failed to sync donations:", error.message || error);
    }

    // 3. Sync Badges
    try {
      const badgesResponse = await axios.post(`${PONDER_URL}/graphql`, {
        query: `
          query {
            badgess(limit: 1000) {
              items {
                tokenId
                owner
                name
                transactionHash
                blockNumber
                timestamp
              }
            }
          }
        `,
      });
      const badges = badgesResponse.data?.data?.badgess?.items || [];

      for (const badge of badges) {
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
          [
            badge.tokenId,
            badge.owner,
            badge.name,
            badge.transactionHash,
            badge.blockNumber,
            badge.timestamp,
          ],
        );
        syncedCounts.badges++;
      }
    } catch (error: any) {
      console.error("❌ Failed to sync badges:", error.message || error);
    }

    // 4. Sync Withdrawals
    try {
      const withdrawalsResponse = await axios.post(`${PONDER_URL}/graphql`, {
        query: `
          query {
            withdrawalss(limit: 1000) {
              items {
                id
                campaignId
                name
                owner
                creatorName
                amount
                transactionHash
                blockNumber
                timestamp
              }
            }
          }
        `,
      });
      const withdrawals =
        withdrawalsResponse.data?.data?.withdrawalss?.items || [];

      for (const withdrawal of withdrawals) {
        await client.query(
          `
          INSERT INTO blockchain_withdrawals (
            id, campaign_id, name, owner, creator_name, amount, 
            transaction_hash, block_number, timestamp, last_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO NOTHING
        `,
          [
            withdrawal.id,
            withdrawal.campaignId,
            withdrawal.name || "",
            withdrawal.owner,
            withdrawal.creatorName || "",
            withdrawal.amount,
            withdrawal.transactionHash,
            withdrawal.blockNumber,
            withdrawal.timestamp,
          ],
        );
        syncedCounts.withdrawals++;
      }
    } catch (error: any) {
      console.error("❌ Failed to sync withdrawals:", error.message || error);
    }

    console.log(`✅ Auto-sync completed:`, syncedCounts);
  } catch (error: any) {
    console.error("❌ Auto-sync error:", error.message);
  } finally {
    client.release();
    isRunning = false;
  }
}

/**
 * Start the auto-sync scheduler
 */
export function startAutoSync() {
  console.log(
    `🚀 Starting auto-sync scheduler (interval: ${SYNC_INTERVAL_MS / 1000}s)`,
  );

  // Run immediately on startup
  syncFromPonder();

  // Then run at interval
  setInterval(syncFromPonder, SYNC_INTERVAL_MS);
}

export { syncFromPonder };
