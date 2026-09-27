// Placeholder bundle IDs are already claimed on Apple's portal, so device signing fails with "cannot be registered
// to your development team".
export const PLACEHOLDER_APP_IDS = [
  "com.myapp.app",
  "com.myorg.myapp",
  "com.example.app",
  "com.example.myapp",
] as const;
const placeholderAppIdSegment = /^(example|examples|myorg|myapp|mycompany|myorganization|changeme|todo|sample|test)$/;

export const isPlaceholderAppId = (appId: string | null | undefined): boolean => {
  const normalized = appId?.trim().toLowerCase() ?? "";
  if (!normalized) return true;
  if ((PLACEHOLDER_APP_IDS as readonly string[]).includes(normalized)) return true;
  return normalized.split(".").some((segment) => placeholderAppIdSegment.test(segment));
};
