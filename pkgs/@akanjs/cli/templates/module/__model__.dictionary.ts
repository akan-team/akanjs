import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  Model: string;
  model: string;
  modelDescEn?: string;
  modelDescKo?: string;
  modelLabelEn?: string;
  modelLabelKo?: string;
  sysName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  const modelLabelEn = dict.modelLabelEn ?? dict.Model;
  const modelLabelKo = dict.modelLabelKo ?? dict.Model;
  const modelDescEn = dict.modelDescEn ?? `Manage ${modelLabelEn.toLowerCase()}.`;
  const modelDescKo = dict.modelDescKo ?? `${modelLabelKo}을 관리합니다.`;
  return `
import { modelDictionary } from "akanjs/dictionary";

import type { ${dict.Model}, ${dict.Model}Insight } from "./${dict.model}.constant";
import type { ${dict.Model}Endpoint, ${dict.Model}Slice } from "./${dict.model}.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["${modelLabelEn}", "${modelLabelKo}"]).desc(["${modelDescEn}", "${modelDescKo}"])
  )
  .model<${dict.Model}>((t) => ({
    name: t(["Name", "이름"]),
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
