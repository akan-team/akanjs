import { cn } from "akanjs/client";

import { flowToneClass } from "./diagram.util";
import type { SequenceActorInput, SequenceMessageInput } from "./sequence.util";

interface SequenceStackProps<K extends string> {
  className?: string;
  actors: Record<K, SequenceActorInput>;
  messages: SequenceMessageInput<K>[];
  emphasis?: K[];
}

// 좁은 화면용 세로 배치. 시간 순서는 그대로 두고 열(actor)만 위쪽 칩으로 접는다.
export const SequenceStack = <K extends string>({
  className,
  actors,
  messages,
  emphasis = [],
}: SequenceStackProps<K>) => {
  const marked = new Set<string>(emphasis);
  const idList = Object.keys(actors) as K[];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap justify-center gap-1.5">
        {idList.map((id) => (
          <div
            className={cn(
              "flex flex-col items-center rounded-xl border px-2.5 py-1 text-center font-semibold text-xs leading-[17px]",
              flowToneClass[actors[id].tone ?? "default"],
              marked.has(id) && "ring-2 ring-primary",
            )}
            key={id}
          >
            <span>{actors[id].label}</span>
            {(actors[id].lines ?? []).map((line) => (
              <span className="text-foreground/60" key={line}>
                {line}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {messages.map((message, index) => (
          <div className="flex flex-col gap-1" key={`${message.from}>${message.to}#${index}`}>
            <div
              className={cn(
                "flex flex-col gap-0.5 rounded-xl border px-3 py-2",
                message.dashed ? "border-border border-dashed bg-transparent" : flowToneClass.default,
              )}
            >
              <span className="font-mono text-foreground/60 text-xs">
                {actors[message.from].label} {message.from === message.to ? "↻" : "→"} {actors[message.to].label}
              </span>
              {message.label ? <span className="text-foreground text-xs">{message.label}</span> : null}
              {(message.lines ?? []).map((line) => (
                <span className="text-foreground/70 text-xs" key={line}>
                  {line}
                </span>
              ))}
            </div>
            {message.note ? (
              <div className="rounded-xl border border-foreground/15 border-dashed bg-foreground/4 px-3 py-2 text-foreground/70 text-xs">
                {message.note}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};
