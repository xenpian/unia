const fs = require('fs');
const path = require('path');

class Database {
  constructor() {
    this.useLocal = true;
    this.localPath = path.join(__dirname, 'unia_local_db.json');
    this.localData = null;
    this._loadLocalSync();

    // Run self-seeding asynchronously in the background
    setTimeout(() => {
      this.seedDefaultUsers();
    }, 500);
  }

  async seedDefaultUsers() {
    try {
      // Seed default local user (Misafir) if it doesn't exist
      const localUserExists = await this.getUser('unia_local_user');
      if (!localUserExists) {
        console.log('[DB] Seeding default local user "unia_local_user"...');
        await this.saveUser({
          id: 'unia_local_user',
          username: 'Misafir',
          email: 'misafir@unia.fm',
          password: 'localpassword',
          profilePhotoUrl: null
        });
      }

      const users = await this.getUsers();
      if (users.length < 3) {
        console.log('[DB] Database has few users, self-seeding premium friends...');
        const defaultFriends = [
          { id: 'motive10mg', username: 'Motive', email: 'motive@unia.fm', password: 'motivepassword', profilePhotoUrl: null },
          { id: 'hadisediva', username: 'Hadise', email: 'hadise@unia.fm', password: 'hadisepassword', profilePhotoUrl: null },
          { id: 'lvbelc5real', username: 'Lvbel C5', email: 'lvbelc5@unia.fm', password: 'lvbelpassword', profilePhotoUrl: null },
          { id: 'simgesagnak', username: 'Simge', email: 'simge@unia.fm', password: 'simgepassword', profilePhotoUrl: null }
        ];

        for (const friend of defaultFriends) {
          await this.saveUser(friend);
        }

        // Seed realistic active play histories
        const trackMotive = {
          trackId: '10mg_track',
          trackName: '10MG',
          artistName: 'Motive',
          artworkUrl100: 'https://cdn-images.dzcdn.net/images/cover/fea07231e297ee0c926aad963fc333bd/250x250-000000-80-0-0.jpg',
          trackTimeMillis: 168000,
          primaryGenreName: 'Rap',
          videoId: 'fea07231e297ee0c926aad963fc333bd'
        };
        const trackHadise = {
          trackId: 'feryat_track',
          trackName: 'Feryat',
          artistName: 'Hadise',
          artworkUrl100: 'https://cdn-images.dzcdn.net/images/cover/67c1cd1241e05f44505ce76a4efb0367/250x250-000000-80-0-0.jpg',
          trackTimeMillis: 184000,
          primaryGenreName: 'Pop',
          videoId: '67c1cd1241e05f44505ce76a4efb0367'
        };
        const trackLvbel = {
          trackId: 'mustafa_track',
          trackName: 'MUSTAFA',
          artistName: 'Lvbel C5',
          artworkUrl100: 'https://cdn-images.dzcdn.net/images/cover/01cc9a629bb24f3ba751c7065e3604c7/250x250-000000-80-0-0.jpg',
          trackTimeMillis: 128000,
          primaryGenreName: 'Rap',
          videoId: '01cc9a629bb24f3ba751c7065e3604c7'
        };
        const trackSimge = {
          trackId: 'askin_track',
          trackName: 'Aşkın Olayım',
          artistName: 'Simge',
          artworkUrl100: 'https://cdn-images.dzcdn.net/images/cover/da1adf91c48761b8c60efb43a2840bf1/250x250-000000-80-0-0.jpg',
          trackTimeMillis: 210000,
          primaryGenreName: 'Pop',
          videoId: 'da1adf91c48761b8c60efb43a2840bf1'
        };

        await this.addRecentlyPlayed('motive10mg', trackMotive);
        await this.addRecentlyPlayed('hadisediva', trackHadise);
        await this.addRecentlyPlayed('lvbelc5real', trackLvbel);
        await this.addRecentlyPlayed('simgesagnak', trackSimge);

        console.log('[DB] Seeding premium friends and metadata completed successfully.');
      }
    } catch (err) {
      console.warn('[DB] Seeding failed:', err.message);
    }
  }

