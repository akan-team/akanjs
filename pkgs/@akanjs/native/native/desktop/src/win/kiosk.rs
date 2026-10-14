//! What a page of an unattended app (desktop.recovery "reload") cannot open on Windows, where WebView2 would leave the
//! kiosk: a print dialog (its PDF printer saves through a file dialog), a file dialog, a PDF's save and print buttons,
//! a download's "show in folder", another program by scheme (navigation::refuse_launches). The app's own plugin calls,
//! such as the file-picker plugin's dialogs, are the app's to make.

use webview2_com::{
  CallDevToolsProtocolMethodCompletedHandler,
  Microsoft::Web::WebView2::Win32::{
    ICoreWebView2Settings7, COREWEBVIEW2_PDF_TOOLBAR_ITEMS_MORE_SETTINGS, COREWEBVIEW2_PDF_TOOLBAR_ITEMS_PRINT,
    COREWEBVIEW2_PDF_TOOLBAR_ITEMS_SAVE, COREWEBVIEW2_PDF_TOOLBAR_ITEMS_SAVE_AS,
  },
};
use windows::core::{Interface, HSTRING};
use wry::WebViewExtWindows;

pub fn lock(webview: &wry::WebView, label: &str) {
  let core = webview.webview();
  let intercepting = label.to_string();
  let done = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |result, _| {
    if let Err(e) = result {
      log!("{intercepting}: a file input past the page's script may still open a file dialog: {e}");
    }
    Ok(())
  }));
  //? Chromium's own interception, under the script: an input in a closed shadow root, or clicked with dispatchEvent,
  //? opens no dialog either. It holds for the documents of the page's own process; a cross-site frame has the script.
  //? Chromium sends the intercepted chooser as a Page domain event, which it takes only once that domain is enabled.
  let enabled = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(|_, _| Ok(())));
  let _ = unsafe { core.CallDevToolsProtocolMethod(&HSTRING::from("Page.enable"), &HSTRING::from("{}"), &enabled) };
  let method = HSTRING::from("Page.setInterceptFileChooserDialog");
  if let Err(e) = unsafe { core.CallDevToolsProtocolMethod(&method, &HSTRING::from(r#"{"enabled":true}"#), &done) } {
    log!("{label}: a file input past the page's script may still open a file dialog: {e}");
  }
  let hidden = COREWEBVIEW2_PDF_TOOLBAR_ITEMS_SAVE
    | COREWEBVIEW2_PDF_TOOLBAR_ITEMS_SAVE_AS
    | COREWEBVIEW2_PDF_TOOLBAR_ITEMS_PRINT
    | COREWEBVIEW2_PDF_TOOLBAR_ITEMS_MORE_SETTINGS;
  let pdf = unsafe { core.Settings() }.and_then(|s| s.cast::<ICoreWebView2Settings7>()).and_then(|s| unsafe { s.SetHiddenPdfToolbarItems(hidden) });
  if let Err(e) = pdf {
    log!("{label}: a PDF it shows keeps its save and print buttons: {e}");
  }
}
