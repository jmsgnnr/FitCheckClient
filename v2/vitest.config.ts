import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // Raw CSS imports (?raw) are empty unless CSS handling is enabled; the focus-contrast test reads them.
    css: { include: [/.+/] },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
