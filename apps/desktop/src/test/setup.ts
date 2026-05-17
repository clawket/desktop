import "@testing-library/jest-dom/vitest";

// jsdom does not implement window.matchMedia. The theme hook depends on it
// to resolve the "system" preference, so provide a deterministic stub
// (defaults to light) for all tests.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom does not implement EventSource and the real fetch would try to hit
// 127.0.0.1:19400. Provide a sane default so any test that mounts <App />
// (which auto-wires <DataProvider>) gets empty-but-successful list responses
// rather than a network/EventSource crash. Individual tests can still spy on
// or override `globalThis.fetch` per case.
if (!("EventSource" in globalThis)) {
  class NoopEventSource {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    readyState = 0;
    url = "";
    withCredentials = false;
    addEventListener() {}
    removeEventListener() {}
    close() {}
  }
  (globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
    NoopEventSource as unknown as typeof EventSource;
}

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.startsWith("http://127.0.0.1:19400")) {
    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (originalFetch) return originalFetch(input, init);
  return new Response("", { status: 404 });
}) as typeof fetch;
