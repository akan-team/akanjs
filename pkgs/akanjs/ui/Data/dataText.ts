import { capitalize } from "akanjs/common";

export const humanize = (name: string) => capitalize(name.replace(/([a-z\d])([A-Z])/g, "$1 $2").trim());

/** A dictionary miss returns the key itself (`makeTrans`), so a raw `user.insight.count` would ship as the label. */
export const dictLabel = (translate: (key: string) => string, key: string, name: string) => {
  const label = translate(key);
  return label === key ? humanize(name) : label;
};

/** A column with no renderer still has to print something a React child accepts, objects and arrays included. */
export const formatCell = (value: unknown) => {
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
};

export const formatStat = (value: unknown) => {
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  return "-";
};
