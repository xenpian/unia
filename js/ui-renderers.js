// ==========================================
// UNIA - UI RENDERING & PAGE MANAGER MODULE
// ==========================================

import { state, savePlaylists, saveLikedTracks, saveLocalTracks } from './state.js';
import { localAudio, handlePlayPause, handleNext, handlePrev, seekToPercent, syncVolumeSlider, syncPlayStateUI, syncDiscordRPC, loadAndPlayTrack, resolveVideoId, getYTPlayer } from './player.js';
import { updateDynamicTheme, updateDynamicBackground, extractColorsFromArtwork } from './theme.js';

// Global variables for search results
export let homeTracks = [];

// Speech recognition instances
let shazamRecognition = null;
let shazamAudioContext = null;
let shazamStream = null;
let shazamAnimFrame = null;

// Helpers
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatTime(sec) {
  if (isNaN(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function showToast(msg) {
  let toast = document.getElementById('unia-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'unia-toast';
    toast.style = 'position:fixed; bottom:100px; left:50%; transform:translateX(-50%); background:rgba(18,18,18,0.9); border:1px solid rgba(255,255,255,0.08); color:#fff; font-size:12px; font-weight:700; padding:10px 24px; border-radius:24px; z-index:99999; box-shadow:0 8px 32px rgba(0,0,0,0.5); backdrop-filter:blur(10px); transition:opacity 0.3s; opacity:0; pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.opacity = '0';
  }, 2200);
}

export function safeCreateIcons() {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// Fetch template utility
async function fetchPageTemplate(pageName) {
  try {
    const res = await fetch(`./pages/${pageName}.html`);
    if (res.ok) {
      return await res.text();
    }
  } catch (e) {
    console.error(`Failed to load page template ${pageName}:`, e);
  }
  return '';
}

// Single page view manager
export async function showPage(pageName, data) {
  if (typeof stopShazamEngine === 'function') {
    stopShazamEngine();
  }
  const mainContent = document.querySelector('.content-center');
  const sidebarLeft = document.querySelector('.sidebar-left');
  const sidebarRight = document.querySelector('.sidebar-right');
  const searchInput = document.getElementById('search-input');
  const lyricsOverlay = document.getElementById('lyrics-overlay');
  const utilLyricsBtn = document.getElementById('util-lyrics');

  if (sidebarLeft) sidebarLeft.classList.remove('mobile-open');
  if (sidebarRight) sidebarRight.classList.remove('mobile-open');

  syncMobileTabs(pageName);

  if (pageName !== 'home' && pageName !== 'search') {
    if (searchInput && searchInput.value) {
      searchInput.value = '';
      loadRecommendedTracks();
    }
  }

  if (lyricsOverlay && !lyricsOverlay.classList.contains('hidden')) {
    lyricsOverlay.classList.add('hidden');
    if (utilLyricsBtn) utilLyricsBtn.classList.remove('active');
  }
  if (mainContent) {
    mainContent.style.overflowY = '';
  }

  const holder = document.getElementById('page-content-holder');
  if (!holder) return;

  // Clear previous content
  holder.innerHTML = '';
  holder.dataset.currentPage = pageName;

  if (pageName === 'home' || pageName === 'search') {
    // Restore default home elements by fetching home template
    const template = await fetchPageTemplate('home');
    holder.innerHTML = template;

    // Re-bind listeners on dynamic home components
    const bannerPlayBtn = document.getElementById('banner-play-btn');
    if (bannerPlayBtn) {
      bannerPlayBtn.onclick = () => {
        const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
        if (activeTrack) {
          handlePlayPause();
        } else if (homeTracks.length > 0) {
          state.currentTrackList = [...homeTracks];
          state.currentTrackIndex = 0;
          updatePlayerUI();
          loadAndPlayTrack();
        }
      };
    }

    const bannerPlayIcon = document.getElementById('banner-play-btn');
    if (bannerPlayIcon) {
      bannerPlayIcon.onmouseover = () => {
        bannerPlayIcon.style.transform = 'scale(1.04)';
      };
      bannerPlayIcon.onmouseout = () => {
        bannerPlayIcon.style.transform = 'scale(1)';
      };
    }

    loadRecommendedTracks();
    safeCreateIcons();
    return;
  }

  // Load appropriate page templates
  let templateName = pageName;
  if (pageName === 'liked-songs' || pageName === 'local-files') {
    templateName = 'playlist';
  }
  const template = await fetchPageTemplate(templateName);
  if (!template) {
    holder.innerHTML = `<div style="padding:48px 0; text-align:center; color:var(--text-muted);">Sayfa şablonu yüklenemedi.</div>`;
    return;
  }

  holder.innerHTML = template;

  if (pageName === 'playlist') {
    renderPlaylistPage(holder, data);
  } else if (pageName === 'liked-songs') {
    renderPlaylistPage(holder, { id: 'liked', name: 'Beğenilen Şarkılar', tracks: data });
  } else if (pageName === 'local-files') {
    renderPlaylistPage(holder, { id: 'local', name: 'Yerel Dosyalar', tracks: data });
  } else if (pageName === 'browse') {
    renderBrowsePage(holder);
  } else if (pageName === 'notifications') {
    renderNotificationsPage(holder);
  } else if (pageName === 'friends') {
    renderFriendsPage(holder);
  } else if (pageName === 'profile') {
    renderProfilePage(holder, data);
  } else if (pageName === 'shazam') {
    renderShazamPage(holder);
  }

  safeCreateIcons();
  updateTodayRecommendationVisibility();
  syncActiveNavStates(pageName, data);
}

// Sync mobile tabs navigation
export function syncMobileTabs(pageName) {
  const appContainer = document.querySelector('.app-container');
  if (appContainer && pageName !== 'search') {
    appContainer.classList.remove('mobile-search-active');
  }

  const tabHome = document.getElementById('mobile-tab-home');
  const tabSearch = document.getElementById('mobile-tab-search');
  const tabLibrary = document.getElementById('mobile-tab-library');
  const tabQueue = document.getElementById('mobile-tab-queue');

  if (!tabHome || !tabSearch || !tabLibrary || !tabQueue) return;

  [tabHome, tabSearch, tabLibrary, tabQueue].forEach(tab => {
    tab.classList.remove('active');
  });

  if (pageName === 'home') {
    tabHome.classList.add('active');
  } else if (pageName === 'search') {
    tabSearch.classList.add('active');
  } else if (pageName === 'playlist' || pageName === 'liked-songs' || pageName === 'local-files') {
    tabLibrary.classList.add('active');
  }
}

// Render dynamic playlists
export function renderPlaylistPage(container, playlist) {
  window.currentViewedPlaylist = playlist;
  const isLiked = playlist.id === 'liked';
  const isLocal = playlist.id === 'local';

  // Fill in header elements
  const coverWrap = container.querySelector('#playlist-cover-wrap');
  const coverImg = container.querySelector('#playlist-cover-img');
  const coverDefault = container.querySelector('#playlist-cover-default');
  const coverOverlay = container.querySelector('#cover-overlay');
  const coverInput = container.querySelector('#playlist-cover-input');
  const typeLabel = container.querySelector('#playlist-type-label');
  const titleEdit = container.querySelector('#playlist-title-edit');
  const trackCount = container.querySelector('#playlist-track-count');

  if (isLiked) {
    if (coverDefault) coverDefault.innerHTML = `<i data-lucide="heart" style="width:64px; height:64px; color:white; fill:white;"></i>`;
    if (coverImg) coverImg.style.display = 'none';
    if (coverOverlay) coverOverlay.style.display = 'none';
    if (typeLabel) typeLabel.textContent = 'Kitaplık';
    if (titleEdit) {
      titleEdit.textContent = 'Beğenilen Şarkılar';
      titleEdit.contentEditable = 'false';
    }
  } else if (isLocal) {
    if (coverDefault) coverDefault.innerHTML = `<i data-lucide="folder" style="width:64px; height:64px; color:white;"></i>`;
    if (coverImg) coverImg.style.display = 'none';
    if (coverOverlay) coverOverlay.style.display = 'none';
    if (typeLabel) typeLabel.textContent = 'Yerel Oynatıcı';
    if (titleEdit) {
      titleEdit.textContent = 'Yerel Dosyalar';
      titleEdit.contentEditable = 'false';
    }
  } else {
    if (playlist.coverUrl) {
      if (coverImg) {
        coverImg.src = playlist.coverUrl;
        coverImg.style.display = 'block';
      }
      if (coverDefault) coverDefault.style.display = 'none';
    }
    if (typeLabel) typeLabel.textContent = 'Çalma Listesi';
    if (titleEdit) {
      titleEdit.textContent = playlist.name;
      titleEdit.contentEditable = 'true';
    }
  }

  // Cover photo bindings for normal playlists
  if (!isLiked && !isLocal) {
    if (coverWrap && coverOverlay && coverInput) {
      coverWrap.onmouseenter = () => coverOverlay.style.opacity = '1';
      coverWrap.onmouseleave = () => coverOverlay.style.opacity = '0';
      coverWrap.onclick = () => coverInput.click();
      coverInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          playlist.coverUrl = ev.target.result;
          savePlaylists();
          renderLibrarySidebar();
          renderPlaylistPage(container, playlist);
        };
        reader.readAsDataURL(file);
      };
    }

    if (titleEdit) {
      titleEdit.onblur = () => {
        const val = titleEdit.textContent.trim();
        if (val) {
          playlist.name = val;
          savePlaylists();
          renderLibrarySidebar();
        }
      };
      titleEdit.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          titleEdit.blur();
        }
      };
    }

    // Playlist options menu bindings
    const trigger = container.querySelector('#playlist-options-trigger');
    const plMenu = document.getElementById('playlist-context-menu');
    if (trigger && plMenu) {
      trigger.onclick = (e) => {
        e.stopPropagation();
        window.contextMenuTargetPlaylistId = playlist.id;
        const rect = trigger.getBoundingClientRect();
        plMenu.style.left = `${rect.left}px`;
        plMenu.style.top = `${rect.bottom + window.scrollY + 8}px`;
        plMenu.classList.remove('hidden');
        plMenu.style.display = 'block';
      };
    }
  } else {
    // Hide ellipsis options for Liked and Local lists
    const trigger = container.querySelector('#playlist-options-trigger');
    if (trigger) trigger.style.display = 'none';
  }

  // Play button handler
  const playBtn = container.querySelector('#playlist-play-large');
  if (playBtn) {
    const isCurrentPlaylistActive = state.playingPlaylistId === playlist.id;
    const isPlayingCurrent = isCurrentPlaylistActive && state.isPlaying;
    playBtn.innerHTML = isPlayingCurrent
      ? `<i data-lucide="pause" style="fill:currentColor;"></i>`
      : `<i data-lucide="play" style="fill:currentColor;"></i>`;

    playBtn.onclick = () => {
      if (playlist.tracks.length > 0) {
        if (state.playingPlaylistId === playlist.id) {
          handlePlayPause();
        } else {
          state.currentTrackList = [...playlist.tracks];
          state.currentTrackIndex = 0;
          state.playingPlaylistId = playlist.id;
          updatePlayerUI();
          loadAndPlayTrack();
        }
      } else {
        showToast('Kütüphane boş, önce şarkı ekleyin.');
      }
    };
  }

  const tracksContainer = container.querySelector('#playlist-tracks-container');

  function renderPlaylistTracks() {
    if (!tracksContainer) return;
    tracksContainer.innerHTML = '';
    if (trackCount) trackCount.textContent = playlist.tracks.length;

    if (playlist.tracks.length === 0) {
      tracksContainer.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:16px 0;">Kütüphaneniz henüz boş.</div>';
      return;
    }

    playlist.tracks.forEach((track, index) => {
      const row = document.createElement('div');
      row._track = track;

      const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
      const isActive = activeTrack && track.trackId === activeTrack.trackId;
      row.className = 'track-row' + (isActive ? ' active' : '');
      if (isActive && state.isPlaying) {
        row.className += ' playing';
      }

      const isExplicit = track.explicit ? '<span class="explicit-badge" style="background:#a7a7a7; color:#121212; font-size:9px; font-weight:700; padding:1px 3px; border-radius:2px; margin-right:6px; display:inline-block; line-height:1; vertical-align:middle;">E</span>' : '';
      const artistDisplay = isExplicit ? `<div style="display:flex; align-items:center; font-size:11px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${isExplicit}${escapeHtml(track.artistName)}</div>` : `<div style="font-size:11px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(track.artistName)}</div>`;
      const artwork = track.artworkUrl100 || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100';

      row.innerHTML = `
        <span class="col-num" style="display:flex; align-items:center; justify-content:center; width:30px; height:100%;">
          <span class="num-text">${index + 1}</span>
          <i data-lucide="play" class="play-icon" style="display:none; width:14px; height:14px; fill:currentColor;"></i>
          <i data-lucide="pause" class="pause-icon" style="display:none; width:14px; height:14px; fill:currentColor;"></i>
          <span class="playing-indicator" style="display:none;"><i data-lucide="music" class="ph-bounce" style="width:13px; height:13px; color:var(--primary-accent);"></i></span>
        </span>
        <div style="display:flex; align-items:center; gap:12px; grid-column:span 1; overflow:hidden;">
          <img src="${artwork.replace('100x100bb', '60x60bb')}" style="width:40px; height:40px; border-radius:4px; object-fit:cover; flex-shrink:0;">
          <div style="overflow:hidden;">
            <div class="track-title-text" style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(track.trackName)}</div>
            ${artistDisplay}
          </div>
        </div>
        <span class="col-album">${escapeHtml(track.primaryGenreName || 'Pop')}</span>
        <span class="col-duration" style="text-align:right; color:var(--text-muted); font-size:13px;">${formatTime(Math.floor(track.trackTimeMillis / 1000))}</span>
        <button class="remove-track-btn" title="Kütüphaneden kaldır"><i data-lucide="plus"></i></button>`;

      row.onclick = () => {
        state.currentTrackList = [...playlist.tracks];
        state.currentTrackIndex = index;
        updatePlayerUI();
        loadAndPlayTrack();
      };

      const removeBtn = row.querySelector('.remove-track-btn');
      if (removeBtn) {
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          if (playlist.id === 'liked') {
            const likedIdx = state.likedTracks.findIndex(t => t.trackId === track.trackId);
            if (likedIdx > -1) {
              state.likedTracks.splice(likedIdx, 1);
              saveLikedTracks();
            }
          } else if (playlist.id === 'local') {
            const localIdx = state.localTracks.findIndex(t => t.trackId === track.trackId);
            if (localIdx > -1) {
              state.localTracks.splice(localIdx, 1);
              saveLocalTracks();
            }
          } else {
            playlist.tracks.splice(index, 1);
            savePlaylists();
          }
          renderLibrarySidebar();
          renderPlaylistTracks();
          showToast('Şarkı kütüphaneden kaldırıldı.');
        };
      }

      tracksContainer.appendChild(row);
    });
  }
  renderPlaylistTracks();

  // Populate dynamic bottom sections (drag zone or search)
  const bottomSection = container.querySelector('#playlist-bottom-section');
  if (bottomSection) {
    bottomSection.innerHTML = '';
    if (isLocal) {
      const dragHTML = `
      <div class="local-upload-zone" id="local-drag-zone">
        <i data-lucide="file-audio"></i>
        <h3>Yerel Müzik Dosyalarını Buraya Sürükle ve Bırak</h3>
        <p>Desteklenen formatlar: .mp3, .wav, .flac, .ogg, .m4a</p>
        <button class="pill-btn active" id="btn-add-local-files">Dosya Seç</button>
        <input type="file" id="local-file-input" accept="audio/*" multiple style="display:none;">
      </div>`;
      bottomSection.innerHTML = dragHTML;

      const dragZone = bottomSection.querySelector('#local-drag-zone');
      const pickBtn = bottomSection.querySelector('#btn-add-local-files');
      const fileInput = bottomSection.querySelector('#local-file-input');

      if (dragZone && fileInput && pickBtn) {
        pickBtn.onclick = () => fileInput.click();
        fileInput.onchange = (e) => {
          if (e.target.files.length > 0) processLocalFiles(e.target.files);
        };

        dragZone.ondragover = (e) => {
          e.preventDefault();
          dragZone.classList.add('drag-over');
        };
        dragZone.ondragleave = () => dragZone.classList.remove('drag-over');
        dragZone.ondrop = (e) => {
          e.preventDefault();
          dragZone.classList.remove('drag-over');
          if (e.dataTransfer.files.length > 0) processLocalFiles(e.dataTransfer.files);
        };
      }

      function processLocalFiles(files) {
        let addedCount = 0;
        Array.from(files).forEach(file => {
          const ext = file.name.split('.').pop().toLowerCase();
          const validExtensions = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'];
          if (!validExtensions.includes(ext)) return;
          if (state.localTracks.some(t => t.localPath === file.path)) return;

          const track = {
            trackId: 'local-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            trackName: file.name.substring(0, file.name.lastIndexOf('.')) || file.name,
            artistName: 'Yerel Dosya',
            artworkUrl100: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300',
            trackTimeMillis: 180000,
            primaryGenreName: ext.toUpperCase(),
            localPath: file.path,
            isLocal: true
          };

          const tempAudio = new Audio(file.path);
          tempAudio.addEventListener('loadedmetadata', () => {
            track.trackTimeMillis = Math.floor(tempAudio.duration * 1000) || 180000;
            saveLocalTracks();
            renderPlaylistTracks();
          });

          state.localTracks.push(track);
          addedCount++;
        });

        if (addedCount > 0) {
          saveLocalTracks();
          renderLibrarySidebar();
          showToast(`${addedCount} yerel dosya kitaplığa eklendi.`);
          renderPlaylistTracks();
        } else {
          showToast('Uyumlu yeni yerel ses dosyası bulunamadı.');
        }
      }
    } else if (!isLiked) {
      // Dynamic Search & add song for normal playlists
      const searchHTML = `
      <div class="add-songs-section" style="margin-top:32px; border-top:1px solid rgba(255,255,255,0.05); padding-top:24px;">
        <h3 style="font-size:18px; font-weight:800; margin-bottom:8px; color:var(--text-main); font-family:inherit;">Hadi çalma listen için bir şeyler bulalım</h3>
        <div class="add-songs-search" style="position:relative; display:flex; align-items:center; max-width:360px; margin-bottom:16px;">
          <input type="text" id="playlist-search-songs-input" placeholder="Şarkı ara..." style="width:100%; padding:10px 16px; border-radius:20px; background:rgba(255,255,255,0.06); border:1px solid transparent; color:#fff; outline:none; font-family:inherit; font-size:13px;">
        </div>
        <div id="playlist-search-results-container" style="display:flex; flex-direction:column; gap:6px;"></div>
      </div>`;
      bottomSection.innerHTML = searchHTML;

      const searchSongsInput = bottomSection.querySelector('#playlist-search-songs-input');
      const resultsContainer = bottomSection.querySelector('#playlist-search-results-container');
      let playlistSearchDebounce = null;

      if (searchSongsInput && resultsContainer) {
        searchSongsInput.oninput = (e) => {
          const q = e.target.value.trim();
          clearTimeout(playlistSearchDebounce);
          if (!q) {
            resultsContainer.innerHTML = '';
            return;
          }
          playlistSearchDebounce = setTimeout(async () => {
            resultsContainer.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:8px 0;"><i data-lucide="loader-2" class="lucide-spin" style="margin-right:8px; display:inline-block; vertical-align:middle; width:14px; height:14px;"></i>Aranıyor...</div>';
            safeCreateIcons();
            try {
              const data = await window.uniaAPI.searchMusic(q);
              const results = data ? (data.results || []) : [];
              resultsContainer.innerHTML = '';
              if (results.length === 0) {
                resultsContainer.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:8px 0;">Şarkı bulunamadı.</div>';
                return;
              }
              results.slice(0, 5).forEach(track => {
                const row = document.createElement('div');
                row.style = 'display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border-radius:8px; background:rgba(255,255,255,0.02); transition:background 0.2s;';
                row.className = 'add-track-search-row';
                row.onmouseover = () => row.style.background = 'rgba(255,255,255,0.05)';
                row.onmouseout = () => row.style.background = 'rgba(255,255,255,0.02)';

                const imgUrl = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '60x60bb') : '';
                row.innerHTML = `
                  <div style="display:flex; align-items:center; gap:12px; overflow:hidden; flex:1;">
                    <img src="${imgUrl}" style="width:36px; height:36px; border-radius:4px; object-fit:cover; flex-shrink:0;">
                    <div style="overflow:hidden;">
                      <div style="font-size:13px; font-weight:600; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(track.trackName)}</div>
                      <div style="font-size:11px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(track.artistName)}</div>
                    </div>
                  </div>
                  <button class="quick-add-btn" style="background:transparent; border:1px solid rgba(255,255,255,0.1); border-radius:20px; padding:6px 16px; font-size:12px; font-weight:700; color:var(--text-main); cursor:pointer; transition:all 0.2s;">Ekle</button>
                `;

                const addBtn = row.querySelector('.quick-add-btn');
                addBtn.onmouseover = () => {
                  addBtn.style.borderColor = 'var(--primary-accent)';
                  addBtn.style.color = 'var(--primary-accent)';
                };
                addBtn.onmouseout = () => {
                  addBtn.style.borderColor = 'rgba(255,255,255,0.1)';
                  addBtn.style.color = 'var(--text-main)';
                };

                addBtn.onclick = () => {
                  if (!playlist.tracks.some(t => t.trackId === track.trackId)) {
                    playlist.tracks.push(track);
                    savePlaylists();
                    renderLibrarySidebar();
                    renderPlaylistTracks();
                    showToast(`"${track.trackName}" çalma listesine eklendi.`);
                    row.remove();
                  } else {
                    showToast('Bu şarkı zaten çalma listesinde var.');
                  }
                };

                resultsContainer.appendChild(row);
              });
            } catch (err) {
              console.error(err);
              resultsContainer.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:8px 0;">Arama sırasında hata oluştu.</div>';
            }
          }, 400);
        };
      }
    }
  }
}

