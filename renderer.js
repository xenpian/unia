// ==========================================
// UNIA DESKTOP - MODULAR ENTRY POINT (ORCHESTRATOR)
// ==========================================

// Enable full touch clickability on mobile webviews by disabling app-region dragging
if (window.isAndroidNative || window.AndroidBridge || navigator.userAgent.includes('Android') || (window.location.protocol === 'https:' && window.location.hostname.includes('android'))) {
  document.documentElement.classList.add('android-native');
  document.body.classList.add('android-native');
}

import {
  state,
  loadLikedTracks,
  loadPlaylists,
  savePlaylists,
  saveLastPlayedState
} from './js/state.js';

import {
  localAudio,
  eqFilters,
  initEqualizer,
  getYTPlayer,
  syncPlayStateUI,
  syncDiscordRPC,
  loadAndPlayTrack,
  handlePlayPause,
  handleNext,
  handlePrev,
  seekToPercent,
  syncVolumeSlider,
  getSliderPercent
} from './js/player.js';

import {
  updateDynamicTheme,
  updateDynamicBackground
} from './js/theme.js';

import {
  homeTracks,
  escapeHtml,
  formatTime,
  showToast,
  safeCreateIcons,
  showPage,
  renderProfilePage,
  renderLibrarySidebar,
  renderMainGrid,
  updateBillboardBanner,
  revealPlayerUI,
  updatePlayerUI,
  renderQueueList,
  loadLyricsOverlay,
  updateLyricsHighlighting,
  updateTodayRecommendationVisibility,
  loadRecommendedTracks,
  renderHomeGridFiltered
} from './js/ui-renderers.js';

// ==========================================
// BROWSER POLYFILL FOR LOCAL/STANDALONE RUNS
// ==========================================
if (!window.uniaAPI) {
  const isMobile = window.isAndroidNative || window.AndroidBridge || navigator.userAgent.includes('Android') || (window.location.protocol === 'https:' && window.location.hostname.includes('android'));
  
  if (isMobile) {
    console.log('[Polyfill] Mobile environment detected, defining direct zero-dependency Mobile Polyfill...');
    
    // Core CORS-free native fetch engine
    const safeFetchJson = async (url) => {
      if (window.AndroidBridge && typeof window.AndroidBridge.fetchUrl === 'function') {
        try {
          console.log('[NativeFetch] Fetching via AndroidBridge:', url);
          const raw = window.AndroidBridge.fetchUrl(url);
          if (raw) {
            return JSON.parse(raw);
          }
        } catch(e) {
          console.error('[NativeFetch] Native fetch failed, falling back:', e);
        }
      }
      const res = await fetch(url);
      return await res.json();
    };

    window.uniaAPI = {
      minimize: () => {},
      maximize: () => {},
      close: () => {},
      getWindowState: () => 'restored',
      toggleMiniPlayer: () => false,
      toggleFullscreen: () => {},
      onWindowStateChanged: () => {},
 
      searchYouTube: async (query) => {
        try {
          const pipedInstances = [
            "https://pipedapi.privacydev.net",
            "https://pipedapi.adminforge.de",
            "https://pipedapi.colby.land",
            "https://pipedapi.tokhmi.xyz",
            "https://pipedapi.kavin.rocks",
            "https://piped-api.garudalinux.org",
            "https://api.piped.yt"
          ];
          
          let data = null;
          for (const inst of pipedInstances) {
            try {
              const url = `${inst}/search?q=${encodeURIComponent(query)}&filter=all`;
              data = await safeFetchJson(url);
              if (data && data.items) break;
            } catch(e) {}
          }
          
          if (data && data.items) {
            const videos = data.items
              .filter(item => item.type === 'stream')
              .map(item => ({
                id: item.url.split('v=')[1] || item.url.split('/').pop(),
                title: item.title,
                duration: item.duration,
                uploaded: item.uploadedDate || '',
                views: item.views || 0,
                uploader: item.uploaderName || ''
              }));
            if (videos.length > 0) return { videos };
          }
          
          // Fallback to Invidious search
          console.log('[MobileResolve] Piped search failed or empty, trying Invidious instances...');
          const invidiousInstances = [
            "https://yewtu.be",
            "https://invidious.projectsegfau.lt",
            "https://invidious.privacydev.net",
            "https://invidious.flokinet.to"
          ];
          
          for (const inst of invidiousInstances) {
            try {
              const url = `${inst}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
              const invData = await safeFetchJson(url);
              if (invData && Array.isArray(invData) && invData.length > 0) {
                const videos = invData.map(item => ({
                  id: item.videoId,
                  title: item.title,
                  duration: item.lengthSeconds,
                  uploaded: item.publishedText || '',
                  views: item.viewCount || 0,
                  uploader: item.author || ''
                }));
                if (videos.length > 0) return { videos };
              }
            } catch(e) {}
          }
        } catch (e) {
          console.error('Mobile polyfill searchYouTube failed:', e);
        }
        return { videos: [] };
      },
 
      searchMusic: async (query) => {
        try {
          const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}`;
          const data = await safeFetchJson(url);
          if (data && data.data) {
            const results = data.data.map(item => ({
              trackId: String(item.id),
              trackName: item.title,
              artistName: item.artist.name,
              artworkUrl100: item.album.cover_medium || item.album.cover || '',
              trackTimeMillis: item.duration * 1000,
              primaryGenreName: 'Pop',
              previewUrl: item.preview || '',
              videoId: ''
            }));
            return { results };
          }
        } catch (e) {
          console.error('Mobile polyfill searchMusic failed:', e);
        }
        return { results: [] };
      },
 
      getRecommendations: async () => {
        try {
          const url = `https://api.deezer.com/chart`;
          const data = await safeFetchJson(url);
          if (data && data.tracks && data.tracks.data) {
            const results = data.tracks.data.map(item => ({
              trackId: String(item.id),
              trackName: item.title,
              artistName: item.artist.name,
              artworkUrl100: item.album.cover_medium || item.album.cover || '',
              trackTimeMillis: item.duration * 1000,
              primaryGenreName: 'Pop',
              previewUrl: item.preview || '',
              videoId: ''
            }));
            return { results };
          }
        } catch (e) {
          console.error('Mobile polyfill getRecommendations failed:', e);
        }
        return { results: [] };
      },
 
      getGlobalMedia: async () => {
        return {};
      },
 
      getArtistInfo: async (artistName) => {
        try {
          const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}`;
          const data = await safeFetchJson(url);
          if (data && data.data && data.data.length > 0) {
            return {
              pictureUrl: data.data[0].picture_medium || data.data[0].picture || '',
              bio: `${artistName} popüler bir sanatçıdır.`
            };
          }
        } catch (e) {}
        return { pictureUrl: '', bio: '' };
      },
 
      getAudioUrl: async (videoId) => {
        return '';
      },

      dbGetUsers: async () => [ { id: 'unia_local_user', username: 'Misafir', email: 'misafir@unia.fm' } ],
      dbGetUser: async (userId) => ({ id: 'unia_local_user', username: 'Misafir', email: 'misafir@unia.fm' }),
      dbSaveUser: async (userObj) => null,
      dbUpdateUser: async (userId, updates) => null,

      dbGetLikedTracks: async (userId) => {
        try {
          return JSON.parse(localStorage.getItem('unia_liked_tracks') || '[]');
        } catch (e) { return []; }
      },
      dbAddLikedTrack: async (userId, track) => {
        try {
          let liked = JSON.parse(localStorage.getItem('unia_liked_tracks') || '[]');
          if (!liked.some(t => String(t.trackId) === String(track.trackId))) {
            liked.unshift(track);
            localStorage.setItem('unia_liked_tracks', JSON.stringify(liked));
          }
        } catch (e) {}
        return { success: true };
      },
      dbRemoveLikedTrack: async (userId, trackId) => {
        try {
          let liked = JSON.parse(localStorage.getItem('unia_liked_tracks') || '[]');
          liked = liked.filter(t => String(t.trackId) !== String(trackId));
          localStorage.setItem('unia_liked_tracks', JSON.stringify(liked));
        } catch (e) {}
        return { success: true };
      },

      dbGetPlaylists: async (userId) => {
        try {
          return JSON.parse(localStorage.getItem('unia_custom_playlists') || '[]');
        } catch (e) { return []; }
      },
      dbSavePlaylist: async (userId, playlist) => {
        try {
          let lists = JSON.parse(localStorage.getItem('unia_custom_playlists') || '[]');
          const idx = lists.findIndex(p => String(p.id) === String(playlist.id));
          if (idx > -1) {
            lists[idx] = playlist;
          } else {
            lists.push(playlist);
          }
          localStorage.setItem('unia_custom_playlists', JSON.stringify(lists));
        } catch (e) {}
        return { success: true };
      },
      dbDeletePlaylist: async (playlistId) => {
        try {
          let lists = JSON.parse(localStorage.getItem('unia_custom_playlists') || '[]');
          lists = lists.filter(p => String(p.id) !== String(playlistId));
          localStorage.setItem('unia_custom_playlists', JSON.stringify(lists));
        } catch (e) {}
        return { success: true };
      },

      dbSaveAppState: async (userId, state) => {
        try {
          localStorage.setItem('unia_app_state', JSON.stringify(state));
        } catch (e) {}
        return { success: true };
      },
      dbGetAppState: async (userId) => {
        try {
          return JSON.parse(localStorage.getItem('unia_app_state') || 'null');
        } catch (e) { return null; }
      },

      dbGetRecentlyPlayed: async (userId) => {
        if (window.AndroidBridge && window.AndroidBridge.getRecentlyPlayed) {
          try {
            const res = window.AndroidBridge.getRecentlyPlayed();
            if (res) return JSON.parse(res);
          } catch(e) {}
        }
        try {
          return JSON.parse(localStorage.getItem('unia_recently_played') || '[]');
        } catch (e) { return []; }
      },
      dbAddRecentlyPlayed: async (userId, track) => {
        if (window.AndroidBridge && window.AndroidBridge.addRecentlyPlayed) {
          try {
            window.AndroidBridge.addRecentlyPlayed(JSON.stringify(track));
          } catch(e) {}
        }
        try {
          let recents = JSON.parse(localStorage.getItem('unia_recently_played') || '[]');
          recents = recents.filter(t => String(t.trackId) !== String(track.trackId));
          recents.unshift(track);
          if (recents.length > 20) recents.pop();
          localStorage.setItem('unia_recently_played', JSON.stringify(recents));
        } catch(e) {}
        return { success: true };
      },
      dbRemoveRecentlyPlayed: async (userId, trackId) => {
        if (window.AndroidBridge && window.AndroidBridge.removeRecentlyPlayed) {
          try {
            window.AndroidBridge.removeRecentlyPlayed(trackId);
          } catch(e) {}
        }
        try {
          let recents = JSON.parse(localStorage.getItem('unia_recently_played') || '[]');
          recents = recents.filter(t => String(t.trackId) !== String(trackId));
          localStorage.setItem('unia_recently_played', JSON.stringify(recents));
        } catch(e) {}
        return { success: true };
      }
    };
  } else {
    console.log('[Polyfill] Electron APIs not found, defining Browser-HTTP uniaAPI Polyfill...');
    window.uniaAPI = {
      minimize: () => { console.log('[Mock] minimize'); },
      maximize: () => { console.log('[Mock] maximize'); },
      close: () => { console.log('[Mock] close'); },
      getWindowState: () => 'restored',
      toggleMiniPlayer: () => false,
      toggleFullscreen: () => { console.log('[Mock] toggleFullscreen'); },
      onWindowStateChanged: () => { },

      searchYouTube: async (query) => {
        try {
          const res = await fetch(`http://localhost:3000/api/search-youtube?q=${encodeURIComponent(query)}`);
          return await res.json();
        } catch (e) {
          console.error('Polyfill searchYouTube failed:', e);
          return null;
        }
      },
      searchMusic: async (query) => {
        try {
          const res = await fetch(`http://localhost:3000/api/search-music?q=${encodeURIComponent(query)}`);
          return await res.json();
        } catch (e) {
          console.error('Polyfill searchMusic failed:', e);
          return { results: [] };
        }
      },
      getRecommendations: async () => {
        try {
          const res = await fetch(`http://localhost:3000/api/recommendations`);
          return await res.json();
        } catch (e) {
          console.error('Polyfill getRecommendations failed:', e);
          return { results: [] };
        }
      },
      getGlobalMedia: async () => {
        try {
          const res = await fetch(`http://localhost:3000/api/global-media`);
          return await res.json();
        } catch (e) {
          console.error('Polyfill getGlobalMedia failed:', e);
          return {};
        }
      },
      getArtistInfo: async (artistName) => {
        try {
          const res = await fetch(`http://localhost:3000/api/artist-info?name=${encodeURIComponent(artistName)}`);
          return await res.json();
        } catch (e) {
          console.error('Polyfill getArtistInfo failed:', e);
          return { pictureUrl: '', bio: '' };
        }
      },
      getAudioUrl: async (videoId) => {
        return `http://localhost:3000/api/audio?id=${videoId}`;
      },

      dbGetUsers: async () => {
        try {
          const res = await fetch(`http://localhost:3000/api/db/users`);
          return await res.json();
        } catch (e) {
          console.error('Polyfill dbGetUsers failed:', e);
          return [];
        }
      },
      dbGetUser: async (userId) => {
        try {
          const res = await fetch(`http://localhost:3000/api/db/user?userId=${userId}`);
          return await res.json();
        } catch (e) {
          console.error('Polyfill dbGetUser failed:', e);
          return null;
        }
      },
      dbSaveUser: async (userObj) => {
        try {
          const res = await fetch(`http://localhost:3000/api/db/save-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userObj })
          });
          return await res.json();
        } catch (e) {
          console.error('Polyfill dbSaveUser failed:', e);
          return null;
        }
      },
      dbUpdateUser: async (userId, updates) => {
        try {
          const res = await fetch(`http://localhost:3000/api/db/update-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, updates })
          });
          return await res.json();
        } catch (e) {
          console.error('Polyfill dbUpdateUser failed:', e);
          return null;
        }
      },
      dbGetLikedTracks: async (userId) => {
        try {
          const res = await fetch(`http://localhost:3000/api/db/liked-tracks?userId=${userId}`);
          return await res.json();
        } catch (e) {
          console.error('Polyfill dbGetLikedTracks failed:', e);
          return [];
        }
      },
      dbAddLikedTrack: async (userId, track) => {
        try {
          const res = await fetch(`http://localhost:3000/api/db/add-liked-track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, track })
          });
          return await res.json();
        } catch (e) {
          console.error('Polyfill dbAddLikedTrack failed:', e);
          return null;
        }
      },
      dbRemoveLikedTrack: async (userId, trackId) => {
        try {
          const res = await fetch(`http://localhost:3000/api/db/remove-liked-track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, trackId })
          });
          return await res.json();
        } catch (e) {
          console.error('Polyfill dbRemoveLikedTrack failed:', e);
          return null;
        }
      },
      dbGetPlaylists: async (userId) => {
        try {
          const res = await fetch(`http://localhost:3000/api/db/playlists?userId=${userId}`);
          return await res.json();
        } catch (e) {
          console.error('Polyfill dbGetPlaylists failed:', e);
          return [];
        }
      },
      dbSavePlaylist: async (userId, playlist) => {
        try {
          const res = await fetch(`http://localhost:3000/api/db/save-playlist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, playlist })
          });
          return await res.json();
        } catch (e) {
          console.error('Polyfill dbSavePlaylist failed:', e);
          return null;
        }
      },
      dbDeletePlaylist: async (playlistId) => {
        try {
          const res = await fetch(`http://localhost:3000/api/db/delete-playlist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlistId })
          });
          return await res.json();
        } catch (e) {
          console.error('Polyfill dbDeletePlaylist failed:', e);
          return null;
        }
      },
      dbSaveAppState: async (userId, state) => {
        try {
          const res = await fetch(`http://localhost:3000/api/db/save-app-state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, state })
          });
          return await res.json();
        } catch (e) {
          console.error('Polyfill dbSaveAppState failed:', e);
          return null;
        }
      },
      dbGetAppState: async (userId) => {
        try {
          const res = await fetch(`http://localhost:3000/api/db/get-app-state?userId=${userId}`);
          return await res.json();
        } catch (e) {
          console.error('Polyfill dbGetAppState failed:', e);
          return null;
        }
      },
      dbGetRecentlyPlayed: async (userId) => {
        try {
          const res = await fetch(`http://localhost:3000/api/db/recently-played?userId=${userId}`);
          return await res.json();
        } catch (e) {
          console.error('Polyfill dbGetRecentlyPlayed failed:', e);
          return [];
        }
      },
      dbAddRecentlyPlayed: async (userId, track) => {
        try {
          const res = await fetch(`http://localhost:3000/api/db/add-recently-played`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, track })
          });
          return await res.json();
        } catch (e) {
          console.error('Polyfill dbAddRecentlyPlayed failed:', e);
          return null;
        }
      },
      dbRemoveRecentlyPlayed: async (userId, trackId) => {
        try {
          const res = await fetch(`http://localhost:3000/api/db/remove-recently-played`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, trackId })
          });
          return await res.json();
        } catch (e) {
          console.error('Polyfill dbRemoveRecentlyPlayed failed:', e);
          return null;
        }
      }
    };
  }
}

