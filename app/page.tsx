"use client";

import { useEffect, useMemo, useState } from "react";

type Vehicle = "A" | "B" | "C" | "D" | "E";
type ScenarioKey = "doubleStation" | "staleSignal" | "simultaneousRequest" | "misroutedSignal";
type Language = "en" | "zh";

type Route = "entry" | "station" | "exit" | "diverted";
type Position = { x: number; y: number; route?: Route };

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
    number: "03",
    tab: "Double-car station",
    eyebrow: "CASE 03 · STALE IO CASCADE",
    title: "One ghost handshake creates a two-car station loop.",
    subtitle: "The full sequence from the updated incident report: diversion, partial reset, manual PLC restart, then a second vehicle is admitted into an occupied station.",
    rootCause: "A PLC sequence is restarted without restoring the ownership of the original vehicle transaction.",
    impact: "B reaches the station first. C is then permitted by the restarted flow, but is blocked by B. The PLC combines C’s request with B’s arrival/action signals and treats them as one vehicle.",
    immediateFix: "Stop the next vehicle, clear IO and process control on both systems, then release the vehicles again from a synchronized state.",
    maintenance: "Do not pull or add AGVs during an active IO handshake. Prefer manual stations for manual moves because they do not have the entry-permission interlock.",
    steps: [
      { time: "00:00", label: "A requests entry", owner: "A", plc: "Entry permission → A", signals: ["enter_request", "permission_to_enter"], note: "PLC opens an entry phase. Its memory is phase-based; it does not identify the vehicle that owns it.", positions: { A: { x: 31, y: 18 } }, status: "A AUTHORIZED", station: "READY", trace: "A: request → PLC: permission" },
      { time: "00:02", label: "A is pulled from the loop", owner: "A", plc: "Transaction remains open", signals: ["enter_request"], note: "A is physically diverted, but its RCS–PLC handshake remains in the process state.", positions: { A: { x: 12, y: 18, route: "diverted" } }, status: "A DIVERTED · IO STILL LIVE", station: "READY", trace: "A moved physically; A IO was not cancelled" },
      { time: "00:04", label: "A leaves a late entering bit", owner: "A", plc: "Entry permission reset", signals: ["entering"], note: "The stale entering bit is accepted as the acknowledgement for the old permission and resets the entry grant.", positions: { A: { x: 13, y: 18, route: "diverted" }, B: { x: 34, y: 67 } }, status: "STALE ENTERING", station: "READY", trace: "A: entering = 1 → permission_to_enter = 0", fault: true },
      { time: "00:06", label: "B requests the same station", owner: "B", plc: "B has no valid grant", signals: ["entering", "enter_request"], note: "B’s request overlaps A’s orphaned entering phase. PLC will not issue B a clean permission.", positions: { A: { x: 13, y: 18, route: "diverted" }, B: { x: 45, y: 67 } }, status: "B IO-STOPPED", station: "READY", trace: "B: request; PLC still sees A: entering", fault: true },
      { time: "00:08", label: "RCS clears only entering", owner: "RCS", plc: "Waiting for action request", signals: ["enter_request"], note: "Clearing the visible bit does not roll back the PLC sequence; PLC assumes a vehicle already consumed entry permission.", positions: { B: { x: 45, y: 67 } }, status: "PARTIAL RESET", station: "READY", trace: "RCS: entering = 0; PLC phase remains advanced", fault: true },
      { time: "00:10", label: "PLC manually permits B and restarts", owner: "PLC", plc: "New flow starts", signals: ["enter_request", "permission_to_enter"], note: "The manual intervention allows B to continue, but restart removes B from the PLC’s tracked transaction.", positions: { B: { x: 62, y: 67 } }, status: "MANUAL RESTART", station: "B ENTERING", trace: "PLC: permission_to_enter → B; flow reset" },
      { time: "00:12", label: "B arrives; C requests entry", owner: "B + C", plc: "C receives entry permission", signals: ["at_position", "request_action", "enter_request", "permission_to_enter"], note: "B is at the station and requests action while C’s new entry request starts the restarted PLC sequence.", positions: { B: { x: 84, y: 45 }, C: { x: 49, y: 18 } }, status: "B IN STATION · C AUTHORIZED", station: "B OCCUPIED", trace: "B: at_position + action_request; C: entry_request" },
      { time: "00:14", label: "C reaches B’s occupied station", owner: "B + C", plc: "Signals fused as one vehicle", signals: ["enter_request", "permission_to_enter", "at_position", "request_action", "entering"], note: "C is admitted into B’s station flow, then blocked by B. PLC combines C’s entry phase with B’s arrival/action phase — the first double-car loop.", positions: { B: { x: 84, y: 45 }, C: { x: 72, y: 18 } }, status: "DOUBLE-CAR LOOP", station: "B OCCUPIED · C BLOCKED", trace: "C: entering; B: arrival/action → PLC sees one false sequence", fault: true },
      { time: "00:16", label: "B completes work and requests leave", owner: "B", plc: "Leave permission → B", signals: ["at_position", "request_action", "request_to_leave", "permission_to_leave"], note: "B eventually completes its station action. The next valid leave phase begins while C is still waiting at the entry.", positions: { B: { x: 84, y: 45 }, C: { x: 72, y: 18 } }, status: "B LEAVE PERMITTED", station: "B LEAVING · C WAITING", trace: "B: request_to_leave → PLC: permission_to_leave" },
      { time: "00:18", label: "B leaves the station", owner: "B", plc: "Waiting for next arrival", signals: ["leaving", "entering"], note: "B clears the physical station. The old two-car sequence has not been repaired; it simply advances to the next phase.", positions: { B: { x: 54, y: 67, route: "exit" }, C: { x: 76, y: 18 } }, status: "B LEFT · C ADVANCING", station: "C ENTERING", trace: "B: leaving; C continues from the blocked entry phase", fault: true },
      { time: "00:20", label: "C reaches position", owner: "C", plc: "C arrival / action phase", signals: ["at_position", "request_action"], note: "C now reaches the station and supplies the arrival/action signals that the PLC expects.", positions: { C: { x: 84, y: 45 }, D: { x: 47, y: 67 } }, status: "C AT POSITION", station: "C OCCUPIED", trace: "C: at_position + request_action" },
      { time: "00:22", label: "D requests entry", owner: "D", plc: "Entry permission → D", signals: ["at_position", "request_action", "enter_request", "permission_to_enter"], note: "While C is in the station, D begins the next entry request. The same phase-based sequence opens again.", positions: { C: { x: 84, y: 45 }, D: { x: 57, y: 67 } }, status: "D AUTHORIZED", station: "C OCCUPIED", trace: "D: enter_request → PLC: permission_to_enter", fault: true },
      { time: "00:24", label: "D sends entering", owner: "D", plc: "Entry permission reset", signals: ["at_position", "request_action", "entering"], note: "D consumes the shared entry phase and reaches C’s occupied station, recreating the same double-car condition.", positions: { C: { x: 84, y: 45 }, D: { x: 72, y: 67 } }, status: "D BLOCKED BY C", station: "C OCCUPIED · D BLOCKED", trace: "D: entering → permission reset while C remains inside", fault: true },
      { time: "00:26", label: "C completes and requests leave", owner: "C", plc: "Leave permission → C", signals: ["at_position", "request_action", "request_to_leave", "permission_to_leave", "entering"], note: "C completes work while D remains in the entry phase. The process now progresses exactly as B’s cycle did.", positions: { C: { x: 84, y: 45 }, D: { x: 72, y: 67 } }, status: "C LEAVE PERMITTED", station: "C LEAVING · D WAITING", trace: "C: request_to_leave; D: entering", fault: true },
      { time: "00:28", label: "C leaves; D advances", owner: "C + D", plc: "Waiting for D arrival", signals: ["leaving", "entering"], note: "C clears the station and D advances. The same broken process passes to the next pair of vehicles.", positions: { C: { x: 54, y: 18, route: "exit" }, D: { x: 77, y: 67 } }, status: "C LEFT · D ADVANCING", station: "D ENTERING", trace: "C: leaving; D resumes its blocked entry", fault: true },
      { time: "00:30", label: "D reaches position; E requests", owner: "D + E", plc: "Entry permission → E", signals: ["at_position", "request_action", "enter_request", "permission_to_enter"], note: "D reaches the station while E begins the next entry request. The state mismatch can therefore continue from B/C to D/E.", positions: { D: { x: 84, y: 45 }, E: { x: 56, y: 18 } }, status: "LOOP RECURRING: D / E", station: "D OCCUPIED", trace: "D: at_position/action; E: enter_request → new shared grant", fault: true },
      { time: "00:32", label: "E consumes the next entry phase", owner: "E", plc: "Same loop repeats", signals: ["at_position", "request_action", "entering"], note: "E sends entering while D occupies the station. Without a synchronized reset, the double-car loop repeats indefinitely vehicle by vehicle.", positions: { D: { x: 84, y: 45 }, E: { x: 72, y: 18 } }, status: "RECURRING LOOP: D / E", station: "D OCCUPIED · E BLOCKED", trace: "E: entering; D: station action → false single-vehicle sequence", fault: true },
    ],
  },
  staleSignal: {
    number: "01",
    tab: "Stale entering",
    eyebrow: "CASE 01 · RESIDUAL SIGNAL",
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
    number: "02",
    tab: "Simultaneous requests",
    eyebrow: "CASE 02 · OVERLAPPING REQUEST ZONE",
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
      { time: "00:02", label: "A leaves externally without permission", owner: "A", plc: "Old request still associated with A", signals: ["request_to_leave", "leaving"], note: "An external condition moves A out of the station before it receives leave permission. Its request remains the known station context.", positions: { A: { x: 66, y: 18, route: "exit" } }, status: "A LEFT EXTERNALLY", station: "EMPTY", trace: "A physically left; PLC/RCS context still points to A", fault: true },
      { time: "00:04", label: "B arrives at the departure point", owner: "B", plc: "One leave channel", signals: ["request_to_leave"], note: "B reaches the station point and becomes the vehicle that actually needs the next leave permission.", positions: { A: { x: 42, y: 18, route: "exit" }, B: { x: 84, y: 45 } }, status: "B WAITING AT POINT", station: "B OCCUPIED", trace: "B at departure point; expected recipient is now B", fault: true },
      { time: "00:06", label: "PLC sends leave permission", owner: "PLC", plc: "Permission-to-leave = 1", signals: ["request_to_leave", "permission_to_leave"], note: "PLC correctly publishes its station-level permission. The fault is in how RCS distributes the signal after the physical order changed.", positions: { A: { x: 28, y: 18, route: "exit" }, B: { x: 84, y: 45 } }, status: "PLC OUTPUT = 1", station: "B STILL OCCUPIED", trace: "PLC: 1 → RCS dispatch selects earlier A, not B", fault: true },
      { time: "00:08", label: "A receives 1; B reads 0", owner: "A + B", plc: "Station process mismatched", signals: ["request_to_leave", "permission_to_leave"], note: "The permission reaches A, which already left externally. B is at the correct point but reads 0, so it remains stopped despite the PLC output showing 1.", positions: { A: { x: 14, y: 18, route: "exit" }, B: { x: 84, y: 45 } }, status: "A = 1 · B = 0", station: "B BLOCKED", trace: "A: permission_to_leave = 1 · B: permission_to_leave = 0", fault: true },
    ],
  },
};

