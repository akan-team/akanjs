import { describe, expect, test } from "bun:test";
import { Any, Int } from "akanjs/base";
import { InputParser, serialize } from "akanjs/constant";
import { websocketBinaryFrameContract, websocketRoomContract } from "../common/websocketContract";
import type { ArgInfo } from "./endpointInfo";
import { RoomKey } from "./roomKey";

const SEED = 0x360;
const CASES = 3000;
const MAX_ROOM_BYTES = 0xffff;

const pieces = [
  "-",
  "--",
  "%",
  "%2D",
  "%2d",
  "%u002D",
  "%25",
  "~",
  "~-",
  "::",
  ":",
  "",
  " ",
  "a",
  "b",
  "Z",
  "0",
  ".",
  "_",
  "u",
  "%u",
  "\u0000",
  "\r\n",
  "\t",
  "é",
  "é",
  "한",
  "\ud800",
  "\udfff",
  "😀",
  "‐",
  "－",
  "../",
  '"',
  "\\",
  "{",
  "}",
  "[",
  "]",
  ",",
  "null",
] as const;
const hostileKeys = ["%map", "%set", "%bytes", "%regexp", "toJSON", "constructor", "prototype", "id", "a", "a-b"];
const ints = [0, 1, -1, 7, 2 ** 31, -(2 ** 31), Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER];

class Gen {
  #state: number;
  constructor(seed: number) {
    this.#state = seed >>> 0;
  }
  next() {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(max: number) {
    return Math.floor(this.next() * max);
  }
  chance(p: number) {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)] as T;
  }
  string(): string {
    if (this.chance(0.01)) return this.pick(["a", "-", "한", "\ud800", "%"]).repeat(4000 + this.int(14000));
    let text = "";
    for (let count = this.int(5); count > 0; count--) text += this.pick(pieces);
    return text;
  }
  json(withProto: boolean, depth = 0): unknown {
    const kind = this.int(depth > 2 ? 4 : 6);
    if (kind === 0) return null;
    if (kind === 1) return this.chance(0.5);
    if (kind === 2) return this.pick(ints);
    if (kind === 3) return this.string();
    if (kind === 4) return Array.from({ length: this.int(3) }, () => this.json(withProto, depth + 1));
    const keys = withProto ? [...hostileKeys, "__proto__"] : hostileKeys;
    return Object.fromEntries(
      Array.from({ length: this.int(3) }, () => [
        this.chance(0.6) ? this.pick(keys) : this.string(),
        this.json(withProto, depth + 1),
      ]),
    );
  }
}

const argOf = (name: string, argRef: unknown, arrDepth = 0, nullable = false): ArgInfo =>
  ({ type: "room", name, argRef, arrDepth, option: { nullable } }) as ArgInfo;

interface Signature {
  args: ArgInfo[];
  values: (gen: Gen) => unknown[];
}

const signatures: Record<string, Signature> = {
  ping: { args: [], values: () => [] },
  chat: { args: [argOf("channel", String)], values: (gen) => [gen.string()] },
  pair: { args: [argOf("left", String), argOf("right", String)], values: (gen) => [gen.string(), gen.string()] },
  maybe: {
    args: [argOf("first", String), argOf("second", String, 0, true)],
    values: (gen) => [gen.string(), gen.chance(0.3) ? null : gen.string()],
  },
  mixed: {
    args: [argOf("label", String), argOf("count", Int), argOf("flag", Boolean)],
    values: (gen) => [gen.string(), gen.pick(ints), gen.chance(0.5)],
  },
  list: {
    args: [argOf("tags", String, 1)],
    values: (gen) => [Array.from({ length: gen.int(4) }, () => gen.string())],
  },
  json: { args: [argOf("filter", Any, 0, true)], values: (gen) => [gen.json(false)] },
};
const stringKeys = ["ping", "chat", "pair", "maybe"];
const keys = Object.keys(signatures);

interface Tuple {
  key: string;
  values: unknown[];
}

const tupleOf = (gen: Gen, from: readonly string[] = keys): Tuple => {
  const key = gen.pick(from);
  return { key, values: signatures[key].values(gen) };
};
const roomOf = ({ key, values }: Tuple) => RoomKey.idOf(key, signatures[key].args, values);

const identityOf = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(identityOf);
  if (value && typeof value === "object")
    return Object.keys(value)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .map((key) => [key, identityOf((value as Record<string, unknown>)[key])]);
  return value;
};
const identity = (tuple: Tuple) => JSON.stringify([tuple.key, identityOf(tuple.values)]);

