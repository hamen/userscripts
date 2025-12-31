// ==UserScript==
// @name         AdMob GBP to EUR Converter with Percentage Improvement
// @namespace    ivan.admob.tm
// @version      1.1.0
// @description  Converts all British Pound (£) amounts to Euro (€) on AdMob dashboard and shows percentage improvements
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
    const RATE_CACHE_HOURS = 24; // Cache exchange rate for 24 hours

    let exchangeRate = null;
    let isConverting = false;

    // ====== EXCHANGE RATE FETCHING ======
    async function fetchExchangeRate() {
        // Check cache first
        try {
            const cachedRate = localStorage.getItem(EXCHANGE_RATE_KEY);
            const cachedTimestamp = localStorage.getItem(EXCHANGE_RATE_TIMESTAMP_KEY);

            if (cachedRate && cachedTimestamp) {
                const age = Date.now() - parseInt(cachedTimestamp, 10);
                const ageHours = age / (1000 * 60 * 60);

                if (ageHours < RATE_CACHE_HOURS) {
                    return parseFloat(cachedRate);
                }
            }
        } catch (_) {
            // Ignore localStorage errors
        }

        // Fetch fresh rate
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://api.exchangerate-api.com/v4/latest/GBP",
                onload: function (response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        const rate = data.rates?.EUR;

                        if (rate && typeof rate === "number") {
                            // Cache the rate
                            try {
                                localStorage.setItem(EXCHANGE_RATE_KEY, rate.toString());
                                localStorage.setItem(EXCHANGE_RATE_TIMESTAMP_KEY, Date.now().toString());
                            } catch (_) {
                                // Ignore localStorage errors
                            }
                            resolve(rate);
                        } else {
                            reject(new Error("Invalid exchange rate data"));
                        }
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: function () {
                    reject(new Error("Failed to fetch exchange rate"));
                },
            });
        });
    }

    // ====== INITIALIZE EXCHANGE RATE ======
    async function initializeExchangeRate() {
        if (exchangeRate !== null) return;

        try {
            exchangeRate = await fetchExchangeRate();
            console.log("[AdMob GBP→EUR] Exchange rate loaded:", exchangeRate);
        } catch (error) {
            console.error("[AdMob GBP→EUR] Failed to fetch exchange rate:", error);
            // Fallback to a reasonable rate if API fails
            exchangeRate = 1.17; // Approximate GBP to EUR rate
            console.warn("[AdMob GBP→EUR] Using fallback rate:", exchangeRate);
        }
    }

    // ====== CONVERSION FUNCTIONS ======
    function parsePoundAmount(text) {
        // Match patterns like: £1.23, £1,234.56, £0.34, etc.
        const patterns = [
            /£\s*([\d,]+\.?\d*)/g,           // £1.23 or £1,234.56
            /([\d,]+\.?\d*)\s*£/g,           // 1.23£
            /GBP\s*([\d,]+\.?\d*)/gi,        // GBP 1.23
            /([\d,]+\.?\d*)\s*GBP/gi,        // 1.23 GBP
            /£\s*([\d]{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,  // £1,234.56
            /£\s*([\d]+\.\d{2})/g,           // £1.23 (exactly 2 decimals)
            /£\s*([\d]+\.\d{1,2})/g,        // £1.2 or £1.23
        ];

        const matches = [];
        const seenIndices = new Set();

        for (const pattern of patterns) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(text)) !== null) {
                if (seenIndices.has(match.index)) continue;

                const amountStr = match[1].replace(/,/g, "");
                const amount = parseFloat(amountStr);
                if (!isNaN(amount) && amount >= 0 && amount < 1000000) {
                    matches.push({
                        original: match[0],
                        amount: amount,
                        index: match.index,
                    });
                    seenIndices.add(match.index);
                }
            }
        }

        matches.sort((a, b) => a.index - b.index);
        return matches;
    }

    function parseEuroAmount(text) {
        // Parse Euro amounts (€1.23 or €1,234.56)
        const patterns = [
            /€\s*([\d,]+\.?\d*)/g,
            /([\d,]+\.?\d*)\s*€/g,
            /EUR\s*([\d,]+\.?\d*)/gi,
            /([\d,]+\.?\d*)\s*EUR/gi,
        ];

        const matches = [];
        const seenIndices = new Set();

        for (const pattern of patterns) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(text)) !== null) {
                if (seenIndices.has(match.index)) continue;

                const amountStr = match[1].replace(/,/g, "");
                const amount = parseFloat(amountStr);
                if (!isNaN(amount) && amount >= 0 && amount < 1000000) {
                    matches.push({
                        original: match[0],
                        amount: amount,
                        index: match.index,
                    });
                    seenIndices.add(match.index);
                }
            }
        }

        return matches.length > 0 ? matches[0].amount : null;
    }

    function convertToEuro(amount) {
        if (exchangeRate === null) return null;
        return amount * exchangeRate;
    }

    function formatEuro(amount) {
        return new Intl.NumberFormat("en-EU", {
            style: "currency",
            currency: "EUR",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    }

    function formatPercentage(value) {
        const sign = value >= 0 ? "+" : "";
        return `${sign}${value.toFixed(1)}%`;
    }

    function isAlreadyConverted(node) {
        let current = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        while (current) {
            if (current.hasAttribute && current.hasAttribute(CONVERTED_ATTR)) {
                return true;
            }
            current = current.parentElement;
        }
        return false;
    }

    function convertTextNode(node) {
        if (node.nodeType !== Node.TEXT_NODE) return false;
        if (isAlreadyConverted(node)) return false;

        const parent = node.parentElement;
        if (parent && (parent.tagName === "SCRIPT" || parent.tagName === "STYLE" ||
            parent.tagName === "NOSCRIPT" || parent.tagName === "CODE")) {
            return false;
        }

        const text = node.textContent;
        if (!text || !text.includes("£")) return false;

        const matches = parsePoundAmount(text);
        if (matches.length === 0) return false;

        let newText = text;
        matches.reverse().forEach((match) => {
            const euroAmount = convertToEuro(match.amount);
            if (euroAmount !== null) {
                const formattedEuro = formatEuro(euroAmount);
                const before = newText.substring(0, match.index);
                const after = newText.substring(match.index + match.original.length);
                newText = before + formattedEuro + after;
            }
        });

        if (newText !== text) {
            const wrapper = document.createElement("span");
            wrapper.setAttribute(CONVERTED_ATTR, "true");
            wrapper.textContent = newText;
            node.parentNode?.replaceChild(wrapper, node);
            return true;
        }

        return false;
    }

    function convertElement(element) {
        if (isAlreadyConverted(element)) return;
        if (element.tagName === "SCRIPT" || element.tagName === "STYLE" ||
            element.tagName === "NOSCRIPT" || element.tagName === "CODE") return;

        const fullText = element.textContent || "";
        if (fullText.includes("£")) {
            const matches = parsePoundAmount(fullText);
            if (matches.length > 0) {
                const childElements = element.querySelectorAll("*");
                let hasOnlyText = true;
                for (const child of childElements) {
                    if (child.textContent && child.textContent.trim().length > 0) {
                        hasOnlyText = false;
                        break;
                    }
                }

                if (hasOnlyText || childElements.length === 0) {
                    let newText = fullText;
                    matches.reverse().forEach((match) => {
                        const euroAmount = convertToEuro(match.amount);
                        if (euroAmount !== null) {
                            const formattedEuro = formatEuro(euroAmount);
                            const before = newText.substring(0, match.index);
                            const after = newText.substring(match.index + match.original.length);
                            newText = before + formattedEuro + after;
                        }
                    });

                    if (newText !== fullText) {
                        element.textContent = newText;
                        element.setAttribute(CONVERTED_ATTR, "true");
                        return;
                    }
                }
            }
        }

        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function (node) {
                    if (isAlreadyConverted(node)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    const parent = node.parentElement;
                    if (parent && (parent.tagName === "SCRIPT" || parent.tagName === "STYLE" ||
                        parent.tagName === "NOSCRIPT" || parent.tagName === "CODE")) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let textNode;
        const nodesToProcess = [];
        while ((textNode = walker.nextNode())) {
            nodesToProcess.push(textNode);
        }

        nodesToProcess.forEach(convertTextNode);

        if (nodesToProcess.length === 0 || nodesToProcess.every(n => isAlreadyConverted(n))) {
            element.setAttribute(CONVERTED_ATTR, "true");
        }
    }

    // ====== PERCENTAGE IMPROVEMENT FEATURE ======
    function addPercentageImprovement() {
        // Find all text nodes that contain "This month so far" and "Last month"
        const allTextNodes = [];
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null
        );

        let textNode;
        while ((textNode = walker.nextNode())) {
            const text = textNode.textContent || "";
            if (text.includes("This month so far") || text.includes("Last month")) {
                allTextNodes.push(textNode);
            }
        }

        if (allTextNodes.length === 0) return;

        // Find the container that has both values
        let earningsContainer = null;
        for (const node of allTextNodes) {
            let parent = node.parentElement;
            let depth = 0;
            while (parent && depth < 10) {
                const text = parent.textContent || "";
                if (text.includes("This month so far") && text.includes("Last month")) {
                    earningsContainer = parent;
                    break;
                }
                parent = parent.parentElement;
                depth++;
            }
            if (earningsContainer) break;
        }

        if (earningsContainer) {
            addPercentageToSection(earningsContainer);
        }
    }

    function addPercentageToSection(section) {
        if (!section || section.hasAttribute(PERCENTAGE_ADDED_ATTR)) return;

        const fullText = section.textContent || "";

        // Try to find "This month so far" and "Last month" values
        // Look for patterns like "This month so far: €29.72" or "This month so far €29.72"
        const thisMonthMatch = fullText.match(/This month so far[:\s]+€?([\d,]+\.?\d*)/i);
        const lastMonthMatch = fullText.match(/Last month[:\s]+€?([\d,]+\.?\d*)/i);

        if (!thisMonthMatch || !lastMonthMatch) {
            // Try alternative patterns - look for Euro amounts near these labels
            const lines = fullText.split(/\n/);
            let thisMonthValue = null;
            let lastMonthValue = null;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.match(/This month so far/i)) {
                    // Look for Euro amount in this line or next line
                    const euroMatch = line.match(/€([\d,]+\.?\d*)/);
                    if (euroMatch) {
                        thisMonthValue = parseFloat(euroMatch[1].replace(/,/g, ""));
                    } else if (i + 1 < lines.length) {
                        const nextLine = lines[i + 1].trim();
                        const nextEuroMatch = nextLine.match(/€([\d,]+\.?\d*)/);
                        if (nextEuroMatch) {
                            thisMonthValue = parseFloat(nextEuroMatch[1].replace(/,/g, ""));
                        }
                    }
                }
                if (line.match(/Last month/i)) {
                    const euroMatch = line.match(/€([\d,]+\.?\d*)/);
                    if (euroMatch) {
                        lastMonthValue = parseFloat(euroMatch[1].replace(/,/g, ""));
                    } else if (i + 1 < lines.length) {
                        const nextLine = lines[i + 1].trim();
                        const nextEuroMatch = nextLine.match(/€([\d,]+\.?\d*)/);
                        if (nextEuroMatch) {
                            lastMonthValue = parseFloat(nextEuroMatch[1].replace(/,/g, ""));
                        }
                    }
                }
            }

            if (thisMonthValue && lastMonthValue) {
                calculateAndDisplayPercentage(section, thisMonthValue, lastMonthValue);
                return;
            }
            return;
        }

        const thisMonthValue = parseFloat(thisMonthMatch[1].replace(/,/g, ""));
        const lastMonthValue = parseFloat(lastMonthMatch[1].replace(/,/g, ""));

        if (!isNaN(thisMonthValue) && !isNaN(lastMonthValue) && lastMonthValue > 0) {
            calculateAndDisplayPercentage(section, thisMonthValue, lastMonthValue);
        }
    }

    function calculateAndDisplayPercentage(section, thisMonth, lastMonth) {
        const percentageChange = ((thisMonth - lastMonth) / lastMonth) * 100;
        const isPositive = percentageChange >= 0;

        // Find the element containing "This month so far" and its value
        const walker = document.createTreeWalker(
            section,
            NodeFilter.SHOW_TEXT,
            null
        );

        let targetElement = null;
        let textNode;
        while ((textNode = walker.nextNode())) {
            const text = textNode.textContent || "";
            if (text.includes("This month so far")) {
                // Find the parent element that likely contains the value
                let parent = textNode.parentElement;
                let depth = 0;
                while (parent && depth < 5) {
                    // Check if this parent or its siblings contain a Euro amount
                    const siblings = Array.from(parent.parentElement?.children || []);
                    for (const sibling of siblings) {
                        const siblingText = sibling.textContent || "";
                        if (siblingText.includes("€") && parseEuroAmount(siblingText) === thisMonth) {
                            targetElement = sibling;
                            break;
                        }
                    }
                    if (targetElement) break;

                    // Check parent itself
                    const parentText = parent.textContent || "";
                    if (parentText.includes("€") && parseEuroAmount(parentText) === thisMonth) {
                        targetElement = parent;
                        break;
                    }

                    parent = parent.parentElement;
                    depth++;
                }
                if (!targetElement) {
                    targetElement = textNode.parentElement;
                }
                break;
            }
        }

        // Create percentage badge
        const badge = document.createElement("span");
        badge.setAttribute(PERCENTAGE_ADDED_ATTR, "true");
        const changeText = formatPercentage(percentageChange);
        badge.textContent = ` ${changeText}`;
        badge.style.cssText = `
            display: inline-block;
            margin-left: 6px;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 0.85em;
            font-weight: 600;
            background-color: ${isPositive ? "#e8f5e9" : "#ffebee"};
            color: ${isPositive ? "#2e7d32" : "#c62828"};
            white-space: nowrap;
        `;

        // Try to find the element containing the Euro value for "This month so far"
        if (targetElement) {
            // Look for the value element - it might be a sibling or child
            const allElements = targetElement.querySelectorAll("*");
            let valueElement = null;

            // First, try to find an element that contains the exact Euro amount
            for (const el of allElements) {
                const text = el.textContent || "";
                const euroValue = parseEuroAmount(text);
                if (euroValue !== null && Math.abs(euroValue - thisMonth) < 0.01) {
                    valueElement = el;
                    break;
                }
            }

            // If not found, check siblings
            if (!valueElement && targetElement.parentElement) {
                const siblings = Array.from(targetElement.parentElement.children);
                for (const sibling of siblings) {
                    const text = sibling.textContent || "";
                    const euroValue = parseEuroAmount(text);
                    if (euroValue !== null && Math.abs(euroValue - thisMonth) < 0.01) {
                        valueElement = sibling;
                        break;
                    }
                }
            }

            // Insert badge after the value element or target element
            const insertTarget = valueElement || targetElement;
            if (insertTarget && insertTarget.parentElement) {
                insertTarget.parentElement.insertBefore(badge, insertTarget.nextSibling);
                section.setAttribute(PERCENTAGE_ADDED_ATTR, "true");
                return;
            }
        }

        // Fallback: append to section
        if (section) {
            section.appendChild(badge);
            section.setAttribute(PERCENTAGE_ADDED_ATTR, "true");
        }
    }

    // ====== MAIN CONVERSION FUNCTION ======
    async function convertPage(rootElement = document.body) {
        if (isConverting || exchangeRate === null || !rootElement) return;
        isConverting = true;

        try {
            let conversionCount = 0;

            const textWalker = document.createTreeWalker(
                rootElement,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function (node) {
                        if (isAlreadyConverted(node)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        const parent = node.parentElement;
                        if (parent && (parent.tagName === "SCRIPT" || parent.tagName === "STYLE" ||
                            parent.tagName === "NOSCRIPT" || parent.tagName === "CODE")) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        if (node.textContent && node.textContent.includes("£")) {
                            return NodeFilter.FILTER_ACCEPT;
                        }
                        return NodeFilter.FILTER_REJECT;
                    }
                }
            );

            const textNodesToProcess = [];
            let textNode;
            while ((textNode = textWalker.nextNode())) {
                textNodesToProcess.push(textNode);
            }

            textNodesToProcess.forEach(node => {
                if (convertTextNode(node)) {
                    conversionCount++;
                }
            });

            const allElements = rootElement.querySelectorAll("*");
            const elementsWithPound = [];
            allElements.forEach(el => {
                if (!isAlreadyConverted(el) &&
                    el.textContent && el.textContent.includes("£") &&
                    el.tagName !== "SCRIPT" && el.tagName !== "STYLE" &&
                    el.tagName !== "NOSCRIPT" && el.tagName !== "CODE") {
                    elementsWithPound.push(el);
                }
            });

            elementsWithPound.forEach(el => {
                convertElement(el);
            });

            // Add percentage improvement after conversion
            setTimeout(() => {
                addPercentageImprovement();
            }, 500);
        } finally {
            isConverting = false;
        }
    }

    // ====== RESET CONVERSION STATE ======
    function resetConversionState() {
        const convertedElements = document.querySelectorAll(`[${CONVERTED_ATTR}]`);
        convertedElements.forEach((el) => {
            if (el.tagName === "SPAN" && el.hasAttribute(CONVERTED_ATTR)) {
                const textNode = document.createTextNode(el.textContent);
                el.parentNode?.replaceChild(textNode, el);
            } else {
                el.removeAttribute(CONVERTED_ATTR);
            }
        });

        // Remove percentage badges
        document.querySelectorAll(`[${PERCENTAGE_ADDED_ATTR}]`).forEach((el) => {
            el.remove();
        });
    }

    // ====== INITIALIZATION ======
    async function init() {
        await initializeExchangeRate();
        if (exchangeRate !== null) {
            setTimeout(() => {
                convertPage();
            }, 1000);
        }
    }

    // ====== MUTATION OBSERVER ======
    const observer = new MutationObserver((mutations) => {
        if (exchangeRate === null || isConverting) return;

        const nodesToConvert = [];
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE && !isAlreadyConverted(node)) {
                    if (node.textContent && node.textContent.includes("£")) {
                        nodesToConvert.push(node);
                    }
                } else if (node.nodeType === Node.TEXT_NODE && !isAlreadyConverted(node)) {
                    if (node.textContent && node.textContent.includes("£")) {
                        nodesToConvert.push(node.parentElement || document.body);
                    }
                }
            }
        }

        if (nodesToConvert.length > 0) {
            clearTimeout(observer.timeout);
            observer.timeout = setTimeout(() => {
                nodesToConvert.forEach(root => convertPage(root));
            }, 300);
        }
    });

    // ====== SETUP OBSERVER ======
    function setupObserver() {
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });
            return true;
        }
        return false;
    }

    if (!setupObserver()) {
        const bodyObserver = new MutationObserver(() => {
            if (setupObserver()) {
                bodyObserver.disconnect();
                init();
            }
        });
        bodyObserver.observe(document.documentElement, {
            childList: true,
        });
    }

    // ====== URL CHANGE DETECTION ======
    let lastUrl = location.href;
    function checkUrlChange() {
        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            resetConversionState();
            setTimeout(() => {
                init();
            }, 500);
        }
    }

    if (typeof window.onurlchange !== "undefined") {
        window.addEventListener("urlchange", () => {
            checkUrlChange();
        });
    } else {
        setInterval(checkUrlChange, 1000);
    }

    window.addEventListener("popstate", () => {
        setTimeout(() => {
            resetConversionState();
            init();
        }, 500);
    });

    // ====== INITIALIZE ======
    function startInit() {
        if (document.body) {
            init();
        } else {
            const checkBody = setInterval(() => {
                if (document.body) {
                    clearInterval(checkBody);
                    init();
                }
            }, 100);
            setTimeout(() => clearInterval(checkBody), 10000);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", startInit);
    } else {
        startInit();
    }

    setTimeout(startInit, 2000);

    // Periodic refresh
    setInterval(async () => {
        const oldRate = exchangeRate;
        await initializeExchangeRate();
        if (exchangeRate !== oldRate) {
            resetConversionState();
            convertPage();
        }
    }, 60 * 60 * 1000);
})();
