"use client";
import { st } from "@apps/minimal/client";
import { usePageActivity, usePageFocusEffect } from "akanjs/webkit";
import { useEffect, useRef, useState } from "react";

interface StackProbeRecord {
  renders: number;
  ticks: number;
  mountId: string;
  mounted: boolean;
  activity: string;
  focused: boolean;
  focusCount: number;
}

const emptyRecord = (): StackProbeRecord => ({
  renders: 0,
  ticks: 0,
  mountId: "",
  mounted: false,
  activity: "",
  focused: false,
  focusCount: 0,
});

//? The devOnly `/e2e/stack/*` fixture that `pkgs/@akanjs/devkit/csrE2e` reads to tell a paused page from a live one.
const probeRecordOf = (name: string): StackProbeRecord => {
  if (typeof window === "undefined") return emptyRecord();
  const host = window as unknown as { __akanE2eProbes?: Record<string, StackProbeRecord> };
  host.__akanE2eProbes ??= {};
  host.__akanE2eProbes[name] ??= emptyRecord();
  return host.__akanE2eProbes[name];
};

interface StackProbeProps {
  className?: string;
  name: string;
  itemId?: string;
}
export const StackProbe = ({ className, name, itemId = "" }: StackProbeProps) => {
  const [mountId] = useState(() => Math.random().toString(36).slice(2, 10));
  const renders = useRef(0);
  renders.current += 1;
  const record = probeRecordOf(name);
  record.mountId = mountId;
  record.renders = renders.current;
  record.activity = usePageActivity();
  useEffect(() => {
    record.mounted = true;
    const timer = setInterval(() => {
      record.ticks += 1;
    }, 50);
    return () => {
      clearInterval(timer);
      record.mounted = false;
    };
  }, [record]);
  usePageFocusEffect(() => {
    record.focused = true;
    record.focusCount += 1;
    return () => {
      record.focused = false;
    };
  }, [record]);
  const toolName = `bump${name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")}`;
  const bump = st
    .tool(toolName)
    .desc(`Bump the ${name} probe.`)
    .exec(() => {
      record.ticks += 1;
    });
  return (
    <section className={className} data-e2e-probe={name}>
      <output data-e2e="item-id">{itemId}</output>
      <input aria-label={name} data-e2e="input" className="rounded-xl border border-border bg-background p-2" />
      <button type="button" data-e2e="bump" onClick={bump}>
        {toolName}
      </button>
    </section>
  );
};
