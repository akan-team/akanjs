import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
// React refuses act() outside a test renderer unless this global says the environment expects it.
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
