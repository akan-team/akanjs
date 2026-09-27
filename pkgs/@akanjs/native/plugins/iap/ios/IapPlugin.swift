import StoreKit
import UIKit

/// In-app purchase with StoreKit 2 (akanjs readiness O6-3).
/// - Transaction.updates is read once per process (IapStore, App scope), from the first plugin's
///   creation, which is the app's launch: StoreKit delivers unfinished transactions there right away,
///   and Ask to Buy approvals, renewals, refunds and purchases on other devices later. They reach the
///   page as "transaction" events, kept until the first listener (C2 AkanNativeRetained); a window made
///   again listens to the same stream. A transaction that purchase() answered is not sent again.
/// - The page verifies `verification.jws` on its server (App Store Server API) and then finish()es.
///   StoreKit's own check is only reported (`verified`); an unverified transaction still reaches the
///   page, which must not grant it.
/// - `appReceipt` is the old receipt file (deprecated in iOS 18, still written), for servers that still
///   call verifyReceipt (akanjs-change-requests R5-7).
/// - Products and transactions seen this session are kept, so purchase() and finish() need no second
///   lookup; finish() falls back to Transaction.unfinished.
/// The process's StoreKit state (App scope): the update stream, the transactions seen (for finish),
/// and the ids purchase() answered.
@MainActor
final class IapStore {
    static let shared = IapStore()
    let retained = AkanNativeRetained<IapTransaction>()
    var seen: [UInt64: Transaction] = [:]
    var answered: Set<UInt64> = []
    private var started = false

    func start() {
        guard !started else { return }
        started = true
        Task {
            for await result in Transaction.updates {
                let id = result.unsafePayloadValue.id
                // A purchase that purchase() answered may come here too (it should not); send it once.
                if self.answered.remove(id) != nil { continue }
                self.retained.emit(IapPlugin.transaction(result), retain: true)
            }
        }
    }
}

final class IapPlugin: IapPluginSpec {
    static let id = "iap"
    private let context: AkanNativePluginContext
    private lazy var events = IapEvents(context)
    private var products: [String: Product] = [:]
    private var store: IapStore { IapStore.shared }

    init(context: AkanNativePluginContext) {
        self.context = context
        IapStore.shared.start()
    }

    // MARK: products

    func canMakePayments(_ reply: AkanNativeReply<IapCanMakePaymentsResult>) {
        reply.resolve(IapCanMakePaymentsResult(value: AppStore.canMakePayments))
    }

    func getProducts(_ args: IapGetProductsArgs, _ reply: AkanNativeReply<IapGetProductsResult>) {
        Task {
            do {
                let found = try await Product.products(for: args.ids)
                var out: [IapProduct] = []
                for product in found {
                    products[product.id] = product
                    out.append(await Self.product(product))
                }
                let ids = Set(found.map(\.id))
                reply.resolve(IapGetProductsResult(products: out, invalidIds: args.ids.filter { !ids.contains($0) }))
            } catch {
                reply.reject(Self.code(error), "App Store products: \(error.localizedDescription)")
            }
        }
    }

    private func product(_ id: String) async throws -> Product? {
        if let product = products[id] { return product }
        let product = try await Product.products(for: [id]).first
        if let product { products[id] = product }
        return product
    }

    // MARK: purchase

