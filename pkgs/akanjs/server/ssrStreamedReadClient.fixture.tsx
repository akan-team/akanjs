"use client";
import Stream from "../ui/Load/Stream";

export const StreamedLabel = ({ of }: { of: Promise<string> }) => (
  <Stream of={of} fallback={<i>label loading</i>}>
    {(label) => <b>{label}</b>}
  </Stream>
);
