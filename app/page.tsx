"use client";

import { useEffect, useMemo, useState } from "react";

type Mode = "legacy" | "protected";
type Scenario = "ghost" | "overlap";

const scenarios = {
  ghost: {
    eyebrow: "CASE 01 · STALE HANDSHAKE",
    title: "A vehicle leaves. Its IO does not.",
    subtitle: "Reproduce the exact lock described in the PACK line incident report.",
    steps: [
      { time: "00:00", label: "A requests station entry", owner: "A", plc: "Enter permitted", signals: ["enter_request", "permission_to_enter"], note: "PLC opens an entry transaction." },
      { time: "00:02", label: "Operator pulls A from the loop", owner: "A", plc: "Waiting for entering", signals: ["enter_request"], note: "The vehicle is moved, but the handshake is not cancelled." },
      { time: "00:04", label: "A sends a late entering signal", owner: "A", plc: "Permission reset", signals: ["entering"], note: "Legacy PLC accepts the stale bit and drops enter permission." },
      { time: "00:06", label: "B requests the same station", owner: "B", plc: "Blocked", signals: ["entering", "enter_request"], note: "PLC sees entering=true and cannot distinguish A from B." },
      { time: "00:08", label: "Line remains interlocked", owner: "B", plc: "IO conflict", signals: ["entering", "enter_request"], note: "B stops although the station is physically clear." },
    ],
  },
  overlap: {
    eyebrow: "CASE 02 · OVERLAPPING REQUEST ZONE",
    title: "Two vehicles share one boolean truth.",
    subtitle: "See how a rear vehicle can consume permission intended for the front vehicle.",
    steps: [
      { time: "00:00", label: "C enters the long request zone", owner: "C", plc: "Enter permitted", signals: ["enter_request", "permission_to_enter"], note: "C is first in line." },
      { time: "00:02", label: "D also enters the request zone", owner: "D", plc: "Permission still high", signals: ["enter_request", "permission_to_enter"], note: "The request area overlaps the merge point." },
      { time: "00:04", label: "D reads permission first", owner: "D", plc: "Permission reset", signals: ["entering"], note: "D claims the phase, even though C blocks its path." },
      { time: "00:06", label: "C and D stop each other", owner: "C + D", plc: "Sequence mismatch", signals: ["entering", "enter_request"], note: "PLC cannot tell which vehicle emitted each stage." },
      { time: "00:08", label: "Signals cross into a false cycle", owner: "C + D", plc: "Double-car loop", signals: ["at_position", "action_request", "entering"], note: "Different vehicles appear as one valid transaction." },
    ],
  },
};

const allSignals = ["enter_request", "permission_to_enter", "entering", "at_position", "action_request", "permission_to_act", "leave_request", "permission_to_leave", "already_left"];

function vehiclePosition(scenario: Scenario, step: number, vehicle: "A" | "B" | "C" | "D") {
  if (scenario === "ghost") {
    if (vehicle === "A") return step < 2 ? 46 + step * 12 : 18;
    if (vehicle === "B") return step < 3 ? 17 : 35;
  } else {
    if (vehicle === "C") return 35 + Math.min(step, 3) * 8;
    if (vehicle === "D") return 12 + Math.min(step, 3) * 10;
  }
  return -20;
}

