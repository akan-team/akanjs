import { usePage } from "@apps/akan/client";
import { Scroll } from "@libs/util/ui";
import type { ReactNode } from "react";
import { Code } from "./Code";
import { Docs } from "./Docs";

export interface PropRow {
  name: string;
  type: string;
  default?: string;
  desc: ReactNode;
}

export interface UiComponentReference {
  name: string;
  desc: ReactNode;
  props?: PropRow[];
  notes?: ReactNode[];
  code: string;
  codeTitle?: string;
}

interface PropsTableProps {
  rows?: PropRow[];
}

const PropsTable = ({ rows }: PropsTableProps) => {
  const { l } = usePage();

  if (!rows?.length) return null;
  return (
    <>
      <Docs.SubTitle>{l.trans({ en: "Props / API", ko: "속성과 API" })}</Docs.SubTitle>
      <Docs.OptionTable
        items={rows.map((row) => ({ key: row.name, type: row.type, default: row.default, desc: row.desc }))}
      />
    </>
  );
};

export const UiComponentSlide = ({ component }: { component: UiComponentReference }) => {
  const { l } = usePage();

  return (
    <Scroll.Slide id={component.name} title={component.name}>
      <Docs.Title>{component.name}</Docs.Title>
      <Docs.Description>
        <div>
          <Docs.CodeText>{component.desc}</Docs.CodeText>
        </div>
      </Docs.Description>
      <PropsTable rows={component.props} />
      {component.notes?.length ? (
        <Docs.Description>
          <ul className="my-2 list-disc space-y-1.5 pl-5 text-foreground/80 marker:text-primary">
            {component.notes.map((note, idx) => (
              <li key={idx}>
                <Docs.CodeText>{note}</Docs.CodeText>
              </li>
            ))}
          </ul>
        </Docs.Description>
      ) : null}
      <Code.Snippet
        className="w-full"
        title={component.codeTitle ?? l.trans({ en: "Usage", ko: "사용 예시" })}
        code={component.code}
      />
    </Scroll.Slide>
  );
};
