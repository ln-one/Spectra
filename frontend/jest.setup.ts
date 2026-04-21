import "@testing-library/jest-dom";
import { deserialize, serialize } from "node:v8";

// Polyfill fetch for Jest jsdom environment
import "whatwg-fetch";

class ResizeObserverMock {
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    const rect = target.getBoundingClientRect();
    const width = rect.width || Number((target as HTMLElement).style.width?.replace("px", "")) || 0;
    const height =
      rect.height || Number((target as HTMLElement).style.height?.replace("px", "")) || 0;

    this.callback(
      [
        {
          target,
          contentRect: {
            x: rect.x || 0,
            y: rect.y || 0,
            top: rect.top || 0,
            left: rect.left || 0,
            bottom: rect.bottom || height,
            right: rect.right || width,
            width,
            height,
            toJSON: () => ({}),
          } as DOMRectReadOnly,
          borderBoxSize: [{ inlineSize: width, blockSize: height }] as ResizeObserverSize[],
          contentBoxSize: [{ inlineSize: width, blockSize: height }] as ResizeObserverSize[],
          devicePixelContentBoxSize: [{ inlineSize: width, blockSize: height }] as ResizeObserverSize[],
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver
    );
  }

  unobserve() {}
  disconnect() {}
}

class DOMMatrixReadOnlyMock {
  m22: number;

  constructor(transform?: string) {
    const match = transform?.match(/matrix\(([^)]+)\)/);
    const parts = match?.[1]?.split(",").map((value) => Number(value.trim())) ?? [];
    this.m22 = Number.isFinite(parts[3]) ? parts[3] : 1;
  }
}

if (typeof global.ResizeObserver === "undefined") {
  (global as typeof globalThis & { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver =
    ResizeObserverMock;
}

if (typeof global.structuredClone === "undefined") {
  (global as typeof globalThis).structuredClone = <T>(value: T): T =>
    deserialize(serialize(value)) as T;
}

if (typeof global.DOMMatrixReadOnly === "undefined") {
  (global as typeof globalThis & { DOMMatrixReadOnly?: typeof DOMMatrixReadOnly })
    .DOMMatrixReadOnly = DOMMatrixReadOnlyMock as unknown as typeof DOMMatrixReadOnly;
}

if (typeof global.requestAnimationFrame === "undefined") {
  (global as typeof globalThis).requestAnimationFrame = (callback: FrameRequestCallback) =>
    setTimeout(() => callback(Date.now()), 0) as unknown as number;
}

if (typeof global.cancelAnimationFrame === "undefined") {
  (global as typeof globalThis).cancelAnimationFrame = (handle: number) =>
    clearTimeout(handle);
}
