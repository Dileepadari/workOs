import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Tests live outside src/ so the production bundle and the test suite
    // stay cleanly separated; the tree under tests/ mirrors src/.
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Every source file counts, not only the ones a test happens to import.
      // Measuring the imported set alone flatters the number and, more to the
      // point, still reads as a pass when the suite runs nothing at all.
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/components/ui/**", "src/**/*.d.ts"],
      // Set just under the current figures. The number is low and the DEVDOC
      // says why: the pages and hooks have no tests, only lib/ does. What a
      // floor is uniquely good at is the case nothing else catches - Vitest
      // exits 0 when it collects no tests, so a suite that silently stopped
      // running reports as a pass everywhere else in the pipeline.
      thresholds: {
        statements: 8,
        branches: 8,
        functions: 7,
        lines: 8,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
