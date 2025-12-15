import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  model: string;
  Model: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { scalarDictionary } from "@akanjs/dictionary";

import type { ${dict.Model} } from "./${dict.model}.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["${dict.Model}", "${dict.Model}"]).desc(["${dict.Model} description", "${dict.Model} 설명"]))
  .model<${dict.Model}>((t) => ({
    field: t(["Field", "필드"]).desc(["Field Description", "필드 설명"]),
  }));
`;
}
