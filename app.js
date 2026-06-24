const firebaseConfig = {
    apiKey: "AIzaSyBwRySKZLzwJeDhLpLMqo9Uh9VnhN7UJXk",
    authDomain: "smartcity-cda59.firebaseapp.com",
    projectId: "smartcity-cda59",
    messagingSenderId: "58757711354",
    appId: "1:58757711354:web:bd53a78a7afd457b289043"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const provider = new firebase.auth.GoogleAuthProvider();

const ADMIN_EMAILS = ["shreybhangale2714@gmail.com", "smartcityproject.sit@gmail.com"];
let currentUser = null;
let userIsAdmin = false;
let globalLogs = [];

let windmillChart, aqiChart;
let dWindV = [], dWindI = [], dAqi1 = [], dAqi2 = [], timeLabelsWind = [], timeLabelsAqi = [];
const maxDataPoints = 15;
let globalTimeTick = 0;
let mockInterval = null;
let ws;
let wsAddress = localStorage.getItem("lastWsAddress") || "ws://10.149.39.90:81";
let autoBuzzerEnabled = true;

let lastEmailTime = { fire: 0, aqi: 0, waste: 0 };
const EMAIL_COOLDOWN = 300000; 

function addSafeListener(id, event, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
}

const alrtText = document.getElementById("alertText");

function changeAlertText(text) {
    alrtText.innerText = text;
}

async function triggerEmailAlert(type, subject, message) {
    const now = Date.now();
    if (now - lastEmailTime[type] < EMAIL_COOLDOWN) return;
    lastEmailTime[type] = now;

    logSystemEvent("EMAIL_ALERT", `Dispatching alert: ${subject}`, "SYS_ROOT", "HIGH");

    const PUBLIC_KEY = 'ta74XNyBixqAlgxC0';
    const SERVICE_ID = 'service_37o3ycw';
    const TEMPLATE_ID = 'template_ihsnzh5';

    const emailData = {
        service_id: SERVICE_ID,
        template_id: TEMPLATE_ID,
        user_id: PUBLIC_KEY, 
        template_params: {
            user_name: 'Smart City',
            subject: subject,
            message: message,
            reply_to: 'smartcityproject.sit@gmail.com'
        }
    };

    try {
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emailData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`EmailJS Error: ${response.status} - ${errorText}`);
        }
        console.log('Success!');
    } catch(e) {
        console.error('Failed to send email:', e);
    }
}

particlesJS('particles-js', {
    "particles": { "number": { "value": 40, "density": { "enable": true, "value_area": 800 } }, "color": { "value": ["#00f0ff", "#bc13fe", "#00ff66"] }, "shape": { "type": "circle" }, "opacity": { "value": 0.3, "random": true, "anim": { "enable": true, "speed": 1, "opacity_min": 0.1, "sync": false } }, "size": { "value": 2, "random": true, "anim": { "enable": true, "speed": 2, "size_min": 0.1, "sync": false } }, "line_linked": { "enable": true, "distance": 150, "color": "#ffffff", "opacity": 0.05, "width": 1 }, "move": { "enable": true, "speed": 1, "direction": "none", "random": true, "straight": false, "out_mode": "out", "bounce": false } },
    "interactivity": { "detect_on": "canvas", "events": { "onhover": { "enable": true, "mode": "grab" }, "onclick": { "enable": true, "mode": "push" }, "resize": true }, "modes": { "grab": { "distance": 140, "line_linked": { "opacity": 0.3 } }, "push": { "particles_nb": 2 } } },
    "retina_detect": true
});

function updateDateTime() {
    const now = new Date();
    const optionsDate = { month: 'short', day: 'numeric', year: 'numeric' };
    const optionsTime = { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true };
    const dStr = document.getElementById('currentDateString');
    const tStr = document.getElementById('currentTimeString');
    if(dStr) dStr.innerText = now.toLocaleDateString('en-US', optionsDate);
    if(tStr) tStr.innerText = now.toLocaleTimeString('en-US', optionsTime);
}
setInterval(updateDateTime, 1000);
updateDateTime();

addSafeListener('googleSignInBtn', 'click', () => {
    const errDisp = document.getElementById('authErrorDisplay');
    if(errDisp) errDisp.innerText = "Initiating handshake...";
    auth.signInWithPopup(provider).catch(err => {
        if(errDisp) errDisp.innerText = err.message;
    });
});

