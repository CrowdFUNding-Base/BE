import pool from "../config/database";

export interface IVault {
  id?: string;
  vault_id: string;
  crowdfunder_id: string;
  crowdfunder_email: string;
  crowdfunder_wallet_address?: string;

  // Vault Information
  title: string;
  description: string;
  target_amount: number;
  current_amount?: number;
  currency?: "IDR" | "USDC" | "USDT" | "IDRX";

  // IDRX Integration
  idrx_api_key?: string;
  idrx_secret_key?: string;
  deposit_wallet_address?: string;

  // Bank Account
  bank_account_number?: string;
  bank_account_name?: string;
  bank_code?: number;
  bank_name?: string;

  // Status & Timing
  status?: "active" | "completed" | "cancelled" | "expired";
  start_date?: Date;
  end_date: Date;

  created_at?: Date;
  updated_at?: Date;
}

export interface IContributor {
  id?: string;
  vault_id: string;
  contributor_id?: string;
  contributor_email?: string;
  contributor_wallet_address?: string;
  amount: number;
  currency: "IDR" | "USDC" | "USDT" | "IDRX";
  payment_method: "QRIS" | "CRYPTO" | "IDRX";
  transaction_hash?: string;
  qris_transaction_id?: string;
  status?: "pending" | "completed" | "failed";
  timestamp?: Date;
}

export class VaultModel {
  static async create(vaultData: IVault): Promise<IVault> {
    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO vaults (
          vault_id, crowdfunder_id, crowdfunder_email, crowdfunder_wallet_address,
          title, description, target_amount, currency, end_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;
      const values = [
        vaultData.vault_id,
        vaultData.crowdfunder_id,
        vaultData.crowdfunder_email,
        vaultData.crowdfunder_wallet_address || null,
        vaultData.title,
        vaultData.description,
        vaultData.target_amount,
        vaultData.currency || "IDR",
        vaultData.end_date,
      ];

      const result = await client.query(query, values);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  static async findByVaultId(vaultId: string): Promise<IVault | null> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM vaults WHERE vault_id = $1",
        [vaultId]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  static async findByCrowdfunderId(crowdfunderId: string): Promise<IVault[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM vaults WHERE crowdfunder_id = $1 ORDER BY created_at DESC",
        [crowdfunderId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  static async findActiveVaults(
    limit: number = 20,
    offset: number = 0
  ): Promise<IVault[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM vaults WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        ["active", limit, offset]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  static async updateByVaultId(
    vaultId: string,
    updateData: Partial<IVault>
  ): Promise<IVault | null> {
    const client = await pool.connect();
    try {
      const keys = Object.keys(updateData);
      const setClause = keys
        .map((key, index) => `${key} = $${index + 2}`)
        .join(", ");

      const query = `
        UPDATE vaults SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE vault_id = $1 RETURNING *
      `;

      const values = [vaultId, ...Object.values(updateData)];
      const result = await client.query(query, values);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  static async delete(vaultId: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "DELETE FROM vaults WHERE vault_id = $1",
        [vaultId]
      );
      return result.rowCount! > 0;
    } finally {
      client.release();
    }
  }

  static async incrementCurrentAmount(
    vaultId: string,
    amount: number
  ): Promise<boolean> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "UPDATE vaults SET current_amount = current_amount + $1, updated_at = CURRENT_TIMESTAMP WHERE vault_id = $2",
        [amount, vaultId]
      );
      return result.rowCount! > 0;
    } finally {
      client.release();
    }
  }

  // Contributor Methods
  static async addContributor(
    contributorData: IContributor
  ): Promise<IContributor> {
    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO contributors (
          vault_id, contributor_id, contributor_email, contributor_wallet_address,
          amount, currency, payment_method, transaction_hash, qris_transaction_id, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;
      const values = [
        contributorData.vault_id,
        contributorData.contributor_id || null,
        contributorData.contributor_email || null,
        contributorData.contributor_wallet_address || null,
        contributorData.amount,
        contributorData.currency,
        contributorData.payment_method,
        contributorData.transaction_hash || null,
        contributorData.qris_transaction_id || null,
        contributorData.status || "pending",
      ];

      const result = await client.query(query, values);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  static async getVaultContributors(vaultId: string): Promise<IContributor[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM contributors WHERE vault_id = $1 ORDER BY timestamp DESC",
        [vaultId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  static async updateContributorStatus(
    vaultId: string,
    identifier: { transactionHash?: string; qrisTransactionId?: string },
    status: string
  ): Promise<boolean> {
    const client = await pool.connect();
    try {
      let query: string;
      let values: any[];

      if (identifier.transactionHash) {
        query =
          "UPDATE contributors SET status = $1 WHERE vault_id = $2 AND transaction_hash = $3";
        values = [status, vaultId, identifier.transactionHash];
      } else if (identifier.qrisTransactionId) {
        query =
          "UPDATE contributors SET status = $1 WHERE vault_id = $2 AND qris_transaction_id = $3";
        values = [status, vaultId, identifier.qrisTransactionId];
      } else {
        return false;
      }

      const result = await client.query(query, values);
      return result.rowCount! > 0;
    } finally {
      client.release();
    }
  }

  static async getUserContributions(userId: string): Promise<IContributor[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM contributors WHERE contributor_id = $1 ORDER BY timestamp DESC",
        [userId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  static async getVaultStatistics(vaultId: string): Promise<{
    totalContributors: number;
    totalAmount: number;
    completedContributions: number;
    pendingContributions: number;
  }> {
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          COUNT(DISTINCT contributor_id) as total_contributors,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as total_amount,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_contributions,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_contributions
        FROM contributors 
        WHERE vault_id = $1
      `;
      const result = await client.query(query, [vaultId]);

      const row = result.rows[0];
      return {
        totalContributors: parseInt(row.total_contributors) || 0,
        totalAmount: parseFloat(row.total_amount) || 0,
        completedContributions: parseInt(row.completed_contributions) || 0,
        pendingContributions: parseInt(row.pending_contributions) || 0,
      };
    } finally {
      client.release();
    }
  }
}
