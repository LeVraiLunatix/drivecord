/**
 * Prisma client singleton (Prisma 7 + pg adapter).
 *
 * Prisma 7 requires an explicit driver adapter — the connection URL is no
 * longer read from the schema. PrismaPg accepts a connection string or a
 * pg.Pool; we pass the URL directly so Prisma manages the pool internally.
 *
 * In development, Next.js HMR creates a new module instance on each reload
 * and would open a fresh connection pool every time. We pin one instance to
 * the global object to avoid exhausting Neon's connection limit.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var _prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is not set.");
  const adapter = new PrismaPg(url);
  // PrismaClient in v7 has the adapter in its options
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PrismaClient({ adapter } as any);
}

export const prisma: PrismaClient =
  global._prisma ?? (global._prisma = createPrismaClient());

if (process.env.NODE_ENV !== "production") {
  global._prisma = prisma;
}
