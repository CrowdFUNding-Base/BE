import { connectDB } from "./config/database";
import pool from "./config/database";
import fs from "fs";
import path from "path";

async function createSchema() {
  try {
    console.log("Creating database schema...");

    // Read the SQL schema file
    const schemaPath = path.join(__dirname, "sql", "schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf-8");

    // Connect to database
    const client = await pool.connect();

    try {
      // Execute the schema SQL
      await client.query(schemaSql);
      console.log("✅ Database schema created successfully!");
    } finally {
      client.release();
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating schema:", error);
    process.exit(1);
  }
}

// Run if this script is executed directly
if (require.main === module) {
  createSchema();
}
