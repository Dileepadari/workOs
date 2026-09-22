// The `/vitest` entry, not the bare package: it augments vitest's own
// `Assertion` type. The bare import augments jest's, so every
// `toBeInTheDocument` type-checked only while a separate error stopped tsc
// reaching this project at all.
import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
