"use client";
import { st } from "@shared/client";
import { useEffect } from "react";

export const RequestPermission = () => {
  useEffect(() => {
    const requestPermmsion = async () => {
      const permission = await Notification.requestPermission();
      st.do.setNotiPermission(permission);
    };
    void requestPermmsion();
    // if (permission === "granted") {
    //   console.log("Notification permission granted");
    // }
  }, []);
  return <></>;
};

// interface PermissionProps {
//   selfId: string;
//   firebase: FirebaseAppOptions;
// }

// export const Permission = ({ selfId, firebase }: PermissionProps) => {

//   const jwt = getCookie("jwt");
//   const [permission, setPermission] = useState<NotificationPermission>("default");
//   useEffect(() => {
//     void (async () => {
//       const permission = await Notification.requestPermission();
//       setPermission(permission);
//     })();
//   }, []);

//   useEffect(() => {
//     (() => {
//       if (permission === "default") return;
//       if (!self.id) return;
//       if (typeof window === "undefined") return;
//       const firebase = initializeApp(firebase);
//       const messaging = getMessaging(firebase);
//       const requestPermissionAndGetToken = async () => {
//         if ("serviceWorker" in navigator) {
//           const firebaseKey = env.firebase;
//           const params = new URLSearchParams({
//             ...firebaseKey,
//             jwt,
//             userId: selfId,
//             signalUrl: env.serverHttpUri,
//           } as unknown as Record<string, string>);
//           const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params.toString()}`);
//           // 알림 권한 요청
//           const permission = Notification.permission;

//           if (permission === "granted") {
//             // FCM 토큰 획득

//             const token = await getToken(messaging, {
//               vapidKey: env.firebase.vapidKey,
//               serviceWorkerRegistration: registration,
//             });
//             await fetch.subscribeToMegaphone(token);
//           }

//           if (typeof window !== "undefined" && "serviceWorker" in navigator) {
//             const unsubscribe = onMessage(messaging, (payload) => {
//               //
//               // console.log("payload : ", payload);
//             });
//           }
//         }
//       };

//       void requestPermissionAndGetToken();
//     })();
//   }, [self, permission]);

//   return <></>;
// };
