import { usePage } from "@apps/akan/client";
import {
  type CommandReferenceItem,
  CommandReferenceSlide,
  Divider,
  Docs,
  DocsToc,
  type IntroItem,
  type MatrixGroup,
  type ReferenceRow,
} from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "CLI 레퍼런스: Library | Akan.js" : "CLI Reference: Library | Akan.js";
    const description =
      lang === "ko"
        ? "라이브러리를 만들고, 여러 앱이 함께 쓰는 코드를 관리합니다."
        : "Create a library and manage the code several apps share.";
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

    const termRows: IntroItem[] = [
      {
        name: <span className="font-sans">{l.trans({ en: "library", ko: "라이브러리" })}</span>,
        desc: l.trans({
          en: "A folder under `libs/` holding code several apps share: domain modules, UI or utilities.",
          ko: "여러 앱이 함께 쓰는 코드를 담는 `libs/` 아래 폴더입니다. 도메인 모듈, UI, 유틸리티를 둡니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "template", ko: "템플릿" })}</span>,
        desc: l.trans({
          en: "A ready-made library from Akan.js, such as `shared` or `util`, that `install-library` copies in.",
          ko: "`shared`, `util`처럼 Akan.js가 미리 만들어 둔 라이브러리로, `install-library`가 복사해 옵니다.",
        }),
      },
      {
        name: "akan.source",
        desc: l.trans({
          en: "The stamp `install-library` puts in the library's `package.json`: origin, commit or version, hash.",
          ko: "`install-library`가 라이브러리의 `package.json`에 남기는 스탬프로, 원본, 커밋이나 버전, 파일 해시가 담깁니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "drift", ko: "드리프트" })}</span>,
        desc: l.trans({
          en: "An installed library whose files no longer match the hash in its stamp.",
          ko: "설치한 라이브러리의 파일이 스탬프에 적힌 해시와 더는 맞지 않는 상태입니다.",
        }),
      },
    ];

    const commandGroups: MatrixGroup[] = [
      {
        label: l.trans({ en: "Add a library", ko: "라이브러리 추가" }),
        rows: [
          {
            name: "create-library",
            desc: l.trans({
              en: "Start a new library you fill in yourself.",
              ko: "직접 채워 나갈 새 라이브러리를 만듭니다.",
            }),
            marks: { lib: true },
          },
          {
            name: "install-library",
            desc: l.trans({
              en: "Copy in a template such as `shared` or `util`.",
              ko: "`shared`, `util` 같은 템플릿을 복사해 옵니다.",
            }),
            marks: { lib: true, root: true, commit: true },
          },
        ],
      },
      {
        label: l.trans({ en: "Keep it current", ko: "관리" }),
        rows: [
          {
            name: "sync-library",
            desc: l.trans({
              en: "Refresh the generated files after you change the library.",
              ko: "라이브러리를 고친 뒤 생성 파일을 다시 만듭니다.",
            }),
            marks: { lib: true },
          },
          {
            name: "library-status",
            desc: l.trans({
              en: "Check whether installed libraries changed after the install.",
              ko: "설치한 라이브러리가 그 뒤로 바뀌었는지 확인합니다.",
            }),
            marks: {},
          },
        ],
      },
      {
        label: l.trans({ en: "Remove", ko: "제거" }),
        rows: [
          {
            name: "remove-library",
            desc: l.trans({ en: "Delete the whole library folder.", ko: "라이브러리 폴더를 통째로 지웁니다." }),
            marks: { lib: true },
          },
        ],
      },
    ];

    const sharedRules = [
      l.trans({
        en: (
          <>
            <strong>Name the library, or pick it from a list.</strong> <code>remove-library</code> and{" "}
            <code>sync-library</code> list the libraries in <code>libs/</code> when the name is missing or unknown;{" "}
            <code>create-library</code> and <code>install-library</code> ask you to type one when it is left out.
          </>
        ),
        ko: (
          <>
            <strong>라이브러리 이름을 적거나, 목록에서 고릅니다.</strong> <code>remove-library</code>와{" "}
            <code>sync-library</code>는 이름이 없거나 틀리면 <code>libs/</code>의 라이브러리 목록을 띄웁니다.{" "}
            <code>create-library</code>와 <code>install-library</code>는 이름을 빼면 입력하라고 묻습니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>
              <code>{"akan sync <lib>"}</code> is the same step as <code>sync-library</code>.
            </strong>{" "}
            <code>create-library</code> runs it for you, and <code>{"akan lint <lib>"}</code> runs it before linting.
          </>
        ),
        ko: (
          <>
            <strong>
              <code>{"akan sync <lib>"}</code>는 <code>sync-library</code>와 같은 일을 합니다.
            </strong>{" "}
            <code>create-library</code>는 끝에 이 단계를 알아서 실행하고, <code>{"akan lint <lib>"}</code>도 린트 전에
            실행합니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>Only an installed library has a stamp.</strong> A library made with <code>create-library</code>{" "}
            shows as <code>unstamped</code> in <code>library-status</code>.
          </>
        ),
        ko: (
          <>
            <strong>스탬프는 설치한 라이브러리에만 있습니다.</strong> <code>create-library</code>로 만든 라이브러리는{" "}
            <code>library-status</code>에서 <code>unstamped</code>로 나옵니다.
          </>
        ),
      }),
    ];

    const libArg: ReferenceRow = {
      name: "lib",
      type: "String",
      desc: l.trans({
        en: "A library in `libs/`, such as `util`. Leave it out, or mistype it, to pick one from a list.",
        ko: "`util`처럼 `libs/`에 있는 라이브러리입니다. 생략하거나 잘못 적으면 목록에서 고릅니다.",
      }),
    };

    const commands: CommandReferenceItem[] = [
      {
        name: "create-library",
        signature: "akan create-library <lib-name>",
        desc: l.trans({
          en: "Create a new shared library in `libs/<lib-name>/` for code several apps reuse.\nIt starts with the standard folders and one empty service module, then runs `sync-library`.",
          ko: "여러 앱이 함께 쓸 코드를 담을 새 공유 라이브러리를 `libs/<lib-name>/`에 만듭니다.\n기본 폴더와 빈 서비스 모듈 하나로 시작하고, 끝에 `sync-library`를 실행합니다.",
        }),
        args: [
          {
            name: "lib-name",
            type: "String",
            required: "yes",
            desc: l.trans({
              en: "Library name. It is lowercased and spaces become `-`; asked for if left out.",
              ko: "라이브러리 이름입니다. 소문자로 바꾸고 공백은 `-`로 바꾸며, 생략하면 입력을 받습니다.",
            }),
          },
        ],
        notes: [
          {
            name: l.trans({ en: "what it creates", ko: "만드는 것" }),
            desc: l.trans({
              en: "Config files, plus the `env/`, `lib/`, `common/`, `srvkit/`, `webkit/` and `ui/` folders.",
              ko: "설정 파일과 `env/`, `lib/`, `common/`, `srvkit/`, `webkit/`, `ui/` 폴더입니다.",
            }),
          },
          {
            name: l.trans({ en: "sample module", ko: "예시 모듈" }),
            desc: l.trans({
              en: "`lib/_<lib-name>/` is an empty service module: dictionary, service, signal and store.",
              ko: "`lib/_<lib-name>/`는 dictionary, service, signal, store만 있는 빈 서비스 모듈입니다.",
            }),
          },
          {
            name: l.trans({ en: "one word", ko: "한 단어" }),
            desc: l.trans({
              en: "Use one lowercase word. A hyphen lands in the sample module's class names and breaks them.",
              ko: "소문자 한 단어로 짓습니다. 하이픈을 넣으면 예시 모듈의 클래스 이름에 그대로 들어가 코드가 깨집니다.",
            }),
          },
          {
            name: l.trans({ en: "importing", ko: "가져다 쓰기" }),
            desc: l.trans({
              en: "Apps import it as `@libs/<lib-name>/client` or `@libs/<lib-name>/server`; no config to add.",
              ko: "앱에서는 `@libs/<lib-name>/client`, `@libs/<lib-name>/server`로 import하며, 따로 설정할 것은 없습니다.",
            }),
          },
        ],
        examples: `akan create-library payment
akan create-library`,
      },
      {
        name: "remove-library",
        signature: "akan remove-library [lib]",
        desc: l.trans({
          en: "Remove a library from the workspace by deleting its whole `libs/<lib>/` folder, without asking.\nUse it when no app should import the library, sync it or depend on it anymore.",
          ko: "라이브러리의 `libs/<lib>/` 폴더 전체를 확인 없이 지워 워크스페이스에서 없앱니다.\n어떤 앱도 더는 그 라이브러리를 import하거나 동기화하거나 의존하지 않을 때 씁니다.",
        }),
        args: [libArg],
        notes: [
          {
            name: l.trans({ en: "what stays", ko: "남는 것" }),
            desc: l.trans({
              en: "Apps' `@libs/<lib>` imports stay, and so do the packages merged into the root `package.json`.",
              ko: "앱의 `@libs/<lib>` import와 루트 `package.json`에 합쳐 둔 패키지는 그대로 남습니다.",
            }),
          },
          {
            name: l.trans({ en: "afterwards", ko: "그다음" }),
            desc: l.trans({
              en: "Delete those imports, then run `akan sync <app>` for each app that used the library.",
              ko: "그 import를 지운 뒤, 라이브러리를 쓰던 앱마다 `akan sync <app>`을 실행합니다.",
            }),
          },
        ],
        examples: `akan remove-library util
akan remove-library`,
      },
      {
        name: "sync-library",
        signature: "akan sync-library [lib]",
        desc: l.trans({
          en: "Regenerate one library's generated files and refresh its dependency list.\nRun it after you add or rename files, change packages, or edit the library's config.",
          ko: "라이브러리 하나의 생성 파일을 다시 만들고 의존성 목록을 갱신합니다.\n파일을 추가하거나 이름을 바꾼 뒤, 패키지나 라이브러리 설정을 고친 뒤에 실행합니다.",
        }),
        args: [libArg],
        notes: [
          {
            name: l.trans({ en: "generated files", ko: "생성 파일" }),
            desc: l.trans({
              en: "`client.ts`, `server.ts`, every `index.ts`, the `lib/` barrels and `akan.lib.json`; never edit them.",
              ko: "`client.ts`, `server.ts`, 각 폴더의 `index.ts`, `lib/` 배럴 파일, `akan.lib.json`이며, 직접 고치지 않습니다.",
            }),
          },
          {
            name: l.trans({ en: "packages", ko: "패키지" }),
            desc: l.trans({
              en: "Each package the library imports is written into its `package.json` at the root version.",
              ko: "라이브러리가 import하는 패키지를 루트와 같은 버전으로 라이브러리의 `package.json`에 적습니다.",
            }),
          },
          {
            name: l.trans({ en: "used libraries", ko: "쓰는 라이브러리" }),
            desc: l.trans({
              en: "The libraries it imports get their generated files refreshed too.",
              ko: "이 라이브러리가 import하는 다른 라이브러리의 생성 파일도 함께 새로 만듭니다.",
            }),
          },
        ],
        examples: `akan sync-library util
akan sync-library`,
      },
      {
        name: "install-library",
        signature: "akan install-library <lib-name>",
        desc: l.trans({
          en: "Install a ready-made library template such as `shared` or `util` into `libs/<lib-name>/`.\nYou can run it again: the copy overwrites the library source and leaves your testing env alone.",
          ko: "`shared`, `util` 같은 미리 만들어 둔 라이브러리 템플릿을 `libs/<lib-name>/`에 설치합니다.\n다시 실행해도 됩니다. 라이브러리 소스는 새로 덮어쓰고, 테스트 환경 파일은 그대로 둡니다.",
        }),
        args: [
          {
            name: "lib-name",
            type: "String",
            required: "yes",
            desc: l.trans({
              en: "Template name, such as `shared` or `util`; asked for if left out.",
              ko: "`shared`, `util` 같은 템플릿 이름입니다. 생략하면 입력을 받습니다.",
            }),
          },
        ],
        notes: [
          {
            name: l.trans({ en: "source", ko: "원본" }),
            desc: l.trans({
              en: "The installed `akanjs` package when it ships the library; otherwise its version's tag in the Akan.js repository.",
              ko: "설치된 `akanjs` 패키지에 라이브러리가 있으면 거기서, 없으면 Akan.js 저장소의 그 버전 태그에서 복사합니다.",
            }),
          },
          {
            name: l.trans({ en: "testing env", ko: "테스트 환경" }),
            desc: l.trans({
              en: "`env/env.server.testing.ts` is copied from `env.server.example.ts` only when it is missing.",
              ko: "`env/env.server.testing.ts`가 없을 때만 `env.server.example.ts`를 복사해 만듭니다.",
            }),
          },
          {
            name: l.trans({ en: "stamp", ko: "스탬프" }),
            desc: l.trans({
              en: "Writes the `akan.source` stamp that `library-status` compares against.",
              ko: "`library-status`가 비교 기준으로 쓰는 `akan.source` 스탬프를 남깁니다.",
            }),
          },
          {
            name: l.trans({ en: "packages", ko: "패키지" }),
            desc: l.trans({
              en: "Merges its packages into the root `package.json`, newer version wins, then runs `bun install`.",
              ko: "라이브러리의 패키지를 루트 `package.json`에 합치되 버전이 더 높은 쪽을 남기고, `bun install`을 실행합니다.",
            }),
          },
          {
            name: l.trans({ en: "git commits", ko: "git 커밋" }),
            desc: l.trans({
              en: "Commits the copy if anything changed, then the merge; each runs `git add .` on the whole tree.",
              ko: "바뀐 것이 있으면 복사본을, 이어서 패키지 병합을 커밋하며, 둘 다 작업 트리 전체를 `git add .`로 올립니다.",
            }),
          },
          {
            name: "shared",
            desc: l.trans({
              en: "`shared` imports `util`, so install `util` first, as `create-workspace --libs true` does.",
              ko: "`shared`는 `util`을 import하므로, `create-workspace --libs true`처럼 `util`을 먼저 설치합니다.",
            }),
          },
        ],
        examples: `akan install-library
akan install-library util
akan install-library shared`,
      },
      {
        name: "library-status",
        signature: "akan library-status [--format <text|json>]",
        desc: l.trans({
          en: "Report whether each library still matches the source it was installed from.\nIt checks every library in `libs/` and marks each one `clean`, `drifted` or `unstamped`.",
          ko: "각 라이브러리가 설치해 온 원본과 아직 같은지 보고합니다.\n`libs/`의 모든 라이브러리를 살펴 `clean`, `drifted`, `unstamped` 중 하나로 표시합니다.",
        }),
        options: [
          {
            name: "--format",
            type: "String",
            defaultValue: "text",
            enumOrFlag: "text | json · -f",
            desc: l.trans({
              en: "`text` is a list for a person to read; `json` is an array with each library's stamp and hash.",
              ko: "`text`는 사람이 읽는 목록이고, `json`은 라이브러리마다 스탬프와 해시를 담은 배열입니다.",
            }),
          },
        ],
        notes: [
          {
            name: "clean",
            desc: l.trans({
              en: "The library's files hash to the value in its `akan.source` stamp.",
              ko: "라이브러리 파일의 해시가 `akan.source` 스탬프의 값과 같습니다.",
            }),
          },
          {
            name: "drifted",
            desc: l.trans({
              en: "A file changed since the library was installed.",
              ko: "라이브러리를 설치한 뒤로 파일이 바뀌었습니다.",
            }),
          },
          {
            name: "unstamped",
            desc: l.trans({
              en: "There is no stamp, as with a library made by `create-library`.",
              ko: "스탬프가 없습니다. `create-library`로 만든 라이브러리가 그렇습니다.",
            }),
          },
          {
            name: l.trans({ en: "compared files", ko: "비교 대상" }),
            desc: l.trans({
              en: "Every file in `libs/<lib>/`, committed or not, except gitignored files and `env/`.",
              ko: "`libs/<lib>/`에서 gitignore된 파일과 `env/`를 뺀 모든 파일이며, 아직 커밋하지 않은 파일도 들어갑니다.",
            }),
          },
          {
            name: "akan.source",
            desc: l.trans({
              en: "Holds `origin`, `sha` (commit or package version), `hash` and `syncedAt`.",
              ko: "`origin`, `sha`(커밋 또는 패키지 버전), `hash`, `syncedAt`을 담습니다.",
            }),
          },
          {
            name: l.trans({ en: "exit code", ko: "종료 코드" }),
            desc: l.trans({
              en: "It only reports: the command succeeds even when a library drifted.",
              ko: "보고만 합니다. 드리프트가 있어도 명령은 성공으로 끝납니다.",
            }),
          },
        ],
        examples: `akan library-status
akan library-status --format json`,
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="library-cli" title={l.trans({ en: "Library CLI", ko: "라이브러리 CLI" })}>
          <Docs.Title>{l.trans({ en: "Library CLI", ko: "라이브러리 CLI" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Five commands that create, install, sync, check and remove the shared libraries in{" "}
                    <code>libs/</code>. Use a library for domain, utility, UI or platform code that several apps import.
                  </span>
                ),
                ko: (
                  <span>
                    <code>libs/</code>의 공유 라이브러리를 만들고, 설치하고, 동기화하고, 점검하고, 지우는 명령 다섯
                    가지입니다. 여러 앱이 import할 도메인, 유틸리티, UI, 플랫폼 코드를 라이브러리에 둡니다.
                  </span>
                ),
              })}
            </div>
          </Docs.Description>

          <Docs.SubSubTitle>{l.trans({ en: "Words Used on This Page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />

          <Docs.SubSubTitle>{l.trans({ en: "What Each Command Touches", ko: "명령마다 바꾸는 것" })}</Docs.SubSubTitle>
          <Docs.Matrix
            type={l.trans({ en: "Command", ko: "명령" })}
            columns={[
              { key: "lib", label: "`libs/<lib>`" },
              { key: "root", label: l.trans({ en: "Root `package.json`", ko: "루트 `package.json`" }) },
              { key: "commit", label: l.trans({ en: "Git history", ko: "git 기록" }) },
            ]}
            groups={commandGroups}
            markLabel={l.trans({ en: "Changed", ko: "바뀜" })}
            emptyLabel={l.trans({ en: "Untouched", ko: "그대로" })}
          />

          <Docs.SubSubTitle>{l.trans({ en: "Common Rules", ko: "공통 규칙" })}</Docs.SubSubTitle>
          <ul className="my-4 list-disc space-y-2 pl-5">
            {sharedRules.map((rule, idx) => (
              <li key={idx}>{rule}</li>
            ))}
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <>
                  <strong>Commit your own work before these.</strong> <code>install-library</code> stages the whole
                  working tree with <code>git add .</code> and commits it, and <code>remove-library</code> deletes the
                  folder without asking.
                </>
              ),
              ko: (
                <>
                  <strong>실행하기 전에 작업 중인 변경을 먼저 커밋합니다.</strong> <code>install-library</code>는 작업
                  트리 전체를 <code>git add .</code>로 올려 커밋하고, <code>remove-library</code>는 확인 없이 폴더를
                  지웁니다.
                </>
              ),
            })}
          </Docs.Alert>

          <Docs.SubSubTitle>{l.trans({ en: "Related Pages", ko: "관련 페이지" })}</Docs.SubSubTitle>
          <Docs.LinkGrid
            items={[
              {
                href: "/references/cli/workspace#create-workspace",
                title: l.trans({ en: "create-workspace", ko: "create-workspace" }),
                desc: l.trans({
                  en: "`--libs true` installs `util` and `shared` while it creates the workspace.",
                  ko: "`--libs true`를 주면 워크스페이스를 만들면서 `util`과 `shared`를 설치합니다.",
                }),
              },
              {
                href: "/references/cli/application#sync",
                title: l.trans({ en: "akan sync", ko: "akan sync" }),
                desc: l.trans({
                  en: "Takes an app or a library; for a library it runs `sync-library`.",
                  ko: "앱이나 라이브러리를 받으며, 라이브러리면 `sync-library`를 실행합니다.",
                }),
              },
              {
                href: "/references/cli/module#create-module",
                title: l.trans({ en: "create-module", ko: "create-module" }),
                desc: l.trans({
                  en: "Add a module to a library: `akan create-module story <lib>`.",
                  ko: "라이브러리에 모듈을 추가합니다. `akan create-module story <lib>`처럼 씁니다.",
                }),
              },
              {
                href: "/conventions/workspace/structure",
                title: l.trans({ en: "Workspace Structure", ko: "워크스페이스 구조" }),
                desc: l.trans({
                  en: "Where `libs/` sits next to `apps/` and `pkgs/`.",
                  ko: "`libs/`가 `apps/`, `pkgs/`와 함께 어디에 놓이는지 봅니다.",
                }),
              },
            ]}
          />
        </Scroll.Slide>
        {commands.flatMap((command) => [
          <Divider key={`${command.name}-divider`} />,
          <CommandReferenceSlide key={command.name} command={command} />,
        ])}
        <DocsToc />
      </Scroll>
    );
  });
