import { PrismaClient } from "../../../server/generated/prisma/client.js";

const databaseUrl = process.env.DATABASE_URL || "";
const isSQLite = databaseUrl.startsWith("file:");

let prisma: PrismaClient;

if (isSQLite) {
  const libsql = await import("@libsql/client");
  const adapterMod = await import("@prisma/adapter-libsql");
  const PrismaLibSQL = adapterMod.PrismaLibSql || adapterMod.PrismaLibSQL || adapterMod.default;

  const client = libsql.createClient({ url: databaseUrl });
  const adapter = new PrismaLibSQL(client);
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
