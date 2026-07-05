import type { ClientEnv } from "akanjs/base";

export type AppClientEnv = ClientEnv & {
  firebase?: {
    apiKey: string;
    authDomain?: string;
    projectId: string;
    storageBucket?: string;
    messagingSenderId: string;
    appId: string;
    measurementId?: string;
    vapidKey: string;
  };
};
