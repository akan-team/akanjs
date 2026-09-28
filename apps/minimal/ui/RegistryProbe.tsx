"use client";
import { registrySharedText } from "@apps/minimal/common";
import { useContext, useEffect, useState } from "react";
import { RegistryLabel } from "./RegistryLabel";
import { RegistryContext } from "./registryContext";

interface RegistryProbeRecord {
  effects: number;
  contextId: string;
}

//? The devOnly `/e2e/registry` fixture that `pkgs/@akanjs/devkit/csrE2e` reads to tell a patch from a remount.
const recordOf = (): RegistryProbeRecord => {
  const host = window as unknown as { __akanRegistryProbe?: RegistryProbeRecord };
  host.__akanRegistryProbe ??= { effects: 0, contextId: "" };
  return host.__akanRegistryProbe;
};

interface RegistryProbeProps {
  className?: string;
}
export const RegistryProbe = ({ className }: RegistryProbeProps) => {
  const [count, setCount] = useState(0);
  const contextId = useContext(RegistryContext);
  useEffect(() => {
    const record = recordOf();
    record.effects += 1;
    record.contextId = contextId;
  }, [contextId]);
  return (
    <section className={className} data-e2e="registry-probe">
      <output data-e2e="count">{count}</output>
      <button type="button" data-e2e="bump" onClick={() => setCount((value) => value + 1)}>
        bump
      </button>
      <RegistryLabel where="client" />
      <output data-e2e="shared-client">{registrySharedText}</output>
    </section>
  );
};
