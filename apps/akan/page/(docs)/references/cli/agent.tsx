import { usePage } from "@apps/akan/client";
import {
  type CommandReferenceItem,
  CommandReferenceSlide,
  cardGridRecipe,
  Divider,
  Docs,
  DocsToc,
  type IntroItem,
  type MatrixGroup,
  panelRecipe,
} from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "CLI 레퍼런스: Agent | Akan.js" : "CLI Reference: Agent | Akan.js";
    const description =
      lang === "ko"
        ? "워크스페이스 에이전트 가이드를 설치하고, 담긴 규칙을 확인합니다."
        : "Install the workspace agent guide and inspect the rules it carries.";
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
        name: <span className="font-sans">{l.trans({ en: "agent guide", ko: "에이전트 가이드" })}</span>,
        desc: l.trans({
          en: "The workspace's `AGENTS.md`: the short core every coding agent reads first.",
          ko: "워크스페이스의 `AGENTS.md`입니다. 모든 코딩 에이전트가 가장 먼저 읽는 짧은 핵심 규칙입니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "path rule", ko: "경로 규칙" })}</span>,
        desc: l.trans({
          en: "One area's full contract, such as `page/**`, loaded when a matching file is touched.",
          ko: "`page/**` 같은 한 영역의 전체 규칙입니다. 그 경로의 파일을 다룰 때 불러옵니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "skill", ko: "스킬" })}</span>,
        desc: l.trans({
          en: "A procedure and its full guidelines, which an agent loads only when a task needs it.",
          ko: "작업 절차와 그 전체 가이드라인입니다. 에이전트는 작업에 필요할 때만 불러옵니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "pointer", ko: "포인터" })}</span>,
        desc: l.trans({
          en: "A short file that only tells one tool to read `AGENTS.md`, such as `CLAUDE.md`.",
          ko: "도구 하나에게 `AGENTS.md`를 읽으라고만 알려 주는 짧은 파일입니다. `CLAUDE.md`가 그 예입니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "managed block", ko: "관리 블록" })}</span>,
        desc: l.trans({
          en: "The part of `AGENTS.md` between the `akan:agent` markers. The command rewrites only this part.",
          ko: "`AGENTS.md`에서 `akan:agent` 마커 사이 부분입니다. 명령은 이 부분만 다시 씁니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "generated marker", ko: "생성 표시" })}</span>,
        desc: l.trans({
          en: "`<!-- akan:generated -->` in a rule or skill file. Delete it to make the file yours.",
          ko: "규칙·스킬 파일에 들어가는 `<!-- akan:generated -->`입니다. 지우면 그 파일은 직접 관리하는 파일이 됩니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "scoped guide", ko: "앱·라이브러리 가이드" })}</span>,
        desc: l.trans({
          en: "`apps/<app>/AGENTS.md` or `libs/<lib>/AGENTS.md`: the UI recipes that scope can import.",
          ko: "`apps/<app>/AGENTS.md`, `libs/<lib>/AGENTS.md`입니다. 그 앱이나 라이브러리가 import할 수 있는 UI 레시피를 적습니다.",
        }),
      },
    ];

    const targetGroups: MatrixGroup[] = [
      {
        label: l.trans({
          en: "Guide · only the block is rewritten, so `--force` is never needed",
          ko: "가이드 · 블록만 다시 쓰므로 `--force`가 필요 없음",
        }),
        rows: [
          {
            name: "agents-md",
            desc: l.trans({
              en: "Rebuilds the block and the rules and skills it lists, then every app and library guide.",
              ko: "블록과, 블록이 가리키는 규칙·스킬을 다시 만들고, 앱·라이브러리 가이드도 모두 씁니다.",
            }),
            marks: { guide: true, rules: true, skills: true },
          },
        ],
      },
      {
        label: l.trans({
          en: "Generated files · rewritten while they carry the marker",
          ko: "생성 파일 · 생성 표시가 있는 동안 다시 씀",
        }),
        rows: [
          {
            name: "rules",
            desc: l.trans({
              en: "Path rules for Claude Code, each with a Cursor rule pointing at it.",
              ko: "Claude Code용 경로 규칙과, 각각을 가리키는 Cursor 규칙입니다.",
            }),
            marks: { rules: true },
          },
          {
            name: "skills",
            desc: l.trans({
              en: "Skills for Claude Code, and the same skills for Codex and other agents.",
              ko: "Claude Code용 스킬과, Codex 같은 다른 에이전트용 같은 스킬입니다.",
            }),
            marks: { skills: true },
          },
        ],
      },
      {
        label: l.trans({
          en: "Pointers · an existing one is kept unless you pass `--force`",
          ko: "포인터 · 이미 있으면 `--force` 없이는 그대로 둠",
        }),
        rows: [
          {
            name: "claude",
            desc: l.trans({
              en: "Claude Code imports the guide through `@AGENTS.md`.",
              ko: "Claude Code가 `@AGENTS.md`로 가이드를 불러옵니다.",
            }),
            marks: { pointer: true },
          },
          {
            name: "cursor",
            desc: l.trans({
              en: "An always-on Cursor rule that points at the guide.",
              ko: "가이드를 가리키는, 항상 적용되는 Cursor 규칙입니다.",
            }),
            marks: { pointer: true },
          },
        ],
      },
      {
        label: l.trans({ en: "Opt-in · never part of `all`", ko: "선택 · `all`에 들어가지 않음" }),
        rows: [
          {
            name: "hooks",
            desc: l.trans({
              en: "Claude Code hooks that check every edit, merged into `.claude/settings.json`.",
              ko: "편집마다 검사하는 Claude Code 훅을 `.claude/settings.json`에 합쳐 넣습니다.",
            }),
            marks: { hooks: true },
          },
        ],
      },
      {
        label: l.trans({ en: "Default", ko: "기본값" }),
        rows: [
          {
            name: "all",
            desc: l.trans({ en: "Everything except `hooks`.", ko: "`hooks`를 뺀 전부입니다." }),
            marks: { guide: true, rules: true, skills: true, pointer: true },
          },
        ],
      },
    ];

    const whenRules = [
      l.trans({
        en: (
          <>
            <strong>A new workspace already has them.</strong> <code>create-workspace</code> runs{" "}
            <code>akan agent install all --force</code> unless you pass <code>--agent-install false</code>.
          </>
        ),
        ko: (
          <>
            <strong>새 워크스페이스에는 이미 있습니다.</strong> <code>create-workspace</code>가{" "}
            <code>akan agent install all --force</code>를 실행합니다. <code>--agent-install false</code>를 주면
            건너뜁니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>After upgrading Akan.</strong> <code>bun update</code> leaves these files as they were, so run{" "}
            <code>akan agent install</code>. Pointers that already exist are kept.
          </>
        ),
        ko: (
          <>
            <strong>Akan 버전을 올린 뒤.</strong> <code>bun update</code>는 이 파일들을 그대로 두므로{" "}
            <code>akan agent install</code>을 실행합니다. 이미 있는 포인터는 그대로 둡니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>
              When <code>akan doctor</code> warns.
            </strong>{" "}
            <code>agent-guide-stale</code> means a release other than the installed one wrote the guide, and{" "}
            <code>agent-guide-unstamped</code> means it has no version stamp. <code>akan agent install</code> fixes
            both.
          </>
        ),
        ko: (
          <>
            <strong>
              <code>akan doctor</code>가 경고할 때.
            </strong>{" "}
            <code>agent-guide-stale</code>은 지금 설치된 것과 다른 릴리스가 가이드를 썼다는 뜻이고,{" "}
            <code>agent-guide-unstamped</code>는 버전 표시가 없다는 뜻입니다. 둘 다 <code>akan agent install</code>로
            고칩니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>To add one pointer.</strong> Pass <code>claude</code> or <code>cursor</code> as the target. Codex
            and other agents that read <code>AGENTS.md</code> by themselves need none.
          </>
        ),
        ko: (
          <>
            <strong>포인터를 하나만 추가할 때.</strong> 대상으로 <code>claude</code>나 <code>cursor</code>만 지정합니다.{" "}
            <code>AGENTS.md</code>를 스스로 읽는 Codex 같은 에이전트는 포인터가 필요 없습니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>To have Claude Code check its own edits.</strong> <code>akan agent install hooks</code> refuses an
            edit to a generated file, lints each edited file, and runs <code>akan verify</code> over them before Claude
            Code stops.
          </>
        ),
        ko: (
          <>
            <strong>Claude Code가 스스로 편집을 검사하게 할 때.</strong> <code>akan agent install hooks</code>는 생성
            파일 편집을 막고, 편집한 파일마다 린트하며, Claude Code가 멈추기 전에 그 파일들로 <code>akan verify</code>를
            실행합니다.
          </>
        ),
      }),
    ];

    const guideSections: IntroItem[] = [
      {
        name: <span className="font-sans">{l.trans({ en: "Workspace", ko: "워크스페이스" })}</span>,
        desc: l.trans({
          en: "The repo name, and the apps, libraries and packages in it.",
          ko: "저장소 이름과 그 안의 앱, 라이브러리, 패키지 목록입니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "Work loop", ko: "작업 순서" })}</span>,
        desc: l.trans({
          en: "Read the abstract, prefer a workflow, sync after a file change, then run `akan verify` once.",
          ko: "모듈 abstract를 먼저 읽고, 워크플로를 먼저 쓰고, 파일을 바꾸면 sync한 뒤 `akan verify`를 한 번 실행합니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "Change scope", ko: "변경 범위" })}</span>,
        desc: l.trans({
          en: "Change only what the task needs, and follow the nearest established pattern.",
          ko: "작업에 필요한 것만 바꾸고, 가장 가까운 기존 패턴을 따릅니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "Looks wrong, is right", ko: "틀려 보여도 맞는 것" })}</span>,
        desc: l.trans({
          en: "Patterns an agent tends to “fix” that are correct here, such as the class order Biome sorts.",
          ko: "에이전트가 고치려 들지만 이 저장소에서는 맞는 패턴입니다. Biome이 정렬한 클래스 순서가 그 예입니다.",
        }),
      },
      {
        name: (
          <span className="font-sans">{l.trans({ en: "Rules that break the build", ko: "빌드를 깨뜨리는 규칙" })}</span>
        ),
        desc: l.trans({
          en: "One line per lint rule, each naming the path rule with its full contract.",
          ko: "린트 규칙마다 한 줄씩이며, 전체 규칙이 담긴 경로 규칙을 함께 적습니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "Code style", ko: "코드 스타일" })}</span>,
        desc: l.trans({
          en: "TypeScript shape, naming, the language a user reads, and when to comment.",
          ko: "TypeScript 형태, 이름 짓기, 사용자가 읽는 문구의 언어, 주석을 다는 경우입니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "Where code goes", ko: "코드를 둘 곳" })}</span>,
        desc: l.trans({
          en: "The folder for each kind of code, and the command that creates it.",
          ko: "코드 종류별로 둘 폴더와, 그 폴더를 만드는 명령입니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "Secrets", ko: "비밀 값" })}</span>,
        desc: l.trans({
          en: "Never print or commit a secret; an `AKAN_PUBLIC_*` value reaches the browser.",
          ko: "비밀 값은 출력하거나 커밋하지 않습니다. `AKAN_PUBLIC_*` 값은 브라우저까지 갑니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "Path rules", ko: "경로 규칙" })}</span>,
        desc: l.trans({
          en: "Which rule file covers which files, and the skills an agent can load.",
          ko: "어떤 규칙 파일이 어떤 파일을 맡는지와, 에이전트가 불러올 수 있는 스킬 목록입니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "Start clean", ko: "샘플 정리" })}</span>,
        desc: l.trans({
          en: "Present only while samples from `create-workspace` remain, and lists which ones to delete.",
          ko: "`create-workspace`가 만든 샘플이 남아 있을 때만 들어가며, 지울 샘플을 알려 줍니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "Generated files", ko: "생성 파일" })}</span>,
        desc: l.trans({
          en: "Which generated files never to hand-edit, and the commands that regenerate them.",
          ko: "직접 고치면 안 되는 생성 파일과, 그 파일을 다시 만드는 명령입니다.",
        }),
      },
    ];

    const splitCards = [
      {
        title: l.trans({ en: "Rule Files", ko: "규칙 파일" }),
        desc: l.trans({
          en: "Standing instructions an agent carries into every session: how code is written here.",
          ko: "에이전트가 모든 세션에 늘 지니고 가는 지침입니다. 이 저장소에서 코드를 쓰는 방법을 알려 줍니다.",
        }),
        chip: "akan agent install",
      },
      {
        title: l.trans({ en: "MCP Server", ko: "MCP 서버" }),
        desc: l.trans({
          en: "Answers live questions, and in apply mode runs the workflows the rules point at.",
          ko: "그때그때 질문에 답하고, apply 모드에서는 규칙이 가리키는 워크플로까지 실행합니다.",
        }),
        chip: "akan mcp-install",
      },
    ];

    const commands: CommandReferenceItem[] = [
      {
        name: "agent",
        signature: "akan agent install [target] [--force]",
        desc: l.trans({
          en: "Write the agent guide, its path rules, skills and pointers into the workspace.\nRun it again after upgrading Akan: only the managed block of `AGENTS.md` and the generated files are rewritten, so your own text stays.",
          ko: "에이전트 가이드와 경로 규칙, 스킬, 포인터 파일을 워크스페이스에 씁니다.\nAkan 버전을 올린 뒤 다시 실행하세요. `AGENTS.md`의 관리 블록과 생성 파일만 다시 쓰므로 직접 쓴 내용은 그대로 남습니다.",
        }),
        args: [
          {
            name: "action",
            type: "String",
            required: "yes",
            desc: l.trans({
              en: "`install`. `hook` is what the installed hooks run, never typed by hand. Left out, the CLI asks.",
              ko: "`install`입니다. `hook`은 설치한 훅이 실행하는 것이라 직접 칠 일이 없습니다. 생략하면 CLI가 묻습니다.",
            }),
          },
          {
            name: "target",
            type: "String",
            defaultValue: "all",
            enumOrFlag: "cursor | agents-md | claude | rules | skills | hooks | all",
            desc: l.trans({
              en: "Which files to write. Left out, everything except `hooks`.",
              ko: "쓸 파일을 고릅니다. 생략하면 `hooks`를 뺀 전부를 씁니다.",
            }),
          },
        ],
        options: [
          {
            name: "--force",
            type: "Boolean",
            defaultValue: "false",
            enumOrFlag: "-f",
            desc: l.trans({
              en: "Overwrite an existing pointer, and a generated file whose marker you deleted.",
              ko: "이미 있는 포인터와, 생성 표시를 지운 생성 파일까지 덮어씁니다.",
            }),
          },
        ],
        notes: [
          {
            name: "agents-md",
            desc: l.trans({
              en: "Writes `AGENTS.md`, the path rules and the skills, then each app and library guide.",
              ko: "`AGENTS.md`, 경로 규칙, 스킬을 쓰고, 이어서 각 앱·라이브러리 가이드를 씁니다.",
            }),
          },
          {
            name: "rules",
            desc: l.trans({
              en: "Writes `.claude/rules/akan/<name>.md`, and a `.cursor/rules/akan-<name>.mdc` pointing at each.",
              ko: "`.claude/rules/akan/<name>.md`와, 각각을 가리키는 `.cursor/rules/akan-<name>.mdc`를 씁니다.",
            }),
          },
          {
            name: "skills",
            desc: l.trans({
              en: "Writes each skill to `.claude/skills/` and `.agents/skills/`, its guidelines under `references/`.",
              ko: "스킬마다 `.claude/skills/`와 `.agents/skills/`에 쓰고, 가이드라인은 `references/` 아래에 둡니다.",
            }),
          },
          {
            name: "cursor",
            desc: l.trans({
              en: "Writes `.cursor/rules/akan.mdc`, an `alwaysApply` rule that points at `AGENTS.md`.",
              ko: "`AGENTS.md`를 가리키는 `alwaysApply` 규칙 `.cursor/rules/akan.mdc`를 씁니다.",
            }),
          },
          {
            name: "claude",
            desc: l.trans({
              en: "Writes `CLAUDE.md`: an `@AGENTS.md` import plus the comment rule, restated.",
              ko: "`CLAUDE.md`를 씁니다. `@AGENTS.md` import 한 줄과, 한 번 더 적은 주석 규칙이 들어갑니다.",
            }),
          },
          {
            name: "hooks",
            desc: l.trans({
              en: "Adds its three hooks to `.claude/settings.json`; every other hook there stays.",
              ko: "훅 세 개를 `.claude/settings.json`에 넣습니다. 그 파일의 다른 훅은 그대로 둡니다.",
            }),
          },
          {
            name: l.trans({ en: "before an edit", ko: "편집 전" }),
            desc: l.trans({
              en: "An edit to a generated file is refused, with the source to edit and the sync to run instead.",
              ko: "생성 파일 편집을 막고, 대신 고칠 원본과 실행할 sync를 알려 줍니다.",
            }),
          },
          {
            name: l.trans({ en: "after an edit", ko: "편집 후" }),
            desc: l.trans({
              en: "The edited file is lint-fixed, and what lint cannot fix goes back to Claude Code.",
              ko: "편집한 파일을 린트로 고치고, 린트가 고치지 못한 문제는 Claude Code에 돌려줍니다.",
            }),
          },
          {
            name: l.trans({ en: "before stopping", ko: "멈추기 전" }),
            desc: l.trans({
              en: "`akan verify` runs over the session's edits; a failure sends Claude Code back once to fix it.",
              ko: "세션에서 편집한 파일로 `akan verify`를 실행하고, 실패하면 Claude Code를 한 번 되돌려 고치게 합니다.",
            }),
          },
          {
            name: l.trans({ en: "existing AGENTS.md", ko: "기존 AGENTS.md" }),
            desc: l.trans({
              en: "Only the block between the markers is replaced. A file with no markers gets the block appended.",
              ko: "마커 사이 블록만 바꿉니다. 마커가 없는 파일이면 블록을 끝에 덧붙입니다.",
            }),
          },
          {
            name: l.trans({ en: "existing pointer", ko: "기존 포인터" }),
            desc: l.trans({
              en: "Kept as it is without `--force`; the other targets still run.",
              ko: "`--force`가 없으면 그대로 두고, 나머지 대상은 계속 씁니다.",
            }),
          },
          {
            name: l.trans({ en: "your own files", ko: "직접 쓴 파일" }),
            desc: l.trans({
              en: "A rule or skill file without the generated marker is never removed, and rewritten only by `--force`.",
              ko: "생성 표시가 없는 규칙·스킬 파일은 지우지 않으며, `--force`일 때만 다시 씁니다.",
            }),
          },
          {
            name: l.trans({ en: "retired files", ko: "없어진 파일" }),
            desc: l.trans({
              en: "A generated rule or skill the installed release no longer ships is removed.",
              ko: "설치된 릴리스에 더는 없는 생성 규칙·스킬은 지웁니다.",
            }),
          },
          {
            name: l.trans({ en: "scoped guides", ko: "앱·라이브러리 가이드" }),
            desc: l.trans({
              en: "`akan sync <name>` keeps them current, and `akan lint` fails while one is stale.",
              ko: "`akan sync <name>`이 최신으로 유지하고, 오래된 가이드가 있으면 `akan lint`가 실패합니다.",
            }),
          },
          {
            name: l.trans({ en: "skipped scope", ko: "건너뛴 앱·라이브러리" }),
            desc: l.trans({
              en: "One whose config cannot load yet is skipped; `akan sync <name>` writes it later.",
              ko: "설정을 아직 불러올 수 없는 앱·라이브러리는 건너뜁니다. 나중에 `akan sync <name>`이 씁니다.",
            }),
          },
          {
            name: l.trans({ en: "scoped CLAUDE.md", ko: "앱·라이브러리 CLAUDE.md" }),
            desc: l.trans({
              en: "Each app and library also gets a `CLAUDE.md` pointer, but only when it has none.",
              ko: "앱과 라이브러리마다 `CLAUDE.md` 포인터도 만듭니다. 이미 있으면 건드리지 않습니다.",
            }),
          },
          {
            name: l.trans({ en: "version stamp", ko: "버전 표시" }),
            desc: l.trans({
              en: "The block records the release that wrote it, and `akan doctor` compares it with yours.",
              ko: "블록에는 그것을 쓴 릴리스가 적히고, `akan doctor`가 지금 설치된 버전과 비교합니다.",
            }),
          },
          {
            name: l.trans({ en: "flag position", ko: "플래그 위치" }),
            desc: l.trans({
              en: "Put `--force` last: `--force claude` reads `claude` as its value, so `all` runs unforced.",
              ko: "`--force`는 맨 뒤에 씁니다. `--force claude`는 `claude`를 플래그 값으로 읽어, `--force` 없이 `all`을 씁니다.",
            }),
          },
        ],
        examples: `akan agent install
akan agent install agents-md
akan agent install claude
akan agent install hooks
akan agent install all --force`,
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="agent-cli" title={l.trans({ en: "Agent CLI", ko: "에이전트 CLI" })}>
          <Docs.Title>{l.trans({ en: "Agent CLI", ko: "에이전트 CLI" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>akan agent install</code> writes the rule files a coding agent reads before it touches your
                    code: a short <code>AGENTS.md</code> for every agent, path rules and skills it loads when a task
                    needs them, and pointers for Claude Code and Cursor. A convention is written once, and every agent
                    reads the same copy.
                  </span>
                ),
                ko: (
                  <span>
                    <code>akan agent install</code>은 코딩 에이전트가 코드를 고치기 전에 읽는 규칙 파일을 씁니다. 모든
                    에이전트가 읽는 짧은 <code>AGENTS.md</code>, 작업에 필요할 때 불러오는 경로 규칙과 스킬, Claude
                    Code·Cursor용 포인터 파일입니다. 규칙은 한 번만 쓰고 모든 에이전트가 같은 사본을 읽습니다.
                  </span>
                ),
              })}
            </div>
          </Docs.Description>

          <Docs.SubSubTitle>{l.trans({ en: "Words Used on This Page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />

          <Docs.SubSubTitle>{l.trans({ en: "What Each Target Writes", ko: "대상별로 쓰는 파일" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Name a target, or leave it out to write everything but the hooks. The guide is refreshed in place; the other files are written whole.",
              ko: "대상을 하나 고르거나, 생략해서 훅을 뺀 전부를 씁니다. 가이드는 블록만 새로 쓰고, 나머지 파일은 통째로 씁니다.",
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Target", ko: "대상" })}
            columns={[
              { key: "guide", label: l.trans({ en: "Guide", ko: "가이드" }) },
              { key: "rules", label: l.trans({ en: "Rules", ko: "규칙" }) },
              { key: "skills", label: l.trans({ en: "Skills", ko: "스킬" }) },
              { key: "pointer", label: l.trans({ en: "Pointer", ko: "포인터" }) },
              { key: "hooks", label: l.trans({ en: "Hooks", ko: "훅" }) },
            ]}
            groups={targetGroups}
            markLabel={l.trans({ en: "Writes", ko: "씀" })}
            emptyLabel={l.trans({ en: "Does not", ko: "안 씀" })}
          />
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <>
                  <strong>
                    <code>--force</code> replaces the pointers and every generated file whole, marker or not.
                  </strong>{" "}
                  Anything you added there is lost, so keep your own instructions in <code>AGENTS.md</code>, outside the{" "}
                  <code>akan:agent</code> markers, or in a rule or skill file of your own.
                </>
              ),
              ko: (
                <>
                  <strong>
                    <code>--force</code>는 포인터와 모든 생성 파일을 생성 표시와 상관없이 통째로 덮어씁니다.
                  </strong>{" "}
                  거기에 직접 적은 내용은 사라지므로, 직접 쓰는 지침은 <code>AGENTS.md</code>의 <code>akan:agent</code>{" "}
                  마커 바깥이나 직접 만든 규칙·스킬 파일에 두세요.
                </>
              ),
            })}
          </Docs.Alert>

          <Docs.SubSubTitle>{l.trans({ en: "When to Run It", ko: "언제 실행하나요" })}</Docs.SubSubTitle>
          <ul className="my-4 list-disc space-y-2 pl-5">
            {whenRules.map((rule, idx) => (
              <li key={idx}>{rule}</li>
            ))}
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "What the Guide Holds", ko: "가이드에 담기는 내용" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "The managed block is rebuilt from the installed Akan release and your workspace. It stays short, since each full contract lives in a path rule or skill. Top to bottom, it holds:",
              ko: "관리 블록은 설치된 Akan 릴리스와 지금 워크스페이스를 바탕으로 새로 만들어집니다. 전체 규칙은 경로 규칙과 스킬에 있으므로 블록은 짧게 유지됩니다. 위에서부터 이런 내용이 들어갑니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Section", ko: "섹션" })} items={guideSections} />

          <Docs.SubSubTitle>{l.trans({ en: "Rules and MCP", ko: "규칙과 MCP" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Rules and the MCP server are kept apart on purpose. <code>create-workspace</code> installs both.
                </span>
              ),
              ko: (
                <span>
                  규칙과 MCP 서버는 일부러 나눠 두었습니다. <code>create-workspace</code>는 둘 다 설치합니다.
                </span>
              ),
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {splitCards.map(({ title, desc, chip }) => (
              <div key={chip} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="mb-1 font-semibold text-primary">{title}</div>
                <div className="text-foreground/70 text-sm">{desc}</div>
                <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs">
                  {chip}
                </code>
              </div>
            ))}
          </div>

          <Docs.SubSubTitle>{l.trans({ en: "Related Pages", ko: "관련 페이지" })}</Docs.SubSubTitle>
          <Docs.LinkGrid
            items={[
              {
                href: "/references/cli/workspace#create-workspace",
                title: "create-workspace",
                desc: l.trans({
                  en: "`--agent-install` writes these files while it creates the workspace.",
                  ko: "`--agent-install`이 워크스페이스를 만들면서 이 파일들을 씁니다.",
                }),
              },
              {
                href: "/references/cli/context#mcp-install",
                title: "mcp-install",
                desc: l.trans({
                  en: "Registers the Akan MCP server for Cursor, Claude Code and Codex.",
                  ko: "Cursor, Claude Code, Codex에 Akan MCP 서버를 등록합니다.",
                }),
              },
              {
                href: "/references/cli/context#doctor-checks",
                title: l.trans({ en: "doctor checks", ko: "doctor 점검 항목" }),
                desc: l.trans({
                  en: "What the `agent-guide-*` warnings mean.",
                  ko: "`agent-guide-*` 경고의 뜻을 설명합니다.",
                }),
              },
              {
                href: "/references/cli/guideline",
                title: "guideline",
                desc: l.trans({
                  en: "Prints the guidelines that the skills carry, one at a time.",
                  ko: "스킬에 담긴 가이드라인을 하나씩 출력합니다.",
                }),
              },
            ]}
          />
        </Scroll.Slide>
        <Divider />
        {commands.map((command) => (
          <CommandReferenceSlide key={command.name} command={command} />
        ))}
        <DocsToc />
      </Scroll>
    );
  });
