import { usePage } from "@apps/akan/client";
import {
  Code,
  type CommandReferenceItem,
  CommandReferenceSlide,
  cardGridRecipe,
  Divider,
  Docs,
  DocsToc,
  type IntroItem,
  panelRecipe,
} from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "CLI 레퍼런스: Quality | Akan.js" : "CLI Reference: Quality | Akan.js";
    const description =
      lang === "ko"
        ? "워크스페이스를 점검하고, 페이지가 서버에서 얼마나 렌더링되는지 측정합니다."
        : "Scan the workspace, and measure how much of a page renders on the server.";
    return (
      <>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
      </>
    );
  })
  .render(() => {
    const { l } = usePage();

    const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

    const driftCards = [
      {
        title: l.trans({ en: "Files Grown Too Long", ko: "너무 길어진 파일" }),
        desc: l.trans({
          en: "A service past 500 lines, a Template or Zone past 800, or a Util past 1,000.",
          ko: "500줄을 넘은 서비스, 800줄을 넘은 Template·Zone, 1,000줄을 넘은 Util입니다.",
        }),
        code: "akan.file.recommended-max-lines",
      },
      {
        title: l.trans({ en: "Helpers In The Wrong File", ko: "엉뚱한 파일에 놓인 헬퍼" }),
        desc: l.trans({
          en: (
            <span>
              A helper function declared in <code>order.service.ts</code> next to <code>OrderService</code>.
            </span>
          ),
          ko: (
            <span>
              <code>order.service.ts</code>에서 <code>OrderService</code> 옆에 선언한 헬퍼 함수입니다.
            </span>
          ),
        }),
        code: "akan.convention.service",
      },
      {
        title: l.trans({ en: "Modules With No Server View", ko: "서버 View가 없는 모듈" }),
        desc: l.trans({
          en: "Its UI renders only from Template, Zone and Util, so all of it ships to the browser as JavaScript.",
          ko: "UI를 Template, Zone, Util로만 그려서, 그 UI 전부가 JavaScript로 브라우저에 실려 갑니다.",
        }),
        code: "akan.ssr.module-missing-server-view",
      },
      {
        title: l.trans({ en: "Markup In The Bundle", ko: "번들로 넘어간 마크업" }),
        desc: l.trans({
          en: "A client component wraps a large static subtree around one or two handlers.",
          ko: "클라이언트 컴포넌트가 핸들러 한두 개 때문에 큰 정적 하위 트리까지 통째로 감쌉니다.",
        }),
        code: "akan.ssr.client-static-markup",
      },
    ];

    const termRows: IntroItem[] = [
      {
        name: l.trans({ en: <span>rule</span>, ko: <span className="font-sans">규칙 (rule)</span> }),
        desc: l.trans({
          en: "One check, named `akan.<scope>.<name>`; every warning names the rule that raised it.",
          ko: "`akan.<scope>.<name>` 이름을 가진 검사 하나이며, 경고마다 그 경고를 낸 규칙이 적힙니다.",
        }),
      },
      {
        name: "scope",
        desc: l.trans({
          en: "The group a rule belongs to; there are six, and the output is sorted by scope name.",
          ko: "규칙이 속한 묶음으로 여섯 가지가 있으며, 출력은 scope 이름순으로 정렬됩니다.",
        }),
      },
      {
        name: l.trans({
          en: <span>server render share</span>,
          ko: <span className="font-sans">서버 렌더 비율</span>,
        }),
        desc: l.trans({
          en: "Of the JSX elements in `ui/` and `lib/`, the percentage that renders on the server.",
          ko: "`ui/`와 `lib/`의 JSX 엘리먼트 가운데 서버에서 렌더링되는 비율입니다.",
        }),
      },
    ];

    const commands: CommandReferenceItem[] = [
      {
        name: "quality",
        signature: "akan quality [action] [--format <text|json>]",
        desc: l.trans({
          en: (
            <>
              <span>
                Scan every app and library for code quality warnings, or measure the server/client render balance.
              </span>
              <ul className="my-3 list-disc space-y-1 pl-5">
                <li>
                  <code>scan</code> (default) prints every warning, then the SSR balance and the suggested rules.
                </li>
                <li>
                  <code>ssr</code> prints the SSR balance first, then only the warnings whose scope is <code>ssr</code>.
                </li>
              </ul>
            </>
          ),
          ko: (
            <>
              <span>모든 앱과 라이브러리에서 코드 품질 경고를 찾거나, 서버/클라이언트 렌더 비율을 잽니다.</span>
              <ul className="my-3 list-disc space-y-1 pl-5">
                <li>
                  <code>scan</code>(기본값)은 모든 경고를 출력한 뒤 SSR 비율과 권장 규칙을 이어서 보여 줍니다.
                </li>
                <li>
                  <code>ssr</code>은 SSR 비율을 먼저 출력하고, 경고는 scope가 <code>ssr</code>인 것만 남깁니다.
                </li>
              </ul>
            </>
          ),
        }),
        args: [
          {
            name: "action",
            type: "String",
            required: "no",
            defaultValue: "scan",
            enumOrFlag: "scan | ssr",
            desc: l.trans({
              en: "Which report to print: `scan` covers everything, `ssr` the render balance alone.",
              ko: "출력할 보고서로, `scan`은 전부를, `ssr`은 렌더 비율만 다룹니다.",
            }),
          },
        ],
        options: [
          {
            name: "--format",
            type: "String",
            defaultValue: "text",
            enumOrFlag: "text | json",
            desc: l.trans({
              en: "Short form `-f`; `json` prints the whole result for tools, each warning's `fix` included.",
              ko: "짧게는 `-f`이며, `json`은 도구가 읽도록 각 경고의 `fix`까지 담은 전체 결과를 출력합니다.",
            }),
          },
        ],
        notes: [
          {
            name: l.trans({ en: "where to run", ko: "실행 위치" }),
            desc: l.trans({
              en: "The workspace root, the folder holding `package.json`, `tsconfig.json` and an `apps/`, `libs/` or `pkgs/` folder.",
              ko: "`package.json`, `tsconfig.json`과 `apps/`, `libs/`, `pkgs/` 중 한 폴더가 있는 워크스페이스 루트에서 실행합니다.",
            }),
          },
          {
            name: l.trans({ en: "what is read", ko: "읽는 대상" }),
            desc: l.trans({
              en: "`.ts` and `.tsx` under `apps/` and `libs/` except `.d.ts`, plus every `*.abstract.md`.",
              ko: "`apps/`와 `libs/` 아래의 `.ts`, `.tsx`(`.d.ts` 제외)와 모든 `*.abstract.md`를 읽습니다.",
            }),
          },
          {
            name: l.trans({ en: "what is skipped", ko: "건너뛰는 대상" }),
            desc: l.trans({
              en: "Paths matched by the root `.gitignore`, plus `node_modules` and `.git`.",
              ko: "루트 `.gitignore`에 걸리는 경로와 `node_modules`, `.git`은 읽지 않습니다.",
            }),
          },
          {
            name: l.trans({ en: "exit code", ko: "종료 코드" }),
            desc: l.trans({
              en: "Success whatever it finds, so it runs beside lint and typecheck without becoming a third gate.",
              ko: "무엇을 찾든 성공으로 끝나므로, lint·typecheck 옆에서 돌려도 세 번째 관문이 되지 않습니다.",
            }),
          },
        ],
        examples: `akan quality
akan quality scan
akan quality ssr
akan quality ssr --format json`,
      },
    ];

    const scopes: IntroItem[] = [
      {
        name: "agent",
        href: "#scan-rules",
        desc: l.trans({
          en: "Form fields that publish no agent tool because their setter is wrapped.",
          ko: "setter를 감싸 버려서 에이전트 도구로 공개되지 않는 폼 필드를 찾습니다.",
        }),
      },
      {
        name: "convention",
        href: "#scan-rules",
        desc: l.trans({
          en: "A module file declaring what its role does not allow, such as a helper in `.service.ts`.",
          ko: "`.service.ts` 안의 헬퍼처럼, 모듈 파일이 자기 역할에 맞지 않는 것을 선언한 경우입니다.",
        }),
      },
      {
        name: "file",
        href: "#scan-rules",
        desc: l.trans({
          en: "Per-file hygiene: length, scaffold leftovers, globals, component-file exports, `//!` markers.",
          ko: "파일 단위 위생으로, 길이, 남은 스캐폴드, 전역 선언, 컴포넌트 파일의 export, `//!` 마커를 봅니다.",
        }),
      },
      {
        name: "global",
        href: "#scan-rules",
        desc: l.trans({
          en: "The same exported name, or the same function body, in more than one file.",
          ko: "같은 export 이름이나 같은 함수 본문이 여러 파일에 있는 경우입니다.",
        }),
      },
      {
        name: "layout",
        href: "#scan-rules",
        desc: l.trans({
          en: "Files and folders outside the allowed app, library and module layout.",
          ko: "앱, 라이브러리, 모듈 구조에서 허용되지 않은 자리에 놓인 파일과 폴더입니다.",
        }),
      },
      {
        name: "ssr",
        href: "#server-share",
        desc: l.trans({
          en: "The six render-balance rules, and the only scope `akan quality ssr` keeps.",
          ko: "렌더 비율 규칙 여섯 개이며, `akan quality ssr`은 이 scope만 남깁니다.",
        }),
      },
    ];

    const jsonRows: IntroItem[] = [
      {
        name: "workspaceRoot",
        desc: l.trans({
          en: "Absolute path of the workspace that was scanned.",
          ko: "검사한 워크스페이스의 절대 경로입니다.",
        }),
      },
      {
        name: "scannedFiles",
        desc: l.trans({ en: "How many files were read.", ko: "읽은 파일 수입니다." }),
      },
      {
        name: "warnings",
        desc: l.trans({
          en: "`rule`, `scope`, `severity`, `message` and `fix`, plus `file`, `line` and `locations` when known.",
          ko: "경고마다 `rule`, `scope`, `severity`, `message`, `fix`가 있고, 해당하면 `file`, `line`, `locations`도 붙습니다.",
        }),
      },
      {
        name: "ssrBalance",
        desc: l.trans({
          en: "One entry per row of the balance: `scope`, `serverMass`, `clientMass`, `serverShare` (0 to 1).",
          ko: "비율 표의 행마다 `scope`, `serverMass`, `clientMass`, `serverShare`(0~1)가 들어 있습니다.",
        }),
      },
      {
        name: "suggestedRules",
        desc: l.trans({
          en: "The suggested rules that close the text output, as strings.",
          ko: "텍스트 출력 끝에 나오는 권장 규칙을 문자열 배열로 담습니다.",
        }),
      },
    ];

    const ruleRows: IntroItem[] = [
      {
        name: "akan.agent.unpublished-form-setter",
        desc: l.trans({
          en: "An arrow handler taking a value calls `st.do.set…On…`, so that field publishes no agent tool.",
          ko: "값을 받는 화살표 핸들러가 `st.do.set…On…`을 불러서, 그 필드가 에이전트 도구로 공개되지 않습니다.",
        }),
      },
      {
        name: "akan.convention.<role>",
        desc: l.trans({
          en: "A top-level declaration the module file does not allow; the table below lists what it does.",
          ko: "모듈 파일이 허용하지 않는 최상위 선언이며, 허용되는 선언은 아래 표에 있습니다.",
        }),
      },
      {
        name: ["akan.file.recommended-max-lines", "akan.file.max-lines"],
        desc: l.trans({
          en: "Over 500 lines for a service, 800 for a Template or Zone, 1,000 for a Util, 2,000 for any file.",
          ko: "서비스 500줄, Template·Zone 800줄, Util 1,000줄, 모든 파일 2,000줄을 넘었습니다.",
        }),
      },
      {
        name: "akan.file.abstract-max-lines",
        desc: l.trans({
          en: "An `*.abstract.md` is over 300 lines; keep only what the code cannot show.",
          ko: "`*.abstract.md`가 300줄을 넘었으니, 코드로 드러나지 않는 내용만 남깁니다.",
        }),
      },
      {
        name: "akan.file.class-export-global-declaration",
        desc: l.trans({
          en: "A file that exports a class declares something else at top level, other than `<Class>Options`.",
          ko: "클래스를 export하는 파일이 최상위에 `<Class>Options` 인터페이스 말고 다른 것을 선언했습니다.",
        }),
      },
      {
        name: ["akan.file.component-export", "akan.file.component-internal-declaration"],
        desc: l.trans({
          en: "A component file exports a non-component, or keeps a local type or function besides `<X>Props`.",
          ko: "컴포넌트 파일이 컴포넌트가 아닌 것을 export하거나, `<X>Props` 말고 로컬 타입·함수를 둡니다.",
        }),
      },
      {
        name: "akan.file.bang-comment-in-client",
        desc: l.trans({
          en: "A `//!` or `/*!` marker in browser code, which survives minification; write `// FIXME:`.",
          ko: "브라우저 코드의 `//!`·`/*!` 마커는 압축 후에도 남으므로 `// FIXME:`로 씁니다.",
        }),
      },
      {
        name: "akan.file.placeholder-export",
        desc: l.trans({
          en: "An `index.ts` exports a scaffold placeholder such as `aa`, `dumb` or `someCommonLogic`.",
          ko: "`index.ts`가 `aa`, `dumb`, `someCommonLogic` 같은 스캐폴드 자리표시자를 export합니다.",
        }),
      },
      {
        name: "akan.file.dictionary-stale-text",
        desc: l.trans({
          en: "A dictionary still holds scaffold text such as `Order description`.",
          ko: "사전에 `Order description` 같은 스캐폴드 문구가 남아 있습니다.",
        }),
      },
      {
        name: ["akan.file.global-declaration", "akan.file.window-augmentation", "akan.file.prototype-mutation"],
        desc: l.trans({
          en: "A `declare global`, a `Window` interface or a `.prototype.` write; isolate it in one low-level file.",
          ko: "`declare global`, `Window` 인터페이스, `.prototype.` 수정은 저수준 통합 파일 하나에 모아 둡니다.",
        }),
      },
      {
        name: "akan.global.duplicate-exported-function-name",
        desc: l.trans({
          en: "Two files export a function or class with the same name.",
          ko: "두 파일이 같은 이름의 함수나 클래스를 export합니다.",
        }),
      },
      {
        name: "akan.global.duplicate-exported-function-body",
        desc: l.trans({
          en: "Exports with different names share one body; extract a single helper.",
          ko: "이름이 다른 export들이 같은 본문을 가지고 있으니, 헬퍼 하나로 뽑아냅니다.",
        }),
      },
      {
        name: [
          "akan.layout.app-root-file",
          "akan.layout.app-root-folder",
          "akan.layout.lib-root-file",
          "akan.layout.lib-root-folder",
        ],
        desc: l.trans({
          en: "A file or folder at an app or library root that is not on the allowed list.",
          ko: "앱이나 라이브러리 루트에 허용 목록에 없는 파일이나 폴더가 있습니다.",
        }),
      },
      {
        name: "akan.layout.lib-facet-file",
        desc: l.trans({
          en: "A file directly in `lib/` other than `cnst.ts`, `option.ts` and the other support files.",
          ko: "`lib/` 바로 아래에 `cnst.ts`, `option.ts` 같은 지원 파일이 아닌 파일이 있습니다.",
        }),
      },
      {
        name: "akan.layout.module-ui-file",
        desc: l.trans({
          en: "A `.tsx` in a module folder whose name is not an allowed role, such as `OrderCard.tsx`.",
          ko: "모듈 폴더의 `.tsx` 이름이 허용된 역할이 아닙니다. `OrderCard.tsx` 같은 경우입니다.",
        }),
      },
      {
        name: "akan.ssr.*",
        href: "#server-share",
        desc: l.trans({
          en: "The six render-balance rules, listed in the next section.",
          ko: "렌더 비율 규칙 여섯 개로, 다음 섹션에 정리돼 있습니다.",
        }),
      },
    ];

    const conventionRows: IntroItem[] = [
      {
        name: "order.constant.ts",
        desc: l.trans({
          en: "`OrderInput`, `OrderObject`, `LightOrder`, `Order`, `OrderInsight`, and `enumOf` classes",
          ko: "`OrderInput`, `OrderObject`, `LightOrder`, `Order`, `OrderInsight`, `enumOf` 클래스",
        }),
      },
      { name: "order.dictionary.ts", desc: "`export const dictionary`" },
      { name: "order.document.ts", desc: "`OrderFilter`, `Order`, `OrderModel`" },
      { name: "order.service.ts", desc: "`OrderService`" },
      { name: "order.signal.ts", desc: "`OrderInternal`, `OrderSlice`, `OrderEndpoint`" },
      { name: "order.store.ts", desc: "`OrderStore`" },
    ];

    const ssrRules: IntroItem[] = [
      {
        name: "akan.ssr.unnecessary-use-client",
        desc: l.trans({
          en: 'The file has `"use client"` but no hook, event handler, store or browser API; delete it.',
          ko: '`"use client"`가 있지만 hook, 이벤트 핸들러, store, 브라우저 API를 하나도 쓰지 않으니 이 줄을 지웁니다.',
        }),
      },
      {
        name: "akan.ssr.client-static-component",
        desc: l.trans({
          en: "A component in a client file renders 4+ JSX elements with no client-only capability.",
          ko: "클라이언트 파일의 컴포넌트가 클라이언트 전용 기능 없이 JSX 엘리먼트를 4개 이상 그립니다.",
        }),
      },
      {
        name: "akan.ssr.client-static-markup",
        desc: l.trans({
          en: "10+ elements wrap only one or two interactive touches; the static part belongs on the server.",
          ko: "엘리먼트 10개 이상이 상호작용 한두 개를 감싸고 있으니, 정적인 부분은 서버로 옮깁니다.",
        }),
      },
      {
        name: "akan.ssr.client-mount-load",
        desc: l.trans({
          en: "A `useEffect(…, [])` calls `fetch.*` or a loading `st.do.*` action; the route could load it first.",
          ko: "`useEffect(…, [])`가 `fetch.*`나 데이터를 불러오는 `st.do.*` 액션을 부르는데, 라우트가 먼저 불러올 수 있습니다.",
        }),
      },
      {
        name: "akan.ssr.module-missing-server-view",
        desc: l.trans({
          en: "A module's client files render 12+ elements and it has no server `Unit` or `View`.",
          ko: "모듈의 클라이언트 파일이 엘리먼트를 12개 이상 그리는데, 서버용 `Unit`이나 `View`가 없습니다.",
        }),
      },
      {
        name: "akan.ssr.template-client-state",
        desc: l.trans({
          en: "A `.Template.tsx` calls `useState`, but a Template keeps its form state in the store.",
          ko: "`.Template.tsx`가 `useState`를 부르지만, Template의 폼 상태는 store에 둡니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="quality-cli" title={l.trans({ en: "Quality CLI", ko: "코드 품질 CLI" })}>
          <Docs.Title>{l.trans({ en: "Quality CLI", ko: "코드 품질 CLI" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Lint tells you a line is wrong. <code>akan quality</code> tells you the shape of the codebase is
                    drifting: none of it is a syntax error, and none of it shows until someone measures.
                  </span>
                ),
                ko: (
                  <span>
                    lint는 틀린 줄을 알려 줍니다. <code>akan quality</code>는 코드베이스의 모양이 흐트러지고 있다는 것을
                    알려 줍니다. 문법 오류가 아니라서, 누군가 측정하기 전에는 드러나지 않는 문제들입니다.
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>{l.trans({ en: "What It Catches", ko: "이런 것을 찾습니다" })}</Docs.SubSubTitle>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              {driftCards.map((card) => (
                <div key={card.code} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                  <div className="mb-1 font-semibold text-primary">{card.title}</div>
                  <div className="text-foreground/70 text-sm">{card.desc}</div>
                  <code className={chip}>{card.code}</code>
                </div>
              ))}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    Run it before a review, after a refactor, and after any change to a <code>.tsx</code> file. The
                    render share is the one number a UI change can quietly lower.
                  </span>
                ),
                ko: (
                  <span>
                    리뷰 전, 리팩터링 후, 그리고 <code>.tsx</code> 파일을 고칠 때마다 실행하세요. 렌더 비율은 UI 변경이
                    소리 없이 깎아 먹을 수 있는 유일한 숫자입니다.
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>
              {l.trans({ en: "Words Used On This Page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />
        {commands.map((command) => (
          <CommandReferenceSlide key={command.name} command={command} />
        ))}
        <Divider />

        <Scroll.Slide id="scan-scopes" title={l.trans({ en: "What Scan Reports", ko: "scan이 알려 주는 것" })}>
          <Docs.Title>{l.trans({ en: "What Scan Reports", ko: "scan이 알려 주는 것" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Each warning says where, which rule, what is wrong and how to fix it. After the warnings come the
                    SSR balance and the suggested rules, so one plain <code>akan quality</code> run covers both. A
                    shortened run looks like this:
                  </span>
                ),
                ko: (
                  <span>
                    경고마다 위치, 규칙, 문제, 고치는 법이 적힙니다. 경고 뒤에는 SSR 비율과 권장 규칙이 이어지므로{" "}
                    <code>akan quality</code> 한 번으로 경고와 비율을 모두 확인합니다. 줄여 보면 이런 모양입니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="Terminal"
              language="bash"
              showLineNumbers={false}
              copy={false}
              code={`$ akan quality

Akan Code Quality Scan
workspace: /home/me/acme
scanned files: 412
warnings: 3

Warnings:

apps/koyo/lib/order/Order.Zone.tsx:1:1 - warning akan.file.recommended-max-lines: File has 912 lines. Recommended limit for this file type is 800 lines.
  fix: Split the file by responsibility — move Zones, Utils, or subcomponents into sibling files.
apps/koyo/lib/order/OrderCard.tsx:1:1 - warning akan.layout.module-ui-file: Unexpected database module UI filename "OrderCard.tsx". Expected one of: Order.Template.tsx, Order.Unit.tsx, Order.Util.tsx, Order.View.tsx, Order.Zone.tsx.
  fix: Rename the file to an allowed module UI name, or move it to ui/ if it is not a module component.
apps/koyo/ui/OrderPanel.tsx:12:1 - warning akan.ssr.client-static-markup: Client component "OrderPanel" renders 16 JSX elements around only 1 client-only touch (onClick). Most of this subtree does not need the client bundle.
  fix: Keep the interactive element in the client component and hoist the static subtree into a server component, then accept it as \`children\` or render it through a Unit/View reference.

SSR balance (component files, JSX elements rendered per side):

  apps/koyo: 43% server (163 of 381 JSX elements, 218 client)  <- below the 50% target
  libs/shared: 62% server (460 of 742 JSX elements, 282 client)
  workspace: 55% server (623 of 1123 JSX elements, 500 client)

Suggested quality rules:

  - Keep generated scanSync index files out of hand-written changes; generated indexes should only contain one-depth export statements.
  - ...`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>One line per warning:</strong>{" "}
                      <code>{"<file>:<line>:1 - warning <rule>: <message>"}</code>. A <code>global</code> warning has no
                      single file, so it prints <code>{"<global>"}</code> instead.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>경고 하나에 한 줄입니다:</strong>{" "}
                      <code>{"<file>:<line>:1 - warning <rule>: <message>"}</code>. <code>global</code> 경고는 파일이
                      하나로 정해지지 않아 그 자리에 <code>{"<global>"}</code>이 찍힙니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Indented lines add detail.</strong> <code>note: related location</code> lists each place
                      involved, and <code>fix:</code> says what to change.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>들여 쓴 줄은 덧붙인 정보입니다.</strong> <code>note: related location</code>은 함께 걸린
                      위치를 하나씩, <code>fix:</code>는 고치는 법을 알려 줍니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Sorted by scope name,</strong> then by file and line, so the scopes below appear in this
                      order.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>scope 이름순으로 정렬하고,</strong> 그다음 파일과 줄 순서를 따릅니다. 그래서 아래 표의
                      순서대로 나옵니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Only need the render balance?</strong> <code>akan quality ssr</code> prints it first and
                      keeps only the <code>ssr</code> warnings.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>렌더 비율만 보고 싶다면</strong> <code>akan quality ssr</code>을 씁니다. 비율을 먼저
                      출력하고 <code>ssr</code> 경고만 남깁니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "The Six Scopes", ko: "scope 여섯 가지" })}</Docs.SubSubTitle>
            <Docs.IntroTable type="Scope" items={scopes} />
            <Docs.SubSubTitle>{l.trans({ en: "With --format json", ko: "--format json으로 받으면" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    The JSON result has five fields. <code>akan quality ssr --format json</code> has the same shape,
                    with <code>warnings</code> narrowed to scope <code>ssr</code>.
                  </span>
                ),
                ko: (
                  <span>
                    JSON 결과에는 필드가 다섯 개 있습니다. <code>akan quality ssr --format json</code>도 모양은 같고,{" "}
                    <code>warnings</code>만 scope가 <code>ssr</code>인 것으로 줄어듭니다.
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Field", ko: "필드" })} items={jsonRows} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="scan-rules" title={l.trans({ en: "Rules By Scope", ko: "scope별 규칙" })}>
          <Docs.Title>{l.trans({ en: "Rules By Scope", ko: "scope별 규칙" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Look up a rule id from the output here. Rules that share a cause share a row.",
                ko: "출력에 나온 규칙 id를 여기서 찾아보세요. 원인이 같은 규칙은 한 행에 묶었습니다.",
              })}
            </div>
            <Docs.IntroTable
              type={l.trans({ en: "Rule", ko: "규칙" })}
              descLabel={l.trans({ en: "Fires when", ko: "이럴 때 뜹니다" })}
              items={ruleRows}
            />
            <Docs.SubSubTitle>
              {l.trans({ en: "What Each Module File May Declare", ko: "모듈 파일마다 허용되는 선언" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>{"akan.convention.<role>"}</code> fires on any top-level declaration outside this list. Shown
                    for a model named <code>Order</code>:
                  </span>
                ),
                ko: (
                  <span>
                    <code>{"akan.convention.<role>"}</code>은 이 목록 밖의 최상위 선언마다 뜹니다. 모델 이름이{" "}
                    <code>Order</code>일 때의 예입니다:
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable
              type={l.trans({ en: "File", ko: "파일" })}
              descLabel={l.trans({ en: "Allowed at top level", ko: "최상위에 둘 수 있는 것" })}
              items={conventionRows}
            />
            <Docs.SubSubTitle>
              {l.trans({ en: "What The Duplicate Checks Skip", ko: "중복 검사가 건너뛰는 것" })}
            </Docs.SubSubTitle>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Expected name repeats are exempt.</strong> Files in <code>ui/</code> and{" "}
                      <code>page/</code>, and module files, may reuse a name. An <code>enumOf</code> class in a{" "}
                      <code>.constant.ts</code> may not.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>당연히 겹치는 이름은 제외합니다.</strong> <code>ui/</code>, <code>page/</code>의 파일과
                      모듈 파일은 이름이 겹쳐도 됩니다. 다만 <code>.constant.ts</code>의 <code>enumOf</code> 클래스는
                      이름이 겹치면 안 됩니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Short bodies are not compared.</strong> A body counts as a duplicate only at 80 characters
                      or more, with whitespace collapsed.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>짧은 본문은 비교하지 않습니다.</strong> 공백을 줄인 뒤 80자 이상인 본문만 중복으로 봅니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="server-share" title={l.trans({ en: "Server Render Share", ko: "서버 렌더 비율" })}>
          <Docs.Title>{l.trans({ en: "Server Render Share", ko: "서버 렌더 비율" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "The share is the part of your component JSX that renders on the server. Treat 50% as the floor and a falling share as a regression.",
                ko: "렌더 비율은 컴포넌트 JSX 가운데 서버에서 렌더링되는 몫입니다. 50%를 바닥으로 삼고, 비율이 떨어지면 회귀로 봅니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "If a change moved markup to the client, say why in the PR or move it back.",
                ko: "변경이 마크업을 클라이언트로 옮겼다면, PR에 이유를 적거나 되돌립니다.",
              })}
            </div>
            <Docs.SubSubTitle>{l.trans({ en: "How It Is Counted", ko: "세는 방법" })}</Docs.SubSubTitle>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Elements, not files.</strong> Each JSX tag, opening or self-closing, counts as one
                      element.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>파일이 아니라 엘리먼트를 셉니다.</strong> 여는 태그든 스스로 닫는 태그든 JSX 태그 하나가
                      엘리먼트 하나입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The directive picks the side.</strong> Every element in a file that starts with{" "}
                      <code>{'"use client"'}</code> counts as client; all others count as server.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>편은 지시문이 정합니다.</strong> <code>{'"use client"'}</code>로 시작하는 파일의
                      엘리먼트는 모두 클라이언트로, 나머지는 서버로 셉니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>One row per app and library,</strong> plus a <code>workspace</code> total when there are
                      two or more.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>앱과 라이브러리마다 한 행이고,</strong> 두 개 이상이면 <code>workspace</code> 합계 행이
                      붙습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A row under 50%</strong> ends with <code>{"<- below the 50% target"}</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>50% 미만인 행</strong> 끝에는 <code>{"<- below the 50% target"}</code>이 붙습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>akan quality ssr</code> prints the share first, then only the <code>ssr</code> warnings:
                  </span>
                ),
                ko: (
                  <span>
                    <code>akan quality ssr</code>은 비율을 먼저 보여 주고, 그 뒤에 <code>ssr</code> 경고만 출력합니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="Terminal"
              language="bash"
              showLineNumbers={false}
              copy={false}
              code={`$ akan quality ssr

Akan SSR Balance Scan
workspace: /home/me/acme
scanned files: 412
ssr warnings: 1

Server render share (component files, JSX elements rendered per side):

  apps/koyo: 43% server (163 of 381 JSX elements, 218 client)  <- below the 50% target
  libs/shared: 62% server (460 of 742 JSX elements, 282 client)
  workspace: 55% server (623 of 1123 JSX elements, 500 client)

Warnings:

apps/koyo/ui/OrderPanel.tsx:12:1 - warning akan.ssr.client-static-markup: Client component "OrderPanel" renders 16 JSX elements around only 1 client-only touch (onClick). Most of this subtree does not need the client bundle.
  fix: Keep the interactive element in the client component and hoist the static subtree into a server component, then accept it as \`children\` or render it through a Unit/View reference.`}
            />
            <Docs.Alert>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Only <code>ui/</code> and <code>lib/</code> are measured.
                    </strong>{" "}
                    The share and the six rules read <code>.tsx</code> files under <code>apps|libs/*/ui/</code> and{" "}
                    <code>apps|libs/*/lib/</code>, minus tests. <code>page/</code>, <code>webkit/</code>,{" "}
                    <code>srvkit/</code> and <code>common/</code> are left out, so a route file never moves the number,
                    and neither does a <code>{'"use client"'}</code> added there.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>ui/</code>와 <code>lib/</code>만 잽니다.
                    </strong>{" "}
                    비율과 규칙 여섯 개는 <code>apps|libs/*/ui/</code>와 <code>apps|libs/*/lib/</code> 아래의{" "}
                    <code>.tsx</code>만 읽고 테스트는 뺍니다. <code>page/</code>, <code>webkit/</code>,{" "}
                    <code>srvkit/</code>, <code>common/</code>은 대상이 아니므로 라우트 파일은 이 숫자를 움직이지
                    못하고, 거기에 붙인 <code>{'"use client"'}</code>도 마찬가지입니다.
                  </span>
                ),
              })}
            </Docs.Alert>
            <Docs.SubSubTitle>{l.trans({ en: "The Six ssr Rules", ko: "ssr 규칙 여섯 가지" })}</Docs.SubSubTitle>
            <Docs.IntroTable
              type={l.trans({ en: "Rule", ko: "규칙" })}
              descLabel={l.trans({ en: "Fires when", ko: "이럴 때 뜹니다" })}
              items={ssrRules}
            />
            <Docs.SubSubTitle>{l.trans({ en: "Not Flagged On Purpose", ko: "일부러 잡지 않는 것" })}</Docs.SubSubTitle>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Third-party code.</strong> A file importing a package, <code>st</code> or{" "}
                      <code>fetch</code> is never told to drop <code>{'"use client"'}</code>, and a component that
                      renders a package's component is skipped.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>서드파티 코드.</strong> 패키지나 <code>st</code>, <code>fetch</code>를 import하는 파일은{" "}
                      <code>{'"use client"'}</code>를 지우라고 하지 않고, 패키지 컴포넌트를 그리는 컴포넌트도
                      건너뜁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A directive required by role.</strong> A module's <code>Zone</code>, <code>Template</code>{" "}
                      and <code>Util</code>, and an <code>index_.tsx</code> <code>lazy()</code> boundary, are never an
                      unnecessary <code>{'"use client"'}</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>역할상 필요한 지시문.</strong> 모듈의 <code>Zone</code>, <code>Template</code>,{" "}
                      <code>Util</code>과 <code>index_.tsx</code>의 <code>lazy()</code> 경계는 불필요한{" "}
                      <code>{'"use client"'}</code>로 잡지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Loads the user starts.</strong> A fetch inside <code>onClick</code>, or an effect with
                      dependencies, is not a mount-time load.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>사용자가 시작한 로드.</strong> <code>onClick</code> 안의 fetch나 의존성 배열이 있는
                      effect는 마운트 시점 로드가 아닙니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Service and scalar modules.</strong> Folders starting with <code>_</code> under{" "}
                      <code>lib/</code> are never asked for a <code>Unit</code> or <code>View</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>서비스·스칼라 모듈.</strong> <code>lib/</code> 아래 <code>_</code>로 시작하는 폴더에는{" "}
                      <code>Unit</code>이나 <code>View</code>를 요구하지 않습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "Related Pages", ko: "관련 페이지" })}</Docs.SubSubTitle>
            <Docs.LinkGrid
              items={[
                {
                  href: "/docs/arch/frontend#quality-ssr",
                  title: l.trans({ en: "Architecture · Frontend", ko: "아키텍처 · 프런트엔드" }),
                  desc: l.trans({
                    en: "Each ssr rule with the code that triggers it and the fix that clears it.",
                    ko: "ssr 규칙마다 경고를 부르는 코드와 그것을 없애는 수정을 보여 줍니다.",
                  }),
                },
                {
                  href: "/references/cli/workspace#lint",
                  title: "akan lint",
                  desc: l.trans({
                    en: "Formats and lints one app, library or package with Biome.",
                    ko: "앱, 라이브러리, 패키지 하나를 Biome으로 포맷하고 린트합니다.",
                  }),
                },
                {
                  href: "/references/cli/application#typecheck",
                  title: "akan typecheck",
                  desc: l.trans({
                    en: "Typechecks one app with TypeScript.",
                    ko: "TypeScript로 앱 하나의 타입을 검사합니다.",
                  }),
                },
              ]}
            />
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
