import { AkanNativeError, defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { ActionSheetResult, ConfirmResult, DialogApi, PromptResult } from "./index.ts";
import { normalizeActionSheet, normalizeAlert, normalizeConfirm, normalizePrompt } from "./options.ts";

// In-page dialogs for the web and for desktop ("desktop": "web").
// - Not window.alert/confirm/prompt: the macOS WebView has no JS panels and answers at once
//   (plugins.md D7, verified: confirm → false, prompt → null). Capacitor's web dialog relies on
//   them and drops the title and button labels (capacitor-plugins/dialog/src/web.ts:13-30).
// - <dialog>.showModal(): the top layer sits above any app z-index, the rest of the page turns
//   inert, and Escape fires "cancel". Tab is kept inside the dialog as well.
// - One injected <style>, every class prefixed akan-native-dlg-, `all: unset` on the controls so app CSS
//   for button/h2/p/input does not leak in. Light/dark follows prefers-color-scheme.
// - Everything up to showModal() and focus() runs synchronously inside the caller's click, so
//   mobile browsers still open the keyboard for prompt().

const P = "akan-native-dlg";

const CSS = `
dialog.${P}{--${P}-bg:#fff;--${P}-fg:#1c1c1e;--${P}-muted:#5f5f66;--${P}-line:rgba(60,60,67,.2);--${P}-hover:rgba(120,120,128,.12);--${P}-accent:#0a62d0;--${P}-danger:#d11a2a;--${P}-field:#fff;
color-scheme:light;box-sizing:border-box;position:fixed;inset:0;margin:auto;padding:0;border:0;border-radius:14px;
width:min(300px,calc(100% - 32px));max-width:none;max-height:calc(100% - 32px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));
flex-direction:column;overflow:hidden;background:var(--${P}-bg);color:var(--${P}-fg);
font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;
box-shadow:0 10px 40px rgba(0,0,0,.25);animation:${P}-in .16s ease-out}
dialog.${P}[open]{display:flex}
dialog.${P}:focus{outline:none}
dialog.${P}::backdrop{background:rgba(0,0,0,.35)}
@media (prefers-color-scheme:dark){
dialog.${P}{--${P}-bg:#2c2c2e;--${P}-fg:#f2f2f7;--${P}-muted:#aeaeb2;--${P}-line:rgba(235,235,245,.18);--${P}-hover:rgba(235,235,245,.08);--${P}-accent:#5aa9ff;--${P}-danger:#ff6961;--${P}-field:#1c1c1e;color-scheme:dark}
dialog.${P}::backdrop{background:rgba(0,0,0,.55)}}
.${P} .${P}-body{padding:20px 16px 16px;overflow:auto}
.${P} .${P}-title,.${P} .${P}-msg,.${P} .${P}-input,.${P} .${P}-btn{all:unset;box-sizing:border-box;display:block}
.${P} .${P}-title{font-size:17px;font-weight:600;line-height:1.3;overflow-wrap:anywhere}
.${P} .${P}-msg{margin-top:4px;color:var(--${P}-muted);font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}
.${P} .${P}-title+.${P}-msg{margin-top:4px}
.${P} .${P}-msg:first-child{margin-top:0}
.${P} .${P}-input{width:100%;margin-top:14px;padding:8px 10px;border:1px solid var(--${P}-line);border-radius:8px;background:var(--${P}-field);color:inherit;font-size:16px;text-align:start;cursor:text;user-select:text;-webkit-user-select:text}
.${P} .${P}-input:focus{outline:2px solid var(--${P}-accent);outline-offset:-1px}
.${P} .${P}-input::placeholder{color:var(--${P}-muted);opacity:.8}
.${P} .${P}-actions{display:flex;flex-shrink:0;border-top:1px solid var(--${P}-line)}
.${P} .${P}-btn{flex:1 1 0;min-width:0;min-height:44px;padding:10px 8px;color:var(--${P}-accent);font-size:16px;line-height:1.3;text-align:center;cursor:pointer;overflow-wrap:anywhere;-webkit-tap-highlight-color:transparent}
.${P} .${P}-btn+.${P}-btn{border-inline-start:1px solid var(--${P}-line)}
.${P} .${P}-btn:hover,.${P} .${P}-btn:active{background:var(--${P}-hover)}
.${P} .${P}-btn:focus-visible{outline:2px solid var(--${P}-accent);outline-offset:-3px;border-radius:8px}
.${P} .${P}-primary{font-weight:600}
.${P} .${P}-danger{color:var(--${P}-danger)}
dialog.${P}.${P}-sheet{width:min(420px,100%);max-height:100%;margin:auto auto 0;gap:8px;overflow:visible;border-radius:0;background:transparent;box-shadow:none;
padding:0 max(8px,env(safe-area-inset-right,0px)) calc(8px + env(safe-area-inset-bottom,0px)) max(8px,env(safe-area-inset-left,0px));animation-name:${P}-up}
.${P}-sheet .${P}-group{display:flex;flex-direction:column;min-height:0;overflow:auto;border-radius:14px;background:var(--${P}-bg);box-shadow:0 4px 24px rgba(0,0,0,.18)}
.${P}-sheet .${P}-group:last-child{flex-shrink:0}
.${P}-sheet .${P}-head{padding:14px 16px;border-bottom:1px solid var(--${P}-line)}
.${P}-sheet .${P}-title{font-size:13px;color:var(--${P}-muted)}
.${P}-sheet .${P}-msg{font-size:13px}
.${P}-sheet .${P}-btn{flex:none;min-height:52px;padding:14px 16px;font-size:17px}
.${P}-sheet .${P}-btn+.${P}-btn{border-inline-start:0;border-top:1px solid var(--${P}-line)}
@media (min-width:640px){dialog.${P}.${P}-sheet{width:340px;margin:auto;padding:0;animation-name:${P}-in}}
@keyframes ${P}-in{from{opacity:0;transform:scale(.96)}}
@keyframes ${P}-up{from{opacity:0;transform:translateY(24px)}}
@media (prefers-reduced-motion:reduce){dialog.${P}{animation:none}}
`;

let sheet: CSSStyleSheet | null = null;

/**
 * A constructed stylesheet: a strict CSP (style-src without 'unsafe-inline', SEC-4) blocks a
 * <style> element added at runtime, but not adoptedStyleSheets. The <style> fallback is for
 * engines without constructable stylesheets.
 */
function injectStyle(): void {
  if (sheet || document.getElementById(`${P}-style`)) return;
  if (typeof CSSStyleSheet === "function" && "adoptedStyleSheets" in document) {
    try {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      return;
    } catch {
      sheet = null;
    }
  }
  const style = document.createElement("style");
  style.id = `${P}-style`;
  style.textContent = CSS;
  (document.head ?? document.documentElement).append(style);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

interface Action<T> {
  label: string;
  /** Gets the prompt's text ("" without a field). */
  result: (text: string) => T;
  className?: string;
}

interface Spec<T> {
  /** Action sheet: options stacked at the bottom (centered on wide screens), cancel apart. */
  sheet?: boolean;
  title: string;
  message: string;
  input?: { placeholder: string; text: string };
  actions: Action<T>[];
  /** The sheet's cancel option, in a group of its own (iOS style). */
  cancelAction?: Action<T>;
  /** The answer for Escape, and for a tap outside when `outsideDismisses`. */
  dismissed: T;
  /** Only action sheets close on a tap outside, as on iOS and Android; alerts never do on iOS. */
  outsideDismisses?: boolean;
  /** Index into `actions` of the button that gets focus and answers Enter. */
  primary?: number;
}

let seq = 0;

function show<T>(spec: Spec<T>): Promise<T> {
  if (typeof document === "undefined") throw new AkanNativeError("UNSUPPORTED", "dialogs need a document");
  const dialog = el("dialog", spec.sheet ? `${P} ${P}-sheet` : P);
  if (typeof dialog.showModal !== "function")
    throw new AkanNativeError("UNSUPPORTED", "<dialog> is not supported by this browser");
  injectStyle();
  const id = `${P}-${++seq}`;
  dialog.tabIndex = -1;
  dialog.setAttribute("role", spec.sheet ? "dialog" : "alertdialog");

  const head = el("div", spec.sheet ? `${P}-head` : `${P}-body`);
  if (spec.title) head.append(Object.assign(el("h2", `${P}-title`, spec.title), { id: `${id}-t` }));
  if (spec.message) head.append(Object.assign(el("p", `${P}-msg`, spec.message), { id: `${id}-m` }));
  // Accessible name: the title, else the message (an alertdialog must have one).
  if (spec.title) dialog.setAttribute("aria-labelledby", `${id}-t`);
  if (spec.message) dialog.setAttribute(spec.title ? "aria-describedby" : "aria-labelledby", `${id}-m`);

  let input: HTMLInputElement | undefined;
  if (spec.input) {
    input = el("input", `${P}-input`);
    input.type = "text";
    input.placeholder = spec.input.placeholder;
    input.value = spec.input.text;
    input.enterKeyHint = "done";
    input.setAttribute("aria-labelledby", spec.message ? `${id}-m` : `${id}-t`);
    head.append(input);
  }

  let finish: (value: T) => void = () => {};
  const button = (action: Action<T>, extra = "") => {
    const node = el("button", `${P}-btn ${action.className ?? ""} ${extra}`.trim(), action.label);
    node.type = "button";
    node.addEventListener("click", () => finish(action.result(input?.value ?? "")));
    return node;
  };
  const buttons = spec.actions.map((action, i) => button(action, i === spec.primary ? `${P}-primary` : ""));

  if (spec.sheet) {
    const group = el("div", `${P}-group`);
    if (spec.title || spec.message) group.append(head);
    group.append(...buttons);
    dialog.append(group);
    if (spec.cancelAction) {
      const cancel = el("div", `${P}-group`);
      cancel.append(button(spec.cancelAction, `${P}-primary`));
      dialog.append(cancel);
    }
  } else {
    const actions = el("div", `${P}-actions`);
    actions.append(...buttons);
    dialog.append(head, actions);
  }

  const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>("button, input"));
  dialog.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return; // IME composition (Korean, Japanese): Enter/Escape belong to it
    if (e.key === "Tab") {
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    } else if (spec.sheet && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      const items = focusables();
      if (items.length === 0) return;
      e.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = e.key === "ArrowDown" ? (at + 1) % items.length : (at <= 0 ? items.length : at) - 1;
      items[next]?.focus();
    } else if (e.key === "Enter" && e.target === input && spec.primary !== undefined) {
      e.preventDefault();
      buttons[spec.primary]?.click();
    }
  });
  // Escape. Chrome may skip "cancel" (close-watcher abuse rules) and just close: "close" covers that.
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    finish(spec.dismissed);
  });
  dialog.addEventListener("close", () => finish(spec.dismissed));
  if (spec.outsideDismisses) {
    // A press that starts and ends on the dialog box itself (backdrop, or the gaps between the
    // sheet's cards). Checking both ends ignores drags that start on a button.
    let downOutside = false;
    dialog.addEventListener("pointerdown", (e) => (downOutside = e.target === dialog));
    dialog.addEventListener("click", (e) => {
      if (downOutside && e.target === dialog) finish(spec.dismissed);
      downOutside = false;
    });
  }

  return new Promise<T>((resolve) => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let settled = false;
    finish = (value) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      if (previous?.isConnected && document.activeElement !== previous) previous.focus({ preventScroll: true });
      resolve(value);
    };
    (document.body ?? document.documentElement).append(dialog);
    dialog.showModal();
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length); // caret at the end, as on iOS and Android
    } else if (spec.primary !== undefined) {
      buttons[spec.primary]?.focus();
    } else {
      dialog.focus(); // action sheet: no focus ring until the user tabs or presses an arrow key
    }
  });
}

