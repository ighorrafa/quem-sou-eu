import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // Os testes de integração compartilham um Postgres embutido por arquivo.
    fileParallelism: false,
  },
});