const scenarioOrder: ScenarioKey[] = ["staleSignal", "simultaneousRequest", "doubleStation", "misroutedSignal"];

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

const chrome = {
  en: {
    packLab: "PACK LINE · IO LAB",
    model: "MODEL 1.2",
    scenario: "SCENARIO",
    replay: "LIVE PLC / RCS REPLAY",
    track: "RCS LOOP · SHARED REQUEST IO RANGE · PACK ENTRY",
    requestZone: "SHARED REQUEST IO RANGE",
    merge: "NG EXIT / ENTRY MERGE",
    entry: "PACK ENTRY",
    entryPath: "ENTRY PATH · RCS LOOP →",
    exitPath: "LEAVING PATH · OUTBOUND / NG EXIT ←",
    source: "signal source / recipient",
    booleanIo: "shared Boolean IO",
    process: "phase-based station process",
    trace: "LIVE TRACE",
    play: "▶ Play",
    pause: "Ⅱ Pause",
    resetScenario: "Reset scenario",
    previousStep: "Previous step",
    nextStep: "Next step",
    step: "STEP",
    timeline: "EVENT TIMELINE",
    register: "LIVE IO REGISTER",
    high: "HIGH",
    mechanism: "FAILURE MECHANISM",
    plcState: "CURRENT PLC STATE",
    legacy: "LEGACY PLC BEHAVIOR",
    failureRule: "A valid-looking bit changes the station phase; it carries no AGV identity.",
    normalRule: "The PLC advances the station handshake from the active Boolean inputs.",
    sourceNote: "Scenario content is taken from the updated PACK correction workbook and incident report.",
    cause: "CAUSE IN THIS SCENARIO",
    rcsState: "RCS vehicle state",
    stationIo: "Shared station IO",
    plcPhase: "PLC phase state",
    physical: "Physical line state",
    recovery: "IMMEDIATE RECOVERY",
    maintenance: "LONG-TERM MAINTENANCE",
    agv: "AGV",
  },
  zh: {
    packLab: "PACK 产线 · IO 实验室",
    model: "模型 1.2",
    scenario: "场景",
    replay: "PLC / RCS 实时回放",
    track: "RCS 环线 · 共享请求 IO 区间 · PACK 入口",
    requestZone: "共享请求 IO 区间",
    merge: "NG 下线 / 进站交汇点",
    entry: "PACK 入口",
    entryPath: "进入路径 · RCS 环线 →",
    exitPath: "离开路径 · 出站 / NG 下线 ←",
    source: "信号来源 / 接收对象",
    booleanIo: "共享布尔 IO",
    process: "基于阶段的站台流程",
    trace: "实时追踪",
    play: "▶ 播放",
    pause: "Ⅱ 暂停",
    resetScenario: "重置场景",
    previousStep: "上一步",
    nextStep: "下一步",
    step: "步骤",
    timeline: "事件时间线",
    register: "实时 IO 寄存器",
    high: "高电平",
    mechanism: "故障机理",
    plcState: "当前 PLC 状态",
    legacy: "现有 PLC 行为",
    failureRule: "看似有效的信号位会改变站台阶段，但它不携带 AGV 身份。",
    normalRule: "PLC 根据当前布尔输入推进站台握手流程。",
    sourceNote: "场景内容取自更新后的 PACK 纠错工作簿和事件报告。",
    cause: "本场景的原因",
    rcsState: "RCS 车辆状态",
    stationIo: "共享站台 IO",
    plcPhase: "PLC 阶段状态",
    physical: "实际产线状态",
    recovery: "立即处置",
    maintenance: "长期维护",
    agv: "AGV",
  },
} as const;

