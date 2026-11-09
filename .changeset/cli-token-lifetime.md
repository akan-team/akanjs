---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

The CLI refreshes a cloud sign-in once less than an hour, or half the token's lifetime, is left, whichever is shorter. Before, a token that lived an hour or less read as due the moment it arrived, so every command rotated the refresh token and then called the cloud unsigned. Any unexpired token is now sent with the request.
