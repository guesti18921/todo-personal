package com.m1strell.todopersonal;

import android.app.DatePickerDialog;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "DatePicker")
public class DatePickerPlugin extends Plugin {
    private DatePickerDialog active;
    @PluginMethod
    public void pick(PluginCall call) {
        final int year, month, day;
        try {
            String value = call.getString("date", "");
            if (!value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw new IllegalArgumentException();
            year = Integer.parseInt(value.substring(0, 4)); month = Integer.parseInt(value.substring(5, 7)); day = Integer.parseInt(value.substring(8, 10));
            int[] days = { 31, (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
            if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) throw new IllegalArgumentException();
        } catch (Exception error) { call.reject("Invalid date"); return; }
        getActivity().runOnUiThread(() -> {
            if (getActivity().isFinishing() || getActivity().isDestroyed()) { call.reject("Activity unavailable"); return; }
            if (active != null && active.isShowing()) { call.reject("Picker already open"); return; }
            AtomicBoolean completed = new AtomicBoolean(false);
            active = new DatePickerDialog(getActivity(), (view, selectedYear, selectedMonth, selectedDay) -> {
                if (completed.compareAndSet(false, true)) {
                    JSObject result = new JSObject();
                    result.put("date", String.format(Locale.ROOT, "%04d-%02d-%02d", selectedYear, selectedMonth + 1, selectedDay));
                    result.put("cancelled", false); call.resolve(result);
                }
            }, year, month - 1, day);
            // Bound the calendar to the same four-digit years accepted by storage.
            java.util.Calendar bounds = java.util.Calendar.getInstance();
            bounds.clear(); bounds.set(1000, 0, 1); active.getDatePicker().setMinDate(bounds.getTimeInMillis());
            bounds.clear(); bounds.set(9999, 11, 31); active.getDatePicker().setMaxDate(bounds.getTimeInMillis());
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
