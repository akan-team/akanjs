/**
 * An estimated token count as a chat-sized label. Rounded hard on purpose: the estimate itself is four characters
 * to a token, so a digit-exact figure would claim a precision it does not have — what a reader needs from it is
 * whether a tool result cost a hundred tokens or a million.
 */
export const tokenCount = (count: number): string => {
  if (count < 1_000) return String(count);
  if (count < 1_000_000) return `${Math.round(count / 100) / 10}k`;
  return `${Math.round(count / 100_000) / 10}M`;
};
