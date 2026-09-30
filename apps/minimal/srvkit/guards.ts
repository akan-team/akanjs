import { getEnv } from "akanjs/base";
import type { Guard, GuardScope } from "akanjs/signal";

// minimal has no accounts, and the memo fixture writes anonymously: it answers on a developer's server and on a
// desktop app's carried one (edge), never on a deployment (cloud), where anyone could fill its storage.
export class LocalOrEdge implements Guard {
  // fetch serializes guard names and the API explorer filters on them; deleting this breaks that UI.
  static name = "LocalOrEdge";
  static scope: GuardScope = "account";
  canPass() {
    const { operationMode } = getEnv();
    return operationMode === "local" || operationMode === "edge";
  }
}
