import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Pooled connection for app queries (Neon pooler)
    url: process.env["DATABASE_URL"]!,
    // directUrl is not a prisma.config.ts option in Prisma 7; use DATABASE_URL only here.
  },
});
