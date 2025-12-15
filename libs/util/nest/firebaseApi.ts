import { Logger } from "@akanjs/common";
import admin from "firebase-admin";
import { TokenMessage, TopicMessage } from "firebase-admin/messaging";

const baseForm = {
  android: {
    notification: { sound: "default", defaultVibrateTimings: true, defaultSound: true, defaultLightSettings: true },
  },
  apns: { payload: { aps: { sound: "default", badge: 1 } } },
  data: { uriScheme: "luapp://main" },
};
interface DataForm {
  title: string;
  body: string;
  imageUrl?: string;
  token?: string;
  topic?: string;
  data?: { [key: string]: string };
}

export interface FirebaseOptions {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain: string;
}

export class FirebaseApi {
  readonly #logger = new Logger("FirebaseApi");
  readonly #options: FirebaseOptions;
  constructor(options: FirebaseOptions) {
    this.#options = options;

    if (process.env.NODE_ENV === "test") return;
    admin.initializeApp({
      credential: admin.credential.cert(this.#options as admin.ServiceAccount),
    });
    this.#logger.verbose("FirebaseApi initialized");
  }
  #generateForm({ title, body, token, topic, data, imageUrl }: DataForm) {
    if (token) {
      return {
        ...baseForm,
        notification: { title, body, imageUrl },
        android: { ...baseForm.android, notification: { ...baseForm.android.notification, imageUrl } },
        apns: { ...baseForm.apns, payload: { ...baseForm.apns.payload, aps: { mutableContent: true } } },
        fcmOptions: {},
        webpush: {
          notification: {
            title,
            body,
            imageUrl,
            // icon: '/icon.png', // 웹 푸시에 필요한 아이콘
            // badge: '/badge.png', // 선택사항
            // click_action: 'https://your-pwa-url.com', // 선택사항: 클릭 시 이동할 URL
            // actions: [  // 선택사항: 알림에 표시할 액션 버튼
            //   {
            //     action: 'view',
            //     title: '보기'
            //   }
            // ]
          },
          headers: {
            TTL: "86400", // 푸시 메시지 TTL (초 단위)
          },
        },
        ...(token ? { token } : { topic }),
        data,
      } as TokenMessage;
    } else {
      return {
        ...baseForm,
        // notification: { title, body, imageUrl },
        android: { ...baseForm.android, notification: { ...baseForm.android.notification, imageUrl } },
        apns: { ...baseForm.apns, payload: { ...baseForm.apns.payload, aps: { mutableContent: true } } },
        fcmOptions: {},
        webpush: {
          // data: {
          //   title,
          //   body,
          //   imageUrl,
          // },
          notification: {
            title,
            body,
            imageUrl,
            // icon: '/icon.png', // 웹 푸시에 필요한 아이콘
            // badge: '/badge.png', // 선택사항
            // click_action: 'https://your-pwa-url.com', // 선택사항: 클릭 시 이동할 URL
            // actions: [  // 선택사항: 알림에 표시할 액션 버튼
            //   {
            //     action: 'view',
            //     title: '보기'
            //   }
            // ]
          },
          headers: {
            TTL: "86400", // 푸시 메시지 TTL (초 단위)
          },
        },
        topic,
        data,
      } as TopicMessage;
    }
  }

  async subscribeToTopic(token: string, topic: string) {
    return await admin.messaging().subscribeToTopic(token, topic);
  }
  async unsubscribeFromTopic(token: string, topic: string) {
    return await admin.messaging().unsubscribeFromTopic(token, topic);
  }
  async send(dataForm: DataForm) {
    const message = this.#generateForm(dataForm);
    try {
      const sendId = await admin.messaging().send(message);
      if (dataForm.topic) this.#logger.log(`Sended ${dataForm.topic} to topic push notification.`);
      else this.#logger.log(`Sended ${dataForm.token} to token push notification.`);

      return sendId;
    } catch (e) {
      this.#logger.error(`Error sending push notification: ${e}`);
    }
  }
}
