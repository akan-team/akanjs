import { cn } from "akanjs/client";
import { Fragment } from "react";

import { flowToneClass } from "./diagram.util";
import { type FlowEdge, FlowLayout, type FlowNodeInput } from "./flow.util";

interface FlowStackProps<K extends string> {
  className?: string;
  nodes: Record<K, FlowNodeInput>;
  edges: FlowEdge<K>[];
  emphasis?: K[];
}

// 폭을 재지 않아야 서버에서 그대로 렌더되고 가로 스크롤이 생기지 않는다 — 배율 계산을 붙이지 말 것.
export const FlowStack = <K extends string>({ className, nodes, edges, emphasis = [] }: FlowStackProps<K>) => {
  const idList = Object.keys(nodes) as K[];
  const linked = edges.filter(([from, to]) => from !== to && from in nodes && to in nodes);
  const parents = new Map<K, K[]>();
  for (const [from, to] of linked) {
    parents.set(to, [...(parents.get(to) ?? []), from]);
  }

  const levels = FlowLayout.levelsOf(idList, parents);
  const levelList = [...new Set(levels.values())].sort((a, b) => a - b);

  const bands: K[][] = [];
  for (const [index, level] of levelList.entries()) {
    const members = idList.filter((id) => levels.get(id) === level);
    const rank = new Map((bands[index - 1] ?? []).map((member, position) => [member, position]));
    const keyOf = (id: K) => {
      const ranks = (parents.get(id) ?? [])
        .map((parent) => rank.get(parent))
        .filter((position): position is number => position !== undefined);
      return ranks.length ? Math.min(...ranks) : Number.POSITIVE_INFINITY;
    };
    bands.push(
      [...members].sort((a, b) => {
        const [keyA, keyB] = [keyOf(a), keyOf(b)];
        return keyA === keyB ? members.indexOf(a) - members.indexOf(b) : keyA - keyB;
      }),
    );
  }

  const connectors = levelList.map((level, index) => {
    if (index === 0) return [];
    return [
      ...new Set(
        linked
          .filter(([from, to]) => levels.get(to) === level && (levels.get(from) ?? 0) < level)
          .map(([, , option]) => option?.label)
          .filter((label): label is string => !!label),
      ),
    ];
  });

  const marked = new Set<string>(emphasis);

  return (
    <div className={cn("flex flex-col", className)}>
      {bands.map((members, index) => (
        <Fragment key={levelList[index]}>
          {index > 0 ? (
            <div className="flex flex-col items-center gap-1 py-2.5">
              <svg aria-hidden="true" height="20" viewBox="0 0 10 20" width="10">
                <path className="stroke-border" d="M5 0 V13" fill="none" strokeWidth="1.5" />
                <path className="fill-border" d="M5 19 L1 12 L9 12 Z" />
              </svg>
              {connectors[index]?.length ? (
                <span className="text-foreground/60 text-xs">{connectors[index]?.join(" · ")}</span>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap items-start justify-center gap-2">
            {members.map((id) => (
              <div
                className={cn(
                  "flex min-w-26 max-w-60 flex-col items-center gap-0.5 rounded-xl border px-3 py-2 text-center font-semibold text-xs leading-[17px]",
                  flowToneClass[nodes[id].tone ?? "default"],
                  marked.has(id) && "ring-2 ring-primary",
                )}
                key={id}
              >
                <span>{nodes[id].label}</span>
                {(nodes[id].lines ?? []).map((line) => (
                  <span className="text-foreground/60" key={line}>
                    {line}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
};
