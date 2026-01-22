/**
 * Centralized ABI Configuration
 * All contract ABIs used in the application
 */

/**
 * Campaign Contract ABI
 * Used for creating and managing crowdfunding campaigns
 */
export const CAMPAIGN_ABI = [
  "function createCampaign(string name, string creatorName, uint256 targetAmount) public returns (uint256)",
  "function updateCampaign(uint256 campaignId, string name, uint256 targetAmount) public",
  "function donate(uint256 campaignId, uint256 amount, address tokenIn) public",
  "function getCampaignInfo(uint256 campaignId) view returns (string name, string creatorName, uint256 balance, uint256 targetAmount, uint256 creationTime, address owner)",
  "function getCampaign(uint256 campaignId) view returns (string, string, uint256, uint256, uint256, address)",
  "event CampaignCreated(uint256 indexed campaignId, string name, address indexed owner, uint256 targetAmount)",
  "event CampaignUpdated(uint256 indexed campaignId, string name, uint256 targetAmount)",
  "event DonationReceived(uint256 indexed campaignId, address indexed donor, uint256 amount)",
];

/**
 * IDRX Token Contract ABI (ERC20 with mint function)
 * Used for minting and managing IDRX tokens
 */
export const IDRX_ABI = [
  "function mint(address to, uint256 amount) public",
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

/**
 * Badge NFT Contract ABI (ERC721)
 * Used for minting achievement badges
 */
export const BADGE_ABI = [
  "function mintBadge(address to, string memory name, string memory description) external",
  "function getBadgeInfo(uint256 tokenId) external view returns (uint256 id, string memory name, string memory description)",
  "event BadgeMinted(uint256 indexed tokenId, address indexed to, string name)",
];

/**
 * Generic ERC20 Token ABI
 * Used for interacting with standard ERC20 tokens like USDC
 */
export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
];
