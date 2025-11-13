// ==UserScript==
// @name         LinkedIn - Hide Promoted Posts (+ Hide Games, Toggle, Counter)
// @namespace    ivan.li.tm
// @version      1.4.0
// @description  Nasconde i post sponsorizzati, il box "Today's puzzle games", i post dei gruppi con pulsante "Join" su LinkedIn, con toggle (H) e contatore
// @author       you
// @match        https://www.linkedin.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const HIDDEN_CLASS = "tm-hide-sponsored";
  const HIDDEN_NOISE_CLASS = "tm-hide-noise";
  const MARK_SEEN = "data-tm-checked";
  const ROOT_SHOW_CLASS = "tm-show-sponsored";
  const LS_TOGGLE_KEY = "tm_hide_sponsored_on";

  // ====== STATE / TOGGLE ======
  let hideOn = true;
  try {
    const saved = localStorage.getItem(LS_TOGGLE_KEY);
    if (saved !== null) hideOn = saved === "1";
  } catch (_) { }

  // ====== CSS ======
  const style = document.createElement("style");
  style.textContent = `
    .${HIDDEN_CLASS} { display: none !important; }
    .${HIDDEN_NOISE_CLASS} { display: none !important; }
    .${ROOT_SHOW_CLASS} .${HIDDEN_CLASS} { display: block !important; outline: 2px dashed rgba(255,0,0,.25); }
    .${ROOT_SHOW_CLASS} .${HIDDEN_NOISE_CLASS} { display: block !important; outline: 2px dashed rgba(0,0,255,.25); }
  `;
  document.documentElement.appendChild(style);
  if (!hideOn) document.documentElement.classList.add(ROOT_SHOW_CLASS);

  // ====== BADGE CONTATORE ======
  let hiddenCount = 0;
  const badge = document.createElement("div");
  Object.assign(badge.style, {
    position: "fixed", left: "10px", bottom: "10px", padding: "6px 10px",
    background: "rgba(0,0,0,.6)", color: "#fff",
    font: "12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    borderRadius: "8px", zIndex: 2147483647, userSelect: "none", pointerEvents: "none"
  });
  badge.textContent = "Sponsored hidden: 0";
  document.body.appendChild(badge);
  function incBadge() { hiddenCount++; badge.textContent = `Sponsored hidden: ${hiddenCount}`; }

  // ====== KEYWORDS / WHITELIST ======
  const KEYWORDS = [
    "promoted", "sponsored", "sponsorizzato", "contenuto sponsorizzato",
    "contenuti sponsorizzati", "sponsorizzata"
  ];
  const WHITELIST = [ /* "Acme Inc" */];

  // ====== HELPERS ======
  function getPostContainers(root = document) {
    return root.querySelectorAll([
      "article",
      "div.occludable-update",
      "div.feed-shared-update-v2",
      "div.feed-shared-update-v2__control-menu-container",
      "div.feed-shared-update",
      "div.update-components-card",
    ].join(","));
  }
  function authorText(node) {
    const a = node.querySelector('a[href*="/company/"], a[href*="/in/"]');
    return (a && (a.textContent || "").trim()) || "";
  }
  function isSponsored(node) {
    const author = authorText(node);
    if (author && WHITELIST.some(w => author.includes(w))) return false;

    const badge = node.querySelector('[aria-label*="Promoted" i], [aria-label*="Sponsorizzato" i], [data-test-ad], [data-sponsored], [data-urn*="sponsored"]');
    if (badge) return true;

    const probable = node.querySelectorAll("span, time, a, div");
    for (const el of probable) {
      const t = (el.textContent || "").trim().toLowerCase();
      if (!t) continue;
      if (KEYWORDS.some(k => t.includes(k))) return true;
      if (t.includes("why am i seeing this ad")) return true;
    }
    return false;
  }
  function processPost(node) {
    if (!node || node.hasAttribute(MARK_SEEN)) return;
    node.setAttribute(MARK_SEEN, "1");
    try {
      if (isSponsored(node)) {
        node.classList.add(HIDDEN_CLASS);
        // Also hide the parent container to ensure the entire post is hidden
        const parentContainer = node.closest("div.feed-shared-update-v2__control-menu-container, div.occludable-update, div.feed-shared-update-v2");
        if (parentContainer && parentContainer !== node) {
          parentContainer.classList.add(HIDDEN_CLASS);
        }
        incBadge();
      }
    } catch (_) { }
  }
  function scan(root = document) { getPostContainers(root).forEach(processPost); }

  // ====== HIDE "TODAY'S PUZZLE GAMES" ======
  function hideGamesModule(root = document) {
    let hiddenSomething = false;

    // 1) selezione diretta di elementi del modulo giochi
    const direct = root.querySelectorAll([
      '[class^="games-entrypoints-module__"]',
      '[class*=" games-entrypoints-module__"]',
      '#todays-games-entrypoint-title',
      '[id*="todays-games-entrypoint-title"]',
      'ul[aria-labelledby="todays-games-entrypoint-title"]',
      'ul[aria-labelledby*="games-entrypoint-title"]'
    ].join(","));
    direct.forEach(el => {
      const card = el.closest("section.artdeco-card, aside, div.artdeco-card") || el.closest("aside, section");
      if (card && !card.classList.contains(HIDDEN_NOISE_CLASS)) {
        card.classList.add(HIDDEN_NOISE_CLASS);
        hiddenSomething = true;
      }
    });

    // 2) fallback per testo header (gestisce apostrofi diversi e spazi)
    const headers = root.querySelectorAll("h2,h3");
    for (const h of headers) {
      const txt = (h.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (txt.includes("today") && txt.includes("puzzle") && txt.includes("games")) {
        const card = h.closest("section.artdeco-card, aside, div.artdeco-card") || h.closest("aside, section, div");
        if (card && !card.classList.contains(HIDDEN_NOISE_CLASS)) {
          card.classList.add(HIDDEN_NOISE_CLASS);
          hiddenSomething = true;
        }
      }
    }

    if (hiddenSomething) {
      // eslint-disable-next-line no-console
      console.debug("[TM] Hidden 'Today's puzzle games' module.");
    }
  }

  // ====== HIDE PREMIUM UPSELL LINK ======
  function hidePremiumUpsell(root = document) {
    let hiddenSomething = false;

    // 1) Direct selection by class
    const direct = root.querySelectorAll([
      'div.premium-upsell-link',
      'a.premium-upsell-link',
      'a[class*="premium-upsell-link"]'
    ].join(","));
    direct.forEach(el => {
      if (!el.classList.contains(HIDDEN_NOISE_CLASS)) {
        el.classList.add(HIDDEN_NOISE_CLASS);
        hiddenSomething = true;
      }
    });

    // 2) Fallback: search for links containing "Try Premium" text
    const links = root.querySelectorAll('a[href*="/premium/"]');
    for (const link of links) {
      const txt = (link.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (txt.includes("try premium") || txt.includes("try premium for")) {
        const container = link.closest('div.premium-upsell-link') || link;
        if (container && !container.classList.contains(HIDDEN_NOISE_CLASS)) {
          container.classList.add(HIDDEN_NOISE_CLASS);
          hiddenSomething = true;
        }
      }
    }

    if (hiddenSomething) {
      // eslint-disable-next-line no-console
      console.debug("[TM] Hidden premium upsell link.");
    }
  }

  // ====== HIDE GROUP POSTS WITH "JOIN" BUTTON ======
  function hideGroupJoinPosts(root = document) {
    let hiddenSomething = false;

    // 1) Direct selection by Join button classes
    const joinButtons = root.querySelectorAll([
      'button.update-components-actor__join-button',
      'button[class*="join-button"]',
      'button[aria-label*="Join"]'
    ].join(","));

    joinButtons.forEach(button => {
      const txt = (button.textContent || "").trim().toLowerCase();
      if (txt === "join" || txt.includes("join")) {
        // Find the post container
        const postContainer = button.closest("div.feed-shared-update-v2__control-menu-container, div.occludable-update, div.feed-shared-update-v2");
        if (postContainer && !postContainer.classList.contains(HIDDEN_NOISE_CLASS)) {
          postContainer.classList.add(HIDDEN_NOISE_CLASS);
          hiddenSomething = true;
        }
      }
    });

    // 2) Fallback: search for buttons with "Join" text
    const allButtons = root.querySelectorAll('button');
    for (const button of allButtons) {
      const txt = (button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (txt === "join" && button.closest("div.feed-shared-update-v2__control-menu-container")) {
        const postContainer = button.closest("div.feed-shared-update-v2__control-menu-container, div.occludable-update, div.feed-shared-update-v2");
        if (postContainer && !postContainer.classList.contains(HIDDEN_NOISE_CLASS)) {
          postContainer.classList.add(HIDDEN_NOISE_CLASS);
          hiddenSomething = true;
        }
      }
    }

    if (hiddenSomething) {
      // eslint-disable-next-line no-console
      console.debug("[TM] Hidden group posts with Join button.");
    }
  }

  // ====== TOGGLE (H) ======
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "h") {
      hideOn = !hideOn;
      try { localStorage.setItem(LS_TOGGLE_KEY, hideOn ? "1" : "0"); } catch (_) { }
      document.documentElement.classList.toggle(ROOT_SHOW_CLASS, !hideOn);
    }
  });

  // ====== INITIAL SCAN ======
  scan();
  hideGamesModule();
  hidePremiumUpsell();
  hideGroupJoinPosts();

  // ====== OBSERVER ======
  const observer = new MutationObserver(muts => {
    const toScan = new Set();
    const toGames = new Set();
    const toPremium = new Set();
    const toGroupJoin = new Set();
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        if (node.matches && node.matches("article, div.occludable-update, div.feed-shared-update-v2, div.feed-shared-update-v2__control-menu-container, div.feed-shared-update, div.update-components-card")) {
          toScan.add(node);
        } else {
          getPostContainers(node).forEach(n => toScan.add(n));
        }
        toGames.add(node);
        toPremium.add(node);
        toGroupJoin.add(node);
      }
    }
    if (toScan.size || toGames.size || toPremium.size || toGroupJoin.size) {
      requestAnimationFrame(() => {
        toScan.forEach(processPost);
        toGames.forEach(n => hideGamesModule(n));
        toPremium.forEach(n => hidePremiumUpsell(n));
        toGroupJoin.forEach(n => hideGroupJoinPosts(n));
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ====== SAFETY RESCAN ======
  setInterval(() => { scan(); hideGamesModule(); hidePremiumUpsell(); hideGroupJoinPosts(); }, 4000);
})();
