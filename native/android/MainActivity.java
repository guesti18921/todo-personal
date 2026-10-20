package com.m1strell.todopersonal;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(LocalDataResetPlugin.class);
        registerPlugin(BackupFilesPlugin.class);
        registerPlugin(TimePickerPlugin.class);
        registerPlugin(DatePickerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
