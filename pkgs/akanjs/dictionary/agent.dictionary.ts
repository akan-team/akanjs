import type { AgentEndpoint, AgentStop, AgentTurn } from "akanjs/signal";

import { scalarDictionary, serviceDictionary } from "./dictInfo";

export const agentDictionary = serviceDictionary(["en", "ko"])
  .endpoint<AgentEndpoint>((fn) => ({
    runAgentTurn: fn(["Run Agent Turn", "에이전트 턴 실행"])
      .desc([
        "Relays one in-page agent turn to the model and returns its answer; tools execute in the caller's browser",
        "인페이지 에이전트 턴 하나를 모델에 릴레이하고 응답을 돌려준다. 툴 실행은 호출자의 브라우저에서 한다",
      ])
      .arg((t) => ({
        messages: t(["Messages", "메시지"]).desc(["The whole transcript in wire shape", "와이어 형태의 전체 대화"]),
        tools: t(["Tools", "툴"]).desc(["The published tool catalogue, schemas only", "게시된 툴 카탈로그 (스키마만)"]),
        context: t(["Context", "컨텍스트"]).desc([
          "Screen context blocks, forwarded as data",
          "화면 컨텍스트 블록 (데이터로 전달)",
        ]),
        instructions: t(["Instructions", "지시문"]).desc(["App-level system instructions", "앱 수준 시스템 지시문"]),
      })),
  }))
  .error({
    llmUnavailable: [
      "The agent is unavailable — this app has no language model configured",
      "에이전트를 사용할 수 없습니다. 이 앱에 언어 모델이 설정되어 있지 않습니다",
    ],
    // One key for every provider: an app's own adaptor cannot add a key here, so it reports through this one too.
    llmRequestFailed: [
      "{provider} refused this turn with status {status}. Reason: {reason}",
      "{provider}가 이번 턴을 거절했습니다 (status {status}). 사유: {reason}",
    ],
    // Printed only once the chat has already summarized itself and been refused again, so it names what is left.
    contextOverflow: [
      "This conversation no longer fits the model's context window at {provider}. Use /compact to summarize it, or /new to start over",
      "대화가 {provider} 모델의 컨텍스트 창을 넘었습니다. /compact로 요약하거나 /new로 새로 시작할 수 있습니다.",
    ],
    quotaExceeded: [
      "The agent's usage limit for this account has been reached",
      "이 계정의 에이전트 사용 한도에 도달했습니다.",
    ],
    requestRefused: ["This app's agent does not take this request", "이 앱의 에이전트는 이 요청을 받지 않습니다."],
  });

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
      "Why the turn ended — end, toolUse when tool results are awaited, or length when the provider cut it off",
      "턴이 끝난 이유 — end, 툴 결과를 기다리는 toolUse, 프로바이더가 잘라낸 length",
    ]),
  }))
  .enum<AgentStop>("agentStop", (t) => ({
    end: t(["End", "종료"]).desc(["The final answer", "최종 응답"]),
    toolUse: t(["Tool Use", "툴 사용"]).desc(["The model awaits tool results", "모델이 툴 결과를 기다린다"]),
    length: t(["Length", "길이 초과"]).desc([
      "The provider's answer ceiling cut the turn off, so it is incomplete",
      "프로바이더의 응답 상한에 걸려 턴이 잘렸다. 미완성이다",
    ]),
  }));
