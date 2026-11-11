const processForm = document.querySelector('#process-form');
const videoUrlInput = document.querySelector('#video-url');
const processButton = document.querySelector('#process-button');
const statusMessage = document.querySelector('#status');
const workspace = document.querySelector('#workspace');
const videoFrame = document.querySelector('#video-frame');
const playerMessage = document.querySelector('#player-message');
const playerErrorText = document.querySelector('#player-error-text');
const playerFallbackLink = document.querySelector('#player-fallback-link');
const videoInfo = document.querySelector('#video-info');
const segmentsContainer = document.querySelector('#segments');
const segmentCount = document.querySelector('#segment-count');
const saveState = document.querySelector('#save-state');
const downloadLink = document.querySelector('#download-link');
const libraryList = document.querySelector('#library-list');
const libraryCount = document.querySelector('#library-count');
const emptyLibrary = document.querySelector('#empty-library');
const languagePicker = document.querySelector('#language-picker');
const languageSelect = document.querySelector('#language-select');
const languageNote = document.querySelector('#language-note');
const audioAuthorized = document.querySelector('#audio-authorized');
const alignButton = document.querySelector('#align-button');
const alignmentProgress = document.querySelector('#alignment-progress');
const alignmentMessage = document.querySelector('#alignment-message');
const alignmentPercent = document.querySelector('#alignment-percent');
const alignmentBar = document.querySelector('#alignment-bar');
const timelineViewport = document.querySelector('#timeline-viewport');
const timelineCanvas = document.querySelector('#timeline-canvas');
const timelineRuler = document.querySelector('#timeline-ruler');
const timelineLane = document.querySelector('#timeline-lane');
const timelinePlayhead = document.querySelector('#timeline-playhead');
const timelineDuration = document.querySelector('#timeline-duration');

let activeTranscript = null;
let languageDiscovery = null;
let youtubePlayer = null;
let youtubeApiPromise = null;
let playerVideoId = null;
let playerLoadTimer = null;
let playbackCheckTimer = null;
let activeSegmentIndex = null;
let timelineDrag = null;
const saveTimers = new Map();
let saveQueue = Promise.resolve();

const PLAYBACK_POLL_MS = 100;
const PIXELS_PER_SECOND = 12;
const MAX_TIMELINE_WIDTH = 16000;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Terjadi kesalahan.');
  return data;
}

function setStatus(message = '', isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle('error', isError);
}

function ensureYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        previousCallback?.();
      } finally {
        resolve();
      }
    };
    let script = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.append(script);
    }
    script.addEventListener('error', () => {
      youtubeApiPromise = null;
      reject(new Error('YouTube IFrame API gagal dimuat. Periksa koneksi internet atau pemblokir konten.'));
    }, { once: true });
  });
  return youtubeApiPromise;
}

async function loadVideoPlayer(videoId) {
  try {
    await ensureYouTubeApi();
    playerMessage.classList.add('hidden');
    if (youtubePlayer && playerVideoId !== videoId) {
      playerVideoId = videoId;
      youtubePlayer.cueVideoById({ videoId, startSeconds: 0 });
      return;
    }
    if (youtubePlayer) {
      youtubePlayer.cueVideoById({ videoId, startSeconds: 0 });
      return;
    }

    playerVideoId = videoId;
    const embedUrl = new URL(`https://www.youtube.com/embed/${encodeURIComponent(videoId)}`);
    embedUrl.searchParams.set('enablejsapi', '1');
    embedUrl.searchParams.set('playsinline', '1');
    embedUrl.searchParams.set('origin', window.location.origin);
    embedUrl.searchParams.set('rel', '0');
    videoFrame.src = embedUrl.toString();
    youtubePlayer = new window.YT.Player(videoFrame, {
      playerVars: {
        playsinline: 1,
        enablejsapi: 1,
        origin: window.location.origin,
        rel: 0,
      },
      events: {
        onReady: (event) => {
          const duration = event.target.getDuration();
          updateVideoDuration(duration);
          if (!duration) {
            clearTimeout(playerLoadTimer);
            playerLoadTimer = setTimeout(() => {
              if (activeTranscript?.videoId !== videoId || !youtubePlayer) return;
              if (!youtubePlayer.getDuration()) {
                showPlayerError(
                  'Browser tidak dapat memuat media video YouTube. Coba Chrome/Edge terbaru atau buka videonya langsung.',
                  videoId,
                );
              }
            }, 8000);
          }
        },
        onStateChange: (event) => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            clearTimeout(playerLoadTimer);
            clearTimeout(playbackCheckTimer);
            updateVideoDuration(event.target.getDuration());
            playerMessage.classList.add('hidden');
          }
        },
        onError: (event) => {
          clearTimeout(playerLoadTimer);
          const messages = {
            2: 'ID video tidak valid.',
            5: 'Browser tidak mendukung format video ini.',
            100: 'Video tidak ditemukan, dihapus, atau bersifat privat.',
            101: 'Pemilik video tidak mengizinkan pemutaran embed.',
            150: 'Pemilik video tidak mengizinkan pemutaran embed.',
            153: 'YouTube tidak menerima referer pemutar. Coba buka video langsung di YouTube.',
          };
          showPlayerError(
            messages[event.data] || `Pemutar YouTube gagal (kode ${event.data}).`,
            videoId,
          );
        },
      },
    });
  } catch (error) {
    showPlayerError(error.message, videoId);
  }
}

