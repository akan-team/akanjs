// Asset routing rules shared by every host (docs/architecture.md §5): the kernel in @akanjs/native/core,
// which the Rust, Swift and Kotlin hosts implement too and check against the same vectors.

export { isHostPath, type Route, route as routeRequest } from "../../../core/src/kernel.ts";
