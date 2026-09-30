# Tunnel CLI

- Source: /references/cli/tunnel
- Mirror: /llms/pages/references/cli/tunnel.md
- Section: references
- Category: references
- Priority: P0

## Headings

- Tunnel CLI (#tunnel-cli)
- Share Or Tunnel (#share-or-tunnel)

## Content

Tunnel CLI

Check on a Phone

A designer opens the screen you just built on their own phone, right now.

Receive a Webhook

A payment provider's webhook reaches the handler you are still editing.

share

One local app connected to a public URL. It has a code, a URL and an expiry.

code

The short name of a share. `--stop` takes it.

The server that issues public hostnames and tracks shares. `akan login` signs in to it.

How long a share lives before it expires on its own.

`akan tunnel [app] [--list <boolean>] [--stop <code>] [--host <url>] [--port <number>] [--ttl <min>]`

Share an app running on this machine on a public URL. The connection runs inside this command, so nothing needs installing before the URL appears. The share lives as long as the command does: Ctrl-C ends it and hands the address back.

App to share. Taken as is when there is only one app, and picked from a list when there are several.

List this account's shares with connection state, code, URL, app name and expiry, then exit.

Revoke the share with this code, then exit.

Akan Cloud to use. In the framework repo (`USE_AKANJS_PKGS=true`) it is `http://localhost:8283`.

Local port to share. Unset, it is the dev port `akan start` gives this app.

Minutes until the share expires on its own. Unset, Akan Cloud decides.

Printed with its expiry and an `akan tunnel --stop <code>` line, and copied to the clipboard.

The first one hands the hostname back. A second exits at once, and the share expires on its TTL.

reconnect

A dropped link is reported and reconnected. The share stays open.

before the app

The share can open before the app listens. Requests are refused until the port opens.

account

A share belongs to the account `akan login` signed in to on that `--host`. `--list` shows them.

Neither asks for an app. They act on the account's shares.

not a deployment

Requests reach the dev server as they are. No auth, cache or build step is added in front.

Shares

Every app the session boots

One app that is already running

Ends when

The dev session ends

You stop the command

Port

The app's dev port

The dev port, or any port with `--port`

Expiry

Akan Cloud's default

`--ttl` minutes, or Akan Cloud's default

The default address

The default address, or the one given to `--host`

Finding the URL

Shown in the view's header and copied with `s`, or printed under `--plain`

Printed and copied to the clipboard

If it fails

The error is printed and the session starts anyway

The command exits with the error

Words Used on This Page

Term

Share Or Tunnel

Both open the same kind of share on the same Akan Cloud. What differs is which process holds it, and so when it ends.

Aspect

Dev session options such as the full-screen view, `--kill` and `--concurrency`.

Sign in to Akan Cloud. Shares belong to this account.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

