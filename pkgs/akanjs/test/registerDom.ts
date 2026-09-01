import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Per-file, never a bunfig preload: most akanjs tests assert server behavior and branch on `typeof window`,
// so a global DOM would change what they test. `bun test --isolate` keeps each registration to its own process.
if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
