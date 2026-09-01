import { by, DatabaseRegistry } from "akanjs/document";
import { AgentTurn } from "akanjs/fetch";

export { AgentStop, AgentTurn, agentTurnConstant } from "akanjs/fetch";

// Only the document half is server-only; the constant half lives in `akanjs/fetch` so the client-side
// ConstantRegistry gets it too (the fetch import above also guarantees the scalar is registered before by()).
export class AgentTurnDocument extends by(AgentTurn) {}

export const agentTurnDocument = DatabaseRegistry.buildScalar("agentTurn" as const, AgentTurnDocument);
