import express, { NextFunction, Request, Response, Router } from "express";
import { generateToken } from "../utils/generateToken";
import jwt from "jsonwebtoken";
import { LoginSessionTokenModel, UserModel } from "../models/userModel";
import env from "dotenv";
env.config();
import {
  googleOAuthLogin,
  walletOnlyLogin,
  checkWalletSync,
  syncWalletToAccount,
  checkGoogleSync,
} from "../controllers/authController";
const router: Router = express.Router();

router.get(
  "/check-auth",
  async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.user_session;
    if (!token) {
      console.log("❌ Token not found in cookies");
      res
        .status(401)
        .json({ authenticated: false, message: "Token not found" });
      return;
    } else {
      console.log("✅ Token found:", token.substring(0, 20) + "...");
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
          _id: string;
          role: string;
          walletAddress: string;
        };

        let user;
        if (decoded.walletAddress && decoded.walletAddress !== "") {
          // Find user with wallet
          const userData = await UserModel.findByWalletAddress(
            decoded.walletAddress,
          );
          if (userData && userData.user.id === decoded._id) {
            user = userData.user;
            // Check wallet role
            const wallets = await UserModel.getUserWallets(user.id!);
            const currentWallet = wallets.find(
              (w) =>
                w.wallet_address === decoded.walletAddress &&
                w.role === decoded.role,
            );
            if (!currentWallet) {
              user = null;
            }
          }
        } else {
          // Find user without wallet requirement (Google OAuth only)
          user = await UserModel.findById(decoded._id);
        }

        if (!user) {
          console.log("❌ User not found for token");
          res
            .status(401)
            .json({ authenticated: false, message: "Invalid token" });
          return;
        } else {
          const wallets = await UserModel.getUserWallets(user.id!);
          res.json({
            user: {
              ...user,
              wallets,
            },
            currentWalletAddress: decoded.walletAddress,
            currentRole: decoded.role,
            message: "Successfully authenticated",
            authenticated: true,
          });
          return;
        }
      } catch (err) {
        console.error("❌ Error while verifying token:", err);
        res.status(401).json({ authenticated: false, message: "Token error" });
        return;
      }
    }
  },
);

// sebelumnya FE harus bisa memasitkan bahwa user tersebut memang pemilik waleltAddressnya (tidak sekedar ngesend walletaddress ke BE saja)
// dan dari BE harus punya sesuatu yang bisa memastikan bahwa orang itu memang itu (agar tidak bisa di hack dari postman dll)
// ...existing code...

router.post(
  "/loginWithWallet",
  async (req: Request, res: Response, next: NextFunction) => {
    const { walletAddress, _id } = req.body;

    if (!walletAddress) {
      console.log("❌ Wallet address is missing");
      res.status(400).json({ message: "Wallet address is required" });
      return;
    }

    // console.log("✅ Wallet address provided:", walletAddress);
    try {
      // Jika ada _id, cari user berdasarkan _id (untuk pairing scenario)
      let user;
      if (_id) {
        user = await UserModel.findById(_id);
        if (!user) {
          res.status(404).json({
            message: "User not found",
            requiresPairing: false,
          });
          return;
        }

        // Check if wallet exists in user's wallets
        const wallets = await UserModel.getUserWallets(user.id!);
        const walletExists = wallets.find(
          (wallet) => wallet.wallet_address === walletAddress,
        );

        if (!walletExists) {
          // Wallet not found in user's account - requires pairing
          res.status(409).json({
            message: "Wallet not linked to this account",
            requiresPairing: true,
            userId: user.id,
            walletAddress: walletAddress,
          });
          return;
        }
      } else {
        const userData = await UserModel.findByWalletAddress(walletAddress);
        user = userData?.user || null;

        if (!user) {
          console.log("❌ User not found for wallet:", walletAddress);

          if (!user) {
            console.log("❌ User definitely not found");

            // Debug disabled for production

            res.status(200).json({
              message:
                "Account with specified wallet address is not found. Please register first.",
              requiresPairing: false,
              redirect: `/sync-wallet`, // Tambah redirect URL
              statusCode: 404,
            });
            return;
          }
        }
      }

      const token = await generateCookiesToken(user, walletAddress);

      // Set cookie dengan berbagai konfigurasi untuk development dan production
      const isProduction = process.env.NODE_ENV === "production";

      res.cookie("user_session", token, {
        httpOnly: true,
        sameSite: isProduction ? "none" : "lax", // Development gunakan lax
        secure: isProduction, // Hanya secure di production
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        domain: isProduction ? undefined : "localhost", // Explicit domain untuk development
        path: "/",
      });

      console.log("✅ Cookie set successfully");

      res.status(200).json({
        statusCode: 200,
        message: "Login successful",
        debug: {
          userId: user.id,
          walletAddress,
          tokenSet: true,
        },
      });
      return;
    } catch (err) {
      console.error("Error while logging in:", err);
      res.status(500).json({ message: "Internal server error" });
      return;
    }
  },
);