addSafeListener('logoutBtn', 'click', () => auth.signOut());

auth.onAuthStateChanged(user => {
    const authGate = document.getElementById('authGate');
    const mainApp = document.getElementById('mainApp');
    const globalLoader = document.getElementById('globalLoader');

    if (user) {
        currentUser = user;
        userIsAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());

        const avatar = document.getElementById('navUserAvatar');
        const roleBadge = document.getElementById('userRoleBadge');
        if(avatar) avatar.src = user.photoURL || '';
        if(roleBadge) {
            roleBadge.innerText = userIsAdmin ? "L5 NEXUS ADMIN" : "CIVILIAN NODE";
            roleBadge.className = userIsAdmin ? "role-badge tech-font text-green border-green bg-green-subtle" : "role-badge tech-font text-blue border-blue bg-blue-subtle";
        }

        if (!userIsAdmin) {
            document.querySelectorAll('.nav-item').forEach(el => {
                if (el.dataset.target !== 'commsTab' && el.id !== 'logoutBtn') el.style.display = 'none';
            });
            switchTab('commsTab');
        }

        if(authGate && globalLoader && mainApp) {
            gsap.to(authGate, { opacity: 0, duration: 0.5, onComplete: () => {
                    authGate.classList.add('hidden');
                    globalLoader.style.opacity = 1;
                    globalLoader.classList.remove('hidden');

                    setTimeout(() => {
                        gsap.to(globalLoader, { opacity: 0, duration: 0.8, onComplete: () => {
                                globalLoader.classList.add('hidden');
                                mainApp.classList.remove('hidden');

                                gsap.from(".gs-reveal", { y: 20, opacity: 0, duration: 0.6, stagger: 0.05, ease: "power2.out" });

                                if (userIsAdmin) {
                                    initCharts();
                                    connectWebSocket();
                                    startMockWindmill();
                                }
                                initCommsModule();
                                logSystemEvent("AUTH", `Secure Handshake: ${user.email}`, "SYS_ROOT", "HIGH");
                            }
                        });
                    }, 1200);
                }
            });
        }
    } else {
        currentUser = null;
        userIsAdmin = false;
        if(mainApp) mainApp.classList.add('hidden');
        if(globalLoader) globalLoader.classList.add('hidden');
        if(authGate) {
            authGate.classList.remove('hidden');
            gsap.fromTo(authGate, { scale: 0.95, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(1.5)" });
        }
        if(ws) ws.close();
        if(mockInterval) clearInterval(mockInterval);
    }
});

document.querySelectorAll('.nav-item[data-target]').forEach(tab => {
    tab.addEventListener('click', () => {
        const targetId = tab.dataset.target;
        document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        switchTab(targetId);
    });
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-pane').forEach(p => {
        p.classList.remove('active');
        p.style.opacity = 0;
    });
    const activePane = document.getElementById(tabId);
    if(activePane) {
        activePane.classList.add('active');
        gsap.to(activePane, { opacity: 1, duration: 0.4, ease: "power2.out" });
        gsap.fromTo(activePane.querySelectorAll('.widget-entrance'), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, stagger: 0.05, ease: "power2.out" });
    }
    if (tabId === 'commsTab') {
        const cw = document.getElementById('chatWindow');
        if(cw) cw.scrollTop = cw.scrollHeight;
    }
}

Chart.defaults.color = 'rgba(255, 255, 255, 0.5)';
Chart.defaults.font.family = "'Outfit', sans-serif";

