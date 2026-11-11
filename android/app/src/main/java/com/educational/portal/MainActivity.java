package com.educational.portal;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.StatFs;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.io.File;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Block screenshots, screen recording, and task switcher previews
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);

        // Configure system bars (Status Bar & Navigation Bar) background colors
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.parseColor("#090d16"));
            window.setNavigationBarColor(Color.parseColor("#090d16"));
        }

        // Configure decor fits system windows so WebView does not draw underneath unpadded system bars
        WindowCompat.setDecorFitsSystemWindows(window, true);
    }

    public void setImmersiveFullscreen(boolean enabled) {
        runOnUiThread(() -> {
            try {
                Window window = getWindow();
                WindowInsetsControllerCompat windowInsetsController =
                        WindowCompat.getInsetsController(window, window.getDecorView());
                if (windowInsetsController != null) {
                    if (enabled) {
                        windowInsetsController.setSystemBarsBehavior(
                                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                        );
                        windowInsetsController.hide(WindowInsetsCompat.Type.systemBars());
                    } else {
                        windowInsetsController.show(WindowInsetsCompat.Type.systemBars());
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    @Override
    public void onStart() {
        super.onStart();
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                WebSettings settings = webView.getSettings();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    settings.setForceDark(WebSettings.FORCE_DARK_AUTO);
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    settings.setAlgorithmicDarkeningAllowed(true);
                }
                
                // Expose real phone storage & system controls to JavaScript
                webView.addJavascriptInterface(new Object() {
                    @JavascriptInterface
                    public void setFullScreen(boolean fullScreen) {
                        setImmersiveFullscreen(fullScreen);
                    }

                    @JavascriptInterface
                    public long getTotalStorageBytes() {
                        try {
                            File path = Environment.getDataDirectory();
                            StatFs stat = new StatFs(path.getPath());
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
                                return stat.getTotalBytes();
                            } else {
                                return (long) stat.getBlockCount() * stat.getBlockSize();
                            }
                        } catch (Exception e) {
                            return 0;
                        }
                    }

                    @JavascriptInterface
                    public long getFreeStorageBytes() {
                        try {
                            File path = Environment.getDataDirectory();
                            StatFs stat = new StatFs(path.getPath());
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
                                return stat.getFreeBytes();
                            } else {
                                return (long) stat.getAvailableBlocks() * stat.getBlockSize();
                            }
                        } catch (Exception e) {
                            return 0;
                        }
                    }
                }, "AndroidStorage");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
