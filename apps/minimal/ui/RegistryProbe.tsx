"use client";
import { usePage } from "@apps/minimal/client";
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

//? Per document, in `window.name`, which outlives a reload of the tab: a suite that opts in with the prefix counts the
//? reloads a save caused and reads the value each new document's server render carried.
const bootLogPrefix = "akan-e2e-boots:";
const recordBoot = () => {
  const host = window as unknown as { __akanRegistryBooted?: boolean };
  if (host.__akanRegistryBooted) return;
  host.__akanRegistryBooted = true;
  if (!window.name.startsWith(bootLogPrefix)) return;
  const log = JSON.parse(window.name.slice(bootLogPrefix.length)) as { boots: number; values: (string | null)[] };
  log.boots += 1;
  log.values.push(document.querySelector('[data-e2e="label-server"]')?.getAttribute("data-e2e-value") ?? null);
  window.name = `${bootLogPrefix}${JSON.stringify(log)}`;
};

interface RegistryProbeProps {
  className?: string;
}
export const RegistryProbe = ({ className }: RegistryProbeProps) => {
  const { l } = usePage();
  const [count, setCount] = useState(0);
  const contextId = useContext(RegistryContext);
  useEffect(() => {
    const record = recordOf();
    record.effects += 1;
    record.contextId = contextId;
  }, [contextId]);
  useEffect(() => recordBoot(), []);
  return (
    <section className={className} data-e2e="registry-probe">
      <output data-e2e="count">{count}</output>
      <button type="button" data-e2e="bump" onClick={() => setCount((value) => value + 1)}>
        {l.trans({ en: "Bump", ko: "올리기" })}
      </button>
      <RegistryLabel where="client" />
      <output data-e2e="shared-client">{registrySharedText}</output>
    </section>
  );
};