const show = (value: unknown) =>
  JSON.stringify(value, (_key, item) =>
    typeof item === "string" && item.length > 120 ? `${item.slice(0, 40)}…(${item.length} code units)` : item,
  );

const forAll = <T>(property: string, generate: (gen: Gen) => T, broken: (input: T) => unknown) => {
  const gen = new Gen(SEED);
  for (let index = 0; index < CASES; index++) {
    const input = generate(gen);
    const failure = broken(input);
    if (failure) expect({ property, seed: SEED, case: index, input: show(input), failure: show(failure) }).toBeNull();
  }
};

const tokenPattern = /^(?:~|(?:[A-Za-z0-9_.]|%[0-9A-F]{2}|%u[0-9A-F]{4})*)$/;

const decodeToken = (token: string): string | null | undefined => {
  if (token === "~") return null;
  if (!tokenPattern.test(token)) return undefined;
  return token.replace(/%u([0-9A-F]{4})|%([0-9A-F]{2})/g, (_match, wide: string | undefined, narrow: string) =>
    String.fromCharCode(Number.parseInt(wide ?? narrow, 16)),
  );
};

const decodeRoom = (roomId: string): { key: string; values: (string | null)[] } | null => {
  const [key, ...tokens] = roomId.split("-");
  if (!/^[A-Za-z0-9]+$/.test(key)) return null;
  const values = tokens.map(decodeToken);
  if (values.some((value) => value === undefined)) return null;
  return { key, values: values as (string | null)[] };
};

const swapFirst = (text: string, from: string, to: string) => {
  const at = text.indexOf(from);
  return at < 0 ? text : `${text.slice(0, at)}${to}${text.slice(at + from.length)}`;
};

const mutationsOf = (roomId: string) =>
  [
    roomId.replace(/%([0-9A-F]{2})/, (_match, hex: string) => `%${hex.toLowerCase()}`),
    swapFirst(roomId, "%2D", "-"),
    swapFirst(roomId, "%7E", "~"),
    roomId.replace(/-~(?=-|$)/, "-%7E"),
    swapFirst(roomId, "%", "%25"),
    roomId.replace(/%([0-9A-F]{2})/, (_match, hex: string) => `%u00${hex}`),
    roomId.replace(/%u([0-9A-F]{4})/, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))),
    swapFirst(roomId, "-", "--"),
    roomId.replace(/-[^-]*$/, ""),
    `${roomId}-`,
    `${roomId}-~`,
    `${roomId}::`,
  ].filter((mutated) => mutated !== roomId);

const publisherMissesSubscriber = (tuple: Tuple) => {
  const args = signatures[tuple.key].args;
  const received = args.map((arg, idx) => {
    const nullable = arg.option?.nullable;
    const sent = serialize(arg.argRef as never, arg.arrDepth, tuple.values[idx], "input", { nullable });
    return InputParser.parse(arg.argRef as never, arg.arrDepth, JSON.parse(JSON.stringify(sent) ?? "null"), {
      key: arg.name,
      nullable,
    });
  });
  const published = RoomKey.idOfPublished(tuple.key, args, tuple.values);
  const subscribed = RoomKey.idOf(tuple.key, args, received);
  return published === subscribed ? null : { published, subscribed };
};

