import { store } from "@akanjs/store";

import { fetch, sig } from "../useClient";

//* 뱃지 카운트를 백그라운드 포어그라운드 모두 동작하게 하기 위해서 indexedDB를 사용
export class NotificationStore extends store(sig.notification, {
  // state
}) {
  // action

  async subscribeDefaultNotification(token: string) {
    await fetch.subscribeToMegaphone(token);
    await fetch.subscribeToSelf(token);
  }
}
