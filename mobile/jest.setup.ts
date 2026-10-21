/** The device's secure storage, in memory: tests read what the code wrote (expo-secure-store has no Jest mock). */
jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    __store: store,
  };
});

/* Screens sit in SafeAreaView; the library's own mock gives them a frame without a native view. */
jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);

/* Icons are drawings without text: an empty component each (the package ships ESM only, which Jest does not run). */
jest.mock("lucide-react-native", () => new Proxy({ __esModule: true }, { get: (target, name) => (name === "__esModule" ? true : () => null) }));
