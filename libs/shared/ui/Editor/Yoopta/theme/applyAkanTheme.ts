import type { SlateElement, YooptaPlugin } from "@yoopta/editor";

import { akanElements } from "./blocks";

type AnyPlugin = YooptaPlugin<Record<string, SlateElement>>;

/**
 * In-app replacement for @yoopta/themes-shadcn's `applyTheme`.
 *
 * Re-skins each plugin with our own render components (styled via the app's
 * Tailwind/daisyUI) by calling `plugin.extend({ elements })`. Unlike the shadcn
 * theme, it injects no global CSS, so it cannot clobber the app's layered
 * Tailwind utilities. Plugin types without a mapping keep their default render.
 */
export const applyAkanTheme = (plugins: AnyPlugin[]): AnyPlugin[] =>
  plugins.map((plugin) => {
    const typed = plugin as unknown as {
      getPlugin: { type: string };
      extend: (config: { elements: unknown }) => AnyPlugin;
    };
    const elements = akanElements[typed.getPlugin.type];
    return elements ? typed.extend({ elements }) : plugin;
  });
