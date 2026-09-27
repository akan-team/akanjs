package com.akanjs.plugins.iap

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingClient.ProductType
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ConsumeParams
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeRetained
import com.akanjs.runtime.AkanNativeVoidReply

/**
 * In-app purchase with the Play Billing Library (akanjs readiness O6-3), the opt-in module: its
 * closure (native/android/maven.lock.json) goes only into apps with this plugin.
 * - One BillingClient per plugin, connected by the first call and again by any call that finds it
 *   disconnected. Not enableAutoServiceReconnection: on a device without Play billing it reports the
 *   setup as OK and then spends three seconds on retries in every call before SERVICE_DISCONNECTED
 *   (seen on the emulator); connecting ourselves answers BILLING_UNAVAILABLE (UNSUPPORTED) at once. Pending
 *   purchases are enabled for one-time products (cash payments and the like): purchase() answers
 *   "pending" and the purchase arrives later through onPurchasesUpdated, or getUnfinished() at the next
 *   start.
 * - onPurchasesUpdated answers the waiting purchase() call; anything else it reports (a pending
 *   purchase that completed, a purchase made outside the flow) is a "transaction" event, kept until
 *   the first listener (C2 AkanNativeRetained).
 * - A transaction's id is the purchase token (the order id is missing while pending). finish()
 *   consumes (consume: true) or acknowledges; Google refunds a purchase not acknowledged in three days.
 * - Google Play has no restore: restore() and getEntitlements() query what the account owns.
 */
class IapPlugin(private val context: AkanNativePluginContext) : IapPluginSpec, PurchasesUpdatedListener {
    private val app = context.activity.applicationContext
    private val events = IapEvents(context)
    private val retained = AkanNativeRetained<IapTransaction>()
    private val main = Handler(Looper.getMainLooper())
    private val details = HashMap<String, ProductDetails>()
    private val onConnected = ArrayList<(BillingResult) -> Unit>()
    private var connecting = false
    private var waiting: Waiting? = null

    private class Waiting(val productId: String, val reply: AkanNativeReply<IapPurchaseResult>)

    private val client: BillingClient = BillingClient.newBuilder(app)
        .setListener(this)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .build()

