import { usePage } from "@apps/akan/client";
import { type CommandReferenceItem, CommandReferenceSlide, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const commands: CommandReferenceItem[] = [
    {
      name: "agent",
      signature: "akan agent install [target] [--force <boolean>]",
      desc: "Install Akan agent rules for editors and coding agents.\nThe generated files summarize workspace shape, module abstract rules, generated file boundaries, validation commands, and the compact framework guideline.",
      args: [
        {
          name: "target",
          type: "String",
          required: "no",
          defaultValue: "all",
          desc: "Rule target. Use cursor, agents-md, claude, or all.",
        },
      ],
      options: [
        {
          name: "--force",
          type: "Boolean",
          defaultValue: "false",
          enumOrFlag: "-",
          desc: "Overwrite existing rule files. Without this flag, existing files are protected.",
        },
      ],
      notes: [
        { name: "cursor", desc: "Writes `.cursor/rules/akan.mdc`." },
        { name: "agents-md", desc: "Writes `AGENTS.md` for generic agent clients such as Codex-style tools." },
        { name: "claude", desc: "Writes `CLAUDE.md` for Claude Code style project guidance." },
        {
          name: "abstract rule",
          desc: "Generated rules tell agents to read `*.abstract.md` before module behavior changes and update it when public behavior or workflows change.",
        },
      ],
      examples: `akan agent install cursor
akan agent install agents-md
akan agent install claude
akan agent install all --force true`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="agent-cli" title={l.trans({ en: "Agent CLI", ko: "Agent CLI" })}>
        <Docs.Title>{l.trans({ en: "Agent CLI", ko: "Agent CLI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Agent commands install project guidance files for coding assistants. They are intentionally separate from the MCP server: rules are persistent project instructions, while MCP provides live read-only context.",
              ko: "Agent command는 coding assistant를 위한 project guidance file을 설치합니다. rule은 지속되는 project instruction이고 MCP는 live read-only context를 제공하므로 둘은 의도적으로 분리되어 있습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Use this after creating a workspace or when you want Cursor, Claude Code, Codex-style agents, and similar tools to follow Akan conventions consistently.",
              ko: "workspace 생성 후 또는 Cursor, Claude Code, Codex 스타일 agent 등이 Akan convention을 일관되게 따르도록 만들고 싶을 때 사용합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      {commands.map((command) => (
        <CommandReferenceSlide key={command.name} command={command} />
      ))}
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
