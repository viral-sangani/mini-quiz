import { config } from "./config.js";
import { prisma } from "./db.js";

// Idempotent admin seeding. Promotes every email in ADMIN_EMAILS to role=ADMIN
// (upserting a user record if one doesn't exist yet). Safe to run on every
// backend boot or as a one-off `pnpm db:seed`.
async function main() {
  if (config.ADMIN_EMAILS.length === 0) {
    console.log("No ADMIN_EMAILS configured — skipping admin seed");
    return;
  }
  for (const email of config.ADMIN_EMAILS) {
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, role: "ADMIN" },
      update: { role: "ADMIN" },
    });
    console.log(`admin: ${user.email} (${user.id})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
