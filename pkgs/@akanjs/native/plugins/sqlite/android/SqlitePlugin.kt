package com.akanjs.plugins.sqlite

import android.database.DatabaseUtils
import android.database.sqlite.SQLiteBindOrColumnIndexOutOfRangeException
import android.database.sqlite.SQLiteBlobTooBigException
import android.database.sqlite.SQLiteConstraintException
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteDatatypeMismatchException
import android.database.sqlite.SQLiteException
import android.database.sqlite.SQLiteProgram
import android.database.sqlite.SQLiteRawStatement
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeVoidReply
import org.json.JSONObject
import java.util.Base64
import java.util.concurrent.Executors

/**
 * SQLite with the framework's android.database.sqlite (API 35 SQLiteRawStatement), no AndroidX.
 * Paths below are in the android-36.1 SDK sources, android/database/sqlite/.
 * - Files: Context.getDatabasePath(name), the app's databases folder.
 * - One worker thread for every call and database: Android keeps a transaction on the thread
 *   that began it (SQLiteDatabase thread sessions, SQLiteSession.java:902-925), so BEGIN and
 *   COMMIT sent in separate calls must run on the same thread. It also keeps calls in order.
 * - journal_mode DELETE, set explicitly: any WAL (also Android's default "compatibility WAL",
 *   SQLiteDatabaseConfiguration.java:309-317) makes a pool of several connections
 *   (SQLiteConnectionPool.java:1077-1088), and connection state (last_insert_rowid, TEMP tables,
 *   pragmas) would then depend on which connection a statement lands on. An explicit journal mode
 *   turns compatibility WAL off (SQLiteDatabaseConfiguration.java:226-229), so there is one.
 * - Statements run as SQLiteRawStatement: exact types, parameter and column counts, no
 *   CursorWindow size limit or re-run of the query for later windows. Raw statements need a
 *   transaction (SQLiteRawStatement.java:169), so a statement outside the app's own BEGIN runs in
 *   one of its own (BEGIN IMMEDIATE … COMMIT, what autocommit does anyway).
 * - BEGIN / COMMIT / ROLLBACK go to execSQL, which runs them as Android's transaction of this
 *   thread (SQLiteSession.executeSpecial). Statements SQLite refuses inside a transaction
 *   (VACUUM, ATTACH, DETACH, and pragmas such as foreign_keys or journal_mode) run through
 *   SQLiteStatement.execute() when no transaction is open, which also accepts a pragma's result row
 *   (SQLiteConnection.java:745-754); execute via execSQL would throw on it.
 * - changes and lastInsertId come from `SELECT total_changes()` / `last_insert_rowid()` on the same
 *   connection: SQLiteDatabase.getLastInsertRowId() goes through a native int
 *   (SQLiteConnection.java:182), which would cut rowids above 2^31.
 * - One statement per call: Android compiles the first and drops the rest (SqlStatements.kt).
 * - Connections belong to the page that opened them (architecture review, document scope): when it
 *   ends (AkanNativeDocumentScope.own), an open transaction is rolled back and its connections close, on
 *   the worker after the calls before. The journal stays DELETE (see above): Android's windows
 *   (activities) of one process do not overlap, so no two connections write at once, which is what
 *   WAL is for on desktop and iOS.
 * Arguments arrive decoded by the generated SqlitePluginSpec (PL-10).
 */
class SqlitePlugin(private val context: AkanNativePluginContext) : SqlitePluginSpec {
    private val worker = Executors.newSingleThreadExecutor { Thread(it, "akan-native-sqlite") }

    /** Page (document id) + name → connection. Worker thread only. */
    private val open = HashMap<String, SQLiteDatabase>()

    /** Pages whose end already closes their connections. Main thread only. */
    private val owned = HashSet<String>()

    private fun key(page: String, name: String) = "$page\u0000$name"

    /** The calling page ("" without a document id); its end closes what it opened. Main thread. */
    private fun page(reply: AkanNativeReply<*>): String {
        val document = reply.call.document ?: return ""
        val page = document.id
        if (owned.add(page)) {
            document.own {
                owned.remove(page)
                worker.execute {
                    val prefix = "$page\u0000"
                    for (k in open.keys.filter { it.startsWith(prefix) }) open.remove(k)?.let(::shut)
                }
            }
        }
        return page
    }

