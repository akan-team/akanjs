import { defineDesktopPlugin } from "akanjs/native/desktop";
import type { ProbeApi } from "./index";

export default defineDesktopPlugin<ProbeApi>({
  id: "probe",
  setup(ctx) {
    if (process.env.AKAN_NATIVE_PROBE !== "1") return;
    const tool = Bun.which("probe-tool", { PATH: process.env.PATH ?? "" });
    const where = tool && ctx.binDir && tool.startsWith(ctx.binDir) ? "is in the app's bin" : `is ${tool ?? "missing"}`;
    console.info(`probe: apps/minimal/native/probe is loaded; probe-tool ${where}`);
  },
  methods: {
    ping: async () => ({ owner: "apps/minimal" }),
  },
});
