// ==========================================
// UNIA - AUDIO & VIDEO PLAYBACK CORE MODULE
// ==========================================

import { state, saveLastPlayedState } from './state.js';
import { updateDynamicTheme, updateDynamicBackground, extractColorsFromArtwork } from './theme.js';
import { updatePlayerUI, revealPlayerUI, renderQueueList, loadLyricsOverlay, updateLyricsHighlighting, updateActiveCardsProgressBar, safeCreateIcons, showToast, formatTime, loadSonCalinanlarSlider } from './ui-renderers.js';

// Local audio and EQ objects
export const localAudio = new Audio();
export let eqFilters = [];
const EQ_FREQUENCIES = [60, 230, 910, 4000, 14000];

let audioCtx = null;
let analyserNode = null;
let sourceNode = null;
let isAudioAnalysable = false;

export function getAudioContext() { return audioCtx; }
export function getAnalyserNode() { return analyserNode; }

// Initialize 5-band EQ
export function initEqualizer() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Failed to init AudioContext for EQ:', e);
      return;
    }
  }

  if (eqFilters.length === 0 && audioCtx) {
    try {
      let lastNode = audioCtx.createMediaElementSource(localAudio);

      EQ_FREQUENCIES.forEach((freq, i) => {
        const filter = audioCtx.createBiquadFilter();
        filter.frequency.value = freq;
        if (i === 0) {
          filter.type = 'lowshelf';
        } else if (i === EQ_FREQUENCIES.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
          filter.Q.value = 1.0;
        }
        filter.gain.value = 0; // Flat
        eqFilters.push(filter);

        lastNode.connect(filter);
        lastNode = filter;
      });

      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 256;
      lastNode.connect(analyserNode);
      analyserNode.connect(audioCtx.destination);

      isAudioAnalysable = true;
      console.log('[EQ] 5-Band Equalizer connected to localAudio!');
    } catch (e) {
      console.warn('Failed to connect Audio EQ nodes:', e);
    }
  }
}

// YT IFrame Playback ready handlers
let ytPlayer = null;

export function getYTPlayer() { return ytPlayer; }

window.onYouTubeIframeAPIReady = () => {
  ytPlayer = new YT.Player('youtube-player-placeholder', {
    height: '100%',
    width: '100%',
    videoId: '',
    playerVars: {
      'playsinline': 1,
      'controls': 0,
      'disablekb': 1,
      'fs': 0,
      'rel': 0,
      'showinfo': 0,
      'iv_load_policy': 3,
      'autoplay': 0,
      'modestbranding': 1
    },
    events: {
      'onReady': () => {
        state.ytPlayerReady = true;
        console.log('[YT Player] API Ready!');
        if (ytPlayer && ytPlayer.setVolume) {
          ytPlayer.setVolume(state.isMuted ? 0 : state.volumeLevel * 100);
        }
        if (state.pendingTrackVideoId !== null && ytPlayer && ytPlayer.loadVideoById) {
          console.log('[YT Player] Loading pending track:', state.pendingTrackVideoId);
          ytPlayer.loadVideoById(state.pendingTrackVideoId);
          state.isAudioLoadedInPlayer = true;
          state.pendingTrackVideoId = null;
          state.isPlaying = true;
          syncPlayStateUI();
        }
        if (state.pendingSeekTime !== null && ytPlayer && ytPlayer.seekTo) {
          ytPlayer.seekTo(state.pendingSeekTime, true);
          state.pendingSeekTime = null;
        }
      },
      'onStateChange': (event) => {
        if (event.data === YT.PlayerState.ENDED) {
          if (window.onTrackFinished && window.onTrackFinished()) {
            return;
          }
          if (state.isRepeat) {
            if (state.ytPlayerReady && ytPlayer && ytPlayer.seekTo && ytPlayer.playVideo) {
              ytPlayer.seekTo(0);
              ytPlayer.playVideo();
              state.isPlaying = true;
              syncPlayStateUI();
            } else {
              loadAndPlayTrack();
            }
          } else {
            if (state.currentTrackIndex >= state.currentTrackList.length - 1) {
              state.isPlaying = false;
              syncPlayStateUI();
              showToast('Sıra sonuna ulaşıldı.');
              syncDiscordRPC();
            } else {
              state.isPlaying = false;
              syncPlayStateUI();
              setTimeout(handleNext, 500);
            }
          }
        } else if (event.data === YT.PlayerState.PLAYING) {
          state.isPlaying = true;
          syncPlayStateUI();
          const bannerOverlay = document.querySelector('.banner-overlay');
          if (bannerOverlay) {
            bannerOverlay.classList.add('video-playing');
          }
        } else if (event.data === YT.PlayerState.PAUSED) {
          state.isPlaying = false;
          syncPlayStateUI();
          const bannerOverlay = document.querySelector('.banner-overlay');
          if (bannerOverlay) {
            bannerOverlay.classList.remove('video-playing');
          }
        }
      },
      'onError': (e) => {
        console.error('[YT Player] Error:', e.data);
        showToast('Şarkı yüklenemedi. Sonrakine geçiliyor...');
        setTimeout(handleNext, 1500);
      }
    }
  });
};

