Create a Team Task Board app in this repository using the target stack.

Target stack: {{stackLabel}}

Allowed packages and versions:
{{allowedPackages}}

Use the stack-specific appendix at the end of this prompt as part of the benchmark instructions. Do not replace the
target stack with a different framework or parallel architecture.

Requirements:
- Use SQLite for persistence.
- Implement users, teams, and tasks.
- A task has title, description, status, assignee, team, and createdAt.
- Show a task list with status filter.
- Allow creating a task.
- Allow changing task status.
- Allow assigning a task to a user.
- Show task detail.
- Seed at least 3 users, 1 team, and 8 tasks.
- Keep styling minimal but usable.
- Provide accessible labels or matching `data-testid` attributes for the smoke test controls:
  `task-list`, `new-task-title`, `new-task-description`, `create-task`, `status-filter`, `task-status`,
  `assignee-select`, and `task-detail`.
- The app must be reachable at `/` or `/tasks` after the benchmark start command runs.
- The app must build with the benchmark build command.
- The app must pass the configured benchmark lint command and convention check, if present.
- If this stack uses Vite plus an API server, make `bun run dev --host 127.0.0.1` start both the frontend and backend.
- Do not require the benchmark harness to start a second server command.
- Add or maintain a smoke test or documented command if it helps, but the shared benchmark smoke test is the source of truth.

Acceptance criteria:
- `/` or `/tasks` shows the task list.
- A task can be created.
- A task status can be changed.
- An assignee can be selected or changed.
- The status filter changes the visible task list.
- Task detail is visible in a detail page or panel.
- Refreshing the page keeps created or updated data.
- The build command succeeds.
- The configured lint command succeeds.
- The configured convention check succeeds.
- The smoke test command succeeds.

Do not add features outside this scope.
Do not use a different database.
Do not replace the target stack with another framework.
Do not remove the required smoke-test labels or `data-testid` hooks.
