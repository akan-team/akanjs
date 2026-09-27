import { definePlugin } from "../../../packages/core/src/index.ts";

/**
 * Desktop menus: the app menu bar and context menus (plugins.md §5).
 *
 * - macOS: the menu bar holds only submenus, and the first one is the app menu (macOS titles it
 *   with the app's name). Until setAppMenu is called the app has the default menu: App, Edit and
 *   Window (D1). Keep an Edit menu (role "editMenu" or its items): without it Cmd+C/V/X/A do
 *   nothing in the page.
 * - Windows and Linux: a menu bar in every window, from the same item tree (the bar holds only
 *   submenus there too, so one tree fits every OS). No menu bar until setAppMenu, and
 *   getAppMenu() is [] then: the webview handles Ctrl+C/V itself. CmdOrCtrl is Ctrl; Cmd is the
 *   Windows (Super) key, which Windows menus show but cannot fire.
 *   Roles: appMenu is a "File" menu with About and Exit (Windows) or Quit (Linux); editMenu,
 *   windowMenu (Minimize, Maximize, Full Screen, Close) and helpMenu (only with items) are the
 *   usual menus. about shows a small About box, quit asks the app to quit as Cmd+Q does, the
 *   window roles act on the menu's window. The editing roles run the page's command; their keys
 *   stay with the page (shown next to the item, not taken from text fields). hide, hideOthers,
 *   showAll, bringAllToFront and services are macOS only and left out.
 *   Context menus open at the page position or the mouse; on Linux (GTK) a Wayland session may
 *   refuse a menu opened without a recent click.
 * - Web, iOS and Android: UNSUPPORTED.
 *
 * Clicks arrive as `click` events: app menu clicks at the most recently focused window that
 * listens, context menu clicks at the window that opened the menu.
 */

/** Standard items. Their action goes to the focused page or window and macOS enables them itself. */
export type MenuItemRole =
  | "about"
  | "hide"
  | "hideOthers"
  | "showAll"
  | "quit"
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "pasteAndMatchStyle"
  | "delete"
  | "selectAll"
  | "minimize"
  | "zoom"
  | "close"
  | "toggleFullScreen"
  | "bringAllToFront";

/**
 * Standard submenus. appMenu, editMenu and windowMenu bring their usual items unless `submenu`
 * lists others; windowMenu also gets the window list, helpMenu the help search field and
 * services the Services items from macOS.
 */
export type SubmenuRole = "appMenu" | "editMenu" | "windowMenu" | "helpMenu" | "services";

export interface MenuItem {
  /** Reported by `click`. Required for items you handle (not for roles, separators or submenus). */
  id?: string;
  label?: string;
  /** e.g. "CmdOrCtrl+Shift+K" (CmdOrCtrl is Command on macOS). */
  accelerator?: string;
  /** Default true. */
  enabled?: boolean;
  /** Makes a check item; it toggles itself when chosen and `click` reports the new state. */
  checked?: boolean;
  submenu?: MenuItem[];
  role?: MenuItemRole | SubmenuRole;
  type?: "separator";
}

export interface MenuClick {
  id: string;
  source: "app" | "context";
  /** Check items: the state after the click. */
  checked?: boolean;
}

export interface MenuApi {
  /** Replaces the app menu. */
  setAppMenu(args: { items: MenuItem[] }): Promise<void>;
  /** Back to the default menu (App, Edit, Window). */
  resetAppMenu(): Promise<void>;
  /** The current app menu in setAppMenu's shape (roles come back as roles). */
  getAppMenu(): Promise<{ items: MenuItem[] }>;
  /**
   * Opens a context menu in the calling window at a page position (CSS px), or at the mouse.
   * Resolves when the menu closes; a chosen item has sent its `click` by then.
   * `closeAfterMs` closes it unchosen, for automated tests.
   */
  popupContextMenu(args: { items: MenuItem[]; x?: number; y?: number; closeAfterMs?: number }): Promise<void>;
  /** Acts as if the user chose an app menu item (automated tests, where nobody can click). */
  triggerItem(args: { id: string }): Promise<void>;
}

export interface MenuEvents {
  click: MenuClick;
}

export const menu = definePlugin<MenuApi, MenuEvents>("menu", {
  methods: ["setAppMenu", "resetAppMenu", "getAppMenu", "popupContextMenu", "triggerItem"],
  events: ["click"],
});

/** Menu clicks (app menu and context menus). Returns an unsubscribe function. */
export function onMenuClick(handler: (click: MenuClick) => void): () => void {
  return menu.listen("click", handler);
}