// ==========================================
// CORE DOM ELEMENTS
// ==========================================
const playBtn = document.getElementById('ctrl-play');
const prevBtn = document.getElementById('ctrl-prev');
const nextBtn = document.getElementById('ctrl-next');
const shuffleBtn = document.getElementById('ctrl-shuffle');
const repeatBtn = document.getElementById('ctrl-repeat');
const timelineSliderBox = document.getElementById('timeline-slider-box') || document.getElementById('timeline-slider');
const volumeSliderBox = document.getElementById('volume-slider-box') || document.getElementById('volume-slider');
const volumeIconBtn = document.getElementById('volume-icon-btn') || document.getElementById('volume-icon');
const lyricsOverlay = document.getElementById('lyrics-overlay');
const closeLyricsBtn = document.getElementById('close-lyrics-btn');
const lyricsBody = document.getElementById('lyrics-body');
const rightQueueContent = document.getElementById('right-queue-content');
const rightDetailsContent = document.getElementById('right-details-content');
const queueNowPlaying = document.getElementById('queue-now-playing');
const queueListItems = document.getElementById('queue-list-items');
const closeQueueBtn = document.getElementById('close-queue-btn');
const devicesPopup = document.getElementById('devices-popup');
const searchInput = document.getElementById('search-input');
const utilLyricsBtn = document.getElementById('util-lyrics');
const utilQueueBtn = document.getElementById('util-queue');
const utilDeviceBtn = document.getElementById('util-device');
const utilPipBtn = document.getElementById('util-pip');
const utilFullscreenBtn = document.getElementById('util-fullscreen');

// ==========================================
// INTERACTIVE ENGINE STATE
// ==========================================
let isDraggingTimeline = false;
let isDraggingVolume = false;
let searchDebounce = null;
let contextMenuTargetTrack = null;
const suggestionsDropdown = document.getElementById('search-suggestions-dropdown');
const suggestionsList = document.getElementById('search-suggestions-list');

// ==========================================
// DYNAMIC NAVIGATION SYSTEM (WITH BACK/FORWARD SENSING)
// ==========================================
function navigateToPage(pageName, data) {
  if (state.navigationIndex < state.navigationHistory.length - 1) {
    state.navigationHistory = state.navigationHistory.slice(0, state.navigationIndex + 1);
  }
  state.navigationHistory.push({ pageName, data });
  state.navigationIndex = state.navigationHistory.length - 1;

  updateNavButtons();
  showPage(pageName, data);
}

function updateNavButtons() {
  const navBack = document.getElementById('nav-back');
  const navForward = document.getElementById('nav-forward');
  if (navBack) {
    const isDisable = state.navigationIndex <= 0;
    navBack.disabled = isDisable;
    navBack.classList.toggle('disabled', isDisable);
  }
  if (navForward) {
    const isDisable = state.navigationIndex >= state.navigationHistory.length - 1;
    navForward.disabled = isDisable;
    navForward.classList.toggle('disabled', isDisable);
  }
}

function handleNavBack() {
  if (state.navigationIndex > 0) {
    state.navigationIndex--;
    const s = state.navigationHistory[state.navigationIndex];
    showPage(s.pageName, s.data);
    updateNavButtons();
  }
}

function handleNavForward() {
  if (state.navigationIndex < state.navigationHistory.length - 1) {
    state.navigationIndex++;
    const s = state.navigationHistory[state.navigationIndex];
    showPage(s.pageName, s.data);
    updateNavButtons();
  }
}

// ==========================================
// AUDIO EQUALIZER PRESETS & INPUTS
// ==========================================
const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0],
  bass: [6, 4, 0, -2, -4],
  vocal: [-4, -2, 2, 5, 1],
  pop: [3, 2, 0, -1, -2],
  electronic: [5, 1, -1, 3, 5]
};

// ==========================================
// DYNAMIC HEART & LIKED SONGS ENGINE
// ==========================================
function toggleLikeTrack(track) {
  const idx = state.likedTracks.findIndex(t => t.trackId === track.trackId);
  if (idx > -1) {
    state.likedTracks.splice(idx, 1);
    if (state.currentUser && window.uniaAPI?.dbRemoveLikedTrack) {
      window.uniaAPI.dbRemoveLikedTrack(state.currentUser.id, track.trackId).catch(() => { });
    }
  } else {
    state.likedTracks.push(track);
    if (state.currentUser && window.uniaAPI?.dbAddLikedTrack) {
      window.uniaAPI.dbAddLikedTrack(state.currentUser.id, track).catch(() => { });
    }
  }
  localStorage.setItem('unia_liked_tracks', JSON.stringify(state.likedTracks));

  const isLiked = state.likedTracks.some(t => t.trackId === track.trackId);
  updateLikeButtons(isLiked);
  renderLibrarySidebar();
}

function updateLikeButtons(liked) {
  const likeBtn = document.getElementById('playbar-like');
  const rightBtn = document.getElementById('right-like-btn');

  if (likeBtn) {
    const heartEmpty = likeBtn.querySelector('.heart-empty');
    const heartFilled = likeBtn.querySelector('.heart-filled');
    if (heartEmpty && heartFilled) {
      heartEmpty.classList.toggle('hidden', liked);
      heartFilled.classList.toggle('hidden', !liked);
    }
    likeBtn.classList.toggle('active', liked);
  }

  if (rightBtn) rightBtn.classList.toggle('check-active', liked);
}

// ==========================================
// CORE SEARCH ENGINE
// ==========================================
async function searchMusic(query) {
  if (!query) {
    const holder = document.getElementById('page-content-holder');
    if (holder && holder.dataset.currentPage === 'search') {
      renderMainGrid([]);
      updateTodayRecommendationVisibility();
      return;
    }
    showPage('home');
    loadRecommendedTracks();
    return;
  }
  const holder = document.getElementById('page-content-holder');
  if (holder && holder.dataset.currentPage && holder.dataset.currentPage !== 'home' && holder.dataset.currentPage !== 'search') {
    await showPage('home');
  }
  try {
    const data = await window.uniaAPI.searchMusic(query);
    const tracks = data ? (data.results || []) : [];
    state.currentTrackList = tracks;
    renderMainGrid(tracks);
    if (state.currentTrackIndex === -1) {
      updateBillboardBanner();
    }

    const contentCenter = document.querySelector('.content-center');
    if (contentCenter) {
      contentCenter.scrollTop = 0;
    }

    updateTodayRecommendationVisibility();
  } catch (e) {
    console.error('Search failed', e);
  }
}

// ==========================================
// REMOVE FROM RECENTS ACTIONS
// ==========================================
async function removeFromRecentlyPlayed(track) {
  const trackId = String(track.trackId);

  // 1. Remove from local memory state
  const rIdx = homeTracks.findIndex(t => String(t.trackId) === trackId);
  if (rIdx > -1) homeTracks.splice(rIdx, 1);

  // 2. Remove from local storage / mobile persistent storage
  try {
    if (window.isAndroidNative || window.AndroidBridge) {
      if (window.AndroidBridge && window.AndroidBridge.removeRecentlyPlayed) {
        window.AndroidBridge.removeRecentlyPlayed(trackId);
      }
    }
    let localRecent = JSON.parse(localStorage.getItem('unia_recently_played') || '[]');
    localRecent = localRecent.filter(t => String(t.trackId) !== trackId);
    localStorage.setItem('unia_recently_played', JSON.stringify(localRecent));
  } catch (e) {
    console.warn('Failed to remove recently played from local storage:', e);
  }

  // 3. Remove from database if logged in
  if (state.currentUser && window.uniaAPI?.dbRemoveRecentlyPlayed) {
    try {
      await window.uniaAPI.dbRemoveRecentlyPlayed(state.currentUser.id, trackId);
    } catch (e) {
      console.warn('Failed to remove recently played from DB:', e);
    }
  }

  // 4. Update the home page feed in real-time
  await loadRecommendedTracks();
  showToast('Şarkı son dinlenenlerden kaldırıldı.');
}

// ==========================================
// USER AUTH SYSTEM
// ==========================================
async function initAuth() {
  const authModal = document.getElementById('auth-modal');
  if (authModal) {
    authModal.classList.add('hidden');
    authModal.style.display = 'none';
  }

  try {
    state.users = await window.uniaAPI.dbGetUsers();
  } catch (e) {
    state.users = [];
  }

  let localUser = state.users.find(u => u.id === 'unia_local_user');
  if (!localUser) {
    localUser = {
      id: 'unia_local_user',
      username: 'Misafir',
      email: 'misafir@unia.fm',
      password: 'localpassword',
      profilePhotoUrl: null
    };
    if (window.uniaAPI?.dbSaveUser) {
      await window.uniaAPI.dbSaveUser(localUser);
    }
    state.users.push(localUser);
  }

  state.currentUser = localUser;
  localStorage.setItem('unia_current_user_id', 'unia_local_user');

  loadLikedTracks();
  loadPlaylists();
  updateProfileBtn();

  try { loadRecommendedTracks(); } catch (e) {}
  try { loadTodayRecommendations(); } catch (e) {}
  try { loadSonCalinanlarSlider(); } catch (e) {}
  try { loadSonZiyaretEdilenlerSlider(); } catch (e) {}
  try { loadMadeForYouSlider(); } catch (e) {}
}

