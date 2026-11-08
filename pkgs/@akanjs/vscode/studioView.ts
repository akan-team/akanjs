import { randomBytes } from "node:crypto";
import { isInside } from "./coreLoader";

export interface StudioSource {
  fileName: string;
  line: number;
  column: number;
}

export interface StudioWorkflowRequest {
  workflow: string;
  inputs: Record<string, string>;
}

export interface StudioModuleTarget {
  app: string;
  module: string;
}

//? Studio is a page the dev server serves, so a request from it names a target and nothing more: the workflow is
//? allowlisted, every input it may preset is a plain identifier, and the plan still waits for a modal confirm.
const studioWorkflows = new Set([
  "create-module",
  "add-field",
  "add-enum-field",
  "add-mutation",
  "add-slice",
  "create-ui",
  "rename-key",
]);
const studioTargetInputs = new Set(["app", "module", "slice", "query"]);
const identifier = /^[A-Za-z_$][\w$-]{0,63}$/;

const attributeOf = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isPosition = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;

const relay = (origin: string) => `
const vscode = acquireVsCodeApi();
const frame = document.querySelector("iframe");
frame.addEventListener("load", () => frame.contentWindow?.postMessage({ type: "akan-studio:host" }, ${JSON.stringify(origin)}));
window.addEventListener("message", (event) => {
  if (event.origin === ${JSON.stringify(origin)} && event.source === frame.contentWindow) vscode.postMessage(event.data);
});`;

export class StudioView {
  static htmlOf(url: string, nonce = randomBytes(16).toString("base64")) {
    const { origin } = new URL(url);
    const policy = `default-src 'none'; frame-src ${origin}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${attributeOf(policy)}">
<style>html, body, iframe { margin: 0; padding: 0; width: 100%; height: 100%; border: 0; overflow: hidden; }</style>
</head>
<body>
<iframe src="${attributeOf(url)}" title="Akan Studio"></iframe>
<script nonce="${attributeOf(nonce)}">${relay(origin)}</script>
</body>
</html>`;
  }

  //? A `lib/_<service>/` folder holds module `<service>`; `lib/__scalar/` holds scalars, which have no signals.
  static moduleOf(folder: string | null) {
    if (!folder || folder === "__scalar") return null;
    return folder.replace(/^_/, "");
  }

  static isReady(message: unknown) {
    return isRecord(message) && message.type === "akan-studio:ready";
  }

  static workflowOf(message: unknown): StudioWorkflowRequest | null {
    if (!isRecord(message) || message.type !== "akan-studio:workflow") return null;
    const { workflow, inputs } = message;
    if (typeof workflow !== "string" || !studioWorkflows.has(workflow) || !isRecord(inputs)) return null;
    const entries = Object.entries(inputs);
    const isTarget = ([name, value]: [string, unknown]) =>
      studioTargetInputs.has(name) && typeof value === "string" && identifier.test(value);
    if (typeof inputs.app !== "string" || !entries.every(isTarget)) return null;
    return { workflow, inputs: Object.fromEntries(entries) as Record<string, string> };
  }

  static moduleTargetOf(message: unknown): StudioModuleTarget | null {
    if (!isRecord(message) || message.type !== "akan-studio:module" || !isRecord(message.inputs)) return null;
    const { app, module, ...rest } = message.inputs;
    if (typeof app !== "string" || typeof module !== "string" || Object.keys(rest).length) return null;
    return identifier.test(app) && identifier.test(module) ? { app, module } : null;
  }

  static inputsToAsk<Spec extends { required?: boolean }>(specs: Record<string, Spec>, given: Record<string, string>) {
    const isGiven = Object.keys(given).length > 0;
    return Object.entries(specs).filter(
      ([name, spec]) => !(name in given) && !(isGiven && !spec.required && studioTargetInputs.has(name)),
    );
  }

  static followed(message: unknown, loaded: string, frameOrigin: string): string | null {
    if (!isRecord(message) || typeof message.href !== "string" || !URL.canParse(message.href)) return null;
    const at = new URL(message.href);
    const base = new URL(loaded);
    if (at.origin !== frameOrigin || at.pathname !== base.pathname) return null;
    return new URL(`${at.pathname}${at.search}`, base.origin).toString();
  }

  static sourceOf(message: unknown, root: string): StudioSource | null {
    if (!isRecord(message) || message.type !== "akan-studio:open" || typeof message.path !== "string") return null;
    if (!isPosition(message.line) || !isPosition(message.column)) return null;
    const fileName = /^\/[A-Za-z]:\//.test(message.path) ? message.path.slice(1) : message.path;
    return isInside(root, fileName) ? { fileName, line: message.line, column: message.column } : null;
  }
}
