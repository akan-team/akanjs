package com.akanjs.plugins.contacts

import android.Manifest
import android.provider.ContactsContract.CommonDataKinds.Phone
import android.provider.ContactsContract.Contacts
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply

/**
 * The address book through ContactsContract, read-only. Two queries (contacts, then every phone row) joined in
 * memory rather than one query per contact; they run on a worker thread because a large book takes seconds.
 * Arguments arrive decoded and checked by the generated ContactsPluginSpec (PL-10).
 */
class ContactsPlugin(private val context: AkanNativePluginContext) : ContactsPluginSpec {
    override fun checkPermission(reply: AkanNativeReply<ContactsCheckPermissionResult>) =
        reply.resolve(ContactsCheckPermissionResult(contacts = permission()))

    override fun requestPermission(reply: AkanNativeReply<ContactsRequestPermissionResult>) =
        withPermission { reply.resolve(ContactsRequestPermissionResult(contacts = it)) }

    override fun getContacts(args: ContactsGetContactsOptions, reply: AkanNativeReply<ContactsGetContactsResult>) {
        val withName = args.projection?.name ?: true
        val withPhones = args.projection?.phones ?: true
        withPermission { state ->
            if (state != ContactsPermissionState.GRANTED) {
                reply.reject(AkanNativeErrorCode.PERMISSION_DENIED, "contacts access was denied")
                return@withPermission
            }
            Thread {
                try {
                    reply.resolve(ContactsGetContactsResult(contacts = read(withName, withPhones)))
                } catch (e: Exception) {
                    reply.reject(AkanNativeErrorCode.INTERNAL, "could not read contacts: ${e.message}")
                }
            }.start()
        }
    }

    /** context.permissionState answers with one of the four AkanNativePermission strings. */
    private fun permission(): ContactsPermissionState {
        val state = context.permissionState(Manifest.permission.READ_CONTACTS)
        return ContactsPermissionState.entries.first { it.json == state }
    }

    /** "denied" is a refusal the system will not show a dialog for again, so only the two prompt states ask. */
    private fun withPermission(then: (ContactsPermissionState) -> Unit) {
        val current = permission()
        if (current != ContactsPermissionState.PROMPT && current != ContactsPermissionState.PROMPT_WITH_RATIONALE) {
            then(current)
            return
        }
        context.requestPermissions(arrayOf(Manifest.permission.READ_CONTACTS)) { then(permission()) }
    }

    private fun read(withName: Boolean, withPhones: Boolean): List<ContactsContact> {
        val resolver = context.activity.contentResolver
        val names = linkedMapOf<String, String?>()
        resolver.query(
            Contacts.CONTENT_URI,
            arrayOf(Contacts._ID, Contacts.DISPLAY_NAME_PRIMARY),
            null,
            null,
            Contacts.SORT_KEY_PRIMARY,
        )?.use { cursor ->
            while (cursor.moveToNext()) {
                names[cursor.getLong(0).toString()] = if (withName) cursor.getString(1)?.takeIf { it.isNotEmpty() } else null
            }
        }
        val phones = mutableMapOf<String, MutableList<ContactsContactPhone>>()
        if (withPhones) {
            resolver.query(Phone.CONTENT_URI, arrayOf(Phone.CONTACT_ID, Phone.NUMBER, Phone.TYPE, Phone.LABEL), null, null, null)
                ?.use { cursor ->
                    val resources = context.activity.resources
                    while (cursor.moveToNext()) {
                        val number = cursor.getString(1)?.takeIf { it.isNotEmpty() } ?: continue
                        val label = if (cursor.isNull(2)) cursor.getString(3) else Phone.getTypeLabel(resources, cursor.getInt(2), cursor.getString(3)).toString()
                        phones.getOrPut(cursor.getLong(0).toString()) { mutableListOf() }.add(ContactsContactPhone(number = number, label = label))
                    }
                }
        }
        return names.map { (id, name) -> ContactsContact(id = id, name = name, phones = phones[id] ?: emptyList()) }
    }
}
