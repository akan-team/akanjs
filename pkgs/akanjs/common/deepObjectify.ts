import { isDayjs } from "./isDayjs";

interface DeepObjectifyOption {
  serializable?: boolean;
  convertDate?: "string" | "number";
}

const objectifyChild = (value: unknown, option: DeepObjectifyOption): unknown => {
  const modelValue = value as { __ModelType__?: string } | null | undefined;
  return modelValue?.__ModelType__ && !option.serializable ? value : deepObjectify(value, option);
};

export const deepObjectify = <T = unknown>(obj: T | null | undefined, option: DeepObjectifyOption = {}): T => {
  if (isDayjs(obj) || obj?.constructor === Date) {
    if (!option.serializable && !option.convertDate) return obj as T;
    if (option.convertDate === "string") return obj.toISOString() as T;
    else if (option.convertDate === "number")
      return (isDayjs(obj) ? obj.toDate().getTime() : (obj as Date).getTime()) as T;
    else return (isDayjs(obj) ? obj.toDate() : obj) as T;
  } else if (Array.isArray(obj)) {
    return obj.map((o: unknown) => deepObjectify(o, option)) as T;
  } else if (obj instanceof Map) {
    // Map entries are not own enumerable keys, so the plain-object branch below copies a populated Map to `{}`.
    const entries = [...obj.entries()].map(
      ([key, value]: [string, unknown]) => [key, objectifyChild(value, option)] as const,
    );
    return (option.serializable ? Object.fromEntries(entries) : new Map(entries)) as T;
  } else if (obj instanceof Set) {
    const values = [...obj.values()].map((value: unknown) => objectifyChild(value, option));
    return (option.serializable ? values : new Set(values)) as T;
  } else if (obj && typeof obj === "object") {
    const val: Record<string, unknown> = {};
    const objRecord = obj as Record<string, unknown>;
    Object.keys(obj).forEach((key) => {
      if (typeof objRecord[key] !== "function") val[key] = objectifyChild(objRecord[key], option);
    });
    return val as T;
  } else {
    return obj as unknown as T;
  }
};
