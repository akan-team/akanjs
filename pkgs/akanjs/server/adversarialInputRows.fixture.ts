import {
  INVALID_UTF8,
  mcpCallText,
  type ProbeArgName,
  type Transport,
  type WireEntry,
} from "./adversarialInput.fixture";

export const MISSING = Symbol("missing");

export interface ByDesignRefusal {
  transport: Transport;
  code: string;
  reason: string;
}

export interface ByDesignReading {
  transport: Transport;
  readAs: WireEntry[];
  reason: string;
}

export interface AdversarialRow {
  title: string;
  why: string;
  entries: WireEntry[];
  byDesign?: ByDesignRefusal | ByDesignReading;
  finding?: string;
}

const baseArgs: Record<ProbeArgName, string> = {
  name: `"alpha"`,
  id: `"0123456789abcdef01234567"`,
  count: "3",
  ratio: "1.5",
  flag: "true",
  when: `"2024-01-02T03:04:05.000Z"`,
  tags: `["a","b"]`,
  status: `"draft"`,
  payload: `{"label":"x","size":1,"labels":["y"],"meta":{"k":"v"}}`,
  note: `"n"`,
};

const payloadWith = (fields: string) => `{"label":"x","size":1,"labels":["y"],"meta":{"k":"v"},${fields}}`;
const nested = (depth: number) => `${"[".repeat(depth)}"a"${"]".repeat(depth)}`;

const row = (
  title: string,
  why: string,
  overrides: Partial<Record<ProbeArgName, string | typeof MISSING>> = {},
  extra: WireEntry[] = [],
): AdversarialRow => {
  const entries: WireEntry[] = [];
  for (const [name, json] of Object.entries({ ...baseArgs, ...overrides })) {
    if (json !== MISSING) entries.push([name, json as string]);
  }
  return { title, why, entries: [...entries, ...extra] };
};

const mcpRefusesUndeclared: ByDesignRefusal = {
  transport: "mcp",
  code: "invalidArgument",
  reason: "MCP refuses an undeclared argument name, since agents ignore additionalProperties: false",
};

