/**
 * GET /api/admin/users — list all accounts (admin only).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/admin";

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      password: true,
      createdAt: true,
      patreonTier: true,
      accounts: { select: { provider: true } },
      _count: { select: { webhooks: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    adminEmail: session.user!.email,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image,
      hasPassword: Boolean(u.password),
      providers: u.accounts.map((a) => a.provider),
      webhookCount: u._count.webhooks,
      createdAt: u.createdAt.getTime(),
      patreonTier: (u.patreonTier ?? 0) as 0 | 1 | 2 | 3,
    })),
  });
}
