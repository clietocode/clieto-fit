import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTs,
  {
    settings: {
      next: { rootDir: ["apps/web/", "services/api/"] },
    },
  },
  globalIgnores([
    "**/.next/**",
    "**/node_modules/**",
    "**/prisma/generated/**",
    "out/**",
    "coverage/**",
  ]),
]);
