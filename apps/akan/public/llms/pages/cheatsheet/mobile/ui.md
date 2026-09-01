# UI & Keyboard

- Source: /cheatsheet/mobile/ui
- Mirror: /llms/pages/cheatsheet/mobile/ui.md
- Section: cheatsheet
- Category: Mobile
- Priority: P2

## Headings

- Gesture & Page Transitions (#gesture-transitions)
- Keyboard Accessory Layout (#keyboard-accessory)

## Content

UI & Keyboard

Gesture & Page Transitions

Mobile pages can opt into native-feeling CSR transitions with pageConfig.transition. Stack pages support the iOS-style back swipe by default on iOS, while Android defaults to a scale-out transition and disables edge gestures unless a page opts in.

/csr/stack_en.mp4

Pushes a detail page over the current page. Use it for drill-down navigation such as detail, edit, or settings pages.

/csr/bottomup_en.mp4

Opens a focused surface from the bottom. Use it for compose, picker, camera, or modal-like flows.

/csr/fade_en.mp4

Changes context without implying a deeper navigation stack.

/csr/scale_en.mp4

Uses a compact scale motion. This is the default Android-style transition for deeper routes.

Controls edge-swipe navigation for page transitions. Leave it to the platform default unless the page needs to explicitly enable or disable gesture handling.

Supported values are "none", "fade", "bottomUp", "stack", and "scaleOut".

Akan delays keyboard dismissal until a gesture is confirmed, so normal content scrolling does not immediately close the keyboard.

Keyboard Accessory Layout

Use a keyboard-sticky BottomInset for bottom composers such as chat inputs, comment boxes, or live support inputs. The inset follows the native keyboard, while contentAnchor="bottom" keeps the scrollable page content aligned to the inset as the keyboard opens and closes.

Keyboard off

Keyboard on

Scroll behavior

Android / iOS demo

These recordings show keyboardSticky moving the BottomInset with the native keyboard and contentAnchor="bottom" keeping the scroll content aligned to the composer.

The WebView keeps a stable frame while Akan applies the keyboard offset, so the composer stays attached to the keyboard instead of jumping above it.

The BottomInset follows the native keyboard transition and the scroll content preserves its bottom distance from the composer.

Use this when a bottom composer must remain visually attached to the software keyboard.

It is useful for chat, comments, support, and other bottom-input workflows.

contentAnchor="bottom" is opt-in on BottomInset, so normal pages keep their existing keyboard behavior.

Moves the BottomInset into the keyboard accessory layer so it follows the software keyboard.

Preserves the scroll container's bottom distance while the content viewport resizes. This matches messenger-style composers where messages reflow with the keyboard.

Keep the page as a server component. If the app needs an initial scroll-to-bottom behavior, add a tiny client helper inside the page or Zone and target the Akan page content container.

contentAnchor is intentionally a BottomInset option, not a pageConfig option. General forms can keep the default keyboard behavior, while messenger-style surfaces opt in locally.

## Code Examples

### Page transition

```ts
import type { PageConfig } from "akanjs/client";

export const pageConfig = {
  transition: "stack",
  gesture: true,
} satisfies PageConfig;
```

### Bottom composer

```ts
import type { PageConfig } from "akanjs/client";
import { Layout } from "akanjs/ui";

export default function Page() {
  return (
    <div>
      <div>{/* scrollable content */}</div>
      <Layout.BottomInset
        keyboardSticky
        contentAnchor="bottom"
      >
        <input placeholder="Type message..." />
      </Layout.BottomInset>
    </div>
  );
}

export const pageConfig = {
  topInset: 48,
  bottomInset: 72,
  safeArea: true,
  transition: "stack",
} satisfies PageConfig;
```

### Optional client helper

```ts
"use client";

import { useLayoutEffect } from "react";

export function ScrollToBottomOnMount() {
  useLayoutEffect(() => {
    const pageContent = document.getElementById("pageContent");
    pageContent?.scrollTo({ top: pageContent.scrollHeight });
  }, []);

  return null;
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

