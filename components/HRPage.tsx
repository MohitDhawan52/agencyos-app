"use client";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { FINANCE_ACCOUNTS, accountIcon, orgPath, MEMBER_DOCS_BUCKET, signMemberDocs } from "@/lib/org";
import { showToast } from "./ToastNotification";

const TABS = ["Team", "Leave Requests", "Leave Balance", "Payouts", "Payroll", "Attendance", "Documents"];
const DEPT_OPTIONS = ["Content", "Strategy", "Design", "Video", "Meta Ads", "Operations", "Management", "Other"];
const PAYOUT_TYPES = ["Salary", "Bonus", "Advance", "Deduction"];
const FIN_ACCOUNTS = FINANCE_ACCOUNTS;

const IS: React.CSSProperties = { width: "100%", background: "#1a1a27", border: "1px solid var(--border2)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontFamily: "inherit", fontSize: 14, outline: "none" };
const LS: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--text3)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: ".6px" };

const leaveTypeColor: Record<string, string> = { paid: "#4ade80", half_day: "#a78bfa", sick: "#f87171", unpaid: "#94a3b8", medical: "#60a5fa" };
const statusStyle: Record<string, { color: string; bg: string }> = {
  pending:  { color: "#fbbf24", bg: "rgba(251,191,36,0.1)"  },
  approved: { color: "#4ade80", bg: "rgba(74,222,128,0.1)"  },
  rejected: { color: "#f87171", bg: "rgba(248,113,113,0.1)" },
};

function daysBetween(start: string, end: string) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1);
}

// Indian national holidays (MM-DD) — applies every year
const NATIONAL_HOLIDAYS = new Set(["01-26", "08-15", "10-02"]);
const isNationalHoliday = (ds: string) => NATIONAL_HOLIDAYS.has(ds.slice(5)); // 'YYYY-MM-DD' → 'MM-DD'