  _loadLocalSync() {
    try {
      if (fs.existsSync(this.localPath)) {
        const content = fs.readFileSync(this.localPath, 'utf8');
        this.localData = JSON.parse(content);
      } else {
        this.localData = {
          users: {},
          likedTracks: {},
          playlists: {},
          appState: {},
          recentlyPlayed: {}
        };
        this._saveLocalSync();
      }
    } catch (e) {
      console.error('[DB] Failed to load JSON database:', e);
      this.localData = {
        users: {},
        likedTracks: {},
        playlists: {},
        appState: {},
        recentlyPlayed: {}
      };
    }
    return this.localData;
  }

  _saveLocalSync() {
    if (!this.localData) return;
    try {
      fs.writeFileSync(this.localPath, JSON.stringify(this.localData, null, 2), 'utf8');
    } catch (e) {
      console.error('[DB] Failed to write JSON database:', e);
    }
  }

  // ==========================================
  // USERS
  // ==========================================

  async getUsers() {
    const data = this._loadLocalSync();
    const users = [];
    for (const id in data.users) {
      const user = { ...data.users[id] };
      user.likedTracks = await this.getLikedTracks(id);
      user.playlists = await this.getUserPlaylists(id);
      users.push(user);
    }
    return users;
  }

  async getUser(userId) {
    const data = this._loadLocalSync();
    const user = data.users[userId];
    if (!user) return null;
    const result = { ...user };
    result.likedTracks = await this.getLikedTracks(userId);
    result.playlists = await this.getUserPlaylists(userId);
    return result;
  }

  async saveUser(userObj) {
    const data = this._loadLocalSync();
    const { id, username, email = null, password, profilePhotoUrl = null } = userObj;
    data.users[id] = {
      id,
      username,
      email,
      password,
      profilePhotoUrl
    };
    this._saveLocalSync();

    if (userObj.likedTracks && userObj.likedTracks.length > 0) {
      data.likedTracks[id] = userObj.likedTracks.map(t => this._standardizeTrack(t));
      this._saveLocalSync();
    }
    if (userObj.playlists && userObj.playlists.length > 0) {
      data.playlists[id] = userObj.playlists.map(p => ({
        id: p.id,
        name: p.name,
        coverUrl: p.coverUrl || p.cover_url || null,
        tracks: (p.tracks || []).map(t => this._standardizeTrack(t))
      }));
      this._saveLocalSync();
    }
  }

  async updateUser(userId, updates) {
    const data = this._loadLocalSync();
    const user = data.users[userId];
    if (user) {
      if (updates.username !== undefined) user.username = updates.username;
      if (updates.email !== undefined) user.email = updates.email;
      if (updates.password !== undefined) user.password = updates.password;
      if (updates.profilePhotoUrl !== undefined) user.profilePhotoUrl = updates.profilePhotoUrl;
    }

    if (updates.likedTracks !== undefined) {
      data.likedTracks[userId] = updates.likedTracks.map(t => this._standardizeTrack(t));
    }

    if (updates.playlists !== undefined) {
      data.playlists[userId] = updates.playlists.map(p => ({
        id: p.id,
        name: p.name,
        coverUrl: p.coverUrl || p.cover_url || null,
        tracks: (p.tracks || []).map(t => this._standardizeTrack(t))
      }));
    }

    this._saveLocalSync();
    return this.getUser(userId);
  }

  // ==========================================
  // LIKED TRACKS
  // ==========================================

  async getLikedTracks(userId) {
    const data = this._loadLocalSync();
    return data.likedTracks[userId] || [];
  }

  async addLikedTrack(userId, track) {
    const data = this._loadLocalSync();
    if (!data.likedTracks[userId]) {
      data.likedTracks[userId] = [];
    }
    const stdTrack = this._standardizeTrack(track);
    const exists = data.likedTracks[userId].some(t => t.trackId === stdTrack.trackId);
    if (!exists) {
      data.likedTracks[userId].unshift(stdTrack); // prepend like
      this._saveLocalSync();
    }
  }

