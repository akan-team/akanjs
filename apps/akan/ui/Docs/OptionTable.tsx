import { usePage } from "@apps/akan/client";
import type { ReactNode } from "react";

import { Code } from "../Code";

export interface OptionItem {
  key: string;
  desc: ReactNode;
  example: string;
  type: string;
  default?: string;
}
export const OptionTable = ({ items }: { items: OptionItem[] }) => {
  const { l } = usePage();

  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="table w-full table-fixed">
          <colgroup>
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "30%" }} />
            <col style={{ width: "40%" }} />
          </colgroup>
          <thead>
            <tr className="bg-base-300">
              <th className="text-base-content text-xs lg:text-sm">{l.trans({ en: "Option", ko: "옵션" })}</th>
              <th className="text-base-content text-xs lg:text-sm">{l.trans({ en: "Type", ko: "타입" })}</th>
              <th className="text-base-content text-xs lg:text-sm">{l.trans({ en: "Default", ko: "기본값" })}</th>
              <th className="text-base-content text-xs lg:text-sm">{l.trans({ en: "Description", ko: "설명" })}</th>
              <th className="text-base-content text-xs lg:text-sm">{l.trans({ en: "Example", ko: "예제" })}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index}>
                <td className="font-mono text-xs lg:text-sm">{item.key}</td>
                <td className="font-mono text-xs lg:text-sm">{item.type}</td>
                <td className="text-xs lg:text-sm">{item.default ?? "-"}</td>
                <td className="text-xs lg:text-sm">{item.desc}</td>
                <td>
                  <Code.Raw language="typescript" code={item.example} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-4 lg:hidden">
        {items.map((item, index) => (
          <div key={index} className="rounded-lg bg-base-100 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-bold font-mono text-primary">{item.key}</span>
              <span className="text-base-content text-xs opacity-50">:</span>
              <span className="font-mono text-secondary text-sm">{item.type}</span>
              <span className="text-base-content text-xs opacity-50">:</span>
              <span className="font-mono text-secondary text-sm">{item.default ?? "-"}</span>
            </div>
            <p className="mb-3 text-base-content text-sm leading-relaxed">{item.desc}</p>
            <Code.Raw language="typescript" code={item.example} />
          </div>
        ))}
      </div>
    </>
  );
};
