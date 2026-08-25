import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const TEST_DB = "family_test";
const DEFAULT_ADMIN_URL = "postgresql://family:family@localhost:5432/family";

function adminUrl(): string {
  const raw = process.env.TEST_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL ?? DEFAULT_ADMIN_URL;
  const url = new URL(raw);
  url.pathname = "/family";
  return url.toString();
}

function testUrl(): string {
  const raw = process.env.DATABASE_URL ?? DEFAULT_ADMIN_URL;
  const url = new URL(raw);
  url.pathname = `/${TEST_DB}`;
  return url.toString();
}

export default async function setup() {
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl() } } });
  try {
    const rows = await admin.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ${TEST_DB}) AS exists
    `;
    if (!rows[0]?.exists) {
      await admin.$executeRawUnsafe(`CREATE DATABASE ${TEST_DB}`);
    }
  } finally {
    await admin.$disconnect();
  }

  const databaseUrl = testUrl();
  process.env.DATABASE_URL = databaseUrl;
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
