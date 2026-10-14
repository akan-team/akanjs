import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

  const callColumns = [
    { key: "call", label: l.trans({ en: "Call", ko: "호출" }), code: true },
    { key: "result", label: l.trans({ en: "Result", ko: "결과" }), code: true },
  ];

  const exportRows = [
    {
      name: "Logger",
      href: "#Logger",
      desc: l.trans({
        en: "Writes leveled log lines and hands them to the sinks you register.",
        ko: "레벨이 있는 로그를 쓰고, 등록한 sink로 넘깁니다.",
      }),
    },
    {
      name: "sleep",
      href: "#sleep",
      desc: l.trans({ en: "Waits the given number of milliseconds.", ko: "지정한 밀리초만큼 기다립니다." }),
    },
    {
      name: ["capitalize", "lowerlize"],
      href: ["#capitalize / lowerlize", "#capitalize / lowerlize"],
      desc: l.trans({ en: "Changes the case of the first character only.", ko: "첫 글자의 대소문자만 바꿉니다." }),
    },
    {
      name: ["formatPhone", "isPhoneNumber"],
      href: ["#formatPhone / isPhoneNumber", "#formatPhone / isPhoneNumber"],
      desc: l.trans({
        en: "Adds dashes to a Korean phone number and checks the dashed form.",
        ko: "한국 전화번호에 대시를 넣고, 대시가 들어간 형식인지 검사합니다.",
      }),
    },
    {
      name: "isEmail",
      href: "#isEmail",
      desc: l.trans({
        en: "Checks that a string looks like an email address.",
        ko: "문자열이 이메일 주소 형식인지 검사합니다.",
      }),
    },
    {
      name: "RestClient",
      href: "#RestClient",
      desc: l.trans({
        en: "Calls a REST API that is not an Akan server.",
        ko: "Akan 서버가 아닌 REST API를 호출합니다.",
      }),
    },
    {
      name: ["pathGet", "pathSet"],
      href: ["#pathGet / pathSet", "#pathGet / pathSet"],
      desc: l.trans({
        en: "Reads and writes a nested value by a path such as `items[0].name`.",
        ko: "`items[0].name` 같은 경로로 중첩된 값을 읽고 씁니다.",
      }),
    },
    {
      name: ["randomPick", "randomPicks"],
      href: ["#randomPick / randomPicks", "#randomPick / randomPicks"],
      desc: l.trans({
        en: "Picks one or several random items from a list.",
        ko: "목록에서 무작위로 하나 또는 여러 개를 고릅니다.",
      }),
    },
  ];

  const moreRows = [
    {
      name: "clamp",
      desc: l.trans({
        en: "Keeps a number between `min` and `max`.",
        ko: "숫자를 `min`과 `max` 사이로 맞춥니다.",
      }),
      example: "clamp(120, 0, 100); // 100",
    },
    {
      name: "formatNumber",
      desc: l.trans({
        en: "Adds thousands separators to a number string and keeps the decimals as written.",
        ko: "숫자 문자열에 천 단위 쉼표를 넣고, 소수 부분은 쓴 그대로 둡니다.",
      }),
      example: 'formatNumber("1234567.89"); // "1,234,567.89"',
    },
    {
      name: "isValidDate",
      desc: l.trans({
        en: "Tells whether a `YYYY-MM-DD` string, `Date` or `Dayjs` parses, though `2024-02-30` still passes.",
        ko: "`YYYY-MM-DD` 문자열, `Date`, `Dayjs`가 날짜로 읽히는지 알려 주지만, `2024-02-30`도 통과합니다.",
      }),
    },
    {
      name: "isDayjs",
      desc: l.trans({ en: "Tells whether a value is a `Dayjs`.", ko: "값이 `Dayjs`인지 알려 줍니다." }),
    },
    {
      name: ["splitVersion", "mergeVersion"],
      desc: l.trans({
        en: 'Splits "1.2.3" into major, minor and patch, and joins them back.',
        ko: '"1.2.3"을 major, minor, patch로 나누고, 다시 합칩니다.',
      }),
      example: 'splitVersion("1.2.3"); // { major: "1", minor: "2", patch: "3" }',
    },
    {
      name: ["objectify", "plainFieldsOf"],
      desc: l.trans({
        en: "Copy data fields without methods, and only `plainFieldsOf` keeps a model's `Date` fields.",
        ko: "메서드를 뺀 데이터 필드만 복사하며, 모델의 `Date` 필드까지 담는 것은 `plainFieldsOf`뿐입니다.",
      }),
    },
    {
      name: "deepObjectify",
      desc: l.trans({
        en: "Makes a deep plain copy, JSON-ready when you pass `serializable` or `convertDate`.",
        ko: "중첩된 값까지 평범한 객체로 복사하며, `serializable`이나 `convertDate`를 주면 JSON으로 보낼 수 있는 형태가 됩니다.",
      }),
    },
    {
      name: "decodeJwtPayload",
      desc: l.trans({
        en: "Reads a JWT's payload without checking its signature, so never trust it for access.",
        ko: "서명을 확인하지 않고 JWT payload를 읽으므로, 권한 판단에 믿으면 안 됩니다.",
      }),
    },
    {
      name: "bearerTokenOf",
      desc: l.trans({
        en: "The token of an `Authorization` value: `Bearer` in any case, then one token and nothing after it. Else `null`.",
        ko: "`Authorization` 값의 토큰입니다. 대소문자를 가리지 않는 `Bearer` 뒤에 토큰 하나만 있어야 하고, 아니면 `null`입니다.",
      }),
      example: 'bearerTokenOf("bearer abc"); // "abc"',
    },
    {
      name: "parseSearchParams",
      desc: l.trans({
        en: "A query string as a record: a key given once is a string, a key given again an array of every value, empty ones included.",
        ko: "query string을 record로 바꿉니다. 한 번 나온 key는 문자열, 여러 번 나온 key는 빈 값까지 포함한 모든 값의 배열입니다.",
      }),
      example: 'parseSearchParams("?tag=&tag=b&q=x"); // { tag: ["", "b"], q: "x" }',
    },
    {
      name: "isThenable",
      desc: l.trans({ en: "Tells whether a value can be awaited.", ko: "값을 await할 수 있는지 알려 줍니다." }),
    },
    {
      name: "interpolateTranslation",
      desc: l.trans({
        en: "Fills `{name}` placeholders and leaves one whose value is missing as written.",
        ko: "`{name}` 자리표시자를 채우고, 값이 없는 자리표시자는 그대로 둡니다.",
      }),
      example: 'interpolateTranslation("Hi {name}", { name: "Akan" }); // "Hi Akan"',
    },
  ];

  const loggerApiRows = [
    {
      name: "logger.info(msg, context?)",
      desc: l.trans({
        en: "One method per level: `trace`, `verbose`, `debug`, `info`, `warn`, `error`.",
        ko: "`trace`, `verbose`, `debug`, `info`, `warn`, `error` 레벨마다 메서드가 하나씩 있습니다.",
      }),
    },
    {
      name: "Logger.info(msg, context?, name?)",
      desc: l.trans({
        en: "The same methods as statics, with `name` defaulting to `App`.",
        ko: "같은 메서드를 정적으로 부르며, `name`을 생략하면 `App`입니다.",
      }),
    },
    {
      name: "Logger.setLevel(level)",
      desc: l.trans({ en: "Changes the console level while the process runs.", ko: "실행 중에 콘솔 레벨을 바꿉니다." }),
    },
    {
      name: "Logger.shouldLog(level)",
      desc: l.trans({
        en: "Tells whether a line at that level would go anywhere, before you build a costly message.",
        ko: "만들기 비싼 메시지를 조립하기 전에, 그 레벨의 줄이 어디로든 나가는지 알려 줍니다.",
      }),
    },
    {
      name: "Logger.addSink(sink, { minLevel })",
      desc: l.trans({
        en: "Passes each record at or above `minLevel` to your function and returns its remover.",
        ko: "`minLevel` 이상의 레코드를 함수에 넘기고, 등록을 해제하는 함수를 돌려줍니다.",
      }),
    },
    {
      name: "Logger.removeSink(sink)",
      desc: l.trans({ en: "Stops passing records to that sink.", ko: "그 sink로 레코드를 넘기지 않습니다." }),
    },
    {
      name: "Logger.emit({ level, name, message, attrs })",
      desc: l.trans({
        en: "Writes one record with `key=value` attributes after the message.",
        ko: "메시지 뒤에 `key=value` 속성을 붙인 레코드 하나를 씁니다.",
      }),
    },
  ];

  const loggerEnvRows = [
    {
      key: "AKAN_PUBLIC_LOG_LEVEL",
      type: "LogLevel",
      default: "info",
      desc: l.trans({
        en: "The console level, below which lines are not printed.",
        ko: "콘솔 레벨이며, 이보다 낮은 줄은 출력하지 않습니다.",
      }),
    },
    {
      key: "AKAN_LOG_STDOUT_LEVEL",
      type: "LogLevel",
      default: "AKAN_PUBLIC_LOG_LEVEL",
      desc: l.trans({
        en: "The level the container's stdout carries, and it overrides `AKAN_PUBLIC_LOG_LEVEL` when set.",
        ko: "컨테이너 stdout으로 나가는 레벨이며, 지정하면 `AKAN_PUBLIC_LOG_LEVEL`보다 우선합니다.",
      }),
    },
    {
      key: "AKAN_LOG_FILE_LEVEL",
      type: "LogLevel",
      default: "trace",
      desc: l.trans({
        en: "The floor for a sink that sets no `minLevel`.",
        ko: "`minLevel`을 정하지 않은 sink가 받는 가장 낮은 레벨입니다.",
      }),
    },
  ];

  const phoneRows = [
    { call: 'formatPhone("0101234567")', result: '"010-123-4567"' },
    { call: 'formatPhone("010-123-45678")', result: '"010-1234-5678"' },
    { call: 'formatPhone("01012345678")', result: '"01012345678"' },
    { call: 'isPhoneNumber("010-1234-5678")', result: "true" },
    { call: 'isPhoneNumber("031-123-4567")', result: "true" },
    { call: 'isPhoneNumber("01012345678")', result: "false" },
    { call: 'isPhoneNumber("02-1234-5678")', result: "false" },
  ];

  const emailRows = [
    { call: 'isEmail("user@example.com")', result: "true" },
    { call: 'isEmail("user.name@example.co.kr")', result: "true" },
    { call: 'isEmail("user+tag@example.com")', result: "false" },
    { call: 'isEmail("user@example.c")', result: "false" },
    { call: "isEmail(null)", result: "false" },
  ];

  const restOptionRows = [
    {
      key: "baseUrl",
      type: "string",
      desc: l.trans({
        en: "Joined in front of a relative path, while an absolute `http(s)` URL ignores it.",
        ko: "상대 경로 앞에 붙고, `http(s)`로 시작하는 절대 URL에는 붙지 않습니다.",
      }),
    },
    {
      key: "headers",
      type: "HeadersInit",
      desc: l.trans({
        en: "Sent with every request, and a call's own `headers` win on a clash.",
        ko: "모든 요청에 실리며, 호출에서 준 `headers`와 겹치면 호출 쪽을 씁니다.",
      }),
    },
    {
      key: "timeout",
      type: "number (ms)",
      desc: l.trans({
        en: "Aborts a slower request; unset means no limit, and a call's own `timeout` wins.",
        ko: "이보다 오래 걸리는 요청을 중단하며, 없으면 제한이 없고 호출에서 준 `timeout`이 우선합니다.",
      }),
    },
  ];

  const restMethodRows = [
    {
      name: "get<T>(url, options?)",
      desc: l.trans({
        en: "Sends GET and resolves with the response body.",
        ko: "GET을 보내고 응답 본문으로 resolve합니다.",
      }),
    },
    {
      name: "post<T>(url, data?, options?)",
      desc: l.trans({ en: "Sends POST with `data` as the body.", ko: "`data`를 본문에 담아 POST를 보냅니다." }),
    },
    {
      name: "put<T>(url, data?, options?)",
      desc: l.trans({ en: "Sends PUT with `data` as the body.", ko: "`data`를 본문에 담아 PUT을 보냅니다." }),
    },
    {
      name: "delete<T>(url, options?)",
      desc: l.trans({ en: "Sends DELETE.", ko: "DELETE를 보냅니다." }),
    },
  ];

  const pathRows = [
    {
      name: 'pathGet(path, obj, separator = ".", fallback = null)',
      desc: l.trans({
        en: "Returns the value at `path`, or `fallback` when a step is missing or `null`.",
        ko: "`path`에 있는 값을 돌려주고, 중간에 값이 없거나 `null`이면 `fallback`을 돌려줍니다.",
      }),
    },
    {
      name: "pathSet(obj, path, value)",
      desc: l.trans({
        en: "Writes `value` in place, creating missing objects and arrays, and returns the same `obj`.",
        ko: "없는 객체와 배열을 만들어 가며 `value`를 제자리에 쓰고, 같은 `obj`를 돌려줍니다.",
      }),
    },
  ];

  const randomRows = [
    {
      name: "randomPick(list)",
      desc: l.trans({
        en: "One random item, or `undefined` for an empty list.",
        ko: "무작위 항목 하나를 고르며, 빈 목록이면 `undefined`입니다.",
      }),
    },
    {
      name: "randomPicks(list, count = 1, allowDuplicate = false)",
      desc: l.trans({
        en: "`count` random items, never the same one twice unless `allowDuplicate` is on.",
        ko: "무작위 항목 `count`개를 고르며, `allowDuplicate`를 켜지 않으면 같은 항목을 두 번 고르지 않습니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="akanjs-common" title="akanjs/common">
        <Docs.Title>akanjs/common</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>akanjs/common</code> holds small helpers that depend on no platform. The same import works in a
                  page, a store, a service and a CLI script.
                </span>
              ),
              ko: (
                <span>
                  <code>akanjs/common</code>은 플랫폼에 기대지 않는 작은 도우미 모음입니다. 페이지, store, 서비스, CLI
                  스크립트 어디서나 같은 import로 씁니다.
                </span>
              ),
            })}
          </div>
          <code className={chip}>{'import { Logger, sleep, isEmail } from "akanjs/common";'}</code>
          <Docs.SubSubTitle>{l.trans({ en: "On this page", ko: "이 페이지에서 다루는 것" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Export", ko: "이름" })} items={exportRows} />
          <Docs.SubSubTitle>{l.trans({ en: "More in akanjs/common", ko: "그 밖의 도우미" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Export", ko: "이름" })} items={moreRows} />
          <div>
            {l.trans({
              en: "The same import also carries route-convention helpers and wire contracts that the framework uses itself. App code rarely needs them.",
              ko: "같은 경로에는 프레임워크가 직접 쓰는 route 규칙 도우미와 통신 계약도 들어 있습니다. 앱 코드에서 쓸 일은 거의 없습니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="Logger" title="Logger">
        <Docs.Title>Logger</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Akan's leveled logger. A service already has one as <code>this.logger</code>, named after its class,
                  and an <code>adapt()</code> adapter has one named after its key. Anywhere else, create{" "}
                  <code>new Logger("Name")</code> or call the static methods.
                </span>
              ),
              ko: (
                <span>
                  레벨별로 로그를 남기는 Akan의 로거입니다. 서비스에는 클래스 이름이 붙은 <code>this.logger</code>가,{" "}
                  <code>adapt()</code> 어댑터에는 등록 키 이름이 붙은 <code>this.logger</code>가 이미 있습니다. 그 밖의
                  곳에서는 <code>new Logger("Name")</code>를 만들거나 정적 메서드를 부릅니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: "A script that logs through an instance, a static call, a structured record and a sink:",
              ko: "다음은 인스턴스, 정적 호출, 구조화 레코드, sink를 모두 쓰는 스크립트입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/script/syncInvoices.ts"
          language="typescript"
          code={`import { Logger } from "akanjs/common";

const logger = new Logger("InvoiceSync");
logger.info("invoice synced");
logger.warn("retrying charge", "stripe");

Logger.warn("missing optional config", "startup");

Logger.emit({
  level: "info",
  name: "InvoiceSync",
  message: "charge settled",
  attrs: { amount: 1200, apiKey: "sk_live_..." },
}); // ... charge settled amount=1200 apiKey=[redacted]

const errorLines: string[] = [];
const removeSink = Logger.addSink(
  ({ plainMessage }) => {
    errorLines.push(plainMessage);
  },
  { minLevel: "error" },
);
removeSink();`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Six levels, lowest first:</strong> <code>trace</code>, <code>verbose</code>,{" "}
                    <code>debug</code>, <code>info</code>, <code>warn</code>, <code>error</code>. A line prints at or
                    above the console level, and <code>error</code> lines go to stderr.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>레벨은 낮은 것부터 여섯 가지입니다.</strong> <code>trace</code>, <code>verbose</code>,{" "}
                    <code>debug</code>, <code>info</code>, <code>warn</code>, <code>error</code> 순입니다. 콘솔 레벨
                    이상인 줄만 출력되고, <code>error</code>는 stderr로 나갑니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The second argument is the context.</strong>{" "}
                    <code>logger.warn("retrying charge", "stripe")</code> prints <code>[stripe]</code> before the
                    message.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>두 번째 인자는 context입니다.</strong> <code>logger.warn("retrying charge", "stripe")</code>
                    는 메시지 앞에 <code>[stripe]</code>를 찍습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Secret-looking keys are masked.</strong> An <code>attrs</code> key containing a word such as
                    password, token, secret, cookie or api key reads <code>[redacted]</code> before any sink sees it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>비밀처럼 보이는 키는 가려집니다.</strong> <code>attrs</code> 키에 password, token, secret,
                    cookie, api key 같은 말이 들어 있으면 어떤 sink에 닿기 전에 <code>[redacted]</code>로 바뀝니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Give every sink a floor.</strong> A sink without <code>minLevel</code> takes every level
                    down to <code>AKAN_LOG_FILE_LEVEL</code> (trace), so each <code>verbose</code> call gets rendered.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>sink에는 항상 하한을 줍니다.</strong> <code>minLevel</code>이 없는 sink는{" "}
                    <code>AKAN_LOG_FILE_LEVEL</code>(기본 trace)까지 모든 레벨을 받으므로, <code>verbose</code> 호출마다
                    렌더링이 일어납니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Methods", ko: "메서드" })}</Docs.SubSubTitle>
          <Docs.IntroTable type="API" items={loggerApiRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Environment variables", ko: "환경 변수" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={loggerEnvRows} />
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    Never call <code>.log()</code>.
                  </strong>{" "}
                  It is deprecated and writes at <code>info</code>, so it looks like its own level but is not; lint
                  rejects it. <code>AKAN_PUBLIC_LOG_LEVEL=log</code> likewise means <code>info</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>.log()</code>는 쓰지 않습니다.
                  </strong>{" "}
                  deprecated된 메서드이고 실제로는 <code>info</code>로 기록되어, 별도 레벨처럼 보여도 아닙니다. lint도
                  막습니다. <code>AKAN_PUBLIC_LOG_LEVEL=log</code> 역시 <code>info</code>로 읽힙니다.
                </span>
              ),
            })}
          </Docs.Alert>
          <Docs.LinkGrid
            items={[
              {
                href: "/cheatsheet/observability/logging#log-levels",
                title: l.trans({ en: "Log Levels", ko: "로그 레벨" }),
                desc: l.trans({
                  en: "The six levels, their severity numbers and what each one is for.",
                  ko: "여섯 레벨과 각 severity 값, 레벨별 쓰임새를 봅니다.",
                }),
              },
              {
                href: "/cheatsheet/observability/logging#file-logging",
                title: l.trans({ en: "File Logging & Rotation", ko: "파일 로그와 로테이션" }),
                desc: l.trans({
                  en: "Where the log file lives and how it rotates.",
                  ko: "로그 파일의 위치와 로테이션 방식을 봅니다.",
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="sleep" title="sleep">
        <Docs.Title>sleep</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>sleep(ms)</code> returns a Promise that resolves after <code>ms</code> milliseconds. It is used
                  for polling, retry waits, tests and the CLI's cloud sign-in loop.
                </span>
              ),
              ko: (
                <span>
                  <code>sleep(ms)</code>는 <code>ms</code>밀리초 뒤에 resolve되는 Promise를 돌려줍니다. 폴링, 재시도
                  대기, 테스트, CLI의 클라우드 로그인 루프에서 씁니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  The shared file helper polls an upload until it leaves <code>uploading</code>:
                </span>
              ),
              ko: (
                <span>
                  공용 파일 도우미는 업로드가 <code>uploading</code> 상태를 벗어날 때까지 이렇게 폴링합니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="libs/shared/webkit/addFileUntilActive.ts"
          language="typescript"
          code={`import { fetch } from "@libs/shared/client";
import { sleep } from "akanjs/common";

while (file.status === "uploading") {
  await sleep(1000);
  file = await fetch.file(file.id);
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>It does not block.</strong> Other work keeps running during the wait; only the function that
                    awaits it pauses.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>프로세스를 멈추지 않습니다.</strong> 기다리는 동안 다른 작업은 계속 돌고, await한 함수만
                    멈춥니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="capitalize / lowerlize" title="capitalize / lowerlize">
        <Docs.Title>capitalize / lowerlize</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Change the case of the first character and leave the rest as written. Use them to turn a model name
                  such as <code>story</code> into a class-style <code>Story</code> and back:
                </span>
              ),
              ko: (
                <span>
                  첫 글자의 대소문자만 바꾸고 나머지는 그대로 둡니다. <code>story</code> 같은 모델 이름을 클래스식{" "}
                  <code>Story</code>로 바꾸거나 되돌릴 때 씁니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/common/modelNames.ts"
          language="typescript"
          code={`import { capitalize, lowerlize } from "akanjs/common";

const ModelName = capitalize("story"); // "Story"
const modelName = lowerlize("Story"); // "story"
capitalize("aKan"); // "AKan": only the first character changes`}
        />
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="formatPhone / isPhoneNumber" title="formatPhone / isPhoneNumber">
        <Docs.Title>formatPhone / isPhoneNumber</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>formatPhone</code> adds dashes to a Korean phone number as it is typed, and{" "}
                  <code>isPhoneNumber</code> accepts only the dashed form. <code>Field.Phone</code> already runs both,
                  so a form seldom calls them itself.
                </span>
              ),
              ko: (
                <span>
                  <code>formatPhone</code>은 입력 중인 한국 전화번호에 대시를 넣고, <code>isPhoneNumber</code>는 대시가
                  들어간 형식만 통과시킵니다. <code>Field.Phone</code>이 둘 다 이미 쓰므로 폼에서 직접 부를 일은
                  드뭅니다.
                </span>
              ),
            })}
          </div>
          <Docs.Table columns={callColumns} rows={phoneRows} stacked />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>It counts characters, not area codes.</strong> At 10 characters it splits 3-3-4; at 13 it
                    drops the dashes and splits 3-4-4. Any other length, 11 bare digits included, comes back unchanged.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>지역번호가 아니라 글자 수를 봅니다.</strong> 10자면 3-3-4로, 13자면 대시를 지우고 3-4-4로
                    나눕니다. 대시 없는 11자리를 포함해 다른 길이는 그대로 돌려줍니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Why 10 and 13.</strong> One more digit typed after <code>010-123-4567</code> makes 13
                    characters, which re-splits it as <code>010-1234-5678</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>10과 13인 이유.</strong> <code>010-123-4567</code> 뒤에 숫자를 하나 더 치면 13자가 되고,
                    이때 <code>010-1234-5678</code>로 다시 나뉩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Seoul's <code>02</code> numbers do not fit.
                    </strong>{" "}
                    <code>formatPhone("0212345678")</code> gives <code>021-234-5678</code>, and the dashed{" "}
                    <code>02</code> form fails <code>isPhoneNumber</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      서울 <code>02</code> 번호는 맞지 않습니다.
                    </strong>{" "}
                    <code>formatPhone("0212345678")</code>은 <code>021-234-5678</code>이 되고, 대시를 넣은{" "}
                    <code>02</code> 번호도 <code>isPhoneNumber</code>를 통과하지 못합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: (
                <span>
                  In a form, bind <code>Field.Phone</code>. It formats while the user types and shows an error for an
                  invalid number:
                </span>
              ),
              ko: (
                <span>
                  폼에서는 <code>Field.Phone</code>을 연결합니다. 입력하는 동안 형식을 맞추고, 잘못된 번호면 오류를 보여
                  줍니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/user/User.Template.tsx"
          language="tsx"
          code={`"use client";
import { st, usePage } from "@apps/myapp/client";
import { Field } from "akanjs/ui";

export const General = () => {
  const { l } = usePage();
  const userForm = st.use.userForm();
  return (
    <Field.Phone
      label={l("user.phone")}
      value={userForm.phone}
      onChange={st.do.setPhoneOnUser}
    />
  );
};`}
        />
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="isEmail" title="isEmail">
        <Docs.Title>isEmail</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>isEmail</code> tells whether a string looks like an email address. It returns <code>false</code>{" "}
                  for <code>null</code>, <code>undefined</code> and an empty string, so it needs no guard in front.
                </span>
              ),
              ko: (
                <span>
                  <code>isEmail</code>은 문자열이 이메일 주소 형식인지 알려 줍니다. <code>null</code>,{" "}
                  <code>undefined</code>, 빈 문자열에는 <code>false</code>를 돌려주므로 앞에서 따로 확인할 필요가
                  없습니다.
                </span>
              ),
            })}
          </div>
          <Docs.Table columns={callColumns} rows={emailRows} stacked />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>+</code> is not accepted.
                    </strong>{" "}
                    Before the <code>@</code> only letters, digits, <code>_</code>, <code>.</code> and <code>-</code>{" "}
                    may appear, so plus-addressed mail fails.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>+</code>는 받지 않습니다.
                    </strong>{" "}
                    <code>@</code> 앞에는 영문자, 숫자, <code>_</code>, <code>.</code>, <code>-</code>만 올 수 있어서{" "}
                    <code>+</code>가 들어간 주소는 떨어집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The last domain part needs 2 to 8 characters</strong>, as in <code>.com</code> or{" "}
                    <code>.co.kr</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>마지막 도메인 조각은 2~8자여야 합니다.</strong> <code>.com</code>, <code>.co.kr</code> 같은
                    형태입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>Input.Email</code> already runs it
                    </strong>{" "}
                    and shows the invalid-email message. Call it yourself to gate a button or an action.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>Input.Email</code>은 이미 이 검사를 합니다.
                    </strong>{" "}
                    잘못된 이메일 메시지도 보여 줍니다. 버튼이나 동작을 막을 때만 직접 부릅니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: "The shared sign-up form disables its button the same way:",
              ko: "공용 가입 폼도 같은 방식으로 버튼을 막습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/org/Org.Util.tsx"
          language="tsx"
          code={`"use client";
import { st, usePage } from "@apps/myapp/client";
import { isEmail } from "akanjs/common";
import { Button } from "akanjs/ui";

export const Invite = () => {
  const { l } = usePage();
  const inviteEmail = st.use.inviteEmail();
  return (
    <Button
      disabled={!isEmail(inviteEmail)}
      onClick={() => st.do.inviteMember()}
    >
      {l("org.inviteMember")}
    </Button>
  );
};`}
        />
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="RestClient" title="RestClient">
        <Docs.Title>RestClient</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>RestClient</code> is a small <code>fetch</code> wrapper for a REST API that is not an Akan
                  server. It keeps one base URL, shared headers and a timeout, and sends and parses JSON for you.
                </span>
              ),
              ko: (
                <span>
                  <code>RestClient</code>는 Akan 서버가 아닌 REST API를 부르는 작은 <code>fetch</code> 래퍼입니다. base
                  URL, 공통 헤더, 타임아웃을 한곳에 두고, JSON을 보내고 읽는 일을 대신합니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Constructor options", ko: "생성자 옵션" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Pass an options object, or just a base URL: <code>new RestClient("https://api.example.com")</code> is
                  short for <code>{'{ baseUrl: "https://api.example.com" }'}</code>.
                </span>
              ),
              ko: (
                <span>
                  옵션 객체를 넘기거나 base URL만 넘깁니다. <code>new RestClient("https://api.example.com")</code>은{" "}
                  <code>{'{ baseUrl: "https://api.example.com" }'}</code>의 줄임입니다.
                </span>
              ),
            })}
          </div>
          <Docs.OptionTable items={restOptionRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Methods", ko: "메서드" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={restMethodRows} />
          <div>
            {l.trans({
              en: <span>A client with shared headers and a timeout, plus a header on one call only:</span>,
              ko: <span>공통 헤더와 타임아웃을 두고, 호출 하나에만 헤더를 더하는 예시입니다.</span>,
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/srvkit/exampleApi.ts"
          language="typescript"
          code={`import { RestClient } from "akanjs/common";

const api = new RestClient({
  baseUrl: "https://api.example.com",
  headers: { "X-Client": "myapp" },
  timeout: 20_000,
});

const user = await api.get<{ id: string; name: string }>("/users/1");
const requestId = crypto.randomUUID();
await api.post(
  "/events",
  { type: "signup", userId: user.id },
  { headers: { "X-Request-Id": requestId } },
);`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Request body.</strong> A plain object is sent as JSON with{" "}
                    <code>Content-Type: application/json</code>. A string, <code>FormData</code>,{" "}
                    <code>URLSearchParams</code>, <code>Blob</code> or <code>ArrayBuffer</code> goes as is.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>요청 본문.</strong> 평범한 객체는 <code>Content-Type: application/json</code>과 함께
                    JSON으로 보냅니다. 문자열, <code>FormData</code>, <code>URLSearchParams</code>, <code>Blob</code>,{" "}
                    <code>ArrayBuffer</code>는 그대로 보냅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Response.</strong> A JSON content type is parsed, and anything else resolves as text.{" "}
                    <code>204</code> and an empty body resolve <code>undefined</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>응답.</strong> JSON content type이면 파싱하고, 나머지는 텍스트로 resolve합니다.{" "}
                    <code>204</code>와 빈 본문은 <code>undefined</code>입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Failure.</strong> A non-2xx status rejects with a plain <code>Error</code> whose message is
                    the response body. In an adapter, catch it, <code>logger.error</code> it and return{" "}
                    <code>null</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>실패.</strong> 2xx가 아닌 응답은 본문을 메시지로 담은 평범한 <code>Error</code>로
                    reject됩니다. 어댑터에서는 잡아서 <code>logger.error</code>로 남기고 <code>null</code>을 돌려줍니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Four verbs only.</strong> There is no <code>patch</code>. <code>options</code> also takes
                    other <code>fetch</code> settings such as <code>credentials</code> or <code>cache</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>메서드는 네 가지뿐입니다.</strong> <code>patch</code>는 없습니다. <code>options</code>에는{" "}
                    <code>credentials</code>, <code>cache</code> 같은 다른 <code>fetch</code> 설정도 넣을 수 있습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="info">
            {l.trans({
              en: (
                <span>
                  <strong>
                    Calling an Akan server? Use <code>fetch.*</code>.
                  </strong>{" "}
                  <code>RestClient</code> knows nothing of signals, guards or <code>Err</code>, so a server{" "}
                  <code>Err</code> arrives as a plain <code>Error</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    Akan 서버를 부른다면 <code>fetch.*</code>를 씁니다.
                  </strong>{" "}
                  <code>RestClient</code>는 signal, 가드, <code>Err</code>를 모르므로 서버의 <code>Err</code>도 평범한{" "}
                  <code>Error</code>로 도착합니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="pathGet / pathSet" title="pathGet / pathSet">
        <Docs.Title>pathGet / pathSet</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Read or write a value deep inside an object by a path string. Reach for them when the path is data, such as a field name held in a variable.",
              ko: "경로 문자열로 객체 깊숙한 곳의 값을 읽고 씁니다. 필드 이름을 변수로 들고 있을 때처럼, 경로가 코드가 아니라 데이터일 때 씁니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Signature", ko: "시그니처" })} items={pathRows} />
          <div>
            {l.trans({
              en: "The same path in three spellings, and a write that builds what is missing:",
              ko: "같은 경로를 세 가지로 쓰는 예와, 없는 단계를 만들어 가며 쓰는 예입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/common/profilePath.ts"
          language="typescript"
          code={`import { pathGet, pathSet } from "akanjs/common";

const user = {
  profile: { nickname: "akan" },
  links: [{ url: "https://akanjs.com" }],
};

pathGet("profile.nickname", user); // "akan"
pathGet("links[0].url", user); // "https://akanjs.com"
pathGet(["links", 0, "url"], user); // "https://akanjs.com"
pathGet("profile.age", user, ".", 0); // 0

pathSet(user, "profile.nickname", "Akan"); // returns user, now changed
pathSet(user, "tags[0]", "core"); // creates tags: ["core"]`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The argument order differs.</strong> <code>pathGet</code> takes the path first,{" "}
                    <code>pathSet</code> the object first.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>인자 순서가 다릅니다.</strong> <code>pathGet</code>은 경로가 먼저, <code>pathSet</code>은
                    객체가 먼저입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Three spellings, one path.</strong> <code>links[0].url</code>, <code>links.0.url</code> and{" "}
                    <code>["links", 0, "url"]</code> reach the same value. Passing your own <code>separator</code> to{" "}
                    <code>pathGet</code> turns the bracket form off.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>세 가지 표기, 같은 경로.</strong> <code>links[0].url</code>, <code>links.0.url</code>,{" "}
                    <code>["links", 0, "url"]</code>은 같은 값에 닿습니다. <code>pathGet</code>에 직접{" "}
                    <code>separator</code>를 주면 대괄호 표기는 꺼집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>Map</code> fields work.
                    </strong>{" "}
                    A <code>Map</code> value is read and written through <code>get</code> and <code>set</code>, not as
                    properties.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>Map</code> 필드도 됩니다.
                    </strong>{" "}
                    <code>Map</code> 값은 속성이 아니라 <code>get</code>, <code>set</code>으로 읽고 씁니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    <code>pathSet</code> changes the object you pass.
                  </strong>{" "}
                  Copy it first if the original must stay. For store state, write a form path with{" "}
                  <code>{"st.do.writeOn<Model>(path, value)"}</code> instead.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>pathSet</code>은 넘긴 객체를 직접 바꿉니다.
                  </strong>{" "}
                  원본을 지켜야 하면 먼저 복사합니다. store 상태라면 대신{" "}
                  <code>{"st.do.writeOn<Model>(path, value)"}</code>로 폼 경로에 씁니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="randomPick / randomPicks" title="randomPick / randomPicks">
        <Docs.Title>randomPick / randomPicks</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Pick random items from a list. Akan's test data generator <code>sampleOf</code> fills an enum field
                  with <code>randomPick</code>.
                </span>
              ),
              ko: (
                <span>
                  목록에서 무작위로 항목을 고릅니다. Akan의 테스트 데이터 생성기 <code>sampleOf</code>도 enum 필드를{" "}
                  <code>randomPick</code>으로 채웁니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Signature", ko: "시그니처" })} items={randomRows} />
          <div>
            {l.trans({
              en: "One pick, two distinct picks, and three picks that may repeat:",
              ko: "하나 고르기, 서로 다른 두 개 고르기, 중복을 허용해 세 개 고르기입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/story.signal.spec.ts"
          language="typescript"
          code={`import { randomPick, randomPicks } from "akanjs/common";

const color = randomPick(["red", "blue", "green"]);
const tags = randomPicks(["api", "ui", "db"], 2); // two different tags
const rolls = randomPicks([1, 2, 3, 4, 5, 6], 3, true); // repeats allowed`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A short list comes back whole.</strong> With duplicates off and <code>count</code> at or
                    above the list length, you get the same array back, in order and not copied.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>짧은 목록은 그대로 돌아옵니다.</strong> 중복을 끈 채 <code>count</code>가 목록 길이
                    이상이면, 섞지도 복사하지도 않은 같은 배열을 돌려줍니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Not for secrets.</strong> They use <code>Math.random</code>, so never build a token or a
                    verification code with them.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>비밀값에는 쓰지 않습니다.</strong> <code>Math.random</code>을 쓰므로 토큰이나 인증 코드를
                    만들면 안 됩니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
