---
"akanjs": patch
---

`akanjs/common` now exports `IpLiteral`. `IpLiteral.parse(text)` spells an address the one way `Ip` reports it, with the port and IPv6 zone dropped and an IPv4-mapped IPv6 address as plain IPv4, or returns `null` when the text is no address. An address your code stores or compares against `Ip` should go through it, since `Ip` no longer hands back a forwarded value as it arrived.
