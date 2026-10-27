---
"akanjs": patch
---

`AKAN_TRUSTED_PROXIES` now replaces the private ranges instead of adding to them, and a list of proxies switches on strict reading of `X-Forwarded-For`.

Unset or blank, the trusted proxies are unchanged: loopback and the private and link-local ranges. The caller's address is read as before, `X-Real-IP` first, else the leftmost `X-Forwarded-For` entry. `*` trusts every peer and reads the address the same way.

Set to a list, only loopback and what the list names are trusted: addresses or CIDRs, `private` for the private ranges, or `none` for loopback alone. An entry that is neither an address nor a CIDR is ignored with a warning. `X-Forwarded-For` is then walked from the right past every trusted proxy, and the first address that is not one is the caller (the leftmost when every hop is trusted). `X-Real-IP` counts only when no `X-Forwarded-For` arrives. A private-range peer the list leaves out is taken as the caller itself, and the first time its forwarded headers are ignored the server warns once, naming that peer.

In every mode a forwarded value counts only when it is an IP address, and it reaches `Ip` in one canonical spelling: an IPv6 zone is dropped, and an IPv4 octet with a leading zero (`010.0.0.1`) is not an address. An `X-Real-IP` that is not an address gives way to `X-Forwarded-For`, and a leftmost entry that is not one gives way to the peer's own address.

**We recommend setting the list** to your load balancer's and ingress controller's own addresses, or to a CIDR that holds only them. Your proxy must set or append `X-Forwarded-For`; one that sets only `X-Real-IP` and passes the client's `X-Forwarded-For` through must be fixed first. `private` keeps an in-cluster ingress working, but it also lets any pod in those ranges name any caller, so pair it with a NetworkPolicy that admits only the ingress to the app's port.

**If you already set `AKAN_TRUSTED_PROXIES`:**
- A private-range ingress your list does not name is no longer trusted, so every caller reads as that ingress. Add its address or CIDR.
- A list of proxies now takes the address from the right-hand walk of `X-Forwarded-For`, not from `X-Real-IP`.
- `*` beside other entries now trusts every peer, where before it was ignored and the rest of the list applied; the server warns about it at startup. Remove `*` to keep the list. `*` alone is unchanged.

In every mode the gateway hands each replica the one address it resolved, as both `X-Real-IP` and a single-entry `X-Forwarded-For`. It passes `X-Forwarded-Port`, `X-Forwarded-Host` and `X-Forwarded-Proto` on only from a trusted proxy, and otherwise sets them from the peer's port, the request's `Host` and its own scheme. A solo server likewise drops `X-Forwarded-Host`, `X-Forwarded-Proto` and `X-Forwarded-Port` from any other peer before a route reads them, so the cross-site check, sub-route hosts, MCP OAuth metadata and a page's public URL go by `Host` and the server's own scheme. A proxy at a public address that rewrites `Host` must be in the list, or mutations from the browser are refused as cross-site. So `Ip`, `context.getClientIp()` and the websocket address in a replica always equal the gateway's answer.
