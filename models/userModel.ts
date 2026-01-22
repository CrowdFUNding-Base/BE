import pool from "../config/database";

export interface IUser {
  id?: string;
  idrx_id?: string;
  email: string;
  hashed_password?: string;
  fullname: string;
  id_file?: string;
  api_key?: string;
  secret_key?: string;
  google_id?: string;
  is_google_auth?: boolean;
  is_wallet_only?: boolean;

  // Bank Account Info
  bank_id?: string;
  hash_bank_account_number?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  bank_code?: number;
  bank_name?: string;
  deposit_wallet_address?: string;

  created_at?: Date;
  updated_at?: Date;
}

export interface IWalletAddress {
  id?: string;
  user_id: string;
  wallet_address: string;
  role?: "none" | "sender" | "receiver";
  available_balance?: number;
  created_at?: Date;
}

export interface IRegisteredBankAccount {
  id?: string;
  user_id: string;
  bank_account_number: string;
  bank_account_name: string;
  bank_code: number;
  bank_name: string;
  hash_bank_account_number?: string;
  created_at?: Date;
}

export interface ILoginSessionToken {
  id?: string;
  user_id: string;
  token: string;
  email?: string;
  wallet_address?: string;
  role?: string;
  created_at?: Date;
  expires_at?: Date;
}

export class UserModel {
  static async create(userData: IUser): Promise<IUser> {
    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO users (idrx_id, email, hashed_password, fullname, id_file, api_key, secret_key, google_id, is_google_auth, is_wallet_only)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;
      const values = [
        userData.idrx_id || null,
        userData.email,
        userData.hashed_password || null,
        userData.fullname,
        userData.id_file || null,
        userData.api_key || null,
        userData.secret_key || null,
        userData.google_id || null,
        userData.is_google_auth || false,
        userData.is_wallet_only || false,
      ];

      const result = await client.query(query, values);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  static async findByEmail(email: string): Promise<IUser | null> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM users WHERE email = $1",
        [email]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  static async findById(id: string): Promise<IUser | null> {
    const client = await pool.connect();
    try {
      const result = await client.query("SELECT * FROM users WHERE id = $1", [
        id,
      ]);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  static async findByWalletAddress(
    walletAddress: string
  ): Promise<{ user: IUser; wallet: IWalletAddress } | null> {
    const client = await pool.connect();
    try {
      const query = `
        SELECT u.*, wa.id as wallet_id, wa.wallet_address, wa.role, wa.available_balance
        FROM users u
        JOIN wallet_addresses wa ON u.id = wa.user_id
        WHERE wa.wallet_address = $1
      `;
      const result = await client.query(query, [walletAddress]);
      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        user: {
          id: row.id,
          idrx_id: row.idrx_id,
          email: row.email,
          hashed_password: row.hashed_password,
          fullname: row.fullname,
          id_file: row.id_file,
          api_key: row.api_key,
          secret_key: row.secret_key,
          google_id: row.google_id,
          is_google_auth: row.is_google_auth,
          is_wallet_only: row.is_wallet_only,
          bank_id: row.bank_id,
          hash_bank_account_number: row.hash_bank_account_number,
          bank_account_number: row.bank_account_number,
          bank_account_name: row.bank_account_name,
          bank_code: row.bank_code,
          bank_name: row.bank_name,
          deposit_wallet_address: row.deposit_wallet_address,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
        wallet: {
          id: row.wallet_id,
          user_id: row.id,
          wallet_address: row.wallet_address,
          role: row.role,
          available_balance: row.available_balance,
        },
      };
    } finally {
      client.release();
    }
  }

  static async updateById(
    id: string,
    updateData: Partial<IUser>
  ): Promise<IUser | null> {
    const client = await pool.connect();
    try {
      const keys = Object.keys(updateData);
      const setClause = keys
        .map((key, index) => `${key} = $${index + 2}`)
        .join(", ");

      const query = `
        UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *
      `;

      const values = [id, ...Object.values(updateData)];
      const result = await client.query(query, values);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  static async delete(id: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      const result = await client.query("DELETE FROM users WHERE id = $1", [
        id,
      ]);
      return result.rowCount! > 0;
    } finally {
      client.release();
    }
  }

  // Wallet Address Methods
  static async addWalletAddress(
    walletData: IWalletAddress
  ): Promise<IWalletAddress> {
    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO wallet_addresses (user_id, wallet_address, role, available_balance)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      const values = [
        walletData.user_id,
        walletData.wallet_address,
        walletData.role || "none",
        walletData.available_balance || 0,
      ];

      const result = await client.query(query, values);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  static async getUserWallets(userId: string): Promise<IWalletAddress[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM wallet_addresses WHERE user_id = $1 ORDER BY created_at",
        [userId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  static async updateWalletRole(
    userId: string,
    walletAddress: string,
    role: string
  ): Promise<boolean> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "UPDATE wallet_addresses SET role = $1 WHERE user_id = $2 AND wallet_address = $3",
        [role, userId, walletAddress]
      );
      return result.rowCount! > 0;
    } finally {
      client.release();
    }
  }

  // Bank Account Methods
  static async addBankAccount(
    bankData: IRegisteredBankAccount
  ): Promise<IRegisteredBankAccount> {
    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO registered_bank_accounts (user_id, bank_account_number, bank_account_name, bank_code, bank_name, hash_bank_account_number)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const values = [
        bankData.user_id,
        bankData.bank_account_number,
        bankData.bank_account_name,
        bankData.bank_code,
        bankData.bank_name,
        bankData.hash_bank_account_number || null,
      ];

      const result = await client.query(query, values);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  static async getUserBankAccounts(
    userId: string
  ): Promise<IRegisteredBankAccount[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM registered_bank_accounts WHERE user_id = $1 ORDER BY created_at",
        [userId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }
}

export class LoginSessionTokenModel {
  static async create(
    tokenData: ILoginSessionToken
  ): Promise<ILoginSessionToken> {
    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO login_session_tokens (user_id, token, email, wallet_address, role)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const values = [
        tokenData.user_id,
        tokenData.token,
        tokenData.email || null,
        tokenData.wallet_address || null,
        tokenData.role || null,
      ];

      const result = await client.query(query, values);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  static async findByToken(token: string): Promise<ILoginSessionToken | null> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM login_session_tokens WHERE token = $1",
        [token]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  static async deleteByToken(token: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "DELETE FROM login_session_tokens WHERE token = $1",
        [token]
      );
      return result.rowCount! > 0;
    } finally {
      client.release();
    }
  }

  static async deleteByUserId(userId: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "DELETE FROM login_session_tokens WHERE user_id = $1",
        [userId]
      );
      return result.rowCount! > 0;
    } finally {
      client.release();
    }
  }

  static async deleteExpired(): Promise<boolean> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "DELETE FROM login_session_tokens WHERE expires_at < CURRENT_TIMESTAMP"
      );
      return result.rowCount! > 0;
    } finally {
      client.release();
    }
  }
}
