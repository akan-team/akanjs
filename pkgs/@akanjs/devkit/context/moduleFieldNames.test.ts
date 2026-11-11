import { describe, expect, test } from "bun:test";
import { constantFieldNames, unlabeledFieldNames } from "./moduleFieldNames";

describe("moduleFieldNames", () => {
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

  test("unlabeledFieldNames finds a real label and reports one that is only commented out or inside a string", () => {
    const constant = `export class TaskInput extends via((field) => ({
  title: field(String),
  content: field(String),
  status: field(TaskStatus),
  due: field(Date).optional(),
})) {}
`;
    const dictionary = `export const dictionary = modelDictionary(["en", "ko"])
  .model<Task>((t) => ({
    title: t(["Title", "제목"]).desc(["Task title", "할 일 제목"]),
    // content: t(["Content", "내용"]),
    /* status: t(["Status", "상태"]), */
  }))
  .translate({
    taskDueHint: ["due: pick a date", "마감: 날짜를 고르세요"],
  });
`;

    expect(unlabeledFieldNames(constant, dictionary)).toEqual(["content", "status", "due"]);
  });
});