    /** An open BEGIN of this thread would keep its connection: roll it back first. */
    private fun shut(db: SQLiteDatabase) {
        while (db.inTransaction()) db.endTransaction()
        db.close()
    }

    private class Failure(val code: String, message: String) : Exception(message)

    private class Outcome(val columns: List<String>, val rows: List<Map<String, Any>>, val changes: Long, val lastInsertId: Long)

    override fun open(args: SqliteOpenArgs, reply: AkanNativeReply<SqliteOpenResult>) {
        val page = page(reply)
        perform(reply) { openOn(page, args) }
    }

    private fun openOn(page: String, args: SqliteOpenArgs): SqliteOpenResult {
        val name = args.name
        if (!validName(name)) throw Failure(AkanNativeErrorCode.INVALID_ARGS, NAME_RULE)
        if (key(page, name) !in open) {
            val file = context.activity.getDatabasePath(name)
            file.parentFile?.mkdirs()
            val params = SQLiteDatabase.OpenParams.Builder()
                .addOpenFlags(SQLiteDatabase.CREATE_IF_NECESSARY)
                .setJournalMode("DELETE")
                .build()
            val db = try {
                SQLiteDatabase.openDatabase(file, params)
            } catch (e: SQLiteException) {
                throw Failure(AkanNativeErrorCode.INTERNAL, "cannot open $name: ${e.message}")
            }
            db.setForeignKeyConstraintsEnabled(true)
            open[key(page, name)] = db
        }
        return SqliteOpenResult(db = name)
    }

    override fun execute(args: SqliteStatementArgs, reply: AkanNativeReply<SqliteExecuteResult>) {
        val page = page(reply)
        perform(reply) {
            val outcome = run(page, args, collect = false)
            SqliteExecuteResult(changes = outcome.changes.toDouble(), lastInsertId = outcome.lastInsertId.toDouble())
        }
    }

    override fun query(args: SqliteStatementArgs, reply: AkanNativeReply<SqliteQueryResult>) {
        val page = page(reply)
        perform(reply) {
            val outcome = run(page, args, collect = true)
            SqliteQueryResult(columns = outcome.columns, rows = outcome.rows)
        }
    }

    override fun close(args: SqliteCloseArgs, reply: AkanNativeVoidReply) {
        val page = page(reply)
        perform(reply) { open.remove(key(page, args.db))?.let(::shut) }
    }

    override fun destroy() {
        worker.execute {
            for (db in open.values) shut(db)
            open.clear()
        }
        worker.shutdown()
    }

    private fun <T> perform(reply: AkanNativeReply<T>, work: () -> T) {
        worker.execute {
            try {
                reply.resolve(work())
            } catch (e: Failure) {
                reply.reject(e.code, e.message ?: "failed")
            } catch (e: SQLiteException) {
                reply.reject(codeOf(e), e.message ?: e.toString())
            } catch (e: IllegalStateException) {
                // e.g. COMMIT without BEGIN: "Cannot perform this operation because there is no current transaction."
                reply.reject(AkanNativeErrorCode.INVALID_ARGS, e.message ?: e.toString())
            } catch (e: IllegalArgumentException) {
                reply.reject(AkanNativeErrorCode.INVALID_ARGS, e.message ?: e.toString())
            } catch (e: Exception) {
                reply.reject(AkanNativeErrorCode.INTERNAL, e.toString())
            }
        }
    }

