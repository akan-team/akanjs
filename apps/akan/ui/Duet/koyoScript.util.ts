import { DuetTimeline } from "./duetTimeline.util";

type Clock = (t: number) => number;

export class KoyoScript {
  static readonly pitch = 5.125;
  static readonly rows = {
    size: { label: 10.25, top: 11.25 },
    toppings: { label: 13.875, top: 14.875 },
    serve: { label: 19.375, top: 20.375 },
    order: { top: 23.25 },
  } as const;
  static readonly targets = {
    start: { x: 11.5, y: 30.6 },
    size: { x: 8.5, y: 12.25 },
    toppings: { x: 8.5, y: 16.8125 },
    serve: { x: 8.5, y: 21.375 },
    order: { x: 12.5, y: 24.5 },
    aside: { x: 15.25, y: 26.1 },
    enter: { x: 18.5, y: 39.5 },
    approve: { x: 14.25, y: 36.125 },
  } as const;

  static loop() {
    const { start, enter } = KoyoScript.targets;
    const timeline = KoyoScript.#order(KoyoScript.#timeline(), (t) => 3 + t * 0.62)
      .to(0.5, 3, { b1: 1 })
      .to(42, 44, { b1: 0.35, b2: 1 })
      .to(65, 67, { b2: 0.35, b3: 1 })
      .to(66, 68.5, { mcp: 1 })
      .to(70, 71.5, { call: 1 })
      .to(73.5, 75.5, { served: 1 })
      .to(88, 91, { veil: 1, b3: 0.35 })
      .to(91, 93, {
        sheet: 0,
        msg: 0,
        tools: 0,
        ok: 0,
        size: 0,
        top: 0,
        serve: 0,
        placed: 0,
        served: 0,
        mcp: 0,
        call: 0,
        ax: start.x,
        ay: start.y,
        hx: enter.x,
        hy: enter.y,
      })
      .to(97, 100, { veil: 0 });
    return { css: timeline.css("duet-loop"), still: timeline.still(52) };
  }

  //* The agent's part is squeezed into the third caption and the approval into the fourth; the second is the scan.
  static story() {
    const timeline = KoyoScript.#order(KoyoScript.#timeline(), (t) =>
      t <= 64 ? 52 + t * 0.375 : 76 + ((t - 64) * 20) / 36,
    )
      .to(0, 100, { step: 4.25 })
      .to(25, 27, { xray: 1 })
      .to(27, 46, { scan: 1 })
      .to(49, 52, { xray: 0 })
      .to(52, 53, { scan: 0 });
    return { css: timeline.css("duet-screen"), still: timeline.still(76.5, { xray: 1, scan: 1 }) };
  }

  static #timeline() {
    const { start, enter } = KoyoScript.targets;
    return new DuetTimeline({
      ax: start.x,
      ay: start.y,
      aOn: 0,
      aTap: 0,
      aThink: 0,
      hx: enter.x,
      hy: enter.y,
      hOn: 0,
      hPress: 0,
      size: 0,
      top: 0,
      serve: 0,
      ringSize: 0,
      ringTop: 0,
      ringServe: 0,
      ringOrder: 0,
      sheet: 0,
      msg: 0,
      tools: 0,
      ask: 0,
      ok: 0,
      placed: 0,
      served: 0,
      mcp: 0,
      call: 0,
      veil: 0,
      b1: 0.35,
      b2: 0.35,
      b3: 0.35,
      scan: 0,
      xray: 0,
      step: 0.75,
    });
  }

  static #order(timeline: DuetTimeline, at: Clock) {
    const { size, toppings, serve, order, aside, approve } = KoyoScript.targets;
    return timeline
      .to(at(0), at(6), { sheet: 1 })
      .to(at(6), at(10), { msg: 1 })
      .to(at(10), at(12), { aOn: 1, aThink: 1 })
      .to(at(13), at(14), { aThink: 0 })
      .to(at(14), at(22), { ax: size.x, ay: size.y })
      .pulse("aTap", at(22), at(24))
      .to(at(22), at(24), { size: 1, ringSize: 1, tools: 1 })
      .to(at(24), at(32), { ringSize: 0 })
      .to(at(26), at(34), { ax: toppings.x, ay: toppings.y })
      .pulse("aTap", at(34), at(36))
      .to(at(34), at(36), { top: 1, ringTop: 1, tools: 2 })
      .to(at(36), at(44), { ringTop: 0 })
      .to(at(38), at(46), { ax: serve.x, ay: serve.y })
      .pulse("aTap", at(46), at(48))
      .to(at(46), at(48), { serve: 1, ringServe: 1, tools: 3 })
      .to(at(48), at(56), { ringServe: 0 })
      .to(at(50), at(58), { ax: order.x, ay: order.y })
      .pulse("aTap", at(58), at(60))
      .to(at(58), at(60), { ringOrder: 1 })
      .to(at(60), at(64), { ask: 1 })
      .to(at(62), at(70), { ringOrder: 0 })
      .to(at(64), at(68), { ax: aside.x, ay: aside.y })
      .to(at(66), at(68), { aThink: 1 })
      .to(at(68), at(70), { hOn: 1 })
      .to(at(70), at(80), { hx: approve.x, hy: approve.y })
      .pulse("hPress", at(81), at(82))
      .to(at(82), at(84), { ask: 0, ok: 1 })
      .to(at(84), at(87), { aOn: 0, aThink: 0 })
      .to(at(85), at(88), { placed: 1 })
      .to(at(88), at(92), { hOn: 0 });
  }
}