function initCharts() {
    if (windmillChart || aqiChart) return;
    
    const windCanvas = document.getElementById('windmillChart');
    if(windCanvas) {
        const windCtx = windCanvas.getContext('2d');
        let gradBlue = windCtx.createLinearGradient(0, 0, 0, 400);
        gradBlue.addColorStop(0, 'rgba(0, 229, 255, 0.5)');
        gradBlue.addColorStop(1, 'rgba(0, 229, 255, 0.0)');
        
        let gradGreen = windCtx.createLinearGradient(0, 0, 0, 400);
        gradGreen.addColorStop(0, 'rgba(0, 250, 126, 0.5)');
        gradGreen.addColorStop(1, 'rgba(0, 250, 126, 0.0)');

        windmillChart = new Chart(windCtx, {
            type: 'line',
            data: {
                labels: timeLabelsWind,
                datasets: [
                    { label: 'Voltage (V)', data: dWindV, borderColor: '#00e5ff', backgroundColor: gradBlue, borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 },
                    { label: 'Current (mA)', data: dWindI, borderColor: '#00fa7e', backgroundColor: gradGreen, borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, backgroundColor: 'rgba(12, 14, 25, 0.9)', titleFont: {family: 'Space Grotesk'}, bodyFont: {family: 'Outfit'}, borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 } },
                scales: { x: { display: false }, y: { grid: { color: 'rgba(255, 255, 255, 0.05)', borderDash: [5, 5] }, beginAtZero: true } },
                animation: { duration: 0 }
            }
        });
    }

    const aqiCanvas = document.getElementById('aqiChart');
    if(aqiCanvas) {
        const aqiCtx = aqiCanvas.getContext('2d');
        let gradGreenAqi = aqiCtx.createLinearGradient(0, 0, 0, 400);
        gradGreenAqi.addColorStop(0, 'rgba(0, 250, 126, 0.5)');
        gradGreenAqi.addColorStop(1, 'rgba(0, 250, 126, 0.0)');

        let gradBlueAqi = aqiCtx.createLinearGradient(0, 0, 0, 400);
        gradBlueAqi.addColorStop(0, 'rgba(0, 229, 255, 0.5)');
        gradBlueAqi.addColorStop(1, 'rgba(0, 229, 255, 0.0)');

        aqiChart = new Chart(aqiCtx, {
            type: 'line',
            data: {
                labels: timeLabelsAqi,
                datasets: [
                    { label: 'MQ2-1', data: dAqi1, borderColor: '#00fa7e', backgroundColor: gradGreenAqi, borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 },
                    { label: 'MQ2-2', data: dAqi2, borderColor: '#00e5ff', backgroundColor: gradBlueAqi, borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, backgroundColor: 'rgba(12, 14, 25, 0.9)', titleFont: {family: 'Space Grotesk'}, bodyFont: {family: 'Outfit'}, borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 } },
                scales: { x: { display: false }, y: { grid: { color: 'rgba(255, 255, 255, 0.05)', borderDash: [5, 5] }, beginAtZero: true } },
                animation: { duration: 0 }
            }
        });
    }
}

function startMockWindmill() {
    if(mockInterval) clearInterval(mockInterval);
    mockInterval = setInterval(() => {
        globalTimeTick++;
        let v = 5.0 + Math.sin(globalTimeTick) * 1.5 + Math.random() * 0.5;
        let i = 55 + Math.cos(globalTimeTick / 2) * 0.3 + Math.random() * 0.2;
        let p = v * i;

        const wv = document.getElementById('windVoltage');
        const wi = document.getElementById('windCurrent');
        const wp = document.getElementById('windPower');

        if(wv) wv.innerText = v.toFixed(2) + " V";
        if(wi) wi.innerText = (i*1000).toFixed(2) + " mA"; 
        if(wp) wp.innerText = p.toFixed(2) + " W";

        const nowTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        timeLabelsWind.push(nowTime);
        dWindV.push(v);
        dWindI.push(i*1000);

        if(timeLabelsWind.length > maxDataPoints) {
            timeLabelsWind.shift();
            dWindV.shift();
            dWindI.shift();
        }

        if(windmillChart) windmillChart.update();

    }, 2000);
}

