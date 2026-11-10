export const sysNamePattern = /^[a-z0-9][a-zA-Z0-9_-]*$/;
export const identifierPattern = /^_{0,2}[a-zA-Z][a-zA-Z0-9_-]*$/;

export const isWorkflowSysName = (value: unknown): value is string =>
  typeof value === "string" && sysNamePattern.test(value);
export const isWorkflowModuleName = (value: unknown): value is string =>
  typeof value === "string" && identifierPattern.test(value);

export const assertPlainName = (kind: "app" | "lib" | "module" | "service" | "scalar", name: string) => {
  const isSys = kind === "app" || kind === "lib";
  if (isSys ? isWorkflowSysName(name) : isWorkflowModuleName(name)) return;
  throw new Error(
    `${JSON.stringify(name)} is no ${kind} name; use letters, digits, - and _, starting with ${isSys ? "a lowercase letter or digit" : "a letter"}`,
  );
};