  async removeLikedTrack(userId, trackId) {
    const data = this._loadLocalSync();
    if (data.likedTracks[userId]) {
      data.likedTracks[userId] = data.likedTracks[userId].filter(t => t.trackId !== String(trackId));
      this._saveLocalSync();
    }
  }

  // ==========================================
  // PLAYLISTS
  // ==========================================

  async getUserPlaylists(userId) {
    const data = this._loadLocalSync();
    return data.playlists[userId] || [];
  }

  async savePlaylist(userId, playlist) {
    const data = this._loadLocalSync();
    if (!data.playlists[userId]) {
      data.playlists[userId] = [];
    }
    const stdPlaylist = {
      id: playlist.id,
      name: playlist.name,
      coverUrl: playlist.coverUrl || playlist.cover_url || null,
      tracks: (playlist.tracks || []).map(t => this._standardizeTrack(t))
    };
    const idx = data.playlists[userId].findIndex(p => String(p.id) === String(playlist.id));
    if (idx > -1) {
      data.playlists[userId][idx] = stdPlaylist;
    } else {
      data.playlists[userId].push(stdPlaylist);
    }
    this._saveLocalSync();
  }

  async deletePlaylist(playlistId) {
    const data = this._loadLocalSync();
    for (const userId in data.playlists) {
      data.playlists[userId] = data.playlists[userId].filter(p => String(p.id) !== String(playlistId));
    }
    this._saveLocalSync();
  }

  // ==========================================
  // APP STATE
  // ==========================================

  async saveAppState(userId, state) {
    const data = this._loadLocalSync();
    data.appState[userId] = {
      lastTrack: state.lastTrack || null,
      volume: state.volume || 0.8,
      isMuted: !!state.isMuted,
      isShuffle: !!state.isShuffle,
      isRepeat: !!state.isRepeat,
      lastPlayedTime: state.lastPlayedTime || 0
    };
    this._saveLocalSync();
  }

  async getAppState(userId) {
    const data = this._loadLocalSync();
    return data.appState[userId] || null;
  }

  // ==========================================
  // RECENTLY PLAYED
  // ==========================================

  async getRecentlyPlayed(userId) {
    const data = this._loadLocalSync();
    return data.recentlyPlayed[userId] || [];
  }

  async addRecentlyPlayed(userId, track) {
    const data = this._loadLocalSync();
    if (!data.recentlyPlayed[userId]) {
      data.recentlyPlayed[userId] = [];
    }
    const stdTrack = this._standardizeTrack(track);
    data.recentlyPlayed[userId] = data.recentlyPlayed[userId].filter(t => t.trackId !== stdTrack.trackId);
    data.recentlyPlayed[userId].unshift(stdTrack);
    if (data.recentlyPlayed[userId].length > 10) {
      data.recentlyPlayed[userId].pop();
    }
    this._saveLocalSync();
  }

  async removeRecentlyPlayed(userId, trackId) {
    const data = this._loadLocalSync();
    if (data.recentlyPlayed[userId]) {
      data.recentlyPlayed[userId] = data.recentlyPlayed[userId].filter(t => t.trackId !== String(trackId));
      this._saveLocalSync();
    }
  }

  // ==========================================
  // HELPERS
  // ==========================================

  _standardizeTrack(t) {
    return {
      trackId: String(t.trackId || t.track_id || ''),
      trackName: t.trackName || t.track_name || '',
      artistName: t.artistName || t.artist_name || '',
      artworkUrl100: t.artworkUrl100 || t.artwork_url || '',
      trackTimeMillis: t.trackTimeMillis || t.duration_ms || 0,
      primaryGenreName: t.primaryGenreName || t.genre || '',
      previewUrl: t.previewUrl || t.preview_url || '',
      videoId: t.videoId || t.video_id || ''
    };
  }
}

module.exports = Database;
