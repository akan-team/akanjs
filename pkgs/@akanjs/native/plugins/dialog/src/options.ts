// Argument rules of the dialog plugin. The web implementation uses these functions; the native
// implementations (ios/DialogPlugin.swift, android/DialogPlugin.kt) apply the same rules and
// use the same error messages. None of this touches the DOM, so bun test covers it.
//
// - message is required (capacitor-plugins/dialog/src/definitions.ts), but may be empty when
//   there is a title. An alert with neither is an error (react-native RCTAlertManager.mm:84-87).
// - "" for a button title means the default, not an invisible button (react-native Alert.js:145-148).
// - null counts as "not given": JSON has no undefined.
// - An action sheet may have one "cancel" option. UIAlertController throws on a second
//   .cancel action (NSInternalInconsistencyException), so every platform rejects it.

import { AkanNativeError } from "../../../packages/core/src/index.ts";
import type {
  ActionSheetOption,
  ActionSheetOptionStyle,
  ActionSheetOptions,
  AlertOptions,
  ConfirmOptions,
  PromptOptions,
} from "./index.ts";

export const OPTION_STYLES: readonly ActionSheetOptionStyle[] = ["default", "destructive", "cancel"];

/** Web defaults. The native hosts use the OS's localized OK / Cancel instead. */
export const DEFAULT_OK = "OK";
export const DEFAULT_CANCEL = "Cancel";

export interface NormalizedAlert {
  title: string;
  message: string;
  buttonTitle: string;
}

export interface NormalizedConfirm {
  title: string;
  message: string;
  okButtonTitle: string;
  cancelButtonTitle: string;
}

export interface NormalizedPrompt extends NormalizedConfirm {
  inputPlaceholder: string;
  inputText: string;
}

export interface NormalizedActionSheet {
  title: string;
  message: string;
  options: Required<ActionSheetOption>[];
}

const invalid = (method: string, message: string) => new AkanNativeError("INVALID_ARGS", `${method}: ${message}`);

function record(method: string, args: unknown): Record<string, unknown> {
  if (args === undefined || args === null) return {};
  if (typeof args !== "object" || Array.isArray(args)) throw invalid(method, "options must be an object");
  return args as Record<string, unknown>;
}

function text(method: string, args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw invalid(method, `${key} must be a string`);
  return value;
}

function label(method: string, args: Record<string, unknown>, key: string, fallback: string): string {
  return text(method, args, key) || fallback;
}

function titleAndMessage(method: string, args: Record<string, unknown>): { title: string; message: string } {
  const message = text(method, args, "message");
  if (message === undefined) throw invalid(method, "message must be a string");
  const title = text(method, args, "title") ?? "";
  if (!title && !message) throw invalid(method, "title or message must not be empty");
  return { title, message };
}

export function normalizeAlert(args: AlertOptions | undefined): NormalizedAlert {
  const a = record("alert", args);
  return { ...titleAndMessage("alert", a), buttonTitle: label("alert", a, "buttonTitle", DEFAULT_OK) };
}

export function normalizeConfirm(args: ConfirmOptions | undefined, method = "confirm"): NormalizedConfirm {
  const a = record(method, args);
  return {
    ...titleAndMessage(method, a),
    okButtonTitle: label(method, a, "okButtonTitle", DEFAULT_OK),
    cancelButtonTitle: label(method, a, "cancelButtonTitle", DEFAULT_CANCEL),
  };
}

export function normalizePrompt(args: PromptOptions | undefined): NormalizedPrompt {
  const a = record("prompt", args);
  return {
    ...normalizeConfirm(args, "prompt"),
    inputPlaceholder: text("prompt", a, "inputPlaceholder") ?? "",
    inputText: text("prompt", a, "inputText") ?? "",
  };
}

export function normalizeActionSheet(args: ActionSheetOptions | undefined): NormalizedActionSheet {
  const m = "actionSheet";
  const a = record(m, args);
  const raw = a.options;
  if (!Array.isArray(raw) || raw.length === 0) throw invalid(m, "options must be a non-empty array");
  const options = raw.map((option, i): Required<ActionSheetOption> => {
    if (typeof option !== "object" || option === null || Array.isArray(option))
      throw invalid(m, `options[${i}] must be an object`);
    const o = option as Record<string, unknown>;
    if (typeof o.title !== "string" || !o.title) throw invalid(m, `options[${i}].title must be a non-empty string`);
    const style = o.style ?? "default";
    if (!OPTION_STYLES.includes(style as ActionSheetOptionStyle))
      throw invalid(m, `options[${i}].style must be default, destructive or cancel`);
    return { title: o.title, style: style as ActionSheetOptionStyle };
  });
  if (options.filter((o) => o.style === "cancel").length > 1)
    throw invalid(m, "only one option may have the cancel style");
  return { title: text(m, a, "title") ?? "", message: text(m, a, "message") ?? "", options };
}