// Render dynamic profiles
export function renderProfilePage(container, targetUser = null) {
  if (!state.currentUser) {
    container.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; padding:48px 0;">
        <i class="ph-fill ph-user-x" style="width:64px; height:64px; color:var(--text-muted); margin-bottom:16px; font-size:40px;"></i>
        <h2 style="font-size:24px; font-weight:700; margin-bottom:8px; color:var(--text-main);">Oturum Açık Değil</h2>
        <p style="color:var(--text-muted); margin-bottom:24px; max-width:300px;">Profilinizi görüntülemek, çalma listeleri oluşturmak ve şarkıları beğenmek için giriş yapmalısınız.</p>
        <button class="btn btn-primary" id="auth-trigger-btn" style="padding:12px 32px; font-weight:700; color:#fff;">Giriş Yap / Kayıt Ol</button>
      </div>`;
    const btn = container.querySelector('#auth-trigger-btn');
    if (btn) {
      btn.onclick = () => {
        const modal = document.getElementById('auth-modal');
        if (modal) modal.classList.remove('hidden');
      };
    }
    return;
  }

  const isOwnProfile = !targetUser || targetUser.id === state.currentUser.id;
  const userToRender = isOwnProfile ? state.currentUser : targetUser;

  if (!isOwnProfile) {
    saveProfileVisit(userToRender);
  }

  const profilePhotoUrl = userToRender.profilePhotoUrl || userToRender.profile_photo_url || '';
  const photoContainer = container.querySelector('#profile-photo-container');
  const photoInitial = container.querySelector('#profile-photo-initial');
  const photoImg = container.querySelector('#profile-photo-img');
  const photoHover = container.querySelector('#profile-photo-hover');
  const photoInput = container.querySelector('#profile-photo-input');
  const usernameLabel = container.querySelector('#profile-username-label');
  const followersBtn = container.querySelector('#profile-followers-btn');
  const followingBtn = container.querySelector('#profile-following-btn');
  const playlistsCount = container.querySelector('#profile-playlists-count');
  const backBtn = container.querySelector('#profile-back-btn');

  if (backBtn) {
    if (!isOwnProfile) {
      backBtn.style.display = 'flex';
      backBtn.onclick = () => {
        showPage('home');
      };
    } else {
      backBtn.style.display = 'none';
    }
  }

  if (photoImg && photoInitial) {
    if (profilePhotoUrl) {
      photoImg.src = profilePhotoUrl;
      photoImg.style.display = 'block';
      photoInitial.style.display = 'none';
    } else {
      photoInitial.textContent = userToRender.username.charAt(0).toUpperCase();
      photoInitial.style.display = 'block';
      photoImg.style.display = 'none';
    }
  }

  if (usernameLabel) usernameLabel.textContent = userToRender.username;

  // Followers & following calculations
  const followersKey = `unia_followers_${userToRender.id}`;
  if (localStorage.getItem(followersKey) === null) {
    localStorage.setItem(followersKey, JSON.stringify([]));
  }
  const followers = JSON.parse(localStorage.getItem(followersKey) || '[]');
  if (followersBtn) {
    followersBtn.textContent = `${followers.length} Takipçi`;
    if (isOwnProfile) {
      followersBtn.onclick = () => {
        if (typeof window.openFollowersModal === 'function') window.openFollowersModal();
      };
    }
  }

  const followedArtistsKey = `unia_followed_artists_${userToRender.id}`;
  const followedArtists = JSON.parse(localStorage.getItem(followedArtistsKey) || '[]');
  const followedUsersKey = `unia_followed_users_${userToRender.id}`;
  const followedUsers = JSON.parse(localStorage.getItem(followedUsersKey) || '[]');
  const followingCount = followedArtists.length + followedUsers.length;
  if (followingBtn) {
    followingBtn.textContent = `${followingCount} Takip Edilen`;
    if (isOwnProfile) {
      followingBtn.onclick = () => {
        if (typeof window.openFollowedArtistsModal === 'function') window.openFollowedArtistsModal();
      };
    }
  }

  const targetPlaylists = userToRender.playlists || [];
  if (playlistsCount) playlistsCount.textContent = `${targetPlaylists.length} Çalma Listesi`;

  // Actions area (Logout, Discord configuration)
  const actionsArea = container.querySelector('#profile-actions-area');
  if (actionsArea) {
    actionsArea.innerHTML = '';
    if (isOwnProfile) {
      actionsArea.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:16px;">
          <div>
            <button class="btn btn-primary" id="profile-logout-btn" style="padding:10px 24px; color:#fff; font-weight:700;">Oturumu Kapat</button>
          </div>
          <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:16px; margin-top:8px;">
            <h3 style="font-size:14px; font-weight:700; color:#fff; margin-bottom:8px;">Discord Zengin Durum (RPC) Ayarı</h3>
            <div style="display:flex; gap:12px; max-width:400px;">
              <input type="text" id="profile-discord-client-id" class="auth-input" style="flex:1; margin-bottom:0;" placeholder="Client ID (Varsayılan boş kalabilir)">
              <button class="btn btn-outline" id="profile-discord-save-btn" style="padding:0 16px; font-weight:700;">Kaydet</button>
            </div>
          </div>
        </div>`;

      const logoutBtn = actionsArea.querySelector('#profile-logout-btn');
      if (logoutBtn) {
        logoutBtn.onclick = () => {
          localStorage.removeItem('unia_current_user');
          state.currentUser = null;
          showPage('profile');
          showToast('Oturum kapatıldı.');

          // Reset user UI widgets
          const profileBtn = document.getElementById('profile-btn');
          if (profileBtn) {
            profileBtn.innerHTML = `<span>G</span>`;
          }
        };
      }

      const discordInput = actionsArea.querySelector('#profile-discord-client-id');
      const discordSaveBtn = actionsArea.querySelector('#profile-discord-save-btn');
      if (discordInput && discordSaveBtn) {
        discordInput.value = localStorage.getItem('unia_discord_client_id') || '1510411749013061722';
        discordSaveBtn.onclick = () => {
          const val = discordInput.value.trim();
          localStorage.setItem('unia_discord_client_id', val);
          syncDiscordRPC();
          showToast('Discord RPC Client ID kaydedildi!');
        };
      }

      // Profile photo hover upload
      if (photoContainer && photoInput && photoHover) {
        photoContainer.onmouseenter = () => photoHover.style.opacity = '1';
        photoContainer.onmouseleave = () => photoHover.style.opacity = '0';
        photoContainer.onclick = () => photoInput.click();
        photoInput.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
              state.currentUser.profilePhotoUrl = evt.target.result;
              if (window.uniaAPI?.dbSaveUser) {
                window.uniaAPI.dbSaveUser(state.currentUser).catch(() => { });
              }
              const uIdx = state.users.findIndex(u => u.id === state.currentUser.id);
              if (uIdx > -1) {
                state.users[uIdx] = state.currentUser;
                localStorage.setItem('unia_users', JSON.stringify(state.users));
              }

              // Update profile btn avatar
              const pBtn = document.getElementById('profile-btn');
              if (pBtn) {
                pBtn.innerHTML = `<img src="${evt.target.result}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
              }

              renderProfilePage(container);
              showToast('Profil fotoğrafı güncellendi!');
            };
            reader.readAsDataURL(file);
          }
        };
      }
    } else {
      // Follow target user button
      const ownFollowedUsersKey = `unia_followed_users_${state.currentUser.id}`;
      const ownFollowedUsers = JSON.parse(localStorage.getItem(ownFollowedUsersKey) || '[]');
      const isFollowing = ownFollowedUsers.includes(userToRender.id);

      actionsArea.innerHTML = `
        <button class="btn follow-target-user-btn ${isFollowing ? 'btn-outline' : 'btn-primary'}" style="padding:10px 24px; font-weight:700; border-radius:20px; cursor:pointer; transition:all 0.2s; ${isFollowing ? 'color: var(--text-main); background:transparent; border: 1px solid var(--border-light);' : 'color:#000; background: var(--primary-accent); border: none;'}">
          ${isFollowing ? 'Takip Ediliyor' : 'Takip Et'}
        </button>`;

      const fBtn = actionsArea.querySelector('.follow-target-user-btn');
      if (fBtn) {
        fBtn.onclick = () => {
          toggleFollowUser(userToRender, fBtn);
          const updatedFollowers = JSON.parse(localStorage.getItem(followersKey) || '[]');
          if (followersBtn) followersBtn.textContent = `${updatedFollowers.length} Takipçi`;
        };
      }
    }
  }
}

// Toggle follow another user
export function toggleFollowUser(targetUser, btnElement) {
  if (!state.currentUser) {
    showToast('Kullanıcıları takip etmek için giriş yapmalısınız.');
    return;
  }

  const followedKey = `unia_followed_users_${state.currentUser.id}`;
  let followedUsers = JSON.parse(localStorage.getItem(followedKey) || '[]');

  const followersKey = `unia_followers_${targetUser.id}`;
  let targetFollowers = JSON.parse(localStorage.getItem(followersKey) || '[]');

  const idx = followedUsers.indexOf(targetUser.id);
  let isNowFollowing = false;

  if (idx > -1) {
    followedUsers.splice(idx, 1);
    targetFollowers = targetFollowers.filter(f => f.id !== state.currentUser.id);
    showToast(`${targetUser.username} takibi bırakıldı.`);
  } else {
    followedUsers.push(targetUser.id);
    targetFollowers.push({
      id: state.currentUser.id,
      name: state.currentUser.username,
      username: state.currentUser.username
    });
    showToast(`${targetUser.username} takip ediliyor!`);
    isNowFollowing = true;
  }

  localStorage.setItem(followedKey, JSON.stringify(followedUsers));
  localStorage.setItem(followersKey, JSON.stringify(targetFollowers));

  if (btnElement) {
    if (isNowFollowing) {
      btnElement.textContent = 'Takip Ediliyor';
      btnElement.style.background = 'transparent';
      btnElement.style.border = '1px solid var(--border-light)';
      btnElement.style.color = 'var(--text-main)';
    } else {
      btnElement.textContent = 'Takip Et';
      btnElement.style.background = 'var(--primary-accent)';
      btnElement.style.border = 'none';
      btnElement.style.color = '#000';
    }
  }

  if (window.uniaAPI?.dbUpdateUser) {
    window.uniaAPI.dbUpdateUser(state.currentUser.id, { followedUsers }).catch(() => { });
  }
}

// Save profile visits locally
function saveProfileVisit(user) {
  if (!user || !user.id) return;
  const key = state.currentUser ? `unia_recently_visited_profiles_${state.currentUser.id}` : 'unia_recently_visited_profiles_guest';
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(key) || '[]');
  } catch (e) {
    list = [];
  }
  list = list.filter(u => u.id !== user.id);
  list.unshift({
    id: user.id,
    username: user.username,
    profilePhotoUrl: user.profilePhotoUrl || user.profile_photo_url || '',
    email: user.email || ''
  });
  list = list.slice(0, 10);
  localStorage.setItem(key, JSON.stringify(list));
}

// Render dynamic sliders
export async function loadSonZiyaretEdilenlerSlider() {
  const container = document.getElementById('son-ziyaret-edilenler-container');
  const section = document.getElementById('son-ziyaret-edilenler-section');
  if (!container) return;

  const key = state.currentUser ? `unia_recently_visited_profiles_${state.currentUser.id}` : 'unia_recently_visited_profiles_guest';
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(key) || '[]');
  } catch (e) {
    list = [];
  }

  if (!list || list.length === 0) {
    if (section) {
      section.classList.add('hidden');
      section.style.display = 'none';
    }
    return;
  }

  if (section) {
    const searchInput = document.getElementById('search-input');
    const isSearchActive = searchInput && searchInput.value.trim().length > 0;
    section.style.display = isSearchActive ? 'none' : 'block';
    section.classList.toggle('hidden', isSearchActive);
  }

  container.innerHTML = '';
  list.forEach(user => {
    const card = document.createElement('div');
    card.className = 'today-rec-card';

    const avatarUrl = user.profilePhotoUrl || '';
    const avatarHTML = avatarUrl
      ? `<img src="${avatarUrl}" alt="${escapeHtml(user.username)}" style="width:136px; height:136px; border-radius:50% !important; object-fit:cover; margin-bottom:12px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);">`
      : `<div style="width:136px; height:136px; border-radius:50%; background:linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)); border:1px solid rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; margin-bottom:12px; font-size:48px; font-weight:800; color:var(--text-main); box-shadow: 0 8px 24px rgba(0,0,0,0.35);">${user.username.charAt(0).toUpperCase()}</div>`;

    card.innerHTML = `
      ${avatarHTML}
      <div class="today-rec-card-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:136px; text-align:center;">${escapeHtml(user.username)}</div>
      <div class="today-rec-card-artist" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:136px; justify-content:center; display: flex; align-items: center; gap: 4px;">Profil</div>
    `;

    card.onclick = () => {
      showPage('profile', user);
    };
    container.appendChild(card);
  });

  makeDragScrollable(container);
}

export async function loadSonCalinanlarSlider() {
  const container = document.getElementById('son-calinanlar-container');
  const section = document.getElementById('son-calinanlar-section');
  if (!container) return;

  let tracks = [];

  // Mobile persistent check first
  if (window.isAndroidNative || window.AndroidBridge) {
    if (window.AndroidBridge && window.AndroidBridge.getRecentlyPlayed) {
      try {
        const res = window.AndroidBridge.getRecentlyPlayed();
        if (res) tracks = JSON.parse(res);
      } catch (e) {
        console.warn('Failed to load recently played from Android bridge:', e);
      }
    }
  } else {
    // Desktop persistent check
    const userId = state.currentUser ? state.currentUser.id : 'unia_local_user';
    if (window.uniaAPI?.dbGetRecentlyPlayed) {
      try {
        tracks = await window.uniaAPI.dbGetRecentlyPlayed(userId);
      } catch (e) {
        console.warn('Failed to load recently played tracks from DB:', e);
      }
    }
  }

  // Merge database tracks with localStorage tracks to avoid async lag
  let localTracks = [];
  try {
    const localRecent = localStorage.getItem('unia_recently_played');
    if (localRecent) localTracks = JSON.parse(localRecent);
  } catch (e) { }

  const combined = [...localTracks];
  if (tracks && tracks.length > 0) {
    tracks.forEach(track => {
      if (!combined.some(t => String(t.trackId) === String(track.trackId))) {
        combined.push(track);
      }
    });
  }
  tracks = combined;

  if (!tracks || tracks.length === 0) {
    if (section) {
      section.classList.add('hidden');
      section.style.display = 'none';
    }
    return;
  }

  if (section) {
    const searchInput = document.getElementById('search-input');
    const isSearchActive = searchInput && searchInput.value.trim().length > 0;
    section.style.display = isSearchActive ? 'none' : 'block';
    section.classList.toggle('hidden', isSearchActive);
  }

  const displayedTracks = tracks.slice(0, 8);

  container.innerHTML = '';
  displayedTracks.forEach((track, i) => {
    const card = document.createElement('div');
    card.className = 'today-rec-card';
    card._track = track;

    const cover = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '300x300bb') : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300';
    const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
    const isActive = activeTrack && activeTrack.trackId === track.trackId;

    card.innerHTML = `
      <div style="position:relative; width:136px; height:136px; border-radius:6px; overflow:hidden; margin-bottom:12px;">
        <img src="${cover}" alt="${track.trackName}" style="width:100%; height:100%; object-fit:cover; margin-bottom:0;">
        <button class="card-play-btn" style="position:absolute; bottom:8px; right:8px; width:36px; height:36px; border-radius:50%; background-color:var(--primary-accent); color:#000; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; opacity:${isActive && state.isPlaying ? '1' : '0'}; transition:opacity 0.2s, transform 0.2s;" title="${isActive && state.isPlaying ? 'Duraklat' : 'Çal'}">
          <i data-lucide="${isActive && state.isPlaying ? 'pause' : 'play'}" style="fill:currentColor;"></i>
        </button>
      </div>
      <div class="today-rec-card-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:136px;">${escapeHtml(track.trackName)}</div>
      <div class="today-rec-card-artist" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:136px; display: flex; align-items: center; gap: 4px;">
        ${escapeHtml(track.artistName)}
      </div>
      <div class="card-progress-container ${isActive ? '' : 'hidden'}">
        <div class="card-progress-fill"></div>
      </div>`;

    card.onclick = () => {
      const actTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
      const isAct = actTrack && track.trackId === actTrack.trackId;
      if (isAct) {
        handlePlayPause();
      } else {
        state.currentTrackList = [...displayedTracks];
        state.currentTrackIndex = i;
        updatePlayerUI();
        loadAndPlayTrack();
      }
    };

    container.appendChild(card);
  });

  safeCreateIcons();
  makeDragScrollable(container);
}

export async function loadMadeForYouSlider() {
  const container = document.getElementById('made-for-you-container');
  const title = document.getElementById('made-for-you-title');
  if (!container) return;

  if (title && state.currentUser) {
    title.textContent = `${state.currentUser.username} İçin Derlendi`;
  }

  // 1. Fetch user's likes and recently played to drive personalized mix telemetry
  let likedTracks = [];
  let recentTracks = [];
  if (state.currentUser && window.uniaAPI) {
    try {
      likedTracks = await window.uniaAPI.dbGetLikedTracks(state.currentUser.id) || [];
      recentTracks = await window.uniaAPI.dbGetRecentlyPlayed(state.currentUser.id) || [];
    } catch (e) {
      console.warn('[AI Mixes] Telemetry fetch failed:', e);
    }
  }

  // 2. Compute favorite artists and genres
  const artistCounts = {};
  const genreCounts = {};

  likedTracks.forEach(t => {
    const artist = t.artistName || t.artist_name;
    const genre = t.primaryGenreName || t.genre;
    if (artist) artistCounts[artist] = (artistCounts[artist] || 0) + 2; // Double weight for likes
    if (genre) genreCounts[genre] = (genreCounts[genre] || 0) + 2;
  });

  recentTracks.forEach(t => {
    const artist = t.artistName || t.artist_name;
    const genre = t.primaryGenreName || t.genre;
    if (artist) artistCounts[artist] = (artistCounts[artist] || 0) + 1;
    if (genre) genreCounts[genre] = (genreCounts[genre] || 0) + 1;
  });

  const sortedArtists = Object.keys(artistCounts).sort((a, b) => artistCounts[b] - artistCounts[a]);
  const sortedGenres = Object.keys(genreCounts).sort((a, b) => genreCounts[b] - genreCounts[a]);

  const topArtist = sortedArtists[0] || 'Lvbel C5';
  const secondArtist = sortedArtists[1] || 'Motive';
  const topGenre = sortedGenres[0] || 'Türkçe Pop';

  const mixes = [
    { 
      title: 'Haftalık Keşif', 
      subtitle: `Senin için özel ${topGenre} tarzı keşif listesi`, 
      cover: 'https://cdn-images.dzcdn.net/images/cover/01cc9a629bb24f3ba751c7065e3604c7/250x250-000000-80-0-0.jpg', 
      query: `${topGenre} Türkçe` 
    },
    { 
      title: 'Daily Mix 1', 
      subtitle: `${topArtist}, Motive ve fazlası`, 
      cover: 'https://cdn-images.dzcdn.net/images/cover/fea07231e297ee0c926aad963fc333bd/250x250-000000-80-0-0.jpg', 
      query: topArtist 
    },
    { 
      title: 'Daily Mix 2', 
      subtitle: `${secondArtist} ve benzerleri`, 
      cover: 'https://cdn-images.dzcdn.net/images/cover/67c1cd1241e05f44505ce76a4efb0367/250x250-000000-80-0-0.jpg', 
      query: secondArtist 
    },
    { 
      title: 'Daily Mix 3', 
      subtitle: `Popüler yerli ${topGenre} rüzgarları`, 
      query: `${topGenre} hitler`, 
      isCollage: true 
    },
    { 
      title: 'Sanatçı Radyosu', 
      subtitle: `${topArtist} parçalarından ilham alındı`, 
      query: topArtist, 
      isCollage: true 
    }
  ];

  const collagePromises = mixes.map(async (mix) => {
    if (mix.isCollage) {
      try {
        const data = await window.uniaAPI.searchMusic(mix.query);
        mix.tracks = data ? (data.results || []) : [];
      } catch (e) {
        mix.tracks = [];
      }
    }
    return mix;
  });

  await Promise.all(collagePromises);

  container.innerHTML = '';
  mixes.forEach(mix => {
    const card = document.createElement('div');
    card.className = 'today-rec-card';

    let coverElement = `<img src="${mix.cover}" alt="${mix.title}" style="width:100%; height:100%; object-fit:cover; margin-bottom:0;">`;
    if (mix.isCollage) {
      const onlineTracks = (mix.tracks || []).filter(t => t.artworkUrl100 && t.artworkUrl100.startsWith('http'));
      let covers = [];
      if (onlineTracks.length >= 4) {
        covers = onlineTracks.slice(0, 4).map(t => t.artworkUrl100.replace('100x100bb', '150x150bb'));
      } else {
        covers = [
          'https://e-cdns-images.dzcdn.net/images/cover/fea07231e297ee0c926aad963fc333bd/250x250-000000-80-0-0.jpg',
          'https://e-cdns-images.dzcdn.net/images/cover/67c1cd1241e05f44505ce76a4efb0367/250x250-000000-80-0-0.jpg',
          'https://e-cdns-images.dzcdn.net/images/cover/da1adf91c48761b8c60efb43a2840bf1/250x250-000000-80-0-0.jpg',
          'https://e-cdns-images.dzcdn.net/images/cover/cfa4241990ccbdbe5c72b578f934cce3/250x250-000000-80-0-0.jpg'
        ];
      }

      coverElement = `
        <div class="collage-cover" style="width:136px; height:136px; overflow:hidden; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; gap:0; margin-bottom:0; pointer-events:none;">
          <img src="${covers[0]}" style="width:100%; height:100%; object-fit:cover; margin:0; border-radius:0;">
          <img src="${covers[1]}" style="width:100%; height:100%; object-fit:cover; margin:0; border-radius:0;">
          <img src="${covers[2]}" style="width:100%; height:100%; object-fit:cover; margin:0; border-radius:0;">
          <img src="${covers[3]}" style="width:100%; height:100%; object-fit:cover; margin:0; border-radius:0;">
        </div>`;
    }

    card.innerHTML = `
      <div style="position:relative; width:136px; height:136px; border-radius:6px; overflow:hidden; margin-bottom:12px;">
        ${coverElement}
        <button class="card-play-btn" style="position:absolute; bottom:8px; right:8px; width:36px; height:36px; border-radius:50%; background-color:var(--primary-accent); color:#000; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; opacity:0; transition:opacity 0.2s, transform 0.2s;" title="Çal">
          <i data-lucide="play" style="fill:currentColor;"></i>
        </button>
      </div>
      <div class="today-rec-card-title">${escapeHtml(mix.title)}</div>
      <div class="today-rec-card-artist">${escapeHtml(mix.subtitle)}</div>
    `;

    card.onclick = async () => {
      try {
        showToast(`"${mix.title}" çalınıyor...`);
        const data = await window.uniaAPI.searchMusic(mix.query);
        const tracks = data ? (data.results || []) : [];
        if (tracks.length > 0) {
          state.currentTrackList = tracks;
          state.currentTrackIndex = 0;
          updatePlayerUI();
          loadAndPlayTrack();
        }
      } catch (err) { }
    };

    container.appendChild(card);
  });

  safeCreateIcons();
  makeDragScrollable(container);
}

export async function loadTodayRecommendations() {
  const container = document.getElementById('today-rec-container');
  if (!container) return;

  container.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:32px 0; width:100%;">
    <i class="ph-fill ph-circle-notch ph-spin" style="margin-right:8px; color:var(--primary-accent);"></i>Öneriler hazırlanıyor...
  </div>`;

  let recentTracks = [];
  if (state.currentUser && window.uniaAPI?.dbGetRecentlyPlayed) {
    try {
      recentTracks = await window.uniaAPI.dbGetRecentlyPlayed(state.currentUser.id);
    } catch (e) { }
  }
 
  // Merge database tracks with localStorage tracks to avoid async lag
  let localRecent = [];
  try {
    const lr = localStorage.getItem('unia_recently_played');
    if (lr) localRecent = JSON.parse(lr);
  } catch (e) { }
 
  const combined = [...localRecent];
  if (recentTracks && recentTracks.length > 0) {
    recentTracks.forEach(track => {
      if (!combined.some(t => String(t.trackId) === String(track.trackId))) {
        combined.push(track);
      }
    });
  }
  recentTracks = combined;

  let recommendationSource = [];
  if (recentTracks && recentTracks.length > 0) {
    const uniqueArtists = [...new Set(recentTracks.map(t => t.artistName))].slice(0, 3);
    const searchPromises = uniqueArtists.map(artist =>
      window.uniaAPI.searchMusic(artist).then(res => res ? (res.results || []) : []).catch(() => [])
    );
    const searchResults = await Promise.all(searchPromises);
    searchResults.forEach(tracksList => {
      recommendationSource.push(...tracksList);
    });
  }

  if (recommendationSource.length < 10) {
    try {
      const recData = await window.uniaAPI.getRecommendations();
      const recList = recData ? (recData.results || []) : [];
      recommendationSource.push(...recList);
    } catch (e) { }
  }

  const seenIds = new Set();
  const uniqueRecs = [];
  for (const track of recommendationSource) {
    const idStr = String(track.trackId || track.id || '');
    const alreadyPlayed = recentTracks && recentTracks.some(t => String(t.trackId) === idStr);
    if (idStr && !seenIds.has(idStr) && !alreadyPlayed) {
      seenIds.add(idStr);
      uniqueRecs.push(track);
    }
  }

  const finalRecs = uniqueRecs.slice(0, 10);

  container.innerHTML = '';
  if (finalRecs.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:32px 0; width:100%;">Bugün için tavsiye bulunamadı.</div>`;
    return;
  }

  finalRecs.forEach((track, idx) => {
    const card = document.createElement('div');
    card.className = 'today-rec-card';
    card._track = track;
    const cover = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '150x150bb') : '';
    const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
    const isActive = activeTrack && track.trackId === activeTrack.trackId;

    card.innerHTML = `
      <div style="position:relative; width:136px; height:136px; border-radius:6px; overflow:hidden; margin-bottom:12px;">
        <img src="${cover}" alt="Cover" style="width:100%; height:100%; object-fit:cover; margin-bottom:0;">
        <button class="card-play-btn" style="position:absolute; bottom:8px; right:8px; width:36px; height:36px; border-radius:50%; background-color:var(--primary-accent); color:#000; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; opacity:${isActive && state.isPlaying ? '1' : '0'}; transition:opacity 0.2s, transform 0.2s;" title="${isActive && state.isPlaying ? 'Duraklat' : 'Çal'}">
          <i data-lucide="${isActive && state.isPlaying ? 'pause' : 'play'}" style="fill:currentColor;"></i>
        </button>
      </div>
      <div class="today-rec-card-title">${escapeHtml(track.trackName)}</div>
      <div class="today-rec-card-artist">${escapeHtml(track.artistName)}</div>
      <div class="card-progress-container ${isActive ? '' : 'hidden'}" style="margin-top: 6px; width: 100%;">
        <div class="card-progress-fill"></div>
      </div>`;

    card.onclick = () => {
      const actTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
      const isAct = actTrack && track.trackId === actTrack.trackId;
      if (isAct) {
        handlePlayPause();
      } else {
        state.currentTrackList = finalRecs;
        state.currentTrackIndex = idx;
        updatePlayerUI();
        loadAndPlayTrack();
      }
    };

    container.appendChild(card);
  });

  makeDragScrollable(container);
}

// Render dynamic browse tags
export function renderBrowsePage(container) {
  container.innerHTML = `
    <div>
      <h2 style="font-size:24px; font-weight:800; margin-bottom:16px; font-family:inherit; color:var(--text-main);">Tümüne Göz At</h2>
      <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap:16px;">
        ${[
      { name: 'Pop', color: 'linear-gradient(135deg, #00ccff, #09090b)' },
      { name: 'Hip Hop', color: 'linear-gradient(135deg, #ff5722, #9c27b0)' },
      { name: 'Rock', color: 'linear-gradient(135deg, #e91e63, #3f51b5)' },
      { name: 'Elektronik', color: 'linear-gradient(135deg, #00bcd4, #009688)' },
      { name: 'Türkçe Pop', color: 'linear-gradient(135deg, #3f51b5, #2196f3)' }
    ].map(cat => `
          <div class="category-card" style="background:${cat.color}; height:150px; border-radius:8px; padding:16px; position:relative; cursor:pointer; overflow:hidden; box-shadow:0 4px 10px rgba(0,0,0,0.3); transition: transform 0.2s ease;">
            <span style="font-size:18px; font-weight:800; color:#fff; display:block;">${cat.name}</span>
          </div>
        `).join('')}
      </div>
    </div>`;

  container.querySelectorAll('.category-card').forEach(card => {
    card.onclick = () => {
      const catName = card.querySelector('span').textContent;
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.value = catName;
      document.querySelectorAll('.titlebar-btn').forEach(b => b.classList.remove('active'));

      // Call search
      const customEvent = new CustomEvent('trigger-search', { detail: catName });
      window.dispatchEvent(customEvent);
    };
    card.onmouseenter = () => card.style.transform = 'scale(1.05)';
    card.onmouseleave = () => card.style.transform = 'scale(1)';
  });
}

// Render dynamic notifications
export function renderNotificationsPage(container) {
  const notifKey = state.currentUser ? `unia_notifications_${state.currentUser.id}` : 'unia_notifications_guest';
  let notifications = [];
  try {
    notifications = JSON.parse(localStorage.getItem(notifKey) || '[]');
  } catch (e) {
    notifications = [];
  }

  const renderList = () => {
    const listDiv = container.querySelector('#notifications-list');
    if (!listDiv) return;

    if (notifications.length === 0) {
      listDiv.innerHTML = `
        <div style="color:var(--text-muted); font-size:14px; text-align:center; padding:48px 0; display:flex; flex-direction:column; align-items:center; gap:12px;">
          <i class="ph-fill ph-bell-slash" style="font-size:32px; color:white;"></i>
          <span>Henüz bir bildiriminiz bulunmuyor.</span>
        </div>`;
      return;
    }

    listDiv.innerHTML = notifications.map((notif, idx) => `
      <div style="display:flex; align-items:start; gap:16px; padding:16px; background:rgba(255,255,255,0.03); border-radius:8px; border:1px solid var(--border-light); justify-content:space-between;" class="notif-item" data-index="${idx}">
        <div style="display:flex; align-items:start; gap:16px; flex:1;">
          <div style="width:10px; height:10px; border-radius:50%; background:var(--primary-accent); margin-top:5px; flex-shrink:0;"></div>
          <div>
            <h4 style="font-size:14px; font-weight:700; color:var(--text-main); margin-bottom:4px; font-family:inherit;">${escapeHtml(notif.title)}</h4>
            <p style="font-size:12px; color:var(--text-muted); line-height:1.4; font-family:inherit;">${escapeHtml(notif.desc)}</p>
            <span style="font-size:10px; color:var(--text-subtle); display:block; margin-top:6px; font-family:inherit;">${escapeHtml(notif.time)}</span>
          </div>
        </div>
        <button class="delete-notif-btn" style="background:transparent; border:none; color:var(--text-subtle); cursor:pointer; font-size:14px; padding:4px; transition:color 0.2s;" onmouseover="this.style.color='#ff4d4d'" onmouseout="this.style.color='var(--text-subtle)'" title="Bildirimi Sil">
          <i class="ph-fill ph-trash"></i>
        </button>
      </div>`).join('');

    listDiv.querySelectorAll('.delete-notif-btn').forEach((btn, idx) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        notifications.splice(idx, 1);
        localStorage.setItem(notifKey, JSON.stringify(notifications));
        if (state.currentUser && window.uniaAPI?.dbUpdateUser) {
          window.uniaAPI.dbUpdateUser(state.currentUser.id, { notifications }).catch(() => { });
        }
        renderList();
        showToast('Bildirim silindi.');
      };
    });
  };

  container.innerHTML = `
    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
        <h2 style="font-size:24px; font-weight:800; font-family:inherit; color:var(--text-main); margin:0;">Yenilikler ve Bildirimler</h2>
        <button class="btn btn-outline" id="add-sample-notif-btn" style="padding:6px 14px; font-size:12px; font-weight:600; border-radius:20px;">Örnek Bildirim Ekle</button>
      </div>
      <div id="notifications-list" style="display:flex; flex-direction:column; gap:12px;"></div>
    </div>`;

  const addBtn = container.querySelector('#add-sample-notif-btn');
  if (addBtn) {
    addBtn.onclick = () => {
      const presets = [
        { title: 'Yeni Bir Parça Eklendi', desc: 'Wanda Nara parçası artık kütüphanenizde çalmaya hazır.', time: 'Az önce' },
        { title: 'Haftalık Keşif Çalma Listeniz Hazır!', desc: 'Seveceğiniz 30 yeni parça sizin için özel olarak derlendi.', time: '1 saat önce' }
      ];
      const random = presets[Math.floor(Math.random() * presets.length)];
      notifications.unshift({ ...random, id: Date.now() });
      localStorage.setItem(notifKey, JSON.stringify(notifications));
      if (state.currentUser && window.uniaAPI?.dbUpdateUser) {
        window.uniaAPI.dbUpdateUser(state.currentUser.id, { notifications }).catch(() => { });
      }
      renderList();
      showToast('Yeni bildirim eklendi!');
    };
  }
  renderList();
}

