import React, { useState, useEffect, useRef, useCallback } from "react";

// ── PERIODS & DAYS ────────────────────────────────────────────────────────────
const PERIODS = [
  { label: "1st", time: "8:40-9:20" },
  { label: "2nd", time: "9:20-10:00" },
  { label: "3rd", time: "10:00-10:40" },
  { label: "4th", time: "10:50-11:30" },
  { label: "5th", time: "11:30-12:05" },
  { label: "6th", time: "12:25-1:05" },
  { label: "7th", time: "1:05-1:40" },
  { label: "8th", time: "1:40-2:15" },
  { label: "Diary", time: "Diary" },
];

const BREAK_AFTER_IDX = 4;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── LocalStorage helpers ──────────────────────────────────────────────────────
const LS_SCHOOL_KEY = "tas_school_info";
const LS_LOGO_KEY = "tas_school_logo";
const LS_SHEET_URL_KEY = "tas_sheet_url";

const DEFAULT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1jsvywGYMQ_dYZb1cpFGsREMA575hbzkDoa2F0R9VkFw/edit?usp=sharing";

function saveSchoolInfo(info: SchoolInfo) {
  const { logoUrl, ...rest } = info;
  localStorage.setItem(LS_SCHOOL_KEY, JSON.stringify(rest));
  if (logoUrl) localStorage.setItem(LS_LOGO_KEY, logoUrl);
}

interface SchoolInfo {
  name1: string;
  name2: string;
  type: string;
  address: string;
  phone: string;
  logoUrl: string;
}

function loadSchoolInfo(): SchoolInfo {
  const defaults: SchoolInfo = {
    name1: "GITA NIKETAN",
    name2: "AWASIYA",
    type: "VIDYALAYA",
    address: "Salarpur Road, Kurukshetra (Haryana)",
    phone: "Ph: 01744-270896, 259084",
    logoUrl: "",
  };
  try {
    const saved = localStorage.getItem(LS_SCHOOL_KEY);
    const logo = localStorage.getItem(LS_LOGO_KEY) || "";
    if (saved) return { ...defaults, ...JSON.parse(saved), logoUrl: logo };
  } catch {}
  return defaults;
}

function loadSheetUrl(): string {
  return localStorage.getItem(LS_SHEET_URL_KEY) || DEFAULT_SHEET_URL;
}

// ── CSV Parser ────────────────────────────────────────────────────────────────
function parseCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  for (const line of csvText.split("\n")) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

function isDay(val: string) {
  return /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(val.trim());
}
function isClass(val: string) {
  return /^(I{1,3}|IV|V|VI{0,3}|VIII|IX|X{1,2}|XI{0,2}|XII|\d{1,2})[\s\-]?[A-Z]\d?$/i.test(val.trim());
}
function isTeacherName(val: string) {
  const v = val.trim();
  if (v.length < 4) return false;
  if (/^\d+$/.test(v)) return false;
  if (isClass(v) || isDay(v)) return false;
  if (/^(days|periods?|load|sr\.?no?|s\.no|name|teacher|subject|class|time|date|schedule|free|off|break|recess|lunch|assembly|diary)$/i.test(v)) return false;
  if (/^\d+[\.\)]\s*/.test(v)) return false;
  const letters = (v.match(/[a-zA-Z]/g) || []).length;
  return letters / v.length >= 0.65;
}

interface Teacher {
  name: string;
  schedule: Record<string, string[]>;
}

