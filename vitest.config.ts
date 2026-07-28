import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Next's `server-only` guard throws outside a Server Component
      // environment; stub it so server modules (registry) are testable.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
});