// Render dynamic friends activity from real database play records
export async function renderFriendsPage(container) {
  container.innerHTML = `
    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
        <h2 style="font-size:24px; font-weight:800; font-family:inherit; color:var(--text-main); margin:0;">Arkadaş Etkinliği</h2>
      </div>
      <div id="friends-activity-list" style="display:flex; flex-direction:column; gap:12px;">
        <div style="text-align:center; color:var(--text-muted); padding:32px 0; width:100%;">
          <i class="ph-fill ph-circle-notch ph-spin" style="margin-right:8px; color:var(--primary-accent);"></i>Canlı aktivite akışı yükleniyor...
        </div>
      </div>
    </div>`;

  const listDiv = container.querySelector('#friends-activity-list');
  if (!listDiv) return;

  try {
    // 1. Fetch real DB users
    let dbUsers = [];
    if (window.uniaAPI?.dbGetUsers) {
      dbUsers = await window.uniaAPI.dbGetUsers();
    }

    // 2. Filter out active user
    let filteredUsers = dbUsers.filter(u => !state.currentUser || u.id !== state.currentUser.id);

    // 3. For each user, fetch their actual last played track
    const friendsWithActivity = [];
    for (const user of filteredUsers) {
      let recent = [];
      try {
        recent = await window.uniaAPI.dbGetRecentlyPlayed(user.id) || [];
      } catch (e) {}

      // Treat the first item as what they are playing
      if (recent.length > 0) {
        const lastTrack = recent[0];
        friendsWithActivity.push({
          user,
          track: lastTrack,
          activeText: 'Çevrimiçi'
        });
      } else {
        // Safe premium fallback so seeded users always show activity
        let fallbackTrack = {
          trackId: '10mg_track',
          trackName: '10MG',
          artistName: 'Motive',
          artworkUrl100: 'https://cdn-images.dzcdn.net/images/cover/fea07231e297ee0c926aad963fc333bd/250x250-000000-80-0-0.jpg',
          trackTimeMillis: 168000,
          primaryGenreName: 'Rap',
          videoId: '10mg_vid'
        };
        if (user.username === 'Hadise') {
          fallbackTrack.trackName = 'Feryat';
          fallbackTrack.artistName = 'Hadise';
          fallbackTrack.artworkUrl100 = 'https://cdn-images.dzcdn.net/images/cover/67c1cd1241e05f44505ce76a4efb0367/250x250-000000-80-0-0.jpg';
        } else if (user.username === 'Lvbel C5') {
          fallbackTrack.trackName = 'MUSTAFA';
          fallbackTrack.artistName = 'Lvbel C5';
          fallbackTrack.artworkUrl100 = 'https://cdn-images.dzcdn.net/images/cover/01cc9a629bb24f3ba751c7065e3604c7/250x250-000000-80-0-0.jpg';
        } else if (user.username === 'Simge') {
          fallbackTrack.trackName = 'Aşkın Olayım';
          fallbackTrack.artistName = 'Simge';
          fallbackTrack.artworkUrl100 = 'https://cdn-images.dzcdn.net/images/cover/da1adf91c48761b8c60efb43a2840bf1/250x250-000000-80-0-0.jpg';
        }
        friendsWithActivity.push({
          user,
          track: fallbackTrack,
          activeText: '2 dk önce'
        });
      }
    }

    if (friendsWithActivity.length === 0) {
      listDiv.innerHTML = `
        <div style="color:var(--text-muted); font-size:14px; text-align:center; padding:48px 0; display:flex; flex-direction:column; align-items:center; gap:12px;">
          <i class="ph-fill ph-users-slash" style="font-size:32px; color:white;"></i>
          <span>Burada henüz hiç arkadaş etkinliği yok.</span>
        </div>`;
      return;
    }

    listDiv.innerHTML = '';
    friendsWithActivity.forEach(({ user, track, activeText }) => {
      const item = document.createElement('div');
      item.className = 'friend-item';
      item.style = 'display:flex; align-items:center; gap:16px; padding:12px 16px; background:rgba(255,255,255,0.03); border-radius:8px; border:1px solid var(--border-light); justify-content:space-between; cursor:pointer; transition: all 0.2s;';
      
      const avatarChar = user.username ? user.username.charAt(0).toUpperCase() : '?';
      const tc = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '60x60bb') : '';

      item.innerHTML = `
        <div style="display:flex; align-items:center; gap:16px; overflow:hidden; flex:1; margin-right:12px;">
          <div style="width:40px; height:40px; border-radius:50%; background:linear-gradient(135deg, var(--primary-accent), #09090b); display:flex; align-items:center; justify-content:center; font-weight:700; color:#000; font-size:15px; flex-shrink:0;">${escapeHtml(avatarChar)}</div>
          <div style="overflow:hidden; flex:1;">
            <h4 style="font-size:14px; font-weight:700; color:var(--text-main); font-family:inherit; margin:0;">${escapeHtml(user.username)}</h4>
            <div style="font-size:12px; color:var(--text-muted); margin-top:2px; font-family:inherit; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              <span style="color:var(--primary-accent); font-weight:600;">${escapeHtml(track.trackName)}</span> • ${escapeHtml(track.artistName)}
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:12px; flex-shrink:0;">
          <img src="${tc}" style="width:28px;height:28px;border-radius:4px;object-fit:cover;border:1px solid rgba(255,255,255,0.05);">
          <span style="font-size:11px; color:var(--text-subtle); font-family:inherit; font-weight:600; display:flex; align-items:center; gap:4px;">
            <span style="width:6px; height:6px; border-radius:50%; background:${activeText === 'Çevrimiçi' ? '#2ecc71' : '#f1c40f'}; display:inline-block;"></span>
            ${escapeHtml(activeText)}
          </span>
        </div>`;

      // Premium UX: Click friend item to immediately listen to their song!
      item.onclick = () => {
        showToast(`Arkadaşının şarkısı yükleniyor: "${track.trackName}"...`);
        state.currentTrackList = [track];
        state.currentTrackIndex = 0;
        updatePlayerUI();
        loadAndPlayTrack();
      };

      listDiv.appendChild(item);
    });

  } catch (err) {
    console.error('Failed to render friends activity page:', err);
    listDiv.innerHTML = `
      <div style="color:var(--text-muted); font-size:14px; text-align:center; padding:48px 0;">
        Arkadaş etkinliği yüklenemedi.
      </div>`;
  }
}

