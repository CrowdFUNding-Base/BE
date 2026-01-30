import { ethers } from "ethers";
import pool from "../config/database";
import { getBadgeContract } from "../config/contracts";

/**
 * Check if a donor should receive a badge and mint it if eligible.
 * Logic: One badge per campaign per user.
 */
export const checkAndMintBadge = async (
  donorAddress: string,
  campaignId: number,
  donationAmount: string,
) => {
  const client = await pool.connect();

  try {
    // 1. Get Campaign Details (for Badge metadata)
    const campaignQuery = `
      SELECT name FROM blockchain_campaigns WHERE id = $1
    `;
    const campaignResult = await client.query(campaignQuery, [campaignId]);

    if (campaignResult.rows.length === 0) {
      console.log(
        `⚠️ Campaign #${campaignId} not found, skipping badge minting.`,
      );
      return;
    }

    const campaignName = campaignResult.rows[0].name;

    // 2. Check if user already has a badge for this campaign
    // We assume the badge name follows format: "Supporter: [Campaign Name]"
    // Or we can check if they have ANY badge from this campaign interaction.
    // Ideally, we should store campaign_id in badges table, but for now we check by name pattern or just ensure 1 badge per campaign context.

    // Simplest check: Did they get a badge named "Supporter: [Campaign Name]"?
    const badgeTitle = `Supporter: ${campaignName}`;

    const existingBadgeQuery = `
      SELECT token_id FROM blockchain_badges 
      WHERE LOWER(owner) = LOWER($1) AND name = $2
    `;
    const existingBadgeResult = await client.query(existingBadgeQuery, [
      donorAddress,
      badgeTitle,
    ]);

    if (existingBadgeResult.rows.length > 0) {
      console.log(
        `ℹ️ User ${donorAddress} already has badge "${badgeTitle}", skipping.`,
      );
      return;
    }

    // 3. Mint Badge
    console.log(`🎖️ Minting badge "${badgeTitle}" for ${donorAddress}...`);

    const badgeContract = getBadgeContract();
    const wallet = badgeContract.signer as ethers.Wallet;

    // Check Balance
    const balance = await wallet.getBalance();
    const cleanBalance = ethers.utils.formatEther(balance);
    if (balance.lt(ethers.utils.parseEther("0.001"))) {
      console.warn(
        `⚠️ Backend Wallet (${wallet.address}) has low balance: ${cleanBalance} ETH. Minting may fail.`,
      );
      // We don't return here because we want to TRY, but this explains the error.
      // Actually, if we know it will fail, we should probably stop.
      // Based on the error "want 0.00075", let's require at least 0.001
      if (balance.lt(ethers.utils.parseEther("0.0008"))) {
        console.error(
          `❌ Insufficient funds in backend wallet. Have: ${cleanBalance} ETH. Need ~0.0008 ETH.`,
        );
        return;
      }
    }

    // Description
    const description = `Awarded for donating ${donationAmount} IDRX to ${campaignName}.`;

    const tx = await badgeContract.mintBadge(
      donorAddress,
      badgeTitle,
      description,
      { gasLimit: 500000 },
    );

    console.log(`✅ Mint TX sent: ${tx.hash}. Waiting for confirmation...`);

    // Don't await wait() to avoid blocking the sync process too long,
    // or await it if we want to be sure. Let's await it to log success.
    await tx.wait();

    console.log(`🎉 Badge minted successfully! TX: ${tx.hash}`);
  } catch (error: any) {
    console.error(
      `❌ Failed to mint badge for ${donorAddress}:`,
      error.message,
    );
  } finally {
    client.release();
  }
};
