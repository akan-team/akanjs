import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, type MatrixGroup, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";
  const card = panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0");

  const exportRows = [
    {
      name: "ID",
      href: "#ID",
      desc: l.trans({
        en: "A document id: a 24-character hex string.",
        ko: "문서를 가리키는 id입니다. 24자리 16진수 문자열입니다.",
      }),
    },
    {
      name: ["Int", "Float"],
      href: ["#Int", "#Float"],
      desc: l.trans({
        en: "Whole numbers and decimals. JavaScript `Number` is not a field type.",
        ko: "정수와 소수입니다. JavaScript `Number`는 필드 타입으로 쓸 수 없습니다.",
      }),
    },
    {
      name: "Any",
      href: "#Any",
      desc: l.trans({
        en: "An open value Akan does not check. You name its shape with a type argument.",
        ko: "Akan이 검사하지 않는 열린 값입니다. 모양은 타입 인자로 알려 줍니다.",
      }),
    },
    {
      name: "Binary",
      href: "#Binary",
      desc: l.trans({
        en: "Raw bytes in a signal argument or return.",
        ko: "signal 인자나 반환값에 담는 바이트입니다.",
      }),
    },
    {
      name: "Upload",
      href: "#Upload",
      desc: l.trans({
        en: "A file in the body of the upload mutation.",
        ko: "업로드 mutation의 body로 받는 파일입니다.",
      }),
    },
    {
      name: ["dayjs", "Dayjs"],
      desc: l.trans({
        en: "The date library and its type. Every `Date` field holds a `Dayjs`.",
        ko: "날짜 라이브러리와 그 타입입니다. `Date` 필드의 값은 모두 `Dayjs`입니다.",
      }),
    },
    {
      name: "enumOf",
      href: "#enumOf",
      desc: l.trans({
        en: "Turns a fixed list of values into an enum class.",
        ko: "정해진 값 목록으로 enum class를 만듭니다.",
      }),
    },
    {
      name: "getEnv",
      href: "#getEnv",
      desc: l.trans({
        en: "The running app's name, environment and server addresses.",
        ko: "실행 중인 앱의 이름, 환경, 서버 주소를 알려 줍니다.",
      }),
    },
    {
      name: ["getApiPrefix", "getWsPrefix"],
      desc: l.trans({
        en: "The paths that signals and the websocket are served under.",
        ko: "signal과 websocket이 붙는 경로를 알려 줍니다.",
      }),
    },
    {
      name: "DataList",
      href: "#DataList",
      desc: l.trans({
        en: "A list keyed by id. Every model list in a store is one.",
        ko: "id로 찾는 목록입니다. store에 있는 model 목록은 모두 DataList입니다.",
      }),
    },
  ];

  const placeColumns = [
    { key: "field", label: l.trans({ en: "Model field", ko: "model 필드" }), caption: "field()" },
    { key: "arg", label: l.trans({ en: "Signal argument", ko: "signal 인자" }), caption: ".body() .param()" },
    { key: "ret", label: l.trans({ en: "Signal return", ko: "signal 반환값" }), caption: "query() mutation()" },
  ];
  const everywhere = { field: true, arg: true, ret: true };
  const placeGroups: MatrixGroup[] = [
    {
      label: l.trans({ en: "Import from `akanjs/base`", ko: "`akanjs/base`에서 import" }),
      rows: [
        {
          name: "ID",
          desc: l.trans({ en: "Document ids.", ko: "문서 id입니다." }),
          marks: everywhere,
        },
        {
          name: "Int · Float",
          desc: l.trans({ en: "Counts and decimals.", ko: "개수와 소수입니다." }),
          marks: everywhere,
        },
        {
          name: "Any",
          desc: l.trans({ en: "Payloads whose shape stays open.", ko: "모양을 열어 두는 payload입니다." }),
          marks: everywhere,
        },
        {
          name: "Binary",
          desc: l.trans({ en: "Keep stored bytes in a `File` model.", ko: "저장할 바이트는 `File` model에 둡니다." }),
          marks: { arg: true, ret: true },
        },
        {
          name: "Upload",
          desc: l.trans({
            en: "Only in the body of a `fileUpload: true` mutation.",
            ko: "`fileUpload: true` mutation의 body에서만 씁니다.",
          }),
          marks: { arg: true },
        },
      ],
    },
    {
      label: l.trans({ en: "JavaScript globals, no import", ko: "import 없이 쓰는 JavaScript 전역" }),
      rows: [
        {
          name: "String",
          desc: l.trans({ en: "Plain text.", ko: "일반 문자열입니다." }),
          marks: everywhere,
        },
        {
          name: "Boolean",
          desc: l.trans({
            en: 'Text such as "true", "false", "1" and "0" is read as a boolean.',
            ko: '"true", "false", "1", "0" 같은 텍스트도 boolean으로 읽습니다.',
          }),
          marks: everywhere,
        },
        {
          name: "Date",
          desc: l.trans({
            en: "The value is a `Dayjs`, not a JavaScript `Date`.",
            ko: "값은 JavaScript `Date`가 아니라 `Dayjs`입니다.",
          }),
          marks: everywhere,
        },
      ],
    },
  ];

  const emptyColumns = [
    { key: "scalar", label: l.trans({ en: "Type", ko: "타입" }), code: true },
    { key: "value", label: l.trans({ en: "TypeScript value", ko: "TypeScript 값" }), code: true },
    { key: "empty", label: l.trans({ en: "Without a default", ko: "default가 없을 때" }), code: true },
  ];
  const emptyRows = [
    { scalar: "ID", value: "string", empty: '""' },
    { scalar: "Int · Float", value: "number", empty: "0" },
    { scalar: "Any", value: "T  —  field<T>(Any)", empty: "null" },
    { scalar: "String", value: "string", empty: '""' },
    { scalar: "Boolean", value: "boolean", empty: "false" },
    { scalar: "Date", value: "Dayjs", empty: "dayjs(new Date(-1))" },
  ];

  const enumRows = [
    {
      name: "values",
      desc: l.trans({ en: "The list exactly as declared.", ko: "선언한 그대로의 값 목록입니다." }),
      example: 'JobStatus.values; // ["ready", "running", "done"]',
    },
    {
      name: "has(value)",
      desc: l.trans({ en: "Whether the value is in the list.", ko: "값이 목록에 있는지 알려 줍니다." }),
      example: 'JobStatus.has("ready"); // true',
    },
    {
      name: "indexOf(value)",
      desc: l.trans({
        en: "The value's position. Throws when the value is not in the list.",
        ko: "값의 위치입니다. 목록에 없는 값이면 에러를 던집니다.",
      }),
    },
    {
      name: ["find(fn)", "findIndex(fn)"],
      desc: l.trans({
        en: "Like the Array methods, but throw when nothing matches.",
        ko: "배열 메서드와 같지만, 맞는 값이 없으면 에러를 던집니다.",
      }),
    },
    {
      name: ["filter(fn)", "map(fn)", "forEach(fn)"],
      desc: l.trans({ en: "Same as the Array methods.", ko: "배열 메서드와 똑같습니다." }),
      example: "JobStatus.map((value) => value.toUpperCase());",
    },
    {
      name: 'JobStatus["value"]',
      desc: l.trans({
        en: "The type of one value: the union of the list.",
        ko: "값 하나의 타입입니다. 목록의 union이 됩니다.",
      }),
      example:
        'const statusClass: { [key in JobStatus["value"]]: string } = { ready: "text-foreground/60", running: "text-primary", done: "text-success" };',
    },
  ];

  const envRows = [
    {
      key: "appName",
      type: "string",
      desc: l.trans({
        en: "From `AKAN_PUBLIC_APP_NAME`. Required.",
        ko: "`AKAN_PUBLIC_APP_NAME`에서 읽습니다. 필수입니다.",
      }),
    },
    {
      key: "repoName",
      type: "string",
      desc: l.trans({
        en: "From `AKAN_PUBLIC_REPO_NAME`. Required.",
        ko: "`AKAN_PUBLIC_REPO_NAME`에서 읽습니다. 필수입니다.",
      }),
    },
    {
      key: "serveDomain",
      type: "string",
      desc: l.trans({
        en: "From `AKAN_PUBLIC_SERVE_DOMAIN`. Required.",
        ko: "`AKAN_PUBLIC_SERVE_DOMAIN`에서 읽습니다. 필수입니다.",
      }),
    },
    {
      key: "environment",
      type: '"testing" | "debug" | "develop" | "main" | "local"',
      default: '"debug"',
      desc: l.trans({ en: "From `AKAN_PUBLIC_ENV`.", ko: "`AKAN_PUBLIC_ENV`에서 읽습니다." }),
    },
    {
      key: "operationMode",
      type: '"local" | "edge" | "cloud" | "module"',
      default: '"cloud"',
      desc: l.trans({
        en: 'From `AKAN_PUBLIC_OPERATION_MODE`. It is `"local"` when `environment` is `"local"`.',
        ko: '`AKAN_PUBLIC_OPERATION_MODE`에서 읽습니다. `environment`가 `"local"`이면 `"local"`입니다.',
      }),
    },
    {
      key: "databaseMode",
      type: '"single" | "multiple" | "cluster" | undefined',
      desc: l.trans({
        en: "From `AKAN_DATABASE_MODE`, else the mode the app declares. `undefined` in the browser.",
        ko: "`AKAN_DATABASE_MODE`에서 읽고, 없으면 앱이 선언한 모드입니다. 브라우저에서는 `undefined`입니다.",
      }),
    },
    {
      key: "side",
      type: '"server" | "client"',
      desc: l.trans({
        en: "Whether this code is running on the server or in the browser.",
        ko: "지금 코드가 서버에서 도는지 브라우저에서 도는지 알려 줍니다.",
      }),
    },
    {
      key: "renderMode",
      type: '"ssr" | "csr"',
      default: '"csr"',
      desc: l.trans({ en: "From `AKAN_PUBLIC_RENDER_ENV`.", ko: "`AKAN_PUBLIC_RENDER_ENV`에서 읽습니다." }),
    },
    {
      key: "apiPrefix",
      type: "string",
      default: '"/api"',
      desc: l.trans({ en: "The value `getApiPrefix()` returns.", ko: "`getApiPrefix()`가 돌려주는 값입니다." }),
    },
    {
      key: "wsPrefix",
      type: "string",
      default: '"/ws"',
      desc: l.trans({ en: "The value `getWsPrefix()` returns.", ko: "`getWsPrefix()`가 돌려주는 값입니다." }),
    },
    {
      key: "clientHttpUri",
      type: "string",
      desc: l.trans({
        en: "The web origin, such as `http://localhost:8282`. Also split into `clientHost` and `clientPort`.",
        ko: "`http://localhost:8282` 같은 웹 origin입니다. `clientHost`, `clientPort`로도 나뉘어 있습니다.",
      }),
    },
    {
      key: "serverHttpUri",
      type: "string",
      desc: l.trans({
        en: "The API base with the prefix, such as `http://localhost:8282/api`.",
        ko: "prefix까지 붙은 API 주소입니다. 예: `http://localhost:8282/api`",
      }),
    },
    {
      key: "serverWsUri",
      type: "string",
      desc: l.trans({
        en: "The websocket origin without a path, such as `ws://localhost:8282`.",
        ko: "경로가 없는 websocket origin입니다. 예: `ws://localhost:8282`",
      }),
    },
  ];

  const prefixColumns = [
    { key: "file", label: l.trans({ en: "Where", ko: "위치" }), code: true },
    { key: "setting", label: l.trans({ en: "Setting", ko: "설정" }), code: true },
    { key: "follows", label: l.trans({ en: "Who follows it", ko: "따르는 쪽" }) },
  ];
  const prefixRows = [
    {
      file: "main.ts",
      setting: "new AkanApp({ prefix, websocketPrefix })",
      follows: l.trans({
        en: "The server's routes, and every page the server renders.",
        ko: "서버의 route, 그리고 서버가 렌더링하는 모든 페이지입니다.",
      }),
    },
    {
      file: "akan.config.ts",
      setting: "api: { prefix, websocketPrefix }",
      follows: l.trans({
        en: "A prebuilt CSR shell and a Capacitor app, which no server renders.",
        ko: "서버가 렌더링하지 않는 미리 빌드한 CSR 셸과 Capacitor 앱입니다.",
      }),
    },
    {
      file: l.trans({ en: "(nothing set)", ko: "(설정 없음)" }),
      setting: '"/api" · "/ws"',
      follows: l.trans({ en: "The defaults.", ko: "기본값입니다." }),
    },
  ];

  const dataListRows = [
    {
      name: "new DataList(rows)",
      desc: l.trans({
        en: "Builds a list from an array. A repeated id keeps the last row.",
        ko: "배열로 목록을 만듭니다. id가 겹치면 마지막 행이 남습니다.",
      }),
      example: 'const users = new DataList([{ id: "a", nickname: "Akan" }]);',
    },
    {
      name: "set(row)",
      desc: l.trans({
        en: "Replaces the row with the same id, or appends it. Changes this list and returns it.",
        ko: "같은 id의 행을 바꾸거나, 없으면 뒤에 붙입니다. 이 목록을 직접 바꾸고 그대로 돌려줍니다.",
      }),
      example: 'users.set({ id: "b", nickname: "Akan" });',
    },
    {
      name: "delete(id)",
      desc: l.trans({
        en: "Removes the row with that id. Changes this list and returns it.",
        ko: "그 id의 행을 뺍니다. 이 목록을 직접 바꾸고 그대로 돌려줍니다.",
      }),
    },
    {
      name: "save()",
      desc: l.trans({
        en: "A new DataList with the same rows. Hand this to `this.set()`.",
        ko: "같은 행을 담은 새 DataList입니다. `this.set()`에는 이것을 넘깁니다.",
      }),
    },
    {
      name: ["get(id)", "pick(id)"],
      desc: l.trans({
        en: "The row with that id. `get` returns `undefined` when it is missing; `pick` throws.",
        ko: "그 id의 행입니다. 없으면 `get`은 `undefined`를 돌려주고 `pick`은 에러를 던집니다.",
      }),
      example: 'const user = users.pick("a");',
    },
    {
      name: ["has(id)", "indexOf(id)", "at(idx)", "pickAt(idx)"],
      desc: l.trans({
        en: "Look up by id or position. `indexOf` and `pickAt` throw when nothing is there.",
        ko: "id나 위치로 찾습니다. `indexOf`와 `pickAt`은 찾지 못하면 에러를 던집니다.",
      }),
    },
    {
      name: ["filter", "slice", "sort"],
      desc: l.trans({ en: "Return a new DataList.", ko: "새 DataList를 돌려줍니다." }),
    },
    {
      name: ["map", "forEach", "find", "some", "every", "reduce"],
      desc: l.trans({
        en: "Same as the Array methods. `for...of` works too.",
        ko: "배열 메서드와 똑같습니다. `for...of`도 됩니다.",
      }),
    },
    {
      name: ["values", "length"],
      desc: l.trans({
        en: "The rows as a plain array, and how many there are.",
        ko: "행을 담은 일반 배열과 행 개수입니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="akanjs-base" title="akanjs/base">
        <Docs.Title>akanjs/base</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`akanjs/base` holds the value types models and signals are built from, plus a few runtime helpers. It imports nothing else from Akan, so server files, client files and `common/` can all use it.",
              ko: "`akanjs/base`에는 model과 signal을 만드는 값 타입과 몇 가지 런타임 helper가 들어 있습니다. Akan의 다른 모듈을 가져오지 않으므로 서버 파일, 클라이언트 파일, `common/` 어디서나 import할 수 있습니다.",
            })}
          </div>
          <code className={chip}>{'import { dayjs, enumOf, ID, Int } from "akanjs/base";'}</code>
          <Docs.IntroTable type={l.trans({ en: "Export", ko: "export" })} items={exportRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Where Each Type Goes", ko: "타입별로 쓸 수 있는 자리" })}</Docs.SubSubTitle>
          <Docs.Matrix
            type={l.trans({ en: "Type", ko: "타입" })}
            columns={placeColumns}
            groups={placeGroups}
            markLabel={l.trans({ en: "Can be used", ko: "쓸 수 있음" })}
            emptyLabel={l.trans({ en: "Not used here", ko: "쓰지 않음" })}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Arrays wrap the type.</strong> <code>field([Float])</code> is a list of decimals, and{" "}
                    <code>.body("files", [Upload])</code> takes several files.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>배열은 타입을 대괄호로 감쌉니다.</strong> <code>field([Float])</code>는 소수 목록이고,{" "}
                    <code>.body("files", [Upload])</code>는 파일 여러 개를 받습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The three globals need no import.</strong> Akan extends <code>String</code>,{" "}
                    <code>Boolean</code> and <code>Date</code> so they work as types as they are.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>세 전역은 import하지 않습니다.</strong> Akan이 <code>String</code>, <code>Boolean</code>,{" "}
                    <code>Date</code>를 확장해 두어서 그대로 타입으로 쓸 수 있습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>
            {l.trans({ en: "Values Without a Default", ko: "default가 없을 때의 값" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A required field with no `default` starts at the value below. An `.optional()` field starts at `null`.",
              ko: "`default`가 없는 필수 필드는 아래 값에서 시작합니다. `.optional()` 필드는 `null`에서 시작합니다.",
            })}
          </div>
          <Docs.Table columns={emptyColumns} rows={emptyRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="ID" title="ID">
        <Docs.Title>ID</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`ID` is a document id: a 24-character hex string, not a UUID. Use it for an id a model keeps without a relation, and for id arguments of a signal.",
              ko: "`ID`는 문서 id입니다. UUID가 아니라 24자리 16진수 문자열입니다. relation 없이 id만 저장하는 필드와 signal의 id 인자에 씁니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The file meta scalar keeps the id of a file it does not load:",
              ko: "파일을 불러오지 않고 id만 들고 있는 file meta scalar입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="libs/shared/lib/__scalar/fileMeta/fileMeta.constant.ts"
          language="typescript"
          code={`import { ID, Int } from "akanjs/base";
import { via } from "akanjs/constant";

export class FileMeta extends via((field) => ({
  fileId: field(ID).optional(),
  lastModifiedAt: field(Date),
  size: field(Int),
})) {}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A relation uses the model class.</strong> <code>field(File)</code> stores a relation to a
                    file; <code>field(ID)</code> stores only the id string.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>relation은 model class로 선언합니다.</strong> <code>field(File)</code>은 파일과의 relation을
                    저장하고, <code>field(ID)</code>는 id 문자열만 저장합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The format is checked.</strong> Anything but 24 hex characters is refused. The empty string{" "}
                    <code>""</code> passes as the placeholder for an id not set yet.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>형식을 검사합니다.</strong> 16진수 24자리가 아니면 거절합니다. 빈 문자열 <code>""</code>은
                    아직 정해지지 않은 id의 자리표시로 통과합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Name the owner with ref.</strong>{" "}
                    <code>{'field(ID, { ref: "org", cascade: "removeWith" })'}</code> removes this document when that
                    org is removed.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>주인 model은 ref로 적습니다.</strong>{" "}
                    <code>{'field(ID, { ref: "org", cascade: "removeWith" })'}</code>로 선언하면 그 org가 삭제될 때 이
                    문서도 함께 삭제됩니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="Int" title="Int">
        <Docs.Title>Int</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`Int` is a whole number: counters, quantities, page numbers, metric samples. A value that is not a safe integer is refused.",
              ko: "`Int`는 정수입니다. 카운터, 수량, 페이지 번호, 측정 샘플에 씁니다. 안전한 정수(safe integer)가 아닌 값은 거절합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The access stat scalar counts four things, each starting at zero:",
              ko: "네 가지를 0부터 세는 access stat scalar입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="libs/util/lib/__scalar/accessStat/accessStat.constant.ts"
          language="typescript"
          code={`import { Int } from "akanjs/base";
import { via } from "akanjs/constant";

export class AccessStat extends via((field) => ({
  request: field(Int, { default: 0 }),
  device: field(Int, { default: 0 }),
  ip: field(Int, { default: 0 }),
  country: field(Int, { default: 0 }),
})) {}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>Number</code> is not a type.
                    </strong>{" "}
                    <code>field(Number)</code> and <code>.body("x", Number)</code> fail to typecheck. Pick{" "}
                    <code>Int</code> or <code>Float</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>Number</code>는 타입이 아닙니다.
                    </strong>{" "}
                    <code>field(Number)</code>와 <code>.body("x", Number)</code>는 타입 검사에서 막힙니다.{" "}
                    <code>Int</code>나 <code>Float</code>을 고릅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Text is converted.</strong> A query-string or form value such as <code>"3"</code> arrives as
                    the number <code>3</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>텍스트는 숫자로 바뀝니다.</strong> query string이나 form으로 온 <code>"3"</code>은 숫자{" "}
                    <code>3</code>으로 들어옵니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="Float" title="Float">
        <Docs.Title>Float</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`Float` is any finite number: coordinates, rates, balances, resource metrics. Use it when a fraction is valid data; `NaN` and `Infinity` are refused.",
              ko: "`Float`은 유한한 숫자입니다. 좌표, 비율, 잔액, 리소스 측정값처럼 소수가 의미 있는 값에 씁니다. `NaN`과 `Infinity`는 거절합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The coordinate scalar keeps a longitude/latitude pair and an altitude:",
              ko: "경도·위도 쌍과 고도를 담는 coordinate scalar입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="libs/util/lib/__scalar/coordinate/coordinate.constant.ts"
          language="typescript"
          code={`import { enumOf, Float } from "akanjs/base";
import { via } from "akanjs/constant";

export class CoordinateType extends enumOf("coordinateType", ["Point"] as const) {}

export class Coordinate extends via((field) => ({
  type: field(CoordinateType, { default: "Point" }),
  coordinates: field([Float], { default: [0, 0], example: [127.114367, 37.497114] }),
  altitude: field(Float, { default: 0 }),
})) {}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Whole numbers stay Int.</strong> A count, a quantity or an index is <code>Int</code>, even
                    when it could be stored as a float.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>정수 값은 Int로 둡니다.</strong> 개수, 수량, 인덱스는 float으로 저장할 수 있더라도{" "}
                    <code>Int</code>로 선언합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Text is converted.</strong> <code>"1.5"</code> from a query string arrives as{" "}
                    <code>1.5</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>텍스트는 숫자로 바뀝니다.</strong> query string으로 온 <code>"1.5"</code>는 <code>1.5</code>
                    로 들어옵니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="Any" title="Any">
        <Docs.Title>Any</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`Any` is a value whose shape Akan does not check. Use it for integration payloads and loose metadata; when the shape is stable, declare real fields instead.",
              ko: "`Any`는 Akan이 모양을 검사하지 않는 값입니다. 외부 연동 payload나 형식이 자유로운 metadata에 씁니다. 모양이 정해져 있다면 실제 필드로 선언합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "An event payload that keeps its body open but typed:",
              ko: "body 모양은 열어 두되 타입은 유지하는 event payload입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/__scalar/eventPayload/eventPayload.constant.ts"
          language="typescript"
          code={`import { Any } from "akanjs/base";
import { via } from "akanjs/constant";

export class EventPayload extends via((field) => ({
  body: field<Record<string, unknown>>(Any, { default: () => ({}) }),
})) {}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Name the shape.</strong> The type argument in{" "}
                    <code>{"field<Record<string, unknown>>"}</code> keeps the value typed in TypeScript, though nothing
                    checks it at runtime.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>모양은 타입 인자로 알려 줍니다.</strong> <code>{"field<Record<string, unknown>>"}</code>처럼
                    쓰면 TypeScript 타입이 유지됩니다. 실행 중에 검사하지는 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Give an object default as a function.</strong> A literal <code>{"{}"}</code> is one object
                    shared by every instance; <code>{"() => ({})"}</code> gives each its own.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>객체 default는 함수로 줍니다.</strong> 리터럴 <code>{"{}"}</code>는 모든 인스턴스가 같은
                    객체 하나를 나눠 씁니다. <code>{"() => ({})"}</code>로 주면 인스턴스마다 새로 만듭니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Agents do not get it.</strong> A signal that returns <code>Any</code>, or takes a required{" "}
                    <code>Any</code> argument, is not published to MCP.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>에이전트에게는 공개되지 않습니다.</strong> <code>Any</code>를 반환하거나 필수 인자로{" "}
                    <code>Any</code>를 받는 signal은 MCP에 올라가지 않습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Never carry bytes in Any.</strong> A <code>Buffer</code> becomes{" "}
                  <code>{'{ type: "Buffer", data: [...] }'}</code> in JSON, about 3.6 times the size, and never turns
                  back into bytes. Declare <code>Binary</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>Any에 바이트를 담지 마세요.</strong> <code>Buffer</code>는 JSON에서{" "}
                  <code>{'{ type: "Buffer", data: [...] }'}</code>가 되어 크기가 약 3.6배로 늘고, 다시 바이트로 돌아오지
                  않습니다. <code>Binary</code>로 선언합니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="Binary" title="Binary">
        <Docs.Title>Binary</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`Binary` carries raw bytes in a signal argument or return. It is a `Uint8Array` on both sides, and a Node `Buffer` is one, so you can pass it straight in.",
              ko: "`Binary`는 signal 인자나 반환값으로 바이트를 그대로 주고받습니다. 서버와 클라이언트 모두 `Uint8Array`이고, Node의 `Buffer`도 `Uint8Array`라서 그대로 넘길 수 있습니다.",
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            <div className={card}>
              <div className="font-semibold text-primary">
                {l.trans({ en: "Requests and Responses", ko: "요청과 응답" })}
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: "Sent as a base64 string in JSON. Either side accepts base64 or bytes.",
                  ko: "JSON 안에서 base64 문자열로 오갑니다. 양쪽 모두 base64와 바이트를 다 받습니다.",
                })}
              </div>
            </div>
            <div className={card}>
              <div className="font-semibold text-primary">pubsub(Binary)</div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: "Sent as a websocket binary frame, with no JSON and no base64. Only when the whole return is Binary.",
                  ko: "JSON도 base64도 없이 websocket binary frame으로 보냅니다. 반환 타입 전체가 Binary일 때만 해당합니다.",
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: "A stream endpoint with one lossy room and one room that must see every frame:",
              ko: "최신 프레임만 받으면 되는 room과, 모든 프레임을 받아야 하는 room을 둔 stream endpoint입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/_stream/stream.signal.ts"
          language="typescript"
          code={`import { Every } from "@libs/shared/srvkit";
import { Binary, ID } from "akanjs/base";
import { endpoint } from "akanjs/signal";

import * as srv from "../srv";

export class StreamEndpoint extends endpoint(srv.stream, ({ pubsub }) => ({
  chunkReceived: pubsub(Binary, { guards: [Every] })
    .room("channel", String)
    .exec(() => undefined),
  patchReceived: pubsub(Binary, { guards: [Every], backpressure: "queue" })
    .room("docId", ID)
    .exec(() => undefined),
})) {}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A slow subscriber gets the newest frame.</strong> By default a <code>pubsub(Binary)</code>{" "}
                    room keeps only the latest frame, which suits telemetry and video.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>느린 구독자는 최신 프레임만 받습니다.</strong> 기본적으로 <code>pubsub(Binary)</code> room은
                    가장 최근 프레임만 남깁니다. 텔레메트리나 영상에 맞는 동작입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>{'backpressure: "queue"'}</code> keeps every frame.
                    </strong>{" "}
                    Use it for a sequence such as deltas; the send buffer then grows with the slowest subscriber.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>{'backpressure: "queue"'}</code>는 모든 프레임을 보냅니다.
                    </strong>{" "}
                    delta처럼 하나도 빠지면 안 되는 흐름에 씁니다. 대신 전송 버퍼가 가장 느린 구독자만큼 커집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Agents do not get it.</strong> A signal that returns <code>Binary</code> is not published to
                    MCP.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>에이전트에게는 공개되지 않습니다.</strong> <code>Binary</code>를 반환하는 signal은 MCP에
                    올라가지 않습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Binary is never a model field.</strong> A model that declares <code>field(Binary)</code> fails
                  to load. Keep the bytes in a <code>File</code> model and store a relation to it.
                </span>
              ),
              ko: (
                <span>
                  <strong>Binary는 model 필드가 될 수 없습니다.</strong> <code>field(Binary)</code>를 선언한 model은
                  로드되지 않습니다. 바이트는 <code>File</code> model에 두고 그 relation을 저장합니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="Upload" title="Upload">
        <Docs.Title>Upload</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`Upload` is a file in the body of the upload mutation, and nowhere else. An app that mounts `libs/shared` already has that mutation:",
              ko: "`Upload`는 업로드 mutation의 body로 받는 파일이고, 다른 곳에는 쓰지 않습니다. `libs/shared`를 쓰는 앱에는 이 mutation이 이미 있습니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="libs/shared/lib/file/file.signal.ts"
          language="typescript"
          code={`import { Every } from "@libs/shared/srvkit";
import { dayjs, ID, Upload } from "akanjs/base";
import { endpoint } from "akanjs/signal";

import * as cnst from "../cnst";
import type * as db from "../db";
import * as srv from "../srv";

export class FileEndpoint extends endpoint(srv.file, ({ mutation }) => ({
  addFiles: mutation([cnst.File], { guards: [Every], fileUpload: true, mcp: false })
    .body("files", [Upload])
    .body("metas", String)
    .body("type", String)
    .body("parentId", ID, { nullable: true })
    .exec(async function (files, metas, type, parentId) {
      const parsedMetas = (global.JSON.parse(metas) as db.FileMeta[]).map((meta) => ({
        ...meta,
        lastModifiedAt: dayjs(meta.lastModifiedAt),
      }));
      return await this.fileService.addFiles(files, parsedMetas, type, parentId);
    }),
})) {}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Only with <code>fileUpload: true</code>.
                    </strong>{" "}
                    <code>Upload</code> is valid only in the body of a mutation flagged this way, and that mutation is
                    never published to MCP.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>fileUpload: true</code>가 있어야 합니다.
                    </strong>{" "}
                    <code>Upload</code>는 이 표시가 붙은 mutation의 body에서만 유효하고, 그 mutation은 MCP에 올라가지
                    않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One per app.</strong> The generated <code>{"fetch.add<Model>Files(fileList)"}</code> and
                    store action <code>{"upload<Field>On<Model>(fileList)"}</code> both post to the mutation marked{" "}
                    <code>fileUpload: true</code>. With two, only the first is used.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>앱에 하나만 둡니다.</strong> 자동 생성되는 <code>{"fetch.add<Model>Files(fileList)"}</code>
                    와 store action <code>{"upload<Field>On<Model>(fileList)"}</code>이 모두{" "}
                    <code>fileUpload: true</code> mutation으로 보냅니다. 둘이면 첫 번째만 쓰입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The body is fixed.</strong> The client always sends <code>files</code>, <code>metas</code>,{" "}
                    <code>type</code> and <code>parentId</code>, and <code>fileList</code> may be a <code>File[]</code>{" "}
                    or the <code>FileList</code> from <code>input.files</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>body 구성은 정해져 있습니다.</strong> 클라이언트는 항상 <code>files</code>,{" "}
                    <code>metas</code>, <code>type</code>, <code>parentId</code>를 보냅니다. <code>fileList</code>에는{" "}
                    <code>File[]</code>나 <code>input.files</code>의 <code>FileList</code>를 넘깁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Models reference <code>File</code>.
                    </strong>{" "}
                    Declare <code>image: field(File).optional()</code> or <code>images: field([File])</code>, never{" "}
                    <code>field(Upload)</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      model은 <code>File</code>을 참조합니다.
                    </strong>{" "}
                    <code>field(Upload)</code>가 아니라 <code>image: field(File).optional()</code>이나{" "}
                    <code>images: field([File])</code>로 선언합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="dayjs / Dayjs" title="dayjs / Dayjs">
        <Docs.Title>dayjs / Dayjs</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`akanjs/base` re-exports the `dayjs` function and its `Dayjs` type. Every `Date` field holds a `Dayjs`, so documents, stores, services and UI all use the same API.",
              ko: "`akanjs/base`는 `dayjs` 함수와 `Dayjs` 타입을 다시 내보냅니다. `Date` 필드의 값은 모두 `Dayjs`라서 document, store, service, UI가 같은 API를 씁니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "A date field whose default is the moment each record is made:",
              ko: "레코드가 만들어지는 순간을 default로 갖는 날짜 필드입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="libs/util/lib/__scalar/accessLog/accessLog.constant.ts"
          language="typescript"
          code={`import { dayjs, Int } from "akanjs/base";
import { via } from "akanjs/constant";

export class AccessLog extends via((field) => ({
  period: field(Int, { default: 0 }),
  at: field(Date, { default: () => dayjs() }),
})) {}`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "Reading the value is ordinary dayjs; import the type the same way:",
              ko: "값을 읽을 때는 평범한 dayjs 코드입니다. 타입도 같은 곳에서 import합니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/common/dayLabel.ts"
          language="typescript"
          code={`import { type Dayjs, dayjs } from "akanjs/base";

export const dayLabel = (at: Dayjs) => (at.isSame(dayjs(), "day") ? at.format("HH:mm") : at.format("YYYY-MM-DD"));`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Import it from <code>akanjs/base</code>.
                    </strong>{" "}
                    Pages and module files may not import a third-party package, so{" "}
                    <code>{'import dayjs from "dayjs"'}</code> fails lint there.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>akanjs/base</code>에서 import합니다.
                    </strong>{" "}
                    page와 module 파일은 외부 패키지를 직접 import할 수 없어서, 거기서{" "}
                    <code>{'import dayjs from "dayjs"'}</code>는 lint에 걸립니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>"Now" is a function.</strong> <code>{"default: () => dayjs()"}</code> runs for each record;{" "}
                    <code>default: dayjs()</code> would freeze the time the module loaded.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>"지금"은 함수로 줍니다.</strong> <code>{"default: () => dayjs()"}</code>는 레코드마다
                    실행되지만, <code>default: dayjs()</code>는 모듈을 불러온 시각에 고정됩니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="enumOf" title="enumOf">
        <Docs.Title>enumOf</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`enumOf(name, values)` turns a fixed list of values into an enum class. Use the class as a field or argument type; its static helpers read the list.",
              ko: "`enumOf(name, values)`는 정해진 값 목록으로 enum class를 만듭니다. 이 class를 필드나 인자 타입으로 쓰고, static helper로 목록을 읽습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "A job status declared once and used as a field:",
              ko: "한 번 선언하고 필드 타입으로 쓰는 job 상태입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/job/job.constant.ts"
          language="typescript"
          code={`import { enumOf } from "akanjs/base";
import { via } from "akanjs/constant";

export class JobStatus extends enumOf("jobStatus", ["ready", "running", "done"] as const) {}

export class JobInput extends via((field) => ({
  status: field(JobStatus, { default: "ready" }),
})) {}`}
        />
        <Docs.Description>
          <Docs.SubSubTitle>{l.trans({ en: "Static Helpers", ko: "static helper" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Member", ko: "멤버" })} items={enumRows} />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      camelCase name, <code>as const</code> list.
                    </strong>{" "}
                    The first argument names the enum; without <code>as const</code> the values widen to{" "}
                    <code>string</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      이름은 camelCase, 목록에는 <code>as const</code>를 붙입니다.
                    </strong>{" "}
                    첫 인자가 enum의 이름입니다. <code>as const</code>가 없으면 값 타입이 <code>string</code>으로
                    넓어집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The list decides the type.</strong> Strings make a <code>String</code> enum, whole numbers
                    an <code>Int</code> enum, other numbers a <code>Float</code> enum. An empty list throws.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>값 목록이 타입을 정합니다.</strong> 문자열이면 <code>String</code>, 정수면 <code>Int</code>,
                    그 밖의 숫자면 <code>Float</code> enum이 됩니다. 빈 목록은 에러를 던집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Signal arguments are checked.</strong> An argument typed with an enum refuses any value
                    outside the list.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>signal 인자는 검사됩니다.</strong> enum 타입 인자는 목록에 없는 값을 거절합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Labels live in the dictionary.</strong> Translate each value in the module dictionary's{" "}
                    <code>.enum()</code> stage.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>표시 이름은 dictionary에 둡니다.</strong> 각 값의 번역은 module dictionary의{" "}
                    <code>.enum()</code> 단계에 적습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="getEnv" title="getEnv">
        <Docs.Title>getEnv</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`getEnv()` tells running code about its app: the name, the environment, and where the web and API servers are. The first call reads the environment variables; later calls return the same cached object.",
              ko: "`getEnv()`는 실행 중인 코드에 앱 정보를 알려 줍니다. 앱 이름, 환경, 웹 서버와 API 서버의 주소입니다. 첫 호출 때 환경 변수를 읽고, 그 뒤에는 캐시한 같은 객체를 돌려줍니다.",
            })}
          </div>
          <Docs.OptionTable items={envRows} />
          <div>
            {l.trans({
              en: "A helper that builds the app's public host from the env:",
              ko: "env로 앱의 공개 호스트를 만드는 helper입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/srvkit/publicHost.ts"
          language="typescript"
          code={`import { getEnv } from "akanjs/base";

export const publicHost = () => {
  const { operationMode, appName, environment, serveDomain } = getEnv();
  if (operationMode === "local") return "localhost";
  return \`\${appName}-\${environment}.\${serveDomain}\`;
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Runs on both sides.</strong> <code>side</code> says whether the code is on the server or in
                    the browser.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>서버와 브라우저 양쪽에서 동작합니다.</strong> 어느 쪽인지는 <code>side</code>로 알 수
                    있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The types are exported too.</strong> <code>ClientEnv</code> is what <code>getEnv()</code>{" "}
                    returns, <code>Environment</code> is the union of environment names, and <code>BackendEnv</code>{" "}
                    types the server options.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>타입도 함께 export됩니다.</strong> <code>ClientEnv</code>는 <code>getEnv()</code>의 반환
                    타입, <code>Environment</code>는 환경 이름의 union, <code>BackendEnv</code>는 서버 옵션의
                    타입입니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Call getEnv() inside a function, never at module scope.</strong> <code>akan build</code> loads
                  modules without the three required variables, and <code>getEnv()</code> throws there. Use a method
                  body, a default thunk, or <code>{"env(() => getEnv())"}</code> in an <code>adapt()</code> class.
                </span>
              ),
              ko: (
                <span>
                  <strong>getEnv()는 함수 안에서 부르고, 모듈 최상위에서는 부르지 마세요.</strong>{" "}
                  <code>akan build</code>는 필수 환경 변수 세 개 없이 모듈을 불러오므로 그 자리에서{" "}
                  <code>getEnv()</code>가 에러를 던집니다. 메서드 본문, default thunk, 또는 <code>adapt()</code> class의{" "}
                  <code>{"env(() => getEnv())"}</code> 안에서 부릅니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="getApiPrefix / getWsPrefix" title="getApiPrefix / getWsPrefix">
        <Docs.Title>getApiPrefix / getWsPrefix</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`getApiPrefix()` returns the path signals are served under, and `getWsPrefix()` the websocket's path under it. Build URLs with them instead of writing `/api` or `/ws`, because an app can move both.",
              ko: "`getApiPrefix()`는 signal이 붙는 경로를, `getWsPrefix()`는 그 아래 websocket 경로를 돌려줍니다. 앱이 두 경로를 옮길 수 있으므로 `/api`나 `/ws`를 직접 쓰지 말고 이 함수로 URL을 만듭니다.",
            })}
          </div>
          <Docs.Table columns={prefixColumns} rows={prefixRows} stacked />
          <div>
            {l.trans({
              en: "The OAuth consent page posts to a signal endpoint under the prefix:",
              ko: "prefix 아래의 signal endpoint로 form을 보내는 OAuth 동의 페이지입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="libs/shared/page/oauth/consent/_index.tsx"
          language="tsx"
          code={`import { usePage } from "@libs/shared/client";
import { getApiPrefix } from "akanjs/base";
import { page } from "akanjs/client";
import { buttonRecipe } from "akanjs/ui";

export default page()
  .search("request", String)
  .render(({ request }) => {
    const { l } = usePage();
    const approveAction = \`\${getApiPrefix()}/approveOAuthConsent/\${request ?? ""}\`;
    return (
      <form method="post" action={approveAction}>
        <button type="submit" className={buttonRecipe({ variant: "primary" })}>
          {l("oauth.approve")}
        </button>
      </form>
    );
  });`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A leading slash, never a trailing one.</strong> Appending <code>"/path"</code> is always
                    safe. A blank value or a bare <code>/</code> counts as not set.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>앞에는 슬래시가 있고 뒤에는 없습니다.</strong> 뒤에 <code>"/path"</code>를 붙이면 됩니다. 빈
                    값이나 <code>/</code> 하나는 설정하지 않은 것으로 봅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The websocket sits under the API prefix.</strong> The client connects to{" "}
                    <code>serverHttpUri</code> plus <code>getWsPrefix()</code>, which is{" "}
                    <code>ws://localhost:8282/api/ws</code> by default.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>websocket은 API prefix 아래에 있습니다.</strong> 클라이언트는 <code>serverHttpUri</code>{" "}
                    뒤에 <code>getWsPrefix()</code>를 붙인 곳에 연결하며, 기본값은{" "}
                    <code>ws://localhost:8282/api/ws</code>입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Call it where you build the URL.</strong> A moved prefix reaches the browser too, so there
                    is no need to pass it down as a prop.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>URL을 만드는 자리에서 부릅니다.</strong> 옮긴 prefix는 브라우저까지 전달되므로 prop으로
                    내려줄 필요가 없습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="DataList" title="DataList">
        <Docs.Title>DataList</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`DataList` is a list of light models that also finds rows by `id`. Every list a slice puts in a store is one: `<model>List`, `<model>InitList` and `<model>Selection`.",
              ko: "`DataList`는 light model을 담고 `id`로도 행을 찾는 목록입니다. slice가 store에 두는 목록인 `<model>List`, `<model>InitList`, `<model>Selection`이 모두 DataList입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "A store action that puts an updated admin back into its list:",
              ko: "수정된 admin을 목록에 다시 넣는 store action입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="libs/shared/lib/admin/admin.store.ts"
          language="typescript"
          code={`import { store } from "akanjs/store";

import * as cnst from "../cnst";
import { fetch, sig } from "../useClient";

export class AdminStore extends store(sig.admin, () => ({
  me: new cnst.Admin(),
})) {
  async addAdminRole(adminId: string, role: cnst.AdminRole["value"]) {
    const admin = await fetch.addAdminRole(adminId, role);
    const { adminList } = this.get();
    this.set({ adminList: adminList.set(admin).save() });
  }
}`}
        />
        <Docs.Description>
          <Docs.Alert type="info">
            {l.trans({
              en: (
                <span>
                  <strong>
                    Finish with <code>.save()</code>.
                  </strong>{" "}
                  <code>set</code> and <code>delete</code> change the list in place, so the store would still hold the
                  same object. <code>.save()</code> hands it a new one it can tell has changed.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    마지막에 <code>.save()</code>를 붙입니다.
                  </strong>{" "}
                  <code>set</code>과 <code>delete</code>는 목록을 직접 바꾸므로, 그대로 넣으면 store 입장에서는 같은
                  객체입니다. <code>.save()</code>가 바뀐 것을 알아챌 수 있는 새 목록을 만들어 줍니다.
                </span>
              ),
            })}
          </Docs.Alert>
          <Docs.SubSubTitle>{l.trans({ en: "Methods", ko: "메서드" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Member", ko: "멤버" })} items={dataListRows} />
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
