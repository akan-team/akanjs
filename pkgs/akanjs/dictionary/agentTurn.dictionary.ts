import type { AgentStop, AgentTurn } from "akanjs/signal";

import { scalarDictionary } from "./dictInfo";

export const agentTurnDictionary = scalarDictionary(["en", "ko"])
  .of((t) =>
    t(["Agent Turn", "에이전트 턴"]).desc([
      "One assistant answer of an in-page agent turn",
      "인페이지 에이전트 턴의 어시스턴트 응답 하나",
    ]),
  )
  .model<AgentTurn>((t) => ({
    text: t(["Text", "텍스트"]).desc([
      "What the assistant said; empty when the turn is only tool calls",
      "어시스턴트가 말한 내용. 툴 호출뿐인 턴에서는 비어 있다",
    ]),
    toolCalls: t(["Tool Calls", "툴 호출"]).desc([
      "Tool calls the client should execute, as { id, name, args }",
      "클라이언트가 실행할 툴 호출 목록 ({ id, name, args })",
    ]),
    stop: t(["Stop", "종료 사유"]).desc([
      "Why the turn ended — end, or toolUse when tool results are awaited",
      "턴이 끝난 이유 — end 또는 툴 결과를 기다리는 toolUse",
    ]),
  }))
  .enum<AgentStop>("agentStop", (t) => ({
    end: t(["End", "종료"]).desc(["The final answer", "최종 응답"]),
    toolUse: t(["Tool Use", "툴 사용"]).desc(["The model awaits tool results", "모델이 툴 결과를 기다린다"]),
  }));
