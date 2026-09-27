package com.akanjs.plugins.sqlite

/**
 * How many statements a SQL text holds, finding their ends the way sqlite3_complete() does
 * (sqlite/src/complete.c): a CREATE [TEMP] TRIGGER statement ends only at "END ;", every other ";"
 * outside quotes, [identifiers] and comments ends a statement. Only whitespace, comments and ";"
 * is 0. The same code as src/common.ts countStatements (desktop), kept free of Android classes.
 *
 * Needed because Android compiles only the first statement of a text and drops the rest without
 * a word (SQLiteDatabase.execSQL: "Multiple statements separated by semicolons are not
 * supported", SQLiteDatabase.java:2147-2148 in the android-36.1 sources).
 */
object SqlStatements {
    private const val SEMI = 0
    private const val WS = 1
    private const val OTHER = 2
    private const val EXPLAIN = 3
    private const val CREATE = 4
    private const val TEMP = 5
    private const val TRIGGER = 6
    private const val END = 7

    private val TRANS = arrayOf(
        intArrayOf(1, 0, 2, 3, 4, 2, 2, 2), // 0 INVALID
        intArrayOf(1, 1, 2, 3, 4, 2, 2, 2), // 1 START
        intArrayOf(1, 2, 2, 2, 2, 2, 2, 2), // 2 NORMAL
        intArrayOf(1, 3, 3, 2, 4, 2, 2, 2), // 3 EXPLAIN
        intArrayOf(1, 4, 2, 2, 2, 4, 5, 2), // 4 CREATE
        intArrayOf(6, 5, 5, 5, 5, 5, 5, 5), // 5 TRIGGER
        intArrayOf(6, 6, 5, 5, 5, 5, 5, 7), // 6 SEMI
        intArrayOf(1, 7, 5, 5, 5, 5, 5, 5), // 7 END
    )

    /** SQLite's IdChar(): letters, digits, "_", "$" and every non-ASCII character. */
    private fun isIdChar(c: Char) = c in '0'..'9' || c in 'A'..'Z' || c in 'a'..'z' || c == '_' || c == '$' || c.code >= 0x80

    private fun keyword(word: String) = when (word.lowercase()) {
        "create" -> CREATE
        "temp", "temporary" -> TEMP
        "trigger" -> TRIGGER
        "end" -> END
        "explain" -> EXPLAIN
        else -> OTHER
    }

    fun count(sql: String): Int {
        var state = 0
        var count = 0
        val n = sql.length
        var i = 0
        while (i < n) {
            val c = sql[i]
            var token = OTHER
            when {
                c == ';' -> token = SEMI
                c == ' ' || c == '\r' || c == '\t' || c == '\n' || c == '\u000c' -> token = WS
                c == '/' && i + 1 < n && sql[i + 1] == '*' -> {
                    val close = sql.indexOf("*/", i + 2)
                    i = if (close < 0) n else close + 1
                    token = WS
                }
                c == '-' && i + 1 < n && sql[i + 1] == '-' -> {
                    val eol = sql.indexOf('\n', i + 2)
                    i = if (eol < 0) n else eol
                    token = WS
                }
                c == '[' || c == '`' || c == '"' || c == '\'' -> {
                    val close = sql.indexOf(if (c == '[') ']' else c, i + 1)
                    i = if (close < 0) n else close
                }
                isIdChar(c) -> {
                    var j = i + 1
                    while (j < n && isIdChar(sql[j])) j++
                    token = keyword(sql.substring(i, j))
                    i = j - 1
                }
            }
            val next = TRANS[state][token]
            if (token == SEMI && next == 1 && state > 1) count++
            state = next
            i++
        }
        return if (state > 1) count + 1 else count
    }

    /** The bare words of [sql] (keywords and unquoted names), lowercase, skipping quotes and comments. */
    private fun words(sql: String): List<String> {
        val out = ArrayList<String>()
        val n = sql.length
        var i = 0
        while (i < n) {
            val c = sql[i]
            when {
                c == '/' && i + 1 < n && sql[i + 1] == '*' -> sql.indexOf("*/", i + 2).let { i = if (it < 0) n else it + 1 }
                c == '-' && i + 1 < n && sql[i + 1] == '-' -> sql.indexOf('\n', i + 2).let { i = if (it < 0) n else it }
                c == '[' || c == '`' || c == '"' || c == '\'' -> sql.indexOf(if (c == '[') ']' else c, i + 1).let { i = if (it < 0) n else it }
                isIdChar(c) -> {
                    var j = i + 1
                    while (j < n && isIdChar(sql[j])) j++
                    out.add(sql.substring(i, j).lowercase())
                    i = j - 1
                }
            }
            i++
        }
        return out
    }

    /**
     * Why [sql] is refused, or null: ATTACH opens any SQLite file the app can reach and VACUUM INTO
     * writes one anywhere, past the filesystem plugin's scopes (src/common.ts refusedStatement).
     */
    fun refused(sql: String): String? {
        val w = words(sql)
        var i = 0
        if (w.getOrNull(i) == "explain") i += if (w.getOrNull(i + 1) == "query" && w.getOrNull(i + 2) == "plan") 3 else 1
        if (w.getOrNull(i) == "attach") return "ATTACH is not allowed: open every database with open()"
        if (w.getOrNull(i) == "vacuum" && w.drop(i + 1).contains("into")) return "VACUUM INTO is not allowed: it writes a file outside the database"
        return null
    }
}