function getWorkingDays(year: number, month: number) {
  // Working day = any day that is NOT Sunday and NOT a national holiday (Saturdays count)
  let count = 0;
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    const day = d.getDay();
    const ds  = `${year}-${String(month + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (day !== 0 && !isNationalHoliday(ds)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function fmtINR(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export default function HRPage({ profile, isAdmin = true }: { profile?: any; isAdmin?: boolean }) {
  const [tab, setTab]             = useState(isAdmin ? "Team" : "Payroll");
  const [members, setMembers]     = useState<any[]>([]);
  const [hrMap, setHrMap]         = useState<Record<string, any>>({});
  const [leaveReqs, setLeaveReqs] = useState<any[]>([]);
  const [balances, setBalances]   = useState<any[]>([]);
  const [payouts, setPayouts]     = useState<any[]>([]);
  const [finSalaries, setFinSalaries] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  // Profile modal
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingMember, setEditingMember]       = useState<any>(null);
  const [profileForm, setProfileForm]           = useState<any>({});
  const [uploading, setUploading]               = useState(false);

  // Leave / reject
  const [rejectReq, setRejectReq]   = useState<any>(null);
  const [adminNotes, setAdminNotes] = useState("");

  // Leave edit modal
  const [showLeaveEdit, setShowLeaveEdit] = useState(false);
  const [editingLeave, setEditingLeave]   = useState<any>(null);
  const [leaveEditForm, setLeaveEditForm] = useState<any>({});

  // Balance modal
  const [showBalModal, setShowBalModal] = useState(false);
  const [editingBal, setEditingBal]     = useState<any>(null);
  const [balForm, setBalForm]           = useState<any>({});

  // Payout modal
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutForm, setPayoutForm]           = useState<any>({});

  // Admin: Add Leave for member
  const [showAdminLeaveModal, setShowAdminLeaveModal] = useState(false);
  const [adminLeaveTarget, setAdminLeaveTarget]       = useState<any>(null);
  const [adminLeaveForm, setAdminLeaveForm]           = useState({ leave_type: "medical", start_date: "", end_date: "", reason: "" });

  // Documents tab
  const [uploadingDoc, setUploadingDoc] = useState<Record<string, boolean>>({});
  const [docUrls, setDocUrls]           = useState<Record<string, string>>({}); // stored path → signed URL

  const kycDocs = [
    { field: "aadhar_front_url", label: "Aadhaar Front" },
    { field: "aadhar_back_url",  label: "Aadhaar Back"  },
    { field: "pan_card_url",     label: "PAN Card"      },
  ];

  const uploadDocFile = async (file: File, memberId: string, field: string, label: string) => {
    const key = `${memberId}-${field}`;
    setUploadingDoc(p => ({ ...p, [key]: true }));
    const ext = file.name.split(".").pop();
    const path = orgPath(`${memberId}/${field}.${ext}`);
    const { error } = await supabase.storage.from(MEMBER_DOCS_BUCKET).upload(path, file, { upsert: true });
    if (error) { showToast({ type: "task", title: "Upload failed", body: error.message, noClick: true }); setUploadingDoc(p => ({ ...p, [key]: false })); return; }
    await supabase.from("hr_profiles").upsert({ id: memberId, [field]: path }, { onConflict: "id" });
    setHrMap(p => ({ ...p, [memberId]: { ...p[memberId], [field]: path } }));
    showToast({ type: "task", title: `${label} uploaded`, body: "Document saved.", noClick: true });
    setUploadingDoc(p => ({ ...p, [key]: false }));
  };

  const approveKyc = async (memberId: string) => {
    await supabase.from("hr_profiles").upsert({ id: memberId, kyc_status: "approved", kyc_approved_at: new Date().toISOString() }, { onConflict: "id" });
    setHrMap(p => ({ ...p, [memberId]: { ...p[memberId], kyc_status: "approved" } }));
    showToast({ type: "task", title: "KYC Approved", body: "Member will see verified status.", noClick: true });
  };

  const rejectKyc = async (memberId: string) => {
    await supabase.from("hr_profiles").upsert({ id: memberId, kyc_status: "rejected" }, { onConflict: "id" });
    setHrMap(p => ({ ...p, [memberId]: { ...p[memberId], kyc_status: "rejected" } }));
    showToast({ type: "task", title: "KYC Rejected", body: "Member notified to re-upload.", noClick: true });
  };

  // Payroll
  const [payrollMonth, setPayrollMonth] = useState(() => {
    const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [payrollData, setPayrollData]   = useState<any[]>([]);
  const [calcLoading, setCalcLoading]   = useState(false);
  const [wdOverride, setWdOverride]     = useState<string>("");
  const [overrideModal, setOverrideModal] = useState<{ row: any } | null>(null);
  const [overrideForm, setOverrideForm]   = useState({ absentCredit: "", unpaidCredit: "", notes: "" });
  const [savingOverride, setSavingOverride] = useState(false);
  const [markPaidModal, setMarkPaidModal] = useState<{ row: any } | null>(null);
  const [markPaidSplits, setMarkPaidSplits] = useState<Array<{ account: string; amount: string }>>([]);

  const [saving, setSaving]             = useState(false);
  const [filterStatus, setFilterStatus] = useState("Pending");
  const [filterMember, setFilterMember] = useState("All");

  // Late-absence alerts (shown after 11:30 AM)
  const [lateAlerts, setLateAlerts]         = useState<any[]>([]);
  const [alertActioning, setAlertActioning] = useState<Record<string, boolean>>({});
  const [alertRefreshing, setAlertRefreshing] = useState(false);
  // Track "coming later" dismissals so Refresh doesn't bring them back in same session
  const dismissedTodayRef = useRef<Set<string>>(new Set());
  // Always-current members ref for use inside intervals / subscription callbacks
  const membersRef = useRef<any[]>([]);
  // Refs so realtime callbacks can trigger attendance tab refresh
  const attMemberRef = useRef("");
  const attMonthRef  = useRef(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);

  // Attendance tab
  const [attMember, setAttMember]   = useState("");
  const [attMonth, setAttMonth]     = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const [attRecords, setAttRecords] = useState<any[]>([]);
  const [attLoading, setAttLoading] = useState(false);

  // Manual attendance editing
  const [showManualAtt, setShowManualAtt]   = useState(false);
  const [manualAttDate, setManualAttDate]   = useState("");
  const [savingManualAtt, setSavingManualAtt] = useState(false);
  const [manualAttForm, setManualAttForm]   = useState<any>({ status: "present", clockIn: "", clockOut: "", leaveType: "paid", wfh: false, onShoot: false });

  // Overtime
  const [otRecords, setOtRecords]   = useState<any[]>([]);
  const [showOTModal, setShowOTModal] = useState(false);
  const [otStep, setOtStep]         = useState<1 | 2>(1);
  const [savingOT, setSavingOT]     = useState(false);
  const todayForOT = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })();
  const [otForm, setOtForm]         = useState<any>({ date: todayForOT, type: "", hours: "", ratePerHour: "", worksCount: "", pricePerWork: "", workDesc: "", notes: "" });

  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentMonthStr = `${year}-${String(currentMonth).padStart(2, "0")}`;
  const currentMonthLabel = new Date().toLocaleString("en-IN", { month: "long", year: "numeric" });

  useEffect(() => { fetchAll(); }, []);

  // Keep membersRef current so intervals/subscriptions always have latest data
  useEffect(() => { membersRef.current = members; }, [members]);
  useEffect(() => { attMemberRef.current = attMember; }, [attMember]);
  useEffect(() => { attMonthRef.current = attMonth; }, [attMonth]);

  useEffect(() => {
    let lastDateStr = new Date().toISOString().split("T")[0];

    const ch = supabase.channel("hr-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () => {
        fetchAll();
        if (attMemberRef.current) fetchAttRecords(attMemberRef.current, attMonthRef.current);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_balance" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "payouts" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => {
        fetchAll().then(() => {
          if (isAfter1130()) checkLateAbsences(membersRef.current, true);
        });
        if (attMemberRef.current) fetchAttRecords(attMemberRef.current, attMonthRef.current);
      })
      .subscribe();

    // Alert auto-check every 60s — removes members from banner once they clock in
    const alertInterval = setInterval(() => {
      if (isAfter1130() && membersRef.current.length > 0) {
        checkLateAbsences(membersRef.current, true);
      }
    }, 60_000);

    // Fallback full refresh every 2 min (covers realtime drops) + midnight detection
    const refreshInterval = setInterval(() => {
      const newDate = new Date().toISOString().split("T")[0];
      if (newDate !== lastDateStr) {
        // New day: reset alert state
        lastDateStr = newDate;
        dismissedTodayRef.current = new Set();
        setLateAlerts([]);
      }
      fetchAll();
    }, 2 * 60_000);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(alertInterval);
      clearInterval(refreshInterval);
    };
  }, []);

  // Run late-absence check once members are loaded (only after 11:30 AM)
  useEffect(() => {
    if (members.length > 0) checkLateAbsences(members);
  }, [members.length]);

  // Signed URLs expire, so re-sign KYC / joining-letter links each time the Documents tab opens.
  useEffect(() => {
    if (tab !== "Documents") return;
    const docFields = [...kycDocs.map(d => d.field), "joining_letter_url"];
    signMemberDocs(Object.values(hrMap).flatMap((h: any) => docFields.map(f => h?.[f]))).then(setDocUrls);
  }, [tab, hrMap]);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: mData }, { data: hData }, { data: lData }, { data: bData }, { data: pData }, { data: fData }] = await Promise.all([
      supabase.from("profiles").select("id,name,email,role,color,phone,position").neq("status", "left").order("created_at"),
      supabase.from("hr_profiles").select("*"),
      supabase.from("leave_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("leave_balance").select("*").eq("year", year),
      supabase.from("payouts").select("*").order("date", { ascending: false }),
      supabase.from("transactions").select("*").eq("category", "Salary").eq("type", "expense").order("date", { ascending: false }),
    ]);
    if (mData) setMembers(mData);
    if (hData) { const m: Record<string, any> = {}; hData.forEach((h: any) => { m[h.id] = h; }); setHrMap(m); }
    if (lData) setLeaveReqs(lData);
    if (bData) setBalances(bData);
    if (pData) setPayouts(pData);
    // Finance salary entries that were NOT created from HR (no linked_payout_id)
    if (fData) setFinSalaries(fData.filter((f: any) => !f.linked_payout_id && !f.hr_source));
    setLoading(false);
    // Non-admin members land directly on their payroll — trigger calc after data loads
    if (!isAdmin) setTimeout(() => calcPayroll(), 100);
  };

  const getBal = (memberId: string) =>
    balances.find(b => b.member_id === memberId) || { paid_total: 2, paid_used: 0, sick_total: 0, sick_used: 0 };

  // Compute paid leaves used THIS month only (no carry-over); half_day counts as 0.5
  const getMonthlyPaidUsed = (memberId: string) =>
    leaveReqs
      .filter(r => r.member_id === memberId && r.status === "approved" && (r.leave_type === "paid" || r.leave_type === "half_day") && r.start_date?.startsWith(currentMonthStr))
      .reduce((sum: number, r: any) => sum + (r.leave_type === "half_day" ? 0.5 : daysBetween(r.start_date, r.end_date)), 0);

  // ── Late-absence check ────────────────────────────────────────────────────
  const isAfter1130 = () => {
    const now = new Date();
    return now.getHours() > 11 || (now.getHours() === 11 && now.getMinutes() >= 30);
  };

  const checkLateAbsences = async (currentMembers: any[], forceRun = false) => {
    if (!isAdmin) return; // marks other members absent — admin-only (enforced by RLS too)
    if (!forceRun && !isAfter1130()) return;
    const todayStr = new Date().toISOString().split("T")[0];
    const activeMembers = currentMembers.filter((m: any) => m.role !== "admin");
    if (!activeMembers.length) return;

    // Per-member queries — use array (not maybeSingle) to handle duplicate rows gracefully
    const [memberAttResults, { data: todayLeaves }] = await Promise.all([
      Promise.all(activeMembers.map(async (m: any) => {
        const { data } = await supabase.from("attendance")
          .select("id, clock_in, on_leave, is_absent")
          .eq("user_id", m.id)
          .eq("date", todayStr);
        return { memberId: m.id, rows: data || [] };
      })),
      supabase.from("leave_requests")
        .select("member_id, leave_type, status")
        .lte("start_date", todayStr)
        .gte("end_date", todayStr)
        .in("status", ["approved", "pending"]),
    ]);

    // Build map: memberId → array of today's attendance rows
    const attRowsMap: Record<string, any[]> = {};
    memberAttResults.forEach(({ memberId, rows }) => { attRowsMap[memberId] = rows; });
    const leaveMap: Record<string, any> = {};
    (todayLeaves || []).forEach((l: any) => { leaveMap[l.member_id] = l; });

    const alerts: any[] = [];
    for (const m of activeMembers) {
      const rows = attRowsMap[m.id] || [];
      const leave = leaveMap[m.id];

      // If ANY row shows clocked in, absent, or on_leave → skip (handles duplicate rows bug)
      const hasClockedIn = rows.some((r: any) => r.clock_in);
      const hasAbsent    = rows.some((r: any) => r.is_absent);
      const hasOnLeave   = rows.some((r: any) => r.on_leave);
      if (hasClockedIn || hasAbsent || hasOnLeave) continue;

      // Approved leave → auto-sync attendance row and skip
      if (leave?.status === "approved") {
        const firstRow = rows[0];
        if (firstRow) {
          await supabase.from("attendance").update({ on_leave: true, leave_type: leave.leave_type }).eq("id", firstRow.id);
        } else {
          await supabase.from("attendance").upsert({ user_id: m.id, date: todayStr, on_leave: true, leave_type: leave.leave_type, total_break_minutes: 0, on_shoot: false }, { onConflict: "user_id,date", ignoreDuplicates: true });
        }
        continue;
      }

      // Dismissed as "coming later" in this session → skip
      if (dismissedTodayRef.current.has(m.id)) continue;
      alerts.push({ member: m, leaveReq: leave || null });
    }
    setLateAlerts(alerts);
  };

  const markAbsentToday = async (memberId: string) => {
    setAlertActioning(p => ({ ...p, [memberId]: true }));
    const todayStr = new Date().toISOString().split("T")[0];
    const { data: existing } = await supabase.from("attendance").select("id").eq("user_id", memberId).eq("date", todayStr).maybeSingle();
    if (existing) {
      await supabase.from("attendance").update({ is_absent: true, on_leave: false }).eq("id", existing.id);
    } else {
      await supabase.from("attendance").upsert({ user_id: memberId, date: todayStr, is_absent: true, on_leave: false, total_break_minutes: 0, on_shoot: false }, { onConflict: "user_id,date", ignoreDuplicates: true });
    }
    setLateAlerts(prev => prev.filter(a => a.member.id !== memberId));
    setAlertActioning(p => ({ ...p, [memberId]: false }));
  };

  const dismissLateAlert = (memberId: string) => {
    // Remember this member was dismissed as "coming later" so Refresh won't re-add them
    dismissedTodayRef.current.add(memberId);
    setLateAlerts(prev => prev.filter(a => a.member.id !== memberId));
  };

  // Full refresh: re-fetches members fresh from DB, bypasses time guard
  const refreshAlerts = async () => {
    setAlertRefreshing(true);
    const { data: freshMembers } = await supabase
      .from("profiles").select("id,name,email,role,color,phone,position")
      .neq("status", "left").order("created_at");
    if (freshMembers) {
      setMembers(freshMembers);
      await checkLateAbsences(freshMembers, true);
    }
    setAlertRefreshing(false);
  };

  // ── Avatar ────────────────────────────────────────────────────────────────
  const Avatar = ({ m, size = 56 }: { m: any; size?: number }) => {
    const hr = hrMap[m.id];
    return hr?.profile_pic_url
      ? <img src={hr.profile_pic_url} alt={m.name} style={{ width: size, height: size, borderRadius: size / 4, objectFit: "cover", flexShrink: 0, border: "2px solid rgba(255,255,255,0.1)" }} />
      : <div style={{ width: size, height: size, borderRadius: size / 4, background: m.color || "#5646e0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{m.name?.[0]?.toUpperCase()}</div>;
  };

  // ── Profile ───────────────────────────────────────────────────────────────
  const openEdit = (m: any) => {
    const hr = hrMap[m.id] || {};
    setEditingMember(m);
    setProfileForm({
      name: m.name || "",
      phone: m.phone || "",
      address: hr.address || "",
      profile_pic_url: hr.profile_pic_url || "",
      date_of_joining: hr.date_of_joining || "",
      department: hr.department || "",
      emergency_contact: hr.emergency_contact || "",
      emergency_phone: hr.emergency_phone || "",
      base_salary: hr.base_salary || "",
    });
    setShowProfileModal(true);
  };

  const saveProfile = async () => {
    if (!editingMember) return;
    setSaving(true);
    await supabase.from("profiles").update({ name: profileForm.name, phone: profileForm.phone }).eq("id", editingMember.id);
    await supabase.from("hr_profiles").upsert([{
      id: editingMember.id,
      address: profileForm.address,
      profile_pic_url: profileForm.profile_pic_url,
      date_of_joining: profileForm.date_of_joining || null,
      department: profileForm.department,
      emergency_contact: profileForm.emergency_contact,
      emergency_phone: profileForm.emergency_phone,
      base_salary: +profileForm.base_salary || 0,
      updated_at: new Date().toISOString(),
    }], { onConflict: "id" });
    setSaving(false); setShowProfileModal(false); fetchAll();
  };

  const uploadPic = async (file: File) => {
    if (!editingMember) return;
    setUploading(true);
    const ext  = file.name.split(".").pop();
    const path = orgPath(`profile-${editingMember.id}-${Date.now()}.${ext}`);
    const { data, error } = await supabase.storage.from("profile-pics").upload(path, file, { upsert: true });
    if (!error && data) {
      const { data: { publicUrl } } = supabase.storage.from("profile-pics").getPublicUrl(data.path);
      setProfileForm((f: any) => ({ ...f, profile_pic_url: publicUrl }));
    }
    setUploading(false);
  };

  // ── Leave Approval (with auto-attendance marking + balance deduct) ────────
  const approveLeave = async (req: any) => {
    const { error: approveErr } = await supabase.from("leave_requests").update({
      status: "approved", approved_by: "Admin", updated_at: new Date().toISOString(),
    }).eq("id", req.id);
    if (approveErr) { alert("Failed to approve leave. Please try again."); return; }

    // ── Half Day Leave: special handling ──────────────────────────────────
    if (req.leave_type === "half_day") {
      const bal = balances.find(b => b.member_id === req.member_id);
      const paidLeft = (bal?.paid_total || 2) - (bal?.paid_used || 0);
      const dateStr  = req.start_date;
      const { data: existing } = await supabase.from("attendance")
        .select("id").eq("user_id", req.member_id).eq("date", dateStr).maybeSingle();

      if (paidLeft >= 0.5) {
        // Deduct 0.5 from paid leave balance
        if (bal) {
          await supabase.from("leave_balance").update({ paid_used: (bal.paid_used || 0) + 0.5 }).eq("id", bal.id);
        } else {
          await supabase.from("leave_balance").insert([{ member_id: req.member_id, member_name: req.member_name, year, paid_total: 2, paid_used: 0.5, sick_total: 0, sick_used: 0 }]);
        }
        // on_leave: false so the member can still clock in for the afternoon (leave_type marks it as paid-covered)
        if (existing) {
          await supabase.from("attendance").update({ is_half_day: true, on_leave: false, leave_type: "half_day" }).eq("id", existing.id);
        } else {
          await supabase.from("attendance").insert([{ user_id: req.member_id, date: dateStr, is_half_day: true, on_leave: false, leave_type: "half_day", total_break_minutes: 0, on_shoot: false }]);
        }
      } else {
        // No paid leaves left — salary deduction applies via payroll (is_half_day flag)
        if (existing) {
          await supabase.from("attendance").update({ is_half_day: true, on_leave: false }).eq("id", existing.id);
        } else {
          await supabase.from("attendance").insert([{ user_id: req.member_id, date: dateStr, is_half_day: true, on_leave: false, total_break_minutes: 0, on_shoot: false }]);
        }
      }
      fetchAll();
      return;
    }

    // ── Regular Leave (paid / sick / unpaid / medical) ────────────────────
    const days = daysBetween(req.start_date, req.end_date);
    const bal  = balances.find(b => b.member_id === req.member_id);
    const field = req.leave_type === "sick" ? "sick_used" : req.leave_type === "paid" ? "paid_used" : null;
    if (field) {
      if (bal) {
        await supabase.from("leave_balance").update({ [field]: (bal[field] || 0) + days }).eq("id", bal.id);
      } else {
        await supabase.from("leave_balance").insert([{
          member_id: req.member_id, member_name: req.member_name, year,
          paid_total: 2, paid_used: req.leave_type === "paid" ? days : 0,
          sick_total: 0, sick_used: req.leave_type === "sick"  ? days : 0,
        }]);
      }
    }
    const endD = new Date(req.end_date);
    for (let d = new Date(req.start_date); d <= endD; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const { data: existing } = await supabase.from("attendance")
        .select("id").eq("user_id", req.member_id).eq("date", dateStr).maybeSingle();
      if (existing) {
        await supabase.from("attendance").update({ on_leave: true, leave_type: req.leave_type }).eq("id", existing.id);
      } else {
        await supabase.from("attendance").insert([{ user_id: req.member_id, date: dateStr, on_leave: true, leave_type: req.leave_type, total_break_minutes: 0, on_shoot: false }]);
      }
    }
    fetchAll();
  };

  const rejectLeave = async () => {
    if (!rejectReq) return;
    await supabase.from("leave_requests").update({
      status: "rejected",
      admin_notes: adminNotes,
      updated_at: new Date().toISOString(),
    }).eq("id", rejectReq.id);

    // Undo attendance on_leave marks for each date in the range
    const endD = new Date(rejectReq.end_date);
    for (let d = new Date(rejectReq.start_date); d <= endD; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const { data: existing } = await supabase.from("attendance").select("id, clock_in").eq("user_id", rejectReq.member_id).eq("date", dateStr).maybeSingle();
      if (existing && !existing.clock_in) {
        await supabase.from("attendance").delete().eq("id", existing.id);
      }
    }

    setRejectReq(null); setAdminNotes(""); fetchAll();
  };

  // ── Leave Edit ───────────────────────────────────────────────────────────
  const openLeaveEdit = (req: any) => {
    setEditingLeave(req);
    setLeaveEditForm({
      status:      req.status     || "pending",
      leave_type:  req.leave_type || "paid",
      start_date:  req.start_date || "",
      end_date:    req.end_date   || "",
      reason:      req.reason     || "",
      admin_notes: req.admin_notes || "",
    });
    setShowLeaveEdit(true);
  };

  const saveLeaveEdit = async () => {
    if (!editingLeave) return;
    setSaving(true);
    const oldStatus = editingLeave.status;
    const newStatus = leaveEditForm.status;

    // If was approved and now not → undo attendance on_leave for old date range
    if (oldStatus === "approved" && newStatus !== "approved") {
      const endD = new Date(editingLeave.end_date);
      for (let d = new Date(editingLeave.start_date); d <= endD; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        const { data: existing } = await supabase.from("attendance").select("id, clock_in").eq("user_id", editingLeave.member_id).eq("date", dateStr).maybeSingle();
        if (existing && !existing.clock_in) await supabase.from("attendance").delete().eq("id", existing.id);
        else if (existing) await supabase.from("attendance").update({ on_leave: false, leave_type: null }).eq("id", existing.id);
      }
    }

    // Update the leave request record
    await supabase.from("leave_requests").update({
      status:      newStatus,
      leave_type:  leaveEditForm.leave_type,
      start_date:  leaveEditForm.start_date,
      end_date:    leaveEditForm.end_date,
      reason:      leaveEditForm.reason,
      admin_notes: leaveEditForm.admin_notes,
      approved_by: newStatus === "approved" ? "Admin" : null,
      updated_at:  new Date().toISOString(),
    }).eq("id", editingLeave.id);

    // If now approved → mark attendance for the new date range
    if (newStatus === "approved") {
      const endD = new Date(leaveEditForm.end_date);
      for (let d = new Date(leaveEditForm.start_date); d <= endD; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        const { data: existing } = await supabase.from("attendance").select("id").eq("user_id", editingLeave.member_id).eq("date", dateStr).maybeSingle();
        if (existing) {
          await supabase.from("attendance").update({ on_leave: true, leave_type: leaveEditForm.leave_type }).eq("id", existing.id);
        } else {
          await supabase.from("attendance").insert([{ user_id: editingLeave.member_id, date: dateStr, on_leave: true, leave_type: leaveEditForm.leave_type, total_break_minutes: 0, on_shoot: false }]);
        }
      }
    }

    setSaving(false);
    setShowLeaveEdit(false);
    fetchAll();
  };

  // ── Leave Balance ─────────────────────────────────────────────────────────
  const openBal = (m: any) => {
    const b = getBal(m.id);
    setEditingBal(m);
    setBalForm({ paid_total: b.paid_total ?? 2, paid_used: b.paid_used ?? 0, sick_total: b.sick_total ?? 0, sick_used: b.sick_used ?? 0 });
    setShowBalModal(true);
  };

  const saveBal = async () => {
    if (!editingBal) return;
    setSaving(true);
    const existing = balances.find(b => b.member_id === editingBal.id);
    const payload  = { paid_total: +balForm.paid_total, paid_used: +balForm.paid_used, sick_total: +balForm.sick_total, sick_used: +balForm.sick_used };
    if (existing) await supabase.from("leave_balance").update(payload).eq("id", existing.id);
    else await supabase.from("leave_balance").insert([{ member_id: editingBal.id, member_name: editingBal.name, year, ...payload }]);
    setSaving(false); setShowBalModal(false); fetchAll();
  };

  // ── Payouts (with Finance sync) ───────────────────────────────────────────
  const openPayout = () => {
    const today = new Date().toISOString().split("T")[0];
    setPayoutForm({ member_name: members[0]?.name || "", amount: "", payout_type: "Salary", month: today.slice(0, 7), date: today, notes: "", account: "Current Account" });
    setShowPayoutModal(true);
  };

  const savePayout = async () => {
    if (!payoutForm.amount) return;
    setSaving(true);
    const member = members.find((m: any) => m.name === payoutForm.member_name);
    const { data: newPayout } = await supabase.from("payouts").insert([{
      member_id: member?.id,
      member_name: payoutForm.member_name,
      amount: +payoutForm.amount,
      payout_type: payoutForm.payout_type,
      month: payoutForm.month,
      date: payoutForm.date,
      notes: payoutForm.notes,
    }]).select().single();

    // Sync Salary / Bonus / Advance / Deduction → Finance transactions
    if (["Salary", "Bonus", "Advance", "Deduction"].includes(payoutForm.payout_type) && newPayout) {
      const txType   = payoutForm.payout_type === "Deduction" ? "income" : "expense";
      const category = payoutForm.payout_type === "Advance" ? "Advance" : "Salary";
      const account  = payoutForm.account || "Current Account";
      const { data: balRow } = await supabase.from("balances").select("amount").eq("account", account).maybeSingle();
      const curBal   = balRow?.amount || 0;
      const newBal   = txType === "expense" ? curBal - +payoutForm.amount : curBal + +payoutForm.amount;
      const { data: tx } = await supabase.from("transactions").insert([{
        type: txType, category,
        description: `${payoutForm.payout_type} — ${payoutForm.member_name}${payoutForm.payout_type === "Advance" ? ` (recover: ${payoutForm.month})` : ""}`,
        amount: +payoutForm.amount, account, client: "",
        date: payoutForm.date,
        linked_payout_id: newPayout.id,
        hr_source: true,
      }]).select().single();
      if (tx) {
        await supabase.from("payouts").update({ linked_tx_id: tx.id }).eq("id", newPayout.id);
        await supabase.from("balances").upsert([{ account, amount: newBal }], { onConflict: "account" });
      }
    }
    setSaving(false); setShowPayoutModal(false); fetchAll();
  };

  // ── Admin Add Leave ───────────────────────────────────────────────────────
  const openAdminLeave = (m: any) => {
    const today = new Date().toISOString().split("T")[0];
    setAdminLeaveTarget(m);
    setAdminLeaveForm({ leave_type: "medical", start_date: today, end_date: today, reason: "" });
    setShowAdminLeaveModal(true);
  };

  const saveAdminLeave = async () => {
    if (!adminLeaveTarget || !adminLeaveForm.start_date || !adminLeaveForm.end_date) return;
    setSaving(true);
    const { data: req } = await supabase.from("leave_requests").insert([{
      member_id: adminLeaveTarget.id, member_name: adminLeaveTarget.name,
      start_date: adminLeaveForm.start_date, end_date: adminLeaveForm.end_date,
      leave_type: adminLeaveForm.leave_type, reason: adminLeaveForm.reason || `Admin-logged ${adminLeaveForm.leave_type} leave`,
      status: "pending",
    }]).select().single();
    if (req) await approveLeave(req);
    setSaving(false);
    setShowAdminLeaveModal(false);
  };

  // ── Attendance tab ────────────────────────────────────────────────────────
  const [attLeaves, setAttLeaves] = useState<any[]>([]);

  const fetchAttRecords = async (memberId: string, month: string) => {
    if (!memberId || !month) return;
    setAttLoading(true);
    const [y, m] = month.split("-").map(Number);
    const start = `${month}-01`;
    // Use getDate() (local) to avoid UTC offset shifting the last day backwards
    const end   = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    const member = members.find(x => x.id === memberId);
    const [{ data: attData }, { data: leaveData }] = await Promise.all([
      supabase.from("attendance").select("*").eq("user_id", memberId).gte("date", start).lte("date", end).order("date").limit(5000),
      member
        ? supabase.from("leave_requests").select("*").eq("member_id", memberId).in("status", ["approved", "pending"]).lte("start_date", end).gte("end_date", start)
        : Promise.resolve({ data: [] }),
    ]);
    // De-duplicate by date. Quality: clocked-in (3) > has leave/absent/half-day flag (2) > phantom blank row (1)
    const rowQ = (r: any) => r.clock_in ? 3 : (r.on_leave || r.is_absent || r.is_half_day) ? 2 : 1;
    const attMap = new Map<string, any>();
    (attData || []).forEach((r: any) => {
      const ex = attMap.get(r.date);
      if (!ex || rowQ(r) > rowQ(ex)) attMap.set(r.date, r);
    });
    setAttRecords(Array.from(attMap.values()).sort((a: any, b: any) => a.date.localeCompare(b.date)));
    setAttLeaves(leaveData || []);
    const { data: otData } = await supabase.from("overtime").select("*").eq("user_id", memberId).gte("date", start).lte("date", end).order("date");
    setOtRecords(otData || []);
    setAttLoading(false);
  };

  const savePayrollOverride = async () => {
    if (!overrideModal) return;
    setSavingOverride(true);
    const { row } = overrideModal;
    const absentCredit = parseInt(overrideForm.absentCredit) || 0;
    const unpaidCredit = parseInt(overrideForm.unpaidCredit) || 0;
    const { error } = await supabase.from("payroll_overrides").upsert({
      user_id: row.id, month: row.monthStr,
      absent_day_credit: absentCredit, unpaid_day_credit: unpaidCredit,
      notes: overrideForm.notes || null,
    }, { onConflict: "user_id,month" });
    setSavingOverride(false);
    if (error) { showToast({ type: "task", title: "Failed to save override", body: error.message, noClick: true }); return; }
    showToast({ type: "task", title: "Override saved", body: `${absentCredit + unpaidCredit}d waived for ${row.name}`, noClick: true });
    setOverrideModal(null);
    calcPayroll();
  };

  const saveOvertime = async () => {
    if (!attMember || !otForm.date || !otForm.type) return;
    setSavingOT(true);
    const payload: any = { user_id: attMember, date: otForm.date, type: otForm.type, notes: otForm.notes || null };
    if (otForm.type === "hours") {
      payload.hours          = parseFloat(otForm.hours) || null;
      payload.rate_per_hour  = otForm.ratePerHour ? parseFloat(otForm.ratePerHour) : null;
      payload.total_amount   = (payload.hours || 0) * (payload.rate_per_hour || 0);
    } else if (otForm.type === "per_work") {
      payload.works_count    = parseInt(otForm.worksCount) || null;
      payload.price_per_work = otForm.pricePerWork ? parseFloat(otForm.pricePerWork) : null;
      payload.work_desc      = otForm.workDesc || null;
      payload.total_amount   = (payload.works_count || 0) * (payload.price_per_work || 0);
    }
    const { error } = await supabase.from("overtime").insert(payload);
    setSavingOT(false);
    if (error) { showToast({ type: "task", title: "Error saving OT", body: error.message, noClick: true }); return; }
    showToast({ type: "task", title: "Overtime logged", body: `${members.find(m => m.id === attMember)?.name} · ${otForm.date}`, noClick: true });
    setShowOTModal(false);
    setOtStep(1);
    setOtForm({ date: todayForOT, type: "", hours: "", ratePerHour: "", worksCount: "", pricePerWork: "", workDesc: "", notes: "" });
    fetchAttRecords(attMember, attMonth);
  };

  const revokeLateFlagg = async (recId: string) => {
    await supabase.from("attendance").update({ is_half_day: false, leave_type: null }).eq("id", recId);
    showToast({ type: "task", title: "Late half-day revoked", body: "Counts as full day in payroll", noClick: true });
    fetchAttRecords(attMember, attMonth);
  };

  const saveManualAtt = async () => {
    if (!attMember || !manualAttDate) {
      showToast({ type: "task", title: "Cannot save", body: `member=${attMember || "none"} date=${manualAttDate || "none"}`, noClick: true });
      return;
    }
    setSavingManualAtt(true);
    try {
      const f = manualAttForm;
      const toISO = (t: string) => t ? new Date(`${manualAttDate}T${t}:00`).toISOString() : null;
      let payload: any = { user_id: attMember, date: manualAttDate };
      if (f.status === "present") {
        payload = { ...payload, clock_in: toISO(f.clockIn), clock_out: toISO(f.clockOut), on_leave: false, is_half_day: false, leave_type: null, work_from_home: f.wfh, on_shoot: f.onShoot };
      } else if (f.status === "half_day") {
        payload = { ...payload, clock_in: toISO(f.clockIn), clock_out: toISO(f.clockOut), on_leave: false, is_half_day: true, leave_type: null, work_from_home: f.wfh, on_shoot: false };
      } else if (f.status === "leave") {
        payload = { ...payload, clock_in: null, clock_out: null, on_leave: true, is_half_day: false, leave_type: f.leaveType, work_from_home: false, on_shoot: false };
      } else if (f.status === "absent") {
        payload = { ...payload, clock_in: null, clock_out: null, on_leave: false, is_absent: true, is_half_day: false, leave_type: null, work_from_home: false, on_shoot: false };
      }
      const existing = attRecords.find(r => r.date === manualAttDate);
      // For UPDATE: strip user_id & date — updating identity columns can trip RLS WITH CHECK
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { user_id: _uid, date: _dt, ...updateFields } = payload;
      const { error } = existing
        ? await supabase.from("attendance").update(updateFields).eq("id", existing.id)
        : await supabase.from("attendance").insert(payload);
      if (error) {
        showToast({ type: "task", title: "Save failed", body: error.message, noClick: true });
        return;
      }
      setShowManualAtt(false);
      fetchAttRecords(attMember, attMonth);
      showToast({ type: "task", title: "Attendance saved", body: `${manualAttDate} updated`, noClick: true });
    } catch (e: any) {
      showToast({ type: "task", title: "Save failed", body: e?.message ?? "Unknown error", noClick: true });
    } finally {
      setSavingManualAtt(false);
    }
  };

  // ── Payroll ───────────────────────────────────────────────────────────────
  const calcPayroll = async () => {
    setCalcLoading(true);
    const { year: y, month: mo } = payrollMonth;
    const monthStr   = `${y}-${String(mo + 1).padStart(2, "0")}`;
    const monthStart = `${monthStr}-01`;
    const lastDay    = new Date(y, mo + 1, 0).getDate();
    const monthEnd   = `${monthStr}-${String(lastDay).padStart(2, "0")}`;
    const workingDays = +wdOverride > 0 ? +wdOverride : getWorkingDays(y, mo);

    const nonAdmins = members.filter(m => m.role !== "admin" && (isAdmin || m.id === profile?.id));
    const results   = await Promise.all(nonAdmins.map(async (m) => {
      const hr         = hrMap[m.id] || {};
      const baseSalary = hr.base_salary || 0;
      const [{ data: att }, { data: otRows }, { data: ovr }] = await Promise.all([
        supabase.from("attendance").select("date,clock_in,on_leave,leave_type,is_half_day,is_absent").eq("user_id", m.id).gte("date", monthStart).lte("date", monthEnd),
        supabase.from("overtime").select("type,hours,rate_per_hour,works_count,price_per_work,total_amount").eq("user_id", m.id).gte("date", monthStart).lte("date", monthEnd),
        supabase.from("payroll_overrides").select("absent_day_credit,unpaid_day_credit,notes").eq("user_id", m.id).eq("month", monthStr).maybeSingle(),
      ]);
      // De-duplicate by date, picking the best row (clocked-in > has flag > phantom blank)
      const attQ = (a: any) => a.clock_in ? 3 : (a.on_leave || a.is_absent || a.is_half_day) ? 2 : 1;
      const attMap2 = new Map<string, any>();
      (att || []).forEach((a: any) => {
        if (!a.date) return;
        const ex = attMap2.get(a.date);
        if (!ex || attQ(a) > attQ(ex)) attMap2.set(a.date, a);
      });
      const rows = Array.from(attMap2.values());
      const fullDayRows      = rows.filter((a: any) => a.clock_in && !a.on_leave && !a.is_half_day);
      const halfDayRows      = rows.filter((a: any) => a.is_half_day && a.leave_type !== "half_day"); // late clock-in (salary deduction)
      const halfDayLeaveRows = rows.filter((a: any) => a.is_half_day && a.leave_type === "half_day"); // approved leave (paid-covered, no deduction)
      const halfDayCount     = halfDayRows.length;
      const halfDayLeaveCount = halfDayLeaveRows.length;
      const presentDays      = fullDayRows.length; // only full clock-in days; half-days shown separately
      const fullPaidDays     = rows.filter((a: any) => a.on_leave && a.leave_type === "paid").length;
      const paidDays         = fullPaidDays + halfDayLeaveCount * 0.5; // display: includes half-day leaves
      const sickDays         = rows.filter((a: any) => a.on_leave && a.leave_type === "sick").length;
      const unpaidDays       = rows.filter((a: any) => a.on_leave && a.leave_type === "unpaid").length;
      // Working day = not Sunday, not national holiday (Saturdays count)
      const isWorkingDayPR = (ds: string) => { const dw = new Date(ds).getDay(); return dw !== 0 && !isNationalHoliday(ds); };
      // Absent = explicitly marked is_absent on a working day + working days with no record at all (past only)
      const markedAbsentDays = rows.filter((a: any) => a.is_absent && isWorkingDayPR(a.date)).length;
      const realRecordDates  = new Set(rows.filter((a: any) => a.clock_in || a.is_absent || a.on_leave || a.is_half_day).map((a: any) => a.date));
      const todayStrPR = new Date().toISOString().split("T")[0];
      let noRecordWorkingDays = 0;
      for (let d = 1; d <= lastDay; d++) {
        const ds = `${monthStr}-${String(d).padStart(2, "0")}`;
        if (!isWorkingDayPR(ds)) continue;
        if (ds > todayStrPR) continue;
        if (!realRecordDates.has(ds)) noRecordWorkingDays++;
      }
      const absentDayCredit  = ovr?.absent_day_credit  || 0;
      const unpaidDayCredit  = ovr?.unpaid_day_credit  || 0;
      const absentDays       = markedAbsentDays + noRecordWorkingDays;
      const absentDeduct     = Math.max(0, absentDays  - absentDayCredit);
      const unpaidDeduct     = Math.max(0, unpaidDays  - unpaidDayCredit);
      const overrideNote     = ovr?.notes || null;
      const dailyRate        = baseSalary > 0 ? baseSalary / 30 : 0; // fixed 30-day basis (standard Indian payroll)
      const deduction        = dailyRate * (absentDeduct + unpaidDeduct) + dailyRate * 0.5 * halfDayCount;
      // Overtime pay — sum all logged OT entries for this month
      const otEntries        = otRows || [];
      const otPay            = otEntries.reduce((s: number, o: any) => s + (+o.total_amount || 0), 0);
      const otFullDays       = otEntries.filter((o: any) => o.type === "full_day").length;
      const otHours          = otEntries.filter((o: any) => o.type === "hours").reduce((s: number, o: any) => s + (+o.hours || 0), 0);
      const otWorks          = otEntries.filter((o: any) => o.type === "per_work").reduce((s: number, o: any) => s + (+o.works_count || 0), 0);
      // Advances given with recovery month = this payroll month
      const advanceForMonth  = payouts
        .filter((p: any) => p.member_id === m.id && p.payout_type === "Advance" && p.month === monthStr)
        .reduce((s: number, p: any) => s + (+p.amount || 0), 0);
      const netPay           = Math.max(0, baseSalary - deduction - advanceForMonth + otPay);
      const alreadyPaid      = payouts.some(p => p.member_id === m.id && p.payout_type === "Salary" && p.month === monthStr);
      return { id: m.id, name: m.name, color: m.color, baseSalary, workingDays, presentDays, halfDayCount, halfDayLeaveCount, paidDays, sickDays, unpaidDays, absentDays, absentDeduct, unpaidDeduct, absentDayCredit, unpaidDayCredit, overrideNote, markedAbsentDays, noRecordWorkingDays, dailyRate, deduction, otPay, otFullDays, otHours, otWorks, advanceForMonth, netPay, alreadyPaid, monthStr };
    }));
    setPayrollData(results);
    setCalcLoading(false);
  };

  const markAsPaid = async (row: any, splits: Array<{ account: string; amount: string }>) => {
    setSaving(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const validSplits = splits.filter(s => parseFloat(s.amount) > 0);
      const payNote = `Auto: ${row.presentDays}d present${row.halfDayCount > 0 ? ` + ${row.halfDayCount} half-day${row.halfDayCount > 1 ? "s" : ""}` : ""}, ${row.paidDays}d paid leave, ${row.absentDays}d absent, ${fmtINR(row.deduction)} deducted${row.otPay > 0 ? `, ${fmtINR(row.otPay)} OT added` : ""}${row.advanceForMonth > 0 ? `, ${fmtINR(row.advanceForMonth)} advance recovered` : ""}`;
      const accountsLabel = validSplits.map(s => `${s.account} ${fmtINR(parseFloat(s.amount))}`).join(" + ");
      const { data: newPayout, error: payoutErr } = await supabase.from("payouts").insert([{
        member_id: row.id, member_name: row.name,
        amount: row.netPay, payout_type: "Salary", month: row.monthStr, date: today,
        notes: payNote,
      }]).select().single();
      if (payoutErr) throw new Error(payoutErr.message);
      if (newPayout) {
        const monthLabel = new Date(row.monthStr + "-01").toLocaleString("en-IN", { month: "long", year: "numeric" });
        const balChanges: Record<string, number> = {};
        for (const sp of validSplits) {
          const amt = parseFloat(sp.amount);
          await supabase.from("transactions").insert([{
            type: "expense", category: "Salary",
            description: `Salary — ${row.name} (${monthLabel})${validSplits.length > 1 ? ` · ${sp.account}` : ""}`,
            amount: amt, account: sp.account, client: "", date: today,
            linked_payout_id: newPayout.id, hr_source: true,
          }]);
          balChanges[sp.account] = (balChanges[sp.account] || 0) - amt;
        }
        const { data: balRows } = await supabase.from("balances").select("account,amount").in("account", Object.keys(balChanges));
        const currentBals: Record<string, number> = {};
        (balRows || []).forEach((b: any) => { currentBals[b.account] = b.amount; });
        const balUpdates = Object.entries(balChanges).map(([account, delta]) => ({ account, amount: (currentBals[account] || 0) + delta }));
        await supabase.from("balances").upsert(balUpdates, { onConflict: "account" });
      }
      setMarkPaidModal(null);
      showToast({ type: "task", title: "Salary Paid", body: `${row.name}: ${fmtINR(row.netPay)}`, noClick: true });
      fetchAll();
      calcPayroll();
    } catch (e: any) {
      showToast({ type: "task", title: "Payment failed", body: e?.message || "Please try again", noClick: true });
    } finally {
      setSaving(false);
    }
  };

  const prevMonth = () => setPayrollMonth(({ year: y, month: m }) => m === 0  ? { year: y - 1, month: 11 } : { year: y, month: m - 1 });
  const nextMonth = () => setPayrollMonth(({ year: y, month: m }) => m === 11 ? { year: y + 1, month: 0  } : { year: y, month: m + 1 });
  const monthLabel = new Date(payrollMonth.year, payrollMonth.month, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });

  const pendingCount = leaveReqs.filter(r => r.status === "pending").length;
  const nonAdmins    = members.filter(m => m.role !== "admin");
  const todayStr     = new Date().toISOString().split("T")[0];
  const onLeaveToday = leaveReqs.filter(r => r.status === "approved" && r.start_date <= todayStr && r.end_date >= todayStr).length;

  const filteredLeaves = leaveReqs.filter(r =>
    (filterStatus === "All" || r.status === filterStatus.toLowerCase()) &&
    (filterMember === "All" || r.member_name === filterMember)
  );

  // Merged payouts: HR + Finance-only salary entries (no linked_payout_id)
  const allPayouts = [
    ...payouts.map(p => ({ ...p, _src: "hr" })),
    ...finSalaries.map(f => ({
      id: f.id,
      member_name: f.description?.replace(/^(Salary|Bonus|Deduction)\s?[—\-]\s?/i, ""),
      amount: f.amount, payout_type: "Salary",
      month: f.date?.slice(0, 7), date: f.date, notes: f.description, _src: "finance",
    })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <>
    <div className="page-wrap">
      {/* Header */}
      <div style={{ fontSize: 30, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.6px", marginBottom: 4 }}>HR Management</div>
      <div style={{ fontSize: 15, color: "var(--text2)", marginBottom: 24 }}>{nonAdmins.length} team members · {year}</div>

      {/* Stats */}
      <div className="stat-grid-4">
        {[
          { label: "Team Members",     val: nonAdmins.length, color: "var(--accent2)", icon: "ti-users" },
          { label: "On Leave Today",   val: onLeaveToday,     color: "#fbbf24",        icon: "ti-beach" },
          { label: "Pending Requests", val: pendingCount,     color: "#f87171",        icon: "ti-clock" },
          { label: "Total Payouts",    val: fmtINR(payouts.filter(p => p.payout_type !== "Deduction").reduce((s: number, p: any) => s + (+p.amount || 0), 0)), color: "#4ade80", icon: "ti-report-money" },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 20px" }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: `${s.color}18`, border: `1px solid ${s.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className={`ti ${s.icon}`} style={{ color: s.color, fontSize: 18 }} />
            </div>
            <div>
              <div style={{ fontSize: typeof s.val === "string" ? 16 : 28, fontWeight: 700, color: s.color, letterSpacing: "-0.6px", lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>


      {/* Tabs — admins see all; members see only Payroll */}
      {isAdmin && (
        <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 12, padding: 4, marginBottom: 28, overflowX: "auto", WebkitOverflowScrolling: "touch" as any }}>
          {TABS.map(t => (
            <button key={t} onClick={() => { setTab(t); if (t === "Payroll") calcPayroll(); }} style={{ padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit", transition: "all .15s", position: "relative", background: tab === t ? "var(--accent)" : "transparent", color: tab === t ? "#fff" : "var(--text2)" }}>
              {t}
              {t === "Leave Requests" && pendingCount > 0 && <span style={{ position: "absolute", top: 3, right: 4, width: 16, height: 16, borderRadius: 8, background: "#f87171", fontSize: 10, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{pendingCount}</span>}
            </button>
          ))}
        </div>
      )}

      {/* ── TEAM ───────────────────────────────────────────────────────── */}
      {tab === "Team" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
          {members.map(m => {
            const bal = getBal(m.id); const hr = hrMap[m.id] || {};
            return (
              <div key={m.id} className="crm-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <Avatar m={m} size={64} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 4 }}>{m.position || hr.department || "—"}</div>
                    {hr.date_of_joining && <div style={{ fontSize: 11, color: "var(--text3)" }}><i className="ti ti-calendar" style={{ marginRight: 4 }} />Joined {new Date(hr.date_of_joining).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</div>}
                    {hr.base_salary > 0 && <div style={{ fontSize: 11, color: "#4ade80", marginTop: 3 }}><i className="ti ti-currency-rupee" style={{ marginRight: 4 }} />Base: {fmtINR(hr.base_salary)}/mo</div>}
                  </div>
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700, background: m.role === "admin" ? "rgba(199,30,36,0.15)" : "rgba(99,102,241,0.15)", color: m.role === "admin" ? "var(--accent2)" : "#a78bfa" }}>{m.role}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {m.phone    && <div style={{ fontSize: 13, color: "var(--text2)", display: "flex", gap: 8 }}><i className="ti ti-phone"   style={{ color: "var(--text3)", fontSize: 14 }} />{m.phone}</div>}
                  {m.email    && <div style={{ fontSize: 13, color: "var(--text2)", display: "flex", gap: 8 }}><i className="ti ti-mail"    style={{ color: "var(--text3)", fontSize: 14 }} />{m.email}</div>}
                  {hr.address && <div style={{ fontSize: 12, color: "var(--text3)", display: "flex", gap: 8 }}><i className="ti ti-map-pin" style={{ fontSize: 13 }} /><span style={{ wordBreak: "break-word" }}>{hr.address}</span></div>}
                </div>
                {m.role !== "admin" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    {[
                      { val: Math.max(0, (bal.paid_total || 2) - getMonthlyPaidUsed(m.id)), label: "Left This Mo.", color: "#4ade80" },
                      { val: getMonthlyPaidUsed(m.id),                                       label: "Used This Mo.", color: "#fbbf24" },
                      { val: bal.paid_total || 2,                                             label: "Monthly Alloc", color: "var(--text2)" },
                    ].map((s, i) => (
                      <div key={i} style={{ flex: 1, padding: "8px 0", borderRadius: 10, background: s.color === "var(--text2)" ? "rgba(255,255,255,0.03)" : `${s.color}10`, border: `1px solid ${s.color === "var(--text2)" ? "var(--border)" : s.color + "25"}`, textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
                        <div style={{ fontSize: 10, color: "var(--text3)", fontWeight: 600 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => openEdit(m)} style={{ flex: 1, padding: "9px 0", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", color: "var(--text2)", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                    <i className="ti ti-pencil" /> Edit Profile
                  </button>
                  {m.role !== "admin" && (
                    <button onClick={() => openAdminLeave(m)} style={{ padding: "9px 14px", borderRadius: 10, background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.3)", color: "#60a5fa", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
                      <i className="ti ti-beach" /> Add Leave
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── LEAVE REQUESTS ─────────────────────────────────────────────── */}
      {tab === "Leave Requests" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
            {["All", "Pending", "Approved", "Rejected"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: filterStatus === s ? "none" : "1px solid var(--border2)", cursor: "pointer", fontFamily: "inherit", background: filterStatus === s ? "var(--accent)" : "rgba(255,255,255,0.04)", color: filterStatus === s ? "#fff" : "var(--text2)" }}>
                {s}{s === "Pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
              </button>
            ))}
            <select value={filterMember} onChange={e => setFilterMember(e.target.value)} style={{ background: "#1a1a27", border: "1px solid var(--border2)", borderRadius: 10, padding: "8px 14px", color: "#fff", fontFamily: "inherit", fontSize: 13, outline: "none", cursor: "pointer", marginLeft: "auto" }}>
              <option value="All">All Members</option>
              {nonAdmins.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </div>
          {filteredLeaves.length === 0
            ? <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}><i className="ti ti-calendar-off" style={{ fontSize: 40, opacity: .2 }} /><div style={{ marginTop: 12 }}>No requests found</div></div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filteredLeaves.map(req => {
                  const days = daysBetween(req.start_date, req.end_date);
                  const st   = statusStyle[req.status] || statusStyle.pending;
                  const tc   = leaveTypeColor[req.leave_type] || "#94a3b8";
                  const mem  = members.find(m => m.name === req.member_name);
                  return (
                    <div key={req.id} className="crm-card" style={{ padding: 20, display: "flex", gap: 16, alignItems: "center" }}>
                      {mem && <Avatar m={mem} size={44} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 5 }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{req.member_name}</span>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 700, background: `${tc}18`, color: tc, border: `1px solid ${tc}30` }}>{req.leave_type === "half_day" ? "Paid Leave" : req.leave_type?.charAt(0).toUpperCase() + req.leave_type?.slice(1) + " Leave"} {req.leave_type === "half_day" && <span style={{ opacity: .75 }}>½ Day</span>}</span>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 700, background: st.bg, color: st.color, border: `1px solid ${st.color}30` }}>{req.status?.charAt(0).toUpperCase() + req.status?.slice(1)}</span>
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 3 }}>
                          <i className="ti ti-calendar" style={{ marginRight: 6 }} />
                          {new Date(req.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          {req.start_date !== req.end_date && ` – ${new Date(req.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                          <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text3)" }}>{req.leave_type === "half_day" ? "0.5 day" : `${days} day${days > 1 ? "s" : ""}`}</span>
                        </div>
                        {req.reason      && <div style={{ fontSize: 12, color: "var(--text3)", fontStyle: "italic" }}>"{req.reason}"</div>}
                        {req.admin_notes && <div style={{ fontSize: 12, color: "#f87171", marginTop: 3 }}>Admin: {req.admin_notes}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                        {req.status === "pending" && (
                          <>
                            <button onClick={() => approveLeave(req)} style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.4)", color: "#4ade80", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}><i className="ti ti-check" /> Approve</button>
                            <button onClick={() => { setRejectReq(req); setAdminNotes(""); }} style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}><i className="ti ti-x" /> Reject</button>
                          </>
                        )}
                        <button onClick={() => openLeaveEdit(req)} style={{ padding: "8px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", color: "var(--text2)", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}><i className="ti ti-pencil" /> Edit</button>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text3)", flexShrink: 0 }}>{new Date(req.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
                    </div>
                  );
                })}
              </div>
          }
        </div>
      )}

      {/* ── LEAVE BALANCE ──────────────────────────────────────────────── */}
      {tab === "Leave Balance" && (
        <div>
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 10, fontSize: 13, color: "var(--text2)" }}>
            <i className="ti ti-info-circle" style={{ marginRight: 6, color: "#a78bfa" }} />Default policy: <strong>2 Paid Leaves + 2 Medical Leaves per month</strong>. Unused leaves do not carry over to next month.
          </div>
          <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: "var(--text3)" }}>
            <i className="ti ti-calendar-month" style={{ marginRight: 6 }} />{currentMonthLabel}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {nonAdmins.map(m => {
              const bal       = getBal(m.id);
              const usedThisMo = getMonthlyPaidUsed(m.id);
              const pLeft     = Math.max(0, (bal.paid_total || 2) - usedThisMo);
              return (
                <div key={m.id} className="crm-card" style={{ padding: 20, display: "flex", gap: 16, alignItems: "center" }}>
                  <Avatar m={m} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>{m.name}</div>
                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, color: "var(--text2)" }}>Paid: <strong style={{ color: "#4ade80" }}>{Number(pLeft % 1 !== 0 ? pLeft.toFixed(1) : pLeft)}</strong> left / {bal.paid_total || 2} this month · <strong style={{ color: "#fbbf24" }}>{usedThisMo % 1 !== 0 ? usedThisMo.toFixed(1) : usedThisMo}</strong> used</span>
                      <span style={{ fontSize: 13, color: "var(--text2)" }}>Sick: <strong style={{ color: "#f87171" }}>{bal.sick_used || 0}</strong> used / {bal.sick_total || 0} total</span>
                    </div>
                  </div>
                  <button onClick={() => openBal(m)} style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", color: "var(--text2)", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}><i className="ti ti-adjustments" /> Adjust</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── PAYOUTS (HR + Finance merged) ──────────────────────────────── */}
      {tab === "Payouts" && (
        <div>
          <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
            <div style={{ padding: "10px 14px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 10, fontSize: 12, color: "var(--text2)" }}>
              <i className="ti ti-info-circle" style={{ marginRight: 5, color: "#a78bfa" }} />Salary payouts auto-appear in Finance. Finance salary entries (<span style={{ color: "#60a5fa" }}>Finance</span> badge) also appear here.
            </div>
            <button onClick={openPayout} className="btn-primary" style={{ padding: "10px 20px", fontSize: 14 }}><i className="ti ti-plus" /> Add Payout</button>
          </div>
          {/* ── Advances Overview ──────────────────────────────────────── */}
          {(() => {
            const advancePayouts = payouts.filter((p: any) => p.payout_type === "Advance");
            if (advancePayouts.length === 0) return null;
            // An advance is "recovered" if a Salary payout exists for same member + advance.month
            const salaryMonths = new Set(payouts.filter((p: any) => p.payout_type === "Salary").map((p: any) => `${p.member_id}__${p.month}`));
            const outstanding = advancePayouts.filter((p: any) => !salaryMonths.has(`${p.member_id}__${p.month}`));
            const recovered   = advancePayouts.filter((p: any) =>  salaryMonths.has(`${p.member_id}__${p.month}`));
            const totalOut    = outstanding.reduce((s: number, p: any) => s + (+p.amount || 0), 0);
            const totalRec    = recovered.reduce((s: number, p: any) => s + (+p.amount || 0), 0);
            return (
              <div style={{ marginBottom: 24, borderRadius: 16, border: "1px solid rgba(251,191,36,0.2)", background: "rgba(251,191,36,0.04)", padding: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <i className="ti ti-coins" style={{ color: "#fbbf24", fontSize: 18 }} />
                  <span style={{ fontWeight: 800, fontSize: 15, color: "var(--text)" }}>Advances Overview</span>
                  <span style={{ fontSize: 12, color: "var(--text3)", marginLeft: "auto" }}>{outstanding.length} outstanding · {recovered.length} recovered</span>
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: outstanding.length > 0 ? 14 : 0 }}>
                  <div style={{ padding: "10px 16px", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 2 }}>Outstanding</div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: "#fbbf24" }}>₹{totalOut.toLocaleString("en-IN")}</div>
                  </div>
                  <div style={{ padding: "10px 16px", background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 2 }}>Recovered</div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: "#4ade80" }}>₹{totalRec.toLocaleString("en-IN")}</div>
                  </div>
                </div>
                {outstanding.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, marginBottom: 2 }}>PENDING RECOVERY</div>
                    {outstanding.map((p: any) => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid var(--border2)", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, color: "var(--text)", flex: "1 1 100px" }}>{p.member_name}</span>
                        <span style={{ fontWeight: 800, color: "#fbbf24" }}>₹{(+p.amount).toLocaleString("en-IN")}</span>
                        <span style={{ fontSize: 12, color: "var(--text3)" }}>given {p.date}</span>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "rgba(251,191,36,0.12)", color: "#fbbf24", fontWeight: 600 }}>recovers {p.month}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {allPayouts.length === 0
            ? <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}><i className="ti ti-report-money" style={{ fontSize: 40, opacity: .2 }} /><div style={{ marginTop: 12 }}>No payouts recorded</div></div>
            : <div className="table-scroll"><div style={{ borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden", minWidth: 560 }}>
                <table className="crm-table">
                  <thead><tr><th>Member</th><th>Amount</th><th>Type</th><th>Month</th><th>Notes</th><th>Source</th><th></th></tr></thead>
                  <tbody>
                    {allPayouts.map(p => (
                      <tr key={`${p._src}-${p.id}`}>
                        <td style={{ fontWeight: 600 }}>{p.member_name || "—"}</td>
                        <td><span style={{ fontWeight: 700, fontSize: 15, color: p.payout_type === "Deduction" ? "#f87171" : "#4ade80" }}>{p.payout_type === "Deduction" ? "-" : "+"}₹{(+p.amount).toLocaleString("en-IN")}</span></td>
                        <td><span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, fontWeight: 600, background: p.payout_type === "Deduction" ? "rgba(248,113,113,0.1)" : "rgba(74,222,128,0.1)", color: p.payout_type === "Deduction" ? "#f87171" : "#4ade80" }}>{p.payout_type}</span></td>
                        <td style={{ color: "var(--text2)" }}>{p.month || "—"}</td>
                        <td style={{ color: "var(--text3)", fontSize: 12 }}>{p.notes || "—"}</td>
                        <td><span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: p._src === "finance" ? "rgba(96,165,250,0.12)" : "rgba(167,139,250,0.12)", color: p._src === "finance" ? "#60a5fa" : "#a78bfa", fontWeight: 700 }}>{p._src === "finance" ? "Finance" : "HR"}</span></td>
                        <td>{p._src === "hr" && <button onClick={async () => { await supabase.from("payouts").delete().eq("id", p.id); fetchAll(); }} style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 8, padding: "5px 10px", color: "#f87171", cursor: "pointer", fontSize: 13 }}><i className="ti ti-trash" /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div></div>
          }
        </div>
      )}

      {/* ── PAYROLL ────────────────────────────────────────────────────── */}
      {tab === "Payroll" && (
        <div>
          {/* Controls */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 12, padding: "8px 14px" }}>
              <button onClick={prevMonth} style={{ background: "transparent", border: "none", color: "var(--text2)", cursor: "pointer", fontSize: 18 }}><i className="ti ti-chevron-left" /></button>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", minWidth: 150, textAlign: "center" }}>{monthLabel}</span>
              <button onClick={nextMonth} style={{ background: "transparent", border: "none", color: "var(--text2)", cursor: "pointer", fontSize: 18 }}><i className="ti ti-chevron-right" /></button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ ...LS, margin: 0, whiteSpace: "nowrap" }}>Override Working Days</label>
              <input type="number" value={wdOverride} onChange={e => setWdOverride(e.target.value)} placeholder={String(getWorkingDays(payrollMonth.year, payrollMonth.month))} style={{ ...IS, width: 80, padding: "8px 12px", fontSize: 13 }} />
            </div>
            <button onClick={calcPayroll} className="btn-primary" style={{ padding: "10px 20px", fontSize: 14 }} disabled={calcLoading}>
              <i className="ti ti-refresh" /> {calcLoading ? "Calculating…" : "Calculate"}
            </button>
          </div>

          {calcLoading ? (
            <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}><i className="ti ti-loader" style={{ fontSize: 32, opacity: .4 }} /><div style={{ marginTop: 12 }}>Calculating payroll…</div></div>
          ) : payrollData.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}><i className="ti ti-calculator" style={{ fontSize: 40, opacity: .2 }} /><div style={{ marginTop: 12 }}>Click Calculate to generate payroll</div></div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                {payrollData.map(row => {
                  const leaveBal = balances.find((b: any) => b.member_id === row.id) || { paid_total: 2, sick_total: 0 };
                  const paidTotal = leaveBal.paid_total ?? 2;
                  const sickTotal = leaveBal.sick_total ?? 0;
                  const paidLeft  = Math.max(0, paidTotal - row.paidDays);
                  const sickLeft  = Math.max(0, sickTotal - row.sickDays);
                  const paidPct   = paidTotal > 0 ? Math.min(100, Math.round((row.paidDays / paidTotal) * 100)) : 0;
                  return (
                    <div key={row.id} style={{ background: "var(--bg)", border: `1px solid ${row.alreadyPaid ? "rgba(74,222,128,0.25)" : "var(--border)"}`, borderRadius: 16, padding: "18px 20px", transition: "border-color .2s" }}>
                      {/* Header row */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 38, height: 38, borderRadius: 10, background: row.color || "#5646e0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{row.name?.[0]}</div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{row.name}</div>
                            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 1 }}>Base {fmtINR(row.baseSalary)} · {row.workingDays} working days</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, marginBottom: 2 }}>NET PAY</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: "#4ade80", letterSpacing: "-0.5px" }}>{fmtINR(row.netPay)}</div>
                          </div>
                          {isAdmin && (row.alreadyPaid
                            ? <span style={{ fontSize: 12, padding: "7px 14px", borderRadius: 10, background: "rgba(74,222,128,0.12)", color: "#4ade80", fontWeight: 700, whiteSpace: "nowrap" }}><i className="ti ti-check" /> Paid</span>
                            : row.baseSalary > 0
                              ? <button onClick={() => { setSaving(false); setMarkPaidModal({ row }); setMarkPaidSplits([{ account: "Current Account", amount: "" }]); }} disabled={saving} style={{ padding: "8px 18px", borderRadius: 10, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap" }}>Mark Paid</button>
                              : <span style={{ fontSize: 12, color: "#f87171" }}>Set salary first</span>
                          )}
                        </div>
                      </div>

                      {/* 3-panel breakdown */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                        {/* Attendance */}
                        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border2)", borderRadius: 12, padding: "12px 14px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".6px" }}>Attendance</div>
                            <div style={{ fontSize: 10, color: "var(--text3)" }}>{row.workingDays} working days</div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 12, color: "var(--text2)" }}><i className="ti ti-check" style={{ color: "#4ade80", marginRight: 5 }} />Present</span>
                              <span style={{ fontWeight: 700, fontSize: 13, color: row.presentDays > 0 ? "var(--text)" : "var(--text3)" }}>{row.presentDays}d</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 12, color: "var(--text2)" }}><i className="ti ti-x" style={{ color: "#f87171", marginRight: 5 }} />Absent</span>
                              <div style={{ textAlign: "right" }}>
                                <span style={{ fontWeight: 700, fontSize: 13, color: row.absentDays > 0 ? "#f87171" : "var(--text3)" }}>{row.absentDays}d</span>
                                {row.absentDays > 0 && (
                                  <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 1 }}>
                                    {[row.markedAbsentDays > 0 && `${row.markedAbsentDays} marked`, row.noRecordWorkingDays > 0 && `${row.noRecordWorkingDays} no clock-in`].filter(Boolean).join(" + ")}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 12, color: "var(--text2)" }}><i className="ti ti-calendar-off" style={{ color: "#f87171", marginRight: 5 }} />Unpaid leave</span>
                              <span style={{ fontWeight: 700, fontSize: 13, color: row.unpaidDays > 0 ? "#f87171" : "var(--text3)" }}>{row.unpaidDays}d</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 12, color: "var(--text2)" }}><i className="ti ti-clock" style={{ color: "#fbbf24", marginRight: 5 }} />Late / Half-day</span>
                              <span style={{ fontWeight: 700, fontSize: 13, color: row.halfDayCount > 0 ? "#fbbf24" : "var(--text3)" }}>{row.halfDayCount}×</span>
                            </div>
                          </div>
                        </div>

                        {/* Leaves */}
                        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border2)", borderRadius: 12, padding: "12px 14px" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 10 }}>Leaves</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontSize: 12, color: "var(--text2)" }}>Paid Leave</span>
                                <span style={{ fontSize: 12, fontWeight: 700 }}>
                                  <span style={{ color: "#4ade80" }}>{row.paidDays}d</span>
                                  <span style={{ color: "var(--text3)" }}> / {paidTotal}d · </span>
                                  <span style={{ color: paidLeft === 0 ? "#f87171" : "var(--text2)" }}>{paidLeft}d left</span>
                                </span>
                              </div>
                              <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${paidPct}%`, background: paidPct >= 100 ? "#f87171" : "#4ade80", borderRadius: 4, transition: "width .4s" }} />
                              </div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 12, color: "var(--text2)" }}>Sick Leave</span>
                              <span style={{ fontSize: 12, fontWeight: 700 }}>
                                <span style={{ color: row.sickDays > 0 ? "#f87171" : "var(--text3)" }}>{row.sickDays}d</span>
                                {sickTotal > 0 && <span style={{ color: "var(--text3)" }}> / {sickTotal}d · {sickLeft}d left</span>}
                              </span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 12, color: "var(--text2)" }}>Unpaid Leave</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: row.unpaidDays > 0 ? "#f87171" : "var(--text3)" }}>{row.unpaidDays}d</span>
                            </div>
                          </div>
                        </div>

                        {/* Salary breakdown */}
                        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border2)", borderRadius: 12, padding: "12px 14px" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 10 }}>Salary</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 12, color: "var(--text2)" }}>Base salary</span>
                              <span style={{ fontSize: 12, fontWeight: 600 }}>{fmtINR(row.baseSalary)}</span>
                            </div>
                            {row.baseSalary > 0 && (
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 11, color: "var(--text3)" }}>Daily rate (÷30 basis)</span>
                                <span style={{ fontSize: 11, color: "var(--text3)" }}>{fmtINR(Math.round(row.dailyRate))}/day</span>
                              </div>
                            )}
                            {(row.absentDayCredit > 0 || row.unpaidDayCredit > 0) && (
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 11, color: "#4ade80" }}><i className="ti ti-shield-check" style={{ marginRight: 4 }} />{row.absentDayCredit + row.unpaidDayCredit}d waived by admin</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: "#4ade80" }}>+{fmtINR(row.dailyRate * (row.absentDayCredit + row.unpaidDayCredit))}</span>
                              </div>
                            )}
                            {(row.deduction > 0 || row.absentDays > 0 || row.unpaidDays > 0) && (
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: 12, color: "var(--text2)" }}>Deduction</span>
                                    {isAdmin && <button onClick={() => { setOverrideModal({ row }); setOverrideForm({ absentCredit: String(row.absentDayCredit || 0), unpaidCredit: String(row.unpaidDayCredit || 0), notes: row.overrideNote || "" }); }} style={{ fontSize: 10, padding: "1px 7px", borderRadius: 10, border: "1px solid var(--border2)", background: "transparent", color: "var(--text3)", cursor: "pointer" }}>Waive</button>}
                                  </div>
                                  {(row.absentDeduct > 0 || row.unpaidDeduct > 0) && (
                                    <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 1 }}>
                                      {[row.absentDeduct > 0 && `${row.absentDeduct}d absent`, row.unpaidDeduct > 0 && `${row.unpaidDeduct}d unpaid`].filter(Boolean).join(" + ")}
                                      {" × "}{fmtINR(Math.round(row.dailyRate))}/day
                                    </div>
                                  )}
                                  {row.halfDayCount > 0 && (
                                    <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 1 }}>
                                      {row.halfDayCount} half-day{row.halfDayCount > 1 ? "s" : ""} × {fmtINR(Math.round(row.dailyRate * 0.5))}/day
                                    </div>
                                  )}
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#f87171" }}>−{fmtINR(row.deduction)}</span>
                              </div>
                            )}
                            {row.otPay > 0 && (
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 12, color: "var(--text2)" }}>
                                  <i className="ti ti-bolt" style={{ color: "#fbbf24", marginRight: 4, fontSize: 11 }} />Overtime
                                  <span style={{ fontSize: 10, color: "var(--text3)", marginLeft: 4 }}>
                                    {[row.otFullDays > 0 && `${row.otFullDays}d`, row.otHours > 0 && `${row.otHours}h`, row.otWorks > 0 && `${row.otWorks} works`].filter(Boolean).join(" + ")}
                                  </span>
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#fbbf24" }}>+{fmtINR(row.otPay)}</span>
                              </div>
                            )}
                            {row.otFullDays > 0 && row.otPay === 0 && (
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 12, color: "var(--text2)" }}><i className="ti ti-bolt" style={{ color: "#fbbf24", marginRight: 4, fontSize: 11 }} />Overtime</span>
                                <span style={{ fontSize: 12, color: "#fbbf24" }}>{row.otFullDays} full day{row.otFullDays !== 1 ? "s" : ""}</span>
                              </div>
                            )}
                            {row.advanceForMonth > 0 && (
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 12, color: "var(--text2)" }}>Advance recovery</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#fbbf24" }}>−{fmtINR(row.advanceForMonth)}</span>
                              </div>
                            )}
                            <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 6, display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Net Pay</span>
                              <span style={{ fontSize: 14, fontWeight: 800, color: "#4ade80" }}>{fmtINR(row.netPay)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary bar */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {[
                  { label: "Total Base",      val: fmtINR(payrollData.reduce((s, r) => s + r.baseSalary,      0)), color: "var(--text2)" },
                  { label: "Total Deduction", val: fmtINR(payrollData.reduce((s, r) => s + r.deduction,      0)), color: "#f87171"    },
                  { label: "Total OT Pay",    val: fmtINR(payrollData.reduce((s, r) => s + (r.otPay || 0),  0)), color: "#fbbf24"    },
                  { label: "Advance Recovered", val: fmtINR(payrollData.reduce((s, r) => s + (r.advanceForMonth || 0), 0)), color: "#fbbf24" },
                  { label: "Total Net Pay",   val: fmtINR(payrollData.reduce((s, r) => s + r.netPay,         0)), color: "#4ade80"    },
                  { label: "Already Paid",    val: `${payrollData.filter(r => r.alreadyPaid).length} / ${payrollData.length}`,     color: "#a78bfa"    },
                ].map((s, i) => (
                  <div key={i} className="stat-card" style={{ flex: 1, minWidth: 160, padding: "16px 20px" }}>
                    <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Edit Profile Modal ────────────────────────────────────────── */}
      {showProfileModal && editingMember && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
          <div style={{ width: 580, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", background: "var(--bg)", border: "1px solid var(--border2)", borderRadius: 22, padding: 32 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)" }}>Edit Profile</div>
              <button onClick={() => setShowProfileModal(false)} style={{ background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 22 }}><i className="ti ti-x" /></button>
            </div>
            {/* Photo */}
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24, padding: "16px 20px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 14 }}>
              {profileForm.profile_pic_url
                ? <img src={profileForm.profile_pic_url} alt="" style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover", border: "2px solid rgba(255,255,255,0.1)" }} />
                : <div style={{ width: 72, height: 72, borderRadius: 16, background: editingMember.color || "#5646e0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: "#fff" }}>{editingMember.name?.[0]}</div>
              }
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>Profile Photo</div>
                <input type="file" accept="image/*" id="pic-upload" style={{ display: "none" }} onChange={e => e.target.files?.[0] && uploadPic(e.target.files[0])} />
                <label htmlFor="pic-upload" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid var(--border2)", color: "var(--text2)", cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  <i className="ti ti-upload" /> {uploading ? "Uploading…" : "Upload Photo"}
                </label>
                <input value={profileForm.profile_pic_url} onChange={e => setProfileForm({ ...profileForm, profile_pic_url: e.target.value })} placeholder="Or paste image URL…" style={{ ...IS, fontSize: 12 }} />
              </div>
            </div>
            <div className="modal-2col" style={{ gap: 16 }}>
              <div><label style={LS}>Full Name</label><input value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })} style={IS} /></div>
              <div><label style={LS}>Phone</label><input value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="+91 XXXXX XXXXX" style={IS} /></div>
              <div><label style={LS}>Department</label><select value={profileForm.department} onChange={e => setProfileForm({ ...profileForm, department: e.target.value })} style={{ ...IS, cursor: "pointer" }}><option value="">Select…</option>{DEPT_OPTIONS.map(d => <option key={d}>{d}</option>)}</select></div>
              <div><label style={LS}>Date of Joining</label><input type="date" value={profileForm.date_of_joining} onChange={e => setProfileForm({ ...profileForm, date_of_joining: e.target.value })} style={IS} /></div>
              <div>
                <label style={LS}>Base Salary (₹/month)</label>
                <input type="number" value={profileForm.base_salary} onChange={e => setProfileForm({ ...profileForm, base_salary: e.target.value })} placeholder="e.g. 35000" style={IS} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <div style={{ fontSize: 12, color: "var(--text3)", padding: "10px 14px", background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 10, width: "100%" }}>
                  <i className="ti ti-info-circle" style={{ marginRight: 5, color: "#4ade80" }} />Used in the Payroll tab to auto-calculate net pay based on attendance.
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}><label style={LS}>Address</label><textarea value={profileForm.address} onChange={e => setProfileForm({ ...profileForm, address: e.target.value })} rows={2} placeholder="Full address…" style={{ ...IS, resize: "vertical" }} /></div>
              <div><label style={LS}>Emergency Contact</label><input value={profileForm.emergency_contact} onChange={e => setProfileForm({ ...profileForm, emergency_contact: e.target.value })} placeholder="Contact name" style={IS} /></div>
              <div><label style={LS}>Emergency Phone</label><input value={profileForm.emergency_phone} onChange={e => setProfileForm({ ...profileForm, emergency_phone: e.target.value })} placeholder="+91 XXXXX XXXXX" style={IS} /></div>
            </div>
            <button onClick={saveProfile} disabled={saving} className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: 13, fontSize: 15, marginTop: 24, opacity: saving ? .7 : 1 }}>{saving ? "Saving…" : "Save Profile"}</button>
          </div>
        </div>
      )}

      {/* ── Reject Leave Modal ────────────────────────────────────────── */}
      {rejectReq && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
          <div style={{ width: 420, maxWidth: "95vw", background: "var(--bg)", border: "1px solid var(--border2)", borderRadius: 20, padding: 28 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", marginBottom: 12 }}>Reject Leave Request</div>
            <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 16 }}>
              Rejecting <strong>{rejectReq.member_name}</strong>'s {rejectReq.leave_type} leave for{" "}
              <strong>{new Date(rejectReq.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</strong>
              {rejectReq.start_date !== rejectReq.end_date && ` – ${new Date(rejectReq.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}.
            </div>
            <label style={LS}>Reason (optional)</label>
            <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={3} placeholder="Let the member know why…" style={{ ...IS, resize: "vertical", marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setRejectReq(null)} style={{ flex: 1, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", color: "var(--text2)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 14 }}>Cancel</button>
              <button onClick={rejectLeave} style={{ flex: 1, padding: 12, borderRadius: 10, background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.4)", color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14 }}>Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Leave Edit Modal ─────────────────────────────────────────── */}
      {showLeaveEdit && editingLeave && (
        <div onClick={() => setShowLeaveEdit(false)} style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: "95vw", background: "var(--bg)", border: "1px solid var(--border2)", borderRadius: 20, padding: 28 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>Edit Leave Request</div>
              <button onClick={() => setShowLeaveEdit(false)} style={{ background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 18 }}><i className="ti ti-x" /></button>
            </div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 18 }}>{editingLeave.member_name}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={LS}>Status</label>
                <select value={leaveEditForm.status} onChange={e => setLeaveEditForm((f: any) => ({ ...f, status: e.target.value }))} style={IS}>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label style={LS}>Leave Type</label>
                <select value={leaveEditForm.leave_type} onChange={e => setLeaveEditForm((f: any) => ({ ...f, leave_type: e.target.value }))} style={IS}>
                  <option value="paid">Paid</option>
                  <option value="half_day">Half Day</option>
                  <option value="sick">Sick</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="medical">Medical</option>
                </select>
              </div>
              <div>
                <label style={LS}>Start Date</label>
                <input type="date" value={leaveEditForm.start_date} onChange={e => setLeaveEditForm((f: any) => ({ ...f, start_date: e.target.value }))} style={IS} />
              </div>
              <div>
                <label style={LS}>End Date</label>
                <input type="date" value={leaveEditForm.end_date} onChange={e => setLeaveEditForm((f: any) => ({ ...f, end_date: e.target.value }))} style={IS} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Reason</label>
              <input value={leaveEditForm.reason} onChange={e => setLeaveEditForm((f: any) => ({ ...f, reason: e.target.value }))} placeholder="Reason for leave…" style={IS} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={LS}>Admin Notes</label>
              <textarea value={leaveEditForm.admin_notes} onChange={e => setLeaveEditForm((f: any) => ({ ...f, admin_notes: e.target.value }))} rows={2} placeholder="Internal note…" style={{ ...IS, resize: "vertical" }} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowLeaveEdit(false)} style={{ flex: 1, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", color: "var(--text2)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 14 }}>Cancel</button>
              <button onClick={saveLeaveEdit} disabled={saving} style={{ flex: 2, padding: 12, borderRadius: 10, background: "var(--accent)", border: "none", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Leave Balance Modal ───────────────────────────────────────── */}
      {showBalModal && editingBal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
          <div style={{ width: 380, maxWidth: "95vw", background: "var(--bg)", border: "1px solid var(--border2)", borderRadius: 20, padding: 28 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>Adjust Leave Balance</div>
              <button onClick={() => setShowBalModal(false)} style={{ background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 18 }}><i className="ti ti-x" /></button>
            </div>
            <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 18 }}>{editingBal.name} · {currentMonthLabel}</div>
            <div className="modal-2col" style={{ gap: 14 }}>
              <div><label style={LS}>Paid Total</label><input type="number" min="0" value={balForm.paid_total} onChange={e => setBalForm({ ...balForm, paid_total: e.target.value })} style={IS} /></div>
              <div><label style={LS}>Paid Used</label><input  type="number" min="0" value={balForm.paid_used}  onChange={e => setBalForm({ ...balForm, paid_used:  e.target.value })} style={IS} /></div>
              <div><label style={LS}>Sick Total</label><input type="number" min="0" value={balForm.sick_total} onChange={e => setBalForm({ ...balForm, sick_total: e.target.value })} style={IS} /></div>
              <div><label style={LS}>Sick Used</label><input  type="number" min="0" value={balForm.sick_used}  onChange={e => setBalForm({ ...balForm, sick_used:  e.target.value })} style={IS} /></div>
            </div>
            <button onClick={saveBal} disabled={saving} className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: 12, fontSize: 14, marginTop: 20, opacity: saving ? .7 : 1 }}>{saving ? "Saving…" : "Save Balance"}</button>
          </div>
        </div>
      )}

      {/* ── Admin Add Leave Modal ────────────────────────────────────── */}
      {showAdminLeaveModal && adminLeaveTarget && (
        <div onClick={() => setShowAdminLeaveModal(false)} style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: "95vw", background: "var(--bg)", border: "1px solid var(--border2)", borderRadius: 20, padding: 28 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>Add Leave</div>
              <button onClick={() => setShowAdminLeaveModal(false)} style={{ background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 18 }}><i className="ti ti-x" /></button>
            </div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 20 }}>For <strong style={{ color: "var(--text2)" }}>{adminLeaveTarget.name}</strong> — leave is approved immediately</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LS}>Leave Type</label>
                <select value={adminLeaveForm.leave_type} onChange={e => { const lt = e.target.value; setAdminLeaveForm(f => ({ ...f, leave_type: lt, end_date: lt === "half_day" ? f.start_date : f.end_date })); }} style={{ ...IS, cursor: "pointer" }}>
                  <option value="medical">Medical Leave</option>
                  <option value="paid">Paid Leave</option>
                  <option value="half_day">Half Day Leave</option>
                  <option value="sick">Sick Leave</option>
                  <option value="unpaid">Unpaid Leave</option>
                </select>
              </div>
              <div>
                <label style={LS}>Start Date</label>
                <input type="date" value={adminLeaveForm.start_date} onChange={e => setAdminLeaveForm(f => ({ ...f, start_date: e.target.value, end_date: f.end_date < e.target.value ? e.target.value : f.end_date }))} style={IS} />
              </div>
              <div>
                <label style={LS}>{adminLeaveForm.leave_type === "half_day" ? "Date (same as start)" : "End Date"}</label>
                <input type="date" value={adminLeaveForm.end_date} min={adminLeaveForm.start_date} onChange={e => setAdminLeaveForm(f => ({ ...f, end_date: e.target.value }))} disabled={adminLeaveForm.leave_type === "half_day"} style={{ ...IS, opacity: adminLeaveForm.leave_type === "half_day" ? 0.5 : 1 }} />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={LS}>Reason (optional)</label>
              <input value={adminLeaveForm.reason} onChange={e => setAdminLeaveForm(f => ({ ...f, reason: e.target.value }))} placeholder={`e.g. ${adminLeaveForm.leave_type === "medical" ? "Fever, doctor visit" : "Personal reason"}`} style={IS} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowAdminLeaveModal(false)} style={{ flex: 1, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", color: "var(--text2)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 14 }}>Cancel</button>
              <button onClick={saveAdminLeave} disabled={saving || !adminLeaveForm.start_date} style={{ flex: 2, padding: 12, borderRadius: 10, background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.4)", color: "#60a5fa", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14, opacity: (saving || !adminLeaveForm.start_date) ? 0.7 : 1 }}>
                {saving ? "Saving…" : "Approve & Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Payout Modal ──────────────────────────────────────────── */}
      {showPayoutModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
          <div style={{ width: 480, maxWidth: "95vw", background: "var(--bg)", border: "1px solid var(--border2)", borderRadius: 20, padding: 28, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
                {payoutForm.payout_type === "Advance" ? "Give Advance" : "Add Payout"}
              </div>
              <button onClick={() => setShowPayoutModal(false)} style={{ background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 18 }}><i className="ti ti-x" /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={LS}>Member</label><select value={payoutForm.member_name} onChange={e => setPayoutForm({ ...payoutForm, member_name: e.target.value })} style={{ ...IS, cursor: "pointer" }}>{members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}</select></div>
              <div className="modal-2col" style={{ gap: 14 }}>
                <div><label style={LS}>Amount (₹)</label><input type="number" value={payoutForm.amount} onChange={e => setPayoutForm({ ...payoutForm, amount: e.target.value })} placeholder="0" style={IS} /></div>
                <div><label style={LS}>Type</label><select value={payoutForm.payout_type} onChange={e => setPayoutForm({ ...payoutForm, payout_type: e.target.value })} style={{ ...IS, cursor: "pointer" }}>{PAYOUT_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                <div>
                  <label style={LS}>{payoutForm.payout_type === "Advance" ? "Recovery Month" : "Month"}</label>
                  <input type="month" value={payoutForm.month} onChange={e => setPayoutForm({ ...payoutForm, month: e.target.value })} style={IS} />
                </div>
                <div><label style={LS}>Date Given</label><input type="date" value={payoutForm.date} onChange={e => setPayoutForm({ ...payoutForm, date: e.target.value })} style={IS} /></div>
              </div>
              {["Salary", "Bonus", "Advance", "Deduction"].includes(payoutForm.payout_type) && (
                <div><label style={LS}>Paid From Account</label><select value={payoutForm.account} onChange={e => setPayoutForm({ ...payoutForm, account: e.target.value })} style={{ ...IS, cursor: "pointer" }}>{FIN_ACCOUNTS.map(a => <option key={a}>{a}</option>)}</select></div>
              )}
              <div><label style={LS}>Notes</label><input value={payoutForm.notes} onChange={e => setPayoutForm({ ...payoutForm, notes: e.target.value })} placeholder="Optional notes…" style={IS} /></div>

              {/* Context info box */}
              {payoutForm.payout_type === "Advance" && (
                <div style={{ padding: "10px 14px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, fontSize: 12, color: "var(--text2)" }}>
                  <i className="ti ti-coins" style={{ marginRight: 5, color: "#fbbf24" }} />
                  Advance will appear in Finance as an <strong>expense</strong> immediately. It will be <strong>auto-deducted from net salary</strong> in the selected Recovery Month payroll.
                </div>
              )}
              {["Salary", "Bonus", "Deduction"].includes(payoutForm.payout_type) && (
                <div style={{ padding: "10px 14px", background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 10, fontSize: 12, color: "var(--text2)" }}>
                  <i className="ti ti-link" style={{ marginRight: 5, color: "#60a5fa" }} />This will also appear as a <strong>{payoutForm.payout_type === "Deduction" ? "Income" : "Salary Expense"}</strong> in Finance automatically.
                </div>
              )}
            </div>
            <button onClick={savePayout} disabled={saving || !payoutForm.amount} className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: 12, fontSize: 14, marginTop: 20, opacity: (saving || !payoutForm.amount) ? .7 : 1 }}>
              {saving ? "Saving…" : payoutForm.payout_type === "Advance" ? "Give Advance" : "Add Payout"}
            </button>
          </div>
        </div>
      )}

      {/* ── DOCUMENTS ─────────────────────────────────────────────────── */}
      {tab === "Documents" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {members.filter(m => m.role !== "admin").map(m => {
              const hr = hrMap[m.id] || {};
              const kycStatus = hr.kyc_status || "pending";
              const anyUploaded = kycDocs.some(d => !!hr[d.field]);
              const allUploaded = kycDocs.every(d => !!hr[d.field]);
              const statusColor = kycStatus === "approved" ? "#4ade80" : kycStatus === "rejected" ? "#f87171" : anyUploaded ? "#fbbf24" : "var(--text3)";
              const statusLabel = kycStatus === "approved" ? "KYC Verified" : kycStatus === "rejected" ? "KYC Rejected" : allUploaded ? "All Docs Uploaded — Pending Review" : anyUploaded ? "Partially Uploaded — Pending Review" : "Awaiting Upload";
              return (
                <div key={m.id} className="crm-card" style={{ padding: 24 }}>
                  {/* Member header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
                    <Avatar m={m} size={44} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{m.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text3)" }}>{hr.department || m.position || "—"}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}30` }}>
                      {kycStatus === "approved" && <i className="ti ti-circle-check" style={{ marginRight: 5 }} />}
                      {statusLabel}
                    </span>
                    {anyUploaded && kycStatus !== "approved" && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => approveKyc(m.id)} style={{ padding: "7px 16px", borderRadius: 8, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.4)", color: "#4ade80", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                          <i className="ti ti-check" style={{ marginRight: 5 }} />Approve KYC
                        </button>
                        <button onClick={() => rejectKyc(m.id)} style={{ padding: "7px 16px", borderRadius: 8, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.4)", color: "#f87171", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                          <i className="ti ti-x" style={{ marginRight: 5 }} />Reject
                        </button>
                      </div>
                    )}
                    {kycStatus === "approved" && (
                      <button onClick={() => rejectKyc(m.id)} style={{ padding: "5px 12px", borderRadius: 8, background: "transparent", border: "1px solid var(--border2)", color: "var(--text3)", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                        Revoke
                      </button>
                    )}
                  </div>

                  {/* KYC docs grid */}
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 12 }}>KYC Documents</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
                    {kycDocs.map(({ field, label }) => {
                      const stored = hr[field];
                      const url = stored ? docUrls[stored] : undefined;
                      const busy = uploadingDoc[`${m.id}-${field}`];
                      return (
                        <div key={field} style={{ border: "1px solid var(--border2)", borderRadius: 10, overflow: "hidden", background: "var(--bg)" }}>
                          {url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              <img src={url} alt={label} style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} />
                            </a>
                          ) : (
                            <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(128,128,128,0.04)" }}>
                              <i className="ti ti-id" style={{ fontSize: 28, color: "var(--text3)", opacity: .3 }} />
                            </div>
                          )}
                          <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text2)" }}>{label}</div>
                              <div style={{ fontSize: 10, color: stored ? "#4ade80" : "var(--text3)" }}>{stored ? "Uploaded" : "Missing"}</div>
                            </div>
                            <label style={{ background: "rgba(128,128,128,0.1)", border: "1px solid var(--border2)", borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontSize: 11, color: "var(--text2)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                              {busy ? <i className="ti ti-loader-2" style={{ fontSize: 12 }} /> : <i className="ti ti-upload" style={{ fontSize: 12 }} />}
                              {stored ? "Replace" : "Upload"}
                              <input type="file" accept="image/*" onChange={async e => { const f = e.target.files?.[0]; if (f) await uploadDocFile(f, m.id, field, label); e.target.value = ""; }} style={{ display: "none" }} disabled={busy} />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Joining Letter */}
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 12 }}>Joining Letter</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <i className="ti ti-file-text" style={{ fontSize: 20, color: "#60a5fa" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      {hr.joining_letter_url ? (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#4ade80", marginBottom: 2 }}>Letter uploaded</div>
                          <a href={docUrls[hr.joining_letter_url]} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#60a5fa", textDecoration: "none" }}>
                            <i className="ti ti-external-link" style={{ marginRight: 4 }} />View / Download
                          </a>
                        </>
                      ) : (
                        <div style={{ fontSize: 13, color: "var(--text3)" }}>No joining letter uploaded yet</div>
                      )}
                    </div>
                    <label style={{ padding: "8px 16px", borderRadius: 9, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.35)", color: "#60a5fa", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
                      {uploadingDoc[`${m.id}-joining_letter_url`] ? <i className="ti ti-loader-2" style={{ fontSize: 14 }} /> : <i className="ti ti-upload" style={{ fontSize: 14 }} />}
                      {hr.joining_letter_url ? "Replace" : "Upload PDF"}
                      <input type="file" accept=".pdf,image/*" onChange={async e => { const f = e.target.files?.[0]; if (f) await uploadDocFile(f, m.id, "joining_letter_url", "Joining Letter"); e.target.value = ""; }} style={{ display: "none" }} disabled={!!uploadingDoc[`${m.id}-joining_letter_url`]} />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
      )}

      {/* ── ATTENDANCE ─────────────────────────────────────────────────────── */}
      {tab === "Attendance" && (
        <div>
          {/* Filters */}
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div style={LS}>Member</div>
              <select value={attMember} onChange={e => { setAttMember(e.target.value); const m = members.find(x => x.id === e.target.value); if (m) fetchAttRecords(m.id, attMonth); }} style={{ ...IS, width: 200, cursor: "pointer" }}>
                <option value="">— Select member —</option>
                {members.filter(m => m.role !== "admin").map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <div style={LS}>Month</div>
              <input type="month" value={attMonth} onChange={e => { setAttMonth(e.target.value); if (attMember) fetchAttRecords(attMember, e.target.value); }} style={{ ...IS, width: 160 }} />
            </div>
            {attMember && (() => {
              const lateHalfDays = attRecords.filter(r => r.is_half_day && r.leave_type !== "half_day").length;
              const [yAtt, mAtt] = attMonth.split("-").map(Number);
              const lastDayAtt = new Date(yAtt, mAtt, 0).getDate();
              const todayDsAtt = new Date().toISOString().split("T")[0];
              // Working day = not Sunday, not national holiday (Saturdays count — matches payroll)
              const isNonWorkingAtt = (ds: string) => { const dw = new Date(ds).getDay(); return dw === 0 || isNationalHoliday(ds); };
              // Salary-impact deduction days: absent/unpaid on working days only
              const deductDates = new Set<string>();
              attRecords.forEach((r: any) => {
                const ds = r.date;
                if (ds > todayDsAtt || isNonWorkingAtt(ds)) return;
                if (r.is_absent || (r.on_leave && r.leave_type === "unpaid")) deductDates.add(ds);
              });
              attLeaves.filter((l: any) => l.leave_type === "unpaid" && l.status === "approved").forEach((l: any) => {
                let d = new Date(l.start_date); const endD = new Date(l.end_date);
                while (d <= endD) {
                  const ds = d.toISOString().split("T")[0];
                  if (ds <= todayDsAtt && !isNonWorkingAtt(ds)) deductDates.add(ds);
                  d.setDate(d.getDate() + 1);
                }
              });
              // No-record working days (same formula as payroll)
              const realRecAtt = new Set(attRecords.filter((r: any) => r.clock_in || r.is_absent || r.on_leave || r.is_half_day).map((r: any) => r.date));
              let noRecAtt = 0;
              for (let d = 1; d <= lastDayAtt; d++) {
                const ds = `${yAtt}-${String(mAtt).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                if (ds > todayDsAtt || isNonWorkingAtt(ds)) continue;
                if (!realRecAtt.has(ds)) noRecAtt++;
              }
              const deductCount = deductDates.size + noRecAtt;
              return (
                <>
                  <div style={{ padding: "6px 14px", borderRadius: 10, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", fontSize: 12, color: "#f87171", fontWeight: 600 }}>
                    <i className="ti ti-clock-exclamation" style={{ marginRight: 5 }} />
                    {lateHalfDays} late half-day{lateHalfDays !== 1 ? "s" : ""} this month
                  </div>
                  <div style={{ padding: "6px 14px", borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", fontSize: 12, color: "#ef4444", fontWeight: 600 }}>
                    <i className="ti ti-currency-rupee" style={{ marginRight: 5 }} />
                    {deductCount} deduction day{deductCount !== 1 ? "s" : ""} · matches payroll
                  </div>
                </>
              );
            })()}
            {attMember && (
              <button
                onClick={() => { setOtStep(1); setOtForm({ date: todayForOT, type: "", hours: "", ratePerHour: "", worksCount: "", pricePerWork: "", workDesc: "", notes: "" }); setShowOTModal(true); }}
                style={{ padding: "6px 14px", borderRadius: 10, background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.4)", fontSize: 12, color: "#fbbf24", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
              >
                <i className="ti ti-bolt" />Log Overtime
              </button>
            )}
          </div>

          {!attMember && (
            <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
              <i className="ti ti-clock-check" style={{ fontSize: 40, opacity: .2 }} />
              <div style={{ marginTop: 12 }}>Select a member to view attendance</div>
            </div>
          )}

          {attMember && attLoading && (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text3)" }}>Loading…</div>
          )}

          {attMember && !attLoading && (() => {
            // Build merged day map: attendance records + approved leave requests
            const [y, mo] = attMonth.split("-").map(Number);
            const monthStart = new Date(y, mo - 1, 1);
            const monthEnd   = new Date(y, mo, 0);

            // Map date → attendance record
            const recMap: Record<string, any> = {};
            attRecords.forEach((r: any) => { recMap[r.date] = r; });

            // Map date → overtime record(s)
            const otMap: Record<string, any[]> = {};
            otRecords.forEach((o: any) => { if (!otMap[o.date]) otMap[o.date] = []; otMap[o.date].push(o); });

            // Map date → leave request (expand multi-day ranges)
            const leaveMap: Record<string, any> = {};
            attLeaves.forEach((l: any) => {
              let d = new Date(l.start_date);
              const endD = new Date(l.end_date);
              while (d <= endD) {
                const ds = d.toISOString().split("T")[0];
                leaveMap[ds] = l;
                d.setDate(d.getDate() + 1);
              }
            });

            // Show all calendar days up to today (incl. weekends, labeled "Weekend").
            // Use local date parts — toISOString() shifts to UTC (1 day behind IST at midnight),
            // misaligning dow vs date string.
            const todayLocal = new Date();
            const todayDs = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, "0")}-${String(todayLocal.getDate()).padStart(2, "0")}`;
            const allDays: { ds: string; dow: number }[] = [];
            let cur = new Date(monthStart);
            while (cur <= monthEnd) {
              const dow = cur.getDay();
              const ds  = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
              allDays.push({ ds, dow });
              cur.setDate(cur.getDate() + 1);
            }

            if (allDays.length === 0) return (
              <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
                <i className="ti ti-calendar-off" style={{ fontSize: 40, opacity: .2 }} />
                <div style={{ marginTop: 12 }}>No records for this month</div>
              </div>
            );

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {allDays.map(({ ds: dateStr, dow }) => {
                  const isWeekend = dow === 0; // only Sunday is non-working
                  const isHoliday = isNationalHoliday(dateStr);
                  const isNonWorking = isWeekend || isHoliday;
                  const rec    = recMap[dateStr];
                  const lReq   = leaveMap[dateStr];
                  const otList = otMap[dateStr] || [];

                  // Status derivation — match payroll logic exactly
                  const isLate          = rec && rec.is_half_day && rec.leave_type !== "half_day";
                  const isHalfLeave     = rec && rec.is_half_day && rec.leave_type === "half_day";
                  const isAbsent        = rec?.is_absent;
                  const isApprovedLeave = !rec?.clock_in && lReq?.status === "approved";
                  const isPendingLeave  = !rec?.clock_in && lReq?.status === "pending";
                  const isDirectLeave   = !rec?.clock_in && rec?.on_leave && !lReq; // admin edited attendance directly
                  const isOnLeave       = isApprovedLeave || isPendingLeave || isDirectLeave;
                  const isFuture        = dateStr > todayDs;
                  // Phantom rows (no clock-in, no flags) left by checkLateAbsences → treat as no record
                  const isPhantomRow    = !!(rec && !rec.clock_in && !rec.is_absent && !rec.is_half_day && !rec.on_leave);
                  const noRecord        = (!rec || isPhantomRow) && !lReq;

                  const clockIn  = rec?.clock_in  ? new Date(rec.clock_in).toLocaleTimeString("en-IN",  { hour: "2-digit", minute: "2-digit" }) : null;
                  const clockOut = rec?.clock_out ? new Date(rec.clock_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : null;
                  const dateLabel = new Date(dateStr).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

                  const leaveTypeLabel = lReq
                    ? (lReq.leave_type === "half_day" ? "Paid ½ Leave" : (lReq.leave_type?.charAt(0)?.toUpperCase() + lReq.leave_type?.slice(1) + " Leave"))
                    : "";

                  const openManualEdit = () => {
                    setManualAttDate(dateStr);
                    if (rec) {
                      const dt = (ts: string | null) => {
                        if (!ts) return "";
                        const d = new Date(ts);
                        return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
                      };
                      setManualAttForm({
                        status: rec.is_absent ? "absent" : rec.is_half_day ? "half_day" : rec.on_leave ? "leave" : "present",
                        clockIn: dt(rec.clock_in), clockOut: dt(rec.clock_out),
                        leaveType: rec.leave_type || "paid",
                        wfh: rec.work_from_home || false, onShoot: rec.on_shoot || false,
                      });
                    } else {
                      setManualAttForm({ status: "present", clockIn: "", clockOut: "", leaveType: "paid", wfh: false, onShoot: false });
                    }
                    setShowManualAtt(true);
                  };

                  // Sunday / National Holiday with no attendance — show faded placeholder
                  // (fall through if absent/flagged so those badges still render)
                  if (isNonWorking && !rec?.clock_in && !rec?.is_absent && !rec?.on_leave) {
                    const label = new Date(dateStr).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
                    const badgeLabel = isHoliday ? "National Holiday" : "Sunday";
                    return (
                      <div key={dateStr} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 16px", borderRadius: 12, background: "transparent", border: "1px solid var(--border2)", opacity: 0.45 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text3)", width: 80 }}>{label}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: "rgba(255,255,255,0.04)", color: "var(--text3)", border: "1px solid var(--border2)" }}>{badgeLabel}</span>
                          <button onClick={openManualEdit} title="Edit" style={{ padding: "4px 8px", borderRadius: 7, border: "1px solid var(--border2)", background: "transparent", cursor: "pointer", color: "var(--text3)", fontSize: 12 }}><i className="ti ti-pencil" /></button>
                        </div>
                      </div>
                    );
                  }
                  // Non-working day WITH a clock-in → falls through; "Full Day" badge swapped for "Holiday Work" / "Sunday Work"

                  const rowBg = noRecord ? "transparent" : isLate ? "rgba(251,191,36,0.07)" : isPendingLeave ? "rgba(251,191,36,0.05)" : isApprovedLeave ? "rgba(96,165,250,0.07)" : "var(--glass2)";
                  const rowBorder = noRecord ? "var(--border2)" : isLate ? "rgba(251,191,36,0.3)" : isPendingLeave ? "rgba(251,191,36,0.2)" : isApprovedLeave ? "rgba(96,165,250,0.25)" : "var(--border)";

                  return (
                    <div key={dateStr} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderRadius: 12, background: rowBg, border: `1px solid ${rowBorder}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
                        <div style={{ width: 80, flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{dateLabel}</div>
                        </div>
                        <div style={{ display: "flex", gap: 16, flex: 1, flexWrap: "wrap" }}>
                          {clockIn  && <div style={{ fontSize: 12, color: "var(--text3)" }}><i className="ti ti-login"  style={{ marginRight: 4, color: "#34d399" }} />{clockIn}</div>}
                          {clockOut && <div style={{ fontSize: 12, color: "var(--text3)" }}><i className="ti ti-logout" style={{ marginRight: 4, color: "#60a5fa" }} />{clockOut}</div>}
                          {rec?.work_from_home && <div style={{ fontSize: 11, color: "#a78bfa" }}><i className="ti ti-home" style={{ marginRight: 4 }} />WFH</div>}
                          {rec?.on_shoot       && <div style={{ fontSize: 11, color: "#fbbf24" }}><i className="ti ti-camera" style={{ marginRight: 4 }} />Shoot</div>}
                          {(isApprovedLeave || isPendingLeave) && lReq?.reason && <div style={{ fontSize: 11, color: "var(--text3)", fontStyle: "italic" }}>"{lReq.reason}"</div>}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        {isAbsent && <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "rgba(248,113,113,0.15)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>Absent</span>}
                        {isLate && <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "rgba(251,191,36,0.15)", color: "#d97706", border: "1px solid rgba(251,191,36,0.35)" }}>Late Entry · ½ Day</span>}
                        {isHalfLeave && <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "rgba(167,139,250,0.15)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.3)" }}>Paid ½ Leave</span>}
                        {isApprovedLeave && <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "rgba(96,165,250,0.15)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)" }}>{leaveTypeLabel}</span>}
                        {isPendingLeave  && <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>⏳ Pending · {leaveTypeLabel}</span>}
                        {isDirectLeave   && <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "rgba(96,165,250,0.15)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)" }}>{rec?.leave_type ? (rec.leave_type.charAt(0).toUpperCase() + rec.leave_type.slice(1)) + " Leave" : "On Leave"}</span>}
                        {!isAbsent && !isLate && !isHalfLeave && !isOnLeave && clockIn && (
                          isNonWorking
                            ? <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "rgba(251,191,36,0.15)", color: "#d97706", border: "1px solid rgba(251,191,36,0.35)" }}>{isHoliday ? "Holiday Work" : "Sunday Work"}</span>
                            : <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "rgba(52,211,153,0.15)", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)" }}>Full Day</span>
                        )}
                        {noRecord && !isFuture && <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: "rgba(255,255,255,0.04)", color: "var(--text3)", border: "1px solid var(--border2)", opacity: 0.6 }}>No Record</span>}
                        {noRecord && isFuture  && <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: "transparent", color: "var(--text3)", border: "1px solid var(--border2)", opacity: 0.35 }}>—</span>}
                        {otList.map((ot: any, i: number) => {
                          const otLabel = ot.type === "full_day" ? "OT · Full Day" : ot.type === "hours" ? `OT · ${ot.hours}h` : `OT · ${ot.works_count} work${ot.works_count !== 1 ? "s" : ""}`;
                          const otAmt   = ot.total_amount > 0 ? ` · ₹${ot.total_amount.toLocaleString("en-IN")}` : "";
                          return <span key={i} style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "rgba(251,191,36,0.15)", color: "#f59e0b", border: "1px solid rgba(251,191,36,0.4)" }}><i className="ti ti-bolt" style={{ marginRight: 3, fontSize: 9 }} />{otLabel}{otAmt}</span>;
                        })}
                        {isLate && rec && (
                          <button onClick={() => revokeLateFlagg(rec.id)} style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.35)", color: "#34d399" }}>
                            Revoke → Full Day
                          </button>
                        )}
                        <button onClick={openManualEdit} title="Edit attendance" style={{ padding: "5px 9px", borderRadius: 8, border: "1px solid var(--border2)", background: "transparent", cursor: "pointer", color: "var(--text3)", fontSize: 13 }}><i className="ti ti-pencil" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
    {/* ── Manual Attendance Edit Modal (portal — renders into document.body to escape any stacking context) ───────────────────────────────────── */}
    {showManualAtt && createPortal(
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => { setShowManualAtt(false); setSavingManualAtt(false); }}>
        <div style={{ background: "var(--glass)", border: "1px solid var(--border)", borderRadius: 18, padding: 28, width: "100%", maxWidth: 420 }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Edit Attendance</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{manualAttDate} · {members.find(m => m.id === attMember)?.name}</div>
            </div>
            <button onClick={() => { setShowManualAtt(false); setSavingManualAtt(false); }} style={{ background: "transparent", border: "none", color: "var(--text3)", fontSize: 20, cursor: "pointer" }}>×</button>
          </div>

          {/* Status buttons */}
          <div style={LS}>Status</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { v: "present",  label: "Present",   color: "#34d399" },
              { v: "half_day", label: "Late ½ Day",  color: "#a78bfa" },
              { v: "leave",    label: "On Leave",   color: "#60a5fa" },
              { v: "absent",   label: "Absent",     color: "#f87171" },
            ].map(opt => (
              <button key={opt.v} onClick={() => setManualAttForm((f: any) => ({ ...f, status: opt.v }))}
                style={{ flex: 1, minWidth: 80, padding: "8px 12px", borderRadius: 10, fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  background: manualAttForm.status === opt.v ? `${opt.color}22` : "transparent",
                  border: manualAttForm.status === opt.v ? `1.5px solid ${opt.color}` : "1px solid var(--border2)",
                  color: manualAttForm.status === opt.v ? opt.color : "var(--text3)" }}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Clock-in / out (present + half_day) */}
          {(manualAttForm.status === "present" || manualAttForm.status === "half_day") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={LS}>Clock In</label>
                <input type="time" value={manualAttForm.clockIn} onChange={e => setManualAttForm((f: any) => ({ ...f, clockIn: e.target.value }))} style={IS} />
              </div>
              <div>
                <label style={LS}>Clock Out</label>
                <input type="time" value={manualAttForm.clockOut} onChange={e => setManualAttForm((f: any) => ({ ...f, clockOut: e.target.value }))} style={IS} />
              </div>
            </div>
          )}

          {/* WFH / Shoot toggles for present */}
          {manualAttForm.status === "present" && (
            <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
              {[{ key: "wfh", label: "WFH" }, { key: "onShoot", label: "On Shoot" }].map(t => (
                <label key={t.key} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--text3)", cursor: "pointer" }}>
                  <input type="checkbox" checked={manualAttForm[t.key]} onChange={e => setManualAttForm((f: any) => ({ ...f, [t.key]: e.target.checked }))} />
                  {t.label}
                </label>
              ))}
            </div>
          )}

          {/* Leave type */}
          {manualAttForm.status === "leave" && (
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Leave Type</label>
              <select value={manualAttForm.leaveType} onChange={e => setManualAttForm((f: any) => ({ ...f, leaveType: e.target.value }))} style={{ ...IS, cursor: "pointer" }}>
                <option value="paid">Paid Leave</option>
                <option value="medical">Medical Leave</option>
                <option value="unpaid">Unpaid Leave</option>
                <option value="sick">Sick Leave</option>
              </select>
            </div>
          )}

          <button onClick={saveManualAtt} disabled={savingManualAtt} style={{ width: "100%", padding: "12px 0", borderRadius: 12, background: "var(--accent)", border: "none", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: savingManualAtt ? 0.6 : 1 }}>
            {savingManualAtt ? "Saving…" : "Save Attendance"}
          </button>
        </div>
      </div>,
      document.body
    )}

    {/* ── Mark Paid Modal ──────────────────────────────────────────────── */}
    {markPaidModal && createPortal(
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        onClick={() => setMarkPaidModal(null)}>
        <div style={{ background: "var(--card)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
          onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 3 }}>Pay Salary</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20 }}>
            {markPaidModal.row.name} · <span style={{ color: "#4ade80", fontWeight: 700 }}>{fmtINR(markPaidModal.row.netPay)}</span> · {new Date(markPaidModal.row.monthStr + "-01").toLocaleString("en-IN", { month: "long", year: "numeric" })}
          </div>

          {/* Account tiles */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>
            Pay from
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {FIN_ACCOUNTS.map(acc => {
              const idx = markPaidSplits.findIndex(s => s.account === acc);
              const selected = idx !== -1;
              const icons = new Proxy({} as Record<string, string>, { get: (_t, k) => accountIcon(String(k)) });
              return (
                <button key={acc} onClick={() => {
                  if (selected) {
                    if (markPaidSplits.length === 1) return; // must keep at least one
                    setMarkPaidSplits(s => s.filter(sp => sp.account !== acc));
                  } else {
                    setMarkPaidSplits(s => [...s, { account: acc, amount: "" }]);
                  }
                }} style={{
                  padding: "14px 12px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                  background: selected ? "rgba(232,25,44,0.12)" : "rgba(255,255,255,0.04)",
                  border: `1.5px solid ${selected ? "var(--accent)" : "var(--border2)"}`,
                  transition: "all .15s",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <i className={`ti ${icons[acc] || "ti-wallet"}`} style={{ fontSize: 18, color: selected ? "var(--accent)" : "var(--text3)" }} />
                    {selected && <i className="ti ti-circle-check-filled" style={{ fontSize: 16, color: "var(--accent)" }} />}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: selected ? "var(--text)" : "var(--text2)" }}>{acc}</div>
                </button>
              );
            })}
          </div>

          {/* Amount inputs — only shown when 2+ accounts selected */}
          {markPaidSplits.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px" }}>Split amounts</span>
                {(() => {
                  const tot = markPaidSplits.reduce((s, sp) => s + (parseFloat(sp.amount) || 0), 0);
                  const ok  = Math.abs(tot - markPaidModal.row.netPay) < 1;
                  return <span style={{ fontSize: 12, fontWeight: 600, color: ok ? "#4ade80" : "#fbbf24" }}>{fmtINR(tot)} / {fmtINR(markPaidModal.row.netPay)}</span>;
                })()}
              </div>
              {markPaidSplits.map((sp, i) => (
                <div key={sp.account} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: "var(--text2)", flex: 1 }}>{sp.account}</span>
                  <input type="number" value={sp.amount} placeholder="₹0"
                    onChange={e => { const s = [...markPaidSplits]; s[i] = { ...s[i], amount: e.target.value }; setMarkPaidSplits(s); }}
                    style={{ width: 120, padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--text)", fontSize: 13 }} />
                </div>
              ))}
            </div>
          )}

          {/* Single account: show which account and full amount */}
          {markPaidSplits.length === 1 && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.2)", fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
              Full <span style={{ fontWeight: 700, color: "#4ade80" }}>{fmtINR(markPaidModal.row.netPay)}</span> from <strong>{markPaidSplits[0].account}</strong>
            </div>
          )}

          {(() => {
            const splitTotal = markPaidSplits.reduce((s, sp) => s + (parseFloat(sp.amount) || 0), 0);
            const amountMismatch = markPaidSplits.length > 1 && Math.abs(splitTotal - markPaidModal.row.netPay) >= 1;
            const isDisabled = saving || amountMismatch;
            return (
              <>
                {amountMismatch && (
                  <div style={{ fontSize: 12, color: "#fbbf24", textAlign: "center", marginBottom: 10 }}>
                    Amounts must add up to {fmtINR(markPaidModal.row.netPay)} — currently {fmtINR(splitTotal)}
                  </div>
                )}
                <button
                  onClick={() => {
                    const splits = markPaidSplits.length === 1
                      ? [{ account: markPaidSplits[0].account, amount: String(markPaidModal.row.netPay) }]
                      : markPaidSplits;
                    markAsPaid(markPaidModal.row, splits);
                  }}
                  disabled={isDisabled}
                  style={{ width: "100%", padding: "13px 0", borderRadius: 12, background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 14, border: "none", cursor: isDisabled ? "not-allowed" : "pointer", opacity: isDisabled ? 0.5 : 1 }}>
                  {saving ? "Saving…" : `Confirm — ${fmtINR(markPaidModal.row.netPay)} Paid`}
                </button>
              </>
            );
          })()}
        </div>
      </div>,
      document.body
    )}

    {/* ── Payroll Override Modal ───────────────────────────────────────── */}
    {overrideModal && createPortal(
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        onClick={() => setOverrideModal(null)}>
        <div style={{ background: "var(--card)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
          onClick={e => e.stopPropagation()}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Waive Deduction Days</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20 }}>{overrideModal.row.name} · {overrideModal.row.monthStr}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 5 }}>Absent days to waive</label>
              <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 6 }}>Currently {overrideModal.row.absentDays}d absent, {overrideModal.row.absentDeduct}d charged</div>
              <input type="number" min={0} max={overrideModal.row.absentDays} value={overrideForm.absentCredit}
                onChange={e => setOverrideForm(f => ({ ...f, absentCredit: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--text)", fontSize: 14 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 5 }}>Unpaid days to waive</label>
              <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 6 }}>Currently {overrideModal.row.unpaidDays}d unpaid, {overrideModal.row.unpaidDeduct}d charged</div>
              <input type="number" min={0} max={overrideModal.row.unpaidDays} value={overrideForm.unpaidCredit}
                onChange={e => setOverrideForm(f => ({ ...f, unpaidCredit: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--text)", fontSize: 14 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 5 }}>Reason (optional)</label>
              <input type="text" value={overrideForm.notes} placeholder="e.g. approved by manager"
                onChange={e => setOverrideForm(f => ({ ...f, notes: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--text)", fontSize: 13 }} />
            </div>
            {/* Preview */}
            {(parseInt(overrideForm.absentCredit) > 0 || parseInt(overrideForm.unpaidCredit) > 0) && (
              <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 10, padding: "10px 14px", fontSize: 12 }}>
                <span style={{ color: "#4ade80", fontWeight: 600 }}>
                  {parseInt(overrideForm.absentCredit) + parseInt(overrideForm.unpaidCredit)}d waived → saves {fmtINR(overrideModal.row.dailyRate * ((parseInt(overrideForm.absentCredit) || 0) + (parseInt(overrideForm.unpaidCredit) || 0)))}
                </span>
              </div>
            )}
            <button onClick={savePayrollOverride} disabled={savingOverride}
              style={{ padding: "12px 0", borderRadius: 12, background: "#4ade80", color: "#000", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer" }}>
              {savingOverride ? "Saving…" : "Save Override"}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* ── Overtime Modal ───────────────────────────────────────────────── */}
    {showOTModal && createPortal(
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        onClick={() => { setShowOTModal(false); setOtStep(1); }}>
        <div style={{ background: "var(--glass)", border: "1px solid var(--border)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 440 }} onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                <i className="ti ti-bolt" style={{ color: "#fbbf24" }} />Log Overtime
              </div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 3 }}>
                {members.find(m => m.id === attMember)?.name} · Step {otStep} of 2
              </div>
            </div>
            <button onClick={() => { setShowOTModal(false); setOtStep(1); }} style={{ background: "transparent", border: "none", color: "var(--text3)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>

          {/* Step 1 — Date + Type */}
          {otStep === 1 && (
            <>
              <div style={{ marginBottom: 18 }}>
                <div style={LS}>Date</div>
                <input type="date" value={otForm.date} onChange={e => setOtForm((f: any) => ({ ...f, date: e.target.value }))} style={{ ...IS, width: "100%" }} />
              </div>
              <div style={{ marginBottom: 6 }}>
                <div style={LS}>Overtime Type</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {([
                  { type: "full_day",  icon: "ti-sun",      label: "Full Day",      desc: "The whole day counts as overtime" },
                  { type: "hours",     icon: "ti-clock",    label: "Specific Hours", desc: "Log exact OT hours worked" },
                  { type: "per_work",  icon: "ti-briefcase", label: "Per Work",      desc: "Fixed price per deliverable" },
                ] as const).map(opt => (
                  <button key={opt.type}
                    onClick={() => { setOtForm((f: any) => ({ ...f, type: opt.type })); setOtStep(2); }}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 13, border: `1px solid ${otForm.type === opt.type ? "rgba(251,191,36,0.6)" : "var(--border)"}`, background: otForm.type === opt.type ? "rgba(251,191,36,0.1)" : "var(--glass2)", cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(251,191,36,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <i className={`ti ${opt.icon}`} style={{ fontSize: 18, color: "#fbbf24" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{opt.desc}</div>
                    </div>
                    <i className="ti ti-chevron-right" style={{ marginLeft: "auto", color: "var(--text3)", fontSize: 14 }} />
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 2 — Details based on type */}
          {otStep === 2 && (
            <>
              {/* Back */}
              <button onClick={() => setOtStep(1)} style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, marginBottom: 16, padding: 0 }}>
                <i className="ti ti-arrow-left" style={{ fontSize: 12 }} />Back
              </button>

              {/* Type badge */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", fontSize: 11, color: "#fbbf24", fontWeight: 700, marginBottom: 18 }}>
                <i className="ti ti-bolt" style={{ fontSize: 10 }} />
                {otForm.type === "full_day" ? "Full Day OT" : otForm.type === "hours" ? "Hourly OT" : "Per Work OT"} · {otForm.date}
              </div>

              {/* Full day — only notes */}
              {otForm.type === "full_day" && (
                <div style={{ marginBottom: 16 }}>
                  <div style={LS}>Notes (optional)</div>
                  <textarea rows={3} value={otForm.notes} onChange={e => setOtForm((f: any) => ({ ...f, notes: e.target.value }))} placeholder="e.g. Holiday coverage, urgent delivery…" style={{ ...IS, width: "100%", resize: "none" }} />
                </div>
              )}

              {/* Hours */}
              {otForm.type === "hours" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <div>
                      <div style={LS}>Hours worked</div>
                      <input type="number" min="0.5" step="0.5" value={otForm.hours} onChange={e => setOtForm((f: any) => ({ ...f, hours: e.target.value }))} placeholder="e.g. 4" style={{ ...IS, width: "100%" }} />
                    </div>
                    <div>
                      <div style={LS}>Rate / hour (₹) <span style={{ color: "var(--text3)", fontWeight: 400 }}>optional</span></div>
                      <input type="number" min="0" value={otForm.ratePerHour} onChange={e => setOtForm((f: any) => ({ ...f, ratePerHour: e.target.value }))} placeholder="e.g. 500" style={{ ...IS, width: "100%" }} />
                    </div>
                  </div>
                  {otForm.hours && otForm.ratePerHour && (
                    <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", fontSize: 13, color: "#4ade80", fontWeight: 700, marginBottom: 16 }}>
                      OT Pay = ₹{(parseFloat(otForm.hours) * parseFloat(otForm.ratePerHour)).toLocaleString("en-IN")}
                    </div>
                  )}
                  <div style={{ marginBottom: 16 }}>
                    <div style={LS}>Notes (optional)</div>
                    <textarea rows={2} value={otForm.notes} onChange={e => setOtForm((f: any) => ({ ...f, notes: e.target.value }))} placeholder="What was worked on?" style={{ ...IS, width: "100%", resize: "none" }} />
                  </div>
                </>
              )}

              {/* Per Work */}
              {otForm.type === "per_work" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <div>
                      <div style={LS}>Price per work (₹)</div>
                      <input type="number" min="0" value={otForm.pricePerWork} onChange={e => setOtForm((f: any) => ({ ...f, pricePerWork: e.target.value }))} placeholder="e.g. 1000" style={{ ...IS, width: "100%" }} />
                    </div>
                    <div>
                      <div style={LS}>Works to do in a day</div>
                      <input type="number" min="1" step="1" value={otForm.worksCount} onChange={e => setOtForm((f: any) => ({ ...f, worksCount: e.target.value }))} placeholder="e.g. 3" style={{ ...IS, width: "100%" }} />
                    </div>
                  </div>
                  {otForm.pricePerWork && otForm.worksCount && (
                    <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", fontSize: 13, color: "#4ade80", fontWeight: 700, marginBottom: 16 }}>
                      Total OT Pay = ₹{(parseFloat(otForm.pricePerWork) * parseInt(otForm.worksCount)).toLocaleString("en-IN")}
                    </div>
                  )}
                  <div style={{ marginBottom: 16 }}>
                    <div style={LS}>Work description</div>
                    <input type="text" value={otForm.workDesc} onChange={e => setOtForm((f: any) => ({ ...f, workDesc: e.target.value }))} placeholder="e.g. Video edit, Instagram reels, Client deck…" style={{ ...IS, width: "100%" }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={LS}>Notes (optional)</div>
                    <textarea rows={2} value={otForm.notes} onChange={e => setOtForm((f: any) => ({ ...f, notes: e.target.value }))} placeholder="Any extra details…" style={{ ...IS, width: "100%", resize: "none" }} />
                  </div>
                </>
              )}

              <button onClick={saveOvertime} disabled={savingOT || !otForm.type || (otForm.type === "hours" && !otForm.hours) || (otForm.type === "per_work" && (!otForm.worksCount || !otForm.pricePerWork))}
                style={{ width: "100%", padding: "12px 0", borderRadius: 12, background: "linear-gradient(135deg,#f59e0b,#fbbf24)", border: "none", color: "#000", fontFamily: "inherit", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: savingOT ? 0.6 : 1 }}>
                {savingOT ? "Saving…" : "Log Overtime"}
              </button>
            </>
          )}
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