export async function generateCookiesToken(
  newUser: any, // IUser interface
  walletAddress: string,
) {
  let walletData: any = null;

  // Jika ada walletAddress, cari wallet data
  if (walletAddress && walletAddress !== "") {
    const userWallets = await UserModel.getUserWallets(newUser.id);
    walletData = userWallets.find(
      (wallet) => wallet.wallet_address === walletAddress,
    );

    if (!walletData) {
      console.log("❌ No wallet data found for address:", walletAddress);
      throw new Error("No registered wallet address found in this account");
    }
  }

  const token = generateToken({
    _id: newUser.id.toString(),
    role: walletData?.role || "none", // Default role jika tidak ada wallet
    walletAddress: walletData?.wallet_address || "", // Empty string jika tidak ada wallet
  });

  const tokenSession = await LoginSessionTokenModel.create({
    user_id: newUser.id.toString(),
    token,
    email: newUser.email,
    wallet_address: walletData?.wallet_address || "",
    role: walletData?.role || "none", // Default role
  });

  return token;
}

// LOGOUT
router.post("/logout", (req: Request, res: Response) => {
  req.logout(async (err) => {
    if (err) {
      res.status(500).json({ message: "Logout gagal" });
      return;
    }
    const token = req.cookies?.user_session;
    // Hapus token dari database
    const deleted = await LoginSessionTokenModel.deleteByToken(token);

    req.session.destroy(() => {
      res.clearCookie("user_session");
      res.status(200).json({ message: "Logout sukses" });
      return;
    });
  });
});

// ================= GOOGLE OAUTH ROUTES =================
import passport from "passport";
import "../config/passport"; // Import passport configuration
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
// GOOGLE STRATEGY
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        "http://localhost:3300/auth/google/callback",
      passReqToCallback: true,
    },
    async function (
      req: Request,
      accessToken: string,
      refreshToken: string,
      profile: Profile,
      done,
    ) {
      try {
        // Extract user info from Google profile
        const email = profile.emails?.[0]?.value;
        const googleId = profile.id;
        const displayName = profile.displayName;

        if (!email) {
          return done(new Error("No email found in Google profile"));
        }

        console.log("🔍 Google OAuth - Looking for user with email:", email);

        // Check if user already exists by email
        let user = await UserModel.findByEmail(email);

        if (user) {
          console.log("✅ User found:", user.id);

          // User exists - update Google info if not already set
          if (!user.google_id) {
            console.log("📝 Updating user with Google ID");
            const updatedUser = await UserModel.updateById(user.id!, {
              google_id: googleId,
              is_google_auth: true,
            });
            return done(null, updatedUser || user);
          }

          return done(null, user);
        } else {
          console.log("➕ Creating new user with Google OAuth");

          // Create new user with Google OAuth data
          const newUser = await UserModel.create({
            email: email,
            fullname: displayName,
            google_id: googleId,
            is_google_auth: true,
            is_wallet_only: false,
            // No password for Google OAuth users
          });

          console.log("✅ New user created:", newUser.id);
          return done(null, newUser);
        }
      } catch (err) {
        console.error("❌ Google OAuth Strategy Error:", err);
        return done(err as Error);
      }
    },
  ),
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user!);
});

// Initiate Google OAuth flow
router.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  }),
);

// Google OAuth callback
router.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL || "http://localhost:3000"}/login?error=oauth_failed`,
    session: false,
  }),
  async (req: Request, res: Response) => {
    try {
      const user = req.user as any;

      if (!user) {
        res.redirect(
          `${process.env.FRONTEND_URL || "http://localhost:3000"}/login?error=no_user`,
        );
        return;
      }

      // Generate JWT token for the user
      const token = await generateCookiesToken(user, "");

      const isProduction = process.env.NODE_ENV === "production";

      res.cookie("user_session", token, {
        httpOnly: true,
        sameSite: isProduction ? "none" : "lax",
        secure: isProduction,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        domain: isProduction ? undefined : "localhost",
        path: "/",
      });

      // Redirect to frontend with success
      res.redirect(
        `${process.env.FRONTEND_URL || "http://localhost:3000"}/home`,
      );
    } catch (error) {
      console.error("Google OAuth callback error:", error);
      res.redirect(
        `${process.env.FRONTEND_URL || "http://localhost:3000"}/login?error=callback_failed`,
      );
    }
  },
);

// Get current user info (for frontend to check auth status)
router.get("/auth/me", async (req: Request, res: Response) => {
  const token = req.cookies?.user_session;

  if (!token) {
    res.status(401).json({
      authenticated: false,
      message: "Not authenticated",
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      _id: string;
      role: string;
      walletAddress: string;
    };

    const user = await UserModel.findById(decoded._id);

    if (!user) {
      res.status(401).json({
        authenticated: false,
        message: "User not found",
      });
      return;
    }

    const wallets = await UserModel.getUserWallets(user.id!);

    res.status(200).json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        fullname: user.fullname,
        is_google_auth: user.is_google_auth,
        wallets,
      },
      currentWalletAddress: decoded.walletAddress,
      currentRole: decoded.role,
    });
  } catch (error) {
    console.error("Auth me error:", error);
    res.status(401).json({
      authenticated: false,
      message: "Invalid token",
    });
  }
});

// Google OAuth Login
router.post("/google-login", googleOAuthLogin);

// Web3 Wallet Login
router.post("/wallet-login", walletOnlyLogin);

// Sync wallet with Google account
router.post("/check-wallet-sync", checkWalletSync);
router.post("/sync-wallet", syncWalletToAccount);

// Sync Google account with wallet-only user
router.post("/check-google-sync", checkGoogleSync);

export default router;
