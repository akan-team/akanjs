package com.akanjs.plugins.dialog

import android.app.AlertDialog
import android.content.Context
import android.content.DialogInterface
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.util.Log
import android.util.TypedValue
import android.view.KeyEvent
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.akanjs.runtime.AkanNativeErrorCode
import com.akanjs.runtime.AkanNativePluginContext
import com.akanjs.runtime.AkanNativeReply
import com.akanjs.runtime.AkanNativeVoidReply

/**
 * alert / confirm / prompt / actionSheet with the framework android.app.AlertDialog: no AndroidX,
 * no Material (docs/plugins.md §2, §4.2). Argument rules are those of src/options.ts: the generated
 * DialogPluginSpec (PL-10) decodes and type-checks the arguments, the rules beyond the types keep
 * src/options.ts's messages.
 * - AlertDialog.Builder(activity) takes the activity's Theme.DeviceDefault.DayNight, so dark mode and
 *   the device's dialog look come with it. Default button titles are the framework's localized
 *   android.R.string.ok / cancel.
 * - Back and a tap outside cancel, as in Capacitor (capacitor-plugins/dialog/…/Dialog.java:57-60) and
 *   wry (wry/src/android/kotlin/RustWebChromeClient.kt:141-160). Every dialog also answers from
 *   onDismiss, which runs after a button's listener; react-native consumes its callback once the same
 *   way (react-native/…/modules/dialog/DialogModule.kt:73-93), and AkanNativeCall ignores the second answer.
 * - At most three buttons fit an AlertDialog (react-native/…/Alert/Alert.js:128-136). That is enough for
 *   alert/confirm/prompt; action-sheet options are list rows and only the cancel option is a button.
 */
class DialogPlugin(private val context: AkanNativePluginContext) : DialogPluginSpec {
    private val showing = LinkedHashSet<AlertDialog>()

    override fun destroy() {
        // The activity is going away and the page with it: close without answering, without leaking windows.
        for (dialog in showing.toList()) {
            dialog.setOnDismissListener(null)
            dialog.dismiss()
        }
        showing.clear()
    }

    // ---------------------------------------------------------------- methods

    override fun alert(args: DialogAlertOptions, reply: AkanNativeVoidReply) {
        val (title, message) = heading(args.title, args.message, reply) ?: return
        val ok = label(args.buttonTitle, android.R.string.ok)
        val builder = builder(title).setMessage(message).setPositiveButton(ok) { _, _ -> answer(reply, Unit) }
        show(reply, builder.create(), Unit)
    }

    override fun confirm(args: DialogConfirmOptions, reply: AkanNativeReply<DialogConfirmResult>) {
        val (title, message) = heading(args.title, args.message, reply) ?: return
        val ok = label(args.okButtonTitle, android.R.string.ok)
        val cancel = label(args.cancelButtonTitle, android.R.string.cancel)
        val cancelled = DialogConfirmResult(value = false)
        val builder = builder(title)
            .setMessage(message)
            .setPositiveButton(ok) { _, _ -> answer(reply, DialogConfirmResult(value = true)) }
            .setNegativeButton(cancel) { _, _ -> answer(reply, cancelled) }
        show(reply, builder.create(), cancelled)
    }

