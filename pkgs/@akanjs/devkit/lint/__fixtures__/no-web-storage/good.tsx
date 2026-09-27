import { secretStorage, storage } from "akanjs/client";
export const readDraft = () => storage.getItem("draft"); // @ok
export const keepToken = (jwt: string) => secretStorage.setItem("jwt", jwt); // @ok
export const aFieldWithTheName = (cache: { localStorage: string }) => cache.localStorage; // @ok
export const anObjectKey = { sessionStorage: false }; // @ok
export const aLiteral = "localStorage works in the shells"; // @ok
export const Docs = () => <p>window.localStorage and sessionStorage work in the shells.</p>; // @ok
