# GrokPlayer Chrome extension

Sends the current tab’s VOD or live stream to the Windows player. Manifest V3, version **1.10.20**.

The player is a separate repository: [grokplayer](https://github.com/EmirEvcil/grokplayer). TV client: [grokplayer-tv](https://github.com/EmirEvcil/grokplayer-tv).

## Features

### Open in GrokPlayer
- On-page chip on the video player when a stream is detected
- Toolbar popup **Open in GrokPlayer**
- Settings page **Open in GrokPlayer**
- First click may ask Windows to allow the `grokplayer:` protocol
- If the player is closed, Windows launches it; the stream joins **Playlist → Stream**
- Optional auto-play (otherwise it only adds to the playlist)
- Chip **×** hides it for the current video; it returns on the next one
- Master toggle: extension on/off

### Sites
- YouTube watch and live (including youtube-nocookie)
- Kick, Twitch, Rumble, TikTok, Dailymotion / dai.ly, Instagram
- Any other page: sniffs HLS, DASH, and progressive media in the page (all frames)

### What is sent
- Playable URL when the page exposes one (HLS / DASH / progressive)
- Otherwise the watch/page URL; GrokPlayer resolves it
- Title, live vs VOD
- Referer / user agent when needed
- Current YouTube player height (quality used for playback and download)
- Caption URL and caption track list (VTT / SRT / ASS / TTML / DFXP, timedtext)
- Preview / storyboard VTT when present (for seek thumbnails in the player)
- Prefers the tab’s actually playing media over ads, bumpers, clips, and short teasers
- Does not treat CDN hosts (e.g. `cdndirector.dailymotion.com`) as catalog pages, so playback query strings stay intact

### YouTube preferences
- **Dubbing:** Auto (YouTube menu) or Original. Missing dub falls back to original audio.
- **Subtitles:** Auto, Off, or Original. Missing track falls back to original captions.
- These apply to YouTube only.

### Settings
- Show the on-page button
- Play immediately vs add-only
- YouTube dubbing and subtitle defaults
- Same prefs in the popup

## Load

1. Start GrokPlayer once so it registers the `grokplayer:` protocol (`tools/publish.ps1` on the player repo).
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → this folder.
3. Open a YouTube watch/live page or any site with a video. The chip sits on the player.
4. The first click may ask Windows to open GrokPlayer. Allow it.
