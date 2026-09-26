import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return `import { describe, expect, test } from "bun:test";
import { configureSignalTest } from "akanjs/test";

import * as taskSpec from "./task.signal.spec";

configureSignalTest({ storage: "memory" });

describe("Task signal smoke", () => {
  test("creates a task in todo", async () => {
    const { task, taskInput } = await taskSpec.createTask({ title: "Signal smoke task" });

    expect(task).toMatchObject({ title: taskInput.title, content: taskInput.content, status: "todo" });
    expect(task.workHistory.map((entry) => entry.action)).toEqual(["created"]);
  });

  test("starts a task", async () => {
    const { task } = await taskSpec.getStartedTask({ title: "Signal smoke task" });

    expect(task.status).toBe("inProgress");
    expect(task.workHistory.map((entry) => entry.action)).toEqual(["created", "started"]);
  });

  test("exposes custom task mutations over fetch", async () => {
    const { task } = await taskSpec.getCompletedTask({ title: "Signal smoke task" });

    expect(task.status).toBe("completed");
    expect(task.workHistory.map((entry) => entry.action)).toEqual(["created", "started", "completed"]);
  });
});
`;
}