export const adversarialRows: AdversarialRow[] = [
  row("valid baseline", "every transport must agree on an ordinary call before any hostile row means anything"),
  {
    ...row("__proto__ as an extra top-level argument", "a merge of the body into an object would pollute", {}, [
      ["__proto__", `{"polluted":true}`],
    ]),
    byDesign: mcpRefusesUndeclared,
  },
  {
    ...row("constructor.prototype as an extra top-level argument", "the classic lodash-merge pollution path", {}, [
      ["constructor", `{"prototype":{"polluted":true}}`],
    ]),
    byDesign: mcpRefusesUndeclared,
  },
  row("__proto__ inside the scalar argument", "the scalar walker copies declared fields only", {
    payload: payloadWith(`"__proto__":{"polluted":true}`),
  }),
  row("__proto__, constructor and prototype as map keys", "a Map field is rebuilt with Object.fromEntries", {
    payload: `{"label":"x","size":1,"labels":["y"],"meta":{"__proto__":"p","constructor":"c","prototype":"q"}}`,
  }),
  row("an array where a String is declared", "String coercion would flatten it", { name: `["alpha"]` }),
  row("an object where a String is declared", "String coercion would print [object Object]", { name: `{"a":1}` }),
  {
    ...row("a bare string where [String] is declared", "a handler typed for a list must never get a string", {
      tags: `"a"`,
    }),
    byDesign: {
      transport: "mcp",
      readAs: row("", "", { tags: `["a"]` }).entries,
      reason: "MCP lifts a lone value into a one-item array, since models send a bare value for an array",
    },
  },
  row("nested arrays where [String] is declared", "the element parser sees an array", { tags: `[["a"]]` }),
  row("non-strings inside [String]", "each element is coerced or refused", { tags: `[1,{"x":1},null]` }),
  row("a numeric string for Int", "query strings carry numbers as text, JSON bodies should not need to", {
    count: `"3"`,
  }),
  row("-0 for Int", "JSON.parse keeps the sign; a safe-integer check passes it", { count: "-0" }),
  row("1e400 for Int", "JSON.parse turns it into Infinity", { count: "1e400" }),
  row("2^53 + 1 for Int", "JSON.parse rounds it to 2^53 silently", { count: "9007199254740993" }),
  row("a fraction for Int", "Int must refuse a non-integer", { count: "1.5" }),
  row("an empty string for Int", "Number('') is 0", { count: `""` }),
  row("a boolean for Int", "Number(true) is 1", { count: "true" }),
  row("NaN as text for Float", "Number('NaN') is NaN", { ratio: `"NaN"` }),
  row("Infinity as text for Float", "Number('Infinity') is Infinity", { ratio: `"Infinity"` }),
  row("the string false for Boolean", "a truthiness check would read it as true", { flag: `"false"` }),
  row("an unknown word for Boolean", "must not default to either value silently", { flag: `"yes"` }),
  row("a 1 MiB string", "oversized input must not crash or hang a transport", { name: `"${"a".repeat(1 << 20)}"` }),
  row("arrays nested 4096 deep", "deep nesting stresses recursive parsers", { tags: nested(4096) }),
  {
    ...row("an unknown extra field", "the transports disagree on whether a stray name is an error", {}, [
      ["extra", "1"],
    ]),
    byDesign: mcpRefusesUndeclared,
  },
  row("null for a required String", "null and missing must refuse alike", { name: "null" }),
  row("a missing required String", "null and missing must refuse alike", { name: MISSING }),
  row("an empty string for a required String", "empty is a value, not a missing argument", { name: `""` }),
  row("null for the nullable last argument", "null is allowed there", { note: "null" }),
  row("the nullable last argument left out", "missing is allowed there", { note: MISSING }),
  row("an ID longer than 24 hex digits", "ids are 24 hex digits", { id: `"0123456789abcdef0123456789"` }),
  row("a path-traversal ID", "ids reach file and database lookups", { id: `"../../../etc/passwd"` }),
  row("an ID with a NUL byte", "C-string consumers truncate at NUL", { id: `"0123456789abcdef0123456\\u0000"` }),
  row("an ID in full-width digits", "unicode lookalikes of hex digits", {
    id: `"０１２３４５６７８９ａｂｃｄｅｆ０１２３４５６７"`,
  }),
  row("an empty ID", "the parser keeps an empty id as the unset placeholder", { id: `""` }),
  row("a lone high surrogate", "UTF-16 that no UTF-8 encoder can carry", { name: `"a\\ud800b"` }),
  {
    ...row("invalid UTF-8 bytes in a string", "decoders replace, refuse or crash", { name: `"${INVALID_UTF8}"` }),
    byDesign: {
      transport: "ws",
      code: "invalidMessage",
      reason:
        "Bun closes a text frame that is not UTF-8 (RFC 6455 8.1), so those bytes arrive only as a binary frame, which no signal reads",
    },
  },
  row("a duplicate key", "JSON.parse keeps the last value, other parsers the first", {}, [["name", `"beta"`]]),
  row("CRLF and control characters in a String", "header and log injection carriers", {
    name: `"a\\r\\nSet-Cookie: x=1\\u0000\\u001b[31m"`,
  }),
  row("an enum value off the list", "the enum must refuse it", { status: `"archived"` }),
  row("an enum value in the wrong case", "the enum must not normalise case", { status: `"DRAFT"` }),
  row("__proto__ as an enum value", "an object-backed lookup would find it", { status: `"__proto__"` }),
  row("constructor as an enum value", "an object-backed lookup would find it", { status: `"constructor"` }),
  row("a word for Date", "dates that are not dates", { when: `"not-a-date"` }),
  row("an out-of-range calendar date", "lenient date parsers roll it over", { when: `"2024-13-45"` }),
  row("an empty string for Date", "dayjs('') is invalid", { when: `""` }),
  row("a boolean for Date", "new Date(true) is the epoch plus 1 ms", { when: "true" }),
  row("a timestamp past the Date range", "new Date(1e20) is invalid", { when: "1e20" }),
  row("a string where the scalar is declared", "the scalar walker expects an object", { payload: `"x"` }),
  row("an array where the scalar is declared", "the scalar walker expects an object", { payload: "[]" }),
  row("a numeric string inside the scalar's Int", "fields inside a scalar use strict wire types", {
    payload: `{"label":"x","size":"1","labels":["y"],"meta":{"k":"v"}}`,
  }),
  row("null for the required scalar", "null and missing must refuse alike", { payload: "null" }),
];

