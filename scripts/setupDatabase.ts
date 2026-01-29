import "dotenv/config"; // Load environment variables first
import pool from "../config/database";
import fs from "fs";
import path from "path";

async function setupDatabase() {
  const client = await pool.connect();

  try {
    console.log("🔄 Starting database setup...");
    console.log(
      "📍 Database URL:",
      process.env.POSTGRESQL_URL?.substring(0, 30) + "...",
    );

    // Read schema.sql file
    const schemaPath = path.join(__dirname, "../sql/schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf-8");

    console.log("📄 Executing schema.sql...");
    await client.query(schemaSql);
    console.log("✅ Schema created successfully!");

    // Read achievements.sql if exists
    const achievementsPath = path.join(__dirname, "../sql/achievements.sql");
    if (fs.existsSync(achievementsPath)) {
      console.log("📄 Executing achievements.sql...");
      const achievementsSql = fs.readFileSync(achievementsPath, "utf-8");
      await client.query(achievementsSql);
      console.log("✅ Achievements tables created successfully!");
    }

    // Read blockchain_cache.sql if exists
    const blockchainCachePath = path.join(
      __dirname,
      "../sql/blockchain_cache.sql",
    );
    if (fs.existsSync(blockchainCachePath)) {
      console.log("📄 Executing blockchain_cache.sql...");
      const blockchainCacheSql = fs.readFileSync(blockchainCachePath, "utf-8");
      await client.query(blockchainCacheSql);
      console.log("✅ Blockchain cache tables created successfully!");
    }

    console.log("\n🎉 Database setup completed successfully!");
    console.log("\n📊 Created tables:");
    console.log("  ✓ users");
    console.log("  ✓ wallet_addresses");
    console.log("  ✓ registered_bank_accounts");
    console.log("  ✓ vaults");
    console.log("  ✓ contributors");
    console.log("  ✓ login_session_tokens");
    console.log("\n✅ Ready for Google OAuth and Wallet login!");
  } catch (error) {
    console.error("❌ Error setting up database:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the setup
setupDatabase()
  .then(() => {
    console.log("\n✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
