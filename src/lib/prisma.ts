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
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is not set.");
  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = new PrismaClient({ adapter } as any);
  // `DriveFile.size` is stored as BIGINT (files can exceed the ~2 GiB an Int
  // column would overflow at), but every call site in the app treats it as a
  // plain number (arithmetic, JSON responses, sorting). Converting once here
  // — instead of at each of the dozen read sites — keeps the rest of the
  // codebase working with `number` unchanged. Safe: JS's max safe integer is
  // ~9 PB, far beyond any real file size. The return type is inferred (not
  // annotated `PrismaClient`) so every caller sees `size: number`.
  return client.$extends({
    result: {
      driveFile: {
        size: {
          needs: { size: true },
          compute(driveFile: { size: bigint }) {
            return Number(driveFile.size);
          },
        },
      },
    },
  });
}

type AppPrismaClient = ReturnType<typeof createPrismaClient>;

declare global {
  // eslint-disable-next-line no-var
  var _prisma: AppPrismaClient | undefined;
}

export const prisma: AppPrismaClient =
  global._prisma ?? (global._prisma = createPrismaClient());

if (process.env.NODE_ENV !== "production") {
  global._prisma = prisma;
}
