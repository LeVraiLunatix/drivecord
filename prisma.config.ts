import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // For migrations: use the DIRECT (non-pooled) Neon URL.
    // Neon's pooler (PgBouncer) doesn't support the DDL commands Prisma migrate needs.
    // DIRECT_URL = postgresql://user:pass@host.neon.tech/db  (no "-pooler" in hostname)
    // DATABASE_URL = postgresql://user:pass@host-pooler.neon.tech/db  (for app runtime)
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"]!,
  },
});
