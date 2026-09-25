import type { AgentEndpoint } from "akanjs/signal";

import { serviceDictionary } from "./dictInfo";

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
    deepseekRequestFailed: [
      "DeepSeek refused this turn with status {status}. Reason: {reason}",
      "DeepSeek가 이번 턴을 거절했습니다 (status {status}). 사유: {reason}",
    ],
  });