    override fun prompt(args: DialogPromptOptions, reply: AkanNativeReply<DialogPromptResult>) {
        val (title, message) = heading(args.title, args.message, reply) ?: return
        val ok = label(args.okButtonTitle, android.R.string.ok)
        val cancel = label(args.cancelButtonTitle, android.R.string.cancel)
        val placeholder = args.inputPlaceholder ?: ""
        // wry's onJsPrompt drops the default value (RustWebChromeClient.kt:206-221); keep it.
        val initial = args.inputText ?: ""
        val cancelled = DialogPromptResult(value = "", cancelled = true)

        val builder = builder(title).setMessage(message)
        val themed = builder.context // the alert dialog theme, for the field and its padding
        val input = EditText(themed).apply {
            setSingleLine()
            imeOptions = EditorInfo.IME_ACTION_DONE
            hint = placeholder
            setText(initial)
            setSelection(initial.length) // caret at the end, as UITextField does
        }
        // Capacitor and wry add the EditText edge to edge; the dialog's content padding aligns it with the message.
        val pad = dimension(themed, android.R.attr.dialogPreferredPadding, 24)
        val box = FrameLayout(themed).apply {
            setPadding(pad, 0, pad, 0)
            addView(input)
        }
        builder.setView(box)
            // Not trimmed: Capacitor trims on Android only (capacitor-plugins/dialog/…/Dialog.java:143).
            .setPositiveButton(ok) { _, _ -> answer(reply, DialogPromptResult(value = input.text.toString(), cancelled = false)) }
            .setNegativeButton(cancel) { _, _ -> answer(reply, cancelled) }
        val dialog = builder.create()
        dialog.setCanceledOnTouchOutside(false) // a stray tap beside the keyboard must not throw the text away
        input.setOnEditorActionListener { _, action, event ->
            val enter = action == EditorInfo.IME_ACTION_DONE ||
                (event?.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN)
            if (enter) dialog.getButton(DialogInterface.BUTTON_POSITIVE)?.performClick()
            enter
        }
        dialog.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
        input.requestFocus()
        show(reply, dialog, cancelled)
    }

    override fun actionSheet(args: DialogActionSheetOptions, reply: AkanNativeReply<DialogActionSheetResult>) {
        val title = args.title?.ifEmpty { null }
        val message = args.message?.ifEmpty { null }
        val options = sheetOptions(args.options, reply) ?: return
        val cancelled = DialogActionSheetResult(index = -1.0, cancelled = true)

        val builder = AlertDialog.Builder(context.activity)
        val themed = builder.context
        val cancelIndex = options.indexOfFirst { it.second == DialogActionSheetOptionStyle.CANCEL }
        val rows = options.indices.filter { it != cancelIndex }
        val danger = color(themed, android.R.attr.colorError)
        val items = rows.map<Int, CharSequence> { i ->
            val (label, style) = options[i]
            if (style == DialogActionSheetOptionStyle.DESTRUCTIVE && danger != null) {
                SpannableString(label).apply { setSpan(ForegroundColorSpan(danger), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
            } else {
                label
            }
        }.toTypedArray()
        // setMessage hides the setItems list (react-native/…/modules/dialog/AlertFragment.kt:158-162),
        // so a message goes into a custom title.
        if (message != null) builder.setCustomTitle(header(themed, title, message)) else if (title != null) builder.setTitle(title)
        builder.setItems(items) { _, which -> answer(reply, DialogActionSheetResult(index = rows[which].toDouble(), cancelled = false)) }
        if (cancelIndex >= 0) builder.setNegativeButton(options[cancelIndex].first) { _, _ -> answer(reply, cancelled) }
        show(reply, builder.create(), cancelled)
    }

    // ---------------------------------------------------------------- showing

    private fun builder(title: String?): AlertDialog.Builder =
        AlertDialog.Builder(context.activity).apply { if (title != null) setTitle(title) }

    private fun <T> show(reply: AkanNativeReply<T>, dialog: AlertDialog, cancelled: T) {
        val activity = context.activity
        // Showing on a finishing activity throws BadTokenException. Capacitor rejects and wry returns
        // without answering (capacitor-plugins/dialog/…/DialogPlugin.java:25-28, RustWebChromeClient.kt:142);
        // answering as cancelled keeps the page going.
        if (activity.isFinishing || activity.isDestroyed) return answer(reply, cancelled)
        dialog.setOnDismissListener {
            showing.remove(dialog)
            answer(reply, cancelled)
        }
        showing.add(dialog)
        try {
            dialog.show()
        } catch (e: WindowManager.BadTokenException) {
            showing.remove(dialog)
            return answer(reply, cancelled)
        }
        // The dialog belongs to its call: the page gave up on it (AbortSignal) or went away (reload,
        // navigation), so it goes too instead of staying on screen for a page that cannot hear it.
        reply.onCancel {
            dialog.setOnDismissListener(null)
            showing.remove(dialog)
            dialog.dismiss()
        }
        // The title as an accessibility heading, as react-native does (AlertFragment.kt:99-131).
        val titleId = dialog.context.resources.getIdentifier("alertTitle", "id", "android")
        if (titleId != 0) dialog.findViewById<TextView>(titleId)?.isAccessibilityHeading = true
    }

    /** After a page reload the shell's reply port is closed; that must not crash a button click. */
    private fun <T> answer(reply: AkanNativeReply<T>, result: T) {
        try {
            reply.resolve(result)
        } catch (e: RuntimeException) {
            Log.w("AkanNative", "dialog: answer dropped", e)
        }
    }

    /** Title and message for an action sheet with a message (the stock title is a single line). */
    private fun header(themed: Context, title: String?, message: String): LinearLayout {
        val pad = dimension(themed, android.R.attr.dialogPreferredPadding, 24)
        val dp = themed.resources.displayMetrics.density
        return LinearLayout(themed).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, (18 * dp).toInt(), pad, (4 * dp).toInt())
            if (title != null) {
                addView(TextView(themed, null, android.R.attr.windowTitleStyle).apply {
                    text = title
                    isAccessibilityHeading = true
                })
            }
            addView(TextView(themed).apply {
                text = message
                color(themed, android.R.attr.textColorSecondary)?.let(::setTextColor)
                if (title != null) setPadding(0, (8 * dp).toInt(), 0, 0)
            })
        }
    }

