package com.smartgarden.webview

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.net.http.SslError
import android.os.Bundle
import android.view.View
import android.webkit.*
import android.widget.*
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var inputContainer: View
    private lateinit var webViewContainer: View
    private lateinit var etUrlInput: EditText
    private lateinit var btnConnect: Button
    private lateinit var cbRemember: CheckBox
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar

    private lateinit var chipHttp: TextView
    private lateinit var chipLocal: TextView
    private lateinit var chipHttps: TextView

    private lateinit var sharedPreferences: SharedPreferences
    private val PREFS_NAME = "SmartGardenPrefs"
    private val KEY_SAVED_URL = "saved_system_url"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        sharedPreferences = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        initViews()
        setupListeners()
        setupWebView()
        setupBackPressed()

        // Check if there is a previously saved URL
        val savedUrl = sharedPreferences.getString(KEY_SAVED_URL, null)
        if (!savedUrl.isNullOrEmpty()) {
            etUrlInput.setText(savedUrl)
            // Auto connect to last saved URL
            loadWebPage(savedUrl)
        }
    }

    private fun initViews() {
        inputContainer = findViewById(R.id.inputContainer)
        webViewContainer = findViewById(R.id.webViewContainer)
        etUrlInput = findViewById(R.id.etUrlInput)
        btnConnect = findViewById(R.id.btnConnect)
        cbRemember = findViewById(R.id.cbRemember)
        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)

        chipHttp = findViewById(R.id.chipHttp)
        chipLocal = findViewById(R.id.chipLocal)
        chipHttps = findViewById(R.id.chipHttps)
    }

    private fun setupListeners() {
        btnConnect.setOnClickListener {
            val rawInput = etUrlInput.text.toString().trim()
            if (rawInput.isEmpty()) {
                Toast.makeText(this, "Vui lòng nhập địa chỉ hệ thống!", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val formattedUrl = formatUrl(rawInput)
            if (cbRemember.isChecked) {
                sharedPreferences.edit().putString(KEY_SAVED_URL, formattedUrl).apply()
            } else {
                sharedPreferences.edit().remove(KEY_SAVED_URL).apply()
            }

            loadWebPage(formattedUrl)
        }

        // Quick Preset Chips logic
        chipHttp.setOnClickListener {
            val current = etUrlInput.text.toString()
            if (!current.startsWith("http://")) {
                etUrlInput.setText("http://$current")
                etUrlInput.setSelection(etUrlInput.text.length)
            }
        }

        chipLocal.setOnClickListener {
            val current = etUrlInput.text.toString()
            if (!current.contains(":3000")) {
                etUrlInput.setText("$current:3000")
                etUrlInput.setSelection(etUrlInput.text.length)
            }
        }

        chipHttps.setOnClickListener {
            val current = etUrlInput.text.toString()
            if (!current.startsWith("https://")) {
                etUrlInput.setText("https://$current")
                etUrlInput.setSelection(etUrlInput.text.length)
            }
        }
    }

    private fun formatUrl(input: String): String {
        var url = input.trim()
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "http://$url"
        }
        return url
    }

    private fun setupWebView() {
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.builtInZoomControls = true
        settings.displayZoomControls = false

        // Enable mixed content for local HTTP/HTTPS servers
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                progressBar.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.GONE
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    Toast.makeText(
                        this@MainActivity,
                        "Không thể kết nối đến hệ thống. Vui lòng kiểm tra lại địa chỉ IP/URL hoặc Wifi!",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }

            override fun onReceivedSslError(
                view: WebView?,
                handler: SslErrorHandler?,
                error: SslError?
            ) {
                handler?.proceed()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress == 100) {
                    progressBar.visibility = View.GONE
                } else {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                }
            }
        }
    }

    private fun loadWebPage(url: String) {
        inputContainer.visibility = View.GONE
        webViewContainer.visibility = View.VISIBLE
        webView.loadUrl(url)
    }

    private fun setupBackPressed() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webViewContainer.visibility == View.VISIBLE) {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        finish()
                    }
                } else {
                    finish()
                }
            }
        })
    }
}
