// Idempotent admin bootstrap. If INITIAL_ADMIN_EMAIL + INITIAL_ADMIN_PASSWORD
// are set in env and no AdminCredential exists for that email yet, create it.
//
// Used as a Kubernetes Job (deploy/charts/api/templates/seed-admin-job.yaml)
// during the first deploy. Once the cluster has at least one admin, you can
// drop these env vars from the Sealed Secret — the script will no-op forever
// after.
//
// To run locally:
//   INITIAL_ADMIN_EMAIL=you@example.com INITIAL_ADMIN_PASSWORD='strong-password-1' \
//     pnpm --filter @mini-quiz/api tsx src/seed-admin.ts

import { config } from "./config.js";
import { prisma } from "./db.js";
import { createAdmin } from "./services/admin-auth.service.js";

async function main() {
  const email = config.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = config.INITIAL_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("seed-admin: INITIAL_ADMIN_EMAIL or INITIAL_ADMIN_PASSWORD unset — skipping");
    return;
  }

  // Already provisioned?
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, adminCredential: { select: { userId: true } } },
  });
  if (existing?.adminCredential) {
    console.log(`seed-admin: ${email} already has a credential — skipping`);
    return;
  }

  const result = await createAdmin(email, password, null);
  if (!result.ok) {
    console.error(`seed-admin: failed to create admin: ${result.reason}`);
    process.exit(1);
  }
  console.log(`seed-admin: created admin ${email} (userId=${result.userId})`);
}

main()
  .catch((e) => {
    console.error("seed-admin: unhandled error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