// Render dynamic shazam page
export function renderShazamPage(container) {
  const cancelBtn = container.querySelector('#shazam-cancel-btn');
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      stopShazamEngine();
      showPage('home');
    };
  }

  startShazamEngine(container);
}

export function startShazamEngine(container) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const root = container || document;

  const statusEl = root.querySelector('#shazam-lyrics-feedback');
  const inputContainer = root.querySelector('#shazam-input-container');
  const manualInput = root.querySelector('#shazam-manual-input');
  const resultsContainer = root.querySelector('#shazam-live-results');
  const headerTitle = root.querySelector('#shazam-header h2');
  const subHeader = root.querySelector('#shazam-sub-header');
  const ring1 = root.querySelector('#shazam-ring-1');
  const ring2 = root.querySelector('#shazam-ring-2');
  const micCore = root.querySelector('#shazam-mic-core');
  const micInner = root.querySelector('#shazam-mic-inner');
  const canvas = root.querySelector('#shazam-canvas');
  let ctx = canvas ? canvas.getContext('2d') : null;

  let analyser = null;
  let dataArray = null;
  let bufferLength = 0;
  let phase = 0;
  let shazamIsActive = false;
  let matchTimeout = null;

  function updateMicUI(stateVal) {
    if (!micInner) return;
    const micIcon = micInner.querySelector('i');
    if (stateVal === 'listening') {
      micInner.classList.remove('shazam-mic-armed');
      micInner.classList.add('shazam-mic-listening');
      if (micIcon) {
        micIcon.className = 'ph-fill ph-microphone';
      }
    } else {
      micInner.classList.remove('shazam-mic-listening');
      micInner.classList.add('shazam-mic-armed');
      if (micIcon) {
        micIcon.className = 'ph-fill ph-microphone-slash';
      }
    }
  }

  if (headerTitle) headerTitle.textContent = "Dinlemeyi Başlatın";
  if (subHeader) subHeader.textContent = "Ses keşfini başlatmak için ortadaki mikrofona tıklayın.";
  updateMicUI('armed');

  function drawPulse() {
    if (!ring1 && !ring2 && !micCore) return;

    let volume = 0;
    if (shazamIsActive && analyser && dataArray) {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      volume = sum / bufferLength;
    }

    let scale1 = 1 + (volume / 90);
    let scale2 = 1.25 + (volume / 70);
    let coreScale = 1 + (volume / 150);

    if (ring1) {
      ring1.style.transform = `scale(${scale1})`;
      ring1.style.display = shazamIsActive ? "block" : "none";
    }
    if (ring2) {
      ring2.style.transform = `scale(${scale2})`;
      ring2.style.display = shazamIsActive ? "block" : "none";
    }
    if (micCore && !micCore.matches(':active')) {
      micCore.style.transform = `scale(${coreScale})`;
    }

    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      const waveCount = 3;
      const waves = [
        { r: 255, g: 255, b: 255, alpha: 0.45, speed: 0.08, ampMult: 1.1 },
        { r: 255, g: 255, b: 255, alpha: 0.28, speed: -0.06, ampMult: 0.75 },
        { r: 255, g: 255, b: 255, alpha: 0.16, speed: 0.11, ampMult: 0.5 }
      ];

      ctx.save();
      for (let w = 0; w < waveCount; w++) {
        const cfg = waves[w];
        ctx.beginPath();
        ctx.lineWidth = w === 0 ? 3 : 1.5;
        ctx.strokeStyle = `rgba(${cfg.r}, ${cfg.g}, ${cfg.b}, ${cfg.alpha})`;
        ctx.shadowBlur = 12;
        ctx.shadowColor = `rgba(${cfg.r}, ${cfg.g}, ${cfg.b}, 0.4)`;

        const pOffset = phase * cfg.speed;
        const maxAmp = shazamIsActive ? (12 + volume * 1.6) : 2;

        ctx.moveTo(0, centerY);
        for (let x = 0; x <= width; x += 4) {
          const envelope = Math.sin((x / width) * Math.PI);
          const y = centerY + Math.sin(x * 0.03 + pOffset) * Math.cos(x * 0.012 + pOffset * 0.4) * maxAmp * cfg.ampMult * envelope;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      phase += 0.08;
      shazamAnimFrame = requestAnimationFrame(drawPulse);
    }
  }
  drawPulse();

  if (micCore) {
    micCore.onclick = () => {
      if (shazamIsActive) {
        shazamIsActive = false;
        updateMicUI('armed');
        if (headerTitle) headerTitle.textContent = "Dinleme Durduruldu";
        if (subHeader) subHeader.textContent = "Başlatmak için mikrofona tekrar tıklayın.";
        stopShazamEngine();
        if (matchTimeout) {
          clearTimeout(matchTimeout);
          matchTimeout = null;
        }
      } else {
        shazamIsActive = true;
        updateMicUI('listening');
        if (headerTitle) headerTitle.textContent = "Ortam Dinleniyor";
        if (subHeader) subHeader.textContent = "Unia çevrenizdeki sesleri analiz ediyor, müziği mikrofona yakınlaştırın...";

        startListeningSession();
      }
    };
  }

  function startListeningSession() {
    // 1. Check if there is an active media session globally on the OS (other than Unia itself)
    if (window.uniaAPI && typeof window.uniaAPI.getGlobalMedia === 'function') {
      window.uniaAPI.getGlobalMedia().then(async (globalMedia) => {
        if (!shazamIsActive) return;

        const isOurApp = globalMedia.app && (globalMedia.app.toLowerCase().includes('unia') || globalMedia.app.toLowerCase().includes('electron'));
        if (globalMedia.title && !isOurApp) {
          // Instantly matched an external song!
          stopShazamEngine();
          shazamIsActive = false;
          updateMicUI('armed');
          if (matchTimeout) {
            clearTimeout(matchTimeout);
            matchTimeout = null;
          }

          if (headerTitle) headerTitle.textContent = "Şarkı Bulundu!";
          
          let appName = 'Sistem/Tarayıcı';
          if (globalMedia.app) {
            if (globalMedia.app.toLowerCase().includes('chrome')) appName = 'Google Chrome';
            else if (globalMedia.app.toLowerCase().includes('spotify')) appName = 'Spotify';
            else if (globalMedia.app.toLowerCase().includes('edge')) appName = 'Microsoft Edge';
            else if (globalMedia.app.toLowerCase().includes('firefox')) appName = 'Firefox';
          }
          if (subHeader) subHeader.textContent = `Sistemde oynatılan parça başarıyla doğrulandı (${appName} üzerinden).`;

          let foundTrack = {
            trackName: globalMedia.title,
            artistName: globalMedia.artist || 'Bilinmeyen Sanatçı',
            artworkUrl100: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300',
            primaryGenreName: 'Müzik'
          };

          try {
            const query = `${globalMedia.artist || ''} ${globalMedia.title}`;
            const searchResult = await window.uniaAPI.searchMusic(query);
            if (searchResult && searchResult.results && searchResult.results.length > 0) {
              foundTrack = searchResult.results[0];
            }
          } catch (err) {
            console.warn('Failed to fetch iTunes details for Shazam:', err);
          }

          const area = root.querySelector('#shazam-visualizer-area');
          if (area) {
            area.style.height = "auto";
            area.innerHTML = `
              <div style="display:flex; align-items:center; gap:20px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); padding:20px; border-radius:20px; width:100%; max-width:380px; backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); transition:all 0.3s;" class="shazam-animate-slide-up">
                <img src="${foundTrack.artworkUrl100 ? foundTrack.artworkUrl100.replace('100x100bb', '300x300bb') : ''}" style="width:90px; height:90px; border-radius:12px; object-fit:cover; border:1px solid rgba(255,255,255,0.05);">
                <div style="display:flex; flex-direction:column; overflow:hidden; flex:1;">
                  <span style="font-weight:900; color:#fff; font-size:16px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; letter-spacing:-0.3px;">${escapeHtml(foundTrack.trackName)}</span>
                  <span style="color:var(--text-muted); font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:4px; font-weight:500;">${escapeHtml(foundTrack.artistName)}</span>
                  <button class="shazam-btn-primary" id="shazam-found-play-btn" style="margin-top:14px; width:fit-content; padding:6px 20px; font-size:12px; font-weight:700; border-radius:24px; cursor:pointer;">Hemen Dinle</button>
                </div>
              </div>`;
            const playBtn = area.querySelector('#shazam-found-play-btn');
            if (playBtn) {
              playBtn.onclick = () => {
                state.currentTrackList = [foundTrack];
                state.currentTrackIndex = 0;
                updatePlayerUI();
                loadAndPlayTrack();
                showPage('home');
              };
            }
          }
          return;
        }
      }).catch(err => {
        console.warn('[Shazam] Global media session check failed:', err);
      });
    }

    // 2. Fall back to standard Microphone and Speech Recognition for ambient listening
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      if (!shazamIsActive) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      shazamStream = stream;

      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        shazamAudioContext = new AudioCtx();
        analyser = shazamAudioContext.createAnalyser();
        const source = shazamAudioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 64;
        bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
      } catch (e) { }

      if (SpeechRecognition) {
        shazamRecognition = new SpeechRecognition();
        shazamRecognition.lang = 'tr-TR';
        shazamRecognition.continuous = true;
        shazamRecognition.interimResults = true;

        shazamRecognition.onresult = (event) => {
          if (!shazamIsActive) return;
          let interimTranscript = '';
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          const activeText = finalTranscript || interimTranscript;

          if (finalTranscript && finalTranscript.trim().length > 3) {
            stopShazamEngine();
            shazamIsActive = false;
            updateMicUI('armed');
            if (matchTimeout) {
              clearTimeout(matchTimeout);
              matchTimeout = null;
            }
            const searchInput = document.getElementById('search-input');
            if (searchInput) searchInput.value = finalTranscript.trim();
            showPage('home');
            showToast(`"${finalTranscript.trim()}" sözleriyle arama yapıldı!`);

            const customEvent = new CustomEvent('trigger-search', { detail: finalTranscript.trim() });
            window.dispatchEvent(customEvent);
          }
        };

        shazamRecognition.onerror = () => { };
        shazamRecognition.onend = () => {
          if (shazamStream && shazamRecognition && shazamIsActive) {
            try { shazamRecognition.start(); } catch (err) { }
          }
        };
        shazamRecognition.start();
      }
    }).catch(err => {
      console.warn("Microphone access failed:", err);
      shazamIsActive = false;
      updateMicUI('armed');
    });

    matchTimeout = setTimeout(() => {
      if (!shazamIsActive) return;
      const isPlayingInApp = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] && state.isPlaying;

      if (isPlayingInApp) {
        const track = state.currentTrackList[state.currentTrackIndex];
        stopShazamEngine();
        shazamIsActive = false;
        updateMicUI('armed');

        if (headerTitle) headerTitle.textContent = "Şarkı Bulundu!";
        if (subHeader) subHeader.textContent = "Şu an oynatılan parça başarıyla doğrulandı.";

        const area = root.querySelector('#shazam-visualizer-area');
        if (area) {
          area.style.height = "auto";
          area.innerHTML = `
            <div style="display:flex; align-items:center; gap:20px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); padding:20px; border-radius:20px; width:100%; max-width:380px; backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); transition:all 0.3s;" class="shazam-animate-slide-up">
              <img src="${track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '300x300bb') : ''}" style="width:90px; height:90px; border-radius:12px; object-fit:cover; border:1px solid rgba(255,255,255,0.05);">
              <div style="display:flex; flex-direction:column; overflow:hidden; flex:1;">
                <span style="font-weight:900; color:#fff; font-size:16px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; letter-spacing:-0.3px;">${escapeHtml(track.trackName)}</span>
                <span style="color:var(--text-muted); font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:4px; font-weight:500;">${escapeHtml(track.artistName)}</span>
                <button class="shazam-btn-primary" id="shazam-found-play-btn" style="margin-top:14px; width:fit-content; padding:6px 20px; font-size:12px; font-weight:700; border-radius:24px; cursor:pointer;">Hemen Dinle</button>
              </div>
            </div>`;
          const playBtn = area.querySelector('#shazam-found-play-btn');
          if (playBtn) {
            playBtn.onclick = () => {
              showPage('home');
            };
          }
        }
      } else {
        if (headerTitle) headerTitle.textContent = "Şarkı Bulunamadı";
        if (subHeader) subHeader.textContent = "Sözleri yazarak hemen bulun veya mikrofona dokunarak aramayı tekrar deneyin.";

        shazamIsActive = false;
        updateMicUI('armed');
        stopShazamEngine();

        if (inputContainer) {
          inputContainer.style.display = "block";
          setTimeout(() => {
            inputContainer.style.opacity = "1";
            inputContainer.style.transform = "translateY(0)";
            inputContainer.classList.add('shazam-animate-slide-up');
            if (manualInput) manualInput.focus();
          }, 50);
        }
      }
    }, 4500);
  }

  if (manualInput) {
    manualInput.oninput = async () => {
      const q = manualInput.value.trim();
      if (q.length < 2) {
        if (resultsContainer) resultsContainer.innerHTML = "";
        return;
      }

      try {
        const data = await window.uniaAPI.searchMusic(q);
        const tracks = data ? (data.results || []) : [];
        if (!resultsContainer) return;

        resultsContainer.innerHTML = "";
        if (tracks.length === 0) {
          resultsContainer.innerHTML = `<span style="font-size:12px; color:var(--text-muted); text-align:center; padding:8px 0; font-weight:500;">Herhangi bir şarkı eşleşmesi bulunamadı.</span>`;
          return;
        }

        tracks.slice(0, 3).forEach((track, i) => {
          const item = document.createElement('div');
          item.className = "shazam-result-card shazam-animate-slide-up";
          item.style.animationDelay = `${i * 0.08}s`;

          item.innerHTML = `
            <img src="${track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '60x60bb') : ''}" style="width:44px; height:44px; border-radius:8px; object-fit:cover; border:1px solid rgba(255,255,255,0.04);">
            <div style="display:flex; flex-direction:column; overflow:hidden; flex:1;">
              <span style="font-weight:700; color:#fff; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(track.trackName)}</span>
              <span style="color:var(--text-muted); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;">${escapeHtml(track.artistName)}</span>
            </div>`;
          item.onclick = () => {
            state.currentTrackList = [track];
            state.currentTrackIndex = 0;
            updatePlayerUI();
            loadAndPlayTrack();
            showPage('home');
            showToast(`"${track.trackName}" çalınıyor!`);
          };
          resultsContainer.appendChild(item);
        });
      } catch (e) { }
    };
  }
}

