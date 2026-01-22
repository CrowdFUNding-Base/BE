import pool from "../config/database";

export interface IShareLink {
  id?: string;
  campaign_id: string;
  short_code: string;
  created_by?: string;
  clicks: number;
  created_at?: Date;
}

export class ShareLinkModel {
  static generateShortCode(length: number = 8): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static async create(data: Omit<IShareLink, "id" | "clicks" | "created_at">): Promise<IShareLink> {
    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO share_links (campaign_id, short_code, created_by)
        VALUES ($1, $2, $3)
        RETURNING *
      `;
      const values = [
        data.campaign_id,
        data.short_code,
        data.created_by || null,
      ];

      const result = await client.query(query, values);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  static async findByShortCode(shortCode: string): Promise<IShareLink | null> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM share_links WHERE short_code = $1",
        [shortCode]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  static async findByCampaignId(campaignId: string): Promise<IShareLink[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM share_links WHERE campaign_id = $1 ORDER BY created_at DESC",
        [campaignId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  static async incrementClicks(shortCode: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "UPDATE share_links SET clicks = clicks + 1 WHERE short_code = $1",
        [shortCode]
      );
      return result.rowCount! > 0;
    } finally {
      client.release();
    }
  }

  static async delete(id: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "DELETE FROM share_links WHERE id = $1",
        [id]
      );
      return result.rowCount! > 0;
    } finally {
      client.release();
    }
  }
}
