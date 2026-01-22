import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserModel } from "../models/userModel";

// Interface untuk decoded JWT token
interface DecodedToken {
  _id: string;
  role: string;
  walletAddress: string;
}

// Extend Request interface untuk include user data
declare global {
  namespace Express {
    interface Request {
      currentUser?: any;
      currentWalletAddress?: string;
      currentRole?: string;
    }
  }
}

// Middleware untuk authenticate user
export const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies?.user_session;

    if (!token) {
      res.status(401).json({
        authenticated: false,
        message: "Authentication token not found",
      });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as DecodedToken;

    // Find user with matching wallet address and role (if wallet exists)
    let user;
    if (decoded.walletAddress && decoded.walletAddress !== "") {
      const userData = await UserModel.findByWalletAddress(
        decoded.walletAddress
      );
      if (userData && userData.user.id === decoded._id) {
        user = userData.user;
        // Verify wallet role
        const wallets = await UserModel.getUserWallets(user.id!);
        const currentWallet = wallets.find(
          (w) =>
            w.wallet_address === decoded.walletAddress &&
            w.role === decoded.role
        );
        if (!currentWallet) {
          user = null;
        }
      }
    } else {
      // For users without wallet (Google OAuth only)
      user = await UserModel.findById(decoded._id);
    }

    if (!user) {
      res.status(401).json({
        authenticated: false,
        message: "Invalid authentication token",
      });
      return;
    }

    // Attach user data to request
    req.currentUser = user;
    req.currentWalletAddress = decoded.walletAddress;
    req.currentRole = decoded.role;

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({
      authenticated: false,
      message: "Invalid or expired token",
    });
    return;
  }
};

// Middleware untuk require specific role
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentRole || !allowedRoles.includes(req.currentRole)) {
      res.status(403).json({
        message: "Access forbidden: insufficient permissions",
      });
      return;
    }
    next();
  };
};

// Middleware untuk require wallet connection
export const requireWallet = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.currentWalletAddress || req.currentWalletAddress === "") {
    res.status(400).json({
      message: "Wallet connection required for this action",
    });
    return;
  }
  next();
};

// Middleware untuk optional authentication (tidak throw error jika tidak ada token)
export const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies?.user_session;

    if (token) {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET!
      ) as DecodedToken;

      let user;
      if (decoded.walletAddress && decoded.walletAddress !== "") {
        const userData = await UserModel.findByWalletAddress(
          decoded.walletAddress
        );
        if (userData && userData.user.id === decoded._id) {
          user = userData.user;
          // Verify wallet role
          const wallets = await UserModel.getUserWallets(user.id!);
          const currentWallet = wallets.find(
            (w) =>
              w.wallet_address === decoded.walletAddress &&
              w.role === decoded.role
          );
          if (!currentWallet) {
            user = null;
          }
        }
      } else {
        user = await UserModel.findById(decoded._id);
      }

      if (user) {
        req.currentUser = user;
        req.currentWalletAddress = decoded.walletAddress;
        req.currentRole = decoded.role;
      }
    }

    next();
  } catch (error) {
    // Ignore errors in optional authentication
    next();
  }
};
