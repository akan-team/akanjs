import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Queueing", ko: "큐 작업" })}>
        <Docs.Title>{l.trans({ en: "Queueing", ko: "큐 작업" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Queueing is for work that should not block the user's request. The button returns quickly, and a background process does the heavy job.",
              ko: "큐 작업은 사용자 요청을 막으면 안 되는 일을 처리할 때 씁니다. 버튼 요청은 빠르게 끝나고, 무거운 작업은 백그라운드 process가 수행합니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Good for backups, exports, report generation, imports, and long AI jobs.",
                ko: "백업, export, report 생성, import, 긴 AI 작업에 좋습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "The endpoint records intent and queues the process.",
                ko: "Endpoint는 사용자의 의도를 기록하고 process를 queue에 넣습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "The process performs the slow work outside the request path.",
                ko: "Process는 느린 작업을 request 경로 밖에서 수행합니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="endpoint" title={l.trans({ en: "Queue From Endpoint", ko: "Endpoint에서 queue 넣기" })}>
        <Docs.Title>{l.trans({ en: "Queue From Endpoint", ko: "Endpoint에서 queue 넣기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The endpoint should stay short. It changes the job status to waiting and asks the internal process to run later.",
              ko: "Endpoint는 짧게 유지하세요. Job 상태를 waiting으로 바꾸고 internal process에게 나중에 실행하라고 요청합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Queue report generation", ko: "Report 생성 queue" })}
          code={`export class ReportEndpoint extends endpoint(srv.report, ({ mutation }) => ({
  queueGenerateReport: mutation(cnst.Report)
    .param("reportId", ID)
    .exec(async function (reportId) {
      return await this.reportService.queueGenerateReport(reportId);
    }),
})) {}`}
        />
        <Code.Snippet
          title={l.trans({ en: "Service queues process", ko: "Service에서 process 호출" })}
          code={`async queueGenerateReport(reportId: string) {
  const report = await this.reportModel.getReport(reportId);
  await report.set({ status: "waiting" }).save();
  await this.reportSignal.generateReport(report.id);
  return report;
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="process" title={l.trans({ en: "Run In Process", ko: "Process에서 실행" })}>
        <Docs.Title>{l.trans({ en: "Run In Process", ko: "Process에서 실행" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The internal process owns the slow work. It can update progress, upload files, and mark the job as done or failed.",
              ko: "Internal process가 느린 작업을 담당합니다. 진행률을 갱신하고, 파일을 업로드하고, job을 done 또는 failed로 표시할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Internal process", ko: "Internal process" })}
          code={`export class ReportInternal extends internal(srv.report, ({ process }) => ({
  generateReport: process(Boolean)
    .msg("reportId", ID)
    .exec(async function (reportId) {
      await this.reportService.generateReport(reportId);
      return true;
    }),
})) {}`}
        />
        <Code.Snippet
          title={l.trans({ en: "Slow job", ko: "느린 작업" })}
          code={`async generateReport(reportId: string) {
  const report = await this.reportModel.getReport(reportId);
  await report.set({ status: "running", progress: 10 }).save();
  try {
    const file = await this.reportWriter.makePdf(report);
    await report.set({ status: "done", progress: 100, file }).save();
  } catch (err) {
    await report.set({ status: "failed", errMsg: String(err) }).save();
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="replica" title={l.trans({ en: "Replica Roles", ko: "Replica 역할" })}>
        <Docs.Title>{l.trans({ en: "Replica Roles", ko: "Replica 역할" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan can run replicated children with roles. `federation` handles user-facing requests, while `batch` can take background work. This helps prevent slow jobs from exhausting the request server.",
              ko: "Akan은 역할이 있는 child replica를 실행할 수 있습니다. `federation`은 사용자 요청을 처리하고, `batch`는 백그라운드 작업을 맡을 수 있습니다. 그래서 느린 작업이 request 서버를 소모하는 일을 줄입니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.Mermaid
          title={l.trans({ en: "Before batch child", ko: "Batch child 이전" })}
          chart={`flowchart LR
  user["User Request"] --> federation["Federation Child"]
  federation --> queue["Queue Job"]`}
        />
        <Docs.Mermaid
          title={l.trans({ en: "After batch child", ko: "Batch child 이후" })}
          chart={`flowchart LR
  batch["Batch Child"] --> work["Run Heavy Work"]
  work --> status["Update Job Status"]
  status --> userView["User Sees Progress"]`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Always store job status: `waiting`, `running`, `done`, `failed`.",
                ko: "항상 job 상태를 저장하세요. `waiting`, `running`, `done`, `failed`처럼요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Make jobs idempotent. Retrying the same job should not corrupt data.",
                ko: "Job은 idempotent하게 만드세요. 같은 job을 다시 실행해도 데이터가 깨지면 안 됩니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Save progress when the user needs feedback.",
                ko: "사용자에게 진행 상황을 보여줘야 한다면 progress를 저장하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Return quickly from endpoint. Do the slow work in process.",
                ko: "Endpoint는 빠르게 반환하고, 느린 작업은 process에서 하세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
