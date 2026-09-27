//! Secrets on Linux: the Secret Service API (org.freedesktop.secrets: gnome-keyring, KWallet 5.97+,
//! KeePassXC) over the session bus through GDBus from gtk-rs, with the same ops as keychain.rs on
//! macOS (secure-storage keeps its data key there):
//!   keychain.get    {service, account}                → {"value": string | null}
//!   keychain.set    {service, account, value, label?} → null
//!   keychain.delete {service, account}                → null
//! An item carries the attributes service and account (what `secret-tool lookup service … account …`
//! finds) and lives in the "default" collection (the login keyring). Secrets travel over the
//! "plain" session algorithm: the bus is the user's own, as with libsecret by default.
//! A locked item or collection is unlocked first; the service may show its password prompt, and
//! a dismissed prompt is PERMISSION_DENIED. No Secret Service on the bus is UNSUPPORTED.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use gtk::gio;
use gtk::glib::{self, variant::ObjectPath, ToVariant, Variant, VariantTy};

use crate::json;

const NAME: &str = "org.freedesktop.secrets";
const PATH: &str = "/org/freedesktop/secrets";
const SERVICE: &str = "org.freedesktop.Secret.Service";
const ITEM: &str = "org.freedesktop.Secret.Item";
const TIMEOUT_MS: i32 = 10_000;
/// How long a password prompt may stay open.
const PROMPT_WAIT: Duration = Duration::from_secs(300);

struct Secrets {
  conn: gio::DBusConnection,
  session: ObjectPath,
}

fn failed(what: &str, e: &glib::Error) -> String {
  let message = e.message();
  let name = message.strip_prefix("GDBus.Error:").and_then(|rest| rest.split_once(':')).map(|(name, _)| name);
  match name {
    Some("org.freedesktop.DBus.Error.ServiceUnknown") | Some("org.freedesktop.DBus.Error.NameHasNoOwner") => {
      format!("UNSUPPORTED: this session has no Secret Service ({NAME}, e.g. gnome-keyring): {message}")
    }
    Some(n) if n.starts_with("org.freedesktop.DBus.Error.Spawn.") => format!("UNSUPPORTED: the Secret Service did not start: {message}"),
    _ => format!("INTERNAL: Secret Service {what} failed: {message}"),
  }
}

fn path(p: &str) -> Result<ObjectPath, String> {
  ObjectPath::try_from(p.to_string()).map_err(|_| format!("INTERNAL: not an object path: {p}"))
}

impl Secrets {
  fn open() -> Result<Self, String> {
    let conn = gio::bus_get_sync(gio::BusType::Session, None::<&gio::Cancellable>).map_err(|e| format!("UNSUPPORTED: no D-Bus session bus ({e})"))?;
    let mut me = Secrets { conn, session: path("/")? };
    let reply = me.call(PATH, SERVICE, "OpenSession", Some(&("plain", "".to_variant()).to_variant()), "(vo)")?;
    let (_, session) = reply.get::<(Variant, ObjectPath)>().ok_or("INTERNAL: OpenSession answered no session")?;
    me.session = session;
    Ok(me)
  }

  fn call(&self, object: &str, interface: &str, method: &str, args: Option<&Variant>, reply: &str) -> Result<Variant, String> {
    let reply = VariantTy::new(reply).expect("a D-Bus reply type");
    self
      .conn
      .call_sync(Some(NAME), object, interface, method, args, Some(reply), gio::DBusCallFlags::NONE, TIMEOUT_MS, None::<&gio::Cancellable>)
      .map_err(|e| failed(method, &e))
  }

