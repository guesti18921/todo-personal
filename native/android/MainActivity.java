package com.m1strell.todopersonal;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalDataResetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
