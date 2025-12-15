import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  Model: string;
  model: string;
  sysName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { modelDictionary } from "@akanjs/dictionary";

import type { ${dict.Model}, ${dict.Model}Insight } from "./${dict.model}.constant";
import type { ${dict.Model}Endpoint, ${dict.Model}Slice } from "./${dict.model}.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["${dict.Model}", "${dict.Model}"]).desc(["${dict.Model} description", "${dict.Model} 설명"])
  )
  .model<${dict.Model}>((t) => ({
    field: t(["Field", "필드"]).desc(["Field description", "필드 설명"]),
  }))
  .insight<${dict.Model}Insight>((t) => ({}))
  .slice<${dict.Model}Slice>((fn) => ({
    inPublic: fn(["${dict.Model} In Public", "${dict.Model} 공개"]).arg((t) => ({})),
  }))
  .endpoint<${dict.Model}Endpoint>((fn) => ({}))
  .error({})
  .translate({});
`;
}
