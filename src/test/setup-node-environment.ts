// Pixi's browser adapter reads navigator during module evaluation. Node 22+
// exposes it, but the supported Node 20 CI runtime does not. Keep unit tests
// deterministic across both runtimes without changing production behavior.
if (typeof globalThis.navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      platform: 'node',
      userAgent: 'node.js',
    },
  });
}
