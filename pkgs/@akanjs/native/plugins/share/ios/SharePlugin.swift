import UIKit

/// UIActivityViewController.
/// - Presented from the topmost view controller; while a share sheet is already up (this plugin's or
///   the WebView's own navigator.share) the call is CANCELLED
///   (capacitor-plugins/share/ios/Sources/SharePlugin/SharePlugin.swift:67-78).
/// - iPad shows the sheet as a popover, which needs an anchor: centered in the presenter, no arrow (:79-87).
/// - The title becomes the subject (Mail) through UIActivityItemSource, the public API for it;
///   Capacitor and react-native set the private "subject" key with KVC.
/// - completionWithItemsHandler: (nil, false) means the sheet was closed. (type, false) means the user
///   backed out of one activity, and the sheet usually stays up for another choice, so the call waits
///   (react-native RCTActionSheetManager.mm:287-294); if the sheet did go away it resolves not completed.
/// - files: /__akan_native/file/<id> URLs of this session, shared as the files themselves.
/// Arguments arrive decoded and type-checked by the generated SharePluginSpec (PL-10).
final class SharePlugin: SharePluginSpec {
    static let id = "share"
    private static let notLinks: Set<String> = ["javascript", "data", "blob", "file"]
    private static let filePrefix = "/__akan_native/file/"
    private let context: AkanNativePluginContext

    /// canShare answers false for options it cannot decode instead of rejecting (src/index.ts, as
    /// navigator.canShare does); everything else goes through the generated dispatch.
    func handle(_ call: AkanNativeCall) {
        if call.method == "canShare", (try? ShareOptions(akanNative: call.args, at: "")) == nil {
            return call.resolve(["value": false])
        }
        akanNativeDispatch(call)
    }

    init(context: AkanNativePluginContext) {
        self.context = context
    }

    func canShare(_ args: ShareOptions, _ reply: AkanNativeReply<ShareCanShareResult>) {
        // Invalid options are "cannot share", as navigator.canShare answers.
        reply.resolve(ShareCanShareResult(value: reply.call.args.isEmpty || (try? content(args)) != nil))
    }

    private struct Content {
        var subject: String?
        var items: [Any]
    }

    private struct Problem: Error {
        let code: AkanNativeErrorCode
        let message: String
    }

    private func content(_ args: ShareOptions) throws(Problem) -> Content {
        func text(_ value: String?) -> String? {
            value?.isEmpty == false ? value : nil
        }
        let subject = text(args.title)
        var items: [Any] = []
        if let body = text(args.text) { items.append(body) }
        if let link = text(args.url) {
            guard let url = URL(string: link), let scheme = url.scheme?.lowercased(), !Self.notLinks.contains(scheme) else {
                throw Problem(code: .invalidArgs, message: "url must be an absolute URL (got \(link))")
            }
            items.append(url)
        }
        for ref in args.files ?? [] {
            guard let id = Self.fileId(ref) else {
                throw Problem(code: .invalidArgs, message: "files must be /__akan_native/file/ URLs")
            }
            guard let local = localFile(id) else { throw Problem(code: .notFound, message: "\(ref) is not a file of this session") }
            items.append(local)
        }
        guard !items.isEmpty else { throw Problem(code: .invalidArgs, message: "share needs text, url or files") }
        return Content(subject: subject, items: items)
    }

    /// "/__akan_native/file/<id>" or its absolute form "app://localhost/__akan_native/file/<id>".
    private static func fileId(_ ref: String) -> String? {
        var path = ref
        if !ref.hasPrefix("/") {
            guard let url = URL(string: ref), url.scheme == "app", url.host == "localhost" else { return nil }
            path = url.path
        }
        guard path.hasPrefix(filePrefix) else { return nil }
        let id = String(path.dropFirst(filePrefix.count))
        return id.isEmpty || id.contains("/") ? nil : id
    }

    /// The file behind a FileRef id. AkanNativePluginContext has no lookup for this yet, so this reads the
    /// shell's registry (same module); switch to the context once it offers one.
    private func localFile(_ id: String) -> URL? {
        context.file("/__akan_native/file/\(id)")?.url
    }

    func share(_ args: ShareOptions, _ reply: AkanNativeReply<ShareResult>) {
        let content: Content
        do {
            content = try self.content(args)
        } catch {
            return reply.reject(error.code, error.message)
        }
        guard var presenter = context.viewController else { return reply.reject(.internalError, "no view controller to present from") }
        while let next = presenter.presentedViewController {
            if next is UIActivityViewController { return reply.reject(.cancelled, "a share sheet is already open") }
            presenter = next
        }
        let view = presenter.view!

        var items = content.items
        if let subject = content.subject, let first = items.first { items[0] = SubjectItem(first, subject: subject) }
        let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
        sheet.completionWithItemsHandler = { [weak sheet] type, completed, _, error in
            if let error { return reply.reject(.internalError, "sharing failed: \(error.localizedDescription)") }
            if completed { return reply.resolve(ShareResult(completed: true, target: type?.rawValue)) }
            if type == nil { return reply.resolve(ShareResult(completed: false)) }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak sheet] in
                MainActor.assumeIsolated {
                    if sheet?.presentingViewController == nil { reply.resolve(ShareResult(completed: false)) }
                }
            }
        }
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        context.present(sheet) { reply.reject(.internalError, "nothing to present the share sheet from") }
    }
}

/// Wraps the first item to give activities a subject line.
private final class SubjectItem: NSObject, UIActivityItemSource {
    private let item: Any
    private let subject: String

    init(_ item: Any, subject: String) {
        self.item = item
        self.subject = subject
    }

    func activityViewControllerPlaceholderItem(_ controller: UIActivityViewController) -> Any { item }

    func activityViewController(_ controller: UIActivityViewController, itemForActivityType type: UIActivity.ActivityType?) -> Any? { item }

    func activityViewController(_ controller: UIActivityViewController, subjectForActivityType type: UIActivity.ActivityType?) -> String { subject }
}
