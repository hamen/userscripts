// ==UserScript==
// @name         Hey - Trash / Feed / Paper Trail in Power Through
// @namespace    https://ivanmorgillo.com/
// @version      1.2.1
// @description  Adds Move to Paper Trail (P), Move to The Feed (F), and Trash (T) buttons to HEY's Power Through New
// @match        https://app.hey.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const POWER_THROUGH_PATH = '/imbox/unseen';
    const FRAME_PREFIX = 'attack_mode_entry_';
    const MARKER = 'data-hey-extra-injected';

    const BOX = {
        FEED: 2364114,
        PAPER_TRAIL: 2364117,
    };

    const ICONS = {
        trash: 'https://app.hey.com/assets/icons/trash-71dc6f08.svg',
        feed: 'https://app.hey.com/assets/icons/feedbox-55ae627f.svg',
        paper: 'https://app.hey.com/assets/icons/trailbox-c98ccae6.svg',
    };

    function injectStyle() {
        if (document.getElementById('hey-extra-style')) return;
        const css = `
        .power-mode__toolbar-action--xtrash::before { background-image: url("${ICONS.trash}"); }
        .power-mode__toolbar-action--xfeed::before  { background-image: url("${ICONS.feed}"); }
        .power-mode__toolbar-action--xpaper::before { background-image: url("${ICONS.paper}"); }
      `;
        const s = document.createElement('style');
        s.id = 'hey-extra-style';
        s.textContent = css;
        document.head.appendChild(s);
    }

    function csrf() {
        const m = document.querySelector('meta[name="csrf-token"]');
        return m ? m.getAttribute('content') : null;
    }

    function entryIdOf(frame) {
        return frame && frame.id.startsWith(FRAME_PREFIX)
            ? frame.id.slice(FRAME_PREFIX.length)
            : null;
    }

    function topicIdOf(frame) {
        // HEY inserts a /topics/<TOPIC_ID>#__entry_<ENTRY_ID> link in each frame.
        const link = frame.querySelector('a[href*="/topics/"]');
        if (!link) return null;
        const m = link.getAttribute('href').match(/\/topics\/(\d+)/);
        return m ? m[1] : null;
    }

    async function doAction(opts) {
        const { topicId, frame, button, kind } = opts;
        const token = csrf();
        if (!token || !topicId) {
            console.warn('[hey-extra] missing CSRF or topicId', { hasToken: !!token, topicId });
            button.disabled = false;
            return;
        }

        let url;
        const body = new URLSearchParams();
        body.set('authenticity_token', token);

        if (kind === 'trash') {
            url = `/topics/${topicId}/status/trashed`;
            body.set('_method', 'put');
        } else if (kind === 'feed') {
            url = `/topics/${topicId}/moves?box_id=${BOX.FEED}`;
        } else if (kind === 'paper') {
            url = `/topics/${topicId}/moves?box_id=${BOX.PAPER_TRAIL}`;
        } else {
            return;
        }

        button.disabled = true;

        try {
            const res = await fetch(url, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'X-CSRF-Token': token,
                    'Accept': 'text/vnd.turbo-stream.html, text/html;q=0.9',
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: body.toString(),
            });
            if (!res.ok) {
                console.error('[hey-extra]', kind, 'HTTP', res.status);
                button.disabled = false;
                return;
            }
            frame.remove();
        } catch (err) {
            console.error('[hey-extra]', err);
            button.disabled = false;
        }
    }

    function buildAction({ entryId, topicId, frame, kind, modifier, label, hotkey, title }) {
        const form = document.createElement('form');
        form.setAttribute(MARKER, kind);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `power-mode__toolbar-action power-mode__toolbar-action--${modifier} btn btn-with-spinner`;
        btn.setAttribute('aria-label', title);
        btn.setAttribute('title', title);

        const labelSpan = document.createElement('span');
        labelSpan.className = 'power-mode__toolbar-action-label';
        labelSpan.textContent = label;

        const kbd = document.createElement('kbd');
        kbd.className = 'power-mode__action-hotkey u-hide@mobile-app';
        kbd.textContent = hotkey;
        labelSpan.appendChild(kbd);

        btn.appendChild(labelSpan);
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            doAction({ topicId, frame, button: btn, kind });
        });

        form.appendChild(btn);
        return form;
    }

    function injectInto(frame) {
        if (!frame || frame.querySelector(`[${MARKER}]`)) return;
        const entryId = entryIdOf(frame);
        const topicId = topicIdOf(frame);
        if (!entryId || !topicId) return;

        const seenForm = frame.querySelector('form[action*="attack_mode_seens"]');
        const group = seenForm && seenForm.parentElement;
        if (!group) return;

        group.appendChild(buildAction({
            entryId, topicId, frame,
            kind: 'paper', modifier: 'xpaper',
            label: 'Paper', hotkey: 'p', title: 'Move to Paper Trail',
        }));
        group.appendChild(buildAction({
            entryId, topicId, frame,
            kind: 'feed', modifier: 'xfeed',
            label: 'Feed', hotkey: 'f', title: 'Move to The Feed',
        }));
        group.appendChild(buildAction({
            entryId, topicId, frame,
            kind: 'trash', modifier: 'xtrash',
            label: 'Trash', hotkey: 't', title: 'Trash',
        }));
    }

    function onPowerThrough() {
        return location.pathname === POWER_THROUGH_PATH;
    }

    function scan() {
        if (!onPowerThrough()) return;
        injectStyle();
        document
            .querySelectorAll(`turbo-frame[id^="${FRAME_PREFIX}"]`)
            .forEach(injectInto);
    }

    scan();
    ['turbo:load', 'turbo:render', 'turbo:frame-load'].forEach(evt => {
        document.addEventListener(evt, scan);
    });

    new MutationObserver((muts) => {
        if (!onPowerThrough()) return;
        let needsScan = false;
        for (const m of muts) {
            for (const n of m.addedNodes) {
                if (n.nodeType !== 1) continue;
                if (n.matches?.(`turbo-frame[id^="${FRAME_PREFIX}"]`) ||
                    n.querySelector?.(`turbo-frame[id^="${FRAME_PREFIX}"]`)) {
                    needsScan = true;
                    break;
                }
            }
            if (needsScan) break;
        }
        if (needsScan) scan();
    }).observe(document.body, { childList: true, subtree: true });

    const KEYS = { t: 'trash', T: 'trash', f: 'feed', F: 'feed', p: 'paper', P: 'paper' };
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (!onPowerThrough()) return;
        const kind = KEYS[e.key];
        if (!kind) return;
        const t = e.target;
        if (!t) return;
        const tag = t.tagName || '';
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || t.isContentEditable) return;

        const frame = document.querySelector(`turbo-frame[id^="${FRAME_PREFIX}"]`);
        const btn = frame?.querySelector(`form[${MARKER}="${kind}"] button`);
        if (btn) {
            e.preventDefault();
            btn.click();
        }
    });
})();