    private fun dimension(themed: Context, attr: Int, fallbackDp: Int): Int {
        val value = TypedValue()
        val metrics = themed.resources.displayMetrics
        return if (themed.theme.resolveAttribute(attr, value, true) && value.type == TypedValue.TYPE_DIMENSION) {
            TypedValue.complexToDimensionPixelSize(value.data, metrics)
        } else {
            (fallbackDp * metrics.density).toInt()
        }
    }

    private fun color(themed: Context, attr: Int): Int? =
        themed.obtainStyledAttributes(intArrayOf(attr)).let { a ->
            // recycle(), not use {}: TypedArray is AutoCloseable only from API 31.
            try { if (a.hasValue(0)) a.getColor(0, 0) else null } finally { a.recycle() }
        }

    // ---------------------------------------------------------------- arguments (src/options.ts)

    /** The rules the types cannot express, with src/options.ts's "<method>: …" messages. */
    private fun invalid(reply: AkanNativeReply<*>, message: String) =
        reply.reject(AkanNativeErrorCode.INVALID_ARGS, "${reply.call.method}: $message")

    /** Title and message for the dialog, null when empty. Rejects (and returns null) when both are empty. */
    private fun heading(title: String?, message: String, reply: AkanNativeReply<*>): Pair<String?, String?>? {
        if (title.isNullOrEmpty() && message.isEmpty()) {
            invalid(reply, "title or message must not be empty")
            return null
        }
        return title?.ifEmpty { null } to message.ifEmpty { null }
    }

    /** "" means the default, not an invisible button (react-native/…/Alert/Alert.js:145-148). */
    private fun label(text: String?, fallback: Int): String =
        text?.ifEmpty { null } ?: context.activity.getString(fallback)

    private fun sheetOptions(
        raw: List<DialogActionSheetOption>,
        reply: AkanNativeReply<*>,
    ): List<Pair<String, DialogActionSheetOptionStyle>>? {
        if (raw.isEmpty()) {
            invalid(reply, "options must be a non-empty array")
            return null
        }
        val options = raw.mapIndexed { i, option ->
            if (option.title.isEmpty()) {
                invalid(reply, "options[$i].title must be a non-empty string")
                return null
            }
            option.title to (option.style ?: DialogActionSheetOptionStyle.DEFAULT)
        }
        // One cancel option, as UIAlertController allows one .cancel action.
        if (options.count { it.second == DialogActionSheetOptionStyle.CANCEL } > 1) {
            invalid(reply, "only one option may have the cancel style")
            return null
        }
        return options
    }
}
