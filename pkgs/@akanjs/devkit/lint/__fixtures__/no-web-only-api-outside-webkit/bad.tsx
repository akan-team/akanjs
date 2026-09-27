export const share = (url: string) => navigator.share({ url }); // @flag
export const canShare = () => typeof navigator.canShare === "function"; // @flag
export const worker = () => navigator.serviceWorker.register("/sw.js"); // @flag
export const ask = () => Notification.requestPermission(); // @flag
export const permission = () => Notification.permission; // @flag
export const locate = () => navigator.geolocation.getCurrentPosition(() => undefined); // @flag
export const buzz = () => navigator.vibrate(50); // @flag
