import "dotenv/config";
import { defineConfig } from "prisma/config";

// One schema per database engine; DATABASE_PROVIDER picks which one the CLI uses.
// prisma/schema.prisma (PostgreSQL) is the source of truth; run `npm run db:sync-mysql`
// after editing it to regenerate prisma/mysql/schema.prisma.
const isMysql = (process.env.DATABASE_PROVIDER ?? "postgresql").toLowerCase() === "mysql";

export default defineConfig({
  schema: isMysql ? "prisma/mysql/schema.prisma" : "prisma/schema.prisma",
  migrations: {
    path: isMysql ? "prisma/mysql/migrations" : "prisma/migrations",
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection on Neon/Supabase.
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "",
  },
});
