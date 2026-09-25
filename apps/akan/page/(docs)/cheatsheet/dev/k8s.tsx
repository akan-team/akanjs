import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Kubernetes", ko: "Kubernetes" })}>
        <Docs.Title>{l.trans({ en: "Kubernetes", ko: "Kubernetes" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan Kubernetes deployment is built around one app container, a Service, an Ingress, and persistent storage for sqlite data.",
              ko: "Akan Kubernetes 배포는 하나의 app 컨테이너, Service, Ingress, sqlite 데이터를 위한 persistent storage를 중심으로 구성됩니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>{l.trans({ en: "Deployment runs the app image.", ko: "Deployment는 app image를 실행합니다." })}</li>
            <li>
              {l.trans({
                en: "Service exposes the app inside the cluster.",
                ko: "Service는 cluster 내부에서 app을 노출합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Ingress connects domains to the Service.",
                ko: "Ingress는 domain을 Service에 연결합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "PVC keeps sqlite data across pod restarts.",
                ko: "PVC는 pod 재시작 후에도 sqlite 데이터를 유지합니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="architecture" title={l.trans({ en: "Architecture", ko: "구조" })}>
        <Docs.Title>{l.trans({ en: "Architecture", ko: "구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Think of the chart as four connected pieces. Users enter through Ingress, the Service routes traffic to the Pod, and the Pod stores local data through a PVC.",
              ko: "Chart를 네 조각으로 이해하면 쉽습니다. 사용자는 Ingress로 들어오고, Service가 Pod로 트래픽을 보내며, Pod는 PVC를 통해 local data를 저장합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Mental model", ko: "이해 모델" })}
          code={`Domain
  -> Ingress
  -> Service:8282
  -> Deployment Pod
  -> PVC /workspace/sqlite`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="console" title={l.trans({ en: "Open Console", ko: "Console 열기" })}>
        <Docs.Title>{l.trans({ en: "Open Console", ko: "Console 열기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `kubectl exec` to run the generated `console.js` already embedded in the built app image.",
              ko: "`kubectl exec`로 build된 app image 안에 이미 포함된 generated `console.js`를 실행합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The console starts a separate no-listen server process in the same pod; it does not attach to the running `main.js` memory.",
              ko: "Console은 같은 pod 안에서 별도의 no-listen server process를 시작합니다. 실행 중인 `main.js` memory에 attach하지는 않습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Pod exec", ko: "Pod exec" })}
          language="bash"
          code="kubectl exec -it -n prod pod/myapp-xxxxx -c myapp -- sh -lc 'AKAN_CONSOLE=1 bun console.js'"
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="values" title={l.trans({ en: "Values", ko: "Values" })}>
        <Docs.Title>{l.trans({ en: "Values", ko: "Values" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use values to tune each environment. Debug can stay small, while main usually gets more CPU, memory, storage, and replicas.",
              ko: "Values로 환경별 설정을 조절합니다. Debug는 작게 시작하고, main은 보통 더 많은 CPU, memory, storage, replica를 받습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="values.yaml"
          language="yaml"
          code={`appName: myapp
subRoutes: [admin]

main:
  domains:
    - myapp.example.com
  app:
    replica: "2,1,0"
    resources:
      requests:
        memory: 1G
        cpu: "1"
      limits:
        memory: 4G
        cpu: "4"
      storage: 5Gi`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="scale" title={l.trans({ en: "Scale", ko: "확장" })}>
        <Docs.Title>{l.trans({ en: "Scale", ko: "확장" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`app.replica` becomes `AKAN_REPLICA` inside the pod. Use it with CPU and memory values to scale work safely.",
              ko: "`app.replica`는 pod 안에서 `AKAN_REPLICA`가 됩니다. CPU, memory 값과 함께 사용해 작업을 안전하게 확장하세요.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "`1,0,0`: small service with one request child.",
                ko: "`1,0,0`: request child 하나인 작은 서비스.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`2,1,0`: more request capacity plus one batch worker.",
                ko: "`2,1,0`: request 처리량을 늘리고 batch worker 하나 추가.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`0,0,1`: one all-purpose child for simple environments.",
                ko: "`0,0,1`: 단순 환경을 위한 all-purpose child 하나.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Start with conservative requests and watch metrics before raising limits.",
                ko: "처음에는 보수적인 requests로 시작하고 metrics를 본 뒤 limits를 올리세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Resize sqlite storage before it becomes urgent.",
                ko: "sqlite storage는 급해지기 전에 여유 있게 늘리세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Keep domain and subRoute values explicit so Ingress rules stay predictable.",
                ko: "Ingress rule을 예측 가능하게 유지하려면 domain과 subRoute 값을 명확히 적으세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
