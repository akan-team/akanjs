import { isDayjs } from "./isDayjs";

export const deepObjectify = <T = any>(
  obj: T | null | undefined,
  option: { serializable?: boolean; convertDate?: "string" | "number" } = {}
): T => {
  if (isDayjs(obj) || obj?.constructor === Date) {
    if (!option.serializable && !option.convertDate) return obj as T;
    if (option.convertDate === "string") return obj.toISOString() as T;
    else if (option.convertDate === "number")
      return (isDayjs(obj) ? obj.toDate().getTime() : (obj as Date).getTime()) as T;
    else return (isDayjs(obj) ? obj.toDate() : obj) as T;
  } else if (Array.isArray(obj)) {
    return obj.map((o: object) => deepObjectify(o, option)) as T;
  } else if (obj && typeof obj === "object") {
    const val = {} as { [key: string]: any };
    const objRecord = obj as Record<string, any>;
    Object.keys(obj).forEach((key) => {
      const fieldValue = objRecord[key] as { __ModelType__: string } | null | undefined;
      if (fieldValue?.__ModelType__ && !option.serializable) val[key] = fieldValue;
      else if (typeof objRecord[key] !== "function") val[key] = deepObjectify(fieldValue, option);
    });
    return val as T;
  } else {
    return obj as unknown as T;
  }
};
