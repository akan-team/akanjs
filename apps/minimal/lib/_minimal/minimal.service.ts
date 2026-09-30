import { serve } from "akanjs/service";

import type * as sig from "../sig";

export class MinimalService extends serve("minimal" as const, { serverMode: "batch" }, ({ signal }) => ({
  minimalSignal: signal<sig.Minimal>(),
})) {
  async publishBenchFanout(roomId: string, seq: number, sentAt: number) {
    await this.minimalSignal.benchFanout(roomId, { seq, sentAt });
    return true;
  }

  //? From PATH, as an app starts ffmpeg; Windows runs the tool's .cmd only through cmd.exe.
  holdProbeTool() {
    const tool = Bun.spawn(
      process.platform === "win32" ? ["cmd.exe", "/d", "/c", "probe-tool", "hold"] : ["probe-tool", "hold"],
      {
        stdio: ["ignore", "ignore", "ignore"],
      },
    );
    tool.unref();
    return tool.pid;
  }
}
