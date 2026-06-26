import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { logger } from "../lib/logger.js";

interface JwtPayload {
  userId: string;
}

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn("AUTH-MW", "Missing or invalid Authorization header");
      res.status(401).json({
        success: false,
        message: "Access token is required",
      });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as JwtPayload;

    req.userId = decoded.userId;
    next();
  } catch (error) {
    logger.warn("AUTH-MW", "Invalid or expired access token");
    res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
    });
  }
}
