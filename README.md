# GrokPlayer Chrome extension

Stage 1: YouTube VOD and live. The player is in a separate repository: [grokplayer](https://github.com/EmirEvcil/grokplayer).

## Load

1. Start GrokPlayer once so it registers the `grokplayer:` protocol.
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → this `extension` folder.
3. Open a YouTube watch or live page. The **Open in GrokPlayer** chip sits on the player.
4. The first click may ask Windows to open GrokPlayer. Allow it.

## Behavior

- Detects the current YouTube video and whether it is live.
- Sends a playable URL when the page exposes one (HLS / DASH / progressive). Otherwise it sends the watch URL and GrokPlayer resolves it.
- If GrokPlayer is closed, Windows launches it. The stream is added to **Playlist → Stream** and that tab is selected.
- The chip’s **×** hides it for the current video. It returns on the next video.
- Popup and Settings both have **Open in GrokPlayer**.
- **YouTube dubbing** and **YouTube subtitles** preferences apply to YouTube only. Auto uses the YouTube menu, or pick Original / a language / Off. If that track is missing, GrokPlayer uses the original audio and captions.
- Playback and download of a YouTube stream use the quality selected on YouTube (the current player height).
