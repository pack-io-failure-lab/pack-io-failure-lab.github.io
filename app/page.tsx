"use client";

import { useEffect, useMemo, useState } from "react";

type Vehicle = "A" | "B" | "C" | "D" | "E";
type ScenarioKey = "doubleStation" | "staleSignal" | "simultaneousRequest" | "misroutedSignal";

type Position = { x: number; y: number };

type SimulationStep = {
  time: string;
  label: string;
  owner: string;
  plc: string;
  signals: string[];
  note: string;
  positions: Partial<Record<Vehicle, Position>>;
  status: string;
  station: string;
  trace: string;
  fault?: boolean;
};

type Scenario = {
  number: string;
  tab: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  rootCause: string;
  impact: string;
  immediateFix: string;
  maintenance: string;
  steps: SimulationStep[];
};

const scenarios: Record<ScenarioKey, Scenario> = {
  doubleStation: {
    number: "01",
    tab: "Double-car station",
    eyebrow: "CASE 01 · STALE IO CASCADE",
    title: "One ghost handshake creates a two-car station loop.",
    subtitle: "The full sequence from the updated incident report: diversion, partial reset, manual PLC restart, then a second vehicle is admitted into an occupied station.",
    rootCause: "A PLC sequence is restarted without restoring the ownership of the original vehicle transaction.",
    impact: "B reaches the station first. C is then permitted by the restarted flow, but is blocked by B. The PLC combines C’s request with B’s arrival/action signals and treats them as one vehicle.",
    immediateFix: "Stop the next vehicle, clear IO and process control on both systems, then release the vehicles again from a synchronized state.",
    maintenance: "Do not pull or add AGVs during an active IO handshake. Prefer manual stations for manual moves because they do not have the entry-permission interlock.",
    steps: [
      { time: "00:00", label: "A requests entry", owner: "A", plc: "Entry permission → A", signals: ["enter_request", "permission_to_enter"], note: "PLC opens an entry phase. Its memory is phase-based; it does not identify the vehicle that owns it.", positions: { A: { x: 31, y: 18 } }, status: "A AUTHORIZED", station: "READY", trace: "A: request → PLC: permission" },
      { time: "00:02", label: "A is pulled from the loop", owner: "A", plc: "Transaction remains open", signals: ["enter_request"], note: "A is physically diverted, but its RCS–PLC handshake remains in the process state.", positions: { A: { x: 12, y: 18 } }, status: "A DIVERTED · IO STILL LIVE", station: "READY", trace: "A moved physically; A IO was not cancelled" },
      { time: "00:04", label: "A leaves a late entering bit", owner: "A", plc: "Entry permission reset", signals: ["entering"], note: "The stale entering bit is accepted as the acknowledgement for the old permission and resets the entry grant.", positions: { A: { x: 13, y: 18 }, B: { x: 34, y: 67 } }, status: "STALE ENTERING", station: "READY", trace: "A: entering = 1 → permission_to_enter = 0", fault: true },
      { time: "00:06", label: "B requests the same station", owner: "B", plc: "B has no valid grant", signals: ["entering", "enter_request"], note: "B’s request overlaps A’s orphaned entering phase. PLC will not issue B a clean permission.", positions: { A: { x: 13, y: 18 }, B: { x: 45, y: 67 } }, status: "B IO-STOPPED", station: "READY", trace: "B: request; PLC still sees A: entering", fault: true },
      { time: "00:08", label: "RCS clears only entering", owner: "RCS", plc: "Waiting for action request", signals: ["enter_request"], note: "Clearing the visible bit does not roll back the PLC sequence; PLC assumes a vehicle already consumed entry permission.", positions: { B: { x: 45, y: 67 } }, status: "PARTIAL RESET", station: "READY", trace: "RCS: entering = 0; PLC phase remains advanced", fault: true },
      { time: "00:10", label: "PLC manually permits B and restarts", owner: "PLC", plc: "New flow starts", signals: ["enter_request", "permission_to_enter"], note: "The manual intervention allows B to continue, but restart removes B from the PLC’s tracked transaction.", positions: { B: { x: 62, y: 67 } }, status: "MANUAL RESTART", station: "B ENTERING", trace: "PLC: permission_to_enter → B; flow reset" },
      { time: "00:12", label: "B arrives; C requests entry", owner: "B + C", plc: "C receives entry permission", signals: ["at_position", "request_action", "enter_request", "permission_to_enter"], note: "B is at the station and requests action while C’s new entry request starts the restarted PLC sequence.", positions: { B: { x: 84, y: 45 }, C: { x: 49, y: 18 } }, status: "B IN STATION · C AUTHORIZED", station: "B OCCUPIED", trace: "B: at_position + action_request; C: entry_request" },
      { time: "00:14", label: "C reaches B’s occupied station", owner: "B + C", plc: "Signals fused as one vehicle", signals: ["enter_request", "permission_to_enter", "at_position", "request_action", "entering"], note: "C is admitted into B’s station flow, then blocked by B. PLC combines C’s entry phase with B’s arrival/action phase — the first double-car loop.", positions: { B: { x: 84, y: 45 }, C: { x: 72, y: 18 } }, status: "DOUBLE-CAR LOOP", station: "B OCCUPIED · C BLOCKED", trace: "C: entering; B: arrival/action → PLC sees one false sequence", fault: true },
      { time: "00:16", label: "B completes work and requests leave", owner: "B", plc: "Leave permission → B", signals: ["at_position", "request_action", "request_to_leave", "permission_to_leave"], note: "B eventually completes its station action. The next valid leave phase begins while C is still waiting at the entry.", positions: { B: { x: 84, y: 45 }, C: { x: 72, y: 18 } }, status: "B LEAVE PERMITTED", station: "B LEAVING · C WAITING", trace: "B: request_to_leave → PLC: permission_to_leave" },
      { time: "00:18", label: "B leaves the station", owner: "B", plc: "Waiting for next arrival", signals: ["leaving", "entering"], note: "B clears the physical station. The old two-car sequence has not been repaired; it simply advances to the next phase.", positions: { B: { x: 54, y: 67 }, C: { x: 76, y: 18 } }, status: "B LEFT · C ADVANCING", station: "C ENTERING", trace: "B: leaving; C continues from the blocked entry phase", fault: true },
      { time: "00:20", label: "C reaches position", owner: "C", plc: "C arrival / action phase", signals: ["at_position", "request_action"], note: "C now reaches the station and supplies the arrival/action signals that the PLC expects.", positions: { C: { x: 84, y: 45 }, D: { x: 47, y: 67 } }, status: "C AT POSITION", station: "C OCCUPIED", trace: "C: at_position + request_action" },
      { time: "00:22", label: "D requests entry", owner: "D", plc: "Entry permission → D", signals: ["at_position", "request_action", "enter_request", "permission_to_enter"], note: "While C is in the station, D begins the next entry request. The same phase-based sequence opens again.", positions: { C: { x: 84, y: 45 }, D: { x: 57, y: 67 } }, status: "D AUTHORIZED", station: "C OCCUPIED", trace: "D: enter_request → PLC: permission_to_enter", fault: true },
      { time: "00:24", label: "D sends entering", owner: "D", plc: "Entry permission reset", signals: ["at_position", "request_action", "entering"], note: "D consumes the shared entry phase and reaches C’s occupied station, recreating the same double-car condition.", positions: { C: { x: 84, y: 45 }, D: { x: 72, y: 67 } }, status: "D BLOCKED BY C", station: "C OCCUPIED · D BLOCKED", trace: "D: entering → permission reset while C remains inside", fault: true },
      { time: "00:26", label: "C completes and requests leave", owner: "C", plc: "Leave permission → C", signals: ["at_position", "request_action", "request_to_leave", "permission_to_leave", "entering"], note: "C completes work while D remains in the entry phase. The process now progresses exactly as B’s cycle did.", positions: { C: { x: 84, y: 45 }, D: { x: 72, y: 67 } }, status: "C LEAVE PERMITTED", station: "C LEAVING · D WAITING", trace: "C: request_to_leave; D: entering", fault: true },
      { time: "00:28", label: "C leaves; D advances", owner: "C + D", plc: "Waiting for D arrival", signals: ["leaving", "entering"], note: "C clears the station and D advances. The same broken process passes to the next pair of vehicles.", positions: { C: { x: 54, y: 18 }, D: { x: 77, y: 67 } }, status: "C LEFT · D ADVANCING", station: "D ENTERING", trace: "C: leaving; D resumes its blocked entry", fault: true },
      { time: "00:30", label: "D reaches position; E requests", owner: "D + E", plc: "Entry permission → E", signals: ["at_position", "request_action", "enter_request", "permission_to_enter"], note: "D reaches the station while E begins the next entry request. The state mismatch can therefore continue from B/C to D/E.", positions: { D: { x: 84, y: 45 }, E: { x: 56, y: 18 } }, status: "LOOP RECURRING: D / E", station: "D OCCUPIED", trace: "D: at_position/action; E: enter_request → new shared grant", fault: true },
      { time: "00:32", label: "E consumes the next entry phase", owner: "E", plc: "Same loop repeats", signals: ["at_position", "request_action", "entering"], note: "E sends entering while D occupies the station. Without a synchronized reset, the double-car loop repeats indefinitely vehicle by vehicle.", positions: { D: { x: 84, y: 45 }, E: { x: 72, y: 18 } }, status: "RECURRING LOOP: D / E", station: "D OCCUPIED · E BLOCKED", trace: "E: entering; D: station action → false single-vehicle sequence", fault: true },
    ],
  },
  staleSignal: {
    number: "02",
    tab: "Stale entering",
    eyebrow: "CASE 02 · RESIDUAL SIGNAL",
    title: "A single stale entering bit removes permission.",
    subtitle: "An operator action in RCS or Xpress leaves an entering signal at the station; PLC resets permission and the next vehicle cannot enter.",
    rootCause: "The `entering` bit is accepted without proving it belongs to the currently authorised vehicle.",
    impact: "The PLC shows an entry phase as complete, while the next AGV sees no valid permission and stops at the request zone.",
    immediateFix: "Reset the extra signal from the AGV through Xpress or correct it from the PLC side; this fault can be cleared by manually sending the needed signal.",
    maintenance: "Strengthen IO training and supervision so signals are not sent or retained unintentionally; also consider power-cycle and network-loss signal effects during diagnosis.",
    steps: [
      { time: "00:00", label: "A requests entry", owner: "A", plc: "Entry permission high", signals: ["enter_request", "permission_to_enter"], note: "A has a normal request and the PLC publishes the shared entry permission.", positions: { A: { x: 37, y: 18 } }, status: "ENTRY PERMITTED", station: "READY", trace: "A: request → permission_to_enter = 1" },
      { time: "00:02", label: "Entering remains after manual work", owner: "Manual action", plc: "Permission reset", signals: ["entering"], note: "A residual entering bit may be sent or retained by RCS/Xpress during manual recovery.", positions: { A: { x: 26, y: 18 } }, status: "GHOST ENTERING", station: "READY", trace: "stale entering = 1 → permission_to_enter = 0", fault: true },
      { time: "00:04", label: "Next vehicle requests entry", owner: "B", plc: "No entry permission", signals: ["entering", "enter_request"], note: "B has a legitimate request, but the stale bit keeps the PLC state inconsistent and B stops outside the station.", positions: { A: { x: 26, y: 18 }, B: { x: 56, y: 67 } }, status: "B IO-STOPPED", station: "READY", trace: "B: request = 1; PLC: entry grant remains reset", fault: true },
    ],
  },
  simultaneousRequest: {
    number: "03",
    tab: "Simultaneous requests",
    eyebrow: "CASE 03 · OVERLAPPING REQUEST ZONE",
    title: "Two entry requests race for one Boolean grant.",
    subtitle: "The NG exit/entry intersection overlaps the request IO range, allowing a front and rear AGV to request entry in the same window.",
    rootCause: "The request range is long enough for two AGVs to hold the same `enter_request` bit high at once.",
    impact: "If the rear vehicle samples the shared grant first, it sends entering and resets the grant. The front vehicle is denied; the rear vehicle is blocked by the front.",
    immediateFix: "Move the front vehicle away, let the rear vehicle proceed first, then add the front vehicle back into the route.",
    maintenance: "Keep the request distance short enough that the NG exit/entry crossing cannot contain two simultaneous requesters; the report notes this adjustment was made with the GZ site team.",
    steps: [
      { time: "00:00", label: "A and B enter the shared request zone", owner: "A + B", plc: "One request bit = high", signals: ["enter_request"], note: "Both cars are physically distinct, but the PLC receives only one shared Boolean request.", positions: { A: { x: 52, y: 18 }, B: { x: 35, y: 67 } }, status: "TWO REQUESTERS", station: "READY", trace: "A: request = 1 + B: request = 1 → PLC sees only 1" },
      { time: "00:02", label: "PLC issues one entry permission", owner: "PLC", plc: "Shared permission high", signals: ["enter_request", "permission_to_enter"], note: "The high permission is not addressed to A or B; either vehicle can read it first.", positions: { A: { x: 59, y: 18 }, B: { x: 48, y: 67 } }, status: "ONE SHARED GRANT", station: "READY", trace: "permission_to_enter = 1 (no vehicle identity)" },
      { time: "00:04", label: "Rear B reads the grant first", owner: "B", plc: "Permission reset", signals: ["entering"], note: "B sends entering before A. PLC interprets that signal as acknowledgement and resets the shared entry permission.", positions: { A: { x: 65, y: 18 }, B: { x: 61, y: 67 } }, status: "B CONSUMES GRANT", station: "ENTRY CONTESTED", trace: "B: entering = 1 → permission_to_enter = 0", fault: true },
      { time: "00:06", label: "A is denied; B is physically blocked", owner: "A + B", plc: "Both vehicles stopped", signals: ["enter_request", "entering"], note: "A never gets its grant. B has consumed it, but cannot pass the front vehicle at the pack entry. This is the simultaneous-request IO stop.", positions: { A: { x: 70, y: 18 }, B: { x: 64, y: 67 } }, status: "A DENIED · B BLOCKED", station: "ENTRY INTERLOCK", trace: "A waits for permission; B waits for A to clear", fault: true },
    ],
  },
  misroutedSignal: {
    number: "04",
    tab: "Signal dispatch",
    eyebrow: "CASE 04 · MULTI-TO-ONE DISPATCH",
    title: "PLC says 1. The vehicle at the point reads 0.",
    subtitle: "A leaves externally without permission; B reaches the departure point, but the later PLC permission is delivered back to A instead of B.",
    rootCause: "PLC publishes one station-level permission; RCS distributes it by position/point binding, which can still point to the earlier vehicle after physical states diverge.",
    impact: "B remains stopped at the departure point even though PLC shows permission sent — because A receives the 1 and B reads 0.",
    immediateFix: "From PLC, reset the permission and send it once more. From RCS, only after confirming a safe exit, skip the IO stage and clear the vehicle IO.",
    maintenance: "Treat this as an observation-and-data-collection issue: record repeat cases, the vehicle point binding, and both RCS/PLC timestamps to confirm the routing condition.",
    steps: [
      { time: "00:00", label: "A requests leave", owner: "A", plc: "Waiting for leave permission", signals: ["request_to_leave"], note: "A is the vehicle that needs to leave PACK 01 and raises the normal leave request.", positions: { A: { x: 84, y: 45 } }, status: "A WAITING TO LEAVE", station: "A OCCUPIED", trace: "A: request_to_leave = 1" },
      { time: "00:02", label: "A leaves externally without permission", owner: "A", plc: "Old request still associated with A", signals: ["request_to_leave", "leaving"], note: "An external condition moves A out of the station before it receives leave permission. Its request remains the known station context.", positions: { A: { x: 17, y: 18 } }, status: "A LEFT EXTERNALLY", station: "EMPTY", trace: "A physically left; PLC/RCS context still points to A", fault: true },
      { time: "00:04", label: "B arrives at the departure point", owner: "B", plc: "One leave channel", signals: ["request_to_leave"], note: "B reaches the station point and becomes the vehicle that actually needs the next leave permission.", positions: { A: { x: 17, y: 18 }, B: { x: 84, y: 45 } }, status: "B WAITING AT POINT", station: "B OCCUPIED", trace: "B at departure point; expected recipient is now B", fault: true },
      { time: "00:06", label: "PLC sends leave permission", owner: "PLC", plc: "Permission-to-leave = 1", signals: ["request_to_leave", "permission_to_leave"], note: "PLC correctly publishes its station-level permission. The fault is in how RCS distributes the signal after the physical order changed.", positions: { A: { x: 17, y: 18 }, B: { x: 84, y: 45 } }, status: "PLC OUTPUT = 1", station: "B STILL OCCUPIED", trace: "PLC: 1 → RCS dispatch selects earlier A, not B", fault: true },
      { time: "00:08", label: "A receives 1; B reads 0", owner: "A + B", plc: "Station process mismatched", signals: ["request_to_leave", "permission_to_leave"], note: "The permission reaches A, which already left externally. B is at the correct point but reads 0, so it remains stopped despite the PLC output showing 1.", positions: { A: { x: 17, y: 18 }, B: { x: 84, y: 45 } }, status: "A = 1 · B = 0", station: "B BLOCKED", trace: "A: permission_to_leave = 1 · B: permission_to_leave = 0", fault: true },
    ],
  },
};

