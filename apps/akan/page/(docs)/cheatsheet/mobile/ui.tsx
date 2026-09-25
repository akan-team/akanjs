import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide
        id="gesture-transitions"
        title={l.trans({ en: "Gesture & Page Transitions", ko: "Gesture & Page Transitions" })}
      >
        <Docs.Title>{l.trans({ en: "Gesture & Page Transitions", ko: "Gesture & Page Transitions" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Mobile pages can opt into native-feeling CSR transitions with pageConfig.transition. Stack pages support the iOS-style back swipe by default on iOS, while Android defaults to a scale-out transition and disables edge gestures unless a page opts in.",
              ko: "모바일 페이지는 pageConfig.transition으로 네이티브 앱에 가까운 CSR 전환을 선택할 수 있습니다. stack 페이지는 iOS에서 기본적으로 뒤로 가기 swipe gesture를 지원하고, Android는 기본적으로 scale-out 전환을 사용하며 edge gesture는 페이지가 opt-in하지 않는 한 꺼집니다.",
            })}
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                title: "stack",
                src: l.trans({ en: "/csr/stack_en.mp4", ko: "/csr/stack_ko.mp4" }),
                desc: l.trans({
                  en: "Pushes a detail page over the current page. Use it for drill-down navigation such as detail, edit, or settings pages.",
                  ko: "현재 페이지 위로 상세 페이지를 쌓습니다. 상세, 편집, 설정처럼 한 단계 깊게 들어가는 화면에 사용합니다.",
                }),
              },
              {
                title: "bottomUp",
                src: l.trans({ en: "/csr/bottomup_en.mp4", ko: "/csr/bottomup_ko.mp4" }),
                desc: l.trans({
                  en: "Opens a focused surface from the bottom. Use it for compose, picker, camera, or modal-like flows.",
                  ko: "하단에서 집중 화면을 엽니다. 작성, 선택, 카메라, 모달형 흐름에 사용합니다.",
                }),
              },
              {
                title: "fade",
                src: l.trans({ en: "/csr/fade_en.mp4", ko: "/csr/fade_ko.mp4" }),
                desc: l.trans({
                  en: "Changes context without implying a deeper navigation stack.",
                  ko: "더 깊은 계층으로 들어간다는 느낌 없이 맥락을 전환합니다.",
                }),
              },
              {
                title: "scaleOut",
                src: l.trans({ en: "/csr/scale_en.mp4", ko: "/csr/scale_ko.mp4" }),
                desc: l.trans({
                  en: "Uses a compact scale motion. This is the default Android-style transition for deeper routes.",
                  ko: "작은 scale motion을 사용합니다. Android에서 깊은 경로에 기본으로 쓰는 전환입니다.",
                }),
              },
            ].map((item) => (
              <div key={item.title} className="min-w-0">
                <div className="font-bold font-mono text-destructive text-sm">{item.title}</div>
                <div className="mt-2 min-h-14 text-foreground/70 text-xs leading-5">{item.desc}</div>
                <video
                  src={item.src}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="mt-4 aspect-9/16 max-h-[420px] w-full rounded-xl bg-foreground/5 object-contain shadow-foreground/10 shadow-lg"
                />
              </div>
            ))}
          </div>
          <Code.Snippet
            title="Page transition"
            code={`import type { PageConfig } from "akanjs/client";

export const pageConfig = {
  transition: "stack",
  gesture: true,
} satisfies PageConfig;`}
          />
          <div className="space-y-1">
            {[
              {
                title: "gesture",
                desc: l.trans({
                  en: "Controls edge-swipe navigation for page transitions. Leave it to the platform default unless the page needs to explicitly enable or disable gesture handling.",
                  ko: "page transition의 edge-swipe navigation을 제어합니다. 페이지가 명시적으로 켜거나 꺼야 하는 경우가 아니라면 platform default를 따르는 편이 좋습니다.",
                }),
              },
              {
                title: "transition",
                desc: l.trans({
                  en: 'Supported values are "none", "fade", "bottomUp", "stack", and "scaleOut".',
                  ko: '지원 값은 "none", "fade", "bottomUp", "stack", "scaleOut"입니다.',
                }),
              },
              {
                title: "scrollable content",
                desc: l.trans({
                  en: "Akan delays keyboard dismissal until a gesture is confirmed, so normal content scrolling does not immediately close the keyboard.",
                  ko: "Akan은 gesture가 확정될 때까지 키보드 dismiss를 지연하므로, 일반 content scroll이 곧바로 키보드를 닫지 않습니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-background/30 bg-background px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-foreground/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="keyboard-accessory"
        title={l.trans({ en: "Keyboard Accessory Layout", ko: "Keyboard Accessory Layout" })}
      >
        <Docs.Title>{l.trans({ en: "Keyboard Accessory Layout", ko: "Keyboard Accessory Layout" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: 'Use a keyboard-sticky BottomInset for bottom composers such as chat inputs, comment boxes, or live support inputs. The inset follows the native keyboard, while contentAnchor="bottom" keeps the scrollable page content aligned to the inset as the keyboard opens and closes.',
              ko: '채팅 입력창, 댓글 입력창, 라이브 상담 입력창처럼 하단 composer가 필요한 UI에는 keyboard-sticky BottomInset을 사용합니다. BottomInset은 네이티브 키보드를 따라 올라가고, contentAnchor="bottom"은 키보드가 열리고 닫힐 때 scrollable page content가 inset에 맞춰 정렬되도록 합니다.',
            })}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              {
                title: l.trans({ en: "Keyboard off", ko: "키보드 닫힘" }),
                lines: ["content viewport", "messages", "BottomInset"],
              },
              {
                title: l.trans({ en: "Keyboard on", ko: "키보드 열림" }),
                lines: ["smaller viewport", "same bottom edge", "BottomInset above keyboard"],
              },
              {
                title: l.trans({ en: "Scroll behavior", ko: "스크롤 동작" }),
                lines: ["bottom distance kept", "no pageConfig option", "opt in per BottomInset"],
              },
            ].map(({ title, lines }) => (
              <div key={title} className="rounded-2xl border border-background/30 bg-background p-4">
                <div className="font-semibold text-primary">{title}</div>
                <div className="mt-3 space-y-2">
                  {lines.map((line, idx) => (
                    <div
                      key={line}
                      className={[
                        "rounded-lg px-3 py-2 text-center text-xs",
                        idx === lines.length - 1 ? "bg-primary/15 text-primary" : "bg-background text-foreground/70",
                      ].join(" ")}
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-3xl border border-primary/40 bg-primary/5 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-foreground">
                  {l.trans({ en: "Android / iOS demo", ko: "Android / iOS 데모" })}
                </div>
                <div className="text-foreground/60 text-sm">
                  {l.trans({
                    en: 'These recordings show keyboardSticky moving the BottomInset with the native keyboard and contentAnchor="bottom" keeping the scroll content aligned to the composer.',
                    ko: '아래 영상은 keyboardSticky가 BottomInset을 네이티브 키보드와 함께 움직이고, contentAnchor="bottom"이 스크롤 콘텐츠를 composer 기준으로 유지하는 동작을 보여줍니다.',
                  })}
                </div>
              </div>
              <div className="rounded-full bg-background px-3 py-1 font-mono text-primary text-xs">keyboardSticky</div>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  {
                    title: "Android",
                    src: "/android_keyboard_sticky.mov",
                    desc: l.trans({
                      en: "The WebView keeps a stable frame while Akan applies the keyboard offset, so the composer stays attached to the keyboard instead of jumping above it.",
                      ko: "WebView frame은 안정적으로 유지하고 Akan이 keyboard offset을 적용해, composer가 키보드 위로 과하게 튀지 않고 키보드에 붙어 이동합니다.",
                    }),
                  },
                  {
                    title: "iOS",
                    src: "/ios_keyboard_sticky.mov",
                    desc: l.trans({
                      en: "The BottomInset follows the native keyboard transition and the scroll content preserves its bottom distance from the composer.",
                      ko: "BottomInset이 네이티브 키보드 전환을 따라가고, 스크롤 콘텐츠는 composer로부터의 하단 기준 거리를 보존합니다.",
                    }),
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="overflow-hidden rounded-2xl border border-background/30 bg-background"
                  >
                    <div className="border-background/30 border-b px-4 py-3">
                      <div className="font-mono font-semibold text-primary text-sm">{item.title}</div>
                      <div className="mt-1 text-foreground/60 text-xs leading-5">{item.desc}</div>
                    </div>
                    <div className="bg-foreground/5 p-3">
                      <video
                        src={item.src}
                        autoPlay
                        muted
                        loop
                        playsInline
                        controls
                        className="mx-auto aspect-9/16 max-h-[520px] w-full rounded-xl object-contain"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 text-sm">
                {[
                  l.trans({
                    en: "Use this when a bottom composer must remain visually attached to the software keyboard.",
                    ko: "하단 composer가 소프트웨어 키보드에 시각적으로 붙어 있어야 하는 화면에서 사용합니다.",
                  }),
                  l.trans({
                    en: "It is useful for chat, comments, support, and other bottom-input workflows.",
                    ko: "채팅, 댓글, 상담처럼 하단 입력 흐름이 중요한 UI에 적합합니다.",
                  }),
                  l.trans({
                    en: 'contentAnchor="bottom" is opt-in on BottomInset, so normal pages keep their existing keyboard behavior.',
                    ko: 'contentAnchor="bottom"은 BottomInset에서 opt-in이므로 일반 페이지의 기존 키보드 동작은 유지됩니다.',
                  }),
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-background/30 bg-background px-3 py-2 text-foreground/70"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <Code.Snippet
            title="Bottom composer"
            code={`import type { PageConfig } from "akanjs/client";
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
} satisfies PageConfig;`}
          />
          <div className="space-y-1">
            {[
              {
                title: "keyboardSticky",
                desc: l.trans({
                  en: "Moves the BottomInset into the keyboard accessory layer so it follows the software keyboard.",
                  ko: "BottomInset을 keyboard accessory layer로 옮겨 소프트웨어 키보드를 따라 움직이게 합니다.",
                }),
              },
              {
                title: 'contentAnchor="bottom"',
                desc: l.trans({
                  en: "Preserves the scroll container's bottom distance while the content viewport resizes. This matches messenger-style composers where messages reflow with the keyboard.",
                  ko: "content viewport가 리사이즈되는 동안 scroll container의 하단 기준 거리를 보존합니다. 메시지가 키보드와 함께 reflow되는 메신저형 composer에 맞는 동작입니다.",
                }),
              },
              {
                title: "Server component pages",
                desc: l.trans({
                  en: "Keep the page as a server component. If the app needs an initial scroll-to-bottom behavior, add a tiny client helper inside the page or Zone and target the Akan page content container.",
                  ko: "페이지는 server component로 유지하세요. 앱에서 진입 시 최초 scroll-to-bottom이 필요하면 page 또는 Zone 안에 작은 client helper를 넣고 Akan page content container를 대상으로 조작합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-background/30 bg-background px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-foreground/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Code.Snippet
            title="Optional client helper"
            code={`"use client";

import { useLayoutEffect } from "react";

export function ScrollToBottomOnMount() {
  useLayoutEffect(() => {
    const pageContent = document.getElementById("pageContent");
    pageContent?.scrollTo({ top: pageContent.scrollHeight });
  }, []);

  return null;
}`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "contentAnchor is intentionally a BottomInset option, not a pageConfig option. General forms can keep the default keyboard behavior, while messenger-style surfaces opt in locally.",
              ko: "contentAnchor는 pageConfig가 아니라 BottomInset 옵션입니다. 일반 form은 기본 키보드 동작을 유지하고, 메신저형 화면만 지역적으로 opt-in할 수 있습니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
