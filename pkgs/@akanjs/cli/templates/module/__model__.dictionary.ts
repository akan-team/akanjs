import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../biomeForm";

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
  const { Model, model } = dict;
  const modelLabelEn = dict.modelLabelEn ?? Model;
  const modelLabelKo = dict.modelLabelKo ?? Model;
  const modelDescEn = dict.modelDescEn ?? `Manage ${modelLabelEn.toLowerCase()}.`;
  const modelDescKo = dict.modelDescKo ?? `${modelLabelKo}을 관리합니다.`;
  return `import { modelDictionary } from "akanjs/dictionary";

${BiomeForm.importFrom([Model, `${Model}Insight`], `./${model}.constant`, { typeOnly: true })}
${BiomeForm.importFrom([`${Model}Filter`], `./${model}.document`, { typeOnly: true })}
${BiomeForm.importFrom([`${Model}Endpoint`, `${Model}Slice`], `./${model}.signal`, { typeOnly: true })}

export const dictionary = modelDictionary(["en", "ko"])
${BiomeForm.dictionaryOf([modelLabelEn, modelLabelKo], [modelDescEn, modelDescKo])}
  .model<${Model}>((t) => ({
    name: t(["Name", "이름"]).desc(["Name", "이름"]),
  }))
  .insight<${Model}Insight>((t) => ({}))
  .query<${Model}Filter>((fn) => ({}))
  .sort<${Model}Filter>((t) => ({}))
  .slice<${Model}Slice>((fn) => ({
${BiomeForm.dictionarySlice("inPublic", [`${Model} In Public`, `${Model} 공개`])}
  }))
  .endpoint<${Model}Endpoint>((fn) => ({}))
  .error({})
  .translate({});
`;
}
