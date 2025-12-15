interface Dict {
  [key: string]: string;
}
export default function getContent(scanInfo: null, dict: Dict = {}) {
  return `
export * from "./backendLogic";
  `;
}