function showPlayerError(message, videoId) {
  clearTimeout(playerLoadTimer);
  clearTimeout(playbackCheckTimer);
  playerErrorText.textContent = message;
  playerFallbackLink.href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  playerMessage.classList.remove('hidden');
  setStatus(message, true);
}

function updateVideoDuration(duration) {
  if (!activeTranscript || !Number.isFinite(duration) || duration <= 0) return;
  const roundedDuration = Math.round(duration * 1000) / 1000;
  if (Math.abs((activeTranscript.duration || 0) - roundedDuration) < 0.5) return;
  activeTranscript.duration = roundedDuration;
  renderTimeline(activeTranscript);
  queueSave(activeTranscript);
}

function selectSegment(index, play = true) {
  if (!activeTranscript?.segments[index]) return;
  activeSegmentIndex = index;
  segmentsContainer.querySelectorAll('.segment').forEach((row, rowIndex) => {
    row.classList.toggle('selected', rowIndex === index);
  });
  timelineLane.querySelectorAll('.timeline-clip').forEach((clip, clipIndex) => {
    clip.classList.toggle('selected', clipIndex === index);
  });
  const clip = timelineLane.querySelector(`[data-index="${index}"]`);
  if (clip) {
    const clipStart = clip.offsetLeft;
    const clipEnd = clipStart + clip.offsetWidth;
    if (clipStart < timelineViewport.scrollLeft) {
      timelineViewport.scrollTo({ left: clipStart, behavior: 'smooth' });
    } else if (clipEnd > timelineViewport.scrollLeft + timelineViewport.clientWidth) {
      timelineViewport.scrollTo({ left: clipEnd - timelineViewport.clientWidth, behavior: 'smooth' });
    }
  }

  if (play && youtubePlayer?.seekTo) {
    const segment = activeTranscript.segments[index];
    youtubePlayer.seekTo(segment.start, true);
    youtubePlayer.playVideo();
    clearTimeout(playbackCheckTimer);
    playbackCheckTimer = setTimeout(() => {
      if (activeTranscript?.videoId !== playerVideoId) return;
      const state = youtubePlayer.getPlayerState();
      if (state !== window.YT.PlayerState.PLAYING && state !== window.YT.PlayerState.BUFFERING) {
        showPlayerError(
          'Pemutar tidak mulai. Video mungkin membatasi embed atau browser tidak mendukung formatnya.',
          activeTranscript.videoId,
        );
      }
    }, 5000);
  }
}

function updatePlayback() {
  if (!youtubePlayer?.getCurrentTime || !activeTranscript) return;
  const currentTime = youtubePlayer.getCurrentTime();
  const duration = activeTranscript.duration || 1;
  const canvasWidth = timelineCanvas.clientWidth;
  timelinePlayhead.style.left = `${Math.max(0, Math.min(currentTime / duration, 1)) * canvasWidth}px`;

  if (activeSegmentIndex === null) return;
  const segment = activeTranscript.segments[activeSegmentIndex];
  if (segment && currentTime >= segment.end - 0.08) {
    youtubePlayer.seekTo(segment.start, true);
    youtubePlayer.playVideo();
  }
}