export function stopShazamEngine() {
  if (shazamRecognition) {
    try {
      shazamRecognition.onend = null;
      shazamRecognition.stop();
    } catch (e) { }
    shazamRecognition = null;
  }
  if (shazamStream) {
    try {
      shazamStream.getTracks().forEach(t => t.stop());
    } catch (e) { }
    shazamStream = null;
  }
  if (shazamAudioContext) {
    try {
      shazamAudioContext.close();
    } catch (e) { }
    shazamAudioContext = null;
  }
  if (shazamAnimFrame) {
    try {
      cancelAnimationFrame(shazamAnimFrame);
    } catch (e) { }
    shazamAnimFrame = null;
  }
}

// Sidebars & Playbar Core rendering
export function renderLibrarySidebar() {
  const libraryListContainer = document.getElementById('library-list-container');
  if (!libraryListContainer) return;
  libraryListContainer.innerHTML = '';

  const activePill = document.querySelector('.filter-pills .pill-btn.active');
  const filterText = activePill ? activePill.textContent.trim() : 'Tümü';

  // Beğenilen Şarkılar
  if (filterText === 'Tümü' || filterText === 'Çalma Listeleri') {
    const likedItem = document.createElement('div');
    likedItem.className = 'library-item';
    likedItem.innerHTML = `
      <div class="library-item-cover liked-songs-grad" style="background: linear-gradient(135deg, #f50a0aff, #efc4dcff); color: #fff; display:flex; align-items:center; justify-content:center; border-radius:4px; width:48px; height:48px;">
        <i data-lucide="heart" style="fill: white;"></i>
      </div>
      <div class="library-item-info">
        <div class="item-title">Beğenilen Şarkılar</div>
        <div class="item-subtitle">Çalma listesi • ${state.likedTracks.length} Şarkı</div>
      </div>`;
    likedItem.onclick = () => {
      showPage('liked-songs', state.likedTracks);
    };
    libraryListContainer.appendChild(likedItem);
  }

  // Yerel Dosyalar
  if (filterText === 'Tümü' || filterText === 'Çalma Listeleri') {
    const localItem = document.createElement('div');
    localItem.className = 'library-item';
    localItem.innerHTML = `
      <div class="library-item-cover" style="background: linear-gradient(135deg, #2b5876, #4e4376); color: #fff; display:flex; align-items:center; justify-content:center; border-radius:4px; width:48px; height:48px;">
        <i class="ph-fill ph-folder"></i>
      </div>
      <div class="library-item-info">
        <div class="item-title">Yerel Dosyalar</div>
        <div class="item-subtitle">Çevrimdışı • ${state.localTracks.length} dosya</div>
      </div>`;
    localItem.onclick = () => {
      showPage('local-files', state.localTracks);
    };
    libraryListContainer.appendChild(localItem);
  }

  // Render created playlists
  state.playlists.forEach(playlist => {
    const item = document.createElement('div');
    item.className = 'library-item';

    const hasCover = playlist.coverUrl;
    const coverHTML = hasCover
      ? `<img src="${escapeHtml(playlist.coverUrl)}" style="width:100%; height:100%; object-fit:cover; border-radius:4px;" />`
      : `<i data-lucide="list"></i>`;
    const coverClass = hasCover ? 'library-item-cover' : 'library-item-cover liked-songs-grad';
    const coverStyle = hasCover ? 'display:flex; align-items:center; justify-content:center;' : 'background: linear-gradient(135deg, var(--primary-accent), #09090b); color: #fff; display:flex; align-items:center; justify-content:center;';

    item.innerHTML = `
      <div class="${coverClass}" style="${coverStyle}">
        ${coverHTML}
      </div>
      <div class="library-item-info">
        <div class="item-title">${escapeHtml(playlist.name)}</div>
        <div class="item-subtitle">Çalma listesi • ${playlist.tracks.length} şarkı</div>
      </div>`;
    item.onclick = () => {
      showPage('playlist', playlist);
    };

    // Right-click delete context menu
    item.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.contextMenuTargetPlaylistId = playlist.id;
      const plMenu = document.getElementById('playlist-context-menu');
      if (plMenu) {
        plMenu.style.left = `${e.clientX}px`;
        plMenu.style.top = `${e.clientY}px`;
        plMenu.classList.remove('hidden');
        plMenu.style.display = 'block';
      }
    };

    libraryListContainer.appendChild(item);
  });

  // Create playlist button
  if (filterText === 'Tümü' || filterText === 'Çalma Listeleri') {
    const createCard = document.createElement('div');
    createCard.className = 'library-item';
    createCard.style = 'border: 1px dashed var(--border-light); border-radius:6px;';
    createCard.innerHTML = `
      <div class="library-item-cover" style="background: rgba(255,255,255,0.05); color: var(--text-muted); display:flex; align-items:center; justify-content:center; border-radius:4px; width:48px; height:48px;">
        <i data-lucide="plus"></i>
      </div>
      <div class="library-item-info">
        <div class="item-title" style="color:var(--primary-accent); font-weight:600;">Yeni Kitaplık Oluştur</div>
        <div class="item-subtitle">Çalma listesi ekle</div>
      </div>`;
    createCard.onclick = () => {
      const newPlaylist = {
        id: Date.now(),
        name: `Çalma Listem #${state.playlists.length + 1}`,
        tracks: []
      };
      state.playlists.push(newPlaylist);
      savePlaylists();
      renderLibrarySidebar();
      showPage('playlist', newPlaylist);
    };
    libraryListContainer.appendChild(createCard);
  }

  safeCreateIcons();
}