function connectWebSocket() {
    const input = document.getElementById('wsAddressInput');
    
    if (input) {
        if (!input.value) {
            // If input is empty, fill it with the last saved address
            input.value = wsAddress;
        } else {
            // If user typed a new address, capture it
            let targetAddr = input.value.trim();
            if (!targetAddr.startsWith("ws://") && !targetAddr.startsWith("wss://")) {
                targetAddr = "ws://" + targetAddr;
            }
            wsAddress = targetAddr;
        }
    }

    // Save it so it persists across page refreshes
    localStorage.setItem("lastWsAddress", wsAddress);

    const wsStatusIcon = document.getElementById('wsStatusIcon');
    const wsStatusText = document.getElementById('wsStatusText');

    if(wsStatusIcon) wsStatusIcon.className = "ri-loader-4-line text-blue spin-slow";
    if(wsStatusText) { wsStatusText.innerText = "Connecting..."; wsStatusText.className = "text-blue"; }

    if(ws) ws.close();

    try {
        ws = new WebSocket(wsAddress);

        ws.onopen = function() {
            if(wsStatusIcon) wsStatusIcon.className = "ri-wifi-line text-green";
            if(wsStatusText) { wsStatusText.innerText = "WS Connected"; wsStatusText.className = "text-green"; }
            logSystemEvent("SYS_NET", "WebSocket Connected to " + wsAddress, "SYS_ROOT", "HIGH");
        };

        ws.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                processWebSocketData(data);
            } catch (e) {}
        };

        ws.onclose = function() {
            if(wsStatusIcon) wsStatusIcon.className = "ri-wifi-off-line text-red";
            if(wsStatusText) { wsStatusText.innerText = "WS Disconnected"; wsStatusText.className = "text-red"; }
            logSystemEvent("SYS_NET", "WebSocket Connection Lost", "SYS_ROOT", "HIGH");
            setTimeout(connectWebSocket, 5000); 
        };

    } catch(e) {
        console.error("WebSocket initialization failed:", e);
    }
}

addSafeListener('btnReconnectWs', 'click', connectWebSocket);

