import { Request, Response } from "express";
import { UserModel } from "../models/userModel";
import { generateToken } from "../utils/generateToken";
import jwt from "jsonwebtoken";

// Helper function to get user from token
const getUserFromToken = (req: Request) => {
  const token = req.cookies?.user_session;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      _id: string;
      role: string;
      walletAddress: string;
    };
    return decoded;
  } catch (error) {
    return null;
  }
};

// Google OAuth Login
export const googleOAuthLogin = async (req: Request, res: Response) => {
  try {
    const { email, name, googleId } = req.body;

    // Check if user exists
    let user = await UserModel.findByEmail(email);

    if (!user) {
      // Create new user
      user = await UserModel.create({
        email,
        fullname: name,
        google_id: googleId,
        is_google_auth: true,
      });
    }

    // Generate session token
    const sessionData = {
      _id: user.id!,
      walletAddress: "",
      role: "",
    };

    const token = generateToken(sessionData);

    res.cookie("user_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        name: user.fullname,
      },
    });
  } catch (error) {
    console.error("Google OAuth login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Login with wallet only (no Google account)
export const walletOnlyLogin = async (req: Request, res: Response) => {
  try {
    const { walletAddress, role = "contributor" } = req.body;

    // Check if wallet exists
    let userData = await UserModel.findByWalletAddress(walletAddress);
    let user;

    if (!userData) {
      const email = walletAddress + "@wallet.user";
      // Check if user exists (fail-safe for interrupted registration)
      let existingUser = await UserModel.findByEmail(email);

      if (existingUser) {
        console.log("Found existing user with incomplete wallet setup, reusing...");
        user = existingUser;
      } else {
        // Create new user with wallet only
        user = await UserModel.create({
          email, // Temporary email
          fullname: `User_${walletAddress.slice(0, 6)}`,
          is_wallet_only: true,
        });
      }

      // Add wallet address
      try {
        console.log("Adding wallet address...");
        await UserModel.addWalletAddress({
          user_id: user.id!,
          wallet_address: walletAddress,
          role: (role === "contributor" ? "sender" : role) as any,
        });
        console.log("✅ Wallet address added.");
      } catch (err: any) {
        console.log("⚠️ Error adding wallet:", err.code);
        // Ignore duplicate wallet address error if it effectively exists
        if (err.code !== "23505") {
          throw err;
        }
      }
    } else {
      user = userData.user;
    }

    // Generate session token
    console.log("Generating token...");
    const sessionData = {
      _id: user.id!,
      walletAddress,
      role,
    };

    const token = generateToken(sessionData);
    console.log("✅ Token generated.");

    res.cookie("user_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000,
    });
    
    console.log("Login successful, sending response.");

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        name: user.fullname,
        walletAddress,
      },
    });
  } catch (error) {
    console.error("Wallet login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Check if wallet can be synced with current user
export const checkWalletSync = async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;
    const currentUser = getUserFromToken(req);

    if (!currentUser) {
      res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
      return;
    }

    // Get current user data
    const user = await UserModel.findById(currentUser._id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    // Check if wallet already exists in another account
    const walletData = await UserModel.findByWalletAddress(walletAddress);

    if (walletData) {
      // Wallet exists in another account
      if (walletData.user.id === user.id) {
        // Wallet already belongs to this user
        res.status(200).json({
          success: true,
          needsSync: false,
          message: "Wallet already connected to your account",
          user: {
            id: user.id,
            email: user.email,
            fullname: user.fullname,
          },
        });
        return;
      } else {
        // Wallet belongs to different account
        res.status(409).json({
          success: false,
          needsSync: false,
          conflict: true,
          message: "This wallet is already connected to another account",
          conflictUser: {
            id: walletData.user.id,
            email: walletData.user.email,
            fullname: walletData.user.fullname,
          },
        });
        return;
      }
    }

    // Wallet doesn't exist - can be synced
    res.status(200).json({
      success: true,
      needsSync: true,
      message: "Wallet can be synced with your account",
      user: {
        id: user.id,
        email: user.email,
        fullname: user.fullname,
      },
      walletAddress,
    });
    return;
  } catch (error) {
    console.error("Check wallet sync error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
    return;
  }
};

// Sync wallet with current Google account
export const syncWalletToAccount = async (req: Request, res: Response) => {
  try {
    const { walletAddress, role = "contributor" } = req.body;
    const currentUser = getUserFromToken(req);

    if (!currentUser) {
      res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
      return;
    }

    // Get current user data
    const user = await UserModel.findById(currentUser._id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    // Check if wallet already exists
    const walletData = await UserModel.findByWalletAddress(walletAddress);
    if (walletData) {
      if (walletData.user.id === user.id) {
        // Already synced
        res.status(200).json({
          success: true,
          message: "Wallet already connected to your account",
        });
        return;
      } else {
        // Wallet belongs to another user
        res.status(409).json({
          success: false,
          message: "This wallet is already connected to another account",
        });
        return;
      }
    }

    // Add wallet to current user
    await UserModel.addWalletAddress({
      user_id: user.id!,
      wallet_address: walletAddress,
      role: (role === 'contributor' ? 'sender' : role) as any,
    });

    // Update user to no longer be wallet_only if it was
    if (user.is_wallet_only) {
      await UserModel.updateById(user.id!, {
        is_wallet_only: false,
      });
    }

    // Generate new token with wallet info
    const token = generateToken({
      _id: user.id!,
      walletAddress,
      role,
    });

    res.cookie("user_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: "Wallet successfully synced to your account",
      user: {
        id: user.id,
        email: user.email,
        fullname: user.fullname,
        walletAddress,
      },
    });
    return;
  } catch (error) {
    console.error("Sync wallet error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
    return;
  }
};

// Check if Google account can be synced with current wallet-only user
export const checkGoogleSync = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const currentUser = getUserFromToken(req);

    if (!currentUser) {
      res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
      return;
    }

    // Get current user data (should be wallet-only user)
    const user = await UserModel.findById(currentUser._id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    // Check if email already exists
    const existingUser = await UserModel.findByEmail(email);

    if (existingUser) {
      if (existingUser.id === user.id) {
        // Already synced
        res.status(200).json({
          success: true,
          needsSync: false,
          message: "Google account already connected",
        });
        return;
      } else {
        // Email belongs to another account
        res.status(409).json({
          success: false,
          needsSync: false,
          conflict: true,
          message: "This email is already connected to another account",
          conflictUser: {
            id: existingUser.id,
            email: existingUser.email,
            fullname: existingUser.fullname,
          },
        });
        return;
      }
    }

    // Email doesn't exist - can be synced
    res.status(200).json({
      success: true,
      needsSync: true,
      message: "Google account can be synced",
      user: {
        id: user.id,
        walletAddress: currentUser.walletAddress,
      },
      email,
    });
    return;
  } catch (error) {
    console.error("Check Google sync error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
    return;
  }
};

// Placeholder functions for vault operations
export const createVault = async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    message: "Not implemented yet",
  });
};

export const registerVaultToIDRX = async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    message: "Not implemented yet",
  });
};

export const addBankAccountToVault = async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    message: "Not implemented yet",
  });
};
