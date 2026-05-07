import bcrypt from "bcryptjs";
import { prisma } from "../db.js";

// Admin auth service. All hashing + verification lives here so the API is the
// only place plaintext passwords are seen in production.
//
// Hash: bcrypt with cost factor 10 (~70ms per verify on a modern node, fast
// enough for interactive login + slow enough to make brute force expensive).

const BCRYPT_ROUNDS = 10;

const MIN_PASSWORD_LENGTH = 8;

export type AdminSummary = {
  userId: string;
  email: string;
  name: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

export type LoginResult =
  | { ok: true; userId: string; email: string; role: "ADMIN" }
  | { ok: false; reason: "invalid_credentials" };

// ─── Password helpers ──────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function validatePassword(plain: string): { ok: true } | { ok: false; reason: string } {
  if (typeof plain !== "string") return { ok: false, reason: "Password is required" };
  if (plain.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (!/\d/.test(plain)) {
    return { ok: false, reason: "Password must contain at least one digit" };
  }
  return { ok: true };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ─── Auth flows ────────────────────────────────────────────────────────────

export async function loginAdmin(email: string, password: string): Promise<LoginResult> {
  const lower = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: { email: lower },
    select: { id: true, email: true, role: true, adminCredential: { select: { passwordHash: true } } },
  });
  if (!user || user.role !== "ADMIN" || !user.adminCredential) {
    // Run a dummy compare so timing doesn't reveal whether the email exists.
    await bcrypt.compare(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali");
    return { ok: false, reason: "invalid_credentials" };
  }
  const matches = await bcrypt.compare(password, user.adminCredential.passwordHash);
  if (!matches) return { ok: false, reason: "invalid_credentials" };

  await prisma.adminCredential.update({
    where: { userId: user.id },
    data: { lastLoginAt: new Date() },
  });
  return { ok: true, userId: user.id, email: user.email ?? lower, role: "ADMIN" };
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const validation = validatePassword(newPassword);
  if (!validation.ok) return validation;

  const cred = await prisma.adminCredential.findUnique({ where: { userId } });
  if (!cred) return { ok: false, reason: "Admin credential not found" };
  const ok = await bcrypt.compare(currentPassword, cred.passwordHash);
  if (!ok) return { ok: false, reason: "Current password is incorrect" };

  const newHash = await hashPassword(newPassword);
  await prisma.adminCredential.update({
    where: { userId },
    data: { passwordHash: newHash, passwordUpdatedAt: new Date() },
  });
  return { ok: true };
}

export async function createAdmin(
  email: string,
  password: string,
  _createdById: string | null,
): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
  const lower = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) {
    return { ok: false, reason: "Invalid email" };
  }
  const validation = validatePassword(password);
  if (!validation.ok) return validation;

  const existing = await prisma.user.findUnique({
    where: { email: lower },
    select: { id: true, role: true, adminCredential: { select: { userId: true } } },
  });

  if (existing?.adminCredential) {
    return { ok: false, reason: "Admin already exists" };
  }

  const hash = await hashPassword(password);

  // Upsert User (might exist as a player) → role ADMIN, then create credential.
  // Done in a transaction so we can't leave a half-created admin.
  const userId = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: lower },
      create: { email: lower, role: "ADMIN" },
      update: { role: "ADMIN" },
      select: { id: true },
    });
    await tx.adminCredential.create({
      data: { userId: user.id, passwordHash: hash },
    });
    return user.id;
  });

  return { ok: true, userId };
}

export async function revokeAdmin(
  targetUserId: string,
  actingUserId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (targetUserId === actingUserId) {
    return { ok: false, reason: "Cannot revoke your own admin access" };
  }
  const adminCount = await prisma.adminCredential.count();
  if (adminCount <= 1) {
    return { ok: false, reason: "Cannot revoke the last admin" };
  }
  const exists = await prisma.adminCredential.findUnique({ where: { userId: targetUserId } });
  if (!exists) return { ok: false, reason: "Admin not found" };

  await prisma.$transaction(async (tx) => {
    await tx.adminCredential.delete({ where: { userId: targetUserId } });
    await tx.user.update({
      where: { id: targetUserId },
      data: { role: "USER" },
    });
  });
  return { ok: true };
}

export async function resetAdminPassword(
  targetUserId: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const validation = validatePassword(newPassword);
  if (!validation.ok) return validation;

  const cred = await prisma.adminCredential.findUnique({ where: { userId: targetUserId } });
  if (!cred) return { ok: false, reason: "Admin not found" };

  const newHash = await hashPassword(newPassword);
  await prisma.adminCredential.update({
    where: { userId: targetUserId },
    data: { passwordHash: newHash, passwordUpdatedAt: new Date() },
  });
  return { ok: true };
}

export async function listAdmins(): Promise<AdminSummary[]> {
  const rows = await prisma.user.findMany({
    where: { role: "ADMIN", adminCredential: { isNot: null } },
    select: {
      id: true,
      email: true,
      name: true,
      adminCredential: { select: { lastLoginAt: true, createdAt: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    userId: r.id,
    email: r.email ?? "",
    name: r.name,
    lastLoginAt: r.adminCredential?.lastLoginAt?.toISOString() ?? null,
    createdAt: r.adminCredential?.createdAt.toISOString() ?? new Date(0).toISOString(),
  }));
}
