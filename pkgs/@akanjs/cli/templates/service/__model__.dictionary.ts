import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../biomeForm";

interface Dict {
  Model: string;
  model: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  const { Model, model } = dict;
  return `import { modelDictionary } from "akanjs/dictionary";

import type { ${Model}Endpoint } from "../sig";

export const dictionary = modelDictionary(["en", "ko"])
${BiomeForm.dictionaryOf([model, model], [`${model} description`, `${model} 설명`])}
  .endpoint<${Model}Endpoint>((fn) => ({}))
  .error({})
  .translate({});
`;
}
