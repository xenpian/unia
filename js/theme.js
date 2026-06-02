// ==========================================
// UNIA - THEME & COLOR EXTRACTION MODULE
// ==========================================

import { state } from './state.js';

let lastVideoR = 0, lastVideoG = 0, lastVideoB = 0;
const localCanvas = document.createElement('canvas');
localCanvas.width = 16;
localCanvas.height = 16;
const localCtx = localCanvas.getContext('2d');

export function extractColorsFromArtwork(imgUrl) {
  return new Promise((resolve) => {
    if (!imgUrl) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 10;
        canvas.height = 10;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 10, 10);
        const imgData = ctx.getImageData(0, 0, 10, 10).data;

        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        let bestColor = null;
        let maxSaturation = -1;

        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          if (a < 200) continue;

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const delta = (max - min) / 255;
          const lightness = (max + min) / 510;
          const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

          if (lightness > 0.15 && lightness < 0.85) {
            rSum += r;
            gSum += g;
            bSum += b;
            count++;

            if (saturation > maxSaturation) {
              maxSaturation = saturation;
              bestColor = { r, g, b };
            }
          }
        }

        if (count === 0) {
          resolve(null);
          return;
        }

        const finalColor = (maxSaturation > 0.15 && bestColor)
          ? bestColor
          : { r: Math.floor(rSum / count), g: Math.floor(gSum / count), b: Math.floor(bSum / count) };

        resolve(finalColor);
      } catch (e) {
        console.error('Color extraction failed:', e);
        resolve(null);
      }
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = imgUrl;
  });
}

export function updateDynamicTheme(r, g, b) {
  if (r === undefined || g === undefined || b === undefined) {
    const root = document.documentElement;
    const currentAccent = root.style.getPropertyValue('--primary-accent');
    if (currentAccent && currentAccent.trim().length > 0 && currentAccent.trim() !== '#ffffff') {
      return; // Keep the active accent color!
    }
    r = 184; g = 158; b = 255; // signature premium violet/purple
  }

  const root = document.documentElement;
  const primaryAccent = `rgb(${r}, ${g}, ${b})`;

  const rHover = Math.min(255, Math.floor(r * 1.15));
  const gHover = Math.min(255, Math.floor(g * 1.15));
  const bHover = Math.min(255, Math.floor(b * 1.15));
  const primaryAccentHover = `rgb(${rHover}, ${gHover}, ${bHover})`;

  const primaryAccentGlow = `rgba(${r}, ${g}, ${b}, 0.25)`;
  const primaryAccentGlowStrong = `rgba(${r}, ${g}, ${b}, 0.55)`;

  root.style.setProperty('--primary-accent', primaryAccent);
  root.style.setProperty('--primary-accent-hover', primaryAccentHover);
  root.style.setProperty('--primary-accent-glow', primaryAccentGlow);
  root.style.setProperty('--primary-accent-glow-strong', primaryAccentGlowStrong);

  const appContainer = document.querySelector('.app-container');
  if (appContainer) {
    appContainer.style.background = '';
  }
}

