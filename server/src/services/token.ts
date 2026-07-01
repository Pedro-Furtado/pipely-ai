import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

export function generateAccessToken(userId: string): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET as string, {
    expiresIn: "15m",
  });
}

export async function generateRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.refreshToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  return token;
}
