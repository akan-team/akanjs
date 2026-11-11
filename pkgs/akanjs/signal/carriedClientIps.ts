export const carriedClientIps = new WeakMap<Request, { ip: string | null; trustedHop: boolean }>();
