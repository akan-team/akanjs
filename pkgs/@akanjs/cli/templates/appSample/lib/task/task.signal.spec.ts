import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return `import { expect } from "bun:test";
import type { DocumentModel } from "akanjs/constant";
import { getOrSetupSignalTestFetch, sampleOf } from "akanjs/test";

import * as cnst from "../cnst";
import type { fetch as appFetch } from "../useServer";

type AppFetch = typeof appFetch;

const getFetch = async () => await getOrSetupSignalTestFetch<AppFetch>();

export interface TaskAgent {
  task: cnst.Task;
  fetch: AppFetch;
  taskInput: DocumentModel<cnst.TaskInput>;
}

export const createTask = async (overrides: Partial<DocumentModel<cnst.TaskInput>> = {}): Promise<TaskAgent> => {
  const fetch = await getFetch();
  const taskInput = {
    ...sampleOf(cnst.TaskInput),
    ...overrides,
  };

  const task = await fetch.createTask(taskInput);

  expect(task).toMatchObject({
    title: taskInput.title,
    content: taskInput.content,
    status: "todo",
  });
  expect(task.workHistory.map((entry) => entry.action)).toEqual(["created"]);

  return {
    task,
    fetch,
    taskInput,
  };
};

export const getStartedTask = async (overrides: Partial<DocumentModel<cnst.TaskInput>> = {}): Promise<TaskAgent> => {
  const agent = await createTask(overrides);
  const task = await agent.fetch.startTask(agent.task.id);

  expect(task.status).toBe("inProgress");
  expect(task.workHistory.map((entry) => entry.action)).toEqual(["created", "started"]);

  return {
    ...agent,
    task,
  };
};

export const getCompletedTask = async (overrides: Partial<DocumentModel<cnst.TaskInput>> = {}): Promise<TaskAgent> => {
  const agent = await getStartedTask(overrides);
  const task = await agent.fetch.completeTask(agent.task.id);

  expect(task.status).toBe("completed");
  expect(task.workHistory.map((entry) => entry.action)).toEqual(["created", "started", "completed"]);

  return {
    ...agent,
    task,
  };
};
`;
}
