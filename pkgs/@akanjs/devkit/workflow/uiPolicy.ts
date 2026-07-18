import { normalizeFieldType } from "./source";

export type AddFieldUiComponent = "Field.Text" | "Field.Number" | "Field.Date" | "Field.ToggleSelect";

export const addFieldUiPolicyForType = (typeName: string) => {
  const normalizedType = typeName.toLowerCase() === "enum" ? "enum" : normalizeFieldType(typeName);
  if (normalizedType === "Int" || normalizedType === "Float") {
    return {
      normalizedType,
      component: "Field.Number" as const,
      confidence: "high" as const,
      autoTemplateSupported: true,
    };
  }
  if (normalizedType === "Date") {
    return {
      normalizedType,
      component: "Field.Date" as const,
      confidence: "high" as const,
      autoTemplateSupported: true,
    };
  }
  if (normalizedType === "Boolean" || normalizedType === "enum") {
    return {
      normalizedType,
      component: "Field.ToggleSelect" as const,
      confidence: "medium" as const,
      autoTemplateSupported: false,
    };
  }
  if (normalizedType === "String") {
    return {
      normalizedType,
      component: "Field.Text" as const,
      confidence: "high" as const,
      autoTemplateSupported: true,
    };
  }
  return {
    normalizedType,
    component: "Field.Text" as const,
    confidence: "low" as const,
    autoTemplateSupported: false,
  };
};
