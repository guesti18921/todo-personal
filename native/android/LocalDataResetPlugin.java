package com.m1strell.todopersonal;

import android.app.ActivityManager;
import android.app.AlertDialog;
import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** A user-confirmed Android reset, never a filesystem wipe while WebView is open. */
@CapacitorPlugin(name = "LocalDataReset")
public class LocalDataResetPlugin extends Plugin {
    @PluginMethod
    public void offerReset(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (getActivity().isFinishing()) {
                call.reject("activity_unavailable");
                return;
            }
            Runnable declined = () -> {
                JSObject result = new JSObject();
                result.put("resetRequested", false);
                call.resolve(result);
            };
            new AlertDialog.Builder(getActivity())
                .setTitle(call.getString("title", "Clear local app data?"))
                .setMessage(call.getString("message", "The account has been deleted. Clear this app's local data? This also removes offline copies of other accounts and app settings. The app will close."))
                .setNegativeButton(call.getString("cancel", "Keep local data"), (dialog, which) -> declined.run())
                .setOnCancelListener(dialog -> declined.run())
                .setPositiveButton(call.getString("confirm", "Clear and close"), (dialog, which) -> {
                    ActivityManager manager = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
                    try {
                        if (manager == null || !manager.clearApplicationUserData()) {
                            call.reject("reset_failed");
                            return;
                        }
                        // Android stops the process as part of clearing its data.
                        JSObject result = new JSObject();
                        result.put("resetRequested", true);
                        call.resolve(result);
                    } catch (RuntimeException error) {
                        call.reject("reset_failed");
                    }
                }).show();
        });
    }
}
