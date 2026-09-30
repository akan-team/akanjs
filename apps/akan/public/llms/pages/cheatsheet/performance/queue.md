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

Some work is too slow to finish inside a request. Put it in a queue and answer right away; a background process picks it up and does the heavy part.

**Good for** backups, exports, report generation, imports, and long AI jobs.

Words used on this page

Term

- process: An internal declared in the signal file. A queued job runs its `exec`.

- job: One queued run of a process: its arguments plus its retry state.

- replica: One server process of the app. Its role is `federation`, `batch` or `all`.

- serverMode: A process option that picks which replica roles run its jobs.

The three steps

**The endpoint records the intent.** It saves `waiting`, queues the job and returns.

**The queue holds the job** until a replica that runs this process takes it.

**The process does the slow work** outside the request path, writing status and progress into the document.

Queue From Endpoint

Keep the endpoint short. It sets the status to `waiting`, asks the process to run later, and returns.

The endpoint only hands the call to the service:

The service saves the status, then queues the job:

**`this.reportSignal.generateReport()` queues, it does not run.** It returns once the job is stored, and its arguments follow the process's `.msg()` order.

**Inject it with `signal<sig.Report>()`.** The field must be named `<refName>Signal`, here `reportSignal`.

**Save the status first, then queue.** A job can start at once, and a late `waiting` would overwrite its `running`.

Job options

Pass job options as the last argument of the queueing call:

- delay (number, default 0): Milliseconds to wait before the first run.

- attempts (number, default 1): How many times the job may run in total, counting the first try. — Example: `await this.reportSignal.generateReport(report.id, { attempts: 3, backoff: 10_000 });`

- backoff (number | { type?, delay? }): Milliseconds to wait before a retry.

Run In Process

The internal process owns the slow work. It updates progress, uploads files, and marks the job `done` or `failed`.

Declare the process in the signal file's Internal class:

**`.msg()` declares what the job carries.** The values passed when queueing arrive in the same order, restored to the declared type.

**The job itself comes last:** `exec(async function (reportId, job) {…})`. It carries `job.id` and `job.attemptsMade`.

**`process(Boolean)` types the return value of `exec`,** here `true`.

The work itself lives in a service method:

**Save at every step.** `running`, then `done` or `failed`, with `progress` in between.

**Only a throw retries.** A job runs again only when `exec` throws and `attempts` remain. This example catches and records `failed`, so it runs once.

Replica Roles

Akan runs replicas with roles: `federation` answers users, and `batch` takes background work. Splitting them keeps slow jobs from exhausting the request servers.

Role

Requests

Default job — serverMode: "all"

Batch job — serverMode: "batch"

- `AKAN_REPLICA=<federation>,<batch>,<all>`

  - federation: Answers user requests.

  - batch: Never listens for requests. Runs background work only.

  - all: Does both. The default `0,0,1` is one of these.

runs

does not run

To move the report job off the request servers, declare `serverMode` on the process:

**Then start a batch replica.** `AKAN_REPLICA=2,1,0` is two federation replicas and one batch replica.

**Something must run it.** With `serverMode: "batch"` and neither a batch nor an all replica, as in `2,0,0`, jobs pile up unrun.

**A batch replica alone does not move the work.** A process without `serverMode` runs on every role, federation included.

Request side: federation replica

User Request

Federation Replica

endpoint

Queue Job

Background side: batch replica

Batch Replica

Run Heavy Work

Update Job Status

User Sees Progress

Tips

Always store the job status. These four are enough for the screen to know what to show:

Status

Written by

Meaning

- waiting — queueGenerateReport — The job is in the queue, waiting for its turn.

- running — generateReport — The process is working. Update `progress` along the way.

- done — generateReport — The result, here `file`, is ready.

- failed — generateReport — The work failed. The reason goes into `errMsg`.

**Make jobs idempotent.** Retrying the same job must not corrupt data.

**Save progress when the user needs feedback.** A `progress` field is enough.

**Return quickly from the endpoint.** Do the slow work in the process.

Internal Signals

Every internal type, and the `serverMode` / `operationMode` options.

Scale With AKAN_REPLICA

The three slots of `AKAN_REPLICA` and how a container runs them.

## Code Examples

### apps/myapp/lib/report/report.signal.ts

```ts
export class ReportEndpoint extends endpoint(srv.report, ({ mutation }) => ({
  queueGenerateReport: mutation(cnst.Report, { guards: [Owner] })
    .param("reportId", ID)
    .exec(async function (reportId) {
      return await this.reportService.queueGenerateReport(reportId);
    }),
})) {}
```

### apps/myapp/lib/report/report.service.ts

```ts
export class ReportService extends serve(db.report, ({ signal, plug }) => ({
  reportSignal: signal<sig.Report>(),
  reportWriter: plug(ReportWriter),
})) {
  async queueGenerateReport(reportId: string) {
    const report = await this.reportModel.getReport(reportId);
    await report.set({ status: "waiting" }).save();
    await this.reportSignal.generateReport(report.id);
    return report;
  }
}
```

### apps/myapp/lib/report/report.signal.ts

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

### apps/myapp/lib/report/report.service.ts

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

### apps/myapp/lib/report/report.signal.ts

```ts
generateReport: process(Boolean, { serverMode: "batch" })
  .msg("reportId", ID)
  .exec(async function (reportId) {
    await this.reportService.generateReport(reportId);
    return true;
  }),
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