function renderVideoInfo(transcript) {
  const captionType = transcript.language.isAutoGenerated ? 'Caption otomatis' : 'Caption manual';
  videoInfo.innerHTML = `
    <h3>${escapeHtml(transcript.title)}</h3>
    <div class="video-meta">
      <span class="meta-pill">${escapeHtml(transcript.language.name)} · ${escapeHtml(transcript.language.code)}</span>
      <span class="meta-pill ${transcript.language.isAutoGenerated ? 'auto' : ''}">${captionType}</span>
      <a class="video-url" href="${escapeHtml(transcript.url)}" target="_blank" rel="noreferrer">Buka video ↗</a>
    </div>`;
}

function renderSegments(transcript) {
  segmentsContainer.replaceChildren();
  const itemName = transcript.granularity === 'word' ? 'kata' : 'segmen caption';
  segmentCount.textContent = `${transcript.segments.length.toLocaleString('id-ID')} ${itemName}`;
  const fragment = document.createDocumentFragment();

  transcript.segments.forEach((segment, index) => {
    const row = document.createElement('article');
    row.className = `segment${activeSegmentIndex === index ? ' selected' : ''}`;
    row.innerHTML = `
      <div class="segment-times">${formatTime(segment.start)} — ${formatTime(segment.end)}</div>
      <div class="segment-text" contenteditable="true" role="textbox" aria-label="Edit teks segmen ${index + 1}" spellcheck="false">${escapeHtml(segment.text)}</div>`;
    row.addEventListener('click', () => selectSegment(index));
    const text = row.querySelector('.segment-text');
    text.addEventListener('click', () => selectSegment(index));
    text.addEventListener('input', () => {
      transcript.segments[index].text = text.textContent;
      const clipLabel = timelineLane.querySelector(`[data-index="${index}"] .clip-label`);
      if (clipLabel) clipLabel.textContent = text.textContent;
      saveState.textContent = 'Belum disimpan';
      saveState.classList.remove('saved');
    });
    text.addEventListener('focusout', () => {
      transcript.segments[index].text = text.textContent;
      queueSave(transcript);
    });
    fragment.append(row);
  });
  segmentsContainer.append(fragment);
}

function renderTranscript(transcript) {
  activeTranscript = transcript;
  activeSegmentIndex = null;
  transcript.duration = Number(transcript.duration) || Math.max(...transcript.segments.map((segment) => segment.end), 1);
  workspace.classList.remove('hidden');
  renderVideoInfo(transcript);
  renderSegments(transcript);
  renderTimeline(transcript);
  alignButton.textContent = transcript.granularity === 'word'
    ? 'Hitung ulang timestamp kata'
    : 'Buat timestamp per kata';
  alignmentProgress.classList.add('hidden');
  downloadLink.href = `/api/transcripts/${encodeURIComponent(transcript.videoId)}/download`;
  saveState.textContent = '';
  saveState.classList.remove('saved');
  loadVideoPlayer(transcript.videoId).catch((error) => setStatus(error.message, true));
  workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
  refreshLibrary();
}

function showAlignmentProgress(progress, message) {
  const value = Math.max(0, Math.min(100, Math.round(progress)));
  alignmentProgress.classList.remove('hidden');
  alignmentBar.value = value;
  alignmentPercent.textContent = `${value}%`;
  alignmentMessage.textContent = message;
}

async function startWordAlignment(videoId, authorized = false) {
  if (!authorized && !window.confirm('Proses audio hanya untuk video yang Anda miliki atau berizin untuk diproses. Lanjutkan?')) {
    return;
  }

  alignButton.disabled = true;
  showAlignmentProgress(0, 'Memulai penyelarasan kata...');
  try {
    const { jobId } = await requestJson(`/api/transcripts/${encodeURIComponent(videoId)}/align-words`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorized: true }),
    });

    while (true) {
      const job = await requestJson(`/api/jobs/${encodeURIComponent(jobId)}`);
      showAlignmentProgress(job.progress, job.message);
      if (job.state === 'completed') {
        const transcript = await requestJson(`/api/transcripts/${encodeURIComponent(videoId)}`);
        if (activeTranscript?.videoId === videoId) renderTranscript(transcript);
        showAlignmentProgress(100, job.message);
        setStatus(`${job.message} Timestamp kata tersimpan di JSON.`);
        return;
      }
      if (job.state === 'failed') {
        throw new Error(job.error || job.message || 'Penyelarasan kata gagal.');
      }
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
  } catch (error) {
    alignmentMessage.textContent = error.message;
    alignmentProgress.classList.remove('hidden');
    setStatus(error.message, true);
  } finally {
    alignButton.disabled = false;
  }
}

