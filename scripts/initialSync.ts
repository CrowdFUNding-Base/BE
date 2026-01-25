import "dotenv/config"; // Load environment variables
import axios from "axios";
import pool from "../config/database";

const PONDER_URL = process.env.PONDER_URL || "http://localhost:42069";

interface Campaign {
  id: number;
  name: string;
  creatorName: string;
  balance: string;
  targetAmount: string;
  creationTime: string;
  owner: string;
}

interface Donation {
  id: string;
  campaignId: number;
  donor: string;
  amount: string;
  transactionHash: string;
  blockNumber: string;
  timestamp: string;
}

interface Badge {
  tokenId: number;
  owner: string;
  name: string;
  transactionHash: string;
  blockNumber: string;
  timestamp: string;
}

interface Withdrawal {
  id: string;
  campaignId: number;
  name: string;
  owner: string;
  creatorName: string;
  amount: string;
  transactionHash: string;
  blockNumber: string;
  timestamp: string;
}

/**
 * Initial sync: Import all historical blockchain data from Ponder to PostgreSQL
 */
async function initialSync() {
  const client = await pool.connect();

  try {
    console.log("🚀 Starting initial sync from Ponder to PostgreSQL...\n");

    // Note: Skipping Ponder check since REST API endpoints are deprecated
    // Data will be fetched via GraphQL
    console.log("📡 Connecting to Ponder at", PONDER_URL);

    // 1. Sync Campaigns
    console.log("\n📊 Syncing campaigns...");
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

      if (campaignsResponse.data?.errors) {
        console.log(
          "⚠️ GraphQL errors:",
          JSON.stringify(campaignsResponse.data.errors, null, 2),
        );
      }
      let syncedCount = 0;
      for (const campaign of campaigns) {
        await client.query(
          `
          INSERT INTO blockchain_campaigns (
            id, name, creator_name, balance, target_amount, 
            creation_time, owner, last_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
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
        syncedCount++;
      }
      console.log(`✅ Synced ${syncedCount} campaigns`);
    } catch (error: any) {
      console.error("❌ Failed to sync campaigns:", error.message);
    }

    // 2. Sync Donations
    console.log("\n💰 Syncing donations...");
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

      let syncedCount = 0;
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
        syncedCount++;
      }
      console.log(`✅ Synced ${syncedCount} donations`);
    } catch (error: any) {
      console.error("❌ Failed to sync donations:", error.message);
    }

    // 3. Sync Badges
    console.log("\n🏆 Syncing badges...");
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

      let syncedCount = 0;
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
        syncedCount++;
      }
      console.log(`✅ Synced ${syncedCount} badges`);
    } catch (error: any) {
      console.error("❌ Failed to sync badges:", error.message);
    }

    // 4. Sync Withdrawals
    console.log("\n💸 Syncing withdrawals...");
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

      let syncedCount = 0;
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
        syncedCount++;
      }
      console.log(`✅ Synced ${syncedCount} withdrawals`);
    } catch (error: any) {
      console.error("❌ Failed to sync withdrawals:", error.message);
    }

    // 5. Show Summary
    console.log("\n" + "=".repeat(50));
    console.log("📊 SYNC SUMMARY");
    console.log("=".repeat(50));
    const stats = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM blockchain_campaigns) as campaigns,
        (SELECT COUNT(*) FROM blockchain_donations) as donations,
        (SELECT COUNT(*) FROM blockchain_badges) as badges,
        (SELECT COUNT(*) FROM blockchain_withdrawals) as withdrawals
    `);
    console.log(`   Campaigns:   ${stats.rows[0].campaigns}`);
    console.log(`   Donations:   ${stats.rows[0].donations}`);
    console.log(`   Badges:      ${stats.rows[0].badges}`);
    console.log(`   Withdrawals: ${stats.rows[0].withdrawals}`);
    console.log("=".repeat(50));
    console.log("\n✅ Initial sync completed successfully!");
    console.log("\n📝 Next steps:");
    console.log("   1. Verify data in Supabase Table Editor");
    console.log(
      "   2. Test API: curl http://localhost:3000/crowdfunding/campaigns",
    );
    console.log("   3. Ponder will auto-sync new events from now on\n");
  } catch (error: any) {
    console.error("\n❌ Sync failed:", error.message);
    if (error.response) {
      console.error("Response:", error.response.data);
    }
    throw error;
  } finally {
    client.release();
  }
}

// Run sync
console.log("=".repeat(50));
console.log("  INITIAL BLOCKCHAIN DATA SYNC");
console.log("=".repeat(50));

initialSync()
  .then(() => {
    console.log("\n✨ All done! Exiting...");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Fatal error:", error);
    process.exit(1);
  });