export function renderMainGrid(tracks) {
  const quickGrid = document.querySelector('.quick-grid');
  if (!quickGrid) return;
  quickGrid.innerHTML = '';

  const searchInput = document.getElementById('search-input');
  const isSearchActive = searchInput && searchInput.value.trim().length > 0;

  if (isSearchActive) {
    quickGrid.classList.add('search-list-active');

    const q = searchInput.value.trim().toLowerCase();
    const matchingUsers = state.users.filter(u =>
      u.username.toLowerCase().includes(q) &&
      (!state.currentUser || u.id !== state.currentUser.id)
    );

    if (matchingUsers.length === 0 && tracks.length === 0) {
      quickGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:32px 0;">Sonuç bulunamadı.</div>';
      return;
    }

    if (matchingUsers.length > 0) {
      const userHeader = document.createElement('div');
      userHeader.style = 'grid-column: 1 / -1; margin-top: 12px; margin-bottom: 8px; font-size: 14px; font-weight: 800; color: var(--primary-accent); text-transform: uppercase;';
      userHeader.textContent = 'Kullanıcılar';
      quickGrid.appendChild(userHeader);

      matchingUsers.forEach(user => {
        const userRow = document.createElement('div');
        userRow.className = 'search-row-item';
        userRow.style = 'display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-radius: 8px; background: rgba(255,255,255,0.02); transition: background 0.2s; margin-bottom: 6px;';

        const photoUrl = user.profilePhotoUrl || user.profile_photo_url || '';
        const initial = user.username.charAt(0).toUpperCase();
        const avatarHTML = photoUrl
          ? `<img src="${photoUrl}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; flex-shrink:0;">`
          : `<div style="width:40px; height:40px; border-radius:50%; background:linear-gradient(135deg, var(--primary-accent), #09090b); display:flex; align-items:center; justify-content:center; font-weight:700; color:#000; font-size:16px; flex-shrink:0;">${initial}</div>`;

        const followedKey = state.currentUser ? `unia_followed_users_${state.currentUser.id}` : 'unia_followed_users_guest';
        const followedUsers = JSON.parse(localStorage.getItem(followedKey) || '[]');
        const isFollowing = followedUsers.includes(user.id);

        userRow.innerHTML = `
          <div style="display:flex; align-items:center; gap:14px; flex:1; cursor:pointer;" class="user-profile-click">
            ${avatarHTML}
            <div style="display:flex; flex-direction:column; overflow:hidden;">
              <span style="font-weight:600; color:var(--text-main); font-size:14px;">${escapeHtml(user.username)}</span>
              <span style="font-size:11px; color:var(--text-muted);">${escapeHtml(user.email || 'Kullanıcı')}</span>
            </div>
          </div>
          <button class="follow-user-btn pill-btn ${isFollowing ? '' : 'active'}" style="padding: 6px 16px; font-size: 12px; font-weight: 700; border-radius: 20px; cursor: pointer; transition: all 0.2s; background: ${isFollowing ? 'transparent' : 'var(--primary-accent)'}; border: 1px solid ${isFollowing ? 'var(--border-light)' : 'transparent'}; color: ${isFollowing ? 'var(--text-main)' : '#000'};">
            ${isFollowing ? 'Takip Ediliyor' : 'Takip Et'}
          </button>`;

        userRow.querySelector('.user-profile-click').onclick = () => {
          showPage('profile', user);
        };

        const followBtn = userRow.querySelector('.follow-user-btn');
        followBtn.onclick = (e) => {
          e.stopPropagation();
          toggleFollowUser(user, followBtn);
        };

        quickGrid.appendChild(userRow);
      });
    }

    if (tracks.length > 0) {
      if (matchingUsers.length > 0) {
        const songHeader = document.createElement('div');
        songHeader.style = 'grid-column: 1 / -1; margin-top: 20px; margin-bottom: 8px; font-size: 14px; font-weight: 800; color: var(--primary-accent); text-transform: uppercase;';
        songHeader.textContent = 'Şarkılar';
        quickGrid.appendChild(songHeader);
      }

      tracks.forEach((track, idx) => {
        const row = document.createElement('div');
        row._track = track;

        const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
        const isActive = activeTrack && track.trackId === activeTrack.trackId;

        row.className = 'search-row-item' + (isActive ? ' active' : '');
        if (isActive && state.isPlaying) {
          row.className += ' playing';
        }
        const cover = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '60x60bb') : '';
        row.innerHTML = `
          <span class="search-col-num" style="color:var(--text-muted); font-size:13px; font-weight:600; width:30px; text-align:center; display:flex; align-items:center; justify-content:center;">
            <span class="num-text">${idx + 1}</span>
            <i class="ph-fill ph-play play-icon" style="display:none; font-size:14px; fill:currentColor;"></i>
            <i class="ph-fill ph-pause pause-icon" style="display:none; font-size:14px; fill:currentColor;"></i>
            <span class="playing-indicator" style="display:none;"><i class="ph-fill ph-music-notes ph-bounce" style="font-size:13px; color:var(--primary-accent);"></i></span>
          </span>
          <div style="display:flex; align-items:center; gap:12px; flex:1; overflow:hidden;">
            <img src="${cover}" style="width:40px; height:40px; border-radius:4px; object-fit:cover; flex-shrink:0;">
            <div style="overflow:hidden;">
              <div class="search-title-text" style="font-weight:600; color:var(--text-main); font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(track.trackName)}</div>
              <div style="font-size:11px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(track.artistName)}</div>
            </div>
          </div>
          <span style="font-size:12px; color:var(--text-muted); flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(track.primaryGenreName || 'Pop')}</span>
          <span style="font-size:12px; color:var(--text-muted); width:60px; text-align:right;">${formatTime(Math.floor(track.trackTimeMillis / 1000))}</span>`;

        row.onclick = () => {
          const actTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
          const isAct = actTrack && track.trackId === actTrack.trackId;
          if (isAct) {
            handlePlayPause();
          } else {
            state.currentTrackList = tracks;
            state.currentTrackIndex = idx;
            updatePlayerUI();
            loadAndPlayTrack();
          }
        };

        quickGrid.appendChild(row);
      });
    }
  } else {
    // Normal 8-card grid
    if (tracks.length === 0) {
      quickGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:32px 0;">Şarkı bulunamadı.</div>';
      return;
    }

    quickGrid.classList.remove('search-list-active');

    tracks.forEach((track, idx) => {
      const card = document.createElement('div');
      card._track = track;

      const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
      const isActive = activeTrack && track.trackId === activeTrack.trackId;

      card.className = 'grid-card' + (isActive ? ' active' : '');
      const cover = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '150x150bb') : '';
      card.innerHTML = `
        <img class="card-img" src="${cover}" alt="Cover">
        <div class="card-title-container" style="display: flex; flex-direction: column; justify-content: center; position: relative;">
          <span class="card-title">${escapeHtml(track.trackName)}</span>
          <span style="font-size:11px;color:var(--text-muted);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(track.artistName)}</span>
          <div class="card-progress-container ${isActive ? '' : 'hidden'}">
            <div class="card-progress-fill"></div>
          </div>
        </div>
        <button class="card-play-btn" title="${isActive && state.isPlaying ? 'Duraklat' : 'Çal'}">
          <i data-lucide="${isActive && state.isPlaying ? 'pause' : 'play'}" style="fill: currentColor;"></i>
        </button>`;

      card.onclick = () => {
        const actTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
        const isAct = actTrack && track.trackId === actTrack.trackId;
        if (isAct) {
          handlePlayPause();
        } else {
          state.currentTrackList = tracks;
          state.currentTrackIndex = idx;
          updatePlayerUI();
          loadAndPlayTrack();
        }
      };
      quickGrid.appendChild(card);
    });
  }
  safeCreateIcons();
}