const allSignals = [
  "enter_request",
  "permission_to_enter",
  "entering",
  "at_position",
  "request_action",
  "permission_to_act",
  "request_to_leave",
  "permission_to_leave",
  "leaving",
  "already_left",
];

const vehicleStyles: Record<Vehicle, string> = { A: "agv-a", B: "agv-b", C: "agv-c", D: "agv-d", E: "agv-e" };

export default function Home() {
  const [scenario, setScenario] = useState<ScenarioKey>("doubleStation");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const data = scenarios[scenario];
  const raw = data.steps[step];

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
    }, 1600);
    return () => window.clearInterval(timer);
  }, [playing, data.steps.length]);

  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [scenario]);

  const activeVehicles = useMemo(
    () => Object.entries(raw.positions) as [Vehicle, Position][],
    [raw.positions],
  );

  const isLastStep = step === data.steps.length - 1;

  function selectScenario(key: ScenarioKey) {
    setScenario(key);
  }

  function reset() {
    setStep(0);
    setPlaying(false);
  }

  function togglePlay() {
    if (isLastStep) setStep(0);
    setPlaying((current) => !current);
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brandmark">R</span><span>REER ROBOTICS</span></div>
        <div className="context"><span className="live-dot" /> PACK LINE · IO LAB <span className="version">MODEL 1.1</span></div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">{data.eyebrow}</p>
          <h1>{data.title}</h1>
          <p className="subtitle">{data.subtitle}</p>
        </div>
        <div className="scenario-count">SCENARIO <b>{data.number}</b> / 04</div>
      </section>

      <nav className="scenario-switch" aria-label="Select an IO failure scenario">
        {(Object.entries(scenarios) as [ScenarioKey, Scenario][]).map(([key, item]) => (
          <button key={key} className={scenario === key ? "active" : ""} onClick={() => selectScenario(key)}>
            <span>{item.number}</span><b>{item.tab}</b>
          </button>
        ))}
      </nav>

      <section className="sim-shell">
        <div className="sim-head">
          <span>LIVE PLC / RCS REPLAY</span>
          <div className={`run-status ${raw.fault ? "fault-status" : ""}`}><i />{raw.status}</div>
        </div>

        <div className="plant">
          <div className="track-label">RCS LOOP · SHARED REQUEST IO RANGE · PACK ENTRY</div>
          <div className="track">
            <div className="request-zone"><span>SHARED REQUEST IO RANGE</span></div>
            <div className="merge-mark">NG EXIT / ENTRY MERGE</div>
            <div className={`entry-gate ${raw.fault ? "fault-gate" : ""}`}><span>PACK ENTRY</span></div>
            {activeVehicles.map(([vehicle, position]) => (
              <div
                key={vehicle}
                className={`agv ${vehicleStyles[vehicle]}`}
                style={{ left: `${position.x}%`, top: `${position.y}px` }}
              >
                <span>{vehicle}</span><small>AGV</small>
              </div>
            ))}
            <div className={`station ${raw.fault ? "station-fault" : ""}`}><b>PACK 01</b><span>{raw.station}</span></div>
          </div>
          <div className="io-flow">
            <div className="node"><span>RCS</span><b>{raw.owner}</b><small>signal source / recipient</small></div>
            <div className="wire"><i className="pulse" /><span>shared Boolean IO</span></div>
            <div className={`node plc-node ${raw.fault ? "fault-node" : ""}`}><span>PLC</span><b>{raw.plc}</b><small>phase-based station process</small></div>
          </div>
          <div className={`trace ${raw.fault ? "trace-fault" : ""}`}><span>LIVE TRACE</span><b>{raw.trace}</b></div>

          <div className="plant-controls" aria-label="Scenario playback controls">
            <button className="reset" onClick={reset} aria-label="Reset scenario">↺</button>
            <button className="play" onClick={togglePlay}>{playing ? "Ⅱ Pause" : "▶ Play"}</button>
            <button onClick={() => { setPlaying(false); setStep(Math.max(0, step - 1)); }} aria-label="Previous step">←</button>
            <button onClick={() => { setPlaying(false); setStep(Math.min(data.steps.length - 1, step + 1)); }} aria-label="Next step">→</button>
            <div className="progress" aria-label={`Step ${step + 1} of ${data.steps.length}`}><i style={{ width: `${(step / (data.steps.length - 1)) * 100}%` }} /></div>
            <span>STEP {step + 1} / {data.steps.length}</span>
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
            <div className="panel-title"><span>LIVE IO REGISTER</span><b>{raw.signals.length} HIGH</b></div>
            <div className="signals">
              {allSignals.map((signal) => (
                <div key={signal} className={raw.signals.includes(signal) ? "high" : ""}>
                  <i /><code>{signal}</code><b>{raw.signals.includes(signal) ? "1" : "0"}</b>
                </div>
              ))}
            </div>
          </div>
          <aside className={`explain-panel ${raw.fault ? "fault-explanation" : ""}`}>
            <p>{raw.fault ? "FAILURE MECHANISM" : "CURRENT PLC STATE"}</p>
            <h2>{raw.note}</h2>
            <div className="logic-rule">
              <span>LEGACY PLC BEHAVIOR</span>
              <code>{raw.fault ? "A valid-looking bit changes the station phase; it carries no AGV identity." : "The PLC advances the station handshake from the active Boolean inputs."}</code>
            </div>
            <p className="source-note">Scenario content is taken from the updated PACK correction workbook and incident report.</p>
          </aside>
        </div>
      </section>

      <section className="finding">
        <div><span>CAUSE IN THIS SCENARIO</span><h2>{data.rootCause}</h2></div>
        <p>{data.impact}</p>
        <div className="failure-map"><span>RCS vehicle state</span><i>→</i><span>Shared station IO</span><i>→</i><span>PLC phase state</span><i>→</i><span>Physical line state</span></div>
        <div className="maintenance-grid">
          <article>
            <p>IMMEDIATE RECOVERY</p>
            <h3>{data.immediateFix}</h3>
          </article>
          <article>
            <p>LONG-TERM MAINTENANCE</p>
            <h3>{data.maintenance}</h3>
          </article>
        </div>
      </section>
    </main>
  );
}
