import "dotenv/config";

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS || "60000"),
  PORT: parseInt(process.env.PORT || "3335"),
};
