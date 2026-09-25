import { usePage } from "@apps/akan/client";
import { type CommandReferenceItem, CommandReferenceSlide, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const commands: CommandReferenceItem[] = [
    {
      name: "create-crud-page",
      signature: "akan create-crud-page <app> <module> [--basePath <basePath>] [--single <boolean>]",
      desc: "Create CRUD page routes for an existing module inside a selected application.\nThe generator creates list, detail, create, and edit surfaces, with `--basePath` for section routing and `--single` for a single-page CRUD flow.",
      options: [
        {
          name: "--basePath",
          type: "String",
          defaultValue: "-",
          enumOrFlag: "nullable",
          desc: "Optional base path for generated routes.",
        },
        {
          name: "--single",
          type: "Boolean",
          defaultValue: "false",
          enumOrFlag: "-",
          desc: "Generate a single-page CRUD surface.",
        },
      ],
      examples: `akan create-crud-page shop Product
akan create-crud-page shop Product --basePath admin
akan create-crud-page shop Product --single true`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="page-cli" title={l.trans({ en: "Page CLI", ko: "Page CLI" })}>
        <Docs.Title>{l.trans({ en: "Page CLI", ko: "Page CLI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Page commands generate app pages for existing modules. The current public page command creates CRUD pages: list, detail, create, and edit surfaces for a selected module.",
              ko: "Page command는 기존 module을 위한 app page를 생성합니다. 현재 공개 page command는 선택한 module의 CRUD page, 즉 list, detail, create, edit surface를 만듭니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "This command connects an app and a module, so use it after the domain module already exists.",
              ko: "이 명령은 app과 module을 연결하므로 domain module이 이미 존재한 뒤에 사용합니다.",
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
