"use client";
import { createElement } from "react";

import type { EditorPlugin } from "./plugin";
import { SubmitPlugin, type SubmitPluginProps } from "./plugins/SubmitPlugin";

/**
 * Turns "⌘↩ sends this field" — or, with `submitKey: "enter"`, "↩ sends it" — into an editor `plugins` entry.
 *
 * A composer that submits from the keyboard cannot clear itself through the `value` prop — see
 * `SubmitPlugin` for why — so the behaviour and the clearing arrive together, as one plugin.
 *
 * `"use client"` is load-bearing here for the same reason as `focus.ts` — see the note there.
 */
export const submitEditorPlugin = ({ onSubmit, onReady, submitKey }: SubmitPluginProps): EditorPlugin => ({
  render: () => createElement(SubmitPlugin, { onSubmit, onReady, submitKey }),
});
