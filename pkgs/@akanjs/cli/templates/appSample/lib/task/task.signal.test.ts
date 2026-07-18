import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return `import { describe, expect, test } from "bun:test";
import { configureSignalTest } from "akanjs/test";

import * as taskSpec from "./task.signal.spec";

configureSignalTest({ databaseMode: "memory" });

describe("Task signal smoke", () => {
  test("exposes custom task mutations over fetch", async () => {
    const { task } = await taskSpec.getCompletedTask({ title: "Signal smoke task" });

    expect(task.status).toBe("completed");
    expect(task.workHistory.map((entry) => entry.action)).toEqual(["created", "started", "completed"]);
  });
});
`;
}
