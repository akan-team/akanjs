import { isGqlScalar, Type } from "@akanjs/base";
import { capitalize, lowerlize } from "@akanjs/common";
import { ConstantFieldMeta, constantInfo, getFieldMetaMap, getFieldMetas, getGqlTypeStr } from "@akanjs/constant";

import { SerializedArg, SerializedEndpoint } from ".";

class FragmentStorage {}

const getPredefinedFragment = (refName: string) => {
  const fragment = Reflect.getMetadata(refName, FragmentStorage.prototype) as string | undefined;
  return fragment;
};
const setPredefinedFragment = (refName: string, fragment: string) => {
  Reflect.defineMetadata(refName, fragment, FragmentStorage.prototype);
};

const makeArgStr = (args: SerializedArg[]) => {
  return args.length
    ? `(${args
        .map((arg) => {
          const argRef = constantInfo.getModelRef(arg.refName, arg.modelType);
          const argRefType = isGqlScalar(argRef) ? "gqlScalar" : "class";
          const gqlTypeStr =
            "[".repeat(arg.arrDepth) +
            `${getGqlTypeStr(argRef)}${argRefType === "class" ? (constantInfo.isObject(argRef) ? "Object" : "Input") : ""}` +
            "!]".repeat(arg.arrDepth);
          return `$${arg.name}: ` + gqlTypeStr + (arg.argsOption.nullable ? "" : "!");
        })
        .join(", ")})`
    : "";
};

const makeArgAssignStr = (args: SerializedArg[]) => {
  return args.length ? `(${args.map((arg) => `${arg.name}: $${arg.name}`).join(", ")})` : "";
};

const makeReturnStr = (returnRef: Type, partial?: string[]) => {
  const isScalar = isGqlScalar(returnRef);
  if (isScalar) return "";
  const refName = constantInfo.getRefName(returnRef);
  const fragmentName = `${constantInfo.isLight(returnRef) ? "Light" : ""}${capitalize(refName)}${constantInfo.isInsight(returnRef) ? "Insight" : ""}`;
  if (!partial?.length)
    return ` {
        ...${lowerlize(fragmentName)}Fragment
      }`;
  const targetKeys = constantInfo.isScalar(returnRef) ? partial : [...new Set(["id", ...partial, "updatedAt"])];
  const fieldMetaMap = getFieldMetaMap(returnRef);
  return ` {
    ${targetKeys
      .map((key) => fieldMetaMap.get(key))
      .filter((metadata) => metadata && metadata.fieldType !== "hidden")
      .map((fieldMeta: ConstantFieldMeta) =>
        fieldMeta.isClass
          ? `    ${fieldMeta.key} {
          ...${lowerlize(getGqlTypeStr(fieldMeta.modelRef))}Fragment
        }`
          : `    ${fieldMeta.key}`
      )
      .join("\n")}
      }`;
};
const fragmentize = (modelRef: Type, fragMap = new Map<string, string>(), partial?: string[]) => {
  const refName = constantInfo.getRefName(modelRef);
  const fragmentName = `${constantInfo.isLight(modelRef) ? "Light" : ""}${capitalize(refName)}${constantInfo.isInsight(modelRef) ? "Insight" : ""}`;
  const gqlName = `${capitalize(refName)}${constantInfo.isInsight(modelRef) ? "Insight" : ""}`;
  const metadatas = getFieldMetas(modelRef);
  const selectKeys = partial ? ["id", ...partial, "updatedAt"] : metadatas.map((metadata) => metadata.key);
  const selectKeySet = new Set(selectKeys);
  const fragment =
    `fragment ${lowerlize(fragmentName)}Fragment on ${gqlName} {\n` +
    metadatas
      .filter((metadata) => metadata.fieldType !== "hidden" && selectKeySet.has(metadata.key))
      .map((metadata) => {
        return metadata.isClass
          ? `  ${metadata.key} {\n    ...${lowerlize(`${constantInfo.isLight(metadata.modelRef) ? "Light" : ""}${capitalize(constantInfo.getRefName(metadata.modelRef))}${constantInfo.isInsight(metadata.modelRef) ? "Insight" : ""}`)}Fragment\n  }`
          : `  ${metadata.key}`;
      })
      .join(`\n`) +
    `\n}`;
  fragMap.set(fragmentName, fragment);
  metadatas
    .filter((metadata) => metadata.fieldType !== "hidden" && selectKeySet.has(metadata.key) && metadata.isClass)
    .forEach((metadata) => fragmentize(metadata.modelRef, fragMap));
  return fragMap;
};

export const makeFragment = (
  modelRef: Type,
  option: { overwrite?: any; excludeSelf?: boolean; partial?: string[] } = {}
) => {
  const refName = constantInfo.getRefName(modelRef);
  const fragmentName = `${constantInfo.isLight(modelRef) ? "Light" : ""}${capitalize(refName)}${constantInfo.isInsight(modelRef) ? "Insight" : ""}`;
  const fragment = getPredefinedFragment(fragmentName);
  if (fragment && !option.overwrite && !option.excludeSelf && !option.partial?.length) return fragment;
  const fragMap = new Map(fragmentize(modelRef, new Map(), option.partial));
  if (option.excludeSelf) fragMap.delete(fragmentName);
  const gqlStr = [...fragMap.values()].join("\n");
  if (!option.excludeSelf) setPredefinedFragment(fragmentName, gqlStr);
  return gqlStr;
};

export const getGqlStr = (
  modelRef: Type,
  key: string,
  endpoint: SerializedEndpoint,
  returnRef: Type,
  partial?: string[]
) => {
  const isScalar = isGqlScalar(modelRef);
  const argStr = makeArgStr(endpoint.args);
  const argAssignStr = makeArgAssignStr(endpoint.args);
  const returnStr = makeReturnStr(returnRef, partial);
  const gqlStr = `${isScalar ? "" : makeFragment(returnRef, { excludeSelf: !!partial?.length, partial })}
    ${endpoint.type + " " + key + argStr}{
      ${key}${argAssignStr}${returnStr}
    }
    `;
  return gqlStr;
};

export function graphql(literals: string | readonly string[], ...args: any[]) {
  if (typeof literals === "string") literals = [literals];
  let result = literals[0];
  args.forEach((arg: { [key: string]: any } | undefined, i: number) => {
    if (arg?.kind === "Document") result += (arg as { loc: { source: { body: string } } }).loc.source.body;
    else result += arg as unknown as string;
    result += literals[i + 1];
  });
  return result;
}