export interface EnvelopeRow {
  title: string;
  why: string;
  wire: Partial<Record<Transport, string>>;
  refusal: Partial<Record<Transport, { status: number; code: string | null }>>;
  finding?: string;
}

const validFrameData = `"alpha","0123456789abcdef01234567",3,1.5,true,"2024-01-02T03:04:05.000Z",["a"],"draft",{"label":"x","size":1,"labels":[],"meta":{}}`;
const routeNotFound = { status: 404, code: "routeNotFound" };
const unknownTool = { status: 400, code: "unknownTool" };

const prototypeName = (name: string): EnvelopeRow => ({
  title: `${name} as the endpoint name`,
  why: "a route table that is a plain object answers inherited names",
  wire: { ws: `{"key":"${name}","data":[${validFrameData}]}`, mcp: mcpCallText(name, "{}") },
  refusal: { ws: routeNotFound, mcp: unknownTool },
});

export const envelopeRows: EnvelopeRow[] = [
  {
    title: "a body that is not JSON",
    why: "every transport parses its own envelope",
    wire: { http: "{", ws: "{", mcp: "{" },
    refusal: {
      http: { status: 400, code: "The request body is not JSON" },
      ws: { status: 400, code: "invalidMessage" },
      mcp: { status: 400, code: null },
    },
  },
  {
    title: "a body that is a JSON array",
    why: "an array has numeric keys a positional reader would take as arguments",
    wire: { http: `[${validFrameData}]`, ws: `[${validFrameData}]`, mcp: `[${validFrameData}]` },
    refusal: {
      http: { status: 400, code: "A JSON body is an object of the endpoint's body arguments" },
      ws: { status: 400, code: "invalidMessage" },
      mcp: { status: 400, code: null },
    },
  },
  {
    title: "a body that is a JSON string",
    why: "a string has indexes and a length",
    wire: { http: `"alpha"`, ws: `"alpha"`, mcp: `"alpha"` },
    refusal: {
      http: { status: 400, code: "A JSON body is an object of the endpoint's body arguments" },
      ws: { status: 400, code: "invalidMessage" },
      mcp: { status: 400, code: null },
    },
  },
  {
    title: "a body that is JSON null",
    why: "null passes a typeof object check",
    wire: { http: "null", ws: "null", mcp: "null" },
    refusal: {
      http: { status: 400, code: "A JSON body is an object of the endpoint's body arguments" },
      ws: { status: 400, code: "invalidMessage" },
      mcp: { status: 400, code: null },
    },
  },
  {
    title: "arguments that are an array of the values",
    why: "MCP and HTTP name their arguments, so a positional array must not be read by index",
    wire: { mcp: mcpCallText("probeWrite", `[${validFrameData}]`) },
    refusal: { mcp: { status: 400, code: "invalidArgument" } },
  },
  {
    title: "frame arguments that are a string",
    why: "a string has indexes, so a positional reader takes its characters as arguments",
    wire: { ws: `{"key":"probeSend","data":"alpha"}`, mcp: mcpCallText("probeWrite", `"alpha"`) },
    refusal: { ws: { status: 400, code: "invalidMessage" }, mcp: { status: 400, code: "invalidArgument" } },
  },
  {
    title: "frame arguments that are null",
    why: "null is where an array is read",
    wire: { ws: `{"key":"probeSend","data":null}` },
    refusal: { ws: { status: 400, code: "invalidMessage" } },
  },
  {
    title: "frame arguments left out",
    why: "undefined is where an array is read",
    wire: { ws: `{"key":"probeSend"}` },
    refusal: { ws: { status: 400, code: "invalidMessage" } },
  },
  {
    title: "an endpoint name nobody registered",
    why: "the control for the inherited-name rows below",
    wire: { ws: `{"key":"nope","data":[]}`, mcp: mcpCallText("nope", "{}") },
    refusal: { ws: routeNotFound, mcp: unknownTool },
  },
  {
    title: "a message endpoint called as an MCP tool",
    why: "MCP publishes only queries and mutations, so a message endpoint is not a tool",
    wire: { mcp: mcpCallText("probeSend", "{}") },
    refusal: { mcp: unknownTool },
  },
  prototypeName("constructor"),
  prototypeName("__proto__"),
  prototypeName("toString"),
  prototypeName("valueOf"),
  prototypeName("hasOwnProperty"),
];
