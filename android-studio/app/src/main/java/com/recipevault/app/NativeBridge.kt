package com.recipevault.app

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URL
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import javax.net.ssl.HttpsURLConnection

class NativeBridge(private val context: Context) {
  companion object {
    private val localModelDownloads = ConcurrentHashMap<String, LocalModelDownloadStatus>()
  }

  private data class LocalModelDownloadStatus(
    val state: String,
    val downloadedBytes: Long,
    val totalBytes: Long?,
    val path: String = "",
    val error: String = ""
  ) {
    fun toJson(): JSONObject {
      return JSONObject()
        .put("state", state)
        .put("downloadedBytes", downloadedBytes)
        .put("totalBytes", totalBytes ?: JSONObject.NULL)
        .put("path", path)
        .put("error", error)
    }
  }

  private data class BundledModelStatus(
    val found: Boolean,
    val assetPath: String = "",
    val resolvedPath: String = "",
    val error: String = ""
  ) {
    fun toJson(): JSONObject {
      return JSONObject()
        .put("found", found)
        .put("assetPath", assetPath)
        .put("resolvedPath", resolvedPath)
        .put("error", error)
    }
  }

  @JavascriptInterface
  fun invoke(command: String, argsJson: String?): String {
    return try {
      val args = if (argsJson.isNullOrBlank()) JSONObject() else JSONObject(argsJson)
      val payload = args.optJSONObject("payload") ?: JSONObject()

      val data: Any = when (command) {
        "call_ai" -> callAi(payload)
        "test_api_key" -> testApiKey(payload)
        "extract_url_content" -> extractUrlContent(payload)
        "start_local_model_download" -> startLocalModelDownload(payload)
        "get_local_model_download_status" -> getLocalModelDownloadStatus(payload)
        "get_local_android_model_status" -> getLocalAndroidModelStatus()
        "export_backup" -> exportBackup(payload)
        else -> throw IllegalArgumentException("Comando non supportato: $command")
      }

      JSONObject()
        .put("ok", true)
        .put("data", data)
        .toString()
    } catch (error: Exception) {
      JSONObject()
        .put("ok", false)
        .put("error", error.message ?: "Errore Android sconosciuto")
        .toString()
    }
  }

  private fun callAi(payload: JSONObject): String {
    return when (payload.getString("provider")) {
      "claude" -> callClaude(payload)
      "openai" -> callOpenAi(payload)
      "local" -> callLocal(payload)
      else -> throw IllegalArgumentException("Provider AI non supportato")
    }
  }

  private fun testApiKey(payload: JSONObject): Boolean {
    val provider = payload.getString("provider")
    val apiKey = payload.optString("apiKey")

    val (status, _) = when (provider) {
      "claude" -> requestJson(
        endpoint = "https://api.anthropic.com/v1/messages",
        method = "POST",
        headers = mapOf(
          "Content-Type" to "application/json",
          "x-api-key" to apiKey,
          "anthropic-version" to "2023-06-01"
        ),
        body = JSONObject()
          .put("model", "claude-haiku-4-5-20251001")
          .put("max_tokens", 5)
          .put(
            "messages",
            JSONArray().put(
              JSONObject()
                .put("role", "user")
                .put("content", "Hi")
            )
          )
      )

      "openai" -> requestJson(
        endpoint = "https://api.openai.com/v1/models",
        method = "GET",
        headers = mapOf(
          "Authorization" to "Bearer $apiKey"
        )
      )

      "local" -> {
        validateLocalModelPath(payload)
        return true
      }

      else -> throw IllegalArgumentException("Provider AI non supportato")
    }

    return status in 200..299
  }

  private fun extractUrlContent(payload: JSONObject): JSONObject {
    val url = payload.optString("url").trim()
    if (url.isEmpty()) {
      throw IllegalArgumentException("URL mancante")
    }

    val (_, html) = requestText(
      endpoint = url,
      method = "GET",
      headers = mapOf(
        "User-Agent" to "RecipeVault/1.0 (+https://recipevault.local)"
      )
    )

    return JSONObject()
      .put("title", extractTitle(html))
      .put("text", stripHtmlText(html))
      .put("image", extractImage(html))
  }

