# `akanjs/client/native/tray`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface TrayApi {
    create(args: TrayOptions): Promise<TrayInfo>;
    update(args: TrayOptions & {
        id: string;
    }): Promise<TrayInfo>;
    setIcon(args: {
        id: string;
        icon: null | string;
        iconAsTemplate?: boolean;
    }): Promise<TrayInfo>;
    setTitle(args: {
        id: string;
        title: string;
    }): Promise<TrayInfo>;
    setTooltip(args: {
        id: string;
        tooltip: null | string;
    }): Promise<TrayInfo>;
    setMenu(args: {
        id: string;
        menu: TrayMenuItem[] | null;
        menuOnLeftClick?: boolean;
    }): Promise<TrayInfo>;
    remove(args: {
        id: string;
    }): Promise<void>;
    list(): Promise<TrayInfo[]>;
    trigger(args: {
        id: string;
        button?: "left" | "right";
    }): Promise<void>;
}

export interface TrayEvents {
    click: {
        id: string;
        button: "left" | "right";
    };
    menuClick: {
        id: string;
        item: string;
    };
}

export interface TrayHandle {
    readonly id: string;
    setIcon(icon: null | string, iconAsTemplate?: boolean): Promise<TrayInfo>;
    setTitle(title: string): Promise<TrayInfo>;
    setTooltip(tooltip: null | string): Promise<TrayInfo>;
    setMenu(menu: TrayMenuItem[] | null): Promise<TrayInfo>;
    onClick(handler: (button: "left" | "right") => void): () => void;
    onMenuClick(handler: (item: string) => void): () => void;
    remove(): Promise<void>;
}

export interface TrayInfo {
    id: string;
    title: string;
    tooltip: null | string;
    icon: boolean;
    iconAsTemplate: boolean;
    menu: boolean;
    menuOnLeftClick: boolean;
}

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
    id?: string;
    icon?: null | string;
    iconAsTemplate?: boolean;
    title?: string;
    tooltip?: null | string;
    menu?: TrayMenuItem[] | null;
    menuOnLeftClick?: boolean;
}

export declare function createTray(options: TrayOptions): Promise<TrayHandle>;

export declare const tray: import("akanjs/client/native.ts").Plugin<TrayApi, TrayEvents>;
```
