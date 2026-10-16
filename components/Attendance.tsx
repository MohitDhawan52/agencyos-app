"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/components/supabase";

export default function Attendance({ profile }: { profile: any }) {
  const [clockedIn, setClockedIn] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [onShoot, setOnShoot] = useState(false);
  const [onWFH, setOnWFH] = useState(false);
  const [onLeave, setOnLeave] = useState(false);
  const [leaveInfo, setLeaveInfo] = useState<any>(null);
  const [todayRecord, setTodayRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showShootChecklist, setShowShootChecklist] = useState(false);
  const [showTimesheetReminder, setShowTimesheetReminder] = useState(false);
  const [checklist, setChecklist] = useState([
    { label: "Camera & battery fully charged", done: false },
    { label: "Memory cards formatted & ready", done: false },
    { label: "Client brief reviewed", done: false },
    { label: "Props & outfits confirmed", done: false },
    { label: "Location confirmed with client", done: false },
  ]);

  const todayStr = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!profile?.id) return;
    // Auto-close any past days where user forgot to clock out
    (async () => {
      const { data: open } = await supabase
        .from("attendance")
        .select("id, date")
        .eq("user_id", profile.id)
        .not("clock_in", "is", null)
        .is("clock_out", null)
        .lt("date", todayStr);
      if (open && open.length > 0) {
        await Promise.all(open.map((rec: any) =>
          supabase.from("attendance")
            .update({ clock_out: new Date(`${rec.date}T23:59:59`).toISOString() })
            .eq("id", rec.id)
        ));
      }
    })();
    fetchToday();
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    const ch = supabase.channel(`attendance-member-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance", filter: `user_id=eq.${profile.id}` }, () => fetchToday())
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests", filter: `member_id=eq.${profile.id}` }, () => fetchToday())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (todayRecord?.clock_in && !todayRecord?.clock_out) {
        const start = new Date(todayRecord.clock_in).getTime();
        const breakMins = todayRecord.total_break_minutes || 0;
        const workedMs = Date.now() - start - breakMins * 60000;
        setElapsed(Math.max(0, Math.floor(workedMs / 1000)));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [todayRecord]);

  const fetchToday = async () => {
    setLoading(true);
    const [{ data: attRows }, { data: leaveData }] = await Promise.all([
      // Fetch all rows for today — prefer the one with clock_in to avoid phantom-row trap
      supabase.from("attendance").select("*").eq("user_id", profile.id).eq("date", todayStr).order("created_at", { ascending: false }),
      supabase.from("leave_requests").select("*").eq("member_id", profile.id)
        .in("status", ["approved", "pending"]).lte("start_date", todayStr).gte("end_date", todayStr).maybeSingle(),
    ]);
    // Among any duplicate rows for today, pick the one with a real clock_in; otherwise first
    const data = (attRows || []).find((r: any) => r.clock_in) ?? attRows?.[0] ?? null;
    if (data) {
      setTodayRecord(data);
      if (data.on_leave && data.leave_type !== "half_day") { setOnLeave(true); }
      else {
        setClockedIn(!!data.clock_in && !data.clock_out);
        setOnBreak(!!data.break_start && !data.break_end);
        setOnShoot(!!data.on_shoot);
        setOnWFH(!!data.work_from_home);
      }
    } else {
      // Explicitly reset — prevents stale state showing the clock-in button when no record exists
      setTodayRecord(null);
      setClockedIn(false);
      setOnBreak(false);
      setOnShoot(false);
      setOnWFH(false);
    }
    if (leaveData && leaveData.leave_type !== "half_day") { setOnLeave(true); setLeaveInfo(leaveData); }
    else if (leaveData) { setLeaveInfo(leaveData); }
    else if (!data?.on_leave) { setOnLeave(false); setLeaveInfo(null); }
    setLoading(false);
  };

  const HALF_DAY_HOUR = 10;
  const HALF_DAY_MIN  = 50;

  const isLateClockIn = (date: Date) => {
    const h = date.getHours(), m = date.getMinutes();
    return h > HALF_DAY_HOUR || (h === HALF_DAY_HOUR && m >= HALF_DAY_MIN);
  };

  const handleClockIn = async () => {
    setSaving(true);
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const halfDay = isLateClockIn(nowDate);

    if (todayRecord?.id) {
      // Row already exists (on_leave, half_day, or any other state) — update in place
      const { data, error } = await supabase.from("attendance")
        .update({
          clock_in: now, on_leave: false,
          is_half_day: todayRecord.leave_type === "half_day" ? true : halfDay,
          ...(halfDay && todayRecord.leave_type !== "half_day" ? { leave_type: "late_entry" } : {}),
        })
        .eq("id", todayRecord.id)
        .select().single();
      if (error) { setSaving(false); alert("Clock-in failed. Please try again."); return; }
      if (data) { setTodayRecord(data); setClockedIn(true); }
    } else {
      const { data, error } = await supabase.from("attendance").insert({
        user_id: profile.id, date: todayStr, clock_in: now,
        total_break_minutes: 0, on_shoot: false, is_half_day: halfDay,
        ...(halfDay ? { leave_type: "late_entry" } : {}),
      }).select().single();
      if (error) { setSaving(false); alert("Clock-in failed. Please try again."); return; }
      if (data) { setTodayRecord(data); setClockedIn(true); }
    }
    setSaving(false);
  };

  const handleClockInAgain = async () => {
    if (!todayRecord) return;
    setSaving(true);
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const halfDay = isLateClockIn(nowDate);
    const { data } = await supabase.from("attendance")
      .update({ clock_in: now, clock_out: null, break_start: null, break_end: null, total_break_minutes: 0, on_shoot: false, work_from_home: false, is_half_day: halfDay, leave_type: halfDay ? "late_entry" : null })
      .eq("id", todayRecord.id)
      .select().single();
    if (data) { setTodayRecord(data); setClockedIn(true); setOnBreak(false); setOnShoot(false); setOnWFH(false); setElapsed(0); }
    setSaving(false);
  };

  const handleClockOut = async () => {
    if (!todayRecord) return;
    // Check if they have any timesheet entries for today before clocking out
    const { data: tsEntries } = await supabase.from("timesheets")
      .select("id").eq("user_id", profile.id).eq("date", todayStr).limit(1);
    if (!tsEntries || tsEntries.length === 0) {
      setShowTimesheetReminder(true);
      return;
    }
    await doClockOut();
  };

  const doClockOut = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    const { data } = await supabase.from("attendance")
      .update({ clock_out: now, on_shoot: false, shoot_start: null })
      .eq("id", todayRecord.id)
      .select().single();
    if (data) { setTodayRecord(data); setClockedIn(false); setOnShoot(false); }
    setSaving(false);
    setShowTimesheetReminder(false);
  };

  const handleBreakStart = async () => {
    if (!todayRecord) return;
    setSaving(true);
    const now = new Date().toISOString();
    const { data, error } = await supabase.from("attendance")
      .update({ break_start: now, break_end: null })
      .eq("id", todayRecord.id)
      .select().single();
    if (error) console.error("Break start error:", error);
    if (data) { setTodayRecord(data); setOnBreak(true); }
    else {
      // Fallback: force state on even if DB didn't return updated row
      setOnBreak(true);
      setTodayRecord((prev: any) => ({ ...prev, break_start: now, break_end: null }));
    }
    setSaving(false);
  };

  const handleBreakEnd = async () => {
    if (!todayRecord?.break_start) return;
    setSaving(true);
    const now = new Date();
    const breakStart = new Date(todayRecord.break_start);
    const breakMins = Math.round((now.getTime() - breakStart.getTime()) / 60000);
    const totalBreak = (todayRecord.total_break_minutes || 0) + breakMins;
    const { data, error } = await supabase.from("attendance")
      .update({ break_end: now.toISOString(), total_break_minutes: totalBreak, break_start: null })
      .eq("id", todayRecord.id)
      .select().single();
    if (error) console.error("Break end error:", error);
    if (data) { setTodayRecord(data); setOnBreak(false); }
    else {
      setOnBreak(false);
      setTodayRecord((prev: any) => ({ ...prev, break_start: null, break_end: now.toISOString(), total_break_minutes: totalBreak }));
    }
    setSaving(false);
  };

  const openShootChecklist = () => {
    setChecklist(checklist.map(c => ({ ...c, done: false })));
    setShowShootChecklist(true);
  };

  const handleShootStart = async () => {
    if (!todayRecord) return;
    setSaving(true);
    setShowShootChecklist(false);
    const now = new Date().toISOString();
    const { data } = await supabase.from("attendance")
      .update({ on_shoot: true, shoot_start: now })
      .eq("id", todayRecord.id)
      .select().single();
    if (data) { setTodayRecord(data); setOnShoot(true); }
    setSaving(false);
  };

  const handleHalfDayLeave = async () => {
    const { data: existing } = await supabase.from("leave_requests")
      .select("id").eq("member_id", profile.id).eq("start_date", todayStr).eq("leave_type", "half_day")
      .maybeSingle();
    if (existing) return;
    setSaving(true);
    const { data: req } = await supabase.from("leave_requests").insert([{
      member_id: profile.id, member_name: profile.name,
      start_date: todayStr, end_date: todayStr,
      leave_type: "half_day", reason: "Half day leave request", status: "pending",
    }]).select().single();
    if (req) setLeaveInfo(req);
    setSaving(false);
    fetchToday();
  };

  const handleShootEnd = async () => {
    if (!todayRecord) return;
    setSaving(true);
    const { data } = await supabase.from("attendance")
      .update({ on_shoot: false, shoot_start: null })
      .eq("id", todayRecord.id)
      .select().single();
    if (data) { setTodayRecord(data); setOnShoot(false); }
    setSaving(false);
  };

  const handleToggleWFH = async () => {
    if (!todayRecord) return;
    setSaving(true);
    const newVal = !onWFH;
    const { data } = await supabase.from("attendance")
      .update({ work_from_home: newVal })
      .eq("id", todayRecord.id)
      .select().single();
    if (data) { setTodayRecord(data); setOnWFH(newVal); }
    setSaving(false);
  };

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  const fmtElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  };

  const fmtMins = (mins: number) => {
    if (!mins) return "0m";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  if (profile?.role === "admin") return (
    <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(109,93,252,0.12)", border: "1px solid rgba(109,93,252,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <i className="ti ti-shield-check" style={{ fontSize: 28, color: "var(--accent2)" }} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Attendance tracking not required</div>
      <div style={{ fontSize: 14, color: "var(--text3)" }}>Admin accounts don't clock in. Use HR Management to view team attendance.</div>
    </div>
  );

  if (loading) return (
    <div style={{ textAlign: "center", padding: 32, color: "var(--text3)" }}>
      <i className="ti ti-loader" style={{ fontSize: 28, opacity: .4 }} />
      <div style={{ marginTop: 10, fontSize: 14 }}>Loading attendance...</div>
    </div>
  );

  const isCheckedOut  = todayRecord?.clock_out;
  const isAbsentToday = todayRecord?.is_absent;
  const breakMins     = todayRecord?.total_break_minutes || 0;

  // Determine current mode label + color for timer display
  const modeLabel = onShoot ? "On Shoot" : onBreak ? "On Break" : onWFH ? "Work From Home" : clockedIn ? "In Office" : "";
  const modeColor = onShoot ? "#a78bfa" : onBreak ? "var(--amber)" : onWFH ? "#60a5fa" : "var(--accent2)";

  return (
    <div>
      {/* Absent Banner */}
      {isAbsentToday && (
        <div style={{ marginBottom: 20, padding: "16px 20px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 14, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(248,113,113,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-clock-off" style={{ fontSize: 22, color: "var(--red)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--red)", marginBottom: 3 }}>You have been marked absent today</div>
            <div style={{ fontSize: 13, color: "var(--text3)" }}>Contact your admin if this is incorrect.</div>
          </div>
          <span style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, fontWeight: 700, background: "rgba(248,113,113,0.15)", color: "var(--red)", border: "1px solid rgba(248,113,113,0.3)", flexShrink: 0 }}>Absent</span>
        </div>
      )}

      {/* Half Day Banner */}
      {todayRecord?.is_half_day && (
        <div style={{ marginBottom: 20, padding: "16px 20px", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 14, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(251,191,36,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-clock-half-2" style={{ fontSize: 22, color: "var(--amber)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--amber)", marginBottom: 3 }}>Half Day marked</div>
            <div style={{ fontSize: 13, color: "var(--text3)" }}>You clocked in after 10:50 AM — salary will be counted at half day rate.</div>
          </div>
          <span style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, fontWeight: 700, background: "rgba(251,191,36,0.15)", color: "var(--amber)", border: "1px solid rgba(251,191,36,0.3)", flexShrink: 0 }}>Half Day</span>
        </div>
      )}

      {/* Half Day Leave Banner (pending or approved, shown separately from full leave) */}
      {leaveInfo?.leave_type === "half_day" && !onLeave && (
        <div style={{ marginBottom: 20, padding: "16px 20px", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 14, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(167,139,250,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-clock-half-2" style={{ fontSize: 22, color: "#a78bfa" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#a78bfa", marginBottom: 3 }}>
              {leaveInfo.status === "pending" ? "Half Day Leave request pending" : "Half Day Leave approved"}
            </div>
            <div style={{ fontSize: 13, color: "var(--text3)" }}>
              {leaveInfo.status === "pending" ? "Waiting for admin approval — you can still clock in." : "Half day deducted from paid leaves."}
            </div>
          </div>
          <span style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, fontWeight: 700, background: leaveInfo.status === "pending" ? "rgba(251,191,36,0.15)" : "rgba(167,139,250,0.15)", color: leaveInfo.status === "pending" ? "var(--amber)" : "#a78bfa", border: `1px solid ${leaveInfo.status === "pending" ? "rgba(251,191,36,0.3)" : "rgba(167,139,250,0.3)"}`, flexShrink: 0 }}>
            {leaveInfo.status === "pending" ? "Pending" : "Approved"}
          </span>
        </div>
      )}

      {/* On Leave Banner */}
      {onLeave && (
        <div style={{ marginBottom: 20, padding: "16px 20px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 14, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(74,222,128,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-beach" style={{ fontSize: 22, color: "#4ade80" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#4ade80", marginBottom: 3 }}>
              {leaveInfo?.status === "pending" ? "Your leave request is pending approval" : "You are on approved leave today"}
            </div>
            {leaveInfo && (
              <div style={{ fontSize: 13, color: "var(--text2)" }}>
                {leaveInfo.leave_type === "half_day" ? "Half Day" : leaveInfo.leave_type?.charAt(0).toUpperCase() + leaveInfo.leave_type?.slice(1)} leave ·{" "}
                {new Date(leaveInfo.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                {leaveInfo.start_date !== leaveInfo.end_date && ` – ${new Date(leaveInfo.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
              </div>
            )}
          </div>
          <span style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, fontWeight: 700, background: leaveInfo?.status === "pending" ? "rgba(251,191,36,0.15)" : "rgba(74,222,128,0.15)", color: leaveInfo?.status === "pending" ? "var(--amber)" : "#4ade80", border: `1px solid ${leaveInfo?.status === "pending" ? "rgba(251,191,36,0.3)" : "rgba(74,222,128,0.3)"}`, flexShrink: 0 }}>
            {leaveInfo?.status === "pending" ? "Pending" : "On Leave"}
          </span>
        </div>
      )}

      {/* Live timer */}
      {clockedIn && !isCheckedOut && (
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, fontWeight: 800, color: modeColor, letterSpacing: "-2px", fontVariantNumeric: "tabular-nums" }}>
            {onBreak ? <i className="ti ti-coffee" style={{ fontSize: 40 }} /> : fmtElapsed(elapsed)}
          </div>
          <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {onShoot && <i className="ti ti-camera" style={{ color: "#a78bfa" }} />}
            {modeLabel}
          </div>
        </div>
      )}

      {/* Status info */}
      <div className="stat-grid-3" style={{ gap: 12, marginBottom: 24 }}>
        {[
          { label: "Clock In", val: todayRecord?.clock_in ? fmtTime(todayRecord.clock_in) : "—", color: "var(--green)" },
          { label: "Clock Out", val: todayRecord?.clock_out ? fmtTime(todayRecord.clock_out) : "—", color: "var(--red)" },
          { label: "Break", val: fmtMins(breakMins), color: "var(--amber)" },
        ].map((s, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* On Shoot banner */}
      {onShoot && (
        <div style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <i className="ti ti-camera" style={{ fontSize: 18, color: "#a78bfa" }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#a78bfa" }}>Currently on a shoot</div>
            {todayRecord?.shoot_start && (
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                Since {fmtTime(todayRecord.shoot_start)} · Hours counting as work time
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {isAbsentToday && (
          <div style={{ flex: 1, padding: "14px 0", borderRadius: 12, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)", color: "var(--red)", fontSize: 14, fontWeight: 600, textAlign: "center" }}>
            <i className="ti ti-clock-off" style={{ marginRight: 8 }} />Marked Absent
          </div>
        )}
        {(!todayRecord || (todayRecord?.leave_type === "half_day" && !todayRecord?.clock_in)) && !onLeave && !isAbsentToday && (
          <>
            <button onClick={handleClockIn} disabled={saving}
              style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none", background: "var(--green)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <i className="ti ti-clock-play" /> Clock In
            </button>
            {!leaveInfo && (
              <button onClick={handleHalfDayLeave} disabled={saving}
                style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid rgba(167,139,250,0.4)", background: "rgba(167,139,250,0.08)", color: "#a78bfa", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <i className="ti ti-clock-half-2" /> Half Day Leave
              </button>
            )}
          </>
        )}
        {!todayRecord && onLeave && (
          <div style={{ flex: 1, padding: "14px 0", borderRadius: 12, background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.2)", color: "#4ade80", fontSize: 14, fontWeight: 600, textAlign: "center" }}>
            <i className="ti ti-beach" style={{ marginRight: 8 }} />On Leave Today
          </div>
        )}

        {clockedIn && !isCheckedOut && !onBreak && !onShoot && (
          <>
            <button onClick={handleToggleWFH} disabled={saving}
              style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: `1px solid ${onWFH ? "rgba(96,165,250,0.6)" : "rgba(96,165,250,0.3)"}`, background: onWFH ? "rgba(96,165,250,0.2)" : "rgba(96,165,250,0.08)", color: "#60a5fa", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <i className={onWFH ? "ti ti-home-check" : "ti ti-home"} /> {onWFH ? "WFH ✓" : "Work from Home"}
            </button>
            <button onClick={handleBreakStart} disabled={saving}
              style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "1px solid var(--amber-border)", background: "var(--amber-bg)", color: "var(--amber)", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <i className="ti ti-coffee" /> Break
            </button>
            <button onClick={openShootChecklist} disabled={saving}
              style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "1px solid rgba(167,139,250,0.4)", background: "rgba(167,139,250,0.1)", color: "#a78bfa", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <i className="ti ti-camera" /> On Shoot
            </button>
            <button onClick={handleClockOut} disabled={saving}
              style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "none", background: "var(--red)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <i className="ti ti-clock-stop" /> Clock Out
            </button>
          </>
        )}

        {onBreak && (
          <button onClick={handleBreakEnd} disabled={saving}
            style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none", background: "var(--amber)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <i className="ti ti-player-play" /> End Break
          </button>
        )}

        {onShoot && (
          <>
            <button onClick={handleShootEnd} disabled={saving}
              style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid rgba(167,139,250,0.4)", background: "rgba(167,139,250,0.15)", color: "#a78bfa", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <i className="ti ti-building" /> Back in Office
            </button>
            <button onClick={handleClockOut} disabled={saving}
              style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none", background: "var(--red)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <i className="ti ti-clock-stop" /> Clock Out
            </button>
          </>
        )}

        {isCheckedOut && (
          <button onClick={handleClockInAgain} disabled={saving}
            style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid rgba(52,211,153,0.35)", background: "rgba(52,211,153,0.08)", color: "var(--green)", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <i className="ti ti-clock-play" /> Clock In Again
          </button>
        )}
      </div>

      {/* ── Shoot Checklist Modal ── */}
      {showShootChecklist && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
          onClick={() => setShowShootChecklist(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--sidebar-bg,#0d0d12)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 400 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(167,139,250,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className="ti ti-camera" style={{ fontSize: 18, color: "#a78bfa" }} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa" }}>Shoot Checklist</div>
            </div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 20 }}>Quick check before heading out</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
              {checklist.map((item, i) => (
                <div key={i} onClick={() => setChecklist(c => c.map((x, idx) => idx === i ? { ...x, done: !x.done } : x))}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 12, cursor: "pointer",
                    background: item.done ? "rgba(167,139,250,0.08)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${item.done ? "rgba(167,139,250,0.3)" : "var(--border)"}` }}>
                  <div style={{ width: 22, height: 22, borderRadius: 7, border: `2px solid ${item.done ? "#a78bfa" : "var(--border2)"}`, background: item.done ? "rgba(167,139,250,0.3)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s" }}>
                    {item.done && <i className="ti ti-check" style={{ fontSize: 12, color: "#a78bfa" }} />}
                  </div>
                  <span style={{ fontSize: 13, color: item.done ? "#a78bfa" : "var(--text2)", textDecoration: item.done ? "line-through" : "none" }}>{item.label}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "center", marginBottom: 16 }}>
              {checklist.filter(c => c.done).length} of {checklist.length} items checked
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowShootChecklist(false)}
                style={{ flex: 1, padding: 11, borderRadius: 10, background: "transparent", border: "1px solid var(--border)", color: "var(--text2)", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button onClick={handleShootStart} disabled={saving}
                style={{ flex: 2, padding: 11, borderRadius: 10, background: "rgba(167,139,250,0.2)", border: "1px solid rgba(167,139,250,0.4)", color: "#a78bfa", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                <i className="ti ti-camera" /> Go on Shoot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Timesheet Reminder Modal ── */}
      {showTimesheetReminder && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div style={{ background: "var(--sidebar-bg,#0d0d12)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--amber)", marginBottom: 8 }}>Fill your Timesheet!</div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 24, lineHeight: 1.6 }}>
              You haven't logged any work in the Timesheet today.<br />
              Log what you worked on before clocking out.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={doClockOut} style={{ flex: 1, padding: 11, borderRadius: 10, background: "transparent", border: "1px solid var(--border)", color: "var(--text3)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Clock Out Anyway
              </button>
              <button onClick={() => setShowTimesheetReminder(false)}
                style={{ flex: 2, padding: 11, borderRadius: 10, background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.4)", color: "var(--amber)", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Fill Timesheet First
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
