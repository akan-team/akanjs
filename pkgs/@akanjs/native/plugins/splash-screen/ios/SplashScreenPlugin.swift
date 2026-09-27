import UIKit

/// Hides the shell's launch screen cover (SH-6). The cover itself belongs to the shell
/// (AkanNativeViewController), which also hides it after the first page load when splash.autoHide is on.
/// Arguments arrive decoded and checked by the generated SplashScreenPluginSpec (PL-10).
final class SplashScreenPlugin: SplashScreenPluginSpec {
    static let id = "splash-screen"
    private let context: AkanNativePluginContext

    init(context: AkanNativePluginContext) {
        self.context = context
    }

    func hide(_ args: SplashScreenHideArgs, _ reply: AkanNativeReply<Void>) {
        let fade = args.fadeOutDuration ?? 200
        guard fade >= 0, fade <= 10_000 else { return reply.reject(.invalidArgs, "fadeOutDuration must be between 0 and 10000 ms") }
        context.hideSplash(fadeOutDuration: fade / 1000)
        reply.resolve()
    }
}
