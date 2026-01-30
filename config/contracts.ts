import { ethers } from "ethers";
import { CAMPAIGN_ABI, IDRX_ABI, BADGE_ABI, ERC20_ABI } from "./abis";

/**
 * Smart Contract Addresses Configuration
 * Network: Base Sepolia Testnet
 */

export const CONTRACT_ADDRESSES = {
  // Mock Tokens
  IDRX: "0xAC90f99347766F9b3b425Ca54248150e2C9D1Bde",
  USDC: "0xC85840d4754aC06cEE7138eC0a664317921B6B5f",
  // Main Contracts (set via environment variables)
  CAMPAIGN: process.env.CAMPAIGN_CONTRACT_ADDRESS || "",
  BADGE:
    process.env.BADGE_CONTRACT_ADDRESS ||
    "0x27EA9B34D708ff7646F92Dab287DfD43EbBA0d19",
};

export const NETWORK_CONFIG = {
  chainId: 84532, // Base Sepolia
  name: "Base Sepolia",
  rpcUrl: process.env.RPC_URL || "https://sepolia.base.org",
  blockExplorer: "https://sepolia.basescan.org",
};

/**
 * Helper to get contract address with fallback to env
 */
export const getContractAddress = (
  contractName: keyof typeof CONTRACT_ADDRESSES,
): string => {
  const envKey = `${contractName}_CONTRACT_ADDRESS`;
  const address = process.env[envKey] || CONTRACT_ADDRESSES[contractName];

  if (!address) {
    throw new Error(`Contract address for ${contractName} is not configured`);
  }

  return address;
};

/**
 * Get configured provider instance
 */
export const getProvider = (): ethers.providers.JsonRpcProvider => {
  return new ethers.providers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl);
};

/**
 * Get configured wallet instance
 */
export const getWallet = (
  provider?: ethers.providers.JsonRpcProvider,
): ethers.Wallet => {
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("PRIVATE_KEY is not configured in environment variables");
  }

  const walletProvider = provider || getProvider();
  return new ethers.Wallet(privateKey, walletProvider);
};

/**
 * Get Campaign contract instance
 */
export const getCampaignContract = (
  signer?: ethers.Signer | ethers.providers.Provider,
): ethers.Contract => {
  const address = getContractAddress("CAMPAIGN");
  const signerOrProvider = signer || getWallet();
  return new ethers.Contract(address, CAMPAIGN_ABI, signerOrProvider);
};

/**
 * Get IDRX token contract instance
 */
export const getIDRXContract = (
  signer?: ethers.Signer | ethers.providers.Provider,
): ethers.Contract => {
  const address = getContractAddress("IDRX");
  const signerOrProvider = signer || getWallet();
  return new ethers.Contract(address, IDRX_ABI, signerOrProvider);
};

/**
 * Get Badge NFT contract instance
 */
export const getBadgeContract = (
  signer?: ethers.Signer | ethers.providers.Provider,
): ethers.Contract => {
  const address = getContractAddress("BADGE");
  const signerOrProvider = signer || getWallet();
  return new ethers.Contract(address, BADGE_ABI, signerOrProvider);
};

/**
 * Get ERC20 token contract instance (for USDC, etc.)
 */
export const getERC20Contract = (
  tokenAddress: string,
  signer?: ethers.Signer | ethers.providers.Provider,
): ethers.Contract => {
  const signerOrProvider = signer || getWallet();
  return new ethers.Contract(tokenAddress, ERC20_ABI, signerOrProvider);
};
