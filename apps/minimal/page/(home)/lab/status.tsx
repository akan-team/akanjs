import { LabStatus } from "@apps/minimal/ui";
import type { PageConfig } from "akanjs/client";

export default function Page() {
  return <LabStatus />;
}

export const pageConfig = { topInset: 48, transition: "stack" } satisfies PageConfig;