export default function Home() {
  const [scenario, setScenario] = useState<Scenario>("ghost");
  const [mode, setMode] = useState<Mode>("legacy");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const data = scenarios[scenario];
  const raw = data.steps[step];
  const protectedIntercept = mode === "protected" && step >= 2;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStep((current) => {
        if (current >= data.steps.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [playing, data.steps.length]);

  useEffect(() => { setStep(0); setPlaying(false); }, [scenario, mode]);

  const visibleSignals = useMemo(() => {
    if (!protectedIntercept) return raw.signals;
    return scenario === "ghost" ? ["enter_request"] : ["enter_request", "permission_to_enter"];
  }, [protectedIntercept, raw.signals, scenario]);

  const status = protectedIntercept
    ? scenario === "ghost" ? "STALE SIGNAL REJECTED" : "SECOND REQUEST QUEUED"
    : step >= 3 ? "FAULT REPRODUCED" : "SEQUENCE RUNNING";

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brandmark">R</span><span>REER ROBOTICS</span></div>
        <div className="context"><span className="live-dot" /> PACK LINE · IO LAB <span className="version">MODEL 1.0</span></div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">{data.eyebrow}</p>
          <h1>{data.title}</h1>
          <p className="subtitle">{data.subtitle}</p>
        </div>
        <div className="case-switch" aria-label="Select failure case">
          <button className={scenario === "ghost" ? "active" : ""} onClick={() => setScenario("ghost")}><span>01</span> Ghost IO</button>
          <button className={scenario === "overlap" ? "active" : ""} onClick={() => setScenario("overlap")}><span>02</span> Dual request</button>
        </div>
      </section>

      <section className="sim-shell">
        <div className="sim-head">
          <div className="mode-control">
            <span>CONTROL LOGIC</span>
            <button className={mode === "legacy" ? "selected danger" : ""} onClick={() => setMode("legacy")}>Legacy PLC</button>
            <button className={mode === "protected" ? "selected safe" : ""} onClick={() => setMode("protected")}>Safeguarded PLC</button>
          </div>
          <div className={`run-status ${protectedIntercept ? "safe-status" : step >= 3 ? "fault-status" : ""}`}><span />{status}</div>
        </div>

        <div className="plant">
          <div className="track-label">RCS LOOP / REQUEST ZONE</div>
          <div className="track">
            <div className="request-zone"><span>IO REQUEST ZONE</span></div>
            <div className="merge-mark">NG MERGE</div>
            {(scenario === "ghost" ? ["A", "B"] : ["C", "D"]).map((v, i) => (
              <div key={v} className={`agv agv-${i}`} style={{ left: `${vehiclePosition(scenario, step, v as "A" | "B" | "C" | "D")}%` }}>
                <span>{v}</span><small>AGV</small>
              </div>
            ))}
            <div className={`station ${step >= 3 && !protectedIntercept ? "station-fault" : ""}`}><b>PACK 01</b><span>{step >= 3 && !protectedIntercept ? "INTERLOCKED" : "READY"}</span></div>
          </div>
          <div className="io-flow">
            <div className="node"><span>RCS</span><b>{raw.owner}</b><small>signal source</small></div>
            <div className="wire"><i className={visibleSignals.length ? "pulse" : ""} /><span>Boolean IO</span></div>
            <div className={`node plc-node ${protectedIntercept ? "accepted" : ""}`}><span>PLC</span><b>{protectedIntercept ? "Guard active" : raw.plc}</b><small>{mode === "legacy" ? "stage memory only" : "transaction owner + watchdog"}</small></div>
          </div>
        </div>

        <div className="console-grid">
          <div className="timeline-panel">
            <div className="panel-title"><span>EVENT TIMELINE</span><b>{raw.time}</b></div>
            <div className="timeline">
              {data.steps.map((item, index) => (
                <button key={item.time} onClick={() => { setStep(index); setPlaying(false); }} className={index === step ? "current" : index < step ? "past" : ""}>
                  <i /> <span>{item.time}</span><b>{item.label}</b>
                </button>
              ))}
            </div>
          </div>
          <div className="signal-panel">
            <div className="panel-title"><span>LIVE IO REGISTER</span><b>{visibleSignals.length} HIGH</b></div>
            <div className="signals">
              {allSignals.map((signal) => <div key={signal} className={visibleSignals.includes(signal) ? "high" : ""}><i /><code>{signal}</code><b>{visibleSignals.includes(signal) ? "1" : "0"}</b></div>)}
            </div>
          </div>
          <aside className={`explain-panel ${protectedIntercept ? "protected" : ""}`}>
            <p>{protectedIntercept ? "PROTECTION RESULT" : "WHY THIS HAPPENS"}</p>
            <h2>{protectedIntercept ? (scenario === "ghost" ? "The orphaned bit has no valid owner." : "Only the first vehicle owns the transaction.") : raw.note}</h2>
            <div className="logic-rule">
              <span>{mode === "legacy" ? "LEGACY RULE" : "COMPLETED PLC RULE"}</span>
              <code>{mode === "legacy" ? "entering → reset(permission_to_enter)" : "accept(signal) only if vehicle_id = active_owner"}</code>
            </div>
            <p className="source-note">Reconstructed from the Simulink Stateflow sequence, PACK线纠错 workbook, and incident report.</p>
          </aside>
        </div>

        <div className="transport">
          <button className="reset" onClick={() => { setStep(0); setPlaying(false); }}>↺ Reset</button>
          <button className="play" onClick={() => { if (step === data.steps.length - 1) setStep(0); setPlaying(!playing); }}>{playing ? "Ⅱ Pause" : "▶ Run scenario"}</button>
          <button onClick={() => { setPlaying(false); setStep(Math.max(0, step - 1)); }}>←</button>
          <button onClick={() => { setPlaying(false); setStep(Math.min(data.steps.length - 1, step + 1)); }}>→</button>
          <div className="progress"><i style={{ width: `${(step / (data.steps.length - 1)) * 100}%` }} /></div>
          <span>STEP {step + 1} / {data.steps.length}</span>
        </div>
      </section>

      <section className="finding">
        <div><span>ROOT CAUSE</span><h2>The PLC receives phases, not identities.</h2></div>
        <p>Boolean IO can form a valid-looking sequence from different vehicles. Manual movement or an oversized request zone breaks the assumption that one physical AGV owns the full handshake.</p>
        <div className="fixes"><span>01 · Bind transaction owner</span><span>02 · Reject out-of-order edges</span><span>03 · Timeout + atomic reset</span><span>04 · Shorten request zone</span></div>
      </section>
    </main>
  );
}
