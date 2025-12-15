"use client";
import { getCookie } from "@akanjs/client";
import { st } from "@shared/client";
import { initializeApp } from "firebase/app";
import { getMessaging, getToken as getTokenFirebase, Messaging } from "firebase/messaging";
import { useEffect, useState } from "react";

export interface UseFirebaseMessagingProps {
  options: FirebaseMessagingOptions;
  serverHttpUri: string;
}

export interface FirebaseMessagingOptions {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
  vapidKey: string;
}

export const useFirebaseMessaging = ({ options, serverHttpUri }: UseFirebaseMessagingProps) => {
  const jwt = getCookie("jwt");
  const self = st.use.self();
  const notiPermission = st.use.notiPermission();
  const [messaging, setMessaging] = useState<Messaging | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [serviceWorkerRegistration, setServiceWorkerRegistration] = useState<ServiceWorkerRegistration | null>(null);
  useEffect(() => {
    if (!self.id || notiPermission === "default" || notiPermission === "denied") return;
    const firebase = initializeApp(options);
    const messaging = getMessaging(firebase);
    setMessaging(messaging);
    const initServiceWorker = async () => {
      const params = new URLSearchParams({
        ...options,
        jwt,
        userId: self.id,
        signalUrl: serverHttpUri,
      } as unknown as Record<string, string>);
      const serviceWorkerRegistration = await navigator.serviceWorker.register(
        `/firebase-messaging-sw.js?${params.toString()}`
      );
      setServiceWorkerRegistration(serviceWorkerRegistration);

      setInitialized(true);
    };
    void initServiceWorker();

    return () => {
      //
    };
  }, [notiPermission]);

  useEffect(() => {
    const requestPermmsion = async () => {
      const permission = await Notification.requestPermission();
      st.do.setNotiPermission(permission);
    };
    void requestPermmsion();
  }, []);

  const getToken = async () => {
    if (!serviceWorkerRegistration || !messaging || notiPermission === "denied") return;
    const token = await getTokenFirebase(messaging, {
      vapidKey: options.vapidKey,
      serviceWorkerRegistration,
    });
    return token;
  };

  return { getToken, initialized };
};