const signalLabels: Record<string, string> = {
  enter_request: "请求进入",
  permission_to_enter: "允许进入",
  entering: "正在进入",
  at_position: "到位",
  request_action: "请求动作",
  permission_to_act: "允许动作",
  request_to_leave: "请求离开",
  permission_to_leave: "允许离开",
  leaving: "正在离开",
  already_left: "已离开",
};

const chineseText: Record<string, string> = {
  "Double-car station": "双车同站",
  "CASE 03 · STALE IO CASCADE": "场景 03 · 遗留 IO 连锁",
  "One ghost handshake creates a two-car station loop.": "一次遗留握手会形成双车同站循环。",
  "The full sequence from the updated incident report: diversion, partial reset, manual PLC restart, then a second vehicle is admitted into an occupied station.": "根据更新后的事件报告完整复现：车辆被拉离、局部复位、PLC 人工重启，随后第二辆车被放入已占用的站台。",
  "A PLC sequence is restarted without restoring the ownership of the original vehicle transaction.": "PLC 流程被重启，但没有恢复原始车辆事务的归属关系。",
  "B reaches the station first. C is then permitted by the restarted flow, but is blocked by B. The PLC combines C’s request with B’s arrival/action signals and treats them as one vehicle.": "B 先到达站台；重启后的流程又允许 C 进入，但 C 被 B 挡住。PLC 将 C 的请求与 B 的到位/动作信号组合，并误认为它们来自同一辆车。",
  "Stop the next vehicle, clear IO and process control on both systems, then release the vehicles again from a synchronized state.": "截停下一辆车，清空两套系统的 IO 与流程控制，再从同步状态重新放行车辆。",
  "Do not pull or add AGVs during an active IO handshake. Prefer manual stations for manual moves because they do not have the entry-permission interlock.": "不要在 IO 握手进行中拉走或加入 AGV。人工移动应优先在人工站台完成，因为那里没有允许进入的互锁。",
  "A requests entry": "A 请求进入",
  "Entry permission → A": "允许进入 → A",
  "PLC opens an entry phase. Its memory is phase-based; it does not identify the vehicle that owns it.": "PLC 打开进入阶段。其记忆基于流程阶段，而不识别拥有该阶段的车辆。",
  "A AUTHORIZED": "A 已获许可",
  "READY": "就绪",
  "A: request → PLC: permission": "A：请求 → PLC：允许",
  "A is pulled from the loop": "A 被拉出环线",
  "Transaction remains open": "流程事务仍开启",
  "A is physically diverted, but its RCS–PLC handshake remains in the process state.": "A 已被物理拉离，但其 RCS–PLC 握手仍保留在流程状态中。",
  "A DIVERTED · IO STILL LIVE": "A 已拉离 · IO 仍有效",
  "A moved physically; A IO was not cancelled": "A 已被物理移动；A 的 IO 未取消",
  "A leaves a late entering bit": "A 遗留延迟的正在进入信号",
  "Entry permission reset": "允许进入已复位",
  "Permission reset": "许可已复位",
  "The stale entering bit is accepted as the acknowledgement for the old permission and resets the entry grant.": "遗留的正在进入信号被当作旧许可的确认，导致允许进入被复位。",
  "STALE ENTERING": "遗留正在进入",
  "A: entering = 1 → permission_to_enter = 0": "A：正在进入 = 1 → 允许进入 = 0",
  "B requests the same station": "B 请求同一站台",
  "B has no valid grant": "B 没有有效许可",
  "B’s request overlaps A’s orphaned entering phase. PLC will not issue B a clean permission.": "B 的请求与 A 无归属的正在进入阶段重叠。PLC 无法向 B 发出完整有效的许可。",
  "B IO-STOPPED": "B 因 IO 停止",
  "B: request; PLC still sees A: entering": "B：请求；PLC 仍看到 A：正在进入",
  "RCS clears only entering": "RCS 仅清空正在进入",
  "Waiting for action request": "等待请求动作",
  "Clearing the visible bit does not roll back the PLC sequence; PLC assumes a vehicle already consumed entry permission.": "清空可见信号位不会回退 PLC 流程；PLC 仍认为有一辆车已经获取了允许进入。",
  "PARTIAL RESET": "局部复位",
  "RCS: entering = 0; PLC phase remains advanced": "RCS：正在进入 = 0；PLC 阶段仍已推进",
  "PLC manually permits B and restarts": "PLC 人工允许 B 并重启",
  "New flow starts": "新流程启动",
  "The manual intervention allows B to continue, but restart removes B from the PLC’s tracked transaction.": "人工干预让 B 可以继续，但流程重启使 B 脱离 PLC 的事务跟踪。",
  "MANUAL RESTART": "人工重启",
  "B ENTERING": "B 正在进入",
  "PLC: permission_to_enter → B; flow reset": "PLC：允许进入 → B；流程重置",
  "B arrives; C requests entry": "B 到位；C 请求进入",
  "C receives entry permission": "C 获得允许进入",
  "B is at the station and requests action while C’s new entry request starts the restarted PLC sequence.": "B 已在站台并请求动作；C 的新进入请求则启动了重启后的 PLC 流程。",
  "B IN STATION · C AUTHORIZED": "B 在站内 · C 已获许可",
  "B OCCUPIED": "B 占用",
  "B: at_position + action_request; C: entry_request": "B：到位 + 请求动作；C：请求进入",
  "C reaches B’s occupied station": "C 到达 B 已占用的站台",
  "Signals fused as one vehicle": "信号被融合为同一辆车",
  "C is admitted into B’s station flow, then blocked by B. PLC combines C’s entry phase with B’s arrival/action phase — the first double-car loop.": "C 被放入 B 的站台流程，随后被 B 挡住。PLC 将 C 的进入阶段与 B 的到位/动作阶段组合——形成首个双车循环。",
  "DOUBLE-CAR LOOP": "双车循环",
  "B OCCUPIED · C BLOCKED": "B 占用 · C 被阻挡",
  "C: entering; B: arrival/action → PLC sees one false sequence": "C：正在进入；B：到位/动作 → PLC 看到一条错误的单车流程",
  "B completes work and requests leave": "B 完成作业并请求离开",
  "Leave permission → B": "允许离开 → B",
  "B eventually completes its station action. The next valid leave phase begins while C is still waiting at the entry.": "B 最终完成站内动作。在 C 仍等待入口时，下一条有效的离开阶段开始。",
  "B LEAVE PERMITTED": "B 已获离开许可",
  "B LEAVING · C WAITING": "B 正在离开 · C 等待",
  "B: request_to_leave → PLC: permission_to_leave": "B：请求离开 → PLC：允许离开",
  "B leaves the station": "B 离开站台",
  "Waiting for next arrival": "等待下一辆车到位",
  "B clears the physical station. The old two-car sequence has not been repaired; it simply advances to the next phase.": "B 清空了物理站台。旧的双车流程并未被修复，只是推进到下一个阶段。",
  "B LEFT · C ADVANCING": "B 已离开 · C 正在推进",
  "C ENTERING": "C 正在进入",
  "B: leaving; C continues from the blocked entry phase": "B：正在离开；C 从被阻挡的进入阶段继续",
  "C reaches position": "C 到位",
  "C arrival / action phase": "C 到位 / 动作阶段",
  "C now reaches the station and supplies the arrival/action signals that the PLC expects.": "C 现在到达站台，并发出 PLC 所等待的到位/动作信号。",
  "C AT POSITION": "C 已到位",
  "C OCCUPIED": "C 占用",
  "C: at_position + request_action": "C：到位 + 请求动作",
  "D requests entry": "D 请求进入",
  "Entry permission → D": "允许进入 → D",
  "While C is in the station, D begins the next entry request. The same phase-based sequence opens again.": "C 在站内时，D 发起下一次进入请求。相同的基于阶段的流程再次开启。",
  "D AUTHORIZED": "D 已获许可",
  "D: enter_request → PLC: permission_to_enter": "D：请求进入 → PLC：允许进入",
  "D sends entering": "D 发出正在进入",
  "D consumes the shared entry phase and reaches C’s occupied station, recreating the same double-car condition.": "D 消耗共享进入阶段并到达 C 占用的站台，再次形成相同的双车条件。",
  "D BLOCKED BY C": "D 被 C 阻挡",
  "C OCCUPIED · D BLOCKED": "C 占用 · D 被阻挡",
  "D: entering → permission reset while C remains inside": "D：正在进入 → C 仍在站内时允许进入被复位",
  "C completes and requests leave": "C 完成作业并请求离开",
  "Leave permission → C": "允许离开 → C",
  "C completes work while D remains in the entry phase. The process now progresses exactly as B’s cycle did.": "C 完成作业时 D 仍处于进入阶段。流程将完全按 B 的循环方式推进。",
  "C LEAVE PERMITTED": "C 已获离开许可",
  "C LEAVING · D WAITING": "C 正在离开 · D 等待",
  "C: request_to_leave; D: entering": "C：请求离开；D：正在进入",
  "C leaves; D advances": "C 离开；D 推进",
  "Waiting for D arrival": "等待 D 到位",
  "C clears the station and D advances. The same broken process passes to the next pair of vehicles.": "C 清空站台后 D 推进。相同的错误流程传递给下一对车辆。",
  "C LEFT · D ADVANCING": "C 已离开 · D 正在推进",
  "D ENTERING": "D 正在进入",
  "C: leaving; D resumes its blocked entry": "C：正在离开；D 恢复被阻挡的进入",
  "D reaches position; E requests": "D 到位；E 请求进入",
  "Entry permission → E": "允许进入 → E",
  "D reaches the station while E begins the next entry request. The state mismatch can therefore continue from B/C to D/E.": "D 到达站台时 E 发起下一次进入请求。状态失配因而从 B/C 延续到 D/E。",
  "LOOP RECURRING: D / E": "循环再次发生：D / E",
  "D OCCUPIED": "D 占用",
  "D: at_position/action; E: enter_request → new shared grant": "D：到位/动作；E：请求进入 → 新的共享许可",
  "E consumes the next entry phase": "E 消耗下一次进入阶段",
  "Same loop repeats": "相同循环再次出现",
  "E sends entering while D occupies the station. Without a synchronized reset, the double-car loop repeats indefinitely vehicle by vehicle.": "D 占用站台时 E 发出正在进入。若不进行同步复位，双车循环将逐车无限重复。",
  "RECURRING LOOP: D / E": "重复循环：D / E",
  "D OCCUPIED · E BLOCKED": "D 占用 · E 被阻挡",
  "E: entering; D: station action → false single-vehicle sequence": "E：正在进入；D：站内动作 → 错误的单车流程",
  "Stale entering": "遗留正在进入",
  "CASE 01 · RESIDUAL SIGNAL": "场景 01 · 遗留信号",
  "A single stale entering bit removes permission.": "单个遗留的正在进入信号会取消许可。",
  "An operator action in RCS or Xpress leaves an entering signal at the station; PLC resets permission and the next vehicle cannot enter.": "RCS 或 Xpress 中的人工操作在站台留下正在进入信号；PLC 复位许可，下一辆车无法进入。",
  "The `entering` bit is accepted without proving it belongs to the currently authorised vehicle.": "未验证 `entering` 信号是否属于当前已获许可的车辆就被 PLC 接受。",
  "The PLC shows an entry phase as complete, while the next AGV sees no valid permission and stops at the request zone.": "PLC 显示进入阶段已完成，但下一辆 AGV 看不到有效许可并停在请求区。",
  "Reset the extra signal from the AGV through Xpress or correct it from the PLC side; this fault can be cleared by manually sending the needed signal.": "通过 Xpress 从 AGV 端复位多余信号，或从 PLC 侧修正；该故障可通过人工发送所需信号清除。",
  "Strengthen IO training and supervision so signals are not sent or retained unintentionally; also consider power-cycle and network-loss signal effects during diagnosis.": "加强 IO 培训与监管，避免误发送或遗留信号；诊断时还应考虑断电重启和断网引起的信号影响。",
  "Entry permission high": "允许进入为高",
  "A has a normal request and the PLC publishes the shared entry permission.": "A 发出正常请求，PLC 发布共享的允许进入信号。",
  "ENTRY PERMITTED": "允许进入",
  "A: request → permission_to_enter = 1": "A：请求 → 允许进入 = 1",
  "Entering remains after manual work": "人工操作后正在进入仍遗留",
  "A residual entering bit may be sent or retained by RCS/Xpress during manual recovery.": "人工恢复时，RCS/Xpress 可能发送或保留遗留的正在进入信号。",
  "GHOST ENTERING": "遗留正在进入",
  "stale entering = 1 → permission_to_enter = 0": "遗留正在进入 = 1 → 允许进入 = 0",
  "Next vehicle requests entry": "下一辆车请求进入",
  "No entry permission": "无允许进入",
  "B has a legitimate request, but the stale bit keeps the PLC state inconsistent and B stops outside the station.": "B 的请求是有效的，但遗留信号使 PLC 状态不一致，B 停在站台外。",
  "B: request = 1; PLC: entry grant remains reset": "B：请求 = 1；PLC：允许进入保持复位",
  "Simultaneous requests": "同时请求进入",
  "CASE 02 · OVERLAPPING REQUEST ZONE": "场景 02 · 请求区重叠",
  "Two entry requests race for one Boolean grant.": "两个进入请求竞争同一个布尔许可。",
  "The NG exit/entry intersection overlaps the request IO range, allowing a front and rear AGV to request entry in the same window.": "NG 下线/进站交汇点与请求 IO 范围重叠，使前后两辆 AGV 能在同一时间窗请求进入。",
  "The request range is long enough for two AGVs to hold the same `enter_request` bit high at once.": "请求范围过长，使两辆 AGV 可以同时保持同一个 `enter_request` 信号为高。",
  "If the rear vehicle samples the shared grant first, it sends entering and resets the grant. The front vehicle is denied; the rear vehicle is blocked by the front.": "若后车先读取共享许可，它会发出正在进入并复位许可。前车被拒绝，后车又被前车挡住。",
  "Move the front vehicle away, let the rear vehicle proceed first, then add the front vehicle back into the route.": "移走前车，让后车先行，再将前车重新加入路线。",
  "Keep the request distance short enough that the NG exit/entry crossing cannot contain two simultaneous requesters; the report notes this adjustment was made with the GZ site team.": "缩短请求距离，确保 NG 下线/进站交汇处不会出现两辆车同时请求；报告指出已与 GZ 现场团队完成该调整。",
  "A and B enter the shared request zone": "A 和 B 进入共享请求区",
  "One request bit = high": "一个请求信号位 = 高",
  "Both cars are physically distinct, but the PLC receives only one shared Boolean request.": "两辆车在物理上不同，但 PLC 只接收一个共享的布尔请求。",
  "TWO REQUESTERS": "两个请求者",
  "A: request = 1 + B: request = 1 → PLC sees only 1": "A：请求 = 1 + B：请求 = 1 → PLC 只看到 1",
  "PLC issues one entry permission": "PLC 发出一次允许进入",
  "Shared permission high": "共享许可为高",
  "The high permission is not addressed to A or B; either vehicle can read it first.": "高电平许可没有指定给 A 或 B；任一车辆都可能先读取它。",
  "ONE SHARED GRANT": "一次共享许可",
  "permission_to_enter = 1 (no vehicle identity)": "允许进入 = 1（没有车辆身份）",
  "Rear B reads the grant first": "后车 B 先读取许可",
  "B sends entering before A. PLC interprets that signal as acknowledgement and resets the shared entry permission.": "B 比 A 更早发出正在进入。PLC 将其当作确认并复位共享的允许进入。",
  "B CONSUMES GRANT": "B 消耗许可",
  "ENTRY CONTESTED": "入口竞争",
  "B: entering = 1 → permission_to_enter = 0": "B：正在进入 = 1 → 允许进入 = 0",
  "A is denied; B is physically blocked": "A 被拒绝；B 被物理阻挡",
  "Both vehicles stopped": "两辆车均停止",
  "A never gets its grant. B has consumed it, but cannot pass the front vehicle at the pack entry. This is the simultaneous-request IO stop.": "A 从未获得许可。B 已消耗许可，但无法在 PACK 入口越过前车。这就是同时请求造成的 IO 停止。",
  "A DENIED · B BLOCKED": "A 被拒绝 · B 被阻挡",
  "ENTRY INTERLOCK": "入口互锁",
  "A waits for permission; B waits for A to clear": "A 等待许可；B 等待 A 离开",
  "Signal dispatch": "信号分派错误",
  "CASE 04 · MULTI-TO-ONE DISPATCH": "场景 04 · 多对一信号分派",
  "PLC says 1. The vehicle at the point reads 0.": "PLC 显示 1，点位上的车辆读取 0。",
  "A leaves externally without permission; B reaches the departure point, but the later PLC permission is delivered back to A instead of B.": "A 未获得许可便因外部因素离开；B 到达离开点位，但 PLC 随后的许可被分派回 A，而不是 B。",
  "PLC publishes one station-level permission; RCS distributes it by position/point binding, which can still point to the earlier vehicle after physical states diverge.": "PLC 发布一条站台级许可；RCS 按位置/点位绑定分派。当物理状态已分离时，绑定仍可能指向前一辆车。",
  "B remains stopped at the departure point even though PLC shows permission sent — because A receives the 1 and B reads 0.": "虽然 PLC 显示已发送许可，B 仍停在离开点位——因为 A 收到 1，而 B 读取 0。",
  "From PLC, reset the permission and send it once more. From RCS, only after confirming a safe exit, skip the IO stage and clear the vehicle IO.": "从 PLC 侧先复位许可，再重新发送一次。从 RCS 侧，仅在确认可安全离开站台后，跳过 IO 阶段并清空车辆 IO。",
  "Treat this as an observation-and-data-collection issue: record repeat cases, the vehicle point binding, and both RCS/PLC timestamps to confirm the routing condition.": "将此作为观察与数据收集问题处理：记录重复案例、车辆点位绑定以及 RCS/PLC 双方时间戳，以确认分派条件。",
  "A requests leave": "A 请求离开",
  "Waiting for leave permission": "等待允许离开",
  "A is the vehicle that needs to leave PACK 01 and raises the normal leave request.": "A 是需要离开 PACK 01 的车辆，并发出正常离开请求。",
  "A WAITING TO LEAVE": "A 等待离开",
  "A OCCUPIED": "A 占用",
  "A: request_to_leave = 1": "A：请求离开 = 1",
  "A leaves externally without permission": "A 未获许可即因外部因素离开",
  "Old request still associated with A": "旧请求仍关联到 A",
  "An external condition moves A out of the station before it receives leave permission. Its request remains the known station context.": "外部条件在 A 获得允许离开前将其移出站台。其请求仍保留为已知的站台上下文。",
  "A LEFT EXTERNALLY": "A 因外部因素已离开",
  "EMPTY": "空闲",
  "A physically left; PLC/RCS context still points to A": "A 已物理离开；PLC/RCS 上下文仍指向 A",
  "B arrives at the departure point": "B 到达离开点位",
  "One leave channel": "单一离开通道",
  "B reaches the station point and becomes the vehicle that actually needs the next leave permission.": "B 到达站台点位，成为实际需要下一次允许离开的车辆。",
  "B WAITING AT POINT": "B 在点位等待",
  "B OCCUPIED": "B 占用",
  "B at departure point; expected recipient is now B": "B 在离开点位；预期接收者现在是 B",
  "PLC sends leave permission": "PLC 发送允许离开",
  "Permission-to-leave = 1": "允许离开 = 1",
  "PLC correctly publishes its station-level permission. The fault is in how RCS distributes the signal after the physical order changed.": "PLC 正确发布了站台级许可。故障发生在物理顺序改变后 RCS 如何分派该信号。",
  "PLC OUTPUT = 1": "PLC 输出 = 1",
  "B STILL OCCUPIED": "B 仍占用",
  "PLC: 1 → RCS dispatch selects earlier A, not B": "PLC：1 → RCS 分派选择前一辆 A，而非 B",
  "A receives 1; B reads 0": "A 收到 1；B 读取 0",
  "Station process mismatched": "站台流程失配",
  "The permission reaches A, which already left externally. B is at the correct point but reads 0, so it remains stopped despite the PLC output showing 1.": "许可到达已因外部因素离开的 A。B 位于正确点位却读取 0，因此即使 PLC 输出显示 1，B 仍保持停止。",
  "A = 1 · B = 0": "A = 1 · B = 0",
  "B BLOCKED": "B 被阻挡",
  "A: permission_to_leave = 1 · B: permission_to_leave = 0": "A：允许离开 = 1 · B：允许离开 = 0",
  "Manual action": "人工操作",
};

