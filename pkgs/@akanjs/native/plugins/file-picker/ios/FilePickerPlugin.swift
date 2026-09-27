import UIKit
import UniformTypeIdentifiers

/// UIDocumentPickerViewController for all three methods.
/// - pickFiles: forOpeningContentTypes with asCopy: true (tauri-plugins-workspace/plugins/dialog/ios/
///   Sources/DialogPlugin.swift uses the same default), so iOS hands over copies in the app's tmp
///   Inbox and no security scope has to be managed. The copies move into the session folder
///   (context.temporaryFile, emptied at launch) and are served as FileRefs.
/// - saveFile: forExporting a staged file named as suggested, asCopy: true. The picker returns the
///   destination, whose name may differ ("Keep Both"). Tauri instead exports an empty placeholder and
///   leaves writing to the app (DialogPlugin.swift saveFileDialog), which cannot work without the
///   destination's security scope; here the content is known up front.
/// - pickDirectory: forOpeningContentTypes [.folder] returns a security-scoped URL. The scope is held
///   only while the files are copied, inside an NSFileCoordinator read (Apple's "Providing access to
///   directories" pattern), so nothing outside the session folder stays reachable. Files still in
///   iCloud (not downloaded) are hidden placeholders and are skipped with the other hidden files.
/// - Closing the picker (Cancel or swiping it down) resolves empty, as camera's library picker does.
/// Arguments arrive decoded and type-checked by the generated FilePickerPluginSpec (PL-10); the
/// rules types cannot express (src/common.ts) are checked here.
final class FilePickerPlugin: NSObject, FilePickerPluginSpec, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
    static let id = "file-picker"
    private let context: AkanNativePluginContext
    private let queue = DispatchQueue(label: "com.akanjs.file-picker", qos: .userInitiated)

    private enum Pending {
        /// Validated and staging content; no picker on screen yet.
        case preparing
        case pick(AkanNativeReply<FilePickerPickFilesResult>)
        case save(AkanNativeReply<FilePickerSaveFileResult>, staging: URL, name: String)
        case directory(AkanNativeReply<FilePickerPickDirectoryResult>, limit: Int)
    }

    private var pending: Pending?

    init(context: AkanNativePluginContext) {
        self.context = context
    }

    private struct Problem: Error {
        let code: AkanNativeErrorCode
        let message: String
    }

    /// One dialog at a time; a Problem thrown by `body` rejects with its code.
    private func attempt<T>(_ reply: AkanNativeReply<T>, _ body: () throws -> Void) {
        guard pending == nil else { return reply.reject(.cancelled, "a file dialog is already open") }
        do {
            try body()
        } catch let error as Problem {
            reply.reject(error.code, error.message)
        } catch {
            reply.reject(.internalError, error.localizedDescription)
        }
    }

    func pickFiles(_ args: FilePickerPickFilesOptions, _ reply: AkanNativeReply<FilePickerPickFilesResult>) {
        attempt(reply) {
            let types = try Self.types(args.types ?? [])
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: Self.contentTypes(types), asCopy: true)
            picker.allowsMultipleSelection = args.multiple ?? false
            present(picker, .pick(reply), reply)
        }
    }

    func pickDirectory(_ args: FilePickerPickDirectoryOptions, _ reply: AkanNativeReply<FilePickerPickDirectoryResult>) {
        attempt(reply) {
            let limit = try Self.limit(args.limit)
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
            picker.allowsMultipleSelection = false
            present(picker, .directory(reply, limit: limit), reply)
        }
    }

    func saveFile(_ args: FilePickerSaveFileOptions, _ reply: AkanNativeReply<FilePickerSaveFileResult>) {
        attempt(reply) { try stage(args, reply) }
    }

    // MARK: arguments (src/common.ts)

    private static func invalid(_ message: String) -> Problem { Problem(code: .invalidArgs, message: message) }

    private static let mimeChars = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789!#$&^_.+-")
    private static let extChars = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789_+-.")

    /// MIME types or extensions, lower case, extensions without the dot; [] = any file.
    private static func types(_ list: [String]) throws -> [String] {
        var out: [String] = []
        for raw in list {
            var t = raw.trimmingCharacters(in: .whitespaces).lowercased()
            if t.hasPrefix(".") { t.removeFirst() }
            if t == "*/*" { return [] }
            let parts = t.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
            let ok: Bool
            if parts.count == 2 {
                ok = !parts[0].isEmpty && parts[0].unicodeScalars.allSatisfy(mimeChars.contains)
                    && (parts[1] == "*" || (!parts[1].isEmpty && parts[1].unicodeScalars.allSatisfy(mimeChars.contains)))
            } else {
                ok = parts.count == 1 && !t.isEmpty && t.count <= 32 && !t.hasPrefix(".") && !t.hasSuffix(".") && !t.contains("..")
                    && t.unicodeScalars.allSatisfy(extChars.contains)
            }
            guard ok else { throw invalid("not a MIME type or file extension: \(raw)") }
            if !out.contains(t) { out.append(t) }
        }
        return out
    }

    /// UTTypes for the picker. A type iOS has no registered UTType for turns the filter off, so the
    /// user is never kept from a file they are looking for.
    private static func contentTypes(_ types: [String]) -> [UTType] {
        var out: [UTType] = []
        for t in types {
            var type: UTType?
            if t.hasSuffix("/*") {
                switch t.dropLast(2) {
                case "image": type = .image
                case "video": type = .movie
                case "audio": type = .audio
                case "text": type = .text
                case "application": type = .data
                case "font": type = .font
                case "model": type = .threeDContent
                default: type = nil
                }
            } else if t.contains("/") {
                type = UTType(mimeType: t)
            } else {
                type = UTType(filenameExtension: t)
            }
            guard let type, !type.isDynamic else { return [.item] }
            out.append(type)
        }
        return out.isEmpty ? [.item] : out
    }

    private static func name(_ name: String) throws -> String {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { throw invalid("name must be a non-empty file name") }
        guard name.count <= 255 else { throw invalid("name is longer than 255 characters") }
        let bad = name.unicodeScalars.contains { $0 == "/" || $0 == "\\" || $0.value < 0x20 || $0.value == 0x7f }
        guard !bad, name != ".", name != ".." else { throw invalid("name must be a file name, not a path (got \(name))") }
        return name
    }

    private static func limit(_ value: Double?) throws -> Int {
        guard let d = value else { return 1000 }
        guard d == d.rounded(), d >= 1, d <= 10000 else { throw invalid("limit must be an integer from 1 to 10000") }
        return Int(d)
    }

    /// Strict base64 (standard alphabet, optional padding), the rule of src/common.ts checkBase64.
    nonisolated private static func decodeBase64(_ text: String) -> Data? {
        let bytes = Array(text.utf8)
        var body = bytes.count
        while body > 0 && bytes[body - 1] == UInt8(ascii: "=") { body -= 1 }
        let padding = bytes.count - body
        let alphabetOK = bytes[..<body].allSatisfy { b in
            (b >= 65 && b <= 90) || (b >= 97 && b <= 122) || (b >= 48 && b <= 57) || b == 43 || b == 47
        }
        guard alphabetOK, padding <= 2, bytes.count % 4 != 1, padding == 0 || bytes.count % 4 == 0 else { return nil }
        return Data(base64Encoded: text + String(repeating: "=", count: (4 - bytes.count % 4) % 4))
    }

    nonisolated private static func mime(_ url: URL) -> String {
        let ext = url.pathExtension
        return ext.isEmpty ? "application/octet-stream" : UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
    }

    /// A new path in the session folder for a copy of `url`, keeping a short extension.
    nonisolated private static func stagedPath(in session: URL, for url: URL) -> URL {
        let ext = String(url.pathExtension.filter { $0.isASCII && ($0.isLetter || $0.isNumber) }.prefix(8))
        return session.appendingPathComponent(UUID().uuidString.lowercased() + (ext.isEmpty ? "" : ".\(ext)"))
    }

    // MARK: presenting

    private func present<T>(_ picker: UIDocumentPickerViewController, _ state: Pending, _ reply: AkanNativeReply<T>) {
        picker.delegate = self
        picker.presentationController?.delegate = self // swipe down → closed
        pending = state
        context.present(picker) { [weak self] in
            self?.pending = nil
            reply.reject(.internalError, "nothing to present the file picker from")
        }
    }

    /// saveFile: checks the content, then stages it and shows the export picker. `mime` is not
    /// needed: iOS files by extension.
    private func stage(_ args: FilePickerSaveFileOptions, _ reply: AkanNativeReply<FilePickerSaveFileResult>) throws {
        let name = try Self.name(args.name)
        guard (args.data != nil) != (args.url != nil) else { throw Self.invalid("pass either data or url") }
        var content: Data?
        var source: URL?
        if let text = args.data {
            switch args.encoding ?? .utf8 {
            case .utf8: content = Data(text.utf8)
            case .base64:
                guard let data = Self.decodeBase64(text) else { throw Self.invalid("data is not valid base64") }
                content = data
            }
        } else if let ref = args.url {
            guard args.encoding == nil else { throw Self.invalid("encoding applies to data, not url") }
            guard !ref.isEmpty else { throw Self.invalid("url must be a non-empty string") }
            guard let file = context.file(ref) else { throw Problem(code: .notFound, message: "\(ref) is not a file of this session") }
            source = file.url
        }

        // Stage a file with the suggested name (the export picker saves it under that name).
        pending = .preparing
        let staging = FileManager.default.temporaryDirectory
            .appendingPathComponent("akan-native-file-picker", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let file = staging.appendingPathComponent(name)
        let box = UncheckedBox((content, source))
        queue.async {
            let problem: String?
            do {
                try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
                let (content, source) = box.value
                if let content { try content.write(to: file) } else if let source { try FileManager.default.copyItem(at: source, to: file) }
                problem = nil
            } catch {
                problem = "could not prepare the file: \(error.localizedDescription)"
            }
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    if let error = problem {
                        self.pending = nil
                        try? FileManager.default.removeItem(at: staging)
                        return reply.reject(.internalError, error)
                    }
                    let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
                    self.present(picker, .save(reply, staging: staging, name: name), reply)
                }
            }
        }
    }

    // MARK: UIDocumentPickerDelegate

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let state = pending else { return }
        pending = nil
        switch state {
        case .preparing:
            break
        case .pick(let reply):
            importFiles(urls, reply)
        case .save(let reply, let staging, let name):
            try? FileManager.default.removeItem(at: staging)
            reply.resolve(FilePickerSaveFileResult(saved: true, name: urls.first?.lastPathComponent ?? name))
        case .directory(let reply, let limit):
            guard let url = urls.first else { return reply.resolve(Self.noDirectory) }
            importDirectory(url, limit, reply)
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finishClosed()
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        finishClosed()
    }

    private static var noDirectory: FilePickerPickDirectoryResult { FilePickerPickDirectoryResult(name: nil, files: [], truncated: false) }

    private func finishClosed() {
        guard let state = pending else { return }
        pending = nil
        switch state {
        case .preparing: break
        case .pick(let reply): reply.resolve(FilePickerPickFilesResult(files: []))
        case .save(let reply, let staging, _):
            try? FileManager.default.removeItem(at: staging)
            reply.resolve(FilePickerSaveFileResult(saved: false))
        case .directory(let reply, _): reply.resolve(Self.noDirectory)
        }
    }

    // MARK: copying

    private struct Staged: Sendable {
        let url: URL
        let name: String
        let mime: String
        /// Relative to the picked folder (pickDirectory only).
        var path = ""
    }

    /// Session folder of the shell (context.temporaryFile's folder).
    private var sessionFolder: URL { context.temporaryFile("x").deletingLastPathComponent() }

    private func register(_ file: Staged) -> AkanNativeFileRef { context.fileRef(file.url, mime: file.mime) }

    /// The picker's copies (tmp/<bundle id>-Inbox) move into the session folder.
    private func importFiles(_ urls: [URL], _ reply: AkanNativeReply<FilePickerPickFilesResult>) {
        let session = sessionFolder
        queue.async {
            var staged: [Staged] = []
            do {
                for url in urls {
                    let target = Self.stagedPath(in: session, for: url)
                    do {
                        try FileManager.default.moveItem(at: url, to: target)
                    } catch {
                        try FileManager.default.copyItem(at: url, to: target)
                    }
                    staged.append(Staged(url: target, name: url.lastPathComponent, mime: Self.mime(url)))
                }
            } catch {
                return reply.reject(.internalError, "could not read the picked file: \(error.localizedDescription)")
            }
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    reply.resolve(FilePickerPickFilesResult(files: staged.map { FilePickerPickedFile(file: self.register($0), name: $0.name) }))
                }
            }
        }
    }

    private func importDirectory(_ folder: URL, _ limit: Int, _ reply: AkanNativeReply<FilePickerPickDirectoryResult>) {
        let session = sessionFolder
        queue.async {
            let scoped = folder.startAccessingSecurityScopedResource()
            defer { if scoped { folder.stopAccessingSecurityScopedResource() } }
            var staged: [Staged] = []
            var truncated = false
            var failure: Error?
            var coordination: NSError?
            NSFileCoordinator().coordinate(readingItemAt: folder, options: [], error: &coordination) { dir in
                let base = dir.resolvingSymlinksInPath().path
                guard let items = FileManager.default.enumerator(
                    at: dir, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles, .skipsPackageDescendants])
                else { return }
                for case let file as URL in items {
                    guard (try? file.resourceValues(forKeys: [.isRegularFileKey]))?.isRegularFile == true else { continue }
                    if staged.count == limit {
                        truncated = true
                        break
                    }
                    let full = file.resolvingSymlinksInPath().path
                    let relative = full.hasPrefix(base + "/") ? String(full.dropFirst(base.count + 1)) : file.lastPathComponent
                    let target = Self.stagedPath(in: session, for: file)
                    do {
                        try FileManager.default.copyItem(at: file, to: target)
                    } catch {
                        failure = error
                        break
                    }
                    staged.append(Staged(url: target, name: file.lastPathComponent, mime: Self.mime(file), path: relative))
                }
            }
            if let error = coordination ?? failure {
                for file in staged { try? FileManager.default.removeItem(at: file.url) }
                return reply.reject(.internalError, "could not read the folder: \(error.localizedDescription)")
            }
            let name = folder.lastPathComponent
            let more = truncated
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    let files = staged.map { FilePickerDirectoryFile(file: self.register($0), name: $0.name, path: $0.path) }
                    reply.resolve(FilePickerPickDirectoryResult(name: name, files: files, truncated: more))
                }
            }
        }
    }
}
