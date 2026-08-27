const defaults = { showButton: true, autoPlay: true, audioPref: "auto", subPref: "auto" };
const showButton = document.getElementById("showButton");
const autoPlay = document.getElementById("autoPlay");
const audioPref = document.getElementById("audioPref");
const subPref = document.getElementById("subPref");
const status = document.getElementById("status");

function fillSelect(select, tracks, extras) {
  const current = select.value;
  select.innerHTML = "";
  extras.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    select.appendChild(option);
  });
  (tracks || []).forEach((track) => {
    if (!track || !track.code || extras.some((item) => item.value === track.code)) {
      return;
    }
    const option = document.createElement("option");
    option.value = track.code;
    option.textContent = track.name || track.code;
    select.appendChild(option);
  });
  if ([...select.options].some((item) => item.value === current)) {
    select.value = current;
  }
}

function applyTracks(result) {
  if (!result) {
    return;
  }
  fillSelect(audioPref, result.audioTracks, [
    { value: "auto", label: "Auto (YouTube selection)" },
    { value: "original", label: "Original" }
  ]);
  fillSelect(subPref, result.captionTracks, [
    { value: "auto", label: "Auto (YouTube selection)" },
    { value: "off", label: "Off" },
    { value: "original", label: "Original" }
  ]);
  chrome.storage.sync.get({ audioPref: "auto", subPref: "auto" }, (settings) => {
    if ([...audioPref.options].some((item) => item.value === settings.audioPref)) {
      audioPref.value = settings.audioPref;
    }
    if ([...subPref.options].some((item) => item.value === settings.subPref)) {
      subPref.value = settings.subPref;
    }
  });
}

function loadTracks() {
  chrome.tabs.query({ url: ["https://www.youtube.com/*", "https://www.youtube-nocookie.com/*"] }, (tabs) => {
    const tab = (tabs || []).find((item) => /[?&]v=|\/(live|embed|shorts|watch)\//.test(item.url || "")) || (tabs || [])[0];
    if (!tab || !tab.id) {
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "tracks" }, (result) => {
      if (chrome.runtime.lastError || !result) {
        return;
      }
      applyTracks(result);
    });
  });
}

chrome.storage.sync.get(defaults, (settings) => {
  showButton.checked = settings.showButton !== false;
  autoPlay.checked = settings.autoPlay !== false;
  audioPref.value = settings.audioPref || "auto";
  subPref.value = settings.subPref || "auto";
  loadTracks();
});

function save() {
  chrome.storage.sync.set({
    showButton: showButton.checked,
    autoPlay: autoPlay.checked,
    audioPref: audioPref.value || "auto",
    subPref: subPref.value || "auto"
  });
}

showButton.addEventListener("change", save);
autoPlay.addEventListener("change", save);
audioPref.addEventListener("change", save);
subPref.addEventListener("change", save);

document.getElementById("open").addEventListener("click", () => {
  status.textContent = "Opening…";
  chrome.runtime.sendMessage({ type: "open-active" }, (result) => {
    if (chrome.runtime.lastError) {
      status.textContent = "Could not reach the current tab.";
      return;
    }
    if (result && result.ok) {
      status.textContent = "Sent to GrokPlayer.";
      return;
    }
    status.textContent = result && result.reason === "not-youtube"
      ? "Open a YouTube video in this window first."
      : "No playable stream on the active tab.";
  });
});
