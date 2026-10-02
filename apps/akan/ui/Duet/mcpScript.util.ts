import { DuetTimeline } from "./duetTimeline.util";

export class McpScript {
  static story() {
    const timeline = new DuetTimeline({
      url: 0,
      linked: 0,
      consent: 0,
      hx: 7,
      hy: 5,
      hOn: 0,
      hPress: 0,
      allow: 0,
      ask: 0,
      calls: 0,
      moved: 0,
      reply: 0,
      refuse: 0,
      step: 0.75,
    })
      .to(0, 100, { step: 4.25 })
      .to(3, 15, { url: 1 })
      .to(16, 18, { linked: 1 })
      .to(26, 29, { consent: 1 })
      .to(29, 30, { hOn: 1 })
      .to(30, 38, { hx: 0, hy: 0 })
      .pulse("hPress", 38, 39)
      .to(39, 41, { allow: 1 })
      .to(42, 46, { consent: 0, hOn: 0 })
      .to(51, 53, { ask: 1 })
      .to(55, 57, { calls: 1 })
      .to(58, 60, { calls: 2, moved: 1 })
      .to(61, 63, { calls: 3, moved: 2 })
      .to(64, 66, { calls: 4, moved: 3 })
      .to(67, 69, { calls: 5 })
      .to(70, 73, { reply: 1 })
      .to(79, 81, { refuse: 1 })
      .to(84, 86, { refuse: 2 })
      .to(89, 91, { refuse: 3 });
    return { css: timeline.css("duet-server"), still: timeline.still(100) };
  }
}
