package com.m1strell.todopersonal;

import android.app.TimePickerDialog;
import android.text.format.DateFormat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "TimePicker")
public class TimePickerPlugin extends Plugin {
    private TimePickerDialog active;
    @PluginMethod
    public void deviceFormat(PluginCall call) {
        JSObject result = new JSObject();
        result.put("is24Hour", DateFormat.is24HourFormat(getContext()));
        call.resolve(result);
    }
    @PluginMethod
    public void pick(PluginCall call) {
        int hour = call.getInt("hour", 9), minute = call.getInt("minute", 0);
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) { call.reject("Invalid time"); return; }
        boolean is24Hour = call.getBoolean("is24Hour", DateFormat.is24HourFormat(getContext()));
        getActivity().runOnUiThread(() -> {
            if (getActivity().isFinishing()) { call.reject("Activity unavailable"); return; }
            if (active != null && active.isShowing()) { call.reject("Picker already open"); return; }
            AtomicBoolean completed = new AtomicBoolean(false);
            active = new TimePickerDialog(getActivity(), R.style.TodoTimePickerTheme, (view, h, m) -> {
                if (completed.compareAndSet(false, true)) {
                    JSObject result = new JSObject(); result.put("hour", h); result.put("minute", m); result.put("cancelled", false); call.resolve(result);
                }
            }, hour, minute, is24Hour);
            active.setOnDismissListener(dialog -> {
                active = null;
                if (completed.compareAndSet(false, true)) { JSObject result = new JSObject(); result.put("cancelled", true); call.resolve(result); }
            });
            active.show();
        });
    }
    @Override
    protected void handleOnDestroy() {
        if (active != null) active.dismiss();
        super.handleOnDestroy();
    }
}
