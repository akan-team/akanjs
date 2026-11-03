import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../../biomeForm";

interface Dict {
  model: string;
  Model: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  const { Model, model } = dict;
  return `import { scalarDictionary } from "akanjs/dictionary";

import type { ${Model} } from "./${model}.constant";

export const dictionary = scalarDictionary(["en", "ko"])
${BiomeForm.dictionaryOf([Model, Model], [`${Model} description`, `${Model} 설명`])}
  .model<${Model}>((t) => ({
    field: t(["Field", "필드"]).desc(["Field Description", "필드 설명"]),
  }));
`;
}
