import { usePage } from "@apps/akan/client";
import { Scroll } from "@libs/util/ui";

import { Code } from "./Code";
import { Docs } from "./Docs";

export interface PropRow {
  name: string;
  type: string;
  desc: string;
}

export interface UiComponentReference {
  name: string;
  desc: string;
  props?: PropRow[];
  notes?: string[];
  code: string;
}

interface PropsTableProps {
  rows?: PropRow[];
}

const PropsTable = ({ rows }: PropsTableProps) => {
  const { l } = usePage();

  if (!rows?.length) return null;
  return (
    <div className="overflow-x-auto">
      <Docs.SubTitle>{l.trans({ en: "Props / API", ko: "Props / API" })}</Docs.SubTitle>
      <table className="table w-full table-fixed">
        <thead>
          <tr>
            <th>{l.trans({ en: "Name", ko: "이름" })}</th>
            <th>{l.trans({ en: "Type", ko: "타입" })}</th>
            <th>{l.trans({ en: "Description", ko: "설명" })}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="font-mono">{row.name}</td>
              <td className="font-mono">{row.type}</td>
              <td>{row.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const UiComponentSlide = ({ component }: { component: UiComponentReference }) => {
  const { l } = usePage();

  return (
    <Scroll.Slide id={component.name} title={component.name}>
      <Docs.Title>{component.name}</Docs.Title>
      <Docs.Description>
        <div>{component.desc}</div>
      </Docs.Description>
      <PropsTable rows={component.props} />
      {component.notes?.length ? (
        <Docs.Description>
          <div className="space-y-1">
            {component.notes.map((note) => (
              <div key={note} className="rounded-xl border border-base-300 bg-base-100 px-4 text-base-content/70">
                {note}
              </div>
            ))}
          </div>
        </Docs.Description>
      ) : null}
      <Code.Snippet title={l.trans({ en: "Usage", ko: "사용 예시" })} code={component.code} />
    </Scroll.Slide>
  );
};
