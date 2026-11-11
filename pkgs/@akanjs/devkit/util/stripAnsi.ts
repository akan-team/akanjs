const ansi = new RegExp(`${String.fromCharCode(27)}(?:[@-Z\\\\-_]|\\[[\\s\\S]*?[@-~])`, "g");

export const stripAnsi = (text: string) => text.replace(ansi, "");
