export const sysNamePattern = /^[a-z0-9][a-zA-Z0-9_-]*$/;
export const identifierPattern = /^_{0,2}[a-zA-Z][a-zA-Z0-9_-]*$/;
const packageNamePattern = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

export type PlainNameKind = "app" | "lib" | "module" | "service" | "scalar";

export const isWorkflowSysName = (value: unknown): value is string =>
  typeof value === "string" && sysNamePattern.test(value);
export const isWorkflowModuleName = (value: unknown): value is string =>
  typeof value === "string" && identifierPattern.test(value);

export const plainNameProblem = (kind: PlainNameKind, name: string) => {
  const isSys = kind === "app" || kind === "lib";
  if (isSys ? isWorkflowSysName(name) : isWorkflowModuleName(name)) return null;
  return `${JSON.stringify(name)} is no ${kind} name; use letters, digits, - and _, starting with ${isSys ? "a lowercase letter or digit" : "a letter"}`;
};

export const assertPlainName = (kind: PlainNameKind, name: string) => {
  const problem = plainNameProblem(kind, name);
  if (problem) throw new Error(problem);
};

export const assertPackageName = (name: string) => {
  if (packageNamePattern.test(name)) return;
  throw new Error(
    `${JSON.stringify(name)} is no package name; use name or @scope/name, each of lowercase letters, digits, -, . and _, starting with a letter or digit`,
  );
};