function updateProfileBtn() {
  const profileBtn = document.getElementById('profile-btn');
  if (profileBtn) {
    if (state.currentUser) {
      if (state.currentUser.profilePhotoUrl) {
        profileBtn.innerHTML = `<img src="${state.currentUser.profilePhotoUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
      } else {
        profileBtn.innerHTML = `<span>${state.currentUser.username.charAt(0).toUpperCase()}</span>`;
      }
    } else {
      profileBtn.innerHTML = `<i class="fa-solid fa-user" style="font-size: 14px; color: var(--text-muted);"></i>`;
    }
  }
}

async function logoutUser() {
  if (window.uniaAPI && window.uniaAPI.rpcClear) {
    window.uniaAPI.rpcClear().catch(() => { });
  }
  const ytPlayer = getYTPlayer();
  if (ytPlayer) {
    try {
      if (ytPlayer.stopVideo) ytPlayer.stopVideo();
      if (ytPlayer.pauseVideo) ytPlayer.pauseVideo();
    } catch (e) { }
  }
  localAudio.pause();
  localAudio.src = '';

  state.isPlaying = false;
  syncPlayStateUI();

  const playbarName = document.getElementById('playbar-name');
  const playbarArtist = document.getElementById('playbar-artist');
  const playbarCover = document.getElementById('playbar-cover');
  const timeDurationLabel = document.getElementById('time-duration');
  const timeElapsedLabel = document.getElementById('time-elapsed');
  const timelineFill = document.getElementById('timeline-fill');
  const timelineThumb = document.getElementById('timeline-thumb');

  if (playbarName) playbarName.textContent = '—';
  if (playbarArtist) playbarArtist.textContent = '—';
  if (playbarCover) playbarCover.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  if (timeDurationLabel) timeDurationLabel.textContent = '0:00';
  if (timeElapsedLabel) timeElapsedLabel.textContent = '0:00';
  if (timelineFill) timelineFill.style.width = '0%';
  if (timelineThumb) timelineThumb.style.left = '0%';

  state.currentUser = null;
  localStorage.removeItem('unia_current_user_id');
  localStorage.removeItem('unia_last_played_track');
  localStorage.removeItem('unia_last_played_list');
  localStorage.removeItem('unia_last_played_index');
  localStorage.removeItem('unia_last_played_time');
  localStorage.removeItem('unia_recently_played');
  localStorage.removeItem('unia_liked_tracks');
  localStorage.removeItem('unia_custom_playlists');

  if (window.isAndroidNative || window.AndroidBridge) {
    if (window.AndroidBridge && window.AndroidBridge.clearRecentlyPlayed) {
      window.AndroidBridge.clearRecentlyPlayed();
    }
  }

  state.likedTracks = [];
  state.playlists = [];
  state.currentTrackList = [];
  state.currentTrackIndex = -1;
  homeTracks.length = 0;

  state.hasStartedPlaying = false;
  const bannerGraphic = document.querySelector('.banner-graphic');
  if (bannerGraphic) {
    bannerGraphic.classList.add('hidden');
  }
  const bannerOverlay = document.querySelector('.banner-overlay');
  if (bannerOverlay) {
    bannerOverlay.classList.remove('video-playing');
  }
  updateProfileBtn();
  renderLibrarySidebar();
  renderMainGrid([]);
  updateBillboardBanner();

  const containerToday = document.getElementById('today-rec-container');
  if (containerToday) containerToday.innerHTML = '';
  const containerRecent = document.getElementById('son-calinanlar-container');
  if (containerRecent) containerRecent.innerHTML = '';
  const containerMade = document.getElementById('made-for-you-container');
  if (containerMade) containerMade.innerHTML = '';

  const rpSection = document.getElementById('recently-played-section');
  if (rpSection) rpSection.classList.add('hidden');

  showPage('home');
  showToast('Oturum sıfırlandı.');

  await initAuth();
}

// ==========================================
// ANCESTRAL MODAL MANAGEMENT (FOLLOWERS / FOLLOWING)
// ==========================================
async function openFollowedArtistsModal() {
  const modal = document.getElementById('followed-artists-modal');
  const listContainer = document.getElementById('followed-artists-list');
  if (!modal || !listContainer) return;

  modal.style.display = 'flex';
  modal.classList.remove('hidden');

  listContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px 0;"><i class="fa-solid fa-circle-notch fa-spin" style="margin-right:8px;"></i>Yükleniyor...</div>';

  const followedKey = state.currentUser ? `unia_followed_artists_${state.currentUser.id}` : 'unia_followed_artists_guest';
  const followed = JSON.parse(localStorage.getItem(followedKey) || '[]');

  if (followed.length === 0) {
    listContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:32px 0;">Henüz hiç sanatçı takip etmiyorsunuz.</div>';
    return;
  }

  try {
    const artistPromises = followed.map(async (artistName) => {
      let photoUrl = '';
      if (window.uniaAPI?.getArtistInfo) {
        try {
          const info = await window.uniaAPI.getArtistInfo(artistName);
          if (info && info.pictureUrl) {
            photoUrl = info.pictureUrl;
          }
        } catch (e) {
          console.warn('Failed to fetch artist info for modal:', artistName, e);
        }
      }
      return { name: artistName, photoUrl };
    });

    const artistsData = await Promise.all(artistPromises);

    listContainer.innerHTML = '';
    artistsData.forEach(artist => {
      const item = document.createElement('div');
      item.style = 'display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-radius:8px; background:rgba(255,255,255,0.03); transition:background 0.2s;';
      item.className = 'followed-artist-item';

      const imgHTML = artist.photoUrl
        ? `<img src="${artist.photoUrl}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;" />`
        : `<div style="width:40px; height:40px; border-radius:50%; background:rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:center; color:var(--text-muted);"><i class="fa-solid fa-user"></i></div>`;

      item.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; cursor:pointer; flex:1;" class="artist-click-area">
          ${imgHTML}
          <span style="font-weight:600; color:var(--text-main); font-size:14px;">${escapeHtml(artist.name)}</span>
        </div>
        <button class="unfollow-btn" style="background:transparent; border:1px solid var(--border-light); border-radius:20px; padding:6px 14px; font-size:12px; font-weight:700; color:var(--text-main); cursor:pointer; transition:all 0.2s;">Takipten Çık</button>
      `;

      item.querySelector('.artist-click-area').onclick = () => {
        modal.style.display = 'none';
        modal.classList.add('hidden');
        if (searchInput) {
          searchInput.value = artist.name;
          navigateToPage('home');
          searchMusic(artist.name);
        }
      };

      const unfollowBtn = item.querySelector('.unfollow-btn');
      unfollowBtn.onmouseover = () => {
        unfollowBtn.style.borderColor = 'var(--primary-accent)';
        unfollowBtn.style.color = 'var(--primary-accent)';
      };
      unfollowBtn.onmouseout = () => {
        unfollowBtn.style.borderColor = 'var(--border-light)';
        unfollowBtn.style.color = 'var(--text-main)';
      };

      unfollowBtn.onclick = (e) => {
        e.stopPropagation();
        unfollowArtist(artist.name);
        openFollowedArtistsModal();

        const currentActivePage = document.querySelector('.page-content:not(.hidden)');
        if (currentActivePage && currentActivePage.id === 'profile-page-container') {
          renderProfilePage(currentActivePage);
        }
      };

      listContainer.appendChild(item);
    });

  } catch (err) {
    console.error('Failed to render followed artists:', err);
    listContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:32px 0;">Sanatçılar yüklenirken bir hata oluştu.</div>';
  }
}

function unfollowArtist(artistName) {
  const followedKey = state.currentUser ? `unia_followed_artists_${state.currentUser.id}` : 'unia_followed_artists_guest';
  let followed = JSON.parse(localStorage.getItem(followedKey) || '[]');
  followed = followed.filter(name => name !== artistName);
  localStorage.setItem(followedKey, JSON.stringify(followed));

  if (state.currentUser && window.uniaAPI?.dbUpdateUser) {
    window.uniaAPI.dbUpdateUser(state.currentUser.id, { followedArtists: followed }).catch(() => { });
  }

  if (state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex]) {
    const activeTrack = state.currentTrackList[state.currentTrackIndex];
    if (activeTrack.artistName === artistName) {
      const followBtn = document.querySelector('.about-artist-box .btn');
      if (followBtn) {
        followBtn.textContent = 'Takip Et';
        followBtn.classList.remove('btn-outline');
        followBtn.classList.add('btn-primary');
      }
    }
  }

  showToast(`${artistName} takibi bırakıldı.`);
}

async function openFollowersModal() {
  const modal = document.getElementById('followers-modal');
  const listContainer = document.getElementById('followers-list');
  if (!modal || !listContainer) return;

  modal.style.display = 'flex';
  modal.classList.remove('hidden');

  listContainer.innerHTML = '';

  const followersKey = state.currentUser ? `unia_followers_${state.currentUser.id}` : 'unia_followers_guest';
  let followers = [];
  try {
    followers = JSON.parse(localStorage.getItem(followersKey) || '[]');
  } catch (e) {
    followers = [];
  }

  if (followers.length === 0) {
    listContainer.innerHTML = `<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px;">Takipçiniz bulunmuyor.</div>`;
    return;
  }

  followers.forEach((follower, idx) => {
    const item = document.createElement('div');
    item.style = 'display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-radius:8px; background:rgba(255,255,255,0.03); transition:background 0.2s;';
    item.className = 'follower-item';

    const avatar = follower.avatar || (follower.name ? follower.name.charAt(0).toUpperCase() : '?');
    const avatarHTML = `<div style="width:40px; height:40px; border-radius:50%; background:linear-gradient(135deg, #00ccff, #09090b); display:flex; align-items:center; justify-content:center; font-weight:700; color:#000; font-size:15px;">${avatar}</div>`;

    item.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px; cursor:pointer; flex:1;" class="follower-click-area">
        ${avatarHTML}
        <div style="display:flex; flex-direction:column;">
          <span style="font-weight:600; color:var(--text-main); font-size:14px;">${escapeHtml(follower.name)}</span>
          <span style="font-size:11px; color:var(--text-muted);">@${escapeHtml(follower.username)}</span>
        </div>
      </div>
      <button class="remove-follower-btn" style="background:transparent; border:1px solid var(--border-light); border-radius:20px; padding:6px 14px; font-size:12px; font-weight:700; color:var(--text-main); cursor:pointer; transition:all 0.2s;">Kaldır</button>
    `;

    item.querySelector('.follower-click-area').onclick = () => {
      modal.style.display = 'none';
      modal.classList.add('hidden');
      if (searchInput) {
        searchInput.value = follower.name;
        navigateToPage('home');
        searchMusic(follower.name);
      }
    };

    const removeBtn = item.querySelector('.remove-follower-btn');
    removeBtn.onmouseover = () => {
      removeBtn.style.borderColor = 'rgba(255, 0, 0, 0.4)';
      removeBtn.style.color = '#ff4d4d';
    };
    removeBtn.onmouseout = () => {
      removeBtn.style.borderColor = 'var(--border-light)';
      removeBtn.style.color = 'var(--text-main)';
    };

    removeBtn.onclick = (e) => {
      e.stopPropagation();
      item.remove();
      showToast(`${follower.name} takipçilerinizden kaldırıldı.`);

      try {
        followers = followers.filter((_, i) => i !== idx);
        localStorage.setItem(followersKey, JSON.stringify(followers));

        const countSpan = document.getElementById('profile-followers-btn');
        if (countSpan) {
          countSpan.textContent = `${followers.length} Takipçi`;
        }

        if (state.currentUser) {
          state.currentUser.followers = followers.length;
          if (window.uniaAPI?.dbSaveUser) {
            window.uniaAPI.dbSaveUser(state.currentUser).catch(() => { });
          }
        }

        if (followers.length === 0) {
          listContainer.innerHTML = `<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px;">Takipçiniz bulunmuyor.</div>`;
        }
      } catch (err) {
        console.warn(err);
      }
    };

    listContainer.appendChild(item);
  });
}

// Expose modal functions to window so ui-renderers profile buttons can trigger them
window.openFollowedArtistsModal = openFollowedArtistsModal;
window.openFollowersModal = openFollowersModal;

// ==========================================
// VISUALIZERS (DYNAMIC CANVAS ANIMATIONS)
// ==========================================
let waveW = 0, waveH = 0;
let bannerW = 0, bannerH = 0;

function resizeCanvases() {
  const waveCanvas = document.getElementById('player-wave');
  if (waveCanvas && waveCanvas.parentElement) {
    const rect = waveCanvas.parentElement.getBoundingClientRect();
    waveW = waveCanvas.width = Math.floor(rect.width) || waveCanvas.parentElement.clientWidth || 300;
    waveH = waveCanvas.height = Math.floor(rect.height) || waveCanvas.parentElement.clientHeight || 60;
  }
  const bannerCanvas = document.getElementById('banner-visualizer');
  if (bannerCanvas && bannerCanvas.parentElement) {
    const rect = bannerCanvas.parentElement.getBoundingClientRect();
    bannerW = bannerCanvas.width = Math.floor(rect.width) || bannerCanvas.parentElement.clientWidth || 400;
    bannerH = bannerCanvas.height = Math.floor(rect.height) || bannerCanvas.parentElement.clientHeight || 150;
  }
}

