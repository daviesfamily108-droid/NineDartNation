// --- NDN Mobile Camera external JS ---
(function(){
    // Show current date in the visible test message
    document.getElementById('date-now').textContent = new Date().toLocaleString();
    document.getElementById('fatal-error').textContent = 'Diagnostics: JS loaded at ' + new Date().toLocaleString();

    const params = new URLSearchParams(location.search);
    const input = document.getElementById('code');
    const joinBtn = document.getElementById('join');
    const enableBtn = document.getElementById('enable');
    const swapBtn = document.getElementById('swap');
    const stopBtn = document.getElementById('stop');
    const deviceSelect = document.getElementById('deviceSelect');
    const v = document.getElementById('v');
    const msg = document.getElementById('msg');
    input.value = (params.get('code') || '').toUpperCase().slice(0, 8);

    let stream = null;
    let pc = null;
    let ws = null;
    let usingPolling = false;
    let lastFacing = 'environment';
    let deviceId = null;
    let devicesList = [];
    const wsStatus = document.getElementById('wsStatus');
    const sendDiagBtn = document.getElementById('sendDiag');
    const dumpDiagBtn = document.getElementById('dumpDiag');
    const downloadDiagBtn = document.getElementById('downloadDiag');
    const diagOut = document.getElementById('diagOut');

    function wsUrl() {
        const serverParam = params.get('server') || params.get('ws');
        if (serverParam) {
            try {
                const url = new URL(serverParam);
                const proto = url.protocol === 'https:' ? 'wss' : 'ws';
                return `${proto}://${url.host}/ws`;
            } catch (e) { console.warn('Invalid server param', e); }
        }
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        const fallbackHost = 'ninedartnation.onrender.com';
        let host = location.host && location.host !== '' ? location.host : fallbackHost;
        if (!location.host.includes('render') && location.hostname !== 'ninedartnation.onrender.com') {
            host = fallbackHost;
        }
        let base = `${proto}://${host}/ws`;
        return base;
    }

    function sendDiagnostic(msg, details) {
        try {
            const payload = { type: 'cam-diagnostic', code: input.value || '', msg, details };
            if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
            else {
                window.__ndn_pending_diag = window.__ndn_pending_diag || [];
                window.__ndn_pending_diag.push(payload);
            }
        } catch (e) { console.warn('diag send fail', e); }
    }

    async function postSignal(type, payload) {
        try {
            const code = (input.value || '').trim().toUpperCase();
            const url = new URL(`/cam/signal/${code}`, window.location.origin);
            await fetch(url.toString(), { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ type, payload, source: 'phone' }) });
        } catch (e) { console.warn('postSignal failed', e); sendDiagnostic('postSignal-fail', { err: String(e) }); }
    }

    // sendSignal: prefer WebSocket, fall back to REST postSignal polling
    async function sendSignal(type, payload) {
        const code = (input.value || '').trim().toUpperCase();
        try {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type, code, payload }));
            } else {
                // Use REST POST as fallback
                await postSignal(type, payload);
            }
        } catch (e) {
            console.warn('sendSignal failed, falling back to postSignal', e);
            try { await postSignal(type, payload); } catch (err) { console.warn('postSignal also failed', err); }
        }
    }

    let pollInterval = null;
    async function startPolling(code) {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(async () => {
            try {
                const url = new URL(`/cam/signal/${code}`, window.location.origin);
                const res = await fetch(url.toString());
                const j = await res.json();
                if (j && Array.isArray(j.messages)) {
                    for (const m of j.messages) {
                        try { handleSignal(m); } catch (e) { console.warn('handleSignal err', e); }
                    }
                }
            } catch (e) { console.warn('poll err', e); }
        }, 1500);
    }

    function stopPolling() { if (pollInterval) clearInterval(pollInterval); pollInterval = null; }

    function handleSignal(m) {
        if (!m || !m.type) return;
        if (m.type === 'cam-calibration') {
            try {
                window.__ndn_received_calibration = m.payload;
                if (diagOut) diagOut.textContent = JSON.stringify(m.payload, null, 2);
                log('Received calibration (REST)');
            } catch (e) { console.warn('handleSignal calibration failed', e); }
            return;
        }
        if (m.type === 'cam-offer') {
            (async ()=>{
                console.log('REST received offer');
                pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                stream.getTracks().forEach(t => pc.addTrack(t, stream));
                pc.onicecandidate = (e) => { if (e.candidate) postSignal('cam-ice', e.candidate); };
                await pc.setRemoteDescription(new RTCSessionDescription(m.payload));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await postSignal('cam-answer', answer);
                log('Streaming to desktop (REST)');
            })();
        } else if (m.type === 'cam-ice') {
            try { pc && pc.addIceCandidate(m.payload); } catch (e) { console.warn('addIce fail', e); }
        }
    }

    function flushPendingDiagnostics() {
        try {
            if (!window.__ndn_pending_diag || !window.__ndn_pending_diag.length) return;
            const pending = window.__ndn_pending_diag.splice(0);
            pending.forEach(p => {
                try { ws.send(JSON.stringify(p)); } catch (e) { console.warn('flush send failed', e); window.__ndn_pending_diag.push(p); }
            });
        } catch (e) { console.warn('flush error', e); }
    }

    // Download diagnostics as a JSON file for easy sharing from mobile
    function downloadDiagnostics() {
        try {
            const payload = JSON.stringify(window.__ndn_pending_diag || [], null, 2);
            const blob = new Blob([payload], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ndn-diagnostics-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) {} }, 500);
        } catch (e) { console.warn('downloadDiagnostics failed', e); }
    }

    function log(t) { msg.textContent = t; }
    function showFatalError(msg) {
        const el = document.getElementById('fatal-error');
        if (el) el.textContent = msg;
    }
    function clearFatalError() {
        const el = document.getElementById('fatal-error');
        if (el) el.textContent = '';
    }

    function detectFeatures() {
        const isAndroid = /Android/i.test(navigator.userAgent);
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const supportsPermissions = !!(navigator.permissions && navigator.permissions.query);
        return { isAndroid, isIOS, supportsPermissions };
    }

    const features = detectFeatures();
    if (features.supportsPermissions) {
        navigator.permissions.query({ name: 'camera' }).then(st => {
            log('Camera permission state: ' + st.state);
        }).catch(() => {});
    }

    async function enumerateDevices() {
        try {
            clearFatalError();
            let miniStream = null;
            try {
                miniStream = await navigator.mediaDevices.getUserMedia({ video: true });
            } catch (e) {
                showFatalError('Permission prompt denied or not available: ' + (e && e.message ? e.message : String(e)));
                console.warn('Permission prompt denied or not available:', e);
            }
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            devicesList = videoDevices;
            deviceSelect.innerHTML = '';
            videoDevices.forEach((d, i) => {
                const option = document.createElement('option');
                option.value = d.deviceId;
                option.text = d.label || `Camera ${i+1}`;
                deviceSelect.appendChild(option);
            });
            if (videoDevices.length > 0) {
                deviceId = videoDevices[0].deviceId;
                deviceSelect.value = deviceId;
            }
            if (miniStream) { try { miniStream.getTracks().forEach(t=>t.stop()); } catch {} }
            log('Devices listed: ' + videoDevices.length);
            showFatalError('Devices found: ' + videoDevices.map(d => d.label || d.deviceId).join(', '));
            console.log('Devices:', videoDevices);
            return videoDevices;
        } catch (err) {
            showFatalError('Device enumeration error: ' + (err && err.message ? err.message : String(err)));
            log('Device enumeration error');
            console.error('Device enumeration error:', err);
            return [];
        }
    }

    async function startCam(facing) {
        if (stream) { try { stream.getTracks().forEach(t => t.stop()); } catch {} }
        try {
            clearFatalError();
            let constraints = { video: {} };
            if (deviceId) {
                constraints.video.deviceId = { exact: deviceId };
            } else {
                constraints.video.facingMode = facing || 'environment';
            }
            console.log('Requesting camera with constraints:', constraints);
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err) {
                showFatalError('getUserMedia with deviceId failed: ' + (err && err.message ? err.message : String(err)));
                console.warn('getUserMedia with deviceId failed, retrying with facingMode if possible', err);
                if (deviceId) {
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing || 'environment' } });
                    } catch (err2) {
                        showFatalError('getUserMedia with facingMode failed: ' + (err2 && err2.message ? err2.message : String(err2)));
                        throw err2;
                    }
                } else {
                    throw err;
                }
            }
            console.log('Camera stream obtained:', stream);
            v.srcObject = stream;
            await v.play().catch((e) => {
                showFatalError('Video play failed: ' + (e && e.message ? e.message : String(e)));
                console.error('Video play failed:', e);
                // Show an on-video tap-to-play button for mobile browsers
                try {
                    const btnId = 'ndn-tap-to-play'
                    if (!document.getElementById(btnId)) {
                        const btn = document.createElement('button')
                        btn.id = btnId
                        btn.textContent = 'Tap to enable camera'
                        Object.assign(btn.style, { position: 'absolute', zIndex: 9999, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', padding: '10px 16px', background: 'white', color: '#111827', borderRadius: '8px' })
                        btn.onclick = async () => {
                            try { await v.play(); btn.remove(); clearFatalError(); log('Camera started'); } catch (err) { console.warn('tap-to-play retry failed', err); }
                        }
                        v.parentElement && v.parentElement.appendChild(btn)
                    }
                } catch (err) { console.warn('tap button attach failed', err) }
            });
            log('Camera started');
        } catch (err) {
            showFatalError('Camera error: ' + (err && err.message ? err.message : String(err)));
            log('Camera error: ' + (err && err.message ? err.message : String(err)));
            console.error('Camera error:', err);
            if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
                showFatalError('Permission denied. Please enable camera in Safari settings and retry.');
                log('Permission denied. Please enable camera in Safari settings and retry.');
            }
        }
    }

    deviceSelect.addEventListener('change', function(e) {
        deviceId = this.value;
        startCam();
    });

    enableBtn.addEventListener('click', async (e) => { e.preventDefault();
        log('Requesting camera permission...');
        const list = await enumerateDevices();
        if (list.length > 0) {
            deviceId = list[0].deviceId;
            startCam();
        } else {
            log('No camera devices found or permission denied');
        }
    });

    swapBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (devicesList && devicesList.length > 1) {
            const idx = devicesList.findIndex(d => d.deviceId === deviceId);
            const next = devicesList[(idx + 1) % devicesList.length];
            deviceId = next.deviceId;
            deviceSelect.value = deviceId;
            log('Switched to: ' + (next.label || 'camera'));
            await startCam();
        } else {
            lastFacing = (lastFacing === 'environment' ? 'user' : 'environment');
            await startCam(lastFacing);
        }
    });

    function ensureWS() {
        const candidates = [wsUrl(), `wss://ninedartnation.onrender.com/ws`, `wss://ninedartnation.netlify.app/ws`].filter(Boolean);
        const connectTimeoutMs = 6000;

        function tryConnect(url) {
            return new Promise((resolve, reject) => {
                let socket;
                try {
                    clearFatalError();
                    socket = new WebSocket(url);
                } catch (e) {
                    sendDiagnostic('ws-create-failed', { err: String(e), url });
                    return reject(e);
                }
                let settled = false;
                const to = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    try { socket.close(); } catch (e) {}
                    sendDiagnostic('ws-timeout', { url });
                    reject(new Error('timeout'));
                }, connectTimeoutMs);

                socket.onopen = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(to);
                    ws = socket;
                    wsStatus.textContent = 'WS: open';
                    log('WS connected (' + url + ')');
                    try { if (window.__ndn_pending_diag && window.__ndn_pending_diag.length) flushPendingDiagnostics(); } catch (e) { console.warn('pending flush failed', e); }
                    resolve(socket);
                };
                socket.onclose = (ev) => {
                    if (!settled) {
                        settled = true; clearTimeout(to);
                        reject(new Error('closed-before-open'));
                    } else {
                        wsStatus.textContent = 'WS: closed';
                        log('Connection closed');
                        sendDiagnostic('ws-closed', { code: ev && ev.code });
                    }
                };
                socket.onerror = (ev) => {
                    if (!settled) {
                        settled = true; clearTimeout(to);
                        try { socket.close(); } catch (e) {}
                        sendDiagnostic('ws-error', { ev: String(ev), url });
                        reject(ev || new Error('ws-error'));
                    } else {
                        wsStatus.textContent = 'WS: error';
                        log('WebSocket error');
                        sendDiagnostic('ws-error', { ev: String(ev) });
                    }
                };
            });
        }

        // Try candidates sequentially; if none succeed, reject so caller can fall back to REST polling
        return (async () => {
            for (const url of candidates) {
                try {
                    const s = await tryConnect(url);
                    return s;
                } catch (e) {
                    console.warn('WS connect attempt failed for', url, e && (e.message || e));
                }
            }
            // All attempts failed — set clear UI and diagnostics, then reject
            wsStatus.textContent = 'WS: disconnected';
            showFatalError('WebSocket unavailable — using REST fallback');
            sendDiagnostic('ws-all-failed', { tried: candidates });
            return Promise.reject(new Error('all-ws-failed'));
        })();
    }

    async function join() {
        const code = (input.value || '').trim().toUpperCase();
        if (!code) { log('Enter a code'); return; }
        log('Connecting...');
        console.log('Joining with code:', code);
        try { await startCam(lastFacing); } catch (e) { sendDiagnostic('startCam-failed', { err: String(e) }); }
        try {
            await ensureWS();
            log('Joining session...');
            // Inform server we intend to join (prefer WS)
            await sendSignal('cam-join', null);
            // Set up WS message handler
            ws.onmessage = async (ev) => {
                const data = JSON.parse(ev.data);
                console.log('Received message:', data.type);
                if (data.type === 'cam-calibration') {
                    try {
                        window.__ndn_received_calibration = data.payload;
                        if (diagOut) diagOut.textContent = JSON.stringify(data.payload, null, 2);
                        log('Received calibration for code');
                    } catch (e) { console.warn('calibration message handling failed', e); }
                    return;
                }
                if (data.type === 'cam-joined') {
                    log('Paired. Negotiating...');
                } else if (data.type === 'cam-offer') {
                    console.log('Received offer, creating answer');
                    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                    stream.getTracks().forEach(t => pc.addTrack(t, stream));
                    pc.onicecandidate = (e) => { if (e.candidate) { console.log('Sending ICE'); sendSignal('cam-ice', e.candidate); } };
                    await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    console.log('Sending answer');
                    await sendSignal('cam-answer', answer);
                    log('Streaming to desktop...');
                } else if (data.type === 'cam-ice') {
                    console.log('Received ICE');
                    try { await pc.addIceCandidate(data.payload); } catch {}
                } else if (data.type === 'cam-error') {
                    log('Error: ' + (data.code || 'UNKNOWN'));
                    sendDiagnostic('cam-error-received', data);
                }
            };
        } catch (e) {
            // WS failed — fall back to polling REST endpoint
            console.warn('WS connect failed, falling back to polling:', e);
            sendDiagnostic('ensureWS-failed', { err: String(e) });
            usingPolling = true;
            log('WS connect failed — using polling fallback');
            startPolling(code);
            // Also try to fetch any calibration that may already be present for this code
            (async () => {
                try {
                    const calUrl = new URL(`/cam/calibration/${code}`, window.location.origin);
                    const r = await fetch(calUrl.toString());
                    if (r.ok) {
                        const j = await r.json();
                        if (j && j.ok && j.calibration) {
                            window.__ndn_received_calibration = j.calibration;
                            if (diagOut) diagOut.textContent = JSON.stringify(j.calibration, null, 2);
                            log('Retrieved calibration (REST)');
                        }
                    }
                } catch (err) { console.warn('fetch calibration failed', err); }
            })();
            // Notify server via REST that we're joining
            try { await postSignal('cam-join', null); } catch (err) { console.warn('postSignal cam-join failed', err); }
        }
    }

    joinBtn.addEventListener('click', (e) => { e.preventDefault(); join(); });
    stopBtn.addEventListener('click', (e) => { e.preventDefault(); try { if (pc) pc.close(); if (ws) ws.close(); if (stream) stream.getTracks().forEach(t=>t.stop()); } catch {}; log('Stopped.'); });
    swapBtn.addEventListener('click', async (e) => { e.preventDefault(); lastFacing = (lastFacing === 'environment' ? 'user' : 'environment'); await startCam(lastFacing); });

    sendDiagBtn.addEventListener('click', (e) => { e.preventDefault(); try { if (ws && ws.readyState === WebSocket.OPEN) flushPendingDiagnostics(); log('Diagnostics sent'); } catch (e) { console.warn(e); log('Send failed'); } });
    dumpDiagBtn.addEventListener('click', (e) => { e.preventDefault(); try { diagOut.textContent = JSON.stringify(window.__ndn_pending_diag || [], null, 2); } catch (e) { diagOut.textContent = String(e); } });
    if (downloadDiagBtn) downloadDiagBtn.addEventListener('click', (e) => { e.preventDefault(); downloadDiagnostics(); });
})();
