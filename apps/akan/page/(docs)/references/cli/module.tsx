import { usePage } from "@apps/akan/client";
import { type CommandReferenceItem, CommandReferenceSlide, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const commands: CommandReferenceItem[] = [
    {
      name: "create-module",
      signature: "akan create-module <moduleName> [--page <boolean>]",
      desc: "Create a new domain module template inside an app or library.\nThe generator creates the standard Akan module files and can additionally create route-level page files when `--page` is enabled.",
      args: [
        {
          name: "moduleName",
          type: "String",
          required: "yes",
          defaultValue: "-",
          desc: "Module name. Spaces are removed and the first letter is lowercased.",
        },
      ],
      options: [
        {
          name: "--page",
          type: "Boolean",
          defaultValue: "false",
          enumOrFlag: "-",
          desc: "Create page files with the module.",
        },
      ],
      examples: `akan create-module Story
akan create-module UserProfile --page true`,
    },
    {
      name: "remove-module",
      signature: "akan remove-module <module>",
      desc: "Remove an existing module from an app or library.\nUse this when the module's domain definitions, generated connections, and UI companion files should be removed from the target system.",
      examples: "akan remove-module Story",
    },
    {
      name: "create-view",
      signature: "akan create-view <module>",
      desc: "Create a full View component for an existing module.\nUse it when the module needs a detail-oriented or rich page-level UI surface beyond generated data definitions.",
      examples: "akan create-view Story",
    },
    {
      name: "create-unit",
      signature: "akan create-unit <module>",
      desc: "Create a Unit component for rendering repeated module items.\nUse it for list rows, cards, or compact displays that consume light module data in application UI.",
      examples: "akan create-unit Story",
    },
    {
      name: "create-template",
      signature: "akan create-template <module>",
      desc: "Create a Template component for module forms and editing UI.\nUse it when the module needs reusable form structure connected to standard store/form workflows.",
      examples: "akan create-template Story",
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="module-cli" title={l.trans({ en: "Module CLI", ko: "Module CLI" })}>
        <Docs.Title>{l.trans({ en: "Module CLI", ko: "Module CLI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Module commands create and maintain domain modules inside an app or library. Use them when adding a new model-backed feature or adding common UI companion files to an existing module.",
              ko: "Module command는 app 또는 library 안의 domain module을 생성하고 관리합니다. 새로운 model-backed feature를 추가하거나 기존 module에 UI companion file을 추가할 때 사용합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Module names are normalized with lower-case first-letter style after spaces are removed, matching Akan module file conventions.",
              ko: "Module name은 space 제거 후 lower-case first-letter style로 정규화되어 Akan module file convention과 맞춰집니다.",
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