function startWaveformVisualizer() {
  const canvas = document.getElementById('player-wave');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let phase = 0;

  resizeCanvases();

  function draw() {
    requestAnimationFrame(draw);
    if (waveW === 0 || waveH === 0) {
      resizeCanvases();
    }
    ctx.fillStyle = '#0b0b0c';
    ctx.fillRect(0, 0, waveW, waveH);

    const volumeFactor = (typeof state.volumeLevel === 'number' && !isNaN(state.volumeLevel)) ? (state.isMuted ? 0 : (0.2 + state.volumeLevel * 0.8)) : 0.8;

    if (!state.isPlaying || volumeFactor === 0) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.moveTo(0, waveH / 2);
      ctx.lineTo(waveW, waveH / 2);
      ctx.stroke();
      return;
    }

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary-accent').trim() || 'rgb(184, 158, 255)';
    ctx.beginPath();

    const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
    let trackTempo = 1.0;
    let trackEnergy = 1.0;

    if (activeTrack) {
      const name = (activeTrack.trackName || '').toLowerCase();
      const artist = (activeTrack.artistName || '').toLowerCase();
      if (name.includes('carrera') || name.includes('pardon') || artist.includes('lvbel') || artist.includes('deha') || name.includes('911')) {
        trackTempo = 1.4;
        trackEnergy = 1.3;
      } else if (name.includes('slow') || name.includes('akustik') || artist.includes('sezen')) {
        trackTempo = 0.7;
        trackEnergy = 0.6;
      }
    }

    phase += 0.05 * trackTempo;
    const amp = 24 * volumeFactor * trackEnergy;
    for (let x = 0; x < waveW; x++) {
      const wave1 = Math.sin(x * 0.02 + phase) * amp * Math.sin(x * 0.005);
      const wave2 = Math.cos(x * 0.05 - phase * 1.3) * (amp * 0.3);
      const wave3 = Math.sin(x * 0.08 + phase * 2.1) * (amp * 0.15);

      const y = waveH / 2 + wave1 + wave2 + wave3;
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
  draw();
}

function startBillboardVisualizer() {
  const canvas = document.getElementById('banner-visualizer');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  resizeCanvases();

  const barCount = 28;
  const smoothedHeights = new Array(barCount).fill(5);

  function draw() {
    requestAnimationFrame(draw);
    if (bannerW === 0 || bannerH === 0) {
      resizeCanvases();
    }
    ctx.clearRect(0, 0, bannerW, bannerH);

    const barW = Math.max(1.5, (bannerW / barCount) - 3);
    let x = 0;

    const volumeFactor = state.isMuted ? 0 : (0.25 + state.volumeLevel * 0.75);

    if (!state.isPlaying || volumeFactor === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      const time = Date.now() * 0.001;
      for (let i = 0; i < barCount; i++) {
        smoothedHeights[i] = smoothedHeights[i] * 0.9 + 4 * 0.1;
        const breath = smoothedHeights[i] + Math.sin(time + i * 0.5) * 1.5;
        const barH = Math.max(3, breath);

        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, bannerH - barH, barW, barH, [4, 4, 0, 0]);
        } else {
          ctx.rect(x, bannerH - barH, barW, barH);
        }
        ctx.fill();
        x += barW + 3;
      }
      return;
    }

    let curTime = 0;
    const ytPlayer = getYTPlayer();
    if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
      try {
        const val = ytPlayer.getCurrentTime();
        if (typeof val === 'number' && !isNaN(val) && isFinite(val)) {
          curTime = val;
        }
      } catch (e) { }
    }

    const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
    let trackTempo = 1.0;
    let trackEnergy = 1.0;

    if (activeTrack) {
      const name = (activeTrack.trackName || '').toLowerCase();
      const artist = (activeTrack.artistName || '').toLowerCase();
      const genre = (activeTrack.primaryGenreName || '').toLowerCase();
      if (name.includes('carrera') || name.includes('pardon') || artist.includes('lvbel') || artist.includes('deha') || name.includes('911') || name.includes('funk')) {
        trackTempo = 1.45;
        trackEnergy = 1.5;
      } else if (genre.includes('rap') || genre.includes('hiphop')) {
        trackTempo = 1.3;
        trackEnergy = 1.35;
      } else if (name.includes('slow') || name.includes('akustik') || artist.includes('sezen')) {
        trackTempo = 0.75;
        trackEnergy = 0.65;
      }
    }

    trackTempo = (typeof trackTempo === 'number' && !isNaN(trackTempo)) ? trackTempo : 1.0;
    trackEnergy = (typeof trackEnergy === 'number' && !isNaN(trackEnergy)) ? trackEnergy : 1.0;

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary-accent').trim() || 'rgb(184, 158, 255)';

    for (let i = 0; i < barCount; i++) {
      let targetVal = 0;
      const seed = curTime * 4.8 * trackTempo + i * 0.8;

      if (i < 6) {
        const beat = Math.max(0, Math.sin(curTime * Math.PI * 2.2 * trackTempo) * 45);
        const rumble = Math.sin(seed * 0.6) * 12;
        targetVal = (18 + beat + rumble) * trackEnergy;
      } else if (i >= 6 && i < 20) {
        const vocal = Math.sin(seed * 1.1) * 22 + Math.cos(seed * 1.8 + 0.5) * 16 + Math.sin(seed * 3.5) * 8;
        targetVal = (20 + vocal) * trackEnergy;
      } else {
        const hihat = Math.max(0, Math.cos(curTime * Math.PI * 4.4 * trackTempo) * 25) * (Math.sin(i) * 0.4 + 0.6);
        const noise = Math.sin(seed * 7.5) * 10;
        targetVal = (10 + hihat + noise) * trackEnergy;
      }

      targetVal = Math.max(4, targetVal) * volumeFactor;
      smoothedHeights[i] = smoothedHeights[i] * 0.75 + targetVal * 0.25;

      const barH = (smoothedHeights[i] / 100) * bannerH * 0.85;

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, bannerH - Math.max(4, barH), barW, Math.max(4, barH), [6, 6, 0, 0]);
      } else {
        ctx.rect(x, bannerH - Math.max(4, barH), barW, Math.max(4, barH));
      }
      const heightRatio = bannerH > 0 ? (barH / bannerH) : 0;
      ctx.globalAlpha = Math.max(0.1, Math.min(1.0, 0.45 + heightRatio * 0.55));
      ctx.fill();
      x += barW + 3;
    }
    ctx.globalAlpha = 1.0;
  }
  draw();
}

function adjustBannerHeight() {
  const banner = document.getElementById('banner-bg');
  if (banner) {
    banner.style.height = '';
  }
}

// ==========================================
// COLLAPSIBLE PREMIUM SIDEBAR & WINDOW STATES
// ==========================================
function setLeftSidebarCollapsed(isCollapsed) {
  const sidebarLeft = document.querySelector('.sidebar-left');
  const mainLayout = document.querySelector('.main-layout');
  if (!sidebarLeft || !mainLayout) return;

  if (isCollapsed) {
    sidebarLeft.classList.add('collapsed');
    mainLayout.classList.add('collapsed-left');
  } else {
    sidebarLeft.classList.remove('collapsed');
    mainLayout.classList.remove('collapsed-left');
  }

  localStorage.setItem('unia-sidebar-left-collapsed', isCollapsed ? 'true' : 'false');

  try {
    resizeCanvases();
  } catch (e) {
    console.warn('Canvas resizing during sidebar collapse failed:', e);
  }
}

function initializeWorkspaceLayoutSwitcher() {
  const switcherBtn = document.getElementById('layout-switcher-btn');
  const popup = document.getElementById('layout-popup');
  const mainLayout = document.querySelector('.main-layout');
  const layoutItems = document.querySelectorAll('#layout-options-container .layout-item');

  if (!switcherBtn || !popup || !mainLayout) return;

  switcherBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!popup.classList.contains('hidden') && !popup.contains(e.target) && e.target !== switcherBtn && !switcherBtn.contains(e.target)) {
      popup.classList.add('hidden');
    }
  });

  function applyLayout(layoutName) {
    mainLayout.classList.remove(
      'layout-mirrored',
      'layout-side-left',
      'layout-side-right',
      'layout-compact',
      'layout-cinema',
      'layout-split-v',
      'layout-split-h',
      'layout-autohide-left'
    );

    if (layoutName !== 'default') {
      mainLayout.classList.add(`layout-${layoutName}`);
    }

    localStorage.setItem('unia-layout-preference', layoutName);

    layoutItems.forEach(item => {
      const match = item.getAttribute('data-layout') === layoutName;
      if (match) {
        item.classList.add('active');
        item.style.background = 'rgba(255, 255, 255, 0.08)';
        item.style.color = 'var(--text-main)';
      } else {
        item.classList.remove('active');
        item.style.background = 'transparent';
        item.style.color = 'var(--text-muted)';
      }
    });

    try {
      safeCreateIcons();
    } catch (err) {
      console.warn('Lucide icons creation during layout switch failed:', err);
    }

    try {
      resizeCanvases();
    } catch (err) {
      console.warn('Canvas resize trigger during layout switch failed:', err);
    }
  }

  layoutItems.forEach(item => {
    item.addEventListener('click', () => {
      const layoutName = item.getAttribute('data-layout');
      if (layoutName) {
        applyLayout(layoutName);
        popup.classList.add('hidden');
      }
    });
  });

  const isLeftSidebarCollapsed = localStorage.getItem('unia-sidebar-left-collapsed') === 'true';
  setLeftSidebarCollapsed(isLeftSidebarCollapsed);

  const storedLayout = localStorage.getItem('unia-layout-preference') || 'default';
  applyLayout(storedLayout);
}

// ==========================================
// MOBILE ENGAGEMENT ARCHITECTURE
// ==========================================
function initializeMobileApp() {
  const tabHome = document.getElementById('mobile-tab-home');
  const tabSearch = document.getElementById('mobile-tab-search');
  const tabLibrary = document.getElementById('mobile-tab-library');
  const tabQueue = document.getElementById('mobile-tab-queue');

  const sidebarLeft = document.querySelector('.sidebar-left');
  const sidebarRight = document.querySelector('.sidebar-right');

  function clearActiveTabs() {
    [tabHome, tabSearch, tabLibrary, tabQueue].forEach(tab => {
      if (tab) tab.classList.remove('active');
    });
  }

  function closeAllMobileDrawers() {
    if (sidebarLeft) sidebarLeft.classList.remove('mobile-open');
    if (sidebarRight) sidebarRight.classList.remove('mobile-open');
  }

  if (tabHome) {
    tabHome.onclick = () => {
      const appContainer = document.querySelector('.app-container');
      if (appContainer) appContainer.classList.remove('mobile-search-active');
      clearActiveTabs();
      tabHome.classList.add('active');
      closeAllMobileDrawers();
      navigateToPage('home');
    };
  }

  if (tabSearch) {
    tabSearch.onclick = () => {
      const appContainer = document.querySelector('.app-container');
      if (appContainer) appContainer.classList.add('mobile-search-active');
      clearActiveTabs();
      tabSearch.classList.add('active');
      closeAllMobileDrawers();
      navigateToPage('search');
      if (searchInput) searchInput.focus();
    };
  }

  if (tabLibrary) {
    tabLibrary.onclick = () => {
      if (sidebarLeft) {
        const appContainer = document.querySelector('.app-container');
        const isOpen = sidebarLeft.classList.contains('mobile-open');
        closeAllMobileDrawers();
        clearActiveTabs();
        if (!isOpen) {
          sidebarLeft.classList.add('mobile-open');
          tabLibrary.classList.add('active');
          if (appContainer) appContainer.classList.remove('mobile-search-active');
        } else {
          const activePage = document.querySelector('.home-btn.active') ? tabHome : tabSearch;
          if (activePage) {
            activePage.classList.add('active');
            if (activePage === tabSearch && appContainer) {
              appContainer.classList.add('mobile-search-active');
            }
          }
        }
      }
    };
  }

  if (tabQueue) {
    tabQueue.onclick = () => {
      if (sidebarRight) {
        const appContainer = document.querySelector('.app-container');
        const isOpen = sidebarRight.classList.contains('mobile-open');
        closeAllMobileDrawers();
        clearActiveTabs();
        if (!isOpen) {
          sidebarRight.classList.add('mobile-open');
          tabQueue.classList.add('active');
          if (appContainer) appContainer.classList.remove('mobile-search-active');

          if (rightQueueContent && rightDetailsContent) {
            rightQueueContent.classList.remove('hidden');
            rightDetailsContent.classList.add('hidden');
            renderQueueList();
          }
        } else {
          const activePage = document.querySelector('.home-btn.active') ? tabHome : tabSearch;
          if (activePage) {
            activePage.classList.add('active');
            if (activePage === tabSearch && appContainer) {
              appContainer.classList.add('mobile-search-active');
            }
          }
        }
      }
    };
  }

  const mobMiniPlayer = document.getElementById('mobile-mini-player');
  const mobNowPlaying = document.getElementById('mobile-now-playing');
  const closeMobPlayer = document.getElementById('close-mobile-player');

  if (mobMiniPlayer && mobNowPlaying) {
    mobMiniPlayer.onclick = (e) => {
      if (e.target.closest('.mobile-mini-btn')) return;
      mobNowPlaying.classList.add('visible');
    };
  }

  if (closeMobPlayer && mobNowPlaying) {
    closeMobPlayer.onclick = () => {
      mobNowPlaying.classList.remove('visible');
    };
  }

  // Bind remaining mobile buttons
  const mobMiniPlay = document.getElementById('mobile-mini-play');
  const mobMiniNext = document.getElementById('mobile-mini-next');
  const mobMainPlay = document.getElementById('mobile-play-pause');
  const mobMainPrev = document.getElementById('mobile-prev');
  const mobMainNext = document.getElementById('mobile-next');
  const mobShuffle = document.getElementById('mobile-shuffle');
  const mobRepeat = document.getElementById('mobile-repeat');
  const mobLike = document.getElementById('mobile-like-btn');
  const mobLyrics = document.getElementById('mobile-lyrics-trigger');
  const mobQueue = document.getElementById('mobile-queue-trigger');

  if (mobMiniPlay) mobMiniPlay.onclick = (e) => { e.stopPropagation(); handlePlayPause(); };
  if (mobMiniNext) mobMiniNext.onclick = (e) => { e.stopPropagation(); handleNext(); };
  if (mobMainPlay) mobMainPlay.onclick = () => { handlePlayPause(); };
  if (mobMainPrev) mobMainPrev.onclick = () => { handlePrev(); };
  if (mobMainNext) mobMainNext.onclick = () => { handleNext(); };

  if (mobShuffle) {
    mobShuffle.onclick = () => {
      state.isShuffle = !state.isShuffle;
      mobShuffle.classList.toggle('active', state.isShuffle);
      shuffleBtn.classList.toggle('active', state.isShuffle);
      saveLastPlayedState(getYTPlayer());
    };
  }
  if (mobRepeat) {
    mobRepeat.onclick = () => {
      state.isRepeat = !state.isRepeat;
      mobRepeat.classList.toggle('active', state.isRepeat);
      repeatBtn.classList.toggle('active', state.isRepeat);
      saveLastPlayedState(getYTPlayer());
    };
  }
  if (mobLike) {
    mobLike.onclick = () => {
      if (state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex]) {
        toggleLikeTrack(state.currentTrackList[state.currentTrackIndex]);
      }
    };
  }
  if (mobLyrics && utilLyricsBtn) mobLyrics.onclick = () => utilLyricsBtn.click();
  if (mobQueue && utilQueueBtn) mobQueue.onclick = () => utilQueueBtn.click();

  // Mobile dedicated sliders are registered globally via registerSliderEvents below
}

