//! UNUserNotificationCenter for the local-notifications plugin on macOS (plugins.md Q-P6 (b1)):
//! the classes are looked up by name and called with `msg_send!`; the framework is only linked,
//! so no objc2-user-notifications crate (it is not in the macOS build).
//!
//! Shell ops (answered from completion handlers, so `reply` comes later, off the main thread):
//!   notify.status                → {"status": UNAuthorizationStatus}
//!   notify.request {provisional} → asks, then {"status": …}
//!   notify.add {items: [{id, title, body, at, every?, data?}]} → null once every add finished
//!   notify.pending / notify.delivered → [{id, title, body, data, at, every, next, date, ours}]
//!   notify.removePending / notify.removeDelivered {ids: [string]} → null
//! Events: {"type":"notification","event":"received"|"action","notification":{…}} from the delegate.
//!
//! The request layout matches the iOS plugin (plugins/local-notifications/ios): identifier = the id,
//! userInfo carries a marker, the target time, the repeat and the data as JSON text.

use std::ffi::CStr;
use std::sync::{Arc, Mutex, Once};

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, AnyProtocol, Bool, NSObject, NSObjectProtocol};
use objc2::{define_class, msg_send, ClassType};
use objc2_foundation::NSString;

use crate::json::{self, V};

#[link(name = "UserNotifications", kind = "framework")]
extern "C" {}

const MARKER: &str = "akan-native.ln";
const DATA: &str = "akan-native.data";
const EVERY: &str = "akan-native.every";
const AT: &str = "akan-native.at";
/// Info.plist key a plugin sets (macos.infoPlist) so the shell becomes the delegate at launch,
/// before AppKit finishes launching: a click that starts the app is only delivered to a delegate
/// that exists by then (UNUserNotificationCenter.h).
const PLIST_KEY: &str = "AkanNativeUserNotifications";

// UNNotificationPresentationOptions: sound 1<<1, list 1<<3, banner 1<<4.
const PRESENT: usize = (1 << 1) | (1 << 3) | (1 << 4);
// UNAuthorizationOptions: badge 1, sound 2, alert 4, provisional 1<<6.
const ASK: usize = 1 | 2 | 4;
const PROVISIONAL: usize = 1 << 6;
// NSCalendarUnit: weekday 1<<9, hour 1<<5, minute 1<<6, second 1<<7.
const WEEKDAY: usize = 1 << 9;
const HOUR: usize = 1 << 5;
const MINUTE: usize = 1 << 6;
const SECOND: usize = 1 << 7;

fn class(name: &CStr) -> Result<&'static AnyClass, String> {
  AnyClass::get(name).ok_or_else(|| format!("{} is not available", name.to_string_lossy()))
}

fn ns(s: &str) -> Retained<NSString> {
  NSString::from_str(s)
}

fn is_kind(obj: &AnyObject, name: &CStr) -> bool {
  AnyClass::get(name).is_some_and(|c| unsafe { msg_send![obj, isKindOfClass: c] })
}

fn string_of(obj: Option<&AnyObject>) -> Option<String> {
  let obj = obj?;
  if !is_kind(obj, c"NSString") {
    return None;
  }
  // Safety: checked to be an NSString just above.
  Some(unsafe { &*(obj as *const AnyObject as *const NSString) }.to_string())
}

fn number_of(obj: Option<&AnyObject>) -> Option<f64> {
  let obj = obj?;
  is_kind(obj, c"NSNumber").then(|| unsafe { msg_send![obj, doubleValue] })
}

fn get(obj: &AnyObject, key: &str) -> Option<Retained<AnyObject>> {
  unsafe { msg_send![obj, objectForKey: &*ns(key)] }
}

fn center() -> Result<Retained<AnyObject>, String> {
  install();
  Ok(unsafe { msg_send![class(c"UNUserNotificationCenter")?, currentNotificationCenter] })
}