function processWebSocketData(data) {
    const nowTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if(data.air_quality) {
        let mq1 = parseInt(data.air_quality.mq2_1) || 0;
        let mq2 = parseInt(data.air_quality.mq2_2) || 0;

        const aqi1Dom = document.getElementById('aqiSoc1Val');
        const aqi2Dom = document.getElementById('aqiSoc2Val');

        if(aqi1Dom) {
            aqi1Dom.innerText = `MQ2-1 (P34): ${mq1}`;
            aqi1Dom.className = mq1 > 300 ? "badge bg-red-subtle text-red tech-font text-xs px-2" : "badge bg-green-subtle text-green tech-font text-xs px-2";
        }
        if(aqi2Dom) {
            aqi2Dom.innerText = `MQ2-2 (P35): ${mq2}`;
            aqi2Dom.className = mq2 > 300 ? "badge bg-red-subtle text-red tech-font text-xs px-2" : "badge bg-blue-subtle text-blue tech-font text-xs px-2";
        }

        if (mq1 > 300 || mq2 > 300) {
            triggerEmailAlert('aqi', 'Critical AQI Alert', `High particulate matter detected. MQ1: ${mq1}, MQ2: ${mq2}`);
            // changeAlertText(`High particulate matter detected. MQ1: ${mq1}, MQ2: ${mq2}`);
        }

        timeLabelsAqi.push(nowTime);
        dAqi1.push(mq1);
        dAqi2.push(mq2);

        if(timeLabelsAqi.length > maxDataPoints) { timeLabelsAqi.shift(); dAqi1.shift(); dAqi2.shift(); }
        if(aqiChart) aqiChart.update();
    }

    if(data.dustbin) {
        const setBinUI = (val, statusId, binName) => {
            const statDom = document.getElementById(statusId);
            if(!statDom) return;
            if(val === 1 || val === true || val === "1") {
                statDom.innerText = "FULL";
                statDom.className = "tech-font text-red text-lg";
                triggerEmailAlert('waste', 'Waste Collection Required', `Dustbin ${binName} has reached full capacity.`);
                changeAlertText(`Dustbin ${binName} has reached full capacity.`) 
            } else {
                statDom.innerText = "EMPTY";
                statDom.className = "tech-font text-green text-lg";
            }
        };
        setBinUI(data.dustbin.bin1, 'dustbin1Status', '1');
        setBinUI(data.dustbin.bin2, 'dustbin2Status', '2');
    }

    if(data.parking) {
        const updateSlot = (val, slotId, statusId) => {
            const el = document.getElementById(slotId);
            const st = document.getElementById(statusId);
            if(!el || !st) return;
            if(val === 1 || val === true || val === "1") { 
                el.className = "park-slot-mini bg-red-subtle border-red";
                const icon = el.querySelector('i');
                if(icon) icon.className = "ri-car-fill text-red text-lg";
                st.innerText = "Occupied";
                st.className = "text-xs text-red";
            } else {
                el.className = "park-slot-mini bg-green-subtle border-green";
                const icon = el.querySelector('i');
                if(icon) icon.className = "ri-car-fill text-green text-lg";
                st.innerText = "Empty";
                st.className = "text-xs text-green";
            }
        };

        const isAllOccupied = Object.values(data.parking).every(status => status === true);
        if(isAllOccupied) changeAlertText('All Parking Slots Occupied');

        updateSlot(data.parking.s1, 'slot-s1', 'status-s1');
        updateSlot(data.parking.s2, 'slot-s2', 'status-s2');
        updateSlot(data.parking.s3, 'slot-s3', 'status-s3');
        updateSlot(data.parking.s4, 'slot-s4', 'status-s4');
    }

    if(data.fire) {
        const updateFire = (val, cardId, iconId, statusId, sensorName) => {
            const c = document.getElementById(cardId);
            const i = document.getElementById(iconId);
            const s = document.getElementById(statusId);
            if(!c || !i || !s) return;
            if(val === 1 || val === true || val === "1") {
                c.className = "park-slot-mini bg-red-subtle border-red blink-fast";
                i.className = "ri-fire-fill neonic-red text-huge";
                s.innerText = "FIRE DETECTED";
                s.className = "text-xs text-red font-bold";
                
                triggerEmailAlert('fire', 'EMERGENCY: FIRE DETECTED', `Fire detected by ${sensorName}. Immediate response required.`);
                changeAlertText(`Fire detected by ${sensorName}. Immediate response required.`);

                if(autoBuzzerEnabled) {
                    const buz = document.getElementById('toggleBuzzer');
                    if(ws && ws.readyState === WebSocket.OPEN && buz && !buz.checked) {
                        ws.send(JSON.stringify({command: "buzzer", state: 1}));
                        buz.checked = true;
                    }
                }
            } else {
                c.className = "park-slot-mini bg-green-subtle border-green";
                i.className = "ri-fire-line text-green text-lg";
                s.innerText = "SAFE";
                s.className = "text-xs text-green";
            }
        };
        updateFire(data.fire.f1, 'fireCard1', 'fireIcon1', 'fireStatus1', 'Fire Sensor 1');
        updateFire(data.fire.f2, 'fireCard2', 'fireIcon2', 'fireStatus2', 'Fire Sensor 2');
    }

    if(data.ldr !== undefined) {
        const ldrDom = document.getElementById('ldrStatus');
        if(ldrDom) ldrDom.innerText = `LDR Reading: ${data.ldr}`;
    }

    if(data.led !== undefined) {
        const slIcon = document.getElementById('streetLightIcon');
        const slStatus = document.getElementById('streetLightStatus');
        const flare = document.getElementById('streetlightFlare');
        if(slIcon && slStatus && flare) {
            if(data.led === 1 || data.led === true || data.led === "1") {
                slIcon.className = "ri-lightbulb-flash-line neonic-green text-huge";
                slStatus.innerText = "ON";
                slStatus.className = "tech-font text-green mt-1";
                flare.className = "bg-flare bg-green opacity-50";
            } else {
                slIcon.className = "ri-lightbulb-line text-muted text-huge opacity-50";
                slStatus.innerText = "OFF";
                slStatus.className = "tech-font text-muted mt-1";
                flare.className = "hidden";
            }
        }
    }

    if(data.relay !== undefined) {
        const rel = document.getElementById('toggleRelay');
        if(rel) rel.checked = (data.relay == 1);
    }
    if(data.buzzer !== undefined) {
        const buz = document.getElementById('toggleBuzzer');
        if(buz) buz.checked = (data.buzzer == 1);
    }
}

addSafeListener('toggleRelay', 'change', (e) => {
    if(ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({command: "relay", state: e.target.checked ? 1 : 0}));
        logSystemEvent("OVERRIDE", `Main Relay mutated: ${e.target.checked}`, "ADMIN_OP", "HIGH");
    } else {
        e.preventDefault();
    }
});

addSafeListener('toggleBuzzer', 'change', (e) => {
    if(ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({command: "buzzer", state: e.target.checked ? 1 : 0}));
        logSystemEvent("OVERRIDE", `Buzzer mutated: ${e.target.checked}`, "ADMIN_OP", "HIGH");
    } else {
        e.preventDefault();
    }
});

const slIconParent = document.getElementById('streetLightIcon');
if(slIconParent && slIconParent.parentElement) {
    slIconParent.parentElement.addEventListener('click', () => {
        if(ws && ws.readyState === WebSocket.OPEN) {
            const st = document.getElementById('streetLightStatus');
            if(st) {
                const isCurrentlyOn = st.innerText === "ON";
                ws.send(JSON.stringify({command: "led", state: isCurrentlyOn ? 0 : 1}));
                logSystemEvent("OVERRIDE", `Streetlight mutated: ${!isCurrentlyOn}`, "ADMIN_OP", "HIGH");
            }
        }
    });
}

