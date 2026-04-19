import "@testing-library/jest-dom";

// Polyfill fetch for Jest jsdom environment
import "whatwg-fetch";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof global.ResizeObserver === "undefined") {
  (global as typeof globalThis & { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver =
    ResizeObserverMock;
}
