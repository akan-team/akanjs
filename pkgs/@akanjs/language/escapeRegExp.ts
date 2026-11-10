const regExpSpecials = /[\\^$.*+?()[\]{}|]/g;

export const escapeRegExp = (text: string) => text.replace(regExpSpecials, (special) => `\\${special}`);
