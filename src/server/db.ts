import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getConfig } from "./config";

export type Db = InstanceType<typeof PrismaClient>;
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

function createClient(): Db {
  const { database } = getConfig();
  // Serverless functions each hold their own pool, so keep pools small by default.
  const max = Number(process.env.DATABASE_POOL_MAX ?? 5);
  if (database.provider === "mysql") {
    // The MariaDB connector speaks the MySQL protocol but expects a mariadb:// URI.
    const url = database.url.replace(/^mysql:\/\//, "mariadb://");
    const parsed = new URL(url);
    const adapter = new PrismaMariaDb({
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
      connectionLimit: max,
      ...(parsed.searchParams.get("ssl") === "true" ? { ssl: { rejectUnauthorized: true } } : {}),
    });
    return new PrismaClient({ adapter });
  }
  const adapter = new PrismaPg({ connectionString: database.url, max });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { __pbcaPrisma?: Db };

/** Shared Prisma client (one per server instance; survives dev hot reloads). */
export function getDb(): Db {
  globalForPrisma.__pbcaPrisma ??= createClient();
  return globalForPrisma.__pbcaPrisma;
}

/** Prisma error code helper (P2002 = unique constraint violation). */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}
