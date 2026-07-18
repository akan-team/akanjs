import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return `import { internal, endpoint } from "akanjs/signal";

import * as srv from "../srv";

// ===== noti.signal.ts =====
// Convention: <module>.signal.ts for a pure service module.
// Extends endpoint(srv.<module>, ...) — pubsub endpoint for real-time server→client communication.
// pubsub() is the Akan.js convention for publish-subscribe: server publishes, all connected clients receive.
// Client subscribes via fetch.subscribeSend((data) => { ... }).
// Registered by akan sync into sig.ts barrel.

export class NotiInternal extends internal(srv.noti, () => ({})) {}

export class NotiEndpoint extends endpoint(srv.noti, () => ({})) {}

// ---- Expandable additional fields: ----
//   history: query(NotiHistory)
//     .param("userId", String)
//     .exec(async function (userId) {
//       return await this.notiService.getHistory(userId);
//     }),
`;
}
