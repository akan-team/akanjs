import { modelDictionary } from "@akanjs/dictionary";

import type { PeriodType, Summary, SummaryInsight, SummaryStatus } from "./summary.constant";
import type { SummaryFilter } from "./summary.document";
import type { SummaryEndpoint, SummarySlice } from "./summary.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["Summary", "시스템 요약"]).desc([
      "Summary is a group of system and service metrics that is used for the system to be monitored and managed.",
      "Summary는 시스템이 모니터링되고 관리되는 데 사용되는 시스템 및 서비스 지표의 그룹입니다.",
    ])
  )
  .model<Summary>((t) => ({
    type: t(["Type", "타입"]).desc([
      "Type of summary, e.g. periodic, non-periodic...",
      "요약의 타입, 예를 들어 주기적, 비주기적...",
    ]),
    at: t(["At", "시각"]).desc(["The time when the summary is created", "요약이 생성된 시각"]),
    prepareUser: t(["Prepare User", "준비된 사용자"]).desc(["Number of users with preparation", "준비된 사용자 수"]),
    activeUser: t(["Active User", "활성 사용자"]).desc(["Number of active users", "활성 사용자 수"]),
    dormantUser: t(["Dormant User", "휴면 사용자"]).desc(["Number of dormant users", "휴면 사용자 수"]),
    restrictedUser: t(["Restricted User", "제한된 사용자"]).desc([
      "Number of users with restrictions",
      "제한이 있는 사용자 수",
    ]),
    hau: t(["HAU", "HAU"]).desc(["Hourly Active User", "시간별 활성 사용자"]),
    dau: t(["DAU", "DAU"]).desc(["Daily Active User", "일별 활성 사용자"]),
    wau: t(["WAU", "WAU"]).desc(["Weekly Active User", "주별 활성 사용자"]),
    mau: t(["MAU", "MAU"]).desc(["Monthly Active User", "월별 활성 사용자"]),
    status: t(["Status", "상태"]).desc(["Status of the summary", "요약의 상태"]),
  }))
  .insight<SummaryInsight>((t) => ({}))
  .query<SummaryFilter>((fn) => ({
    byStatuses: fn(["By Statuses", "상태별 조회"]).arg((t) => ({
      statuses: t(["Statuses", "상태"]).desc(["Statuses to search", "상태로 조회"]),
    })),
    toPeriod: fn(["To Period", "기간별 조회"]).arg((t) => ({
      from: t(["From", "시작"]).desc(["From to search", "시작으로 조회"]),
      to: t(["To", "끝"]).desc(["To to search", "끝으로 조회"]),
      periodTypes: t(["Period Types", "기간 타입"]).desc(["Period types to search", "기간 타입으로 조회"]),
    })),
  }))
  .sort<SummaryFilter>((t) => ({
    oldestAt: t(["Oldest At", "가장 오래된 시각"]).desc(["Oldest At", "가장 오래된 시각"]),
  }))
  .enum<PeriodType>("periodType", (t) => ({
    "non-periodic": t(["Non-periodic", "비주기적"]).desc(["Non-periodic type", "비주기적 타입"]),
    active: t(["Active", "활성"]).desc(["Active type", "활성 타입"]),
    hourly: t(["Hourly", "시간별"]).desc(["Hourly type", "시간별 타입"]),
    daily: t(["Daily", "일별"]).desc(["Daily type", "일별 타입"]),
    weekly: t(["Weekly", "주간별"]).desc(["Weekly type", "주간별 타입"]),
    monthly: t(["Monthly", "월별"]).desc(["Monthly type", "월별 타입"]),
  }))
  .enum<SummaryStatus>("summaryStatus", (t) => ({
    active: t(["Active", "활성"]).desc(["Active status", "활성 상태"]),
    archived: t(["Archived", "보관됨"]).desc(["Archived status", "보관됨 상태"]),
  }))
  .slice<SummarySlice>((fn) => ({
    inPeriod: fn(["Get summary list in period", "기간별 요약 목록 조회"]).arg((t) => ({
      from: t(["From", "시작"]).desc(["From to search", "시작으로 조회"]),
      to: t(["To", "끝"]).desc(["To to search", "끝으로 조회"]),
      periodTypes: t(["Period Types", "기간 타입"]).desc(["Period types to search", "기간 타입으로 조회"]),
    })),
  }))
  .endpoint<SummaryEndpoint>((fn) => ({
    getActiveSummary: fn(["Get active summary", "활성 요약 조회"]).desc([
      "API to get the active summary",
      "활성 요약을 조회하는 API",
    ]),
  }));
