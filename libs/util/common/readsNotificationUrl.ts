//* 지금 화면이 알림 주소를 보고 있는지. 알림 주소에는 언어·basePath 가 없으므로 경로 끝이 같은지로 보고,
//* 알림 주소의 쿼리 값(threadId, ticketId 등)은 화면에도 그대로 있어야 한다. 서비스워커 생성기에 같은 규칙이 있다.
export const readsNotificationUrl = (pageHref: string, notificationUrl: string, origin: string) => {
  const page = new URL(pageHref, origin);
  const target = new URL(notificationUrl, origin);
  if (!page.pathname.endsWith(target.pathname)) return false;
  for (const [key, value] of target.searchParams) if (page.searchParams.get(key) !== value) return false;
  return true;
};
