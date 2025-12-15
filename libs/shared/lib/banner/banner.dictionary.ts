import { modelDictionary } from "@akanjs/dictionary";

import type { Banner, BannerInsight, BannerStatus, BannerTarget } from "./banner.constant";
import type { BannerFilter } from "./banner.document";
import type { BannerEndpoint, BannerSlice } from "./banner.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["Banner", "배너"]).desc([
      "Banner is a temporary notice informations that is displayed on the top or in front of the page",
      "배너는 페이지 상단이나 앞에 표시되는 임시 공지 정보입니다.",
    ])
  )
  .model<Banner>((t) => ({
    category: t(["Category", "카테고리"]).desc([
      "Category of banner, displayed on the top",
      "배너 카테고리, 상단에 표시됨",
    ]),
    title: t(["Title", "제목"]).desc(["Title of banner, displayed on the top", "배너 제목, 상단에 표시됨"]),
    content: t(["Content", "내용"]).desc(["Content of banner, displayed on the bottom", "배너 내용, 하단에 표시됨"]),
    image: t(["Image", "이미지"]).desc(["Image of banner, displayed on the center", "배너 이미지, 중앙에 표시됨"]),
    href: t(["Href", "링크"]).desc(["Href of banner, link to other page", "배너 링크, 다른 페이지로 이동함"]),
    target: t(["Target", "타겟"]).desc(["Target configuration of <a> tag in banner", "배너의 <a> 태그의 타겟 설정"]),
    from: t(["From", "시작일"]).desc(["Start date of banner", "배너 시작일"]),
    to: t(["To", "종료일"]).desc(["End date of banner", "배너 종료일"]),
    status: t(["Status", "상태"]).desc(["Status of banner", "배너 상태"]),
  }))
  .insight<BannerInsight>((t) => ({}))
  .query<BannerFilter>((fn) => ({
    inCategory: fn(["In Category", "카테고리별 조회"]).arg((t) => ({
      category: t(["Category", "카테고리"]).desc(["Category to filter", "필터링할 카테고리"]),
    })),
  }))
  .enum<BannerTarget>("bannerTarget", (t) => ({
    _blank: t(["New tab", "새 탭"]).desc(["Open link in new tab", "새 탭에서 링크 열기"]),
    _self: t(["Same tab", "현재 탭"]).desc(["Open link in same tab", "현재 탭에서 링크 열기"]),
  }))
  .enum<BannerStatus>("bannerStatus", (t) => ({
    active: t(["Active", "활성"]).desc([
      "Active banner is successfully created but not displayed yet",
      "활성 배너는 성공적으로 생성되었지만 아직 표시되지 않음",
    ]),
    displaying: t(["Displaying", "표시중"]).desc([
      "Displaying banner is being displayed and viewable for users",
      "표시중 배너는 사용자에게 표시되고 볼 수 있음",
    ]),
  }))
  .slice<BannerSlice>((fn) => ({
    inPublic: fn(["Banner List In Public", "공개된 Banner 리스트"]).arg((t) => ({
      category: t(["Category", "카테고리"]).desc(["Category to filter", "필터링할 카테고리"]),
    })),
  }))
  .endpoint<BannerEndpoint>((fn) => ({
    bannerListInPublic: fn(["Banner List In Public", "공개된 Banner 리스트"])
      .desc(["Get a list of public banner", "공개된 Banner의 리스트를 가져옵니다"])
      .arg((t) => ({
        category: t(["Category", "카테고리"]).desc(["Category to filter", "필터링할 카테고리"]),
        skip: t(["Skip", "건너뛰기"]).desc(["Number of items to skip", "건너뛸 아이템 수"]),
        limit: t(["Limit", "제한"]).desc(["Maximum number of items to return", "반환할 최대 아이템 수"]),
        sort: t(["Sort", "정렬"]).desc(["Sort order of the items", "아이템의 정렬 순서"]),
      })),
    bannerInsightInPublic: fn(["Banner Insight In Public", "공개된 Banner 인사이트"])
      .desc(["Get insight data for public banner", "공개된 Banner에 대한 인사이트 데이터를 가져옵니다"])
      .arg((t) => ({
        category: t(["Category", "카테고리"]).desc(["Category to filter", "필터링할 카테고리"]),
      })),
  }));
