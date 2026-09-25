import { usePage } from "@apps/akan/client";
import { type CommandReferenceItem, CommandReferenceSlide, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const commands: CommandReferenceItem[] = [
    {
      name: "guideline",
      signature: "akan guideline <action> [name] [--format <format>]",
      desc: "List or show bundled Akan guideline instructions.\nUse these read-only commands when an agent, documentation tool, or contributor needs the same generation and review guidance used by Akan's internal instruction set.",
      args: [
        {
          name: "action",
          type: "String",
          required: "yes",
          defaultValue: "-",
          desc: "Use list to print guideline names or show to print a specific instruction.",
        },
        {
          name: "name",
          type: "String",
          required: "for show",
          defaultValue: "-",
          desc: "Guideline name such as framework, moduleOverview, modelSignal, or scalarModule.",
        },
      ],
      options: [
        {
          name: "--format",
          type: "String",
          defaultValue: "markdown",
          enumOrFlag: "markdown | json",
          desc: "Output format. JSON includes both instruction text and generation metadata for `show`.",
        },
      ],
      notes: [
        {
          name: "read-only",
          desc: "`list` and `show` are public read-only commands. Instruction generation and reapply commands remain development-only.",
        },
        {
          name: "agent context",
          desc: "MCP `get_guideline` and `akan guideline show` read from the same bundled guideline files.",
        },
      ],
      examples: `akan guideline list
akan guideline show framework
akan guideline show moduleOverview --format json
akan guideline show modelSignal`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="guideline-cli" title={l.trans({ en: "Guideline CLI", ko: "Guideline CLI" })}>
        <Docs.Title>{l.trans({ en: "Guideline CLI", ko: "Guideline CLI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Guideline commands expose Akan's bundled agent instructions without invoking an LLM or changing files.",
              ko: "Guideline command는 LLM 호출이나 파일 변경 없이 Akan에 포함된 agent instruction을 노출합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Use them when you want an external agent to load the most specific instruction for a module file, scalar file, UI pattern, or global framework rule.",
              ko: "외부 agent가 module file, scalar file, UI pattern, global framework rule에 맞는 구체적인 instruction을 불러와야 할 때 사용합니다.",
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
