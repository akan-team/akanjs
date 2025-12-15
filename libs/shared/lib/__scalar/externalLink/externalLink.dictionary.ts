import { scalarDictionary } from "@akanjs/dictionary";

import type { ExternalLink, LinkType } from "./externalLink.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["External Link", "외부 링크"]).desc(["External Link", "외부 링크"]))
  .model<ExternalLink>((t) => ({
    type: t(["Type", "타입"]).desc(["Type", "타입"]),
    url: t(["URL", "URL"]).desc(["URL", "URL"]),
  }))
  .enum<LinkType>("linkType", (t) => ({
    website: t(["Website", "웹사이트"]).desc(["Website", "웹사이트"]),
    twitter: t(["Twitter", "트위터"]).desc(["Twitter", "트위터"]),
    discord: t(["Discord", "디스코드"]).desc(["Discord", "디스코드"]),
    telegram: t(["Telegram", "텔레그램"]).desc(["Telegram", "텔레그램"]),
    instagram: t(["Instagram", "인스타그램"]).desc(["Instagram", "인스타그램"]),
    facebook: t(["Facebook", "페이스북"]).desc(["Facebook", "페이스북"]),
    youtube: t(["YouTube", "유튜브"]).desc(["YouTube", "유튜브"]),
    github: t(["GitHub", "깃허브"]).desc(["GitHub", "깃허브"]),
    medium: t(["Medium", "미디엄"]).desc(["Medium", "미디엄"]),
    linkedin: t(["LinkedIn", "링크드인"]).desc(["LinkedIn", "링크드인"]),
    reddit: t(["Reddit", "레딧"]).desc(["Reddit", "레딧"]),
    twitch: t(["Twitch", "트위치"]).desc(["Twitch", "트위치"]),
    vimeo: t(["Vimeo", "비메오"]).desc(["Vimeo", "비메오"]),
    weibo: t(["Weibo", "웨이보"]).desc(["Weibo", "웨이보"]),
    wikipedia: t(["Wikipedia", "위키백과"]).desc(["Wikipedia", "위키백과"]),
    app: t(["App", "앱"]).desc(["App", "앱"]),
    email: t(["Email", "이메일"]).desc(["Email", "이메일"]),
    other: t(["Other", "기타"]).desc(["Other", "기타"]),
  }));
