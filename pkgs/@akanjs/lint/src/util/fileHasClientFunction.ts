/* eslint-disable */
const reactClientFunctionSet = new Set([
  "useState",
  "useEffect",
  "useContext",
  "useReducer",
  "useCallback",
  "useMemo",
  "useRef",
  "useImperativeHandle",
  "useLayoutEffect",
  "useDebugValue",
]);
const frameworkClientFunctionSet = new Set(["st"]);

export const fileHasClientFunction = (node) => {
  if (node.source.value === "react")
    return node.specifiers.some((specifier) => reactClientFunctionSet.has(specifier.local.name));
  else if (node.specifiers.some((specifier) => frameworkClientFunctionSet.has(specifier.local.name))) return true;
  else return false;
};
