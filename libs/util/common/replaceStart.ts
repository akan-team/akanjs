export const replaceStart = (str: string) => {
  return str.replace(str.substring(1, str.length), str.substring(1, str.length).replace(/./g, "*"));
};
