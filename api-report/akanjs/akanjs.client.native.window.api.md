# `akanjs/client/native/window`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface CreateWindowOptions {
    path?: string;
    title?: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    frameless?: boolean;
}

export interface DragDropEvent {
    type: "drop" | "enter" | "leave" | "over";
    paths?: string[];
    position?: {
        x: number;
        y: number;
    };
    files?: (FileRef & {
        path: string;
        name: string;
    })[];
}

export interface PlaceOnDisplayOptions {
    display?: number;
    index?: number;
    bounds?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    unit?: "logical" | "physical";
    fullscreen?: boolean;
}

export interface WindowApi {
    getState(args?: On): Promise<WindowState>;
    setTitle(args: {
        title: string;
    } & On): Promise<WindowState>;
    setSize(args: {
        width: number;
        height: number;
    } & On): Promise<WindowState>;
    setPosition(args: {
        x: number;
        y: number;
    } & On): Promise<WindowState>;
    center(args?: On): Promise<WindowState>;
    minimize(args?: On): Promise<WindowState>;
    maximize(args?: On): Promise<WindowState>;
    unmaximize(args?: On): Promise<WindowState>;
    restore(args?: On): Promise<WindowState>;
    setFullscreen(args: {
        value: boolean;
    } & On): Promise<WindowState>;
    setAlwaysOnTop(args: {
        value: boolean;
    } & On): Promise<WindowState>;
    setDecorations(args: {
        value: boolean;
    } & On): Promise<WindowState>;
    setCursorVisible(args: {
        value: boolean;
    } & On): Promise<WindowState>;
    setMinSize(args: {
        width?: number;
        height?: number;
    } & On): Promise<WindowState>;
    placeOnDisplay(args: PlaceOnDisplayOptions & On): Promise<WindowState>;
    show(args?: On): Promise<WindowState>;
    hide(args?: On): Promise<WindowState>;
    focus(args?: On): Promise<WindowState>;
    close(args?: On): Promise<void>;
    startDragging(args?: On): Promise<void>;
    toggleMaximize(args?: On): Promise<WindowState>;
    create(args?: CreateWindowOptions): Promise<WindowInfo>;
    list(): Promise<WindowInfo[]>;
    answerCloseRequested(args: {
        id: number;
        allow?: boolean;
    }): Promise<void>;
}

export interface WindowEvents {
    resize: {
        width: number;
        height: number;
    };
    move: {
        x: number;
        y: number;
    };
    focus: {
        focused: boolean;
    };
    closeRequested: {
        id: number;
    };
    created: {
        id: number;
    };
    destroyed: {
        id: number;
    };
    dragDrop: DragDropEvent;
}

export interface WindowHandle {
    readonly id: number;
    readonly isCurrent: boolean;
    getState(): Promise<WindowState>;
    setTitle(title: string): Promise<WindowState>;
    setSize(width: number, height: number): Promise<WindowState>;
    setPosition(x: number, y: number): Promise<WindowState>;
    center(): Promise<WindowState>;
    minimize(): Promise<WindowState>;
    maximize(): Promise<WindowState>;
    unmaximize(): Promise<WindowState>;
    restore(): Promise<WindowState>;
    toggleMaximize(): Promise<WindowState>;
    setFullscreen(value: boolean): Promise<WindowState>;
    setAlwaysOnTop(value: boolean): Promise<WindowState>;
    setDecorations(value: boolean): Promise<WindowState>;
    setCursorVisible(value: boolean): Promise<WindowState>;
    setMinSize(width?: number, height?: number): Promise<WindowState>;
    placeOnDisplay(options: PlaceOnDisplayOptions): Promise<WindowState>;
    show(): Promise<WindowState>;
    hide(): Promise<WindowState>;
    focus(): Promise<WindowState>;
    close(): Promise<void>;
    onDestroyed(fn: () => void): () => void;
}

export interface WindowInfo extends WindowState {
    id: number;
}

export interface WindowState {
    x: number;
    y: number;
    width: number;
    height: number;
    maximized: boolean;
    minimized: boolean;
    fullscreen: boolean;
    focused: boolean;
    visible: boolean;
    title: string;
}

export declare const appWindow: import("akanjs/client/native.ts").Plugin<WindowApi, WindowEvents>;

export declare function createWindow(options?: CreateWindowOptions): Promise<WindowHandle>;

export declare const currentWindowId: number;

export declare function getAllWindows(): Promise<WindowHandle[]>;

export declare function getCurrentWindow(): WindowHandle;

export declare function isDragRegion(path: EventTarget[]): boolean;

export declare const onCloseRequested: (handler: VetoHandler<Record<never, never>>) => () => void;

export declare function onDragDrop(handler: (event: DragDropEvent) => void): () => void;

export declare function useCloseRequested(handler: VetoHandler<Record<never, never>>): void;

export declare function useWindowState(): WindowState | null;

export declare function windowHandle(id: number): WindowHandle;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface FileRef {
    url: string;
    mime: string;
    size: number;
}

type On = {
    window?: number;
};

interface VetoEvent {
    preventDefault(): void;
    readonly defaultPrevented: boolean;
}

type VetoHandler<E> = (event: E & VetoEvent) => Promise<void> | void;
```
