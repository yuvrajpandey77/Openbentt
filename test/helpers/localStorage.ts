/** In-memory localStorage for projectStore integration tests in Node. */

export function installLocalStorageMock(): { store: Map<string, string>; restore: () => void } {
  const store = new Map<string, string>();
  const previous = globalThis.localStorage;

  const mock = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: mock,
    configurable: true,
    writable: true,
  });

  return {
    store,
    restore: () => {
      if (previous === undefined) {
        Reflect.deleteProperty(globalThis, "localStorage");
      } else {
        Object.defineProperty(globalThis, "localStorage", {
          value: previous,
          configurable: true,
          writable: true,
        });
      }
    },
  };
}
