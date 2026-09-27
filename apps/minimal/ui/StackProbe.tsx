"use client";
import { useEffect, useRef, useState } from "react";

interface StackProbeRecord {
  renders: number;
  ticks: number;
  mountId: string;
  mounted: boolean;
}

//? The devOnly `/e2e/stack/*` fixture that `pkgs/@akanjs/devkit/csrE2e` reads to tell a paused page from a live one.
const probeRecordOf = (name: string): StackProbeRecord => {
  const host = window as unknown as { __akanE2eProbes?: Record<string, StackProbeRecord> };
  host.__akanE2eProbes ??= {};
  host.__akanE2eProbes[name] ??= { renders: 0, ticks: 0, mountId: "", mounted: false };
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
  return (
    <section className={className} data-e2e-probe={name}>
      <output data-e2e="item-id">{itemId}</output>
      <input aria-label={name} data-e2e="input" className="rounded-xl border border-border bg-background p-2" />
    </section>
  );
};
