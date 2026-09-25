import type { AgentEndpoint, AgentTurn, BaseEndpoint } from "akanjs/signal";

import { agentDictionary } from "./agent.dictionary";
import { agentTurnDictionary } from "./agentTurn.dictionary";
import { baseDictionary } from "./base.dictionary";
import { registerScalarTrans, registerServiceTrans } from "./locale";
import { makeTrans } from "./trans";

export const dictionary = {
  base: registerServiceTrans<"base", BaseEndpoint, typeof baseDictionary>(baseDictionary),
  agentTurn: registerScalarTrans<"agentTurn", AgentTurn, typeof agentTurnDictionary>(agentTurnDictionary),
  agent: registerServiceTrans<"agent", AgentEndpoint, typeof agentDictionary>(agentDictionary),
};

export const { Err, translate, msg, getDictionary, getAllDictionary, __Dict_Key__, __Error_Key__ } =
  makeTrans(dictionary);