addSafeListener('sliderTickRate', 'input', e => {
    const lbl = document.getElementById('tickRateLabel');
    if(lbl) lbl.innerText = e.target.value + " ms";
});

addSafeListener('sliderTickRate', 'change', e => {
    if(ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({command: "settings", tickRate: parseInt(e.target.value)}));
        logSystemEvent("SYS_CONFIG", `Telemetry tick rate adjusted to ${e.target.value}ms`, "SYS_ROOT", "HIGH");
    }
});

addSafeListener('toggleAutoBuzzer', 'change', e => {
    autoBuzzerEnabled = e.target.checked;
    if(ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({command: "settings", autoBuzzer: autoBuzzerEnabled ? 1 : 0}));
        logSystemEvent("SYS_CONFIG", `Auto-Buzzer automation: ${autoBuzzerEnabled}`, "SYS_ROOT", "HIGH");
    }
});

addSafeListener('toggleLoadShedding', 'change', e => logSystemEvent("SYS_CONFIG", `Predictive Load Shedding toggled: ${e.target.checked}`, "SYS_ROOT", "HIGH"));
addSafeListener('toggleAutoDrone', 'change', e => logSystemEvent("SYS_CONFIG", `UAV Automation toggled: ${e.target.checked}`, "SYS_ROOT", "HIGH"));
addSafeListener('toggleAqiSprinklers', 'change', e => logSystemEvent("SYS_CONFIG", `AQI-Sprinklers Automation toggled: ${e.target.checked}`, "SYS_ROOT", "HIGH"));

addSafeListener('toggleStealthMode', 'change', e => {
    const orbs = document.querySelectorAll('.orb');
    orbs.forEach(o => o.style.opacity = e.target.checked ? '0.05' : '0.4');
    document.documentElement.style.setProperty('--neonic-bloom', e.target.checked ? '0px' : '15px');
});

const b64Input = document.getElementById('base64ImageInput');
const previewCont = document.getElementById('imagePreviewContainer');
const imgPreview = document.getElementById('imgPreview');
const b64Size = document.getElementById('base64Size');
let base64Payload = null;

addSafeListener('attachBtn', 'click', () => { if(b64Input) b64Input.click(); });

if(b64Input) {
    b64Input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 800;
                    let width = img.width;
                    let height = img.height;
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    base64Payload = canvas.toDataURL('image/jpeg', 0.6);
                    if(imgPreview) imgPreview.src = base64Payload;
                    const sizeKB = Math.round((base64Payload.length * (3 / 4)) / 1024);
                    if(b64Size) b64Size.innerText = `${sizeKB} KB`;
                    if(previewCont) {
                        previewCont.classList.remove('hidden');
                        gsap.from(previewCont, { y: 10, opacity: 0, duration: 0.3 });
                    }
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
}

addSafeListener('cancelImgBtn', 'click', () => {
    base64Payload = null; 
    if(b64Input) b64Input.value = ""; 
    if(previewCont) previewCont.classList.add('hidden');
});

function playHapticAudio() {
    const tAud = document.getElementById('toggleAudio');
    if (tAud && tAud.checked) {
        try {
            const ctx = new(window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine'; osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
            osc.start(); osc.stop(ctx.currentTime + 0.1);
        } catch(e){}
    }
}

function initCommsModule() {
    db.collection('secureNexusComms').orderBy('timestamp', 'asc').limit(40).onSnapshot(snap => {
        const cw = document.getElementById('chatWindow');
        if(!cw) return;
        let shouldScroll = Math.abs(cw.scrollHeight - cw.scrollTop - cw.clientHeight) <= 50;

        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const data = change.doc.data();
                const isMe = data.uid === currentUser.uid;
                const isAdmin = ADMIN_EMAILS.includes(data.email.toLowerCase());
                const wrapper = document.createElement('div');
                wrapper.className = isMe ? "msg-bubble msg-me" : "msg-bubble msg-admin";
                let timeStr = "";
                if (data.timestamp) {
                    const dt = data.timestamp.toDate();
                    timeStr = dt.getHours().toString().padStart(2, '0') + ':' + dt.getMinutes().toString().padStart(2, '0');
                }
                let contentHTML = `
                    <div class="msg-meta">
                        ${isAdmin ? '<i class="ri-shield-star-line text-green"></i> ADMIN' : '<i class="ri-user-line text-blue"></i> CIV'}
                        <span> // ${data.name.split(' ')[0]} // ${timeStr}</span>
                    </div>
                    <div class="msg-text">${data.text}</div>
                `;
                if (data.b64Image) { contentHTML += `<img src="${data.b64Image}" class="msg-image" onclick="window.open(this.src, '_blank')">`; }
                wrapper.innerHTML = contentHTML;
                cw.appendChild(wrapper);
                if (!isMe) { gsap.from(wrapper, { x: -20, opacity: 0, duration: 0.4 }); playHapticAudio(); } 
                else { gsap.from(wrapper, { scale: 0.95, opacity: 0, duration: 0.3 }); }
            }
        });
        if (shouldScroll) cw.scrollTop = cw.scrollHeight;
    });
}


