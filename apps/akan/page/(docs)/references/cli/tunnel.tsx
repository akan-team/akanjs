import { usePage } from "@apps/akan/client";
import {
  type CommandReferenceItem,
  CommandReferenceSlide,
  cardGridRecipe,
  Divider,
  Docs,
  DocsToc,
  panelRecipe,
} from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "CLI 레퍼런스: 터널 CLI | Akan.js" : "CLI Reference: Tunnel CLI | Akan.js";
    const description =
      lang === "ko"
        ? "실행 중인 앱을 공개 URL로 공유하거나, 직접 열 수 없는 앱에 접속합니다."
        : "Share a running app on a public URL, or reach one you cannot open directly.";
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

    const useCases = [
      {
        title: l.trans({ en: "Check on a Phone", ko: "휴대폰으로 바로 확인" }),
        desc: l.trans({
          en: "A designer opens the screen you just built on their own phone, right now.",
          ko: "디자이너가 방금 만든 화면을 지금 자기 휴대폰으로 열어 봅니다.",
        }),
      },
      {
        title: l.trans({ en: "Receive a Webhook", ko: "외부 webhook 받기" }),
        desc: l.trans({
          en: "A payment provider's webhook reaches the handler you are still editing.",
          ko: "결제사 webhook이 아직 고치고 있는 핸들러까지 곧바로 도착합니다.",
        }),
      },
    ];

    const terms = [
      {
        name: l.trans({ en: "share", ko: "공유" }),
        desc: l.trans({
          en: "One local app connected to a public URL. It has a code, a URL and an expiry.",
          ko: "로컬 앱 하나를 공개 URL에 연결한 것입니다. 코드, URL, 만료 시각을 가집니다.",
        }),
      },
      {
        name: l.trans({ en: "code", ko: "코드" }),
        desc: l.trans({
          en: "The short name of a share. `--stop` takes it.",
          ko: "공유마다 붙는 짧은 이름입니다. `--stop`에 넘깁니다.",
        }),
      },
      {
        name: "Akan Cloud",
        desc: l.trans({
          en: "The server that issues public hostnames and tracks shares. `akan login` signs in to it.",
          ko: "공개 주소를 발급하고 공유 목록을 관리하는 서버입니다. `akan login`으로 로그인하는 곳입니다.",
        }),
      },
      {
        name: "TTL",
        desc: l.trans({
          en: "How long a share lives before it expires on its own.",
          ko: "공유가 저절로 만료되기까지의 시간입니다.",
        }),
      },
    ];

    const commands: CommandReferenceItem[] = [
      {
        name: "tunnel",
        signature:
          "akan tunnel [app] [--list <boolean>] [--stop <code>] [--host <url>] [--port <number>] [--ttl <min>]",
        desc: l.trans({
          en: "Share an app running on this machine on a public URL.\nThe connection runs inside this command, so nothing needs installing before the URL appears.\nThe share lives as long as the command does: Ctrl-C ends it and hands the address back.",
          ko: "이 컴퓨터에서 실행 중인 앱을 공개 URL로 공유합니다.\n연결은 이 명령 프로세스 안에서 돌기 때문에, URL을 받기 전에 따로 설치할 프로그램이 없습니다.\n명령이 떠 있는 동안만 공유가 유지되고, Ctrl-C로 끝내면 주소를 반납합니다.",
        }),
        args: [
          {
            name: "app",
            type: "String",
            required: "no",
            defaultValue: "-",
            desc: l.trans({
              en: "App to share. Taken as is when there is only one app, and picked from a list when there are several.",
              ko: "공유할 앱입니다. 앱이 하나뿐이면 그 앱을 쓰고, 여럿이면 목록에서 고릅니다.",
            }),
          },
        ],
        options: [
          {
            name: "--list",
            type: "Boolean",
            defaultValue: "false",
            enumOrFlag: "-",
            desc: l.trans({
              en: "List this account's shares with connection state, code, URL, app name and expiry, then exit.",
              ko: "이 계정의 공유를 연결 상태, 코드, URL, 앱 이름, 만료 시각과 함께 보여 주고 끝냅니다.",
            }),
          },
          {
            name: "--stop",
            type: "String",
            defaultValue: '""',
            enumOrFlag: "-",
            desc: l.trans({
              en: "Revoke the share with this code, then exit.",
              ko: "이 코드의 공유를 회수하고 끝냅니다.",
            }),
          },
          {
            name: "--host",
            type: "String",
            defaultValue: "https://cloud.akanjs.com",
            enumOrFlag: "-",
            desc: l.trans({
              en: "Akan Cloud to use. In the framework repo (`USE_AKANJS_PKGS=true`) it is `http://localhost:8283`.",
              ko: "사용할 Akan Cloud 주소입니다. 프레임워크 저장소(`USE_AKANJS_PKGS=true`)에서는 `http://localhost:8283`입니다.",
            }),
          },
          {
            name: "--port",
            type: "Number",
            defaultValue: "-",
            enumOrFlag: "nullable",
            desc: l.trans({
              en: "Local port to share. Unset, it is the dev port `akan start` gives this app.",
              ko: "공유할 로컬 포트입니다. 비우면 `akan start`가 이 앱에 쓰는 개발 포트입니다.",
            }),
          },
          {
            name: "--ttl",
            type: "Number",
            defaultValue: "-",
            enumOrFlag: "nullable",
            desc: l.trans({
              en: "Minutes until the share expires on its own. Unset, Akan Cloud decides.",
              ko: "공유가 저절로 만료되기까지의 시간(분)입니다. 비우면 Akan Cloud가 정합니다.",
            }),
          },
        ],
        notes: [
          {
            name: "URL",
            desc: l.trans({
              en: "Printed with its expiry and an `akan tunnel --stop <code>` line, and copied to the clipboard.",
              ko: "만료 시각, `akan tunnel --stop <code>` 안내와 함께 출력되고 클립보드에 복사됩니다.",
            }),
          },
          {
            name: "Ctrl-C",
            desc: l.trans({
              en: "The first one hands the hostname back. A second exits at once, and the share expires on its TTL.",
              ko: "처음 누르면 주소를 반납합니다. 한 번 더 누르면 반납 없이 바로 끝나고, 공유는 TTL이 지나면 만료됩니다.",
            }),
          },
          {
            name: l.trans({ en: "reconnect", ko: "재연결" }),
            desc: l.trans({
              en: "A dropped link is reported and reconnected. The share stays open.",
              ko: "연결이 끊기면 알린 뒤 다시 연결합니다. 공유는 끝나지 않습니다.",
            }),
          },
          {
            name: l.trans({ en: "before the app", ko: "앱보다 먼저" }),
            desc: l.trans({
              en: "The share can open before the app listens. Requests are refused until the port opens.",
              ko: "앱이 뜨기 전에 공유를 열어도 됩니다. 포트가 열릴 때까지는 요청이 거절됩니다.",
            }),
          },
          {
            name: l.trans({ en: "account", ko: "계정" }),
            desc: l.trans({
              en: "A share belongs to the account `akan login` signed in to on that `--host`. `--list` shows them.",
              ko: "공유는 그 `--host`에 `akan login`으로 로그인한 계정의 것입니다. `--list`도 그 계정의 공유를 보여 줍니다.",
            }),
          },
          {
            name: "--list · --stop",
            desc: l.trans({
              en: "Neither asks for an app. They act on the account's shares.",
              ko: "둘 다 앱을 묻지 않습니다. 계정의 공유를 다룹니다.",
            }),
          },
          {
            name: l.trans({ en: "not a deployment", ko: "배포가 아님" }),
            desc: l.trans({
              en: "Requests reach the dev server as they are. No auth, cache or build step is added in front.",
              ko: "요청은 개발 서버로 그대로 전달됩니다. 앞에 인증, 캐시, 빌드 단계가 붙지 않습니다.",
            }),
          },
        ],
        examples: `akan tunnel
akan tunnel myapp
akan tunnel myapp --ttl 60
akan tunnel myapp --port 8080
akan tunnel --list
akan tunnel --stop abc123`,
      },
    ];

    const compareRows = [
      {
        aspect: l.trans({ en: "Shares", ko: "공유 대상" }),
        share: l.trans({ en: "Every app the session boots", ko: "세션이 띄우는 모든 앱" }),
        tunnel: l.trans({ en: "One app that is already running", ko: "이미 실행 중인 앱 하나" }),
      },
      {
        aspect: l.trans({ en: "Ends when", ko: "끝나는 때" }),
        share: l.trans({ en: "The dev session ends", ko: "개발 세션이 끝날 때" }),
        tunnel: l.trans({ en: "You stop the command", ko: "명령을 멈출 때" }),
      },
      {
        aspect: l.trans({ en: "Port", ko: "포트" }),
        share: l.trans({ en: "The app's dev port", ko: "앱의 개발 포트" }),
        tunnel: l.trans({ en: "The dev port, or any port with `--port`", ko: "개발 포트, 또는 `--port`로 준 포트" }),
      },
      {
        aspect: l.trans({ en: "Expiry", ko: "만료" }),
        share: l.trans({ en: "Akan Cloud's default", ko: "Akan Cloud 기본값" }),
        tunnel: l.trans({
          en: "`--ttl` minutes, or Akan Cloud's default",
          ko: "`--ttl`에 준 시간(분), 또는 Akan Cloud 기본값",
        }),
      },
      {
        aspect: "Akan Cloud",
        share: l.trans({ en: "The default address", ko: "기본 주소" }),
        tunnel: l.trans({
          en: "The default address, or the one given to `--host`",
          ko: "기본 주소, 또는 `--host`로 준 주소",
        }),
      },
      {
        aspect: l.trans({ en: "Finding the URL", ko: "URL 확인" }),
        share: l.trans({
          en: "Shown in the view's header and copied with `s`, or printed under `--plain`",
          ko: "전체 화면 뷰 헤더에 나오고 `s`로 복사하며, `--plain`이면 출력됩니다",
        }),
        tunnel: l.trans({ en: "Printed and copied to the clipboard", ko: "출력되고 클립보드에 복사됩니다" }),
      },
      {
        aspect: l.trans({ en: "If it fails", ko: "공유에 실패하면" }),
        share: l.trans({
          en: "The error is printed and the session starts anyway",
          ko: "오류를 출력하고 세션은 그대로 띄웁니다",
        }),
        tunnel: l.trans({ en: "The command exits with the error", ko: "오류와 함께 명령이 끝납니다" }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="tunnel-cli" title={l.trans({ en: "Tunnel CLI", ko: "터널 CLI" })}>
          <Docs.Title>{l.trans({ en: "Tunnel CLI", ko: "터널 CLI" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>akan tunnel</code> puts a public URL in front of the dev server on your laptop, for as long as
                    you need it. No deployment is involved.
                  </span>
                ),
                ko: (
                  <span>
                    <code>akan tunnel</code>은 노트북에서 돌고 있는 개발 서버에 필요한 동안만 공개 URL을 붙여 줍니다.
                    배포할 필요가 없습니다.
                  </span>
                ),
              })}
            </div>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              {useCases.map(({ title, desc }) => (
                <div key={title} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                  <div className="mb-1 font-semibold text-primary">{title}</div>
                  <div className="text-foreground/70 text-sm">{desc}</div>
                </div>
              ))}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    Usually you need this while running the app anyway, so <code>akan start --share</code> opens the
                    share with the session. <code>akan tunnel</code> is the standalone form: it shares an app that is
                    already running and does nothing else. See{" "}
                    <Link href="#share-or-tunnel" className="text-primary underline">
                      which one to use
                    </Link>
                    .
                  </span>
                ),
                ko: (
                  <span>
                    대개는 앱을 띄우는 김에 공유도 필요하므로 <code>akan start --share</code>로 세션과 함께 엽니다.{" "}
                    <code>akan tunnel</code>은 따로 쓰는 형태로, 이미 실행 중인 앱을 공유하는 일만 합니다.{" "}
                    <Link href="#share-or-tunnel" className="text-primary underline">
                      어느 쪽을 쓸지
                    </Link>
                    는 아래에 정리했습니다.
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>
              {l.trans({ en: "Words Used on This Page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={terms} />
          </Docs.Description>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Anyone with the URL reaches your whole dev server.</strong> That is every route under{" "}
                  <code>page/</code>, the API prefix, the websocket, and <code>/mcp</code> if the app mounts it, with
                  nothing in front. Give it a <code>--ttl</code>, stop it when the call ends, and never share a session
                  signed in to production data. The share leaves out devtools, Studio, source maps and the operator
                  routes.
                </span>
              ),
              ko: (
                <span>
                  <strong>URL을 아는 사람은 누구나 개발 서버 전체에 접근할 수 있습니다.</strong> <code>page/</code> 아래
                  모든 라우트, API 경로, 웹소켓, 앱이 마운트했다면 <code>/mcp</code>까지 아무 보호 없이 열립니다.{" "}
                  <code>--ttl</code>을 주고, 통화가 끝나면 바로 멈추고, 운영 데이터에 로그인된 세션은 절대 공유하지
                  마세요. 공유는 devtools, Studio, 소스 맵, 운영자 라우트를 내보내지 않습니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Scroll.Slide>
        <Divider />
        {commands.map((command) => (
          <CommandReferenceSlide key={command.name} command={command} />
        ))}
        <Divider />

        <Scroll.Slide id="share-or-tunnel" title={l.trans({ en: "Share Or Tunnel", ko: "--share와 tunnel 중 고르기" })}>
          <Docs.Title>{l.trans({ en: "Share Or Tunnel", ko: "--share와 tunnel 중 고르기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Both open the same kind of share on the same Akan Cloud. What differs is which process holds it, and so when it ends.",
                ko: "둘 다 같은 Akan Cloud에 같은 종류의 공유를 엽니다. 다른 점은 공유를 어느 프로세스가 쥐고 있느냐, 그래서 언제 끝나느냐입니다.",
              })}
            </div>
            <Docs.Table
              columns={[
                { key: "aspect", label: l.trans({ en: "Aspect", ko: "항목" }) },
                { key: "share", label: "akan start --share" },
                { key: "tunnel", label: "akan tunnel" },
              ]}
              rows={compareRows}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>s</code> in the full-screen view.
                      </strong>{" "}
                      It copies the selected app's public URL, or every app's from the <code>all apps</code> row.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        전체 화면 뷰의 <code>s</code> 키.
                      </strong>{" "}
                      선택한 앱의 공개 URL을 복사합니다. <code>all apps</code> 행에서는 모든 앱의 URL을 복사합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The header.</strong> The view shows the public URL ahead of the local one.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>헤더.</strong> 뷰는 공개 URL을 로컬 URL보다 앞에 보여 줍니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        When <code>akan tunnel</code> fits.
                      </strong>{" "}
                      Open it in a second terminal for an app started without <code>--share</code>, or for a port that
                      is not the dev port. Stopping it leaves the dev server alone.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>akan tunnel</code>이 맞는 경우.
                      </strong>{" "}
                      <code>--share</code> 없이 띄운 앱이나 개발 포트가 아닌 포트를 두 번째 터미널에서 공유할 때 씁니다.
                      멈춰도 개발 서버는 그대로입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.LinkGrid
              items={[
                {
                  href: "/references/cli/application#start",
                  title: "akan start",
                  desc: l.trans({
                    en: "Dev session options such as the full-screen view, `--kill` and `--concurrency`.",
                    ko: "전체 화면 뷰, `--kill`, `--concurrency` 같은 개발 세션 자체의 옵션입니다.",
                  }),
                },
                {
                  href: "/references/cli/cloud#login",
                  title: "akan login",
                  desc: l.trans({
                    en: "Sign in to Akan Cloud. Shares belong to this account.",
                    ko: "Akan Cloud에 로그인합니다. 공유는 이 계정에 속합니다.",
                  }),
                },
              ]}
            />
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
