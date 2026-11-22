---
"akanjs": patch
---

`@libs/shared` keeps a phone or email verification code as an HMAC under a key the cache does not hold.

The cache kept each six-digit code as `<phone|address>:sha256(code)`, which a copy of the cache reverses in a million tries, and compared it with `!==`. `SignCode` (`@libs/shared/srvkit`, the code methods moved out of `SignChallenge`) stores HMAC-SHA-256 over the topic, slot, phone or address and code, under a key HKDF derives from the server's JWT secret, and compares with `timingSafeEqual`. The phone number or address no longer sits in the cached value, and the limits stay as they were. `SignService` takes `jwtSecret` the way `UserService` does, so no new env value. Sign tokens, rate-limit keys and counters still use `hashToken`.

At deploy, a code requested in the 3 minutes (phone) or 10 minutes (email) before the new build starts answers as a wrong code once, uncounted, and a new request works at once. Rotating the JWT secret fails live codes the same way.