alignButton.addEventListener('click', () => {
  if (!activeTranscript) return;
  startWordAlignment(activeTranscript.videoId);
});

function renderTimeline(transcript) {
  const duration = Math.max(Number(transcript.duration) || 0, 1);
  const viewportWidth = timelineViewport.clientWidth || 700;
  const canvasWidth = Math.max(viewportWidth, Math.min(duration * PIXELS_PER_SECOND, MAX_TIMELINE_WIDTH));
  const scale = canvasWidth / duration;
  timelineCanvas.style.width = `${canvasWidth}px`;
  timelineDuration.textContent = `Durasi video · ${formatTime(duration)}`;
  timelineRuler.replaceChildren();
  timelineLane.replaceChildren();

  const tickOptions = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  const tickStep = tickOptions.find((step) => duration / step <= 12) || 3600;
  for (let seconds = 0; seconds <= duration; seconds += tickStep) {
    const tick = document.createElement('span');
    tick.className = 'timeline-tick';
    tick.style.left = `${seconds * scale}px`;
    tick.textContent = formatTime(seconds);
    timelineRuler.append(tick);
  }

  timelineLane.style.backgroundSize = `${tickStep * scale}px 100%`;
  transcript.segments.forEach((segment, index) => {
    const clip = document.createElement('div');
    const start = Math.max(0, Math.min(segment.start, duration));
    const end = Math.max(start, Math.min(segment.end, duration));
    clip.className = `timeline-clip${activeSegmentIndex === index ? ' selected' : ''}`;
    clip.dataset.index = String(index);
    clip.style.left = `${start * scale}px`;
    clip.style.width = `${Math.max((end - start) * scale, 1)}px`;
    clip.title = `${formatTime(segment.start)} – ${formatTime(segment.end)} · ${segment.text}`;
    clip.innerHTML = `
      <button type="button" class="clip-handle start" aria-label="Ubah waktu mulai segmen ${index + 1}"></button>
      <span class="clip-label">${escapeHtml(segment.text)}</span>
      <button type="button" class="clip-handle end" aria-label="Ubah waktu akhir segmen ${index + 1}"></button>`;
    clip.addEventListener('pointerdown', (event) => startTimelineDrag(event, index, clip, scale));
    clip.querySelectorAll('.clip-handle').forEach((handle) => {
      handle.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        startTimelineDrag(event, index, clip, scale, handle.classList.contains('start') ? 'start' : 'end');
      });
    });
    timelineLane.append(clip);
  });
  timelinePlayhead.style.left = `${0}px`;
}

function startTimelineDrag(event, index, clip, scale, edge = null) {
  if (event.button !== 0) return;
  event.preventDefault();
  selectSegment(index);
  timelineDrag = {
    index,
    mode: edge || 'move',
    pointerX: event.clientX,
    start: activeTranscript.segments[index].start,
    end: activeTranscript.segments[index].end,
    scale,
  };
  clip.setPointerCapture?.(event.pointerId);
}

function moveTimelineDrag(event) {
  if (!timelineDrag || !activeTranscript) return;
  const drag = timelineDrag;
  const segment = activeTranscript.segments[drag.index];
  const delta = (event.clientX - drag.pointerX) / drag.scale;
  const duration = activeTranscript.duration;
  if (drag.mode === 'move') {
    const start = Math.max(0, Math.min(duration - (drag.end - drag.start), drag.start + delta));
    segment.start = Number(start.toFixed(3));
    segment.end = Number((start + drag.end - drag.start).toFixed(3));
  } else if (drag.mode === 'start') {
    segment.start = Number(Math.max(0, Math.min(drag.end - 0.05, drag.start + delta)).toFixed(3));
  } else {
    segment.end = Number(Math.min(duration, Math.max(drag.start + 0.05, drag.end + delta)).toFixed(3));
  }
  updateTimelineSegment(drag.index);
  saveState.textContent = 'Belum disimpan';
  saveState.classList.remove('saved');
}

