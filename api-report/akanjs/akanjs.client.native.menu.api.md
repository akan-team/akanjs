# `akanjs/client/native/menu`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface MenuApi {
    setAppMenu(args: {
        items: MenuItem[];
    }): Promise<void>;
    resetAppMenu(): Promise<void>;
    getAppMenu(): Promise<{
        items: MenuItem[];
    }>;
    popupContextMenu(args: {
        items: MenuItem[];
        x?: number;
        y?: number;
        closeAfterMs?: number;
    }): Promise<void>;
    triggerItem(args: {
        id: string;
    }): Promise<void>;
}

export interface MenuClick {
    id: string;
    source: "app" | "context";
    checked?: boolean;
}

export interface MenuEvents {
    click: MenuClick;
}

export interface MenuItem {
    id?: string;
    label?: string;
    accelerator?: string;
    enabled?: boolean;
    checked?: boolean;
    submenu?: MenuItem[];
    role?: MenuItemRole | SubmenuRole;
    type?: "separator";
}

export type MenuItemRole = "about" | "bringAllToFront" | "close" | "copy" | "cut" | "delete" | "hide" | "hideOthers" | "minimize" | "paste" | "pasteAndMatchStyle" | "quit" | "redo" | "selectAll" | "showAll" | "toggleFullScreen" | "undo" | "zoom";

export type SubmenuRole = "appMenu" | "editMenu" | "helpMenu" | "services" | "windowMenu";

export declare const menu: import("akanjs/client/native.ts").Plugin<MenuApi, MenuEvents>;

export declare function onMenuClick(handler: (click: MenuClick) => void): () => void;
```
