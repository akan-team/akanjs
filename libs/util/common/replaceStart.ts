export const replaceStart = (str: string) => {
  const [first = "", ...rest] = Array.from(str);
  return `${first}${"*".repeat(rest.length)}`;
};