function translate(value: string, language: Language) {
  return language === "zh" ? chineseText[value] ?? value : value;
}

export default function Home() {
  const [scenario, setScenario] = useState<ScenarioKey>("staleSignal");
  const [language, setLanguage] = useState<Language>("en");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const data = scenarios[scenario];
  const safeStep = Math.min(Math.max(step, 0), data.steps.length - 1);
  const raw = data.steps[safeStep] ?? data.steps[0];
  const copy = chrome[language];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStep((current) => {
        const currentStep = Math.min(Math.max(current, 0), data.steps.length - 1);
        if (currentStep >= data.steps.length - 1) {
          setPlaying(false);
          return data.steps.length - 1;
        }
        return currentStep + 1;
      });
    }, 1600);
    return () => window.clearInterval(timer);
  }, [playing, scenario, data.steps.length]);

  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [scenario]);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  const activeVehicles = useMemo(
    () => Object.entries(raw.positions) as [Vehicle, Position][],
    [raw.positions],
  );

  const isLastStep = safeStep === data.steps.length - 1;

  function selectScenario(key: ScenarioKey) {
    setPlaying(false);
    setStep(0);
    setScenario(key);
  }

  function reset() {
    setStep(0);
    setPlaying(false);
  }

  function togglePlay() {
    if (isLastStep) {
      setStep(0);
      setPlaying(true);
      return;
    }
    setPlaying((current) => !current);
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand"><img className="company-logo" src="/reer-robotics-logo.png" alt="REER Robotics" /></div>
        <div className="topbar-actions">
          <div className="context"><span className="live-dot" /> {copy.packLab} <span className="version">{copy.model}</span></div>
          <div className="language-switch" aria-label={language === "zh" ? "语言选择" : "Language selector"}>
            <button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button>
            <button className={language === "zh" ? "active" : ""} onClick={() => setLanguage("zh")}>中文</button>
          </div>
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">{translate(data.eyebrow, language)}</p>
          <h1>{translate(data.title, language)}</h1>
          <p className="subtitle">{translate(data.subtitle, language)}</p>
        </div>
        <div className="scenario-count">{copy.scenario} <b>{data.number}</b> / 04</div>
      </section>

      <nav className="scenario-switch" aria-label={language === "zh" ? "选择 IO 故障场景" : "Select an IO failure scenario"}>
        {scenarioOrder.map((key) => {
          const item = scenarios[key];
          return (
          <button key={key} className={scenario === key ? "active" : ""} onClick={() => selectScenario(key)}>
            <span>{item.number}</span><b>{translate(item.tab, language)}</b>
          </button>
          );
        })}
      </nav>

      <section className="sim-shell">
        <div className="sim-head">
          <span>{copy.replay}</span>
          <div className={`run-status ${raw.fault ? "fault-status" : ""}`}><i />{translate(raw.status, language)}</div>
        </div>

        <div className="plant">
          <div className="track-label">{copy.track}</div>
          <div className="track">
            <div className="flow-path entry-path"><span>{copy.entryPath}</span></div>
            <div className="flow-path exit-path"><span>{copy.exitPath}</span></div>
            <div className="request-zone"><span>{copy.requestZone}</span></div>
            <div className="merge-mark">{copy.merge}</div>
            <div className={`entry-gate ${raw.fault ? "fault-gate" : ""}`}><span>{copy.entry}</span></div>
            {activeVehicles.map(([vehicle, position]) => {
              const route = position.route ?? (position.x >= 79 ? "station" : "entry");
              return (
                <div
                  key={vehicle}
                  className={`agv ${vehicleStyles[vehicle]} agv-route-${route}`}
                  style={{ left: `${position.x}%` }}
                >
                  <span>{vehicle}</span><small>{copy.agv}</small>
                </div>
              );
            })}
            <div className={`station ${raw.fault ? "station-fault" : ""}`}><b>PACK 01</b><span>{translate(raw.station, language)}</span></div>
          </div>
          <div className="io-flow">
            <div className="node"><span>RCS</span><b>{translate(raw.owner, language)}</b><small>{copy.source}</small></div>
            <div className="wire"><i className="pulse" /><span>{copy.booleanIo}</span></div>
            <div className={`node plc-node ${raw.fault ? "fault-node" : ""}`}><span>PLC</span><b>{translate(raw.plc, language)}</b><small>{copy.process}</small></div>
          </div>
          <div className={`trace ${raw.fault ? "trace-fault" : ""}`}><span>{copy.trace}</span><b>{translate(raw.trace, language)}</b></div>

          <div className="plant-controls" aria-label={language === "zh" ? "场景播放控制" : "Scenario playback controls"}>
            <button className="reset" onClick={reset} aria-label={copy.resetScenario}>↺</button>
            <button className="play" onClick={togglePlay}>{playing ? copy.pause : copy.play}</button>
            <button onClick={() => { setPlaying(false); setStep((current) => Math.max(0, Math.min(data.steps.length - 1, current - 1))); }} aria-label={copy.previousStep}>←</button>
            <button onClick={() => { setPlaying(false); setStep((current) => Math.max(0, Math.min(data.steps.length - 1, current + 1))); }} aria-label={copy.nextStep}>→</button>
            <div className="progress" aria-label={`${copy.step} ${safeStep + 1} / ${data.steps.length}`}><i style={{ width: `${(safeStep / Math.max(1, data.steps.length - 1)) * 100}%` }} /></div>
            <span>{copy.step} {safeStep + 1} / {data.steps.length}</span>
          </div>
        </div>

        <div className="console-grid">
          <div className="timeline-panel">
            <div className="panel-title"><span>{copy.timeline}</span><b>{raw.time}</b></div>
            <div className="timeline">
              {data.steps.map((item, index) => (
                <button key={item.time} onClick={() => { setStep(index); setPlaying(false); }} className={index === safeStep ? "current" : index < safeStep ? "past" : ""}>
                  <i /> <span>{item.time}</span><b>{translate(item.label, language)}</b>
                </button>
              ))}
            </div>
          </div>
          <div className="signal-panel">
            <div className="panel-title"><span>{copy.register}</span><b>{raw.signals.length} {copy.high}</b></div>
            <div className="signals">
              {allSignals.map((signal) => (
                <div key={signal} className={raw.signals.includes(signal) ? "high" : ""}>
                  <i /><code>{language === "zh" ? `${signalLabels[signal]} · ${signal}` : signal}</code><b>{raw.signals.includes(signal) ? "1" : "0"}</b>
                </div>
              ))}
            </div>
          </div>
          <aside className={`explain-panel ${raw.fault ? "fault-explanation" : ""}`}>
            <p>{raw.fault ? copy.mechanism : copy.plcState}</p>
            <h2>{translate(raw.note, language)}</h2>
            <div className="logic-rule">
              <span>{copy.legacy}</span>
              <code>{raw.fault ? copy.failureRule : copy.normalRule}</code>
            </div>
            <p className="source-note">{copy.sourceNote}</p>
          </aside>
        </div>
      </section>

      <section className="finding">
        <div><span>{copy.cause}</span><h2>{translate(data.rootCause, language)}</h2></div>
        <p>{translate(data.impact, language)}</p>
        <div className="failure-map"><span>{copy.rcsState}</span><i>→</i><span>{copy.stationIo}</span><i>→</i><span>{copy.plcPhase}</span><i>→</i><span>{copy.physical}</span></div>
        <div className="maintenance-grid">
          <article>
            <p>{copy.recovery}</p>
            <h3>{translate(data.immediateFix, language)}</h3>
          </article>
          <article>
            <p>{copy.maintenance}</p>
            <h3>{translate(data.maintenance, language)}</h3>
          </article>
        </div>
      </section>
    </main>
  );
}
