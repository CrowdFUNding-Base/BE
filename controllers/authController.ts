import { Request, Response } from "express";
import { UserModel } from "../models/userModel";
import { generateToken } from "../utils/generateToken";


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

// Connect wallet to existing Google account
export const connectWalletToGoogleAccount = async (
  req: Request,
  res: Response,
) => {
  try {
    const { userId, walletAddress, role = "contributor" } = req.body;

    // Check if wallet is already used
    const existingWallet = await UserModel.findByWalletAddress(walletAddress);
    if (existingWallet) {
      return res.status(400).json({
        success: false,
        message: "Wallet address already connected to another account",
      });
    }

    // Add wallet to user
    await UserModel.addWalletAddress({
      user_id: userId,
      wallet_address: walletAddress,
      role: role as any,
    });

    // Generate new session token with wallet
    const sessionData = {
      _id: userId,
      walletAddress,
      role,
    };

    const token = generateToken(sessionData);

    res.cookie("user_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: "Wallet connected successfully",
    });
  } catch (error) {
    console.error("Connect wallet error:", error);
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
      // Create new user with wallet only
      user = await UserModel.create({
        email: walletAddress + "@wallet.user", // Temporary email
        fullname: `User_${walletAddress.slice(0, 6)}`,
        is_wallet_only: true,
      });

      await UserModel.addWalletAddress({
        user_id: user.id!,
        wallet_address: walletAddress,
        role: role as any,
      });
    } else {
      user = userData.user;
    }

    // Generate session token
    const sessionData = {
      _id: user.id!,
      walletAddress,
      role,
    };

    const token = generateToken(sessionData);

    res.cookie("user_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000,
    });

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
