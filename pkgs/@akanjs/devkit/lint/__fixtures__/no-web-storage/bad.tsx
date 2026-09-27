export const readDraft = () => localStorage.getItem("draft"); // @flag
export const writeDraft = (value: string) => localStorage.setItem("draft", value); // @flag
export const readTab = () => sessionStorage.getItem("tab"); // @flag
export const throughWindow = () => window.localStorage.getItem("draft"); // @flag
export const throughGlobalThis = () => globalThis.sessionStorage.clear(); // @flag
export const guarded = () => (typeof localStorage === "undefined" ? null : 1); // @flag
