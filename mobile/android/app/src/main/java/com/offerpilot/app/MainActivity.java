package com.offerpilot.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.CalendarContract;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 设置沉浸式浅色状态栏
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        webView = new WebView(this);
        setContentView(webView);

        initWebView();
    }

    private void initWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // 注册原生交互通道
        webView.addJavascriptInterface(new NativeBridge(this), "AndroidNative");

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return handleUrl(uri);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = Uri.parse(url);
                return handleUrl(uri);
            }

            private boolean handleUrl(Uri uri) {
                String scheme = uri.getScheme();
                if (scheme != null && (scheme.equals("wemeet") || scheme.equals("feishu") || scheme.equals("zoomus") || scheme.equals("tel") || scheme.equals("mailto"))) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                        startActivity(intent);
                        return true;
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "未安装对应客户端，已为您复制相关信息", Toast.LENGTH_SHORT).show();
                        return true;
                    }
                }
                return false;
            }
        });

        // 加载打包在 assets 中的静态前端
        webView.loadUrl("file:///android_asset/public/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    public static class NativeBridge {
        private final Context context;

        public NativeBridge(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public void haptic(String type) {
            try {
                Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        int amplitude = "heavy".equals(type) ? VibrationEffect.DEFAULT_AMPLITUDE : 80;
                        v.vibrate(VibrationEffect.createOneShot(25, amplitude));
                    } else {
                        v.vibrate(25);
                    }
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void copyText(String text) {
            try {
                ClipboardManager cm = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) {
                    ClipData clip = ClipData.newPlainText("OfferPilot", text);
                    cm.setPrimaryClip(clip);
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void showNativeToast(String message) {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show();
        }

        @JavascriptInterface
        public void openCalendarEvent(String title, String description, String location, long beginTimeMs, long endTimeMs) {
            try {
                Intent intent = new Intent(Intent.ACTION_INSERT)
                        .setData(CalendarContract.Events.CONTENT_URI)
                        .putExtra(CalendarContract.Events.TITLE, title)
                        .putExtra(CalendarContract.Events.DESCRIPTION, description)
                        .putExtra(CalendarContract.Events.EVENT_LOCATION, location)
                        .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, beginTimeMs)
                        .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endTimeMs > 0 ? endTimeMs : beginTimeMs + 3600000);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            } catch (Exception e) {
                Toast.makeText(context, "无法唤起系统日历: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            }
        }
    }
}
