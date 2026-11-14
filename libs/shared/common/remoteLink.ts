export class RemoteLink {
  static of(href: string | null | undefined, serverUrl: string): string | null {
    const link = URL.parse(href ?? "");
    if (link?.protocol !== "https:" || link.username || link.password) return null;
    return link.origin === URL.parse(serverUrl)?.origin ? link.href : null;
  }
}
