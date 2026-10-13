import type { AkanFrameCssVarName, AkanFrameCssVars } from "../ui/System/Common";

/** Copies the current page's frame onto `<html>`, so a layer portalled to `<body>` (the agent launcher) can read it. */
export class FrameRootVars {
  static #mirrored = new Set<string>();

  static mirror(vars: AkanFrameCssVars, responsive: boolean) {
    const root = document.documentElement;
    const names = Object.keys(vars).filter((name) => name.startsWith("--akan-"));
    for (const name of FrameRootVars.#mirrored) if (!names.includes(name)) root.style.removeProperty(name);
    for (const name of names) root.style.setProperty(name, String(vars[name as AkanFrameCssVarName]));
    FrameRootVars.#mirrored = new Set(names);
    root.toggleAttribute("data-akan-frame-responsive", responsive);
  }
}
