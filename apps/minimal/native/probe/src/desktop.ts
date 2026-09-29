import { defineDesktopPlugin } from "akanjs/native/desktop";
import type { ProbeApi } from "./index";

export default defineDesktopPlugin<ProbeApi>({
  id: "probe",
  setup() {
    if (process.env.AKAN_NATIVE_PROBE === "1") console.info("probe: apps/minimal/native/probe is loaded");
  },
  methods: {
    ping: async () => ({ owner: "apps/minimal" }),
  },
});
