// The refresh token's lifetime (SecurityService.refreshTokenDays). Without a Max-Age an auth cookie is a session
// cookie, and a mobile browser or home-screen app drops those with its process.
export const sessionCookieMaxAgeSec = 30 * 24 * 60 * 60;