  private fun exportBackup(payload: JSONObject): String {
    val json = payload.getString("json")
    val fileName = "recipevault-backup-${System.currentTimeMillis() / 1000}.json"

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val values = ContentValues().apply {
        put(MediaStore.Downloads.DISPLAY_NAME, fileName)
        put(MediaStore.Downloads.MIME_TYPE, "application/json")
        put(MediaStore.Downloads.IS_PENDING, 1)
      }

      val resolver = context.contentResolver
      val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        ?: throw IllegalStateException("Impossibile creare il file di backup")

      resolver.openOutputStream(uri)?.use { output ->
        output.write(json.toByteArray())
      } ?: throw IllegalStateException("Impossibile scrivere il file di backup")

      values.clear()
      values.put(MediaStore.Downloads.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
      return uri.toString()
    }

    val directory = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir
    val file = File(directory, fileName)
    file.writeText(json)
    return file.absolutePath
  }

  private fun startLocalModelDownload(payload: JSONObject): String {
    val url = payload.optString("url").trim()
    val fileName = payload.optString("fileName").trim()
    if (url.isEmpty() || fileName.isEmpty()) {
      throw IllegalArgumentException("Configurazione download modello incompleta")
    }

    val modelsDir = File(context.filesDir, "local-models").apply { mkdirs() }
    val targetFile = File(modelsDir, fileName)
    val downloadId = "local-model-${UUID.randomUUID()}"
    if (targetFile.exists() && targetFile.length() > 0) {
      localModelDownloads[downloadId] = LocalModelDownloadStatus(
        state = "completed",
        downloadedBytes = targetFile.length(),
        totalBytes = targetFile.length(),
        path = targetFile.absolutePath
      )
      return downloadId
    }

    localModelDownloads[downloadId] = LocalModelDownloadStatus(
      state = "starting",
      downloadedBytes = 0,
      totalBytes = null
    )

    Thread {
      val tempFile = File(modelsDir, "$fileName.download")
      val connection = (URL(url).openConnection() as HttpsURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 60_000
        readTimeout = 60_000
        doInput = true
        instanceFollowRedirects = true
        setRequestProperty("User-Agent", "RecipeVault/1.0 (+https://recipevault.local)")
      }

      try {
        val status = connection.responseCode
        if (status !in 200..299) {
          localModelDownloads[downloadId] = LocalModelDownloadStatus(
            state = "error",
            downloadedBytes = 0,
            totalBytes = null,
            error = "Download modello fallito (HTTP $status)"
          )
          return@Thread
        }

        val totalBytes = connection.contentLengthLong.takeIf { it > 0 }
        localModelDownloads[downloadId] = LocalModelDownloadStatus(
          state = "downloading",
          downloadedBytes = 0,
          totalBytes = totalBytes
        )

        var downloadedBytes = 0L
        connection.inputStream.use { input ->
          tempFile.outputStream().use { output ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
              val read = input.read(buffer)
              if (read <= 0) break
              output.write(buffer, 0, read)
              downloadedBytes += read
              localModelDownloads[downloadId] = LocalModelDownloadStatus(
                state = "downloading",
                downloadedBytes = downloadedBytes,
                totalBytes = totalBytes
              )
            }
            output.flush()
          }
        }

        if (targetFile.exists()) {
          targetFile.delete()
        }
        if (!tempFile.renameTo(targetFile)) {
          tempFile.copyTo(targetFile, overwrite = true)
          tempFile.delete()
        }

        localModelDownloads[downloadId] = LocalModelDownloadStatus(
          state = "completed",
          downloadedBytes = targetFile.length(),
          totalBytes = targetFile.length(),
          path = targetFile.absolutePath
        )
      } catch (error: Exception) {
        tempFile.delete()
        localModelDownloads[downloadId] = LocalModelDownloadStatus(
          state = "error",
          downloadedBytes = localModelDownloads[downloadId]?.downloadedBytes ?: 0,
          totalBytes = localModelDownloads[downloadId]?.totalBytes,
          error = error.message ?: "Errore download modello"
        )
      } finally {
        connection.disconnect()
      }
    }.start()

