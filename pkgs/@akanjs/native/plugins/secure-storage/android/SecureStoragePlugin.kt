package com.akanjs.plugins.securestorage

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeVoidReply
import java.security.KeyStore
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * What androidx.security EncryptedSharedPreferences does, with framework APIs only (plugins.md §4.3):
 * - One AES-256-GCM key in AndroidKeyStore (hardware-backed where the device has a TEE). It never
 *   leaves the keystore and needs no user authentication, so background work can read values.
 * - Values are stored as "1:" + Base64(IV ‖ ciphertext ‖ tag) in their own SharedPreferences file.
 *   The keystore picks a fresh random IV per encryption (setRandomizedEncryptionRequired, default),
 *   and the key name is authenticated data, so values swapped between keys fail to decrypt.
 * - Key names are stored in plain text (EncryptedSharedPreferences also encrypts them); they are
 *   identifiers, not secrets.
 * - Keystore keys are not part of backups or device-to-device transfers. The shell sets
 *   allowBackup="false", but Android 12+ still copies app data in a device-to-device transfer, so a
 *   file can arrive without its key: without the key every entry is dropped, and an entry that fails
 *   to decrypt reads as null and is removed (expo-secure-store behaves the same way).
 * - Keystore calls are IPC to keystore2 and first-use key generation takes ~100 ms, so everything
 *   runs on one worker thread, which also keeps set/get ordered. Writes use commit() on that thread
 *   so a resolved set() is on disk.
 * StrongBox (setIsStrongBoxBacked) is not requested: it is much slower and missing on many devices.
 * Arguments arrive decoded and type-checked by the generated SecureStoragePluginSpec (PL-10).
 */
class SecureStoragePlugin(context: AkanNativePluginContext) : SecureStoragePluginSpec {
    private val prefs = context.activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val worker: ExecutorService = Executors.newSingleThreadExecutor { r -> Thread(r, "akan-native-secure-storage") }
    private var key: SecretKey? = null // worker thread only

    override fun get(args: SecureStorageGetArgs, reply: AkanNativeReply<SecureStorageGetResult>) {
        if (!valid(args.key, reply)) return
        val name = args.key
        run(reply) { SecureStorageGetResult(value = read(name)) }
    }

    override fun set(args: SecureStorageSetArgs, reply: AkanNativeVoidReply) {
        if (!valid(args.key, reply)) return
        val name = args.key
        run(reply) {
            if (!prefs.edit().putString(name, encrypt(name, args.value)).commit()) throw IllegalStateException("could not write $PREFS")
        }
    }

    override fun remove(args: SecureStorageRemoveArgs, reply: AkanNativeVoidReply) {
        if (!valid(args.key, reply)) return
        val name = args.key
        run(reply) {
            prefs.edit().remove(name).commit()
        }
    }

    override fun keys(reply: AkanNativeReply<SecureStorageKeysResult>) = run(reply) { SecureStorageKeysResult(keys = readableKeys()) }

    override fun clear(reply: AkanNativeVoidReply) = run(reply) {
        prefs.edit().clear().commit()
    }

    override fun destroy() {
        worker.shutdown()
    }

    private fun valid(key: String, reply: AkanNativeReply<*>): Boolean {
        if (key.isNotEmpty()) return true
        reply.reject(AkanNativeErrorCode.INVALID_ARGS, "key must be a non-empty string")
        return false
    }

    private fun <T> run(reply: AkanNativeReply<T>, block: () -> T) {
        worker.execute {
            try {
                reply.resolve(block())
            } catch (e: Exception) { // GeneralSecurityException, KeyStoreException, ProviderException
                Log.e("AkanNative", "secure-storage ${reply.call.method} failed", e)
                reply.reject(AkanNativeErrorCode.INTERNAL, "secure-storage: $e")
            }
        }
    }

    /** The keystore key; with [create], generated when missing (and whatever was stored without it is dropped). */
    private fun secretKey(create: Boolean): SecretKey? {
        key?.let { return it }
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it.also { key = it } }
        if (!create) return null
        if (prefs.all.isNotEmpty()) {
            Log.w("AkanNative", "secure-storage: the keystore key is gone (restore or device transfer), dropping ${prefs.all.size} entries")
            prefs.edit().clear().commit()
        }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey().also { key = it }
    }

    private fun encrypt(name: String, value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey(create = true))
        cipher.updateAAD(aad(name))
        val iv = cipher.iv
        return FORMAT + Base64.encodeToString(iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
    }

    /**
     * null when the entry can never be read with the current key (another key, another name, or
     * damaged: AEADBadTagException). Anything else the keystore throws may pass (a busy or
     * restarting keystore daemon): it is thrown, the call fails, and the entry stays.
     */
    private fun decrypt(name: String, stored: String, key: SecretKey): String? {
        val bytes = if (stored.startsWith(FORMAT)) runCatching { Base64.decode(stored.substring(FORMAT.length), Base64.NO_WRAP) }.getOrNull() else null
        if (bytes == null || bytes.size < IV_BYTES + TAG_BITS / 8) return null
        return try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES))
            cipher.updateAAD(aad(name))
            String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES), Charsets.UTF_8)
        } catch (e: AEADBadTagException) {
            null
        } catch (e: KeyPermanentlyInvalidatedException) {
            // The key can never decrypt again: drop it with every entry, so the next set() starts over.
            KeyStore.getInstance(KEYSTORE).apply { load(null) }.deleteEntry(ALIAS)
            this.key = null
            prefs.edit().clear().commit()
            throw e
        }
    }

    private fun read(name: String): String? {
        val stored = prefs.getString(name, null) ?: return null
        val key = secretKey(create = false) ?: return null
        return decrypt(name, stored, key) ?: run {
            Log.w("AkanNative", "secure-storage: $name cannot be decrypted, removing it")
            prefs.edit().remove(name).commit()
            null
        }
    }

    /** Only keys get() can return; unreadable entries are removed on the way. */
    private fun readableKeys(): List<String> {
        val all = prefs.all
        if (all.isEmpty()) return emptyList()
        val key = secretKey(create = false) ?: return emptyList()
        val readable = ArrayList<String>()
        val editor = prefs.edit()
        var dropped = false
        for ((name, stored) in all) {
            if (stored is String && decrypt(name, stored, key) != null) readable.add(name) else { editor.remove(name); dropped = true }
        }
        if (dropped) editor.commit()
        return readable.sorted()
    }

    private fun aad(name: String): ByteArray = "akan-native.secure-storage\u0000$name".toByteArray(Charsets.UTF_8)

    private companion object {
        const val PREFS = "akan-native.secure-storage"
        const val KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "akan-native.secure-storage"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val FORMAT = "1:"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }
}
