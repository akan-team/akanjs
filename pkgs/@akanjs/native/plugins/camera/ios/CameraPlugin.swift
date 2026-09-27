import AVFoundation
import Photos
import PhotosUI
import UIKit

/// One photo → JPEG in the session folder → /__akan_native/file/<id> (PL-7).
/// - source "camera": UIImagePickerController(.camera). The iOS 26 simulator reports a camera and
///   shows a fake UI, but has no capture device and never returns a picture (verified), so it
///   counts as "no camera" there, like capacitor-plugins/camera.
/// - source "library": PHPickerViewController without a photo library, which needs no permission.
/// - default: the camera if there is one, otherwise the library.
/// Arguments arrive decoded and checked by the generated CameraPluginSpec (PL-10).
final class CameraPlugin: NSObject, CameraPluginSpec, UIImagePickerControllerDelegate, UINavigationControllerDelegate,
    PHPickerViewControllerDelegate, UIAdaptivePresentationControllerDelegate
{
    static let id = "camera"
    private let context: AkanNativePluginContext
    /// How photos are handed over (index.ts): JPEG quality 0-1 and the largest size in pixels.
    struct Output {
        var quality: CGFloat
        var maxWidth: CGFloat?
        var maxHeight: CGFloat?

        init?(quality: Double?, maxWidth: Double?, maxHeight: Double?) {
            if let maxWidth, maxWidth < 1 { return nil }
            if let maxHeight, maxHeight < 1 { return nil }
            self.quality = CGFloat(min(100, max(1, quality ?? 90))) / 100
            self.maxWidth = maxWidth.map { CGFloat($0) }
            self.maxHeight = maxHeight.map { CGFloat($0) }
        }
    }

    private var pending: (reply: AkanNativeReply<CameraPhoto>, output: Output)?
    /// pickImages in progress (PHPicker with a selection limit).
    private var pendingMany: (reply: AkanNativeReply<CameraPickImagesResult>, limit: Int, output: Output)?

    init(context: AkanNativePluginContext) {
        self.context = context
    }

    private static var hasUsableCamera: Bool {
        #if targetEnvironment(simulator)
            false
        #else
            UIImagePickerController.isSourceTypeAvailable(.camera)
        #endif
    }

    private static var permission: CameraPermissionState {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: .granted
        case .denied, .restricted: .denied
        default: .prompt
        }
    }

    /// Asking for the camera without NSCameraUsageDescription gets the app killed by TCC (verified).
    private static var hasUsageDescription: Bool {
        Bundle.main.object(forInfoDictionaryKey: "NSCameraUsageDescription") != nil
    }

    func checkPermission(_ reply: AkanNativeReply<CameraCheckPermissionResult>) {
        reply.resolve(CameraCheckPermissionResult(camera: Self.permission))
    }

    func requestPermission(_ reply: AkanNativeReply<CameraRequestPermissionResult>) {
        guard Self.hasUsageDescription else { return reply.reject(.internalError, "Info.plist has no NSCameraUsageDescription") }
        AVCaptureDevice.requestAccess(for: .video) { _ in
            DispatchQueue.main.async { reply.resolve(CameraRequestPermissionResult(camera: Self.permission)) }
        }
    }

    func takePhoto(_ args: CameraTakePhotoOptions, _ reply: AkanNativeReply<CameraPhoto>) {
        guard pending == nil, pendingMany == nil else { return reply.reject(.cancelled, "another photo request is in progress") }
        guard let quality = Output(quality: args.quality, maxWidth: args.maxWidth, maxHeight: args.maxHeight) else {
            return reply.reject(.invalidArgs, "maxWidth and maxHeight must be at least 1")
        }
        let front = args.direction == .front
        switch args.source {
        case .camera?:
            guard Self.hasUsableCamera else { return reply.reject(.unsupported, "no camera is available on this device") }
            withPermission(reply) { [weak self] in self?.presentCamera(reply, quality, front: front) }
        case .library?:
            presentLibrary(reply, quality)
        case nil:
            if Self.hasUsableCamera {
                withPermission(reply) { [weak self] in self?.presentCamera(reply, quality, front: front) }
            } else {
                presentLibrary(reply, quality)
            }
        }
    }

    func pickImages(_ args: CameraPickImagesOptions, _ reply: AkanNativeReply<CameraPickImagesResult>) {
        guard pending == nil, pendingMany == nil else { return reply.reject(.cancelled, "another photo request is in progress") }
        guard let output = Output(quality: args.quality, maxWidth: args.maxWidth, maxHeight: args.maxHeight) else {
            return reply.reject(.invalidArgs, "maxWidth and maxHeight must be at least 1")
        }
        // Clamped before the Int conversion, which traps on huge values; truncates like NSNumber.intValue.
        let limit = Int(min(20, max(1, args.limit ?? 10)))
        var config = PHPickerConfiguration() // no photo library → no permission needed
        config.filter = .images
        config.selectionLimit = limit
        config.preferredAssetRepresentationMode = .current
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        picker.presentationController?.delegate = self
        pendingMany = (reply, limit, output)
        context.present(picker) { [weak self] in
            self?.pendingMany = nil
            reply.reject(.internalError, "nothing to present the photo picker from")
        }
    }

    /// Adds a photo of this session to the library with add-only access
    /// (NSPhotoLibraryAddUsageDescription; capacitor-plugins/camera checks the key first as well).
    func saveToGallery(_ args: CameraSaveToGalleryArgs, _ reply: AkanNativeReply<Void>) {
        guard let file = context.file(args.url) else {
            return reply.reject(.invalidArgs, "url must be a file URL of this app (/__akan_native/file/<id>)")
        }
        guard Bundle.main.object(forInfoDictionaryKey: "NSPhotoLibraryAddUsageDescription") != nil else {
            return reply.reject(.internalError, "Info.plist has no NSPhotoLibraryAddUsageDescription")
        }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                return reply.reject(.permissionDenied, "adding to the photo library was not allowed")
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetCreationRequest.creationRequestForAssetFromImage(atFileURL: file.url)
            }) { ok, error in
                if ok { reply.resolve() } else { reply.reject(.internalError, "saving failed: \(error?.localizedDescription ?? "unknown")") }
            }
        }
    }

    private func withPermission(_ reply: AkanNativeReply<CameraPhoto>, _ go: @escaping @MainActor () -> Void) {
        guard Self.hasUsageDescription else { return reply.reject(.internalError, "Info.plist has no NSCameraUsageDescription") }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            go()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    MainActor.assumeIsolated { granted ? go() : reply.reject(.permissionDenied, "camera access was denied") }
                }
            }
        default:
            reply.reject(.permissionDenied, "camera access was denied")
        }
    }

    private func presentCamera(_ reply: AkanNativeReply<CameraPhoto>, _ quality: Output, front: Bool) {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        if front, UIImagePickerController.isCameraDeviceAvailable(.front) {
            picker.cameraDevice = .front
        }
        picker.delegate = self
        picker.presentationController?.delegate = self
        pending = (reply, quality)
        context.present(picker) { [weak self] in
            self?.pending = nil
            reply.reject(.internalError, "nothing to present the camera from")
        }
    }

    private func presentLibrary(_ reply: AkanNativeReply<CameraPhoto>, _ quality: Output) {
        var config = PHPickerConfiguration() // no photo library → no permission, no asset identifiers
        config.filter = .images
        config.selectionLimit = 1
        config.preferredAssetRepresentationMode = .current
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        picker.presentationController?.delegate = self // swipe down → CANCELLED
        pending = (reply, quality)
        context.present(picker) { [weak self] in
            self?.pending = nil
            reply.reject(.internalError, "nothing to present the photo picker from")
        }
    }

    // MARK: UIImagePickerControllerDelegate

    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        picker.dismiss(animated: true)
        guard let pending else { return }
        self.pending = nil
        guard let image = info[.originalImage] as? UIImage else { return pending.reply.reject(.internalError, "no image") }
        process(image, pending.output, pending.reply)
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true)
        finishCancelled()
    }

    // MARK: PHPickerViewControllerDelegate

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        if let many = pendingMany {
            pendingMany = nil
            return finishMany(many.reply, results, many.output)
        }
        guard let pending else { return }
        self.pending = nil
        guard let provider = results.first?.itemProvider else { return pending.reply.reject(.cancelled, "no photo was picked") }
        guard provider.canLoadObject(ofClass: UIImage.self) else { return pending.reply.reject(.internalError, "the picked item is not an image") }
        provider.loadObject(ofClass: UIImage.self) { [weak self] object, error in // background queue
            guard let image = object as? UIImage else {
                return pending.reply.reject(.internalError, "loading the photo failed: \(String(describing: error))")
            }
            let box = UncheckedBox(image)
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.process(box.value, pending.output, pending.reply) } }
        }
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        finishCancelled()
    }

    /// Loads every picked image, normalizes it like takePhoto and answers with all of them.
    private func finishMany(_ reply: AkanNativeReply<CameraPickImagesResult>, _ results: [PHPickerResult], _ output: Output) {
        let providers = results.map(\.itemProvider).filter { $0.canLoadObject(ofClass: UIImage.self) }
        if providers.isEmpty { return reply.reject(.cancelled, "no photo was picked") }
        let group = DispatchGroup()
        let photos = UncheckedBox(NSMutableDictionary()) // filled on the main thread only
        for (index, provider) in providers.enumerated() {
            group.enter()
            provider.loadObject(ofClass: UIImage.self) { [weak self] object, _ in
                guard let self, let image = object as? UIImage else { return group.leave() }
                let box = UncheckedBox(image)
                DispatchQueue.main.async {
                    MainActor.assumeIsolated {
                        self.encode(box.value, output) { photo in
                            if let photo { photos.value[index] = photo }
                            group.leave()
                        }
                    }
                }
            }
        }
        group.notify(queue: .main) {
            let ordered = (photos.value.allKeys as? [Int] ?? []).sorted().compactMap { photos.value[$0] as? CameraPhoto }
            ordered.isEmpty ? reply.reject(.internalError, "loading the photos failed") : reply.resolve(CameraPickImagesResult(photos: ordered))
        }
    }

    private func finishCancelled() {
        if let many = pendingMany {
            pendingMany = nil
            return many.reply.reject(.cancelled, "no photo was picked")
        }
        guard let pending else { return }
        self.pending = nil
        pending.reply.reject(.cancelled, "photo capture was cancelled")
    }

    /// Orientation fix (drawing applies imageOrientation) + JPEG, off the main thread.
    private func process(_ image: UIImage, _ output: Output, _ reply: AkanNativeReply<CameraPhoto>) {
        encode(image, output) { photo in
            if let photo { reply.resolve(photo) } else { reply.reject(.internalError, "encoding or writing the photo failed") }
        }
    }

    /// Writes an upright JPEG within the size limits into the session folder and returns its FileRef (+ width/height), or nil.
    private func encode(_ image: UIImage, _ output: Output, _ done: @escaping @MainActor (CameraPhoto?) -> Void) {
        let file = context.temporaryFile("jpg")
        let box = UncheckedBox(image)
        DispatchQueue.global(qos: .userInitiated).async {
            let image = box.value
            let full = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
            let fit = min(1, (output.maxWidth ?? full.width) / full.width, (output.maxHeight ?? full.height) / full.height)
            let size = CGSize(width: max(1, (full.width * fit).rounded()), height: max(1, (full.height * fit).rounded()))
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            format.opaque = true // transparent areas come out white, as JPEG has no alpha
            let upright = image.imageOrientation == .up && fit >= 1
                ? image
                : UIGraphicsImageRenderer(size: size, format: format).image { context in
                    UIColor.white.setFill()
                    context.fill(CGRect(origin: .zero, size: size))
                    image.draw(in: CGRect(origin: .zero, size: size))
                }
            let ok = (try? upright.jpegData(compressionQuality: output.quality)?.write(to: file, options: .atomic)) != nil
            let (width, height) = (Int(size.width), Int(size.height))
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard ok else { return done(nil) }
                    done(CameraPhoto(file: self.context.fileRef(file, mime: "image/jpeg"), width: Double(width), height: Double(height)))
                }
            }
        }
    }
}
