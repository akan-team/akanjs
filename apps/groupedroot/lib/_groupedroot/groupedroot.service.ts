import { serve } from "akanjs/service";

export class GroupedrootService extends serve("groupedroot" as const, { serverMode: "batch" }, () => ({})) {}
