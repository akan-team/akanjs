/* eslint-disable */
export const fileHasContent = (context: any, node: any) => {
  const firstToken = context.sourceCode.getFirstToken(node);
  return !!firstToken;
};
