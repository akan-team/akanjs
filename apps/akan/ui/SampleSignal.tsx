"use client";
import { fetch } from "@apps/akan/client";
import { Signal } from "akanjs/ui";

interface SampleSignalProps {
  className?: string;
}

export const SampleSignal = ({ className }: SampleSignalProps) => {
  return <Signal.Doc.Zone refName="bizDoc" fetch={fetch} />;
};
