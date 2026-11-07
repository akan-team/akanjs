---
"akanjs": patch
---

- An endpoint's answer keeps a `""` a nullable `String` field holds, so a field declared `field(String, { default: "" })`, in a model or an embedded scalar, reaches the client as `""` rather than `null`. An argument or input left `""` is still sent as not given.