fn error_text(error: *mut AnyObject) -> String {
  if error.is_null() {
    return "unknown error".into();
  }
  let text: Option<Retained<NSString>> = unsafe { msg_send![&*error, localizedDescription] };
  text.map(|t| t.to_string()).unwrap_or_else(|| "unknown error".into())
}

fn num(v: Option<f64>) -> String {
  v.filter(|n| n.is_finite()).map_or_else(|| "null".into(), |n| format!("{}", n.round()))
}

fn opt_str(v: Option<String>) -> String {
  v.map_or_else(|| "null".into(), |s| json::quote(&s))
}

fn date_ms(date: Option<&AnyObject>) -> Option<f64> {
  let date = date?;
  let seconds: f64 = unsafe { msg_send![date, timeIntervalSince1970] };
  Some(seconds * 1000.0)
}

/// A UNNotificationRequest as the plugin host reads it (`date`: when it was shown, if delivered).
fn request_json(request: &AnyObject, date: Option<f64>) -> String {
  let id: Option<Retained<AnyObject>> = unsafe { msg_send![request, identifier] };
  let content: Option<Retained<AnyObject>> = unsafe { msg_send![request, content] };
  let (mut title, mut body, mut data, mut at, mut every, mut ours) = (None, None, None, None, None, false);
  if let Some(content) = content.as_deref() {
    let t: Option<Retained<AnyObject>> = unsafe { msg_send![content, title] };
    let b: Option<Retained<AnyObject>> = unsafe { msg_send![content, body] };
    title = string_of(t.as_deref());
    body = string_of(b.as_deref());
    let info: Option<Retained<AnyObject>> = unsafe { msg_send![content, userInfo] };
    if let Some(info) = info.as_deref() {
      ours = get(info, MARKER).is_some();
      data = string_of(get(info, DATA).as_deref());
      at = number_of(get(info, AT).as_deref());
      every = string_of(get(info, EVERY).as_deref());
    }
  }
  let trigger: Option<Retained<AnyObject>> = unsafe { msg_send![request, trigger] };
  // Calendar triggers know their next date; time-interval ones count from the moment asked (iOS plugin note).
  let next = trigger.as_deref().filter(|t| is_kind(t, c"UNCalendarNotificationTrigger")).and_then(|t| {
    let next: Option<Retained<AnyObject>> = unsafe { msg_send![t, nextTriggerDate] };
    date_ms(next.as_deref())
  });
  format!(
    r#"{{"id":{},"title":{},"body":{},"data":{},"at":{},"every":{},"next":{},"date":{},"ours":{ours}}}"#,
    opt_str(string_of(id.as_deref())),
    opt_str(title),
    opt_str(body),
    opt_str(data),
    num(at),
    opt_str(every),
    num(next),
    num(date),
  )
}

fn array_json(array: *mut AnyObject, item: impl Fn(&AnyObject) -> String) -> String {
  if array.is_null() {
    return "[]".into();
  }
  let array = unsafe { &*array };
  let count: usize = unsafe { msg_send![array, count] };
  let items: Vec<String> = (0..count)
    .map(|i| {
      let obj: Retained<AnyObject> = unsafe { msg_send![array, objectAtIndex: i] };
      item(&obj)
    })
    .collect();
  format!("[{}]", items.join(","))
}

fn ns_array(strings: &[String]) -> Result<Retained<AnyObject>, String> {
  let array: Retained<AnyObject> = unsafe { msg_send![class(c"NSMutableArray")?, array] };
  for s in strings {
    let _: () = unsafe { msg_send![&*array, addObject: &*ns(s)] };
  }
  Ok(array)
}

// ───────────────────────── delegate ─────────────────────────

