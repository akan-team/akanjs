import Contacts
import Foundation

/// The address book through CNContactStore, read-only.
/// - Enumeration blocks until every contact is read, so it runs on a background queue with a store of its own.
/// - iOS 18 limited access reports as "granted": the store then enumerates only the contacts the user shared.
/// Arguments arrive decoded and checked by the generated ContactsPluginSpec (PL-10).
final class ContactsPlugin: ContactsPluginSpec {
    static let id = "contacts"
    private let context: AkanNativePluginContext

    init(context: AkanNativePluginContext) {
        self.context = context
    }

    private static var permission: ContactsPermissionState {
        switch CNContactStore.authorizationStatus(for: .contacts) {
        case .authorized: .granted
        case .denied, .restricted: .denied
        case .notDetermined: .prompt
        case .limited: .granted
        @unknown default: .denied
        }
    }

    /// Asking for contacts without NSContactsUsageDescription gets the app killed by TCC.
    private static var hasUsageDescription: Bool {
        Bundle.main.object(forInfoDictionaryKey: "NSContactsUsageDescription") != nil
    }

    func checkPermission(_ reply: AkanNativeReply<ContactsCheckPermissionResult>) {
        reply.resolve(ContactsCheckPermissionResult(contacts: Self.permission))
    }

    func requestPermission(_ reply: AkanNativeReply<ContactsRequestPermissionResult>) {
        withPermission(reply) { reply.resolve(ContactsRequestPermissionResult(contacts: $0)) }
    }

    func getContacts(_ args: ContactsGetContactsOptions, _ reply: AkanNativeReply<ContactsGetContactsResult>) {
        let withName = args.projection?.name ?? true
        let withPhones = args.projection?.phones ?? true
        withPermission(reply) { state in
            guard state == .granted else { return reply.reject(.permissionDenied, "contacts access was denied") }
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    reply.resolve(ContactsGetContactsResult(contacts: try Self.read(name: withName, phones: withPhones)))
                } catch {
                    reply.reject(.internalError, "could not read contacts: \(error.localizedDescription)")
                }
            }
        }
    }

    /// Resolves with the state after the prompt, or the current one when there is nothing to ask.
    private func withPermission<T>(_ reply: AkanNativeReply<T>, _ then: @escaping @Sendable (ContactsPermissionState) -> Void) {
        guard Self.permission == .prompt else { return then(Self.permission) }
        guard Self.hasUsageDescription else {
            return reply.reject(.internalError, "Info.plist has no NSContactsUsageDescription")
        }
        CNContactStore().requestAccess(for: .contacts) { _, _ in
            DispatchQueue.main.async { then(Self.permission) }
        }
    }

    nonisolated private static func read(name: Bool, phones: Bool) throws -> [ContactsContact] {
        var keys: [CNKeyDescriptor] = []
        if name { keys.append(CNContactFormatter.descriptorForRequiredKeys(for: .fullName)) }
        if phones { keys.append(CNContactPhoneNumbersKey as CNKeyDescriptor) }
        let request = CNContactFetchRequest(keysToFetch: keys)
        request.sortOrder = .userDefault
        var result: [ContactsContact] = []
        try CNContactStore().enumerateContacts(with: request) { contact, _ in
            let display = name ? CNContactFormatter.string(from: contact, style: .fullName) : nil
            let numbers = phones
                ? contact.phoneNumbers.map { labeled in
                    ContactsContactPhone(
                        number: labeled.value.stringValue,
                        label: labeled.label.map { CNLabeledValue<CNPhoneNumber>.localizedString(forLabel: $0) }
                    )
                }
                : []
            result.append(ContactsContact(id: contact.identifier, name: display?.isEmpty == false ? display : nil, phones: numbers))
        }
        return result
    }
}