const sendBtn = document.getElementById('sendMessageBtn');
const msgInp = document.getElementById('chatMessageInput');


const sendData = async () => {
    if(!msgInp || !sendBtn) return;
    const txt = msgInp.value.trim();
    sendBtn.innerHTML = '<i class="ri-loader-4-line spin-slow"></i>';
    sendBtn.disabled = true;
    const docData = {
      uid: currentUser.uid,
      name: currentUser.displayName,
      email: currentUser.email,
      text: txt,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (base64Payload) {
      docData.b64Image = base64Payload;
    }

    try {
        await db.collection('secureNexusComms').add(docData);
        msgInp.value = ""; 
        const cBtn = document.getElementById('cancelImgBtn');
        if(cBtn) cBtn.click();
    } catch (err) {
        console.error(err);
    }
    sendBtn.innerHTML = '<i class="ri-send-plane-line"></i>';
    sendBtn.disabled = false;
};

addSafeListener('sendMessageBtn', 'click', sendData);
msgInp.addEventListener('keypress', e => { if (e.key === 'Enter') sendData(); });


function logSystemEvent(type, text, node, trust) {
    if (!userIsAdmin) return;
    const ts = new Date().toISOString();
    const logEntry = { ts, type, text, node, trust };
    globalLogs.unshift(logEntry);
    if (globalLogs.length > 100) globalLogs.pop();
    const tb = document.getElementById('dbLogTableBody');
    if(!tb) return;
    const tr = document.createElement('tr');
    let trustClass = "text-green";
    if (trust === "MED") trustClass = "text-blue";
    if (trust === "HIGH") trustClass = "text-purple";
    tr.innerHTML = `
        <td class="tech-font text-xs text-muted">${ts.replace('T',' ').substring(0,19)}</td>
        <td class="tech-font text-xs">${node}</td>
        <td><span class="badge bg-blue-subtle text-blue px-2">${type}</span></td>
        <td class="text-sm">${text}</td>
        <td class="${trustClass} tech-font text-xs">${trust}</td>
    `;
    tb.prepend(tr);
    if (tb.children.length > 40) tb.removeChild(tb.lastChild);
}

addSafeListener('btnEncryptedBackup', 'click', () => {
    let wsInp = "UNKNOWN";
    const i = document.getElementById('wsAddressInput');
    if(i) wsInp = i.value;
    const jsonStr = JSON.stringify({ config: { tick: wsInp }, logs: globalLogs });
    const b64Export = btoa(unescape(encodeURIComponent(jsonStr)));
    const finalJSON = JSON.stringify({ _encryptedPayload: b64Export, alg: "AES-Simulated", ts: Date.now() }, null, 2);
    const blob = new Blob([finalJSON], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; 
    a.download = `NEXCITY_AUDIT_${Date.now()}.json`; 
    a.click();
    URL.revokeObjectURL(url);
    logSystemEvent("BACKUP", "Encrypted audit ledger exported via Base64.", "SYS_ROOT", "HIGH");
});

addSafeListener('btnPurgeLogs', 'click', () => {
    globalLogs = [];
    const tb = document.getElementById('dbLogTableBody');
    if(tb) tb.innerHTML = "";
    logSystemEvent("SYS_MAINTENANCE", "Local cache purged by administrator.", "SYS_ROOT", "HIGH");
});