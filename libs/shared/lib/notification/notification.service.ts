import type { PushOutcome, PushPayload } from "@libs/shared/srvkit";
import { PushNotificationServer } from "@libs/util/srvkit";
import { dayjs } from "akanjs/base";
import { parseAkanI18nEnv } from "akanjs/common";
import { DictionaryLookup } from "akanjs/dictionary";
import { serve } from "akanjs/service";

import type * as cnst from "../cnst";
import * as db from "../db";
import { Err } from "../dict";
import type * as srv from "../srv";

export class NotificationService extends serve(db.notification, ({ service, plug }) => ({
  fileService: service<srv.FileService>(),
  userService: service<srv.UserService>(),
  pushNotificationServer: plug(PushNotificationServer),
})) {
  // `fewer` keeps only what the person has to act on. Every other level is silenced for that setting.
  private static readonly levelsSurvivingFewer: cnst.NotiLevel["value"][] = ["actionRequired", "essential"];
  private static readonly megaphonePageSize = 500;

  private dictionaryLookup: DictionaryLookup | null = null;

  /**
   * Whether one person's own settings accept one notification. Static so the rule can be read and tested
   * without a push adaptor: with no APNs or firebase credentials a send is a no-op, which proves nothing about
   * who would have been reached.
   */
  static accepts(notiInfo: db.NotiInfo | cnst.NotiInfo | undefined, level: cnst.NotiLevel["value"], now = dayjs()) {
    if (!notiInfo) return false;
    if (notiInfo.setting === "block" || notiInfo.setting === "disagree") return false;
    if (notiInfo.setting === "fewer" && !NotificationService.levelsSurvivingFewer.includes(level)) return false;
    if (notiInfo.pauseUntil && dayjs(notiInfo.pauseUntil).isAfter(now)) return false;
    return notiInfo.deviceTokens.length > 0;
  }

  private resolveContent({ content, contentKey }: PushPayload) {
    if (content) return content;
    if (!contentKey) return "";
    this.dictionaryLookup ??= new DictionaryLookup(parseAkanI18nEnv().defaultLocale);
    return this.dictionaryLookup.text(contentKey) ?? "";
  }

  /**
   * The one place a recipient's own preference is read, so every caller — a chat message, a ticket transition,
   * a wiki mention — is spared knowing about it. No Notification document is written: a push per recipient per
   * chat message would be a row per recipient per message, and what the person has not read is already on
   * `channelMember.unreadNum`.
   */
  async push(userIds: (string | null | undefined)[], payload: PushPayload): Promise<PushOutcome> {
    const uniqueIds = [...new Set(userIds)].filter((id): id is string => !!id);
    const outcome: PushOutcome = { targetUserIds: [], tokenNum: 0, successCount: 0, prunedTokens: [] };
    if (!uniqueIds.length) return outcome;

    const notiInfos = await this.userService.listNotiInfosOfUsers(uniqueIds);
    const now = dayjs();
    const tokenOwners = new Map<string, { ownerId: string; provider: cnst.PushProvider["value"] }>();
    for (const { id, notiInfo } of notiInfos) {
      if (!NotificationService.accepts(notiInfo, payload.level, now)) continue;
      outcome.targetUserIds.push(id);
      for (const { token, provider } of notiInfo?.deviceTokens ?? []) tokenOwners.set(token, { ownerId: id, provider });
    }
    outcome.tokenNum = tokenOwners.size;
    if (!tokenOwners.size) return outcome;

    const targets = [...tokenOwners].map(([token, { provider }]) => ({ token, provider }));
    const { successCount, invalidTokens } = await this.pushNotificationServer.sendEach(targets, {
      title: payload.title,
      body: this.resolveContent(payload),
      url: payload.url,
      tag: payload.tag,
      badge: payload.badge,
      imageUrl: payload.imageUrl,
    });
    outcome.successCount = successCount;
    outcome.prunedTokens = invalidTokens;
    // One write per owner: removing a user's dead tokens one by one would race and drop each other's removals.
    const deadTokensByOwner = new Map<string, string[]>();
    for (const token of invalidTokens) {
      const ownerId = tokenOwners.get(token)?.ownerId;
      if (ownerId) deadTokensByOwner.set(ownerId, [...(deadTokensByOwner.get(ownerId) ?? []), token]);
    }
    for (const [ownerId, tokens] of deadTokensByOwner) void this.userService.subNotiDeviceTokensOfUser(ownerId, tokens);
    return outcome;
  }

  // The megaphone: every active user, a page at a time, each through the same recipient gate as `push()`.
  async pushToAll(payload: PushPayload): Promise<PushOutcome> {
    const outcome: PushOutcome = { targetUserIds: [], tokenNum: 0, successCount: 0, prunedTokens: [] };
    for (let skip = 0; ; skip += NotificationService.megaphonePageSize) {
      const userIds = await this.userService.listActiveUserIds({ skip, limit: NotificationService.megaphonePageSize });
      const page = await this.push(userIds, payload);
      outcome.targetUserIds.push(...page.targetUserIds);
      outcome.tokenNum += page.tokenNum;
      outcome.successCount += page.successCount;
      outcome.prunedTokens.push(...page.prunedTokens);
      if (userIds.length < NotificationService.megaphonePageSize) break;
    }
    return outcome;
  }

  async sendPushNotification(notificationInput: db.NotificationInput) {
    if (notificationInput.type === "user" && !notificationInput.userId)
      throw new Err("notification.error.recipientRequired");
    const notification = await this.notificationModel.createNotification(notificationInput);
    const image = notification.image ? await this.fileService.getFile(notification.image) : null;
    const payload: PushPayload = {
      title: notification.title,
      content: notification.content,
      level: notification.level,
      url: notification.url,
      imageUrl: image?.url,
    };
    // A megaphone outlives the admin's request, so it runs on its own and the record is answered at once.
    if (notification.type === "all")
      void this.pushToAll(payload).catch((error: unknown) => this.logger.error(`Megaphone push failed: ${error}`));
    else await this.push([notification.userId], payload);
    return notification;
  }
}
