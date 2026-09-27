package com.akanjs.runtime

import java.math.BigInteger
import java.security.MessageDigest

/**
 * Ed25519 signature verification (RFC 8032 §5.1.7) in plain Kotlin, for Android 10 to 12 where the
 * platform has no Ed25519 provider (it came with API 33). Web bundle updates (UP-2) verify their
 * manifest with it there; API 33+ keeps the platform's (AkanNativeUpdates.signed).
 *
 * A port of the RFC's reference code (§6) with extended homogeneous coordinates and BigInteger.
 * Verification only uses public data, so it need not be constant time. Checks, as the RFC asks:
 * both points decode (y below p, x recoverable, no negative zero), S is below the group order L,
 * and [S]B = R + [k]A with k = SHA-512(R || A || M) mod L (the cofactorless equation, as BoringSSL
 * and CryptoKit use). The shared vectors (vectors/ed25519.json) hold it to the other hosts' answers.
 */
object AkanNativeEd25519 {
    private val P: BigInteger = BigInteger.ONE.shiftLeft(255).subtract(BigInteger.valueOf(19))
    private val L: BigInteger = BigInteger.ONE.shiftLeft(252).add(BigInteger("27742317777372353535851937790883648493"))
    private val TWO = BigInteger.valueOf(2)
    private val D: BigInteger = BigInteger.valueOf(-121665).multiply(BigInteger.valueOf(121666).modInverse(P)).mod(P)
    private val SQRT_M1: BigInteger = TWO.modPow(P.subtract(BigInteger.ONE).shiftRight(2), P)

    /** A point in extended coordinates: x = X/Z, y = Y/Z, x·y = T/Z. */
    private class Point(val x: BigInteger, val y: BigInteger, val z: BigInteger, val t: BigInteger)

    private val NEUTRAL = Point(BigInteger.ZERO, BigInteger.ONE, BigInteger.ONE, BigInteger.ZERO)
    private val BASE: Point = run {
        val y = BigInteger.valueOf(4).multiply(BigInteger.valueOf(5).modInverse(P)).mod(P)
        val x = recoverX(y, 0)!!
        Point(x, y, BigInteger.ONE, x.multiply(y).mod(P))
    }

    /** True when [signature] (64 bytes) is [publicKey]'s (32 bytes) signature of [message]. */
    fun verify(message: ByteArray, signature: ByteArray, publicKey: ByteArray): Boolean {
        if (publicKey.size != 32 || signature.size != 64) return false
        val a = decompress(publicKey) ?: return false
        val rBytes = signature.copyOfRange(0, 32)
        val r = decompress(rBytes) ?: return false
        val s = littleEndian(signature.copyOfRange(32, 64))
        if (s >= L) return false
        val digest = MessageDigest.getInstance("SHA-512").run {
            update(rBytes)
            update(publicKey)
            update(message)
            digest()
        }
        val k = littleEndian(digest).mod(L)
        return equal(multiply(s, BASE), add(r, multiply(k, a)))
    }

    private fun littleEndian(bytes: ByteArray): BigInteger = BigInteger(1, bytes.reversedArray())

    private fun recoverX(y: BigInteger, sign: Int): BigInteger? {
        if (y >= P) return null
        val y2 = y.multiply(y)
        val x2 = y2.subtract(BigInteger.ONE).multiply(D.multiply(y2).add(BigInteger.ONE).modInverse(P)).mod(P)
        if (x2.signum() == 0) return if (sign == 1) null else BigInteger.ZERO
        var x = x2.modPow(P.add(BigInteger.valueOf(3)).shiftRight(3), P)
        if (x.multiply(x).subtract(x2).mod(P).signum() != 0) x = x.multiply(SQRT_M1).mod(P)
        if (x.multiply(x).subtract(x2).mod(P).signum() != 0) return null
        if (x.testBit(0) != (sign == 1)) x = P.subtract(x)
        return x
    }

    private fun decompress(bytes: ByteArray): Point? {
        val sign = (bytes[31].toInt() shr 7) and 1
        val copy = bytes.copyOf()
        copy[31] = (copy[31].toInt() and 0x7f).toByte()
        val y = littleEndian(copy)
        val x = recoverX(y, sign) ?: return null
        return Point(x, y, BigInteger.ONE, x.multiply(y).mod(P))
    }

    private fun add(p: Point, q: Point): Point {
        val a = p.y.subtract(p.x).multiply(q.y.subtract(q.x)).mod(P)
        val b = p.y.add(p.x).multiply(q.y.add(q.x)).mod(P)
        val c = TWO.multiply(p.t).multiply(q.t).multiply(D).mod(P)
        val d = TWO.multiply(p.z).multiply(q.z).mod(P)
        val e = b.subtract(a)
        val f = d.subtract(c)
        val g = d.add(c)
        val h = b.add(a)
        return Point(e.multiply(f).mod(P), g.multiply(h).mod(P), f.multiply(g).mod(P), e.multiply(h).mod(P))
    }

    private fun multiply(scalar: BigInteger, point: Point): Point {
        var result = NEUTRAL
        var addend = point
        for (i in 0 until scalar.bitLength()) {
            if (scalar.testBit(i)) result = add(result, addend)
            addend = add(addend, addend)
        }
        return result
    }

    private fun equal(p: Point, q: Point): Boolean =
        p.x.multiply(q.z).subtract(q.x.multiply(p.z)).mod(P).signum() == 0 &&
            p.y.multiply(q.z).subtract(q.y.multiply(p.z)).mod(P).signum() == 0
}
