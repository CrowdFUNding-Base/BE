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

export default router;
