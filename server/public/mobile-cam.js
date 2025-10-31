// --- NDN Mobile Camera external JS ---
(function(){
    // Show current date in the visible test message
    const dateElem = document.getElementById('date-now');
    if (dateElem) dateElem.textContent = new Date().toLocaleString();
    const fatalElem = document.getElementById('fatal-error');
    if (fatalElem) fatalElem.textContent = 'Diagnostics: JS loaded at ' + new Date().toLocaleString();

    const params = new URLSearchParams(location.search);
    const input = document.getElementById('code');
    const joinBtn = document.getElementById('join');
    const startBtn = document.getElementById('startCamera');
    const requestBtn = document.getElementById('requestAccess');
    const swapBtn = document.getElementById('swap');
    const stopBtn = document.getElementById('stop');
    const deviceSelect = document.getElementById('deviceSelect');
    const v = document.getElementById('v');
    const msg = document.getElementById('msg');
    const pairRow = document.getElementById('pairRow');
    const pairToggleRow = document.getElementById('pairToggleRow');
    const showPairingBtn = document.getElementById('showPairing');
    const pairHint = document.getElementById('pairHint');
    const standaloneHint = document.getElementById('standaloneHint');
    const pairLabel = document.getElementById('pairLabel');
    const startRow = document.getElementById('startRow');

    const sanitizeCode = (value) => (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    input.value = sanitizeCode(params.get('code') || '');

    const launchedFromQr = !!input.value.trim();
    const isMobileView = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const joinLabel = launchedFromQr ? (isMobileView ? 'Pair with Desktop' : 'Pair') : 'Pair';
    let pairingCollapsed = !launchedFromQr;

    const syncPairingUI = (hasCodeOverride) => {
        const hasCode = typeof hasCodeOverride === 'boolean' ? hasCodeOverride : !!(input && input.value.trim().length > 0);
        if (pairRow) pairRow.style.display = pairingCollapsed ? 'none' : 'flex';
        if (pairToggleRow) pairToggleRow.style.display = pairingCollapsed ? 'flex' : 'none';
        if (pairHint) {
            if (pairingCollapsed) {
                pairHint.style.display = 'none';
            } else if (launchedFromQr) {
                pairHint.style.display = 'block';
                pairHint.textContent = `Pair code detected from desktop. Start your mobile camera, then tap “${joinLabel}” to stream.`;
            } else {
                pairHint.style.display = 'block';
                pairHint.textContent = hasCode
                    ? 'Ready to pair — tap “Pair” to connect.'
                    : 'Enter the pairing code shown on desktop or paste it here when you’re ready.';
            }
        }
        if (standaloneHint) {
            if (launchedFromQr) {
                standaloneHint.style.display = 'none';
            } else {
                standaloneHint.style.display = 'block';
                standaloneHint.textContent = pairingCollapsed
                    ? 'Start the camera to preview locally. Tap “Pair with Desktop” when you have a code ready.'
                    : 'Enter the pairing code shown on desktop or paste it here when you’re ready to connect.';
            }
        }
    };

    const updateJoinState = () => {
        if (!input) return;
        const normalized = sanitizeCode(input.value);
        if (input.value !== normalized) input.value = normalized;
        const hasCode = normalized.length > 0;
        if (joinBtn) joinBtn.disabled = !hasCode;
        syncPairingUI(hasCode);
    };

    if (pairLabel) {
        pairLabel.textContent = launchedFromQr ? 'Desktop viewer code' : 'Pair code';
    }
    if (joinBtn) {
        joinBtn.textContent = joinLabel;
    }
    if (startRow) {
        startRow.style.display = 'flex';
    }
    if (input) {
        input.addEventListener('input', updateJoinState);
    }
    syncPairingUI();
    if (showPairingBtn) {
        showPairingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            pairingCollapsed = false;
            updateJoinState();
            setTimeout(() => { try { if (input) input.focus(); } catch {} }, 0);
        });
    }
    updateJoinState();

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
        console.log('[Mobile] Signal received:', m.type, 'code:', input.value)
        if (m.type === 'cam-calibration') {
            try {
                // Store and surface UI to allow applying the calibration on the phone
                window.__ndn_received_calibration = m.payload;
                showCalibrationBanner(m.payload);
                console.log('[Mobile] Calibration banner displayed');
                log('Received calibration (REST)');
            } catch (e) { console.warn('[Mobile] handleSignal calibration failed', e); }
            return;
        }
        if (m.type === 'cam-offer') {
            console.log('[Mobile] Processing cam-offer from desktop');
            (async ()=>{
                try {
                    console.log('[Mobile] Creating RTCPeerConnection for offer');
                    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                    console.log('[Mobile] Adding', stream.getTracks().length, 'audio/video tracks to connection');
                    stream.getTracks().forEach(t => pc.addTrack(t, stream));
                    pc.onicecandidate = (e) => { 
                        if (e.candidate) {
                            console.log('[Mobile] ICE candidate generated:', e.candidate.candidate?.slice(0, 50))
                            postSignal('cam-ice', e.candidate);
                        }
                    };
                    console.log('[Mobile] Setting remote description (offer)');
                    await pc.setRemoteDescription(new RTCSessionDescription(m.payload));
                    console.log('[Mobile] Creating answer');
                    const answer = await pc.createAnswer();
                    console.log('[Mobile] Setting local description (answer)');
                    await pc.setLocalDescription(answer);
                    console.log('[Mobile] Sending cam-answer back to desktop');
                    await postSignal('cam-answer', answer);
                    log('Streaming to desktop viewer (REST)');
                    console.log('[Mobile] WebRTC handshake complete, streaming started');
                } catch (e) { 
                    console.error('[Mobile] cam-offer handler failed:', e);
                    sendDiagnostic('cam-offer-handler-fail', { err: String(e) });
                }
            })();
        } else if (m.type === 'cam-ice') {
            try { 
                console.log('[Mobile] Adding ICE candidate');
                pc && pc.addIceCandidate(m.payload); 
            } catch (e) { console.warn('[Mobile] addIce fail', e); }
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

    // Calibration UI helpers for mobile: show banner and allow user to apply calibration
    function showCalibrationBanner(payload) {
        try {
            window.__ndn_received_calibration = payload || null;
            const banner = document.getElementById('calibBanner');
            const msg = document.getElementById('calibMsg');
            const applyBtn = document.getElementById('applyCalib');
            const dismissBtn = document.getElementById('dismissCalib');
            if (!banner || !msg || !applyBtn || !dismissBtn) return;
            msg.textContent = payload && payload.H ? `Calibration received (errorPx: ${payload.errorPx ?? 'n/a'})` : 'Calibration received';
            banner.style.display = 'block';
            if (diagOut) diagOut.textContent = JSON.stringify(payload || {}, null, 2);

            applyBtn.onclick = (e) => { e.preventDefault(); applyCalibration(payload); hideCalibrationBanner(); };
            dismissBtn.onclick = (e) => { e.preventDefault(); hideCalibrationBanner(); };
        } catch (e) { console.warn('showCalibrationBanner failed', e); }
    }

    function hideCalibrationBanner() {
        try { const banner = document.getElementById('calibBanner'); if (banner) banner.style.display = 'none'; } catch (e) {}
    }

    function applyCalibration(payload) {
        try {
            // Persist received calibration locally on the phone so the camera app can use it later
            localStorage.setItem('ndn:received_calibration', JSON.stringify(payload || {}));
            if (diagOut) diagOut.textContent = JSON.stringify(payload || {}, null, 2);
            log('Calibration applied');
            sendDiagnostic('calibration-applied', { code: input.value || '', payloadSummary: { errorPx: payload?.errorPx } });
        } catch (e) { console.warn('applyCalibration failed', e); }
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

    deviceSelect.addEventListener('change', function() {
        deviceId = this.value;
        startCam();
    });

    if (startBtn) {
        startBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            log('Starting mobile camera...');
            const list = await enumerateDevices();
            if (list.length > 0) {
                deviceId = deviceId || list[0].deviceId;
                startCam();
            } else {
                log('No camera devices found or permission denied');
            }
        });
    }

    if (requestBtn) {
        requestBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            log('Refreshing device list...');
            await enumerateDevices();
        });
    }

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
        const code = sanitizeCode(input.value);
        if (!code) { log('Enter a code'); return; }
        log('Connecting...');
        console.log('[Mobile] Joining with code:', code);
        try { await startCam(lastFacing); } catch (e) { sendDiagnostic('startCam-failed', { err: String(e) }); }
        try {
            await ensureWS();
            log('Joining session...');
            // Inform server we intend to join (prefer WS)
            console.log('[Mobile] Sending cam-join signal');
            await sendSignal('cam-join', null);
            // Set up WS message handler
            ws.onmessage = async (ev) => {
                const data = JSON.parse(ev.data);
                console.log('[Mobile WS] Received:', data.type, 'code:', code);
                if (data.type === 'cam-calibration') {
                    try {
                        window.__ndn_received_calibration = data.payload;
                        // Immediately show a small UI so user can apply the calibration
                        showCalibrationBanner(data.payload);
                        console.log('[Mobile WS] Calibration banner displayed');
                        log('Received calibration for code');
                    } catch (e) { console.warn('[Mobile WS] calibration message handling failed', e); }
                    return;
                }
                if (data.type === 'cam-joined') {
                    console.log('[Mobile WS] Peer joined, waiting for offer');
                    log('Paired. Negotiating...');
                } else if (data.type === 'cam-offer') {
                    console.log('[Mobile WS] Received offer from desktop, creating answer');
                    try {
                        pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                        console.log('[Mobile WS] Adding', stream.getTracks().length, 'tracks to peer connection');
                        stream.getTracks().forEach(t => pc.addTrack(t, stream));
                        pc.onicecandidate = (e) => { 
                            if (e.candidate) { 
                                console.log('[Mobile WS] ICE candidate generated, sending');
                                sendSignal('cam-ice', e.candidate); 
                            }
                        };
                        console.log('[Mobile WS] Setting remote description (offer)');
                        await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
                        console.log('[Mobile WS] Creating answer');
                        const answer = await pc.createAnswer();
                        console.log('[Mobile WS] Setting local description (answer)');
                        await pc.setLocalDescription(answer);
                        console.log('[Mobile WS] Sending answer back to desktop');
                        await sendSignal('cam-answer', answer);
                        log('Streaming to desktop viewer...');
                        console.log('[Mobile WS] WebRTC handshake complete');
                    } catch (e) {
                        console.error('[Mobile WS] cam-offer handler failed:', e);
                        sendDiagnostic('cam-offer-ws-failed', { err: String(e) });
                    }
                } else if (data.type === 'cam-ice') {
                    console.log('[Mobile WS] Received ICE candidate');
                    try { await pc.addIceCandidate(data.payload); } catch (e) { console.warn('[Mobile WS] addIce failed', e); }
                } else if (data.type === 'cam-error') {
                    log('Error: ' + (data.code || 'UNKNOWN'));
                    console.error('[Mobile WS] cam-error received:', data.code);
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

    joinBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (joinBtn.disabled) {
            log('Enter the pairing code from your desktop or scan its QR first.');
            return;
        }
        join();
    });
    stopBtn.addEventListener('click', (e) => { e.preventDefault(); try { if (pc) pc.close(); if (ws) ws.close(); if (stream) stream.getTracks().forEach(t=>t.stop()); } catch {}; log('Stopped.'); });

    sendDiagBtn.addEventListener('click', (e) => { e.preventDefault(); try { if (ws && ws.readyState === WebSocket.OPEN) flushPendingDiagnostics(); log('Diagnostics sent'); } catch (e) { console.warn(e); log('Send failed'); } });
    dumpDiagBtn.addEventListener('click', (e) => { e.preventDefault(); try { diagOut.textContent = JSON.stringify(window.__ndn_pending_diag || [], null, 2); } catch (e) { diagOut.textContent = String(e); } });
    if (downloadDiagBtn) downloadDiagBtn.addEventListener('click', (e) => { e.preventDefault(); downloadDiagnostics(); });
})();