// Load YouTube IFrame Player API
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// Dynamically inject styles into YouTube IFrame DOM
function injectVisualStylesIntoIframe() {
  try {
    const iframe = document.querySelector('.banner-overlay iframe');
    if (iframe && iframe.contentDocument) {
      const doc = iframe.contentDocument;
      if (!doc.getElementById('unia-custom-yt-styles')) {
        const style = doc.createElement('style');
        style.id = 'unia-custom-yt-styles';
        style.innerHTML = `
          .ytp-large-play-button,
          .ytp-chrome-top,
          .ytp-chrome-bottom,
          .ytp-watermark,
          .ytp-youtube-button,
          .ytp-pause-overlay,
          .ytp-pause-overlay-container,
          .ytp-scroll-min,
          .ytp-gradient-top,
          .ytp-gradient-bottom,
          .ytp-bezel,
          .ytp-bezel-text,
          .ytp-spinner {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
          }
        `;
        doc.head.appendChild(style);
      }
    }
  } catch (e) { }
}
setInterval(injectVisualStylesIntoIframe, 800);

// Resolve YouTube video IDs from Deezer metadata
export async function resolveVideoId(track) {
  const key = `${track.artistName}|||${track.trackName}`;
  if (state.videoIdCache[key]) return state.videoIdCache[key];

  if (track.videoId) {
    state.videoIdCache[key] = [track.videoId];
    return [track.videoId];
  }
  // Check if trackId is a valid YouTube video ID (exactly 11 chars and not a pure number)
  const isYtId = track.trackId && track.trackId.toString().length === 11 && !/^\d+$/.test(track.trackId.toString());
  if (isYtId) {
    state.videoIdCache[key] = [track.trackId];
    return [track.trackId];
  }

  const query = `${track.artistName} ${track.trackName}`;

  // Check if we are running in native mobile WebView environment
  const isMobile = window.isAndroidNative || window.AndroidBridge || navigator.userAgent.includes('Android') || (window.location.protocol === 'https:' && window.location.hostname.includes('android'));
  
  if (isMobile && window.AndroidBridge && typeof window.AndroidBridge.resolveVideoIdNative === 'function') {
    try {
      console.log('[MobileResolve] Resolving videoId via AndroidBridge for track:', track.trackName);
      const vid = window.AndroidBridge.resolveVideoIdNative(track.artistName, track.trackName);
      if (vid) {
        console.log('[MobileResolve] Resolved videoId via AndroidBridge:', vid);
        state.videoIdCache[key] = [vid];
        return [vid];
      }
    } catch(e) {
      console.warn('Native resolveVideoIdNative failed:', e);
    }
  }

  if (isMobile && window.uniaAPI?.searchYouTube) {
    try {
      console.log('[MobileResolve] Resolving videoId via Piped for query:', query);
      const data = await window.uniaAPI.searchYouTube(query);
      if (data && data.videos && data.videos.length > 0) {
        const trackNameLower = track.trackName.toLowerCase().trim();
        let filtered = data.videos.filter(v => v.title.toLowerCase().includes(trackNameLower));

        if (filtered.length === 0) {
          const words = trackNameLower.split(' ').sort((a, b) => b.length - a.length);
          if (words.length > 0 && words[0].length > 3) {
            filtered = data.videos.filter(v => v.title.toLowerCase().includes(words[0]));
          }
        }

        if (filtered.length === 0) {
          filtered = [data.videos[0]];
        }

        const validIds = filtered.map(v => v.id);
        state.videoIdCache[key] = validIds;
        return validIds;
      }
    } catch(e) {
      console.warn('Mobile resolveVideoId failed:', e);
    }
    return [];
  }

  const url = `http://localhost:3000/api/stream?q=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.videos) {
      const trackNameLower = track.trackName.toLowerCase().trim();
      let filtered = data.videos.filter(v => v.title.toLowerCase().includes(trackNameLower));

      if (filtered.length === 0) {
        const words = trackNameLower.split(' ').sort((a, b) => b.length - a.length);
        if (words.length > 0 && words[0].length > 3) {
          filtered = data.videos.filter(v => v.title.toLowerCase().includes(words[0]));
        }
      }

      if (filtered.length === 0) {
        filtered = [data.videos[0]];
      }

      const validIds = filtered.map(v => v.id);
      state.videoIdCache[key] = validIds;
      return validIds;
    } else if (data.videoIds) {
      state.videoIdCache[key] = data.videoIds;
      return data.videoIds;
    } else if (data.videoId) {
      state.videoIdCache[key] = [data.videoId];
      return [data.videoId];
    }
  } catch (e) {
    console.warn('API stream failed:', e);
  }
  return [];
}

// Sync Play state UI icons
export function syncPlayStateUI() {
  const playIcon = document.getElementById('play-icon');
  const pauseIcon = document.getElementById('pause-icon');

  if (state.isPlaying) {
    if (playIcon) playIcon.classList.add('hidden');
    if (pauseIcon) pauseIcon.classList.remove('hidden');
    state.hasStartedPlaying = true;
    const bannerGraphic = document.querySelector('.banner-graphic');
    if (bannerGraphic) bannerGraphic.classList.remove('hidden');
  } else {
    if (playIcon) playIcon.classList.remove('hidden');
    if (pauseIcon) pauseIcon.classList.add('hidden');
  }

  // Sync Mobile Players play/pause icons
  const mobMiniPlayBtn = document.getElementById('mobile-mini-play');
  const mobMainPlayBtn = document.getElementById('mobile-play-pause');
  if (mobMiniPlayBtn) {
    mobMiniPlayBtn.innerHTML = state.isPlaying
      ? '<i data-lucide="pause" style="width:16px; height:16px; fill:currentColor;"></i>'
      : '<i data-lucide="play" style="width:16px; height:16px; fill:currentColor;"></i>';
  }
  if (mobMainPlayBtn) {
    mobMainPlayBtn.innerHTML = state.isPlaying
      ? '<i data-lucide="pause" style="width:26px; height:26px; fill:currentColor; stroke-width:2.2px;"></i>'
      : '<i data-lucide="play" style="width:26px; height:26px; fill:currentColor; stroke-width:2.2px;"></i>';
  }

  const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
  if (activeTrack) {
    updatePlayerUI();
  }

  // Sync playlist-play-large icon
  const playlistPlayLarge = document.getElementById('playlist-play-large');
  if (playlistPlayLarge) {
    const holder = document.getElementById('page-content-holder');
    const currentPage = holder ? holder.dataset.currentPage : '';
    let currentViewedPlaylistId = '';
    if (currentPage === 'playlist' && window.currentViewedPlaylist) {
      currentViewedPlaylistId = window.currentViewedPlaylist.id;
    } else if (currentPage === 'liked-songs') {
      currentViewedPlaylistId = 'liked';
    } else if (currentPage === 'local-files') {
      currentViewedPlaylistId = 'local';
    }

    if (currentViewedPlaylistId && state.playingPlaylistId === currentViewedPlaylistId) {
      playlistPlayLarge.innerHTML = state.isPlaying
        ? `<i data-lucide="pause" style="fill:currentColor;"></i>`
        : `<i data-lucide="play" style="fill:currentColor;"></i>`;
    } else {
      playlistPlayLarge.innerHTML = `<i data-lucide="play" style="fill:currentColor;"></i>`;
    }
    safeCreateIcons();
  }

  // Sync grid card play buttons
  const gridCards = document.querySelectorAll('.quick-grid .grid-card');
  gridCards.forEach(card => {
    const track = card._track;
    if (track) {
      const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
      const isActive = activeTrack && track.trackId === activeTrack.trackId;
      const playBtn = card.querySelector('.card-play-btn');
      const progressContainer = card.querySelector('.card-progress-container');
      if (playBtn) {
        playBtn.title = isActive && state.isPlaying ? 'Duraklat' : 'Çal';
        playBtn.innerHTML = isActive && state.isPlaying
          ? `<i data-lucide="pause" style="fill: currentColor;"></i>`
          : `<i data-lucide="play" style="fill: currentColor;"></i>`;
      }
      if (progressContainer) {
        if (isActive) {
          progressContainer.classList.remove('hidden');
        } else {
          progressContainer.classList.add('hidden');
        }
      }
    }
  });

  // Sync recommended cards play buttons
  const recCards = document.querySelectorAll('.today-rec-container .today-rec-card');
  recCards.forEach(card => {
    const track = card._track;
    if (track) {
      const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
      const isActive = activeTrack && track.trackId === activeTrack.trackId;
      const playBtn = card.querySelector('.card-play-btn');
      const progressContainer = card.querySelector('.card-progress-container');
      if (playBtn) {
        playBtn.style.opacity = isActive && state.isPlaying ? '1' : '0';
        playBtn.title = isActive && state.isPlaying ? 'Duraklat' : 'Çal';
        playBtn.innerHTML = isActive && state.isPlaying
          ? `<i data-lucide="pause" style="fill: currentColor;"></i>`
          : `<i data-lucide="play" style="fill: currentColor;"></i>`;
      }
      if (progressContainer) {
        if (isActive) {
          progressContainer.classList.remove('hidden');
        } else {
          progressContainer.classList.add('hidden');
        }
      }
    }
  });

  // Sync track rows playing state (both in playlists and search rows)
  const trackRows = document.querySelectorAll('.track-row:not(.header), .search-row-item');
  trackRows.forEach(row => {
    const track = row._track;
    if (track) {
      const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
      const isActive = activeTrack && track.trackId === activeTrack.trackId;

      if (isActive) {
        row.classList.add('active');
        if (state.isPlaying) {
          row.classList.add('playing');
        } else {
          row.classList.remove('playing');
        }
      } else {
        row.classList.remove('active', 'playing');
      }
    }
  });

  // Sync Mini Player
  const miniPlayPauseBtn = document.getElementById('mini-play-pause');
  if (miniPlayPauseBtn) {
    miniPlayPauseBtn.innerHTML = state.isPlaying
      ? `<i data-lucide="pause" style="width:12px; height:12px; fill:currentColor;"></i>`
      : `<i data-lucide="play" style="width:12px; height:12px; fill:currentColor;"></i>`;
  }
  safeCreateIcons();
}

// Sync Discord RPC Integration
export function syncDiscordRPC() {
  if (!window.uniaAPI?.rpcUpdatePlayback) return;

  const customId = localStorage.getItem('unia_discord_client_id') || '1510411749013061722';
  if (!customId) {
    window.uniaAPI.rpcClear().catch(() => { });
    return;
  }

  if (state.currentTrackIndex < 0 || !state.currentTrackList[state.currentTrackIndex]) {
    window.uniaAPI.rpcClear().catch(() => { });
    return;
  }

  const track = state.currentTrackList[state.currentTrackIndex];
  const curTimeMs = track.isLocal ? Math.floor((localAudio.currentTime || 0) * 1000) : ((ytPlayer && ytPlayer.getCurrentTime) ? Math.floor(ytPlayer.getCurrentTime() * 1000) : 0);
  const durationMs = track.isLocal ? Math.floor((localAudio.duration || 0) * 1000) || track.trackTimeMillis : (track.trackTimeMillis || 180000);

  window.uniaAPI.rpcUpdatePlayback(
    customId,
    track.trackName,
    track.artistName,
    durationMs,
    curTimeMs,
    state.isPlaying
  ).catch((e) => { console.warn('Discord RPC Sync Failed:', e); });
}

// Load and play track
export async function loadAndPlayTrack() {
  if (state.currentTrackIndex < 0 || !state.currentTrackList[state.currentTrackIndex]) return;
  const track = state.currentTrackList[state.currentTrackIndex];

  if (window.isAndroidNative || window.AndroidBridge) {
    revealPlayerUI();
    updatePlayerUI();
    saveLastPlayedState(ytPlayer);

    showToast('Şarkı yükleniyor...');

    // Call native Android bridge instantly
    if (window.AndroidBridge && window.AndroidBridge.playTrack) {
      window.AndroidBridge.playTrack(JSON.stringify(track));
    }

    // Save to persistent storage (mobile or PC database)
    if (window.isAndroidNative || window.AndroidBridge) {
      if (window.AndroidBridge && window.AndroidBridge.addRecentlyPlayed) {
        window.AndroidBridge.addRecentlyPlayed(JSON.stringify(track));
      }
    } else if (window.uniaAPI && window.uniaAPI.dbAddRecentlyPlayed) {
      window.uniaAPI.dbAddRecentlyPlayed('unia_local_user', track).catch(() => { });
    }

    // Save local recents as redundancy
    try {
      let localRecent = JSON.parse(localStorage.getItem('unia_recently_played') || '[]');
      localRecent = localRecent.filter(t => String(t.trackId) !== String(track.trackId));
      localRecent.unshift(track);
      if (localRecent.length > 20) localRecent.pop();
      localStorage.setItem('unia_recently_played', JSON.stringify(localRecent));
      loadSonCalinanlarSlider();
    } catch (e) {
      console.warn(e);
    }

    const queueContent = document.getElementById('right-queue-content');
    const lyricsOverlay = document.getElementById('lyrics-overlay');
    if (queueContent && !queueContent.classList.contains('hidden')) renderQueueList();
    if (lyricsOverlay && !lyricsOverlay.classList.contains('hidden')) loadLyricsOverlay();
    return;
  }

  state.backupAttempts = 0;

  revealPlayerUI();

  state.hasStartedPlaying = true;
  const bannerGraphic = document.querySelector('.banner-graphic');
  if (bannerGraphic) bannerGraphic.classList.remove('hidden');

  const bannerOverlay = document.querySelector('.banner-overlay');
  if (bannerOverlay) bannerOverlay.classList.remove('video-playing');

  updatePlayerUI();
  saveLastPlayedState(ytPlayer);
  syncDiscordRPC();

  // Color Extraction
  if (track.artworkUrl100) {
    extractColorsFromArtwork(track.artworkUrl100).then(color => {
      if (color) {
        updateDynamicTheme(color.r, color.g, color.b);
      } else {
        updateDynamicTheme();
      }
    });
  } else {
    updateDynamicTheme();
  }

  const userId = (state.currentUser && state.currentUser.id) ? state.currentUser.id : 'unia_local_user';
  if (window.uniaAPI?.dbAddRecentlyPlayed) {
    window.uniaAPI.dbAddRecentlyPlayed(userId, track).catch(() => { });
  }

  // Save local recents
  try {
    let localRecent = JSON.parse(localStorage.getItem('unia_recently_played') || '[]');
    localRecent = localRecent.filter(t => String(t.trackId) !== String(track.trackId));
    localRecent.unshift(track);
    if (localRecent.length > 20) localRecent.pop();
    localStorage.setItem('unia_recently_played', JSON.stringify(localRecent));
    loadSonCalinanlarSlider();
  } catch (e) {
    console.warn(e);
  }

  // Local Offline file play
  if (track.isLocal) {
    if (state.ytPlayerReady && ytPlayer && ytPlayer.pauseVideo) {
      try { ytPlayer.pauseVideo(); } catch (e) { }
    }
    const bannerOverlay = document.querySelector('.banner-overlay');
    if (bannerOverlay) bannerOverlay.classList.remove('video-playing');

    localAudio.src = track.localPath;
    localAudio.volume = state.isMuted ? 0 : state.volumeLevel;

    if (eqFilters.length === 0) {
      initEqualizer();
    }

    localAudio.play()
      .then(() => {
        state.isAudioLoadedInPlayer = true;
        state.isPlaying = true;
        syncPlayStateUI();
        syncDiscordRPC();
      })
      .catch(err => {
        console.error(err);
        showToast('Yerel dosya oynatılamadı. Sonrakine geçiliyor...');
        setTimeout(handleNext, 1500);
      });

    const queueContent = document.getElementById('right-queue-content');
    const lyricsOverlay = document.getElementById('lyrics-overlay');
    if (queueContent && !queueContent.classList.contains('hidden')) renderQueueList();
    if (lyricsOverlay && !lyricsOverlay.classList.contains('hidden')) loadLyricsOverlay();
    return;
  } else {
    localAudio.pause();
    localAudio.src = '';
  }

  const queueContent = document.getElementById('right-queue-content');
  const lyricsOverlay = document.getElementById('lyrics-overlay');
  if (queueContent && !queueContent.classList.contains('hidden')) renderQueueList();
  if (lyricsOverlay && !lyricsOverlay.classList.contains('hidden')) loadLyricsOverlay();

  showToast('Şarkı yükleniyor...');
  let videoIds = await resolveVideoId(track);

  if (!videoIds || videoIds.length === 0) {
    showToast('Şarkı bulunamadı. Sonrakine geçiliyor...');
    setTimeout(handleNext, 1500);
    return;
  }

  window.currentVideoIds = videoIds;
  window.currentVideoIdIndex = 0;
  let videoId = videoIds[0];

  try {
    if (state.ytPlayerReady && ytPlayer && ytPlayer.loadVideoById) {
      ytPlayer.loadVideoById(videoId);
      state.isAudioLoadedInPlayer = true;
      ytPlayer.setVolume(state.isMuted ? 0 : state.volumeLevel * 100);
      state.isPlaying = true;
      syncPlayStateUI();
    } else {
      state.pendingTrackVideoId = videoId;
      showToast('Oynatıcı hazırlanıyor...');
    }
  } catch (err) {
    console.error(err);
    showToast('Şarkı yüklenemedi. Sonrakine geçiliyor...');
    setTimeout(handleNext, 1500);
  }
}

// Trigger Play / Pause
export function handlePlayPause() {
  if (window.isAndroidNative || window.AndroidBridge) {
    if (window.AndroidBridge) {
      if (state.isPlaying) {
        window.AndroidBridge.pauseTrack();
      } else {
        window.AndroidBridge.resumeTrack();
      }
    }
    return;
  }

  if (state.currentTrackIndex === -1 && state.currentTrackList.length > 0) {
    state.currentTrackIndex = 0;
    loadAndPlayTrack();
    return;
  }

  const track = state.currentTrackList[state.currentTrackIndex];
  if (!state.isAudioLoadedInPlayer && track) {
    loadAndPlayTrack();
    return;
  }

  if (track && track.isLocal) {
    if (state.isPlaying) {
      localAudio.pause();
      state.isPlaying = false;
    } else {
      localAudio.play().catch(e => console.warn(e));
      state.isPlaying = true;
    }
    syncPlayStateUI();
    syncDiscordRPC();
    return;
  }

  if (state.isPlaying) {
    if (state.ytPlayerReady && ytPlayer && ytPlayer.pauseVideo) {
      ytPlayer.pauseVideo();
    }
    state.isPlaying = false;
    syncPlayStateUI();
  } else {
    if (state.ytPlayerReady && ytPlayer && ytPlayer.playVideo) {
      ytPlayer.playVideo();
    }
    state.isPlaying = true;
    syncPlayStateUI();
  }
  syncDiscordRPC();
}

// Trigger Next
export function handleNext() {
  if (state.currentTrackList.length === 0) return;
  if (state.isShuffle) {
    state.currentTrackIndex = Math.floor(Math.random() * state.currentTrackList.length);
  } else {
    state.currentTrackIndex = (state.currentTrackIndex + 1) % state.currentTrackList.length;
  }
  loadAndPlayTrack();
}

// Trigger Previous
export function handlePrev() {
  if (state.currentTrackList.length === 0) return;
  const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
  const curTime = (activeTrack && activeTrack.isLocal) ? (localAudio.currentTime || 0) : ((ytPlayer && ytPlayer.getCurrentTime) ? ytPlayer.getCurrentTime() : 0);

  if (curTime > 3) {
    if (activeTrack && activeTrack.isLocal) {
      localAudio.currentTime = 0;
    } else {
      if (ytPlayer && ytPlayer.seekTo) {
        ytPlayer.seekTo(0, true);
      } else {
        loadAndPlayTrack();
      }
    }
  } else {
    state.currentTrackIndex = (state.currentTrackIndex - 1 + state.currentTrackList.length) % state.currentTrackList.length;
    loadAndPlayTrack();
  }
}

// Seek position
export function seekToPercent(pct) {
  if (window.isAndroidNative || window.AndroidBridge) {
    const track = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
    const dur = track ? (track.trackTimeMillis / 1000) : 0;
    if (dur > 0 && window.AndroidBridge && window.AndroidBridge.seekTo) {
      window.AndroidBridge.seekTo(pct * dur);
    }
    return;
  }

  const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
  const isLocalPlaying = activeTrack && activeTrack.isLocal;

  if (isLocalPlaying) {
    const dur = localAudio.duration || 0;
    if (dur > 0) {
      localAudio.currentTime = pct * dur;
      setTimeout(syncDiscordRPC, 50);
      const lyricsOverlay = document.getElementById('lyrics-overlay');
      if (lyricsOverlay && !lyricsOverlay.classList.contains('hidden')) {
        setTimeout(updateLyricsHighlighting, 50);
      }
    }
  } else {
    if (state.ytPlayerReady && ytPlayer && ytPlayer.getDuration) {
      const dur = ytPlayer.getDuration() || 0;
      if (dur > 0) {
        ytPlayer.seekTo(pct * dur, true);
        setTimeout(syncDiscordRPC, 50);
        const lyricsOverlay = document.getElementById('lyrics-overlay');
        if (lyricsOverlay && !lyricsOverlay.classList.contains('hidden')) {
          setTimeout(updateLyricsHighlighting, 50);
        }
      }
    }
  }
}

// Sync volume slider UI
export function syncVolumeSlider() {
  if (window.isAndroidNative || window.AndroidBridge) {
    const displayPct = state.isMuted ? 0 : state.volumeLevel * 100;
    const volumeFill = document.getElementById('volume-fill');
    const volumeThumb = document.getElementById('volume-thumb');
    if (volumeFill) volumeFill.style.width = `${displayPct}%`;
    if (volumeThumb) volumeThumb.style.left = `${displayPct}%`;

    const mobVolFill = document.getElementById('mobile-volume-fill');
    const mobVolThumb = document.getElementById('mobile-volume-thumb');
    if (mobVolFill) mobVolFill.style.width = `${displayPct}%`;
    if (mobVolThumb) mobVolThumb.style.left = `${displayPct}%`;

    if (window.AndroidBridge && window.AndroidBridge.setVolume) {
      window.AndroidBridge.setVolume(state.isMuted ? 0.0 : state.volumeLevel);
    }
    return;
  }

  const displayPct = state.isMuted ? 0 : state.volumeLevel * 100;

  const volumeFill = document.getElementById('volume-fill');
  const volumeThumb = document.getElementById('volume-thumb');
  if (volumeFill) volumeFill.style.width = `${displayPct}%`;
  if (volumeThumb) volumeThumb.style.left = `${displayPct}%`;

  const mobVolFill = document.getElementById('mobile-volume-fill');
  const mobVolThumb = document.getElementById('mobile-volume-thumb');
  if (mobVolFill) mobVolFill.style.width = `${displayPct}%`;
  if (mobVolThumb) mobVolThumb.style.left = `${displayPct}%`;

  if (state.ytPlayerReady && ytPlayer && ytPlayer.setVolume) {
    ytPlayer.setVolume(state.isMuted ? 0 : state.volumeLevel * 100);
  }

  if (localAudio) {
    localAudio.volume = state.isMuted ? 0 : state.volumeLevel;
  }

  const volHighIcon = document.getElementById('vol-high');
  const volMuteIcon = document.getElementById('vol-mute');
  if (state.isMuted || state.volumeLevel === 0) {
    if (volHighIcon) volHighIcon.classList.add('hidden');
    if (volMuteIcon) volMuteIcon.classList.remove('hidden');
  } else {
    if (volHighIcon) volHighIcon.classList.remove('hidden');
    if (volMuteIcon) volMuteIcon.classList.add('hidden');
  }
}

export function getSliderPercent(e, el) {
  const rect = el.getBoundingClientRect();
  const x = e.touches ? e.touches[0].clientX : e.clientX;
  return Math.max(0, Math.min(1, (x - rect.left) / rect.width));
}

// Local Audio Oynatıcı sonlanma olayı
localAudio.addEventListener('ended', () => {
  if (window.onTrackFinished && window.onTrackFinished()) {
    return;
  }
  if (state.isRepeat) {
    localAudio.currentTime = 0;
    localAudio.play().catch(e => console.warn(e));
  } else {
    if (state.currentTrackIndex >= state.currentTrackList.length - 1) {
      state.isPlaying = false;
      syncPlayStateUI();
      showToast('Sıra sonuna ulaşıldı.');
      syncDiscordRPC();
    } else {
      state.isPlaying = false;
      syncPlayStateUI();
      setTimeout(handleNext, 500);
    }
  }
});

// Periodic timeline update loop (every 100ms)
setInterval(() => {
  if (window.isDraggingTimeline) return;
  const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
  const isLocalPlaying = activeTrack && activeTrack.isLocal;
  const timelineFill = document.getElementById('timeline-fill');
  const timelineThumb = document.getElementById('timeline-thumb');
  const timeElapsedLabel = document.getElementById('time-elapsed');
  const timeDurationLabel = document.getElementById('time-duration');

  if (isLocalPlaying) {
    if (state.isPlaying) {
      const cur = localAudio.currentTime || 0;
      const dur = localAudio.duration || 0;
      if (dur > 0) {
        const pct = cur / dur;
        if (timelineFill) timelineFill.style.width = `${pct * 100}%`;
        if (timelineThumb) timelineThumb.style.left = `${pct * 100}%`;
        if (timeElapsedLabel) timeElapsedLabel.textContent = formatTime(Math.floor(cur));
        if (timeDurationLabel) timeDurationLabel.textContent = formatTime(Math.floor(dur));
        updateActiveCardsProgressBar(pct);

        const miniFill = document.getElementById('mini-timeline-fill');
        const miniElapsed = document.getElementById('mini-time-elapsed');
        const miniDuration = document.getElementById('mini-time-duration');
        if (miniFill) miniFill.style.width = `${pct * 100}%`;
        if (miniElapsed) miniElapsed.textContent = formatTime(Math.floor(cur));
        if (miniDuration) miniDuration.textContent = formatTime(Math.floor(dur));

        const mobFill = document.getElementById('mobile-timeline-fill');
        const mobThumb = document.getElementById('mobile-timeline-thumb');
        const mobElapsed = document.getElementById('mobile-current-time');
        const mobDuration = document.getElementById('mobile-duration');
        if (mobFill) mobFill.style.width = `${pct * 100}%`;
        if (mobThumb) mobThumb.style.left = `${pct * 100}%`;
        if (mobElapsed) mobElapsed.textContent = formatTime(Math.floor(cur));
        if (mobDuration) mobDuration.textContent = formatTime(Math.floor(dur));

        const mobMiniProgressFill = document.getElementById('mobile-mini-progress-fill');
        if (mobMiniProgressFill) mobMiniProgressFill.style.width = `${pct * 100}%`;

        const lyricsOverlay = document.getElementById('lyrics-overlay');
        if (lyricsOverlay && !lyricsOverlay.classList.contains('hidden')) {
          updateLyricsHighlighting();
        }
      }
      localStorage.setItem('unia_last_played_time', Math.floor(cur).toString());
    }
  } else {
    if (state.ytPlayerReady && ytPlayer && ytPlayer.getCurrentTime && state.isPlaying) {
      const cur = ytPlayer.getCurrentTime() || 0;
      const dur = ytPlayer.getDuration() || 0;
      if (dur > 0) {
        const pct = cur / dur;
        if (timelineFill) timelineFill.style.width = `${pct * 100}%`;
        if (timelineThumb) timelineThumb.style.left = `${pct * 100}%`;
        if (timeElapsedLabel) timeElapsedLabel.textContent = formatTime(Math.floor(cur));
        if (timeDurationLabel) timeDurationLabel.textContent = formatTime(Math.floor(dur));
        updateActiveCardsProgressBar(pct);

        const miniFill = document.getElementById('mini-timeline-fill');
        const miniElapsed = document.getElementById('mini-time-elapsed');
        const miniDuration = document.getElementById('mini-time-duration');
        if (miniFill) miniFill.style.width = `${pct * 100}%`;
        if (miniElapsed) miniElapsed.textContent = formatTime(Math.floor(cur));
        if (miniDuration) miniDuration.textContent = formatTime(Math.floor(dur));

        const mobFill = document.getElementById('mobile-timeline-fill');
        const mobThumb = document.getElementById('mobile-timeline-thumb');
        const mobElapsed = document.getElementById('mobile-current-time');
        const mobDuration = document.getElementById('mobile-duration');
        if (mobFill) mobFill.style.width = `${pct * 100}%`;
        if (mobThumb) mobThumb.style.left = `${pct * 100}%`;
        if (mobElapsed) mobElapsed.textContent = formatTime(Math.floor(cur));
        if (mobDuration) mobDuration.textContent = formatTime(Math.floor(dur));

        const mobMiniProgressFill = document.getElementById('mobile-mini-progress-fill');
        if (mobMiniProgressFill) mobMiniProgressFill.style.width = `${pct * 100}%`;

        const lyricsOverlay = document.getElementById('lyrics-overlay');
        if (lyricsOverlay && !lyricsOverlay.classList.contains('hidden')) {
          updateLyricsHighlighting();
        }
      }
      localStorage.setItem('unia_last_played_time', Math.floor(cur).toString());
    }
  }
}, 100);

// ========================================================
// NATIVE ANDROID EVENT LISTENERS & CALLBACK HOOKS
// ========================================================

window.onNativeProgressChange = (pos, dur) => {
  if (window.isDraggingTimeline) return;

  const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
  let trackDur = activeTrack && activeTrack.trackTimeMillis ? activeTrack.trackTimeMillis / 1000 : 0;
  if (!trackDur && activeTrack && activeTrack.duration) {
    trackDur = activeTrack.duration;
  }

  const finalDur = trackDur > 0 ? trackDur : (dur > 0 ? dur : 0);
  const pct = finalDur > 0 ? pos / finalDur : 0;

  const timelineFill = document.getElementById('timeline-fill');
  const timelineThumb = document.getElementById('timeline-thumb');
  const timeElapsedLabel = document.getElementById('time-elapsed');
  const timeDurationLabel = document.getElementById('time-duration');

  if (timelineFill) timelineFill.style.width = `${pct * 100}%`;
  if (timelineThumb) timelineThumb.style.left = `${pct * 100}%`;
  if (timeElapsedLabel) timeElapsedLabel.textContent = formatTime(Math.floor(pos));
  if (timeDurationLabel) timeDurationLabel.textContent = formatTime(Math.floor(finalDur));

  updateActiveCardsProgressBar(pct);

  const miniFill = document.getElementById('mini-timeline-fill');
  const miniElapsed = document.getElementById('mini-time-elapsed');
  const miniDuration = document.getElementById('mini-time-duration');
  if (miniFill) miniFill.style.width = `${pct * 100}%`;
  if (miniElapsed) miniElapsed.textContent = formatTime(Math.floor(pos));
  if (miniDuration) miniDuration.textContent = formatTime(Math.floor(finalDur));

  const mobFill = document.getElementById('mobile-timeline-fill');
  const mobThumb = document.getElementById('mobile-timeline-thumb');
  const mobElapsed = document.getElementById('mobile-current-time');
  const mobDuration = document.getElementById('mobile-duration');
  if (mobFill) mobFill.style.width = `${pct * 100}%`;
  if (mobThumb) mobThumb.style.left = `${pct * 100}%`;
  if (mobElapsed) mobElapsed.textContent = formatTime(Math.floor(pos));
  if (mobDuration) mobDuration.textContent = formatTime(Math.floor(finalDur));

  const mobMiniProgressFill = document.getElementById('mobile-mini-progress-fill');
  if (mobMiniProgressFill) mobMiniProgressFill.style.width = `${pct * 100}%`;

  const lyricsOverlay = document.getElementById('lyrics-overlay');
  if (lyricsOverlay && !lyricsOverlay.classList.contains('hidden')) {
    updateLyricsHighlighting();
  }

  localStorage.setItem('unia_last_played_time', Math.floor(pos).toString());
};

window.onNativePlayPauseChange = (isPlaying) => {
  state.isPlaying = isPlaying;
  syncPlayStateUI();
};

window.onNativeNext = () => {
  handleNext();
};

window.onNativePrev = () => {
  handlePrev();
};

window.updateTimelineVisual = (pct) => {
  const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
  const isLocalPlaying = activeTrack && activeTrack.isLocal;
  let dur = 0;
  if (isLocalPlaying) {
    dur = localAudio.duration || 0;
  } else {
    if (window.isAndroidNative || window.AndroidBridge) {
      dur = activeTrack ? (activeTrack.trackTimeMillis / 1000) : 0;
    } else if (state.ytPlayerReady && ytPlayer && ytPlayer.getDuration) {
      dur = ytPlayer.getDuration() || 0;
    }
  }

  const cur = pct * dur;

  const timelineFill = document.getElementById('timeline-fill');
  const timelineThumb = document.getElementById('timeline-thumb');
  const timeElapsedLabel = document.getElementById('time-elapsed');

  if (timelineFill) timelineFill.style.width = `${pct * 100}%`;
  if (timelineThumb) timelineThumb.style.left = `${pct * 100}%`;
  if (timeElapsedLabel) timeElapsedLabel.textContent = formatTime(Math.floor(cur));

  const miniFill = document.getElementById('mini-timeline-fill');
  const miniElapsed = document.getElementById('mini-time-elapsed');
  if (miniFill) miniFill.style.width = `${pct * 100}%`;
  if (miniElapsed) miniElapsed.textContent = formatTime(Math.floor(cur));

  const mobFill = document.getElementById('mobile-timeline-fill');
  const mobThumb = document.getElementById('mobile-timeline-thumb');
  const mobElapsed = document.getElementById('mobile-current-time');
  if (mobFill) mobFill.style.width = `${pct * 100}%`;
  if (mobThumb) mobThumb.style.left = `${pct * 100}%`;
  if (mobElapsed) mobElapsed.textContent = formatTime(Math.floor(cur));

  const mobMiniProgressFill = document.getElementById('mobile-mini-progress-fill');
  if (mobMiniProgressFill) mobMiniProgressFill.style.width = `${pct * 100}%`;
};

