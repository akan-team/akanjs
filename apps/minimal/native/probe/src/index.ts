import { definePlugin } from "akanjs/client/native";

export interface ProbeApi {
  ping(): Promise<{ owner: string }>;
}

/** The desktop E2E's proof that an app's own native plugin ships: it answers from the app's desktop shell. */
export const probe = definePlugin<ProbeApi>("probe", { methods: ["ping"] });
