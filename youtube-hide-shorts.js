// ==UserScript==
// @name         YouTube - Hide Shorts Everywhere
// @namespace    ivan.youtube.tm
// @version      1.0.0
// @description  Hides all Shorts surfaces on YouTube desktop web
// @author       you
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const HIDDEN_ATTR = "data-tm-shorts-hidden";
  const STYLE_ID = "tm-hide-shorts-style";
  const SHORTS_TEXT = "shorts";
  const URL_CHECK_INTERVAL_MS = 1000;

  const CONTAINER_SELECTORS = [
    "ytd-rich-item-renderer",
    "ytd-rich-section-renderer",
    "ytd-rich-shelf-renderer",
    "ytd-shelf-renderer",
    "ytd-reel-shelf-renderer",
    "ytd-reel-item-renderer",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-playlist-renderer",
    "ytd-playlist-video-renderer"
  ].join(",");

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${HIDDEN_ATTR}] { display: none !important; }
    `;
    document.documentElement.appendChild(style);
  }

  function isShortsUrl(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url, location.origin);
      return /\/shorts(\/|$)/i.test(parsed.pathname);
    } catch (_) {
      return /\/shorts(\/|$)/i.test(url);
    }
  }

  function markHidden(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (el.hasAttribute(HIDDEN_ATTR)) return false;
    el.setAttribute(HIDDEN_ATTR, "1");
    return true;
  }

  function closestShortsContainer(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
    return el.closest(CONTAINER_SELECTORS);
  }

  function hideByShortsLinks(root) {
    const anchors = root.querySelectorAll('a[href*="/shorts"]');
    anchors.forEach((anchor) => {
      const container = closestShortsContainer(anchor) || anchor.closest("ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer");
      if (container) {
        markHidden(container);
      } else {
        markHidden(anchor);
      }
    });
  }

  function textIncludesShorts(text) {
    return (text || "").trim().toLowerCase().includes(SHORTS_TEXT);
  }

  function hideShortsShelves(root) {
    const shelves = root.querySelectorAll("ytd-rich-shelf-renderer, ytd-shelf-renderer, ytd-reel-shelf-renderer");
    shelves.forEach((shelf) => {
      if (shelf.hasAttribute(HIDDEN_ATTR)) return;
      const titleEl = shelf.querySelector("#title, #title-text, h2, yt-formatted-string");
      if (titleEl && textIncludesShorts(titleEl.textContent)) {
        markHidden(shelf);
      }
    });
  }

  function hideShortsGuideEntries(root) {
    const guideAnchors = root.querySelectorAll('ytd-guide-entry-renderer a[href*="/shorts"], ytd-mini-guide-entry-renderer a[href*="/shorts"]');
    guideAnchors.forEach((anchor) => {
      const entry = anchor.closest("ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer");
      markHidden(entry || anchor);
    });

    const guideEntries = root.querySelectorAll("ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer");
    guideEntries.forEach((entry) => {
      if (entry.hasAttribute(HIDDEN_ATTR)) return;
      const label = entry.getAttribute("aria-label");
      if (textIncludesShorts(label)) {
        markHidden(entry);
        return;
      }
      const text = entry.textContent;
      if (textIncludesShorts(text)) {
        markHidden(entry);
      }
    });
  }

  function hideShortsTabs(root) {
    const tabAnchors = root.querySelectorAll('tp-yt-paper-tab a[href*="/shorts"], yt-tab-shape a[href*="/shorts"]');
    tabAnchors.forEach((anchor) => {
      const tab = anchor.closest("tp-yt-paper-tab, yt-tab-shape, [role='tab']");
      markHidden(tab || anchor);
    });
  }

  function scan(root = document) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE && root !== document) return;
    const scope = root === document ? document : root;
    hideByShortsLinks(scope);
    hideShortsShelves(scope);
    hideShortsGuideEntries(scope);
    hideShortsTabs(scope);
  }

  function init() {
    ensureStyle();
    scan(document);
  }

  // Mutation observer to catch SPA updates
  const observer = new MutationObserver((mutations) => {
    const roots = new Set();
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          roots.add(node);
        }
      });
    });
    if (roots.size === 0) return;
    roots.forEach((root) => scan(root));
  });

  function startObserver() {
    if (!document.body) return false;
    observer.observe(document.body, { childList: true, subtree: true });
    return true;
  }

  if (!startObserver()) {
    const bodyObserver = new MutationObserver(() => {
      if (startObserver()) bodyObserver.disconnect();
    });
    bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  // URL change detection for SPA navigations
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scan(document);
    }
  }, URL_CHECK_INTERVAL_MS);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
