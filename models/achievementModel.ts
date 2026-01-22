import pool from "../config/database";

export interface IAchievement {
  id?: string;
  user_id: string;
  campaign_id?: string;
  title: string;
  description?: string;
  badge_type: string; // 'first_donation', 'milestone', 'top_donor', 'campaign_creator'
  is_minted: boolean;
  token_id?: number;
  mint_transaction_hash?: string;
  minted_at?: Date;
  earned_at?: Date;
  metadata?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

export class AchievementModel {
  static async create(data: IAchievement): Promise<IAchievement> {
    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO achievements (
          user_id, campaign_id, title, description, badge_type, 
          is_minted, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      const values = [
        data.user_id,
        data.campaign_id || null,
        data.title,
        data.description || null,
        data.badge_type,
        data.is_minted || false,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ];

      const result = await client.query(query, values);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  static async findById(id: string): Promise<IAchievement | null> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM achievements WHERE id = $1",
        [id]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  static async findByUserId(userId: string): Promise<IAchievement[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM achievements WHERE user_id = $1 ORDER BY earned_at DESC",
        [userId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  static async findByCampaignId(campaignId: string): Promise<IAchievement[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM achievements WHERE campaign_id = $1 ORDER BY earned_at DESC",
        [campaignId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  static async update(
    id: string,
    updateData: Partial<IAchievement>
  ): Promise<IAchievement | null> {
    const client = await pool.connect();
    try {
      const allowedFields = ["title", "description", "metadata"];
      const updates: string[] = [];
      const values: any[] = [id];
      let paramIndex = 2;

      for (const [key, value] of Object.entries(updateData)) {
        if (allowedFields.includes(key) && value !== undefined) {
          updates.push(`${key} = $${paramIndex}`);
          values.push(key === "metadata" ? JSON.stringify(value) : value);
          paramIndex++;
        }
      }

      if (updates.length === 0) {
        return this.findById(id);
      }

      const query = `
        UPDATE achievements 
        SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 
        RETURNING *
      `;

      const result = await client.query(query, values);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  static async markAsMinted(
    id: string,
    tokenId: number,
    transactionHash: string
  ): Promise<IAchievement | null> {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE achievements 
        SET is_minted = true, 
            token_id = $2, 
            mint_transaction_hash = $3, 
            minted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 
        RETURNING *
      `;

      const result = await client.query(query, [id, tokenId, transactionHash]);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  static async delete(id: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "DELETE FROM achievements WHERE id = $1",
        [id]
      );
      return result.rowCount! > 0;
    } finally {
      client.release();
    }
  }

  static async getUserMintedAchievements(userId: string): Promise<IAchievement[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM achievements WHERE user_id = $1 AND is_minted = true ORDER BY minted_at DESC",
        [userId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }
}
