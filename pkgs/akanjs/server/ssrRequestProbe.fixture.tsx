"use client";

import { use } from "react";
import { untrackedCookies } from "../fetch/requestStorage";

const suspensions = new Map<string, Promise<void>>();

export const RequestProbe = ({ label, suspendMs }: { label: string; suspendMs?: number }) => {
  if (suspendMs) {
    const suspension = suspensions.get(label) ?? Bun.sleep(suspendMs);
    suspensions.set(label, suspension);
    use(suspension);
  }
  return <b>{`${label} who=${untrackedCookies().get("who")?.value ?? "-"}`}</b>;
};