// ==========================================
// DYNAMIC TOOLTIPS GENERATION
// ==========================================
let isPremiumTooltipsInitialized = false;

function initializePremiumTooltips() {
  convertTitlesToTooltips();

  if (isPremiumTooltipsInitialized) return;
  isPremiumTooltipsInitialized = true;

  let tooltipEl = document.getElementById('global-app-tooltip');
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'global-app-tooltip';
    document.body.appendChild(tooltipEl);
  }

  function positionTooltip(target, tooltip) {
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const position = target.getAttribute('data-tooltip-position') || 'top';

    let top, left;
    const gap = 8;

    if (position === 'bottom') {
      top = targetRect.bottom + gap;
      if (top + tooltipRect.height > window.innerHeight - 10) {
        top = targetRect.top - tooltipRect.height - gap;
      }
    } else {
      top = targetRect.top - tooltipRect.height - gap;
      if (top < 10) {
        top = targetRect.bottom + gap;
      }
    }

    left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
    left = Math.max(10, Math.min(window.innerWidth - tooltipRect.width - 10, left));

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tooltip]');
    if (!el) return;

    const text = el.getAttribute('data-tooltip');
    if (!text) return;

    tooltipEl.textContent = text;
    tooltipEl.classList.add('visible');
    positionTooltip(el, tooltipEl);
  });

  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest('[data-tooltip]');
    if (!el) return;

    const related = e.relatedTarget;
    if (related && el.contains(related)) return;

    tooltipEl.classList.remove('visible');
  });

  const observer = new MutationObserver((mutations) => {
    let shouldConvert = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldConvert = true;
        break;
      }
      if (mutation.type === 'attributes' && mutation.attributeName === 'title') {
        shouldConvert = true;
        break;
      }
    }
    if (shouldConvert) {
      convertTitlesToTooltips();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['title']
  });
}

function convertTitlesToTooltips() {
  document.querySelectorAll('[title]').forEach(el => {
    const text = el.getAttribute('title');
    if (text) {
      el.setAttribute('data-tooltip', text);
      el.removeAttribute('title');

      if (el.closest('.titlebar') || el.closest('.search-container') || el.closest('.quick-tabs') || el.closest('.nav-history')) {
        el.setAttribute('data-tooltip-position', 'bottom');
      }
    }
  });
}

