import type { LibConfig } from "akanjs";
import { pushNotificationPlugin } from "./plugin/pushNotification.plugin";

const config: LibConfig = {
  plugins: [pushNotificationPlugin],
};

export default config;
