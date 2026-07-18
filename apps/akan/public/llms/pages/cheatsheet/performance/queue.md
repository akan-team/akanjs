# Queueing

- Source: /cheatsheet/performance/queue
- Mirror: /llms/pages/cheatsheet/performance/queue.md
- Section: cheatsheet
- Category: Performance
- Priority: P2

## Headings

- Queueing (#overview)
- Queue From Endpoint (#endpoint)
- Run In Process (#process)
- Replica Roles (#replica)
- Tips (#tips)

## Content

Queueing

Queueing is for work that should not block the user's request. The button returns quickly, and a background process does the heavy job.

Good for backups, exports, report generation, imports, and long AI jobs.

The endpoint records intent and queues the process.

The process performs the slow work outside the request path.

Queue From Endpoint

The endpoint should stay short. It changes the job status to waiting and asks the internal process to run later.

Queue report generation

Service queues process

Run In Process

The internal process owns the slow work. It can update progress, upload files, and mark the job as done or failed.

Internal process

Slow job

Replica Roles

Akan can run replicated children with roles. `federation` handles user-facing requests, while `batch` can take background work. This helps prevent slow jobs from exhausting the request server.

Before batch child

After batch child

Tips

Always store job status: `waiting`, `running`, `done`, `failed`.

Make jobs idempotent. Retrying the same job should not corrupt data.

Save progress when the user needs feedback.

Return quickly from endpoint. Do the slow work in process.

## Code Examples

### Code

```ts
export class ReportEndpoint extends endpoint(srv.report, ({ mutation }) => ({
  queueGenerateReport: mutation(cnst.Report)
    .param("reportId", ID)
    .exec(async function (reportId) {
      return await this.reportService.queueGenerateReport(reportId);
    }),
})) {}
```

### Code

```ts
async queueGenerateReport(reportId: string) {
  const report = await this.reportModel.getReport(reportId);
  await report.set({ status: "waiting" }).save();
  await this.reportSignal.generateReport(report.id);
  return report;
}
```

### Code

```ts
export class ReportInternal extends internal(srv.report, ({ process }) => ({
  generateReport: process(Boolean)
    .msg("reportId", ID)
    .exec(async function (reportId) {
      await this.reportService.generateReport(reportId);
      return true;
    }),
})) {}
```

### Code

```ts
async generateReport(reportId: string) {
  const report = await this.reportModel.getReport(reportId);
  await report.set({ status: "running", progress: 10 }).save();
  try {
    const file = await this.reportWriter.makePdf(report);
    await report.set({ status: "done", progress: 100, file }).save();
  } catch (err) {
    await report.set({ status: "failed", errMsg: String(err) }).save();
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

