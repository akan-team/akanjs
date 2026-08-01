import type { AkanNativeContext, AkanPlugin, AkanSyncContext } from "akanjs";
import { createFirebaseMessagingServiceWorker, normalizeFirebaseClientConfig } from "./firebaseMessagingSw";

const SW_REL_PATH = "public/firebase-messaging-sw.js";

//* firebase config 가 env.client 에 있으면 public/firebase-messaging-sw.js 를 1회 생성한다(있으면 스킵).
//* env.client 파생이라 gitignore 되고 env 별로 재생성된다.
const syncFirebaseMessagingSw = async (ctx: AkanSyncContext) => {
  if (await ctx.fileExists(SW_REL_PATH)) return;
  const env = await ctx.readEnvClient();
  if (!env) return;
  const firebaseConfig = normalizeFirebaseClientConfig(env.firebase);
  if (!firebaseConfig) return;
  await ctx.writeFile(SW_REL_PATH, createFirebaseMessagingServiceWorker(firebaseConfig), { overwrite: false });
};

//* iOS AppDelegate 에 Firebase 초기화 및 APNs 토큰 브리지 코드를 주입한다.
const injectFirebaseIntoAppDelegate = (source: string): string => {
  let content = source;
  if (!content.includes("import FirebaseCore")) {
    content = content.replace("import Capacitor", "import Capacitor\nimport FirebaseCore");
  }
  if (!content.includes("import FirebaseMessaging")) {
    content = content.replace("import FirebaseCore", "import FirebaseCore\nimport FirebaseMessaging");
  }
  if (!content.includes("FirebaseApp.configure()")) {
    content = content.replace(/\n(\s*)return true/, "\n$1FirebaseApp.configure()\n\n$1return true");
  }
  if (!content.includes("didRegisterForRemoteNotificationsWithDeviceToken")) {
    const delegateMethods = `
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: deviceToken
        )
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }
`;
    content = content.replace(
      "\n    func applicationWillResignActive",
      `${delegateMethods}\n    func applicationWillResignActive`,
    );
  }
  return content;
};

const configurePushNative = async (ctx: AkanNativeContext) => {
  await ctx.setIosUsageDescriptions({
    userNotificationsUsageDescription: "$(PRODUCT_NAME) uses notifications to keep you updated.",
  });
  await ctx.updateIosInfoPlist({ UIBackgroundModes: ["remote-notification"] });
  ctx.addIosEntitlements({ "aps-environment": ctx.operation === "release" ? "production" : "development" });
  await ctx.editIosAppDelegate(injectFirebaseIntoAppDelegate);
  ctx.addAndroidPermissions(["POST_NOTIFICATIONS"]);
};

export const pushNotificationPlugin: AkanPlugin = {
  name: "push-notification",
  // firebase is only needed when a mobile target actually requests push.
  runtimePackages: (ctx) => (ctx.hasMobilePermission("push") ? ["firebase", "@capacitor-community/fcm"] : []),
  capacitor: {
    permission: "push",
    configureNative: configurePushNative,
  },
  syncAssets: syncFirebaseMessagingSw,
};
