import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseDir = resolve(root, "tmp/pg");
mkdirSync(databaseDir, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "family",
  password: "family",
  port: Number(process.env.PG_PORT ?? 5432),
  persistent: true,
});

if (!existsSync(resolve(databaseDir, "PG_VERSION"))) {
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase("family");
} catch {
  // already exists
}

console.log("embedded postgres ready");

function stop() {
  pg.stop().finally(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
