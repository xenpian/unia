const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Simple zero-dependency .env parser
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim();
        process.env[key] = val;
      }
    });
  }
}
loadEnv();

async function setup() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
    database: process.env.DB_NAME || 'unia_db',
    multipleStatements: true
  });

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(32) PRIMARY KEY,
      username VARCHAR(100) NOT NULL,
      email VARCHAR(255),
      password VARCHAR(255) NOT NULL,
      profile_photo_url LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_username (username),
      UNIQUE KEY uq_email (email)
    ) CHARACTER SET utf8mb4
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS playlists (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(32) NOT NULL,
      name VARCHAR(255) NOT NULL,
      cover_url LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      playlist_id VARCHAR(64) NOT NULL,
      track_id VARCHAR(100) NOT NULL,
      track_name VARCHAR(500),
      artist_name VARCHAR(500),
      artwork_url TEXT,
      duration_ms INT,
      genre VARCHAR(100),
      preview_url TEXT,
      video_id VARCHAR(20),
      position INT DEFAULT 0,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS liked_tracks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(32) NOT NULL,
      track_id VARCHAR(100) NOT NULL,
      track_name VARCHAR(500),
      artist_name VARCHAR(500),
      artwork_url TEXT,
      duration_ms INT,
      genre VARCHAR(100),
      preview_url TEXT,
      video_id VARCHAR(20),
      liked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_like (user_id, track_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS app_state (
      user_id VARCHAR(32) PRIMARY KEY,
      last_track_data LONGTEXT,
      volume FLOAT DEFAULT 0.8,
      is_muted TINYINT DEFAULT 0,
      is_shuffle TINYINT DEFAULT 0,
      is_repeat TINYINT DEFAULT 0,
      last_played_time INT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS recently_played (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(32) NOT NULL,
      track_id VARCHAR(100) NOT NULL,
      track_name VARCHAR(500),
      artist_name VARCHAR(500),
      artwork_url TEXT,
      duration_ms INT,
      genre VARCHAR(100),
      preview_url TEXT,
      video_id VARCHAR(20),
      played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_recent (user_id, track_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4
  `);

  console.log('All tables created successfully!');
  await conn.end();
}

setup().catch(e => {
  console.error('Setup error:', e.message);
  process.exit(1);
});