  /// Runs a prompt the service asked for ("/" = none) and returns its result. The Completed
  /// signal arrives on this thread's own main context, iterated here until it comes.
  fn prompt(&self, prompt: &ObjectPath) -> Result<Option<Variant>, String> {
    if prompt.as_str() == "/" {
      return Ok(None);
    }
    let context = glib::MainContext::new();
    context
      .with_thread_default(|| {
        let done: Arc<Mutex<Option<(bool, Variant)>>> = Arc::new(Mutex::new(None));
        let sink = done.clone();
        let subscription = self.conn.signal_subscribe(
          Some(NAME),
          Some("org.freedesktop.Secret.Prompt"),
          Some("Completed"),
          Some(prompt.as_str()),
          None,
          gio::DBusSignalFlags::NONE,
          move |_, _, _, _, _, params| {
            if let Some(result) = params.get::<(bool, Variant)>() {
              *sink.lock().unwrap() = Some(result);
            }
          },
        );
        // window-id "": no parent window to attach the prompt to.
        let started = self.call(prompt.as_str(), "org.freedesktop.Secret.Prompt", "Prompt", Some(&("",).to_variant()), "()");
        let deadline = Instant::now() + PROMPT_WAIT;
        while started.is_ok() && done.lock().unwrap().is_none() && Instant::now() < deadline {
          if !context.iteration(false) {
            std::thread::sleep(Duration::from_millis(20));
          }
        }
        self.conn.signal_unsubscribe(subscription);
        started?;
        let result = done.lock().unwrap().take();
        match result {
          Some((false, value)) => Ok(Some(value)),
          Some((true, _)) => Err("PERMISSION_DENIED: the keyring was not unlocked (prompt dismissed)".to_string()),
          None => {
            let _ = self.call(prompt.as_str(), "org.freedesktop.Secret.Prompt", "Dismiss", None, "()");
            Err("PERMISSION_DENIED: the keyring password prompt was not answered".to_string())
          }
        }
      })
      .map_err(|e| format!("INTERNAL: {e}"))?
  }

  fn unlock(&self, objects: &[ObjectPath]) -> Result<(), String> {
    let reply = self.call(PATH, SERVICE, "Unlock", Some(&(objects.to_vec(),).to_variant()), "(aoo)")?;
    let (unlocked, prompt) = reply.get::<(Vec<ObjectPath>, ObjectPath)>().ok_or("INTERNAL: Unlock answered nothing")?;
    if unlocked.len() < objects.len() {
      self.prompt(&prompt)?;
    }
    Ok(())
  }

  /// The items with these attributes in any collection, the unlocked ones first.
  fn search(&self, attributes: &HashMap<&str, &str>) -> Result<(Vec<ObjectPath>, Vec<ObjectPath>), String> {
    let reply = self.call(PATH, SERVICE, "SearchItems", Some(&(attributes,).to_variant()), "(aoao)")?;
    reply.get::<(Vec<ObjectPath>, Vec<ObjectPath>)>().ok_or_else(|| "INTERNAL: SearchItems answered nothing".into())
  }

  /// The first item found, unlocked.
  fn find(&self, attributes: &HashMap<&str, &str>) -> Result<Option<ObjectPath>, String> {
    let (unlocked, locked) = self.search(attributes)?;
    if let Some(item) = unlocked.into_iter().next() {
      return Ok(Some(item));
    }
    let Some(item) = locked.into_iter().next() else { return Ok(None) };
    self.unlock(std::slice::from_ref(&item))?;
    Ok(Some(item))
  }

  /// A Secret struct (oayays). Built from its children: a tuple of Rust values would box a Variant as "v".
  fn secret(&self, value: &str) -> Variant {
    let content_type = "text/plain; charset=utf8";
    Variant::tuple_from_iter([self.session.to_variant(), Vec::<u8>::new().to_variant(), Variant::array_from_fixed_array(value.as_bytes()), content_type.to_variant()])
  }

  /// The "default" collection (the login keyring), created when the session has none.
  fn default_collection(&self) -> Result<ObjectPath, String> {
    let reply = self.call(PATH, SERVICE, "ReadAlias", Some(&("default",).to_variant()), "(o)")?;
    let (collection,) = reply.get::<(ObjectPath,)>().ok_or("INTERNAL: ReadAlias answered nothing")?;
    if collection.as_str() != "/" {
      return Ok(collection);
    }
    let mut properties: HashMap<&str, Variant> = HashMap::new();
    properties.insert("org.freedesktop.Secret.Collection.Label", "Login".to_variant());
    let reply = self.call(PATH, SERVICE, "CreateCollection", Some(&(properties, "default").to_variant()), "(oo)")?;
    let (collection, prompt) = reply.get::<(ObjectPath, ObjectPath)>().ok_or("INTERNAL: CreateCollection answered nothing")?;
    if collection.as_str() != "/" {
      return Ok(collection);
    }
    // gnome-keyring asks for the new keyring's password first; the result is the collection.
    self.prompt(&prompt)?.and_then(|v| v.get::<ObjectPath>()).ok_or_else(|| "INTERNAL: no default keyring was created".into())
  }

