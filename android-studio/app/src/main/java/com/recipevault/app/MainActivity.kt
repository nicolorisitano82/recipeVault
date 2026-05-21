package com.recipevault.app

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.net.Uri
import android.os.Bundle
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

class MainActivity : AppCompatActivity() {
  private val appAssetsBaseUrl = "https://appassets.androidplatform.net/assets/web/index.html"
  private lateinit var assetLoader: WebViewAssetLoader
  private lateinit var webView: WebView
  private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

  private val filePicker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
    fileChooserCallback?.onReceiveValue(uri?.let { arrayOf(it) })
    fileChooserCallback = null
  }

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    webView = WebView(this)
    setContentView(webView)
    assetLoader = WebViewAssetLoader.Builder()
      .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
      .build()

    val isDebuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    WebView.setWebContentsDebuggingEnabled(isDebuggable)

    with(webView.settings) {
      javaScriptEnabled = true
      domStorageEnabled = true
      allowFileAccess = true
      allowContentAccess = true
      mediaPlaybackRequiresUserGesture = false
      mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
    }

    webView.addJavascriptInterface(NativeBridge(this), "AndroidBridge")
    webView.webChromeClient = object : WebChromeClient() {
      override fun onShowFileChooser(
        webView: WebView?,
        filePathCallback: ValueCallback<Array<Uri>>?,
        fileChooserParams: FileChooserParams?
      ): Boolean {
        this@MainActivity.fileChooserCallback?.onReceiveValue(null)
        this@MainActivity.fileChooserCallback = filePathCallback
        val requestedType = fileChooserParams?.acceptTypes?.firstOrNull()?.takeIf { it.isNotBlank() }
        val mimeType = requestedType?.takeIf { it.contains("/") } ?: "*/*"
        filePicker.launch(mimeType)
        return true
      }
    }

    webView.webViewClient = object : WebViewClientCompat() {
      override fun shouldInterceptRequest(
        view: WebView,
        request: WebResourceRequest
      ): WebResourceResponse? {
        return assetLoader.shouldInterceptRequest(request.url)
      }

      override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val url = request.url
        return if (
          (url.scheme == "http" || url.scheme == "https") &&
          url.host != "appassets.androidplatform.net"
        ) {
          startActivity(Intent(Intent.ACTION_VIEW, url))
          true
        } else {
          false
        }
      }
    }

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
          webView.goBack()
        } else {
          isEnabled = false
          onBackPressedDispatcher.onBackPressed()
        }
      }
    })

    if (savedInstanceState == null) {
      webView.loadUrl(appAssetsBaseUrl)
    } else {
      webView.restoreState(savedInstanceState)
    }
  }

  override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)
    webView.saveState(outState)
  }

  override fun onDestroy() {
    fileChooserCallback?.onReceiveValue(null)
    fileChooserCallback = null
    if (::webView.isInitialized) {
      webView.removeJavascriptInterface("AndroidBridge")
      webView.destroy()
    }
    super.onDestroy()
  }
}