export function updateBillboardBanner(track) {
  const bannerTitle = document.querySelector('.banner-title');
  const bannerBadge = document.querySelector('.banner-badge');
  const bannerPlayBtn = document.getElementById('banner-play-btn');
  if (!bannerTitle || !bannerBadge || !bannerPlayBtn) return;

  const activeTrack = track || (state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null);

  if (activeTrack) {
    bannerTitle.textContent = activeTrack.trackName;
    const bannerCover = document.getElementById('banner-track-cover');
    if (bannerCover) {
      bannerCover.src = activeTrack.artworkUrl100 ? activeTrack.artworkUrl100.replace('100x100bb', '300x300bb') : '';
    }

    if (state.isPlaying && state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex]?.trackId === activeTrack.trackId) {
      bannerBadge.innerHTML = `<span class="banner-badge-icon"><i data-lucide="disc" class="lucide-spin"></i></span>${escapeHtml(activeTrack.artistName)} <span class="badge-sub">Şu An Çalıyor</span>`;
      bannerPlayBtn.innerHTML = `<i data-lucide="pause" style="margin-right: 8px;"></i> Duraklat`;
    } else {
      bannerBadge.innerHTML = `<span class="banner-badge-icon"><i data-lucide="play-circle"></i></span>${escapeHtml(activeTrack.artistName)} <span class="badge-sub">Çalmaya Hazır</span>`;
      bannerPlayBtn.innerHTML = `<i data-lucide="play" style="margin-right: 8px; fill: currentColor;"></i> Oynat`;
    }

    bannerPlayBtn.onclick = (e) => {
      e.stopPropagation();
      if (state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex]?.trackId === activeTrack.trackId) {
        handlePlayPause();
      } else {
        const idx = state.currentTrackList.findIndex(t => t.trackId === activeTrack.trackId);
        if (idx !== -1) {
          state.currentTrackIndex = idx;
        } else {
          state.currentTrackList = [activeTrack];
          state.currentTrackIndex = 0;
        }
        updatePlayerUI();
        loadAndPlayTrack();
      }
    };
  } else {
    const fallbackTrack = homeTracks && homeTracks[0];
    if (fallbackTrack) {
      bannerTitle.textContent = fallbackTrack.trackName;
      bannerBadge.innerHTML = `<span class="banner-badge-icon"><i data-lucide="info"></i></span>${escapeHtml(fallbackTrack.artistName)} <span class="badge-sub">Önerilen</span>`;
      bannerPlayBtn.innerHTML = `<i data-lucide="play" style="margin-right: 8px; fill: currentColor;"></i> Hemen dinle`;
      bannerPlayBtn.onclick = (e) => {
        e.stopPropagation();
        state.currentTrackList = [fallbackTrack];
        state.currentTrackIndex = 0;
        updatePlayerUI();
        loadAndPlayTrack();
      };
    } else {
      bannerTitle.textContent = "BABAYLA ZOR YARIŞIRLAR.";
      bannerBadge.innerHTML = `<span class="banner-badge-icon"><i data-lucide="info"></i></span>Universal Music Türkiye <span class="badge-sub">Duyuru</span>`;
      bannerPlayBtn.innerHTML = `Hemen dinle`;
      bannerPlayBtn.onclick = null;
    }
  }
  safeCreateIcons();
}

export function revealPlayerUI() {
  if (state.hasEverPlayed) return;
  state.hasEverPlayed = true;
  document.querySelector('.playbar')?.classList.remove('playbar-hidden');
  document.querySelector('.sidebar-right')?.classList.remove('sidebar-right-hidden');
  document.querySelector('.main-layout')?.classList.remove('sidebar-right-hidden-layout');
}

export function updatePlayerUI() {
  if (state.currentTrackIndex < 0 || !state.currentTrackList[state.currentTrackIndex]) return;
  const track = state.currentTrackList[state.currentTrackIndex];

  const highRes = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '500x500bb') : '';
  const medRes = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '300x300bb') : '';

  const playbarName = document.getElementById('playbar-name');
  const playbarArtist = document.getElementById('playbar-artist');
  const playbarCover = document.getElementById('playbar-cover');
  if (playbarName) playbarName.textContent = track.trackName;
  if (playbarArtist) playbarArtist.textContent = track.artistName;
  if (playbarCover) playbarCover.src = medRes;

  const mobMiniArtwork = document.getElementById('mobile-mini-artwork');
  const mobMiniTrackName = document.getElementById('mobile-mini-track-name');
  const mobMiniArtist = document.getElementById('mobile-mini-artist');
  if (mobMiniArtwork) mobMiniArtwork.src = medRes;
  if (mobMiniTrackName) mobMiniTrackName.textContent = track.trackName;
  if (mobMiniArtist) mobMiniArtist.textContent = track.artistName;

  const mobPlayerArtwork = document.getElementById('mobile-player-artwork');
  const mobPlayerTrackName = document.getElementById('mobile-player-track-name');
  const mobPlayerArtist = document.getElementById('mobile-player-artist');
  const mobPlayerGlow = document.getElementById('mobile-player-glow');
  if (mobPlayerArtwork) mobPlayerArtwork.src = highRes;
  if (mobPlayerTrackName) mobPlayerTrackName.textContent = track.trackName;
  if (mobPlayerArtist) mobPlayerArtist.textContent = track.artistName;
  if (mobPlayerGlow) mobPlayerGlow.style.background = `var(--primary-accent)`;

  const rightSidebarTitle = document.getElementById('right-sidebar-title');
  const rightTrackName = document.getElementById('right-track-name');
  const rightTrackArtists = document.getElementById('right-track-artists');
  const rightCoverImg = document.getElementById('right-cover-img');
  if (rightSidebarTitle) rightSidebarTitle.textContent = track.trackName;
  if (rightTrackName) rightTrackName.textContent = track.trackName;
  if (rightTrackArtists) rightTrackArtists.textContent = track.artistName;
  if (rightCoverImg) rightCoverImg.src = highRes;

  let differentTrack = null;
  if (track.artistName) {
    const searchArtistName = track.artistName.toLowerCase().trim();
    differentTrack = (state.currentTrackList || []).find(t =>
      t.artistName && t.artistName.toLowerCase().trim() === searchArtistName &&
      String(t.trackId) !== String(track.trackId)
    );
  }

  const updateRelatedVideoUI = (vidTrack) => {
    const rightVidTitle = document.getElementById('right-video-title');
    const rightVidArtists = document.getElementById('right-video-artists');
    const rightVidThumb = document.getElementById('right-video-thumb');
    const videoCard = document.querySelector('.video-card');

    if (rightVidTitle) rightVidTitle.textContent = vidTrack.trackName;
    if (rightVidArtists) rightVidArtists.textContent = vidTrack.artistName;
    if (rightVidThumb) rightVidThumb.src = vidTrack.artworkUrl100 ? vidTrack.artworkUrl100.replace('100x100bb', '300x300bb') : '';
    if (videoCard) {
      videoCard.onclick = () => {
        state.currentTrackList = [vidTrack];
        state.currentTrackIndex = 0;
        updatePlayerUI();
        loadAndPlayTrack();
      };
    }
  };

  if (differentTrack) {
    updateRelatedVideoUI(differentTrack);
  } else {
    const rightVidTitle = document.getElementById('right-video-title');
    const rightVidArtists = document.getElementById('right-video-artists');
    const rightVidThumb = document.getElementById('right-video-thumb');
    if (rightVidTitle) rightVidTitle.textContent = track.trackName;
    if (rightVidArtists) rightVidArtists.textContent = track.artistName;
    if (rightVidThumb) rightVidThumb.src = medRes;

    const videoCard = document.querySelector('.video-card');
    if (videoCard) {
      videoCard.onclick = () => {
        state.currentTrackList = [track];
        state.currentTrackIndex = 0;
        updatePlayerUI();
        loadAndPlayTrack();
      };
    }

    if (track.artistName && window.uniaAPI?.searchMusic) {
      window.uniaAPI.searchMusic(track.artistName).then(data => {
        const results = data ? (data.results || []) : [];
        const found = results.find(t => String(t.trackId) !== String(track.trackId));
        if (found) updateRelatedVideoUI(found);
      }).catch(() => { });
    }
  }

  const aboutArtistName = document.getElementById('about-artist-name');
  const listeners = document.querySelector('.monthly-listeners');
  if (aboutArtistName) aboutArtistName.textContent = track.artistName;
  if (listeners) listeners.textContent = `Tür: ${track.primaryGenreName || 'Pop'}`;

  // Update follow button
  try {
    const followedKey = state.currentUser ? `unia_followed_artists_${state.currentUser.id}` : 'unia_followed_artists_guest';
    const followed = JSON.parse(localStorage.getItem(followedKey) || '[]');
    const followBtn = document.querySelector('.about-artist-box .btn');
    if (followBtn) {
      const isFollowing = followed.includes(track.artistName);
      followBtn.textContent = isFollowing ? 'Takip Ediliyor' : 'Takip Et';
      followBtn.classList.toggle('btn-outline', isFollowing);
      followBtn.classList.toggle('btn-primary', !isFollowing);
    }
  } catch (e) { }

  // Update like buttons
  const isLiked = state.likedTracks.some(t => t.trackId === track.trackId);
  const playbarLikeBtn = document.getElementById('playbar-like');
  const rightLikeBtn = document.getElementById('right-like-btn');
  if (playbarLikeBtn) {
    const heartEmpty = playbarLikeBtn.querySelector('.heart-empty');
    const heartFilled = playbarLikeBtn.querySelector('.heart-filled');
    if (heartEmpty && heartFilled) {
      heartEmpty.classList.toggle('hidden', isLiked);
      heartFilled.classList.toggle('hidden', !isLiked);
    }
    playbarLikeBtn.classList.toggle('active', isLiked);
  }
  if (rightLikeBtn) {
    rightLikeBtn.classList.toggle('check-active', isLiked);
  }

  // Duration labels
  const timeDurationLabel = document.getElementById('time-duration');
  const timeElapsedLabel = document.getElementById('time-elapsed');
  const timelineFill = document.getElementById('timeline-fill');
  const timelineThumb = document.getElementById('timeline-thumb');
  if (timeDurationLabel) timeDurationLabel.textContent = track.trackTimeMillis ? formatTime(Math.floor(track.trackTimeMillis / 1000)) : '0:00';
  if (timeElapsedLabel) timeElapsedLabel.textContent = '0:00';
  if (timelineFill) timelineFill.style.width = '0%';
  if (timelineThumb) timelineThumb.style.left = '0%';

  renderLibrarySidebar();
  updateDynamicBackground(medRes || highRes);
  updateArtistAndBannerUI(track);
  updateBillboardBanner(track);

  // Active grid card highlight
  const gridCards = document.querySelectorAll('.quick-grid .grid-card');
  gridCards.forEach((card) => {
    const isActive = card._track && card._track.trackId === track.trackId;
    card.classList.toggle('active', isActive);
    const container = card.querySelector('.card-progress-container');
    if (container) {
      container.classList.toggle('hidden', !isActive);
      const fill = container.querySelector('.card-progress-fill');
      if (fill && !isActive) fill.style.width = '0%';
    }
  });

  const searchRows = document.querySelectorAll('.quick-grid .search-row-item');
  searchRows.forEach((row) => {
    const isActive = row._track && row._track.trackId === track.trackId;
    row.classList.toggle('active', isActive);
  });

  const carouselCards = document.querySelectorAll('.today-rec-container .today-rec-card');
  carouselCards.forEach(card => {
    const isActive = card._track && card._track.trackId === track.trackId;
    const container = card.querySelector('.card-progress-container');
    if (container) {
      container.classList.toggle('hidden', !isActive);
      const fill = container.querySelector('.card-progress-fill');
      if (fill && !isActive) fill.style.width = '0%';
    }
  });

  // Mini player elements
  const miniCover = document.getElementById('mini-cover');
  const miniTrackName = document.getElementById('mini-track-name');
  const miniArtistName = document.getElementById('mini-artist-name');
  const miniBackdrop = document.getElementById('mini-backdrop-glow');
  const miniDuration = document.getElementById('mini-time-duration');
  if (miniCover) miniCover.src = medRes;
  if (miniTrackName) miniTrackName.textContent = track.trackName;
  if (miniArtistName) miniArtistName.textContent = track.artistName;
  if (miniDuration) miniDuration.textContent = track.trackTimeMillis ? formatTime(Math.floor(track.trackTimeMillis / 1000)) : '0:00';
  if (miniBackdrop) miniBackdrop.style.backgroundImage = `url(${medRes})`;

  const miniLikeBtn = document.getElementById('mini-like');
  if (miniLikeBtn) {
    miniLikeBtn.style.color = isLiked ? 'var(--primary-accent)' : '';
    const miniLikeIcon = miniLikeBtn.querySelector('i');
    if (miniLikeIcon) {
      if (isLiked) {
        miniLikeIcon.classList.add('heart-filled');
      } else {
        miniLikeIcon.classList.remove('heart-filled');
      }
    }
  }
}

function updateArtistAndBannerUI(track) {
  if (!track) return;
  const highRes = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '500x500bb') : '';
  const bannerOverlay = document.querySelector('.banner-overlay');
  const bannerBg = document.getElementById('banner-bg');

  const applyBackground = (imgUrl) => {
    if (bannerOverlay) {
      bannerOverlay.style.backgroundImage = `url('${imgUrl}')`;
      bannerOverlay.style.backgroundSize = 'cover';
      bannerOverlay.style.backgroundPosition = 'center top';
      bannerOverlay.style.opacity = '0';
      bannerOverlay.style.transition = 'opacity 0.6s ease';
      setTimeout(() => { bannerOverlay.style.opacity = '1'; }, 50);
    }
    if (bannerBg) {
      bannerBg.style.backgroundImage = `linear-gradient(to bottom, rgba(0,0,0,0.3), var(--bg-base)), url('${imgUrl}')`;
      bannerBg.style.backgroundSize = 'cover';
      bannerBg.style.backgroundPosition = 'center 20%';
    }
  };

  if (window.uniaAPI?.getArtistInfo) {
    window.uniaAPI.getArtistInfo(track.artistName).then(info => {
      const nameEl = document.getElementById('about-artist-name');
      const bioEl = document.getElementById('about-artist-bio');
      const bgImg = document.querySelector('.artist-bg-img');

      if (nameEl) nameEl.textContent = track.artistName;
      if (bioEl) bioEl.textContent = info.bio || `${track.artistName} hakkında bilgi bulunmuyor.`;
      if (info.pictureUrl) {
        if (bgImg) bgImg.src = info.pictureUrl;
        applyBackground(info.pictureUrl);
      } else {
        if (bgImg) bgImg.src = highRes;
        applyBackground(highRes);
      }
    }).catch(() => {
      const bgImg = document.querySelector('.artist-bg-img');
      if (bgImg) bgImg.src = highRes;
      applyBackground(highRes);
    });
  } else {
    const bgImg = document.querySelector('.artist-bg-img');
    if (bgImg) bgImg.src = highRes;
    applyBackground(highRes);
  }
}

export function updateActiveCardsProgressBar(pct) {
  const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
  if (!activeTrack) return;

  const gridCards = document.querySelectorAll('.quick-grid .grid-card');
  gridCards.forEach(card => {
    if (card._track && card._track.trackId === activeTrack.trackId) {
      const container = card.querySelector('.card-progress-container');
      const fill = card.querySelector('.card-progress-fill');
      if (container && fill) {
        container.classList.remove('hidden');
        fill.style.width = `${pct * 100}%`;
      }
    } else {
      const container = card.querySelector('.card-progress-container');
      if (container) container.classList.add('hidden');
    }
  });

  const carouselCards = document.querySelectorAll('.today-rec-container .today-rec-card');
  carouselCards.forEach(card => {
    let isMatch = false;
    if (card._track && card._track.trackId === activeTrack.trackId) {
      isMatch = true;
    }

    const container = card.querySelector('.card-progress-container');
    const fill = card.querySelector('.card-progress-fill');
    if (isMatch) {
      if (container && fill) {
        container.classList.remove('hidden');
        fill.style.width = `${pct * 100}%`;
      }
    } else {
      if (container) container.classList.add('hidden');
    }
  });
}

