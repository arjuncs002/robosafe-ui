import { useEffect, useRef, useState } from "react";
const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";

export default function App() {
  // AUTH
  const [token, setToken] = useState(null);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [locked, setLocked] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const LOCK_TIMEOUT_MS = 30_000;

  // UI
  const [tab, setTab] = useState("home");
  const [modalOpen, setModalOpen] = useState(false);
  const [driveModalOpen, setDriveModalOpen] = useState(false);

  // settings
  const [alertSound, setAlertSound] = useState("Siren");
  const [bgColor, setBgColor] = useState("#0a1020");
  const [autoFullscreen, setAutoFullscreen] = useState(false);
  const [refreshRateMs, setRefreshRateMs] = useState(250);
  const [showOverlays, setShowOverlays] = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);

  // live
  const [thermalCount, setThermalCount] = useState(0);
  const [detections, setDetections] = useState([]);

  // mmWave state
  const [mmwaveStatus, setMmwaveStatus] = useState("NO CONFIRMATION");
  const [mmwaveRespiration, setMmwaveRespiration] = useState(false);

  // history
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLimit, setHistoryLimit] = useState(200);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ROVER CONTROL STATE
  const [activeCommand, setActiveCommand] = useState("STOP");
  const [commandHistory, setCommandHistory] = useState([]);

  // CHANGE PASSWORD
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [showCurPw, setShowCurPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showNewPw2, setShowNewPw2] = useState(false);

  // ACTIVITY MARKER
  const markActivity = () => {
    lastActivityRef.current = Date.now();
    if (locked) setLocked(false);
  };

  // SEND CONTROL COMMAND
  const sendCommand = async (cmd) => {
    if (!token) return;

    setActiveCommand(cmd);
    setCommandHistory((prev) => [
      { cmd, ts: Date.now() },
      ...prev.slice(0, 19),
    ]);

    try {
      await fetch(`${API_BASE}/api/control`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ command: cmd }),
      });
    } catch (err) {
      console.error("Control command failed:", err);
    }
  };

  // ALERT SOUND
  const prevCountRef = useRef(0);

  const playBeep = async () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close();
      }, 220);
    } catch {}
  };

  const playSiren = async () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      gain.gain.value = 0.05;

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      let up = true;
      const id = setInterval(() => {
        const f = osc.frequency.value;
        if (up) {
          osc.frequency.value = Math.min(1200, f + 120);
          if (osc.frequency.value >= 1200) up = false;
        } else {
          osc.frequency.value = Math.max(350, f - 120);
          if (osc.frequency.value <= 350) up = true;
        }
      }, 100);

      setTimeout(() => {
        clearInterval(id);
        osc.stop();
        ctx.close();
      }, 2500);
    } catch {}
  };

  const playVoice = () => {
    try {
      window.speechSynthesis.cancel();
      const msg = new SpeechSynthesisUtterance("Human detected");
      msg.rate = 1;
      msg.pitch = 1;
      msg.volume = 1;
      window.speechSynthesis.speak(msg);
    } catch {}
  };

  const playAlert = () => {
    if (alertSound === "Beep") return playBeep();
    if (alertSound === "Siren") return playSiren();
    if (alertSound === "Voice Alert") return playVoice();
  };

  // AUTO LOCK
  useEffect(() => {
    window.addEventListener("mousemove", markActivity);
    window.addEventListener("mousedown", markActivity);
    window.addEventListener("keydown", markActivity);
    window.addEventListener("touchstart", markActivity);

    return () => {
      window.removeEventListener("mousemove", markActivity);
      window.removeEventListener("mousedown", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("touchstart", markActivity);
    };
  }, [locked]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!token) return;
      if (Date.now() - lastActivityRef.current > LOCK_TIMEOUT_MS) {
        setLocked(true);
        setToken(null);
        setPassword("");
      }
    }, 500);
    return () => clearInterval(id);
  }, [token]);

  // KEYBOARD CONTROL (ONLY IN DRIVE WINDOW)
  useEffect(() => {
    if (!driveModalOpen) return;

    const handleKeyDown = (e) => {
      if (e.repeat) return;

      if (e.key === "ArrowUp") {
        e.preventDefault();
        sendCommand("FORWARD");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        sendCommand("BACKWARD");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        sendCommand("LEFT");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        sendCommand("RIGHT");
      } else if (e.key === " ") {
        e.preventDefault();
        sendCommand("STOP");
      }
    };

    const handleKeyUp = (e) => {
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === " "
      ) {
        e.preventDefault();
        sendCommand("STOP");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [driveModalOpen, token]);

  // LOGIN
  const doLogin = async () => {
    try {
      setLoginError("");

      const res = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password || "" }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setLoginError(data?.detail || `Login failed (${res.status})`);
        return;
      }

      if (!data?.token) {
        setLoginError("Token not received");
        return;
      }

      setToken(data.token);
      setPassword("");
      setLocked(false);
      markActivity();
    } catch {
      setLoginError(
        "Backend not reachable. Check if server is running."
      );
    }
  };

  // LIVE POLLING
  useEffect(() => {
    if (!token) return;

    let mounted = true;

    const tick = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/state?overlays=${showOverlays ? 1 : 0}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.status === 401) {
          setToken(null);
          return;
        }

        const data = await res.json();
        if (!mounted) return;

        const count = data.human_count ?? 0;
        const dets = Array.isArray(data.detections) ? data.detections : [];

        setThermalCount(count);
        setDetections(dets);

        // Update mmWave state
        if (data.mmwave) {
          setMmwaveStatus(data.mmwave.status || "NO CONFIRMATION");
          setMmwaveRespiration(data.mmwave.respiration_detected || false);
        }

        if (count > 0) markActivity();

        if (prevCountRef.current === 0 && count > 0) playAlert();
        prevCountRef.current = count;
      } catch {}
    };

    tick();
    const id = setInterval(tick, refreshRateMs);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [token, refreshRateMs, showOverlays, alertSound]);

  // HISTORY
  useEffect(() => {
    if (!token) return;
    if (tab !== "history") return;

    let mounted = true;

    const loadHistory = async () => {
      try {
        setHistoryLoading(true);

        const res = await fetch(`${API_BASE}/api/history?limit=${historyLimit}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          setToken(null);
          return;
        }

        const data = await res.json();
        if (!mounted) return;

        setHistoryRows(Array.isArray(data) ? data : []);
      } catch {
        if (!mounted) return;
        setHistoryRows([]);
      } finally {
        if (mounted) setHistoryLoading(false);
      }
    };

    loadHistory();
    const id = setInterval(loadHistory, 2000);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [token, tab, historyLimit]);

  // fullscreen
  useEffect(() => {
    if (autoFullscreen && modalOpen) {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    }
  }, [autoFullscreen, modalOpen]);

  const latestHistory = historyRows.length > 0 ? historyRows[0] : null;

  // CHANGE PASSWORD
  const changePassword = async () => {
    try {
      setPwMsg("");

      if (!curPw || !newPw || !newPw2) {
        setPwMsg("Fill all password fields.");
        return;
      }
      if (newPw !== newPw2) {
        setPwMsg("New password and Confirm password must match.");
        return;
      }
      if (newPw.length < 4) {
        setPwMsg("New password too short.");
        return;
      }

      const res = await fetch(`${API_BASE}/api/password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: curPw,
          new_password: newPw,
          confirm_password: newPw2,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setPwMsg(data?.detail || "Password change failed.");
        return;
      }

      setPwMsg("Password changed successfully.");
      setCurPw("");
      setNewPw("");
      setNewPw2("");
    } catch {
      setPwMsg("Backend not reachable.");
    }
  };

  // LOGIN SCREEN
  if (!token) {
    return (
      <div
        style={{
          background: "#070b14",
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 20,
          color: "white",
          fontFamily: "system-ui",
        }}
      >
        <div
          style={{
            width: 420,
            borderRadius: 18,
            padding: 20,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.04)",
          }}
        >
          <div style={{ fontWeight: 1000, fontSize: 20 }}>
            ROBOSAFE {locked ? "LOCKED" : "ACCESS"}
          </div>

          <div style={{ opacity: 0.7, fontSize: 13, marginTop: 6 }}>
            Password required to access dashboard
          </div>

          <div style={{ marginTop: 16, position: "relative" }}>
            <input
              autoFocus
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              onKeyDown={(e) => {
                if (e.key === "Enter") doLogin();
              }}
              style={{
                width: "100%",
                padding: "12px 44px 12px 14px",
                borderRadius: 14,
                outline: "none",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(0,0,0,0.25)",
                color: "white",
                fontSize: 14,
              }}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                width: 34,
                height: 34,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                cursor: "pointer",
                fontSize: 16,
              }}
              title={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? "🙈" : "👁️"}
            </button>
          </div>

          {loginError && (
            <div style={{ color: "#fb7185", marginTop: 10, fontSize: 13 }}>
              {loginError}
            </div>
          )}

          <button
            onClick={doLogin}
            style={{
              marginTop: 14,
              width: "100%",
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid rgba(59,130,246,0.45)",
              background: "rgba(59,130,246,0.25)",
              fontWeight: 900,
              color: "white",
              cursor: "pointer",
            }}
          >
            ENTER DASHBOARD
          </button>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
            Auto-lock after 30 seconds inactivity (human detection prevents lock).
          </div>
        </div>
      </div>
    );
  }

  // MAIN UI
  return (
    <div className="appShell" style={{ "--bg": bgColor }}>
      {/* sidebar */}
      <aside className="sidebar">
        <button
          className={`navItem ${tab === "home" ? "active" : ""}`}
          onClick={() => setTab("home")}
        >
          Home
        </button>

        <button
          className={`navItem ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          History
        </button>

        <button
          className={`navItem ${tab === "settings" ? "active" : ""}`}
          onClick={() => setTab("settings")}
        >
          Settings
        </button>

        <button
          className="navItem"
          onClick={() => setDriveModalOpen(true)}
          style={{
            background: "rgba(34,197,94,0.18)",
            borderColor: "rgba(34,197,94,0.32)",
          }}
        >
          🚗 DRIVE
        </button>
      </aside>

      {/* main */}
      <div className="main">
        {/* topbar */}
        <div className="topbar">
          <div className="brand">ROBOSAFE</div>

          <div className="topActions">
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Alert: {alertSound}
            </div>

            <button
              className="iconBtn"
              title="Lock"
              onClick={() => {
                setLocked(true);
                setToken(null);
              }}
            >
              🔒
            </button>
          </div>
        </div>

        <div className="page">
          {/* HOME */}
          {tab === "home" && (
            <>
              <div className="gridRow1">
                <div className="card">
                  <div className="gaugeWrap">
                    <Gauge value={thermalCount} color="blue" />
                  </div>
                  <div className="cardTitle" style={{ textAlign: "center" }}>
                    THERMAL CAMERA DETECTED
                  </div>
                  <div className="cardSub" style={{ textAlign: "center" }}>
                    {thermalCount} humans detected by thermal camera
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <span className="btnPill">VIEW DETAILS</span>
                  </div>
                </div>

                <div className="card">
                  <div className="gaugeWrap">
                    <ConfirmationBadge 
                      status={mmwaveStatus}
                      respiration={mmwaveRespiration}
                    />
                  </div>
                  <div className="cardTitle" style={{ textAlign: "center" }}>
                    MM WAVE CONFIRMATION
                  </div>
                  <div className="cardSub" style={{ textAlign: "center" }}>
                    {mmwaveStatus}
                    {mmwaveRespiration && " (Respiration Detected)"}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <span className="btnPill">LIFE DETECTION</span>
                  </div>
                </div>

                <div className="card">
                  <div className="liveCardTop">
                    <div className="liveBadge">
                      <span className="dot" />
                      <div className="cardTitle">LIVE THERMAL CAMERA</div>
                    </div>

                    <button
                      className="iconBtn"
                      style={{ width: 140 }}
                      onClick={() => setModalOpen(true)}
                    >
                      FULL SCREEN
                    </button>
                  </div>

                  <div className="preview" onClick={() => setModalOpen(true)}>
                    <img
                      src={`${API_BASE}/video?token=${encodeURIComponent(token)}`}
                      alt="Thermal Live"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="sectionRow2">
                <div className="infoPanel">
                  <div className="infoHeader">
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="cardTitle">LIVE DETECTIONS</div>
                      <span style={{ fontSize: 12, opacity: 0.75 }}>
                        secured backend
                      </span>
                    </div>

                    <button
                      className="iconBtn"
                      style={{ width: 140 }}
                      onClick={() => setTab("history")}
                    >
                      VIEW HISTORY
                    </button>
                  </div>

                  <div className="infoList">
                    {!showOverlays ? (
                      <div style={{ opacity: 0.75 }}>
                        Overlays disabled from Settings.
                      </div>
                    ) : detections.length === 0 ? (
                      <div style={{ opacity: 0.75 }}>No humans detected.</div>
                    ) : (
                      detections
                        .filter((d) => (d.confidence ?? 0) >= confidenceThreshold)
                        .map((d, i) => (
                          <div key={i} className="personRow">
                            <div>HUMAN {i + 1}</div>
                            <div style={{ color: "rgba(245,158,11,0.95)" }}>
                              Confidence: {Math.round((d.confidence ?? 0) * 100)}%
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                <div className="infoPanel">
                  <div className="infoHeader">
                    <div className="cardTitle">THERMAL PREVIEW</div>
                    <button
                      className="iconBtn"
                      style={{ width: 130 }}
                      onClick={() => setModalOpen(true)}
                    >
                      FULL SCREEN
                    </button>
                  </div>

                  <div className="preview" onClick={() => setModalOpen(true)}>
                    <img
                      src={`${API_BASE}/video?token=${encodeURIComponent(token)}`}
                      alt="Thermal Live Preview"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="kpiStrip">
                {thermalCount} HUMANS DETECTED BY THERMAL CAMERA
              </div>
              <div className="kpiStrip">
                mmWave: {mmwaveStatus}
              </div>
            </>
          )}

          {/* HISTORY */}
          {tab === "history" && (
            <div className="settingsCard">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 1000, fontSize: 18 }}>History</div>
                  <div style={{ marginTop: 8, opacity: 0.75, fontSize: 13 }}>
                    Entries saved only when human_count &gt; 0
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Limit</div>
                  <select
                    value={historyLimit}
                    onChange={(e) => setHistoryLimit(Number(e.target.value))}
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      color: "white",
                      border: "1px solid rgba(255,255,255,0.12)",
                      padding: "8px 10px",
                      borderRadius: 10,
                      outline: "none",
                    }}
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                  </select>

                  <button
                    className="iconBtn"
                    style={{
                      width: 160,
                      background: "rgba(239,68,68,0.18)",
                      border: "1px solid rgba(239,68,68,0.35)",
                    }}
                    onClick={async () => {
                      const yes = window.confirm("Delete all history entries?");
                      if (!yes) return;

                      try {
                        setHistoryRows([]);
                        setHistoryLoading(true);

                        const res = await fetch(`${API_BASE}/api/history`, {
                          method: "DELETE",
                          headers: { Authorization: `Bearer ${token}` },
                        });

                        if (res.status === 401) {
                          setToken(null);
                          return;
                        }

                        setHistoryRows([]);
                      } catch {
                        setHistoryRows([]);
                      } finally {
                        setHistoryLoading(false);
                      }
                    }}
                  >
                    DELETE HISTORY
                  </button>
                </div>
              </div>

              <div
                style={{
                  marginTop: 16,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 14,
                }}
              >
                <div className="card" style={{ padding: 14 }}>
                  <div className="cardTitle">TOTAL ENTRIES</div>
                  <div style={{ fontSize: 28, fontWeight: 1000, marginTop: 6 }}>
                    {historyRows.length}
                  </div>
                </div>

                <div className="card" style={{ padding: 14 }}>
                  <div className="cardTitle">LATEST COUNT</div>
                  <div style={{ fontSize: 28, fontWeight: 1000, marginTop: 6 }}>
                    {latestHistory ? latestHistory.count : 0}
                  </div>
                </div>

                <div className="card" style={{ padding: 14 }}>
                  <div className="cardTitle">LATEST TIME</div>
                  <div style={{ fontSize: 14, opacity: 0.85, marginTop: 10 }}>
                    {latestHistory
                      ? new Date(latestHistory.ts * 1000).toLocaleString()
                      : "N/A"}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <div className="cardTitle" style={{ marginBottom: 8 }}>
                  COUNT TIMELINE
                </div>

                <div
                  style={{
                    height: 140,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.03)",
                    padding: 12,
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 4,
                    overflow: "hidden",
                  }}
                >
                  {historyRows
                    .slice()
                    .reverse()
                    .map((r, idx) => {
                      const h = Math.min(120, Math.max(6, r.count * 18));
                      return (
                        <div
                          key={idx}
                          title={`${new Date(r.ts * 1000).toLocaleString()}  |  count=${r.count}`}
                          style={{
                            width: 6,
                            height: h,
                            borderRadius: 6,
                            background: "rgba(59,130,246,0.85)",
                          }}
                        />
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {tab === "settings" && (
            <div className="settingsCard">
              <div style={{ fontWeight: 1000, fontSize: 18 }}>Settings</div>

              <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
                <div className="formRow">
                  <label>Dashboard Background Color</label>
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                  />
                </div>

                <div className="formRow">
                  <label>Alert Sound</label>
                  <select
                    value={alertSound}
                    onChange={(e) => setAlertSound(e.target.value)}
                  >
                    <option>Beep</option>
                    <option>Siren</option>
                    <option>Voice Alert</option>
                  </select>
                </div>

                <div className="formRow">
                  <label>Auto Full Screen on Live Feed Click</label>
                  <select
                    value={autoFullscreen ? "Yes" : "No"}
                    onChange={(e) => setAutoFullscreen(e.target.value === "Yes")}
                  >
                    <option>No</option>
                    <option>Yes</option>
                  </select>
                </div>

                <div className="formRow">
                  <label>UI Refresh Rate (ms)</label>
                  <input
                    type="range"
                    min="100"
                    max="2000"
                    step="50"
                    value={refreshRateMs}
                    onChange={(e) => setRefreshRateMs(Number(e.target.value))}
                  />
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    {refreshRateMs} ms
                  </div>
                </div>

                <div className="formRow">
                  <label>Detection Confidence Threshold</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={confidenceThreshold}
                    onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                  />
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    {Math.round(confidenceThreshold * 100)}%
                  </div>
                </div>

                <div className="formRow">
                  <label>Show Detection Overlay Labels</label>
                  <select
                    value={showOverlays ? "Yes" : "No"}
                    onChange={(e) => setShowOverlays(e.target.value === "Yes")}
                  >
                    <option>Yes</option>
                    <option>No</option>
                  </select>
                </div>

                <div
                  style={{
                    marginTop: 18,
                    padding: 14,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div style={{ fontWeight: 1000, marginBottom: 10 }}>
                    Change Password
                  </div>

                  <PwRow
                    label="Current Password"
                    value={curPw}
                    setValue={setCurPw}
                    show={showCurPw}
                    setShow={setShowCurPw}
                  />
                  <PwRow
                    label="Change Password"
                    value={newPw}
                    setValue={setNewPw}
                    show={showNewPw}
                    setShow={setShowNewPw}
                  />
                  <PwRow
                    label="Confirm Password"
                    value={newPw2}
                    setValue={setNewPw2}
                    show={showNewPw2}
                    setShow={setShowNewPw2}
                  />

                  {pwMsg && (
                    <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
                      {pwMsg}
                    </div>
                  )}

                  <button
                    className="iconBtn"
                    style={{ width: 220, marginTop: 12 }}
                    onClick={changePassword}
                  >
                    UPDATE PASSWORD
                  </button>

                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
                    Default password: GROUP5
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FULL SCREEN MODAL */}
      {modalOpen && (
        <div className="modalOverlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div style={{ fontWeight: 1000 }}>LIVE THERMAL CAMERA</div>
              <button className="iconBtn" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>

            <div className="modalBody">
              <div className="modalVideo">
                <img
                  src={`${API_BASE}/video?token=${encodeURIComponent(token)}`}
                  alt="Thermal Live Full"
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DRIVE/CONTROL MODAL */}
      {driveModalOpen && (
        <div
          className="modalOverlay"
          onClick={() => setDriveModalOpen(false)}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ height: "min(820px, 94vh)" }}
          >
            <div className="modalTop">
              <div style={{ fontWeight: 1000 }}>🚗 ROVER CONTROL</div>
              <button
                className="iconBtn"
                onClick={() => setDriveModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div
              className="modalBody"
              style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr" }}
            >
              <div className="modalVideo">
                <img
                  src={`${API_BASE}/video?token=${encodeURIComponent(token)}`}
                  alt="Rover Camera"
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              </div>

              <div
                style={{
                  padding: 18,
                  background: "rgba(0,0,0,0.45)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <div>
                  <div style={{ fontWeight: 1000, fontSize: 15 }}>
                    KEYBOARD CONTROLS
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                    Use arrow keys to drive, spacebar to stop
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 10,
                    marginTop: 10,
                  }}
                >
                  <div />
                  <ControlButton
                    label="⬆ FORWARD"
                    active={activeCommand === "FORWARD"}
                    onClick={() => sendCommand("FORWARD")}
                  />
                  <div />

                  <ControlButton
                    label="⬅ LEFT"
                    active={activeCommand === "LEFT"}
                    onClick={() => sendCommand("LEFT")}
                  />
                  <ControlButton
                    label="⏹ STOP"
                    active={activeCommand === "STOP"}
                    onClick={() => sendCommand("STOP")}
                    variant="stop"
                  />
                  <ControlButton
                    label="➡ RIGHT"
                    active={activeCommand === "RIGHT"}
                    onClick={() => sendCommand("RIGHT")}
                  />

                  <div />
                  <ControlButton
                    label="⬇ BACKWARD"
                    active={activeCommand === "BACKWARD"}
                    onClick={() => sendCommand("BACKWARD")}
                  />
                  <div />
                </div>

                <div
                  style={{
                    marginTop: 14,
                    padding: 14,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    ACTIVE COMMAND
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 1000,
                      marginTop: 6,
                      color:
                        activeCommand === "STOP"
                          ? "#ef4444"
                          : "rgba(34,197,94,0.95)",
                    }}
                  >
                    {activeCommand}
                  </div>
                </div>

                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.75 }}>
                    COMMAND LOG
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      height: "calc(100% - 24px)",
                      overflowY: "auto",
                      fontSize: 11,
                      fontFamily: "monospace",
                      background: "rgba(0,0,0,0.35)",
                      borderRadius: 12,
                      padding: 10,
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {commandHistory.map((entry, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: "4px 0",
                          borderBottom:
                            idx < commandHistory.length - 1
                              ? "1px solid rgba(255,255,255,0.05)"
                              : "none",
                        }}
                      >
                        <span style={{ opacity: 0.6 }}>
                          {new Date(entry.ts).toLocaleTimeString()}
                        </span>{" "}
                        → {entry.cmd}
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

// CONFIRMATION BADGE COMPONENT
function ConfirmationBadge({ status, respiration }) {
  const isConfirmed = status === "HUMAN CONFIRMED";
  
  return (
    <div
      style={{
        width: 220,
        height: 110,
        borderRadius: 20,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: isConfirmed
          ? "rgba(34,197,94,0.15)"
          : "rgba(100,100,100,0.15)",
        border: `2px solid ${
          isConfirmed ? "rgba(34,197,94,0.45)" : "rgba(150,150,150,0.35)"
        }`,
        boxShadow: isConfirmed
          ? "0 0 30px rgba(34,197,94,0.25)"
          : "none",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 8 }}>
        {isConfirmed ? "✓" : "○"}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 900,
          color: isConfirmed ? "rgba(34,197,94,0.95)" : "rgba(150,150,150,0.85)",
        }}
      >
        {status}
      </div>
      {respiration && (
        <div style={{ fontSize: 10, opacity: 0.75, marginTop: 4 }}>
          ♥ Breathing
        </div>
      )}
    </div>
  );
}

function ControlButton({ label, active, onClick, variant }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 70,
        borderRadius: 16,
        border: active
          ? "2px solid rgba(34,197,94,0.65)"
          : "1px solid rgba(255,255,255,0.12)",
        background: active
          ? "rgba(34,197,94,0.25)"
          : variant === "stop"
          ? "rgba(239,68,68,0.15)"
          : "rgba(255,255,255,0.05)",
        color: "white",
        cursor: "pointer",
        fontWeight: 900,
        fontSize: 13,
        boxShadow: active ? "0 0 20px rgba(34,197,94,0.35)" : "none",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

function PwRow({ label, value, setValue, show, setShow }) {
  return (
    <div style={{ marginTop: 10 }}>
      <label style={{ fontSize: 12, opacity: 0.75 }}>{label}</label>
      <div style={{ marginTop: 6, position: "relative" }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={label}
          style={{
            width: "100%",
            padding: "10px 44px 10px 12px",
            borderRadius: 12,
            outline: "none",
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(0,0,0,0.25)",
            color: "white",
            fontSize: 13,
          }}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            width: 34,
            height: 34,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            cursor: "pointer",
            fontSize: 16,
          }}
          title={show ? "Hide password" : "Show password"}
        >
          {show ? "🙈" : "👁️"}
        </button>
      </div>
    </div>
  );
}

function Gauge({ value, color }) {
  const accent = color === "yellow" ? "var(--yellow)" : "var(--blue)";
  const max = 6;
  const clamped = Math.max(0, Math.min(value, max));
  const deg = (clamped / max) * 180;

  return (
    <div className="gauge">
      <div
        className="gaugeFill"
        style={{
          background: `conic-gradient(${accent} 0deg ${deg}deg, rgba(255,255,255,0.12) ${deg}deg 360deg)`,
        }}
      />
      <div className="gaugeInner" />
      <div className="gaugeValue">{value}</div>
    </div>
  );
}