import { Router } from "express";
import {
  syncCampaign,
  syncCampaignBalance,
  syncDonation,
  syncWithdrawal,
  syncBadge,
  syncBatch,
  getSyncStatus,
  validatePonderApiKey,
  forceSyncFromPonder,
  clearBlockchainData,
} from "../controllers/syncController";

const router = Router();

// ==========================================
// SYNC ROUTES (Webhook dari Ponder)
// ==========================================

// Health check untuk sync
router.get("/status", getSyncStatus);

// Individual sync endpoints (dengan API key validation)
router.post("/campaign", validatePonderApiKey, syncCampaign);
router.post("/campaign-balance", validatePonderApiKey, syncCampaignBalance);
router.post("/donation", validatePonderApiKey, syncDonation);
router.post("/withdrawal", validatePonderApiKey, syncWithdrawal);
router.post("/badge", validatePonderApiKey, syncBadge);

// Batch sync endpoint
router.post("/batch", validatePonderApiKey, syncBatch);

// Force sync from Ponder (pull model) - no auth needed for admin
router.post("/force", forceSyncFromPonder);

// Clear all blockchain data (for re-sync)
router.post("/clear", clearBlockchainData);

export default router;
