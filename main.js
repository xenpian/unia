const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const play = require('play-dl');
const Database = require('./db.js');
const { exec } = require('child_process');

const db = new Database();

let mainWindow;
let server;
let serverPort;

const { handleApiRequest, searchYouTubeVideos } = require('./src/api-router.js');

function startLocalServer() {
  const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url, 'http://127.0.0.1');

    // Use shared API router
    const handled = await handleApiRequest(req, res, urlObj);
    if (handled) return;

    let reqPath = decodeURIComponent(urlObj.pathname);
    if (reqPath === '/') reqPath = '/index.html';

    const filePath = path.join(__dirname, reqPath);

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    });
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`\n[SERVER ERROR] Port 3000 is already in use!`);
      if (mainWindow) {
        mainWindow.loadURL(`http://localhost:3000/index.html`);
      }
    } else {
      console.error('Server error:', e);
    }
  });

  server.listen(3000, 'localhost', () => {
    serverPort = 3000;
    console.log(`Unia local server running at http://localhost:${serverPort}`);
    if (mainWindow) {
      mainWindow.loadURL(`http://localhost:${serverPort}/index.html`);
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1580,
    height: 898,

    minHeight: 768,
    minWidth: 769,

    icon: path.join(__dirname, 'logo/unia.ico'),
    title: '42knowledge',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000002',
      height: 64,
      symbolColor: '#ffffff',
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  // Auto-approve microphone/media permission requests in Electron
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'audioCapture') {
      callback(true);
    } else {
      callback(false);
    }
  });

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (permission === 'media' || permission === 'audioCapture') {
      return true;
    }
    return false;
  });

  startLocalServer();
  mainWindow.loadURL(`http://localhost:3000/index.html`);
  mainWindow.webContents.openDevTools();

  // Spoof Origin and Referer for YouTube's internal APIs to bypass Error 150/152
  // We explicitly EXCLUDE /embed/* so the iframe knows its true parent origin and postMessage works.
  const filter = {
    urls: [
      '*://*.youtube.com/youtubei/*',
      '*://*.youtube.com/api/*',
      '*://*.googlevideo.com/*'
    ]
  };
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    details.requestHeaders['Origin'] = 'https://www.youtube.com';
    details.requestHeaders['Referer'] = 'https://www.youtube.com/';
    callback({ requestHeaders: details.requestHeaders });
  });




  // Broadcast maximize/unmaximize states to renderer to change button icons
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-changed', 'maximized');
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-changed', 'restored');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers for Custom Titlebar Controls

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('get-window-state', (event) => {
  if (mainWindow) {
    event.returnValue = mainWindow.isMaximized() ? 'maximized' : 'restored';
  } else {
    event.returnValue = 'restored';
  }
});

let isMiniPlayer = false;
let normalBounds = null;

ipcMain.on('window-toggle-mini', (event) => {
  if (!mainWindow) return;

  if (isMiniPlayer) {
    // Restore normal window
    isMiniPlayer = false;
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(980, 680);
    if (normalBounds) {
      mainWindow.setBounds(normalBounds);
    } else {
      mainWindow.setSize(1280, 800);
      mainWindow.center();
    }
    event.returnValue = false;
  } else {
    // Enter mini player
    isMiniPlayer = true;
    normalBounds = mainWindow.getBounds();
    mainWindow.setMinimumSize(320, 160);
    mainWindow.setSize(340, 180);
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setResizable(false);
    event.returnValue = true;
  }
});

ipcMain.on('window-toggle-fullscreen', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});



ipcMain.handle('window-search-youtube', async (event, query) => {
  const list = await searchYouTubeVideos(query);
  return list.length > 0 ? list[0].videoId : null;
});

