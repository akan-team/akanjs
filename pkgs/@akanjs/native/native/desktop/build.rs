//! Windows (MSVC): embeds a manifest with a dependency on Common Controls 6 into the DLL, where the
//! linker puts a DLL's manifest (resource 2). The Bun executable that loads the DLL has no manifest
//! of its own, so the process would get Common Controls 5.82: no TaskDialogIndirect and unthemed
//! controls. win/dialogs.rs activates this manifest around its dialogs (CreateActCtxW on this DLL),
//! as electrobun/package/src/native/win/nativeWrapper.cpp does with its own DLL (#pragma comment
//! linker /manifestdependency, link /DLL /MANIFEST:EMBED in electrobun/package/build.ts).

fn main() {
  println!("cargo:rerun-if-changed=build.rs");
  let windows = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows");
  let msvc = std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
  if windows && msvc {
    println!("cargo:rustc-link-arg-cdylib=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg-cdylib=/MANIFESTUAC:NO");
    println!(
      "cargo:rustc-link-arg-cdylib=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"
    );
  }
}
