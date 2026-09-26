import { usePage } from "@apps/akan/client";
import {
  type CommandReferenceItem,
  CommandReferenceSlide,
  cardGridRecipe,
  Divider,
  Docs,
  DocsToc,
  panelRecipe,
} from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

  const carried = [
    {
      title: l.trans({ en: "Coding Tools", ko: "기본 코딩 툴" }),
      chip: "read · write · edit · ls · grep · find · bash",
      desc: l.trans({
        en: "Reads, edits and runs commands in the workspace, and fetches and searches the web. The profile decides which are on.",
        ko: "파일을 읽고 고치고 명령을 실행하며, 웹 페이지를 가져오거나 웹을 검색합니다. 어느 것이 켜지는지는 프로필이 정합니다.",
      }),
    },
    {
      title: l.trans({ en: "Akan Tools", ko: "Akan 툴" }),
      chip: "plan_workflow · apply_workflow · run_validation",
      desc: l.trans({
        en: "Context inspection, workflows, repair and validation: the same set `akan mcp` gives an editor's agent.",
        ko: "컨텍스트 조회, 워크플로, 복구, 검증 툴입니다. `akan mcp`가 에디터의 에이전트에게 주는 것과 같은 묶음입니다.",
      }),
    },
    {
      title: l.trans({ en: "Akan Skills", ko: "Akan 스킬" }),
      chip: "akan-module · akan-store · akan-validate · …",
      desc: l.trans({
        en: "Playbooks for the scaffolding chain, the store surface and the validation loop, read when a task needs one. Add your own in `~/.akan/code/skills` or `.akan/code/skills`.",
        ko: "스캐폴딩 순서, 스토어 사용법, 검증 루프를 담은 안내서로, 작업에 필요할 때 읽습니다. 직접 쓴 스킬은 `~/.akan/code/skills`나 `.akan/code/skills`에 둡니다.",
      }),
    },
    {
      title: l.trans({ en: "Project Rules", ko: "프로젝트 규칙" }),
      chip: "AGENTS.md",
      desc: l.trans({
        en: "The workspace's `AGENTS.md` sits in the context window, so the agent follows the conventions from the first turn.",
        ko: "워크스페이스의 `AGENTS.md`가 컨텍스트에 실려 있어, 첫 턴부터 이 저장소의 규칙을 따릅니다.",
      }),
    },
  ];

  const compareRows = [
    {
      command: "akan code",
      where: l.trans({ en: "Your terminal", ko: "터미널" }),
      desc: l.trans({
        en: "An agent of its own that already carries the tools and rules above.",
        ko: "위의 툴과 규칙을 이미 갖춘 독립 에이전트입니다.",
      }),
    },
    {
      command: "akan mcp",
      where: l.trans({ en: "Your editor", ko: "에디터" }),
      desc: l.trans({
        en: "A server that lets an editor's agent reach this workspace's tools.",
        ko: "에디터의 에이전트가 이 워크스페이스의 툴을 쓰게 해 주는 서버입니다.",
      }),
    },
    {
      command: "akan agent install",
      where: l.trans({ en: "Your editor", ko: "에디터" }),
      desc: l.trans({
        en: "Writes the rule files an editor's agent reads.",
        ko: "에디터의 에이전트가 읽는 규칙 파일을 씁니다.",
      }),
    },
  ];

  const modeRows = [
    {
      mode: <span className="font-sans">RPC</span>,
      when: "`--rpc`",
      result: l.trans({
        en: "Serves akan wire frames over stdio for another process to drive.",
        ko: "다른 프로세스가 에이전트를 구동하도록 stdio로 akan wire frame을 주고받습니다.",
      }),
    },
    {
      mode: <span className="font-sans">{l.trans({ en: "Full-screen session", ko: "전체 화면 세션" })}</span>,
      when: l.trans({
        en: "`--interactive`, or no prompt and no `--json` on a terminal",
        ko: "`--interactive`이거나, 터미널에서 프롬프트와 `--json`을 모두 생략했을 때",
      }),
      result: l.trans({
        en: "A chat you keep talking to. A prompt you pass becomes its first message.",
        ko: "계속 대화를 이어 가는 채팅 화면입니다. 넘긴 프롬프트는 첫 메시지가 됩니다.",
      }),
    },
    {
      mode: <span className="font-sans">{l.trans({ en: "One run", ko: "한 번 실행" })}</span>,
      when: l.trans({ en: "Any other call with a prompt", ko: "그 밖에 프롬프트가 있을 때" }),
      result: l.trans({
        en: "Runs the prompt to the end and prints each event. With `--json`, one JSON line per event.",
        ko: "프롬프트를 끝까지 실행하며 이벤트를 출력합니다. `--json`이면 이벤트마다 JSON 한 줄입니다.",
      }),
    },
  ];

  const commands: CommandReferenceItem[] = [
    {
      name: "code",
      signature:
        "akan code [prompt] [--app <app>] [--profile <local|pod|review|web>] [--model <provider/id>] [--json <boolean>] [--thinking <boolean>] [--rpc <boolean>] [--resume <id>] [--interactive <boolean>]",
      desc: l.trans({
        en: "Runs the Akan coding agent. Pass a prompt for one run, or leave it off to open the full-screen session.",
        ko: "Akan 코딩 에이전트를 실행합니다. 프롬프트를 주면 한 번 실행하고, 생략하면 전체 화면 세션을 엽니다.",
      }),
      args: [
        {
          name: "prompt",
          type: "String",
          required: "no",
          defaultValue: "-",
          desc: l.trans({
            en: "What the agent should do. Left off on a terminal, the full-screen session opens.",
            ko: "에이전트에게 맡길 일입니다. 터미널에서 생략하면 전체 화면 세션이 열립니다.",
          }),
        },
      ],
      options: [
        {
          name: "--app",
          type: "String",
          defaultValue: "-",
          enumOrFlag: "nullable · flag: -a",
          desc: l.trans({
            en: "Narrows the agent to one app, rooted at `apps/<app>`. Without it, the whole repo is in scope.",
            ko: "에이전트의 범위를 `apps/<app>` 하나로 좁힙니다. 생략하면 저장소 전체가 대상입니다.",
          }),
        },
        {
          name: "--profile",
          type: "String",
          defaultValue: "local",
          enumOrFlag: "local | pod | review | web · flag: -p",
          desc: l.trans({
            en: "Picks what the agent may do: its tools, approvals and session storage. See Profiles below.",
            ko: "에이전트가 할 수 있는 일(툴, 승인, 세션 저장)을 고릅니다. 아래 프로필 표를 보세요.",
          }),
        },
        {
          name: "--model",
          type: "String",
          defaultValue: "-",
          enumOrFlag: "nullable · flag: -m",
          desc: l.trans({
            en: "`<provider>/<id>`. Default: `deepseek/deepseek-flash`; without its key, the first available.",
            ko: "`<provider>/<id>` 형식입니다. 기본은 `deepseek/deepseek-flash`이고, 그 키가 없으면 쓸 수 있는 첫 모델입니다.",
          }),
        },
        {
          name: "--json",
          type: "Boolean",
          defaultValue: "false",
          enumOrFlag: "flag: -j",
          desc: l.trans({
            en: "Prints one event per line as JSON. The full-screen session then opens only with `--interactive`.",
            ko: "이벤트를 한 줄에 하나씩 JSON으로 출력합니다. 이때 전체 화면 세션은 `--interactive`를 줄 때만 열립니다.",
          }),
        },
        {
          name: "--thinking",
          type: "Boolean",
          defaultValue: "false",
          enumOrFlag: "flag: -t",
          desc: l.trans({
            en: "Prints the model's reasoning alongside its output.",
            ko: "모델의 추론 과정을 출력과 함께 보여 줍니다.",
          }),
        },
        {
          name: "--rpc",
          type: "Boolean",
          defaultValue: "false",
          enumOrFlag: "flag: -r",
          desc: l.trans({
            en: "Serves the agent over stdio as akan wire frames for another process. Wins over every other mode.",
            ko: "다른 프로세스가 쓰도록 에이전트를 stdio의 akan wire frame으로 제공합니다. 다른 모든 실행 방식보다 우선합니다.",
          }),
        },
        {
          name: "--resume",
          type: "String",
          defaultValue: "-",
          enumOrFlag: "nullable · flag: -R",
          desc: l.trans({
            en: "Reopens a stored session by id in the full-screen session. Only `local` and `web` save sessions.",
            ko: "저장된 세션을 id로 찾아 전체 화면 세션에서 이어 갑니다. 세션을 저장하는 프로필은 `local`과 `web`뿐입니다.",
          }),
        },
        {
          name: "--interactive",
          type: "Boolean",
          defaultValue: "false",
          enumOrFlag: "flag: -i",
          desc: l.trans({
            en: "Opens the full-screen session even when a prompt is given, and sends that prompt first.",
            ko: "프롬프트를 줬어도 전체 화면 세션을 열고, 그 프롬프트를 첫 메시지로 보냅니다.",
          }),
        },
      ],
      notes: [
        {
          name: l.trans({ en: "API key", ko: "API 키" }),
          desc: l.trans({
            en: "Set `<PROVIDER>_API_KEY` in the workspace `.env` or your shell, e.g. `DEEPSEEK_API_KEY`.",
            ko: "워크스페이스 `.env`나 셸 환경에 `<PROVIDER>_API_KEY`를 둡니다. 예: `DEEPSEEK_API_KEY`.",
          }),
        },
        {
          name: l.trans({ en: "resume id", ko: "세션 id" }),
          desc: l.trans({
            en: "When a full-screen session with a conversation closes, it prints `akan code --resume <id>`.",
            ko: "대화가 있던 전체 화면 세션은 닫힐 때 `akan code --resume <id>` 줄을 출력합니다.",
          }),
        },
        {
          name: l.trans({ en: "session files", ko: "세션 파일" }),
          desc: l.trans({
            en: "Stored under `.akan/code/sessions` in the workspace. An id that is not there is an error.",
            ko: "워크스페이스의 `.akan/code/sessions`에 저장됩니다. 없는 id를 주면 오류가 납니다.",
          }),
        },
        {
          name: l.trans({ en: "denied paths", ko: "차단 경로" }),
          desc: l.trans({
            en: "Every profile refuses `.env`, `.env.*`, `secrets/`, `*.pem` and `*.key`, whatever its allowlist.",
            ko: "어떤 프로필이든 허용 목록과 상관없이 `.env`, `.env.*`, `secrets/`, `*.pem`, `*.key`를 거부합니다.",
          }),
        },
      ],
      examples: `akan code
akan code "add a comment module to koyo"
akan code --app koyo
akan code "review the order flow" --profile review
akan code "add a topping field" --model deepseek/deepseek-flash --thinking true
akan code --resume <session-id>
akan code "summarize the diff" --json true
akan code --rpc true`,
    },
  ];

  const profileColumns = [
    { key: "write", label: l.trans({ en: "Write & run", ko: "쓰기·실행" }) },
    { key: "web", label: l.trans({ en: "Web", ko: "웹" }) },
    { key: "mcp", label: "MCP" },
    { key: "ask", label: l.trans({ en: "Asks first", ko: "쓰기 승인" }) },
    { key: "saved", label: l.trans({ en: "Saved", ko: "세션 저장" }) },
  ];

  const profileGroups = [
    {
      label: l.trans({ en: "Waits for your answer (await)", ko: "질문·승인에 답이 올 때까지 기다림 (await)" }),
      rows: [
        {
          name: "local",
          desc: l.trans({
            en: "The default. Everything is on, and nothing asks for approval.",
            ko: "기본값입니다. 모든 기능이 켜져 있고 승인을 묻지 않습니다.",
          }),
          marks: { write: true, web: true, mcp: true, ask: false, saved: true },
        },
        {
          name: "review",
          desc: l.trans({
            en: "A reviewer: only `read`, `ls`, `grep` and `find`, no `AGENTS.md`, sessions in memory.",
            ko: "리뷰어용입니다. `read`, `ls`, `grep`, `find`만 쓰고 `AGENTS.md`는 싣지 않으며, 세션은 메모리에만 둡니다.",
          }),
          marks: { write: false, web: false, mcp: false, ask: false, saved: false },
        },
      ],
    },
    {
      label: l.trans({
        en: "Ends the turn and picks it up later (suspend)",
        ko: "질문·승인에서 턴을 끝내고 나중에 이어 감 (suspend)",
      }),
      rows: [
        {
          name: "pod",
          desc: l.trans({
            en: "An isolated container with nobody watching it: everything but MCP is on.",
            ko: "지켜보는 사람이 없는 격리 컨테이너입니다. MCP만 빼고 모두 켜집니다.",
          }),
          marks: { write: true, web: true, mcp: false, ask: false, saved: false },
        },
        {
          name: "web",
          desc: l.trans({
            en: "The reach of `local`, but every file write waits for your approval.",
            ko: "범위는 `local`과 같지만, 파일을 쓸 때마다 승인을 받습니다.",
          }),
          marks: { write: true, web: true, mcp: true, ask: true, saved: true },
        },
      ],
    },
  ];

  const profileNotes = [
    l.trans({
      en: (
        <>
          <strong>await or suspend.</strong> <code>await</code> holds the turn open until you answer.{" "}
          <code>suspend</code> ends the turn and reopens one with your answer, so it survives a process restart.
        </>
      ),
      ko: (
        <>
          <strong>await와 suspend.</strong> <code>await</code>는 답이 올 때까지 턴을 열어 둡니다. <code>suspend</code>는
          턴을 끝냈다가 답을 담아 새 턴을 열므로, 프로세스가 재시작돼도 이어집니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Every profile carries the Akan tools and skills.</strong> <code>review</code> gets only the Akan tools
          that change nothing.
        </>
      ),
      ko: (
        <>
          <strong>Akan 툴과 스킬은 모든 프로필에 있습니다.</strong> 단, <code>review</code>는 아무것도 바꾸지 않는 Akan
          툴만 받습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>web</code> asks before <code>write</code> and <code>edit</code> only.
          </strong>{" "}
          <code>bash</code> never waits for approval.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>web</code>이 승인을 묻는 것은 <code>write</code>와 <code>edit</code>뿐입니다.
          </strong>{" "}
          <code>bash</code>는 승인을 묻지 않고 실행됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>MCP servers come from two files.</strong> <code>~/.akan/code/mcp.json</code> is yours and{" "}
          <code>.akan/code/mcp.json</code> is the checkout's; on a shared name the workspace entry wins.
        </>
      ),
      ko: (
        <>
          <strong>MCP 서버는 두 파일에서 읽습니다.</strong> <code>~/.akan/code/mcp.json</code>은 내 설정,{" "}
          <code>.akan/code/mcp.json</code>은 이 저장소의 설정이고, 이름이 겹치면 워크스페이스 쪽이 이깁니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>--app</code> is a real boundary.
          </strong>{" "}
          It moves the profile's root to <code>apps/&lt;app&gt;</code>, and file tools refuse any path outside it. That
          holds better than a prompt politely asking the agent to stay there.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>--app</code>은 실제 경계입니다.
          </strong>{" "}
          프로필의 루트를 <code>apps/&lt;app&gt;</code>으로 옮기고, 파일 툴은 그 밖의 경로를 거부합니다. 그 앱에만
          머물러 달라고 프롬프트로 부탁하는 것보다 확실합니다.
        </>
      ),
    }),
  ];

  const relatedLinks = [
    {
      href: "/docs/arch/agentic",
      title: l.trans({ en: "Architecture · Agentic", ko: "아키텍처 · Agentic" }),
      desc: l.trans({
        en: "The agent that runs inside a rendered page instead of a terminal.",
        ko: "터미널이 아니라 렌더링된 페이지 안에서 도는 에이전트입니다.",
      }),
    },
    {
      href: "/references/cli/agent",
      title: "Agent CLI",
      desc: l.trans({
        en: "`akan agent install`, which writes the rule files an editor's agent reads.",
        ko: "에디터의 에이전트가 읽는 규칙 파일을 쓰는 `akan agent install`입니다.",
      }),
    },
    {
      href: "/references/cli/context#mcp",
      title: "akan mcp",
      desc: l.trans({
        en: "The MCP server that hands this workspace's tools to an editor's agent.",
        ko: "이 워크스페이스의 툴을 에디터의 에이전트에게 넘겨주는 MCP 서버입니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="code-cli" title={l.trans({ en: "Code CLI", ko: "Code CLI" })}>
        <Docs.Title>{l.trans({ en: "Code CLI", ko: "Code CLI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <>
                  <code>akan code</code> runs an AI coding agent in your terminal that already knows this workspace. Ask
                  it to add a field and run the validation loop, with no editor, no MCP client setup, and no explaining
                  the module conventions first.
                </>
              ),
              ko: (
                <>
                  <code>akan code</code>는 이 워크스페이스를 이미 아는 AI 코딩 에이전트를 터미널에서 실행합니다.
                  에디터를 열거나 MCP 클라이언트를 설정하거나 모듈 규칙을 설명할 필요 없이, 필드를 추가하고 검증
                  루프까지 돌려 달라고 바로 맡기면 됩니다.
                </>
              ),
            })}
          </div>
          <ol className="my-4 list-decimal space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    Put a model key in the workspace <code>.env</code>, e.g. <code>DEEPSEEK_API_KEY</code> for the
                    default model.
                  </>
                ),
                ko: (
                  <>
                    워크스페이스 <code>.env</code>에 모델 키를 넣습니다. 기본 모델이라면 <code>DEEPSEEK_API_KEY</code>
                    입니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    Run <code>akan code</code> to start a session, or <code>akan code "&lt;prompt&gt;"</code> for one
                    run.
                  </>
                ),
                ko: (
                  <>
                    <code>akan code</code>로 세션을 열거나, <code>akan code "&lt;prompt&gt;"</code>로 한 번만
                    실행합니다.
                  </>
                ),
              })}
            </li>
          </ol>

          <Docs.SubSubTitle>
            {l.trans({ en: "What The Agent Brings", ko: "에이전트가 처음부터 갖춘 것" })}
          </Docs.SubSubTitle>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {carried.map((card) => (
              <div key={card.chip} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{card.title}</div>
                <code className={chip}>{card.chip}</code>
                <div className="mt-2 text-foreground/70 text-sm">
                  <Docs.CodeText>{card.desc}</Docs.CodeText>
                </div>
              </div>
            ))}
          </div>

          <Docs.SubSubTitle>
            {l.trans({ en: "Not akan mcp, Not akan agent install", ko: "akan mcp, akan agent install과의 차이" })}
          </Docs.SubSubTitle>
          <Docs.Table
            columns={[
              { key: "command", label: l.trans({ en: "Command", ko: "명령어" }), code: true },
              { key: "where", label: l.trans({ en: "Agent runs in", ko: "에이전트 위치" }) },
              { key: "desc", label: l.trans({ en: "What it is", ko: "설명" }) },
            ]}
            rows={compareRows}
            stacked
          />

          <Docs.SubSubTitle>{l.trans({ en: "Three Ways To Run", ko: "세 가지 실행 방식" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "One command runs in three modes, and the arguments pick one — there is no subcommand. They are checked in this order:",
              ko: "명령어는 하나지만 실행 방식은 셋이고, 서브커맨드 없이 인자로 정해집니다. 위에서부터 차례로 확인합니다:",
            })}
          </div>
          <Docs.Table
            columns={[
              { key: "mode", label: l.trans({ en: "Mode", ko: "실행 방식" }), code: true },
              { key: "when", label: l.trans({ en: "When", ko: "조건" }) },
              { key: "result", label: l.trans({ en: "What you get", ko: "결과" }) },
            ]}
            rows={modeRows}
            stacked
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      Without a terminal, or with <code>--json</code>, a missing prompt is an error.
                    </strong>{" "}
                    In a pipe or a CI step, always pass one: <code>akan code "add a comment module"</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      터미널이 없거나 <code>--json</code>을 줬을 때 프롬프트가 없으면 오류입니다.
                    </strong>{" "}
                    파이프나 CI 단계에서는 항상 프롬프트를 넘깁니다: <code>akan code "add a comment module"</code>.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>One run is the shape for scripts.</strong> It exits when the prompt is done, and{" "}
                    <code>--json</code> makes its output machine-readable.
                  </>
                ),
                ko: (
                  <>
                    <strong>스크립트에는 한 번 실행이 맞습니다.</strong> 프롬프트가 끝나면 종료되고, <code>--json</code>
                    을 주면 기계가 읽기 좋은 출력이 됩니다.
                  </>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      {commands.map((command) => (
        <CommandReferenceSlide key={command.name} command={command} />
      ))}
      <Divider />

      <Scroll.Slide id="code-profiles" title={l.trans({ en: "Profiles", ko: "프로필" })}>
        <Docs.Title>{l.trans({ en: "Profiles", ko: "프로필" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <>
                  A profile bundles what the agent may do into one value, picked with <code>--profile</code>. It decides
                  which tools exist, whether writes wait for approval, where sessions are kept, and how much of the
                  project sits in the window.
                </>
              ),
              ko: (
                <>
                  프로필은 에이전트가 할 수 있는 일을 값 하나로 묶은 것이고, <code>--profile</code>로 고릅니다. 어떤
                  툴이 있는지, 쓰기 전에 승인을 받는지, 세션을 어디에 두는지, 프로젝트 문맥을 얼마나 싣는지가 여기서
                  정해집니다.
                </>
              ),
            })}
          </div>
        </Docs.Description>
        <Docs.Matrix
          type={l.trans({ en: "Profile", ko: "프로필" })}
          columns={profileColumns}
          groups={profileGroups}
          markLabel={l.trans({ en: "On", ko: "켜짐" })}
          emptyLabel={l.trans({ en: "Off", ko: "꺼짐" })}
        />
        <ul className="my-4 list-disc space-y-2 pl-5">
          {profileNotes.map((note, idx) => (
            <li key={idx}>{note}</li>
          ))}
        </ul>
        <Docs.Alert type="warning">
          {l.trans({
            en: (
              <>
                <strong>The deny list is not a sandbox for bash.</strong> A command that names <code>.env</code> is
                refused, but a shell can still reach any path. The real boundary is the container the <code>pod</code>{" "}
                profile runs in.
              </>
            ),
            ko: (
              <>
                <strong>차단 목록은 bash의 샌드박스가 아닙니다.</strong> <code>.env</code>를 이름으로 적은 명령은
                거부되지만, 셸은 여전히 어떤 경로에든 닿을 수 있습니다. 진짜 경계는 <code>pod</code> 프로필이 도는
                컨테이너입니다.
              </>
            ),
          })}
        </Docs.Alert>
        <Docs.SubSubTitle>{l.trans({ en: "Related Pages", ko: "함께 볼 문서" })}</Docs.SubSubTitle>
        <Docs.LinkGrid items={relatedLinks} />
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
