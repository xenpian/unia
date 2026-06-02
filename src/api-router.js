const play = require('play-dl');
const Database = require('../db.js');
const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const path = require('path');

const db = new Database();

// SoundCloud client ID initialization
(async () => {
  try {
    const clientId = await play.getFreeClientID();
    await play.setToken({ soundcloud: { client_id: clientId } });
    console.log('[API Router] SoundCloud client ID initialized successfully');
  } catch (e) {
    console.error('[API Router] Failed to init play-dl:', e);
  }
})();

function getJSONBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
  });
}

async function searchYouTubeVideos(query) {
  try {
    const res = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(query), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const html = await res.text();
    const jsonMatch = html.match(/ytInitialData\s*=\s*({.+?});/);
    const tracks = [];

    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
        const regularTracks = [];
        const topicTracks = [];

        for (const content of contents) {
          if (content.itemSectionRenderer) {
            for (const item of content.itemSectionRenderer.contents || []) {
              if (item.videoRenderer) {
                const vr = item.videoRenderer;
                const videoId = vr.videoId;
                const title = vr.title?.runs?.[0]?.text || 'Bilinmeyen Şarkı';
                const artist = vr.ownerText?.runs?.[0]?.text || 'Bilinmeyen Sanatçı';
                const thumbnail = vr.thumbnail?.thumbnails?.[0]?.url || '';

                let durationMs = 180000;
                if (vr.lengthText && vr.lengthText.simpleText) {
                  const parts = vr.lengthText.simpleText.simpleText ? vr.lengthText.simpleText.simpleText.split(':') : vr.lengthText.simpleText.split(':');
                  if (parts.length === 2) {
                    durationMs = (parseInt(parts[0]) * 60 + parseInt(parts[1])) * 1000;
                  } else if (parts.length === 3) {
                    durationMs = (parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2])) * 1000;
                  }
                }

                const trackObj = {
                  trackId: videoId,
                  trackName: title,
                  artistName: artist,
                  artworkUrl100: thumbnail,
                  trackTimeMillis: durationMs,
                  primaryGenreName: 'Music',
                  videoId: videoId
                };

                if (artist.toLowerCase().includes('topic') || artist.toLowerCase().includes('- topic')) {
                  topicTracks.push(trackObj);
                } else {
                  regularTracks.push(trackObj);
                }
              }
            }
          }
        }
        tracks.push(...regularTracks, ...topicTracks);
      } catch (e) {
        console.error('Error parsing ytInitialData:', e);
      }
    }

    if (tracks.length === 0) {
      const regex = /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g;
      let match;
      let count = 0;
      const seen = new Set();
      while ((match = regex.exec(html)) !== null && count < 12) {
        const vId = match[1];
        if (!seen.has(vId)) {
          seen.add(vId);
          tracks.push({
            trackId: vId,
            trackName: 'YouTube Müzik Parçası',
            artistName: 'Müzisyen',
            artworkUrl100: `https://i.ytimg.com/vi/${vId}/mqdefault.jpg`,
            trackTimeMillis: 180000,
            primaryGenreName: 'Music',
            videoId: vId
          });
          count++;
        }
      }
    }

    return tracks;
  } catch (err) {
    console.error('YouTube search helper failed:', err);
    return [];
  }
}

