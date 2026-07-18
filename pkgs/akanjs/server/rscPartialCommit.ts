export function isAkanRscPartialCommitEnabled(): boolean {
  return process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT === "1";
}