function extractTeachers(rows: string[][]): Teacher[] {
  const teachers: Teacher[] = [];
  const seen = new Set<string>();
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    const fc = (row[0] ?? "").trim(), sc = (row[1] ?? "").trim();
    let name = "";
    if (isTeacherName(fc)) name = fc;
    else if (isTeacherName(sc) && !isTeacherName(fc)) name = sc;
    else {
      const s = fc.replace(/^[\d.\-\s]+/, "").trim();
      if (isTeacherName(s) && s.length > 3) name = s;
    }
    if (name && !seen.has(name.toLowerCase())) {
      const schedule: Record<string, string[]> = {};
      let j = i + 1, daysFound = 0;
      while (j < rows.length && daysFound < 8) {
        const r = rows[j];
        const dc = (r[0] ?? "").trim();
        if (isDay(dc)) {
          const dk = dc.charAt(0).toUpperCase() + dc.slice(1).toLowerCase();
          const periods: string[] = [];
          for (let p = 1; p <= 9; p++) periods.push((r[p] ?? "").trim());
          schedule[dk] = periods;
          daysFound++;
        } else if (isTeacherName(dc) || isTeacherName((r[1] ?? "").trim())) break;
        j++;
      }
      if (daysFound > 0) {
        seen.add(name.toLowerCase());
        teachers.push({ name, schedule });
        i = j;
        continue;
      }
    }
    i++;
  }
  return teachers;
}

function getTodayDay(): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[new Date().getDay()] ?? "Monday";
}

function isPeriodFree(teacher: Teacher, day: string, idx: number) {
  const v = (teacher.schedule[day]?.[idx] ?? "").trim();
  return v === "" || v.toLowerCase() === "free" || v === "—" || v === "-";
}

function getFreePeriodCounts(teacher: Teacher, day: string) {
  let before = 0, after = 0;
  for (let i = 0; i <= BREAK_AFTER_IDX; i++) if (isPeriodFree(teacher, day, i)) before++;
  for (let i = BREAK_AFTER_IDX + 1; i < PERIODS.length; i++) if (isPeriodFree(teacher, day, i)) after++;
  return { before, after };
}

interface Column {
  id: number;
  selectedTeacher: string;
  substituteTeacher: string[];
  classValues: string[];
}

function getAvailableSubstitutes(
  teachers: Teacher[],
  columns: Column[],
  currentColId: number,
  periodIdx: number,
  day: string,
) {
  const absent = new Set(columns.map((c) => c.selectedTeacher).filter(Boolean));
  const alreadySub = new Set(
    columns.filter((c) => c.id !== currentColId).map((c) => c.substituteTeacher[periodIdx]).filter(Boolean)
  );
  return teachers
    .filter((t) => !absent.has(t.name) && !alreadySub.has(t.name) && isPeriodFree(t, day, periodIdx))
    .map((t) => {
      const { before, after } = getFreePeriodCounts(t, day);
      return { ...t, freeBefore: before, freeAfter: after };
    });
}

