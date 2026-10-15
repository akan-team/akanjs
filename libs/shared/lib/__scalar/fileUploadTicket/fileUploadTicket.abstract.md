# fileUploadTicket Abstract

What `requestFileUpload` answers: a one-time ticket and the address a caller with no session — an agent's shell —
uploads files to.

## Rules

- The ticket is an opaque random token; the server keeps only its hash, beside the storage directory it was issued for.
- It is spent by the first upload that carries it, and refused after `expiresAt` (10 minutes).
- `uploadUrl` is absolute, built from the app's configured public origin rather than a request's `Host`.
