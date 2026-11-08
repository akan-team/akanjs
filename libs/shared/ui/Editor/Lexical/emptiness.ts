"use client";
import { createElement } from "react";

import type { EditorPlugin } from "./plugin";
import { EmptinessPlugin, type EmptinessPluginProps } from "./plugins/EmptinessPlugin";

/**
 * Says whether the field holds any text as each keystroke lands. The host's own copy of the document comes from a
 * debounced `onChange` that also skips the first keystroke into an empty field, so a send button lit from it lags.
 *
 * `"use client"` is load-bearing for the same reason as `focus.ts` — see the note there.
 */
export const emptinessEditorPlugin = ({ onEmptyChange }: EmptinessPluginProps): EditorPlugin => ({
  render: () => createElement(EmptinessPlugin, { onEmptyChange }),
});
