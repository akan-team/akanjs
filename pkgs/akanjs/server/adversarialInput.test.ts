import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AdversarialHarness, type Outcome, type Transport, transports } from "./adversarialInput.fixture";
import { type AdversarialRow, adversarialRows, type EnvelopeRow, envelopeRows } from "./adversarialInputRows.fixture";

const harness = new AdversarialHarness();
beforeAll(() => harness.open());
afterAll(() => harness.close());

const leakPattern = /\.tsx?:\d+|\bat \S+ \(|\/Users\/|\/home\/|node_modules|pkgs\/akanjs|TypeError|ReferenceError/;

const expectSafe = (outcome: Outcome) => {
  const crashed = outcome.status === 0 || outcome.status >= 500;
  expect({ transport: outcome.transport, crashed }).toEqual({ transport: outcome.transport, crashed: false });
  expect(outcome.errorLogs).toEqual([]);
  expect(leakPattern.test(outcome.text.slice(0, 4096))).toBe(false);
  expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
};

const refusalFamily = (outcome: Outcome) =>
  outcome.code?.replace(/^base\.error\./, "").replace(/^requiredArgument$/, "invalidArgument") ?? null;

const runAll = async (row: AdversarialRow) => {
  const outcomes = {} as Record<Transport, Outcome>;
  for (const transport of transports) outcomes[transport] = await harness.run(transport, row.entries);
  return outcomes;
};

const expectAgreement = async (row: AdversarialRow, outcomes: Record<Transport, Outcome>) => {
  for (const outcome of Object.values(outcomes)) expectSafe(outcome);
  const agreeing = transports.filter((transport) => transport !== row.byDesign?.transport);
  if (row.byDesign && "readAs" in row.byDesign) {
    const { transport, readAs } = row.byDesign;
    const asWritten = await harness.run(transport, readAs);
    expect(asWritten.received).not.toBeNull();
    expect({ transport, received: outcomes[transport].received }).toEqual({ transport, received: asWritten.received });
  } else if (row.byDesign) {
    const refused = outcomes[row.byDesign.transport];
    expect({ status: refused.status, code: refused.code, received: refused.received }).toEqual({
      status: 400,
      code: row.byDesign.code,
      received: null,
    });
  }
  const [first, ...rest] = agreeing.map((transport) => outcomes[transport]);
  for (const other of rest) {
    expect({ transport: other.transport, received: other.received }).toEqual({
      transport: other.transport,
      received: first.received,
    });
    if (first.received !== null) continue;
    expect({ transport: other.transport, status: other.status, family: refusalFamily(other) }).toEqual({
      transport: other.transport,
      status: first.status,
      family: refusalFamily(first),
    });
  }
  if (outcomes.http.received === null) expect(outcomes.ws.code).toBe(outcomes.http.code);
};

describe("one adversarial input table through HTTP, WebSocket and MCP", () => {
  test("the table holds every hostile row once", () => {
    const titles = adversarialRows.map((row) => row.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.length).toBeGreaterThanOrEqual(40);
  });

  for (const row of adversarialRows) {
    if (row.finding) {
      test.todo(`finding: ${row.finding}`, async () => expectAgreement(row, await runAll(row)));
      continue;
    }
    const divergence = row.byDesign ? ` (by design: ${row.byDesign.reason})` : "";
    test(`${row.title}: ${row.why}${divergence}`, async () => expectAgreement(row, await runAll(row)));
  }
});

const expectRefusals = async (row: EnvelopeRow) => {
  for (const [transport, wire] of Object.entries(row.wire) as [Transport, string][]) {
    const outcome = await harness.raw(transport, wire);
    expectSafe(outcome);
    expect({ transport, status: outcome.status, code: outcome.code, received: outcome.received }).toEqual({
      transport,
      ...row.refusal[transport],
      received: null,
    } as never);
  }
};

describe("envelopes each transport reads before the arguments", () => {
  for (const row of envelopeRows) {
    if (row.finding) {
      test.todo(`finding: ${row.finding}`, () => expectRefusals(row));
      continue;
    }
    test(`${row.title}: ${row.why}`, () => expectRefusals(row));
  }
});
