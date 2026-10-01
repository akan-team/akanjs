import { usePage } from "@apps/akan/client";
import { type CommandReferenceItem, CommandReferenceSlide, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const catalogue = [
    {
      name: "context",
      href: "#context",
      desc: l.trans({
        en: "Prints the workspace structure, down to each module, in a form an agent can read.",
        ko: "모듈 단위까지 내려간 워크스페이스 구조를 에이전트가 읽을 수 있는 형태로 출력합니다.",
      }),
    },
    {
      name: "doctor",
      href: "#doctor",
      desc: l.trans({
        en: "Reports where the workspace breaks Akan conventions, with a repair command for each problem.",
        ko: "워크스페이스가 Akan 컨벤션을 어긴 곳을 찾아, 문제마다 고칠 명령과 함께 보고합니다.",
      }),
    },
    {
      name: "mcp",
      href: "#mcp",
      desc: l.trans({
        en: "Starts the Akan MCP server, so an editor's agent can ask for the same information itself.",
        ko: "Akan MCP 서버를 띄웁니다. 에디터 속 에이전트가 같은 정보를 직접 물어볼 수 있습니다.",
      }),
    },
    {
      name: "mcp-install",
      href: "#mcp-install",
      desc: l.trans({
        en: "Registers that server in the project config of Cursor, Claude Code and Codex.",
        ko: "그 서버를 Cursor, Claude Code, Codex의 프로젝트 설정에 등록합니다.",
      }),
    },
    {
      name: "mcp-call",
      href: "#mcp-call",
      desc: l.trans({
        en: "Calls one MCP tool from the terminal and prints what an agent would get.",
        ko: "MCP 툴 하나를 터미널에서 호출해, 에이전트가 받을 결과를 그대로 보여 줍니다.",
      }),
    },
  ];

  const termRows = [
    {
      name: "*.abstract.md",
      desc: l.trans({
        en: "A short note beside each module: what it owns and the rules its code cannot show.",
        ko: "모듈마다 옆에 두는 짧은 문서입니다. 모듈이 맡는 일과, 코드로는 드러나지 않는 규칙을 적습니다.",
      }),
    },
    {
      name: "MCP",
      desc: l.trans({
        en: "Model Context Protocol, the standard way a coding agent calls tools outside itself.",
        ko: "Model Context Protocol입니다. 코딩 에이전트가 바깥의 툴을 부르는 표준 방식입니다.",
      }),
    },
    {
      name: "stdio",
      desc: l.trans({
        en: "Standard input and output. The editor starts the server as a child process; no port is opened.",
        ko: "표준 입력과 출력입니다. 에디터가 서버를 자식 프로세스로 띄우므로 포트를 열지 않습니다.",
      }),
    },
    {
      name: "mode",
      desc: l.trans({
        en: "How far the MCP server may go: `readonly` reads, `plan` writes plan files, `apply` edits source.",
        ko: "MCP 서버가 어디까지 할 수 있는지입니다. `readonly`는 읽기, `plan`은 플랜 파일 쓰기, `apply`는 소스 수정까지입니다.",
      }),
    },
    {
      name: "workflow plan",
      desc: l.trans({
        en: "A JSON file under `.akan/workflows/plans/` that describes a change before anything is edited.",
        ko: "`.akan/workflows/plans/` 아래에 두는 JSON 파일로, 무엇을 바꿀지 수정 전에 적어 둡니다.",
      }),
    },
  ];

  const pickRows = [
    {
      want: l.trans({
        en: "Hand an agent the whole workspace at the start of a task.",
        ko: "작업을 시작할 때 에이전트에게 워크스페이스 전체를 건넵니다.",
      }),
      run: "akan context --format json",
    },
    {
      want: l.trans({
        en: "Hand it one module, with the module's abstract.",
        ko: "모듈 하나를 abstract와 함께 건넵니다.",
      }),
      run: "akan context --module user",
    },
    {
      want: l.trans({
        en: "Check conventions before and after an agent's change.",
        ko: "에이전트가 바꾸기 전과 후에 컨벤션을 점검합니다.",
      }),
      run: "akan doctor --strict --format json",
    },
    {
      want: l.trans({
        en: "Let the editor's agent ask for context whenever it needs it.",
        ko: "에디터 속 에이전트가 필요할 때마다 직접 묻게 합니다.",
      }),
      run: "akan mcp-install",
    },
    {
      want: l.trans({
        en: "See exactly what one MCP tool returns.",
        ko: "MCP 툴 하나가 무엇을 돌려주는지 직접 확인합니다.",
      }),
      run: "akan mcp-call list_apps",
    },
  ];

  const contextCommand: CommandReferenceItem = {
    name: "context",
    signature: "akan context [--format <format>] [--app <app>] [--module <module>]",
    desc: l.trans({
      en: "Prints the workspace structure in a form an agent can read.\nUse it when an external coding agent, CI job or IDE extension needs a summary of the workspace.",
      ko: "워크스페이스 구조를 에이전트가 읽을 수 있는 형태로 출력합니다.\n외부 코딩 에이전트, CI job, IDE 확장이 워크스페이스 요약을 필요로 할 때 씁니다.",
    }),
    options: [
      {
        name: "--format",
        type: "String",
        defaultValue: "markdown",
        enumOrFlag: "markdown | json",
        desc: l.trans({
          en: "Output format: `json` for tools, `markdown` for people or a chat prompt.",
          ko: "출력 형식입니다. 도구에는 `json`을, 사람이나 채팅 프롬프트에는 `markdown`을 씁니다.",
        }),
      },
      {
        name: "--app",
        type: "String",
        defaultValue: "-",
        enumOrFlag: "nullable",
        desc: l.trans({
          en: "Lists only this app. Every library and package still appears.",
          ko: "이 앱만 나열합니다. 라이브러리와 패키지는 그대로 모두 나옵니다.",
        }),
      },
      {
        name: "--module",
        type: "String",
        defaultValue: "-",
        enumOrFlag: "nullable",
        desc: l.trans({
          en: "Lists only modules of this name and puts each `*.abstract.md` body before its file list.",
          ko: "이 이름의 모듈만 나열하고, 모듈마다 `*.abstract.md` 본문을 파일 목록보다 먼저 넣습니다.",
        }),
      },
    ],
    notes: [
      {
        name: l.trans({ en: "What it prints", ko: "출력 내용" }),
        desc: l.trans({
          en: "Apps, libraries and packages, each module's files, generated-file patterns, validation commands.",
          ko: "앱·라이브러리·패키지, 모듈별 파일 목록, 생성 파일 패턴, 검증 명령입니다.",
        }),
      },
      {
        name: l.trans({ en: "Abstract scope", ko: "abstract 범위" }),
        desc: l.trans({
          en: "Without `--module`, an abstract shows only its path and headings; `--module` adds the body.",
          ko: "`--module`이 없으면 abstract는 경로와 제목만 나오고, `--module`을 주면 본문까지 나옵니다.",
        }),
      },
      {
        name: l.trans({ en: "Privacy", ko: "민감 정보" }),
        desc: l.trans({
          en: "It never prints `.env` values or secrets.",
          ko: "`.env` 값이나 secret은 출력하지 않습니다.",
        }),
      },
    ],
    examples: `akan context
akan context --format json
akan context --app akan
akan context --module user`,
  };

  const doctorCommand: CommandReferenceItem = {
    name: "doctor",
    signature: "akan doctor [--format <format>] [--strict <boolean>] [--ios <boolean>]",
    desc: l.trans({
      en: "Reports where the workspace drifts from Akan conventions, such as stray files or missing module abstracts.\nRun it before and after an agent's change; `--format json` gives a machine-readable result.",
      ko: "워크스페이스가 Akan 컨벤션에서 벗어난 곳을 보고합니다. 허용되지 않은 파일, 빠진 모듈 abstract 같은 것들입니다.\n에이전트가 바꾸기 전과 후에 실행하고, 기계가 읽을 결과가 필요하면 `--format json`을 씁니다.",
    }),
    options: [
      {
        name: "--format",
        type: "String",
        defaultValue: "text",
        enumOrFlag: "text | json",
        desc: l.trans({
          en: "Output format. Use `json` for agent validation loops and CI.",
          ko: "출력 형식입니다. 에이전트 검증 루프와 CI에는 `json`을 씁니다.",
        }),
      },
      {
        name: "--strict",
        type: "Boolean",
        defaultValue: "false",
        desc: l.trans({
          en: "Turns recommended conventions into errors; today that is a missing module abstract.",
          ko: "권장 사항인 컨벤션도 오류로 올립니다. 지금은 빠진 모듈 abstract가 여기에 해당합니다.",
        }),
      },
      {
        name: "--ios",
        type: "Boolean",
        defaultValue: "false",
        desc: l.trans({
          en: "Checks only the native config instead, for a placeholder bundle id Apple has likely claimed.",
          ko: "컨벤션 대신 native 설정만 점검합니다. Apple이 이미 가져갔을 법한 자리 표시자 bundle id를 찾습니다.",
        }),
      },
    ],
    notes: [
      {
        name: l.trans({ en: "Status", ko: "상태" }),
        desc: l.trans({
          en: "`failed` when any diagnostic is an error, `passed` otherwise.",
          ko: "진단 중 하나라도 오류면 `failed`, 아니면 `passed`입니다.",
        }),
      },
      {
        name: l.trans({ en: "Also printed", ko: "함께 출력" }),
        desc: l.trans({
          en: "Generated-file freshness, a repair command per problem, and the validation commands.",
          ko: "생성 파일이 최신인지, 문제별 복구 명령, 검증 명령을 함께 출력합니다.",
        }),
      },
      {
        name: l.trans({ en: "Boolean options", ko: "불리언 옵션" }),
        desc: l.trans({
          en: "`--strict` alone means `--strict true`.",
          ko: "`--strict`처럼 이름만 쓰면 `--strict true`와 같습니다.",
        }),
      },
    ],
    examples: `akan doctor
akan doctor --format json
akan doctor --format json --strict true
akan doctor --ios`,
  };

  const mcpCommand: CommandReferenceItem = {
    name: "mcp",
    signature: "akan mcp [--mode <readonly|plan|apply>]",
    desc: l.trans({
      en: "Starts the Akan MCP server over stdio.\nAn MCP-aware coding agent asks it for workspace and module context, guidelines, command explanations and diagnostics.\n`--mode` decides how far the agent may go, and the default is the narrowest.",
      ko: "Akan MCP 서버를 stdio로 띄웁니다.\nMCP를 지원하는 코딩 에이전트가 이 서버에 워크스페이스·모듈 컨텍스트, 가이드라인, 명령 설명, 진단을 묻습니다.\n에이전트가 어디까지 할 수 있는지는 `--mode`가 정하고, 기본값이 가장 좁은 범위입니다.",
    }),
    options: [
      {
        name: "--mode",
        type: "String",
        defaultValue: "readonly",
        enumOrFlag: "readonly | plan | apply",
        desc: l.trans({
          en: "`readonly` only reads; `plan` may also write a plan file; `apply` may also edit source.",
          ko: "`readonly`는 읽기만 하고, `plan`은 플랜 파일도 쓰며, `apply`는 소스까지 고칩니다.",
        }),
      },
    ],
    notes: [
      {
        name: l.trans({ en: "plan mode", ko: "plan 모드" }),
        desc: l.trans({
          en: "Adds `list_workflows`, `explain_workflow` and `plan_workflow`, which write only a plan file.",
          ko: "`list_workflows`, `explain_workflow`, `plan_workflow`가 더해집니다. 쓰는 것은 플랜 파일뿐입니다.",
        }),
      },
      {
        name: l.trans({ en: "apply mode", ko: "apply 모드" }),
        desc: l.trans({
          en: "Adds `apply_workflow`, `run_validation` and the repair tools, so it edits source.",
          ko: "`apply_workflow`, `run_validation`과 복구 툴이 더해지므로 소스를 고칩니다.",
        }),
      },
      {
        name: l.trans({ en: "Workflow policy", ko: "워크플로 정책" }),
        desc: l.trans({
          en: "`AGENTS.md` tells agents to plan with `--mode plan`, apply with `--mode apply`, prefer workflows.",
          ko: "`AGENTS.md`는 에이전트에게 `--mode plan`으로 계획하고 `--mode apply`로 적용하며, 워크플로를 먼저 쓰라고 안내합니다.",
        }),
      },
      {
        name: l.trans({ en: "Module context", ko: "모듈 컨텍스트" }),
        desc: l.trans({
          en: "`get_module_context` returns the module abstract first, then the module's file list.",
          ko: "`get_module_context`는 모듈 abstract를 먼저, 이어서 모듈의 파일 목록을 돌려줍니다.",
        }),
      },
      {
        name: l.trans({ en: "Where to run", ko: "실행 위치" }),
        desc: l.trans({
          en: "Start it from the workspace root; the server reads the workspace from its current folder.",
          ko: "워크스페이스 루트에서 띄웁니다. 서버는 현재 폴더를 워크스페이스로 읽습니다.",
        }),
      },
    ],
    examples: `akan mcp
akan mcp --mode plan
akan mcp --mode apply`,
  };

  const mcpInstallCommand: CommandReferenceItem = {
    name: "mcp-install",
    signature: "akan mcp-install [target] [--force <boolean>] [--mode <readonly|plan|apply>]",
    desc: l.trans({
      en: "Registers the Akan MCP server in the project config of Cursor, Claude Code and Codex.\nOther servers in those files are kept; only the `akan` entry is written.",
      ko: "Akan MCP 서버를 Cursor, Claude Code, Codex의 프로젝트 설정에 등록합니다.\n설정 파일에 있던 다른 서버는 그대로 두고 `akan` 항목만 씁니다.",
    }),
    args: [
      {
        name: "target",
        type: "String",
        defaultValue: "all",
        enumOrFlag: "cursor | claude | codex | all",
        desc: l.trans({
          en: "Which tool to register. Leave it off to register all three.",
          ko: "등록할 도구입니다. 생략하면 셋 모두 등록합니다.",
        }),
      },
    ],
    options: [
      {
        name: "--force",
        type: "Boolean",
        defaultValue: "false",
        desc: l.trans({
          en: "Replaces an `akan` entry that differs. Without it the command stops with an error.",
          ko: "내용이 다른 `akan` 항목이 이미 있으면 덮어씁니다. 없으면 오류를 내고 멈춥니다.",
        }),
      },
      {
        name: "--mode",
        type: "String",
        defaultValue: "apply",
        enumOrFlag: "readonly | plan | apply",
        desc: l.trans({
          en: "The mode the editor starts `akan mcp` in. The default here is `apply`, not `readonly`.",
          ko: "에디터가 `akan mcp`를 띄울 때 쓸 모드입니다. 여기서는 기본값이 `readonly`가 아니라 `apply`입니다.",
        }),
      },
    ],
    notes: [
      {
        name: "Cursor",
        desc: l.trans({
          en: "Writes `.cursor/mcp.json`. The entry moves into the opened workspace folder first.",
          ko: "`.cursor/mcp.json`에 씁니다. 항목이 먼저 열린 워크스페이스 폴더로 이동한 뒤 실행합니다.",
        }),
      },
      {
        name: "Claude Code",
        desc: l.trans({
          en: "Writes `.mcp.json`. The entry moves into `$CLAUDE_PROJECT_DIR` first.",
          ko: "`.mcp.json`에 씁니다. 항목이 먼저 `$CLAUDE_PROJECT_DIR`로 이동한 뒤 실행합니다.",
        }),
      },
      {
        name: "Codex",
        desc: l.trans({
          en: "Writes `.codex/config.toml`. Start Codex from the workspace root, since the entry does not move.",
          ko: "`.codex/config.toml`에 씁니다. 항목이 폴더를 옮기지 않으므로 Codex를 워크스페이스 루트에서 실행합니다.",
        }),
      },
      {
        name: l.trans({ en: "New workspaces", ko: "새 워크스페이스" }),
        desc: l.trans({
          en: "`akan create-workspace` runs this for all three with `--force`, so it starts in `apply` mode.",
          ko: "`akan create-workspace`가 셋 모두에 `--force`로 실행하므로 새 워크스페이스는 `apply` 모드로 시작합니다.",
        }),
      },
    ],
    examples: `akan mcp-install
akan mcp-install claude
akan mcp-install cursor --mode plan --force`,
  };

  const mcpCallCommand: CommandReferenceItem = {
    name: "mcp-call",
    signature: "akan mcp-call <tool> [--mode <readonly|plan|apply>] [--args <json>] [--format json]",
    desc: l.trans({
      en: "Calls one Akan MCP tool from the terminal and prints its JSON result.\nIt runs the same code as the server without the stdio protocol, so it shows exactly what an agent would get.",
      ko: "Akan MCP 툴 하나를 터미널에서 호출하고 JSON 결과를 출력합니다.\nstdio 프로토콜 없이 서버와 같은 코드를 실행하므로, 에이전트가 받을 결과를 그대로 볼 수 있습니다.",
    }),
    args: [
      {
        name: "tool",
        type: "String",
        required: "yes",
        desc: l.trans({
          en: "The tool name, such as `list_apps` or `plan_workflow`.",
          ko: "`list_apps`, `plan_workflow` 같은 툴 이름입니다.",
        }),
      },
    ],
    options: [
      {
        name: "--mode",
        type: "String",
        defaultValue: "readonly",
        enumOrFlag: "readonly | plan | apply",
        desc: l.trans({
          en: "The mode to call in. A tool that the mode does not carry fails.",
          ko: "호출할 모드입니다. 그 모드에 없는 툴을 부르면 실패합니다.",
        }),
      },
      {
        name: "--args",
        type: "String",
        defaultValue: "-",
        enumOrFlag: "nullable",
        desc: l.trans({
          en: "The tool's arguments as one JSON object. Wrap it in single quotes in the shell.",
          ko: "툴 인자를 JSON 객체 하나로 넘깁니다. 셸에서는 작은따옴표로 감쌉니다.",
        }),
      },
      {
        name: "--format",
        type: "String",
        defaultValue: "json",
        enumOrFlag: "json",
        desc: l.trans({
          en: "Output format. `json` is the only one.",
          ko: "출력 형식입니다. `json` 하나뿐입니다.",
        }),
      },
    ],
    notes: [
      {
        name: l.trans({ en: "Real calls", ko: "실제 호출" }),
        desc: l.trans({
          en: "Nothing is simulated: `plan_workflow` writes a plan file and `apply_workflow` edits source.",
          ko: "흉내가 아니라 실제로 실행합니다. `plan_workflow`는 플랜 파일을 쓰고 `apply_workflow`는 소스를 고칩니다.",
        }),
      },
    ],
    examples: `akan mcp-call list_apps
akan mcp-call get_module_context --args '{"module":"user"}'
akan mcp-call plan_workflow --mode plan --args '{"workflow":"add-field","inputs":{"app":"demo"}}'`,
  };

  const errorLevel = l.trans({ en: "error", ko: "오류" });
  const warningLevel = l.trans({ en: "warning", ko: "경고" });
  const checkRows = [
    {
      code: "app-root-unknown-entry",
      level: errorLevel,
      meaning: l.trans({
        en: "An app root holds a file or folder that the app layout does not allow.",
        ko: "앱 루트에 허용되지 않은 파일이나 폴더가 있습니다.",
      }),
    },
    {
      code: "lib-root-unknown-entry",
      level: errorLevel,
      meaning: l.trans({
        en: "The same check for a library root.",
        ko: "라이브러리 루트에 대한 같은 점검입니다.",
      }),
    },
    {
      code: "module-shape-invalid",
      level: errorLevel,
      meaning: l.trans({
        en: "A module lacks a required file, such as its `*.signal.ts`.",
        ko: "모듈에 `*.signal.ts` 같은 필수 파일이 빠졌습니다.",
      }),
    },
    {
      code: "module-abstract-missing",
      level: l.trans({ en: "warning (error with `--strict`)", ko: "경고 (`--strict`면 오류)" }),
      meaning: l.trans({
        en: "A module has no `*.abstract.md`.",
        ko: "모듈에 `*.abstract.md`가 없습니다.",
      }),
    },
    {
      code: "dictionary-label-missing",
      level: warningLevel,
      meaning: l.trans({
        en: "A field in `*.constant.ts` has no label in the module's dictionary.",
        ko: "`*.constant.ts`의 필드에 대한 라벨이 모듈 딕셔너리에 없습니다.",
      }),
    },
    {
      code: "agent-guide-stale",
      level: warningLevel,
      meaning: l.trans({
        en: "`AGENTS.md` was written by an older framework release than the one installed.",
        ko: "`AGENTS.md`가 설치된 프레임워크보다 오래된 릴리스로 쓰였습니다.",
      }),
    },
    {
      code: "agent-guide-unstamped",
      level: warningLevel,
      meaning: l.trans({
        en: "`AGENTS.md` carries no version stamp, so its age is unknown.",
        ko: "`AGENTS.md`에 버전 표시가 없어 언제 쓰였는지 알 수 없습니다.",
      }),
    },
    {
      code: "recipe-index-stale",
      level: errorLevel,
      meaning: l.trans({
        en: "A recipe list in an `AGENTS.md` misses a recipe or names one that is gone.",
        ko: "`AGENTS.md`의 레시피 목록에 빠진 레시피가 있거나 없어진 레시피가 남아 있습니다.",
      }),
    },
    {
      code: "recipe-inline-duplicate",
      level: warningLevel,
      meaning: l.trans({
        en: "An inline `className` repeats a recipe's look instead of using the recipe.",
        ko: "인라인 `className`이 레시피를 쓰지 않고 같은 모양을 다시 적었습니다.",
      }),
    },
    {
      code: "mobile-appid-placeholder",
      level: l.trans({ en: "warning (`--ios` only)", ko: "경고 (`--ios`에서만)" }),
      meaning: l.trans({
        en: "A native target still uses a placeholder bundle id.",
        ko: "네이티브 타깃이 아직 자리 표시자 bundle id를 씁니다.",
      }),
    },
  ];

  const allModes = { readonly: true, plan: true, apply: true };
  const planModes = { plan: true, apply: true };
  const applyModes = { apply: true };
  const toolGroups = [
    {
      label: l.trans({ en: "Read the workspace", ko: "워크스페이스 읽기" }),
      rows: [
        {
          name: "inspect_akan_context",
          desc: l.trans({
            en: "Typed, read-only context lookup. Agents are told to read with this first.",
            ko: "타입이 있는 읽기 전용 컨텍스트 조회입니다. 에이전트는 이 툴부터 쓰도록 안내받습니다.",
          }),
          marks: allModes,
        },
        {
          name: "get_workspace_summary",
          desc: l.trans({
            en: "The same summary `akan context --format json` prints.",
            ko: "`akan context --format json`이 출력하는 것과 같은 요약입니다.",
          }),
          marks: allModes,
        },
        {
          name: "list_apps",
          desc: l.trans({ en: "The apps, each with its modules.", ko: "앱 목록과 앱별 모듈입니다." }),
          marks: allModes,
        },
        {
          name: "list_modules",
          desc: l.trans({
            en: "Every module across apps and libraries.",
            ko: "앱과 라이브러리에 걸친 모든 모듈입니다.",
          }),
          marks: allModes,
        },
        {
          name: "get_module_context",
          desc: l.trans({
            en: "One module with its abstract body. Pass `app` when two apps share the module name.",
            ko: "abstract 본문을 포함한 모듈 하나입니다. 두 앱에 같은 이름의 모듈이 있으면 `app`을 넘깁니다.",
          }),
          marks: allModes,
        },
        {
          name: "get_guideline",
          desc: l.trans({
            en: "One Akan guideline by name, the same text as `akan guideline show`.",
            ko: "이름으로 고른 Akan 가이드라인 하나입니다. `akan guideline show`와 같은 내용입니다.",
          }),
          marks: allModes,
        },
        {
          name: "explain_command",
          desc: l.trans({
            en: "A short explanation of one `akan` command.",
            ko: "`akan` 명령 하나에 대한 짧은 설명입니다.",
          }),
          marks: allModes,
        },
        {
          name: "doctor_workspace",
          desc: l.trans({
            en: "The `akan doctor` result. Given a plan or changed files, it separates old problems from new.",
            ko: "`akan doctor` 결과입니다. 플랜이나 바뀐 파일을 주면 원래 있던 문제와 새 문제를 나눕니다.",
          }),
          marks: allModes,
        },
        {
          name: "get_validation_contract",
          desc: l.trans({
            en: "The validation commands, the report formats and the tool list of each mode.",
            ko: "검증 명령, 리포트 형식, 모드별 툴 목록입니다.",
          }),
          marks: allModes,
        },
      ],
    },
    {
      label: l.trans({ en: "Plan a change", ko: "변경 계획" }),
      rows: [
        {
          name: "list_workflows",
          desc: l.trans({ en: "The workflows that exist.", ko: "사용할 수 있는 워크플로 목록입니다." }),
          marks: planModes,
        },
        {
          name: "explain_workflow",
          desc: l.trans({
            en: "One workflow's inputs, predicted changes and checks.",
            ko: "워크플로 하나의 입력, 예상 변경, 검증 항목입니다.",
          }),
          marks: planModes,
        },
        {
          name: "plan_workflow",
          desc: l.trans({
            en: "Writes a plan file and returns its `planPath` for `apply_workflow`.",
            ko: "플랜 파일을 쓰고, `apply_workflow`에 넘길 `planPath`를 돌려줍니다.",
          }),
          marks: planModes,
        },
      ],
    },
    {
      label: l.trans({ en: "Apply and repair", ko: "적용과 복구" }),
      rows: [
        {
          name: "apply_workflow",
          desc: l.trans({
            en: "Carries out a stored plan and names what to validate next.",
            ko: "저장된 플랜을 실행하고, 다음에 검증할 대상을 알려 줍니다.",
          }),
          marks: applyModes,
        },
        {
          name: "run_validation",
          desc: l.trans({
            en: "Runs the validation commands for a plan or an apply report.",
            ko: "플랜이나 적용 리포트에 대한 검증 명령을 실행합니다.",
          }),
          marks: applyModes,
        },
        {
          name: "repair_generated",
          desc: l.trans({
            en: "Refreshes generated files, like `akan repair generated`.",
            ko: "`akan repair generated`처럼 생성 파일을 새로 만듭니다.",
          }),
          marks: applyModes,
        },
        {
          name: "repair_imports",
          desc: l.trans({
            en: "Organizes imports, like `akan repair imports`.",
            ko: "`akan repair imports`처럼 import를 정리합니다.",
          }),
          marks: applyModes,
        },
        {
          name: "repair_module_shape",
          desc: l.trans({
            en: "Reports what a module is missing, like `akan repair module-shape`.",
            ko: "`akan repair module-shape`처럼 모듈에 빠진 것을 보고합니다.",
          }),
          marks: applyModes,
        },
      ],
    },
  ];

  const resourceRows = [
    {
      name: "akan://docs/framework",
      desc: l.trans({ en: "The Akan framework guide.", ko: "Akan 프레임워크 가이드입니다." }),
    },
    {
      name: "akan://workspace/summary",
      desc: l.trans({ en: "The workspace summary, as JSON.", ko: "워크스페이스 요약(JSON)입니다." }),
    },
    {
      name: "akan://workspace/apps",
      desc: l.trans({ en: "The apps, as JSON.", ko: "앱 목록(JSON)입니다." }),
    },
    {
      name: "akan://workspace/modules",
      desc: l.trans({ en: "Every module, as JSON.", ko: "모든 모듈(JSON)입니다." }),
    },
    {
      name: "akan://guidelines/<name>",
      desc: l.trans({
        en: "One guideline. There is one entry per guideline.",
        ko: "가이드라인 하나입니다. 가이드라인마다 항목이 하나씩 있습니다.",
      }),
    },
    {
      name: "akan://workspace/modules/<module>/abstract",
      desc: l.trans({
        en: "One module's abstract text. It can be read by URI but is not listed.",
        ko: "모듈 하나의 abstract 본문입니다. URI로 읽을 수는 있지만 목록에는 나오지 않습니다.",
      }),
    },
  ];

  const relatedLinks = [
    {
      href: "/references/cli/workflow#plan-apply-loop",
      title: l.trans({ en: "Plan, Apply, Validate", ko: "계획, 적용, 검증" }),
      desc: l.trans({
        en: "The loop the `plan` and `apply` tools run, and the CLI command behind each tool.",
        ko: "`plan`, `apply` 툴이 도는 순서와, 툴마다 대응하는 CLI 명령입니다.",
      }),
    },
    {
      href: "/references/cli/agent",
      title: "akan agent",
      desc: l.trans({
        en: "Writes and refreshes `AGENTS.md`, the fix for a stale agent guide.",
        ko: "`AGENTS.md`를 쓰고 새로 고칩니다. 오래된 에이전트 가이드를 고치는 방법입니다.",
      }),
    },
    {
      href: "/conventions/module/abstract",
      title: "model.abstract.md",
      desc: l.trans({
        en: "What goes in a module abstract, the file `context` and `doctor` look for.",
        ko: "`context`와 `doctor`가 찾는 모듈 abstract에 무엇을 쓰는지 다룹니다.",
      }),
    },
    {
      href: "/cheatsheet/interface/mcp",
      title: l.trans({ en: "Your App's MCP Server", ko: "앱의 MCP 서버" }),
      desc: l.trans({
        en: "The `/mcp` endpoint your app serves to its users' agents, a different server from `akan mcp`.",
        ko: "앱이 사용자의 에이전트에게 여는 `/mcp` 엔드포인트입니다. `akan mcp`와는 다른 서버입니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="context-cli" title={l.trans({ en: "Context CLI", ko: "컨텍스트 CLI" })}>
        <Docs.Title>{l.trans({ en: "Context CLI", ko: "컨텍스트 CLI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "These commands hand the workspace to coding agents, CI jobs and IDE tools. Run each one from the workspace root.",
              ko: "코딩 에이전트, CI, IDE 도구에 워크스페이스를 건네는 명령입니다. 모두 워크스페이스 루트에서 실행합니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Command", ko: "명령" })} items={catalogue} />
          <Docs.SubSubTitle>{l.trans({ en: "Words Used On This Page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Which One To Run", ko: "어떤 명령을 쓸까" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "`context` hands the workspace over once; `mcp` lets the agent keep asking. `--mode` on `mcp` decides what that agent may change.",
              ko: "`context`는 워크스페이스를 한 번에 건네고, `mcp`는 에이전트가 계속 물어보게 합니다. 에이전트가 무엇까지 바꿀 수 있는지는 `mcp`의 `--mode`가 정합니다.",
            })}
          </div>
          <Docs.Table
            columns={[
              { key: "want", label: l.trans({ en: "When you want to", ko: "하려는 일" }) },
              { key: "run", label: l.trans({ en: "Run", ko: "실행할 명령" }), code: true },
            ]}
            rows={pickRows}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <CommandReferenceSlide command={contextCommand} />
      <Divider />
      <CommandReferenceSlide command={doctorCommand} />
      <Divider />
      <Scroll.Slide id="doctor-checks" title={l.trans({ en: "What doctor Checks", ko: "doctor가 보는 항목" })}>
        <Docs.Title>{l.trans({ en: "What doctor Checks", ko: "doctor가 보는 항목" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Each diagnostic carries a code, a level and the file it points at. Most also carry the command that fixes it, such as `akan repair module-shape`.",
              ko: "진단마다 코드, 수준, 가리키는 파일이 붙습니다. 대부분은 `akan repair module-shape`처럼 고칠 때 쓸 명령도 함께 알려 줍니다.",
            })}
          </div>
          <Docs.Table
            columns={[
              { key: "code", label: l.trans({ en: "Code", ko: "진단 코드" }), code: true },
              { key: "level", label: l.trans({ en: "Level", ko: "수준" }) },
              { key: "meaning", label: l.trans({ en: "Meaning", ko: "뜻" }) },
            ]}
            rows={checkRows}
            stacked
          />
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>doctor never fails the process.</strong> It exits with code 0 even when the status is{" "}
                  <code>failed</code>, so a CI gate must read <code>status</code> from <code>--format json</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>doctor는 프로세스를 실패로 끝내지 않습니다.</strong> 상태가 <code>failed</code>여도 종료
                  코드는 0이므로, CI에서 막으려면 <code>--format json</code> 결과의 <code>status</code>를 읽어야 합니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <CommandReferenceSlide command={mcpCommand} />
      <Divider />
      <CommandReferenceSlide command={mcpInstallCommand} />
      <Divider />
      <CommandReferenceSlide command={mcpCallCommand} />
      <Divider />
      <Scroll.Slide id="mcp-tools" title={l.trans({ en: "MCP Tools And Resources", ko: "MCP 툴과 리소스" })}>
        <Docs.Title>{l.trans({ en: "MCP Tools And Resources", ko: "MCP 툴과 리소스" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The tools `akan mcp` offers grow with `--mode`. A wider mode keeps every tool of the narrower one.",
              ko: "`akan mcp`가 내놓는 툴은 `--mode`에 따라 늘어납니다. 넓은 모드는 좁은 모드의 툴을 모두 포함합니다.",
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Tool", ko: "툴" })}
            columns={[
              { key: "readonly", label: "readonly", code: true },
              { key: "plan", label: "plan", code: true },
              { key: "apply", label: "apply", code: true },
            ]}
            groups={toolGroups}
            markLabel={l.trans({ en: "Offered in this mode", ko: "이 모드에서 제공" })}
            emptyLabel={l.trans({ en: "Not offered", ko: "제공 안 함" })}
          />
          <Docs.SubSubTitle>{l.trans({ en: "Resources", ko: "리소스" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Besides tools, the server offers read-only documents that an agent opens by URI, in every mode.",
              ko: "툴과 별도로, 에이전트가 URI로 여는 읽기 전용 문서도 모든 모드에서 제공합니다.",
            })}
          </div>
          <Docs.IntroTable type="URI" items={resourceRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Related Pages", ko: "관련 페이지" })}</Docs.SubSubTitle>
          <Docs.LinkGrid items={relatedLinks} />
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
