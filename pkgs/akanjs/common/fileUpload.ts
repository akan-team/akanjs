interface FileUploadSerializedEndpoint {
  fileUpload?: boolean;
}

interface FileUploadSerializedSignal {
  prefix?: string;
  endpoint: Record<string, FileUploadSerializedEndpoint>;
}

/** Framework-owned file-upload contract shared by client-safe packages. */
export const fileUploadContract = {
  fields: { files: "files", metas: "metas", type: "type", parentId: "parentId" },
  buildMetas: (fileList: FileList | File[]) =>
    Array.from(fileList).map((f) => ({ lastModifiedAt: new Date(f.lastModified).toISOString(), size: f.size })),
} as const;

export interface FileUploadCapability {
  refName: string;
  endpointKey: string;
  prefix?: string;
}

/** Discovers the upload endpoint marked with `{ fileUpload: true }` from the serialized signal. */
export const resolveFileUploadCapability = (
  serializedSignal: Record<string, FileUploadSerializedSignal>,
): FileUploadCapability | null => {
  const matches: FileUploadCapability[] = [];
  for (const [refName, signal] of Object.entries(serializedSignal))
    for (const [endpointKey, endpoint] of Object.entries(signal.endpoint))
      if (endpoint.fileUpload) matches.push({ refName, endpointKey, prefix: signal.prefix });
  if (matches.length > 1)
    console.warn(
      `[akan] Multiple fileUpload endpoints found (${matches
        .map((m) => `${m.refName}.${m.endpointKey}`)
        .join(", ")}). Using the first; mark only one mutation with { fileUpload: true }.`,
    );
  return matches[0] ?? null;
};
