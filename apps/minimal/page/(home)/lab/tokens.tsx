import { LabTokens } from "@apps/minimal/ui";
import type { PageConfig } from "akanjs/client";

export default function Page() {
  return <LabTokens />;
}

export const pageConfig = { topInset: 48, transition: "stack" } satisfies PageConfig;
