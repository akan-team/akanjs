---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
"@akanjs/language": patch
---

A new read-only MCP tool, `get_graph`, returns the Akan Graph, read from source with no dev server. It holds the models with their fields and relations, scalars and enums, slices and endpoints with their guards, and the service methods and queries each one calls. It also holds the store actions that fetch them and the components and pages that use them. Every node and edge carries its file, line and column. A workspace over 600 nodes asks for `app` and/or `module`; a scope keeps its own nodes and their direct neighbours. Files under `env/` are never read.

- **`AkanIndex.graph(readText)`** in `@akanjs/language` builds the graph from the same index that answers definitions. An app module that extends a lib module of the same name links to the app's own node. A component links only through `fetch`, `st` and `sig`, so `option.orgId` is not read as model `org`.
- **The graph types** (`AkanGraph`, `AkanGraphNode`, `AkanGraphEdge` and their kinds) live in `akanjs/common`.