// ==========================================
// SPOTIFY BINDINGS & MAIN PLAYBAR WIRES
// ==========================================
function bindSpotifyInteractions() {
  const menuTrigger = document.getElementById('menu-trigger');
  if (menuTrigger) {
    menuTrigger.onclick = () => {
      const sidebarLeft = document.querySelector('.sidebar-left');
      if (sidebarLeft) {
        const isCurrentlyCollapsed = sidebarLeft.classList.contains('collapsed');
        setLeftSidebarCollapsed(!isCurrentlyCollapsed);
      }
    };
  }

  const shazamBtn = document.getElementById('shazam-btn');
  if (shazamBtn) {
    shazamBtn.onclick = () => {
      document.querySelectorAll('.titlebar-btn').forEach(b => b.classList.remove('active'));
      shazamBtn.classList.add('active');
      navigateToPage('shazam');
    };
  }

  const navBack = document.getElementById('nav-back');
  const navForward = document.getElementById('nav-forward');
  if (navBack) {
    navBack.classList.remove('disabled');
    navBack.onclick = () => { handleNavBack(); };
  }
  if (navForward) {
    navForward.classList.remove('disabled');
    navForward.onclick = () => { handleNavForward(); };
  }

  const homeTrigger = document.getElementById('home-trigger');
  if (homeTrigger) {
    homeTrigger.onclick = () => {
      if (searchInput) searchInput.value = '';
      document.querySelectorAll('.titlebar-btn').forEach(b => b.classList.remove('active'));
      homeTrigger.classList.add('active');
      navigateToPage('home');
      loadRecommendedTracks();
      showToast('Ana Sayfa Yüklendi');
    };
  }

  const browseBtn = document.querySelector('.browse-btn');
  if (browseBtn) {
    browseBtn.onclick = () => {
      document.querySelectorAll('.titlebar-btn').forEach(b => b.classList.remove('active'));
      navigateToPage('browse');
      showToast('Kategorilere Göz Atılıyor...');
    };
  }

  const notifBtn = document.getElementById('notif-btn');
  if (notifBtn) {
    notifBtn.onclick = () => {
      navigateToPage('notifications');
      showToast('Bildirimler Açıldı');
    };
  }

  const friendsBtn = document.getElementById('friends-btn');
  if (friendsBtn) {
    friendsBtn.onclick = () => {
      navigateToPage('friends');
      showToast('Arkadaş Etkinliği Açıldı');
    };
  }

  const profileBtn = document.getElementById('profile-btn');
  if (profileBtn) {
    profileBtn.onclick = () => {
      navigateToPage('profile');
      showToast('Profil Sayfası Açıldı');
    };
  }

  const makePlaylistBtns = [
    document.querySelector('[title="Çalma listesi oluştur"]'),
    document.getElementById('create-playlist-btn')
  ];
  makePlaylistBtns.forEach(btn => {
    if (btn) {
      btn.onclick = () => {
        const newPlaylist = {
          id: Date.now().toString(),
          name: `Çalma Listem #${state.playlists.length + 1}`,
          tracks: []
        };
        state.playlists.push(newPlaylist);
        savePlaylists();
        renderLibrarySidebar();
        navigateToPage('playlist', newPlaylist);
        showToast('Çalma listesi oluşturuldu! İsmini değiştirmek için başlığa tıklayın.');
      };
    }
  });

  document.querySelectorAll('.filter-pills .pill-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.filter-pills .pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showToast(`Kitaplık: ${btn.textContent} filtrelendi.`);
      renderLibrarySidebar();
    };
  });

  document.querySelectorAll('.quick-tabs .pill-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.quick-tabs .pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (searchInput && searchInput.value) {
        searchInput.value = '';
      }
      showToast(`Besleme: ${btn.textContent} filtrelendi.`);
      renderHomeGridFiltered(btn.textContent.trim());
    };
  });

  const sortSelector = document.querySelector('.sort-selector');
  if (sortSelector) {
    sortSelector.onclick = () => {
      const span = sortSelector.querySelector('span');
      const sort = localStorage.getItem('unia_library_sort') || 'recent';
      if (sort === 'recent') {
        localStorage.setItem('unia_library_sort', 'alphabetical');
        span.textContent = 'Alfabeye göre';
        showToast('Kitaplık alfabeye göre sıralandı.');
      } else {
        localStorage.setItem('unia_library_sort', 'recent');
        span.textContent = 'Yakın tarihli';
        showToast('Kitaplık yakın tarihliye göre sıralandı.');
      }
      renderLibrarySidebar();
    };
  }

  const bannerDotsBtn = document.querySelector('.banner-dots-btn');
  if (bannerDotsBtn) {
    bannerDotsBtn.onclick = (e) => {
      e.stopPropagation();
      contextMenuTargetTrack = state.currentTrackIndex >= 0 ? state.currentTrackList[state.currentTrackIndex] : null;
      showContextMenu(e.clientX, e.clientY);
    };
  }

  const detailsOptionsBtn = document.querySelector('#details-sidebar .header-action-btn[title="Seçenekler"]');
  if (detailsOptionsBtn) {
    detailsOptionsBtn.onclick = (e) => {
      e.stopPropagation();
      contextMenuTargetTrack = state.currentTrackIndex >= 0 ? state.currentTrackList[state.currentTrackIndex] : null;
      showContextMenu(e.clientX, e.clientY);
    };
  }

  const rightShareBtn = document.getElementById('right-share-btn');
  if (rightShareBtn) {
    rightShareBtn.onclick = () => {
      if (state.currentTrackIndex >= 0) {
        const track = state.currentTrackList[state.currentTrackIndex];
        navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${track.videoId || track.trackId}`);
        showToast('Şarkı YouTube bağlantısı panoya kopyalandı!');
      }
    };
  }

  const closeRightSidebarBtn = document.getElementById('close-right-sidebar');
  if (closeRightSidebarBtn) {
    closeRightSidebarBtn.onclick = () => {
      document.getElementById('details-sidebar').classList.add('sidebar-right-hidden');
      document.querySelector('.main-layout').classList.add('sidebar-right-hidden-layout');

      const sidebarRight = document.querySelector('.sidebar-right');
      if (sidebarRight) sidebarRight.classList.remove('mobile-open');

      const tabQueue = document.getElementById('mobile-tab-queue');
      if (tabQueue) tabQueue.classList.remove('active');

      const activePage = document.querySelector('.home-btn.active') ? 'home' : 'search';
      syncMobileTabs(activePage);
    };
  }

  const followBtn = document.querySelector('.about-artist-box .btn');
  if (followBtn) {
    followBtn.onclick = () => {
      if (state.currentTrackIndex < 0 || !state.currentTrackList[state.currentTrackIndex]) return;
      const artist = state.currentTrackList[state.currentTrackIndex].artistName;

      const followedKey = state.currentUser ? `unia_followed_artists_${state.currentUser.id}` : 'unia_followed_artists_guest';
      let followed = JSON.parse(localStorage.getItem(followedKey) || '[]');
      const isFollowing = followed.includes(artist);

      if (isFollowing) {
        followed = followed.filter(a => a !== artist);
        followBtn.textContent = 'Takip Et';
        followBtn.classList.remove('btn-outline');
        followBtn.classList.add('btn-primary');
        showToast(`${artist} takibi bırakıldı.`);
      } else {
        followed.push(artist);
        followBtn.textContent = 'Takip Ediliyor';
        followBtn.classList.remove('btn-primary');
        followBtn.classList.add('btn-outline');
        showToast(`${artist} takip ediliyor!`);
      }
      localStorage.setItem(followedKey, JSON.stringify(followed));

      if (state.currentUser && window.uniaAPI?.dbUpdateUser) {
        window.uniaAPI.dbUpdateUser(state.currentUser.id, { followedArtists: followed }).catch(() => { });
      }
    };
  }

  const playbarCover = document.getElementById('playbar-cover');
  const playbarName = document.getElementById('playbar-name');
  const playbarArtist = document.getElementById('playbar-artist');

  const toggleSidebar = () => {
    const sidebar = document.getElementById('details-sidebar');
    const layout = document.querySelector('.main-layout');

    if (sidebar.classList.contains('sidebar-right-hidden')) {
      sidebar.classList.remove('sidebar-right-hidden');
      layout.classList.remove('sidebar-right-hidden-layout');
    } else {
      sidebar.classList.add('sidebar-right-hidden');
      layout.classList.add('sidebar-right-hidden-layout');
    }
  };

  if (playbarCover) playbarCover.onclick = toggleSidebar;
  if (playbarName) playbarName.onclick = toggleSidebar;
  if (playbarArtist) playbarArtist.onclick = toggleSidebar;

  const sidebarActionBtn = document.querySelector('.sidebar-action-btn');
  const libraryHeaderBtn = document.querySelector('.library-header-btn');
  
  const toggleLeftSidebar = () => {
    const sidebarLeft = document.querySelector('.sidebar-left');
    if (sidebarLeft) {
      const isCurrentlyCollapsed = sidebarLeft.classList.contains('collapsed');
      setLeftSidebarCollapsed(!isCurrentlyCollapsed);
    }
  };

  if (sidebarActionBtn) {
    sidebarActionBtn.onclick = toggleLeftSidebar;
  }
  if (libraryHeaderBtn) {
    libraryHeaderBtn.onclick = toggleLeftSidebar;
  }

  const libSearchInput = document.getElementById('lib-search-input');
  if (libSearchInput) {
    libSearchInput.oninput = (e) => {
      localStorage.setItem('unia_library_search', e.target.value.toLowerCase().trim());
      renderLibrarySidebar();
    };
    libSearchInput.onclick = (e) => e.stopPropagation();
  }
}

// ==========================================
// CONTEXT MENU WIREUPS
// ==========================================
const contextMenu = document.getElementById('custom-context-menu');

function showContextMenu(x, y, targetEl = null) {
  if (!contextMenu) return;

  const recentLI = document.getElementById('ctx-remove-recent');
  if (recentLI) {
    let isRecent = false;
    const track = contextMenuTargetTrack || (state.currentTrackIndex >= 0 ? state.currentTrackList[state.currentTrackIndex] : null);
    if (track) {
      const trackId = String(track.trackId);
      if (homeTracks.some(t => String(t.trackId) === trackId)) {
        isRecent = true;
      }
      try {
        const localRecent = JSON.parse(localStorage.getItem('unia_recently_played') || '[]');
        if (localRecent.some(t => String(t.trackId) === trackId)) {
          isRecent = true;
        }
      } catch (e) { }
    }
    recentLI.style.display = isRecent ? 'flex' : 'none';
  }

  const menuWidth = 180;
  const isRightSide = (window.innerWidth - x < menuWidth) || (targetEl && targetEl.closest('#details-sidebar') !== null);

  if (isRightSide) {
    contextMenu.style.left = `${x - menuWidth}px`;
  } else {
    contextMenu.style.left = `${x}px`;
  }

  contextMenu.style.top = `${y}px`;
  contextMenu.classList.remove('hidden');
}

function hideContextMenu() {
  if (contextMenu) contextMenu.classList.add('hidden');
  const plMenu = document.getElementById('playlist-context-menu');
  if (plMenu) {
    plMenu.classList.add('hidden');
    plMenu.style.display = 'none';
  }
}

// ==========================================
// TIMELINE & SLIDERS INTERACTIVE DRAWS
// ==========================================
// Universal Mouse/Touch Event Handler for Sliders (Full Seeking & Mute/Volume Drag Support)
window.isDraggingTimeline = false;
window.isDraggingVolume = false;
let activeDraggingSliderBox = null;

const registerSliderEvents = (sliderBox, isTimeline) => {
  if (!sliderBox) return;

  const handleDrag = (e) => {
    const pct = getSliderPercent(e, sliderBox);
    if (isTimeline) {
      window.lastDraggedTimelinePercent = pct;
      if (window.updateTimelineVisual) {
        window.updateTimelineVisual(pct);
      }
    } else {
      state.volumeLevel = pct;
      state.isMuted = false;
      syncVolumeSlider();
    }
  };

  // Mouse bindings
  sliderBox.addEventListener('mousedown', (e) => {
    if (isTimeline) window.isDraggingTimeline = true;
    else window.isDraggingVolume = true;
    activeDraggingSliderBox = sliderBox;
    handleDrag(e);
    e.preventDefault();
  });

  // Touch bindings (Mobile & Tablet)
  sliderBox.addEventListener('touchstart', (e) => {
    if (isTimeline) window.isDraggingTimeline = true;
    else window.isDraggingVolume = true;
    activeDraggingSliderBox = sliderBox;
    handleDrag(e);
    e.preventDefault();
  }, { passive: false });
};

// Bind main playbar sliders
registerSliderEvents(timelineSliderBox, true);
registerSliderEvents(volumeSliderBox, false);

// Bind mobile dedicated sliders
const mobTimeline = document.getElementById('mobile-timeline-box');
const mobVolume = document.getElementById('mobile-volume-box');
registerSliderEvents(mobTimeline, true);
registerSliderEvents(mobVolume, false);

if (volumeIconBtn) {
  volumeIconBtn.addEventListener('click', () => {
    state.isMuted = !state.isMuted;
    syncVolumeSlider();
  });
}

// Bind mobile dedicated mute/volume toggle icon if present
const mobVolumeIconBtn = document.getElementById('mobile-volume-icon-btn');
if (mobVolumeIconBtn) {
  mobVolumeIconBtn.addEventListener('click', () => {
    state.isMuted = !state.isMuted;
    syncVolumeSlider();
  });
}

// ==========================================
// ELECTRON ELECTRONIC TITLEBAR TRIGGERS
// ==========================================
if (window.uniaAPI) {
  const winMin = document.getElementById('win-min');
  const winMax = document.getElementById('win-max');
  const winClose = document.getElementById('win-close');
  if (winMin) winMin.addEventListener('click', () => window.uniaAPI.minimize());
  if (winMax) winMax.addEventListener('click', () => window.uniaAPI.maximize());
  if (winClose) winClose.addEventListener('click', () => window.uniaAPI.close());

  const titlebar = document.querySelector('.titlebar');
  if (titlebar) {
    titlebar.addEventListener('dblclick', (e) => {
      if (!e.target.closest('button') && !e.target.closest('input')) window.uniaAPI.maximize();
    });
  }
}

// ==========================================
// ROBUST STARTUP ORCHESTRATION ENGINE (HYBRID SAFE)
// ==========================================
async function initAppOrchestrator() {
  console.log('[Boot] Initializing hybrid app orchestrator...');
  try { adjustBannerHeight(); } catch (e) { }
  try { resizeCanvases(); } catch (e) { }
  try { await initAuth(); } catch (e) { }
  try { loadLikedTracks(); } catch (e) { }
  try { loadPlaylists(); } catch (e) { }
  try { renderLibrarySidebar(); } catch (e) { }
  try {
    // Manual restore state since we load modular app settings
    const track = JSON.parse(localStorage.getItem('unia_last_played_track') || 'null');
    const list = JSON.parse(localStorage.getItem('unia_last_played_list') || '[]');
    const idx = parseInt(localStorage.getItem('unia_last_played_index') || '-1');
    if (track && list.length > 0 && idx >= 0) {
      state.currentTrackList = list;
      state.currentTrackIndex = idx;
      updatePlayerUI();
      revealPlayerUI();

      const lastTime = parseFloat(localStorage.getItem('unia_last_played_time') || '0');
      if (lastTime > 0) {
        state.pendingSeekTime = lastTime;
        state.pendingTrackVideoId = track.videoId || track.trackId;
      }
    }
  } catch (e) { }
  try { syncVolumeSlider(); } catch (e) { }
  try { bindSpotifyInteractions(); } catch (e) { }
  try { startWaveformVisualizer(); } catch (e) { }
  try { startBillboardVisualizer(); } catch (e) { }

  // Close modals
  const closeFollowedModalBtn = document.getElementById('close-followed-modal-btn');
  const followedArtistsModal = document.getElementById('followed-artists-modal');
  if (closeFollowedModalBtn && followedArtistsModal) {
    closeFollowedModalBtn.onclick = () => {
      followedArtistsModal.style.display = 'none';
      followedArtistsModal.classList.add('hidden');
    };
    followedArtistsModal.onclick = (e) => {
      if (e.target === followedArtistsModal) {
        followedArtistsModal.style.display = 'none';
        followedArtistsModal.classList.add('hidden');
      }
    };
  }

  const closeFollowersModalBtn = document.getElementById('close-followers-modal-btn');
  const followersModal = document.getElementById('followers-modal');
  if (closeFollowersModalBtn && followersModal) {
    closeFollowersModalBtn.onclick = () => {
      followersModal.style.display = 'none';
      followersModal.classList.add('hidden');
    };
    followersModal.onclick = (e) => {
      if (e.target === followersModal) {
        followersModal.style.display = 'none';
        followersModal.classList.add('hidden');
      }
    };
  }

  // Navigate to initial page
  navigateToPage('home');
  safeCreateIcons();

  // Dynamic Workspace Switcher
  try { initializeWorkspaceLayoutSwitcher(); } catch (e) { }

  // Mobile interactive triggers
  try { initializeMobileApp(); } catch (e) { }

  // Tooltips conversion
  try { initializePremiumTooltips(); } catch (e) { }

  // RPC sync interval
  setInterval(() => {
    if (state.isPlaying) {
      syncDiscordRPC();
    }
  }, 10000);
}

// Robust registration avoiding race conditions with DOMContentLoaded
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initAppOrchestrator);
} else {
  // Execute immediately if DOM is already parsed/interactive/complete
  initAppOrchestrator();
}

// ==========================================
// RESIZE & LOAD ACTIONS
// ==========================================
window.addEventListener('resize', () => {
  adjustBannerHeight();
  resizeCanvases();
});

window.addEventListener('load', () => {
  adjustBannerHeight();
  resizeCanvases();
});

// ==========================================
// REMAINING GLOBAL BINDINGS
// ==========================================
document.addEventListener('click', () => {
  hideContextMenu();
  const addToPlaylistPopup = document.getElementById('playlist-add-popup');
  if (addToPlaylistPopup) addToPlaylistPopup.style.display = 'none';
  const eqPopup = document.getElementById('eq-popup');
  if (eqPopup) eqPopup.classList.add('hidden');
  if (utilEqBtn) utilEqBtn.classList.remove('active');
  if (devicesPopup) devicesPopup.classList.add('hidden');
  if (utilDeviceBtn) utilDeviceBtn.classList.remove('active');
});

document.addEventListener('mousemove', (e) => {
  if (window.isDraggingTimeline && activeDraggingSliderBox) {
    const pct = getSliderPercent(e, activeDraggingSliderBox);
    window.lastDraggedTimelinePercent = pct;
    if (window.updateTimelineVisual) {
      window.updateTimelineVisual(pct);
    }
  }
  if (window.isDraggingVolume && activeDraggingSliderBox) {
    state.volumeLevel = getSliderPercent(e, activeDraggingSliderBox);
    state.isMuted = false;
    syncVolumeSlider();
  }
});

document.addEventListener('mouseup', () => {
  if (window.isDraggingTimeline && window.lastDraggedTimelinePercent !== undefined) {
    seekToPercent(window.lastDraggedTimelinePercent);
    delete window.lastDraggedTimelinePercent;
  }
  window.isDraggingTimeline = false;
  window.isDraggingVolume = false;
  activeDraggingSliderBox = null;
});

document.addEventListener('touchmove', (e) => {
  if (window.isDraggingTimeline && activeDraggingSliderBox) {
    const pct = getSliderPercent(e, activeDraggingSliderBox);
    window.lastDraggedTimelinePercent = pct;
    if (window.updateTimelineVisual) {
      window.updateTimelineVisual(pct);
    }
    e.preventDefault();
  }
  if (window.isDraggingVolume && activeDraggingSliderBox) {
    state.volumeLevel = getSliderPercent(e, activeDraggingSliderBox);
    state.isMuted = false;
    syncVolumeSlider();
    e.preventDefault();
  }
}, { passive: false });

document.addEventListener('touchend', () => {
  if (window.isDraggingTimeline && window.lastDraggedTimelinePercent !== undefined) {
    seekToPercent(window.lastDraggedTimelinePercent);
    delete window.lastDraggedTimelinePercent;
  }
  window.isDraggingTimeline = false;
  window.isDraggingVolume = false;
  activeDraggingSliderBox = null;
});

document.addEventListener('touchcancel', () => {
  if (window.isDraggingTimeline && window.lastDraggedTimelinePercent !== undefined) {
    seekToPercent(window.lastDraggedTimelinePercent);
    delete window.lastDraggedTimelinePercent;
  }
  window.isDraggingTimeline = false;
  window.isDraggingVolume = false;
  activeDraggingSliderBox = null;
});

// Context Menu Mouse triggers
document.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('.track-row:not(.header)');
  const card = e.target.closest('.grid-card');
  const searchRow = e.target.closest('.search-row-item');
  const recCard = e.target.closest('.today-rec-card');
  const targetEl = row || card || searchRow || recCard;

  if (targetEl && (targetEl._track || targetEl._item)) {
    let track = targetEl._track;
    if (!track && targetEl._item && targetEl._item.type === 'track') {
      track = {
        trackId: targetEl._item.id,
        trackName: targetEl._item.title,
        artistName: targetEl._item.subtitle,
        artworkUrl100: targetEl._item.cover,
        videoId: targetEl._item.videoId || targetEl._item.id,
        trackTimeMillis: targetEl._item.trackTimeMillis || 180000,
        primaryGenreName: targetEl._item.primaryGenreName || 'Pop'
      };
    } else if (!track && targetEl._item) {
      track = {
        trackId: targetEl._item.id,
        trackName: targetEl._item.title,
        artistName: targetEl._item.subtitle,
        artworkUrl100: targetEl._item.cover,
        videoId: targetEl._item.videoId || targetEl._item.id
      };
    }

    if (track) {
      e.preventDefault();
      contextMenuTargetTrack = track;
      showContextMenu(e.clientX, e.clientY, e.target);
      return;
    }
  }

  const dotsBtn = e.target.closest('.banner-dots-btn') || e.target.closest('#details-sidebar .header-action-btn[title="Seçenekler"]');
  if (dotsBtn && state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex]) {
    e.preventDefault();
    contextMenuTargetTrack = state.currentTrackList[state.currentTrackIndex];
    showContextMenu(e.clientX, e.clientY, e.target);
  } else {
    hideContextMenu();
  }
});

// Context Menu clicks
const ctxAddQueue = document.getElementById('ctx-add-queue');
if (ctxAddQueue) {
  ctxAddQueue.onclick = (e) => {
    e.stopPropagation();
    hideContextMenu();
    const track = contextMenuTargetTrack || (state.currentTrackIndex >= 0 ? state.currentTrackList[state.currentTrackIndex] : null);
    if (track) {
      if (state.currentTrackIndex >= 0) {
        state.currentTrackList.splice(state.currentTrackIndex + 1, 0, track);
      } else {
        state.currentTrackList.push(track);
        state.currentTrackIndex = 0;
      }
      showToast(`Kuyruğa eklendi: ${track.trackName}`);
      if (!rightQueueContent.classList.contains('hidden')) renderQueueList();
    }
  };
}

const ctxLike = document.getElementById('ctx-like');
if (ctxLike) {
  ctxLike.onclick = (e) => {
    e.stopPropagation();
    hideContextMenu();
    const track = contextMenuTargetTrack || (state.currentTrackIndex >= 0 ? state.currentTrackList[state.currentTrackIndex] : null);
    if (track) toggleLikeTrack(track);
  };
}

const ctxShare = document.getElementById('ctx-share');
if (ctxShare) {
  ctxShare.onclick = (e) => {
    e.stopPropagation();
    hideContextMenu();
    const track = contextMenuTargetTrack || (state.currentTrackIndex >= 0 ? state.currentTrackList[state.currentTrackIndex] : null);
    if (track) {
      const vId = track.videoId || track.trackId;
      navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${vId}`);
      showToast('YouTube bağlantısı kopyalandı!');
    }
  };
}

const ctxRemoveRecent = document.getElementById('ctx-remove-recent');
if (ctxRemoveRecent) {
  ctxRemoveRecent.onclick = (e) => {
    e.stopPropagation();
    hideContextMenu();
    const track = contextMenuTargetTrack || (state.currentTrackIndex >= 0 ? state.currentTrackList[state.currentTrackIndex] : null);
    if (track) removeFromRecentlyPlayed(track);
  };
}