function updateTimelineSegment(index) {
  if (!activeTranscript) return;
  const segment = activeTranscript.segments[index];
  const duration = activeTranscript.duration || 1;
  const canvasWidth = timelineCanvas.clientWidth;
  const clip = timelineLane.querySelector(`[data-index="${index}"]`);
  const row = segmentsContainer.querySelectorAll('.segment')[index];
  if (!clip || !row) return;
  clip.style.left = `${segment.start / duration * canvasWidth}px`;
  clip.style.width = `${Math.max((segment.end - segment.start) / duration * canvasWidth, 1)}px`;
  clip.title = `${formatTime(segment.start)} – ${formatTime(segment.end)} · ${segment.text}`;
  row.querySelector('.segment-times').textContent = `${formatTime(segment.start)} — ${formatTime(segment.end)}`;
}

function finishTimelineDrag() {
  if (!timelineDrag) return;
  timelineDrag = null;
  if (activeTranscript) queueSave(activeTranscript);
}

timelineLane.addEventListener('click', (event) => {
  if (!activeTranscript || event.target.closest('.timeline-clip')) return;
  const bounds = timelineLane.getBoundingClientRect();
  const position = event.clientX - bounds.left;
  const seconds = position / timelineCanvas.clientWidth * activeTranscript.duration;
  activeSegmentIndex = null;
  segmentsContainer.querySelectorAll('.segment').forEach((row) => row.classList.remove('selected'));
  timelineLane.querySelectorAll('.timeline-clip').forEach((clip) => clip.classList.remove('selected'));
  if (youtubePlayer?.seekTo) {
    youtubePlayer.seekTo(seconds, true);
    youtubePlayer.playVideo();
  }
});

window.addEventListener('pointermove', moveTimelineDrag);
window.addEventListener('pointerup', finishTimelineDrag);
window.addEventListener('resize', () => {
  if (activeTranscript) renderTimeline(activeTranscript);
});
setInterval(updatePlayback, PLAYBACK_POLL_MS);

function queueSave(transcript) {
  saveState.textContent = 'Belum disimpan';
  saveState.classList.remove('saved');
  const { videoId } = transcript;
  clearTimeout(saveTimers.get(videoId));
  saveTimers.set(videoId, setTimeout(() => {
    saveTimers.delete(videoId);
    saveTimings(transcript);
  }, 250));
}

