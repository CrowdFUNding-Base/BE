import { Request, Response } from "express";

// Ponder GraphQL endpoint
const PONDER_URL = process.env.PONDER_URL || "http://localhost:42069";

/**
 * Query Ponder GraphQL API
 */
async function queryPonder(query: string, variables?: Record<string, any>) {
  try {
    const response = await fetch(`${PONDER_URL}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Ponder API error: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error("Ponder query error:", error);
    throw error;
  }
}

/**
 * Get all campaigns from Ponder
 * GET /ponder/campaigns
 */
export const getCampaignsFromPonder = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    const query = `
      query GetCampaigns($limit: Int, $offset: Int) {
        campaigns(first: $limit, skip: $offset, orderBy: "creationTime", orderDirection: "desc") {
          items {
            id
            name
            creatorName
            owner
            balance
            targetAmount
            creationTime
          }
        }
      }
    `;

    const data = await queryPonder(query, {
      limit: Number(limit),
      offset: Number(offset),
    });

    res.status(200).json({
      success: true,
      data: data.campaigns?.items || [],
    });
  } catch (error) {
    console.error("Get campaigns from Ponder error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch campaigns from blockchain",
    });
  }
};

/**
 * Get single campaign from Ponder
 * GET /ponder/campaigns/:id
 */
export const getCampaignByIdFromPonder = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;

    const query = `
      query GetCampaign($id: Int!) {
        campaign(id: $id) {
          id
          name
          creatorName
          owner
          balance
          targetAmount
          creationTime
        }
      }
    `;

    const data = await queryPonder(query, { id: Number(id) });

    if (!data.campaign) {
      res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: data.campaign,
    });
  } catch (error) {
    console.error("Get campaign by ID from Ponder error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch campaign from blockchain",
    });
  }
};

/**
 * Get donation history from Ponder
 * GET /ponder/donations
 */
export const getDonationsFromPonder = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { campaignId, donor, limit = 50, offset = 0 } = req.query;

    let whereClause = "";
    const variables: Record<string, any> = {
      limit: Number(limit),
      offset: Number(offset),
    };

    if (campaignId) {
      whereClause = "campaignId: $campaignId";
      variables.campaignId = Number(campaignId);
    } else if (donor) {
      whereClause = "donor: $donor";
      variables.donor = donor;
    }

    const query = `
      query GetDonations($limit: Int, $offset: Int${campaignId ? ", $campaignId: Int" : ""}${donor ? ", $donor: String" : ""}) {
        donations(
          first: $limit, 
          skip: $offset, 
          orderBy: "timestamp", 
          orderDirection: "desc"
          ${whereClause ? `, where: { ${whereClause} }` : ""}
        ) {
          items {
            id
            campaignId
            donor
            amount
            blockNumber
            timestamp
            transactionHash
          }
        }
      }
    `;

    const data = await queryPonder(query, variables);

    res.status(200).json({
      success: true,
      data: data.donations?.items || [],
    });
  } catch (error) {
    console.error("Get donations from Ponder error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch donations from blockchain",
    });
  }
};

/**
 * Get user's donation history by wallet address
 * GET /ponder/donations/user/:walletAddress
 */
export const getUserDonationsFromPonder = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { walletAddress } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const query = `
      query GetUserDonations($donor: String!, $limit: Int, $offset: Int) {
        donations(
          first: $limit,
          skip: $offset,
          orderBy: "timestamp",
          orderDirection: "desc",
          where: { donor: $donor }
        ) {
          items {
            id
            campaignId
            donor
            amount
            blockNumber
            timestamp
            transactionHash
          }
        }
      }
    `;

    const data = await queryPonder(query, {
      donor: walletAddress.toLowerCase(),
      limit: Number(limit),
      offset: Number(offset),
    });

    res.status(200).json({
      success: true,
      data: data.donations?.items || [],
    });
  } catch (error) {
    console.error("Get user donations from Ponder error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user donations from blockchain",
    });
  }
};

/**
 * Get minted badges from Ponder
 * GET /ponder/badges
 */
export const getBadgesFromPonder = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { owner, limit = 50, offset = 0 } = req.query;

    const variables: Record<string, any> = {
      limit: Number(limit),
      offset: Number(offset),
    };

    let whereClause = "";
    if (owner) {
      whereClause = ", where: { owner: $owner }";
      variables.owner = (owner as string).toLowerCase();
    }

    const query = `
      query GetBadges($limit: Int, $offset: Int${owner ? ", $owner: String" : ""}) {
        badges(
          first: $limit,
          skip: $offset,
          orderBy: "timestamp",
          orderDirection: "desc"
          ${whereClause}
        ) {
          items {
            tokenId
            owner
            name
            blockNumber
            timestamp
            transactionHash
          }
        }
      }
    `;

    const data = await queryPonder(query, variables);

    res.status(200).json({
      success: true,
      data: data.badges?.items || [],
    });
  } catch (error) {
    console.error("Get badges from Ponder error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch badges from blockchain",
    });
  }
};

/**
 * Get user's badges by wallet address
 * GET /ponder/badges/user/:walletAddress
 */
export const getUserBadgesFromPonder = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { walletAddress } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const query = `
      query GetUserBadges($owner: String!, $limit: Int, $offset: Int) {
        badges(
          first: $limit,
          skip: $offset,
          orderBy: "timestamp",
          orderDirection: "desc",
          where: { owner: $owner }
        ) {
          items {
            tokenId
            owner
            name
            blockNumber
            timestamp
            transactionHash
          }
        }
      }
    `;

    const data = await queryPonder(query, {
      owner: walletAddress.toLowerCase(),
      limit: Number(limit),
      offset: Number(offset),
    });

    res.status(200).json({
      success: true,
      data: data.badges?.items || [],
    });
  } catch (error) {
    console.error("Get user badges from Ponder error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user badges from blockchain",
    });
  }
};

/**
 * Get Ponder indexer health status
 * GET /ponder/health
 */
export const getPonderHealth = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const response = await fetch(`${PONDER_URL}/health`);

    if (!response.ok) {
      res.status(503).json({
        success: false,
        message: "Ponder indexer is not available",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Ponder indexer is healthy",
      ponder_url: PONDER_URL,
    });
  } catch (error) {
    console.error("Ponder health check error:", error);
    res.status(503).json({
      success: false,
      message: "Failed to connect to Ponder indexer",
    });
  }
};

/**
 * Get all active vaults (combines blockchain data from Ponder + DB data)
 * GET /ponder/vaults
 */
export const getAllActiveVaultsFromPonder = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { limit = 20, offset = 0, status = "active" } = req.query;

    // Query Ponder for blockchain data
    const query = `
      query GetCampaigns($limit: Int, $offset: Int) {
        campaigns(first: $limit, skip: $offset, orderBy: "creationTime", orderDirection: "desc") {
          items {
            id
            name
            creatorName
            owner
            balance
            targetAmount
            creationTime
          }
        }
      }
    `;

    const blockchainData = await queryPonder(query, {
      limit: Number(limit),
      offset: Number(offset),
    });

    const campaigns = blockchainData.campaigns?.items || [];

    // Enrich with database data if needed
    const pool = require("../config/database").default;
    const client = await pool.connect();

    try {
      const vaultsQuery = `
        SELECT 
          vault_id, 
          campaign_id, 
          title, 
          description, 
          target_amount,
          current_amount,
          currency,
          status,
          end_date,
          created_at
        FROM vaults
        WHERE status = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const vaultsResult = await client.query(vaultsQuery, [
        status,
        Number(limit),
        Number(offset),
      ]);

      // Merge blockchain and database data
      const enrichedVaults = vaultsResult.rows.map((vault: any) => {
        const blockchainCampaign = campaigns.find(
          (c: any) => c.id === vault.campaign_id.toString(),
        );

        return {
          ...vault,
          blockchain: blockchainCampaign || null,
        };
      });

      res.status(200).json({
        success: true,
        data: {
          vaults: enrichedVaults,
          total: vaultsResult.rows.length,
          blockchainCampaigns: campaigns.length,
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Get all active vaults error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch active vaults",
    });
  }
};

/**
 * Get vault statistics (from Ponder blockchain data)
 * GET /ponder/statistics
 */
export const getVaultStatisticsFromPonder = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // Query for all campaigns statistics
    const campaignsQuery = `
      query GetAllCampaigns {
        campaigns {
          items {
            id
            balance
            targetAmount
          }
        }
      }
    `;

    // Query for all donations
    const donationsQuery = `
      query GetAllDonations {
        donations {
          items {
            id
            amount
          }
        }
      }
    `;

    const [campaignsData, donationsData] = await Promise.all([
      queryPonder(campaignsQuery),
      queryPonder(donationsQuery),
    ]);

    const campaigns = campaignsData.campaigns?.items || [];
    const donations = donationsData.donations?.items || [];

    // Calculate statistics
    const totalCampaigns = campaigns.length;
    const totalDonations = donations.length;
    const totalAmountRaised = campaigns.reduce(
      (sum: number, c: any) => sum + Number(c.balance),
      0,
    );
    const totalTargetAmount = campaigns.reduce(
      (sum: number, c: any) => sum + Number(c.targetAmount),
      0,
    );
    const averageProgress =
      totalCampaigns > 0
        ? ((totalAmountRaised / totalTargetAmount) * 100).toFixed(2)
        : 0;

    // Get DB statistics
    const pool = require("../config/database").default;
    const client = await pool.connect();

    try {
      const dbStatsQuery = `
        SELECT 
          COUNT(*) as total_vaults,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_vaults,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_vaults,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_vaults,
          SUM(current_amount) as total_raised_db,
          SUM(target_amount) as total_target_db
        FROM vaults
      `;

      const dbStatsResult = await client.query(dbStatsQuery);
      const dbStats = dbStatsResult.rows[0];

      res.status(200).json({
        success: true,
        data: {
          blockchain: {
            totalCampaigns,
            totalDonations,
            totalAmountRaised,
            totalTargetAmount,
            averageProgress: `${averageProgress}%`,
          },
          database: {
            totalVaults: parseInt(dbStats.total_vaults),
            activeVaults: parseInt(dbStats.active_vaults),
            completedVaults: parseInt(dbStats.completed_vaults),
            cancelledVaults: parseInt(dbStats.cancelled_vaults),
            totalRaised: parseFloat(dbStats.total_raised_db || 0),
            totalTarget: parseFloat(dbStats.total_target_db || 0),
          },
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Get vault statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch vault statistics",
    });
  }
};
