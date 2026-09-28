import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const stepList = "my-4 list-decimal space-y-2 pl-5";

  const termRows = [
    {
      name: <span className="font-sans">{l.trans({ en: "Route depth", ko: "경로 깊이" })}</span>,
      desc: l.trans({
        en: "Path segments after the language and basePath: `/chat` is 1, `/chat/[chatId]` is 2.",
        ko: "언어와 basePath를 뺀 경로 조각 수로, `/chat`은 1, `/chat/[chatId]`는 2입니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Safe area", ko: "safe area" })}</span>,
      desc: l.trans({
        en: "Space the device itself covers, such as the notch, the status bar and the home indicator.",
        ko: "노치, 상태 표시줄, 홈 인디케이터처럼 기기 자체가 가리는 영역입니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Inset", ko: "inset" })}</span>,
      desc: l.trans({
        en: "Space the app reserves for its own bars, such as a navbar on top or a composer below.",
        ko: "위쪽 내비게이션 바나 아래쪽 입력창처럼 앱이 자기 바를 위해 비워 두는 공간입니다.",
      }),
    },
    {
      name: <span className="font-sans">keyboard accessory layer</span>,
      desc: l.trans({
        en: "A layer that rides on top of the software keyboard and moves with it.",
        ko: "소프트웨어 키보드 바로 위에 붙어 키보드와 함께 움직이는 레이어입니다.",
      }),
    },
  ];

  const transitionCards = [
    {
      title: "stack",
      src: l.trans({ en: "/csr/stack_en.mp4", ko: "/csr/stack_ko.mp4" }),
      desc: l.trans({
        en: "Pushes a page over the current one. Use it for drill-down screens such as detail, edit or settings.",
        ko: "현재 페이지 위로 새 페이지를 쌓습니다. 상세, 편집, 설정처럼 한 단계 깊이 들어가는 화면에 씁니다.",
      }),
    },
    {
      title: "bottomUp",
      src: l.trans({ en: "/csr/bottomup_en.mp4", ko: "/csr/bottomup_ko.mp4" }),
      desc: l.trans({
        en: "Opens a focused screen from the bottom that drags down to close. Use it for modal-like flows such as compose, picker or camera.",
        ko: "아래에서 집중 화면을 올리고, 끌어내리면 닫힙니다. 작성, 선택, 카메라처럼 모달 같은 흐름에 씁니다.",
      }),
    },
    {
      title: "fade",
      src: l.trans({ en: "/csr/fade_en.mp4", ko: "/csr/fade_ko.mp4" }),
      desc: l.trans({
        en: "Switches context without suggesting a deeper level.",
        ko: "더 깊이 들어간다는 느낌 없이 맥락만 바꿉니다.",
      }),
    },
    {
      title: "scaleOut",
      src: l.trans({ en: "/csr/scale_en.mp4", ko: "/csr/scale_ko.mp4" }),
      desc: l.trans({
        en: "A small scale motion. It is the Android default for deeper routes.",
        ko: "살짝 커지며 나타나는 전환입니다. Android에서 깊은 경로의 기본값입니다.",
      }),
    },
  ];

  const defaultColumns = [
    { key: "ios", label: "iOS", caption: "depth ≥ 2" },
    { key: "android", label: "Android", caption: "depth ≥ 2" },
    { key: "base", label: l.trans({ en: "Web · Root", ko: "웹 · 루트" }) },
  ];

  const transitionGroups = [
    {
      label: l.trans({ en: "Drag to go back", ko: "드래그로 돌아가는 전환" }),
      rows: [
        {
          name: "stack",
          desc: l.trans({ en: "Slides in from the right.", ko: "오른쪽에서 밀려 들어옵니다." }),
          marks: { ios: true, android: false, base: false },
        },
        {
          name: "bottomUp",
          desc: l.trans({ en: "Rises from the bottom.", ko: "아래에서 올라옵니다." }),
          marks: { ios: false, android: false, base: false },
        },
      ],
    },
    {
      label: l.trans({ en: "No drag", ko: "드래그가 없는 전환" }),
      rows: [
        {
          name: "scaleOut",
          desc: l.trans({ en: "Scales up slightly into place.", ko: "살짝 커지며 자리를 잡습니다." }),
          marks: { ios: false, android: true, base: false },
        },
        {
          name: "fade",
          desc: l.trans({ en: "Cross-fades between pages.", ko: "두 페이지가 겹쳐지며 바뀝니다." }),
          marks: { ios: false, android: false, base: false },
        },
        {
          name: "none",
          desc: l.trans({ en: "Swaps instantly with no animation.", ko: "애니메이션 없이 바로 바뀝니다." }),
          marks: { ios: false, android: false, base: true },
        },
      ],
    },
  ];

  const gestureCards = [
    {
      title: "stack",
      notes: [
        l.trans({
          en: "Drag to the right, starting anywhere on the page.",
          ko: "페이지 어디서든 오른쪽으로 끕니다.",
        }),
        l.trans({
          en: "Goes back past a third of the screen width, or on a quick flick even if it travelled less.",
          ko: "화면 너비의 3분의 1을 넘기면 돌아갑니다. 덜 끌었어도 빠르게 튕기면 인정됩니다.",
        }),
        l.trans({
          en: "Hides the keyboard only once the touch is read as a drag.",
          ko: "터치가 드래그로 판정된 뒤에만 키보드를 내립니다.",
        }),
      ],
    },
    {
      title: "bottomUp",
      notes: [
        l.trans({
          en: "Drag down, starting near the top of the screen.",
          ko: "화면 위쪽에서 시작해 아래로 끌어내립니다.",
        }),
        l.trans({
          en: "Closes past half the screen width; a shorter drag snaps back.",
          ko: "화면 너비의 절반보다 더 내리면 닫히고, 덜 내리면 제자리로 돌아옵니다.",
        }),
        l.trans({
          en: "Hides the keyboard as soon as the drag starts.",
          ko: "드래그가 시작되자마자 키보드를 내립니다.",
        }),
      ],
    },
  ];

  const cssVarRows = [
    {
      name: "--akan-top-safe-area",
      desc: l.trans({
        en: "Top safe area the page reserved, in px.",
        ko: "페이지가 비워 둔 상단 safe area(px)입니다.",
      }),
    },
    {
      name: "--akan-bottom-safe-area",
      desc: l.trans({
        en: "Bottom safe area the page reserved, in px.",
        ko: "페이지가 비워 둔 하단 safe area(px)입니다.",
      }),
    },
    {
      name: "--akan-top-inset",
      desc: l.trans({ en: "The resolved `topInset`, in px.", ko: "계산된 `topInset` 값(px)입니다." }),
    },
    {
      name: "--akan-bottom-inset",
      desc: l.trans({ en: "The resolved `bottomInset`, in px.", ko: "계산된 `bottomInset` 값(px)입니다." }),
    },
    {
      name: "--akan-page-padding-top",
      desc: l.trans({
        en: "Top safe area plus top inset: the top padding a page body needs.",
        ko: "상단 safe area와 상단 inset을 더한, 페이지 본문에 필요한 위쪽 여백입니다.",
      }),
    },
    {
      name: "--akan-page-padding-bottom",
      desc: l.trans({
        en: "Bottom safe area plus bottom inset: the bottom padding a page body needs.",
        ko: "하단 safe area와 하단 inset을 더한, 페이지 본문에 필요한 아래쪽 여백입니다.",
      }),
    },
  ];

  const sourceRows = [
    {
      name: "native",
      desc: l.trans({
        en: "The native runtime's keyboard plugin reported the exact height as the keyboard began to open.",
        ko: "네이티브 런타임의 keyboard 플러그인이 키보드가 열리기 시작할 때 정확한 높이를 알려 준 경우입니다.",
      }),
    },
    {
      name: "visualViewport",
      desc: l.trans({
        en: "How much the visible viewport shrank; Android prefers it, elsewhere it fills in for the plugin.",
        ko: "보이는 viewport가 줄어든 만큼이며, Android는 이것을 먼저 쓰고 다른 곳에선 플러그인이 답하지 않을 때 씁니다.",
      }),
    },
    {
      name: "fallback",
      desc: l.trans({
        en: "Neither reported a height, so it is 0: the keyboard is closed or could not be measured.",
        ko: "둘 다 높이를 알려 주지 않아 0이며, 키보드가 닫혀 있거나 잴 수 없는 경우입니다.",
      }),
    },
  ];

  const keyboardStateRows = [
    {
      name: "sticky",
      desc: l.trans({
        en: "The route has at least one `keyboardSticky` slot; when `false`, the keyboard layer is hidden.",
        ko: "이 경로에 `keyboardSticky` 슬롯이 하나 이상 있다는 뜻이며, `false`면 키보드 레이어가 숨겨집니다.",
      }),
    },
    {
      name: "frozen",
      desc: l.trans({
        en: "A page transition is running, so the offset is held at 0 to keep out of its way.",
        ko: "페이지 전환이 진행 중이라, 전환과 부딪히지 않도록 offset을 0으로 붙잡아 둡니다.",
      }),
    },
    {
      name: "visible",
      desc: l.trans({
        en: "A height is present and `frozen` is not set; branch on this, not on the height alone.",
        ko: "높이가 있고 `frozen`도 아니라는 뜻이며, 컴포넌트는 높이만이 아니라 이 값으로 분기해야 합니다.",
      }),
    },
  ];

  const keyboardDemos = [
    {
      title: "Android",
      src: "/android_keyboard_sticky.mp4",
      desc: l.trans({
        en: "The WebView frame stays still while Akan applies the keyboard offset, so the composer rides the keyboard instead of jumping above it.",
        ko: "WebView 프레임은 그대로 두고 Akan이 키보드 offset을 적용합니다. 그래서 입력창이 키보드 위로 튀지 않고 키보드에 붙어 움직입니다.",
      }),
    },
    {
      title: "iOS",
      src: "/ios_keyboard_sticky.mp4",
      desc: l.trans({
        en: (
          <span>
            The <code>BottomInset</code> follows the native keyboard animation, and the messages keep their distance
            from the composer.
          </span>
        ),
        ko: (
          <span>
            <code>BottomInset</code>이 네이티브 키보드 애니메이션을 따라가고, 메시지는 입력창과의 거리를 그대로
            유지합니다.
          </span>
        ),
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="page-transitions" title={l.trans({ en: "Page Transitions", ko: "페이지 전환" })}>
        <Docs.Title>{l.trans({ en: "Page Transitions", ko: "페이지 전환" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Your app runs inside a native shell, yet every screen change lands like a web page swap. The user cannot tell whether they went deeper or sideways, and the back button is the only way out.",
              ko: "앱은 네이티브 셸 안에서 돌아가는데, 화면이 바뀔 때마다 웹 페이지가 교체되듯 툭 바뀝니다. 사용자는 더 깊이 들어간 건지 옆으로 간 건지 알 수 없고, 빠져나오는 길은 뒤로 가기 버튼뿐입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  Give the page a <code>transition</code> in <code>.config()</code>. The mobile app shell then animates
                  the change the way a native app does.
                </span>
              ),
              ko: (
                <span>
                  페이지의 <code>.config()</code>에 <code>transition</code>을 적으세요. 그러면 모바일 앱 셸이 네이티브
                  앱처럼 화면 전환을 애니메이션으로 보여 줍니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />

          <Docs.SubSubTitle>{l.trans({ en: "Set the transition", ko: "전환 지정하기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A detail page that slides in over its list:",
              ko: "목록 위로 밀려 들어오는 상세 페이지입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/page/article/[articleId].tsx"
            code={`import { Article, fetch } from "@apps/myapp/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("articleId", ID)
  .config({ transition: "stack" })
  .render(({ articleId }) => {
    const { articleView } = fetch.viewArticle(articleId);
    return <Article.Zone.View view={articleView} />;
  });`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Five values.</strong> <code>stack</code>, <code>bottomUp</code>, <code>fade</code>,{" "}
                    <code>scaleOut</code> and <code>none</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>값은 다섯 가지입니다.</strong> <code>stack</code>, <code>bottomUp</code>, <code>fade</code>,{" "}
                    <code>scaleOut</code>, <code>none</code>.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The value also picks the drag.</strong> Only <code>stack</code> and <code>bottomUp</code>{" "}
                    come with a real back gesture.
                  </>
                ),
                ko: (
                  <>
                    <strong>값이 드래그 동작도 정합니다.</strong> 실제 뒤로 가기 제스처가 달린 것은 <code>stack</code>과{" "}
                    <code>bottomUp</code> 둘뿐입니다.
                  </>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "What each one looks like", ko: "전환별 모습" })}</Docs.SubSubTitle>
          <div className="my-4 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {transitionCards.map((item) => (
              <div key={item.title} className="min-w-0">
                <div className="font-bold font-mono text-primary text-sm">{item.title}</div>
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

          <Docs.SubSubTitle>{l.trans({ en: "Platform defaults", ko: "플랫폼별 기본값" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Leave <code>transition</code> out and the platform and route depth pick one for you:
                </span>
              ),
              ko: (
                <span>
                  <code>transition</code>을 적지 않으면 플랫폼과 경로 깊이에 따라 알아서 정해집니다:
                </span>
              ),
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Transition", ko: "전환" })}
            columns={defaultColumns}
            groups={transitionGroups}
            markLabel={l.trans({ en: "Default here", ko: "여기서 기본값" })}
            emptyLabel={l.trans({ en: "Only when written", ko: "직접 적을 때만" })}
          />
          <div>
            {l.trans({
              en: "The iOS and Android columns are routes at depth 2 or more. The last column covers the web at any depth and every platform at depth 1 or less.",
              ko: "iOS와 Android 열은 깊이 2 이상의 경로입니다. 마지막 열은 깊이와 상관없는 웹, 그리고 깊이 1 이하인 모든 플랫폼입니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="gesture-back" title={l.trans({ en: "The Back Gesture", ko: "뒤로 가기 제스처" })}>
        <Docs.Title>{l.trans({ en: "The Back Gesture", ko: "뒤로 가기 제스처" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Leave <code>gesture</code> to the platform default unless the page has a reason not to. iOS turns it
                  on below the root; Android and the web leave it off, as their users expect.
                </span>
              ),
              ko: (
                <span>
                  특별한 이유가 없다면 <code>gesture</code>는 플랫폼 기본값에 맡기세요. iOS는 루트 아래 페이지에서 켜고,
                  Android와 웹은 끕니다. 각 플랫폼 사용자가 이미 기대하는 동작입니다.
                </span>
              ),
            })}
          </div>

          <Docs.SubSubTitle>{l.trans({ en: "How the value is decided", ko: "값이 정해지는 순서" })}</Docs.SubSubTitle>
          <ol className={stepList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Written wins.</strong> A <code>gesture</code> written anywhere in the layout chain is used
                    as-is.
                  </>
                ),
                ko: (
                  <>
                    <strong>직접 적은 값이 우선입니다.</strong> layout 체인 어디에든 <code>gesture</code>를 적었다면 그
                    값을 그대로 씁니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>No animation, no drag.</strong> Left unwritten, a page whose <code>transition</code> is{" "}
                    <code>none</code> gets <code>false</code>, because there is nothing for the drag to move.
                  </>
                ),
                ko: (
                  <>
                    <strong>애니메이션이 없으면 드래그도 없습니다.</strong> 적지 않았고 <code>transition</code>이{" "}
                    <code>none</code>
                    이면 <code>false</code>입니다. 드래그로 움직일 애니메이션이 없기 때문입니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Otherwise the platform decides.</strong> <code>true</code> on iOS at route depth 2 or more,{" "}
                    <code>false</code> everywhere else.
                  </>
                ),
                ko: (
                  <>
                    <strong>그 밖에는 플랫폼이 정합니다.</strong> iOS에서 경로 깊이가 2 이상이면 <code>true</code>,
                    나머지는 모두 <code>false</code>입니다.
                  </>
                ),
              })}
            </li>
          </ol>

          <Docs.SubSubTitle>{l.trans({ en: "The two drags", ko: "두 가지 드래그" })}</Docs.SubSubTitle>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {gestureCards.map((card) => (
              <div key={card.title} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-mono font-semibold text-primary">{card.title}</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/70 text-sm">
                  {card.notes.map((note, idx) => (
                    <li key={idx}>{note}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Intent before movement.</strong> A <code>stack</code> touch stays pending until it travels
                    8px, then locks to drag or scroll by whichever axis moved clearly more (1.25×).
                  </>
                ),
                ko: (
                  <>
                    <strong>움직이기 전에 의도부터 봅니다.</strong> <code>stack</code>의 터치는 8px을 움직일 때까지
                    보류되고, 그다음 확실히 더 많이 움직인 축(1.25배)에 따라 드래그나 스크롤로 고정됩니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Scrolling costs nothing.</strong> While the touch is pending, nothing closes and the
                    keyboard stays up.
                  </>
                ),
                ko: (
                  <>
                    <strong>평범한 스크롤은 방해받지 않습니다.</strong> 보류 중에는 아무것도 닫히지 않고 키보드도 그대로
                    있습니다.
                  </>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    <code>gesture: true</code> does nothing on a <code>fade</code>, <code>scaleOut</code> or{" "}
                    <code>none</code> page.
                  </strong>{" "}
                  Those transitions attach no drag handler at all.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>fade</code>, <code>scaleOut</code>, <code>none</code> 페이지에서는 <code>gesture: true</code>
                    가 아무 일도 하지 않습니다.
                  </strong>{" "}
                  이 전환들은 드래그 핸들러를 아예 붙이지 않습니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="frame-config" title={l.trans({ en: "The Frame Config", ko: "프레임 설정" })}>
        <Docs.Title>{l.trans({ en: "The Frame Config", ko: "프레임 설정" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  One <code>.config()</code> object sets the whole page frame: animation, gesture, reserved space and
                  caching. Write it on a layout and every route under it inherits it.
                </span>
              ),
              ko: (
                <span>
                  <code>.config()</code> 객체 하나가 페이지 프레임 전체를 정합니다. 애니메이션, 제스처, 비워 둘 공간,
                  캐시까지입니다. layout에 적으면 그 아래 모든 라우트가 물려받습니다.
                </span>
              ),
            })}
          </div>
          <Docs.OptionTable
            items={[
              {
                key: "transition",
                type: '"none" | "fade" | "bottomUp" | "stack" | "scaleOut"',
                default: l.trans({
                  en: "iOS stack · Android scaleOut · none on web and at depth ≤ 1",
                  ko: "iOS stack · Android scaleOut · 웹과 깊이 ≤ 1은 none",
                }),
                desc: l.trans({
                  en: "The animation played when this route is entered.",
                  ko: "이 라우트로 들어올 때 재생되는 애니메이션입니다.",
                }),
              },
              {
                key: "gesture",
                type: "boolean",
                default: l.trans({
                  en: "true on iOS at depth ≥ 2, else false",
                  ko: "iOS 깊이 ≥ 2면 true, 그 외 false",
                }),
                desc: l.trans({
                  en: "Drag to go back, attached only by the `stack` and `bottomUp` transitions.",
                  ko: "드래그로 뒤로 가는 동작이며, `stack`과 `bottomUp` 전환에만 붙습니다.",
                }),
              },
              {
                key: "topInset",
                type: "number | boolean",
                default: "0",
                desc: l.trans({
                  en: "Space reserved for a top bar in px; `true` means 48px, `false` or unset means 0.",
                  ko: "위쪽 바를 위해 비워 둘 공간(px)이며, `true`는 48px, `false`와 미지정은 0입니다.",
                }),
              },
              {
                key: "bottomInset",
                type: "number | boolean",
                default: "0",
                desc: l.trans({
                  en: "Space reserved for a bottom bar, in px, with the same 48px meaning for `true`.",
                  ko: "아래쪽 바를 위해 비워 둘 공간(px)이며, `true`는 똑같이 48px입니다.",
                }),
              },
              {
                key: "safeArea",
                type: 'boolean | "top" | "bottom" | { top?, bottom?, android? }',
                default: l.trans({
                  en: 'iOS true · Android { android: "auto" } · web false',
                  ko: 'iOS true · Android { android: "auto" } · 웹 false',
                }),
                desc: l.trans({
                  en: 'Device insets to reserve; `"top"` or `"bottom"` keeps one side only.',
                  ko: '비워 둘 기기 safe area이며, `"top"`이나 `"bottom"`은 한쪽만 비웁니다.',
                }),
              },
              {
                key: "safeArea.android",
                type: '"auto" | "edge-to-edge" | "none"',
                default: '"auto"',
                desc: l.trans({
                  en: "How Android measures the safe area; `none` reserves nothing.",
                  ko: "Android에서 safe area를 재는 방식이며, `none`이면 아무것도 비우지 않습니다.",
                }),
              },
              {
                key: "cache",
                type: "boolean",
                default: l.trans({ en: "true at depth ≤ 1, else false", ko: "깊이 ≤ 1이면 true, 그 외 false" }),
                desc: l.trans({
                  en: "Keeps one page for the route, mounted in a hidden cache layer after you navigate away; its effects stop until it is shown again.",
                  ko: "라우트에 페이지 하나를 두고, 다른 화면으로 나가도 숨은 캐시 레이어에 마운트된 채로 둡니다. 다시 보일 때까지 effect는 멈춥니다.",
                }),
              },
              {
                key: "topSafeAreaColor",
                type: "string",
                default: l.trans({ en: "the background color", ko: "배경색" }),
                desc: l.trans({
                  en: "CSS color painted behind the top safe-area strip.",
                  ko: "위쪽 safe area 띠에 칠할 CSS 색입니다.",
                }),
              },
              {
                key: "bottomSafeAreaColor",
                type: "string",
                default: l.trans({ en: "the background color", ko: "배경색" }),
                desc: l.trans({
                  en: "CSS color painted behind the bottom safe-area strip.",
                  ko: "아래쪽 safe area 띠에 칠할 CSS 색입니다.",
                }),
              },
            ]}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The closest config wins.</strong> A page's value overrides its layouts', while a{" "}
                    <code>safeArea</code> object merges key by key.
                  </>
                ),
                ko: (
                  <>
                    <strong>가장 가까운 설정이 이깁니다.</strong> 페이지 값이 layout 값을 덮어쓰고,{" "}
                    <code>safeArea</code> 객체만 키 단위로 합쳐집니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Top-level routes stay still.</strong> At depth 1 or less every platform defaults to{" "}
                    <code>none</code>, no gesture and <code>cache: true</code>, so tabs switch instantly.
                  </>
                ),
                ko: (
                  <>
                    <strong>최상위 라우트는 움직이지 않습니다.</strong> 깊이 1 이하에서는 모든 플랫폼이{" "}
                    <code>none</code>, 제스처 없음, <code>cache: true</code>가 기본이라 탭이 즉시 바뀝니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>A page nobody sees runs no effects.</strong> A cached page, and the page a transition-less
                    switch left, keep their state and DOM but stop their effects until shown again. The page under a{" "}
                    <code>stack</code> transition stays live for a swipe back, so bind a camera, a poll or a key handler
                    with <code>usePageFocusEffect</code> from <code>akanjs/webkit</code>; <code>usePageActivity()</code>{" "}
                    says whether the page is <code>current</code>, <code>prev</code>, <code>pending</code> or{" "}
                    <code>hidden</code>. Only the current page offers its tools and state to the in-page agent.
                  </>
                ),
                ko: (
                  <>
                    <strong>아무도 보지 않는 페이지는 effect를 돌리지 않습니다.</strong> 캐시된 페이지와 전환 없이 떠난
                    페이지는 state와 DOM을 그대로 두고, 다시 보일 때까지 effect를 멈춥니다. <code>stack</code> 전환 아래
                    페이지는 스와이프 뒤로가기를 위해 살아 있으므로, 카메라·폴링·키 입력은 <code>akanjs/webkit</code>의{" "}
                    <code>usePageFocusEffect</code>로 묶으세요. <code>usePageActivity()</code>는 페이지가{" "}
                    <code>current</code>·<code>prev</code>·<code>pending</code>·<code>hidden</code> 중 어디에 있는지
                    알려 줍니다. 페이지 안 에이전트에는 현재 페이지의 도구와 state만 보입니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Every history entry is a page of its own.</strong> A push to the route you are on mounts a
                    new page over the old one, which waits under it with its state; a replace within one route updates
                    the page in place. Below the page a swipe back reveals, three more entries stay mounted and hidden,
                    and older ones are released — they mount again on back, with their scroll restored. A{" "}
                    <code>cache</code> route stays one page for the whole session.
                  </>
                ),
                ko: (
                  <>
                    <strong>히스토리 항목마다 페이지가 따로 있습니다.</strong> 지금 라우트로 push하면 새 페이지가 기존
                    페이지 위에 마운트되고, 기존 페이지는 state를 그대로 가진 채 아래에서 기다립니다. 같은 라우트 안의
                    replace는 페이지를 그 자리에서 갱신합니다. 스와이프 뒤로가기로 드러나는 페이지 아래로 세 항목을 더
                    숨긴 채 마운트해 두고, 더 오래된 항목은 해제합니다. 해제된 항목은 뒤로 갈 때 다시 마운트되고
                    스크롤은 복원됩니다. <code>cache</code> 라우트는 세션 내내 페이지 하나로 유지됩니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The stack outlives a reload.</strong> After a reload — or a WebView whose content process
                    died and reloaded — the current page and the one under it come back, the rest of the stack waits
                    until you go back to it, and back walks it as before. While the app is in the background, the page
                    under the current one pauses too.
                  </>
                ),
                ko: (
                  <>
                    <strong>스택은 리로드 뒤에도 남습니다.</strong> 리로드하거나 WebView의 콘텐츠 프로세스가 죽어 다시
                    로드되면 현재 페이지와 그 아래 페이지가 돌아옵니다. 나머지 스택은 뒤로 가서 닿을 때까지 기다리고,
                    뒤로가기는 전과 같이 스택을 따라갑니다. 앱이 백그라운드에 있는 동안에는 현재 페이지 아래 페이지도
                    멈춥니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>On Android, back is the page's only while it has somewhere to go.</strong> At the index with
                    nothing under it, the system takes back and shows its own back-to-home animation, and the app stays
                    warm instead of quitting. On Android 14+ a back swipe moves the page with the finger before it
                    commits. When the system runs low on memory, on either platform, the hidden pages are released and
                    mount again when visited.
                  </>
                ),
                ko: (
                  <>
                    <strong>Android에서 뒤로가기는 갈 곳이 있을 때만 페이지의 것입니다.</strong> 아래에 아무것도 없는
                    인덱스에서는 시스템이 뒤로가기를 가져가 홈으로 가는 자체 애니메이션을 보여 주고, 앱은 종료되지 않고
                    살아 있습니다. Android 14 이상에서는 뒤로가기 스와이프를 하는 동안 페이지가 손가락을 따라 움직인 뒤
                    확정됩니다. 두 플랫폼 모두 시스템 메모리가 부족해지면 숨은 페이지를 해제하고, 다시 방문할 때
                    마운트합니다.
                  </>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "The frame as CSS variables", ko: "CSS 변수로 쓰기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "The resolved numbers are published as CSS custom properties, so a component can reserve the same space as the page without any JavaScript:",
              ko: "계산된 값은 CSS 커스텀 속성으로 공개됩니다. 그래서 컴포넌트는 JavaScript 없이도 페이지와 같은 공간을 비울 수 있습니다:",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Variable", ko: "변수" })} items={cssVarRows} />
          <div>
            {l.trans({
              en: (
                <span>
                  Tailwind reads them directly: <code>h-(--akan-bottom-inset)</code> sizes a bar to exactly the space
                  the page reserved.
                </span>
              ),
              ko: (
                <span>
                  Tailwind에서 바로 읽을 수 있습니다. <code>h-(--akan-bottom-inset)</code>은 바의 높이를 페이지가 비워
                  둔 공간과 정확히 맞춥니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="keyboard-inset" title={l.trans({ en: "The Keyboard Inset", ko: "키보드 따라 움직이기" })}>
        <Docs.Title>{l.trans({ en: "The Keyboard Inset", ko: "키보드 따라 움직이기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A chat input, a comment box, a support composer: anything pinned to the bottom must move with the software keyboard. Every platform reports the keyboard differently.",
              ko: "채팅 입력창, 댓글 입력창, 상담 입력창처럼 아래에 고정된 것은 소프트웨어 키보드를 따라 움직여야 합니다. 그런데 키보드 정보를 알려 주는 방식은 플랫폼마다 다릅니다.",
            })}
          </div>
          <ol className={stepList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Reserve the bar's space</strong> with <code>bottomInset</code> in <code>.config()</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>바가 들어갈 공간을 비웁니다.</strong> <code>.config()</code>에 <code>bottomInset</code>을
                    적습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Wrap the composer</strong> in <code>Layout.BottomInset</code> marked{" "}
                    <code>keyboardSticky</code>. Akan moves it into the keyboard accessory layer for you.
                  </>
                ),
                ko: (
                  <>
                    <strong>입력창을 감쌉니다.</strong> <code>keyboardSticky</code>를 붙인{" "}
                    <code>Layout.BottomInset</code>으로 감싸면 Akan이 keyboard accessory layer로 옮겨 줍니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Keep the messages in place</strong> with <code>contentAnchor="bottom"</code>, covered in the
                    next section.
                  </>
                ),
                ko: (
                  <>
                    <strong>메시지 위치를 지킵니다.</strong> <code>contentAnchor="bottom"</code>을 붙입니다. 다음 절에서
                    다룹니다.
                  </>
                ),
              })}
            </li>
          </ol>
          <div>
            {l.trans({
              en: "A chat page with all three steps:",
              ko: "세 단계를 모두 적용한 채팅 페이지입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/page/chat/_index.tsx"
            code={`import { ChatMessage } from "@apps/myapp/client";
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
  ));`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The declared height wins.</strong> With <code>bottomInset</code> in <code>.config()</code>,{" "}
                    <code>BottomInset</code> uses that height; without it, it measures its own content.
                  </>
                ),
                ko: (
                  <>
                    <strong>적어 둔 높이가 우선입니다.</strong> <code>.config()</code>에 <code>bottomInset</code>이
                    있으면 <code>BottomInset</code>은 그 높이를 쓰고, 없으면 자기 내용의 높이를 잽니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Match the bar to the reservation</strong> with <code>h-(--akan-bottom-inset)</code>, so the
                    bar and the reserved space never disagree.
                  </>
                ),
                ko: (
                  <>
                    <strong>바 높이를 예약한 공간에 맞춥니다.</strong> <code>h-(--akan-bottom-inset)</code>을 쓰면 바와
                    비워 둔 공간이 어긋나지 않습니다.
                  </>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "Where the keyboard height comes from", ko: "키보드 높이를 얻는 곳" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Akan reads the height from one of three sources, and the source decides how accurate the offset is:",
              ko: "Akan은 세 곳 중 하나에서 높이를 얻고, 어디서 얻었는지가 offset의 정확도를 좌우합니다:",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Source", ko: "출처" })} items={sourceRows} />

          <Docs.SubSubTitle>{l.trans({ en: "Keyboard state", ko: "키보드 상태 값" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  In the mobile app shell, <code>useCsr().frameLayout.keyboard</code> carries three flags next to the
                  height:
                </span>
              ),
              ko: (
                <span>
                  모바일 앱 셸에서는 <code>useCsr().frameLayout.keyboard</code>가 높이와 함께 세 가지 값을 담고
                  있습니다:
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Field", ko: "필드" })} items={keyboardStateRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="content-anchor" title={l.trans({ en: "Anchoring The Content", ko: "메시지 위치 지키기" })}>
        <Docs.Title>{l.trans({ en: "Anchoring The Content", ko: "메시지 위치 지키기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Moving the composer is half the job; the messages above it must stay where they were. That is{" "}
                  <code>contentAnchor="bottom"</code>: it keeps the scroll position's distance from the bottom while the
                  viewport resizes, the way a messenger does.
                </span>
              ),
              ko: (
                <span>
                  입력창을 옮기는 건 절반이고, 그 위의 메시지도 있던 자리에 남아야 합니다.{" "}
                  <code>contentAnchor="bottom"</code>은 화면 크기가 바뀌는 동안 스크롤 위치의 하단 기준 거리를 지켜,
                  메신저처럼 자연스럽게 다시 배치합니다.
                </span>
              ),
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {keyboardDemos.map((item) => (
              <div key={item.title} className={panelRecipe({ padding: "none" }, "min-w-0 overflow-hidden")}>
                <div className="border-border border-b px-4 py-3">
                  <div className="font-mono font-semibold text-primary text-sm">{item.title}</div>
                  <div className="mt-1 text-foreground/70 text-xs leading-5">{item.desc}</div>
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
          <div>
            {l.trans({
              en: (
                <span>
                  The composer inside the <code>BottomInset</code> is an ordinary Zone with a store-driven field:
                </span>
              ),
              ko: (
                <span>
                  <code>BottomInset</code> 안의 입력창은 store에 연결된 필드 하나를 가진 평범한 Zone입니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/lib/chatMessage/ChatMessage.Zone.tsx"
            code={`"use client";
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
};`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>keyboardSticky</code>
                    </strong>{" "}
                    moves the <code>BottomInset</code> into the keyboard accessory layer so it follows the keyboard.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>keyboardSticky</code>
                    </strong>
                    는 <code>BottomInset</code>을 keyboard accessory layer로 옮겨 키보드를 따라 움직이게 합니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>contentAnchor="bottom"</code>
                    </strong>{" "}
                    keeps the bottom distance while the viewport resizes. <code>bottom</code> is the only value, and it
                    works only together with <code>keyboardSticky</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>contentAnchor="bottom"</code>
                    </strong>
                    은 화면 크기가 바뀌는 동안 하단 기준 거리를 지킵니다. 값은 <code>bottom</code> 하나뿐이고,{" "}
                    <code>keyboardSticky</code>와 함께일 때만 동작합니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The page stays a server component.</strong> To start the chat scrolled to the bottom, add a
                    tiny client helper inside the page or Zone that targets the Akan page content container.
                  </>
                ),
                ko: (
                  <>
                    <strong>페이지는 서버 컴포넌트로 둡니다.</strong> 처음부터 맨 아래로 스크롤된 채 열려야 한다면,
                    page나 Zone 안에 작은 클라이언트 헬퍼를 넣어 Akan 페이지 콘텐츠 컨테이너를 스크롤합니다.
                  </>
                ),
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: "A helper that scrolls the page it sits in to the bottom once:",
              ko: "자기가 들어 있는 페이지를 한 번 맨 아래로 스크롤하는 헬퍼입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/ui/Chat/ScrollToBottomOnMount.tsx"
            code={`"use client";
import { useLayoutEffect, useRef } from "react";

export const ScrollToBottomOnMount = () => {
  const markerRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const pageContent = markerRef.current?.closest(".akan-page-content");
    pageContent?.scrollTo({ top: pageContent.scrollHeight });
  }, []);
  return <span ref={markerRef} hidden />;
};`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Search upward, not across the document.</strong> During a transition several pages stay
                    mounted, each with <code>.akan-page-content</code>, so <code>document.querySelector</code> can pick
                    the wrong one; <code>closest()</code> finds this page's.
                  </>
                ),
                ko: (
                  <>
                    <strong>문서 전체가 아니라 위로 찾아 올라갑니다.</strong> 전환 중에는 여러 페이지가 마운트되어 있고
                    모두 <code>.akan-page-content</code>를 가집니다. <code>document.querySelector</code>는 다른 페이지를
                    집을 수 있지만, <code>closest()</code>는 이 페이지의 것을 찾습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Drop it anywhere in the page.</strong> <code>{"<ScrollToBottomOnMount />"}</code> renders a
                    hidden marker and nothing else.
                  </>
                ),
                ko: (
                  <>
                    <strong>페이지 안 아무 곳에나 넣으면 됩니다.</strong> <code>{"<ScrollToBottomOnMount />"}</code>는
                    숨은 표식 하나만 그립니다.
                  </>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="info">
            {l.trans({
              en: (
                <span>
                  <strong>
                    <code>contentAnchor</code> is a <code>BottomInset</code> option, not a <code>.config()</code>{" "}
                    option.
                  </strong>{" "}
                  Ordinary forms keep the default keyboard behaviour; only messenger-style screens opt in, locally.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>contentAnchor</code>는 <code>.config()</code>가 아니라 <code>BottomInset</code>의 옵션입니다.
                  </strong>{" "}
                  일반 폼은 기본 키보드 동작을 그대로 쓰고, 메신저형 화면만 그 자리에서 켭니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
