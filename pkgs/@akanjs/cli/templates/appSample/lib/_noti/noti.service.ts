import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return `import { serve } from "akanjs/service";

// ===== noti.service.ts =====
// Convention: <module>.service.ts for a pure service module.
// Extends serve("noti" as const, ...) — named service (string literal), no DB model binding.
// DB modules use serve(db.<module>, ...); service modules use serve("<name>" as const, ...).
// DI deps available: { service, use, signal, plug, env, memory }.
// Registered by akan sync into srv.ts barrel.

export class NotiService extends serve("noti" as const, () => ({})) {}

// ---- Expandable additional fields: ----
// export class NotiService extends serve("noti" as const, ({ plug, env, service }) => ({
//   pushApi: plug(PushApi),
//   fcmKey: env((options) => options.fcmKey),
//   taskService: service<srv.TaskService>(),
// })) {
//   async sendPush(userId: string, title: string, body: string) {
//     const token = await this.getDeviceToken(userId);
//     return this.pushApi.send({ token, title, body });
//   }
// }
`;
}
