import dotenv from "dotenv";
dotenv.config();
import path from "path";

import { connectDB } from "./config/database";
import express from "express";
import methodOverride from "method-override";
import cors from "cors";
import crowdfundingRoutes from "./routes/crowdfunding";
import syncRoutes from "./routes/sync";

import session from "express-session";
import passport from "passport";
import authRoutes from "./routes/auth";
// import pricefeedRoutes from "./routes/pricefeed";
import cookieParser from "cookie-parser";
// import { receiverListener } from "./services/receiverSmartContractListener";
// import { senderListener } from "./services/senderSmartContractListener";

// import { checkSession } from "./config/checkSession";

const app = express();
connectDB();

// Debug: Log environment variables on startup
console.log("🔧 CORS Config - FRONTEND_URL:", process.env.FRONTEND_URL);
console.log("🔧 CORS Config - PONDER_URL:", process.env.PONDER_URL);

const whitelist = [
  "https://crowdfunding-base.vercel.app", // Hardcoded for reliability
  process.env.FRONTEND_URL,
  process.env.FARCASTER_URL,
  process.env.PONDER_URL, // Add Ponder URL to whitelist
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:42069", // Local Ponder
  "http://127.0.0.1:42069", // Local Ponder
].filter(Boolean); // Remove undefined/empty values

const corsOptions = {
  origin: (origin: any, callback: any) => {
    // Allow requests with no origin (mobile apps, Postman, server-to-server, etc.)
    if (!origin) return callback(null, true);

    if (whitelist.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      console.log("❌ CORS blocked for origin:", origin);
      return callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // Allow cookies
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "x-ponder-api-key", // Add Ponder API key header
  ],
  exposedHeaders: ["Set-Cookie"],
};
// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options("*", cors(corsOptions));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method")); //  buat munculin UPDATE dan DELETE
app.use("/public", express.static(path.join(__dirname, "../public")));

const isProduction = process.env.NODE_ENV === "production";

app.use(
  session({
    secret: process.env.SESSION_SECRET || "somesecret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: false,
      sameSite: isProduction ? "none" : "lax", // Use lax for development
      secure: isProduction, // Only secure in production
      maxAge: 24 * 60 * 60 * 1000 * 30, // 30 days
      domain: isProduction ? undefined : "localhost", // Explicit domain for development
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

app.use("/", authRoutes);
// app.use("/", pricefeedRoutes);
app.use("/crowdfunding", crowdfundingRoutes);
app.use("/api/sync", syncRoutes); // Ponder webhook sync routes

//handle semua endpoint yang gaada untuk menampilkan 404 not found page
app.get("*", (req, res) => {
  res.status(404).json({ message: "Not Found" }); // ubah ke res.render('404') jika pakai view engine
});

const PORT = process.env.PORT || 3300;

// Import auto-sync service
import { startAutoSync } from "./services/autoSync";

app.listen(PORT, () => {
  console.log(
    `Server running on port ${process.env.PORT || PORT} in ${
      process.env.NODE_ENV || "development"
    } mode.`,
  );

  // Start auto-sync from Ponder indexer
  startAutoSync();
});

// receiverListener();
// senderListener();

export default app;
