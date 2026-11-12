import ts from "typescript";
import { propertyName } from "./sourceAst";
import { lineEndAt, lineIndentAt, lineStartAt, spliceText } from "./sourceText";

export const fieldOrderingPriority = [
  "id",
  "name",
  "title",
  "status",
  "category",
  "description",
  "content",
  "startAt",
  "dueAt",
  "endAt",
  "createdAt",
  "updatedAt",
] as const;

type FieldOrderingName = string;

interface LocatedField {
  name: FieldOrderingName;
  start: number;
  fullStart: number;
  end: number;
}

export interface ObjectInsertionLocator {
  objectStart: number;
  objectEnd: number;
  fields: LocatedField[];
}

export const locatedObject = (
  source: ts.SourceFile,
  objectLiteral: ts.ObjectLiteralExpression,
): ObjectInsertionLocator => ({
  objectStart: objectLiteral.getStart(source),
  objectEnd: objectLiteral.getEnd(),
  fields: objectLiteral.properties
    .map((property): LocatedField | null => {
      const name = propertyName(property);
      if (!name) return null;
      return {
        name,
        start: property.getStart(source),
        fullStart: property.getFullStart(),
        end: property.getEnd(),
      };
    })
    .filter((field): field is LocatedField => field !== null),
});

const priorityOf = (fieldName: string) => {
  const priority = (fieldOrderingPriority as readonly string[]).indexOf(fieldName);
  return priority < 0 ? null : priority;
};

export const insertionIndexForFieldOrder = (fieldNames: readonly string[], newFieldName: string) => {
  const newPriority = priorityOf(newFieldName);
  if (newPriority !== null) {
    const greaterPriorityIndex = fieldNames.findIndex((name) => {
      const existingPriority = priorityOf(name);
      return existingPriority !== null && existingPriority > newPriority;
    });
    if (greaterPriorityIndex >= 0) return greaterPriorityIndex;

    const lastPriorityIndex = fieldNames.reduce((lastIndex, name, index) => {
      const existingPriority = priorityOf(name);
      return existingPriority !== null ? index : lastIndex;
    }, -1);
    return lastPriorityIndex + 1;
  }

  const lastNonPriorityIndex = fieldNames.reduce(
    (lastIndex, name, index) => (priorityOf(name) === null ? index : lastIndex),
    -1,
  );
  return lastNonPriorityIndex >= 0 ? lastNonPriorityIndex + 1 : fieldNames.length;
};

export const insertOrderedFieldLine = (
  content: string,
  locator: ObjectInsertionLocator,
  fieldName: string,
  line: string,
  options: { fieldIndent: string; closingIndent: string },
) => {
  if (locator.fields.some((field) => field.name === fieldName)) return content;
  const insertIndex = insertionIndexForFieldOrder(
    locator.fields.map((field) => field.name),
    fieldName,
  );
  const formattedLine = line.trim();
  if (locator.fields.length === 0) {
    return spliceText(
      content,
      locator.objectStart,
      locator.objectEnd,
      `{\n${options.fieldIndent}${formattedLine}\n${options.closingIndent}}`,
    );
  }

  const beforeField = locator.fields[insertIndex];
  if (beforeField) {
    const leadingComments = ts.getLeadingCommentRanges(content, beforeField.fullStart) ?? [];
    const insertAt = lineStartAt(content, leadingComments[0]?.pos ?? beforeField.start);
    const indent = lineIndentAt(content, beforeField.start) || options.fieldIndent;
    return spliceText(content, insertAt, insertAt, `${indent}${formattedLine}\n`);
  }

  const afterField = locator.fields[locator.fields.length - 1];
  const insertAt = lineEndAt(content, afterField.end);
  const indent = lineIndentAt(content, afterField.start) || options.fieldIndent;
  return spliceText(content, insertAt, insertAt, `${indent}${formattedLine}\n`);
};
