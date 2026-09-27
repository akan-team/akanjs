// Desktop: the OS's alerts on the calling window, from the shell (shell op `alert.show`;
// plugins.md Q-P6): NSAlert sheets on macOS (native/desktop/src/panels.rs), TaskDialogs on Windows
// (a dialog of its own with a text field for prompt; win/dialogs.rs), GtkMessageDialogs on Linux
// (linux/dialogs.rs). Same argument rules as the other platforms (options.ts).
// - The first button is the default (Return); a "cancel" button also answers Escape.
// - An action sheet is an alert with one button per option; the cancel option goes last. Without a
//   cancel option the user has to pick one (an alert has no "tap outside").
// - An alert belongs to its call: cancelled (AbortSignal) or with its page gone, it is dismissed.
import { type DesktopContext, defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import type { ActionSheetResult, DialogApi } from "./index.ts";
import { normalizeActionSheet, normalizeAlert, normalizeConfirm, normalizePrompt } from "./options.ts";

interface Button {
  title: string;
  style?: "default" | "cancel" | "destructive";
}

interface Answer {
  /** Index of the button that ended the sheet; -1 when none did. */
  button: number;
  text?: string;
}

/**
 * Shows the alert under a tag of its own; when the call's signal fires (the page gave up on it, or
 * the page is gone) the shell takes it off the screen (`alert.dismiss`).
 */
const show = async (
  ctx: DesktopContext,
  args: { title: string; message: string; buttons: Button[]; input?: { text: string; placeholder: string } },
) => {
  const tag = crypto.randomUUID();
  const dismiss = () =>
    void ctx
      .shell("alert.dismiss", { tag })
      .catch((error: unknown) => console.warn("[akan-native] dialog: alert.dismiss failed", error));
  ctx.signal?.addEventListener("abort", dismiss, { once: true });
  try {
    return (await ctx.shell("alert.show", { ...args, tag })) as Answer;
  } finally {
    ctx.signal?.removeEventListener("abort", dismiss);
  }
};

export default defineDesktopPlugin<DialogApi>({
  id: "dialog",
  methods: {
    async alert(args, ctx) {
      const a = normalizeAlert(args);
      await show(ctx, { title: a.title, message: a.message, buttons: [{ title: a.buttonTitle }] });
    },
    async confirm(args, ctx) {
      const c = normalizeConfirm(args);
      const { button } = await show(ctx, {
        title: c.title,
        message: c.message,
        buttons: [{ title: c.okButtonTitle }, { title: c.cancelButtonTitle, style: "cancel" }],
      });
      return { value: button === 0 };
    },
    async prompt(args, ctx) {
      const p = normalizePrompt(args);
      const { button, text } = await show(ctx, {
        title: p.title,
        message: p.message,
        buttons: [{ title: p.okButtonTitle }, { title: p.cancelButtonTitle, style: "cancel" }],
        input: { text: p.inputText, placeholder: p.inputPlaceholder },
      });
      return button === 0 ? { value: text ?? "", cancelled: false } : { value: "", cancelled: true };
    },
    async actionSheet(args, ctx): Promise<ActionSheetResult> {
      const a = normalizeActionSheet(args);
      const order = a.options
        .map((_, i) => i)
        .sort((x, y) => Number(a.options[x]!.style === "cancel") - Number(a.options[y]!.style === "cancel"));
      const { button } = await show(ctx, {
        title: a.title,
        message: a.message,
        buttons: order.map((i) => ({ title: a.options[i]!.title, style: a.options[i]!.style })),
      });
      const index = order[button];
      if (index === undefined || a.options[index]!.style === "cancel") return { index: -1, cancelled: true };
      return { index, cancelled: false };
    },
  },
});