    /** Billing calls back on the main thread; this makes sure of it. */
    private fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block)
    }

    private fun connected(reply: AkanNativeReply<*>, block: () -> Unit) = connection { result ->
        if (result.responseCode == BillingResponseCode.OK) block() else reject(reply, result)
    }

    private fun connection(block: (BillingResult) -> Unit) {
        if (client.isReady) return block(BillingResult.newBuilder().setResponseCode(BillingResponseCode.OK).build())
        onConnected.add(block)
        if (connecting) return
        connecting = true
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) = onMain {
                connecting = false
                val waiting = onConnected.toList()
                onConnected.clear()
                for (callback in waiting) callback(result)
            }

            override fun onBillingServiceDisconnected() = onMain { connecting = false }
        })
    }

    override fun destroy() {
        client.endConnection()
    }

    // ------------------------------------------------------------ products

    override fun canMakePayments(reply: AkanNativeReply<IapCanMakePaymentsResult>) = connection { result ->
        reply.resolve(IapCanMakePaymentsResult(value = result.responseCode == BillingResponseCode.OK))
    }

    override fun getProducts(args: IapGetProductsArgs, reply: AkanNativeReply<IapGetProductsResult>) {
        if (args.ids.isEmpty()) return reply.resolve(IapGetProductsResult(products = emptyList(), invalidIds = emptyList()))
        val types = when (args.type) {
            IapGetProductsArgsType.INAPP -> listOf(ProductType.INAPP)
            IapGetProductsArgsType.SUBS -> listOf(ProductType.SUBS)
            null -> listOf(ProductType.INAPP, ProductType.SUBS)
        }
        connected(reply) {
            query(args.ids, types, reply) { found ->
                val ids = found.map { it.productId }.toSet()
                reply.resolve(IapGetProductsResult(products = found.map(::product), invalidIds = args.ids.filter { it !in ids }))
            }
        }
    }

    /** Queries each product type in turn (a query takes one type). */
    private fun query(ids: List<String>, types: List<String>, reply: AkanNativeReply<*>, done: (List<ProductDetails>) -> Unit) {
        val found = ArrayList<ProductDetails>()
        fun next(index: Int) {
            if (index == types.size) return done(found)
            val products = ids.filter { id -> found.none { it.productId == id } }.map {
                QueryProductDetailsParams.Product.newBuilder().setProductId(it).setProductType(types[index]).build()
            }
            if (products.isEmpty()) return done(found)
            client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(products).build()) { result, response ->
                onMain {
                    if (result.responseCode != BillingResponseCode.OK) return@onMain reject(reply, result)
                    for (d in response.productDetailsList) {
                        details[d.productId] = d
                        found.add(d)
                    }
                    next(index + 1)
                }
            }
        }
        next(0)
    }

    // ------------------------------------------------------------ purchase

    override fun purchase(args: IapPurchaseArgs, reply: AkanNativeReply<IapPurchaseResult>) {
        if (waiting != null) return reply.reject(AkanNativeErrorCode.INVALID_ARGS, "another purchase is in progress")
        val account = args.accountId
        if (account != null && account.length > 64) return reply.reject(AkanNativeErrorCode.INVALID_ARGS, "accountId: at most 64 characters on Google Play")
        connected(reply) {
            val cached = details[args.productId]
            if (cached != null) launch(cached, args, reply)
            else query(listOf(args.productId), listOf(ProductType.INAPP, ProductType.SUBS), reply) { found ->
                val d = found.firstOrNull() ?: return@query reply.reject(AkanNativeErrorCode.NOT_FOUND, "no Google Play product ${args.productId}")
                launch(d, args, reply)
            }
        }
    }

    private fun launch(d: ProductDetails, args: IapPurchaseArgs, reply: AkanNativeReply<IapPurchaseResult>) {
        val token = args.offerToken ?: if (d.productType == ProductType.SUBS) {
            val offers = d.subscriptionOfferDetails.orEmpty()
            (offers.firstOrNull { it.offerId == null } ?: offers.firstOrNull())?.offerToken
        } else {
            d.oneTimePurchaseOfferDetails?.offerToken
        }
        val product = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(d)
        if (token != null) product.setOfferToken(token)
        val flow = BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(product.build()))
        args.accountId?.let { flow.setObfuscatedAccountId(it) }
        waiting = Waiting(d.productId, reply)
        val result = client.launchBillingFlow(context.activity, flow.build())
        if (result.responseCode != BillingResponseCode.OK) {
            waiting = null
            reject(reply, result)
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>?) = onMain {
        val list = purchases.orEmpty()
        val flow = waiting
        if (flow != null) {
            val mine = list.firstOrNull { flow.productId in it.products }
            if (result.responseCode != BillingResponseCode.OK || mine != null) {
                waiting = null
                when {
                    result.responseCode != BillingResponseCode.OK -> reject(flow.reply, result)
                    mine!!.purchaseState == Purchase.PurchaseState.PURCHASED -> flow.reply.resolve(IapPurchaseResult(status = IapPurchaseStatus.PURCHASED, transaction = transaction(mine)))
                    else -> flow.reply.resolve(IapPurchaseResult(status = IapPurchaseStatus.PENDING))
                }
                for (other in list) if (other !== mine) retained.emit(transaction(other), true)
                return@onMain
            }
        }
        if (result.responseCode == BillingResponseCode.OK) for (p in list) retained.emit(transaction(p), true)
    }

    override fun finish(args: IapFinishArgs, reply: AkanNativeVoidReply) = connected(reply) {
        val token = args.transactionId
        if (args.consume == true) {
            client.consumeAsync(ConsumeParams.newBuilder().setPurchaseToken(token).build()) { result, _ ->
                onMain { if (result.responseCode == BillingResponseCode.OK) reply.resolve() else reject(reply, result) }
            }
        } else {
            client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build()) { result ->
                onMain { if (result.responseCode == BillingResponseCode.OK) reply.resolve() else reject(reply, result) }
            }
        }
    }

    // ------------------------------------------------------------ owned

    override fun getUnfinished(reply: AkanNativeReply<IapTransactionsResult>) =
        owned(reply) { it.purchaseState == Purchase.PurchaseState.PURCHASED && !it.isAcknowledged }

    override fun getEntitlements(reply: AkanNativeReply<IapTransactionsResult>) =
        owned(reply) { it.purchaseState == Purchase.PurchaseState.PURCHASED }

    override fun restore(reply: AkanNativeReply<IapTransactionsResult>) = getEntitlements(reply)

    private fun owned(reply: AkanNativeReply<IapTransactionsResult>, keep: (Purchase) -> Boolean) = connected(reply) {
        val out = ArrayList<IapTransaction>()
        val types = listOf(ProductType.INAPP, ProductType.SUBS)
        fun next(index: Int) {
            if (index == types.size) return reply.resolve(IapTransactionsResult(transactions = out))
            client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(types[index]).build()) { result, purchases ->
                onMain {
                    if (result.responseCode != BillingResponseCode.OK) return@onMain reject(reply, result)
                    for (p in purchases) if (keep(p)) out.add(transaction(p))
                    next(index + 1)
                }
            }
        }
        next(0)
    }

    override fun manageSubscriptions(args: IapManageSubscriptionsArgs, reply: AkanNativeVoidReply) {
        val url = StringBuilder("https://play.google.com/store/account/subscriptions")
        args.productId?.let { url.append("?sku=").append(Uri.encode(it)).append("&package=").append(Uri.encode(app.packageName)) }
        try {
            context.activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url.toString())))
            reply.resolve()
        } catch (_: ActivityNotFoundException) {
            reply.reject(AkanNativeErrorCode.UNSUPPORTED, "nothing can open the Google Play subscriptions page")
        }
    }

    // ------------------------------------------------------------ events

    override fun startListening(event: String) {
        if (event != "transaction") return
        retained.listen(this) { transaction ->
            events.transaction(transaction)
            true
        }
    }

    override fun stopListening(event: String) {
        if (event == "transaction") retained.unlisten(this)
    }

    // ------------------------------------------------------------ JSON

    private fun transaction(p: Purchase) = IapTransaction(
        id = p.purchaseToken,
        productId = p.products.firstOrNull() ?: "",
        state = if (p.purchaseState == Purchase.PurchaseState.PURCHASED) IapTransactionState.PURCHASED else IapTransactionState.PENDING,
        purchaseDate = p.purchaseTime.toDouble(),
        quantity = p.quantity.toDouble(),
        autoRenewing = p.isAutoRenewing,
        acknowledged = p.isAcknowledged,
        accountId = p.accountIdentifiers?.obfuscatedAccountId,
        verification = IapVerification(
            purchaseToken = p.purchaseToken,
            orderId = p.orderId,
            packageName = p.packageName,
            originalJson = p.originalJson,
            signature = p.signature,
        ),
    )

    private fun product(d: ProductDetails): IapProduct {
        val offers = ArrayList<IapOffer>()
        var regular: IapPricingPhase? = null
        if (d.productType == ProductType.SUBS) {
            for (o in d.subscriptionOfferDetails.orEmpty()) {
                val phases = o.pricingPhases.pricingPhaseList.map(::phase)
                if (o.offerId == null && regular == null) regular = phases.lastOrNull()
                offers.add(IapOffer(kind = if (o.offerId == null) IapOfferKind.BASE else IapOfferKind.PROMOTIONAL, token = o.offerToken, id = o.offerId, basePlanId = o.basePlanId, tags = o.offerTags, phases = phases))
            }
        } else {
            val base = d.oneTimePurchaseOfferDetails
            val all = d.oneTimePurchaseOfferDetailsList ?: listOfNotNull(base)
            for (o in all) {
                val phase = IapPricingPhase(displayPrice = o.formattedPrice, price = o.priceAmountMicros / 1_000_000.0, currency = o.priceCurrencyCode, cycles = 1.0, mode = IapPaymentMode.PAY_UP_FRONT)
                if (regular == null && (o.offerId == null || o === base)) regular = phase
                offers.add(IapOffer(kind = if (o.offerId == null) IapOfferKind.ONE_TIME else IapOfferKind.PROMOTIONAL, token = o.offerToken, id = o.offerId, tags = o.offerTags, phases = listOf(phase)))
            }
        }
        val price = regular ?: offers.firstOrNull()?.phases?.lastOrNull()
        return IapProduct(
            id = d.productId,
            type = if (d.productType == ProductType.SUBS) IapProductType.SUBSCRIPTION else IapProductType.ONE_TIME,
            // name is the product's own title; title adds the app's name in parentheses.
            title = d.name,
            description = d.description,
            displayPrice = price?.displayPrice ?: "",
            price = price?.price ?: 0.0,
            currency = price?.currency ?: "",
            subscriptionPeriod = if (d.productType == ProductType.SUBS) price?.period else null,
            offers = offers,
        )
    }

    private fun phase(p: ProductDetails.PricingPhase): IapPricingPhase {
        val mode = when {
            p.priceAmountMicros == 0L -> IapPaymentMode.FREE_TRIAL
            p.recurrenceMode == ProductDetails.RecurrenceMode.INFINITE_RECURRING -> IapPaymentMode.RECURRING
            p.recurrenceMode == ProductDetails.RecurrenceMode.FINITE_RECURRING -> IapPaymentMode.PAY_AS_YOU_GO
            else -> IapPaymentMode.PAY_UP_FRONT
        }
        return IapPricingPhase(
            displayPrice = p.formattedPrice,
            price = p.priceAmountMicros / 1_000_000.0,
            currency = p.priceCurrencyCode,
            period = period(p.billingPeriod),
            cycles = if (mode == IapPaymentMode.RECURRING) 0.0 else p.billingCycleCount.toDouble(),
            mode = mode,
        )
    }

    private fun reject(reply: AkanNativeReply<*>, result: BillingResult) {
        val (code, name) = when (result.responseCode) {
            BillingResponseCode.USER_CANCELED -> AkanNativeErrorCode.CANCELLED to "USER_CANCELED"
            BillingResponseCode.ITEM_UNAVAILABLE -> AkanNativeErrorCode.NOT_FOUND to "ITEM_UNAVAILABLE"
            BillingResponseCode.BILLING_UNAVAILABLE -> AkanNativeErrorCode.UNSUPPORTED to "BILLING_UNAVAILABLE"
            BillingResponseCode.FEATURE_NOT_SUPPORTED -> AkanNativeErrorCode.UNSUPPORTED to "FEATURE_NOT_SUPPORTED"
            BillingResponseCode.ITEM_ALREADY_OWNED -> AkanNativeErrorCode.INVALID_ARGS to "ITEM_ALREADY_OWNED"
            BillingResponseCode.ITEM_NOT_OWNED -> AkanNativeErrorCode.INVALID_ARGS to "ITEM_NOT_OWNED"
            BillingResponseCode.DEVELOPER_ERROR -> AkanNativeErrorCode.INVALID_ARGS to "DEVELOPER_ERROR"
            BillingResponseCode.NETWORK_ERROR -> AkanNativeErrorCode.INTERNAL to "NETWORK_ERROR"
            BillingResponseCode.SERVICE_UNAVAILABLE -> AkanNativeErrorCode.INTERNAL to "SERVICE_UNAVAILABLE"
            BillingResponseCode.SERVICE_DISCONNECTED -> AkanNativeErrorCode.INTERNAL to "SERVICE_DISCONNECTED"
            // SERVICE_TIMEOUT (-3) is deprecated; it and ERROR (6) end here.
            else -> AkanNativeErrorCode.INTERNAL to "ERROR"
        }
        val detail = result.debugMessage.takeIf { it.isNotEmpty() }?.let { ": $it" } ?: ""
        reply.reject(code, "Google Play billing $name (${result.responseCode})$detail")
    }

    companion object {
        private val PERIOD = Regex("^P(\\d+)([DWMY])$")

        /** An ISO 8601 billing period as Play writes it: P1W, P1M, P3M, P1Y, P3D. */
        fun period(iso: String): IapPeriod? {
            val match = PERIOD.find(iso) ?: return null
            val unit = when (match.groupValues[2]) {
                "D" -> IapPeriodUnit.DAY
                "W" -> IapPeriodUnit.WEEK
                "M" -> IapPeriodUnit.MONTH
                else -> IapPeriodUnit.YEAR
            }
            return IapPeriod(unit = unit, value = match.groupValues[1].toDouble())
        }
    }
}