export async function extractColorFromPlayingVideo() {
  if (!state.isPlaying) return;

  let color = null;

  // MODE 1: Canvas Drawing
  try {
    const iframe = document.querySelector('.banner-overlay iframe');
    if (iframe && iframe.contentDocument) {
      const video = iframe.contentDocument.querySelector('video');
      if (video && video.readyState >= 2 && !video.paused && !video.ended) {
        localCtx.drawImage(video, 0, 0, 16, 16);
        const imgData = localCtx.getImageData(0, 0, 16, 16).data;

        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];
          if (a >= 200) {
            rSum += r;
            gSum += g;
            bSum += b;
            count++;
          }
        }
        if (count > 0) {
          color = {
            r: Math.floor(rSum / count),
            g: Math.floor(gSum / count),
            b: Math.floor(bSum / count)
          };
        }
      }
    }
  } catch (e) {}

  // MODE 2: Screenshot fallback
  if (!color && window.uniaAPI?.captureRegionColor) {
    try {
      const banner = document.querySelector('.banner-overlay');
      if (banner) {
        const rect = banner.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const captureHeight = Math.max(10, Math.floor(rect.height * 0.25));
          const dpr = window.devicePixelRatio || 1;
          const capturedColor = await window.uniaAPI.captureRegionColor({
            x: Math.max(0, Math.floor(rect.x * dpr)),
            y: Math.max(0, Math.floor(rect.y * dpr)),
            width: Math.max(1, Math.floor(rect.width * dpr)),
            height: Math.max(1, Math.floor(captureHeight * dpr))
          });

          if (capturedColor) {
            color = {
              r: Math.min(255, Math.floor(capturedColor.r * 1.25)),
              g: Math.min(255, Math.floor(capturedColor.g * 1.25)),
              b: Math.min(255, Math.floor(capturedColor.b * 1.25))
            };
          }
        }
      }
    } catch (e) {}
  }

  // MODE 3: Cover artwork fallback
  if (!color) {
    const activeTrack = state.currentTrackIndex >= 0 && state.currentTrackList[state.currentTrackIndex] ? state.currentTrackList[state.currentTrackIndex] : null;
    if (activeTrack && activeTrack.artworkUrl100) {
      try {
        const extracted = await extractColorsFromArtwork(activeTrack.artworkUrl100);
        if (extracted) color = extracted;
      } catch (e) {}
    }
  }

  // Apply colors
  if (color) {
    let { r, g, b } = color;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = (max - min) / (max || 1);
    const l = (max + min) / 510;

    if (d > 0.12 && d < 0.28 && l <= 0.82 && max > 25) {
      if (r === max) {
        r = Math.min(255, Math.floor(r * 1.35));
        g = Math.floor(g * 0.82);
        b = Math.floor(b * 0.82);
      } else if (g === max) {
        g = Math.min(255, Math.floor(g * 1.35));
        r = Math.floor(r * 0.82);
        b = Math.floor(b * 0.82);
      } else {
        b = Math.min(255, Math.floor(b * 1.35));
        r = Math.floor(r * 0.82);
        g = Math.floor(g * 0.82);
      }
    }

    if (l < 0.38) {
      const factor = 0.38 / (l || 0.01);
      r = Math.min(255, Math.floor(r * factor));
      g = Math.min(255, Math.floor(g * factor));
      b = Math.min(255, Math.floor(b * factor));
    }

    if (l > 0.88) {
      r = Math.floor(r * 0.8);
      g = Math.floor(g * 0.8);
      b = Math.floor(b * 0.8);
    }

    const diff = Math.abs(r - lastVideoR) + Math.abs(g - lastVideoG) + Math.abs(b - lastVideoB);
    if (diff > 8) {
      lastVideoR = r;
      lastVideoG = g;
      lastVideoB = b;
      updateDynamicTheme(r, g, b);
    }
  }
}

export function updateDynamicBackground(imageUrl) {
  const contentCenter = document.querySelector('.content-center');
  if (!contentCenter) return;

  if (!imageUrl) {
    contentCenter.style.backgroundImage = 'none';
    contentCenter.style.backgroundColor = 'var(--bg-deep)';
    return;
  }

  const img = new Image();
  img.crossOrigin = 'Anonymous';
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 10;
      canvas.height = 10;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 10, 10);
      const imgData = ctx.getImageData(0, 0, 10, 10).data;

      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < imgData.length; i += 4) {
        const pr = imgData[i];
        const pg = imgData[i + 1];
        const pb = imgData[i + 2];
        const pa = imgData[i + 3];
        if (pa < 150) continue;

        const max = Math.max(pr, pg, pb);
        const min = Math.min(pr, pg, pb);
        if (max - min < 15 && (max < 30 || max > 220)) continue;

        r += pr;
        g += pg;
        b += pb;
        count++;
      }

      if (count === 0) {
        for (let i = 0; i < imgData.length; i += 4) {
          r += imgData[i];
          g += imgData[i + 1];
          b += imgData[i + 2];
          count++;
        }
      }

      r = Math.floor(r / count);
      g = Math.floor(g / count);
      b = Math.floor(b / count);

      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      if (brightness > 150) {
        const factor = 120 / brightness;
        r = Math.floor(r * factor);
        g = Math.floor(g * factor);
        b = Math.floor(b * factor);
      }
      if (brightness < 30) {
        r = Math.max(r, 45);
        g = Math.max(g, 45);
        b = Math.max(b, 45);
      }

      const colorStr = `rgba(${r}, ${g}, ${b}, 0.45)`;
      contentCenter.style.backgroundImage = `linear-gradient(to bottom, ${colorStr} 0%, var(--bg-deep) 420px, var(--bg-deep) 100%)`;
      contentCenter.style.backgroundColor = 'var(--bg-deep)';
    } catch (e) {
      console.warn('Canvas color extraction error:', e);
      contentCenter.style.backgroundImage = 'none';
      contentCenter.style.backgroundColor = 'var(--bg-deep)';
    }
  };

  img.onerror = () => {
    contentCenter.style.backgroundImage = 'none';
    contentCenter.style.backgroundColor = 'var(--bg-deep)';
  };

  if (imageUrl.startsWith('./')) {
    img.src = imageUrl.substring(2);
  } else {
    img.src = imageUrl;
  }
}

// Start analyzing color frames
setInterval(extractColorFromPlayingVideo, 600);