// ── BUILD PRINT HTML ──────────────────────────────────────────────────────────
function buildPrintHTML(
  columns: Column[],
  date: string,
  selectedDay: string,
  schoolInfo: SchoolInfo
) {
  const totalCols = columns.length;
  const teacherW = Math.floor((100 - 9 - 6 - 5) / totalCols);

  const logoHTML = schoolInfo.logoUrl
    ? `<img src="${schoolInfo.logoUrl}" class="school-logo" alt="logo"/>`
    : `<div class="school-logo-placeholder">🏫</div>`;

  const headerHTML = `
    <div class="school-header">
      ${logoHTML}
      <div class="school-info">
        <div class="school-name-main">${schoolInfo.name1} <span>${schoolInfo.name2}</span></div>
        <div class="school-type">${schoolInfo.type}</div>
        <div class="school-address">${schoolInfo.address}</div>
        <div class="school-address">${schoolInfo.phone}</div>
      </div>
    </div>
    <div class="reg-title">Teacher's Adjustment Register (Session: 2026-27)</div>
    <div class="date-bar">
      <span>Date: <strong>${date}</strong></span>
      <span>Day: <strong>${selectedDay}</strong></span>
    </div>
  `;

  const theadHTML = `
    <tr>
      <th colspan="3" rowspan="2" style="width:20%;text-align:center;vertical-align:middle;font-size:11px;letter-spacing:1px;">Period / Time</th>
      <th colspan="${totalCols}" style="text-align:center;font-size:13px;letter-spacing:3px;font-weight:900;background:#1e293b;border-bottom:2px solid #475569!important;">TEACHERS ON LEAVE</th>
    </tr>
    <tr>
      ${columns.map((col) => `
        <th style="width:${teacherW}%;background:#1e3a5f;padding:5px 4px!important;">
          <div style="font-size:12px;font-weight:800;color:white;">${col.selectedTeacher || "— Not Selected —"}</div>
          <div style="font-size:8.5px;font-weight:400;color:#93c5fd;margin-top:1px;">${selectedDay}</div>
        </th>`).join("")}
    </tr>
  `;

  let tbodyHTML = "";
  PERIODS.forEach((period, pIdx) => {
    tbodyHTML += `<tr>
      <td rowspan="3" class="period-cell" style="width:5%;text-align:center;">
        <span class="p-label">${period.label}</span>
      </td>
      <td rowspan="3" class="period-cell" style="width:7%;text-align:center;">
        <span class="p-time">${period.time}</span>
      </td>
      <td class="row-class" style="width:6%;">📚 Class</td>
      ${columns.map((col) => {
        const cv = col.classValues[pIdx] ?? "";
        const isFree = col.selectedTeacher && (cv.trim() === "" || cv.trim().toLowerCase() === "free");
        return `<td style="width:${teacherW}%;text-align:center;">
          ${isFree ? `<span class="val-free">Free</span>` : `<span class="val-class">${cv || ""}</span>`}
        </td>`;
      }).join("")}
    </tr>`;

    tbodyHTML += `<tr>
      <td class="row-sub">👤 Teacher</td>
      ${columns.map((col) => {
        const cv = col.classValues[pIdx] ?? "";
        const isFree = col.selectedTeacher ? (cv.trim() === "" || cv.trim().toLowerCase() === "free") : true;
        const sub = col.substituteTeacher[pIdx] || "";
        return `<td style="text-align:center;">
          ${isFree ? `<span class="val-free"></span>` : `<span class="val-sub">${sub}</span>`}
        </td>`;
      }).join("")}
    </tr>`;

    tbodyHTML += `<tr>
      <td class="row-sign">✍️ Sign</td>
      ${columns.map(() => `<td><span class="sign-space"></span></td>`).join("")}
    </tr>`;

    if (pIdx === BREAK_AFTER_IDX) {
      tbodyHTML += `<tr class="break-row">
        <td colspan="${3 + totalCols}">━━━ MAJOR BREAK (12:05 – 12:25) ━━━</td>
      </tr>`;
    }
  });

  const tfootHTML = `
    <tr class="footer-row">
      <td colspan="${3 + totalCols}" style="padding:5px 8px!important;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span>PRINCIPAL</span>
          <span>TIME-TABLE ADJUSTMENT INCHARGE</span>
        </div>
      </td>
    </tr>
  `;

  return `
    ${headerHTML}
    <table>
      <thead>${theadHTML}</thead>
      <tbody>${tbodyHTML}</tbody>
      <tfoot>${tfootHTML}</tfoot>
    </table>
  `;
}

// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo>(() => loadSchoolInfo());
  const [showSchoolEdit, setShowSchoolEdit] = useState(false);
  const [showSheetEdit, setShowSheetEdit] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string>(loadSheetUrl);
  const [sheetUrlDraft, setSheetUrlDraft] = useState<string>(loadSheetUrl);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [selectedDay, setSelectedDay] = useState(getTodayDay);
  const [date, setDate] = useState(() =>
    new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })
  );
  const [columns, setColumns] = useState<Column[]>([
    { id: 1, selectedTeacher: "", substituteTeacher: Array(9).fill(""), classValues: Array(9).fill("") },
  ]);

  // ── Save schoolInfo ──────────────────────────────────────────────────────
  useEffect(() => { saveSchoolInfo(schoolInfo); }, [schoolInfo]);

  // ── Fetch sheet ──────────────────────────────────────────────────────────
  const fetchSheet = useCallback(async (url: string) => {
    setLoading(true);
    setError("");
    setLoaded(false);
    try {
      const sheetId = url.split("/d/")[1]?.split("/")[0];
      if (!sheetId) throw new Error("Bad URL");
      const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`);
      if (!res.ok) throw new Error("Fetch failed");
      const text = await res.text();
      const rows = parseCSV(text);
      const extracted = extractTeachers(rows);
      if (extracted.length === 0) {
        setError("Koi teacher data nahi mila. Sheet publicly shared hai?");
        setLoaded(false);
        return;
      }
      setTeachers(extracted);
      const today = getTodayDay();
      setSelectedDay(today);
      setColumns([{ id: 1, selectedTeacher: "", substituteTeacher: Array(9).fill(""), classValues: Array(9).fill("") }]);
      setLoaded(true);
    } catch {
      setError("Sheet load nahi hui. Publicly shared hai? (Anyone with link → Viewer)");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch on mount
  useEffect(() => { fetchSheet(sheetUrl); }, []);

  // ── Print area update ────────────────────────────────────────────────────
  useEffect(() => {
    const pa = document.getElementById("print-area");
    if (!pa || !loaded) return;
    pa.innerHTML = buildPrintHTML(columns, date, selectedDay, schoolInfo);
  }, [columns, date, selectedDay, loaded, schoolInfo]);

  // ── Logo upload ──────────────────────────────────────────────────────────
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setSchoolInfo((prev) => ({ ...prev, logoUrl: result }));
      localStorage.setItem(LS_LOGO_KEY, result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveLogo = () => {
    setSchoolInfo((prev) => ({ ...prev, logoUrl: "" }));
    localStorage.removeItem(LS_LOGO_KEY);
  };

  // ── Save & reload sheet URL ───────────────────────────────────────────────
  const handleSaveSheetUrl = () => {
    const trimmed = sheetUrlDraft.trim();
    if (!trimmed) return;
    setSheetUrl(trimmed);
    localStorage.setItem(LS_SHEET_URL_KEY, trimmed);
    setShowSheetEdit(false);
    fetchSheet(trimmed);
  };

  // ── Column / teacher handlers ─────────────────────────────────────────────
  const handleTeacherSelect = (colId: number, name: string) =>
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== colId) return col;
        const t = teachers.find((t) => t.name === name);
        const ds = t?.schedule[selectedDay] ?? t?.schedule[Object.keys(t?.schedule ?? {})[0]] ?? [];
        return {
          ...col,
          selectedTeacher: name,
          classValues: Array(9).fill("").map((_, i) => ds[i] ?? ""),
          substituteTeacher: Array(9).fill(""),
        };
      })
    );

  const handleGlobalDayChange = (day: string) => {
    setSelectedDay(day);
    setColumns((prev) =>
      prev.map((col) => {
        const t = teachers.find((t) => t.name === col.selectedTeacher);
        if (!t) return { ...col, substituteTeacher: Array(9).fill("") };
        const ds = t.schedule[day] ?? [];
        return {
          ...col,
          classValues: Array(9).fill("").map((_, i) => ds[i] ?? ""),
          substituteTeacher: Array(9).fill(""),
        };
      })
    );
  };

  const updateClassValue = (colId: number, pIdx: number, val: string) =>
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== colId) return col;
        const cv = [...col.classValues];
        cv[pIdx] = val;
        return { ...col, classValues: cv };
      })
    );

  const updateSubstitute = (colId: number, pIdx: number, val: string) =>
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== colId) return col;
        const st = [...col.substituteTeacher];
        st[pIdx] = val;
        return { ...col, substituteTeacher: st };
      })
    );

  const addColumn = () => {
    const nextId = Math.max(...columns.map((c) => c.id)) + 1;
    setColumns((prev) => [
      ...prev,
      { id: nextId, selectedTeacher: "", substituteTeacher: Array(9).fill(""), classValues: Array(9).fill("") },
    ]);
  };

  const removeColumn = (colId: number) => {
    if (columns.length === 1) return;
    setColumns((prev) => prev.filter((c) => c.id !== colId));
  };

  const handlePrint = () => {
    const pa = document.getElementById("print-area");
    if (pa) pa.innerHTML = buildPrintHTML(columns, date, selectedDay, schoolInfo);
    window.print();
  };

  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-100" style={{ fontSize: "15px" }}>

      {/* ── SCHOOL HEADER ── */}
      <div className="bg-white border-b-4 border-slate-800 shadow-md">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">

          {/* Logo + School Name */}
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div
                className="w-20 h-20 rounded-full border-4 border-slate-800 overflow-hidden flex items-center justify-center bg-slate-100 cursor-pointer hover:opacity-80 transition"
                onClick={() => logoInputRef.current?.click()}
                title="Click to change logo"
              >
                {schoolInfo.logoUrl ? (
                  <img src={schoolInfo.logoUrl} alt="logo" className="w-full h-full object-cover" />
                ) : (
                  <span style={{ fontSize: "32px" }}>🏫</span>
                )}
              </div>
              {schoolInfo.logoUrl && (
                <button
                  onClick={handleRemoveLogo}
                  title="Remove logo"
                  className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition shadow"
                  style={{ fontSize: "13px", lineHeight: "1" }}
                >✕</button>
              )}
            </div>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />

            <div>
              <div style={{ fontSize: "24px", fontWeight: 900, letterSpacing: "1px", lineHeight: 1.1 }}>
                <span className="text-slate-900">{schoolInfo.name1} </span>
                <span className="text-red-600">{schoolInfo.name2}</span>
              </div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#1d4ed8", letterSpacing: "3px" }}>
                {schoolInfo.type}
              </div>
              <div style={{ fontSize: "13px", color: "#64748b" }}>{schoolInfo.address}</div>
              <div style={{ fontSize: "13px", color: "#64748b" }}>{schoolInfo.phone}</div>
            </div>
          </div>

          {/* Right side */}
          <div className="text-right flex-shrink-0">
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#1e293b" }} className="uppercase tracking-wide">
              Teacher's Adjustment System
            </div>
            <div style={{ fontSize: "13px", color: "#64748b" }}>Academic Year 2026-27</div>
            <div className="flex gap-2 justify-end mt-2">
              {/* Edit Google Sheet button */}
              <button
                onClick={() => { setSheetUrlDraft(sheetUrl); setShowSheetEdit(!showSheetEdit); setShowSchoolEdit(false); }}
                className="bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-green-600 transition"
              >
                📊 Edit Google Sheet
              </button>
              <button
                onClick={() => { setShowSchoolEdit(!showSchoolEdit); setShowSheetEdit(false); }}
                className="bg-slate-800 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-slate-600 transition"
              >
                {showSchoolEdit ? "✅ Close Edit" : "✏️ Edit School Info"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Sheet URL Edit Panel ── */}
        {showSheetEdit && (
          <div className="max-w-screen-xl mx-auto px-6 pb-5">
            <div className="bg-green-50 border border-green-300 rounded-xl p-4">
              <h3 className="font-bold text-green-800 mb-3" style={{ fontSize: "15px" }}>
                📊 Google Sheet URL Edit
              </h3>
              <p className="text-green-700 text-xs mb-3">
                Sheet publicly shared honi chahiye — <strong>"Anyone with link → Viewer"</strong>
              </p>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  value={sheetUrlDraft}
                  onChange={(e) => setSheetUrlDraft(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 min-w-0 border-2 border-green-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  style={{ fontSize: "13px" }}
                />
                <button
                  onClick={handleSaveSheetUrl}
                  className="bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-green-600 transition whitespace-nowrap"
                >
                  💾 Save & Load
                </button>
                <button
                  onClick={() => setShowSheetEdit(false)}
                  className="bg-slate-400 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-500 transition"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-green-600 mt-2">
                Current: <span className="font-mono text-green-800 break-all">{sheetUrl}</span>
              </p>
            </div>
          </div>
        )}

        {/* ── School Info Edit Panel ── */}
        {showSchoolEdit && (
          <div className="max-w-screen-xl mx-auto px-6 pb-5">
            <div className="bg-slate-50 border border-slate-300 rounded-xl p-4">
              <h3 className="font-bold text-slate-700 mb-3" style={{ fontSize: "15px" }}>
                ✏️ School Information Edit
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {([
                  ["School Name Part 1", "name1"],
                  ["School Name Part 2 (Red)", "name2"],
                  ["School Type", "type"],
                  ["Address", "address"],
                  ["Phone", "phone"],
                ] as [string, keyof SchoolInfo][]).map(([label, key]) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
                    <input
                      value={schoolInfo[key] as string}
                      onChange={(e) => setSchoolInfo((p) => ({ ...p, [key]: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                    />
                  </div>
                ))}
                <div className="flex flex-col gap-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Logo</label>
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"
                  >
                    📷 {schoolInfo.logoUrl ? "Change Logo" : "Upload Logo"}
                  </button>
                  {schoolInfo.logoUrl && (
                    <button
                      onClick={handleRemoveLogo}
                      className="bg-red-500 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-red-600"
                    >
                      🗑️ Remove Logo
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3">
                💾 Sab changes automatically save hote hain — page refresh ke baad bhi rahenge
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="max-w-screen-xl mx-auto p-4 md:p-6">

        {/* Loading spinner */}
        {loading && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
            <div className="spinner mb-4"></div>
            <p className="text-slate-600 font-semibold" style={{ fontSize: "16px" }}>
              ⏳ Timetable data load ho raha hai…
            </p>
            <p className="text-slate-400 mt-1" style={{ fontSize: "13px" }}>
              Google Sheet se data fetch ho raha hai, please wait…
            </p>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <p className="text-red-700 font-bold mb-2" style={{ fontSize: "16px" }}>{error}</p>
            <p className="text-slate-500 mb-4" style={{ fontSize: "13px" }}>
              Sheet publicly shared honi chahiye — "Anyone with link → Viewer"
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <button
                onClick={() => fetchSheet(sheetUrl)}
                className="bg-slate-800 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-slate-600"
              >
                🔄 Retry
              </button>
              <button
                onClick={() => { setSheetUrlDraft(sheetUrl); setShowSheetEdit(true); }}
                className="bg-green-700 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-green-600"
              >
                📊 Edit Sheet URL
              </button>
            </div>
          </div>
        )}

        {/* Adjustment Table */}
        {!loading && loaded && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 style={{ fontSize: "17px" }} className="font-bold text-slate-900 uppercase tracking-wide">
                  Teacher's Adjustment Register
                </h2>
                <p style={{ fontSize: "13px" }} className="text-slate-500 mt-1">
                  ✅ <strong>{teachers.length} teachers</strong> loaded &nbsp;·&nbsp;
                  Date: <span className="font-semibold text-slate-700">{date}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={{ fontSize: "14px" }}
                  className="border border-slate-300 rounded-lg px-3 py-2 w-32"
                />
                <select
                  value={selectedDay}
                  onChange={(e) => handleGlobalDayChange(e.target.value)}
                  style={{ fontSize: "14px" }}
                  className="border border-slate-300 rounded-lg px-3 py-2 font-semibold text-slate-700"
                >
                  {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <button
                  onClick={addColumn}
                  style={{ fontSize: "14px" }}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700"
                >
                  + Add Column
                </button>
                <button
                  onClick={handlePrint}
                  style={{ fontSize: "14px" }}
                  className="bg-slate-800 text-white px-4 py-2 rounded-lg font-semibold hover:bg-slate-600"
                >
                  🖨️ Print
                </button>
              </div>
            </div>

            {/* Legend */}
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <span style={{ fontSize: "13px" }} className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full font-medium">
                💡 <strong>Name (before,after)</strong> = break se pehle aur baad free lectures
              </span>
              <span style={{ fontSize: "13px" }} className="bg-yellow-50 text-yellow-700 px-3 py-1.5 rounded-full font-medium border border-yellow-200">
                Break = 5th period ke baad
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ fontSize: "14px" }}>
                <thead>
                  {/* Row 1 */}
                  <tr className="bg-slate-900 text-white">
                    <th colSpan={3} rowSpan={2} className="border border-slate-700 px-3 py-3 text-center font-semibold uppercase align-middle">
                      Period / Time
                    </th>
                    <th
                      colSpan={columns.length}
                      className="border border-slate-700 px-3 py-2 text-center font-bold uppercase"
                      style={{ fontSize: "16px", letterSpacing: "3px" }}
                    >
                      TEACHERS ON LEAVE
                    </th>
                  </tr>

                  {/* Row 2 — teacher name headers */}
                  <tr className="bg-slate-800 text-white">
                    {columns.map((col) => (
                      <th key={col.id} className="border border-slate-700 px-3 py-2 min-w-[220px]">
                        <div className="flex items-center justify-between">
                          <div className="text-left">
                            <div style={{ fontSize: "14px" }} className="font-bold">
                              {col.selectedTeacher || "— Select Teacher —"}
                            </div>
                            {col.selectedTeacher && (
                              <div style={{ fontSize: "11px", color: "#93c5fd" }}>{selectedDay}</div>
                            )}
                          </div>
                          {columns.length > 1 && (
                            <button
                              onClick={() => removeColumn(col.id)}
                              className="text-red-300 hover:text-white ml-2 flex-shrink-0"
                              style={{ fontSize: "18px" }}
                            >✕</button>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>

                  {/* Absent Teacher selector row — only teacher dropdown, no day/pin */}
                  <tr className="bg-blue-50">
                    <td
                      colSpan={3}
                      className="border border-slate-300 px-3 py-2 font-bold text-slate-700 text-center"
                      style={{ fontSize: "14px" }}
                    >
                      Absent Teacher
                    </td>
                    {columns.map((col) => (
                      <td key={col.id} className="border border-slate-300 px-2 py-2">
                        <select
                          value={col.selectedTeacher}
                          onChange={(e) => handleTeacherSelect(col.id, e.target.value)}
                          style={{ fontSize: "14px" }}
                          className="w-full border-2 border-blue-400 rounded-lg px-2 py-2 bg-white text-blue-900 font-bold"
                        >
                          <option value="">-- Select Absent Teacher --</option>
                          {teachers.map((t) => (
                            <option key={t.name} value={t.name}>{t.name}</option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {PERIODS.map((period, pIdx) => (
                    <React.Fragment key={pIdx}>
                      {/* CLASS ROW */}
                      <tr>
                        <td
                          rowSpan={3}
                          className="border border-slate-300 text-center bg-slate-900 text-white font-bold px-1 py-2"
                          style={{ width: "50px" }}
                        >
                          <div style={{ fontSize: "15px" }} className="font-extrabold">{period.label}</div>
                        </td>
                        <td
                          rowSpan={3}
                          className="border border-slate-300 text-center bg-slate-800 text-slate-300 px-1 py-2"
                          style={{ width: "70px", fontSize: "11px" }}
                        >
                          {period.time}
                        </td>
                        <td
                          className="border border-slate-300 px-2 py-2 font-bold text-amber-800 uppercase bg-amber-50 whitespace-nowrap"
                          style={{ fontSize: "13px", width: "70px" }}
                        >
                          📚 Class
                        </td>
                        {columns.map((col) => {
                          const classVal = col.classValues[pIdx] ?? "";
                          const isFree = col.selectedTeacher && (classVal.trim() === "" || classVal.trim().toLowerCase() === "free");
                          return (
                            <td key={col.id} className="border border-slate-300 px-2 py-1">
                              {isFree ? (
                                <div
                                  className="w-full text-center font-bold px-2 py-2 rounded-md bg-slate-100 text-slate-400 border-2 border-dashed border-slate-300"
                                  style={{ fontSize: "14px" }}
                                >Free</div>
                              ) : (
                                <input
                                  type="text"
                                  value={classVal}
                                  onChange={(e) => updateClassValue(col.id, pIdx, e.target.value)}
                                  placeholder={col.selectedTeacher ? "" : "—"}
                                  style={{ fontSize: "15px" }}
                                  className={`w-full text-center font-extrabold px-2 py-2 rounded-md border-2 focus:outline-none ${classVal ? "bg-blue-50 border-blue-400 text-blue-900" : "bg-white border-slate-200 text-slate-300"}`}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>

                      {/* SUB ROW */}
                      <tr>
                        <td
                          className="border border-slate-300 px-2 py-2 font-bold text-green-800 uppercase bg-green-50 whitespace-nowrap"
                          style={{ fontSize: "13px" }}
                        >
                          👤 Sub.
                        </td>
                        {columns.map((col) => {
                          const classVal = col.classValues[pIdx] ?? "";
                          const isFree = col.selectedTeacher
                            ? classVal.trim() === "" || classVal.trim().toLowerCase() === "free"
                            : true;
                          const avail = getAvailableSubstitutes(teachers, columns, col.id, pIdx, selectedDay);
                          const cur = col.substituteTeacher[pIdx] || "";
                          const isValid = cur && avail.some((t) => t.name === cur);
                          return (
                            <td key={col.id} className="border border-slate-300 px-2 py-1">
                              {isFree || !col.selectedTeacher ? (
                                <div className="w-full text-center text-slate-300 italic py-2" style={{ fontSize: "13px" }}>
                                  — Free —
                                </div>
                              ) : (
                                <div>
                                  <select
                                    value={cur}
                                    onChange={(e) => updateSubstitute(col.id, pIdx, e.target.value)}
                                    style={{ fontSize: "13px" }}
                                    className={`w-full border rounded-md px-2 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-green-400 ${cur ? "border-green-400 bg-green-50 text-green-800 font-semibold" : "border-slate-300"}`}
                                  >
                                    <option value="">
                                      {avail.length === 0 ? "⚠️ No free teacher" : `-- Select Sub (${avail.length} free) --`}
                                    </option>
                                    {cur && !isValid && (
                                      <option value={cur} style={{ color: "orange" }}>⚠️ {cur} (now busy)</option>
                                    )}
                                    {avail.map((t) => (
                                      <option key={t.name} value={t.name}>
                                        {t.name} ({t.freeBefore},{t.freeAfter})
                                      </option>
                                    ))}
                                  </select>
                                  <div className="mt-1 flex justify-between px-1">
                                    {avail.length === 0 ? (
                                      <span style={{ fontSize: "12px" }} className="text-red-500 font-semibold">⚠️ Koi free nahi!</span>
                                    ) : (
                                      <span style={{ fontSize: "12px" }} className="text-green-600">{avail.length} available</span>
                                    )}
                                    <span style={{ fontSize: "11px" }} className="text-slate-400">(before,after)</span>
                                  </div>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>

                      {/* SIGN ROW */}
                      <tr>
                        <td
                          className="border border-slate-300 px-2 py-2 font-bold text-purple-800 uppercase bg-purple-50 whitespace-nowrap"
                          style={{ fontSize: "13px" }}
                        >
                          ✍️ Sign
                        </td>
                        {columns.map((col) => {
                          const cv = col.classValues[pIdx] ?? "";
                          const isFree = cv.trim() === "" || cv.trim().toLowerCase() === "free";
                          return (
                            <td
                              key={col.id}
                              className={`border border-slate-300 px-2 py-6 ${isFree ? "bg-slate-50" : ""}`}
                            />
                          );
                        })}
                      </tr>

                      {/* BREAK ROW */}
                      {pIdx === BREAK_AFTER_IDX && (
                        <tr>
                          <td
                            colSpan={3 + columns.length}
                            className="border border-yellow-400 text-center font-bold py-2"
                            style={{ background: "#fef9c3", color: "#854d0e", fontSize: "13px" }}
                          >
                            ━━━ MAJOR BREAK (12:05 – 12:25) ━━━
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>

                <tfoot>
                  <tr className="bg-slate-100">
                    <td
                      colSpan={3 + columns.length}
                      className="border border-slate-300 px-4 py-3 font-semibold text-slate-600"
                      style={{ fontSize: "14px" }}
                    >
                      <div className="flex justify-between">
                        <span>PRINCIPAL</span>
                        <span>TIME-TABLE ADJUSTMENT INCHARGE</span>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap gap-3" style={{ fontSize: "13px", color: "#64748b" }}>
              <span>✅ Sirf free teachers dikhenge</span>
              <span>📊 <strong>(3,2)</strong> = 3 free before break, 2 after</span>
              <span>🖨️ Print = school header + clean table</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
