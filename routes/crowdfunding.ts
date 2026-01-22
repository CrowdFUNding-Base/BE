import express, { Router } from "express";
import {
  googleOAuthLogin,
  connectWalletToGoogleAccount,
  walletOnlyLogin,
  registerVaultToIDRX,
  addBankAccountToVault,
} from "../controllers/authController";
import {
  createQRIS,
  getQRISStatus,
  updateContributionStatus,
  checkTransactionStatus,
} from "../controllers/contributionController";
import {
  createVault,
  updateVaultDetails,
  getVaultDetails,
} from "../controllers/vaultController";
import {
  createAchievement,
  getAchievements,
  getAchievementById,
  updateAchievement,
  mintAchievementAsNFT,
  getAchievementsByCampaign,
} from "../controllers/achievementController";
import {
  generateShareLink,
  generateQRCode,
  redirectToCampaign,
  getFarcasterFrameMetadata,
  generateShareImage,
  getShareLinkStats,
} from "../controllers/shareController";
import {
  getCampaignsFromPonder,
  getCampaignByIdFromPonder,
  getDonationsFromPonder,
  getUserDonationsFromPonder,
  getBadgesFromPonder,
  getUserBadgesFromPonder,
  getPonderHealth,
  getAllActiveVaultsFromPonder,
  getVaultStatisticsFromPonder,
} from "../controllers/ponderController";
import {
  authenticateUser,
  optionalAuthenticate,
  requireWallet,
} from "../middleware/auth";

const router: Router = express.Router();

// ================= AUTHENTICATION ROUTES =================

// 1. Google OAuth Login
router.post("/google-login", googleOAuthLogin);

// 2. Connect Wallet to Google Account
router.post("/connect-wallet", connectWalletToGoogleAccount as any);

// 3. Wallet Only Login
router.post("/wallet-login", walletOnlyLogin);

// ================= VAULT/CROWDFUNDING ROUTES =================

// Get all active vaults - public access
router.get("/vaults", getAllActiveVaultsFromPonder);

// Create Vault (creates campaign on-chain and saves to DB) - requires authentication
router.post("/vault/create", authenticateUser, createVault as any);

// Register Vault to IDRX Organization - requires authentication
router.post("/vault/register-idrx", authenticateUser, registerVaultToIDRX);

// Add Bank Account to Vault - requires authentication
router.post("/vault/add-bank-account", authenticateUser, addBankAccountToVault);

// Get Vault Details (reads from blockchain + DB) - public access
router.get("/vault/:vaultId", getVaultDetails as any);

// Update Vault Details (updates blockchain + DB) - requires authentication
router.patch("/vault/:vaultId", authenticateUser, updateVaultDetails as any);

// Get Vault Statistics - requires authentication
router.get(
  "/vault/:vaultId/statistics",
  authenticateUser,
  getVaultStatisticsFromPonder,
);

// ================= CONTRIBUTION ROUTES =================

// Create QRIS Payment - optional authentication for history
router.post("/contribution/qris", createQRIS as any);

// Check QRIS Payment Status and Mint IDRX - no auth required
router.post("/contribution/qris-status/:orderId", getQRISStatus as any);

// Update Contribution Status (webhook handler) - no auth required
router.post("/contribution/update-status", updateContributionStatus as any);

// Check Transaction Status - no auth required
router.get("/transaction/status", checkTransactionStatus as any);

// Get User Contribution History - requires authentication
router.get(
  "/contributions/history",
  authenticateUser,
  getUserDonationsFromPonder,
);

// ================= ACHIEVEMENT ROUTES =================

// Create Achievement - requires authentication
router.post("/achievements", authenticateUser, createAchievement);

// Get User Achievements - requires authentication
router.get("/achievements", authenticateUser, getAchievements);

// Get Achievement by ID - requires authentication
router.get("/achievements/:id", authenticateUser, getAchievementById);

// Update Achievement - requires authentication
router.patch("/achievements/:id", authenticateUser, updateAchievement);

// Mint Achievement as NFT - requires authentication
router.post("/achievements/:id/mint", authenticateUser, mintAchievementAsNFT);

// Get Achievements by Campaign - public access
router.get("/achievements/campaign/:campaignId", getAchievementsByCampaign);

// ================= SHARE LINK ROUTES =================

// Generate Share Link - requires authentication
router.post("/share/generate", authenticateUser, generateShareLink);

// Get QR Code for Share Link - public access
router.get("/share/:shortCode/qr", generateQRCode);

// Get Share Link Stats - public access
router.get("/share/:shortCode/stats", getShareLinkStats);

// Get Farcaster Frame Metadata - public access
router.get("/share/:shortCode/frame", getFarcasterFrameMetadata);

// Get Share Image for Social Preview - public access
router.get("/share/:shortCode/image", generateShareImage);

// Redirect to Campaign from Share Link - public access (must be last to avoid conflicts)
router.get("/share/:shortCode", redirectToCampaign);

// ================= PONDER BLOCKCHAIN DATA ROUTES =================

// Get Ponder Health Status - public access
router.get("/ponder/health", getPonderHealth);

// Get Campaigns from Blockchain - public access
router.get("/ponder/campaigns", getCampaignsFromPonder);

// Get Single Campaign from Blockchain - public access
router.get("/ponder/campaigns/:id", getCampaignByIdFromPonder);

// Get Donations from Blockchain - public access
router.get("/ponder/donations", getDonationsFromPonder);

// Get User Donations from Blockchain - public access
router.get("/ponder/donations/user/:walletAddress", getUserDonationsFromPonder);

// Get Badges from Blockchain - public access
router.get("/ponder/badges", getBadgesFromPonder);

// Get User Badges from Blockchain - public access
router.get("/ponder/badges/user/:walletAddress", getUserBadgesFromPonder);

export default router;
