package com.example.unia

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.media3.exoplayer.ExoPlayer
import androidx.webkit.WebViewAssetLoader

class MainActivity : ComponentActivity() {

    lateinit var webView: WebView
    private var webInterface: WebAppInterface? = null

    // Background playback service binding
    private var playbackService: PlaybackService? = null
    private var isBound = false
    val player: ExoPlayer?
        get() = playbackService?.player

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as PlaybackService.LocalBinder
            val boundService = binder.getService()
            playbackService = boundService
            isBound = true

            // Connect media service skip actions to JavaScript triggers
            boundService.serviceCallback = object : PlaybackService.Callback {
                override fun onSkipToNext() {
                    webView.post {
                        webView.evaluateJavascript("if (window.onNativeNext) window.onNativeNext();", null)
                    }
                }

                override fun onSkipToPrevious() {
                    webView.post {
                        webView.evaluateJavascript("if (window.onNativePrev) window.onNativePrev();", null)
                    }
                }
            }

            // Initialize JavaScript bridge after service connects
            webInterface = WebAppInterface(this@MainActivity, webView)
            webView.addJavascriptInterface(webInterface!!, "AndroidBridge")
            
            // Load web content securely over virtual host to enable ES Modules (type="module")
            webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            playbackService?.serviceCallback = null
            playbackService = null
            isBound = false
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize WebView
        webView = WebView(this)
        configureWebView()
        setContentView(webView)

        // Request runtime permissions for notifications on Android 13+
        checkNotificationPermission()

        // Bind to background playback service
        val intent = Intent(this, PlaybackService::class.java)
        startService(intent) // Start foreground service
        bindService(intent, connection, Context.BIND_AUTO_CREATE)
    }

    private fun configureWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false // Autoplay tracks
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        
        // Critical settings for local file protocol (CORS / AJAX / unpkg CDNs)
        settings.allowFileAccessFromFileURLs = true
        settings.allowUniversalAccessFromFileURLs = true
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
        
        // Optimize WebView performance
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                return request?.url?.let { assetLoader.shouldInterceptRequest(it) }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Set native platform indicator variable
                webView.evaluateJavascript("window.isAndroidNative = true;", null)
            }
        }

        // WebChromeClient console.log redirector for flawless hybrid debugging
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                consoleMessage?.let {
                    Log.d("WebViewConsole", "${it.message()} -- From line ${it.lineNumber()} of ${it.sourceId()}")
                }
                return true
            }
        }
    }

    private fun checkNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    101
                )
            }
        }
    }

    fun showToast(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack() // Navigate WebView history instead of closing
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        if (isBound) {
            unbindService(connection)
            isBound = false
        }
        webInterface?.onDestroy()
        super.onDestroy()
    }
}
