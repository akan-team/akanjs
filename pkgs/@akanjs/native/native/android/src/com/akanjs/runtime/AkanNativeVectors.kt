package com.akanjs.runtime

/**
 * Runs the shared vectors (packages/core/vectors) against this host's kernel (AkanNativeKernel,
 * AkanNativeGlob): on the JVM through scripts/native-vectors.ts, on the device through the dev-only
 * \$host.vectors of the self-test. AkanNativeVectorData is generated per build, empty in release builds.
 */
object AkanNativeVectors {
    class Result(val passed: Int, val failures: List<String>)

    fun run(): Result {
        var passed = 0
        val failures = ArrayList<String>()
        val ran = HashMap<String, Int>()
        var current = ""
        fun check(ok: Boolean, what: () -> String) {
            ran[current] = (ran[current] ?: 0) + 1
            if (ok) passed++ else failures.add(what())
        }
        fun load(name: String): Map<*, *> {
            current = name
            return AkanNativeVectorData.file(name) ?: emptyMap<String, Any?>()
        }
        fun rows(o: Map<*, *>?, key: String): List<List<Any?>> = (o?.get(key) as? List<*>)?.map { it as List<Any?> } ?: emptyList()

        val scope = load("scope")
        for (c in rows(scope, "glob")) check(AkanNativeGlob.match(c[0] as String, c[1] as String, c[2] != "plain", c[2] == "path-deny") == c[3]) { "glob $c" }
        for (c in rows(scope, "permits")) {
            val s = c[0] as Map<*, *>
            fun entries(v: Any?) = (v as? List<*>)?.map { e -> (e as Map<*, *>).entries.associate { (k, x) -> k as String to x as String } }
            val scope = AkanNativeScope(entries(s["allow"]), entries(s["deny"]) ?: emptyList())
            val value = (c[1] as Map<*, *>).entries.associate { (k, x) -> k as String to x as String }
            val ok = scope.permits(value, (c[2] as List<*>).map { it as String }.toSet(), (c[3] as List<*>).map { it as String }.toSet(), c[4] as Boolean)
            check(ok == c[5]) { "permits $c" }
        }
        for (c in rows(scope, "url")) check(AkanNativeGlob.url(c[0] as String, c[1] as String, c[2] == "deny") == c[3]) { "url $c" }

        val routes = load("routes")
        val files = (routes["files"] as? List<*>)?.toSet() ?: emptySet<Any?>()
        for (c in rows(routes, "cases")) {
            val all = c[1] == "all"
            val got = when (val r = AkanNativeKernel.route(c[0] as String) { all || it in files }) {
                AkanNativeRoute.Init -> "init" to null
                AkanNativeRoute.Ipc -> "ipc" to null
                AkanNativeRoute.Hello -> "hello" to null
                is AkanNativeRoute.File -> "file" to r.id
                is AkanNativeRoute.Asset -> "asset" to r.path
                AkanNativeRoute.NotFound -> "not-found" to null
            }
            check(got.first == c[2] && got.second == c[3]) { "route $c: $got" }
        }
        for (c in rows(routes, "hostPaths")) check(AkanNativeKernel.isHostPath(c[0] as String) == c[1]) { "host path $c" }

        for (c in rows(load("ranges"), "cases")) {
            val expected = (c[2] as List<*>).map { (it as Number).toLong() }
            val got = when (val r = AkanNativeKernel.parseRange(c[0] as String?, (c[1] as Number).toLong())) {
                AkanNativeRangeAnswer.Whole -> listOf(200L)
                is AkanNativeRangeAnswer.Part -> listOf(206L, r.first, r.last)
                AkanNativeRangeAnswer.Unsatisfiable -> listOf(416L)
            }
            check(got == expected) { "range $c: $got" }
        }

        val ids = load("ids")
        val specs = mapOf("fileRef" to AkanNativeContract.ID_FILE_REF, "bundle" to AkanNativeContract.ID_BUNDLE, "document" to AkanNativeContract.ID_DOCUMENT, "name" to AkanNativeContract.ID_NAME)
        for (c in rows(ids, "cases")) check(AkanNativeKernel.idValid(specs.getValue(c[0] as String), c[1] as String) == c[2]) { "id $c" }
        for (c in rows(ids["mime"] as? Map<*, *>, "cases")) {
            val path = c[0] as String
            check(AkanNativeKernel.assetMime(path) == c[1] && AkanNativeKernel.fileMime(path) == c[2]) { "mime $c: ${AkanNativeKernel.assetMime(path)}" }
        }

        val bridge = load("bridge")
        for (c in rows(bridge, "requests")) {
            val got = AkanNativeKernel.validateRequest(c[0])
            check(got == c[1]) { "request $c: $got" }
        }
        for (c in rows(bridge, "declarations")) check(AkanNativeKernel.declares(c[0], c[1] as String, c[2] as String?) == c[3]) { "declaration $c" }
        for (c in rows(bridge, "documents")) {
            val got = AkanNativeKernel.admitDocument(c[0] as String?, (c[1] as List<*>).map { it as String }, c[2] as String?)
            check(got.wire == c[3]) { "document $c: ${got.wire}" }
        }

        for ((i, item) in ((load("acl")["cases"] as? List<*>) ?: emptyList<Any?>()).withIndex()) {
            val case = item as Map<*, *>
            val (acl, problem) = AkanNativeAcl.from(case)
            check((problem != null) == case["problem"]) { "acl case $i: problem $problem" }
            for (c in rows(case, "checks")) {
                val (allowed, scope) = acl?.check(c[0] as String, c[1] as String, (c[2] as Number).toInt()) ?: (true to null)
                val expected = c[4] as Map<*, *>?
                val scopeOk = if (scope == null) expected == null else scope.allow == expected?.get("allow") && scope.deny == expected?.get("deny")
                check(allowed == c[3] && scopeOk) { "acl case $i $c: $allowed ${scope?.allow} ${scope?.deny}" }
            }
        }

        val navigation = load("navigation")
        for (c in rows(navigation, "cases")) {
            val got = AkanNativeKernel.decideNavigation(c[0] as String, c[1] as Boolean, "app://localhost", (c[2] as List<*>).map { it as String })
            check(got.wire == c[3]) { "navigation $c: ${got.wire}" }
        }
        for (c in rows(navigation, "fileRefSandbox")) check(AkanNativeKernel.fileRefSandboxed(c[0] as String) == c[1]) { "sandbox $c" }
        for (item in (load("retained")["cases"] as? List<*>) ?: emptyList<Any?>()) {
            val case = item as Map<*, *>
            val events = AkanNativeRetained<String>()
            val log = ArrayList<String>()
            for (op in (case["ops"] as List<*>).map { it as List<*> }) {
                val name = op[1] as String
                when (op[0]) {
                    "listen" -> {
                        val accepts = op[2] as Boolean
                        events.listen(name) { value -> if (accepts) log.add("$name:$value"); accepts }
                    }
                    "unlisten" -> events.unlisten(name)
                    else -> events.emit(name, op[2] as Boolean)
                }
            }
            check(log == case["log"]) { "retained ${case["name"]}: $log" }
        }
        // Ed25519 as web bundle updates verify it below API 33 (AkanNativeEd25519, pure Kotlin).
        fun bytes(hex: String) = ByteArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
        for (c in rows(load("ed25519"), "cases")) {
            check(AkanNativeEd25519.verify(bytes(c[1] as String), bytes(c[2] as String), bytes(c[0] as String)) == c[3]) { "ed25519 ${c[4]}" }
        }

        // Updates protocol v2 (AkanNativeUpdates, AkanNativeKernel.updateDecision).
        val updates = load("updates")
        for (c in rows(updates, "keyIds")) {
            val key = java.util.Base64.getDecoder().decode(c[0] as String)
            check(AkanNativeKernel.updateKeyId(key) == c[1]) { "update keyId ${c[0]}" }
        }
        for (c in rows(updates, "decisions")) {
            fun strings(v: Any?) = (v as List<*>).map { it as String }
            val running = (c[7] as List<*>?)?.let { (it[0] as Number).toDouble() to it[1] as String }
            val got = AkanNativeKernel.updateDecision(
                ring = strings(c[0]), revoked = strings(c[1]), signer = c[2] as String, revokeKeys = strings(c[3]), resetSequence = c[4] as Boolean,
                sequence = (c[5] as Number).toDouble(), embedded = (c[6] as Number).toDouble(), running = running,
            )
            check(got.wire == c[8]) { "update decision ${c[9]}: ${got.wire}" }
        }
        for (c in rows(updates, "urls")) {
            val got = AkanNativeKernel.updateManifestUrl(c[0] as String, c[1] as String, c[2] as String, c[3] as String)
            check(got == c[4]) { "update url $got" }
        }
        val envelopeKeys = (updates["envelopeKeys"] as? List<*>).orEmpty().map { java.util.Base64.getDecoder().decode(it as String) }
        val ring = envelopeKeys.map(AkanNativeKernel::updateKeyId)
        for (c in rows(updates, "envelopes")) {
            val manifest = (c[0] as? List<*>)?.let { (it[0] as String).repeat((it[1] as Number).toInt()) + it[2] as String } ?: c[0] as String
            val got = AkanNativeKernel.checkUpdateEnvelope(
                manifest = manifest, keyId = c[1] as String, signature = c[2] as String, ring = ring, revoked = (c[3] as List<*>).map { it as String },
            ) { bytes, signature, keyId -> ring.indexOf(keyId).let { it >= 0 && AkanNativeEd25519.verify(bytes, signature, envelopeKeys[it]) } }
            check(got.verdict.wire == c[4]) { "update envelope ${c[5]}: ${got.verdict.wire}" }
        }
        val limits = updates["limits"] as? Map<*, *>
        val expectedLimits = listOf("revokeKeys", "manifestBytes", "reportEvents", "reportBatch").map { (limits?.get(it) as? Number)?.toInt() }
        val ownLimits = listOf(AkanNativeKernel.MAX_REVOKE_KEYS, AkanNativeKernel.MAX_UPDATE_MANIFEST, AkanNativeKernel.UPDATE_REPORT_LIMIT, AkanNativeKernel.UPDATE_REPORT_BATCH)
        check(ownLimits == expectedLimits) { "update limits: $ownLimits" }

        // What a phone posts to updates.report.url (AkanNativeUpdateReports).
        val reports = updates["reports"] as? Map<*, *>
        check(AkanNativeUpdateEvent.entries.map { it.wire } == reports?.get("events")) { "report events" }
        check(AkanNativeUpdateReason.entries.map { it.wire } == reports?.get("reasons")) { "report reasons" }
        for (c in rows(reports, "outcomes")) {
            val got = AkanNativeKernel.updateReportOutcome((c[0] as Number).toInt())
            check(got.wire == c[1]) { "report outcome ${c[0]}: ${got.wire}" }
        }
        for (c in rows(reports, "retryAfter")) {
            val got = AkanNativeKernel.updateReportRetryAt(c[0] as String?, (c[1] as Number).toDouble())
            check(got == (c[2] as Number?)?.toDouble()) { "report Retry-After ${c[3]}: $got" }
        }
        for (c in rows(reports, "waits")) {
            check(AkanNativeKernel.updateReportWaits((c[0] as Number?)?.toDouble(), (c[1] as Number).toDouble()) == c[2]) { "report waits $c" }
        }
        for (c in rows(reports, "keys")) {
            val event = AkanNativeUpdateEvent.of(c[0])
            check(event != null && AkanNativeKernel.updateReportKey(event, c[1] as String, AkanNativeUpdateReason.of(c[2])) == c[3]) { "report key $c" }
        }
        for (c in rows(reports, "times")) {
            val got = AkanNativeKernel.updateReportTime((c[0] as Number).toLong())
            check(got == c[1]) { "report time ${c[0]}: $got" }
        }

        // A missing or truncated file must not pass as fewer checks.
        for ((name, count) in AkanNativeVectorData.counts) if ((ran[name] ?: 0) != count) failures.add("$name: ${ran[name] ?: 0} of $count checks ran")
        if (AkanNativeVectorData.counts.isEmpty()) failures.add("no vectors in this build")
        return Result(passed, failures)
    }

    /** The checks all files hold. */
    val expected: Int get() = AkanNativeVectorData.counts.values.sum()
}
