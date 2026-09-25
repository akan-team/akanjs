import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsList, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Docker", ko: "Docker" })}>
        <Docs.Title>{l.trans({ en: "Docker", ko: "Docker" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "For a small edge server, start with one Akan app container.",
              ko: "작은 edge server에서는 Akan app 컨테이너 하나로 시작하세요.",
            })}
          </div>
          <DocsList>
            <li>
              {l.trans({
                en: "Expose the app on port 8282. Route to service port 80.",
                ko: "App은 8282 포트로 노출합니다. 서비스 포트 80으로 라우팅합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Mount sqlite data so local data survives container restarts.",
                ko: "컨테이너가 재시작되어도 local data가 남도록 sqlite 데이터를 mount합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Mount logs so troubleshooting does not depend on container lifetime.",
                ko: "컨테이너 수명과 상관없이 문제를 볼 수 있도록 log를 mount합니다.",
              })}
            </li>
          </DocsList>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="compose" title={l.trans({ en: "Minimal Compose", ko: "최소 compose" })}>
        <Docs.Title>{l.trans({ en: "Minimal Compose", ko: "최소 compose" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "This is a simplified example for one app. Replace `myapp` and the image name with your app.",
              ko: "아래는 app 하나를 위한 단순화된 예시입니다. `myapp`과 image 이름을 자신의 app에 맞게 바꾸세요.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="docker-compose.yaml"
          code={`version: "3.8"

services:
  myapp:
    image: registry.mydomain.com/myorg/myapp:latest
    container_name: myapp
    restart: unless-stopped
    ports:
      - "8282:80"
    environment:
      AKAN_REPLICA: "1,0,0"
      AKAN_PUBLIC_APP_NAME: myapp
      AKAN_PUBLIC_ENV: main
      AKAN_PUBLIC_OPERATION_MODE: edge
      AKAN_PUBLIC_SERVE_DOMAIN: example.com
      AKAN_SQLITE_DIR: /workspace/sqlite
      AKAN_LOG_DIR: /workspace/logs
    volumes:
      - ./sqlite:/workspace/sqlite
      - ./logs:/workspace/logs`}
        />
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="console" title={l.trans({ en: "Open Console", ko: "Console 열기" })}>
        <Docs.Title>{l.trans({ en: "Open Console", ko: "Console 열기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`akan build` embeds `console.js` next to `main.js`, so you can open an operator console without creating files inside the container.",
              ko: "`akan build`는 `main.js` 옆에 `console.js`를 포함하므로 container 안에 파일을 만들지 않고 operator console을 열 수 있습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Set `AKAN_CONSOLE=1` only on the exec command for production-like environments.",
              ko: "Production 계열 환경에서는 exec 명령에서만 `AKAN_CONSOLE=1`을 설정하세요.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title={l.trans({ en: "Docker exec", ko: "Docker exec" })}
          language="bash"
          code="docker exec -it myapp sh -lc 'AKAN_CONSOLE=1 bun console.js'"
        />
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="env" title={l.trans({ en: "Important Env", ko: "중요 env" })}>
        <Docs.Title>{l.trans({ en: "Important Env", ko: "중요 env" })}</Docs.Title>
        <Docs.Description>
          <DocsList>
            <li>
              {l.trans({
                en: "`AKAN_PUBLIC_OPERATION_MODE=edge`: tells the app it is running as an edge deployment.",
                ko: "`AKAN_PUBLIC_OPERATION_MODE=edge`: edge 배포로 실행 중임을 알려줍니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`AKAN_SQLITE_DIR`: keeps sqlite files in a mounted folder.",
                ko: "`AKAN_SQLITE_DIR`: sqlite 파일을 mount된 폴더에 저장합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`AKAN_LOG_DIR`: keeps runtime logs outside the container filesystem.",
                ko: "`AKAN_LOG_DIR`: runtime log를 컨테이너 파일시스템 밖에 저장합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`AKAN_REPLICA`: controls child process roles for scaling.",
                ko: "`AKAN_REPLICA`: 확장을 위한 child process 역할을 조절합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`AKAN_SSR=false`: serves the API only. Drops the RSC worker process every web-serving replica otherwise spawns.",
                ko: "`AKAN_SSR=false`: API만 서비스합니다. 웹을 서비스하는 replica마다 뜨던 RSC worker process가 사라집니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`AKAN_CSR=false`: keeps SSR but stops serving the mobile SPA bundle at `/__csr` and `?csr=true`.",
                ko: "`AKAN_CSR=false`: SSR은 유지하고 `/__csr`, `?csr=true`로 서비스하던 모바일 SPA bundle만 내립니다.",
              })}
            </li>
          </DocsList>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="web-surface" title={l.trans({ en: "Trim The Web Surface", ko: "웹 surface 줄이기" })}>
        <Docs.Title>{l.trans({ en: "Trim The Web Surface", ko: "웹 surface 줄이기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A deployment that only answers API calls does not need the web half at all. `AKAN_SSR=false` takes down the RSC worker and the render routes; `AKAN_CSR=false` takes down only the mobile SPA bundle. Both narrow what the build produced and can never widen it, and the boot log names what the process ended up serving.",
              ko: "API만 응답하는 배포에는 웹 절반이 필요 없습니다. `AKAN_SSR=false`는 RSC worker와 렌더 라우트를 내리고, `AKAN_CSR=false`는 모바일 SPA bundle만 내립니다. 둘 다 빌드가 만든 범위를 좁히기만 하고 넓히지는 못하며, 부팅 로그가 이 프로세스가 실제로 무엇을 서비스하는지 남깁니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Declare it in akan.config.ts as `web: false` to also keep the artifacts out of the image: no route artifact, no CSR bundle, no RSC worker entrypoint, and no public/ folder. Measured on this docs app, that is 86MB down to 6.2MB.",
              ko: "akan.config.ts에 `web: false`로 선언하면 산출물 자체가 이미지에서 빠집니다. 라우트 산출물, CSR bundle, RSC worker entrypoint, public/ 폴더가 모두 들어가지 않습니다. 이 문서 앱 기준 86MB에서 6.2MB로 줄었습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title={l.trans({ en: "API-only container", ko: "API 전용 컨테이너" })}
          code={`docker run -e AKAN_SSR=false -e AKAN_REPLICA="1,0,0" -p 8282:8282 myapp`}
        />
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="replica" title={l.trans({ en: "Scale With AKAN_REPLICA", ko: "AKAN_REPLICA로 확장" })}>
        <Docs.Title>{l.trans({ en: "Scale With AKAN_REPLICA", ko: "AKAN_REPLICA로 확장" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`AKAN_REPLICA` is a compact way to choose how many federation, batch, and all-purpose child processes the app starts.",
              ko: "`AKAN_REPLICA`는 app이 시작할 federation, batch, all-purpose child process 수를 정하는 간단한 방법입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title={l.trans({ en: "Replica examples", ko: "Replica 예시" })}
          code={`AKAN_REPLICA="1,0,0"  # one request-serving process, no gateway
AKAN_REPLICA="0,0,1"  # one all-purpose process, no gateway
AKAN_REPLICA="2,1,0"  # two request children and one batch child, behind a gateway`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "A single request-serving replica runs in the container's only process — there is nothing to balance, so the app skips the gateway and its proxy hop. Ask for two or more and the gateway comes back to spawn and route them. Set AKAN_SOLO=false to keep the gateway with one replica.",
              ko: "요청을 처리하는 replica가 하나면 컨테이너의 유일한 프로세스에서 실행됩니다. 분산할 대상이 없으므로 gateway와 프록시 홉을 건너뜁니다. 둘 이상을 요청하면 gateway가 다시 child를 spawn하고 라우팅합니다. replica가 하나여도 gateway를 쓰려면 AKAN_SOLO=false를 설정하세요.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <DocsList>
            <li>
              {l.trans({
                en: "Keep the first compose file boring. Add extra services only when the app really needs them.",
                ko: "처음 compose는 단순하게 유지하세요. 앱이 정말 필요할 때만 추가 서비스를 붙입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Back up the sqlite volume before replacing edge hardware.",
                ko: "Edge 장비를 교체하기 전 sqlite volume을 백업하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Check logs from the mounted folder when the container restarts repeatedly.",
                ko: "컨테이너가 반복 재시작되면 mount된 log 폴더를 확인하세요.",
              })}
            </li>
          </DocsList>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
}