const plCtxDelete = document.getElementById('pl-ctx-delete');
if (plCtxDelete) {
  plCtxDelete.onclick = (e) => {
    e.stopPropagation();
    hideContextMenu();
    const targetPlaylistId = window.contextMenuTargetPlaylistId;
    if (targetPlaylistId) {
      const confirmModal = document.getElementById('confirm-modal');
      const confirmYes = document.getElementById('confirm-ok-btn');
      const confirmNo = document.getElementById('confirm-cancel-btn');
      if (confirmModal && confirmYes && confirmNo) {
        confirmModal.classList.remove('hidden');
        confirmModal.style.display = 'flex';

        confirmYes.onclick = () => {
          confirmModal.classList.add('hidden');
          confirmModal.style.display = 'none';

          state.playlists = state.playlists.filter(p => p.id !== targetPlaylistId);
          savePlaylists();
          renderLibrarySidebar();

          if (window.uniaAPI?.dbDeletePlaylist) {
            window.uniaAPI.dbDeletePlaylist(targetPlaylistId).catch(() => { });
          }

          const holder = document.getElementById('page-content-holder');
          if (holder && holder.dataset.currentPage === 'playlist') {
            showPage('home');
          }
          showToast('Çalma listesi silindi.');
        };

        confirmNo.onclick = () => {
          confirmModal.classList.add('hidden');
          confirmModal.style.display = 'none';
        };

        confirmModal.onclick = (ev) => {
          if (ev.target === confirmModal) {
            confirmModal.classList.add('hidden');
            confirmModal.style.display = 'none';
          }
        };
      } else {
        if (confirm('Bu çalma listesini silmek istediğinizden emin misiniz?')) {
          state.playlists = state.playlists.filter(p => p.id !== targetPlaylistId);
          savePlaylists();
          renderLibrarySidebar();
          if (window.uniaAPI?.dbDeletePlaylist) {
            window.uniaAPI.dbDeletePlaylist(targetPlaylistId).catch(() => { });
          }
          const holder = document.getElementById('page-content-holder');
          if (holder && holder.dataset.currentPage === 'playlist') {
            showPage('home');
          }
          showToast('Çalma listesi silindi.');
        }
      }
    }
  };
}

// Titlebar buttons
if (playBtn) playBtn.addEventListener('click', handlePlayPause);
if (prevBtn) prevBtn.addEventListener('click', handlePrev);
if (nextBtn) nextBtn.addEventListener('click', handleNext);

if (shuffleBtn) {
  shuffleBtn.addEventListener('click', () => {
    state.isShuffle = !state.isShuffle;
    shuffleBtn.classList.toggle('active', state.isShuffle);
    saveLastPlayedState(getYTPlayer());
  });
}

if (repeatBtn) {
  repeatBtn.addEventListener('click', () => {
    state.isRepeat = !state.isRepeat;
    repeatBtn.classList.toggle('active', state.isRepeat);
    saveLastPlayedState(getYTPlayer());
  });
}

const playbarLike = document.getElementById('playbar-like');
if (playbarLike) {
  playbarLike.addEventListener('click', () => {
    if (state.currentTrackIndex < 0 || !state.currentTrackList[state.currentTrackIndex]) return;
    toggleLikeTrack(state.currentTrackList[state.currentTrackIndex]);
  });
}

const rightLikeBtn = document.getElementById('right-like-btn');
if (rightLikeBtn) {
  rightLikeBtn.addEventListener('click', () => {
    if (state.currentTrackIndex < 0 || !state.currentTrackList[state.currentTrackIndex]) return;
    toggleLikeTrack(state.currentTrackList[state.currentTrackIndex]);
  });
}

// Plus Button Add to Playlist
const addToPlaylistBtn = document.getElementById('playbar-add-to-playlist');
const addToPlaylistPopup = document.getElementById('playlist-add-popup');
const addToPlaylistList = document.getElementById('playlist-add-popup-list');

if (addToPlaylistBtn && addToPlaylistPopup && addToPlaylistList) {
  addToPlaylistBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.currentTrackIndex < 0 || !state.currentTrackList[state.currentTrackIndex]) return;

    addToPlaylistList.innerHTML = '';
    if (state.playlists.length === 0) {
      addToPlaylistList.innerHTML = '<div style="padding:8px 14px; font-size:12px; color:var(--text-muted);">Hiç çalma listesi yok.<br>Önce bir tane oluşturun.</div>';
    } else {
      state.playlists.forEach(pl => {
        const item = document.createElement('div');
        item.className = 'context-item';
        item.style = 'padding: 10px 16px; cursor: pointer; font-size: 13px; color: var(--text-main); display: flex; align-items: center; gap: 8px;';
        item.innerHTML = `<i class="ph-fill ph-list" style="font-size:14px;"></i> ${escapeHtml(pl.name)}`;
        item.onclick = () => {
          const track = state.currentTrackList[state.currentTrackIndex];
          if (!pl.tracks.some(t => t.trackId === track.trackId)) {
            pl.tracks.push(track);
            savePlaylists();
          }
          addToPlaylistPopup.style.display = 'none';
        };
        addToPlaylistList.appendChild(item);
      });
    }

    const isVisible = addToPlaylistPopup.style.display === 'block';
    addToPlaylistPopup.style.display = isVisible ? 'none' : 'block';
  });
}

// Search Suggestions Autocomplete
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    clearTimeout(searchDebounce);

    if (!q) {
      if (suggestionsDropdown) suggestionsDropdown.classList.add('hidden');
      searchMusic('');
      return;
    }

    const holder = document.getElementById('page-content-holder');
    if (holder && holder.dataset.currentPage && holder.dataset.currentPage !== 'home' && holder.dataset.currentPage !== 'search') {
      showPage('home');
    }

    searchDebounce = setTimeout(async () => {
      searchMusic(q);

      if (!suggestionsDropdown || !suggestionsList) return;
      try {
        const data = await window.uniaAPI.searchMusic(q);
        const results = data ? (data.results || []) : [];
        suggestionsList.innerHTML = '';

        if (results.length === 0) {
          suggestionsDropdown.classList.add('hidden');
          return;
        }

        suggestionsDropdown.classList.remove('hidden');
        results.slice(0, 5).forEach((track, idx) => {
          const item = document.createElement('div');
          item.className = 'context-item';
          item.style = 'padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.2s; border-radius: 6px; margin: 2px 8px;';

          const imgUrl = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '60x60bb') : '';
          item.innerHTML = `
            <img src="${imgUrl}" style="width:32px; height:32px; border-radius:4px; object-fit:cover; flex-shrink:0;">
            <div style="overflow:hidden; flex:1;">
              <div style="font-size:12px; font-weight:600; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(track.trackName)}</div>
              <div style="font-size:10px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(track.artistName)}</div>
            </div>
          `;

          item.onclick = (event) => {
            event.stopPropagation();
            suggestionsDropdown.classList.add('hidden');
            searchInput.value = track.trackName;

            state.currentTrackList = results;
            state.currentTrackIndex = idx;
            updatePlayerUI();
            loadAndPlayTrack();
          };

          suggestionsList.appendChild(item);
        });
      } catch (err) {
        console.warn('Autocomplete suggestions failed:', err);
      }
    }, 400);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (suggestionsDropdown) suggestionsDropdown.classList.add('hidden');
    }
  });
}

document.addEventListener('click', (e) => {
  if (suggestionsDropdown && !e.target.closest('#search-input-wrapper')) {
    suggestionsDropdown.classList.add('hidden');
  }
});

// Clear Queue action
const clearQueueBtn = document.getElementById('clear-queue-btn');
if (clearQueueBtn) {
  clearQueueBtn.onclick = () => {
    if (state.currentTrackIndex >= 0 && state.currentTrackList.length > 0) {
      state.currentTrackList = [state.currentTrackList[state.currentTrackIndex]];
      state.currentTrackIndex = 0;
      renderQueueList();
      showToast('Çalma sırası temizlendi.');
    } else {
      showToast('Kuyruk zaten boş.');
    }
  };
}

// Mini player controls
const miniPlayPauseBtn = document.getElementById('mini-play-pause');
if (miniPlayPauseBtn) {
  miniPlayPauseBtn.onclick = (e) => {
    e.stopPropagation();
    handlePlayPause();
  };
}

const miniPrevBtn = document.getElementById('mini-prev');
if (miniPrevBtn) {
  miniPrevBtn.onclick = (e) => {
    e.stopPropagation();
    handlePrev();
  };
}

const miniNextBtn = document.getElementById('mini-next');
if (miniNextBtn) {
  miniNextBtn.onclick = (e) => {
    e.stopPropagation();
    handleNext();
  };
}

const miniLikeBtn = document.getElementById('mini-like');
if (miniLikeBtn) {
  miniLikeBtn.onclick = (e) => {
    e.stopPropagation();
    const mainLikeBtn = document.getElementById('playbar-like');
    if (mainLikeBtn) mainLikeBtn.click();
  };
}

const miniTimelineSlider = document.getElementById('mini-timeline-slider');
if (miniTimelineSlider) {
  miniTimelineSlider.onclick = (e) => {
    e.stopPropagation();
    seekToPercent(getSliderPercent(e, miniTimelineSlider));
  };
}

if (utilFullscreenBtn) {
  utilFullscreenBtn.onclick = () => {
    if (window.uniaAPI) {
      window.uniaAPI.toggleFullscreen();
      utilFullscreenBtn.classList.toggle('active');
    }
  };
}

// Equalizer popups and slider band inputs
const utilEqBtn = document.getElementById('util-eq');
const eqPopup = document.getElementById('eq-popup');
const eqPresetSelect = document.getElementById('eq-preset-select');

if (utilEqBtn && eqPopup) {
  utilEqBtn.onclick = (e) => {
    e.stopPropagation();
    eqPopup.classList.toggle('hidden');
    utilEqBtn.classList.toggle('active', !eqPopup.classList.contains('hidden'));

    if (eqFilters.length === 0) {
      initEqualizer();
    }
  };
  eqPopup.onclick = (e) => e.stopPropagation();
}

for (let i = 0; i < 5; i++) {
  const slider = document.getElementById(`eq-band-${i}`);
  if (slider) {
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      if (eqFilters.length === 0) {
        initEqualizer();
      }
      if (eqFilters[i]) {
        eqFilters[i].gain.value = val;
      }
      if (eqPresetSelect) {
        eqPresetSelect.value = '';
      }
    });
  }
}

if (eqPresetSelect) {
  eqPresetSelect.addEventListener('change', () => {
    const presetName = eqPresetSelect.value;
    const gains = EQ_PRESETS[presetName];
    if (gains) {
      if (eqFilters.length === 0) {
        initEqualizer();
      }
      gains.forEach((gainVal, idx) => {
        const slider = document.getElementById(`eq-band-${idx}`);
        if (slider) slider.value = gainVal;
        if (eqFilters[idx]) eqFilters[idx].gain.value = gainVal;
      });
      showToast(`${eqPresetSelect.options[eqPresetSelect.selectedIndex].text} EQ Uygulandı`);
    }
  });
}

// Devices connection panel
document.querySelectorAll('.device-item').forEach(item => {
  item.onclick = () => {
    document.querySelectorAll('.device-item').forEach(i => {
      i.classList.remove('active');
      i.style.color = 'var(--text-muted)';
      i.style.background = 'transparent';
      const check = i.querySelector('.device-check');
      if (check) check.remove();
    });
    item.classList.add('active');
    item.style.color = '#ff8b8bff';
    item.style.background = 'rgba(30, 215, 96, 0.1)';

    const check = document.createElement('i');
    check.className = 'fa-solid fa-check device-check';
    check.style = 'margin-left: auto; color: #ff8b8bff; font-size: 11px;';
    item.appendChild(check);

    const name = item.querySelector('span').textContent;
    showToast(`Bağlandı: ${name}`);

    if (devicesPopup) devicesPopup.classList.add('hidden');
    if (utilDeviceBtn) utilDeviceBtn.classList.remove('active');
  };
});

if (utilDeviceBtn && devicesPopup) {
  utilDeviceBtn.onclick = (e) => {
    e.stopPropagation();
    devicesPopup.classList.toggle('hidden');
    utilDeviceBtn.classList.toggle('active', !devicesPopup.classList.contains('hidden'));
  };
}

if (utilPipBtn) {
  utilPipBtn.onclick = () => {
    if (window.uniaAPI) {
      const isMini = window.uniaAPI.toggleMiniPlayer();
      document.querySelector('.app-container').classList.toggle('mini-player-active', isMini);
      document.body.classList.toggle('mini-player-active', isMini);
      utilPipBtn.classList.toggle('active', isMini);
      if (isMini) {
        safeCreateIcons();
        if (state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex]) {
          updatePlayerUI();
        }
      }
    }
  };
}

const miniRestoreBtn = document.getElementById('mini-restore-btn');
if (miniRestoreBtn) {
  miniRestoreBtn.onclick = () => {
    if (window.uniaAPI) {
      window.uniaAPI.toggleMiniPlayer();
      document.querySelector('.app-container').classList.remove('mini-player-active');
      document.body.classList.remove('mini-player-active');
      utilPipBtn.classList.remove('active');
    }
  };
}

const miniCloseBtn = document.getElementById('mini-close-btn');
if (miniCloseBtn) {
  miniCloseBtn.onclick = () => {
    if (window.uniaAPI) {
      window.uniaAPI.close();
    }
  };
}

// Lyrics trigger
if (utilLyricsBtn && lyricsOverlay) {
  utilLyricsBtn.onclick = () => {
    const open = lyricsOverlay.classList.toggle('hidden');
    utilLyricsBtn.classList.toggle('active', !open);

    const contentCenter = document.querySelector('.content-center');
    if (!open) {
      if (contentCenter) {
        contentCenter.scrollTop = 0;
        contentCenter.style.overflowY = 'hidden';
      }
      loadLyricsOverlay();
    } else {
      if (contentCenter) {
        contentCenter.style.overflowY = '';
      }
    }
  };
}

if (closeLyricsBtn && lyricsOverlay) {
  closeLyricsBtn.onclick = () => {
    lyricsOverlay.classList.add('hidden');
    if (utilLyricsBtn) utilLyricsBtn.classList.remove('active');

    const contentCenter = document.querySelector('.content-center');
    if (contentCenter) {
      contentCenter.style.overflowY = '';
    }
  };
}

