import { usePage } from "@apps/akan/client";
import { Scroll } from "@libs/util/ui";

import { Code } from "./Code";
import { Docs } from "./Docs";

export interface ReferenceRow {
  name: string;
  type?: string;
  required?: string;
  defaultValue?: string;
  enumOrFlag?: string;
  desc: string;
}

export interface CommandReferenceItem {
  name: string;
  signature: string;
  desc: string;
  args?: ReferenceRow[];
  options?: ReferenceRow[];
  notes?: ReferenceRow[];
  examples: string;
}

interface ReferenceTableProps {
  title: string;
  headers: string[];
  rows?: ReferenceRow[];
  getCells: (row: ReferenceRow) => string[];
}

const ReferenceTable = ({ title, headers, rows, getCells }: ReferenceTableProps) => {
  if (!rows?.length) return null;

  return (
    <section className="space-y-3">
      <Docs.SubTitle>{title}</Docs.SubTitle>
      <div className="hidden overflow-x-auto rounded-2xl border border-base-300 bg-base-100 lg:block">
        <table className="table w-full table-fixed">
          <colgroup>
            {headers.map((header, index) => (
              <col
                key={header}
                style={{
                  width: index === headers.length - 1 ? "42%" : `${Math.floor(58 / (headers.length - 1))}%`,
                }}
              />
            ))}
          </colgroup>
          <thead>
            <tr className="border-base-300 border-b bg-base-200">
              {headers.map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 font-semibold text-base-content/80 text-xs uppercase tracking-wide"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${title}-${row.name}`} className="border-base-300/80 border-b last:border-b-0">
                {getCells(row).map((cell, index) => (
                  <td
                    key={`${row.name}-${index}`}
                    className={
                      index === 0
                        ? "px-4 py-4 font-mono text-base-content text-sm"
                        : "px-4 py-4 text-base-content/80 text-sm leading-6"
                    }
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 lg:hidden">
        {rows.map((row) => {
          const cells = getCells(row);
          return (
            <div key={`${title}-mobile-${row.name}`} className="rounded-2xl border border-base-300 bg-base-100 p-4">
              <div className="font-mono font-semibold text-base-content text-sm">{cells[0]}</div>
              <div className="mt-3 grid gap-2 text-sm">
                {headers.slice(1).map((header, index) => (
                  <div key={`${row.name}-${header}`} className="grid grid-cols-[96px_1fr] gap-3">
                    <div className="font-semibold text-base-content/60">{header}</div>
                    <div className="text-base-content/80 leading-6">{cells[index + 1]}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

interface CommandReferenceSlideProps {
  command: CommandReferenceItem;
}

export const CommandReferenceSlide = ({ command }: CommandReferenceSlideProps) => {
  const { l } = usePage();

  return (
    <Scroll.Slide id={command.name} title={command.name}>
      <Docs.Title>{command.name}</Docs.Title>
      <Docs.Description>
        <div className="whitespace-pre-line">{command.desc}</div>
      </Docs.Description>
      <Code.Snippet className="mx-0" title="Signature" language="bash" code={command.signature} />
      <ReferenceTable
        title={l.trans({ en: "Arguments", ko: "Arguments" })}
        headers={["Argument", "Type", "Required", "Default", "Description"]}
        rows={command.args}
        getCells={(row) => [row.name, row.type ?? "-", row.required ?? "-", row.defaultValue ?? "-", row.desc]}
      />
      <ReferenceTable
        title={l.trans({ en: "Options", ko: "Options" })}
        headers={["Option", "Type", "Default", "Enum / Flag", "Description"]}
        rows={command.options}
        getCells={(row) => [row.name, row.type ?? "-", row.defaultValue ?? "-", row.enumOrFlag ?? "-", row.desc]}
      />
      <ReferenceTable
        title={l.trans({ en: "Notes", ko: "Notes" })}
        headers={["Name", "Description"]}
        rows={command.notes}
        getCells={(row) => [row.name, row.desc]}
      />
      <Code.Snippet className="mx-0" title="Examples" language="bash" code={command.examples} />
    </Scroll.Slide>
  );
};
