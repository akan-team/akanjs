export const readTheme = () => document.cookie; // @flag
export const writeTheme = (value: string) => { document.cookie = `theme=${value}`; }; // @flag
export const throughWindow = () => window.document.cookie; // @flag
export const throughGlobalThis = () => globalThis.document.cookie; // @flag
