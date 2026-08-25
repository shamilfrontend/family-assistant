import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
    globalSetup: "./tests/global-setup.ts",
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgresql://family:family@localhost:5432/family_test",
      COOKIE_SECURE: "false",
      APP_ORIGIN: "http://localhost",
    },
  },
});
