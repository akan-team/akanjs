import { serve } from "@akanjs/service";

export class UtilService extends serve("util" as const, { serverMode: "batch" }, () => ({})) {}
