import { Pool } from "pg";

// PostgreSQL connection pool
// Note: Supabase Pooler doesn't support SSL, use direct connection for SSL
const pool = new Pool({
  connectionString: process.env.POSTGRESQL_URL,
  ssl: false, // Pooler mode doesn't support SSL
});

// Test connection
export const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log("✅ Connected to PostgreSQL (Supabase)");
    client.release();
    return true;
  } catch (error) {
    console.error("❌ PostgreSQL connection error:", error);
    return false;
  }
};

// Check if connection is alive
export const checkConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query("SELECT NOW()");
    client.release();
    return true;
  } catch (error) {
    console.error("Database connection check failed:", error);
    return false;
  }
};

export default pool;
