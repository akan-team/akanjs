import { usePage } from "@apps/akan/client";
import {
  type CommandReferenceItem,
  CommandReferenceSlide,
  Divider,
  Docs,
  DocsToc,
  type ReferenceRow,
} from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "CLI 레퍼런스: Workspace | Akan.js" : "CLI Reference: Workspace | Akan.js";
    const description =
      lang === "ko"
        ? "워크스페이스를 만들고, 모든 앱과 라이브러리를 한 번에 린트·sync합니다."
        : "Create a workspace, and lint or sync every app and library at once.";
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

    const catalogue = [
      {
        name: "create-workspace",
        href: "#create-workspace",
        desc: l.trans({
          en: "Create a new workspace with its first app, agent rules and MCP config.",
          ko: "첫 앱, 에이전트 규칙, MCP 설정까지 갖춘 새 워크스페이스를 만듭니다.",
        }),
      },
      {
        name: "lint",
        href: "#lint",
        desc: l.trans({
          en: "Format and lint one app, library or package with Biome.",
          ko: "앱, 라이브러리, 패키지 하나를 Biome으로 포맷하고 린트합니다.",
        }),
      },
      {
        name: "lint-all",
        href: "#lint-all",
        desc: l.trans({
          en: "Sync every app and library, then lint every app, library and package.",
          ko: "모든 앱과 라이브러리를 sync한 뒤, 모든 앱·라이브러리·패키지를 린트합니다.",
        }),
      },
      {
        name: "sync-all",
        href: "#sync-all",
        desc: l.trans({
          en: "Run `akan sync` on every library, then on every app.",
          ko: "모든 라이브러리에 `akan sync`를 실행한 뒤 모든 앱에 실행합니다.",
        }),
      },
      {
        name: "machine-keygen",
        href: "#machine-keygen",
        desc: l.trans({
          en: "Make the Ed25519 key a server signs machine tokens with.",
          ko: "서버가 machine token에 서명할 Ed25519 키를 만듭니다.",
        }),
      },
    ];

    const termRows = [
      {
        name: l.trans({ en: "workspace root", ko: "워크스페이스 루트" }),
        desc: l.trans({
          en: "The repo's top folder, the one holding `package.json`, `tsconfig.json` and an `apps/`, `libs/` or `pkgs/` folder.",
          ko: "저장소의 최상위 폴더입니다. `package.json`, `tsconfig.json`과 `apps/`, `libs/`, `pkgs/` 중 한 폴더가 있는 곳입니다.",
        }),
      },
      {
        name: "sync",
        desc: l.trans({
          en: "Rescans an app or library and rewrites its generated files. `akan sync <app|lib>` does one.",
          ko: "앱이나 라이브러리를 다시 스캔해 생성 파일을 새로 씁니다. 하나만 할 때는 `akan sync <app|lib>`입니다.",
        }),
      },
      {
        name: "Biome",
        desc: l.trans({
          en: "The formatter and linter Akan uses. Its rules live in `biome.json` at the workspace root.",
          ko: "Akan이 쓰는 포매터이자 린터입니다. 규칙은 워크스페이스 루트의 `biome.json`에 있습니다.",
        }),
      },
    ];

    const upkeepGroups = [
      {
        label: l.trans({ en: "One target", ko: "대상 하나" }),
        rows: [
          {
            name: "lint",
            desc: l.trans({
              en: "You changed one app, library or package. A package is linted without a sync.",
              ko: "앱, 라이브러리, 패키지 하나를 고쳤을 때 씁니다. 패키지는 sync 없이 린트만 합니다.",
            }),
            marks: { sync: true, lint: true },
          },
        ],
      },
      {
        label: l.trans({ en: "Whole workspace", ko: "워크스페이스 전체" }),
        rows: [
          {
            name: "lint-all",
            desc: l.trans({
              en: "Before a wide check, where generated files, app code and libraries must agree.",
              ko: "생성 파일, 앱 코드, 라이브러리를 함께 맞춰 봐야 하는 넓은 검증 전에 씁니다.",
            }),
            marks: { sync: true, lint: true },
          },
          {
            name: "sync-all",
            desc: l.trans({
              en: "Generated files look stale, or you changed the shared workspace setup.",
              ko: "생성 파일이 오래돼 보이거나 워크스페이스 공통 설정을 바꿨을 때 씁니다.",
            }),
            marks: { sync: true, lint: false },
          },
        ],
      },
    ];

    const lintOptions: ReferenceRow[] = [
      {
        name: "--fix",
        type: "Boolean",
        defaultValue: "true",
        desc: l.trans({
          en: "Write the formatter and lint fixes. With `--fix false` it only reports.",
          ko: "포매터와 린트가 고친 내용을 파일에 씁니다. `--fix false`면 보고만 합니다.",
        }),
      },
      {
        name: "--max-diagnostics",
        type: "Number",
        defaultValue: "200",
        desc: l.trans({
          en: "How many diagnostics Biome prints before it truncates. `0` removes the limit.",
          ko: "Biome이 잘라 내기 전까지 출력하는 진단 수입니다. `0`이면 제한이 없습니다.",
        }),
      },
    ];

    const commands: CommandReferenceItem[] = [
      {
        name: "create-workspace",
        signature: "akan create-workspace <workspaceName> --app <app> [options]",
        desc: l.trans({
          en: (
            <>
              <span>Create a new workspace and its first app in one go. It runs these steps in order:</span>
              <ol className="my-3 list-decimal space-y-1 pl-5">
                <li>
                  Write the workspace files into <code>{"<dir>/<workspaceName>"}</code>, with <code>--registry</code>{" "}
                  saved to <code>.npmrc</code>.
                </li>
                <li>
                  Run <code>bun install</code>. <code>--init false</code> skips it.
                </li>
                <li>
                  Install the <code>util</code> and <code>shared</code> libraries, only with <code>--libs true</code>.
                </li>
                <li>
                  Create the first app, named by <code>--app</code>.
                </li>
                <li>
                  Write the agent rules and the MCP config. <code>--agent-install</code> and <code>--mcp-install</code>{" "}
                  turn them off.
                </li>
                <li>Make the first git commit. If git fails, the workspace still works; commit by hand.</li>
              </ol>
              <span>
                It ends by printing the next step: <code>{"cd <dir>/<workspaceName> && akan start <app>"}</code>.
              </span>
            </>
          ),
          ko: (
            <>
              <span>새 워크스페이스와 첫 앱을 한 번에 만듭니다. 아래 순서로 진행합니다.</span>
              <ol className="my-3 list-decimal space-y-1 pl-5">
                <li>
                  <code>{"<dir>/<workspaceName>"}</code>에 워크스페이스 파일을 씁니다. <code>--registry</code> 값은{" "}
                  <code>.npmrc</code>에 들어갑니다.
                </li>
                <li>
                  <code>bun install</code>을 실행합니다. <code>--init false</code>면 건너뜁니다.
                </li>
                <li>
                  <code>--libs true</code>일 때만 <code>util</code>과 <code>shared</code> 라이브러리를 설치합니다.
                </li>
                <li>
                  <code>--app</code>으로 정한 이름의 첫 앱을 만듭니다.
                </li>
                <li>
                  에이전트 규칙과 MCP 설정을 씁니다. <code>--agent-install</code>과 <code>--mcp-install</code>로 끌 수
                  있습니다.
                </li>
                <li>첫 git 커밋을 남깁니다. git이 실패해도 워크스페이스는 그대로 쓸 수 있으니 직접 커밋합니다.</li>
              </ol>
              <span>
                마지막에 다음 단계를 안내합니다: <code>{"cd <dir>/<workspaceName> && akan start <app>"}</code>.
              </span>
            </>
          ),
        }),
        args: [
          {
            name: "workspaceName",
            type: "String",
            required: "yes",
            desc: l.trans({
              en: "Organization or workspace name, lowercased with spaces as hyphens. Asked for when omitted.",
              ko: "조직 또는 워크스페이스 이름입니다. 소문자로 바뀌고 공백은 하이픈이 됩니다. 생략하면 물어봅니다.",
            }),
          },
        ],
        options: [
          {
            name: "--app",
            type: "String",
            required: "yes",
            desc: l.trans({
              en: "Name of the first app, lowercased with spaces as hyphens. Asked for when omitted.",
              ko: "첫 앱의 이름입니다. 소문자로 바뀌고 공백은 하이픈이 됩니다. 생략하면 물어봅니다.",
            }),
          },
          {
            name: "--dir",
            type: "String",
            defaultValue: ".",
            desc: l.trans({
              en: "Parent folder, relative to where you run it. Defaults to `local` if `USE_AKANJS_PKGS=true`.",
              ko: "워크스페이스를 담을 상위 폴더로, 실행 위치 기준입니다. `USE_AKANJS_PKGS=true`면 `local`입니다.",
            }),
          },
          {
            name: "--libs",
            type: "Boolean",
            defaultValue: "false",
            desc: l.trans({
              en: "Also install `shared` and `util`. Leave it off, as recommended, to start from an empty workspace.",
              ko: "`shared`와 `util`도 설치합니다. 권장대로 끄면 빈 워크스페이스에서 시작합니다.",
            }),
          },
          {
            name: "--init",
            type: "Boolean",
            defaultValue: "true",
            desc: l.trans({
              en: "Run `bun install` once the files are written.",
              ko: "파일을 만든 뒤 `bun install`을 실행합니다.",
            }),
          },
          {
            name: "--registry",
            type: "String",
            defaultValue: "https://registry.npmjs.org",
            desc: l.trans({
              en: "npm registry for the Akan packages, saved to `.npmrc`. `AKAN_NPM_REGISTRY` sets the default.",
              ko: "Akan 패키지를 받을 npm 레지스트리로, `.npmrc`에 저장됩니다. `AKAN_NPM_REGISTRY`가 기본값을 정합니다.",
            }),
          },
          {
            name: "--owner",
            type: "String",
            defaultValue: "$GITHUB_OWNER",
            desc: l.trans({
              en: "GitHub owner of the repo. When set, `README.md` gets an Open in GitHub Codespaces badge.",
              ko: "저장소의 GitHub 소유자입니다. 값이 있으면 `README.md`에 GitHub Codespaces 배지가 붙습니다.",
            }),
          },
          {
            name: "--mcp-install",
            type: "Boolean",
            defaultValue: "true",
            desc: l.trans({
              en: "Register the Akan MCP server for Cursor, Claude Code and Codex in their project config files.",
              ko: "Cursor, Claude Code, Codex의 프로젝트 설정 파일에 Akan MCP 서버를 등록합니다.",
            }),
          },
          {
            name: "--agent-install",
            type: "Boolean",
            defaultValue: "true",
            enumOrFlag: "-A",
            desc: l.trans({
              en: "Write `AGENTS.md`, `CLAUDE.md` and `.cursor/rules/akan.mdc` for coding agents.",
              ko: "코딩 에이전트용 `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/akan.mdc`를 씁니다.",
            }),
          },
        ],
        notes: [
          {
            name: l.trans({ en: "where to run", ko: "실행 위치" }),
            desc: l.trans({
              en: "Any folder works, because this command creates the workspace root.",
              ko: "워크스페이스 루트를 새로 만드는 명령이라 어느 폴더에서나 실행합니다.",
            }),
          },
          {
            name: l.trans({ en: "MCP config files", ko: "MCP 설정 파일" }),
            desc: l.trans({
              en: "Cursor reads `.cursor/mcp.json`, Claude Code `.mcp.json`, and Codex `.codex/config.toml`.",
              ko: "Cursor는 `.cursor/mcp.json`, Claude Code는 `.mcp.json`, Codex는 `.codex/config.toml`을 읽습니다.",
            }),
          },
          {
            name: l.trans({ en: "framework version", ko: "프레임워크 버전" }),
            desc: l.trans({
              en: "There is no `--tag`. Move a workspace to another release channel with `akan update --tag <tag>`.",
              ko: "`--tag` 옵션은 없습니다. 다른 릴리스 채널로 옮기려면 `akan update --tag <tag>`를 씁니다.",
            }),
          },
          {
            name: "create-akan-workspace",
            desc: l.trans({
              en: "`bunx create-akan-workspace` installs the matching `@akanjs/cli` globally, then runs this command.",
              ko: "`bunx create-akan-workspace`는 버전이 같은 `@akanjs/cli`를 전역 설치한 뒤 이 명령을 실행합니다.",
            }),
          },
        ],
        examples: `akan create-workspace acme --app shop
akan create-workspace acme --app shop --dir projects --init false
akan create-workspace acme --app shop --libs true`,
      },
      {
        name: "lint",
        signature: "akan lint <app|lib|pkg> [--fix <boolean>] [--max-diagnostics <n>]",
        desc: l.trans({
          en: "Format and lint one app, library or package with Biome. Fixes are written by default, and an app or library is synced first. After Biome come the three checks under Notes.",
          ko: "앱, 라이브러리, 패키지 하나를 Biome으로 포맷하고 린트합니다. 고친 내용은 기본으로 파일에 쓰고, 앱과 라이브러리는 먼저 sync합니다. Biome 다음에는 아래 참고의 세 가지를 검사합니다.",
        }),
        args: [
          {
            name: "app|lib|pkg",
            type: "String",
            required: "yes",
            desc: l.trans({
              en: "App, library or package name. Picked from a list when omitted.",
              ko: "앱, 라이브러리, 패키지 이름입니다. 생략하면 목록에서 고릅니다.",
            }),
          },
        ],
        options: lintOptions,
        notes: [
          {
            name: l.trans({ en: "theme contrast", ko: "테마 대비" }),
            desc: l.trans({
              en: "Fails when a color pair in `page/styles.css` misses the WCAG contrast threshold.",
              ko: "`page/styles.css`의 색 조합이 WCAG 대비 기준에 못 미치면 실패합니다.",
            }),
          },
          {
            name: l.trans({ en: "recipes", ko: "레시피" }),
            desc: l.trans({
              en: "Fails when a recipe in `ui/Recipe` has no variant or flag to choose.",
              ko: "`ui/Recipe`의 레시피에 고를 variant나 플래그가 없으면 실패합니다.",
            }),
          },
          {
            name: l.trans({ en: "agent index", ko: "에이전트 색인" }),
            desc: l.trans({
              en: "Fails when the recipe index in an app's or library's `AGENTS.md` is stale. `akan sync` fixes it.",
              ko: "앱이나 라이브러리 `AGENTS.md`의 레시피 색인이 오래되면 실패합니다. `akan sync`로 고칩니다.",
            }),
          },
        ],
        examples: `akan lint myapp
akan lint util --fix false
akan lint myapp --max-diagnostics 0`,
      },
      {
        name: "lint-all",
        signature: "akan lint-all [--fix <boolean>] [--max-diagnostics <n>]",
        desc: l.trans({
          en: "Sync every app and library, then lint every app, library and package. Each one gets the same checks as `lint`. Run it before a wide check where generated files, app code and shared libraries must agree.",
          ko: "모든 앱과 라이브러리를 sync한 뒤, 모든 앱·라이브러리·패키지를 린트합니다. 검사 항목은 `lint`와 같습니다. 생성 파일, 앱 코드, 공유 라이브러리를 함께 맞춰 봐야 하는 넓은 검증 전에 실행합니다.",
        }),
        options: lintOptions,
        examples: `akan lint-all
akan lint-all --fix false
akan lint-all --max-diagnostics 0`,
      },
      {
        name: "sync-all",
        signature: "akan sync-all",
        desc: l.trans({
          en: "Run `akan sync` on every library, then on every app. Use it when generated files look stale, or after a change to the shared workspace setup.",
          ko: "모든 라이브러리에 `akan sync`를 실행한 뒤 모든 앱에 실행합니다. 생성 파일이 오래돼 보이거나 워크스페이스 공통 설정을 바꾼 뒤에 씁니다.",
        }),
        examples: "akan sync-all",
      },
      {
        name: "machine-keygen",
        signature: "akan machine-keygen <out>",
        desc: l.trans({
          en: "Write a new Ed25519 private key for machine tokens to `<out>` and print its public key. The server that issues tokens takes the private key as `AKAN_MACHINE_PRIVATE_KEY`; one that only verifies them takes `AKAN_MACHINE_PUBLIC_KEY`.",
          ko: "machine token용 Ed25519 개인 키를 `<out>`에 쓰고 공개 키를 출력합니다. 토큰을 발급하는 서버는 개인 키를 `AKAN_MACHINE_PRIVATE_KEY`로, 검증만 하는 서버는 공개 키를 `AKAN_MACHINE_PUBLIC_KEY`로 받습니다.",
        }),
        args: [
          {
            name: "out",
            type: "String",
            required: "yes",
            desc: l.trans({
              en: "File the private key is written to, with mode 600. An existing file is refused, never overwritten.",
              ko: "개인 키를 쓸 파일이며 권한은 600입니다. 이미 있는 파일이면 덮어쓰지 않고 거부합니다.",
            }),
          },
        ],
        examples: "akan machine-keygen ~/keys/akan-machine.pem",
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="workspace-cli" title={l.trans({ en: "Workspace CLI", ko: "워크스페이스 CLI" })}>
          <Docs.Title>{l.trans({ en: "Workspace CLI", ko: "워크스페이스 CLI" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "These commands act on the whole workspace. Create a new one, lint or sync every app and library at once, or make a machine-token key.",
                ko: "워크스페이스 전체를 다루는 명령입니다. 새 워크스페이스를 만들고, 모든 앱과 라이브러리를 한 번에 린트·sync하거나, machine token 키를 만듭니다.",
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Command", ko: "명령" })} items={catalogue} />
            <Docs.SubSubTitle>
              {l.trans({ en: "Words Used On This Page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
            <Docs.SubSubTitle>{l.trans({ en: "Which One To Run", ko: "어떤 명령을 쓸까" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "The three upkeep commands differ in scope and in whether they lint after the sync.",
                ko: "관리용 명령 세 개는 다루는 범위와, sync 뒤에 린트까지 하는지가 다릅니다.",
              })}
            </div>
            <Docs.Matrix
              type={l.trans({ en: "Command", ko: "명령" })}
              columns={[
                { key: "sync", label: "sync", code: true },
                { key: "lint", label: "lint", code: true },
              ]}
              groups={upkeepGroups}
              markLabel={l.trans({ en: "Runs it", ko: "실행함" })}
              emptyLabel={l.trans({ en: "Skips it", ko: "실행 안 함" })}
            />
          </Docs.Description>
        </Scroll.Slide>
        {commands.flatMap((command) => [
          <Divider key={`${command.name}-divider`} />,
          <CommandReferenceSlide key={command.name} command={command} />,
        ])}
        <Divider />
        <Scroll.Slide
          id="workspace-rules"
          title={l.trans({ en: "Rules Every Command Shares", ko: "모든 명령의 공통 규칙" })}
        >
          <Docs.Title>{l.trans({ en: "Rules Every Command Shares", ko: "모든 명령의 공통 규칙" })}</Docs.Title>
          <Docs.Description>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Run from the workspace root.</strong> Every command here except{" "}
                      <code>create-workspace</code> runs from the folder holding <code>package.json</code>,{" "}
                      <code>tsconfig.json</code> and an <code>apps/</code>, <code>libs/</code> or <code>pkgs/</code>{" "}
                      folder.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>워크스페이스 루트에서 실행합니다.</strong> <code>create-workspace</code>를 뺀 모든 명령은{" "}
                      <code>package.json</code>, <code>tsconfig.json</code>과 <code>apps/</code>, <code>libs/</code>,{" "}
                      <code>pkgs/</code> 중 한 폴더가 있는 곳에서 실행합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Boolean options.</strong> <code>--fix</code> on its own means true. To turn an option off,
                      give the value: <code>--fix false</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>불리언 옵션.</strong> <code>--fix</code>처럼 이름만 쓰면 true입니다. 끄려면 값을 붙입니다:{" "}
                      <code>--fix false</code>.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Short flags.</strong> Each option also answers to its first letter (<code>-f</code> for{" "}
                      <code>--fix</code>) unless its row shows another letter, such as <code>-A</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>짧은 플래그.</strong> 옵션은 첫 글자로도 씁니다(<code>--fix</code>는 <code>-f</code>).{" "}
                      <code>-A</code>처럼 다른 글자를 쓰는 옵션은 표에 따로 적혀 있습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Verbose output.</strong> <code>-v</code> shows the output of each process the command
                      runs, which a spinner normally hides.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>자세한 출력.</strong> <code>-v</code>를 붙이면 평소 스피너 뒤에 가려지는 프로세스 출력을
                      그대로 보여 줍니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "Related Pages", ko: "관련 페이지" })}</Docs.SubSubTitle>
            <Docs.LinkGrid
              items={[
                {
                  href: "/references/cli/overview",
                  title: l.trans({ en: "CLI Commands", ko: "CLI 명령" }),
                  desc: l.trans({
                    en: "How to read a signature, and the options every command takes.",
                    ko: "형식을 읽는 법과 모든 명령이 받는 옵션을 정리합니다.",
                  }),
                },
                {
                  href: "/references/cli/application#sync",
                  title: "akan sync",
                  desc: l.trans({
                    en: "Syncs one app or library, the step these commands repeat for all of them.",
                    ko: "앱이나 라이브러리 하나를 sync합니다. 이 페이지의 명령은 이 작업을 전부에 반복합니다.",
                  }),
                },
                {
                  href: "/references/cli/agent",
                  title: "akan agent",
                  desc: l.trans({
                    en: "Refreshes the agent rules that `create-workspace` wrote.",
                    ko: "`create-workspace`가 써 둔 에이전트 규칙을 새로 고칩니다.",
                  }),
                },
                {
                  href: "/references/cli/cloud#update",
                  title: "akan update",
                  desc: l.trans({
                    en: "Moves the workspace to another framework version or release channel.",
                    ko: "워크스페이스를 다른 프레임워크 버전이나 릴리스 채널로 옮깁니다.",
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
