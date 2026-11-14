# `akanjs/client/native/local-notifications`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface ChannelOptions {
    id: string;
    name: string;
    description?: string;
    importance?: Importance;
}

export interface DeliveredNotification {
    id: number;
    title: string;
    body: string;
    at?: number;
    data?: NotificationData;
}

export type Importance = "default" | "high" | "low" | "min";

export interface LocalNotificationsApi {
    schedule(args: {
        notifications: NotificationRequest[];
    }): Promise<{
        ids: number[];
    }>;
    cancel(args: {
        ids: number[];
    }): Promise<void>;
    getPending(): Promise<{
        notifications: PendingNotification[];
    }>;
    getDelivered(): Promise<{
        notifications: DeliveredNotification[];
    }>;
    removeDelivered(args: {
        ids: number[];
    }): Promise<void>;
    removeAllDelivered(): Promise<void>;
    createChannel(args: ChannelOptions): Promise<void>;
    checkPermission(): Promise<{
        display: PermissionState;
    }>;
    requestPermission(args?: {
        provisional?: boolean;
    }): Promise<{
        display: PermissionState;
    }>;
}

export interface LocalNotificationsEvents {
    received: NotificationEvent;
    action: NotificationEvent;
}

export declare const METHODS: readonly [
    "schedule",
    "cancel",
    "getPending",
    "getDelivered",
    "removeDelivered",
    "removeAllDelivered",
    "createChannel",
    "checkPermission",
    "requestPermission"
];

export type NotificationData = Record<string, unknown>;

export interface NotificationEvent {
    id: number;
    title: string;
    body: string;
    data?: NotificationData;
}

export interface NotificationRequest {
    id: number;
    title: string;
    body?: string;
    at?: number | string;
    every?: Repeat;
    channelId?: string;
    data?: NotificationData;
}

export interface PendingNotification {
    id: number;
    title: string;
    body: string;
    at: number;
    every?: Repeat;
    channelId?: string;
    data?: NotificationData;
}

export type PermissionState = "denied" | "granted" | "prompt" | "prompt-with-rationale";

export type Repeat = "day" | "hour" | "minute" | "week";

export interface ScheduledNotification {
    id: number;
    title: string;
    body: string;
    at: number;
    every?: Repeat;
    channelId?: string;
    data?: NotificationData;
}

export declare function addInterval(at: number, every: Repeat, count?: number): number;

export declare const localNotifications: Plugin<LocalNotificationsApi, LocalNotificationsEvents>;

export declare function nextOccurrence(at: number, every: Repeat, after: number): number;

export declare function normalizeSchedule(args: unknown, now: number): {
    notifications: ScheduledNotification[];
};

export declare function useNotificationAction(handler: (event: NotificationEvent) => void): void;

export declare function useNotificationReceived(handler: (event: NotificationEvent) => void): void;
```
