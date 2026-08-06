export interface ObjectStorageOptions {
  service: "s3" | "minio" | "r2" | "naver" | (string & {});
  region: string;
  accessKey: string;
  secretAccessKey: string;
  distributionId: string | null;
  bucket: string;
  host: string | null;
  protocol?: "http" | "https";
  endpoint?: string;
}