ipcMain.handle('window-search-itunes', async (event, query) => {
  try {
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=25`;
    const res = await fetch(url);
    const data = await res.json();

    // Map Deezer schema to iTunes schema for compatibility
    const mappedResults = (data.data || []).map(song => ({
      trackId: song.id.toString(),
      trackName: song.title,
      artistName: song.artist.name,
      artworkUrl100: song.album.cover_xl || song.album.cover_big || song.album.cover_medium,
      trackTimeMillis: song.duration * 1000,
      primaryGenreName: 'Pop',
      previewUrl: song.preview
    }));

    return { results: mappedResults };
  } catch (e) {
    console.error('Deezer API error:', e);
    return { results: [] };
  }
});

// Removed get-audio-url IPC handle because we are streaming via HTTP

ipcMain.handle('window-get-artist-info', async (event, artistName) => {
  try {
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

    return { pictureUrl, bio };
  } catch (e) {
    return { pictureUrl: '', bio: 'Bilgi alınamadı.' };
  }
});

ipcMain.handle('window-get-recommendations', async (event) => {
  try {
    // Deezer Top 50 Turkey chart (playlist id 1116190041 or top chart)
    const url = `https://api.deezer.com/playlist/1116190041/tracks?limit=20`;
    const res = await fetch(url);
    const data = await res.json();

    const mappedResults = (data.data || []).map(song => ({
      trackId: song.id.toString(),
      trackName: song.title,
      artistName: song.artist.name,
      artworkUrl100: song.album.cover_xl || song.album.cover_big || song.album.cover_medium,
      trackTimeMillis: song.duration * 1000,
      primaryGenreName: 'Hits',
      previewUrl: song.preview
    }));

    return { results: mappedResults };
  } catch (e) {
    console.error('Deezer API error:', e);
    return { results: [] };
  }
});

ipcMain.handle('window-capture-region-color', async (event, rect) => {
  if (!mainWindow) return null;
  try {
    const image = await mainWindow.webContents.capturePage({
      x: Math.max(0, Math.floor(rect.x)),
      y: Math.max(0, Math.floor(rect.y)),
      width: Math.max(1, Math.floor(rect.width)),
      height: Math.max(1, Math.floor(rect.height))
    });

    const resized = image.resize({ width: 8, height: 8 });
    const buffer = resized.getBitmap();

    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let i = 0; i < buffer.length; i += 4) {
      // Electron's getBitmap() returns raw pixel data in BGRA format.
      // We map buffer[i] to Blue and buffer[i + 2] to Red.
      bSum += buffer[i];
      gSum += buffer[i + 1];
      rSum += buffer[i + 2];
      count++;
    }

    if (count > 0) {
      return {
        r: Math.floor(rSum / count),
        g: Math.floor(gSum / count),
        b: Math.floor(bSum / count)
      };
    }
  } catch (e) {
    console.error('Failed to capture region color:', e);
  }
  return null;
});



// ==========================================
// DB Handlers (MySQL)
// ==========================================
ipcMain.handle('db-get-users', async () => {
  return db.getUsers();
});

ipcMain.handle('db-get-user', async (event, userId) => {
  return db.getUser(userId);
});

ipcMain.handle('db-save-user', async (event, userObj) => {
  await db.saveUser(userObj);
  return true;
});

ipcMain.handle('db-update-user', async (event, userId, updates) => {
  return db.updateUser(userId, updates);
});

// Liked tracks
ipcMain.handle('db-get-liked-tracks', async (event, userId) => {
  return db.getLikedTracks(userId);
});

ipcMain.handle('db-add-liked-track', async (event, userId, track) => {
  await db.addLikedTrack(userId, track);
  return true;
});

ipcMain.handle('db-remove-liked-track', async (event, userId, trackId) => {
  await db.removeLikedTrack(userId, trackId);
  return true;
});

// Playlists
ipcMain.handle('db-get-playlists', async (event, userId) => {
  return db.getUserPlaylists(userId);
});

ipcMain.handle('db-save-playlist', async (event, userId, playlist) => {
  await db.savePlaylist(userId, playlist);
  return true;
});

ipcMain.handle('db-delete-playlist', async (event, playlistId) => {
  await db.deletePlaylist(playlistId);
  return true;
});

// App state
ipcMain.handle('db-save-app-state', async (event, userId, state) => {
  await db.saveAppState(userId, state);
  return true;
});

ipcMain.handle('db-get-app-state', async (event, userId) => {
  return db.getAppState(userId);
});

ipcMain.handle('db-get-recently-played', async (event, userId) => {
  return db.getRecentlyPlayed(userId);
});

ipcMain.handle('db-add-recently-played', async (event, userId, track) => {
  await db.addRecentlyPlayed(userId, track);
  return true;
});

ipcMain.handle('db-remove-recently-played', async (event, userId, trackId) => {
  await db.removeRecentlyPlayed(userId, trackId);
  return true;
});

// ==========================================
// DISCORD RICH PRESENCE (RPC) INTEGRATION
// ==========================================
const DiscordRPC = require('discord-rpc');

