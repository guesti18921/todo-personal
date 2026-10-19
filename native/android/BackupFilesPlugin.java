package com.m1strell.todopersonal;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** User-selected documents only; no broad storage permission or arbitrary paths. */
@CapacitorPlugin(name = "BackupFiles")
public class BackupFilesPlugin extends Plugin {
    private static final int LIMIT = 8 * 1024 * 1024;
    private boolean busy;
    private final java.util.concurrent.ExecutorService io = java.util.concurrent.Executors.newSingleThreadExecutor();
    @PluginMethod public void save(PluginCall call) {
        String data = call.getString("data"), name = call.getString("name", "todo-personal-backup.json");
        if (data == null || data.length() > LIMIT || data.getBytes(StandardCharsets.UTF_8).length > LIMIT || !name.matches("todo-personal-[a-z0-9-]+\\.json")) { call.reject("invalid_backup"); return; }
        getActivity().runOnUiThread(() -> {
            if (busy || getActivity().isFinishing()) { call.reject("picker_unavailable"); return; }
            busy = true;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");
            intent.putExtra(Intent.EXTRA_TITLE, name);
            try { startActivityForResult(call, intent, "saved"); }
            catch (RuntimeException e) { busy = false; call.reject("picker_unavailable"); }
        });
    }
    @ActivityCallback private void saved(PluginCall call, ActivityResult result) {
        busy = false;
        if (call == null) return;
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) { cancelled(call); return; }
        io.execute(() -> {
            try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (out == null) throw new java.io.IOException();
                byte[] data = call.getString("data", "").getBytes(StandardCharsets.UTF_8);
                if (data.length > LIMIT) throw new java.io.IOException();
                out.write(data); out.flush();
                JSObject value = new JSObject(); value.put("cancelled", false); call.resolve(value);
            } catch (Exception e) { call.reject("backup_not_saved"); }
        });
    }
    @PluginMethod public void pick(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (busy || getActivity().isFinishing()) { call.reject("picker_unavailable"); return; }
            busy = true;
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/json", "text/plain", "application/octet-stream" });
            try { startActivityForResult(call, intent, "picked"); }
            catch (RuntimeException e) { busy = false; call.reject("picker_unavailable"); }
        });
    }
    @ActivityCallback private void picked(PluginCall call, ActivityResult result) {
        busy = false;
        if (call == null) return;
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) { cancelled(call); return; }
        io.execute(() -> {
            try (InputStream in = getContext().getContentResolver().openInputStream(uri); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                if (in == null) throw new java.io.IOException();
                byte[] buffer = new byte[8192]; int count;
                while ((count = in.read(buffer)) != -1) {
                    if (out.size() + count > LIMIT) { call.reject("backup_too_large"); return; }
                    out.write(buffer, 0, count);
                }
                JSObject value = new JSObject(); value.put("cancelled", false); value.put("data", new String(out.toByteArray(), StandardCharsets.UTF_8)); call.resolve(value);
            } catch (Exception e) { call.reject("backup_not_read"); }
        });
    }
    @Override protected void handleOnDestroy() { io.shutdownNow(); super.handleOnDestroy(); }
    private void cancelled(PluginCall call) { JSObject value = new JSObject(); value.put("cancelled", true); call.resolve(value); }
}