  fn close(&self) {
    let _ = self.call(self.session.as_str(), "org.freedesktop.Secret.Session", "Close", None, "()");
  }
}

fn get(s: &Secrets, attributes: &HashMap<&str, &str>) -> Result<Option<String>, String> {
  let Some(item) = s.find(attributes)? else { return Ok(None) };
  let reply = s.call(item.as_str(), ITEM, "GetSecret", Some(&(s.session.clone(),).to_variant()), "((oayays))")?;
  let ((_, _, value, _),) = reply.get::<((ObjectPath, Vec<u8>, Vec<u8>, String),)>().ok_or("INTERNAL: GetSecret answered no secret")?;
  String::from_utf8(value).map(Some).map_err(|_| "INTERNAL: the secret is not UTF-8".to_string())
}

fn set(s: &Secrets, attributes: &HashMap<&str, &str>, value: &str, label: &str) -> Result<(), String> {
  // An item that exists (in whichever collection) gets the new secret: no second copy.
  if let Some(item) = s.find(attributes)? {
    s.call(item.as_str(), ITEM, "SetSecret", Some(&Variant::tuple_from_iter([s.secret(value)])), "()")?;
    return Ok(());
  }
  let collection = s.default_collection()?;
  s.unlock(std::slice::from_ref(&collection))?;
  let mut properties: HashMap<&str, Variant> = HashMap::new();
  properties.insert("org.freedesktop.Secret.Item.Label", label.to_variant());
  properties.insert("org.freedesktop.Secret.Item.Attributes", attributes.to_variant());
  let args = Variant::tuple_from_iter([properties.to_variant(), s.secret(value), true.to_variant()]);
  let reply = s.call(collection.as_str(), "org.freedesktop.Secret.Collection", "CreateItem", Some(&args), "(oo)")?;
  let (item, prompt) = reply.get::<(ObjectPath, ObjectPath)>().ok_or("INTERNAL: CreateItem answered nothing")?;
  if item.as_str() == "/" {
    s.prompt(&prompt)?;
  }
  Ok(())
}

fn delete(s: &Secrets, attributes: &HashMap<&str, &str>) -> Result<(), String> {
  let (unlocked, locked) = s.search(attributes)?;
  if !locked.is_empty() {
    s.unlock(&locked)?;
  }
  for item in unlocked.iter().chain(&locked) {
    let reply = s.call(item.as_str(), ITEM, "Delete", None, "(o)")?;
    if let Some((prompt,)) = reply.get::<(ObjectPath,)>() {
      s.prompt(&prompt)?;
    }
  }
  Ok(())
}

fn run(cmd: &json::V) -> Result<String, String> {
  let op = cmd.get("op").and_then(|v| v.as_str()).unwrap_or("");
  let text = |name: &str| cmd.get(name).and_then(|v| v.as_str()).filter(|s| !s.is_empty()).ok_or(format!("{op}: {name} must be a non-empty string"));
  let (service, account) = (text("service")?, text("account")?);
  let attributes = HashMap::from([("service", service), ("account", account)]);
  let secrets = Secrets::open()?;
  let result = match op {
    "keychain.get" => get(&secrets, &attributes).map(|v| format!(r#"{{"value":{}}}"#, v.map_or("null".into(), |s| json::quote(&s)))),
    "keychain.set" => {
      let value = cmd.get("value").and_then(|v| v.as_str()).ok_or("keychain.set: value must be a string")?;
      let label = cmd.get("label").and_then(|v| v.as_str()).map_or_else(|| format!("{service} ({account})"), str::to_string);
      set(&secrets, &attributes, value, &label).map(|_| "null".into())
    }
    "keychain.delete" => delete(&secrets, &attributes).map(|_| "null".into()),
    _ => Err(format!("unknown op {op}")),
  };
  secrets.close();
  result
}

/// keychain.* ops: answered from a thread through `crate::reply` (a prompt waits for the user).
pub fn async_op(id: u64, json_text: &str) -> bool {
  if !json_text.contains("\"keychain.") {
    return false;
  }
  let Ok(cmd) = json::parse(json_text) else { return false };
  if !cmd.get("op").and_then(|v| v.as_str()).is_some_and(|op| op.starts_with("keychain.")) {
    return false;
  }
  std::thread::spawn(move || crate::reply(id, run(&cmd)));
  true
}
