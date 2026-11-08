"use client";
import { cn, usePage } from "akanjs/client";
import { lowerlize, modelNames } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { type DraftState, st } from "akanjs/store";
import { useMemo } from "react";
import { AiOutlineDelete, AiOutlineHistory, AiOutlineRollback } from "react-icons/ai";

import { agentAttrs } from "../agentAttrs";
import { Button } from "../Button";
import { RecentTime } from "../RecentTime";
import { createOverridable } from "../UiOverride";

export interface DraftBarViewProps {
  className?: string;
  refName: string;
  /** `conflict`: the record moved, the form shows the server's value and the bar offers the draft. `applied`: the
   *  draft is on screen and the bar is the way back. */
  state: "conflict" | "applied";
  savedAt: Date;
  /** Puts the offered draft into the form. Passed in the `conflict` state only. */
  onRestore?: () => void;
  /** Drops the draft and keeps the form as it was opened. */
  onDiscard: () => void;
}

const DefaultDraftBar = ({ className, state, savedAt, onRestore, onDiscard }: DraftBarViewProps) => {
  const { l } = usePage();
  if (state === "conflict")
    return (
      <div
        className={cn(
          "mb-4 flex flex-wrap items-center gap-2 rounded-box border border-warning/40 bg-warning/10 p-3",
          className,
        )}
      >
        <AiOutlineHistory className="text-warning" />
        <span className="flex-1 text-foreground/80 text-sm">
          {l("base.draftConflict")} <RecentTime date={savedAt} />
        </span>
        <Button {...agentAttrs(onRestore)} size="sm" onClick={() => onRestore?.()}>
          <AiOutlineRollback /> {l("base.draftRestore")}
        </Button>
        <Button {...agentAttrs(onDiscard)} size="sm" variant="ghost" onClick={() => onDiscard()}>
          <AiOutlineDelete /> {l("base.draftDiscard")}
        </Button>
      </div>
    );
  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-2 text-foreground/60 text-xs", className)}>
      <AiOutlineHistory />
      <span className="flex-1">
        {l("base.draftApplied")} <RecentTime date={savedAt} />
      </span>
      <Button {...agentAttrs(onDiscard)} size="xs" variant="ghost" onClick={() => onDiscard()}>
        {l("base.draftStartOver")}
      </Button>
    </div>
  );
};

// The shell below keeps the draft state and the agent tools, so a `DraftBar` override only re-skins the notice.
const DraftBarView = createOverridable("DraftBar", DefaultDraftBar);

interface DraftBarProps {
  className?: string;
  slice: SliceMeta;
}

export default function DraftBar({ className, slice }: DraftBarProps) {
  const { refName } = slice;
  const modelName = useMemo(() => lowerlize(refName), []);
  const names = useMemo(() => modelNames(modelName), []);
  const storeUse = st.use as { [key: string]: (option?: { agent?: boolean }) => unknown };
  const storeDo = st.do as unknown as { [key: string]: () => void };
  // `agent: false`: the value is the whole form, which would ride every later turn; the tools below are the surface.
  const draft = storeUse[names.modelDraft]({ agent: false }) as DraftState | null;

  const restoreDraft = st
    .tool(draft?.pending ? names.restoreModelFormDraft : null)
    .desc(`Put the unsaved ${modelName} the user left behind back into the open form.`)
    .exec(() => storeDo[names.restoreModelFormDraft]());
  const discardDraft = st
    .tool(draft?.pending || draft?.appliedAt ? names.discardModelFormDraft : null)
    .desc(`Throw away the recovered ${modelName} draft and keep the form as it was opened.`)
    .exec(() => storeDo[names.discardModelFormDraft]());

  if (draft?.pending)
    return (
      <DraftBarView
        className={className}
        refName={refName}
        state="conflict"
        savedAt={draft.pending.savedAt}
        onRestore={restoreDraft}
        onDiscard={discardDraft}
      />
    );
  if (draft?.appliedAt)
    return (
      <DraftBarView
        className={className}
        refName={refName}
        state="applied"
        savedAt={draft.appliedAt}
        onDiscard={discardDraft}
      />
    );
  return null;
}