function saveTimings(transcript) {
  const videoId = transcript.videoId;
  const payload = {
    duration: transcript.duration,
    segments: transcript.segments.map(({ start, end, text }) => ({ start, end, text })),
  };
  saveQueue = saveQueue
    .catch(() => {})
    .then(() => requestJson(`/api/transcripts/${encodeURIComponent(videoId)}/timings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }))
    .then(() => {
      if (activeTranscript?.videoId === videoId) {
        saveState.textContent = 'Tersimpan';
        saveState.classList.add('saved');
      }
      refreshLibrary();
    })
    .catch((error) => {
      if (activeTranscript?.videoId === videoId) {
        saveState.textContent = 'Gagal menyimpan';
        saveState.classList.remove('saved');
        setStatus(error.message, true);
      }
    });
}

async function refreshLibrary() {
  try {
    const transcripts = await requestJson('/api/transcripts');
    libraryList.replaceChildren();
    libraryCount.textContent = `${transcripts.length} video`;
    emptyLibrary.classList.toggle('hidden', transcripts.length > 0);

    for (const transcript of transcripts) {
      const card = document.createElement('article');
      card.className = `library-card${activeTranscript?.videoId === transcript.videoId ? ' active' : ''}`;
      card.innerHTML = `
        <button type="button" class="library-open" aria-label="Buka ${escapeHtml(transcript.title)}">
          <img src="${escapeHtml(transcript.thumbnailUrl)}" alt="" loading="lazy" />
          <div class="card-content">
            <div class="card-title">${escapeHtml(transcript.title)}</div>
            <div class="card-meta">
              <span>${escapeHtml(transcript.language.name)}</span>
              <span>${transcript.language.isAutoGenerated ? 'Otomatis' : 'Manual'}</span>
            </div>
          </div>
        </button>
        <div class="card-actions">
          <button type="button" class="delete-button">Hapus JSON</button>
        </div>`;
      card.querySelector('.library-open').addEventListener('click', async () => {
        try {
          const fullTranscript = await requestJson(`/api/transcripts/${encodeURIComponent(transcript.videoId)}`);
          renderTranscript(fullTranscript);
          setStatus('');
        } catch (error) {
          setStatus(error.message, true);
        }
      });
      card.querySelector('.delete-button').addEventListener('click', async () => {
        if (!window.confirm(`Hapus JSON transkrip "${transcript.title}" dari folder transcripts?`)) return;
        try {
          clearTimeout(saveTimers.get(transcript.videoId));
          saveTimers.delete(transcript.videoId);
          await requestJson(`/api/transcripts/${encodeURIComponent(transcript.videoId)}`, { method: 'DELETE' });
          if (activeTranscript?.videoId === transcript.videoId) {
            activeTranscript = null;
            activeSegmentIndex = null;
            workspace.classList.add('hidden');
            youtubePlayer?.stopVideo();
          }
          setStatus('File JSON transkrip berhasil dihapus.');
          await refreshLibrary();
        } catch (error) {
          setStatus(error.message, true);
        }
      });
      libraryList.append(card);
    }
  } catch (error) {
    setStatus(error.message, true);
  }
}

function showLanguageChoices(discovery, url) {
  languageDiscovery = { ...discovery, url };
  languageSelect.replaceChildren();
  for (const language of discovery.languages) {
    const option = document.createElement('option');
    option.value = language.languageCode;
    const flags = [
      language.isDefault ? 'bahasa utama video' : '',
      language.isAutoGenerated ? 'otomatis' : 'manual',
    ].filter(Boolean);
    option.textContent = `${language.languageName} (${language.languageCode}) · ${flags.join(', ')}`;
    languageSelect.append(option);
  }
  languageSelect.value = discovery.recommendedLanguage.languageCode;
  languageNote.textContent = {
    'video-default': 'Dipilih dari caption default yang dikaitkan YouTube dengan video.',
    'english-fallback': 'Bahasa audio tidak terdeteksi; bahasa Inggris dipilih sebagai fallback.',
    'first-available': 'Bahasa audio tidak terdeteksi dan caption Inggris tidak ada; pilihan pertama digunakan.',
  }[discovery.recommendation];
  languagePicker.classList.remove('hidden');
}

videoUrlInput.addEventListener('input', () => {
  languageDiscovery = null;
  audioAuthorized.checked = false;
  languagePicker.classList.add('hidden');
  processButton.querySelector('span:first-child').textContent = 'Cari bahasa';
});

processForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = videoUrlInput.value.trim();
  const canProcess = languageDiscovery?.url === url;
  processButton.disabled = true;
  processButton.querySelector('span:first-child').textContent = canProcess ? 'Mengambil...' : 'Mencari...';
  setStatus(canProcess ? 'Sedang mengambil transkrip dalam bahasa yang dipilih...' : 'Sedang mencari caption yang tersedia...');

  try {
    if (!canProcess) {
      const discovery = await requestJson('/api/languages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      showLanguageChoices(discovery, url);
      processButton.querySelector('span:first-child').textContent = 'Ambil transkrip';
      setStatus(`Ditemukan ${discovery.languages.length} bahasa caption. Periksa pilihannya, lalu tekan Ambil transkrip.`);
      return;
    }

    if (!audioAuthorized.checked) {
      setStatus('Centang konfirmasi kepemilikan/izin audio sebelum memproses video.', true);
      return;
    }

    const transcript = await requestJson('/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, languageCode: languageSelect.value }),
    });
    renderTranscript(transcript);
    setStatus(`Caption ${transcript.language.name} siap. Mengunduh audio saja dan membuat timestamp kata...`);
    await startWordAlignment(transcript.videoId, true);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    processButton.disabled = false;
    processButton.querySelector('span:first-child').textContent =
      languageDiscovery?.url === url ? 'Ambil transkrip' : 'Cari bahasa';
  }
});

refreshLibrary();
