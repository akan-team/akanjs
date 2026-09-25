import { usePage } from "@apps/akan/client";
import type { ReactNode } from "react";

import { Code } from "../Code";

export interface IntroItem {
  name: ReactNode;
  desc: ReactNode;
  example?: ReactNode;
}

export const IntroTable = ({ items, type }: { items: IntroItem[]; type: string }) => {
  const { l } = usePage();
  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="table w-full">
          <thead>
            <tr className="bg-base-200">
              <th className="text-base-content">{type}</th>
              <th className="text-base-content">{l.trans({ en: "Description", ko: "설명" })}</th>
              {items.some((item) => !!item.example) ? (
                <th className="text-base-content">{l.trans({ en: "Example", ko: "예제" })}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index}>
                <td className="font-mono">{item.name}</td>
                <td style={{ whiteSpace: "pre-line" }}>{item.desc}</td>
                {item.example ? (
                  <td>
                    <Code.Raw language="typescript" showLineNumbers={false} code={item.example as string} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-4 lg:hidden">
        {items.map((item, index) => (
          <div key={index} className="rounded-lg bg-base-100 p-3">
            <div className="mb-2">
              <span className="block font-bold font-mono text-primary">{item.name}</span>
            </div>
            <p className="mb-3 text-base-content text-sm leading-relaxed" style={{ whiteSpace: "pre-line" }}>
              {item.desc}
            </p>
            {item.example ? <Code.Raw language="typescript" code={item.example as string} /> : null}
          </div>
        ))}
      </div>
    </>
  );
};