    func purchase(_ args: IapPurchaseArgs, _ reply: AkanNativeReply<IapPurchaseResult>) {
        var options: Set<Product.PurchaseOption> = []
        if let account = args.accountId {
            guard let uuid = UUID(uuidString: account) else {
                return reply.reject(.invalidArgs, "accountId must be a UUID on iOS (StoreKit's appAccountToken)")
            }
            options.insert(.appAccountToken(uuid))
        }
        if let quantity = args.quantity {
            guard quantity >= 1, quantity == quantity.rounded(), quantity <= 10 else {
                return reply.reject(.invalidArgs, "quantity must be a whole number from 1 to 10")
            }
            options.insert(.quantity(Int(quantity)))
        }
        if let offer = args.promotionalOffer {
            options.formUnion(Product.PurchaseOption.promotionalOffer(offer.offerId, compactJWS: offer.jws))
        }
        Task {
            do {
                guard let product = try await product(args.productId) else {
                    return reply.reject(.notFound, "no App Store product \(args.productId)")
                }
                let result: Product.PurchaseResult
                if #available(iOS 17.0, *), let scene = context.windowScene {
                    result = try await product.purchase(confirmIn: scene, options: options)
                } else {
                    result = try await product.purchase(options: options)
                }
                switch result {
                case .success(let verification):
                    store.answered.insert(verification.unsafePayloadValue.id)
                    reply.resolve(IapPurchaseResult(status: .purchased, transaction: Self.transaction(verification)))
                case .pending:
                    reply.resolve(IapPurchaseResult(status: .pending))
                case .userCancelled:
                    reply.reject(.cancelled, "the purchase was cancelled")
                @unknown default:
                    reply.reject(.internalError, "unknown purchase result")
                }
            } catch {
                reply.reject(Self.code(error), "purchase failed: \(error.localizedDescription)")
            }
        }
    }

    func finish(_ args: IapFinishArgs, _ reply: AkanNativeReply<Void>) {
        guard let id = UInt64(args.transactionId) else {
            return reply.reject(.invalidArgs, "transactionId is not an App Store transaction id")
        }
        Task {
            var found = store.seen[id]
            if found == nil {
                for await result in Transaction.unfinished where result.unsafePayloadValue.id == id {
                    found = result.unsafePayloadValue
                    break
                }
            }
            guard let found else { return reply.reject(.notFound, "no unfinished transaction \(id)") }
            await found.finish()
            store.seen[id] = nil
            reply.resolve()
        }
    }

    // MARK: owned

    func getUnfinished(_ reply: AkanNativeReply<IapTransactionsResult>) {
        Task { reply.resolve(IapTransactionsResult(transactions: await collect(Transaction.unfinished))) }
    }

    func getEntitlements(_ reply: AkanNativeReply<IapTransactionsResult>) {
        Task { reply.resolve(IapTransactionsResult(transactions: await collect(Transaction.currentEntitlements))) }
    }

    func restore(_ reply: AkanNativeReply<IapTransactionsResult>) {
        Task {
            do {
                try await AppStore.sync()
            } catch {
                return reply.reject(Self.code(error), "App Store sync: \(error.localizedDescription)")
            }
            reply.resolve(IapTransactionsResult(transactions: await collect(Transaction.currentEntitlements)))
        }
    }

    private func collect(_ transactions: Transaction.Transactions) async -> [IapTransaction] {
        var out: [IapTransaction] = []
        for await result in transactions { out.append(Self.transaction(result)) }
        return out
    }

    func manageSubscriptions(_ args: IapManageSubscriptionsArgs, _ reply: AkanNativeReply<Void>) {
        guard let scene = context.windowScene else { return reply.reject(.unsupported, "no window scene to show the sheet in") }
        Task {
            do {
                if #available(iOS 17.0, *), let id = args.productId, let group = try await product(id)?.subscription?.subscriptionGroupID {
                    try await AppStore.showManageSubscriptions(in: scene, subscriptionGroupID: group)
                } else {
                    try await AppStore.showManageSubscriptions(in: scene)
                }
                reply.resolve()
            } catch {
                reply.reject(Self.code(error), "manage subscriptions: \(error.localizedDescription)")
            }
        }
    }

    // MARK: events

    /// Each window's plugin listens under its own key; the bridge stops it when the page ends.
    private var listenKey: String { "iap-\(ObjectIdentifier(self).hashValue)" }

    func startListening(_ event: String) {
        guard event == "transaction" else { return }
        store.retained.listen(listenKey) { [weak self] transaction in
            guard let self else { return false }
            self.events.transaction(transaction)
            return true
        }
    }

    func stopListening(_ event: String) {
        store.retained.unlisten(listenKey)
    }

    // MARK: JSON

    static func transaction(_ result: VerificationResult<Transaction>) -> IapTransaction {
        let t = result.unsafePayloadValue
        IapStore.shared.seen[t.id] = t
        var verified = false
        if case .verified = result { verified = true }
        return IapTransaction(
            id: String(t.id),
            productId: t.productID,
            state: t.revocationDate == nil ? .purchased : .revoked,
            purchaseDate: Self.ms(t.purchaseDate),
            quantity: Double(t.purchasedQuantity),
            originalId: String(t.originalID),
            expirationDate: t.expirationDate.map(Self.ms),
            revocationDate: t.revocationDate.map(Self.ms),
            accountId: t.appAccountToken?.uuidString.lowercased(),
            environment: t.environment.rawValue,
            verified: verified,
            verification: IapVerification(
                jws: result.jwsRepresentation,
                transactionId: String(t.id),
                originalTransactionId: String(t.originalID),
                appReceipt: Self.appReceipt()
            )
        )
    }

    private static func ms(_ date: Date) -> Double { (date.timeIntervalSince1970 * 1000).rounded() }

    private static func appReceipt() -> String? {
        guard let url = Bundle.main.appStoreReceiptURL, let data = try? Data(contentsOf: url) else { return nil }
        return data.base64EncodedString()
    }

    private static func product(_ p: Product) async -> IapProduct {
        let currency = p.priceFormatStyle.currencyCode
        let price = NSDecimalNumber(decimal: p.price).doubleValue
        let type: IapProductType = switch p.type {
        case .consumable: .consumable
        case .autoRenewable: .subscription
        case .nonRenewable: .nonRenewingSubscription
        default: .nonConsumable
        }
        var offers: [IapOffer] = []
        var eligible: Bool?
        if let sub = p.subscription {
            offers.append(IapOffer(kind: .base, phases: [IapPricingPhase(displayPrice: p.displayPrice, price: price, currency: currency, period: period(sub.subscriptionPeriod), cycles: 0, mode: .recurring)]))
            if let intro = sub.introductoryOffer { offers.append(offer(intro, .introductory, currency)) }
            for promo in sub.promotionalOffers { offers.append(offer(promo, .promotional, currency)) }
            if #available(iOS 18.0, *) {
                for winBack in sub.winBackOffers { offers.append(offer(winBack, .winBack, currency)) }
            }
            eligible = await sub.isEligibleForIntroOffer
        } else {
            offers.append(IapOffer(kind: .oneTime, phases: [IapPricingPhase(displayPrice: p.displayPrice, price: price, currency: currency, cycles: 1, mode: .payUpFront)]))
        }
        return IapProduct(
            id: p.id, type: type, title: p.displayName, description: p.description,
            displayPrice: p.displayPrice, price: price, currency: currency,
            subscriptionPeriod: p.subscription.map { period($0.subscriptionPeriod) },
            subscriptionGroupId: p.subscription?.subscriptionGroupID,
            introOfferEligible: eligible,
            offers: offers
        )
    }

    private static func offer(_ o: Product.SubscriptionOffer, _ kind: IapOfferKind, _ currency: String) -> IapOffer {
        let mode: IapPaymentMode = switch o.paymentMode {
        case .freeTrial: .freeTrial
        case .payUpFront: .payUpFront
        default: .payAsYouGo
        }
        let phase = IapPricingPhase(displayPrice: o.displayPrice, price: NSDecimalNumber(decimal: o.price).doubleValue, currency: currency, period: period(o.period), cycles: Double(o.periodCount), mode: mode)
        return IapOffer(kind: kind, id: o.id, phases: [phase])
    }

    private static func period(_ p: Product.SubscriptionPeriod) -> IapPeriod {
        let unit: IapPeriodUnit = switch p.unit {
        case .day: .day
        case .week: .week
        case .month: .month
        default: .year
        }
        return IapPeriod(unit: unit, value: Double(p.value))
    }

    private static func code(_ error: any Error) -> AkanNativeErrorCode {
        switch error {
        case StoreKitError.userCancelled: .cancelled
        case StoreKitError.notAvailableInStorefront, Product.PurchaseError.productUnavailable: .notFound
        case Product.PurchaseError.purchaseNotAllowed: .permissionDenied
        case is Product.PurchaseError: .invalidArgs
        default: .internalError
        }
    }
}
