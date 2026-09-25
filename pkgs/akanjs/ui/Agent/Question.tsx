"use client";
import { cn, usePage } from "akanjs/client";
import { useState } from "react";
import type { PendingQuestion } from "use-agentic";
import { Button } from "../Button";
import { createOverridable } from "../UiOverride";

export interface QuestionProps {
  className?: string;
  question: PendingQuestion;
}

/**
 * The agent's question, parked above the composer while the loop waits on it. Only the picks live here — the
 * composer below is the free-text answer, so the panel never grows a second input meaning the same thing. There is
 * always that way out of the options: the model wrote them, and only the user knows whether the answer is among
 * them. Mounted keyed by call id, so a second ask starts with nothing picked.
 */
export const DefaultQuestion = ({ className, question }: QuestionProps) => {
  const { l } = usePage();
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (choice: string) =>
    setPicked((current) => (current.includes(choice) ? current.filter((one) => one !== choice) : [...current, choice]));
  return (
    <div
      aria-label={l("base.agentQuestion")}
      className={cn("flex flex-col gap-2 border-primary/30 border-t bg-primary/5 px-4 py-3", className)}
      role="group"
    >
      <p className="text-sm">{question.question}</p>
      {question.choices.length ? (
        <div className="flex flex-wrap gap-1.5">
          {question.choices.map((choice) => (
            <Button
              key={choice}
              onClick={() => (question.multiple ? toggle(choice) : question.answer(choice))}
              size="xs"
              variant={question.multiple && picked.includes(choice) ? "primary" : "outline"}
            >
              {choice}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <button
          className="text-foreground/50 text-xs hover:text-foreground"
          onClick={() => question.dismiss()}
          type="button"
        >
          {l("base.skip")}
        </button>
        {question.multiple ? (
          <Button disabled={!picked.length} onClick={() => question.answer(picked)} size="xs">
            {l("base.ok")}
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export default createOverridable("AgentQuestion", DefaultQuestion);
