# UI & Keyboard

- Source: /cheatsheet/mobile/ui
- Mirror: /llms/pages/cheatsheet/mobile/ui.md
- Section: cheatsheet
- Category: Mobile
- Priority: P2

## Headings

- Page Transitions (#page-transitions)
- The Back Gesture (#gesture-back)
- The Frame Config (#frame-config)
- The Keyboard Inset (#keyboard-inset)
- Anchoring The Content (#content-anchor)

## Content

UI & Keyboard

Page Transitions

Your app runs inside a native shell, yet every screen change lands like a web page swap. The user cannot tell whether they went deeper or sideways, and the back button is the only way out.

Give the page a `transition` in `.config()`. The mobile app shell then animates the change the way a native app does.

Words used on this page

Term

- Route depth: Path segments after the language and basePath: `/chat` is 1, `/chat/[chatId]` is 2.

- Safe area: Space the device itself covers, such as the notch, the status bar and the home indicator.

- Inset: Space the app reserves for its own bars, such as a navbar on top or a composer below.

- keyboard accessory layer: A layer that rides on top of the software keyboard and moves with it.

Set the transition

A detail page that slides in over its list:

**Five values.** `stack`, `bottomUp`, `fade`, `scaleOut` and `none`.

**The value also picks the drag.** Only `stack` and `bottomUp` come with a real back gesture.

What each one looks like

- stack — /csr/stack_en.mp4 — Pushes a page over the current one. Use it for drill-down screens such as detail, edit or settings.

- bottomUp — /csr/bottomup_en.mp4 — Opens a focused screen from the bottom that drags down to close. Use it for modal-like flows such as compose, picker or camera.

- fade — /csr/fade_en.mp4 — Switches context without suggesting a deeper level.

- scaleOut — /csr/scale_en.mp4 — A small scale motion. It is the Android default for deeper routes.

Platform defaults

Leave `transition` out and the platform and route depth pick one for you:

Transition

iOS — depth ≥ 2

Android — depth ≥ 2

Web · Root

- Drag to go back

  - stack: Slides in from the right.

  - bottomUp: Rises from the bottom.

- No drag

  - scaleOut: Scales up slightly into place.

  - fade: Cross-fades between pages.

  - none: Swaps instantly with no animation.

Default here

Only when written

The iOS and Android columns are routes at depth 2 or more. The last column covers the web at any depth and every platform at depth 1 or less.

The Back Gesture

Leave `gesture` to the platform default unless the page has a reason not to. iOS turns it on below the root; Android and the web leave it off, as their users expect.

How the value is decided

**Written wins.** A `gesture` written anywhere in the layout chain is used as-is.

**No animation, no drag.** Left unwritten, a page whose `transition` is `none` gets `false`, because there is nothing for the drag to move.

**Otherwise the platform decides.** `true` on iOS at route depth 2 or more, `false` everywhere else.

The two drags

- stack

  - Drag to the right, starting anywhere on the page.

  - Goes back past a third of the screen width, or on a quick flick even if it travelled less.

  - Hides the keyboard only once the touch is read as a drag.

- bottomUp

  - Drag down, starting near the top of the screen.

  - Closes past half the screen width; a shorter drag snaps back.

  - Hides the keyboard as soon as the drag starts.

**Intent before movement.** A `stack` touch stays pending until it travels 8px, then locks to drag or scroll by whichever axis moved clearly more (1.25×).

**Scrolling costs nothing.** While the touch is pending, nothing closes and the keyboard stays up.

**`gesture: true` does nothing on a `fade`, `scaleOut` or `none` page.** Those transitions attach no drag handler at all.

The Frame Config

One `.config()` object sets the whole page frame: animation, gesture, reserved space and caching. Write it on a layout and every route under it inherits it.

- transition ("none" | "fade" | "bottomUp" | "stack" | "scaleOut", default iOS stack · Android scaleOut · none on web and at depth ≤ 1): The animation played when this route is entered.

- gesture (boolean, default true on iOS at depth ≥ 2, else false): Drag to go back, attached only by the `stack` and `bottomUp` transitions.

- topInset (number | boolean, default 0): Space reserved for a top bar in px; `true` means 48px, `false` or unset means 0.

- bottomInset (number | boolean, default 0): Space reserved for a bottom bar, in px, with the same 48px meaning for `true`.

- safeArea (boolean | "top" | "bottom" | { top?, bottom?, android? }, default iOS true · Android { android: "auto" } · web false): Device insets to reserve; `"top"` or `"bottom"` keeps one side only.

- safeArea.android ("auto" | "edge-to-edge" | "none", default "auto"): How Android measures the safe area; `none` reserves nothing.

- cache (boolean, default true at depth ≤ 1, else false): Keeps one page for the route, mounted in a hidden cache layer after you navigate away; its effects stop until it is shown again.

- topSafeAreaColor (string, default the background color): CSS color painted behind the top safe-area strip.

- bottomSafeAreaColor (string, default the background color): CSS color painted behind the bottom safe-area strip.

**The closest config wins.** A page's value overrides its layouts', while a `safeArea` object merges key by key.

**Top-level routes stay still.** At depth 1 or less every platform defaults to `none`, no gesture and `cache: true`, so tabs switch instantly.

**A page nobody sees runs no effects.** A cached page, and the page a transition-less switch left, keep their state and DOM but stop their effects until shown again. The page under a `stack` transition stays live for a swipe back, so bind a camera, a poll or a key handler with `usePageFocusEffect` from `akanjs/webkit`; `usePageActivity()` says whether the page is `current`, `prev`, `pending` or `hidden`. Only the current page offers its tools and state to the in-page agent.

**Every history entry is a page of its own.** A push to the route you are on mounts a new page over the old one, which waits under it with its state; a replace within one route updates the page in place. Below the page a swipe back reveals, three more entries stay mounted and hidden, and older ones are released — they mount again on back, with their scroll restored. A `cache` route stays one page for the whole session.

**The stack outlives a reload.** After a reload — or a WebView whose content process died and reloaded — the current page and the one under it come back, the rest of the stack waits until you go back to it, and back walks it as before. While the app is in the background, the page under the current one pauses too.

**On Android, back is the page's only while it has somewhere to go.** At the index with nothing under it, the system takes back and shows its own back-to-home animation, and the app stays warm instead of quitting. On Android 14+ a back swipe moves the page with the finger before it commits. When the system runs low on memory, on either platform, the hidden pages are released and mount again when visited.

The frame as CSS variables

The resolved numbers are published as CSS custom properties, so a component can reserve the same space as the page without any JavaScript:

Variable

- --akan-top-safe-area: Top safe area the page reserved, in px.

- --akan-bottom-safe-area: Bottom safe area the page reserved, in px.

- --akan-top-inset: The resolved `topInset`, in px.

- --akan-bottom-inset: The resolved `bottomInset`, in px.

- --akan-page-padding-top: Top safe area plus top inset: the top padding a page body needs.

- --akan-page-padding-bottom: Bottom safe area plus bottom inset: the bottom padding a page body needs.

Tailwind reads them directly: `h-(--akan-bottom-inset)` sizes a bar to exactly the space the page reserved.

The Keyboard Inset

A chat input, a comment box, a support composer: anything pinned to the bottom must move with the software keyboard. Every platform reports the keyboard differently.

**Reserve the bar's space** with `bottomInset` in `.config()`.

**Wrap the composer** in `Layout.BottomInset` marked `keyboardSticky`. Akan moves it into the keyboard accessory layer for you.

**Keep the messages in place** with `contentAnchor="bottom"`, covered in the next section.

A chat page with all three steps:

**The declared height wins.** With `bottomInset` in `.config()`, `BottomInset` uses that height; without it, it measures its own content.

**Match the bar to the reservation** with `h-(--akan-bottom-inset)`, so the bar and the reserved space never disagree.

Where the keyboard height comes from

Akan reads the height from one of three sources, and the source decides how accurate the offset is:

Source

- native: The native runtime's keyboard plugin reported the exact height as the keyboard began to open.

- visualViewport: How much the visible viewport shrank; Android prefers it, elsewhere it fills in for the plugin.

- fallback: Neither reported a height, so it is 0: the keyboard is closed or could not be measured.

Keyboard state

In the mobile app shell, `useCsr().frameLayout.keyboard` carries three flags next to the height:

Field

- sticky: The route has at least one `keyboardSticky` slot; when `false`, the keyboard layer is hidden.

- frozen: A page transition is running, so the offset is held at 0 to keep out of its way.

- visible: A height is present and `frozen` is not set; branch on this, not on the height alone.

Anchoring The Content

Moving the composer is half the job; the messages above it must stay where they were. That is `contentAnchor="bottom"`: it keeps the scroll position's distance from the bottom while the viewport resizes, the way a messenger does.

- Android — /android_keyboard_sticky.mp4 — The WebView frame stays still while Akan applies the keyboard offset, so the composer rides the keyboard instead of jumping above it.

- iOS — /ios_keyboard_sticky.mp4 — The `BottomInset` follows the native keyboard animation, and the messages keep their distance from the composer.

The composer inside the `BottomInset` is an ordinary Zone with a store-driven field:

**`keyboardSticky`** moves the `BottomInset` into the keyboard accessory layer so it follows the keyboard.

**`contentAnchor="bottom"`** keeps the bottom distance while the viewport resizes. `bottom` is the only value, and it works only together with `keyboardSticky`.

**The page stays a server component.** To start the chat scrolled to the bottom, add a tiny client helper inside the page or Zone that targets the Akan page content container.

A helper that scrolls the page it sits in to the bottom once:

**Search upward, not across the document.** During a transition several pages stay mounted, each with `.akan-page-content`, so `document.querySelector` can pick the wrong one; `closest()` finds this page's.

**Drop it anywhere in the page.** `<ScrollToBottomOnMount />` renders a hidden marker and nothing else.

**`contentAnchor` is a `BottomInset` option, not a `.config()` option.** Ordinary forms keep the default keyboard behaviour; only messenger-style screens opt in, locally.

## Code Examples

### apps/myapp/page/article/[articleId].tsx

```ts
import { Article, fetch } from "@apps/myapp/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("articleId", ID)
  .config({ transition: "stack" })
  .render(({ articleId }) => {
    const { articleView } = fetch.viewArticle(articleId);
    return <Article.Zone.View view={articleView} />;
  });
```

### apps/myapp/page/chat/_index.tsx

```ts
import { ChatMessage } from "@apps/myapp/client";
import { page } from "akanjs/client";
import { Layout } from "akanjs/ui";

export default page()
  .config({
    topInset: true,
    bottomInset: 72,
    safeArea: true,
    transition: "stack",
  })
  .render(() => (
    <div>
      <div>{/* scrollable content */}</div>
      <Layout.BottomInset
        className="h-(--akan-bottom-inset)"
        keyboardSticky
        contentAnchor="bottom"
      >
        <ChatMessage.Zone.Composer />
      </Layout.BottomInset>
    </div>
  ));
```

### apps/myapp/lib/chatMessage/ChatMessage.Zone.tsx

```ts
"use client";
import { st, usePage } from "@apps/myapp/client";
import { Field } from "akanjs/ui";

interface ComposerProps {
  className?: string;
}
export const Composer = ({ className }: ComposerProps) => {
  const { l } = usePage();
  const chatMessageForm = st.use.chatMessageForm();
  return (
    <Field.Text
      className={className}
      label={l("chatMessage.content")}
      value={chatMessageForm.content}
      onChange={st.do.setContentOnChatMessage}
    />
  );
};
```

### apps/myapp/ui/Chat/ScrollToBottomOnMount.tsx

```ts
"use client";
import { useLayoutEffect, useRef } from "react";

export const ScrollToBottomOnMount = () => {
  const markerRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const pageContent = markerRef.current?.closest(".akan-page-content");
    pageContent?.scrollTo({ top: pageContent.scrollHeight });
  }, []);
  return <span ref={markerRef} hidden />;
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

