// ==========================================
// UNIA - STATE MODULE
// ==========================================

export const state = {
  currentUser: null,
  users: [],
  currentTrackList: [],
  likedTracks: [],
  localTracks: [],
  playlists: [],
  currentTrackIndex: -1,
  isPlaying: false,
  isShuffle: false,
  isRepeat: false,
  volumeLevel: 0.75,
  isMuted: false,
  hasEverPlayed: false,
  hasStartedPlaying: false,
  backupAttempts: 0,
  ytPlayerReady: false,
  pendingSeekTime: null,
  pendingTrackVideoId: null,
  isAudioLoadedInPlayer: false,
  videoIdCache: {},
  navigationHistory: [],
  navigationIndex: -1
};

// Local track storage
try {
  state.localTracks = JSON.parse(localStorage.getItem('unia_local_tracks') || '[]');
} catch (e) {
  state.localTracks = [];
}

export function saveLocalTracks() {
  localStorage.setItem('unia_local_tracks', JSON.stringify(state.localTracks));
}

// Liked tracks storage
export function loadLikedTracks() {
  if (state.currentUser) {
    state.likedTracks = state.currentUser.likedTracks || [];
  } else {
    try {
      state.likedTracks = JSON.parse(localStorage.getItem('unia_liked_tracks') || '[]');
    } catch {
      state.likedTracks = [];
    }
  }
}

export function saveLikedTracks() {
  localStorage.setItem('unia_liked_tracks', JSON.stringify(state.likedTracks));
  if (state.currentUser && window.uniaAPI?.dbUpdateUser) {
    window.uniaAPI.dbUpdateUser(state.currentUser.id, { likedTracks: state.likedTracks }).catch(() => {});
  }
}

// Playlists storage
export function loadPlaylists() {
  if (state.currentUser) {
    state.playlists = state.currentUser.playlists || [];
  } else {
    try {
      state.playlists = JSON.parse(localStorage.getItem('unia_custom_playlists') || '[]');
    } catch {
      state.playlists = [];
    }
  }

  // Active filter to clean up previously created default playlists
  const originalLength = state.playlists.length;
  const removedPlaylists = state.playlists.filter(p => p && (p.id === 'bate-forte-playlist' || p.id === 'ben-unluyum-funk' || p.id === 'alacarte-x' || p.id === 'adelina-playlist'));
  state.playlists = state.playlists.filter(p => p && p.id !== 'bate-forte-playlist' && p.id !== 'ben-unluyum-funk' && p.id !== 'alacarte-x' && p.id !== 'adelina-playlist');

  if (state.playlists.length !== originalLength) {
    savePlaylists();
    if (window.uniaAPI?.dbDeletePlaylist) {
      for (const pl of removedPlaylists) {
        window.uniaAPI.dbDeletePlaylist(pl.id).catch(() => {});
      }
    }
  }
}

export function savePlaylists() {
  try {
    localStorage.setItem('unia_custom_playlists', JSON.stringify(state.playlists));
  } catch (e) {
    console.warn('LocalStorage QuotaExceededError:', e);
  }
  if (state.currentUser && window.uniaAPI?.dbSavePlaylist) {
    for (const pl of state.playlists) {
      window.uniaAPI.dbSavePlaylist(state.currentUser.id, pl).catch((err) => {
        console.error('dbSavePlaylist failed:', err);
      });
    }
  }
}

// Save & load playback states
export function saveLastPlayedState(ytPlayer) {
  if (state.currentTrackIndex < 0 || !state.currentTrackList[state.currentTrackIndex]) return;
  const track = state.currentTrackList[state.currentTrackIndex];
  localStorage.setItem('unia_last_played_track', JSON.stringify(track));
  localStorage.setItem('unia_last_played_list', JSON.stringify(state.currentTrackList));
  localStorage.setItem('unia_last_played_index', state.currentTrackIndex.toString());
  
  if (state.currentUser && window.uniaAPI?.dbSaveAppState) {
    const curTime = (ytPlayer && ytPlayer.getCurrentTime) ? ytPlayer.getCurrentTime() : 0;
    window.uniaAPI.dbSaveAppState(state.currentUser.id, {
      lastTrack: track,
      volume: state.volumeLevel,
      isMuted: state.isMuted,
      isShuffle: state.isShuffle,
      isRepeat: state.isRepeat,
      lastPlayedTime: curTime
    }).catch(() => {});
  }
}
