const { contextBridge, ipcRenderer } = require('electron');

// Expose safe, selected Electron functions to the frontend
contextBridge.exposeInMainWorld('uniaAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  getWindowState: () => ipcRenderer.sendSync('get-window-state'),
  toggleMiniPlayer: () => ipcRenderer.sendSync('window-toggle-mini'),
  toggleFullscreen: () => ipcRenderer.send('window-toggle-fullscreen'),
  searchYouTube: (query) => ipcRenderer.invoke('window-search-youtube', query),
  searchMusic: (query) => ipcRenderer.invoke('window-search-itunes', query),
  getRecommendations: () => ipcRenderer.invoke('window-get-recommendations'),
  getArtistInfo: (artistName) => ipcRenderer.invoke('window-get-artist-info', artistName),
  getAudioUrl: (videoId) => ipcRenderer.invoke('get-audio-url', videoId),
  getGlobalMedia: () => ipcRenderer.invoke('window-get-global-media'),
  onWindowStateChanged: (callback) => {
    ipcRenderer.removeAllListeners('window-state-changed');
    ipcRenderer.on('window-state-changed', (event, state) => callback(state));
  },
  dbGetUsers: () => ipcRenderer.invoke('db-get-users'),
  dbGetUser: (userId) => ipcRenderer.invoke('db-get-user', userId),
  dbSaveUser: (userObj) => ipcRenderer.invoke('db-save-user', userObj),
  dbUpdateUser: (userId, updates) => ipcRenderer.invoke('db-update-user', userId, updates),
  // Liked tracks
  dbGetLikedTracks: (userId) => ipcRenderer.invoke('db-get-liked-tracks', userId),
  dbAddLikedTrack: (userId, track) => ipcRenderer.invoke('db-add-liked-track', userId, track),
  dbRemoveLikedTrack: (userId, trackId) => ipcRenderer.invoke('db-remove-liked-track', userId, trackId),
  // Playlists
  dbGetPlaylists: (userId) => ipcRenderer.invoke('db-get-playlists', userId),
  dbSavePlaylist: (userId, playlist) => ipcRenderer.invoke('db-save-playlist', userId, playlist),
  dbDeletePlaylist: (playlistId) => ipcRenderer.invoke('db-delete-playlist', playlistId),
  // App state
  dbSaveAppState: (userId, state) => ipcRenderer.invoke('db-save-app-state', userId, state),
  dbGetAppState: (userId) => ipcRenderer.invoke('db-get-app-state', userId),
  dbGetRecentlyPlayed: (userId) => ipcRenderer.invoke('db-get-recently-played', userId),
  dbAddRecentlyPlayed: (userId, track) => ipcRenderer.invoke('db-add-recently-played', userId, track),
  dbRemoveRecentlyPlayed: (userId, trackId) => ipcRenderer.invoke('db-remove-recently-played', userId, trackId),
  rpcUpdatePlayback: (clientId, trackName, artistName, durationMs, progressMs, isPlaying) => ipcRenderer.invoke('rpc-update-playback', clientId, trackName, artistName, durationMs, progressMs, isPlaying),
  rpcClear: () => ipcRenderer.invoke('rpc-clear'),
  captureRegionColor: (rect) => ipcRenderer.invoke('window-capture-region-color', rect)
});
