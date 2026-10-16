/** A `{name}` placeholder whose value is absent is left as written, never replaced by "undefined". */
export const interpolateTranslation = (message: string, data: Record<string, unknown> | undefined) => {
  if (!data) return message;
  //? Not `/{([^}]+)}/g`, which rescans to the end from each `{` no `}` follows; not `[^{}]`, which fills `{{name}}`.
  let result = "";
  let copied = 0;
  let open = message.indexOf("{");
  while (open !== -1) {
    const close = message.indexOf("}", open + 1);
    if (close === -1) break;
    if (close === open + 1) {
      open = message.indexOf("{", close);
      continue;
    }
    const value = data[message.slice(open + 1, close)];
    result += message.slice(copied, open) + (value === undefined ? message.slice(open, close + 1) : String(value));
    copied = close + 1;
    open = message.indexOf("{", copied);
  }
  return result + message.slice(copied);
};
