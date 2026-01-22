import jwt from "jsonwebtoken";

interface DecodedToken {
  _id: string;
  walletAddress: string;
  role: string;
}

export function generateToken(payload: DecodedToken): string {
  const token = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: "30d", // atau "15m", "7d", "2h",
  });
  return token;
}
