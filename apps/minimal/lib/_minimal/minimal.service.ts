import { serve } from "akanjs/service";

import type * as sig from "../sig";

export class MinimalService extends serve("minimal" as const, { serverMode: "batch" }, ({ signal }) => ({
  minimalSignal: signal<sig.Minimal>(),
})) {
  async publishBenchFanout(roomId: string, seq: number, sentAt: number) {
    await this.minimalSignal.benchFanout(roomId, { seq, sentAt });
    return true;
  }
}
