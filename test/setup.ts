import "@testing-library/jest-dom/vitest";

if (typeof window !== "undefined") {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    configurable: true,
    value: ResizeObserverMock,
  });

  Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
    writable: true,
    configurable: true,
    value: () => {},
  });

  Object.defineProperty(window.HTMLElement.prototype, "hasPointerCapture", {
    writable: true,
    configurable: true,
    value: () => false,
  });

  Object.defineProperty(window.HTMLElement.prototype, "releasePointerCapture", {
    writable: true,
    configurable: true,
    value: () => {},
  });
}
