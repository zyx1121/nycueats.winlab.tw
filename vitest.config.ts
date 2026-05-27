import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "lib/**/*.ts",
        "app/**/actions.ts",
        "app/api/**/route.ts",
        "app/auth/**/route.ts",
        "proxy.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "lib/supabase/**",
        "types/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
