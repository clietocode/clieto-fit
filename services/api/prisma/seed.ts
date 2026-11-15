import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";

async function main() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.SEED_SUPER_ADMIN_NAME?.trim();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  if (!email || !name || !password || password.length < 12) {
    throw new Error(
      "Set SEED_SUPER_ADMIN_EMAIL, SEED_SUPER_ADMIN_NAME, and a 12+ character SEED_SUPER_ADMIN_PASSWORD before seeding.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.upsert({
    where: { email },
    update: { name, passwordHash, role: "SUPER_ADMIN", status: "ACTIVE", gymId: null },
    create: { email, name, passwordHash, role: "SUPER_ADMIN" },
  });
  console.info("Super Admin account is ready.");
}

main()
  .catch((error: unknown) => {
    console.error("Could not seed the Super Admin account.", error);
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