let rpc = null;
let rpcConnected = false;
let rpcClientId = '';
let lastPresence = null;

function initDiscordRPC(clientId) {
  const finalClientId = clientId || '1510411749013061722';
  if (!finalClientId) return;
  if (rpc) return;
  rpcClientId = finalClientId;
  rpc = new DiscordRPC.Client({ transport: 'ipc' });

  rpc.on('ready', () => {
    console.log(`[Discord RPC] Connected successfully with client ID: ${rpcClientId}`);
    rpcConnected = true;
    if (lastPresence) {
      rpc.setActivity(lastPresence).catch(err => {
        console.warn('[Discord RPC] Failed to set activity on ready:', err.message);
      });
    } else {
      updateRPCIdle();
    }
  });

  rpc.on('disconnected', () => {
    console.warn('[Discord RPC] Disconnected from Discord client');
    rpcConnected = false;
    rpc = null;
  });

  try {
    rpc.login({ clientId: rpcClientId }).catch(err => {
      console.warn('[Discord RPC] Login failed:', err.message);
      rpc = null;
      rpcConnected = false;
    });
  } catch (e) {
    console.warn('[Discord RPC] Initialization failed:', e);
    rpc = null;
    rpcConnected = false;
  }
}

function updateRPCPlayback(clientId, trackName, artistName, durationMs, progressMs, isPlaying) {
  const finalClientId = clientId || '1510411749013061722';
  if (!finalClientId) return;

  // Recreate client if the Client ID changes in settings
  if (rpc && rpcClientId !== finalClientId) {
    try {
      rpc.destroy().catch(() => { });
    } catch (e) { }
    rpc = null;
    rpcConnected = false;
  }

  const startTimestamp = Date.now();
  const endTimestamp = startTimestamp + (durationMs - progressMs);

  const presence = {
    details: trackName.substring(0, 127),
    state: `by ${artistName}`.substring(0, 127),
    largeImageKey: 'unia_logo', // Asset key uploaded in Dev Portal
    largeImageText: 'Unia',
    instance: false,
  };

  if (isPlaying) {
    presence.startTimestamp = Math.floor(startTimestamp / 1000);
    presence.endTimestamp = Math.floor(endTimestamp / 1000);
  } else {
    presence.details = `Duraklatıldı: ${trackName}`.substring(0, 127);
  }

  lastPresence = presence;

  if (!rpc || !rpcConnected) {
    initDiscordRPC(finalClientId);
    return;
  }

  try {
    rpc.setActivity(presence).catch(err => {
      console.warn('[Discord RPC] Failed to set activity:', err.message);
    });
  } catch (err) {
    console.warn('[Discord RPC] Error setting activity:', err);
  }
}

function updateRPCIdle() {
  if (!rpc || !rpcConnected) return;

  try {
    rpc.setActivity({
      details: 'Müzik Keşfediyor',
      state: 'Boşta',
      largeImageKey: 'unia_logo',
      largeImageText: 'Unia Desktop Player',
      instance: false,
    }).catch(() => { });
  } catch (err) { }
}

function clearRPC() {
  if (!rpc || !rpcConnected) return;
  try {
    rpc.clearActivity().catch(() => { });
  } catch (err) { }
}

// Register Discord RPC IPC Handlers
ipcMain.handle('rpc-update-playback', async (event, clientId, trackName, artistName, durationMs, progressMs, isPlaying) => {
  updateRPCPlayback(clientId, trackName, artistName, durationMs, progressMs, isPlaying);
  return true;
});

ipcMain.handle('rpc-clear', async (event) => {
  clearRPC();
  return true;
});

ipcMain.handle('window-get-global-media', async () => {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'get_media_info.ps1');
    exec(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, (error, stdout, stderr) => {
      if (error) {
        console.warn('[SMTC] Error running get_media_info.ps1:', error.message);
        resolve({});
        return;
      }
      try {
        const data = JSON.parse(stdout.trim() || '{}');
        resolve(data);
      } catch (e) {
        console.warn('[SMTC] Failed to parse output:', stdout, e.message);
        resolve({});
      }
    });
  });
});

app.whenReady().then(async () => {
  initDiscordRPC();
  try {
    const clientId = await play.getFreeClientID();
    await play.setToken({ soundcloud: { client_id: clientId } });
    console.log('SoundCloud client ID initialized successfully');
  } catch (e) {
    console.error('Failed to init play-dl:', e);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  // Safe quit
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});
