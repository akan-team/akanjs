import { usePage } from "@apps/akan/client";
import { type CommandReferenceItem, CommandReferenceSlide, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const commands: CommandReferenceItem[] = [
    {
      name: "create-scalar",
      signature: "akan create-scalar <scalarName> [--ai <boolean>]",
      desc: "Create a new scalar type for reusable value objects or simple data shapes that do not need DB persistence.\nThe generator normalizes the scalar name and creates the scalar files used by constants, documents, dictionaries, and typed business code.",
      args: [
        {
          name: "scalarName",
          type: "String",
          required: "yes",
          defaultValue: "-",
          desc: "Scalar name. Spaces are removed and the first letter is lowercased.",
        },
      ],
      options: [
        {
          name: "--ai",
          type: "Boolean",
          defaultValue: "false",
          enumOrFlag: "-",
          desc: "Use AI to create scalar before normal scalar creation.",
        },
      ],
      notes: [{ name: "execution", desc: "When --ai is true, createScalarWithAi runs before createScalar." }],
      examples: `akan create-scalar Coordinate
akan create-scalar Address --ai true`,
    },
    {
      name: "remove-scalar",
      signature: "akan remove-scalar <scalarName>",
      desc: "Remove an existing scalar type from an app or library.\nUse it after checking usages, because scalar definitions are often imported by modules, dictionaries, templates, and service payload types.",
      args: [
        { name: "scalarName", type: "String", required: "yes", defaultValue: "-", desc: "Scalar name to remove." },
      ],
      examples: "akan remove-scalar Coordinate",
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="scalar-cli" title={l.trans({ en: "Scalar CLI", ko: "Scalar CLI" })}>
        <Docs.Title>{l.trans({ en: "Scalar CLI", ko: "Scalar CLI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Scalar commands create and remove scalar types inside an app or library. A scalar is a reusable data type or value object, not a database-backed document model.",
              ko: "Scalar command는 app 또는 library 안에 scalar type을 생성하거나 제거합니다. scalar는 database-backed document model이 아니라 reusable data type 또는 value object입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The scalar name is normalized after spaces are removed, matching Akan scalar file conventions.",
              ko: "Scalar name은 space 제거 후 Akan scalar file convention에 맞게 정규화됩니다.",
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
