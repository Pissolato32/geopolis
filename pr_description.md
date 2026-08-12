🎯 **What:** The vulnerability fixed
The server's CORS middleware previously reflected arbitrary `Origin` headers if the `ALLOWED_ORIGINS` environment variable was empty (`ALLOWED_ORIGINS.length === 0`). This effectively meant a default production deployment would permit all cross-origin requests, which is an overly permissive and potentially unsafe fallback.

⚠️ **Risk:** The potential impact if left unfixed
While `Access-Control-Allow-Credentials` is currently disabled (meaning browser-based attacks like CSRF using session cookies are not immediately exploitable), having a permissive "allow all" default is poor security hygiene. If credentials were later enabled or sensitive ambient authority was relied upon, this default could have silently become a major vulnerability. Failing closed is a safer default.

🛡️ **Solution:** How the fix addresses the vulnerability
- Removed `ALLOWED_ORIGINS.length === 0` from the conditional check in `src/server/index.ts`.
- The server will now strictly rely on explicitly allowed origins (`ALLOWED_ORIGINS`) or development previews (`isDevelopmentPreview`).
- When `ALLOWED_ORIGINS` is unset or empty, cross-origin requests from arbitrary domains will no longer be allowed.
- Added regression tests in `src/server/cors.test.ts` to ensure that an empty `ALLOWED_ORIGINS` setting successfully rejects arbitrary origins while continuing to allow development preview origins.
- Verified lint, typecheck, tests, and build all successfully pass.