export const web = defineWebPlugin<DialogApi>({
  methods: {
    alert(args) {
      const o = normalizeAlert(args);
      return show<void>({
        title: o.title,
        message: o.message,
        actions: [{ label: o.buttonTitle, result: () => {} }],
        dismissed: undefined,
        primary: 0,
      });
    },
    confirm(args) {
      const o = normalizeConfirm(args);
      return show<ConfirmResult>({
        title: o.title,
        message: o.message,
        actions: [
          { label: o.cancelButtonTitle, result: () => ({ value: false }) },
          { label: o.okButtonTitle, result: () => ({ value: true }) },
        ],
        dismissed: { value: false },
        primary: 1,
      });
    },
    prompt(args) {
      const o = normalizePrompt(args);
      const cancelled: PromptResult = { value: "", cancelled: true };
      return show<PromptResult>({
        title: o.title,
        message: o.message,
        input: { placeholder: o.inputPlaceholder, text: o.inputText },
        actions: [
          { label: o.cancelButtonTitle, result: () => cancelled },
          { label: o.okButtonTitle, result: (value) => ({ value, cancelled: false }) },
        ],
        dismissed: cancelled,
        primary: 1,
      });
    },
    actionSheet(args) {
      const o = normalizeActionSheet(args);
      const cancelled = (): ActionSheetResult => ({ index: -1, cancelled: true });
      const cancelIndex = o.options.findIndex((option) => option.style === "cancel");
      const cancelOption = o.options[cancelIndex];
      return show<ActionSheetResult>({
        sheet: true,
        title: o.title,
        message: o.message,
        actions: o.options.flatMap((option, index) =>
          option.style === "cancel"
            ? []
            : [
                {
                  label: option.title,
                  result: () => ({ index, cancelled: false }),
                  className: option.style === "destructive" ? `${P}-danger` : "",
                },
              ],
        ),
        cancelAction: cancelOption && { label: cancelOption.title, result: cancelled },
        dismissed: cancelled(),
        outsideDismisses: true,
      });
    },
  },
});