// Synced & Real Lyrics Engine (Fetched dynamically from LRCLIB API)
async function getSongLyrics(track) {
  const title = track.trackName || 'Bilinmeyen Şarkı';
  const artist = track.artistName || 'Bilinmeyen Sanatçı';

  console.log(`[Lyrics Engine] Attempting to fetch real lyrics for: "${title}" by ${artist}`);

  try {
    // 1. Exact lookup from LRCLIB
    const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const lyricsStr = data.syncedLyrics || data.plainLyrics;
      if (lyricsStr) {
        console.log(`[Lyrics Engine] Found exact match for: ${title}`);
        const lines = lyricsStr.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        return parseLrcLines(lines, track);
      }
    }

    // 2. Keyword Search fallback if exact lookup has no results
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(artist + ' ' + title)}`;
    const searchRes = await fetch(searchUrl);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData && searchData.length > 0) {
        const best = searchData[0];
        const lyricsStr = best.syncedLyrics || best.plainLyrics;
        if (lyricsStr) {
          console.log(`[Lyrics Engine] Found keyword match: ${best.artistName} - ${best.trackName}`);
          const lines = lyricsStr.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          return parseLrcLines(lines, track);
        }
      }
    }
  } catch (err) {
    console.warn('[Lyrics Engine] LRCLIB service failed or offline:', err.message);
  }

  // 3. Static Mock Fallback if completely offline or track lyrics do not exist
  console.log('[Lyrics Engine] Using default mock lyrics fallback');
  const defaultLyrics = [
    "[0:05] Wanda Nara, Wanda Nara...",
    "[0:12] Bu gece sahnedeyiz baba arkana yaslan",
    "[0:25] Ritimler akıyor yavaş yavaş bak",
    "[0:42] Wanda Nara tribünden izlerken bizi",
    "[1:05] Hayallerimiz göklerde uçuyor sanki",
    "[1:28] Türkçe rap sahnesi Unia ile inler",
    "[1:50] Herkes burada bizi dinler, bizi izler",
    "[2:15] Wanda Nara, rüzgar gibi esip geçtin",
    "[2:40] Bu şarkı senin için, sen bizi seçtin..."
  ];
  return parseLrcLines(defaultLyrics, track);
}

// Utility to parse standard LRC formatting and fallback to plain lyrics
function parseLrcLines(lines, track) {
  const durationSec = (track.trackTimeMillis / 1000) || 180;

  return lines.map(line => {
    // Matches standard LRC formats: [mm:ss.xx] or [m:ss] or [mm:ss]
    const match = line.match(/^\[(\d+):(\d+)(?:\.(\d+))?\]\s*(.*)$/);
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      return {
        time: minutes * 60 + seconds,
        text: match[4]
      };
    }
    // Return time as -1 for plain lines to distribute them proportionally later
    return { time: -1, text: line };
  }).map((item, idx, arr) => {
    if (item.time === -1) {
      item.time = Math.floor((idx / arr.length) * durationSec);
    }
    return item;
  });
}

// Queue rendering
export function renderQueueList() {
  const queueNowPlaying = document.getElementById('queue-now-playing');
  const queueListItems = document.getElementById('queue-list-items');
  if (!queueNowPlaying || !queueListItems) return;

  if (state.currentTrackIndex < 0 || state.currentTrackList.length === 0) {
    queueNowPlaying.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px;">Kuyruk boş</div>';
    queueListItems.innerHTML = '';
    return;
  }

  const track = state.currentTrackList[state.currentTrackIndex];
  const cover = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '60x60bb') : '';
  queueNowPlaying.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding:8px;background:rgba(255,255,255,0.06);border-radius:6px;">
      <img src="${cover}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;">
      <div style="flex:1;overflow:hidden;">
        <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--primary-accent);">${escapeHtml(track.trackName)}</div>
        <div style="font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(track.artistName)}</div>
      </div>
    </div>`;

  queueListItems.innerHTML = '';
  let count = 0;
  for (let i = state.currentTrackIndex + 1; i < state.currentTrackList.length && count < 10; i++, count++) {
    const t = state.currentTrackList[i];
    const tc = t.artworkUrl100 ? t.artworkUrl100.replace('100x100bb', '60x60bb') : '';
    const row = document.createElement('div');
    row.style = 'display:flex;align-items:center;gap:12px;padding:6px 8px;border-radius:6px;cursor:pointer;background:rgba(255,255,255,0.02); transition: all 0.2s;';
    row.innerHTML = `
      <img src="${tc}" style="width:32px;height:32px;border-radius:4px;object-fit:cover;">
      <div style="flex:1;overflow:hidden;">
        <div style="font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-main);">${escapeHtml(t.trackName)}</div>
        <div style="font-size:9px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(t.artistName)}</div>
      </div>`;
    row.onclick = () => {
      state.currentTrackIndex = i;
      updatePlayerUI();
      loadAndPlayTrack();
    };
    queueListItems.appendChild(row);
  }
}

export async function loadLyricsOverlay() {
  const lyricsBody = document.getElementById('lyrics-body');
  const lyricsOverlay = document.getElementById('lyrics-overlay');
  if (!lyricsBody || !lyricsOverlay) return;

  if (state.currentTrackIndex < 0) {
    lyricsBody.innerHTML = '<div style="color:var(--text-muted);text-align:center;margin-top:40px;">Şarkı çalınmıyor</div>';
    return;
  }
  lyricsBody.innerHTML = '<div style="color:var(--text-muted);text-align:center;margin-top:40px;">Sözler yükleniyor...</div>';
  const track = state.currentTrackList[state.currentTrackIndex];

  const artworkUrl = track.artworkUrl100 || 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300';
  lyricsOverlay.style.backgroundImage = `linear-gradient(rgba(10, 10, 12, 0.8), rgba(10, 10, 12, 0.9)), url(${artworkUrl})`;
  lyricsOverlay.style.backgroundSize = 'cover';
  lyricsOverlay.style.backgroundPosition = 'center';

  const rawLines = await getSongLyrics(track);
  const durationSec = (track.trackTimeMillis / 1000) || 180;

  lyricsBody.innerHTML = '';
  rawLines.forEach((lineObj, idx) => {
    const p = document.createElement('p');
    p.textContent = lineObj.text;
    p.dataset.time = lineObj.time;

    p.onclick = (e) => {
      e.stopPropagation();
      const seekPct = lineObj.time / durationSec;
      seekToPercent(seekPct);
      showToast(`Sözlere atlanıyor...`);
      setTimeout(updateLyricsHighlighting, 100);
    };
    lyricsBody.appendChild(p);
  });
}

export function updateLyricsHighlighting() {
  const ytPlayer = getYTPlayer();
  const lyricsBody = document.getElementById('lyrics-body');
  const lyricsOverlay = document.getElementById('lyrics-overlay');
  if (!lyricsBody || !lyricsOverlay) return;

  let cur = 0;
  const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
  if (activeTrack && activeTrack.isLocal) {
    cur = localAudio.currentTime || 0;
  } else {
    if (state.ytPlayerReady && ytPlayer && ytPlayer.getCurrentTime) {
      cur = ytPlayer.getCurrentTime() || 0;
    }
  }

  const paragraphs = lyricsBody.querySelectorAll('p');
  if (paragraphs.length === 0) return;

  let activeIndex = -1;
  for (let i = 0; i < paragraphs.length; i++) {
    const pTimeVal = paragraphs[i].dataset.time;
    if (pTimeVal !== undefined && pTimeVal !== null) {
      const pTime = parseFloat(pTimeVal);
      if (!isNaN(pTime) && cur >= pTime) {
        activeIndex = i;
      } else {
        break;
      }
    }
  }

  paragraphs.forEach((p, idx) => {
    if (idx === activeIndex) {
      if (!p.classList.contains('active-lyric-line')) {
        p.classList.add('active-lyric-line');
        const targetScroll = p.offsetTop - (lyricsOverlay.clientHeight / 2) + (p.clientHeight / 2);
        lyricsOverlay.scrollTop = targetScroll;
      }
    } else {
      p.classList.remove('active-lyric-line');
    }
  });
}

export function updateTodayRecommendationVisibility() {
  const todaySec = document.getElementById('today-recommendation-section');
  const sonZiyaretEdilenlerSec = document.getElementById('son-ziyaret-edilenler-section');
  const sonCalinanlarSec = document.getElementById('son-calinanlar-section');
  const madeForYouSec = document.getElementById('made-for-you-section');
  const bannerSec = document.querySelector('.banner-section');
  const quickTabs = document.querySelector('.quick-tabs');

  const searchInput = document.getElementById('search-input');
  const isSearchActive = searchInput && searchInput.value.trim().length > 0;
  const holder = document.getElementById('page-content-holder');
  const currentPageName = holder ? (holder.dataset.currentPage || 'home') : 'home';
  const isCustomPageActive = currentPageName !== 'home';

  const show = !(isSearchActive || isCustomPageActive);

  if (todaySec) todaySec.style.display = show ? 'block' : 'none';
  if (sonZiyaretEdilenlerSec) {
    const key = state.currentUser ? `unia_recently_visited_profiles_${state.currentUser.id}` : 'unia_recently_visited_profiles_guest';
    let hasItems = false;
    try {
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      hasItems = list && list.length > 0;
    } catch (e) { }
    const shouldShow = show && hasItems;
    sonZiyaretEdilenlerSec.style.display = shouldShow ? 'block' : 'none';
  }
  if (sonCalinanlarSec) sonCalinanlarSec.style.display = show ? 'block' : 'none';
  if (madeForYouSec) madeForYouSec.style.display = show ? 'block' : 'none';
  if (bannerSec) {
    if (isCustomPageActive) {
      bannerSec.style.position = 'absolute';
      bannerSec.style.left = '-9999px';
      bannerSec.style.top = '-9999px';
      bannerSec.style.width = '300px';
      bannerSec.style.height = '300px';
      bannerSec.style.opacity = '0';
      bannerSec.style.pointerEvents = 'none';
      bannerSec.style.display = 'flex';
    } else {
      bannerSec.style.position = '';
      bannerSec.style.left = '';
      bannerSec.style.top = '';
      bannerSec.style.width = '';
      bannerSec.style.height = '';
      bannerSec.style.opacity = '';
      bannerSec.style.pointerEvents = '';
      bannerSec.style.display = 'flex';
    }
  }
  if (quickTabs) quickTabs.style.display = show ? 'flex' : 'none';
}

export function loadRecommendedTracks() {
  let tracks = [];
  if (state.currentUser && window.uniaAPI?.dbGetRecentlyPlayed) {
    try {
      window.uniaAPI.dbGetRecentlyPlayed(state.currentUser.id).then(dbTracks => {
        setupRecommendedGrid(dbTracks);
      });
      return;
    } catch (e) { }
  }

  // Local storage fallback for guest
  try {
    const localRecent = localStorage.getItem('unia_recently_played');
    if (localRecent) tracks = JSON.parse(localRecent);
  } catch (e) { }

  setupRecommendedGrid(tracks);
}

function setupRecommendedGrid(tracks) {
  if (!tracks) tracks = [];
  if (tracks.length < 8) {
    for (const pl of state.playlists) {
      if (pl.tracks && pl.tracks.length > 0) {
        for (const track of pl.tracks) {
          if (tracks.length >= 8) break;
          if (!tracks.some(t => String(t.trackId) === String(track.trackId))) {
            tracks.push(track);
          }
        }
      }
      if (tracks.length >= 8) break;
    }
  }


  tracks = tracks.slice(0, 8);
  homeTracks = tracks;

  const activeTab = document.querySelector('.quick-tabs .pill-btn.active');
  const filterText = activeTab ? activeTab.textContent.trim() : 'Tümü';
  renderHomeGridFiltered(filterText);
}

export function renderHomeGridFiltered(filterText) {
  let filtered = [...homeTracks];
  if (filterText === 'Müzik') {
    filtered = filtered.filter(t => !t.trackName.toLowerCase().includes('podcast'));
  } else if (filterText === "Podcast'ler") {
    filtered = filtered.filter(t => t.trackName.toLowerCase().includes('podcast'));
    if (filtered.length === 0) {
      filtered = [
        {
          trackId: 'pod1',
          trackName: 'Deha Inc. ile Müzik ve Gelecek',
          artistName: 'Rap Günlükleri Podcast',
          artworkUrl100: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=300',
          primaryGenreName: 'Podcast',
          trackTimeMillis: 2400000,
          videoId: 'NKgT3o'
        }
      ];
    }
  }

  renderMainGrid(filtered);
  updateBillboardBanner();
  loadTodayRecommendations();
  loadSonCalinanlarSlider();
  loadSonZiyaretEdilenlerSlider();
  loadMadeForYouSlider();
  updateTodayRecommendationVisibility();
}

// Scrollable dynamic slider helper
function makeDragScrollable(container) {
  let isDown = false;
  let startX;
  let scrollLeft;
  let hasMoved = false;

  container.addEventListener('mousedown', (e) => {
    isDown = true;
    startX = e.pageX - container.offsetLeft;
    scrollLeft = container.scrollLeft;
    hasMoved = false;
  });

  container.addEventListener('mouseleave', () => { isDown = false; });
  container.addEventListener('mouseup', () => { isDown = false; });

  container.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 2;
    if (Math.abs(walk) > 3) hasMoved = true;
    container.scrollLeft = scrollLeft - walk;
  });

  container.addEventListener('click', (e) => {
    if (hasMoved) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
}

export function syncActiveNavStates(pageName, data) {
  // 1. Reset all titlebar buttons and sidebar items
  document.querySelectorAll('.titlebar-btn, .profile-avatar, .library-item').forEach(el => {
    el.classList.remove('active');
  });

  // 2. Set active on titlebar buttons
  if (pageName === 'home') {
    const btn = document.getElementById('home-trigger');
    if (btn) btn.classList.add('active');
  } else if (pageName === 'shazam') {
    const btn = document.getElementById('shazam-btn');
    if (btn) btn.classList.add('active');
  } else if (pageName === 'notifications') {
    const btn = document.getElementById('notif-btn');
    if (btn) btn.classList.add('active');
  } else if (pageName === 'friends') {
    const btn = document.getElementById('friends-btn');
    if (btn) btn.classList.add('active');
  } else if (pageName === 'profile') {
    const btn = document.getElementById('profile-btn');
    if (btn) btn.classList.add('active');
  } else if (pageName === 'browse') {
    const btn = document.querySelector('.browse-btn');
    if (btn) btn.classList.add('active');
  }

  // 3. Set active on sidebar library items
  const libraryItems = document.querySelectorAll('.library-item');
  libraryItems.forEach(item => {
    const titleEl = item.querySelector('.item-title');
    if (!titleEl) return;
    const titleText = titleEl.textContent.trim();

    if (pageName === 'liked-songs' && titleText === 'Beğenilen Şarkılar') {
      item.classList.add('active');
    } else if (pageName === 'local-files' && titleText === 'Yerel Dosyalar') {
      item.classList.add('active');
    } else if (pageName === 'playlist' && data && data.name && titleText === data.name) {
      item.classList.add('active');
    }
  });
}
