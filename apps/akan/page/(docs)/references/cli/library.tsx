import { usePage } from "@apps/akan/client";
import { type CommandReferenceItem, CommandReferenceSlide, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const commands: CommandReferenceItem[] = [
    {
      name: "create-library",
      signature: "akan create-library <libName>",
      desc: "Create a new shared library in the workspace for reusable code across applications.\nThe library name is normalized to lowercase kebab-case so generated folder names and imports follow workspace conventions.",
      args: [
        {
          name: "libName",
          type: "String",
          required: "yes",
          defaultValue: "-",
          desc: "Library name. Normalized to lowercase kebab-case.",
        },
      ],
      examples: `akan create-library shared
akan create-library design-system`,
    },
    {
      name: "remove-library",
      signature: "akan remove-library <lib>",
      desc: "Remove an existing shared library from the workspace.\nUse it when a library should no longer be part of workspace sync, dependency wiring, or app import surfaces.",
      examples: "akan remove-library util",
    },
    {
      name: "sync-library",
      signature: "akan sync-library <lib>",
      desc: "Synchronize dependencies and configuration for a selected shared library.\nRun it after library package changes, generated surface updates, or configuration edits that should be reflected consistently.",
      examples: "akan sync-library util",
    },
    {
      name: "install-library",
      signature: "akan install-library [libName]",
      desc: "Install a pre-built library template such as shared or util into the workspace.\nThe library name is optional, allowing the install flow to prompt or choose defaults when the target template is not supplied.",
      args: [
        {
          name: "libName",
          type: "String",
          required: "no",
          defaultValue: "-",
          desc: "Library template name. Nullable.",
        },
      ],
      examples: `akan install-library
akan install-library util
akan install-library shared`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="library-cli" title={l.trans({ en: "Library CLI", ko: "Library CLI" })}>
        <Docs.Title>{l.trans({ en: "Library CLI", ko: "Library CLI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Library commands manage shared libraries under the workspace. Use them when creating reusable domain, utility, UI, or platform code that multiple apps can import.",
              ko: "Library command는 workspace의 shared library를 관리합니다. 여러 app이 import할 reusable domain, utility, UI, platform code를 만들 때 사용합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The public library commands are `create-library`, `remove-library`, `sync-library`, and `install-library`.",
              ko: "공개 library command는 `create-library`, `remove-library`, `sync-library`, `install-library`입니다.",
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
