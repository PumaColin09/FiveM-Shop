const RESOURCE = GetParentResourceName ? GetParentResourceName() : 'dj_plus';

// UI wiring
const els = {
  panel: document.getElementById('panel'),
  url: document.getElementById('url'),
  loop: document.getElementById('loop'),
  play: document.getElementById('play'),
  stop: document.getElementById('stop'),
  close: document.getElementById('close'),
  volume: document.getElementById('volume'),
  volv: document.getElementById('volv'),
  radius: document.getElementById('radius'),
  radv: document.getElementById('radv'),
  audio: document.getElementById('audio'),
};

let ctx, gain, panner;
let hasSpeaker = false;
let current = { url: '', playing: false, radius: 30 };

function ensureAudioGraph() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaElementSource(els.audio);
    gain = ctx.createGain();
    panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.0;
    panner.maxDistance = 200.0;
    panner.rolloffFactor = 1.0;

    src.connect(panner);
    panner.connect(gain);
    gain.connect(ctx.destination);
  }
}

function nui(name, payload = {}) {
  fetch(`https://${RESOURCE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(payload)
  });
}

function setVisible(v) {
  document.body.style.display = v ? 'block' : 'none';
}

function setVolume(v) {
  els.volume.value = v;
  els.volv.textContent = v;
  nui('setVolume', { volume: Number(v) });
}

function setRadius(v) {
  els.radius.value = v;
  els.radv.textContent = v;
  nui('setRadius', { radius: Number(v) });
}

window.addEventListener('message', (e) => {
  const data = e.data || {};
  if (data.type === 'OPEN') {
    setVisible(true);
  } else if (data.type === 'STATE') {
    if (typeof data.url === 'string') els.url.value = data.url;
    if (typeof data.looped === 'boolean') els.loop.checked = data.looped;
    if (typeof data.volume === 'number') { els.volume.value = data.volume; els.volv.textContent = data.volume; }
    if (typeof data.radius === 'number') { els.radius.value = data.radius; els.radv.textContent = data.radius; }
    if (typeof data.hasSpeaker === 'boolean') hasSpeaker = data.hasSpeaker;
  } else if (data.type === 'PLAY') {
    ensureAudioGraph();
    current.url = data.url;
    current.radius = data.radius || 30;
    els.audio.src = current.url;
    els.audio.loop = !!data.looped;
    gain.gain.value = (data.volume ?? 60) / 100.0;
    els.audio.play().catch(()=>{});
    current.playing = true;
  } else if (data.type === 'STOP') {
    els.audio.pause();
    current.playing = false;
  } else if (data.type === 'POS') {
    // Update panner positions
    if (!panner) return;
    const L = data.listener;
    const S = data.source;
    if (!L || !S) return;
    const dx = S.x - L.x;
    const dy = S.y - L.y;
    const dz = S.z - L.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    const inRange = dist <= (current.radius || 30);
    if (!inRange) {
      gain.gain.value = 0.0;
      return;
    }
    // simple attenuation by distance within radius
    const base = Math.max(0, 1.0 - (dist / (current.radius || 30)));
    // volume already set by server; further scale by distance
    const volServer = Number(els.volume.value) / 100.0;
    gain.gain.value = base * volServer;

    // 3D positioning (NUI units are arbitrary; we pass world coords directly)
    try {
      panner.positionX.value = S.x;
      panner.positionY.value = S.y;
      panner.positionZ.value = S.z;
    } catch (e) {
      if (panner.setPosition) panner.setPosition(S.x, S.y, S.z);
    }
    try {
      // Listener at player
      if (ctx.listener.positionX) {
        ctx.listener.positionX.value = L.x;
        ctx.listener.positionY.value = L.y;
        ctx.listener.positionZ.value = L.z;
      } else if (ctx.listener.setPosition) {
        ctx.listener.setPosition(L.x, L.y, L.z);
      }
    } catch {}
  } else if (data.type === 'HAS_SPEAKER') {
    hasSpeaker = !!data.has;
  }
});

// Buttons
els.play.addEventListener('click', () => {
  if (!hasSpeaker) { flash('Bitte zuerst /djplace ausführen.'); return; }
  nui('play', { url: els.url.value.trim(), looped: els.loop.checked });
});
els.stop.addEventListener('click', () => nui('stop', {}));
els.close.addEventListener('click', () => { setVisible(false); nui('close', {}); });
els.volume.addEventListener('input', (e) => { els.volv.textContent = e.target.value; });
els.volume.addEventListener('change', (e) => setVolume(e.target.value));
els.radius.addEventListener('input', (e) => { els.radv.textContent = e.target.value; });
els.radius.addEventListener('change', (e) => setRadius(e.target.value));

function flash(msg) {
  const b = document.createElement('div');
  b.className = 'toast';
  b.textContent = msg;
  document.body.appendChild(b);
  setTimeout(() => b.classList.add('show'), 10);
  setTimeout(() => b.classList.remove('show'), 2200);
  setTimeout(() => b.remove(), 2800);
}

// Start hidden
setVisible(false);
