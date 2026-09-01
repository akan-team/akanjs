import { LexicalDemo } from "@libs/shared/ui";
import type { PageConfig } from "akanjs/client";

export default async function Page() {
  return <LexicalDemo />;
}
export const pageConfig = { devOnly: true } satisfies PageConfig;
