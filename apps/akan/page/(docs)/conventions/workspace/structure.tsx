import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "워크스페이스: 구조 | Akan.js" : "Workspace: Structure | Akan.js";
    const description =
      lang === "ko"
        ? "워크스페이스를 이루는 요소와, 전체에 한 번에 작용하는 명령."
        : "What a workspace contains, and the commands that act on all of it at once.";
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

    const bulletList = "my-4 list-disc space-y-2 pl-5";

    const folderColumns = [
      { key: "apps", label: "apps/", code: true },
      { key: "libs", label: "libs/", code: true },
      { key: "pkgs", label: "pkgs/", code: true },
    ];

    const folderGroups = [
      {
        label: l.trans({ en: "Runs as one product", ko: "제품 하나로 실행되는 코드" }),
        rows: [
          {
            name: (
              <span className="font-sans">
                {l.trans({
                  en: "customer site · admin portal · brand app",
                  ko: "고객 사이트 · 관리자 포털 · 브랜드 앱",
                })}
              </span>
            ),
            desc: l.trans({
              en: "A product you run and deploy on its own.",
              ko: "따로 실행하고 배포하는 제품입니다.",
            }),
            marks: { apps: true },
          },
          {
            name: (
              <span className="font-sans">
                {l.trans({ en: "business code one app uses", ko: "앱 하나만 쓰는 비즈니스 코드" })}
              </span>
            ),
            desc: l.trans({
              en: "Its pages, modules and UI stay inside that app.",
              ko: "그 앱의 페이지, 모듈, UI는 앱 안에 둡니다.",
            }),
            marks: { apps: true },
          },
        ],
      },
      {
        label: l.trans({ en: "Shared by several apps", ko: "여러 앱이 함께 쓰는 코드" }),
        rows: [
          {
            name: (
              <span className="font-sans">
                {l.trans({ en: "auth · upload · billing · notification", ko: "인증 · 업로드 · 결제 · 알림" })}
              </span>
            ),
            desc: l.trans({
              en: "A common domain that more than one product needs.",
              ko: "여러 제품에 똑같이 필요한 공통 도메인입니다.",
            }),
            marks: { libs: true },
          },
          {
            name: (
              <span className="font-sans">{l.trans({ en: "shared utilities and UI", ko: "공통 유틸리티와 UI" })}</span>
            ),
            desc: l.trans({
              en: "Helpers and components that several apps import.",
              ko: "여러 앱이 import하는 헬퍼와 컴포넌트입니다.",
            }),
            marks: { libs: true },
          },
        ],
      },
      {
        label: l.trans({ en: "Akan itself, or an installable package", ko: "Akan 자체, 또는 설치형 패키지" }),
        rows: [
          {
            name: (
              <span className="font-sans">
                {l.trans({ en: "framework · CLI · devkit · runtime", ko: "프레임워크 · CLI · devkit · 런타임" })}
              </span>
            ),
            desc: l.trans({
              en: "Code that belongs to Akan itself, and package-level tooling.",
              ko: "Akan 자체에 속한 코드와 패키지 수준의 도구입니다.",
            }),
            marks: { pkgs: true },
          },
          {
            name: <span className="font-sans">{l.trans({ en: "a standalone package", ko: "독립 패키지" })}</span>,
            desc: l.trans({
              en: "Code that should behave like a package you install.",
              ko: "설치해서 쓰는 패키지처럼 동작해야 하는 코드입니다.",
            }),
            marks: { pkgs: true },
          },
        ],
      },
    ];

    const rootFileRows = [
      {
        name: ".env",
        desc: l.trans({
          en: "Optional workspace-wide settings such as `AKAN_PUBLIC_ENV` and the serve domain, kept out of git.",
          ko: "`AKAN_PUBLIC_ENV`, 서비스 도메인 같은 워크스페이스 공통 설정으로, 없어도 되며 git에는 올리지 않습니다.",
        }),
      },
      {
        name: "package.json",
        desc: l.trans({
          en: "Root dependencies and the `bun run` scripts such as `dev`, `lint`, `test` and `build`.",
          ko: "루트 의존성과 `dev`, `lint`, `test`, `build` 같은 `bun run` 스크립트입니다.",
        }),
      },
      {
        name: "tsconfig.json",
        desc: l.trans({
          en: "TypeScript settings and the `@apps/*` and `@libs/*` import aliases.",
          ko: "TypeScript 설정과 `@apps/*`, `@libs/*` import 별칭입니다.",
        }),
      },
      {
        name: "biome.json",
        desc: l.trans({
          en: "One set of format, import and lint rules for every app, lib and package.",
          ko: "모든 앱, 라이브러리, 패키지에 똑같이 적용하는 포맷·import·린트 규칙입니다.",
        }),
      },
      {
        name: "bunfig.toml",
        desc: l.trans({
          en: "Bun's own config, which adds the Tailwind plugin and the `AKAN_PUBLIC_*` browser env prefix.",
          ko: "Tailwind 플러그인과 브라우저용 환경 변수 접두사 `AKAN_PUBLIC_*`를 지정하는 Bun 설정입니다.",
        }),
      },
      {
        name: "akan.config.ts",
        desc: l.trans({
          en: "Optional settings that belong to no app: `subspace` mirrors, the `pipeline` around every app, the `cloud` host.",
          ko: "어느 앱에도 속하지 않는 선택 설정입니다. `subspace` 미러, 모든 앱을 감싸는 `pipeline`, `cloud` 호스트입니다.",
        }),
      },
      {
        name: ["AGENTS.md", "CLAUDE.md"],
        desc: l.trans({
          en: "Coding-agent guide; `CLAUDE.md` points to `AGENTS.md`, which `akan agent install` refreshes.",
          ko: "코딩 에이전트용 가이드로, `CLAUDE.md`는 `akan agent install`이 갱신하는 `AGENTS.md`를 불러옵니다.",
        }),
      },
    ];

    const createRows = [
      {
        command: "akan create-workspace <name>",
        result: l.trans({
          en: "A new workspace folder with its first app, agent rules and MCP config.",
          ko: "첫 앱, 에이전트 규칙, MCP 설정까지 갖춘 새 워크스페이스 폴더입니다.",
        }),
      },
      {
        command: "akan create-application <app-name>",
        result: l.trans({
          en: "A runnable app in `apps/<app-name>/`.",
          ko: "`apps/<app-name>/`에 실행 가능한 앱이 생깁니다.",
        }),
      },
      {
        command: "akan create-library <lib-name>",
        result: l.trans({
          en: "A library that apps can share, in `libs/<lib-name>/`.",
          ko: "`libs/<lib-name>/`에 여러 앱이 공유할 라이브러리가 생깁니다.",
        }),
      },
      {
        command: "akan create-package --name <pkg-name>",
        result: l.trans({
          en: "`pkgs/<pkg-name>/`, plus a `<pkg-name>` import alias in `tsconfig.json`.",
          ko: "`pkgs/<pkg-name>/`이 생기고, `tsconfig.json`에 `<pkg-name>` import 별칭이 추가됩니다.",
        }),
      },
    ];

    const upkeepColumns = [
      { key: "sync", label: "sync", code: true },
      { key: "lint", label: "lint", code: true },
    ];

    const upkeepGroups = [
      {
        label: l.trans({ en: "One target", ko: "대상 하나" }),
        rows: [
          {
            name: "akan lint <target>",
            desc: l.trans({
              en: "One app, lib or package; a package is linted without a sync.",
              ko: "앱, 라이브러리, 패키지 하나를 다루며, 패키지는 sync 없이 린트만 합니다.",
            }),
            marks: { sync: true, lint: true },
          },
        ],
      },
      {
        label: l.trans({ en: "Whole workspace", ko: "워크스페이스 전체" }),
        rows: [
          {
            name: "akan lint-all",
            desc: l.trans({
              en: "Syncs every app and lib, then lints every app, lib and package.",
              ko: "모든 앱과 라이브러리를 sync한 뒤, 모든 앱·라이브러리·패키지를 린트합니다.",
            }),
            marks: { sync: true, lint: true },
          },
          {
            name: "akan sync-all",
            desc: l.trans({
              en: "Syncs every lib, then every app, without linting.",
              ko: "모든 라이브러리, 그다음 모든 앱을 sync하고 린트는 하지 않습니다.",
            }),
            marks: { sync: true },
          },
        ],
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="workspace-anatomy" title={l.trans({ en: "Workspace Anatomy", ko: "워크스페이스 구조" })}>
          <Docs.Title>{l.trans({ en: "Workspace Anatomy", ko: "워크스페이스 구조" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "An Akan workspace is one Bun-first monorepo. The top-level folder a piece of code sits in says what it is: a product you run, a library apps share, or a package.",
                ko: "Akan 워크스페이스는 Bun 기반 모노레포 하나입니다. 코드가 루트의 어느 폴더에 있는지가 곧 그 코드의 성격입니다. 직접 실행하는 제품, 여러 앱이 나눠 쓰는 라이브러리, 패키지 중 하나입니다.",
              })}
            </div>
            <div>
              {l.trans({ en: "A workspace root looks like this:", ko: "워크스페이스 루트는 이렇게 생겼습니다:" })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="my-workspace/"
            language="bash"
            showLineNumbers={false}
            code={`.
├── apps/
│   └── myapp/
├── libs/
│   └── shared/
├── pkgs/
├── .env
├── package.json
├── tsconfig.json
├── biome.json
├── bunfig.toml
├── akan.config.ts
├── AGENTS.md
└── CLAUDE.md`}
          />
          <Docs.Description>
            <Docs.SubSubTitle>
              {l.trans({ en: "Which folder does my code go in?", ko: "코드는 어느 폴더에 두나요?" })}
            </Docs.SubSubTitle>
            <Docs.Matrix
              type={l.trans({ en: "Code", ko: "코드" })}
              columns={folderColumns}
              groups={folderGroups}
              markLabel={l.trans({ en: "Goes here", ko: "여기에 둡니다" })}
              emptyLabel={l.trans({ en: "Not here", ko: "해당 없음" })}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>
                        Start in <code>apps/</code>.
                      </strong>{" "}
                      Code that belongs to one product stays in its app. Move it to <code>libs/</code> once a second app
                      needs it.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>
                        <code>apps/</code>에서 시작합니다.
                      </strong>{" "}
                      제품 하나에 속한 코드는 그 앱 안에 둡니다. 두 번째 앱이 같은 코드를 필요로 할 때{" "}
                      <code>libs/</code>로 옮깁니다.
                    </>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>
                        Reach for <code>pkgs/</code> last.
                      </strong>{" "}
                      Use it only when the code has to stand alone, like a package someone installs.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>
                        <code>pkgs/</code>는 마지막 선택지입니다.
                      </strong>{" "}
                      코드가 설치형 패키지처럼 독립적이어야 할 때만 씁니다.
                    </>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>
                        <code>libs/</code> and <code>pkgs/</code> appear when you need them.
                      </strong>{" "}
                      A new workspace starts with one app; <code>create-library</code> and <code>create-package</code>{" "}
                      add the other two.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>
                        <code>libs/</code>와 <code>pkgs/</code>는 필요할 때 생깁니다.
                      </strong>{" "}
                      새 워크스페이스는 앱 하나로 시작하고, 나머지 두 폴더는 <code>create-library</code>,{" "}
                      <code>create-package</code>로 만들 때 생깁니다.
                    </>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>{l.trans({ en: "Files at the root", ko: "루트에 있는 파일" })}</Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "File", ko: "파일" })} items={rootFileRows} />
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>.akan/</code>, <code>dist/</code> and <code>node_modules/</code> are written by the tools and
                    gitignored, so you do not edit them by hand.
                  </span>
                ),
                ko: (
                  <span>
                    <code>.akan/</code>, <code>dist/</code>, <code>node_modules/</code>는 도구가 만들고 git에서 제외되는
                    폴더라서 직접 고치지 않습니다.
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="workspace-commands" title={l.trans({ en: "Workspace Commands", ko: "워크스페이스 명령" })}>
          <Docs.Title>{l.trans({ en: "Workspace Commands", ko: "워크스페이스 명령" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Workspace commands act on the monorepo as a whole. They create the workspace and its apps, libraries and packages, then keep them linted and in sync.",
                ko: "워크스페이스 명령은 모노레포 전체를 대상으로 합니다. 워크스페이스와 그 안의 앱·라이브러리·패키지를 만들고, 린트와 sync로 상태를 맞춥니다.",
              })}
            </div>
            <div>{l.trans({ en: "The ones you will use most:", ko: "자주 쓰는 명령은 다음과 같습니다:" })}</div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={l.trans({
              en: `bunx create-akan-workspace@latest     # a new workspace and its first app
akan create-application myapp         # adds apps/myapp
akan create-library shared            # adds libs/shared
akan create-package --name renderer   # adds pkgs/renderer
akan lint myapp                       # sync and lint one app, lib or package
akan lint-all                         # sync and lint everything
akan sync-all                         # sync every lib, then every app`,
              ko: `bunx create-akan-workspace@latest     # 새 워크스페이스와 첫 앱
akan create-application myapp         # apps/myapp 추가
akan create-library shared            # libs/shared 추가
akan create-package --name renderer   # pkgs/renderer 추가
akan lint myapp                       # 앱·라이브러리·패키지 하나를 sync하고 린트
akan lint-all                         # 전부 sync하고 린트
akan sync-all                         # 모든 라이브러리, 그다음 모든 앱을 sync`,
            })}
          />
          <Docs.Description>
            <Docs.SubSubTitle>{l.trans({ en: "Creating", ko: "만들기" })}</Docs.SubSubTitle>
            <Docs.Table
              columns={[
                { key: "command", label: l.trans({ en: "Command", ko: "명령" }), code: true },
                { key: "result", label: l.trans({ en: "What you get", ko: "결과" }) },
              ]}
              rows={createRows}
              stacked
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>
                        <code>bunx create-akan-workspace@latest</code> is the first step.
                      </strong>{" "}
                      It installs the <code>akan</code> CLI and runs <code>akan create-workspace</code> for you.{" "}
                      <code>--libs true</code> also installs the <code>util</code> and <code>shared</code> libraries.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>
                        첫 단계는 <code>bunx create-akan-workspace@latest</code>입니다.
                      </strong>{" "}
                      <code>akan</code> CLI를 설치하고 <code>akan create-workspace</code>를 대신 실행합니다.{" "}
                      <code>--libs true</code>를 주면 <code>util</code>, <code>shared</code> 라이브러리도 함께
                      설치합니다.
                    </>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>A missing name is asked for.</strong> Leave out the name and the CLI prompts for it. Names
                      are lowercased, and spaces become <code>-</code>.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>이름을 빼면 물어봅니다.</strong> 이름 없이 실행하면 CLI가 입력을 받습니다. 이름은 소문자로
                      바뀌고 공백은 <code>-</code>가 됩니다.
                    </>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>{l.trans({ en: "Lint and sync", ko: "린트와 sync" })}</Docs.SubSubTitle>
            <Docs.Matrix
              type={l.trans({ en: "Command", ko: "명령" })}
              columns={upkeepColumns}
              groups={upkeepGroups}
              markLabel={l.trans({ en: "Runs", ko: "실행함" })}
              emptyLabel={l.trans({ en: "Skipped", ko: "건너뜀" })}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>
                        <code>sync</code> refreshes an app or library.
                      </strong>{" "}
                      It rescans the source and rewrites its generated files, dependencies and configuration.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>
                        <code>sync</code>는 앱이나 라이브러리를 최신 상태로 맞춥니다.
                      </strong>{" "}
                      소스를 다시 스캔해 생성 파일, 의존성, 설정을 새로 씁니다.
                    </>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>Command names are kebab-case.</strong> It is <code>akan lint-all</code>, not{" "}
                      <code>akan lintAll</code>.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>명령 이름은 kebab-case입니다.</strong> <code>akan lintAll</code>이 아니라{" "}
                      <code>akan lint-all</code>입니다.
                    </>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>Run these commands from the workspace root.</strong> That is the folder holding{" "}
                    <code>package.json</code>, <code>tsconfig.json</code> and an <code>apps/</code>, <code>libs/</code>{" "}
                    or <code>pkgs/</code> folder; anywhere else the command stops with an error.{" "}
                    <code>create-workspace</code>, which makes that folder, is the exception.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>이 명령들은 워크스페이스 루트에서 실행합니다.</strong> <code>package.json</code>,{" "}
                    <code>tsconfig.json</code>과 <code>apps/</code>, <code>libs/</code>, <code>pkgs/</code> 중 한 폴더가
                    있는 곳이며, 다른 곳에서는 오류를 내고 멈춥니다. 그 폴더를 만드는 <code>create-workspace</code>만
                    예외입니다.
                  </span>
                ),
              })}
            </Docs.Alert>
            <Docs.LinkGrid
              items={[
                {
                  href: "/references/cli/workspace",
                  title: l.trans({ en: "Workspace CLI", ko: "워크스페이스 CLI" }),
                  desc: l.trans({
                    en: "Every option of `create-workspace`, `lint`, `lint-all` and `sync-all`.",
                    ko: "`create-workspace`, `lint`, `lint-all`, `sync-all`의 모든 옵션입니다.",
                  }),
                },
                {
                  href: "/conventions/workspace/lint",
                  title: l.trans({ en: "Format & Lint", ko: "포맷 & 린트" }),
                  desc: l.trans({
                    en: "What `akan lint` checks, and how to fix the first errors you meet.",
                    ko: "`akan lint`가 무엇을 확인하는지, 처음 만나는 오류를 어떻게 고치는지 다룹니다.",
                  }),
                },
                {
                  href: "/docs/core/folder-rule",
                  title: l.trans({ en: "Folder Rule", ko: "폴더 규칙" }),
                  desc: l.trans({
                    en: "The folders inside an app or library, and when code moves outward.",
                    ko: "앱과 라이브러리 안의 폴더, 그리고 코드를 바깥으로 옮기는 시점입니다.",
                  }),
                },
              ]}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <DocsToc />
      </Scroll>
    );
  });
