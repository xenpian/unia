package com.example.unia

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import org.json.JSONObject
import org.json.JSONArray
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class WebAppInterface(private val activity: MainActivity, private val webView: WebView) {

    private val handler = Handler(Looper.getMainLooper())
    private var progressTrackerRunnable: Runnable? = null

    // Get ExoPlayer from MainActivity
    private val player: ExoPlayer?
        get() = activity.player

    // Listener to sync ExoPlayer play/pause state with web UI
    private val playerListener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            webView.post {
                webView.evaluateJavascript("if (window.onNativePlayPauseChange) window.onNativePlayPauseChange($isPlaying);", null)
            }
        }
    }

    init {
        startProgressTracker()
        player?.addListener(playerListener)
    }

    private fun startProgressTracker() {
        progressTrackerRunnable = object : Runnable {
            override fun run() {
                player?.let { p ->
                    if (p.isPlaying && p.duration > 0) {
                        val pos = p.currentPosition / 1000.0
                        val dur = p.duration / 1000.0
                        // Send progress update to JavaScript
                        webView.post {
                            webView.evaluateJavascript("if (window.onNativeProgressChange) window.onNativeProgressChange($pos, $dur);", null)
                        }
                    }
                }
                handler.postDelayed(this, 1000)
            }
        }
        handler.post(progressTrackerRunnable!!)
    }

    @JavascriptInterface
    fun playTrack(trackJson: String) {
        Log.d("AndroidBridge", "playTrack called with JSON: $trackJson")
        try {
            val track = JSONObject(trackJson)
            val trackId = track.optString("trackId", "")
            val trackName = track.optString("trackName", "Bilinmeyen Şarkı")
            val artistName = track.optString("artistName", "Bilinmeyen Sanatçı")
            val artworkUrl = track.optString("artworkUrl100", "")
            val videoId = track.optString("videoId", "")
            val previewUrl = track.optString("previewUrl", "")

            activity.runOnUiThread {
                activity.showToast("Çalınıyor: $trackName")
            }

            // Resolve streaming URL asynchronously on a background thread
            thread {
                var streamUrl = previewUrl // Fallback to preview URL first if available
                var vid = videoId
                val isYtId = trackId.length == 11 && !trackId.all { it.isDigit() }

                if (vid.isEmpty() || vid == "null" || vid.length != 11) {
                    vid = if (isYtId) {
                        trackId
                    } else {
                        resolveVideoIdNative(artistName, trackName)
                    }
                }

                if (vid.isNotEmpty() && vid.length == 11) {
                    val resolved = resolveYoutubeStream(vid)
                    if (resolved != null) {
                        streamUrl = resolved
                    }
                }

                if (streamUrl.isEmpty()) {
                    // Fallback search or preview
                    streamUrl = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
                }

                Log.d("AndroidBridge", "Resolved Stream URL: $streamUrl")

                handler.post {
                    player?.let { p ->
                        p.stop()
                        p.clearMediaItems()

                        // Configure premium media metadata for MediaSession & Foreground Service Notification
                        val metadata = MediaMetadata.Builder()
                            .setTitle(trackName)
                            .setArtist(artistName)
                            .setArtworkUri(Uri.parse(artworkUrl))
                            .build()

                        val mediaItem = MediaItem.Builder()
                            .setUri(streamUrl)
                            .setMediaMetadata(metadata)
                            .build()

                        p.setMediaItem(mediaItem)
                        p.prepare()
                        p.play()
                    }
                }
            }

        } catch (e: Exception) {
            Log.e("AndroidBridge", "Error in playTrack: ${e.message}", e)
        }
    }

    @JavascriptInterface
    fun pauseTrack() {
        Log.d("AndroidBridge", "pauseTrack called")
        handler.post {
            player?.pause()
        }
    }

    @JavascriptInterface
    fun resumeTrack() {
        Log.d("AndroidBridge", "resumeTrack called")
        handler.post {
            player?.play()
        }
    }

    @JavascriptInterface
    fun seekTo(seconds: Double) {
        Log.d("AndroidBridge", "seekTo: $seconds seconds")
        handler.post {
            player?.seekTo((seconds * 1000).toLong())
        }
    }

    @JavascriptInterface
    fun setVolume(volume: Float) {
        Log.d("AndroidBridge", "setVolume: $volume")
        handler.post {
            player?.volume = volume
        }
    }

    @JavascriptInterface
    fun addRecentlyPlayed(trackJson: String) {
        Log.d("AndroidBridge", "addRecentlyPlayed called: $trackJson")
        try {
            val prefs = activity.getSharedPreferences("unia_prefs", Context.MODE_PRIVATE)
            val currentRecent = prefs.getString("recently_played", "[]") ?: "[]"
            val trackArray = JSONArray(currentRecent)
            val newTrack = JSONObject(trackJson)
            
            // Remove existing track with same trackId to avoid duplicates
            val newId = newTrack.optString("trackId", "")
            val list = mutableListOf<JSONObject>()
            for (i in 0 until trackArray.length()) {
                val item = trackArray.getJSONObject(i)
                if (item.optString("trackId", "") != newId) {
                    list.add(item)
                }
            }
            list.add(0, newTrack) // prepend
            
            // Limit to 20 tracks
            val limitedList = if (list.size > 20) list.subList(0, 20) else list
            val newArray = JSONArray()
            for (item in limitedList) {
                newArray.put(item)
            }
            
            prefs.edit().putString("recently_played", newArray.toString()).apply()
        } catch (e: Exception) {
            Log.e("AndroidBridge", "Failed to add recently played", e)
        }
    }

    @JavascriptInterface
    fun getRecentlyPlayed(): String {
        val prefs = activity.getSharedPreferences("unia_prefs", Context.MODE_PRIVATE)
        val result = prefs.getString("recently_played", "[]") ?: "[]"
        Log.d("AndroidBridge", "getRecentlyPlayed returning: $result")
        return result
    }

    @JavascriptInterface
    fun removeRecentlyPlayed(trackId: String) {
        Log.d("AndroidBridge", "removeRecentlyPlayed called: $trackId")
        try {
            val prefs = activity.getSharedPreferences("unia_prefs", Context.MODE_PRIVATE)
            val currentRecent = prefs.getString("recently_played", "[]") ?: "[]"
            val trackArray = JSONArray(currentRecent)
            val newArray = JSONArray()
            for (i in 0 until trackArray.length()) {
                val item = trackArray.getJSONObject(i)
                if (item.optString("trackId", "") != trackId) {
                    newArray.put(item)
                }
            }
            prefs.edit().putString("recently_played", newArray.toString()).apply()
        } catch (e: Exception) {
            Log.e("AndroidBridge", "Failed to remove recently played", e)
        }
    }

    @JavascriptInterface
    fun clearRecentlyPlayed() {
        Log.d("AndroidBridge", "clearRecentlyPlayed called")
        try {
            val prefs = activity.getSharedPreferences("unia_prefs", Context.MODE_PRIVATE)
            prefs.edit().remove("recently_played").apply()
        } catch (e: Exception) {
            Log.e("AndroidBridge", "Failed to clear recently played", e)
        }
    }

    @JavascriptInterface
    fun fetchUrl(urlString: String): String {
        Log.d("AndroidBridge", "fetchUrl called with: $urlString")
        var result = ""
        val thread = kotlin.concurrent.thread {
            try {
                val url = URL(urlString)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.connectTimeout = 10000
                conn.readTimeout = 10000
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
                
                if (conn.responseCode == 200) {
                    val reader = BufferedReader(InputStreamReader(conn.inputStream))
                    val response = StringBuilder()
                    var line: String?
                    while (reader.readLine().also { line = it } != null) {
                        response.append(line)
                    }
                    reader.close()
                    result = response.toString()
                } else {
                    Log.e("AndroidBridge", "fetchUrl failed with code: ${conn.responseCode}")
                }
            } catch (e: Exception) {
                Log.e("AndroidBridge", "fetchUrl error: ${e.message}", e)
            }
        }
        try {
            thread.join()
        } catch (e: Exception) {
            Log.e("AndroidBridge", "fetchUrl thread join error: ${e.message}")
        }
        return result
    }

    // Resolve direct audio stream using public Piped / Invidious APIs
    private fun resolveYoutubeStream(videoId: String): String? {
        val pipedInstances = listOf(
            "https://pipedapi.adminforge.de",
            "https://pipedapi.colby.land",
            "https://pipedapi.tokhmi.xyz",
            "https://pipedapi.kavin.rocks",
            "https://pipedapi.privacydev.net",
            "https://api.piped.yt"
        )
        val invidiousInstances = listOf(
            "https://inv.thepixora.com",
            "https://invidious.projectsegfau.lt",
            "https://invidious.nerdvpn.de",
            "https://yewtu.be"
        )

        var resolvedUrl: String? = null
        val lock = Object()
        val threads = mutableListOf<Thread>()

        // 1. Launch Piped resolver threads
        for (instance in pipedInstances) {
            val t = Thread {
                try {
                    val url = URL("$instance/streams/$videoId")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "GET"
                    conn.connectTimeout = 3000
                    conn.readTimeout = 3000
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36")

                    if (conn.responseCode == 200) {
                        val reader = BufferedReader(InputStreamReader(conn.inputStream))
                        val response = StringBuilder()
                        var line: String?
                        while (reader.readLine().also { line = it } != null) {
                            response.append(line)
                        }
                        reader.close()

                        val json = JSONObject(response.toString())
                        val audioStreams = json.optJSONArray("audioStreams")
                        if (audioStreams != null && audioStreams.length() > 0) {
                            var bestUrl: String? = null
                            var highestBitrate = -1
                            for (i in 0 until audioStreams.length()) {
                                val stream = audioStreams.getJSONObject(i)
                                val streamUrl = stream.optString("url", "")
                                val bitrate = stream.optInt("bitrate", -1)
                                if (streamUrl.isNotEmpty() && bitrate > highestBitrate) {
                                    highestBitrate = bitrate
                                    bestUrl = streamUrl
                                }
                            }
                            if (bestUrl != null) {
                                synchronized(lock) {
                                    if (resolvedUrl == null) {
                                        resolvedUrl = bestUrl
                                        Log.d("AndroidBridge", "Resolved via concurrent Piped stream ($instance): $bestUrl")
                                        lock.notifyAll()
                                    }
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    // Ignore and let other threads complete
                }
            }
            threads.add(t)
            t.start()
        }

        // 2. Launch Invidious latest_version `HEAD` resolver threads (extremely fast!)
        for (instance in invidiousInstances) {
            val t = Thread {
                try {
                    val testUrl = "$instance/latest_version?id=$videoId&itag=140"
                    val url = URL(testUrl)
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "HEAD"
                    conn.instanceFollowRedirects = false
                    conn.connectTimeout = 3000
                    conn.readTimeout = 3000
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
                    val code = conn.responseCode
                    if (code == 200 || code == 302 || code == 301) {
                        synchronized(lock) {
                            if (resolvedUrl == null) {
                                resolvedUrl = testUrl
                                Log.d("AndroidBridge", "Resolved via concurrent Invidious latest_version ($instance): $testUrl")
                                lock.notifyAll()
                            }
                        }
                    }
                } catch (e: Exception) {
                    // Ignore
                }
            }
            threads.add(t)
            t.start()
        }

        // 3. Launch Invidious API resolver threads
        for (instance in invidiousInstances) {
            val t = Thread {
                try {
                    val url = URL("$instance/api/v1/videos/$videoId")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "GET"
                    conn.connectTimeout = 3000
                    conn.readTimeout = 3000
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36")

                    if (conn.responseCode == 200) {
                        val reader = BufferedReader(InputStreamReader(conn.inputStream))
                        val response = StringBuilder()
                        var line: String?
                        while (reader.readLine().also { line = it } != null) {
                            response.append(line)
                        }
                        reader.close()

                        val json = JSONObject(response.toString())
                        val adaptiveFormats = json.optJSONArray("adaptiveFormats")
                        if (adaptiveFormats != null && adaptiveFormats.length() > 0) {
                            for (i in 0 until adaptiveFormats.length()) {
                                val format = adaptiveFormats.getJSONObject(i)
                                val type = format.optString("type", "")
                                if (type.contains("audio")) {
                                    var streamUrl = format.optString("url", "")
                                    if (streamUrl.isNotEmpty()) {
                                        if (streamUrl.startsWith("/")) {
                                            streamUrl = "$instance$streamUrl"
                                        }
                                        synchronized(lock) {
                                            if (resolvedUrl == null) {
                                                resolvedUrl = streamUrl
                                                Log.d("AndroidBridge", "Resolved via concurrent Invidious API ($instance): $streamUrl")
                                                lock.notifyAll()
                                            }
                                        }
                                        break
                                    }
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    // Ignore
                }
            }
            threads.add(t)
            t.start()
        }

        // Wait on the lock until resolvedUrl is populated or maximum timeout (5 seconds) is reached
        synchronized(lock) {
            if (resolvedUrl == null) {
                try {
                    lock.wait(5000)
                } catch (e: InterruptedException) {
                    // interrupted
                }
            }
        }

        return resolvedUrl
    }

    @JavascriptInterface
    fun resolveVideoIdNative(artistName: String, trackName: String): String {
        val query = "$artistName $trackName"
        Log.d("AndroidBridge", "resolveVideoIdNative called for: $query")

        var resolvedId: String? = null
        val lock = Object()
        val threads = mutableListOf<Thread>()

        // 1. Thread for YouTube search scrape (extremely robust, uses phone's local mobile IP)
        val ytThread = Thread {
            try {
                val urlString = "https://www.youtube.com/results?search_query=${Uri.encode(query)}"
                Log.d("AndroidBridge", "Searching YouTube directly: $urlString")
                val url = URL(urlString)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.connectTimeout = 3000
                conn.readTimeout = 3000
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36")
                conn.setRequestProperty("Accept-Language", "en-US,en;q=0.9")
                
                if (conn.responseCode == 200) {
                    val reader = BufferedReader(InputStreamReader(conn.inputStream))
                    val response = StringBuilder()
                    var line: String?
                    while (reader.readLine().also { line = it } != null) {
                        response.append(line)
                    }
                    reader.close()
                    
                    val html = response.toString()
                    val regex = "\"videoId\"\\s*:\\s*\"([a-zA-Z0-9_-]{11})\"".toRegex()
                    val match = regex.find(html)
                    if (match != null) {
                        val videoId = match.groupValues[1]
                        synchronized(lock) {
                            if (resolvedId == null) {
                                resolvedId = videoId
                                Log.d("AndroidBridge", "Resolved videoId native directly from YouTube search scrape: $videoId")
                                lock.notifyAll()
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                // Ignore
            }
        }
        threads.add(ytThread)
        ytThread.start()

        // 2. Threads for Piped searches
        val pipedInstances = listOf(
            "https://pipedapi.adminforge.de",
            "https://pipedapi.colby.land",
            "https://pipedapi.tokhmi.xyz",
            "https://pipedapi.kavin.rocks"
        )
        for (instance in pipedInstances) {
            val t = Thread {
                try {
                    val urlString = "$instance/search?q=${Uri.encode(query)}&filter=all"
                    Log.d("AndroidBridge", "Searching Piped native ($instance): $urlString")
                    val url = URL(urlString)
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "GET"
                    conn.connectTimeout = 3000
                    conn.readTimeout = 3000
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36")
                    
                    if (conn.responseCode == 200) {
                        val reader = BufferedReader(InputStreamReader(conn.inputStream))
                        val response = StringBuilder()
                        var line: String?
                        while (reader.readLine().also { line = it } != null) {
                            response.append(line)
                        }
                        reader.close()
                        
                        val json = JSONObject(response.toString())
                        val items = json.optJSONArray("items")
                        if (items != null && items.length() > 0) {
                            for (i in 0 until items.length()) {
                                val item = items.getJSONObject(i)
                                if (item.optString("type", "") == "stream") {
                                    val itemUrl = item.optString("url", "")
                                    val id = itemUrl.substringAfter("v=", "").substringBefore("&", "")
                                        .ifEmpty { itemUrl.substringAfterLast("/") }
                                    if (id.isNotEmpty() && id.length == 11) {
                                        synchronized(lock) {
                                            if (resolvedId == null) {
                                                resolvedId = id
                                                Log.d("AndroidBridge", "Resolved videoId native via Piped ($instance): $id")
                                                lock.notifyAll()
                                            }
                                        }
                                        break
                                    }
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    // Ignore
                }
            }
            threads.add(t)
            t.start()
        }

        // 3. Threads for Invidious searches
        val invidiousInstances = listOf(
            "https://inv.thepixora.com",
            "https://invidious.projectsegfau.lt",
            "https://invidious.nerdvpn.de"
        )
        for (instance in invidiousInstances) {
            val t = Thread {
                try {
                    val urlString = "$instance/api/v1/search?q=${Uri.encode(query)}&type=video"
                    Log.d("AndroidBridge", "Searching Invidious native ($instance): $urlString")
                    val url = URL(urlString)
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "GET"
                    conn.connectTimeout = 3000
                    conn.readTimeout = 3000
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36")
                    
                    if (conn.responseCode == 200) {
                        val reader = BufferedReader(InputStreamReader(conn.inputStream))
                        val response = StringBuilder()
                        var line: String?
                        while (reader.readLine().also { line = it } != null) {
                            response.append(line)
                        }
                        reader.close()
                        
                        val jsonArray = JSONArray(response.toString())
                        if (jsonArray.length() > 0) {
                            val firstVideo = jsonArray.getJSONObject(0)
                            val id = firstVideo.optString("videoId", "")
                            if (id.isNotEmpty() && id.length == 11) {
                                synchronized(lock) {
                                    if (resolvedId == null) {
                                        resolvedId = id
                                        Log.d("AndroidBridge", "Resolved videoId native via Invidious ($instance): $id")
                                        lock.notifyAll()
                                    }
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    // Ignore
                }
            }
            threads.add(t)
            t.start()
        }

        // Wait for resolvedId to be populated
        synchronized(lock) {
            if (resolvedId == null) {
                try {
                    lock.wait(4000) // 4 seconds maximum search wait time
                } catch (e: InterruptedException) {
                    // interrupted
                }
            }
        }

        return resolvedId ?: ""
    }

    fun onDestroy() {
        progressTrackerRunnable?.let {
            handler.removeCallbacks(it)
        }
        player?.removeListener(playerListener)
    }
}
