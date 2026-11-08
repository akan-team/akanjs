"use client";
import { useEffect } from "react";
import { appBadgeCache } from "../common/appBadgeCache";
import { readsNotificationUrl } from "../common/readsNotificationUrl";

const urlOfNotification = (notification: Notification) => {
  const data = notification.data as { url?: string; FCM_MSG?: { data?: { url?: string } } } | null;
  return data?.url ?? data?.FCM_MSG?.data?.url;
};

const syncAppBadge = async () => {
  // A native shell's web view has no Cache Storage, and only the worker's own notifications carry a url to match.
  if (!("caches" in window)) return;
  const cache = await caches.open(appBadgeCache.name);
  const stored = await cache.match(appBadgeCache.path);
  const unread: { [url: string]: number } = (stored ? await stored.json() : null)?.unread ?? {};
  const isRead = (url: string) => readsNotificationUrl(window.location.href, url, window.location.origin);
  for (const url of Object.keys(unread)) if (isRead(url)) delete unread[url];
  await cache.put(appBadgeCache.path, new Response(JSON.stringify({ enabled: true, unread })));
  const total = Object.values(unread).reduce((sum, count) => sum + count, 0);
  // Firefox and desktop Safari ship no Badging API.
  if ("setAppBadge" in navigator) await (total ? navigator.setAppBadge(total) : navigator.clearAppBadge());
  const registration = await navigator.serviceWorker?.getRegistration();
  for (const notification of (await registration?.getNotifications()) ?? []) {
    const url = urlOfNotification(notification);
    if (url && isRead(url)) notification.close();
  }
};

export const useAppBadgeSync = (locationKey: string) => {
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncAppBadge();
    };
    onVisible();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [locationKey]);
};
