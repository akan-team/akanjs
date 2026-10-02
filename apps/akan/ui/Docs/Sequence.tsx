import { cn } from "akanjs/client";
import { DiagramFrame } from "./DiagramFrame";
import { flowToneClass } from "./diagram.util";
import { SequenceStack } from "./SequenceStack";
import { type SequenceActorInput, SequenceLayout, type SequenceMessageInput } from "./sequence.util";

interface SequenceProps<K extends string> {
  className?: string;
  title?: string;
  actors: Record<K, SequenceActorInput>;
  messages: SequenceMessageInput<K>[];
  emphasis?: K[];
}

export const Sequence = <K extends string>({ className, title, actors, messages, emphasis = [] }: SequenceProps<K>) => {
  const layout = new SequenceLayout(actors, messages);
  const marked = new Set<string>(emphasis);

  return (
    <div
      className={cn(
        "@container studio-lift my-5 overflow-hidden rounded-2xl border border-foreground/8 bg-card/80",
        className,
      )}
    >
      {title ? (
        <div className="flex items-center gap-2 border-foreground/6 border-b bg-foreground/3 px-4 py-2.5 font-bold text-foreground/75 text-sm">
          <span aria-hidden className="jelly tint-primary size-2.5 shrink-0 rounded-full" />
          {title}
        </div>
      ) : null}
      <div className="@max-[520px]:hidden p-5">
        <DiagramFrame height={layout.height} label={title} width={layout.width}>
          <div className="relative" style={{ height: layout.height, width: layout.width }}>
            <svg aria-hidden="true" className="absolute inset-0" height={layout.height} width={layout.width}>
              {layout.actors.map((actor) => (
                <line
                  className="stroke-border"
                  key={actor.id}
                  strokeDasharray="3 4"
                  x1={actor.x + actor.width / 2}
                  x2={actor.x + actor.width / 2}
                  y1={layout.headerHeight}
                  y2={layout.height}
                />
              ))}
              {layout.messages.map((message) => (
                <g key={message.key}>
                  <path
                    className="fill-none stroke-border"
                    d={message.path}
                    strokeDasharray={message.dashed ? "5 4" : undefined}
                    strokeWidth={1.5}
                  />
                  <path className="fill-border" d={message.arrow} />
                </g>
              ))}
            </svg>
            {layout.actors.map((actor) => (
              <div
                className={cn(
                  "absolute flex flex-col items-center justify-center gap-0.5 rounded-xl border px-3 text-center font-semibold text-xs leading-[17px]",
                  flowToneClass[actor.tone],
                  marked.has(actor.id) && "ring-2 ring-primary",
                )}
                key={actor.id}
                style={{ height: layout.headerHeight - 8, left: actor.x, top: 0, width: actor.width }}
              >
                <span>{actor.label}</span>
                {actor.lines.map((line) => (
                  <span className="text-foreground/60" key={line}>
                    {line}
                  </span>
                ))}
              </div>
            ))}
            {layout.messages.map((message) => (
              <div
                className="absolute text-center text-foreground/70 text-xs leading-[17px]"
                key={message.key}
                style={{
                  left: message.labelX - message.labelWidth / 2,
                  top: message.labelY,
                  width: message.labelWidth,
                }}
              >
                {message.labelLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            ))}
            {layout.notes.map((note) => (
              <div
                className="absolute flex items-center rounded-xl border border-foreground/15 border-dashed bg-foreground/4 px-3 text-foreground/70 text-xs"
                key={note.y}
                style={{ height: note.height, left: 0, top: note.y, width: layout.width }}
              >
                {note.text}
              </div>
            ))}
          </div>
        </DiagramFrame>
      </div>
      <div className="@max-[520px]:block hidden p-5">
        <SequenceStack actors={actors} emphasis={emphasis} messages={messages} />
      </div>
    </div>
  );
};
