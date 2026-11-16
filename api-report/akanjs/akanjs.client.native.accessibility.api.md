# `akanjs/client/native/accessibility`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface AccessibilityApi {
    getState(): Promise<AccessibilityState>;
    announce(options: {
        text: string;
        priority?: AnnouncePriority;
    }): Promise<void>;
}

export interface AccessibilityEvents {
    change: AccessibilityState;
}

export interface AccessibilityState {
    screenReader: boolean | null;
    reduceMotion: boolean;
    fontScale: number;
}

export type AnnouncePriority = "assertive" | "polite";

export declare const accessibility: import("akanjs/client/native.ts").Plugin<AccessibilityApi, AccessibilityEvents>;

export declare function checkAnnounce(options: unknown): {
    text: string;
    priority: AnnouncePriority;
};

export declare function useAccessibility(): AccessibilityState;
```