// Queue trigger
if (utilQueueBtn && rightQueueContent && rightDetailsContent) {
  utilQueueBtn.onclick = () => {
    if (rightQueueContent.classList.contains('hidden')) {
      rightQueueContent.classList.remove('hidden');
      rightDetailsContent.classList.add('hidden');
      utilQueueBtn.classList.add('active');
      document.querySelector('.main-layout').classList.remove('collapsed-right');
      renderQueueList();
    } else {
      rightQueueContent.classList.add('hidden');
      rightDetailsContent.classList.remove('hidden');
      utilQueueBtn.classList.remove('active');
    }
  };
}

if (closeQueueBtn && rightQueueContent && rightDetailsContent) {
  closeQueueBtn.onclick = () => {
    rightQueueContent.classList.add('hidden');
    rightDetailsContent.classList.remove('hidden');
    if (utilQueueBtn) utilQueueBtn.classList.remove('active');

    const sidebarRight = document.querySelector('.sidebar-right');
    if (sidebarRight) sidebarRight.classList.remove('mobile-open');

    const tabQueue = document.getElementById('mobile-tab-queue');
    if (tabQueue) tabQueue.classList.remove('active');

    const activePage = document.querySelector('.home-btn.active') ? 'home' : 'search';
    syncMobileTabs(activePage);
  };
}

// Expose profile functions globally
window.logoutUser = logoutUser;

// ==========================================
// PREMIUM GLOBAL KEYBOARD SHORTCUTS SYSTEM
// ==========================================
document.addEventListener('keydown', (e) => {
  // Ignore shortcuts if the user is typing in an input, textarea or contenteditable element
  const activeEl = document.activeElement;
  if (activeEl && (
    activeEl.tagName === 'INPUT' ||
    activeEl.tagName === 'TEXTAREA' ||
    activeEl.isContentEditable ||
    activeEl.getAttribute('contenteditable') === 'true'
  )) {
    return;
  }

  const key = e.key.toLowerCase();

  // Space or K -> Play/Pause
  if (e.key === ' ' || key === 'k') {
    e.preventDefault();
    handlePlayPause();
    return;
  }

  // ArrowLeft or J -> Seek Backward (5s for Arrow, 10s for J)
  if (e.key === 'ArrowLeft' || key === 'j') {
    e.preventDefault();
    const delta = e.key === 'ArrowLeft' ? -5 : -10;
    seekSeconds(delta);
    return;
  }

  // ArrowRight or L -> Seek Forward (5s for Arrow, 10s for L)
  if (e.key === 'ArrowRight' || key === 'l') {
    e.preventDefault();
    const delta = e.key === 'ArrowRight' ? 5 : 10;
    seekSeconds(delta);
    return;
  }

  // ArrowUp -> Volume Up 10%
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    state.volumeLevel = Math.min(1, state.volumeLevel + 0.1);
    state.isMuted = false;
    syncVolumeSlider();
    return;
  }

  // ArrowDown -> Volume Down 10%
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    state.volumeLevel = Math.max(0, state.volumeLevel - 0.1);
    state.isMuted = false;
    syncVolumeSlider();
    return;
  }

  // M -> Mute/Unmute
  if (key === 'm') {
    e.preventDefault();
    state.isMuted = !state.isMuted;
    syncVolumeSlider();
    return;
  }

  // N -> Next Track (or Shift+N / Ctrl+ArrowRight)
  if (key === 'n' || (e.ctrlKey && e.key === 'ArrowRight')) {
    e.preventDefault();
    handleNext();
    return;
  }

  // P -> Previous Track (or Shift+P / Ctrl+ArrowLeft)
  if (key === 'p' || (e.ctrlKey && e.key === 'ArrowLeft')) {
    e.preventDefault();
    handlePrev();
    return;
  }

  // S or Y -> Toggle Shuffle
  if (key === 's' || key === 'y') {
    e.preventDefault();
    if (shuffleBtn) shuffleBtn.click();
    return;
  }

  // R -> Toggle Repeat
  if (key === 'r') {
    e.preventDefault();
    if (repeatBtn) repeatBtn.click();
    return;
  }

  // F -> Fullscreen Toggle
  if (key === 'f') {
    e.preventDefault();
    if (utilFullscreenBtn) utilFullscreenBtn.click();
    return;
  }

  // Q -> Queue Toggle
  if (key === 'q') {
    e.preventDefault();
    if (utilQueueBtn) utilQueueBtn.click();
    return;
  }
});

// Helper for relative seeking (seconds delta)
function seekSeconds(delta) {
  const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
  if (!activeTrack) return;

  if (activeTrack.isLocal) {
    const dur = localAudio.duration || 0;
    if (dur > 0) {
      localAudio.currentTime = Math.max(0, Math.min(dur, localAudio.currentTime + delta));
      setTimeout(syncDiscordRPC, 50);
      const lyricsOverlay = document.getElementById('lyrics-overlay');
      if (lyricsOverlay && !lyricsOverlay.classList.contains('hidden')) {
        setTimeout(updateLyricsHighlighting, 50);
      }
    }
  } else {
    const player = getYTPlayer();
    if (player && typeof player.getCurrentTime === 'function' && typeof player.getDuration === 'function' && typeof player.seekTo === 'function') {
      const cur = player.getCurrentTime() || 0;
      const dur = player.getDuration() || 0;
      if (dur > 0) {
        player.seekTo(Math.max(0, Math.min(dur, cur + delta)), true);
        setTimeout(syncDiscordRPC, 50);
        const lyricsOverlay = document.getElementById('lyrics-overlay');
        if (lyricsOverlay && !lyricsOverlay.classList.contains('hidden')) {
          setTimeout(updateLyricsHighlighting, 50);
        }
      }
    }
  }
}

// ==========================================
// PREMIUM SLEEP TIMER (UYKU ZAMANLAYICISI)
// ==========================================
const utilSleepBtn = document.getElementById('util-sleep-timer');
const sleepPopup = document.getElementById('sleep-timer-popup');
const sleepOptions = document.querySelectorAll('#sleep-timer-options .sleep-option');
const sleepCountdown = document.getElementById('sleep-timer-countdown');

let sleepTimerId = null;
let sleepTimeRemaining = 0; // in seconds
let sleepTimerType = null; // 'minutes' or 'end-of-song'

if (utilSleepBtn && sleepPopup) {
  utilSleepBtn.onclick = (e) => {
    e.stopPropagation();
    sleepPopup.classList.toggle('hidden');
    utilSleepBtn.classList.toggle('active', !sleepPopup.classList.contains('hidden'));
    
    // Hide other popups if open
    const eqPopup = document.getElementById('eq-popup');
    const utilEqBtn = document.getElementById('util-eq');
    if (eqPopup) eqPopup.classList.add('hidden');
    if (utilEqBtn) utilEqBtn.classList.remove('active');

    const devicesPopup = document.getElementById('devices-popup');
    const utilDeviceBtn = document.getElementById('util-device');
    if (devicesPopup) devicesPopup.classList.add('hidden');
    if (utilDeviceBtn) utilDeviceBtn.classList.remove('active');
  };
  sleepPopup.onclick = (e) => e.stopPropagation();
}

// Click outside closing popups (Updated global listener)
document.addEventListener('click', (e) => {
  const eqPopup = document.getElementById('eq-popup');
  const utilEqBtn = document.getElementById('util-eq');
  const devicesPopup = document.getElementById('devices-popup');
  const utilDeviceBtn = document.getElementById('util-device');

  if (sleepPopup && !sleepPopup.classList.contains('hidden')) {
    const isClickInsideBtn = utilSleepBtn && (e.target === utilSleepBtn || utilSleepBtn.contains(e.target));
    const isClickInsidePopup = sleepPopup.contains(e.target);
    if (!isClickInsideBtn && !isClickInsidePopup) {
      sleepPopup.classList.add('hidden');
      if (utilSleepBtn) utilSleepBtn.classList.remove('active');
    }
  }
  
  if (eqPopup && !eqPopup.classList.contains('hidden')) {
    const isClickInsideBtn = utilEqBtn && (e.target === utilEqBtn || utilEqBtn.contains(e.target));
    const isClickInsidePopup = eqPopup.contains(e.target);
    if (!isClickInsideBtn && !isClickInsidePopup) {
      eqPopup.classList.add('hidden');
      if (utilEqBtn) utilEqBtn.classList.remove('active');
    }
  }
  
  if (devicesPopup && !devicesPopup.classList.contains('hidden')) {
    const isClickInsideBtn = utilDeviceBtn && (e.target === utilDeviceBtn || utilDeviceBtn.contains(e.target));
    const isClickInsidePopup = devicesPopup.contains(e.target);
    if (!isClickInsideBtn && !isClickInsidePopup) {
      devicesPopup.classList.add('hidden');
      if (utilDeviceBtn) utilDeviceBtn.classList.remove('active');
    }
  }
});

function updateSleepTimerUI() {
  if (!sleepOptions) return;
  sleepOptions.forEach(opt => {
    const optTime = opt.getAttribute('data-time');
    const isActive = (sleepTimerType === 'minutes' && parseInt(optTime) > 0 && sleepTimeRemaining > 0 && Math.ceil(sleepTimeRemaining / 60) === parseInt(optTime)) ||
                     (sleepTimerType === 'end-of-song' && optTime === 'end-of-song') ||
                     ((!sleepTimerType || (sleepTimerType === 'minutes' && sleepTimeRemaining <= 0)) && optTime === '0');
    
    if (isActive) {
      opt.classList.add('active');
      opt.style.color = 'var(--primary-accent)';
      opt.style.background = 'rgba(255, 255, 255, 0.05)';
    } else {
      opt.classList.remove('active');
      opt.style.color = 'var(--text-muted)';
      opt.style.background = 'transparent';
    }
  });

  if (sleepTimeRemaining > 0) {
    const mins = Math.floor(sleepTimeRemaining / 60);
    const secs = sleepTimeRemaining % 60;
    if (sleepCountdown) sleepCountdown.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    if (utilSleepBtn) {
      utilSleepBtn.classList.add('active-timer');
      utilSleepBtn.style.color = 'var(--primary-accent)';
    }
  } else if (sleepTimerType === 'end-of-song') {
    if (sleepCountdown) sleepCountdown.textContent = 'Şarkı Sonu';
    if (utilSleepBtn) {
      utilSleepBtn.classList.add('active-timer');
      utilSleepBtn.style.color = 'var(--primary-accent)';
    }
  } else {
    if (sleepCountdown) sleepCountdown.textContent = '';
    if (utilSleepBtn) {
      utilSleepBtn.classList.remove('active-timer');
      utilSleepBtn.style.color = '';
    }
  }
}

function startMinutesSleepTimer(minutes) {
  if (sleepTimerId) clearInterval(sleepTimerId);
  sleepTimerType = 'minutes';
  sleepTimeRemaining = minutes * 60;
  
  updateSleepTimerUI();
  showToast(`Uyku Zamanlayıcısı: ${minutes} dakika sonra müzik duracak.`);

  sleepTimerId = setInterval(() => {
    if (sleepTimeRemaining > 0) {
      sleepTimeRemaining--;
      updateSleepTimerUI();
      if (sleepTimeRemaining <= 0) {
        triggerSleepStop();
      }
    }
  }, 1000);
}

function triggerSleepStop() {
  if (sleepTimerId) {
    clearInterval(sleepTimerId);
    sleepTimerId = null;
  }
  sleepTimerType = null;
  sleepTimeRemaining = 0;
  updateSleepTimerUI();
  
  showToast('Uyku zamanı geldi! Müzik yavaşça durduruluyor...');

  // Smoothly fade volume out
  let currentVol = state.volumeLevel;
  let steps = 10;
  let fadeInterval = setInterval(() => {
    if (steps > 0) {
      steps--;
      const targetVol = currentVol * (steps / 10);
      if (state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] && state.currentTrackList[state.currentTrackIndex].isLocal) {
        localAudio.volume = targetVol;
      } else {
        const player = getYTPlayer();
        if (player && typeof player.setVolume === 'function') {
          player.setVolume(targetVol * 100);
        }
      }
    } else {
      clearInterval(fadeInterval);
      handlePlayPause(); // Pauses playback
      showToast('Uyku zamanı: Müzik durduruldu.');
      
      // Restore original volume
      setTimeout(() => {
        if (state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] && state.currentTrackList[state.currentTrackIndex].isLocal) {
          localAudio.volume = currentVol;
        } else {
          const player = getYTPlayer();
          if (player && typeof player.setVolume === 'function') {
            player.setVolume(currentVol * 100);
          }
        }
        syncVolumeSlider();
      }, 500);
    }
  }, 300);
}

// Track end hook implementation
window.onTrackFinished = () => {
  if (sleepTimerType === 'end-of-song') {
    triggerSleepStop();
    return true; // Handled!
  }
  return false;
};

if (sleepOptions) {
  sleepOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      const timeVal = opt.getAttribute('data-time');
      if (timeVal === '0') {
        if (sleepTimerId) clearInterval(sleepTimerId);
        sleepTimerId = null;
        sleepTimerType = null;
        sleepTimeRemaining = 0;
        updateSleepTimerUI();
        showToast('Uyku Zamanlayıcısı Kapatıldı.');
      } else if (timeVal === 'end-of-song') {
        if (sleepTimerId) clearInterval(sleepTimerId);
        sleepTimerId = null;
        sleepTimerType = 'end-of-song';
        sleepTimeRemaining = 0;
        updateSleepTimerUI();
        showToast('Uyku Zamanlayıcısı: Şarkı bittiğinde müzik duracak.');
      } else {
        const minutes = parseInt(timeVal);
        startMinutesSleepTimer(minutes);
      }
      if (sleepPopup) sleepPopup.classList.add('hidden');
      if (utilSleepBtn) utilSleepBtn.classList.remove('active');
    });
  });
}
