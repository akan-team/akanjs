import type { Sys } from "../commandDecorators";

export const getSysRoot = (sys: Sys) => `${sys.type}s/${sys.name}`;

export const moduleComponentName = (moduleName: string) =>
  moduleName
    .replace(/[-_]+/g, " ")
    .replace(/(?<=^|\s)[a-zA-Z0-9]/g, (char) => char.toUpperCase())
    .replace(/\s+/g, "");

export const moduleSourcePaths = (moduleName: string) => {
  const componentName = moduleComponentName(moduleName);
  return {
    abstract: `lib/${moduleName}/${moduleName}.abstract.md`,
    constant: `lib/${moduleName}/${moduleName}.constant.ts`,
    dictionary: `lib/${moduleName}/${moduleName}.dictionary.ts`,
    document: `lib/${moduleName}/${moduleName}.document.ts`,
    service: `lib/${moduleName}/${moduleName}.service.ts`,
    signal: `lib/${moduleName}/${moduleName}.signal.ts`,
    store: `lib/${moduleName}/${moduleName}.store.ts`,
    template: `lib/${moduleName}/${componentName}.Template.tsx`,
    unit: `lib/${moduleName}/${componentName}.Unit.tsx`,
    util: `lib/${moduleName}/${componentName}.Util.tsx`,
    view: `lib/${moduleName}/${componentName}.View.tsx`,
    zone: `lib/${moduleName}/${componentName}.Zone.tsx`,
  };
};
