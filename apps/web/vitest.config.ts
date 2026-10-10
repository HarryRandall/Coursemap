import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const alias = {
  "@": fileURLToPath(new URL("./", import.meta.url)),
  // Next replaces this marker in server builds; tests do not run its bundler.
  "server-only": fileURLToPath(
    new URL(
      "./node_modules/next/dist/compiled/server-only/empty.js",
      import.meta.url,
    ),
  ),
};
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          // Run domain tests without a DOM; database tests have a separate project.
          environment: "node",
          include: ["tests/**/*.test.{ts,mjs}"],
          exclude: ["tests/**/*database.test.{ts,mjs}"],
          setupFiles: ["./tests/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          // DOM interactions use jsdom; layout and navigation belong in Playwright.
          environment: "jsdom",
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["./tests/setup-component.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "database",
          environment: "node",
          include: ["tests/**/*database.test.{ts,mjs}"],
          // Integration files share the local catalogue and must not mutate it concurrently.
          fileParallelism: false,
          testTimeout: 30000,
          setupFiles: ["./tests/setup.ts"],
        },
      },
    ],
  },
});
