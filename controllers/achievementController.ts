import { Request, Response } from "express";
import { ethers } from "ethers";
import { AchievementModel } from "../models/achievementModel";
import { getBadgeContract } from "../config/contracts";

/**
 * Create a new achievement
 * POST /achievements
 */
export const createAchievement = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { campaign_id, title, description, badge_type, metadata } = req.body;
    const userId = (req as any).user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    if (!title || !badge_type) {
      res.status(400).json({
        success: false,
        message: "Title and badge_type are required",
      });
      return;
    }

    const validBadgeTypes = [
      "first_donation",
      "milestone",
      "top_donor",
      "campaign_creator",
      "early_supporter",
      "recurring_donor",
    ];

    if (!validBadgeTypes.includes(badge_type)) {
      res.status(400).json({
        success: false,
        message: `Invalid badge_type. Must be one of: ${validBadgeTypes.join(", ")}`,
      });
      return;
    }

    const achievement = await AchievementModel.create({
      user_id: userId,
      campaign_id,
      title,
      description,
      badge_type,
      is_minted: false,
      metadata,
    });

    res.status(201).json({
      success: true,
      data: achievement,
    });
  } catch (error) {
    console.error("Create achievement error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get all achievements for authenticated user
 * GET /achievements
 */
export const getAchievements = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    const achievements = await AchievementModel.findByUserId(userId);

    res.status(200).json({
      success: true,
      data: achievements,
      count: achievements.length,
    });
  } catch (error) {
    console.error("Get achievements error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get single achievement by ID
 * GET /achievements/:id
 */
export const getAchievementById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?._id;

    const achievement = await AchievementModel.findById(id);

    if (!achievement) {
      res.status(404).json({
        success: false,
        message: "Achievement not found",
      });
      return;
    }

    // Check ownership
    if (achievement.user_id !== userId) {
      res.status(403).json({
        success: false,
        message: "Not authorized to view this achievement",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: achievement,
    });
  } catch (error) {
    console.error("Get achievement by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Update an achievement
 * PATCH /achievements/:id
 */
export const updateAchievement = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { title, description, metadata } = req.body;
    const userId = (req as any).user?._id;

    const achievement = await AchievementModel.findById(id);

    if (!achievement) {
      res.status(404).json({
        success: false,
        message: "Achievement not found",
      });
      return;
    }

    // Check ownership
    if (achievement.user_id !== userId) {
      res.status(403).json({
        success: false,
        message: "Not authorized to update this achievement",
      });
      return;
    }

    const updatedAchievement = await AchievementModel.update(id, {
      title,
      description,
      metadata,
    });

    res.status(200).json({
      success: true,
      data: updatedAchievement,
    });
  } catch (error) {
    console.error("Update achievement error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Mint achievement as NFT using Badge.sol
 * POST /achievements/:id/mint
 */
export const mintAchievementAsNFT = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { wallet_address } = req.body;
    const userId = (req as any).user?._id;

    if (!wallet_address) {
      res.status(400).json({
        success: false,
        message: "wallet_address is required for minting",
      });
      return;
    }

    const achievement = await AchievementModel.findById(id);

    if (!achievement) {
      res.status(404).json({
        success: false,
        message: "Achievement not found",
      });
      return;
    }

    // Check ownership
    if (achievement.user_id !== userId) {
      res.status(403).json({
        success: false,
        message: "Not authorized to mint this achievement",
      });
      return;
    }

    // Check if already minted
    if (achievement.is_minted) {
      res.status(400).json({
        success: false,
        message: "Achievement already minted as NFT",
        data: {
          token_id: achievement.token_id,
          transaction_hash: achievement.mint_transaction_hash,
        },
      });
      return;
    }

    // Setup blockchain connection
    const badgeContract = getBadgeContract();
    const wallet = badgeContract.signer as ethers.Wallet;
    const badgeAddress = badgeContract.address;

    // Mint the badge
    console.log(`Minting badge for achievement ${id} to ${wallet_address}...`);
    const tx = await badgeContract.mintBadge(
      wallet_address,
      achievement.title,
      achievement.description || "",
    );

    const receipt = await tx.wait();
    console.log(`Badge minted! TX: ${receipt.transactionHash}`);

    // Parse the BadgeMinted event to get token ID
    const mintEvent = receipt.events?.find(
      (e: any) => e.event === "BadgeMinted",
    );
    const tokenId = mintEvent?.args?.tokenId?.toNumber() || 0;

    // Update achievement as minted
    const updatedAchievement = await AchievementModel.markAsMinted(
      id,
      tokenId,
      receipt.transactionHash,
    );

    res.status(200).json({
      success: true,
      message: "Achievement minted as NFT successfully",
      data: {
        achievement: updatedAchievement,
        transaction_hash: receipt.transactionHash,
        token_id: tokenId,
        badge_address: badgeAddress,
      },
    });
  } catch (error: any) {
    console.error("Mint achievement error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to mint achievement as NFT",
    });
  }
};

/**
 * Get achievements by campaign
 * GET /achievements/campaign/:campaignId
 */
export const getAchievementsByCampaign = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const campaignId = req.params.campaignId as string;

    const achievements = await AchievementModel.findByCampaignId(campaignId);

    res.status(200).json({
      success: true,
      data: achievements,
      count: achievements.length,
    });
  } catch (error) {
    console.error("Get achievements by campaign error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
