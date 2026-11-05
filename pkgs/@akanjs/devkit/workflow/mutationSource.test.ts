import { describe, expect, test } from "bun:test";
import { MutationSource } from "./mutationSource";

const sourceOf = (overrides: Partial<ConstructorParameters<typeof MutationSource>[0]> = {}) =>
  new MutationSource({
    module: "task",
    mutation: "archiveTask",
    guards: ["Admin"],
    acting: null,
    withCalls: [],
    afterCalls: [],
    ...overrides,
  });

describe("MutationSource", () => {
  test("drops the model from the chain method and keeps a name without it", () => {
    expect(MutationSource.chainMethodOf("archiveTask", "Task")).toBe("archive");
    expect(MutationSource.chainMethodOf("approveUserImages", "User")).toBe("approveImages");
    expect(MutationSource.chainMethodOf("archive", "Task")).toBe("archive");
  });

  test("writes the past participle the transition comment names", () => {
    expect(["archive", "pin", "start", "apply", "send", "hide", "open"].map(MutationSource.participleOf)).toEqual([
      "archived",
      "pinned",
      "started",
      "applied",
      "sent",
      "hidden",
      "opened",
    ]);
  });

  test("writes a chain method that mutates nothing until the author fills it", () => {
    expect(sourceOf().chainMethodBlock).toBe("  // any → archived.\n  archive() {\n    return this;\n  }");
  });

  test("loads, chains and saves without a transaction when nothing rides along", () => {
    expect(sourceOf().serviceMethodBlock).toBe(
      [
        "  async archiveTask(taskId: string) {",
        "    const task = await this.getTask(taskId);",
        "    return await task.archive().save();",
        "  }",
      ].join("\n"),
    );
  });

  test("runs with-calls in the transaction and after-calls through afterCommit", () => {
    const source = sourceOf({
      withCalls: [{ ref: "board", method: "touchBoard", field: "boardService", args: ["task.id"] }],
      afterCalls: [{ ref: "noti", method: "sendArchived", field: "notiService", args: ["task"] }],
    });

    expect(source.serviceMethodBlock).toBe(
      [
        "  async archiveTask(taskId: string) {",
        "    return await this.transaction(async () => {",
        "      const task = await this.getTask(taskId);",
        "      await task.archive().save();",
        "      await this.boardService.touchBoard(task.id);",
        "      await this.afterCommit(() => this.notiService.sendArchived(task));",
        "      return task;",
        "    });",
        "  }",
      ].join("\n"),
    );
  });

  test("hands the acting user to the service only through the guard's internal arg", () => {
    const source = sourceOf({
      guards: ["User"],
      acting: { argName: "Self", param: "self", value: "self.id", serviceParam: "selfId" },
    });

    expect(source.signalEntry).toBe(
      [
        "archiveTask: mutation(cnst.Task, { guards: [User] })",
        '    .param("taskId", ID)',
        "    .with(Self)",
        "    .exec(async function (taskId, self) {",
        "      return await this.taskService.archiveTask(taskId, self.id);",
        "    }),",
      ].join("\n"),
    );
    expect(source.serviceMethodBlock).toContain("async archiveTask(taskId: string, selfId: string) {");
    expect(source.storeActionBlock).toBe(
      ["  async archiveTask(taskId: string) {", "    this.setTask(await fetch.archiveTask(taskId));", "  }"].join("\n"),
    );
  });

  test("rate-limits a Public mutation and plans no refusal test for it", () => {
    const source = sourceOf({ guards: ["Public"] });

    expect(source.signalEntry).toContain("mutation(cnst.Task, { guards: [Public], rateLimit: { calls: 20 } })");
    expect(source.testTitles).toEqual(["archiveTask leaves the task archived for a caller Public admits"]);
    expect(sourceOf().testTitles).toContain("archiveTask refuses a caller Admin turns away");
  });
});