fn event(kind: &str, request: &AnyObject) {
  let json = format!(r#"{{"type":"notification","event":"{kind}","notification":{}}}"#, request_json(request, None));
  crate::push_event(&json);
}

fn is_ours(request: &AnyObject) -> bool {
  let content: Option<Retained<AnyObject>> = unsafe { msg_send![request, content] };
  let info: Option<Retained<AnyObject>> = content.as_deref().and_then(|c| unsafe { msg_send![c, userInfo] });
  info.as_deref().is_some_and(|i| get(i, MARKER).is_some())
}

define_class!(
  #[unsafe(super(NSObject))]
  #[name = "AkanNativeNotificationCenterDelegate"]
  struct Delegate;

  unsafe impl NSObjectProtocol for Delegate {}

  impl Delegate {
    /// Delivered while the app is frontmost: show it like in the background and tell the page.
    #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
    fn will_present(&self, _center: &AnyObject, notification: &AnyObject, handler: &block2::Block<dyn Fn(usize)>) {
      let request: Retained<AnyObject> = unsafe { msg_send![notification, request] };
      if is_ours(&request) {
        event("received", &request);
        handler.call((PRESENT,));
      } else {
        handler.call((0,));
      }
    }

    /// A click on the notification (the default action). The host keeps it until the page listens (C2).
    #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
    fn did_receive(&self, _center: &AnyObject, response: &AnyObject, handler: &block2::Block<dyn Fn()>) {
      let action: Option<Retained<AnyObject>> = unsafe { msg_send![response, actionIdentifier] };
      let notification: Retained<AnyObject> = unsafe { msg_send![response, notification] };
      let request: Retained<AnyObject> = unsafe { msg_send![&*notification, request] };
      if is_ours(&request) && string_of(action.as_deref()).as_deref() == Some("com.apple.UNNotificationDefaultActionIdentifier") {
        event("action", &request);
      }
      handler.call(());
    }
  }
);

static INSTALL: Once = Once::new();

/// Makes the shell the center's delegate (once). The center keeps its delegate weakly: leaked on purpose.
pub fn install() {
  INSTALL.call_once(|| {
    let Ok(center_class) = class(c"UNUserNotificationCenter") else { return };
    let center: Retained<AnyObject> = unsafe { msg_send![center_class, currentNotificationCenter] };
    let class = Delegate::class();
    if let Some(protocol) = AnyProtocol::get(c"UNUserNotificationCenterDelegate") {
      // Not declared by define_class! (no binding crate); some frameworks check conformsToProtocol:.
      unsafe { objc2::ffi::class_addProtocol(class as *const AnyClass as *mut AnyClass, protocol) };
    }
    let delegate: Retained<Delegate> = unsafe { msg_send![class, new] };
    let _: () = unsafe { msg_send![&*center, setDelegate: &*delegate] };
    std::mem::forget(delegate);
  });
}

/// At launch, when a plugin asked for it through Info.plist (see PLIST_KEY).
pub fn install_if_declared() {
  let Ok(bundle_class) = class(c"NSBundle") else { return };
  let bundle: Retained<AnyObject> = unsafe { msg_send![bundle_class, mainBundle] };
  let value: Option<Retained<AnyObject>> = unsafe { msg_send![&*bundle, objectForInfoDictionaryKey: &*ns(PLIST_KEY)] };
  let on = value.as_deref().is_some_and(|v| is_kind(v, c"NSNumber") && unsafe { msg_send![v, boolValue] });
  if on {
    install();
  }
}

// ───────────────────────── ops ─────────────────────────

/// Handles `notify.*` ops; false for anything else. The answer goes through `crate::reply`.
pub fn shell_op(id: u64, json_text: &str) -> bool {
  let Ok(cmd) = json::parse(json_text) else { return false };
  let Some(op) = cmd.get("op").and_then(|v| v.as_str()) else { return false };
  if !op.starts_with("notify.") {
    return false;
  }
  if let Err(message) = run(id, op, &cmd) {
    crate::reply(id, Err(message));
  }
  true
}

fn ids(cmd: &V) -> Result<Vec<String>, String> {
  match cmd.get("ids") {
    Some(V::Arr(items)) => items.iter().map(|v| v.as_str().map(str::to_string).ok_or_else(|| "ids must be strings".to_string())).collect(),
    _ => Err("ids is required".into()),
  }
}

fn status_then(center: &AnyObject, done: impl Fn(isize) + 'static) {
  let block = RcBlock::new(move |settings: *mut AnyObject| {
    let status: isize = if settings.is_null() { 0 } else { unsafe { msg_send![&*settings, authorizationStatus] } };
    done(status);
  });
  let _: () = unsafe { msg_send![center, getNotificationSettingsWithCompletionHandler: &*block] };
}

fn run(id: u64, op: &str, cmd: &V) -> Result<(), String> {
  let center = center()?;
  match op {
    "notify.status" => status_then(&center, move |s| crate::reply(id, Ok(format!(r#"{{"status":{s}}}"#)))),
    "notify.request" => {
      let provisional = cmd.get("provisional").and_then(|v| v.as_bool()).unwrap_or(false);
      let options = ASK | if provisional { PROVISIONAL } else { 0 };
      let again = center.clone();
      let block = RcBlock::new(move |_granted: Bool, error: *mut AnyObject| {
        if !error.is_null() {
          return crate::reply(id, Err(format!("requestAuthorization failed: {}", error_text(error))));
        }
        status_then(&again, move |s| crate::reply(id, Ok(format!(r#"{{"status":{s}}}"#))));
      });
      let _: () = unsafe { msg_send![&*center, requestAuthorizationWithOptions: options, completionHandler: &*block] };
    }
    "notify.add" => {
      let Some(V::Arr(items)) = cmd.get("items") else { return Err("items is required".into()) };
      let requests = items.iter().map(request).collect::<Result<Vec<_>, _>>()?;
      if requests.is_empty() {
        crate::reply(id, Ok("null".into()));
        return Ok(());
      }
      // (still to add, first error): answer once, after the last completion handler.
      let state = Arc::new(Mutex::new((requests.len(), None::<String>)));
      for req in &requests {
        let state = state.clone();
        let block = RcBlock::new(move |error: *mut AnyObject| {
          let mut s = state.lock().unwrap();
          if !error.is_null() && s.1.is_none() {
            s.1 = Some(error_text(error));
          }
          s.0 -= 1;
          if s.0 == 0 {
            crate::reply(id, s.1.take().map_or_else(|| Ok("null".into()), |e| Err(format!("scheduling failed: {e}"))));
          }
        });
        let _: () = unsafe { msg_send![&*center, addNotificationRequest: &**req, withCompletionHandler: &*block] };
      }
    }
    "notify.pending" => {
      let block = RcBlock::new(move |array: *mut AnyObject| crate::reply(id, Ok(array_json(array, |r| request_json(r, None)))));
      let _: () = unsafe { msg_send![&*center, getPendingNotificationRequestsWithCompletionHandler: &*block] };
    }
    "notify.delivered" => {
      let block = RcBlock::new(move |array: *mut AnyObject| {
        crate::reply(
          id,
          Ok(array_json(array, |n| {
            let request: Retained<AnyObject> = unsafe { msg_send![n, request] };
            let date: Option<Retained<AnyObject>> = unsafe { msg_send![n, date] };
            request_json(&request, date_ms(date.as_deref()))
          })),
        )
      });
      let _: () = unsafe { msg_send![&*center, getDeliveredNotificationsWithCompletionHandler: &*block] };
    }
    "notify.removePending" => {
      let list = ns_array(&ids(cmd)?)?;
      let _: () = unsafe { msg_send![&*center, removePendingNotificationRequestsWithIdentifiers: &*list] };
      crate::reply(id, Ok("null".into()));
    }
    "notify.removeDelivered" => {
      let list = ns_array(&ids(cmd)?)?;
      let _: () = unsafe { msg_send![&*center, removeDeliveredNotificationsWithIdentifiers: &*list] };
      crate::reply(id, Ok("null".into()));
    }
    _ => return Err(format!("unknown op {op}")),
  }
  Ok(())
}

/// One UNNotificationRequest. `at` is epoch ms; `every` makes it a repeating calendar trigger on
/// the components of `at` (so day and week keep the local time across DST, like iOS).
fn request(item: &V) -> Result<Retained<AnyObject>, String> {
  let id = item.get("id").and_then(|v| v.as_f64()).filter(|n| n.fract() == 0.0).ok_or("id must be an integer")?;
  let title = item.get("title").and_then(|v| v.as_str()).ok_or("title must be a string")?;
  let body = item.get("body").and_then(|v| v.as_str()).unwrap_or("");
  let at = item.get("at").and_then(|v| v.as_f64()).filter(|n| n.is_finite()).ok_or("at must be epoch ms")?;
  let every = item.get("every").and_then(|v| v.as_str());
  if let Some(e) = every {
    if !["minute", "hour", "day", "week"].contains(&e) {
      return Err("every must be minute, hour, day or week".into());
    }
  }
  let data = item.get("data").and_then(|v| v.as_str());
  unsafe {
    let content: Retained<AnyObject> = msg_send![class(c"UNMutableNotificationContent")?, new];
    let _: () = msg_send![&*content, setTitle: &*ns(title)];
    let _: () = msg_send![&*content, setBody: &*ns(body)];
    let sound: Retained<AnyObject> = msg_send![class(c"UNNotificationSound")?, defaultSound];
    let _: () = msg_send![&*content, setSound: &*sound];
    let info: Retained<AnyObject> = msg_send![class(c"NSMutableDictionary")?, dictionary];
    let set = |key: &str, value: &AnyObject| {
      let _: () = msg_send![&*info, setObject: value, forKey: &*ns(key)];
    };
    let marker: Retained<AnyObject> = msg_send![class(c"NSNumber")?, numberWithInt: 1i32];
    set(MARKER, &marker);
    let at_number: Retained<AnyObject> = msg_send![class(c"NSNumber")?, numberWithDouble: at];
    set(AT, &at_number);
    if let Some(e) = every {
      set(EVERY, &ns(e));
    }
    if let Some(d) = data {
      set(DATA, &ns(d));
    }
    let _: () = msg_send![&*content, setUserInfo: &*info];

    let trigger: Option<Retained<AnyObject>> = match every {
      Some(e) => {
        let date: Retained<AnyObject> = msg_send![class(c"NSDate")?, dateWithTimeIntervalSince1970: at / 1000.0];
        let calendar: Retained<AnyObject> = msg_send![class(c"NSCalendar")?, currentCalendar];
        let units = match e {
          "minute" => SECOND,
          "hour" => MINUTE | SECOND,
          "day" => HOUR | MINUTE | SECOND,
          _ => WEEKDAY | HOUR | MINUTE | SECOND,
        };
        let parts: Retained<AnyObject> = msg_send![&*calendar, components: units, fromDate: &*date];
        Some(msg_send![class(c"UNCalendarNotificationTrigger")?, triggerWithDateMatchingComponents: &*parts, repeats: true])
      }
      None => {
        let interval = at / 1000.0 - now_seconds();
        // Due now or in the past: no trigger delivers it right away (time-interval triggers need > 0).
        if interval >= 1.0 {
          Some(msg_send![class(c"UNTimeIntervalNotificationTrigger")?, triggerWithTimeInterval: interval, repeats: false])
        } else {
          None
        }
      }
    };
    let identifier = ns(&format!("{}", id as i64));
    Ok(msg_send![class(c"UNNotificationRequest")?, requestWithIdentifier: &*identifier, content: &*content, trigger: trigger.as_deref()])
  }
}

fn now_seconds() -> f64 {
  std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs_f64()).unwrap_or(0.0)
}
