# Team Task Board Requirements

Create a full-stack Team Task Board app.

## Functional Requirements

- Use SQLite for persistence.
- Implement users, teams, and tasks.
- A task has title, description, status, assignee, team, and createdAt.
- Seed at least 3 users, 1 team, and 8 tasks.
- Show a task list at `/` or `/tasks`.
- Support a status filter.
- Allow creating a task.
- Allow changing task status.
- Allow assigning a task to a user.
- Show task detail in a page or panel.
- Data must persist after a page refresh.
- Keep styling minimal but usable.
- The app must be reachable at `/` or `/tasks` after the stack's benchmark start command runs.
- The stack's benchmark build command must complete without type, lint, or bundling errors.
- The stack's configured lint command and convention check, if present, must pass.

## Smoke Test Contract

The shared Playwright smoke test is intentionally framework-neutral. Provide accessible labels, placeholders, or matching
`data-testid` attributes for these controls:

- `task-list`: the list, table, or region containing tasks.
- `new-task-title`: the task title input.
- `new-task-description`: the task description input.
- `create-task`: the button that creates a task.
- `status-filter`: the control that filters tasks by status.
- `task-status`: the control that changes the created task's status.
- `assignee-select`: the control that assigns the created task.
- `task-detail`: the detail page, panel, or region for a selected task.

If the app uses a Vite frontend plus a separate API server, provide a single `bun run dev --host 127.0.0.1` command that
starts everything needed for the smoke test. The benchmark harness will not start separate frontend and backend commands.

## Task Statuses

Use these statuses unless the target framework makes a different label unavoidable:

- `todo`
- `in_progress`
- `done`

## Seed Data

Users:

- Mina Kim
- Joon Park
- Alex Lee

Team:

- Product Team

Tasks:

- Draft onboarding checklist
- Review pricing copy
- Prepare launch QA plan
- Design task detail panel
- Wire status filter
- Fix assignment dropdown
- Validate SQLite persistence
- Write smoke test notes

## Acceptance Criteria

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
