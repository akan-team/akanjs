interface Translator {
  _: (key: string) => string;
}

/** `l._` echoes an absent key back, and a raw `user.signal.x.desc` reads as prose on a document surface. */
export const dictText = (l: Translator, key: string) => {
  const text = l._(key);
  return text === key ? "" : text;
};
