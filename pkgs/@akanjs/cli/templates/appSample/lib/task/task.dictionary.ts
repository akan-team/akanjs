import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return `import { modelDictionary } from "akanjs/dictionary";

import type { Task, TaskStatus } from "./task.constant";
import type { TaskFilter } from "./task.document";

// ===== task.dictionary.ts =====
// Convention: <module>.dictionary.ts — i18n labels and messages for a database module.
// Uses modelDictionary(["en", "ko"]) from akanjs/dictionary — the framework convention for bilingual module dictionaries.
// Sections: .of() module name, .model() field labels, .lightModel() list-view labels, .query() filter labels,
// .sort() labels, .enum() value labels, .error() messages (thrown via Err()), .translate() UI messages (used in store via msg.xxx).
// Registered by akan sync into dict.ts barrel.

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["Task", "할 일"])
      .desc(["A unit of work to be completed", "완료해야 할 작업 단위"]),
  )
  .model<Task>((t) => ({
    title: t(["Title", "제목"]).desc(["Task title", "할 일 제목"]),
    content: t(["Content", "내용"]).desc(["Detailed task description", "상세 작업 설명"]),
    status: t(["Status", "상태"]).desc(["Current task status", "현재 작업 상태"]),
    due: t(["Due Date", "마감일"]).desc(["Deadline for completion", "완료 마감일"]),
    workHistory: t(["Work History", "작업 이력"]).desc(["Status change log", "상태 변경 기록"]),
  }))
  .query<TaskFilter>((fn) => ({
    byStatus: fn(["By Status", "상태별"]).arg((t) => ({
      status: t(["Status", "상태"]),
    })),
    dueBefore: fn(["Due Before", "이전 마감"]).arg((t) => ({
      before: t(["Before Date", "기준일"]),
    })),
  }))
  .sort<TaskFilter>((t) => ({
    byDue: t(["By Due Date", "마감일순"]),
    newest: t(["Newest First", "최신순"]),
  }))
  .enum<TaskStatus>("taskStatus", (t) => ({
    todo: t(["To Do", "할 일"]),
    inProgress: t(["In Progress", "진행 중"]),
    completed: t(["Completed", "완료"]),
  }))
  .error({
    cannotStartFromNonTodo: [
      "Task can only start from todo status",
      "할 일 상태에서만 시작할 수 있습니다",
    ],
    cannotCompleteFromNonInProgress: [
      "Task can only complete from in-progress status",
      "진행 중 상태에서만 완료할 수 있습니다",
    ],
  })
  .translate({
    createTaskLoading: ["Creating task…", "할 일 생성 중…"],
    createTaskSuccess: ["Task created", "할 일이 생성되었습니다"],
    startTaskLoading: ["Starting task…", "작업 시작 중…"],
    startTaskSuccess: ["Task started", "작업이 시작되었습니다"],
    completeTaskLoading: ["Completing task…", "작업 완료 중…"],
    completeTaskSuccess: ["Task completed", "작업이 완료되었습니다"],
    removeTaskLoading: ["Removing task…", "할 일 삭제 중…"],
    removeTaskSuccess: ["Task removed", "할 일이 삭제되었습니다"],
    taskDueLabel: ["Due:", "마감:"],
    taskNoDue: ["No deadline", "마감 없음"],
    taskWorkHistoryTitle: ["Work History", "작업 이력"],
    taskStart: ["Start", "시작"],
    taskComplete: ["Complete", "완료"],
    taskRemove: ["Remove", "삭제"],
    taskNoTasks: ["No tasks yet", "할 일이 없습니다"],
    taskCreateFirst: ["+ Create your first task", "+ 첫 할 일 만들기"],
    taskBackToTasks: ["← Back to Tasks", "← 할 일 목록으로"],
    taskEdit: ["Edit", "수정"],
    taskNew: ["+ New Task", "+ 새 할 일"],
  });
`;
}
