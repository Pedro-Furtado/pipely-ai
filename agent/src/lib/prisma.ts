import { PrismaClient } from "../../../server/generated/prisma/client.js";

const databaseUrl = process.env.DATABASE_URL || "";
const isSQLite = databaseUrl.startsWith("file:");

let prisma: PrismaClient;

if (isSQLite) {
  prisma = new PrismaClient();
} else {
  const pg = await import("pg");
  const { PrismaPg } = await import("@prisma/adapter-pg");

  const pool = new pg.default.Pool({
    connectionString: databaseUrl,
  });

  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
}

export { prisma };
