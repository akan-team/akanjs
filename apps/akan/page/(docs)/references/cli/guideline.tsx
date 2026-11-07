import { usePage } from "@apps/akan/client";
import { type CommandReferenceItem, CommandReferenceSlide, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "CLI 레퍼런스: Guideline | Akan.js" : "CLI Reference: Guideline | Akan.js";
    const description =
      lang === "ko"
        ? "에이전트가 이름으로 받아 보는 지침 문서로, 영역이나 파일 역할마다 하나씩 있습니다."
        : "The instruction documents agents fetch by name, one per area or file role.";
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

    const termRows = [
      {
        name: <span className="font-sans">{l.trans({ en: "guideline", ko: "가이드라인" })}</span>,
        desc: l.trans({
          en: "An instruction document for coding agents that ships inside the Akan CLI, one per area or file role.",
          ko: "Akan CLI에 함께 들어 있는 코딩 에이전트용 지침 문서로, 영역이나 파일 역할마다 하나씩 있습니다.",
        }),
      },
      {
        name: "AGENTS.md",
        desc: l.trans({
          en: "The guide an agent reads on every task: the short rules, plus which guideline covers the rest.",
          ko: "에이전트가 작업마다 읽는 안내서로, 짧은 규칙만 담고 나머지는 가이드라인 이름으로 안내합니다.",
        }),
      },
      {
        name: "MCP",
        desc: l.trans({
          en: "Model Context Protocol, the standard way a coding agent calls tools outside itself.",
          ko: "코딩 에이전트가 바깥의 툴을 부르는 표준 방식인 Model Context Protocol입니다.",
        }),
      },
      {
        name: "get_guideline",
        desc: l.trans({
          en: "The MCP tool that returns one guideline by name.",
          ko: "이름으로 가이드라인 하나를 돌려주는 MCP 툴입니다.",
        }),
      },
    ];

    const pathRows = [
      {
        name: "akan guideline show <name>",
        desc: l.trans({
          en: "A person reads one guideline in the terminal, as Markdown.",
          ko: "사람이 터미널에서 가이드라인 하나를 Markdown으로 읽습니다.",
        }),
      },
      {
        name: "get_guideline",
        desc: l.trans({
          en: "The tool the `akan code` agent and editor agents on `akan mcp` use to fetch one guideline.",
          ko: "`akan code` 에이전트와 `akan mcp`에 연결한 에디터 에이전트가 가이드라인 하나를 받는 툴입니다.",
        }),
      },
      {
        name: "akan://guidelines/<name>",
        desc: l.trans({
          en: "An MCP client finds one resource per guideline in its resource list.",
          ko: "MCP 클라이언트의 리소스 목록에 가이드라인마다 리소스가 하나씩 있습니다.",
        }),
      },
      {
        name: "akan agent install",
        desc: l.trans({
          en: "Writes `conventions` as the `AGENTS.md` core, the path rules and the skills, each guideline under the skill that uses it.",
          ko: "`conventions`를 `AGENTS.md` 핵심과 경로 규칙, 스킬로 써 두고, 가이드라인은 그것을 쓰는 스킬 밑에 둡니다.",
        }),
      },
    ];

    const command: CommandReferenceItem = {
      name: "guideline",
      signature: "akan guideline <action> [name]",
      desc: l.trans({
        en: "Lists the guidelines bundled with the CLI, or prints one of them as Markdown.\nUse it when an agent, a documentation tool or a contributor needs more depth on one area than `AGENTS.md` carries.",
        ko: "CLI에 들어 있는 가이드라인 목록을 보여 주거나, 그중 하나를 Markdown으로 출력합니다.\n에이전트, 문서 도구, 기여자가 한 영역에 대해 `AGENTS.md`보다 깊은 내용이 필요할 때 씁니다.",
      }),
      args: [
        {
          name: "action",
          type: "String",
          required: "yes",
          enumOrFlag: "list | show",
          desc: l.trans({
            en: "`list` prints every guideline name, one per line; `show` prints one guideline.",
            ko: "`list`는 가이드라인 이름을 한 줄에 하나씩 모두 출력하고, `show`는 가이드라인 하나를 출력합니다.",
          }),
        },
        {
          name: "name",
          type: "String",
          desc: l.trans({
            en: "Guideline to print, such as `framework`, `moduleOverview` or `modelSignal`; required for `show`.",
            ko: "`show`로 출력할 가이드라인 이름으로, `framework`, `moduleOverview`, `modelSignal` 등이 있고 `show`에는 꼭 필요합니다.",
          }),
        },
      ],
      notes: [
        {
          name: l.trans({ en: "Read-only", ko: "읽기 전용" }),
          desc: l.trans({
            en: "Guidelines are files installed with the CLI; the command reads them and never writes.",
            ko: "가이드라인은 CLI와 함께 설치되는 파일이며, 이 명령은 읽기만 하고 쓰지 않습니다.",
          }),
        },
        {
          name: l.trans({ en: "Same text as agents", ko: "에이전트와 같은 내용" }),
          desc: l.trans({
            en: "MCP `get_guideline` and `akan guideline show` read the same bundled files.",
            ko: "MCP `get_guideline`과 `akan guideline show`는 같은 가이드라인 파일을 읽습니다.",
          }),
        },
        {
          name: l.trans({ en: "Unknown name", ko: "없는 이름" }),
          desc: l.trans({
            en: "`show` with a name that does not exist fails with an error listing every valid name.",
            ko: "`show`에 없는 이름을 주면, 쓸 수 있는 이름을 모두 나열한 오류로 끝납니다.",
          }),
        },
        {
          name: l.trans({ en: "Version", ko: "버전" }),
          desc: l.trans({
            en: "The text is the installed CLI's own, so it changes when you upgrade the CLI.",
            ko: "내용은 설치된 CLI에 들어 있는 그대로라서, CLI를 업그레이드하면 함께 바뀝니다.",
          }),
        },
      ],
      examples: `akan guideline list
akan guideline show framework
akan guideline show modelSignal
akan guideline show ssrRule`,
    };

    const workspaceRows = [
      {
        name: "framework",
        desc: l.trans({
          en: "The shortest overview: what apps, libs and pkgs own, and the layer order of a module.",
          ko: "apps·libs·pkgs가 맡는 일과 모듈의 레이어 순서만 담은 가장 짧은 개요입니다.",
        }),
      },
      {
        name: "conventions",
        desc: l.trans({
          en: "The full convention set: the core `AGENTS.md` carries, then every path rule.",
          ko: "컨벤션 전체입니다. `AGENTS.md`에 들어가는 핵심과 경로 규칙을 모두 담습니다.",
        }),
      },
      {
        name: "workspaceRecipes",
        desc: l.trans({
          en: "Step-by-step recipes for frequent changes, and the API generated at each layer.",
          ko: "자주 하는 변경의 단계별 예시와, 레이어마다 자동으로 생기는 API 목록입니다.",
        }),
      },
      {
        name: "moduleOverview",
        desc: l.trans({
          en: "Which file of a database module owns what, and the order a module grows in.",
          ko: "데이터베이스 모듈에서 어느 파일이 무엇을 맡는지와, 모듈을 키워 가는 순서입니다.",
        }),
      },
    ];

    const areaRows = [
      {
        name: "ssrRule",
        desc: l.trans({
          en: 'When a `.tsx` file earns `"use client"`, and how to keep markup on the server.',
          ko: '`.tsx` 파일에 `"use client"`가 필요한 경우와, 마크업을 서버에 두는 방법입니다.',
        }),
      },
      {
        name: "runtimeRule",
        desc: l.trans({
          en: "Web surfaces, route prefixes, processes, logging, the Docker image and shipped assets.",
          ko: "SSR·CSR 제공 범위, API 경로 prefix, 프로세스 구성, 로깅, Docker 이미지, 함께 배포되는 에셋입니다.",
        }),
      },
      {
        name: "queryRule",
        desc: l.trans({
          en: "Filters, slices and hydration, full-text search, and cascade removal.",
          ko: "필터, 슬라이스와 하이드레이션, 전문 검색, 연쇄 삭제(cascade)입니다.",
        }),
      },
      {
        name: "transportRule",
        desc: l.trans({
          en: "Guards on HTTP and websocket, socket identity and cleanup, binary pubsub, mutation verbs.",
          ko: "HTTP·웹소켓 공통 가드, 소켓 식별과 정리, 바이너리 pubsub, mutation의 HTTP 메서드입니다.",
        }),
      },
      {
        name: "mcpRule",
        desc: l.trans({
          en: "Which endpoints agents see over MCP, `option.setMcp`, OAuth sign-in and page prompts.",
          ko: "MCP로 에이전트에게 보이는 엔드포인트, `option.setMcp` 설정, OAuth 로그인, 페이지 프롬프트입니다.",
        }),
      },
      {
        name: "agentRule",
        desc: l.trans({
          en: "The in-page agent: `<Agent.Chat />`, `st.tool`, forms, and what an agent may read.",
          ko: "페이지 안 에이전트의 `<Agent.Chat />`, `st.tool`, 폼, 에이전트가 읽을 수 있는 범위를 다룹니다.",
        }),
      },
      {
        name: "fieldRule",
        desc: l.trans({
          en: "The `field()` helper and its options, for constant and scalar constant files.",
          ko: "모델 상수와 스칼라 상수 파일에서 쓰는 `field()` 헬퍼와 그 옵션입니다.",
        }),
      },
      {
        name: "cssRule",
        desc: l.trans({
          en: "Semantic color tokens, the theme in `styles.css`, and a lib's own `tokens.css`.",
          ko: "시맨틱 색상 토큰, `styles.css`의 테마 선언, 라이브러리 전용 `tokens.css`입니다.",
        }),
      },
      {
        name: "componentRule",
        desc: l.trans({
          en: "Shared UI rules, and re-skinning `akanjs/ui` components with `_overrides.tsx`.",
          ko: "공통 UI 규칙과, `_overrides.tsx`로 `akanjs/ui` 컴포넌트를 바꿔 끼우는 방법입니다.",
        }),
      },
      {
        name: "recipeRule",
        desc: l.trans({
          en: "Using and authoring Tailwind-variant recipes, so a look is written once.",
          ko: "같은 룩을 한 곳에만 두도록 Tailwind variant 레시피를 쓰고 만드는 규칙입니다.",
        }),
      },
    ];

    const fileRows = [
      {
        name: "modelConstant",
        file: "<model>.constant.ts",
        desc: l.trans({
          en: "The data shape every layer shares, from Input to the full model.",
          ko: "Input부터 전체 모델까지, 모든 레이어가 함께 쓰는 데이터 형태입니다.",
        }),
      },
      {
        name: "modelDictionary",
        file: "<model>.dictionary.ts",
        desc: l.trans({
          en: "Labels and text for fields, enums, queries, slices, endpoints and errors.",
          ko: "필드, enum, 쿼리, 슬라이스, 엔드포인트, 오류의 라벨과 문구입니다.",
        }),
      },
      {
        name: "modelDocument",
        file: "<model>.document.ts",
        desc: l.trans({
          en: "Filters, document chain methods, collection helpers and indexes.",
          ko: "필터, 문서 체인 메서드, 컬렉션 헬퍼, 인덱스입니다.",
        }),
      },
      {
        name: "modelService",
        file: "<model>.service.ts",
        desc: l.trans({
          en: "Business workflows: what to load, which methods to chain, when to save.",
          ko: "무엇을 불러와 어떤 메서드를 엮고 언제 저장할지 정하는 비즈니스 흐름입니다.",
        }),
      },
      {
        name: "modelSignal",
        file: "<model>.signal.ts",
        desc: l.trans({
          en: "The callable API: internal jobs, slices, endpoints and their guards.",
          ko: "내부 작업, 슬라이스, 엔드포인트와 그 가드로 이루어진, 호출할 수 있는 API입니다.",
        }),
      },
      {
        name: "modelStore",
        file: "<model>.store.ts",
        desc: l.trans({
          en: "Client state for forms, lists and details, and the actions the UI calls.",
          ko: "폼·목록·상세의 클라이언트 상태와, UI가 부르는 액션입니다.",
        }),
      },
      {
        name: "modelTemplate",
        file: "<Model>.Template.tsx",
        desc: l.trans({
          en: "Form fragments bound to the store's form state and setters.",
          ko: "스토어의 폼 상태와 setter에 연결된 폼 조각입니다.",
        }),
      },
      {
        name: "modelUnit",
        file: "<Model>.Unit.tsx",
        desc: l.trans({
          en: "Compact displays of the light model, such as cards, rows and badges.",
          ko: "카드, 행, 배지처럼 라이트 모델을 작게 보여 주는 표시 요소입니다.",
        }),
      },
      {
        name: "modelView",
        file: "<Model>.View.tsx",
        desc: l.trans({
          en: "Full detail displays for detail pages and view modals.",
          ko: "상세 페이지와 보기 모달에 쓰는 전체 상세 화면입니다.",
        }),
      },
      {
        name: "modelUtil",
        file: "<Model>.Util.tsx",
        desc: l.trans({
          en: "Small model-specific controls, such as action buttons, toolbars and dialogs.",
          ko: "액션 버튼, 툴바, 대화상자처럼 모델 전용으로 쓰는 작은 컨트롤입니다.",
        }),
      },
      {
        name: "modelZone",
        file: "<Model>.Zone.tsx",
        desc: l.trans({
          en: "Page sections that compose loaders, lists, views and templates.",
          ko: "로더, 목록, 뷰, 템플릿을 묶어 만드는 페이지 구획입니다.",
        }),
      },
      {
        name: "scalarModule",
        file: "lib/__scalar/<scalar>/",
        desc: l.trans({
          en: "When a value is a scalar rather than a module, and what its folder holds.",
          ko: "값을 모듈이 아닌 스칼라로 둘 때와, 스칼라 폴더에 들어가는 파일입니다.",
        }),
      },
      {
        name: "scalarConstant",
        file: "<scalar>.constant.ts",
        desc: l.trans({
          en: "A small embedded value object that reads clearly without its parent model.",
          ko: "부모 모델 없이도 뜻이 통하는 작은 내장 값 객체입니다.",
        }),
      },
      {
        name: "scalarDictionary",
        file: "<scalar>.dictionary.ts",
        desc: l.trans({
          en: "Labels and descriptions for a scalar's fields and enum values.",
          ko: "스칼라 필드와 enum 값의 라벨과 설명입니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="guideline-cli" title={l.trans({ en: "Guideline CLI", ko: "가이드라인 CLI" })}>
          <Docs.Title>{l.trans({ en: "Guideline CLI", ko: "가이드라인 CLI" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Guidelines are instruction documents for coding agents that ship inside the Akan CLI.{" "}
                    <code>akan guideline</code> prints them in the terminal; it calls no LLM and changes no file.
                  </span>
                ),
                ko: (
                  <span>
                    가이드라인은 Akan CLI에 함께 들어 있는 코딩 에이전트용 지침 문서입니다. <code>akan guideline</code>
                    은 이 문서를 터미널에 출력할 뿐, LLM을 부르거나 파일을 바꾸지 않습니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: "Reach for it when one module file, scalar file, UI pattern or framework-wide rule needs the most specific instruction there is.",
                ko: "모듈 파일, 스칼라 파일, UI 패턴, 프레임워크 전반의 규칙 가운데 하나를 가장 구체적인 지침으로 확인하고 싶을 때 씁니다.",
              })}
            </div>
            <Docs.SubSubTitle>
              {l.trans({ en: "Words Used On This Page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
            <Docs.SubSubTitle>
              {l.trans({ en: "Where The Same Text Is Read", ko: "같은 내용을 읽는 경로" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "Every path below reads the same files, so a person and an agent see the same words.",
                ko: "아래 경로는 모두 같은 파일을 읽습니다. 그래서 사람과 에이전트가 보는 내용이 같습니다.",
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Path", ko: "경로" })} items={pathRows} />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>AGENTS.md is a copy.</strong> It is written when you run <code>akan agent install</code>.
                      Every other path reads the installed CLI each time.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>AGENTS.md는 복사본입니다.</strong> <code>akan agent install</code>을 실행한 시점에 쓰이고,
                      나머지 경로는 매번 설치된 CLI에서 읽습니다.
                    </>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>Agents fetch before a deep pass.</strong> <code>AGENTS.md</code> names the guideline for
                      each area, and the agent loads it with <code>get_guideline</code> before a larger change there.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>에이전트는 깊이 손대기 전에 불러옵니다.</strong> <code>AGENTS.md</code>가 영역마다
                      가이드라인 이름을 알려 주고, 에이전트는 그 영역을 크게 바꾸기 전에 <code>get_guideline</code>으로
                      불러옵니다.
                    </>
                  ),
                })}
              </li>
            </ul>
            <Docs.LinkGrid
              items={[
                {
                  href: "/references/cli/context#mcp-tools",
                  title: l.trans({ en: "MCP Tools And Resources", ko: "MCP 툴과 리소스" }),
                  desc: l.trans({
                    en: "Every tool `akan mcp` offers, `get_guideline` included.",
                    ko: "`get_guideline`을 포함해 `akan mcp`가 제공하는 툴 전체입니다.",
                  }),
                },
                {
                  href: "/references/cli/agent#agent",
                  title: "agent install",
                  desc: l.trans({
                    en: "Writes and refreshes `AGENTS.md` and the editor pointers.",
                    ko: "`AGENTS.md`와 에디터용 포인터 파일을 쓰고 갱신합니다.",
                  }),
                },
              ]}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />
        <CommandReferenceSlide command={command} />
        <Divider />
        <Scroll.Slide id="guideline-list" title={l.trans({ en: "Guideline List", ko: "가이드라인 목록" })}>
          <Docs.Title>{l.trans({ en: "Guideline List", ko: "가이드라인 목록" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    These are the names <code>akan guideline list</code> prints, grouped by what they cover. The list
                    follows the installed CLI, so trust its output over this page.
                  </span>
                ),
                ko: (
                  <span>
                    <code>akan guideline list</code>가 출력하는 이름을 다루는 범위별로 묶었습니다. 목록은 설치된 CLI를
                    따르므로, 이 페이지보다 명령의 출력이 정확합니다.
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>{l.trans({ en: "Whole Workspace", ko: "워크스페이스 전체" })}</Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Guideline", ko: "가이드라인" })} items={workspaceRows} />
            <Docs.SubSubTitle>{l.trans({ en: "Deep Dives By Area", ko: "영역별 심화 규칙" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "Read the one for an area before a larger change there.",
                ko: "그 영역을 크게 바꾸기 전에 해당 가이드라인을 읽습니다.",
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Guideline", ko: "가이드라인" })} items={areaRows} />
            <Docs.SubSubTitle>{l.trans({ en: "One Per Module File", ko: "모듈 파일별" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "One guideline per file role, for database modules and scalars.",
                ko: "데이터베이스 모듈과 스칼라의 파일 역할마다 가이드라인이 하나씩 있습니다.",
              })}
            </div>
            <Docs.IntroTable
              type={l.trans({ en: "Guideline", ko: "가이드라인" })}
              items={fileRows.map((row) => ({
                name: row.name,
                desc: (
                  <>
                    <code>{row.file}</code>
                    <div>{row.desc}</div>
                  </>
                ),
              }))}
            />
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
