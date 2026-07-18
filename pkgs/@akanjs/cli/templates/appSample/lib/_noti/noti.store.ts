import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return `import type { Dayjs } from "akanjs/base";
import { store } from "akanjs/store";

// ===== noti.store.ts =====
// Convention: <module>.store.ts for a pure service module.
// Extends store("noti" as const, ...) — named store (string literal), no signal binding.
// DB modules use store(sig.<module>, ...); service modules use store("<name>" as const, ...).
// State definitions use direct property assignment. Actions use this.set() / this.get().
// Registered by akan sync into st.ts barrel.

export class NotiStore extends store("noti" as const, () => ({
  notiList: [] as { id: string; type: string; message: string; sentAt: Dayjs }[],
  unreadCount: 0,
})) {
  addNoti(noti: { type: string; message: string; sentAt: Dayjs }) {
    const id = Math.random().toString(36).slice(2);
    this.set({
      notiList: [...(this.get().notiList ?? []), { ...noti, id }],
      unreadCount: (this.get().unreadCount ?? 0) + 1,
    });
  }
  markAllRead() {
    this.set({ unreadCount: 0 });
  }
  removeNoti(id: string) {
    this.set({
      notiList: (this.get().notiList ?? []).filter((n) => n.id !== id),
    });
  }
}
`;
}