    private fun run(page: String, args: SqliteStatementArgs, collect: Boolean): Outcome {
        val db = open[key(page, args.db)] ?: throw Failure(AkanNativeErrorCode.NOT_FOUND, "database ${args.db} is not open in this page (call open first; a page load opens its own)")
        val values = values(args.params ?: emptyList())
        val sql = args.sql
        when (SqlStatements.count(sql)) {
            0 -> throw Failure(AkanNativeErrorCode.INVALID_ARGS, "sql holds no statement")
            1 -> Unit
            else -> throw Failure(AkanNativeErrorCode.INVALID_ARGS, "sql must be one statement; run them one call at a time")
        }
        SqlStatements.refused(sql)?.let { throw Failure(AkanNativeErrorCode.NOT_ALLOWED, it) }
        val type = DatabaseUtils.getSqlStatementType(sql)
        if (type == DatabaseUtils.STATEMENT_BEGIN || type == DatabaseUtils.STATEMENT_COMMIT || type == DatabaseUtils.STATEMENT_ABORT) {
            if (values.isNotEmpty()) throw Failure(AkanNativeErrorCode.INVALID_ARGS, "sql expects 0 values, got ${values.size}")
            db.execSQL(sql)
            return Outcome(emptyList(), emptyList(), 0, transaction(db) { scalar(db, "SELECT last_insert_rowid()") })
        }
        val refusedInTransaction = type == DatabaseUtils.STATEMENT_ATTACH || type == DatabaseUtils.STATEMENT_UNPREPARED ||
            sql.trimStart().startsWith("VACUUM", ignoreCase = true) || (type == DatabaseUtils.STATEMENT_PRAGMA && !collect)
        if (refusedInTransaction && !db.inTransaction()) {
            db.compileStatement(sql).use { statement ->
                bind(statement, values)
                statement.execute()
            }
            return Outcome(emptyList(), emptyList(), 0, transaction(db) { scalar(db, "SELECT last_insert_rowid()") })
        }
        return transaction(db) {
            db.createRawStatement(sql).use { statement ->
                val expected = statement.parameterCount
                if (expected != values.size) throw Failure(AkanNativeErrorCode.INVALID_ARGS, "sql expects $expected values, got ${values.size}")
                values.forEachIndexed { i, value -> bind(statement, i + 1, value) }
                val before = scalar(db, "SELECT total_changes()")
                val rows = ArrayList<Map<String, Any>>()
                // Column names after the first step: a statement from Android's cache that SQLite
                // recompiles for a changed schema reports its new columns only then.
                var columns: List<String>? = null
                while (statement.step()) {
                    val names = columns ?: List(statement.resultColumnCount) { statement.getColumnName(it) }.also { columns = it }
                    if (collect) rows.add(row(statement, names))
                }
                val names = columns ?: List(statement.resultColumnCount) { statement.getColumnName(it) }
                val changes = scalar(db, "SELECT total_changes()") - before
                Outcome(names, rows, changes, scalar(db, "SELECT last_insert_rowid()"))
            }
        }
    }

    /** Runs `block` in the app's open transaction, or in one of its own. */
    private inline fun <T> transaction(db: SQLiteDatabase, block: () -> T): T {
        if (db.inTransaction()) return block()
        db.beginTransactionNonExclusive()
        try {
            val result = block()
            db.setTransactionSuccessful()
            return result
        } finally {
            db.endTransaction()
        }
    }

    private fun scalar(db: SQLiteDatabase, sql: String): Long = db.createRawStatement(sql).use { it.step(); it.getColumnLong(0) }

    /** params → null, Long (safe integers and booleans), Double, String or ByteArray ({ base64 }). */
    private fun values(params: List<Any>): List<Any?> = params.mapIndexed { i, value ->
        when (value) {
            JSONObject.NULL -> null
            is String -> value
            is Boolean -> if (value) 1L else 0L
            is Number -> {
                val d = value.toDouble()
                when {
                    !d.isFinite() -> invalidParam(i)
                    // bun:sqlite's rule on desktop, made explicit: safe integers are INTEGER, the rest REAL
                    d == Math.floor(d) && Math.abs(d) <= MAX_SAFE -> d.toLong()
                    else -> d
                }
            }
            is JSONObject -> {
                val text = value.opt("base64")
                if (value.length() != 1 || text !is String || !BASE64.matches(text) || text.length % 4 == 1 || (text.contains('=') && text.length % 4 != 0)) invalidParam(i)
                // java.util.Base64 is strict (no whitespace) and takes missing padding (src/common.ts rule)
                Base64.getDecoder().decode(text)
            }
            else -> invalidParam(i)
        }
    }

