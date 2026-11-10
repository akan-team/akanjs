import { describe, expect, test } from "bun:test";
import { constantFieldNames } from "./constantFieldNames";

describe("constantFieldNames", () => {
  test("names each field the code declares, chained or not", () => {
    const content = `export class TaskInput extends via((field) => ({
  title: field(String),
  tags: field(String).list().optional(),
  workHistory: field([WorkHistory]),
})) {}
export class TaskObject extends via(TaskInput, (field) => ({
  due: field(Date).optional(),
  total: resolve<number>(),
})) {}
`;

    expect(constantFieldNames(content)).toEqual(["title", "tags", "workHistory", "due"]);
  });

  test("leaves out a field that appears only in a comment or a string", () => {
    const content = `export class TaskInput extends via((field) => ({
  title: field(String),
  // priority: field(TaskPriority, { default: "medium" })
  /* assignee: field(ID).optional() */
  note: field(String, { default: "completedAt: field(Date)" }),
})) {}
// ---- Expandable additional fields: ----
//  - actor: field(String).optional() — who performed the action
export const example = \`previousStatus: field(TaskStatus)\`;
`;

    expect(constantFieldNames(content)).toEqual(["title", "note"]);
  });
});
