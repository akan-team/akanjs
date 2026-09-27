import { definePlugin } from "../../../packages/core/src/index.ts";

/**
 * Tray icons: macOS menu bar extras, Windows notification area icons, Linux status notifier items
 * (plugins.md §5).
 *
 * - `click` fires for every left and right click. If the tray has a menu, a right click then
 *   opens it, and so does a left click unless `menuOnLeftClick` is false (as in Tauri).
 * - Menu items send `menuClick` with their id. Roles such as "quit" work as in the app menu.
 * - Icons are PNG files: a path in the app's public/ folder ("/tray.png") or a FileRef URL
 *   ("/__akan_native/file/…"). They are drawn 18 pt high; `iconAsTemplate` makes macOS tint them for
 *   light and dark menu bars (draw them black on transparent).
 * - A tray belongs to the app, not to a page: it stays when the page reloads, and `create` with
 *   the same id updates it instead of adding another.
 * - Windows: `click` and menus as on macOS. There is no title next to the icon: `title` is the
 *   tooltip while `tooltip` is not set. Icons are drawn at the small-icon size.
 * - Linux: a StatusNotifierItem over D-Bus, which KDE, GNOME with the AppIndicator extension and
 *   most panels show (plain GNOME shows none: the tray exists, unseen). `click` "left" when the
 *   panel activates the icon, "right" for its context menu when the tray has no menu or opens it
 *   on the right button only; the panel draws the menu itself. `title` is the item's name.
 * - `iconAsTemplate` only matters on macOS. Without an icon, Windows and Linux show the generic
 *   application icon.
 * - Web, iOS and Android: UNSUPPORTED.
 */

/** Same shape as @akanjs/native/plugins/menu items. */
export interface TrayMenuItem {
  id?: string;
  label?: string;
  accelerator?: string;
  enabled?: boolean;
  checked?: boolean;
  submenu?: TrayMenuItem[];
  role?: string;
  type?: "separator";
}

export interface TrayOptions {
  /** Default: a new id ("tray-1", …). */
  id?: string;
  icon?: string | null;
  iconAsTemplate?: boolean;
  title?: string;
  tooltip?: string | null;
  menu?: TrayMenuItem[] | null;
  /** Default true. */
  menuOnLeftClick?: boolean;
}

export interface TrayInfo {
  id: string;
  title: string;
  tooltip: string | null;
  icon: boolean;
  iconAsTemplate: boolean;
  menu: boolean;
  menuOnLeftClick: boolean;
}

export interface TrayApi {
  /** Adds a tray (it needs an icon or a title), or updates the tray with this id. */
  create(args: TrayOptions): Promise<TrayInfo>;
  /** Changes the given fields only. */
  update(args: TrayOptions & { id: string }): Promise<TrayInfo>;
  setIcon(args: { id: string; icon: string | null; iconAsTemplate?: boolean }): Promise<TrayInfo>;
  setTitle(args: { id: string; title: string }): Promise<TrayInfo>;
  setTooltip(args: { id: string; tooltip: string | null }): Promise<TrayInfo>;
  setMenu(args: { id: string; menu: TrayMenuItem[] | null; menuOnLeftClick?: boolean }): Promise<TrayInfo>;
  remove(args: { id: string }): Promise<void>;
  list(): Promise<TrayInfo[]>;
  /** Sends a `click` as if the user clicked (automated tests). Does not open the menu. */
  trigger(args: { id: string; button?: "left" | "right" }): Promise<void>;
}

export interface TrayEvents {
  click: { id: string; button: "left" | "right" };
  menuClick: { id: string; item: string };
}

export const tray = definePlugin<TrayApi, TrayEvents>("tray", {
  methods: ["create", "update", "setIcon", "setTitle", "setTooltip", "setMenu", "remove", "list", "trigger"],
  events: ["click", "menuClick"],
});

export interface TrayHandle {
  readonly id: string;
  setIcon(icon: string | null, iconAsTemplate?: boolean): Promise<TrayInfo>;
  setTitle(title: string): Promise<TrayInfo>;
  setTooltip(tooltip: string | null): Promise<TrayInfo>;
  setMenu(menu: TrayMenuItem[] | null): Promise<TrayInfo>;
  /** Clicks on this tray. Returns an unsubscribe function. */
  onClick(handler: (button: "left" | "right") => void): () => void;
  /** Menu choices of this tray. Returns an unsubscribe function. */
  onMenuClick(handler: (item: string) => void): () => void;
  remove(): Promise<void>;
}

/** Creates (or updates) a tray and returns a handle to it. */
export async function createTray(options: TrayOptions): Promise<TrayHandle> {
  const { id } = await tray.create(options);
  return {
    id,
    setIcon: (icon, iconAsTemplate) => tray.setIcon({ id, icon, iconAsTemplate }),
    setTitle: (title) => tray.setTitle({ id, title }),
    setTooltip: (tooltip) => tray.setTooltip({ id, tooltip }),
    setMenu: (menu) => tray.setMenu({ id, menu }),
    onClick: (handler) => tray.listen("click", (e) => e.id === id && handler(e.button)),
    onMenuClick: (handler) => tray.listen("menuClick", (e) => e.id === id && handler(e.item)),
    remove: () => tray.remove({ id }),
  };
}
