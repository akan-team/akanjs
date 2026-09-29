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

Route depth

Path segments after the language and basePath: `/chat` is 1, `/chat/[chatId]` is 2.

Safe area

Space the device itself covers, such as the notch, the status bar and the home indicator.

Inset

Space the app reserves for its own bars, such as a navbar on top or a composer below.

A layer that rides on top of the software keyboard and moves with it.

/csr/stack_en.mp4

Pushes a page over the current one. Use it for drill-down screens such as detail, edit or settings.

/csr/bottomup_en.mp4

Opens a focused screen from the bottom that drags down to close. Use it for modal-like flows such as compose, picker or camera.

/csr/fade_en.mp4

Switches context without suggesting a deeper level.

/csr/scale_en.mp4

A small scale motion. It is the Android default for deeper routes.

Web · Root

Drag to go back

Slides in from the right.

Rises from the bottom.

No drag

Scales up slightly into place.

Cross-fades between pages.

Swaps instantly with no animation.

Drag to the right, starting anywhere on the page.

Goes back past a third of the screen width, or on a quick flick even if it travelled less.

Hides the keyboard only once the touch is read as a drag.

Drag down, starting near the top of the screen.

Closes past half the screen width; a shorter drag snaps back.

Hides the keyboard as soon as the drag starts.

Top safe area the page reserved, in px.

Bottom safe area the page reserved, in px.

The resolved `topInset`, in px.

The resolved `bottomInset`, in px.

Top safe area plus top inset: the top padding a page body needs.

Bottom safe area plus bottom inset: the bottom padding a page body needs.

The native runtime's keyboard plugin reported the exact height as the keyboard began to open.

How much the visible viewport shrank; Android prefers it, elsewhere it fills in for the plugin.

Neither reported a height, so it is 0: the keyboard is closed or could not be measured.

The route has at least one `keyboardSticky` slot; when `false`, the keyboard layer is hidden.

A page transition is running, so the offset is held at 0 to keep out of its way.

A height is present and `frozen` is not set; branch on this, not on the height alone.

The WebView frame stays still while Akan applies the keyboard offset, so the composer rides the keyboard instead of jumping above it.

Page Transitions

Your app runs inside a native shell, yet every screen change lands like a web page swap. The user cannot tell whether they went deeper or sideways, and the back button is the only way out.

Words used on this page

Term

Set the transition

A detail page that slides in over its list:

What each one looks like

Platform defaults

Transition

Default here

Only when written

The iOS and Android columns are routes at depth 2 or more. The last column covers the web at any depth and every platform at depth 1 or less.

The Back Gesture

How the value is decided

The two drags

The Frame Config

iOS stack · Android scaleOut · none on web and at depth ≤ 1

The animation played when this route is entered.

true on iOS at depth ≥ 2, else false

Drag to go back, attached only by the `stack` and `bottomUp` transitions.

Space reserved for a top bar in px; `true` means 48px, `false` or unset means 0.

Space reserved for a bottom bar, in px, with the same 48px meaning for `true`.

iOS true · Android { android: "auto" } · web false

Device insets to reserve; `"top"` or `"bottom"` keeps one side only.

How Android measures the safe area; `none` reserves nothing.

true at depth ≤ 1, else false

Keeps one page for the route, mounted in a hidden cache layer after you navigate away; its effects stop until it is shown again.

the background color

CSS color painted behind the top safe-area strip.

CSS color painted behind the bottom safe-area strip.

The frame as CSS variables

The resolved numbers are published as CSS custom properties, so a component can reserve the same space as the page without any JavaScript:

Variable

The Keyboard Inset

A chat input, a comment box, a support composer: anything pinned to the bottom must move with the software keyboard. Every platform reports the keyboard differently.

A chat page with all three steps:

Where the keyboard height comes from

Akan reads the height from one of three sources, and the source decides how accurate the offset is:

Source

Keyboard state

Field

Anchoring The Content

A helper that scrolls the page it sits in to the bottom once:

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

