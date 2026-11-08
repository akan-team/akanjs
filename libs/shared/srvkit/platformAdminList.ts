import { Logger } from "akanjs/common";

export class PlatformAdminList {
  static readonly env = "AKAN_PLATFORM_ADMIN_IDS";
  static readonly #logger = new Logger("PlatformAdminList");
  static #warnedEmpty = false;

  static ids() {
    const ids = new Set(
      (process.env[PlatformAdminList.env] ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    );
    if (!ids.size && !PlatformAdminList.#warnedEmpty) {
      PlatformAdminList.#warnedEmpty = true;
      PlatformAdminList.#logger.warn(
        `${PlatformAdminList.env} is empty: no console admin is a platform admin, so every platform endpoint and every repository guard's admin bypass refuses them all`,
      );
    }
    return ids;
  }

  static includes(adminId: string | null | undefined) {
    const ids = PlatformAdminList.ids();
    return !!adminId && ids.has(adminId);
  }
}
