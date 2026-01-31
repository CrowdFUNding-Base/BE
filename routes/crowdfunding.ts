import express, { Router } from "express";
import {
  googleOAuthLogin,
  walletOnlyLogin,
  registerVaultToIDRX,
  addBankAccountToVault,
} from "../controllers/authController";
import {
  createQRIS,
  getQRISStatus,
} from "../controllers/contributionController";
import {
  createVault,
  updateVaultDetails,
  getVaultDetails,
  getAllVaults,
  getVaultStatistics,
  getVaultDonations,
  getUserDonations,
  getUserBadges,
  getAllCampaigns,
  getCampaignById,
  mockWithdrawFiat,
  getLeaderboard,
  getUserGamification,
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
import { getSyncStatus } from "../controllers/syncController";
import {
  authenticateUser,
  optionalAuthenticate,
  requireWallet,
} from "../middleware/auth";

const router: Router = express.Router();

// ================= AUTHENTICATION ROUTES =================

// 1. Google OAuth Login
router.post("/google-login", googleOAuthLogin);

// 2. Connect Wallet to Google Account (TODO: Implement later)
// router.post("/connect-wallet", connectWalletToGoogleAccount);

// 3. Wallet Only Login
router.post("/wallet-login", walletOnlyLogin);

// ================= VAULT/CROWDFUNDING ROUTES =================

// Get all active vaults - public access (from PostgreSQL cache)
router.get("/vaults", getAllVaults as any);

// Create Vault (creates campaign on-chain and saves to DB) - requires authentication
router.post("/vault/create", authenticateUser, createVault as any);

// Register Vault to IDRX Organization - requires authentication
router.post("/vault/register-idrx", authenticateUser, registerVaultToIDRX);

// Mock Withdraw to Bank (For Demo) - requires authentication
router.post("/vault/withdraw-mock", authenticateUser, mockWithdrawFiat as any);

// Add Bank Account to Vault - requires authentication
router.post("/vault/add-bank-account", authenticateUser, addBankAccountToVault);

// Get Vault Details (reads from PostgreSQL cache) - public access
router.get("/vault/:vaultId", getVaultDetails as any);

// Update Vault Details (updates blockchain + DB) - requires authentication
router.patch("/vault/:vaultId", authenticateUser, updateVaultDetails as any);

// Get Vault Statistics (from PostgreSQL cache) - public access
router.get("/vaults/statistics", getVaultStatistics as any);

// Get Vault Donations (from PostgreSQL cache) - public access
router.get("/vault/:vaultId/donations", getVaultDonations as any);

// ================= CONTRIBUTION ROUTES =================

// Create QRIS Payment - optional authentication for history
router.post("/contribution/qris", createQRIS as any);

// Check QRIS Payment Status and Mint IDRX - no auth required
router.post("/contribution/qris-status/:orderId", getQRISStatus as any);

// Get User Contribution History (from PostgreSQL cache) - requires authentication
router.get("/contributions/history", authenticateUser, getUserDonations as any);

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

// ================= BLOCKCHAIN DATA ROUTES (from PostgreSQL Cache) =================

// Get Sync Status - public access
router.get("/sync/status", getSyncStatus as any);

// Get All Campaigns from PostgreSQL Cache - public access
router.get("/campaigns", getAllCampaigns as any);

// Get Single Campaign from PostgreSQL Cache - public access
router.get("/campaigns/:id", getCampaignById as any);

// Get User Donations from PostgreSQL Cache - public access
router.get("/donations/user/:walletAddress", getUserDonations as any);

// Get User Badges from PostgreSQL Cache - public access
router.get("/badges/user/:walletAddress", getUserBadges as any);

// ================= GAMIFICATION ROUTES =================

// Get Leaderboard (ranked by charity points) - public access
router.get("/leaderboard", getLeaderboard as any);

// Get User Gamification Stats - public access
router.get("/gamification/:walletAddress", getUserGamification as any);

export default router;
