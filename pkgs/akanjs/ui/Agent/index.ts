import { AgentScope } from "use-agentic";
import Context from "./Context";
import { Dock } from "./Dock";
import { Guide } from "./Guide";
import { History } from "./History";
import { Chat } from "./index_";
import Section from "./Section";
import { Skip } from "./Skip";
import StateKey from "./StateKey";
import Tool from "./Tool";
import Transcript from "./Transcript";
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
};
