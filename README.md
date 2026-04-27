# Tampermonkey User Scripts

![Tampermonkey](https://img.shields.io/badge/tampermonkey-%2300485B.svg?style=for-the-badge&logo=tampermonkey&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)

A collection of user scripts for [Tampermonkey](https://www.tampermonkey.net/) to enhance your browsing experience.

## Table of Contents

| # | Script | Target |
|---|--------|--------|
| 1 | [LinkedIn - Hide Promoted Posts](#-linkedin---hide-promoted-posts--hide-games-toggle-counter) | ![LinkedIn](https://img.shields.io/badge/linkedin-%230077B5.svg?style=flat-square&logo=linkedin&logoColor=white) |
| 2 | [AdMob GBP to EUR Converter](#-admob-gbp-to-eur-converter-with-percentage-improvement) | ![Google AdMob](https://img.shields.io/badge/admob-EA4335?style=flat-square&logo=google-admob&logoColor=white) |
| 3 | [YouTube - Hide Shorts](#-youtube---hide-shorts-everywhere) | ![YouTube](https://img.shields.io/badge/youtube-%23FF0000.svg?style=flat-square&logo=youtube&logoColor=white) |
| 4 | [GitHub Issues Kanban](#-github-issues-kanban-read-only) | ![GitHub](https://img.shields.io/badge/github-%23121011.svg?style=flat-square&logo=github&logoColor=white) |
| 5 | [Giphy GIF Downloader](#-giphy-gif-downloader) | ![Giphy](https://img.shields.io/badge/giphy-FF6666?style=flat-square&logo=giphy&logoColor=white) |

---

## Scripts

### ![LinkedIn](https://img.shields.io/badge/linkedin-%230077B5.svg?style=flat-square&logo=linkedin&logoColor=white) LinkedIn - Hide Promoted Posts (+ Hide Games, Toggle, Counter)
**File:** `linkedin.js`
**Version:** 1.3.1
**Match:** `https://www.linkedin.com/*`
**Description:** Hides promoted posts and the "Today's puzzle games" box on LinkedIn, with toggle (H key) and counter.

**Features:**
- Automatically hides sponsored/promoted posts
- Hides the "Today's puzzle games" module
- Press `H` key to toggle visibility of hidden content
- Displays a counter badge showing how many sponsored posts were hidden
- Persists toggle state in localStorage
- Whitelist support for specific companies

---

### ![Google AdMob](https://img.shields.io/badge/admob-EA4335?style=flat-square&logo=google-admob&logoColor=white) AdMob GBP to EUR Converter with Percentage Improvement
**File:** `admob-gbp-to-eur.js`
**Version:** 1.1.0
**Match:** `https://admob.google.com/*`
**Description:** Converts all British Pound (£) amounts to Euro (€) on AdMob dashboard using current exchange rate and displays month-over-month percentage improvements

**Features:**
- Automatically converts all £ amounts to € on AdMob pages
- Fetches current GBP to EUR exchange rate from API
- Caches exchange rate for 24 hours to reduce API calls
- Updates dynamically as page content changes
- Handles various formats (£1.23, £1,234.56, GBP 1.23, etc.)
- Calculates and displays percentage improvement from last month to this month
- Shows percentage change as a colored badge (green for positive, red for negative)
- Preserves page structure and functionality

---

### ![YouTube](https://img.shields.io/badge/youtube-%23FF0000.svg?style=flat-square&logo=youtube&logoColor=white) YouTube - Hide Shorts Everywhere
**File:** `youtube-hide-shorts.js`
**Version:** 1.0.0
**Match:** `https://www.youtube.com/*`
**Description:** Hides all Shorts surfaces on YouTube desktop web (home, search, subscriptions, channels, and guide)

**Features:**
- Hides Shorts shelves and carousels
- Hides Shorts videos in grids and lists
- Hides Shorts guide entries, sidebar link, and channel tabs
- Handles dynamic SPA updates

---

### ![GitHub](https://img.shields.io/badge/github-%23121011.svg?style=flat-square&logo=github&logoColor=white) GitHub Issues Kanban (read-only)
**File:** `github-kamban.js`
**Version:** 0.3.0
**Match:** `https://github.com/*/*/issues*`
**Description:** Read-only Kanban board for GitHub Issues, driven by labels. No API keys required. Cards are links — edit labels on GitHub itself.

**Features:**
- Renders a full Kanban board directly on the GitHub Issues page
- Six columns: Backlog, Ready, In Progress, Review, Blocked, Done
- Classifies issues by `status:*` labels (also recognizes `state:*`, bare names like `wip`, `todo`, etc.)
- Closed issues automatically go to the Done column
- Toggle between Board and List view via toolbar button
- Onboarding dialog detects missing labels and offers one-click `gh` CLI commands to create them
- Shadow DOM isolation — no style conflicts with GitHub
- Survives GitHub SPA navigation (Turbo events, URL polling, MutationObserver)
- Diagnose menu command for troubleshooting
- Dismiss onboarding per-repo (persisted via `GM_setValue`)

**Required labels** (the onboarding dialog helps you create these):

| Label | Color | Description |
|-------|-------|-------------|
| `status:backlog` | `#ededed` | Triaged, not scheduled |
| `status:ready` | `#0e8a16` | Ready to pick up |
| `status:in-progress` | `#fbca04` | Actively being worked on |
| `status:review` | `#5319e7` | PR open, awaiting review |
| `status:blocked` | `#b60205` | Blocked, needs unsticking |

---

### ![Giphy](https://img.shields.io/badge/giphy-FF6666?style=flat-square&logo=giphy&logoColor=white) Giphy GIF Downloader
**File:** `giphy-downloader.js`
**Version:** 1.5
**Match:** `https://giphy.com/gifs/*`, `https://giphy.com/stickers/*`
**Description:** Download GIFs from Giphy without registration (direct download, size selector, no WebP)

**Features:**
- Download original animated GIF files (largest available size)
- Download high-quality MP4 videos
- No registration required
- Automatically detects GIF ID from URL
- Smart URL resolution from Next.js data, meta tags, and page images
- Beautiful UI with download buttons (GIF and MP4)
- Notification system for download status
- Works with both GIFs and Stickers

---

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension for your browser
2. Open the Tampermonkey dashboard
3. Create a new script
4. Copy and paste the contents of the desired script file
5. Save the script

## Usage

After installation, scripts will automatically run on their target websites. Check individual script files for specific features and keyboard shortcuts.

## Contributing

Feel free to add more scripts or improve existing ones!
