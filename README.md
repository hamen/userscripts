# Tampermonkey User Scripts

A collection of user scripts for Tampermonkey to enhance your browsing experience.

## Scripts

### LinkedIn - Hide Promoted Posts (+ Hide Games, Toggle, Counter)
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

### Giphy GIF Downloader
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

**Installation:**
1. Install [Tampermonkey](https://www.tampermonkey.net/) extension
2. Open Tampermonkey dashboard
3. Create a new script
4. Copy and paste the contents of the desired script file
5. Save the script

## Usage

After installation, scripts will automatically run on their target websites. Check individual script files for specific features and keyboard shortcuts.

## Contributing

Feel free to add more scripts or improve existing ones!

