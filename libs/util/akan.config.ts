import type { LibConfig } from "akanjs";
import { cameraPlugin } from "./plugin/camera.plugin";
import { contactsPlugin } from "./plugin/contacts.plugin";
import { locationPlugin } from "./plugin/location.plugin";
import { pushNotificationPlugin } from "./plugin/pushNotification.plugin";
import { speechPlugin } from "./plugin/speech.plugin";

const config: LibConfig = {
  plugins: [pushNotificationPlugin, cameraPlugin, contactsPlugin, locationPlugin, speechPlugin],
};

export default config;
