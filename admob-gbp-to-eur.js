// ==UserScript==
// @name         AdMob GBP to EUR Converter with Percentage Improvement
// @namespace    com.ivanmorgillo.userscript.admob
// @version      1.2.0
// @description  Converts all British Pound (£) amounts to Euro (€) on AdMob dashboard and shows month-over-month percentage improvements
// @author       Ivan Morgillo and Cursor
// @match        https://admob.google.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      exchangerate-api.com
// @connect      api.exchangerate-api.com
// ==/UserScript==

(function () {
    "use strict";

    console.log("[AdMob GBP→EUR] Script loaded on:", location.href);

    const CONVERTED_ATTR = "data-tm-converted-eur";
    const PERCENTAGE_ADDED_ATTR = "data-tm-percentage-added";
    const EXCHANGE_RATE_KEY = "tm_gbp_eur_rate";
    const EXCHANGE_RATE_TIMESTAMP_KEY = "tm_gbp_eur_rate_timestamp";
    const RATE_CACHE_HOURS = 24;
    const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "TEXTAREA", "INPUT"]);

    let exchangeRate = null;
    let isConverting = false;
    let convertScheduled = false;

    // ====== EXCHANGE RATE FETCHING ======
    function fetchExchangeRate() {
        try {
            const cachedRate = localStorage.getItem(EXCHANGE_RATE_KEY);
            const cachedTimestamp = localStorage.getItem(EXCHANGE_RATE_TIMESTAMP_KEY);
            if (cachedRate && cachedTimestamp) {
                const ageHours = (Date.now() - parseInt(cachedTimestamp, 10)) / (1000 * 60 * 60);
                if (ageHours < RATE_CACHE_HOURS) {
                    return Promise.resolve(parseFloat(cachedRate));
                }
            }
        } catch (_) { /* ignore */ }

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://api.exchangerate-api.com/v4/latest/GBP",
                onload: (response) => {
                    try {
                        const data = JSON.parse(response.responseText);
                        const rate = data.rates && data.rates.EUR;
                        if (typeof rate === "number") {
                            try {
                                localStorage.setItem(EXCHANGE_RATE_KEY, String(rate));
                                localStorage.setItem(EXCHANGE_RATE_TIMESTAMP_KEY, String(Date.now()));
                            } catch (_) { /* ignore */ }
                            resolve(rate);
                        } else {
                            reject(new Error("Invalid exchange rate data"));
                        }
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: () => reject(new Error("Failed to fetch exchange rate")),
            });
        });
    }

    async function initializeExchangeRate() {
        if (exchangeRate !== null) return;
        try {
            exchangeRate = await fetchExchangeRate();
            console.log("[AdMob GBP→EUR] Exchange rate loaded:", exchangeRate);
        } catch (error) {
            console.error("[AdMob GBP→EUR] Failed to fetch exchange rate:", error);
            exchangeRate = 1.17;
            console.warn("[AdMob GBP→EUR] Using fallback rate:", exchangeRate);
        }
    }

    // ====== CURRENCY PARSING / FORMATTING ======
    // Single, lenient regex that tolerates NBSP / narrow NBSP between symbol and number.
    // Captures: full match, sign (optional +/-), number with separators.
    const POUND_RE = /([+-]?)\s*£[\s\u00A0\u202F]*([0-9](?:[0-9,]*[0-9])?(?:\.[0-9]+)?)|([+-]?)\s*([0-9](?:[0-9,]*[0-9])?(?:\.[0-9]+)?)\s*(?:£|GBP)|GBP[\s\u00A0\u202F]*([+-]?)([0-9](?:[0-9,]*[0-9])?(?:\.[0-9]+)?)/g;

    function parsePoundMatches(text) {
        const out = [];
        if (!text || (!text.includes("£") && !/GBP/i.test(text))) return out;
        POUND_RE.lastIndex = 0;
        let m;
        while ((m = POUND_RE.exec(text)) !== null) {
            const sign = m[1] || m[3] || m[5] || "";
            const num = m[2] || m[4] || m[6];
            if (!num) continue;
            const amount = parseFloat(num.replace(/,/g, ""));
            if (isNaN(amount) || amount < 0 || amount >= 1e9) continue;
            out.push({
                original: m[0],
                index: m.index,
                amount: amount,
                sign: sign === "-" ? -1 : 1,
            });
        }
        return out;
    }

    function parseEuroAmount(text) {
        const m = /€[\s\u00A0\u202F]*([0-9](?:[0-9,]*[0-9])?(?:\.[0-9]+)?)/.exec(text || "");
        return m ? parseFloat(m[1].replace(/,/g, "")) : null;
    }

    function convertToEuro(amount) {
        return exchangeRate === null ? null : amount * exchangeRate;
    }

    const EURO_FORMATTER = new Intl.NumberFormat("en-IE", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    function formatEuro(amount) { return EURO_FORMATTER.format(amount); }

    function formatPercentage(value) {
        const sign = value >= 0 ? "+" : "";
        return `${sign}${value.toFixed(1)}%`;
    }

    // ====== TEXT NODE CONVERSION (in place) ======
    function isParentConverted(node) {
        const p = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        return !!(p && p.hasAttribute && p.hasAttribute(CONVERTED_ATTR));
    }

    function shouldSkipParent(parent) {
        if (!parent) return true;
        if (SKIP_TAGS.has(parent.tagName)) return true;
        // Don't touch contenteditable regions
        if (parent.isContentEditable) return true;
        return false;
    }

    function convertTextNode(node) {
        if (node.nodeType !== Node.TEXT_NODE) return false;
        const parent = node.parentElement;
        if (shouldSkipParent(parent)) return false;
        if (parent.hasAttribute(CONVERTED_ATTR)) return false;

        const text = node.nodeValue;
        if (!text || (!text.includes("£") && !/GBP/i.test(text))) return false;

        const matches = parsePoundMatches(text);
        if (!matches.length) return false;

        // Replace from right to left so indices stay valid.
        let newText = text;
        for (let i = matches.length - 1; i >= 0; i--) {
            const m = matches[i];
            const eur = convertToEuro(m.amount * m.sign);
            if (eur === null) continue;
            const formatted = (eur < 0 ? "-" : (m.sign > 0 && /^[+]/.test(m.original) ? "+" : "")) + formatEuro(Math.abs(eur));
            newText = newText.substring(0, m.index) + formatted + newText.substring(m.index + m.original.length);
        }

        if (newText !== text) {
            node.nodeValue = newText;
            // Mark the *direct* parent only, never an ancestor.
            parent.setAttribute(CONVERTED_ATTR, "true");
            return true;
        }
        return false;
    }

    // ====== PAGE CONVERSION ======
    function convertPage(rootElement) {
        if (isConverting || exchangeRate === null) return 0;
        const root = rootElement && rootElement.nodeType === Node.ELEMENT_NODE ? rootElement : document.body;
        if (!root) return 0;
        isConverting = true;
        let count = 0;
        try {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode(node) {
                    const parent = node.parentElement;
                    if (shouldSkipParent(parent)) return NodeFilter.FILTER_REJECT;
                    if (parent.hasAttribute(CONVERTED_ATTR)) return NodeFilter.FILTER_REJECT;
                    const v = node.nodeValue;
                    if (!v) return NodeFilter.FILTER_REJECT;
                    return (v.includes("£") || /GBP/i.test(v))
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_REJECT;
                },
            });
            const nodes = [];
            let n;
            while ((n = walker.nextNode())) nodes.push(n);
            for (const node of nodes) if (convertTextNode(node)) count++;
        } finally {
            isConverting = false;
        }
        if (count > 0) console.log(`[AdMob GBP→EUR] Converted ${count} text node(s)`);
        // Run percentage step after conversion (or even if no conversion happened, in case page is in €)
        scheduleAddPercentage();
        return count;
    }

    // ====== PERCENTAGE IMPROVEMENT ======
    let percentageScheduled = false;
    function scheduleAddPercentage() {
        if (percentageScheduled) return;
        percentageScheduled = true;
        setTimeout(() => {
            percentageScheduled = false;
            try { addPercentageImprovement(); } catch (e) { console.error("[AdMob GBP→EUR] pct error", e); }
        }, 300);
    }

    function findLabelTextNode(label) {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                return node.nodeValue && node.nodeValue.includes(label)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            },
        });
        return walker.nextNode();
    }

    // Given the text node holding the label, find the nearest element that contains
    // an actual currency amount (€ or £). It is usually a sibling of the label's container.
    function findValueElementNear(labelNode) {
        let cursor = labelNode.parentElement;
        for (let depth = 0; cursor && depth < 6; depth++, cursor = cursor.parentElement) {
            const siblings = cursor.parentElement ? Array.from(cursor.parentElement.children) : [];
            for (const sib of siblings) {
                const t = sib.textContent || "";
                if (/€|£/.test(t) && !/This month so far|Last month/i.test(t)) {
                    return sib;
                }
            }
            // Also look inside the cursor itself
            const inside = cursor.querySelector && cursor.querySelector("*");
            if (inside) {
                const els = cursor.querySelectorAll("*");
                for (const el of els) {
                    if (el.children.length === 0 && /€|£/.test(el.textContent || "")) {
                        return el;
                    }
                }
            }
        }
        return null;
    }

    function readAmount(el) {
        if (!el) return null;
        const t = el.textContent || "";
        const eur = parseEuroAmount(t);
        if (eur !== null) return eur;
        const gbp = parsePoundMatches(t)[0];
        return gbp ? gbp.amount : null;
    }

    function addPercentageImprovement() {
        const thisMonthLabel = findLabelTextNode("This month so far");
        const lastMonthLabel = findLabelTextNode("Last month");
        if (!thisMonthLabel || !lastMonthLabel) return;

        const thisValEl = findValueElementNear(thisMonthLabel);
        const lastValEl = findValueElementNear(lastMonthLabel);
        const thisMonth = readAmount(thisValEl);
        const lastMonth = readAmount(lastValEl);
        if (thisMonth == null || lastMonth == null || lastMonth <= 0) return;

        // Avoid duplicating: if a percentage badge already sits next to the value element, skip.
        if (thisValEl.parentElement &&
            thisValEl.parentElement.querySelector(`[${PERCENTAGE_ADDED_ATTR}]`)) return;

        const change = ((thisMonth - lastMonth) / lastMonth) * 100;
        const positive = change >= 0;

        const badge = document.createElement("span");
        badge.setAttribute(PERCENTAGE_ADDED_ATTR, "true");
        badge.textContent = ` ${formatPercentage(change)}`;
        badge.style.cssText = `
            display: inline-block;
            margin-left: 6px;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 0.85em;
            font-weight: 600;
            background-color: ${positive ? "#e8f5e9" : "#ffebee"};
            color: ${positive ? "#2e7d32" : "#c62828"};
            white-space: nowrap;
            vertical-align: middle;
        `;
        thisValEl.parentElement.insertBefore(badge, thisValEl.nextSibling);
    }

    // ====== RESET ======
    function resetConversionState() {
        // Note: we never replace text nodes anymore, so reset is just removing markers.
        document.querySelectorAll(`[${CONVERTED_ATTR}]`).forEach(el => el.removeAttribute(CONVERTED_ATTR));
        document.querySelectorAll(`[${PERCENTAGE_ADDED_ATTR}]`).forEach(el => el.remove());
    }

    // ====== INIT ======
    async function init() {
        await initializeExchangeRate();
        if (exchangeRate !== null) {
            // First pass shortly after idle, second pass after Angular has hydrated.
            setTimeout(() => convertPage(), 500);
            setTimeout(() => convertPage(), 1500);
            setTimeout(() => convertPage(), 3500);
        }
    }

    // ====== MUTATION OBSERVER ======
    const observer = new MutationObserver((mutations) => {
        if (exchangeRate === null || isConverting) return;
        let needs = false;
        for (const mutation of mutations) {
            if (mutation.type === "characterData") {
                const v = mutation.target && mutation.target.nodeValue;
                if (v && (v.includes("£") || /GBP/i.test(v))) { needs = true; break; }
            } else {
                for (const node of mutation.addedNodes) {
                    const v = node.textContent || "";
                    if (v.includes("£") || /GBP/i.test(v) ||
                        v.includes("This month so far") || v.includes("Last month")) {
                        needs = true; break;
                    }
                }
                if (needs) break;
            }
        }
        if (!needs) return;
        if (convertScheduled) return;
        convertScheduled = true;
        setTimeout(() => {
            convertScheduled = false;
            convertPage();
        }, 250);
    });

    function setupObserver() {
        if (!document.body) return false;
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
        });
        return true;
    }

    if (!setupObserver()) {
        const bodyObserver = new MutationObserver(() => {
            if (setupObserver()) { bodyObserver.disconnect(); init(); }
        });
        bodyObserver.observe(document.documentElement, { childList: true });
    }

    // ====== URL CHANGE DETECTION (SPA) ======
    let lastUrl = location.href;
    function checkUrlChange() {
        if (location.href === lastUrl) return;
        lastUrl = location.href;
        resetConversionState();
        setTimeout(() => init(), 500);
    }
    if (typeof window.onurlchange !== "undefined") {
        window.addEventListener("urlchange", checkUrlChange);
    } else {
        setInterval(checkUrlChange, 1000);
    }
    window.addEventListener("popstate", () => {
        setTimeout(() => { resetConversionState(); init(); }, 500);
    });

    // ====== START ======
    function startInit() {
        if (document.body) { init(); return; }
        const t = setInterval(() => {
            if (document.body) { clearInterval(t); init(); }
        }, 100);
        setTimeout(() => clearInterval(t), 10000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", startInit);
    } else {
        startInit();
    }
    setTimeout(startInit, 2000);

    // Periodic refresh of exchange rate (every hour).
    setInterval(async () => {
        const old = exchangeRate;
        exchangeRate = null;
        await initializeExchangeRate();
        if (exchangeRate !== old) {
            resetConversionState();
            convertPage();
        }
    }, 60 * 60 * 1000);
})();
