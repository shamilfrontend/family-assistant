import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../.env") });
config();

const { createApp } = await import("./app.js");
const { prisma } = await import("./lib/prisma.js");

const app = createApp();
const port = Number(process.env.PORT ?? 3000);

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on ${port}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
