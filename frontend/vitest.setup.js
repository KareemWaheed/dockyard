import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { toast } from 'sonner';

afterEach(() => cleanup());
// sonner keeps toasts in a module-level store outside the React tree, so they
// survive `cleanup()` and leak into the next test's render. Clear them all.
afterEach(() => toast.dismiss());

// jsdom gaps that Radix and cmdk rely on
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= ResizeObserverStub;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.setPointerCapture ??= () => {};
window.matchMedia ??= (query) => ({
  matches: false, media: query, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  dispatchEvent: () => false,
});
