import { serve } from "@akanjs/service";

export class SharedService extends serve("shared" as const, { serverMode: "batch" }, () => ({})) {}
