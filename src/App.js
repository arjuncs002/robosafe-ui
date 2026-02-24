import { useEffect, useRef, useState } from "react";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";

export default function App() {
  const [token, setToken] = useState(null);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [locked, setLocked] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const LOCK_TIMEOUT_MS = 30_000;

  const [tab, setTab] = useState("home");
  const [modalOpen, setModalOpen] = useState(false);
  const [driveModalOpen, setDriveModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [lifeDetectionModalOpen, setLifeDetectionModalOpen] = useState(false);

  const [alertSound, setAlertSound] = useState("Siren");
  const [bgColor, setBgColor] = useState("#0a1020");
  const [autoFullscreen, setAutoFullscreen] = useState(false);
  const [refreshRateMs, setRefreshRateMs] = useState(250);
  const [showOverlays, setShowOverlays] = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);

  const [thermalCount, setThermalCount] = useState(0);
  const [detections, setDetections] = useState([]);

  const [mmwaveStatus, setMmwaveStatus] = useState("NO PRESENCE DETECTED");
  const [mmwaveRespiration, setMmwaveRespiration] = useState(false);
  const [mmwaveDistance, setMmwaveDistance] = useState(0);
  const [mmwaveEnergyMin, setMmwaveEnergyMin] = useState(0);
  const [mmwaveEnergyMax, setMmwaveEnergyMax] = useState(0);
  const [mmwaveEnergyDelta, setMmwaveEnergyDelta] = useState(0);
  const [mmwaveEnabled, setMmwaveEnabled] = useState(true);

  const [historyRows, setHistoryRows] = useState([]);
  const [historyLimit, setHistoryLimit] = useState(200);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [activeCommand, setActiveCommand] = useState("STOP");
  const [commandHistory, setCommandHistory] = useState([]);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [showCurPw, setShowCurPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showNewPw2, setShowNewPw2] = useState(false);

  const markActivity = () => {
    lastActivityRef.current = Date.now();
    if (locked) setLocked(false);
  };

  const sendCommand = async (cmd) => {
    if (!token) return;
    setActiveCommand(cmd);
    setCommandHistory((prev) => [{ cmd, ts: Date.now() }, ...prev.slice(0, 19)]);

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

  const toggleMmwave = async () => {
    if (!token) return;

    const newEnabled = !mmwaveEnabled;

    try {
      const res = await fetch(`${API_BASE}/api/mmwave/toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: newEnabled }),
      });

      if (res.ok) {
        setMmwaveEnabled(newEnabled);
      }
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  };

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
      setLoginError("Backend not reachable. Check if server is running.");
    }
  };

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

        if (data.mmwave) {
          setMmwaveStatus(data.mmwave.status || "NO PRESENCE DETECTED");
          setMmwaveRespiration(data.mmwave.respiration_detected || false);
          setMmwaveDistance(data.mmwave.distance || 0);
          setMmwaveEnergyMin(data.mmwave.energy_min || 0);
          setMmwaveEnergyMax(data.mmwave.energy_max || 0);
          setMmwaveEnergyDelta(data.mmwave.energy_delta || 0);
          setMmwaveEnabled(data.mmwave.enabled !== false);
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

  useEffect(() => {
    if (autoFullscreen && modalOpen) {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    }
  }, [autoFullscreen, modalOpen]);

  const latestHistory = historyRows.length > 0 ? historyRows[0] : null;

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

  const getLifeChance = () => {
    if (mmwaveStatus.includes("LIFE CONFIRMED")) return "HIGH";
    if (mmwaveStatus.includes("LIFE DOUBTFUL")) return "MEDIUM";
    if (mmwaveStatus.includes("NO PRESENCE")) return "NO PRESENCE";
    return "UNKNOWN";
  };

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
            Auto-lock after 30 seconds inactivity
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="appShell" style={{ "--bg": bgColor }}>
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

      <div className="main">
        <div className="topbar">
          <div className="brand">ROBOSAFE</div>
          <div className="topActions">
            <div style={{ fontSize: 12, opacity: 0.75 }}>Alert: {alertSound}</div>
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
                    {thermalCount} humans detected
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <span
                      className="btnPill"
                      onClick={() => setDetailsModalOpen(true)}
                      style={{ cursor: "pointer" }}
                    >
                      VIEW DETAILS
                    </span>
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
                  </div>
                  <div
                    style={{
                      textAlign: "center",
                      display: "flex",
                      gap: 8,
                      justifyContent: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      className="btnPill"
                      onClick={() => setLifeDetectionModalOpen(true)}
                      style={{ cursor: "pointer" }}
                    >
                      LIFE DETECTION
                    </span>
                    <span
                      className="btnPill"
                      onClick={toggleMmwave}
                      style={{
                        cursor: "pointer",
                        background: mmwaveEnabled
                          ? "rgba(34,197,94,0.15)"
                          : "rgba(239,68,68,0.15)",
                        borderColor: mmwaveEnabled
                          ? "rgba(34,197,94,0.35)"
                          : "rgba(239,68,68,0.35)",
                      }}
                    >
                      {mmwaveEnabled ? "ON" : "OFF"}
                    </span>
                  </div>
                </div>

                <div className="card">
                  <div className="liveCardTop">
                    <div className="liveBadge">
                      <span className="dot" />
                      <div className="cardTitle">LIVE CAMERA</div>
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
                      alt="Live"
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
                {thermalCount} HUMANS DETECTED | mmWave: {mmwaveStatus} |
                Distance: {mmwaveDistance.toFixed(2)}m
              </div>
            </>
          )}

          {tab === "history" && (
            <div className="settingsCard">
              <div style={{ fontWeight: 1000, fontSize: 18 }}>History</div>
              {/* ... history content same as before ... */}
            </div>
          )}

          {tab === "settings" && (
            <div className="settingsCard">
              <div style={{ fontWeight: 1000, fontSize: 18 }}>Settings</div>
              {/* ... settings content same as before ... */}
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="modalOverlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div style={{ fontWeight: 1000 }}>LIVE CAMERA</div>
              <button className="iconBtn" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modalBody">
              <div className="modalVideo">
                <img
                  src={`${API_BASE}/video?token=${encodeURIComponent(token)}`}
                  alt="Live Full"
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {detailsModalOpen && (
        <div className="modalOverlay" onClick={() => setDetailsModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div style={{ fontWeight: 1000 }}>THERMAL CAMERA DETAILS</div>
              <button className="iconBtn" onClick={() => setDetailsModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modalBody" style={{ padding: 20 }}>
              <div style={{ fontSize: 48, fontWeight: 1000 }}>{thermalCount}</div>
              <div style={{ fontSize: 18, opacity: 0.85, marginTop: 10 }}>
                Humans detected by thermal camera
              </div>
              {detections.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  {detections.map((d, i) => (
                    <div
                      key={i}
                      style={{
                        padding: 14,
                        marginTop: 10,
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.04)",
                      }}
                    >
                      <div>Human {i + 1}</div>
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                        Confidence: {Math.round((d.confidence || 0) * 100)}%
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {lifeDetectionModalOpen && (
        <div className="modalOverlay" onClick={() => setLifeDetectionModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div style={{ fontWeight: 1000 }}>LIFE DETECTION ANALYSIS</div>
              <button
                className="iconBtn"
                onClick={() => setLifeDetectionModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modalBody" style={{ padding: 20, overflow: "auto" }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 900, opacity: 0.75 }}>
                  LIFE CHANCE INDICATOR
                </div>
                <div
                  style={{
                    marginTop: 10,
                    padding: 20,
                    borderRadius: 14,
                    background:
                      getLifeChance() === "HIGH"
                        ? "rgba(34,197,94,0.15)"
                        : getLifeChance() === "MEDIUM"
                        ? "rgba(245,158,11,0.15)"
                        : "rgba(100,100,100,0.15)",
                    border: `2px solid ${
                      getLifeChance() === "HIGH"
                        ? "rgba(34,197,94,0.45)"
                        : getLifeChance() === "MEDIUM"
                        ? "rgba(245,158,11,0.45)"
                        : "rgba(150,150,150,0.35)"
                    }`,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 32, fontWeight: 1000 }}>
                    {getLifeChance()}
                  </div>
                  <div style={{ fontSize: 14, opacity: 0.85, marginTop: 8 }}>
                    Chance of Life
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 14, fontWeight: 900, opacity: 0.75 }}>
                  ENERGY READINGS
                </div>
                <div style={{ marginTop: 10 }}>
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(255,255,255,0.04)",
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Energy Min</div>
                    <div style={{ fontSize: 24, fontWeight: 1000 }}>
                      {mmwaveEnergyMin}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(255,255,255,0.04)",
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Energy Max</div>
                    <div style={{ fontSize: 24, fontWeight: 1000 }}>
                      {mmwaveEnergyMax}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(255,255,255,0.04)",
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Energy Delta</div>
                    <div style={{ fontSize: 24, fontWeight: 1000 }}>
                      {mmwaveEnergyDelta}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                      ≥3 indicates breathing
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 900, opacity: 0.75 }}>
                  DISTANCE
                </div>
                <div
                  style={{
                    marginTop: 10,
                    padding: 14,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <div style={{ fontSize: 28, fontWeight: 1000 }}>
                    {mmwaveDistance.toFixed(2)}m
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {driveModalOpen && (
        <div className="modalOverlay" onClick={() => setDriveModalOpen(false)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ height: "min(820px, 94vh)" }}
          >
            <div className="modalTop">
              <div style={{ fontWeight: 1000 }}>🚗 ROVER CONTROL</div>
              <button className="iconBtn" onClick={() => setDriveModalOpen(false)}>
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
                    Arrow keys to drive, spacebar to stop
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
                  <div style={{ fontSize: 12, opacity: 0.75 }}>ACTIVE COMMAND</div>
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
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfirmationBadge({ status, respiration }) {
  const isLifeConfirmed = status?.includes("LIFE CONFIRMED");
  const isLifeDoubtful = status?.includes("LIFE DOUBTFUL");

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
        background: isLifeConfirmed
          ? "rgba(34,197,94,0.15)"
          : isLifeDoubtful
          ? "rgba(245,158,11,0.15)"
          : "rgba(100,100,100,0.15)",
        border: `2px solid ${
          isLifeConfirmed
            ? "rgba(34,197,94,0.45)"
            : isLifeDoubtful
            ? "rgba(245,158,11,0.45)"
            : "rgba(150,150,150,0.35)"
        }`,
        boxShadow: isLifeConfirmed ? "0 0 30px rgba(34,197,94,0.25)" : "none",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 8 }}>
        {isLifeConfirmed ? "✓" : isLifeDoubtful ? "⚠" : "○"}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 900,
          textAlign: "center",
          color: isLifeConfirmed
            ? "rgba(34,197,94,0.95)"
            : isLifeDoubtful
            ? "rgba(245,158,11,0.95)"
            : "rgba(150,150,150,0.85)",
        }}
      >
        {status}
      </div>
      {respiration && (
        <div style={{ fontSize: 10, opacity: 0.75, marginTop: 4 }}>♥ Breathing</div>
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