import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";

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

export default function App() {
  // ── auth ──────────────────────────────────────────────────────────────────
  const [token,      setToken]      = useState(null);
  const [password,   setPassword]   = useState("");
  const [showPw,     setShowPw]     = useState(false);
  const [loginError, setLoginError] = useState("");
  const [locked,     setLocked]     = useState(false);
  const lastActivityRef = useRef(Date.now());
  const LOCK_TIMEOUT_MS = 30_000;

  // ── tabs & modals ─────────────────────────────────────────────────────────
  const [tab,                    setTab]                    = useState("home");
  const [modalOpen,              setModalOpen]              = useState(false);
  const [driveModalOpen,         setDriveModalOpen]         = useState(false);
  const [detailsModalOpen,       setDetailsModalOpen]       = useState(false);
  const [lifeDetectionModalOpen, setLifeDetectionModalOpen] = useState(false);

  // ── settings ──────────────────────────────────────────────────────────────
  const [alertSound,          setAlertSound]          = useState("Siren");
  const [bgColor,             setBgColor]             = useState("#0a1020");
  const [autoFullscreen,      setAutoFullscreen]      = useState(false);
  const [refreshRateMs,       setRefreshRateMs]       = useState(250);
  const [showOverlays,        setShowOverlays]        = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);

  // ── detection state ───────────────────────────────────────────────────────
  const [thermalCount,      setThermalCount]      = useState(0);
  const [detections,        setDetections]        = useState([]);
  const [mmwaveStatus,      setMmwaveStatus]      = useState("SENSOR DISABLED");
  const [mmwaveRespiration, setMmwaveRespiration] = useState(false);
  const [mmwaveDistance,    setMmwaveDistance]    = useState(0);
  const [mmwaveEnergyMin,   setMmwaveEnergyMin]   = useState(0);
  const [mmwaveEnergyMax,   setMmwaveEnergyMax]   = useState(0);
  const [mmwaveEnergyDelta, setMmwaveEnergyDelta] = useState(0);
  const [mmwaveEnabled,     setMmwaveEnabled]     = useState(false); // OFF by default

  // ── drive mode ────────────────────────────────────────────────────────────
  const [driveMode,      setDriveMode]      = useState("MANUAL");
  const [activeCommand,  setActiveCommand]  = useState("STOP");
  const [commandHistory, setCommandHistory] = useState([]);

  // ── map state ─────────────────────────────────────────────────────────────
  const [mapState, setMapState] = useState({
    rover_x: 0, rover_y: 0, rover_heading: 0, flags: [], track: [],
  });
  const mapCanvasRef = useRef(null);

  // ── alert / siren + mmwave popup ──────────────────────────────────────────
  const [sirenActive,    setSirenActive]    = useState(false);
  const [arrivalPopup,   setArrivalPopup]   = useState(false); // popup shown on arrival
  const sirenRef = useRef(null);
  const prevAlertTsRef = useRef(0);

  // ── history ───────────────────────────────────────────────────────────────
  const [historyRows,    setHistoryRows]    = useState([]);
  const [historyLimit,   setHistoryLimit]   = useState(200);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── password change ───────────────────────────────────────────────────────
  const [curPw,     setCurPw]    = useState("");
  const [newPw,     setNewPw]    = useState("");
  const [newPw2,    setNewPw2]   = useState("");
  const [pwMsg,     setPwMsg]    = useState("");
  const [showCurPw, setShowCurPw]= useState(false);
  const [showNewPw, setShowNewPw]= useState(false);
  const [showNewPw2,setShowNewPw2]=useState(false);

  const commandIntervalRef = useRef(null);
  const clickIntervalRef   = useRef(null);
  const prevCountRef       = useRef(0);

  // ── activity / lock ───────────────────────────────────────────────────────
  const markActivity = () => {
    lastActivityRef.current = Date.now();
    if (locked) setLocked(false);
  };

  // ── siren ─────────────────────────────────────────────────────────────────
  const stopSiren = () => {
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
  };

  const playSirenLoop = () => {
    if (sirenRef.current) return;
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      gain.gain.value = 0.06;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      let up = true;
      const id = setInterval(() => {
        const f = osc.frequency.value;
        if (up) { osc.frequency.value = Math.min(1200, f + 80); if (f >= 1200) up = false; }
        else    { osc.frequency.value = Math.max(350,  f - 80); if (f <= 350)  up = true;  }
      }, 80);
      sirenRef.current = { osc, ctx, id };
      setSirenActive(true);
    } catch {}
  };

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = 880; g.gain.value = 0.15;
      osc.connect(g); g.connect(ctx.destination); osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 220);
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

  const playAlert = () => {
    if (alertSound === "Beep")        return playBeep();
    if (alertSound === "Siren")       return playSirenLoop();
    if (alertSound === "Voice Alert") return playVoice();
  };

  // ── dismiss arrival popup ─────────────────────────────────────────────────
  const dismissArrivalPopup = async () => {
    setArrivalPopup(false);
    stopSiren();
    // Tell backend alert is cleared
    try {
      await fetch(`${API_BASE}/api/alert/clear`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  };

  // ── commands ──────────────────────────────────────────────────────────────
  const sendCommand = async (cmd) => {
    if (!token) return;
    setActiveCommand(cmd);
    setCommandHistory(prev => [{ cmd, ts: Date.now() }, ...prev.slice(0, 19)]);
    try {
      await fetch(`${API_BASE}/api/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ command: cmd }),
      });
    } catch {}
  };

  const startContinuousCommand = (cmd) => {
    sendCommand(cmd);
    if (commandIntervalRef.current) clearInterval(commandIntervalRef.current);
    commandIntervalRef.current = setInterval(() => sendCommand(cmd), 200);
  };
  const stopContinuousCommand = () => {
    if (commandIntervalRef.current) { clearInterval(commandIntervalRef.current); commandIntervalRef.current = null; }
    sendCommand("STOP");
  };
  const startContinuousClick = (cmd) => {
    sendCommand(cmd);
    if (clickIntervalRef.current) clearInterval(clickIntervalRef.current);
    clickIntervalRef.current = setInterval(() => sendCommand(cmd), 200);
  };
  const stopContinuousClick = () => {
    if (clickIntervalRef.current) { clearInterval(clickIntervalRef.current); clickIntervalRef.current = null; }
    sendCommand("STOP");
  };

  // ── drive mode toggle ─────────────────────────────────────────────────────
  const toggleDriveMode = async () => {
    if (!token) return;
    const newMode = driveMode === "MANUAL" ? "AUTO" : "MANUAL";
    try {
      const res = await fetch(`${API_BASE}/api/drive_mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: newMode }),
      });
      if (res.ok) setDriveMode(newMode);
    } catch {}
  };

  // ── mmWave toggle ─────────────────────────────────────────────────────────
  const toggleMmwave = async () => {
    if (!token) return;
    const newEnabled = !mmwaveEnabled;
    try {
      const res = await fetch(`${API_BASE}/api/mmwave/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (res.ok) setMmwaveEnabled(newEnabled);
    } catch {}
  };

  // ── map data ──────────────────────────────────────────────────────────────
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

  // ── draw map canvas ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const SCALE = 60;
    const ox = W / 2;
    const oy = H / 2;
    const wx = (x) => ox + x * SCALE;
    const wy = (y) => oy - y * SCALE;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0a1020";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
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
    ctx.font = "11px monospace";
    ctx.fillText("1m", ox + SCALE - 14, oy - 4);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath(); ctx.moveTo(ox, oy - 3); ctx.lineTo(ox + SCALE, oy - 3); ctx.stroke();

    // Track
    const track = mapState.track;
    if (track.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(59,130,246,0.5)";
      ctx.lineWidth = 2;
      ctx.moveTo(wx(track[0].x), wy(track[0].y));
      for (let i = 1; i < track.length; i++) {
        ctx.lineTo(wx(track[i].x), wy(track[i].y));
      }
      ctx.stroke();
    }

    // Start marker
    ctx.beginPath();
    ctx.arc(wx(0), wy(0), 6, 0, Math.PI * 2);
    ctx.fillStyle = "#3b82f6";
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.font = "bold 10px monospace";
    ctx.fillText("START", wx(0) + 8, wy(0) + 4);

    // Flags
    mapState.flags.forEach(flag => {
      const fx  = wx(flag.x);
      const fy  = wy(flag.y);
      const col = FLAG_COLORS[flag.flag_type] || "#888";
      ctx.beginPath();
      ctx.arc(fx, fy, 10, 0, Math.PI * 2);
      ctx.fillStyle = col + "44";
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = "13px sans-serif";
      ctx.textAlign = "center";
      const icons = { detected:"👁", arrived:"📍", alive:"✅", not_alive:"❌" };
      ctx.fillText(icons[flag.flag_type] || "●", fx, fy + 5);
      ctx.textAlign = "left";
      ctx.fillStyle = col;
      ctx.font = "10px monospace";
      ctx.fillText(flag.label || FLAG_LABELS[flag.flag_type] || flag.flag_type, fx + 13, fy - 2);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(new Date(flag.ts * 1000).toLocaleTimeString(), fx + 13, fy + 10);
    });

    // Rover
    const rx = wx(mapState.rover_x);
    const ry = wy(mapState.rover_y);
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(mapState.rover_heading);
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.rect(-8, -12, 16, 24);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.moveTo(0, -14); ctx.lineTo(5, -6); ctx.lineTo(-5, -6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, [mapState]);

  // ── event listeners ───────────────────────────────────────────────────────
  useEffect(() => {
    const events = ["mousemove","mousedown","keydown","touchstart"];
    events.forEach(e => window.addEventListener(e, markActivity));
    return () => events.forEach(e => window.removeEventListener(e, markActivity));
  }, [locked]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!token) return;
      if (Date.now() - lastActivityRef.current > LOCK_TIMEOUT_MS) {
        setLocked(true); setToken(null); setPassword("");
      }
    }, 500);
    return () => clearInterval(id);
  }, [token]);

  // Keyboard for drive modal
  useEffect(() => {
    if (!driveModalOpen || driveMode === "AUTO") return;
    let activeKey = null;
    const handleKeyDown = (e) => {
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
      const map = { ArrowUp:"FORWARD", ArrowDown:"BACKWARD", ArrowLeft:"LEFT", ArrowRight:"RIGHT", " ":"STOP" };
      const cmd = map[e.key];
      if (cmd && activeKey !== cmd) { activeKey = cmd; startContinuousCommand(cmd); }
    };
    const handleKeyUp = (e) => {
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) {
        e.preventDefault(); activeKey = null; stopContinuousCommand();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup",   handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup",   handleKeyUp);
      if (commandIntervalRef.current) { clearInterval(commandIntervalRef.current); commandIntervalRef.current = null; }
    };
  }, [driveModalOpen, driveMode, token]);

  // ── polling: main state ───────────────────────────────────────────────────
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

        setThermalCount(data.human_count ?? 0);
        setDetections(Array.isArray(data.detections) ? data.detections : []);

        if (data.mmwave) {
          setMmwaveStatus(data.mmwave.status || "SENSOR DISABLED");
          setMmwaveRespiration(data.mmwave.respiration_detected || false);
          setMmwaveDistance(data.mmwave.distance || 0);
          setMmwaveEnergyMin(data.mmwave.energy_min || 0);
          setMmwaveEnergyMax(data.mmwave.energy_max || 0);
          setMmwaveEnergyDelta(data.mmwave.energy_delta || 0);
          setMmwaveEnabled(data.mmwave.enabled === true);
        }

        if (data.drive_mode) setDriveMode(data.drive_mode);

        // Alert from Jetson — rover arrived at human
        // Only trigger if alert is active AND it's a new alert (new ts)
        if (data.alert &&
            data.alert.active === true &&
            data.alert.ts > 0 &&
            data.alert.ts !== prevAlertTsRef.current) {
          prevAlertTsRef.current = data.alert.ts;
          playSirenLoop();
          setArrivalPopup(true);
        }

        const count = data.human_count ?? 0;
        if (count > 0) markActivity();
        if (prevCountRef.current === 0 && count > 0) playAlert();
        prevCountRef.current = count;
      } catch {}
    };
    tick();
    const id = setInterval(tick, refreshRateMs);
    return () => { mounted = false; clearInterval(id); };
  }, [token, refreshRateMs, showOverlays, alertSound]);

  // ── polling: map ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetchMapState();
    const id = setInterval(fetchMapState, 1000);
    return () => clearInterval(id);
  }, [token, fetchMapState]);

  // ── polling: history ──────────────────────────────────────────────────────
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
    const id = setInterval(load, 2000);
    return () => { mounted = false; clearInterval(id); };
  }, [token, tab, historyLimit]);

  // ── password change ───────────────────────────────────────────────────────
  const changePassword = async () => {
    setPwMsg("");
    if (!curPw || !newPw || !newPw2) { setPwMsg("Fill all fields."); return; }
    if (newPw !== newPw2) { setPwMsg("Passwords don't match."); return; }
    if (newPw.length < 4) { setPwMsg("Too short."); return; }
    try {
      const res = await fetch(`${API_BASE}/api/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: curPw, new_password: newPw, confirm_password: newPw2 }),
      });
      const data = await res.json().catch(() => ({}));
      setPwMsg(res.ok ? "Password changed." : data?.detail || "Failed.");
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setLoginError(data?.detail || `Login failed (${res.status})`); return; }
      if (!data?.token) { setLoginError("Token not received"); return; }
      setToken(data.token);
      setPassword("");
      setLocked(false);
      markActivity();
    } catch { setLoginError("Backend not reachable."); }
  };

  const latestHistory = historyRows.length > 0 ? historyRows[0] : null;

  // ── LOGIN SCREEN ──────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div style={{ background:"#070b14", minHeight:"100vh", display:"grid", placeItems:"center", padding:20, color:"white", fontFamily:"system-ui" }}>
        <div style={{ width:420, borderRadius:18, padding:20, border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.04)" }}>
          <div style={{ fontWeight:1000, fontSize:20 }}>ROBOSAFE {locked ? "LOCKED" : "ACCESS"}</div>
          <div style={{ opacity:0.7, fontSize:13, marginTop:6 }}>Password required to access dashboard</div>
          <div style={{ marginTop:16, position:"relative" }}>
            <input autoFocus type={showPw ? "text" : "password"} value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") doLogin(); }}
              placeholder="Password"
              style={{ width:"100%", padding:"12px 44px 12px 14px", borderRadius:14, outline:"none", border:"1px solid rgba(255,255,255,0.15)", background:"rgba(0,0,0,0.25)", color:"white", fontSize:14 }} />
            <button type="button" onClick={() => setShowPw(v => !v)}
              style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", width:34, height:34, borderRadius:10, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.06)", color:"white", cursor:"pointer", fontSize:16 }}>
              {showPw ? "🙈" : "👁️"}
            </button>
          </div>
          {loginError && <div style={{ color:"#fb7185", marginTop:10, fontSize:13 }}>{loginError}</div>}
          <button onClick={doLogin} style={{ marginTop:14, width:"100%", padding:"12px 14px", borderRadius:14, border:"1px solid rgba(59,130,246,0.45)", background:"rgba(59,130,246,0.25)", fontWeight:900, color:"white", cursor:"pointer" }}>
            ENTER DASHBOARD
          </button>
          <div style={{ marginTop:10, fontSize:12, opacity:0.65 }}>Auto-lock after 30 seconds inactivity</div>
        </div>
      </div>
    );
  }

  // ── MAIN DASHBOARD ────────────────────────────────────────────────────────
  return (
    <div className="appShell" style={{ "--bg": bgColor }}>

      {/* ── ARRIVAL POPUP: siren + mmWave toggle ──────────────────────────── */}
      {arrivalPopup && (
        <div style={{ position:"fixed", inset:0, zIndex:100, background:"rgba(0,0,0,0.88)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#0f1a2b", border:"2px solid #ef4444", borderRadius:24, padding:36, maxWidth:460, width:"90%", textAlign:"center" }}>
            <div style={{ fontSize:64, marginBottom:12 }}>🚨</div>
            <div style={{ fontSize:22, fontWeight:1000, color:"#ef4444", letterSpacing:1 }}>ROVER ARRIVED AT HUMAN</div>
            <div style={{ opacity:0.75, marginTop:8, fontSize:14 }}>Siren is active. Use mmWave sensor to check for life signs.</div>

            <div style={{ marginTop:24, padding:16, borderRadius:14, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize:13, opacity:0.75, marginBottom:10 }}>mmWave Sensor Status</div>
              <div style={{ fontSize:16, fontWeight:900, color: mmwaveEnabled ? "#22c55e" : "#ef4444", marginBottom:14 }}>
                {mmwaveEnabled ? "🟢 SENSOR ON" : "🔴 SENSOR OFF"}
              </div>
              <div style={{ fontSize:13, opacity:0.85, marginBottom:14 }}>{mmwaveStatus}</div>

              {/* Turn ON / OFF mmWave */}
              <button onClick={toggleMmwave}
                style={{ width:"100%", padding:"14px 0", borderRadius:14,
                  border: mmwaveEnabled ? "2px solid #ef4444" : "2px solid #22c55e",
                  background: mmwaveEnabled ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)",
                  color: mmwaveEnabled ? "#ef4444" : "#22c55e",
                  fontWeight:900, fontSize:16, cursor:"pointer" }}>
                {mmwaveEnabled ? "🔴 TURN OFF mmWave" : "🟢 TURN ON mmWave"}
              </button>
            </div>

            {/* Energy readings (visible when ON) */}
            {mmwaveEnabled && (
              <div style={{ marginTop:14, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                {[["Min", mmwaveEnergyMin], ["Max", mmwaveEnergyMax], ["Delta", mmwaveEnergyDelta]].map(([lbl, val]) => (
                  <div key={lbl} style={{ padding:10, borderRadius:12, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)" }}>
                    <div style={{ fontSize:11, opacity:0.6 }}>Energy {lbl}</div>
                    <div style={{ fontSize:20, fontWeight:1000 }}>{val}</div>
                  </div>
                ))}
              </div>
            )}

            <button onClick={dismissArrivalPopup}
              style={{ marginTop:18, width:"100%", padding:"10px 0", borderRadius:12, border:"1px solid rgba(255,255,255,0.2)", background:"rgba(255,255,255,0.06)", color:"white", cursor:"pointer", fontSize:13 }}>
              ✕ Dismiss & Stop Siren
            </button>
          </div>
        </div>
      )}

      <aside className="sidebar">
        <button className={`navItem ${tab==="home"?"active":""}`}     onClick={() => setTab("home")}>Home</button>
        <button className={`navItem ${tab==="map"?"active":""}`}      onClick={() => setTab("map")}>🗺 Map</button>
        <button className={`navItem ${tab==="history"?"active":""}`}  onClick={() => setTab("history")}>History</button>
        <button className={`navItem ${tab==="settings"?"active":""}`} onClick={() => setTab("settings")}>Settings</button>
        <button className="navItem" onClick={() => setDriveModalOpen(true)}
          style={{ background:"rgba(34,197,94,0.18)", borderColor:"rgba(34,197,94,0.32)" }}>
          🚗 DRIVE
        </button>
      </aside>

      <div className="main">
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
                style={{ padding:"8px 14px", borderRadius:12, border:"2px solid #ef4444", background:"rgba(239,68,68,0.2)", color:"#ef4444", fontWeight:900, fontSize:13, cursor:"pointer", animation:"pulse 1s infinite" }}>
                🔇 STOP SIREN
              </button>
            )}
            <div style={{ fontSize:12, opacity:0.75 }}>Alert: {alertSound}</div>
            <button className="iconBtn" title="Lock" onClick={() => { setLocked(true); setToken(null); }}>🔒</button>
          </div>
        </div>

        <div className="page">

          {/* ── HOME TAB ──────────────────────────────────────────────────── */}
          {tab === "home" && (
            <>
              <div className="gridRow1">
                <div className="card">
                  <div className="gaugeWrap"><Gauge value={thermalCount} color="blue" /></div>
                  <div className="cardTitle" style={{ textAlign:"center" }}>THERMAL CAMERA DETECTED</div>
                  <div className="cardSub"   style={{ textAlign:"center" }}>{thermalCount} humans detected</div>
                  <div style={{ textAlign:"center" }}>
                    <span className="btnPill" onClick={() => setDetailsModalOpen(true)} style={{ cursor:"pointer" }}>VIEW DETAILS</span>
                  </div>
                </div>

                <div className="card">
                  <div className="gaugeWrap"><ConfirmationBadge status={mmwaveStatus} respiration={mmwaveRespiration} /></div>
                  <div className="cardTitle" style={{ textAlign:"center" }}>MM WAVE SENSOR</div>
                  <div className="cardSub"   style={{ textAlign:"center" }}>{mmwaveStatus}</div>
                  <div style={{ textAlign:"center", display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
                    <span className="btnPill" onClick={() => setLifeDetectionModalOpen(true)} style={{ cursor:"pointer" }}>VIEW READINGS</span>
                    <span className="btnPill" onClick={toggleMmwave} style={{ cursor:"pointer",
                      background: mmwaveEnabled ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                      borderColor: mmwaveEnabled ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)" }}>
                      {mmwaveEnabled ? "🟢 ON" : "🔴 OFF"}
                    </span>
                  </div>
                </div>

                <div className="card">
                  <div className="liveCardTop">
                    <div className="liveBadge"><span className="dot" /><div className="cardTitle">LIVE CAMERA</div></div>
                    <button className="iconBtn" style={{ width:140 }} onClick={() => setModalOpen(true)}>FULL SCREEN</button>
                  </div>
                  <div className="preview" onClick={() => setModalOpen(true)}>
                    <img src={`${API_BASE}/video?token=${encodeURIComponent(token)}`} alt="Live"
                      style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                  </div>
                </div>
              </div>

              <div className="kpiStrip">
                {thermalCount} HUMANS | mmWave: {mmwaveStatus} | Dist: {mmwaveDistance.toFixed(2)}m |
                Mode: <strong style={{ color: driveMode==="AUTO"?"#22c55e":"#f59e0b" }}>{driveMode}</strong>
              </div>
            </>
          )}

          {/* ── MAP TAB ───────────────────────────────────────────────────── */}
          {tab === "map" && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:10 }}>
                <div>
                  <div style={{ fontWeight:1000, fontSize:18 }}>🗺 Rescue Map</div>
                  <div style={{ fontSize:12, opacity:0.6, marginTop:4 }}>
                    Rover: ({mapState.rover_x.toFixed(2)}m, {mapState.rover_y.toFixed(2)}m) · {mapState.flags.length} flags
                  </div>
                </div>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                  {Object.entries(FLAG_LABELS).map(([k,v]) => (
                    <div key={k} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
                      <div style={{ width:12, height:12, borderRadius:999, background:FLAG_COLORS[k] }} />
                      <span style={{ opacity:0.8 }}>{v}</span>
                    </div>
                  ))}
                  <button onClick={clearMap} style={{ padding:"8px 14px", borderRadius:10, border:"1px solid rgba(239,68,68,0.4)", background:"rgba(239,68,68,0.12)", color:"white", cursor:"pointer", fontSize:12, fontWeight:900 }}>
                    CLEAR MAP
                  </button>
                </div>
              </div>
              <div style={{ borderRadius:22, overflow:"hidden", border:"1px solid rgba(255,255,255,0.1)" }}>
                <canvas ref={mapCanvasRef} width={900} height={560} style={{ display:"block", width:"100%", background:"#0a1020" }} />
              </div>
              {mapState.flags.length > 0 && (
                <div style={{ marginTop:14, display:"grid", gap:8 }}>
                  <div style={{ fontWeight:900, fontSize:14, opacity:0.75 }}>FLAG LOG</div>
                  {[...mapState.flags].reverse().map((flag, i) => (
                    <div key={flag.id || i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:14, border:"1px solid rgba(255,255,255,0.08)", background:"rgba(255,255,255,0.03)" }}>
                      <div style={{ width:12, height:12, borderRadius:999, flexShrink:0, background:FLAG_COLORS[flag.flag_type]||"#888" }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:900, fontSize:13 }}>{FLAG_LABELS[flag.flag_type]||flag.flag_type}</div>
                        <div style={{ fontSize:11, opacity:0.6 }}>{flag.label} · ({flag.x.toFixed(2)}m, {flag.y.toFixed(2)}m)</div>
                      </div>
                      <div style={{ fontSize:11, opacity:0.5 }}>{new Date(flag.ts * 1000).toLocaleTimeString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── HISTORY TAB ───────────────────────────────────────────────── */}
          {tab === "history" && (
            <div className="settingsCard">
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
                <div>
                  <div style={{ fontWeight:1000, fontSize:18 }}>History</div>
                  <div style={{ marginTop:8, opacity:0.75, fontSize:13 }}>Detection logs</div>
                </div>
                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  <div style={{ fontSize:12, opacity:0.75 }}>Limit</div>
                  <select value={historyLimit} onChange={e => setHistoryLimit(Number(e.target.value))}
                    style={{ background:"rgba(255,255,255,0.06)", color:"white", border:"1px solid rgba(255,255,255,0.12)", padding:"8px 10px", borderRadius:10, outline:"none" }}>
                    <option value={50}>50</option><option value={100}>100</option>
                    <option value={200}>200</option><option value={500}>500</option>
                  </select>
                  <button className="iconBtn" style={{ width:160, background:"rgba(239,68,68,0.18)", border:"1px solid rgba(239,68,68,0.35)" }}
                    onClick={async () => {
                      if (!window.confirm("Delete all history?")) return;
                      try {
                        await fetch(`${API_BASE}/api/history`, { method:"DELETE", headers:{ Authorization:`Bearer ${token}` } });
                        setHistoryRows([]);
                      } catch {}
                    }}>DELETE HISTORY</button>
                </div>
              </div>
              <div style={{ marginTop:16, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
                <div className="card" style={{ padding:14 }}>
                  <div className="cardTitle">TOTAL ENTRIES</div>
                  <div style={{ fontSize:28, fontWeight:1000, marginTop:6 }}>{historyRows.length}</div>
                </div>
                <div className="card" style={{ padding:14 }}>
                  <div className="cardTitle">LATEST COUNT</div>
                  <div style={{ fontSize:28, fontWeight:1000, marginTop:6 }}>{latestHistory ? latestHistory.count : 0}</div>
                </div>
                <div className="card" style={{ padding:14 }}>
                  <div className="cardTitle">LATEST TIME</div>
                  <div style={{ fontSize:14, opacity:0.85, marginTop:10 }}>{latestHistory ? new Date(latestHistory.ts*1000).toLocaleString() : "N/A"}</div>
                </div>
              </div>
            </div>
          )}

          {/* ── SETTINGS TAB ──────────────────────────────────────────────── */}
          {tab === "settings" && (
            <div className="settingsCard">
              <div style={{ fontWeight:1000, fontSize:18 }}>Settings</div>
              <div style={{ marginTop:16, display:"grid", gap:14 }}>
                <div className="formRow">
                  <label>Dashboard Background Color</label>
                  <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} />
                </div>
                <div className="formRow">
                  <label>Alert Sound</label>
                  <select value={alertSound} onChange={e => setAlertSound(e.target.value)}>
                    <option>Beep</option><option>Siren</option><option>Voice Alert</option>
                  </select>
                </div>
                <div className="formRow">
                  <label>Auto Full Screen on Live Feed Click</label>
                  <select value={autoFullscreen?"Yes":"No"} onChange={e => setAutoFullscreen(e.target.value==="Yes")}>
                    <option>No</option><option>Yes</option>
                  </select>
                </div>
                <div className="formRow">
                  <label>UI Refresh Rate (ms)</label>
                  <input type="range" min="100" max="2000" step="50" value={refreshRateMs} onChange={e => setRefreshRateMs(Number(e.target.value))} />
                  <div style={{ fontSize:12, opacity:0.75 }}>{refreshRateMs} ms</div>
                </div>
                <div className="formRow">
                  <label>Detection Confidence Threshold</label>
                  <input type="range" min="0" max="1" step="0.01" value={confidenceThreshold} onChange={e => setConfidenceThreshold(Number(e.target.value))} />
                  <div style={{ fontSize:12, opacity:0.75 }}>{Math.round(confidenceThreshold*100)}%</div>
                </div>
                <div className="formRow">
                  <label>Show Detection Overlay Labels</label>
                  <select value={showOverlays?"Yes":"No"} onChange={e => setShowOverlays(e.target.value==="Yes")}>
                    <option>Yes</option><option>No</option>
                  </select>
                </div>
                <div style={{ marginTop:18, padding:14, borderRadius:14, border:"1px solid rgba(255,255,255,0.10)", background:"rgba(255,255,255,0.03)" }}>
                  <div style={{ fontWeight:1000, marginBottom:10 }}>Change Password</div>
                  <PwRow label="Current Password" value={curPw}  setValue={setCurPw}  show={showCurPw}  setShow={setShowCurPw}  />
                  <PwRow label="New Password"     value={newPw}  setValue={setNewPw}  show={showNewPw}  setShow={setShowNewPw}  />
                  <PwRow label="Confirm Password" value={newPw2} setValue={setNewPw2} show={showNewPw2} setShow={setShowNewPw2} />
                  {pwMsg && <div style={{ marginTop:10, fontSize:13, opacity:0.85 }}>{pwMsg}</div>}
                  <button className="iconBtn" style={{ width:220, marginTop:12 }} onClick={changePassword}>UPDATE PASSWORD</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODALS ────────────────────────────────────────────────────────────── */}

      {modalOpen && (
        <div className="modalOverlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modalTop">
              <div style={{ fontWeight:1000 }}>LIVE CAMERA</div>
              <button className="iconBtn" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className="modalBody">
              <div className="modalVideo">
                <img src={`${API_BASE}/video?token=${encodeURIComponent(token)}`} alt="Live Full"
                  style={{ width:"100%", height:"100%", objectFit:"contain" }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {detailsModalOpen && (
        <div className="modalOverlay" onClick={() => setDetailsModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modalTop">
              <div style={{ fontWeight:1000 }}>THERMAL CAMERA DETAILS</div>
              <button className="iconBtn" onClick={() => setDetailsModalOpen(false)}>✕</button>
            </div>
            <div className="modalBody" style={{ padding:20, overflow:"auto" }}>
              <div style={{ fontSize:48, fontWeight:1000 }}>{thermalCount}</div>
              <div style={{ fontSize:18, opacity:0.85, marginTop:10 }}>Humans detected</div>
              {detections.map((d, i) => (
                <div key={i} style={{ padding:14, marginTop:10, borderRadius:14, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)" }}>
                  <div>Human {i+1}</div>
                  <div style={{ fontSize:12, opacity:0.7, marginTop:4 }}>Confidence: {Math.round((d.confidence||0)*100)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {lifeDetectionModalOpen && (
        <div className="modalOverlay" onClick={() => setLifeDetectionModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modalTop">
              <div style={{ fontWeight:1000 }}>mmWave READINGS</div>
              <button className="iconBtn" onClick={() => setLifeDetectionModalOpen(false)}>✕</button>
            </div>
            <div className="modalBody" style={{ padding:20, overflow:"auto" }}>
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:14, fontWeight:900, opacity:0.75 }}>LIFE CHANCE INDICATOR</div>
                <div style={{ marginTop:10, padding:20, borderRadius:14, textAlign:"center",
                  background: getLifeChance()==="HIGH"?"rgba(34,197,94,0.15)":getLifeChance()==="MEDIUM"?"rgba(245,158,11,0.15)":"rgba(100,100,100,0.15)",
                  border:`2px solid ${getLifeChance()==="HIGH"?"rgba(34,197,94,0.45)":getLifeChance()==="MEDIUM"?"rgba(245,158,11,0.45)":"rgba(150,150,150,0.35)"}` }}>
                  <div style={{ fontSize:32, fontWeight:1000 }}>{getLifeChance()}</div>
                  <div style={{ fontSize:14, opacity:0.85, marginTop:8 }}>Chance of Life</div>
                </div>
              </div>
              {[["Energy Min", mmwaveEnergyMin],["Energy Max", mmwaveEnergyMax],["Energy Delta", mmwaveEnergyDelta]].map(([lbl, val]) => (
                <div key={lbl} style={{ padding:14, borderRadius:14, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)", marginBottom:10 }}>
                  <div style={{ fontSize:12, opacity:0.7 }}>{lbl}</div>
                  <div style={{ fontSize:24, fontWeight:1000 }}>{val}</div>
                  {lbl === "Energy Delta" && <div style={{ fontSize:11, opacity:0.6, marginTop:4 }}>≥3 indicates breathing</div>}
                </div>
              ))}
              <div style={{ padding:14, borderRadius:14, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)" }}>
                <div style={{ fontSize:12, opacity:0.7 }}>Distance</div>
                <div style={{ fontSize:28, fontWeight:1000 }}>{mmwaveDistance.toFixed(2)}m</div>
              </div>
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

      {driveModalOpen && (
        <div className="modalOverlay" onClick={() => setDriveModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ height:"min(820px,94vh)" }}>
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
                <button className="iconBtn" onClick={() => setDriveModalOpen(false)}>✕</button>
              </div>
            </div>
            <div className="modalBody" style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr" }}>
              <div className="modalVideo">
                <img src={`${API_BASE}/video?token=${encodeURIComponent(token)}`} alt="Rover Camera"
                  style={{ width:"100%", height:"100%", objectFit:"contain" }} />
              </div>
              <div style={{ padding:18, background:"rgba(0,0,0,0.45)", display:"flex", flexDirection:"column", gap:16 }}>
                {driveMode === "AUTO" ? (
                  <div style={{ textAlign:"center", padding:24, borderRadius:16, border:"2px solid rgba(34,197,94,0.4)", background:"rgba(34,197,94,0.08)" }}>
                    <div style={{ fontSize:36 }}>🤖</div>
                    <div style={{ fontWeight:1000, fontSize:16, marginTop:10, color:"#22c55e" }}>AUTO DRIVE ACTIVE</div>
                    <div style={{ fontSize:12, opacity:0.7, marginTop:8 }}>Jetson is controlling the rover</div>
                    <div style={{ fontSize:12, opacity:0.7, marginTop:4 }}>Switch to MANUAL to take control</div>
                  </div>
                ) : (
                  <>
                    <div>
                      <div style={{ fontWeight:1000, fontSize:15 }}>KEYBOARD CONTROLS</div>
                      <div style={{ fontSize:12, opacity:0.75, marginTop:4 }}>Hold arrow keys to drive, release to stop</div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginTop:10 }}>
                      <div />
                      <ControlButton label="⬆ FORWARD"  active={activeCommand==="FORWARD"}  onMouseDown={() => startContinuousClick("FORWARD")}  onMouseUp={stopContinuousClick} onMouseLeave={stopContinuousClick} onTouchStart={() => startContinuousClick("FORWARD")}  onTouchEnd={stopContinuousClick} />
                      <div />
                      <ControlButton label="⬅ LEFT"     active={activeCommand==="LEFT"}     onMouseDown={() => startContinuousClick("LEFT")}     onMouseUp={stopContinuousClick} onMouseLeave={stopContinuousClick} onTouchStart={() => startContinuousClick("LEFT")}     onTouchEnd={stopContinuousClick} />
                      <ControlButton label="⏹ STOP"    active={activeCommand==="STOP"}    onMouseDown={() => startContinuousClick("STOP")}    onMouseUp={stopContinuousClick} onMouseLeave={stopContinuousClick} onTouchStart={() => startContinuousClick("STOP")}    onTouchEnd={stopContinuousClick} variant="stop" />
                      <ControlButton label="➡ RIGHT"    active={activeCommand==="RIGHT"}    onMouseDown={() => startContinuousClick("RIGHT")}    onMouseUp={stopContinuousClick} onMouseLeave={stopContinuousClick} onTouchStart={() => startContinuousClick("RIGHT")}    onTouchEnd={stopContinuousClick} />
                      <div />
                      <ControlButton label="⬇ BACKWARD" active={activeCommand==="BACKWARD"} onMouseDown={() => startContinuousClick("BACKWARD")} onMouseUp={stopContinuousClick} onMouseLeave={stopContinuousClick} onTouchStart={() => startContinuousClick("BACKWARD")} onTouchEnd={stopContinuousClick} />
                      <div />
                    </div>
                  </>
                )}
                <div style={{ padding:14, borderRadius:14, border:"1px solid rgba(255,255,255,0.10)", background:"rgba(255,255,255,0.03)" }}>
                  <div style={{ fontSize:12, opacity:0.75 }}>ACTIVE COMMAND</div>
                  <div style={{ fontSize:20, fontWeight:1000, marginTop:6, color: activeCommand==="STOP"?"#ef4444":"rgba(34,197,94,0.95)" }}>{activeCommand}</div>
                </div>
                <div style={{ flex:1, overflow:"hidden" }}>
                  <div style={{ fontSize:12, fontWeight:900, opacity:0.75 }}>COMMAND LOG</div>
                  <div style={{ marginTop:8, height:"calc(100% - 24px)", overflowY:"auto", fontSize:11, fontFamily:"monospace", background:"rgba(0,0,0,0.35)", borderRadius:12, padding:10, border:"1px solid rgba(255,255,255,0.08)" }}>
                    {commandHistory.map((entry, idx) => (
                      <div key={idx} style={{ padding:"4px 0", borderBottom: idx < commandHistory.length-1 ? "1px solid rgba(255,255,255,0.05)":"none" }}>
                        <span style={{ opacity:0.6 }}>{new Date(entry.ts).toLocaleTimeString()}</span> → {entry.cmd}
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

// ── Sub-components ────────────────────────────────────────────────────────────
function ConfirmationBadge({ status, respiration }) {
  const isLifeConfirmed = status?.includes("LIFE CONFIRMED");
  const isLifeDoubtful  = status?.includes("LIFE DOUBTFUL");
  const isDisabled      = status?.includes("DISABLED");
  return (
    <div style={{ width:220, height:110, borderRadius:20, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      background: isLifeConfirmed?"rgba(34,197,94,0.15)":isLifeDoubtful?"rgba(245,158,11,0.15)":"rgba(100,100,100,0.15)",
      border:`2px solid ${isLifeConfirmed?"rgba(34,197,94,0.45)":isLifeDoubtful?"rgba(245,158,11,0.45)":"rgba(150,150,150,0.35)"}`,
      boxShadow: isLifeConfirmed?"0 0 30px rgba(34,197,94,0.25)":"none" }}>
      <div style={{ fontSize:48, marginBottom:8 }}>
        {isDisabled ? "⚫" : isLifeConfirmed ? "✓" : isLifeDoubtful ? "⚠" : "○"}
      </div>
      <div style={{ fontSize:11, fontWeight:900, textAlign:"center",
        color: isLifeConfirmed?"rgba(34,197,94,0.95)":isLifeDoubtful?"rgba(245,158,11,0.95)":"rgba(150,150,150,0.85)" }}>
        {status}
      </div>
      {respiration && <div style={{ fontSize:10, opacity:0.75, marginTop:4 }}>♥ Breathing</div>}
    </div>
  );
}

function ControlButton({ label, active, onMouseDown, onMouseUp, onMouseLeave, onTouchStart, onTouchEnd, variant }) {
  return (
    <button onMouseDown={onMouseDown} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      style={{ height:70, borderRadius:16,
        border: active?"2px solid rgba(34,197,94,0.65)":"1px solid rgba(255,255,255,0.12)",
        background: active?"rgba(34,197,94,0.25)":variant==="stop"?"rgba(239,68,68,0.15)":"rgba(255,255,255,0.05)",
        color:"white", cursor:"pointer", fontWeight:900, fontSize:13,
        boxShadow: active?"0 0 20px rgba(34,197,94,0.35)":"none",
        transition:"all 0.15s ease", userSelect:"none" }}>
      {label}
    </button>
  );
}

function PwRow({ label, value, setValue, show, setShow }) {
  return (
    <div style={{ marginTop:10 }}>
      <label style={{ fontSize:12, opacity:0.75 }}>{label}</label>
      <div style={{ marginTop:6, position:"relative" }}>
        <input type={show?"text":"password"} value={value} onChange={e => setValue(e.target.value)} placeholder={label}
          style={{ width:"100%", padding:"10px 44px 10px 12px", borderRadius:12, outline:"none", border:"1px solid rgba(255,255,255,0.15)", background:"rgba(0,0,0,0.25)", color:"white", fontSize:13 }} />
        <button type="button" onClick={() => setShow(v => !v)}
          style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", width:34, height:34, borderRadius:10, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.06)", color:"white", cursor:"pointer", fontSize:16 }}>
          {show?"🙈":"👁️"}
        </button>
      </div>
    </div>
  );
}

function Gauge({ value, color }) {
  const accent = color === "yellow" ? "var(--yellow)" : "var(--blue)";
  const max = 6;
  const deg = (Math.max(0, Math.min(value, max)) / max) * 180;
  return (
    <div className="gauge">
      <div className="gaugeFill" style={{ background:`conic-gradient(${accent} 0deg ${deg}deg, rgba(255,255,255,0.12) ${deg}deg 360deg)` }} />
      <div className="gaugeInner" />
      <div className="gaugeValue">{value}</div>
    </div>
  );
}