// Background Caching Worker to automatically cache the top 10 most recently played tracks
async function triggerBackgroundCaching(userId) {
  if (!userId) return;
  try {
    console.log(`[Background Caching] Verifying cache for top 10 played tracks of user: ${userId}`);
    const recentTracks = await db.getRecentlyPlayed(userId);
    if (!recentTracks || recentTracks.length === 0) return;

    const cacheDir = path.join(__dirname, '../.cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Process each track in the background asynchronously
    for (const track of recentTracks) {
      const videoId = track.videoId || track.trackId;
      if (!videoId || videoId.length !== 11) continue; // Only cache valid YouTube videoIds

      const cachePath = path.join(cacheDir, `${videoId}.mp3`);
      const tempPath = path.join(cacheDir, `${videoId}.tmp`);

      // If already fully cached, skip it
      if (fs.existsSync(cachePath)) {
        continue;
      }

      console.log(`[Background Caching] Track: "${track.trackName}" is not cached. Pre-caching in background...`);
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // Asynchronous background IIFE to download without blocking the loop or HTTP responses
      (async () => {
        let cacheWriter = null;
        try {
          cacheWriter = fs.createWriteStream(tempPath);
          const source = await play.stream(youtubeUrl, { quality: 2 });
          
          source.stream.pipe(cacheWriter);

          source.stream.on('error', (err) => {
            console.error(`[Background Caching] play-dl stream error for ${videoId}:`, err);
            try {
              cacheWriter.end();
              if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            } catch (e) {}
          });

          source.stream.on('end', () => {
            cacheWriter.end();
            setTimeout(() => {
              try {
                if (fs.existsSync(tempPath)) {
                  fs.renameSync(tempPath, cachePath);
                  console.log(`[Background Caching] Successfully cached track: "${track.trackName}" (${videoId})`);
                }
              } catch (renameErr) {
                console.error(`[Background Caching] Rename failed for ${videoId}:`, renameErr.message);
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
              }
            }, 100);
          });
        } catch (playDlErr) {
          console.warn(`[Background Caching] play-dl failed for ${videoId}, trying fallback:`, playDlErr.message);
          try {
            if (cacheWriter) cacheWriter.end();
            cacheWriter = fs.createWriteStream(tempPath);
            const audioStream = ytdl(youtubeUrl, {
              filter: 'audioonly',
              highWaterMark: 1 << 25,
              quality: 'highestaudio'
            });

            audioStream.on('error', (streamErr) => {
              console.error(`[Background Caching] ytdl-core fallback error for ${videoId}:`, streamErr);
              try {
                cacheWriter.end();
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
              } catch (e) {}
            });

            audioStream.pipe(cacheWriter);

            audioStream.on('end', () => {
              cacheWriter.end();
              setTimeout(() => {
                try {
                  if (fs.existsSync(tempPath)) {
                    fs.renameSync(tempPath, cachePath);
                    console.log(`[Background Caching] Successfully cached fallback track: "${track.trackName}" (${videoId})`);
                  }
                } catch (renameErr) {
                  console.error(`[Background Caching] Fallback rename failed for ${videoId}:`, renameErr.message);
                  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                }
              }, 100);
            });
          } catch (fallbackErr) {
            console.error(`[Background Caching] Pre-caching completely failed for ${videoId}:`, fallbackErr.message);
            try {
              if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            } catch (e) {}
          }
        }
      })();
    }
  } catch (err) {
    console.error('[Background Caching] Worker failure:', err);
  }
}

async function handleApiRequest(req, res, urlObj) {
  const reqPath = decodeURIComponent(urlObj.pathname);

  // SoundCloud stream proxy route
  if (reqPath === '/api/stream') {
    try {
      const query = urlObj.searchParams.get('q');
      if (!query) {
        res.writeHead(400); return res.end(JSON.stringify({ error: 'No query provided' }));
      }

      let searchResults;
      try {
        searchResults = await play.search(query, { limit: 5 });
      } catch (e) {
        console.error('play.search failed:', e.message);
      }

      if (!searchResults || searchResults.length === 0) {
        console.log('play-dl failed or empty, using regex fallback...');
        const backupResults = await searchYouTubeVideos(query);
        searchResults = backupResults.slice(0, 5).map(r => ({ id: r.videoId, title: r.title }));
      }

      if (!searchResults || searchResults.length === 0) {
        res.writeHead(404); return res.end(JSON.stringify({ error: 'Not found' }));
      }

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      const ids = searchResults.map(r => r.id);
      const vids = searchResults.map(r => ({ id: r.id, title: r.title || '' }));
      console.log(`Stream API resolved: ${query} -> ${ids.join(', ')}`);
      res.end(JSON.stringify({ videoIds: ids, videoId: ids[0], videos: vids }));
    } catch (e) {
      console.error('Stream proxy error:', e);
      res.writeHead(500); res.end(JSON.stringify({ error: 'Server error' }));
    }
    return true;
  }

  // Raw Audio Streaming API for HTML5 Audio Tag (enables Web Audio API & Offline Caching)
  if (reqPath === '/api/audio') {
    try {
      const videoId = urlObj.searchParams.get('id');
      if (!videoId) {
        res.writeHead(400); return res.end(JSON.stringify({ error: 'No video ID provided' }));
      }

      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      console.log(`[Audio Stream] Requested: ${youtubeUrl}`);

      const cacheDir = path.join(__dirname, '../.cache');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      const cachePath = path.join(cacheDir, `${videoId}.mp3`);
      const tempPath = path.join(cacheDir, `${videoId}.tmp`);

      // 1. Cache Hit - Stream directly from local disk cache
      if (fs.existsSync(cachePath)) {
        console.log(`[Audio Cache] Cache HIT for: ${videoId}`);
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Access-Control-Allow-Origin': '*',
          'Accept-Ranges': 'bytes'
        });
        const diskStream = fs.createReadStream(cachePath);
        diskStream.on('error', (diskErr) => {
          console.error('[Audio Cache] Disk stream error:', diskErr);
        });
        diskStream.pipe(res);
        return true;
      }

      // 2. Cache Miss - Stream and Cache simultaneously
      console.log(`[Audio Cache] Cache MISS for: ${videoId}. Streaming and caching concurrently.`);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes'
      });

      const cacheWriter = fs.createWriteStream(tempPath);
      let downloadFinished = false;

      const cleanupTempFile = () => {
        if (!downloadFinished) {
          try {
            cacheWriter.end();
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          } catch (e) {
            console.error('[Audio Cache] Temp file cleanup error:', e.message);
          }
        }
      };

      cacheWriter.on('error', (writeErr) => {
        console.error('[Audio Cache] Cache writer error:', writeErr);
        cleanupTempFile();
      });

      cacheWriter.on('finish', () => {
        if (downloadFinished) {
          fs.rename(tempPath, cachePath, (err) => {
            if (err) {
              console.error('[Audio Cache] Failed to rename temp file to cached MP3:', err.message);
              cleanupTempFile();
            } else {
              console.log(`[Audio Cache] Successfully cached track to disk: ${videoId}`);
            }
          });
        } else {
          cleanupTempFile();
        }
      });

      // Cleanup if client aborted the connection
      res.on('close', () => {
        if (!downloadFinished) {
          console.log(`[Audio Cache] Stream connection aborted by client before completion: ${videoId}`);
          cleanupTempFile();
        }
      });

      // Try play-dl first, fall back to @distube/ytdl-core if play-dl throws
      try {
        const source = await play.stream(youtubeUrl, { quality: 2 });
        
        source.stream.pipe(res);
        source.stream.pipe(cacheWriter);

        source.stream.on('error', (err) => {
          console.error('[Audio Cache] play-dl stream error:', err);
          cleanupTempFile();
        });

        source.stream.on('end', () => {
          downloadFinished = true;
          cacheWriter.end();
          console.log(`[Audio Cache] Stream finished: ${videoId}`);
        });

        console.log(`[Audio Stream] play-dl streaming successfully: ${videoId}`);
      } catch (err) {
        console.warn(`[Audio Stream] play-dl failed, falling back to ytdl-core:`, err.message);
        const audioStream = ytdl(youtubeUrl, {
          filter: 'audioonly',
          highWaterMark: 1 << 25,
          quality: 'highestaudio'
        });

        audioStream.on('error', (streamErr) => {
          console.error('[Audio Stream] ytdl-core stream error:', streamErr);
          cleanupTempFile();
          if (!res.headersSent) {
            res.writeHead(500); res.end();
          }
        });

        audioStream.pipe(res);
        audioStream.pipe(cacheWriter);

        audioStream.on('end', () => {
          downloadFinished = true;
          cacheWriter.end();
          console.log(`[Audio Cache] Fallback ytdl-core stream finished: ${videoId}`);
        });

        console.log(`[Audio Stream] ytdl-core streaming successfully: ${videoId}`);
      }
    } catch (e) {
      console.error('[Audio Stream] Error:', e);
      if (!res.headersSent) {
        res.writeHead(500); res.end(JSON.stringify({ error: 'Server error' }));
      }
    }
    return true;
  }

  if (reqPath === '/api/search-youtube') {
    try {
      const query = urlObj.searchParams.get('q');
      const list = await searchYouTubeVideos(query);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(list.length > 0 ? list[0].videoId : null));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify(null));
    }
    return true;
  }

  if (reqPath === '/api/search-music') {
    try {
      const query = urlObj.searchParams.get('q');
      const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=25`;
      const deezerRes = await fetch(url);
      const data = await deezerRes.json();
      const mappedResults = (data.data || []).map(song => ({
        trackId: song.id.toString(),
        trackName: song.title,
        artistName: song.artist.name,
        artworkUrl100: song.album.cover_xl || song.album.cover_big || song.album.cover_medium,
        trackTimeMillis: song.duration * 1000,
        primaryGenreName: 'Pop',
        previewUrl: song.preview
      }));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ results: mappedResults }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ results: [] }));
    }
    return true;
  }

  if (reqPath === '/api/recommendations') {
    try {
      const url = `https://api.deezer.com/playlist/1116190041/tracks?limit=20`;
      const deezerRes = await fetch(url);
      const data = await deezerRes.json();
      const mappedResults = (data.data || []).map(song => ({
        trackId: song.id.toString(),
        trackName: song.title,
        artistName: song.artist.name,
        artworkUrl100: song.album.cover_xl || song.album.cover_big || song.album.cover_medium,
        trackTimeMillis: song.duration * 1000,
        primaryGenreName: 'Hits',
        previewUrl: song.preview
      }));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ results: mappedResults }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ results: [] }));
    }
    return true;
  }

  if (reqPath === '/api/global-media') {
    const { exec } = require('child_process');
    const path = require('path');
    const scriptPath = path.join(__dirname, '../get_media_info.ps1');
    exec(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, (error, stdout, stderr) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      if (error) {
        res.end(JSON.stringify({}));
        return;
      }
      try {
        const data = JSON.parse(stdout.trim() || '{}');
        res.end(JSON.stringify(data));
      } catch (e) {
        res.end(JSON.stringify({}));
      }
    });
    return true;
  }

  if (reqPath === '/api/artist-info') {
    try {
      const artistName = urlObj.searchParams.get('name');
      const resDeezer = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}`);
      const dataDeezer = await resDeezer.json();
      let pictureUrl = '';
      if (dataDeezer.data && dataDeezer.data.length > 0) {
        pictureUrl = dataDeezer.data[0].picture_xl || dataDeezer.data[0].picture_medium;
      }

      let bio = 'Bu sanatçı hakkında bilgi bulunamadı.';
      try {
        const resWiki = await fetch(`https://tr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(artistName)}`);
        if (resWiki.ok) {
          const dataWiki = await resWiki.json();
          if (dataWiki.extract) bio = dataWiki.extract;
        }
      } catch (e) { }

      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ pictureUrl, bio }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ pictureUrl: '', bio: 'Bilgi alınamadı.' }));
    }
    return true;
  }

  if (reqPath === '/api/db/users') {
    try {
      const usersList = await db.getUsers();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(usersList));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify([]));
    }
    return true;
  }

  if (reqPath === '/api/db/user') {
    try {
      const userId = urlObj.searchParams.get('userId');
      const userData = await db.getUser(userId);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(userData));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify(null));
    }
    return true;
  }

  if (reqPath === '/api/db/save-user') {
    try {
      const body = await getJSONBody(req);
      await db.saveUser(body.userObj);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return true;
  }

  if (reqPath === '/api/db/update-user') {
    try {
      const body = await getJSONBody(req);
      const updated = await db.updateUser(body.userId, body.updates);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(updated));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify(null));
    }
    return true;
  }

  if (reqPath === '/api/db/liked-tracks') {
    try {
      const userId = urlObj.searchParams.get('userId');
      const tracks = await db.getLikedTracks(userId);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(tracks));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify([]));
    }
    return true;
  }

  if (reqPath === '/api/db/add-liked-track') {
    try {
      const body = await getJSONBody(req);
      await db.addLikedTrack(body.userId, body.track);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return true;
  }

  if (reqPath === '/api/db/remove-liked-track') {
    try {
      const body = await getJSONBody(req);
      await db.removeLikedTrack(body.userId, body.trackId);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return true;
  }

  if (reqPath === '/api/db/playlists') {
    try {
      const userId = urlObj.searchParams.get('userId');
      const list = await db.getUserPlaylists(userId);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(list));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify([]));
    }
    return true;
  }

  if (reqPath === '/api/db/save-playlist') {
    try {
      const body = await getJSONBody(req);
      await db.savePlaylist(body.userId, body.playlist);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return true;
  }

  if (reqPath === '/api/db/delete-playlist') {
    try {
      const body = await getJSONBody(req);
      await db.deletePlaylist(body.playlistId);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return true;
  }

  if (reqPath === '/api/db/save-app-state') {
    try {
      const body = await getJSONBody(req);
      await db.saveAppState(body.userId, body.state);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return true;
  }

  if (reqPath === '/api/db/get-app-state') {
    try {
      const userId = urlObj.searchParams.get('userId');
      const state = await db.getAppState(userId);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(state));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify(null));
    }
    return true;
  }

  if (reqPath === '/api/db/recently-played') {
    try {
      const userId = urlObj.searchParams.get('userId');
      const tracks = await db.getRecentlyPlayed(userId);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(tracks));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify([]));
    }
    return true;
  }

  if (reqPath === '/api/db/add-recently-played') {
    try {
      const body = await getJSONBody(req);
      await db.addRecentlyPlayed(body.userId, body.track);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true }));
      
      // Pre-cache top 10 most played/recent tracks in the background
      triggerBackgroundCaching(body.userId);
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return true;
  }

  if (reqPath === '/api/db/remove-recently-played') {
    try {
      const body = await getJSONBody(req);
      await db.removeRecentlyPlayed(body.userId, body.trackId);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return true;
  }

  return false; // Not handled (e.g. not an /api route, so server serves static files)
}

module.exports = {
  handleApiRequest,
  searchYouTubeVideos
};
