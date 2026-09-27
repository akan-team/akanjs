import { getCookie, setCookie } from "akanjs/client";
export const readTheme = () => getCookie("theme"); // @ok
export const writeTheme = (value: string) => setCookie("theme", value); // @ok
export const otherDocumentFields = () => document.title; // @ok
export const aFieldNamedCookie = (req: { cookie: string }) => req.cookie; // @ok
export const aLiteral = "document.cookie is empty on app://"; // @ok
export const Docs = () => <p>getCookie reads the request, document.cookie the browser.</p>; // @ok
