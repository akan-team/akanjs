import { AgentScope } from "use-agentic";
import { Context, Dock, Section, StateKey, Tool, Transcript } from "./Dock";
import { Guide } from "./Guide";
import { History } from "./History";
import { Chat } from "./index_";
import { Skip } from "./Skip";
import { useScreenActions } from "./useScreenActions";
import { Zone } from "./Zone";

export const Agent = {
  Chat,
  Context,
  Dock,
  Guide,
  History,
  Scope: AgentScope,
  Section,
  Skip,
  StateKey,
  Tool,
  Transcript,
  Zone,
  useScreenActions,
};