    return downloadId
  }

  private fun getLocalModelDownloadStatus(payload: JSONObject): JSONObject {
    val downloadId = payload.optString("downloadId").trim()
    if (downloadId.isEmpty()) {
      throw IllegalArgumentException("Identificativo download mancante")
    }

    val status = localModelDownloads[downloadId]
      ?: throw IllegalArgumentException("Download modello non trovato")
    return status.toJson()
  }

  private fun callClaude(payload: JSONObject): String {
    val imageDataUrl = payload.optString("imageDataUrl").trim()
    val requestContent = JSONArray()

    if (imageDataUrl.isNotEmpty()) {
      val imageParts = parseImageDataUrl(imageDataUrl)
      requestContent.put(
        JSONObject()
          .put("type", "image")
          .put(
            "source",
            JSONObject()
              .put("type", "base64")
              .put("media_type", imageParts.first)
              .put("data", imageParts.second)
          )
      )
    }

    requestContent.put(
      JSONObject()
        .put("type", "text")
        .put("text", payload.getString("prompt"))
    )

    val body = JSONObject()
      .put("model", payload.getString("model"))
      .put("max_tokens", 1600)
      .put(
        "messages",
        JSONArray().put(
          JSONObject()
            .put("role", "user")
            .put("content", requestContent)
        )
      )

    if (payload.optBoolean("useWebSearch", true)) {
      body.put(
        "tools",
        JSONArray().put(
          JSONObject()
            .put("type", "web_search_20250305")
            .put("name", "web_search")
        )
      )
    }

    val (status, responseBody) = requestJson(
      endpoint = "https://api.anthropic.com/v1/messages",
      method = "POST",
      headers = mapOf(
        "Content-Type" to "application/json",
        "x-api-key" to payload.getString("apiKey"),
        "anthropic-version" to "2023-06-01"
      ),
      body = body
    )

    if (status !in 200..299) {
      throw IllegalStateException(extractErrorMessage(responseBody, "Anthropic HTTP $status"))
    }

    val json = JSONObject(responseBody)
    val responseContent = json.optJSONArray("content") ?: JSONArray()
    return buildString {
      for (index in 0 until responseContent.length()) {
        val block = responseContent.optJSONObject(index) ?: continue
        if (block.optString("type") == "text") {
          append(block.optString("text"))
        }
      }
    }
  }

  private fun callOpenAi(payload: JSONObject): String {
    val model = if (payload.optBoolean("useWebSearch", true)) {
      "gpt-4o-search-preview"
    } else {
      payload.getString("model")
    }

    val imageDataUrl = payload.optString("imageDataUrl").trim()
    val content: Any = if (imageDataUrl.isNotEmpty()) {
      JSONArray()
        .put(
          JSONObject()
            .put("type", "text")
            .put("text", payload.getString("prompt"))
        )
        .put(
          JSONObject()
            .put("type", "image_url")
            .put("image_url", JSONObject().put("url", imageDataUrl))
        )
    } else {
      payload.getString("prompt")
    }

    val body = JSONObject()
      .put("model", model)
      .put("max_tokens", 1600)
      .put(
        "messages",
        JSONArray().put(
          JSONObject()
            .put("role", "user")
            .put("content", content)
        )
      )

    val (status, responseBody) = requestJson(
      endpoint = "https://api.openai.com/v1/chat/completions",
      method = "POST",
      headers = mapOf(
        "Content-Type" to "application/json",
        "Authorization" to "Bearer ${payload.getString("apiKey")}"
      ),
      body = body
    )

    if (status !in 200..299) {
      throw IllegalStateException(extractErrorMessage(responseBody, "OpenAI HTTP $status"))
    }

    val json = JSONObject(responseBody)
    val choices = json.optJSONArray("choices") ?: JSONArray()
    val message = choices.optJSONObject(0)?.optJSONObject("message")
    return collectTextContent(message?.opt("content"))
  }

  private fun callLocal(payload: JSONObject): String {
    if (payload.optString("imageDataUrl").trim().isNotEmpty()) {
      throw IllegalArgumentException("Su Android il modello locale non supporta ancora l'analisi foto. Usa Claude o OpenAI per questa modalità.")
    }

    val modelPath = validateLocalModelPath(payload)
    val options = LlmInference.LlmInferenceOptions.builder()
      .setModelPath(modelPath)
      .setMaxTokens(2048)
      .build()

    val llmInference = LlmInference.createFromOptions(context, options)
    return try {
      llmInference.generateResponse(payload.getString("prompt")).trim()
    } finally {
      llmInference.close()
    }
  }

  private fun validateLocalModelPath(payload: JSONObject): String {
    val localOptions = payload.optJSONObject("localOptions")
      ?: throw IllegalArgumentException("Configurazione del modello locale mancante")
    val modelPath = resolveLocalModelPath(localOptions).trim()

    if (modelPath.isEmpty()) {
      throw IllegalArgumentException("Percorso del modello locale mancante")
    }

    val file = File(modelPath)
    if (!file.exists() || !file.isFile) {
      throw IllegalArgumentException("Modello locale non trovato: $modelPath")
    }

    return file.absolutePath
  }

  private fun resolveLocalModelPath(localOptions: JSONObject): String {
    val configuredPath = localOptions.optString("modelPath").trim()
    if (configuredPath == "@bundled" || configuredPath == "@auto") {
      val bundledModel = resolveBundledModel()
      if (bundledModel != null) {
        return bundledModel
      }

      if (configuredPath == "@bundled") {
        throw IllegalArgumentException("Nessun modello incluso trovato in assets/models")
      }
    }
    if (configuredPath.startsWith("asset://")) {
      return copyAssetToInternalStorage(configuredPath.removePrefix("asset://"))
    }
    return configuredPath
  }

  private fun resolveBundledModel(): String? {
    val assetPath = findBundledModelAssetPath() ?: return null
    return copyAssetToInternalStorage(assetPath)
  }

  private fun findBundledModelAssetPath(): String? {
    val entries = context.assets.list("models") ?: return null
    return entries
      .sorted()
      .firstOrNull { it.endsWith(".task", ignoreCase = true) }
      ?.let { "models/$it" }
  }

  private fun getLocalAndroidModelStatus(): JSONObject {
    val assetPath = findBundledModelAssetPath()
      ?: return BundledModelStatus(
        found = false,
        error = "Nessun modello `.task` trovato in assets/models"
      ).toJson()

    val resolvedPath = try {
      copyAssetToInternalStorage(assetPath)
    } catch (error: Exception) {
      return BundledModelStatus(
        found = false,
        assetPath = assetPath,
        error = error.message ?: "Impossibile preparare il modello incluso"
      ).toJson()
    }

    return BundledModelStatus(
      found = true,
      assetPath = assetPath,
      resolvedPath = resolvedPath
    ).toJson()
  }

  private fun copyAssetToInternalStorage(assetPath: String): String {
    val outputDir = File(context.filesDir, "local-models").apply { mkdirs() }
    val outputFile = File(outputDir, assetPath.substringAfterLast('/'))
    if (outputFile.exists()) {
      return outputFile.absolutePath
    }

    context.assets.open(assetPath).use { input ->
      outputFile.outputStream().use { output -> input.copyTo(output) }
    }
    return outputFile.absolutePath
  }

  private fun requestJson(
    endpoint: String,
    method: String,
    headers: Map<String, String>,
    body: JSONObject? = null
  ): Pair<Int, String> {
    return requestText(endpoint, method, headers, body?.toString())
  }

  private fun requestText(
    endpoint: String,
    method: String,
    headers: Map<String, String>,
    body: String? = null
  ): Pair<Int, String> {
    val connection = (URL(endpoint).openConnection() as HttpsURLConnection).apply {
      requestMethod = method
      connectTimeout = 60_000
      readTimeout = 60_000
      doInput = true
      instanceFollowRedirects = true
      headers.forEach { (key, value) -> setRequestProperty(key, value) }
      if (body != null) {
        doOutput = true
      }
    }

    try {
      if (body != null) {
        connection.outputStream.use { output ->
          output.write(body.toByteArray())
        }
      }

      val status = connection.responseCode
      val responseBody = (if (status in 200..299) connection.inputStream else connection.errorStream)
        ?.bufferedReader()
        ?.use { it.readText() }
        .orEmpty()

      return status to responseBody
    } finally {
      connection.disconnect()
    }
  }

  private fun extractErrorMessage(body: String, fallback: String): String {
    return try {
      val json = JSONObject(body)
      val error = json.optJSONObject("error")
      error?.optString("message")?.takeIf { it.isNotBlank() }
        ?: json.optString("message").takeIf { it.isNotBlank() }
        ?: fallback
    } catch (_: Exception) {
      fallback
    }
  }

  private fun extractTitle(html: String): String {
    return captureMetaContent(html, "og:title")
      ?: captureFirstGroup(Regex("(?is)<title[^>]*>(.*?)</title>"), html)
      ?: ""
  }

  private fun extractImage(html: String): String {
    return captureMetaContent(html, "og:image") ?: ""
  }

  private fun captureMetaContent(html: String, key: String): String? {
    val escaped = Regex.escape(key)
    val direct = Regex("(?is)<meta[^>]+(?:property|name)\\s*=\\s*[\"']$escaped[\"'][^>]+content\\s*=\\s*[\"']([^\"']+)[\"']")
    val reverse = Regex("(?is)<meta[^>]+content\\s*=\\s*[\"']([^\"']+)[\"'][^>]+(?:property|name)\\s*=\\s*[\"']$escaped[\"']")
    return captureFirstGroup(direct, html) ?: captureFirstGroup(reverse, html)
  }

  private fun captureFirstGroup(regex: Regex, input: String): String? {
    return regex.find(input)
      ?.groupValues
      ?.getOrNull(1)
      ?.let(::htmlDecode)
      ?.trim()
      ?.takeIf { it.isNotEmpty() }
  }

  private fun stripHtmlText(html: String): String {
    val noNoise = html
      .replace(Regex("(?is)<!--.*?-->"), " ")
      .replace(Regex("(?is)<script[^>]*>.*?</script>"), " ")
      .replace(Regex("(?is)<style[^>]*>.*?</style>"), " ")
    val withBreaks = noNoise.replace(Regex("(?i)<\\s*(br|/p|/div|/section|/article|/li|/ul|/ol|/h[1-6]|/tr|/td|/th)\\s*>"), "\n")
    val noTags = withBreaks.replace(Regex("(?is)<[^>]+>"), " ")
    val decoded = htmlDecode(noTags)
    val compactSpaces = decoded.replace(Regex("[ \\t\\x0B\\x0C\\r]+"), " ")
    val compactLines = compactSpaces.replace(Regex("\\n\\s*\\n+"), "\n\n").trim()
    return compactLines.take(14_000)
  }

  private fun htmlDecode(input: String): String {
    return input
      .replace("&nbsp;", " ")
      .replace("&amp;", "&")
      .replace("&quot;", "\"")
      .replace("&#39;", "'")
      .replace("&apos;", "'")
      .replace("&lt;", "<")
      .replace("&gt;", ">")
  }

  private fun parseImageDataUrl(dataUrl: String): Pair<String, String> {
    val parts = dataUrl.split(",", limit = 2)
    if (parts.size != 2 || !parts[0].startsWith("data:") || !parts[0].endsWith(";base64")) {
      throw IllegalArgumentException("Formato immagine non supportato")
    }

    val mediaType = parts[0].removePrefix("data:").removeSuffix(";base64").trim()
    if (mediaType.isBlank()) {
      throw IllegalArgumentException("Tipo MIME immagine non valido")
    }

    return mediaType to parts[1].trim()
  }

  private fun collectTextContent(value: Any?): String {
    return when (value) {
      is String -> value
      is JSONArray -> buildString {
        for (index in 0 until value.length()) {
          when (val part = value.opt(index)) {
            is String -> append(part)
            is JSONObject -> append(part.optString("text"))
          }
        }
      }
      else -> ""
    }
  }
}
