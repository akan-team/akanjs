import { haptics } from "akanjs/client/native";
import { useGeoLocation } from "akanjs/webkit";
export const buzz = () => haptics.impact(); // @ok
export const locate = () => useGeoLocation(); // @ok
export const languages = () => navigator.languages; // @ok
export const clipboard = (text: string) => navigator.clipboard.writeText(text); // @ok
export const aField = (payload: { share: boolean }) => payload.share; // @ok
export const aLiteral = "navigator.share is missing on Android"; // @ok
export const Docs = () => <p>navigator.share is missing on Android.</p>; // @ok
export const ModelZone = () => <Notification.Zone.Initialize />; // @ok
export const model = (cnst: { Notification: unknown }) => cnst.Notification; // @ok
