import { Request, Response } from "express";
import QRCode from "qrcode";
import { ShareLinkModel } from "../models/shareModel";
import { VaultModel } from "../models/vaultModel";

/**
 * Generate a shareable link for a campaign
 * POST /share/generate
 */
export const generateShareLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaign_id } = req.body;
    const userId = (req as any).user?._id;

    if (!campaign_id) {
      res.status(400).json({
        success: false,
        message: "campaign_id is required",
      });
      return;
    }

    // Verify campaign exists
    const vault = await VaultModel.findByVaultId(campaign_id);
    if (!vault) {
      res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
      return;
    }

    // Generate unique short code
    let shortCode = ShareLinkModel.generateShortCode(8);
    let attempts = 0;
    const maxAttempts = 5;

    // Ensure uniqueness
    while (attempts < maxAttempts) {
      const existing = await ShareLinkModel.findByShortCode(shortCode);
      if (!existing) break;
      shortCode = ShareLinkModel.generateShortCode(8);
      attempts++;
    }

    if (attempts >= maxAttempts) {
      res.status(500).json({
        success: false,
        message: "Failed to generate unique short code",
      });
      return;
    }

    // Create share link
    const shareLink = await ShareLinkModel.create({
      campaign_id,
      short_code: shortCode,
      created_by: userId,
    });

    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const fullUrl = `${baseUrl}/s/${shortCode}`;

    res.status(201).json({
      success: true,
      data: {
        ...shareLink,
        full_url: fullUrl,
        qr_url: `${process.env.BACKEND_URL || "http://localhost:3300"}/crowdfunding/share/${shortCode}/qr`,
      },
    });
  } catch (error) {
    console.error("Generate share link error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Generate QR code for a share link
 * GET /share/:shortCode/qr
 */
export const generateQRCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shortCode } = req.params;
    const { format = "png" } = req.query;

    const shareLink = await ShareLinkModel.findByShortCode(shortCode);

    if (!shareLink) {
      res.status(404).json({
        success: false,
        message: "Share link not found",
      });
      return;
    }

    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const fullUrl = `${baseUrl}/s/${shortCode}`;

    if (format === "base64") {
      // Return base64 encoded QR code
      const qrDataUrl = await QRCode.toDataURL(fullUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });

      res.status(200).json({
        success: true,
        data: {
          qr_code: qrDataUrl,
          url: fullUrl,
        },
      });
      return;
    }

    // Return PNG image
    res.setHeader("Content-Type", "image/png");
    const qrBuffer = await QRCode.toBuffer(fullUrl, {
      width: 256,
      margin: 2,
    });

    res.send(qrBuffer);
  } catch (error) {
    console.error("Generate QR code error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Redirect to campaign page from share link
 * GET /share/:shortCode
 */
export const redirectToCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shortCode } = req.params;

    const shareLink = await ShareLinkModel.findByShortCode(shortCode);

    if (!shareLink) {
      res.status(404).json({
        success: false,
        message: "Share link not found",
      });
      return;
    }

    // Increment click count
    await ShareLinkModel.incrementClicks(shortCode);

    // Redirect to campaign page
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const campaignUrl = `${frontendUrl}/campaign/${shareLink.campaign_id}`;

    res.redirect(302, campaignUrl);
  } catch (error) {
    console.error("Redirect to campaign error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get Farcaster Frame metadata for a share link
 * GET /share/:shortCode/frame
 */
export const getFarcasterFrameMetadata = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shortCode } = req.params;

    const shareLink = await ShareLinkModel.findByShortCode(shortCode);

    if (!shareLink) {
      res.status(404).json({
        success: false,
        message: "Share link not found",
      });
      return;
    }

    // Get campaign details
    const vault = await VaultModel.findByVaultId(shareLink.campaign_id);

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const backendUrl = process.env.BACKEND_URL || "http://localhost:3300";
    const campaignUrl = `${frontendUrl}/campaign/${shareLink.campaign_id}`;
    const imageUrl = `${backendUrl}/crowdfunding/share/${shortCode}/image`;

    // Return Farcaster Frame metadata
    const frameHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta property="og:title" content="${vault?.title || "CrowdFUNding Campaign"}" />
  <meta property="og:description" content="${vault?.description || "Support this crowdfunding campaign!"}" />
  <meta property="og:image" content="${imageUrl}" />
  
  <!-- Farcaster Frame metadata -->
  <meta property="fc:frame" content="vNext" />
  <meta property="fc:frame:image" content="${imageUrl}" />
  <meta property="fc:frame:image:aspect_ratio" content="1.91:1" />
  <meta property="fc:frame:button:1" content="🎁 Donate Now" />
  <meta property="fc:frame:button:1:action" content="link" />
  <meta property="fc:frame:button:1:target" content="${campaignUrl}" />
  <meta property="fc:frame:button:2" content="📊 View Campaign" />
  <meta property="fc:frame:button:2:action" content="link" />
  <meta property="fc:frame:button:2:target" content="${campaignUrl}" />
</head>
<body>
  <script>window.location.href = "${campaignUrl}";</script>
</body>
</html>
    `.trim();

    res.setHeader("Content-Type", "text/html");
    res.send(frameHtml);
  } catch (error) {
    console.error("Get Farcaster frame metadata error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Generate share image for social preview
 * GET /share/:shortCode/image
 */
export const generateShareImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shortCode } = req.params;

    const shareLink = await ShareLinkModel.findByShortCode(shortCode);

    if (!shareLink) {
      res.status(404).json({
        success: false,
        message: "Share link not found",
      });
      return;
    }

    // Get campaign details
    const vault = await VaultModel.findByVaultId(shareLink.campaign_id);

    if (!vault) {
      res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
      return;
    }

    // For now, return a simple SVG image
    // In production, you could use canvas or a service like og-image
    const progress = vault.current_amount
      ? Math.min((Number(vault.current_amount) / Number(vault.target_amount)) * 100, 100)
      : 0;

    const svg = `
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="50" y="50" width="1100" height="530" rx="20" fill="white" opacity="0.95"/>
  
  <text x="100" y="150" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#1f2937">
    ${escapeXml(vault.title || "CrowdFUNding Campaign")}
  </text>
  
  <text x="100" y="220" font-family="Arial, sans-serif" font-size="24" fill="#6b7280">
    ${escapeXml((vault.description || "").slice(0, 100))}${(vault.description || "").length > 100 ? "..." : ""}
  </text>
  
  <rect x="100" y="300" width="1000" height="30" rx="15" fill="#e5e7eb"/>
  <rect x="100" y="300" width="${progress * 10}" height="30" rx="15" fill="#10b981"/>
  
  <text x="100" y="380" font-family="Arial, sans-serif" font-size="32" fill="#1f2937">
    ${progress.toFixed(1)}% funded
  </text>
  
  <text x="100" y="440" font-family="Arial, sans-serif" font-size="24" fill="#6b7280">
    ${formatCurrency(vault.current_amount || 0)} / ${formatCurrency(vault.target_amount)} ${vault.currency || "IDR"}
  </text>
  
  <text x="100" y="530" font-family="Arial, sans-serif" font-size="20" fill="#9ca3af">
    Powered by CrowdFUNding
  </text>
</svg>
    `.trim();

    res.setHeader("Content-Type", "image/svg+xml");
    res.send(svg);
  } catch (error) {
    console.error("Generate share image error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get share link statistics
 * GET /share/:shortCode/stats
 */
export const getShareLinkStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shortCode } = req.params;

    const shareLink = await ShareLinkModel.findByShortCode(shortCode);

    if (!shareLink) {
      res.status(404).json({
        success: false,
        message: "Share link not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        short_code: shareLink.short_code,
        campaign_id: shareLink.campaign_id,
        clicks: shareLink.clicks,
        created_at: shareLink.created_at,
      },
    });
  } catch (error) {
    console.error("Get share link stats error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Helper functions
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("id-ID").format(num);
}
