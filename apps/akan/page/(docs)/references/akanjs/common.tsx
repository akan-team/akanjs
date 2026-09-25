import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const symbols = [
    {
      name: "Logger",
      desc: l.trans({
        en: "Structured logger used by CLI, server, service adaptors, and long-running build/runtime code. It supports static calls, named instances, log-level filtering from `AKAN_PUBLIC_LOG_LEVEL`, and sink hooks for runtime file logging.",
        ko: "CLI, server, service adaptor, long-running build/runtime code에서 사용하는 structured logger입니다. static call, named instance, `AKAN_PUBLIC_LOG_LEVEL` 기반 log-level filtering, runtime file logging을 위한 sink hook을 지원합니다.",
      }),
      code: `import { Logger } from "akanjs/common";

const logger = new Logger("BillingService");
logger.info("invoice synced");
Logger.warn("missing optional config", "startup");`,
    },
    {
      name: "sleep",
      desc: l.trans({
        en: "Promise-based delay helper used in polling, retry, local server tests, and cloud auth loops. It resolves after the given milliseconds and keeps async flows readable.",
        ko: "polling, retry, local server test, cloud auth loop에서 사용하는 Promise 기반 delay helper입니다. 지정된 millisecond 뒤 resolve되어 async flow를 읽기 쉽게 유지합니다.",
      }),
      code: `import { sleep } from "akanjs/common";

await sleep(500);
await retryAfterCooldown();`,
    },
    {
      name: "capitalize / lowerlize",
      desc: l.trans({
        en: "Tiny string casing helpers that change only the first character. Generators use them to convert module names into class names, file names, action names, and dictionary keys.",
        ko: "첫 글자만 바꾸는 작은 string casing helper입니다. generator는 module name을 class name, file name, action name, dictionary key로 변환할 때 사용합니다.",
      }),
      code: `import { capitalize, lowerlize } from "akanjs/common";

const ModelName = capitalize("story");
const modelName = lowerlize("Story");`,
    },
    {
      name: "formatPhone / isPhoneNumber",
      desc: l.trans({
        en: "Phone formatting and validation helpers used by form templates and business UI. `formatPhone` normalizes known Korean-style lengths while `isPhoneNumber` checks dashed phone input.",
        ko: "form template과 business UI에서 사용하는 phone formatting 및 validation helper입니다. `formatPhone`은 알려진 한국식 길이를 normalize하고 `isPhoneNumber`는 dash가 있는 phone input을 검사합니다.",
      }),
      code: `import { formatPhone, isPhoneNumber } from "akanjs/common";

const phone = formatPhone("01012345678");
const valid = isPhoneNumber(phone);`,
    },
    {
      name: "isEmail",
      desc: l.trans({
        en: "Email format validator for templates, profile forms, and service desk inputs. It returns false for empty values and true only when the string matches the supported email pattern.",
        ko: "template, profile form, service desk input을 위한 email format validator입니다. 빈 값에는 false를 반환하고 string이 지원되는 email pattern과 일치할 때만 true를 반환합니다.",
      }),
      code: `import { isEmail } from "akanjs/common";

if (!isEmail(form.email)) {
  st.do.setEmailError("Invalid email");
}`,
    },
    {
      name: "HttpClient",
      desc: l.trans({
        en: "HTTP wrapper used by srvkit integrations and platform APIs. Use it to centralize request options, logging, auth, and response handling for external services.",
        ko: "srvkit integration과 platform API에서 사용하는 HTTP wrapper입니다. external service의 request option, logging, auth, response handling을 중앙화할 때 사용합니다.",
      }),
      code: `import { HttpClient, Logger } from "akanjs/common";

const api = new HttpClient("https://api.example.com", {
  logger: new Logger("ExternalApi"),
});`,
    },
    {
      name: "pathGet / pathSet",
      desc: l.trans({
        en: "Object path helpers for nested state and form values. They are useful when field paths are dynamic and direct property access is not possible.",
        ko: "nested state와 form value를 위한 object path helper입니다. field path가 dynamic하고 direct property access가 불가능할 때 유용합니다.",
      }),
      code: `import { pathGet, pathSet } from "akanjs/common";

const nickname = pathGet(user, "profile.nickname");
const next = pathSet(user, "profile.nickname", "Akan");`,
    },
    {
      name: "randomPick / randomPicks",
      desc: l.trans({
        en: "Random selection helpers used by generators and test utilities. Use `randomPick` for a single value and `randomPicks` when selecting multiple values from a candidate list.",
        ko: "generator와 test utility에서 사용하는 random selection helper입니다. 단일 값 선택에는 `randomPick`, candidate list에서 여러 값을 선택할 때는 `randomPicks`를 사용합니다.",
      }),
      code: `import { randomPick, randomPicks } from "akanjs/common";

const color = randomPick(["red", "blue", "green"]);
const tags = randomPicks(["api", "ui", "db"], 2);`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="akanjs-common" title="akanjs/common">
        <Docs.Title>akanjs/common</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`akanjs/common` contains framework-agnostic utilities shared by CLI, server, UI, and app code. Import it for logging, formatting, validation, object path helpers, random helpers, and route/version utilities.",
              ko: "`akanjs/common`은 CLI, server, UI, app code가 공유하는 framework-agnostic utility를 제공합니다. logging, formatting, validation, object path helper, random helper, route/version utility에 사용합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      {symbols.map((symbol) => (
        <Scroll.Slide key={symbol.name} id={symbol.name} title={symbol.name}>
          <Docs.Title>{symbol.name}</Docs.Title>
          <Docs.Description>
            <div>{symbol.desc}</div>
          </Docs.Description>
          <Code.Snippet title={l.trans({ en: "Usage", ko: "사용 예시" })} language="typescript" code={symbol.code} />
        </Scroll.Slide>
      ))}
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
