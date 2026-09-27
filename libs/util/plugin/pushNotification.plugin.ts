import type { AkanPlugin, AkanSyncContext } from "akanjs";
import {
  createFirebaseMessagingServiceWorker,
  generatedServiceWorkerBanner,
  normalizeFirebaseClientConfig,
} from "./firebaseMessagingSw";

const SW_REL_PATH = "public/firebase-messaging-sw.js";

//* firebase config 가 env.client 에 있으면 public/firebase-messaging-sw.js 를 생성한다.
//* env.client 파생이라 gitignore 되고 env 별로 재생성된다.
//* 워커 본문은 이 라이브러리가 고치면 바뀌므로, 이미 있는 파일도 배너가 붙어 있으면 갱신한다.
//* 배너를 지운 파일은 앱이 소유를 선언한 것이라 손대지 않는다.
const syncFirebaseMessagingSw = async (ctx: AkanSyncContext) => {
  const env = await ctx.readEnvClient();
  if (!env) return;
  const firebaseConfig = normalizeFirebaseClientConfig(env.firebase);
  if (!firebaseConfig) return;
  const nextBody = createFirebaseMessagingServiceWorker(firebaseConfig);
  if (await ctx.fileExists(SW_REL_PATH)) {
    const currentBody = await ctx.readFile(SW_REL_PATH);
    if (!currentBody.startsWith(generatedServiceWorkerBanner) || currentBody === nextBody) return;
  }
  await ctx.writeFile(SW_REL_PATH, nextBody, { overwrite: true });
};

export const pushNotificationPlugin: AkanPlugin = {
  name: "push-notification",
  //? The native push plugin adds aps-environment and UIBackgroundModes itself, following the signing profile.
  native: { permission: "push", plugins: ["push"] },
  syncAssets: syncFirebaseMessagingSw,
};
