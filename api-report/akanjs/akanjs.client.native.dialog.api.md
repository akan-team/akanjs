# `akanjs/client/native/dialog`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface ActionSheetOption {
    title: string;
    style?: ActionSheetOptionStyle;
}

export type ActionSheetOptionStyle = "cancel" | "default" | "destructive";

export interface ActionSheetOptions {
    title?: string;
    message?: string;
    options: ActionSheetOption[];
}

export interface ActionSheetResult {
    index: number;
    cancelled: boolean;
}

export interface AlertOptions {
    title?: string;
    message: string;
    buttonTitle?: string;
}

export interface ConfirmOptions {
    title?: string;
    message: string;
    okButtonTitle?: string;
    cancelButtonTitle?: string;
}

export interface ConfirmResult {
    value: boolean;
}

export interface DialogApi {
    alert(options: AlertOptions): Promise<void>;
    confirm(options: ConfirmOptions): Promise<ConfirmResult>;
    prompt(options: PromptOptions): Promise<PromptResult>;
    actionSheet(options: ActionSheetOptions): Promise<ActionSheetResult>;
}

export interface PromptOptions extends ConfirmOptions {
    inputPlaceholder?: string;
    inputText?: string;
}

export interface PromptResult {
    value: string;
    cancelled: boolean;
}

export interface UseDialog extends DialogApi {
    supported: boolean;
}

export declare const dialog: import("akanjs/client/native.ts").Plugin<DialogApi, Record<never, never>>;

export declare function useDialog(): UseDialog;
```
