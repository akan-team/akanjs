import { definePlugin } from "../../../packages/core/src/index.ts";
import { web } from "./web.ts";

// Native alert / confirm / prompt / action sheet (docs/plugins.md §4.2): Capacitor's dialog and
// action-sheet plugins in one. The web uses an in-page <dialog> (src/web.ts); macOS uses NSAlert
// sheets on the calling window (src/desktop.ts).
//
// Every method answers exactly once. Dismissing a dialog without a button (Escape, back button,
// tap outside) is not an error: it answers like the cancel button.

export interface AlertOptions {
  title?: string;
  /** Required; may be "" when there is a title. */
  message: string;
  /** Default: "OK" (the OS's localized OK on iOS and Android). */
  buttonTitle?: string;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  okButtonTitle?: string;
  cancelButtonTitle?: string;
}

export interface ConfirmResult {
  /** true only for the OK button. */
  value: boolean;
}

export interface PromptOptions extends ConfirmOptions {
  inputPlaceholder?: string;
  /** Text the field starts with. */
  inputText?: string;
}

export interface PromptResult {
  /** The text as typed (not trimmed). "" when cancelled. */
  value: string;
  cancelled: boolean;
}

export type ActionSheetOptionStyle = "default" | "destructive" | "cancel";

export interface ActionSheetOption {
  title: string;
  /**
   * "destructive" is shown in red. At most one option may be "cancel": it is shown apart
   * (iOS hides it on iPhone and iPad and cancels on a tap outside instead) and choosing it
   * answers `{ index: -1, cancelled: true }` like any other dismissal.
   */
  style?: ActionSheetOptionStyle;
}

export interface ActionSheetOptions {
  title?: string;
  message?: string;
  /** At least one. */
  options: ActionSheetOption[];
}

export interface ActionSheetResult {
  /** Index into `options` of the chosen option, or -1 when cancelled. */
  index: number;
  cancelled: boolean;
}

export interface DialogApi {
  alert(options: AlertOptions): Promise<void>;
  confirm(options: ConfirmOptions): Promise<ConfirmResult>;
  prompt(options: PromptOptions): Promise<PromptResult>;
  actionSheet(options: ActionSheetOptions): Promise<ActionSheetResult>;
}

export const dialog = definePlugin<DialogApi>("dialog", {
  methods: ["alert", "confirm", "prompt", "actionSheet"],
  web,
});

export interface UseDialog extends DialogApi {
  supported: boolean;
}

const methods: DialogApi = {
  alert: dialog.alert,
  confirm: dialog.confirm,
  prompt: dialog.prompt,
  actionSheet: dialog.actionSheet,
};

/** The dialog functions for components. They hold no state, so they are stable across renders. */
export function useDialog(): UseDialog {
  return { supported: dialog.isSupported("alert"), ...methods };
}
