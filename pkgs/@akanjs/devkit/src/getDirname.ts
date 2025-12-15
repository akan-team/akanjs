import path from "path";

export const getDirname = (url: string) => path.dirname(new URL(url).pathname);
