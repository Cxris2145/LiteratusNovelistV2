package com.literatus.novelist;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeTtsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
