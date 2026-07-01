import { PrismaClient } from "../../generated/prisma/client.js";

const databaseUrl = process.env.DATABASE_URL || "";
const isSQLite = databaseUrl.startsWith("file:");

let prisma: PrismaClient;

if (isSQLite) {
  const { default: Database } = await import("better-sqlite3");
  const { PrismaBetterSQLite3 } = await import("@prisma/adapter-better-sqlite3");

  const dbPath = databaseUrl.replace("file:", "").replace("./", "");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  const adapter = new PrismaBetterSQLite3(db);
  prisma = new PrismaClient({ adapter } as any);
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
