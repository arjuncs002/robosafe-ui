import { useCallback, useEffect, useRef, useState } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API_BASE = process.env.REACT_APP_API_URL || "https://robosafe-backend.onrender.com";

const FLAG_COLORS = {
  detected:  "#f59e0b",
  arrived:   "#3b82f6",
  alive:     "#22c55e",
  not_alive: "#ef4444",
};
const FLAG_LABELS = {
  detected:  "👁 Detected",
  arrived:   "📍 Arrived",
  alive:     "✅ Alive",
  not_alive: "❌ Not Alive",
};

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [token,      setToken]      = useState(null);
  const [password,   setPassword]   = useState("");
  const [showPw,     setShowPw]     = useState(false);
  const [loginError, setLoginError] = useState("");
  const [locked,     setLocked]     = useState(false);
  const lastActivityRef = useRef(Date.now());
  const LOCK_TIMEOUT_MS = 30_000;

  // ── Tabs & modals ─────────────────────────────────────────────────────────
  const [tab,                    setTab]                    = useState("home");
  const [cameraModalOpen,        setCameraModalOpen]        = useState(false);
  const [driveModalOpen,         setDriveModalOpen]         = useState(false);
  const [detailsModalOpen,       setDetailsModalOpen]       = useState(false);
  const [lifeModalOpen,          setLifeModalOpen]          = useState(false);
  const [vitalsPopupOpen,        setVitalsPopupOpen]        = useState(false);

  // ── Settings ──────────────────────────────────────────────────────────────
  const [alertSound,          setAlertSound]          = useState("Siren");
  const [bgColor,             setBgColor]             = useState("#0a1020");
  const [refreshRateMs,       setRefreshRateMs]       = useState(250);
  const [showOverlays,        setShowOverlays]        = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [autoFullscreen,      setAutoFullscreen]      = useState(false);

  // ── Detection state ───────────────────────────────────────────────────────
  const [thermalCount,      setThermalCount]      = useState(0);
  const [detections,        setDetections]        = useState([]);
  const [mmwaveStatus,      setMmwaveStatus]      = useState("SENSOR DISABLED");
  const [mmwaveRespiration, setMmwaveRespiration] = useState(false);
  const [mmwaveDistance,    setMmwaveDistance]    = useState(0);
  const [mmwaveEnergyMin,   setMmwaveEnergyMin]   = useState(0);
  const [mmwaveEnergyMax,   setMmwaveEnergyMax]   = useState(0);
  const [mmwaveEnergyDelta, setMmwaveEnergyDelta] = useState(0);
  const [mmwaveEnabled,     setMmwaveEnabled]     = useState(false);

  // ── Drive ─────────────────────────────────────────────────────────────────
  const [driveMode,      setDriveMode]      = useState("MANUAL");
  const [activeCommand,  setActiveCommand]  = useState("STOP");
  const [commandHistory, setCommandHistory] = useState([]);

  // ── Map ───────────────────────────────────────────────────────────────────
  const [mapState, setMapState] = useState({
    rover_x: 0, rover_y: 0, rover_heading: 0,
    flags: [], track: [],
  });
  const mapCanvasRef = useRef(null);

  // ── Alert / vitals popup ──────────────────────────────────────────────────
  const [sirenActive,      setSirenActive]      = useState(false);
  const [vitalsResult,     setVitalsResult]     = useState(null);  // 'alive' | 'not_alive' | null
  const sirenRef        = useRef(null);
  const prevAlertTsRef  = useRef(0);

  // ── History ───────────────────────────────────────────────────────────────
  const [historyRows,    setHistoryRows]    = useState([]);
  const [historyLimit,   setHistoryLimit]   = useState(200);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Password change ───────────────────────────────────────────────────────
  const [curPw,     setCurPw]     = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [newPw2,    setNewPw2]    = useState("");
  const [pwMsg,     setPwMsg]     = useState("");
  const [showCurPw, setShowCurPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showNewPw2,setShowNewPw2]= useState(false);

  // Refs for continuous command sending
  const cmdIntervalRef   = useRef(null);
  const clickIntervalRef = useRef(null);

  // ── Activity / lock ───────────────────────────────────────────────────────
  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setLocked(false);
  }, []);

  useEffect(() => {
    const evts = ["mousemove", "mousedown", "keydown", "touchstart"];
    evts.forEach(e => window.addEventListener(e, markActivity));
    return () => evts.forEach(e => window.removeEventListener(e, markActivity));
  }, [markActivity]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!token) return;
      if (Date.now() - lastActivityRef.current > LOCK_TIMEOUT_MS) {
        setLocked(true);
        setToken(null);
        setPassword("");
      }
    }, 1000);
    return () => clearInterval(id);
  }, [token]);

  // ── Siren ─────────────────────────────────────────────────────────────────
  const stopSiren = useCallback(() => {
    if (sirenRef.current) {
      try {
        const { osc, ctx, id } = sirenRef.current;
        clearInterval(id);
        osc.stop();
        ctx.close();
      } catch {}
      sirenRef.current = null;
    }
    setSirenActive(false);
  }, []);

  const playSirenLoop = useCallback(() => {
    if (sirenRef.current) return;
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type       = "sawtooth";
      gain.gain.value = 0.06;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      let up = true;
      const id = setInterval(() => {
        const f = osc.frequency.value;
        if (up) { osc.frequency.value = Math.min(1200, f + 80); if (f >= 1200) up = false; }
        else    { osc.frequency.value = Math.max(350,  f - 80); if (f <= 350)  up = true; }
      }, 80);
      sirenRef.current = { osc, ctx, id };
      setSirenActive(true);
    } catch {}
  }, []);

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = 880; g.gain.value = 0.15;
      osc.connect(g); g.connect(ctx.destination); osc.start();
      setTimeout(() => { try { osc.stop(); ctx.close(); } catch {} }, 220);
    } catch {}
  };

  const playVoice = () => {
    try {
      window.speechSynthesis.cancel();
      const msg = new SpeechSynthesisUtterance("Human detected");
      msg.rate = 1; msg.pitch = 1; msg.volume = 1;
      window.speechSynthesis.speak(msg);
    } catch {}
  };

  // Trigger alert sound once when new human detected
  const prevCountRef = useRef(0);
  const playAlertOnce = useCallback(() => {
    if (alertSound === "Beep")        playBeep();
    else if (alertSound === "Siren")  playSirenLoop();
    else if (alertSound === "Voice Alert") playVoice();
  }, [alertSound, playSirenLoop]);

  // ── Commands ──────────────────────────────────────────────────────────────
  const sendCommand = useCallback(async (cmd) => {
    if (!token) return;
    setActiveCommand(cmd);
    setCommandHistory(prev => [{ cmd, ts: Date.now() }, ...prev.slice(0, 19)]);
    try {
      await fetch(`${API_BASE}/api/control`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ command: cmd }),
      });
    } catch {}
  }, [token]);

  const stopAllIntervals = useCallback(() => {
    if (cmdIntervalRef.current)   { clearInterval(cmdIntervalRef.current);   cmdIntervalRef.current   = null; }
    if (clickIntervalRef.current) { clearInterval(clickIntervalRef.current); clickIntervalRef.current = null; }
  }, []);

  const startKeyCommand = useCallback((cmd) => {
    sendCommand(cmd);
    if (cmdIntervalRef.current) clearInterval(cmdIntervalRef.current);
    cmdIntervalRef.current = setInterval(() => sendCommand(cmd), 200);
  }, [sendCommand]);

  const stopKeyCommand = useCallback(() => {
    if (cmdIntervalRef.current) { clearInterval(cmdIntervalRef.current); cmdIntervalRef.current = null; }
    sendCommand("STOP");
  }, [sendCommand]);

  const startClickCommand = useCallback((cmd) => {
    sendCommand(cmd);
    if (clickIntervalRef.current) clearInterval(clickIntervalRef.current);
    clickIntervalRef.current = setInterval(() => sendCommand(cmd), 200);
  }, [sendCommand]);

  const stopClickCommand = useCallback(() => {
    if (clickIntervalRef.current) { clearInterval(clickIntervalRef.current); clickIntervalRef.current = null; }
    sendCommand("STOP");
  }, [sendCommand]);

  // ── Keyboard handler for drive modal ──────────────────────────────────────
  useEffect(() => {
    if (!driveModalOpen || driveMode === "AUTO") return;
    let heldKey = null;
    const keyMap = {
      ArrowUp:    "FORWARD",
      ArrowDown:  "BACKWARD",
      ArrowLeft:  "LEFT",
      ArrowRight: "RIGHT",
      " ":        "STOP",
    };
    const onDown = (e) => {
      if (!keyMap[e.key]) return;
      e.preventDefault();
      const cmd = keyMap[e.key];
      if (heldKey === cmd) return;
      heldKey = cmd;
      startKeyCommand(cmd);
    };
    const onUp = (e) => {
      if (!keyMap[e.key]) return;
      e.preventDefault();
      heldKey = null;
      stopKeyCommand();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup",   onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup",   onUp);
      stopAllIntervals();
    };
  }, [driveModalOpen, driveMode, startKeyCommand, stopKeyCommand, stopAllIntervals]);

  // ── Drive mode toggle ─────────────────────────────────────────────────────
  const toggleDriveMode = useCallback(async () => {
    if (!token) return;
    const newMode = driveMode === "MANUAL" ? "AUTO" : "MANUAL";
    try {
      const res = await fetch(`${API_BASE}/api/drive_mode`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ mode: newMode }),
      });
      if (res.ok) setDriveMode(newMode);
    } catch {}
  }, [token, driveMode]);

  // ── mmWave toggle ─────────────────────────────────────────────────────────
  const toggleMmwave = useCallback(async () => {
    if (!token) return;
    const newEnabled = !mmwaveEnabled;
    try {
      const res = await fetch(`${API_BASE}/api/mmwave/toggle`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ enabled: newEnabled }),
      });
      if (res.ok) setMmwaveEnabled(newEnabled);
    } catch {}
  }, [token, mmwaveEnabled]);

  // ── Submit vitals result ──────────────────────────────────────────────────
  const submitVitals = useCallback(async (result) => {
    if (!token) return;
    setVitalsResult(result);
    try {
      await fetch(`${API_BASE}/api/life_confirm`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ result }),
      });
      // Clear the alert on backend
      await fetch(`${API_BASE}/api/alert/clear`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
    // Keep popup open briefly so operator sees their selection, then close
    setTimeout(() => {
      setVitalsPopupOpen(false);
      stopSiren();
      setVitalsResult(null);
    }, 2000);
  }, [token, stopSiren]);

  const dismissVitalsPopup = useCallback(async () => {
    setVitalsPopupOpen(false);
    stopSiren();
    setVitalsResult(null);
    // Clear alert without submitting a life result
    try {
      await fetch(`${API_BASE}/api/alert/clear`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }, [token, stopSiren]);

  // ── Map fetch ─────────────────────────────────────────────────────────────
  const fetchMapState = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/map/state`,
        { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setMapState(await res.json());
    } catch {}
  }, [token]);

  const clearMap = async () => {
    if (!token) return;
    if (!window.confirm("Clear map and all flags?")) return;
    try {
      await fetch(`${API_BASE}/api/map/flags`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      fetchMapState();
    } catch {}
  };

  // ── Map canvas draw ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const ctx   = canvas.getContext("2d");
    const W     = canvas.width;
    const H     = canvas.height;
    const SCALE = 60;
    const ox    = W / 2;
    const oy    = H / 2;
    const wx    = (x) => ox + x * SCALE;
    const wy    = (y) => oy - y * SCALE;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0a1020";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth   = 1;
    for (let gx = ox % SCALE; gx < W; gx += SCALE) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (let gy = oy % SCALE; gy < H; gy += SCALE) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(W, oy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.stroke();

    // Scale bar
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font      = "11px monospace";
    ctx.fillText("1m", ox + SCALE - 14, oy - 4);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath(); ctx.moveTo(ox, oy - 3); ctx.lineTo(ox + SCALE, oy - 3); ctx.stroke();

    // Track
    const track = mapState.track || [];
    if (track.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(59,130,246,0.5)";
      ctx.lineWidth   = 2;
      ctx.moveTo(wx(track[0].x), wy(track[0].y));
      for (let i = 1; i < track.length; i++) {
        ctx.lineTo(wx(track[i].x), wy(track[i].y));
      }
      ctx.stroke();
    }

    // Start dot
    ctx.beginPath();
    ctx.arc(wx(0), wy(0), 6, 0, Math.PI * 2);
    ctx.fillStyle = "#3b82f6";
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.font      = "bold 10px monospace";
    ctx.fillText("START", wx(0) + 8, wy(0) + 4);

    // Flags
    (mapState.flags || []).forEach(flag => {
      const fx  = wx(flag.x);
      const fy  = wy(flag.y);
      const col = FLAG_COLORS[flag.flag_type] || "#888";
      ctx.beginPath();
      ctx.arc(fx, fy, 10, 0, Math.PI * 2);
      ctx.fillStyle   = col + "44";
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth   = 2;
      ctx.stroke();
      ctx.font      = "13px sans-serif";
      ctx.textAlign = "center";
      const icons = { detected:"👁", arrived:"📍", alive:"✅", not_alive:"❌" };
      ctx.fillText(icons[flag.flag_type] || "●", fx, fy + 5);
      ctx.textAlign   = "left";
      ctx.fillStyle   = col;
      ctx.font        = "10px monospace";
      ctx.fillText(flag.label || FLAG_LABELS[flag.flag_type] || flag.flag_type, fx + 13, fy - 2);
      ctx.fillStyle   = "rgba(255,255,255,0.5)";
      ctx.fillText(new Date(flag.ts * 1000).toLocaleTimeString(), fx + 13, fy + 10);
    });

    // Rover icon
    const rx = wx(mapState.rover_x || 0);
    const ry = wy(mapState.rover_y || 0);
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(mapState.rover_heading || 0);
    ctx.fillStyle = "#22c55e";
    ctx.beginPath(); ctx.rect(-8, -12, 16, 24); ctx.fill();
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.moveTo(0, -14); ctx.lineTo(5, -6); ctx.lineTo(-5, -6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }, [mapState]);

  // ── Polling: main state ───────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    let mounted = true;
    const tick = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/state?overlays=${showOverlays ? 1 : 0}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.status === 401) { setToken(null); return; }
        const data = await res.json();
        if (!mounted) return;

        // Human count — set to 0 if no detections (gauge resets)
        const count = typeof data.human_count === "number" ? data.human_count : 0;
        setThermalCount(count);
        setDetections(Array.isArray(data.detections) ? data.detections : []);

        // mmWave
        if (data.mmwave) {
          setMmwaveStatus(data.mmwave.status       || "SENSOR DISABLED");
          setMmwaveRespiration(data.mmwave.respiration_detected || false);
          setMmwaveDistance(typeof data.mmwave.distance === "number"
            ? data.mmwave.distance : 0);
          setMmwaveEnergyMin(data.mmwave.energy_min   || 0);
          setMmwaveEnergyMax(data.mmwave.energy_max   || 0);
          setMmwaveEnergyDelta(data.mmwave.energy_delta || 0);
          setMmwaveEnabled(data.mmwave.enabled === true);
        }

        if (data.drive_mode) setDriveMode(data.drive_mode);

        // Arrival alert — only trigger on new alert (compare ts as integer ms)
        if (data.alert && data.alert.active === true && data.alert.ts > 0) {
          const alertTsMs = Math.round(data.alert.ts * 1000);
          if (alertTsMs !== prevAlertTsRef.current) {
            prevAlertTsRef.current = alertTsMs;
            playSirenLoop();
            setVitalsPopupOpen(true);
          }
        }

        // Sound alert on new human detection
        if (prevCountRef.current === 0 && count > 0) {
          playAlertOnce();
        }
        prevCountRef.current = count;

        if (count > 0) markActivity();

      } catch {}
    };
    tick();
    const id = setInterval(tick, refreshRateMs);
    return () => { mounted = false; clearInterval(id); };
  }, [token, refreshRateMs, showOverlays, playAlertOnce, playSirenLoop, markActivity]);

  // ── Polling: map ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetchMapState();
    const id = setInterval(fetchMapState, 1000);
    return () => clearInterval(id);
  }, [token, fetchMapState]);

  // ── Polling: history ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || tab !== "history") return;
    let mounted = true;
    const load = async () => {
      setHistoryLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/history?limit=${historyLimit}`,
          { headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 401) { setToken(null); return; }
        const data = await res.json();
        if (mounted) setHistoryRows(Array.isArray(data) ? data : []);
      } catch {} finally { if (mounted) setHistoryLoading(false); }
    };
    load();
    const id = setInterval(load, 3000);
    return () => { mounted = false; clearInterval(id); };
  }, [token, tab, historyLimit]);

  // ── Password change ───────────────────────────────────────────────────────
  const changePassword = async () => {
    setPwMsg("");
    if (!curPw || !newPw || !newPw2) { setPwMsg("Fill all fields."); return; }
    if (newPw !== newPw2)            { setPwMsg("Passwords don't match."); return; }
    if (newPw.length < 4)            { setPwMsg("Too short (min 4 chars)."); return; }
    try {
      const res = await fetch(`${API_BASE}/api/password`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ current_password: curPw, new_password: newPw, confirm_password: newPw2 }),
      });
      const data = await res.json().catch(() => ({}));
      setPwMsg(res.ok ? "✅ Password changed." : data?.detail || "Failed.");
      if (res.ok) { setCurPw(""); setNewPw(""); setNewPw2(""); }
    } catch { setPwMsg("Backend unreachable."); }
  };

  const getLifeChance = () => {
    if (mmwaveStatus.includes("LIFE CONFIRMED")) return "HIGH";
    if (mmwaveStatus.includes("LIFE DOUBTFUL"))  return "MEDIUM";
    if (mmwaveStatus.includes("NO PRESENCE"))    return "NO PRESENCE";
    if (mmwaveStatus.includes("DISABLED"))       return "SENSOR OFF";
    return "UNKNOWN";
  };

  const doLogin = async () => {
    setLoginError("");
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ password: password || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setLoginError(data?.detail || `Login failed (${res.status})`); return; }
      if (!data?.token) { setLoginError("Token not received"); return; }
      setToken(data.token);
      setPassword("");
      setLocked(false);
      markActivity();
    } catch { setLoginError("Backend not reachable. Is the server running?"); }
  };

  const latestHistory = historyRows.length > 0 ? historyRows[0] : null;
  const videoSrc      = `${API_BASE}/video?token=${encodeURIComponent(token || "")}`;

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div style={{ background:"#070b14", minHeight:"100vh", display:"grid",
        placeItems:"center", padding:20, color:"white", fontFamily:"system-ui" }}>
        <div style={{ width:420, borderRadius:18, padding:24, border:"1px solid rgba(255,255,255,0.12)",
          background:"rgba(255,255,255,0.04)" }}>
          <div style={{ fontWeight:1000, fontSize:22 }}>
            ROBOSAFE {locked ? "🔒 LOCKED" : "ACCESS"}
          </div>
          <div style={{ opacity:0.7, fontSize:13, marginTop:6 }}>
            Password required to access dashboard
          </div>
          <div style={{ marginTop:16, position:"relative" }}>
            <input autoFocus type={showPw ? "text" : "password"} value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") doLogin(); }}
              placeholder="Password"
              style={{ width:"100%", padding:"12px 44px 12px 14px", borderRadius:14,
                outline:"none", border:"1px solid rgba(255,255,255,0.15)",
                background:"rgba(0,0,0,0.25)", color:"white", fontSize:14 }} />
            <button type="button" onClick={() => setShowPw(v => !v)}
              style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)",
                width:34, height:34, borderRadius:10, border:"1px solid rgba(255,255,255,0.15)",
                background:"rgba(255,255,255,0.06)", color:"white", cursor:"pointer", fontSize:16 }}>
              {showPw ? "🙈" : "👁️"}
            </button>
          </div>
          {loginError && (
            <div style={{ color:"#fb7185", marginTop:10, fontSize:13 }}>{loginError}</div>
          )}
          <button onClick={doLogin}
            style={{ marginTop:14, width:"100%", padding:"12px 14px", borderRadius:14,
              border:"1px solid rgba(59,130,246,0.45)", background:"rgba(59,130,246,0.25)",
              fontWeight:900, color:"white", cursor:"pointer", fontSize:15 }}>
            ENTER DASHBOARD
          </button>
          <div style={{ marginTop:10, fontSize:12, opacity:0.55 }}>
            Auto-locks after 30 seconds of inactivity
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN DASHBOARD
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="appShell" style={{ "--bg": bgColor }}>

      {/* ── VITALS POPUP (rover arrived at human) ───────────────────────── */}
      {vitalsPopupOpen && (
        <div style={{ position:"fixed", inset:0, zIndex:100,
          background:"rgba(0,0,0,0.90)", display:"flex",
          alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#0f1a2b", border:"2px solid #ef4444",
            borderRadius:24, padding:36, maxWidth:480, width:"90%", textAlign:"center" }}>
            <div style={{ fontSize:64, marginBottom:12 }}>🚨</div>
            <div style={{ fontSize:22, fontWeight:1000, color:"#ef4444", letterSpacing:1 }}>
              ROVER ARRIVED AT HUMAN
            </div>
            <div style={{ opacity:0.75, marginTop:8, fontSize:14 }}>
              Siren is active. Check for life signs using the mmWave sensor,
              then confirm the vitals result below.
            </div>

            {/* mmWave live status in popup */}
            <div style={{ marginTop:20, padding:14, borderRadius:14,
              border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize:13, opacity:0.7, marginBottom:6 }}>mmWave Sensor</div>
              <div style={{ fontSize:15, fontWeight:900,
                color: mmwaveEnabled ? "#22c55e" : "#ef4444", marginBottom:8 }}>
                {mmwaveEnabled ? "🟢 SENSOR ON" : "🔴 SENSOR OFF"}
              </div>
              <div style={{ fontSize:13, opacity:0.85, marginBottom:10 }}>{mmwaveStatus}</div>
              <button onClick={toggleMmwave}
                style={{ width:"100%", padding:"10px 0", borderRadius:12,
                  border: mmwaveEnabled ? "2px solid #ef4444" : "2px solid #22c55e",
                  background: mmwaveEnabled ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
                  color: mmwaveEnabled ? "#ef4444" : "#22c55e",
                  fontWeight:900, fontSize:14, cursor:"pointer" }}>
                {mmwaveEnabled ? "🔴 TURN OFF mmWave" : "🟢 TURN ON mmWave"}
              </button>
            </div>

            {/* Energy readings */}
            {mmwaveEnabled && (
              <div style={{ marginTop:12, display:"grid",
                gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                {[["Min", mmwaveEnergyMin], ["Max", mmwaveEnergyMax],
                  ["Delta", mmwaveEnergyDelta]].map(([lbl, val]) => (
                  <div key={lbl} style={{ padding:10, borderRadius:12,
                    border:"1px solid rgba(255,255,255,0.1)",
                    background:"rgba(255,255,255,0.04)" }}>
                    <div style={{ fontSize:11, opacity:0.6 }}>Energy {lbl}</div>
                    <div style={{ fontSize:20, fontWeight:1000 }}>{val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Vitals confirmation buttons */}
            {vitalsResult ? (
              <div style={{ marginTop:20, padding:14, borderRadius:14,
                border:`2px solid ${vitalsResult === "alive" ? "#22c55e" : "#ef4444"}`,
                background: vitalsResult === "alive"
                  ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                fontWeight:900, fontSize:16,
                color: vitalsResult === "alive" ? "#22c55e" : "#ef4444" }}>
                {vitalsResult === "alive" ? "✅ CONFIRMED ALIVE — Rover will continue scanning" : "❌ CONFIRMED NOT ALIVE — Rover will continue scanning"}
              </div>
            ) : (
              <div style={{ marginTop:20, display:"grid",
                gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <button onClick={() => submitVitals("alive")}
                  style={{ padding:"14px 0", borderRadius:14,
                    border:"2px solid #22c55e", background:"rgba(34,197,94,0.2)",
                    color:"#22c55e", fontWeight:900, fontSize:15, cursor:"pointer" }}>
                  ✅ ALIVE
                </button>
                <button onClick={() => submitVitals("not_alive")}
                  style={{ padding:"14px 0", borderRadius:14,
                    border:"2px solid #ef4444", background:"rgba(239,68,68,0.2)",
                    color:"#ef4444", fontWeight:900, fontSize:15, cursor:"pointer" }}>
                  ❌ NOT ALIVE
                </button>
              </div>
            )}

            <button onClick={dismissVitalsPopup}
              style={{ marginTop:14, width:"100%", padding:"10px 0", borderRadius:12,
                border:"1px solid rgba(255,255,255,0.2)",
                background:"rgba(255,255,255,0.06)",
                color:"white", cursor:"pointer", fontSize:13 }}>
              ✕ Dismiss & Stop Siren
            </button>
          </div>
        </div>
      )}

      {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <button className={`navItem ${tab==="home"    ?"active":""}`} onClick={() => setTab("home")}>🏠 Home</button>
        <button className={`navItem ${tab==="map"     ?"active":""}`} onClick={() => setTab("map")}>🗺 Map</button>
        <button className={`navItem ${tab==="history" ?"active":""}`} onClick={() => setTab("history")}>📋 History</button>
        <button className={`navItem ${tab==="settings"?"active":""}`} onClick={() => setTab("settings")}>⚙️ Settings</button>
        <button className="navItem" onClick={() => setDriveModalOpen(true)}
          style={{ background:"rgba(34,197,94,0.18)", borderColor:"rgba(34,197,94,0.32)",
            color:"#22c55e", fontWeight:900 }}>
          🚗 DRIVE
        </button>
      </aside>

      {/* ── MAIN CONTENT ────────────────────────────────────────────────── */}
      <div className="main">

        {/* Topbar */}
        <div className="topbar">
          <div className="brand">ROBOSAFE</div>
          <div className="topActions">
            <button onClick={toggleDriveMode}
              style={{ padding:"8px 16px", borderRadius:12,
                border:`2px solid ${driveMode==="AUTO"?"rgba(34,197,94,0.6)":"rgba(245,158,11,0.6)"}`,
                background: driveMode==="AUTO"?"rgba(34,197,94,0.15)":"rgba(245,158,11,0.15)",
                color:"white", fontWeight:900, fontSize:13, cursor:"pointer" }}>
              {driveMode === "AUTO" ? "🤖 AUTO" : "🕹 MANUAL"}
            </button>
            {sirenActive && (
              <button onClick={stopSiren}
                style={{ padding:"8px 14px", borderRadius:12,
                  border:"2px solid #ef4444", background:"rgba(239,68,68,0.2)",
                  color:"#ef4444", fontWeight:900, fontSize:13, cursor:"pointer" }}>
                🔇 STOP SIREN
              </button>
            )}
            <span style={{ fontSize:12, opacity:0.7 }}>Alert: {alertSound}</span>
            <button className="iconBtn" title="Lock"
              onClick={() => { setLocked(true); setToken(null); stopAllIntervals(); }}>
              🔒
            </button>
          </div>
        </div>

        <div className="page">

          {/* ── HOME ──────────────────────────────────────────────────────── */}
          {tab === "home" && (
            <>
              <div className="gridRow1">

                {/* Thermal / YOLO detection gauge */}
                <div className="card">
                  <div className="gaugeWrap">
                    <Gauge value={thermalCount} color="blue" />
                  </div>
                  <div className="cardTitle" style={{ textAlign:"center" }}>
                    CAMERA DETECTION
                  </div>
                  <div className="cardSub" style={{ textAlign:"center" }}>
                    {thermalCount === 0
                      ? "No humans in frame"
                      : `${thermalCount} human${thermalCount > 1 ? "s" : ""} detected`}
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <span className="btnPill"
                      onClick={() => setDetailsModalOpen(true)}
                      style={{ cursor:"pointer" }}>
                      VIEW DETAILS
                    </span>
                  </div>
                </div>

                {/* mmWave */}
                <div className="card">
                  <div className="gaugeWrap">
                    <ConfirmationBadge status={mmwaveStatus} respiration={mmwaveRespiration} />
                  </div>
                  <div className="cardTitle" style={{ textAlign:"center" }}>
                    MM WAVE SENSOR
                  </div>
                  <div className="cardSub" style={{ textAlign:"center" }}>
                    {mmwaveStatus}
                  </div>
                  <div style={{ textAlign:"center", display:"flex", gap:8,
                    justifyContent:"center", flexWrap:"wrap" }}>
                    <span className="btnPill"
                      onClick={() => setLifeModalOpen(true)}
                      style={{ cursor:"pointer" }}>
                      VIEW READINGS
                    </span>
                    <span className="btnPill" onClick={toggleMmwave}
                      style={{ cursor:"pointer",
                        background: mmwaveEnabled
                          ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                        borderColor: mmwaveEnabled
                          ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)" }}>
                      {mmwaveEnabled ? "🟢 ON" : "🔴 OFF"}
                    </span>
                  </div>
                </div>

                {/* Live camera */}
                <div className="card">
                  <div className="liveCardTop">
                    <div className="liveBadge">
                      <span className="dot" />
                      <div className="cardTitle">LIVE CAMERA</div>
                    </div>
                    <button className="iconBtn" style={{ width:130 }}
                      onClick={() => setCameraModalOpen(true)}>
                      FULL SCREEN
                    </button>
                  </div>
                  {/* MJPEG stream via <img> — works in Chrome/Firefox/Safari */}
                  <div className="preview" onClick={() => {
                    if (autoFullscreen) setCameraModalOpen(true);
                  }}>
                    <img
                      src={videoSrc}
                      alt="Live Feed"
                      style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}
                    />
                  </div>
                </div>
              </div>

              {/* KPI strip */}
              <div className="kpiStrip">
                👁 {thermalCount} Detected &nbsp;|&nbsp;
                📡 mmWave: {mmwaveStatus} &nbsp;|&nbsp;
                📏 Dist: {Number(mmwaveDistance).toFixed(2)}m &nbsp;|&nbsp;
                🚗 Mode: <strong style={{ color: driveMode==="AUTO"?"#22c55e":"#f59e0b" }}>
                  {driveMode}
                </strong>
              </div>
            </>
          )}

          {/* ── MAP ───────────────────────────────────────────────────────── */}
          {tab === "map" && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:10 }}>
                <div>
                  <div style={{ fontWeight:1000, fontSize:18 }}>🗺 Rescue Map</div>
                  <div style={{ fontSize:12, opacity:0.6, marginTop:4 }}>
                    Rover: ({(mapState.rover_x||0).toFixed(2)}m, {(mapState.rover_y||0).toFixed(2)}m)
                    &nbsp;·&nbsp; {(mapState.flags||[]).length} flag(s)
                  </div>
                </div>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                  {Object.entries(FLAG_LABELS).map(([k, v]) => (
                    <div key={k} style={{ display:"flex", alignItems:"center",
                      gap:6, fontSize:12 }}>
                      <div style={{ width:12, height:12, borderRadius:999,
                        background: FLAG_COLORS[k] }} />
                      <span style={{ opacity:0.8 }}>{v}</span>
                    </div>
                  ))}
                  <button onClick={clearMap}
                    style={{ padding:"8px 14px", borderRadius:10,
                      border:"1px solid rgba(239,68,68,0.4)",
                      background:"rgba(239,68,68,0.12)",
                      color:"white", cursor:"pointer", fontSize:12, fontWeight:900 }}>
                    CLEAR MAP
                  </button>
                </div>
              </div>
              <div style={{ borderRadius:22, overflow:"hidden",
                border:"1px solid rgba(255,255,255,0.1)" }}>
                <canvas ref={mapCanvasRef} width={900} height={560}
                  style={{ display:"block", width:"100%", background:"#0a1020" }} />
              </div>
              {(mapState.flags||[]).length > 0 && (
                <div style={{ marginTop:14, display:"grid", gap:8 }}>
                  <div style={{ fontWeight:900, fontSize:14, opacity:0.75 }}>FLAG LOG</div>
                  {[...(mapState.flags||[])].reverse().map((flag, i) => (
                    <div key={flag.id || i}
                      style={{ display:"flex", alignItems:"center", gap:12,
                        padding:"10px 14px", borderRadius:14,
                        border:"1px solid rgba(255,255,255,0.08)",
                        background:"rgba(255,255,255,0.03)" }}>
                      <div style={{ width:12, height:12, borderRadius:999, flexShrink:0,
                        background: FLAG_COLORS[flag.flag_type] || "#888" }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:900, fontSize:13 }}>
                          {FLAG_LABELS[flag.flag_type] || flag.flag_type}
                        </div>
                        <div style={{ fontSize:11, opacity:0.6 }}>
                          {flag.label} · ({(flag.x||0).toFixed(2)}m, {(flag.y||0).toFixed(2)}m)
                        </div>
                      </div>
                      <div style={{ fontSize:11, opacity:0.5 }}>
                        {new Date(flag.ts * 1000).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── HISTORY ───────────────────────────────────────────────────── */}
          {tab === "history" && (
            <div className="settingsCard">
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", gap:12, flexWrap:"wrap" }}>
                <div>
                  <div style={{ fontWeight:1000, fontSize:18 }}>Detection History</div>
                  <div style={{ marginTop:6, opacity:0.7, fontSize:13 }}>
                    All human detection events logged
                  </div>
                </div>
                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  <div style={{ fontSize:12, opacity:0.75 }}>Limit</div>
                  <select value={historyLimit}
                    onChange={e => setHistoryLimit(Number(e.target.value))}
                    style={{ background:"rgba(255,255,255,0.06)", color:"white",
                      border:"1px solid rgba(255,255,255,0.12)",
                      padding:"8px 10px", borderRadius:10, outline:"none" }}>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                  </select>
                  <button className="iconBtn"
                    style={{ width:160, background:"rgba(239,68,68,0.18)",
                      border:"1px solid rgba(239,68,68,0.35)" }}
                    onClick={async () => {
                      if (!window.confirm("Delete all history?")) return;
                      try {
                        await fetch(`${API_BASE}/api/history`, {
                          method:"DELETE",
                          headers:{ Authorization:`Bearer ${token}` },
                        });
                        setHistoryRows([]);
                      } catch {}
                    }}>
                    DELETE HISTORY
                  </button>
                </div>
              </div>

              <div style={{ marginTop:16, display:"grid",
                gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
                <div className="card" style={{ padding:14 }}>
                  <div className="cardTitle">TOTAL ENTRIES</div>
                  <div style={{ fontSize:28, fontWeight:1000, marginTop:6 }}>
                    {historyLoading ? "…" : historyRows.length}
                  </div>
                </div>
                <div className="card" style={{ padding:14 }}>
                  <div className="cardTitle">LATEST COUNT</div>
                  <div style={{ fontSize:28, fontWeight:1000, marginTop:6 }}>
                    {latestHistory ? latestHistory.count : 0}
                  </div>
                </div>
                <div className="card" style={{ padding:14 }}>
                  <div className="cardTitle">LATEST TIME</div>
                  <div style={{ fontSize:14, opacity:0.85, marginTop:10 }}>
                    {latestHistory
                      ? new Date(latestHistory.ts * 1000).toLocaleString()
                      : "N/A"}
                  </div>
                </div>
              </div>

              {/* Row list */}
              <div style={{ marginTop:16, display:"grid", gap:6 }}>
                {historyRows.map((r, i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between",
                    padding:"10px 14px", borderRadius:12,
                    border:"1px solid rgba(255,255,255,0.07)",
                    background:"rgba(255,255,255,0.03)", fontSize:13 }}>
                    <span style={{ fontWeight:900 }}>{r.count} human{r.count !== 1 ? "s" : ""}</span>
                    <span style={{ opacity:0.6 }}>{r.source}</span>
                    <span style={{ opacity:0.5 }}>
                      {new Date(r.ts * 1000).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SETTINGS ──────────────────────────────────────────────────── */}
          {tab === "settings" && (
            <div className="settingsCard">
              <div style={{ fontWeight:1000, fontSize:18 }}>Settings</div>
              <div style={{ marginTop:16, display:"grid", gap:14 }}>
                <div className="formRow">
                  <label>Dashboard Background Color</label>
                  <input type="color" value={bgColor}
                    onChange={e => setBgColor(e.target.value)} />
                </div>
                <div className="formRow">
                  <label>Alert Sound</label>
                  <select value={alertSound}
                    onChange={e => setAlertSound(e.target.value)}>
                    <option>Beep</option>
                    <option>Siren</option>
                    <option>Voice Alert</option>
                  </select>
                </div>
                <div className="formRow">
                  <label>Auto Full-Screen on Live Feed Click</label>
                  <select value={autoFullscreen ? "Yes" : "No"}
                    onChange={e => setAutoFullscreen(e.target.value === "Yes")}>
                    <option>No</option><option>Yes</option>
                  </select>
                </div>
                <div className="formRow">
                  <label>UI Refresh Rate (ms) — currently {refreshRateMs}ms</label>
                  <input type="range" min="100" max="2000" step="50"
                    value={refreshRateMs}
                    onChange={e => setRefreshRateMs(Number(e.target.value))} />
                </div>
                <div className="formRow">
                  <label>Detection Confidence Threshold — {Math.round(confidenceThreshold * 100)}%</label>
                  <input type="range" min="0" max="1" step="0.01"
                    value={confidenceThreshold}
                    onChange={e => setConfidenceThreshold(Number(e.target.value))} />
                </div>
                <div className="formRow">
                  <label>Show Detection Overlay Labels</label>
                  <select value={showOverlays ? "Yes" : "No"}
                    onChange={e => setShowOverlays(e.target.value === "Yes")}>
                    <option>Yes</option><option>No</option>
                  </select>
                </div>

                {/* Password change */}
                <div style={{ marginTop:8, padding:16, borderRadius:14,
                  border:"1px solid rgba(255,255,255,0.10)",
                  background:"rgba(255,255,255,0.03)" }}>
                  <div style={{ fontWeight:1000, marginBottom:12 }}>Change Password</div>
                  <PwRow label="Current Password" value={curPw}  setValue={setCurPw}
                    show={showCurPw}  setShow={setShowCurPw} />
                  <PwRow label="New Password"     value={newPw}  setValue={setNewPw}
                    show={showNewPw}  setShow={setShowNewPw} />
                  <PwRow label="Confirm Password" value={newPw2} setValue={setNewPw2}
                    show={showNewPw2} setShow={setShowNewPw2} />
                  {pwMsg && (
                    <div style={{ marginTop:10, fontSize:13, opacity:0.9 }}>{pwMsg}</div>
                  )}
                  <button className="iconBtn" style={{ width:220, marginTop:12 }}
                    onClick={changePassword}>
                    UPDATE PASSWORD
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODALS ──────────────────────────────────────────────────────────── */}

      {/* Camera fullscreen */}
      {cameraModalOpen && (
        <div className="modalOverlay" onClick={() => setCameraModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modalTop">
              <div style={{ fontWeight:1000 }}>📷 LIVE CAMERA</div>
              <button className="iconBtn" onClick={() => setCameraModalOpen(false)}>✕</button>
            </div>
            <div className="modalBody">
              <div className="modalVideo">
                <img src={videoSrc} alt="Live Full"
                  style={{ width:"100%", height:"100%", objectFit:"contain" }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detection details */}
      {detailsModalOpen && (
        <div className="modalOverlay" onClick={() => setDetailsModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modalTop">
              <div style={{ fontWeight:1000 }}>👁 DETECTION DETAILS</div>
              <button className="iconBtn" onClick={() => setDetailsModalOpen(false)}>✕</button>
            </div>
            <div className="modalBody" style={{ padding:24, overflow:"auto",
              flexDirection:"column" }}>
              <div style={{ fontSize:52, fontWeight:1000 }}>{thermalCount}</div>
              <div style={{ fontSize:18, opacity:0.8, marginTop:8 }}>
                {thermalCount === 0 ? "No humans in frame" : `Human${thermalCount > 1 ? "s" : ""} in frame`}
              </div>
              {detections.map((d, i) => (
                <div key={i} style={{ padding:14, marginTop:12, borderRadius:14,
                  border:"1px solid rgba(255,255,255,0.1)",
                  background:"rgba(255,255,255,0.04)" }}>
                  <div style={{ fontWeight:900 }}>Human {i + 1}</div>
                  <div style={{ fontSize:12, opacity:0.7, marginTop:4 }}>
                    Confidence: {Math.round((d.confidence || 0) * 100)}%
                  </div>
                  {d.bbox && (
                    <div style={{ fontSize:11, opacity:0.5, marginTop:2 }}>
                      Bbox: [{d.bbox.join(", ")}]
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* mmWave readings */}
      {lifeModalOpen && (
        <div className="modalOverlay" onClick={() => setLifeModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modalTop">
              <div style={{ fontWeight:1000 }}>📡 mmWave READINGS</div>
              <button className="iconBtn" onClick={() => setLifeModalOpen(false)}>✕</button>
            </div>
            <div className="modalBody" style={{ padding:24, overflow:"auto",
              flexDirection:"column" }}>
              {/* Life chance badge */}
              <div style={{ padding:20, borderRadius:14, textAlign:"center",
                background: getLifeChance()==="HIGH"
                  ? "rgba(34,197,94,0.15)"
                  : getLifeChance()==="MEDIUM"
                  ? "rgba(245,158,11,0.15)"
                  : "rgba(100,100,100,0.15)",
                border:`2px solid ${getLifeChance()==="HIGH"
                  ? "rgba(34,197,94,0.45)"
                  : getLifeChance()==="MEDIUM"
                  ? "rgba(245,158,11,0.45)"
                  : "rgba(150,150,150,0.35)"}` }}>
                <div style={{ fontSize:32, fontWeight:1000 }}>{getLifeChance()}</div>
                <div style={{ fontSize:14, opacity:0.85, marginTop:6 }}>Chance of Life</div>
              </div>

              {/* Energy readings */}
              {[["Energy Min", mmwaveEnergyMin],
                ["Energy Max", mmwaveEnergyMax],
                ["Energy Delta", mmwaveEnergyDelta]].map(([lbl, val]) => (
                <div key={lbl} style={{ padding:14, borderRadius:14, marginTop:10,
                  border:"1px solid rgba(255,255,255,0.1)",
                  background:"rgba(255,255,255,0.04)" }}>
                  <div style={{ fontSize:12, opacity:0.65 }}>{lbl}</div>
                  <div style={{ fontSize:24, fontWeight:1000 }}>{val}</div>
                  {lbl === "Energy Delta" && (
                    <div style={{ fontSize:11, opacity:0.55, marginTop:4 }}>
                      ≥ 3 indicates breathing
                    </div>
                  )}
                </div>
              ))}
              <div style={{ padding:14, borderRadius:14, marginTop:10,
                border:"1px solid rgba(255,255,255,0.1)",
                background:"rgba(255,255,255,0.04)" }}>
                <div style={{ fontSize:12, opacity:0.65 }}>Distance</div>
                <div style={{ fontSize:28, fontWeight:1000 }}>
                  {Number(mmwaveDistance).toFixed(2)}m
                </div>
              </div>

              {/* Toggle button */}
              <div style={{ marginTop:16, textAlign:"center" }}>
                <span className="btnPill" onClick={toggleMmwave} style={{ cursor:"pointer",
                  background: mmwaveEnabled ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
                  borderColor: mmwaveEnabled ? "rgba(239,68,68,0.35)" : "rgba(34,197,94,0.35)" }}>
                  {mmwaveEnabled ? "🔴 TURN OFF mmWave" : "🟢 TURN ON mmWave"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drive modal */}
      {driveModalOpen && (
        <div className="modalOverlay" onClick={() => { setDriveModalOpen(false); stopAllIntervals(); }}>
          <div className="modal" onClick={e => e.stopPropagation()}
            style={{ height:"min(820px,94vh)" }}>
            <div className="modalTop">
              <div style={{ fontWeight:1000 }}>🚗 ROVER CONTROL</div>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <button onClick={toggleDriveMode}
                  style={{ padding:"6px 14px", borderRadius:10,
                    border:`2px solid ${driveMode==="AUTO"?"rgba(34,197,94,0.6)":"rgba(245,158,11,0.6)"}`,
                    background: driveMode==="AUTO"?"rgba(34,197,94,0.15)":"rgba(245,158,11,0.15)",
                    color:"white", fontWeight:900, fontSize:12, cursor:"pointer" }}>
                  {driveMode==="AUTO" ? "🤖 AUTO" : "🕹 MANUAL"}
                </button>
                <button className="iconBtn"
                  onClick={() => { setDriveModalOpen(false); stopAllIntervals(); }}>
                  ✕
                </button>
              </div>
            </div>
            <div className="modalBody" style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr" }}>
              {/* Camera side */}
              <div className="modalVideo">
                <img src={videoSrc} alt="Rover Camera"
                  style={{ width:"100%", height:"100%", objectFit:"contain" }} />
              </div>
              {/* Controls side */}
              <div style={{ padding:18, background:"rgba(0,0,0,0.45)",
                display:"flex", flexDirection:"column", gap:14, overflow:"auto" }}>

                {driveMode === "AUTO" ? (
                  <div style={{ textAlign:"center", padding:28, borderRadius:16,
                    border:"2px solid rgba(34,197,94,0.4)",
                    background:"rgba(34,197,94,0.08)" }}>
                    <div style={{ fontSize:40 }}>🤖</div>
                    <div style={{ fontWeight:1000, fontSize:16, marginTop:10,
                      color:"#22c55e" }}>AUTO DRIVE ACTIVE</div>
                    <div style={{ fontSize:12, opacity:0.7, marginTop:8 }}>
                      Jetson is controlling the rover
                    </div>
                    <div style={{ fontSize:12, opacity:0.55, marginTop:4 }}>
                      Switch to MANUAL to take control
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <div style={{ fontWeight:1000, fontSize:14 }}>KEYBOARD CONTROLS</div>
                      <div style={{ fontSize:12, opacity:0.65, marginTop:4 }}>
                        Hold arrow keys to drive · Release to stop
                      </div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                      <div />
                      <ControlButton label="⬆ FWD"  active={activeCommand==="FORWARD"}
                        onMouseDown={() => startClickCommand("FORWARD")}
                        onMouseUp={stopClickCommand} onMouseLeave={stopClickCommand}
                        onTouchStart={e => { e.preventDefault(); startClickCommand("FORWARD"); }}
                        onTouchEnd={stopClickCommand} />
                      <div />
                      <ControlButton label="⬅ LEFT" active={activeCommand==="LEFT"}
                        onMouseDown={() => startClickCommand("LEFT")}
                        onMouseUp={stopClickCommand} onMouseLeave={stopClickCommand}
                        onTouchStart={e => { e.preventDefault(); startClickCommand("LEFT"); }}
                        onTouchEnd={stopClickCommand} />
                      <ControlButton label="⏹ STOP" active={activeCommand==="STOP"}
                        onMouseDown={() => startClickCommand("STOP")}
                        onMouseUp={stopClickCommand} onMouseLeave={stopClickCommand}
                        onTouchStart={e => { e.preventDefault(); startClickCommand("STOP"); }}
                        onTouchEnd={stopClickCommand} variant="stop" />
                      <ControlButton label="➡ RIGHT" active={activeCommand==="RIGHT"}
                        onMouseDown={() => startClickCommand("RIGHT")}
                        onMouseUp={stopClickCommand} onMouseLeave={stopClickCommand}
                        onTouchStart={e => { e.preventDefault(); startClickCommand("RIGHT"); }}
                        onTouchEnd={stopClickCommand} />
                      <div />
                      <ControlButton label="⬇ BWD"  active={activeCommand==="BACKWARD"}
                        onMouseDown={() => startClickCommand("BACKWARD")}
                        onMouseUp={stopClickCommand} onMouseLeave={stopClickCommand}
                        onTouchStart={e => { e.preventDefault(); startClickCommand("BACKWARD"); }}
                        onTouchEnd={stopClickCommand} />
                      <div />
                    </div>
                  </>
                )}

                {/* Active command display */}
                <div style={{ padding:12, borderRadius:12,
                  border:"1px solid rgba(255,255,255,0.10)",
                  background:"rgba(255,255,255,0.03)" }}>
                  <div style={{ fontSize:12, opacity:0.65 }}>ACTIVE COMMAND</div>
                  <div style={{ fontSize:20, fontWeight:1000, marginTop:4,
                    color: activeCommand==="STOP" ? "#ef4444" : "#22c55e" }}>
                    {activeCommand}
                  </div>
                </div>

                {/* Command log */}
                <div style={{ flex:1, overflow:"hidden", display:"flex",
                  flexDirection:"column" }}>
                  <div style={{ fontSize:12, fontWeight:900, opacity:0.65 }}>
                    COMMAND LOG
                  </div>
                  <div style={{ marginTop:6, flex:1, overflowY:"auto", fontSize:11,
                    fontFamily:"monospace", background:"rgba(0,0,0,0.35)",
                    borderRadius:10, padding:10,
                    border:"1px solid rgba(255,255,255,0.07)" }}>
                    {commandHistory.length === 0 && (
                      <div style={{ opacity:0.4 }}>No commands yet</div>
                    )}
                    {commandHistory.map((entry, idx) => (
                      <div key={idx} style={{ padding:"3px 0",
                        borderBottom: idx < commandHistory.length - 1
                          ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                        <span style={{ opacity:0.5 }}>
                          {new Date(entry.ts).toLocaleTimeString()}
                        </span>
                        {" → "}
                        <span style={{ color: entry.cmd === "STOP"
                          ? "#ef4444" : "#22c55e" }}>
                          {entry.cmd}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function ConfirmationBadge({ status, respiration }) {
  const isConfirmed = status?.includes("LIFE CONFIRMED");
  const isDoubtful  = status?.includes("LIFE DOUBTFUL");
  const isDisabled  = status?.includes("DISABLED");
  return (
    <div style={{ width:220, height:110, borderRadius:20, display:"flex",
      flexDirection:"column", alignItems:"center", justifyContent:"center",
      background: isConfirmed ? "rgba(34,197,94,0.15)"
                : isDoubtful  ? "rgba(245,158,11,0.15)"
                : "rgba(100,100,100,0.15)",
      border:`2px solid ${isConfirmed ? "rgba(34,197,94,0.45)"
                        : isDoubtful  ? "rgba(245,158,11,0.45)"
                        : "rgba(150,150,150,0.35)"}`,
      boxShadow: isConfirmed ? "0 0 30px rgba(34,197,94,0.25)" : "none" }}>
      <div style={{ fontSize:48, marginBottom:6 }}>
        {isDisabled ? "⚫" : isConfirmed ? "✓" : isDoubtful ? "⚠" : "○"}
      </div>
      <div style={{ fontSize:11, fontWeight:900, textAlign:"center",
        color: isConfirmed ? "rgba(34,197,94,0.95)"
             : isDoubtful  ? "rgba(245,158,11,0.95)"
             : "rgba(150,150,150,0.85)" }}>
        {status}
      </div>
      {respiration && (
        <div style={{ fontSize:10, opacity:0.75, marginTop:4 }}>♥ Breathing detected</div>
      )}
    </div>
  );
}

function ControlButton({ label, active, variant, onMouseDown, onMouseUp,
  onMouseLeave, onTouchStart, onTouchEnd }) {
  return (
    <button
      onMouseDown={onMouseDown} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      style={{ height:68, borderRadius:14,
        border: active ? "2px solid rgba(34,197,94,0.65)"
                       : "1px solid rgba(255,255,255,0.12)",
        background: active   ? "rgba(34,197,94,0.25)"
                  : variant === "stop" ? "rgba(239,68,68,0.15)"
                  : "rgba(255,255,255,0.05)",
        color:"white", cursor:"pointer", fontWeight:900, fontSize:12,
        boxShadow: active ? "0 0 18px rgba(34,197,94,0.30)" : "none",
        transition:"all 0.12s ease", userSelect:"none",
        WebkitUserSelect:"none", touchAction:"none" }}>
      {label}
    </button>
  );
}

function PwRow({ label, value, setValue, show, setShow }) {
  return (
    <div style={{ marginTop:10 }}>
      <label style={{ fontSize:12, opacity:0.75 }}>{label}</label>
      <div style={{ marginTop:6, position:"relative" }}>
        <input type={show ? "text" : "password"} value={value}
          onChange={e => setValue(e.target.value)} placeholder={label}
          style={{ width:"100%", padding:"10px 44px 10px 12px", borderRadius:12,
            outline:"none", border:"1px solid rgba(255,255,255,0.15)",
            background:"rgba(0,0,0,0.25)", color:"white", fontSize:13 }} />
        <button type="button" onClick={() => setShow(v => !v)}
          style={{ position:"absolute", right:10, top:"50%",
            transform:"translateY(-50%)", width:34, height:34, borderRadius:10,
            border:"1px solid rgba(255,255,255,0.15)",
            background:"rgba(255,255,255,0.06)",
            color:"white", cursor:"pointer", fontSize:15 }}>
          {show ? "🙈" : "👁️"}
        </button>
      </div>
    </div>
  );
}

function Gauge({ value, color }) {
  const accent = color === "yellow" ? "var(--yellow)" : "var(--blue)";
  const max    = 6;
  const deg    = (Math.max(0, Math.min(value, max)) / max) * 180;
  return (
    <div className="gauge">
      <div className="gaugeFill" style={{
        background:`conic-gradient(${accent} 0deg ${deg}deg,
          rgba(255,255,255,0.12) ${deg}deg 360deg)` }} />
      <div className="gaugeInner" />
      <div className="gaugeValue">{value}</div>
    </div>
  );
}