    private fun invalidParam(i: Int): Nothing = throw Failure(AkanNativeErrorCode.INVALID_ARGS, "params[$i] must be a string, number, boolean, null or { base64 }")

    private fun bind(statement: SQLiteRawStatement, index: Int, value: Any?) {
        when (value) {
            null -> statement.bindNull(index)
            is Long -> statement.bindLong(index, value)
            is Double -> statement.bindDouble(index, value)
            is String -> statement.bindText(index, value)
            is ByteArray -> statement.bindBlob(index, value) // the two-argument form has no length > 0 check
        }
    }

    /**
     * SQLiteProgram (SQLiteStatement) hides its parameter count; bind() beyond it throws
     * IllegalArgumentException (SQLiteProgram.java bind), so the count is found by probing.
     */
    private fun bind(statement: SQLiteProgram, values: List<Any?>) {
        var expected = 0
        while (true) {
            try {
                statement.bindNull(expected + 1)
                expected++
            } catch (e: IllegalArgumentException) {
                break
            }
        }
        if (expected != values.size) throw Failure(AkanNativeErrorCode.INVALID_ARGS, "sql expects $expected values, got ${values.size}")
        statement.clearBindings()
        values.forEachIndexed { i, value ->
            when (value) {
                null -> statement.bindNull(i + 1)
                is Long -> statement.bindLong(i + 1, value)
                is Double -> statement.bindDouble(i + 1, value)
                is String -> statement.bindString(i + 1, value)
                is ByteArray -> statement.bindBlob(i + 1, value)
            }
        }
    }

    /** A row as the bridge carries it; a later column with the same name replaces an earlier one. */
    private fun row(statement: SQLiteRawStatement, names: List<String>): Map<String, Any> {
        val row = LinkedHashMap<String, Any>(names.size)
        names.forEachIndexed { i, name ->
            row[name] = when (statement.getColumnType(i)) {
                SQLiteRawStatement.SQLITE_DATA_TYPE_INTEGER -> statement.getColumnLong(i)
                // JSON has no Infinity (and JSONObject refuses it)
                SQLiteRawStatement.SQLITE_DATA_TYPE_FLOAT -> statement.getColumnDouble(i).let { if (it.isFinite()) it else JSONObject.NULL }
                SQLiteRawStatement.SQLITE_DATA_TYPE_TEXT -> statement.getColumnText(i)
                SQLiteRawStatement.SQLITE_DATA_TYPE_BLOB ->
                    JSONObject().put("base64", Base64.getEncoder().encodeToString(statement.getColumnBlob(i) ?: ByteArray(0)))
                else -> JSONObject.NULL
            }
        }
        return row
    }

    /**
     * SQL errors the caller can fix are INVALID_ARGS (src/common.ts sqliteCode): the plain
     * SQLiteException is SQLITE_ERROR (syntax, no such table); the rest are I/O, locking, full disk.
     */
    private fun codeOf(e: SQLiteException): String = when (e) {
        is SQLiteConstraintException, is SQLiteDatatypeMismatchException, is SQLiteBindOrColumnIndexOutOfRangeException, is SQLiteBlobTooBigException ->
            AkanNativeErrorCode.INVALID_ARGS
        else -> if (e.javaClass == SQLiteException::class.java) AkanNativeErrorCode.INVALID_ARGS else AkanNativeErrorCode.INTERNAL
    }

    private companion object {
        const val MAX_SAFE = 9007199254740991.0
        val BASE64 = Regex("^[A-Za-z0-9+/]*={0,2}$")
        val NAME = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
        const val NAME_RULE =
            "name must be a file name: letters, digits, \".\", \"_\" and \"-\", up to 128 characters, starting with a letter or digit, not ending in -journal, -wal or -shm"

        fun validName(name: String): Boolean {
            val lower = name.lowercase()
            return NAME.matches(name) && !lower.endsWith("-journal") && !lower.endsWith("-wal") && !lower.endsWith("-shm")
        }
    }
}
