// ==UserScript==
// @name         Giphy GIF Downloader
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Download GIFs from Giphy without registration (direct download, size selector, no WebP)
// @author       You
// @match        https://giphy.com/gifs/*
// @match        https://giphy.com/stickers/*
// @grant        GM_download
// @connect      giphy.com
// @connect      media.giphy.com
// @connect      media1.giphy.com
// @connect      media2.giphy.com
// @connect      media3.giphy.com
// @connect      media4.giphy.com
// @connect      media5.giphy.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // -------- Utilities --------
  function isAnimatedGif(url) {
    return typeof url === 'string' && url.includes('.gif') && !/(?:^|\/)giphy_s\.gif/.test(url) && !/still/i.test(url);
  }
  function extractGifId(url) {
    const hyphenMatch = url.match(/-([a-zA-Z0-9]+)(?:[/?#]|$)/);
    if (hyphenMatch && hyphenMatch[1]) return hyphenMatch[1];
    const segMatches = url.match(/\/([a-zA-Z0-9]+)(?:[/?#]|$)/g);
    if (segMatches && segMatches.length) {
      const last = segMatches[segMatches.length - 1];
      const id = last.replace(/[\/?#]/g, '').replace(/^\//, '');
      return id || null;
    }
    return null;
  }

  function getDirectGifUrl(gifId) {
    const subdomains = ['media1', 'media2', 'media3', 'media4', 'media5'];
    return `https://${subdomains[0]}.giphy.com/media/${gifId}/giphy.gif`;
  }

  // No size selection – always fetch the largest animated GIF

  // -------- UI --------
  function createDownloadButton() {
    // Create a container so we can space buttons with a gap
    let container = document.getElementById('giphy-download-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'giphy-download-container';
      container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 16px;
      `;
      document.body.appendChild(container);
    }

    if (document.getElementById('giphy-download-btn')) return;

    // Download GIF button
    const gifBtn = document.createElement('button');
    gifBtn.id = 'giphy-download-btn';
    gifBtn.innerHTML = '📥 Download GIF (Original)';
    gifBtn.title = 'Download the largest animated GIF version (no WebP)';
    gifBtn.style.cssText = `
      background: #00d4aa;
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 25px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 212, 170, 0.3);
      transition: all 0.3s ease;
    `;
    gifBtn.addEventListener('mouseenter', function () {
      this.style.transform = 'translateY(-2px)';
      this.style.boxShadow = '0 6px 16px rgba(0, 212, 170, 0.4)';
    });
    gifBtn.addEventListener('mouseleave', function () {
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = '0 4px 12px rgba(0, 212, 170, 0.3)';
    });

    // Download MP4 button
    const mp4Btn = document.createElement('button');
    mp4Btn.id = 'giphy-download-mp4-btn';
    mp4Btn.innerHTML = '🎞️ Download MP4 (HD)';
    mp4Btn.title = 'Download the high-quality MP4 used on the page';
    mp4Btn.style.cssText = `
      background: #6366f1;
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 25px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(99,102,241,0.3);
      transition: all 0.3s ease;
    `;
    mp4Btn.addEventListener('mouseenter', function () {
      this.style.transform = 'translateY(-2px)';
      this.style.boxShadow = '0 6px 16px rgba(99,102,241,0.4)';
    });
    mp4Btn.addEventListener('mouseleave', function () {
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = '0 4px 12px rgba(99,102,241,0.3)';
    });

    container.appendChild(mp4Btn);
    container.appendChild(gifBtn);
  }

  // -------- Data resolution --------
  function pickLargestGifFromImages(images, targetId) {
    let best = null;
    let bestArea = -1;
    for (const key in images) {
      const obj = images[key];
      if (!obj || typeof obj.url !== 'string') continue;
      if (!isAnimatedGif(obj.url)) continue;
      if (targetId && !obj.url.includes(`/${targetId}/`)) continue;
      const w = parseInt(obj.width, 10) || 0;
      const h = parseInt(obj.height, 10) || 0;
      const area = w * h;
      if (area > bestArea) {
        best = obj.url;
        bestArea = area;
      }
    }
    return best;
  }
  function resolveFromNextDataById(targetId) {
    try {
      const script = document.querySelector('#__NEXT_DATA__');
      if (!script || !script.textContent) return null;
      const data = JSON.parse(script.textContent);
      let found = null;

      (function walk(node) {
        if (!node || found) return;
        if (typeof node === 'object') {
          if (node.id === targetId) {
            const images = node.images || {};
            // Always pick the largest animated GIF available
            const largest = pickLargestGifFromImages(images, targetId);
            if (largest) { found = largest; return; }
          }
          for (const k in node) walk(node[k]);
        }
      })(data);

      return found;
    } catch (_) {
      return null;
    }
  }

  function resolveGifUrlPreferGif(id) {
    // Prefer Next.js data first — it carries best-size URLs
    const nextUrl = resolveFromNextDataById(id);
    if (nextUrl) return nextUrl;

    // Meta/link tags
    const metaSelectors = [
      'meta[property="og:image"]',
      'meta[name="og:image"]',
      'meta[name="twitter:image"]',
      'link[rel="image_src"]'
    ];
    for (const sel of metaSelectors) {
      const el = document.querySelector(sel);
      const val = el && (el.getAttribute('content') || el.getAttribute('href'));
      if (val && id && val.includes(`/${id}/`) && isAnimatedGif(val)) return val;
    }

    // Page images
    const imgs = document.querySelectorAll('img[src*="/giphy"], img[src*=".gif"]');
    for (const img of imgs) {
      if (id && img.src.includes(`/${id}/`) && isAnimatedGif(img.src)) return img.src;
    }

    // Fallback: plain CDN
    return getDirectGifUrl(id);
  }

  // -------- Download --------
  function pickLargestMp4FromImages(images) {
    let best = null;
    let bestArea = -1;
    for (const key in images) {
      const obj = images[key];
      if (!obj || (typeof obj !== 'object')) continue;
      const url = typeof obj.mp4 === 'string' ? obj.mp4 : (typeof obj.url === 'string' && obj.url.endsWith('.mp4') ? obj.url : null);
      if (!url) continue;
      const w = parseInt(obj.width, 10) || 0;
      const h = parseInt(obj.height, 10) || 0;
      const area = w * h;
      if (area > bestArea) { best = url; bestArea = area; }
    }
    return best;
  }

  function resolveMp4Url(id) {
    try {
      const script = document.querySelector('#__NEXT_DATA__');
      if (script && script.textContent) {
        const data = JSON.parse(script.textContent);
        let found = null;
        (function walk(node) {
          if (!node || found) return;
          if (typeof node === 'object') {
            if (node.id === id) {
              const images = node.images || {};
              // Try preferred explicit fields
              const pref = [images.hd, images.original_mp4, images.original, images.mp4];
              for (const obj of pref) {
                if (!obj) continue;
                if (typeof obj.mp4 === 'string') { found = obj.mp4; return; }
                if (typeof obj.url === 'string' && obj.url.endsWith('.mp4')) { found = obj.url; return; }
              }
              // Otherwise pick the largest mp4 in images
              const largestMp4 = pickLargestMp4FromImages(images);
              if (largestMp4) { found = largestMp4; return; }
              // Also some nodes put mp4 at top-level
              if (typeof node.mp4 === 'string') { found = node.mp4; return; }
            }
            for (const key in node) walk(node[key]);
          }
        })(data);
        if (found) return found;
      }
    } catch (_) { /* ignore */ }

    // Fallback: check <video> tags
    const sources = document.querySelectorAll('video source');
    for (const s of sources) {
      if (s.src && s.src.endsWith('.mp4')) return s.src;
    }
    // No MP4 found
    return null;
  }

  function downloadViaGM(url, filename) {
    try {
      if (typeof GM_download === 'function') {
        GM_download({ url, name: filename, onerror: function () { showNotification('Download failed. Please try again.'); } });
        showNotification('GIF download started!', 'success');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (_) {
      showNotification('Download failed. Please try again.', 'info');
    }
  }

  function showNotification(message, type = 'info') {
    const n = document.createElement('div');
    n.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 10001;
      background: ${type === 'success' ? '#4CAF50' : '#2196F3'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: bold;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      animation: slideIn 0.3s ease;
    `;
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(() => { if (n.parentNode) n.parentNode.removeChild(n); }, 3000);
  }

  function downloadGifEnhanced() {
    const id = extractGifId(window.location.href);
    if (!id) {
      alert('Could not find GIF ID on this page.');
      return;
    }
    let url = resolveGifUrlPreferGif(id) || getDirectGifUrl(id);
    if (!url) {
      alert('Could not find GIF URL. Please refresh the page.');
      return;
    }
    const filename = `giphy-${id}.gif`;
    downloadViaGM(url, filename);
  }

  function downloadMp4Enhanced() {
    const id = extractGifId(window.location.href);
    if (!id) { alert('Could not find GIF ID on this page.'); return; }
    const found = resolveMp4Url(id);
    const candidates = [];
    if (found) candidates.push(found);
    // Construct common CDN variants as fallbacks
    const base = `https://media1.giphy.com/media/${id}`;
    candidates.push(
      `${base}/giphy.mp4`,
      `${base}/giphy-720p.mp4`,
      `${base}/giphy-480p.mp4`,
      `${base}/giphy-360p.mp4`
    );

    const filename = `giphy-${id}.mp4`;
    let idx = 0;

    (function tryNext() {
      if (idx >= candidates.length) { alert('Could not find MP4 for this GIF.'); return; }
      const url = candidates[idx++];
      if (!url) { tryNext(); return; }
      try {
        if (typeof GM_download === 'function') {
          GM_download({ url, name: filename, onerror: function () { tryNext(); }, ontimeout: function () { tryNext(); } });
          showNotification('MP4 download started!', 'success');
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } catch (_) {
        tryNext();
      }
    })();
  }

  function updateButtonHandler() {
    const gifBtn = document.getElementById('giphy-download-btn');
    if (gifBtn) gifBtn.onclick = downloadGifEnhanced;
    const mp4Btn = document.getElementById('giphy-download-mp4-btn');
    if (mp4Btn) mp4Btn.onclick = downloadMp4Enhanced;
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        createDownloadButton();
        updateButtonHandler();
      });
    } else {
      createDownloadButton();
      updateButtonHandler();
    }

    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(() => {
          createDownloadButton();
          updateButtonHandler();
        }, 600);
      }
    }).observe(document, { subtree: true, childList: true });
  }

  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to   { transform: translateX(0);   opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  init();
})();