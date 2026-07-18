import { usePage } from "@apps/akan/client";
import { type CommandReferenceItem, CommandReferenceSlide, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const commands: CommandReferenceItem[] = [
    {
      name: "context",
      signature: "akan context [--format <format>] [--app <app>] [--module <module>]",
      desc: "Print agent-readable Akan workspace context.\nUse it when an external coding agent, CI job, or IDE extension needs a structured summary of apps, libraries, packages, modules, generated files, validation commands, and module abstracts.",
      options: [
        {
          name: "--format",
          type: "String",
          defaultValue: "markdown",
          enumOrFlag: "markdown | json",
          desc: "Output format. Use json for tools and markdown for people or chat context.",
        },
        {
          name: "--app",
          type: "String",
          defaultValue: "-",
          enumOrFlag: "nullable",
          desc: "Limit the context to one app.",
        },
        {
          name: "--module",
          type: "String",
          defaultValue: "-",
          enumOrFlag: "nullable",
          desc: "Limit module output and include the matching *.abstract.md content first.",
        },
      ],
      notes: [
        {
          name: "abstract exposure",
          desc: "Workspace summaries include abstract metadata only; module-scoped context includes the abstract body.",
        },
        {
          name: "privacy",
          desc: "The context analyzer does not print .env values or secrets.",
        },
      ],
      examples: `akan context
akan context --format json
akan context --app akan
akan context --module user`,
    },
    {
      name: "doctor",
      signature: "akan doctor [--format <format>] [--strict <boolean>]",
      desc: "Report Akan workspace convention diagnostics.\nUse it before or after agent changes to catch unsupported files, missing module abstracts, and convention drift in machine-readable form.",
      options: [
        {
          name: "--format",
          type: "String",
          defaultValue: "text",
          enumOrFlag: "text | json",
          desc: "Output format. Use json for agent validation loops.",
        },
        {
          name: "--strict",
          type: "Boolean",
          defaultValue: "false",
          enumOrFlag: "-",
          desc: "Treat recommended conventions such as missing module abstracts as errors.",
        },
      ],
      examples: `akan doctor
akan doctor --format json
akan doctor --format json --strict true`,
    },
    {
      name: "mcp",
      signature: "akan mcp",
      desc: "Start the read-only Akan MCP server over stdio.\nThe server exposes workspace context, module context, guideline instructions, command explanations, diagnostics, and resources for MCP-aware coding agents.",
      notes: [
        { name: "mode", desc: "Read-only. It does not write files, scaffold modules, or call LLM providers." },
        {
          name: "module context",
          desc: "`get_module_context` returns the module abstract first, then surrounding module file metadata.",
        },
      ],
      examples: "akan mcp",
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="context-cli" title={l.trans({ en: "Context CLI", ko: "Context CLI" })}>
        <Docs.Title>{l.trans({ en: "Context CLI", ko: "Context CLI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Context commands expose Akan workspace structure in forms that people, agents, CI jobs, and MCP clients can consume.",
              ko: "Context command는 사람, agent, CI job, MCP client가 읽을 수 있는 형태로 Akan workspace 구조를 제공합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Use `context` to understand the workspace, `doctor` to validate conventions, and `mcp` when an MCP-aware client should query the same information over stdio.",
              ko: "`context`는 workspace 이해에, `doctor`는 convention 검증에, `mcp`는 MCP client가 같은 정보를 stdio로 조회해야 할 때 사용합니다.",
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
