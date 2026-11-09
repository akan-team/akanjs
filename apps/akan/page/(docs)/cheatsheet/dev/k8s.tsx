import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "Development: 쿠버네티스 | Akan.js" : "Development: Kubernetes | Akan.js";
    const description =
      lang === "ko"
        ? "함께 제공되는 Helm 차트로 이미지를 배포하고, 값을 정하고, 확장합니다."
        : "Deploy the image with the shipped Helm chart, set its values and scale it.";
    return (
      <>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
      </>
    );
  })
  .render(() => {
    const { l } = usePage();

    const resourceRows = [
      {
        kind: "Deployment",
        name: "app-deployment",
        desc: l.trans({
          en: "Runs the app image in exactly one pod.",
          ko: "앱 이미지를 pod 하나로 실행합니다.",
        }),
      },
      {
        kind: "Service",
        name: "app-svc",
        desc: l.trans({
          en: "Exposes the app on port 8282 inside the cluster.",
          ko: "클러스터 안에서 8282 포트로 앱을 노출합니다.",
        }),
      },
      {
        kind: "Ingress",
        name: "app-ingress",
        desc: l.trans({
          en: "Connects your domains to the Service and gets their TLS certificate.",
          ko: "도메인을 Service에 연결하고 TLS 인증서를 발급받습니다.",
        }),
      },
      {
        kind: "PersistentVolumeClaim",
        name: "sqlite-data",
        desc: l.trans({
          en: "Keeps the sqlite data in `/workspace/sqlite` across pod restarts.",
          ko: "pod가 재시작돼도 `/workspace/sqlite`의 sqlite 데이터를 유지합니다.",
        }),
      },
    ];

    const valueFileRows = [
      {
        order: "1",
        file: "_common-values.yaml",
        desc: l.trans({
          en: "Defaults for the `debug`, `develop` and `main` branches: replica, resources, storage.",
          ko: "`debug`, `develop`, `main` 브랜치별 replica, 리소스, 스토리지 기본값입니다.",
        }),
      },
      {
        order: "2",
        file: "_common-secret.yaml",
        desc: l.trans({
          en: "Values every app shares: `repoName`, `serveDomain`, `image.registry`.",
          ko: "모든 앱이 함께 쓰는 `repoName`, `serveDomain`, `image.registry` 값입니다.",
        }),
      },
      {
        order: "3",
        file: "<appName>-values.yaml",
        desc: l.trans({
          en: "The app's own values: `appName`, `subRoutes`, domains, and any override.",
          ko: "앱 자신의 `appName`, `subRoutes`, 도메인, 덮어쓸 값입니다.",
        }),
      },
      {
        order: "4",
        file: "<appName>-secret.yaml",
        desc: l.trans({
          en: "The app's own secret values, and it may be empty.",
          ko: "앱 전용 비밀값이며 비어 있어도 됩니다.",
        }),
      },
    ];

    const topLevelKeys = [
      {
        key: "appName",
        type: "string",
        desc: l.trans({
          en: "Names the namespace `<appName>-<branch>`, the image path and the default host.",
          ko: "네임스페이스 `<appName>-<branch>`, 이미지 경로, 기본 호스트 이름에 쓰입니다.",
        }),
      },
      {
        key: "repoName",
        type: "string",
        tags: ["_common-secret.yaml"],
        desc: l.trans({
          en: "The workspace part of the image path `<registry>/<repoName>/<appName>`.",
          ko: "이미지 경로 `<registry>/<repoName>/<appName>`의 workspace 부분입니다.",
        }),
      },
      {
        key: "serveDomain",
        type: "string",
        tags: ["_common-secret.yaml"],
        desc: l.trans({
          en: "The base domain, so the default host is `<appName>-<branch>.<serveDomain>`.",
          ko: "기준 도메인이며, 기본 호스트는 `<appName>-<branch>.<serveDomain>`입니다.",
        }),
      },
      {
        key: "subRoutes",
        type: "string[]",
        default: "[]",
        desc: l.trans({
          en: "Adds one `<subRoute>-<branch>.<serveDomain>` host and TLS name per basePath.",
          ko: "basePath마다 `<subRoute>-<branch>.<serveDomain>` 호스트와 TLS 이름을 하나씩 더합니다.",
        }),
      },
      {
        key: "image.registry",
        type: "string",
        tags: ["_common-secret.yaml"],
        desc: l.trans({
          en: "The registry host.",
          ko: "이미지 레지스트리 호스트입니다.",
        }),
      },
      {
        key: "image.tag",
        type: "string",
        default: "<branch>-live",
        desc: l.trans({
          en: "Write it only to pin one specific build.",
          ko: "특정 빌드에 고정할 때만 적습니다.",
        }),
      },
      {
        key: "readinessPath",
        type: "string",
        default: "/_akan/app/health",
        desc: l.trans({
          en: "The readiness probe's path. Set `/_akan/app/ready` once the image's akanjs serves it; an older image answers it 404.",
          ko: "readiness probe가 부르는 경로입니다. 이미지의 akanjs가 `/_akan/app/ready`를 제공하면 그 경로로 바꿉니다. 그보다 오래된 이미지는 404로 답합니다.",
        }),
      },
    ];

    const branchKeys = [
      {
        key: "<branch>.domains",
        type: "string[]",
        default: "[]",
        desc: l.trans({
          en: "Extra hosts and TLS names for that branch, such as a production domain.",
          ko: "운영 도메인처럼 그 브랜치에 더할 호스트와 TLS 이름입니다.",
        }),
      },
      {
        key: "<branch>.app.replica",
        type: "string",
        default: '"0,0,1"',
        desc: l.trans({
          en: "Becomes `AKAN_REPLICA` in the pod: process counts for federation, batch and all.",
          ko: "pod 안에서 `AKAN_REPLICA`, 즉 federation, batch, all 순서의 프로세스 수가 됩니다.",
        }),
      },
      {
        key: "<branch>.app.solo",
        type: "string",
        default: l.trans({ en: "unset", ko: "없음" }),
        desc: l.trans({
          en: "Becomes `AKAN_SOLO`; write `false` to keep a gateway in front of a single replica.",
          ko: "`AKAN_SOLO`가 되며, replica가 하나여도 gateway를 두려면 `false`를 적습니다.",
        }),
      },
      {
        key: "<branch>.app.resources.requests",
        type: "{ memory, cpu }",
        default: "250M / 0.05 (main: 1G / 1)",
        desc: l.trans({
          en: "The memory and CPU the pod requests.",
          ko: "pod가 요청하는 메모리와 CPU입니다.",
        }),
      },
      {
        key: "<branch>.app.resources.limits",
        type: "{ memory, cpu }",
        default: "1G / 0.5 (main: 4G / 4)",
        desc: l.trans({
          en: "The pod's limit; the CPU limit also sets how many images the optimizer encodes at once.",
          ko: "pod의 limit이며, CPU limit은 이미지 최적화가 한 번에 인코딩하는 수도 정합니다.",
        }),
      },
      {
        key: "<branch>.app.resources.storage",
        type: "string",
        default: "2Gi (main: 5Gi)",
        desc: l.trans({
          en: "The size of the `ReadWriteOnce` PVC mounted at `/workspace/sqlite`.",
          ko: "`/workspace/sqlite`에 마운트되는 `ReadWriteOnce` PVC의 크기입니다.",
        }),
      },
    ];

    const roleRows = [
      {
        name: "federation",
        desc: l.trans({
          en: 'Serves requests and skips services and internals pinned to `serverMode: "batch"`.',
          ko: '요청을 처리하고, `serverMode: "batch"`로 고정한 서비스와 internal은 건너뜁니다.',
        }),
      },
      {
        name: "batch",
        desc: l.trans({
          en: "Never listens, and runs scheduled and queued internals, including those pinned to `batch`.",
          ko: "요청은 받지 않고, `batch`로 고정한 것을 포함해 예약·큐 internal을 돌립니다.",
        }),
      },
      {
        name: "all",
        desc: l.trans({
          en: "Serves requests and runs every internal.",
          ko: "요청을 처리하고 모든 internal도 돌립니다.",
        }),
      },
    ];

    const replicaColumns = [
      { key: "request", label: l.trans({ en: "Requests", ko: "요청 처리" }) },
      { key: "batch", label: l.trans({ en: "batch internals", ko: "batch internal" }), caption: 'serverMode: "batch"' },
      { key: "gateway", label: "Gateway" },
    ];

    const replicaGroups = [
      {
        label: l.trans({ en: "One process, no gateway", ko: "프로세스 하나, gateway 없음" }),
        rows: [
          {
            name: "0,0,1",
            desc: l.trans({
              en: "The chart default: one all-purpose process.",
              ko: "chart 기본값으로, 무엇이든 하는 프로세스 하나입니다.",
            }),
            marks: { request: true, batch: true, gateway: false },
          },
          {
            name: "1,0,0",
            desc: l.trans({
              en: "One request process, so nothing pinned to batch runs.",
              ko: "요청 프로세스 하나라서 batch로 고정한 internal은 돌지 않습니다.",
            }),
            marks: { request: true, batch: false, gateway: false },
          },
        ],
      },
      {
        label: l.trans({ en: "Several processes behind a gateway", ko: "gateway 뒤의 여러 프로세스" }),
        rows: [
          {
            name: "2,1,0",
            desc: l.trans({
              en: "Two request processes and one batch worker.",
              ko: "요청 프로세스 두 개와 batch worker 하나입니다.",
            }),
            marks: { request: true, batch: true, gateway: true },
          },
        ],
      },
    ];

    const probeRows = [
      {
        probe: "startupProbe",
        period: "5s",
        timeout: "1s",
        failures: "24",
        desc: l.trans({
          en: "Waits up to 2 minutes for boot, since SSR loads its route artifacts before it listens.",
          ko: "SSR은 라우트 산출물을 불러온 뒤에야 요청을 받으므로 부팅을 최대 2분까지 기다립니다.",
        }),
      },
      {
        probe: "livenessProbe",
        period: "15s",
        timeout: "3s",
        failures: "3",
        desc: l.trans({
          en: "Restarts a stuck server after three misses in a row.",
          ko: "세 번 연속 실패하면 멈춘 서버를 재시작합니다.",
        }),
      },
      {
        probe: "readinessProbe",
        period: "10s",
        timeout: "3s",
        failures: "2",
        desc: l.trans({
          en: "Takes the pod out of the Service after two misses in a row.",
          ko: "두 번 연속 실패하면 pod를 Service에서 뺍니다.",
        }),
      },
    ];

    const relatedLinks = [
      {
        href: "/cheatsheet/dev/docker#replica",
        title: l.trans({ en: "AKAN_REPLICA In Depth", ko: "AKAN_REPLICA 자세히" }),
        desc: l.trans({
          en: "Every slot and value, and when a gateway appears.",
          ko: "자리별 의미와 값, gateway가 생기는 조건을 정리했습니다.",
        }),
      },
      {
        href: "/cheatsheet/dev/console#container",
        title: l.trans({ en: "Container Console", ko: "컨테이너 console" }),
        desc: l.trans({
          en: "What the console offers, its lifecycle, and its safety rules.",
          ko: "console에서 쓸 수 있는 것, 수명 주기, 안전 규칙을 다룹니다.",
        }),
      },
      {
        href: "/cheatsheet/observability/metrics#overview",
        title: l.trans({ en: "Health And Metrics", ko: "상태와 메트릭" }),
        desc: l.trans({
          en: "Read the numbers before you raise requests and limits.",
          ko: "request와 limit을 올리기 전에 수치를 확인합니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="overview" title={l.trans({ en: "Kubernetes", ko: "Kubernetes" })}>
          <Docs.Title>{l.trans({ en: "Kubernetes", ko: "Kubernetes" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Every Akan app deploys with the same Helm chart, <code>infra/app</code>. It creates four resources
                    in the namespace <code>{"<appName>-<branch>"}</code>:
                  </span>
                ),
                ko: (
                  <span>
                    Akan 앱은 모두 같은 Helm chart인 <code>infra/app</code>으로 배포합니다. chart는{" "}
                    <code>{"<appName>-<branch>"}</code> 네임스페이스에 리소스 네 개를 만듭니다.
                  </span>
                ),
              })}
            </div>
            <Docs.Table
              columns={[
                { key: "kind", label: l.trans({ en: "Resource", ko: "리소스" }), code: true },
                { key: "name", label: l.trans({ en: "Name", ko: "이름" }), code: true },
                { key: "desc", label: l.trans({ en: "What it does", ko: "하는 일" }) },
              ]}
              rows={resourceRows}
            />

            <Docs.SubSubTitle>
              {l.trans({ en: "The namespace picks the branch", ko: "브랜치는 네임스페이스가 정합니다" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "You never write the branch as a value. The chart reads it from the release namespace:",
                ko: "branch는 값으로 적지 않습니다. chart가 release 네임스페이스에서 읽어 옵니다.",
              })}
            </div>
            <ol className="my-4 list-decimal space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      You deploy into <code>{"<appName>-<branch>"}</code>, for example <code>myapp-main</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>{"<appName>-<branch>"}</code> 네임스페이스에 배포합니다. 예를 들면 <code>myapp-main</code>
                      입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      The chart splits the name on <code>-</code> and takes the second part, <code>main</code>, as the
                      branch.
                    </span>
                  ),
                  ko: (
                    <span>
                      chart가 이름을 <code>-</code>로 나눠 두 번째 조각인 <code>main</code>을 branch로 씁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      It reads the <code>main:</code> block of the values and passes <code>AKAN_PUBLIC_ENV=main</code>{" "}
                      to the pod.
                    </span>
                  ),
                  ko: (
                    <span>
                      values의 <code>main:</code> 블록을 읽고, pod에 <code>AKAN_PUBLIC_ENV=main</code>을 넘깁니다.
                    </span>
                  ),
                })}
              </li>
            </ol>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>A wrong namespace silently picks the wrong values block.</strong> Deploy to{" "}
                    <code>myapp-develop</code> and the pod runs with the <code>develop</code> settings. For the same
                    reason, <code>appName</code> must not contain a <code>-</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>네임스페이스를 잘못 적으면 조용히 다른 values 블록이 선택됩니다.</strong>{" "}
                    <code>myapp-develop</code>에 배포하면 pod는 <code>develop</code> 설정으로 뜹니다. 같은 이유로{" "}
                    <code>appName</code>에는 <code>-</code>를 넣으면 안 됩니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="architecture" title={l.trans({ en: "Architecture", ko: "구조" })}>
          <Docs.Title>{l.trans({ en: "Architecture", ko: "구조" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A request enters through the Ingress, and the Service passes it to the pod, which keeps its data on the PVC. Alongside, the kubelet checks the pod's health.",
                ko: "요청은 Ingress로 들어와 Service를 거쳐 pod에 닿고, pod는 데이터를 PVC에 저장합니다. 그 옆에서 kubelet이 pod의 상태를 확인합니다.",
              })}
            </div>
            <Docs.Flow
              title={l.trans({ en: "Request path", ko: "요청 경로" })}
              direction="TB"
              nodes={{
                domain: {
                  label: l.trans({ en: "Domain", ko: "도메인" }),
                  lines: ["<appName>-<branch>.<serveDomain>"],
                },
                ingress: {
                  label: "Ingress",
                  lines: [
                    l.trans({
                      en: "TLS, one host per subRoute and domain",
                      ko: "TLS, subRoute·도메인마다 호스트 하나",
                    }),
                  ],
                },
                service: { label: "Service :8282" },
                pod: { label: "Pod", lines: ["replicas: 1"] },
                pvc: { label: "PVC", lines: ["/workspace/sqlite"], tone: "muted" },
                kubelet: { label: "kubelet", tone: "muted" },
              }}
              edges={[
                ["domain", "ingress"],
                ["ingress", "service"],
                ["service", "pod"],
                ["pod", "pvc"],
                ["kubelet", "pod", { label: "/_akan/app/health", dashed: true }],
              ]}
              emphasis={["pod"]}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Always one pod.</strong> <code>replicas: 1</code> is fixed in the template. To scale,
                      raise <code>AKAN_REPLICA</code> inside the pod instead of adding pods.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>pod는 언제나 하나입니다.</strong> <code>replicas: 1</code>은 template에 고정돼 있습니다.
                      확장하려면 pod를 늘리지 말고 pod 안의 <code>AKAN_REPLICA</code>를 올립니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Why only one.</strong> The sqlite PVC is <code>ReadWriteOnce</code>, so it attaches to one
                      node at a time and pods cannot spread across nodes.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>하나인 이유.</strong> sqlite PVC가 <code>ReadWriteOnce</code>라서 한 번에 노드 하나에만
                      붙습니다. 그래서 pod를 여러 노드에 나눠 띄울 수 없습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>One certificate for every host.</strong> The default host, each subRoute host and each
                      production domain share the TLS secret <code>{"cert-<appName>-<branch>"}</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>인증서는 하나입니다.</strong> 기본 호스트, subRoute 호스트, 운영 도메인이 모두 TLS secret{" "}
                      <code>{"cert-<appName>-<branch>"}</code> 하나를 함께 씁니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="values" title={l.trans({ en: "Values", ko: "Values" })}>
          <Docs.Title>{l.trans({ en: "Values", ko: "Values" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    There is no single <code>values.yaml</code>: Helm reads four files in order, and a later file
                    overrides an earlier one. An app's own file usually holds just its name and production domains.
                  </span>
                ),
                ko: (
                  <span>
                    <code>values.yaml</code> 하나로 끝나지 않습니다. Helm이 파일 네 개를 순서대로 읽고, 뒤의 파일이 앞의
                    값을 덮어씁니다. 그래서 앱 자신의 파일에는 보통 이름과 운영 도메인만 적습니다.
                  </span>
                ),
              })}
            </div>
            <Docs.Table
              columns={[
                { key: "order", label: "#", code: true },
                { key: "file", label: l.trans({ en: "File", ko: "파일" }), code: true },
                { key: "desc", label: l.trans({ en: "What it holds", ko: "담는 값" }) },
              ]}
              rows={valueFileRows}
            />
            <div>
              {l.trans({
                en: (
                  <span>
                    Both <code>*-secret.yaml</code> files stay out of git. <code>bun run downloadSecret</code> fetches
                    every file listed in <code>infra/master/jenkins/getSecrets.sh</code>, so add a new app's file there.
                  </span>
                ),
                ko: (
                  <span>
                    두 <code>*-secret.yaml</code> 파일은 git에 올리지 않습니다. <code>bun run downloadSecret</code>은{" "}
                    <code>infra/master/jenkins/getSecrets.sh</code>에 적힌 파일을 받아 오므로, 새 앱의 파일도 거기에
                    추가합니다.
                  </span>
                ),
              })}
            </div>

            <Docs.SubSubTitle>{l.trans({ en: "Deploy command", ko: "배포 명령" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    The Jenkins deploy stage runs these two commands from <code>infra/</code> for each app:
                  </span>
                ),
                ko: (
                  <span>
                    Jenkins 배포 단계는 앱마다 <code>infra/</code>에서 아래 두 명령을 실행합니다.
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="Terminal"
              language="bash"
              showLineNumbers={false}
              code={`helm upgrade app ./app/ -i --create-namespace -n myapp-main \\
  -f app/values/_common-values.yaml \\
  -f app/values/_common-secret.yaml \\
  -f app/values/myapp-values.yaml \\
  -f app/values/myapp-secret.yaml
kubectl rollout restart deployments/app-deployment -n myapp-main`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        The <code>-f</code> order is the priority.
                      </strong>{" "}
                      A later file overrides every key it repeats.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>-f</code> 순서가 곧 우선순위입니다.
                      </strong>{" "}
                      뒤에 오는 파일이 같은 키를 덮어씁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>-n</code> picks the branch.
                      </strong>{" "}
                      <code>myapp-main</code> selects the <code>main:</code> block.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>-n</code>이 branch를 정합니다.
                      </strong>{" "}
                      <code>myapp-main</code>이면 <code>main:</code> 블록을 씁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>rollout restart</code> brings in the new build.
                      </strong>{" "}
                      The restarted pod pulls the image again, so it runs the build just pushed.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>rollout restart</code>가 새 빌드를 반영합니다.
                      </strong>{" "}
                      재시작한 pod가 이미지를 다시 받아 오므로, 방금 올린 빌드로 뜹니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>{l.trans({ en: "An app's values file", ko: "앱 values 파일" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "A production app that needs more capacity than the defaults writes something like this:",
                ko: "기본값보다 용량이 더 필요한 운영 앱이라면 파일이 이 정도가 됩니다.",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="infra/app/values/myapp-values.yaml"
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
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Top-level keys apply to every branch.</strong> <code>appName</code> and{" "}
                      <code>subRoutes</code> sit at the root.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>최상위 키는 모든 브랜치에 적용됩니다.</strong> <code>appName</code>과{" "}
                      <code>subRoutes</code>는 맨 위에 적습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        A <code>main:</code> block only touches <code>main</code>.
                      </strong>{" "}
                      Keys you leave out keep the <code>_common-values.yaml</code> default, while a list such as{" "}
                      <code>domains</code> is replaced whole.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>main:</code> 블록은 <code>main</code>에만 적용됩니다.
                      </strong>{" "}
                      적지 않은 키는 <code>_common-values.yaml</code>의 기본값을 따르고, <code>domains</code> 같은
                      목록은 통째로 바뀝니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>{l.trans({ en: "Top-level keys", ko: "최상위 키" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    A key tagged <code>_common-secret.yaml</code> is set there once for every app.
                  </span>
                ),
                ko: (
                  <span>
                    <code>_common-secret.yaml</code> 표시가 붙은 키는 그 파일에 한 번만 적고 모든 앱이 함께 씁니다.
                  </span>
                ),
              })}
            </div>
            <Docs.OptionTable items={topLevelKeys} />

            <Docs.SubSubTitle>{l.trans({ en: "Per-branch keys", ko: "브랜치별 키" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    Written under a branch block such as <code>main:</code>. The defaults come from{" "}
                    <code>_common-values.yaml</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <code>main:</code> 같은 브랜치 블록 아래에 적습니다. 기본값은 <code>_common-values.yaml</code>에서
                    옵니다.
                  </span>
                ),
              })}
            </div>
            <Docs.OptionTable items={branchKeys} />
            <Docs.Alert type="info">
              {l.trans({
                en: (
                  <span>
                    <strong>Some settings are not values.</strong> Port 8282, <code>replicas: 1</code>, the 40-second
                    termination grace period and the probes, apart from <code>readinessPath</code>, are fixed in{" "}
                    <code>templates/app.yaml</code>. Changing them means editing the chart.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>values로 바꿀 수 없는 설정도 있습니다.</strong> 8282 포트, <code>replicas: 1</code>, 40초
                    종료 유예, <code>readinessPath</code>를 뺀 probe 설정은 <code>templates/app.yaml</code>에 고정돼
                    있습니다. 바꾸려면 chart를 직접 고쳐야 합니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="scale" title={l.trans({ en: "Scale", ko: "확장" })}>
          <Docs.Title>{l.trans({ en: "Scale", ko: "확장" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>{"<branch>.app.replica"}</code> becomes <code>AKAN_REPLICA</code> in the pod: three process
                    counts, one per role. Raise it together with the CPU and memory limits.
                  </span>
                ),
                ko: (
                  <span>
                    <code>{"<branch>.app.replica"}</code>는 pod 안에서 <code>AKAN_REPLICA</code>가 됩니다. 역할별
                    프로세스 수 세 개이며, CPU·메모리 limit과 함께 올립니다.
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Role", ko: "역할" })} items={roleRows} />

            <Docs.SubSubTitle>{l.trans({ en: "Common values", ko: "자주 쓰는 값" })}</Docs.SubSubTitle>
            <Docs.Matrix
              type="AKAN_REPLICA"
              columns={replicaColumns}
              groups={replicaGroups}
              markLabel={l.trans({ en: "Yes", ko: "함" })}
              emptyLabel={l.trans({ en: "No", ko: "안 함" })}
            />

            <Docs.SubSubTitle>{l.trans({ en: "Health probes", ko: "상태 확인 probe" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    With a single process there is no gateway to restart it, so the kubelet does. The startup and
                    liveness probes call <code>/_akan/app/health</code>, which answers 200 while the process is up. The
                    readiness probe calls <code>readinessPath</code>; <code>/_akan/app/ready</code> answers 503 while
                    the pod cannot serve: no replica is ready, or a solo server's page renderer is not.
                  </span>
                ),
                ko: (
                  <span>
                    프로세스가 하나면 재시작해 줄 gateway가 없어서 kubelet이 그 일을 맡습니다. startup probe와 liveness
                    probe는 <code>/_akan/app/health</code>를 부르며, 이 경로는 프로세스가 떠 있는 동안 200으로 답합니다.
                    readiness probe는 <code>readinessPath</code>를 부릅니다. <code>/_akan/app/ready</code>는 pod가
                    요청을 처리할 수 없는 동안, 곧 준비된 replica가 없거나 solo 서버의 페이지 렌더러가 준비되지 않았을
                    때 503으로 답합니다.
                  </span>
                ),
              })}
            </div>
            <Docs.Table
              columns={[
                { key: "probe", label: "Probe", code: true },
                { key: "period", label: l.trans({ en: "Period", ko: "주기" }), code: true },
                { key: "timeout", label: l.trans({ en: "Timeout", ko: "타임아웃" }), code: true },
                { key: "failures", label: l.trans({ en: "Failures", ko: "실패 한도" }), code: true },
                { key: "desc", label: l.trans({ en: "What it does", ko: "하는 일" }) },
              ]}
              rows={probeRows}
              stacked
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A 40-second grace period.</strong> On shutdown the server drains for up to 30 seconds (
                      <code>AKAN_SHUTDOWN_TIMEOUT_MS</code>). The extra 10 seconds keep SIGKILL from landing the moment
                      that drain ends.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>종료 유예는 40초입니다.</strong> 서버는 종료할 때 최대 30초 동안 하던 일을 마무리합니다(
                      <code>AKAN_SHUTDOWN_TIMEOUT_MS</code>). 10초의 여유 덕분에 마무리가 끝나는 순간 SIGKILL이 떨어지지
                      않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A gateway restarts its own children.</strong> With several processes, such as{" "}
                      <code>2,1,0</code>, the gateway restarts a crashed one, and the probes still watch the pod.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>gateway가 있으면 자식 프로세스는 gateway가 재시작합니다.</strong> <code>2,1,0</code>처럼
                      프로세스가 여럿이면 죽은 프로세스를 gateway가 다시 띄우고, probe는 그대로 pod를 지켜봅니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="console" title={l.trans({ en: "Open Console", ko: "콘솔 열기" })}>
          <Docs.Title>{l.trans({ en: "Open Console", ko: "콘솔 열기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    The built image already contains <code>console.js</code>. Open it inside the running pod with{" "}
                    <code>kubectl exec</code>:
                  </span>
                ),
                ko: (
                  <span>
                    빌드한 이미지에는 <code>console.js</code>가 이미 들어 있습니다. 실행 중인 pod 안에서{" "}
                    <code>kubectl exec</code>로 엽니다.
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="Terminal"
              language="bash"
              showLineNumbers={false}
              code={`kubectl exec -it -n myapp-main deploy/app-deployment -c app -- \\
  sh -lc 'AKAN_CONSOLE=1 bun console.js'`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Namespace and container.</strong> <code>-n</code> is <code>{"<appName>-<branch>"}</code>,
                      and the container is always named <code>app</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>네임스페이스와 컨테이너.</strong> <code>-n</code>에는 <code>{"<appName>-<branch>"}</code>
                      를 적고, 컨테이너 이름은 언제나 <code>app</code>입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>AKAN_CONSOLE=1</code> goes on this command only.
                      </strong>{" "}
                      The image runs in production mode on every branch, so the console refuses to open without it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>AKAN_CONSOLE=1</code>은 이 명령에만 붙입니다.
                      </strong>{" "}
                      이미지는 브랜치와 상관없이 운영 모드로 돌기 때문에, 이 값이 없으면 console이 열리지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>It is a separate process.</strong> The console starts its own server process in the pod
                      that does not listen and runs no internal jobs or queue workers. It does not attach to the memory
                      of the running <code>main.js</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>별도 프로세스입니다.</strong> console은 pod 안에서 요청을 받지 않고 internal 작업과 큐
                      worker도 돌리지 않는 서버 프로세스를 따로 띄웁니다. 실행 중인 <code>main.js</code>의 메모리에 붙는
                      것이 아닙니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The running server's logs still reach it.</strong> <code>.tail</code> and{" "}
                      <code>.trace</code> read them through the control socket in the runtime directory.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>실행 중인 서버의 로그는 볼 수 있습니다.</strong> <code>.tail</code>과 <code>.trace</code>
                      가 runtime 디렉터리의 제어 소켓을 통해 가져옵니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
          <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
          <Docs.Description>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Start with small requests.</strong> Watch the metrics first, then raise the limits.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>request는 작게 시작합니다.</strong> 메트릭을 확인한 뒤에 limit을 올립니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Grow storage early.</strong> Resize the sqlite PVC before it becomes urgent.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>스토리지는 미리 늘립니다.</strong> sqlite PVC는 급해지기 전에 여유 있게 키웁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Write every host out.</strong> Explicit <code>subRoutes</code> and <code>domains</code>{" "}
                      keep the Ingress rules predictable; keep them in step with <code>routes</code> in{" "}
                      <code>akan.config.ts</code>. The chart only opens a host, and the app decides which basePath
                      answers it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>호스트는 빠짐없이 적습니다.</strong> <code>subRoutes</code>와 <code>domains</code>를
                      명시하고 <code>akan.config.ts</code>의 <code>routes</code>와 맞춰 두면 Ingress 규칙을 예측할 수
                      있습니다. chart는 호스트를 열어 줄 뿐이고, 어느 basePath가 응답할지는 앱이 정합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        After a manual <code>helm upgrade</code>, restart the rollout.
                      </strong>{" "}
                      The default tag <code>{"<branch>-live"}</code> keeps its name for every build, so the Deployment
                      does not change and the pod keeps the old build until <code>kubectl rollout restart</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>helm upgrade</code>를 직접 돌렸다면 rollout을 재시작합니다.
                      </strong>{" "}
                      기본 태그 <code>{"<branch>-live"}</code>는 빌드가 바뀌어도 이름이 같아서 Deployment가 바뀌지
                      않습니다. <code>kubectl rollout restart</code> 전까지 pod는 이전 빌드로 돕니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>{l.trans({ en: "Related pages", ko: "함께 보기" })}</Docs.SubSubTitle>
            <Docs.LinkGrid items={relatedLinks} />
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