describe("room ids, generated from a fixed seed", () => {
  test("build then parse is the identity: a room id decodes back to its endpoint and string arguments", () => {
    forAll(
      "build then parse",
      (gen) => tupleOf(gen, stringKeys),
      (tuple) => {
        const decoded = decodeRoom(roomOf(tuple));
        return JSON.stringify(decoded) === JSON.stringify(tuple) ? null : { decoded };
      },
    );
  });

  test("different (endpoint, arguments) tuples never collide, so a separator or an escape cannot be injected", () => {
    const seen = new Map<string, string>();
    forAll("no collision", tupleOf, (tuple) => {
      const roomId = roomOf(tuple);
      const mine = identity(tuple);
      const theirs = seen.get(roomId);
      seen.set(roomId, mine);
      return theirs === undefined || theirs === mine ? null : { roomId, theirs };
    });
  });

  test("a client label two tuples share (by design) still maps them to two escaped rooms", () => {
    forAll(
      "labels collide, rooms do not",
      (gen) => [gen.string(), gen.string(), gen.string()] as const,
      ([head, middle, tail]) => {
        const left: Tuple = { key: "pair", values: [`${head}-${middle}`, tail] };
        const right: Tuple = { key: "pair", values: [head, `${middle}-${tail}`] };
        const labels = [left, right].map(({ key, values }) => websocketRoomContract.idOf(key, values));
        if (labels[0] !== labels[1]) return { labels };
        return roomOf(left) === roomOf(right) ? { roomId: roomOf(left) } : null;
      },
    );
  });

  test("an id a client invents cannot parse into a room it was not granted", () => {
    const granted = new Map<string, string>();
    const grantGen = new Gen(SEED ^ 0x5eed);
    for (let index = 0; index < CASES; index++) {
      const tuple = tupleOf(grantGen, stringKeys);
      granted.set(roomOf(tuple), identity(tuple));
    }
    forAll(
      "no forged room",
      (gen) => {
        const tuple = tupleOf(gen, stringKeys);
        const roomId = roomOf(tuple);
        return { roomId, invented: [...mutationsOf(roomId), `${tuple.key}-${gen.string()}`] };
      },
      ({ invented }) => {
        for (const forged of invented) {
          const decoded = decodeRoom(forged);
          const signature = decoded ? signatures[decoded.key] : undefined;
          const canonical = decoded && signature?.args.length === decoded.values.length ? roomOf(decoded) : undefined;
          if (canonical === forged) {
            const holder = granted.get(forged);
            if (holder !== undefined && holder !== identity(decoded as Tuple)) return { forged, holder };
            continue;
          }
          if (granted.has(forged)) return { forged, canonical, holder: granted.get(forged) };
        }
        return null;
      },
    );
  });

  test("ids stay within their character and length bounds, and only an id that fits is framed", () => {
    let oversized = 0;
    forAll("bounds", tupleOf, (tuple) => {
      const roomId = roomOf(tuple);
      const [key, ...tokens] = roomId.split("-");
      if (key !== tuple.key || tokens.length !== tuple.values.length) return { roomId };
      const badToken = tokens.find((token) => !tokenPattern.test(token));
      if (badToken !== undefined) return { badToken };
      const bytes = Buffer.byteLength(roomId);
      if (bytes !== roomId.length) return { bytes, length: roomId.length };
      const units = tuple.values.reduce<number>((sum, value) => sum + (JSON.stringify(value)?.length ?? 1), 0);
      if (roomId.length > key.length + tokens.length + units * 6) return { length: roomId.length, units };
      const frame = { roomId, payload: new Uint8Array([1]) };
      if (bytes > MAX_ROOM_BYTES) {
        oversized++;
        expect(() => websocketBinaryFrameContract.encode(frame)).toThrow("Room id is too long to frame");
        return null;
      }
      const decoded = websocketBinaryFrameContract.decode(websocketBinaryFrameContract.encode(frame));
      return decoded?.roomId === roomId ? null : { framed: decoded?.roomId ?? null };
    });
    expect(oversized).toBeGreaterThan(0);
  });

  test("caller scope and query: a client-chosen query never shares a live room with another caller", () => {
    const seen = new Map<string, string>();
    forAll(
      "live rooms",
      (gen) => ({
        base: roomOf(tupleOf(gen)),
        caller: gen.chance(0.2) ? null : gen.string(),
        query: gen.json(false),
      }),
      ({ base, caller, query }) => {
        const internal = caller === null ? [] : [{ id: caller, name: "not part of the room" }];
        const liveId = RoomKey.liveIdOf(base, internal, query);
        const split = liveId.lastIndexOf("::");
        if (liveId.slice(0, split) !== base || !/^[0-9a-f]{32}$/.test(liveId.slice(split + 2))) return { liveId };
        const mine = JSON.stringify([base, caller, identityOf(query ?? null)]);
        const theirs = seen.get(liveId);
        seen.set(liveId, mine);
        return theirs === undefined || theirs === mine ? null : { liveId, theirs };
      },
    );
  });

  test("a publisher's room id is the room its subscriber joined once the client serialized the same values, empty strings included", () => {
    forAll("publisher meets subscriber", tupleOf, publisherMissesSubscriber);
  });

  test('an own "__proto__" key is part of an Any room id and of a live room digest', () => {
    const tokens = new Map<string, string>();
    const liveIds = new Map<string, string>();
    forAll(
      "__proto__ keys",
      (gen) => gen.json(true),
      (value) => {
        const mine = JSON.stringify(identityOf(value));
        const token = websocketRoomContract.jsonTokenOf(value);
        const liveId = RoomKey.liveIdOf("ping", [], value);
        const theirs = [tokens.get(token), liveIds.get(liveId)];
        tokens.set(token, mine);
        liveIds.set(liveId, mine);
        return theirs.every((other) => other === undefined || other === mine) ? null : { token, liveId, theirs };
      },
    );
  });
});
