"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { orgPath, MEMBER_DOCS_BUCKET, signMemberDocs } from "@/lib/org";
import { showToast } from "./ToastNotification";

const IS = { width: "100%", background: "#1a1a27", border: "1px solid var(--border2)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontFamily: "inherit", fontSize: 14, outline: "none" } as React.CSSProperties;
const LS = { fontSize: 11, fontWeight: 600 as const, color: "var(--text3)", display: "block" as const, marginBottom: 7, textTransform: "uppercase" as const, letterSpacing: ".6px" };

const leaveTypeColor: Record<string, string> = { paid: "#4ade80", half_day: "#a78bfa", sick: "#f87171", unpaid: "#94a3b8", medical: "#60a5fa" };
const statusColor: Record<string, { color: string; bg: string }> = {
  pending:  { color: "#fbbf24", bg: "rgba(251,191,36,0.1)"  },
  approved: { color: "#4ade80", bg: "rgba(74,222,128,0.1)"  },
  rejected: { color: "#f87171", bg: "rgba(248,113,113,0.1)" },
};

function daysBetween(start: string, end: string) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1);
}

export default function MyProfile({ profile }: { profile: any }) {
  const [hrProfile,    setHrProfile]    = useState<any>(null);
  const [balance,      setBalance]      = useState<any>(null);
  const [leaveHistory, setLeaveHistory] = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [onLeaveToday, setOnLeaveToday] = useState<any>(null);

  // Address edit
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressVal,     setAddressVal]     = useState("");
  const [savingAddress,  setSavingAddress]  = useState(false);

  // Photo upload
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // KYC uploads
  const [uploadingKyc, setUploadingKyc] = useState<Record<string, boolean>>({});
  const [docUrls,      setDocUrls]      = useState<Record<string, string>>({}); // stored path → signed URL

  // Leave application
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm]           = useState({ start_date: "", end_date: "", leave_type: "paid", reason: "" });
  const [submitting, setSubmitting]         = useState(false);
  const [leaveMsg,   setLeaveMsg]           = useState("");

  const year = new Date().getFullYear();

  useEffect(() => { if (profile?.id) fetchAll(); }, [profile?.id]);

  // Realtime: notify member when admin approves/rejects their leave
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase.channel(`leave-notify-${profile.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leave_requests", filter: `member_id=eq.${profile.id}` }, (payload: any) => {
        const n = payload.new; const o = payload.old;
        if (o?.status === "pending" && n?.status === "approved") {
          showToast({ type: "task", title: "Leave Approved!", body: `Your ${n.leave_type} leave (${new Date(n.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${new Date(n.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}) has been approved.`, noClick: true });
        } else if (o?.status === "pending" && n?.status === "rejected") {
          showToast({ type: "task", title: "Leave Rejected", body: `Your ${n.leave_type} leave request was rejected.${n.admin_notes ? " Reason: " + n.admin_notes : ""}`, noClick: true });
        }
        fetchAll();
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  const fetchAll = async () => {
    setLoading(true);
    const todayStr = new Date().toISOString().split("T")[0];
    const [{ data: hr }, { data: bal }, { data: hist }] = await Promise.all([
      supabase.from("hr_profiles").select("*").eq("id", profile.id).maybeSingle(),
      supabase.from("leave_balance").select("*").eq("member_id", profile.id).eq("year", year).maybeSingle(),
      supabase.from("leave_requests").select("*").eq("member_id", profile.id).order("created_at", { ascending: false }),
    ]);
    setHrProfile(hr);
    setDocUrls(await signMemberDocs([hr?.aadhar_front_url, hr?.aadhar_back_url, hr?.pan_card_url, hr?.joining_letter_url]));
    setAddressVal(hr?.address || "");
    setBalance(bal);
    setLeaveHistory(hist || []);
    const todayLeave = (hist || []).find((r: any) => r.status === "approved" && r.start_date <= todayStr && r.end_date >= todayStr);
    setOnLeaveToday(todayLeave || null);
    setLoading(false);
  };

  // Uploads to storage and returns the object path, or null on failure.
  const uploadFile = async (bucket: string, file: File, rawPath: string): Promise<string | null> => {
    const path = orgPath(rawPath);
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) { showToast({ type: "task", title: "Upload failed", body: error.message, noClick: true }); return null; }
    return path;
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingPhoto(true);
    const ext = file.name.split(".").pop();
    // Profile photos are shown to the whole team, so they live in the public profile-pics bucket.
    const path = await uploadFile("profile-pics", file, `profile-${profile.id}-${Date.now()}.${ext}`);
    const url = path ? supabase.storage.from("profile-pics").getPublicUrl(path).data.publicUrl : null;
    if (url) {
      await supabase.from("hr_profiles").upsert({ id: profile.id, profile_pic_url: url }, { onConflict: "id" });
      setHrProfile((p: any) => ({ ...p, profile_pic_url: url }));
      showToast({ type: "task", title: "Photo updated", body: "Your profile photo has been saved.", noClick: true });
    }
    setUploadingPhoto(false);
    e.target.value = "";
  };

  const saveAddress = async () => {
    setSavingAddress(true);
    await supabase.from("hr_profiles").upsert({ id: profile.id, address: addressVal }, { onConflict: "id" });
    setHrProfile((p: any) => ({ ...p, address: addressVal }));
    setEditingAddress(false);
    setSavingAddress(false);
    showToast({ type: "task", title: "Address saved", body: "Your address has been updated.", noClick: true });
  };

  const handleKycUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: string, label: string) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingKyc(p => ({ ...p, [field]: true }));
    const ext = file.name.split(".").pop();
    const path = await uploadFile(MEMBER_DOCS_BUCKET, file, `${profile.id}/${field}.${ext}`);
    if (path) {
      await supabase.from("hr_profiles").upsert({ id: profile.id, [field]: path }, { onConflict: "id" });
      // The DB resets KYC review to pending when a document changes.
      setHrProfile((p: any) => ({ ...p, [field]: path, kyc_status: "pending" }));
      signMemberDocs([path]).then(s => setDocUrls(p => ({ ...p, ...s })));
      showToast({ type: "task", title: `${label} uploaded`, body: "Document saved successfully.", noClick: true });
    }
    setUploadingKyc(p => ({ ...p, [field]: false }));
    e.target.value = "";
  };

  const submitLeave = async () => {
    if (!leaveForm.start_date || !leaveForm.end_date) { setLeaveMsg("Please select start and end dates."); return; }
    if (leaveForm.end_date < leaveForm.start_date) { setLeaveMsg("End date must be after start date."); return; }
    // Guard: prevent submitting paid/half_day if no paid balance left
    if ((leaveForm.leave_type === "paid" || leaveForm.leave_type === "half_day") && paid_left <= 0) {
      setLeaveMsg("No paid leaves remaining this month."); return;
    }
    setSubmitting(true); setLeaveMsg("");

    const { error } = await supabase.from("leave_requests").insert([{
      member_id:   profile.id,
      member_name: profile.name,
      start_date:  leaveForm.start_date,
      end_date:    leaveForm.end_date,
      leave_type:  leaveForm.leave_type,
      reason:      leaveForm.reason,
      status:      "pending",
    }]);

    if (error) { setLeaveMsg("Failed to submit. Please try again."); }
    else {
      // Auto-mark attendance as on_leave for each day in the range
      const endD = new Date(leaveForm.end_date);
      for (let d = new Date(leaveForm.start_date); d <= endD; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        const { data: existing } = await supabase.from("attendance").select("id, clock_in").eq("user_id", profile.id).eq("date", dateStr).maybeSingle();
        if (existing && !existing.clock_in) {
          await supabase.from("attendance").update({ on_leave: true, leave_type: leaveForm.leave_type }).eq("id", existing.id);
        } else if (!existing) {
          await supabase.from("attendance").insert({ user_id: profile.id, date: dateStr, on_leave: true, leave_type: leaveForm.leave_type, total_break_minutes: 0, on_shoot: false });
        }
      }
      setLeaveMsg(""); setShowLeaveModal(false); setLeaveForm({ start_date: "", end_date: "", leave_type: "paid", reason: "" }); fetchAll();
    }
    setSubmitting(false);
  };

  const paid_total    = balance?.paid_total ?? 2;
  const paid_used     = balance?.paid_used  ?? 0;
  const sick_total    = balance?.sick_total ?? 0;
  const sick_used     = balance?.sick_used  ?? 0;
  const currentMonthStr = `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  // Count this month's approved paid leaves from history (annual paid_used from leave_balance spans the full year)
  const paid_used_month = leaveHistory
    .filter(r => (r.leave_type === "paid" || r.leave_type === "half_day") && r.status === "approved" && r.start_date?.startsWith(currentMonthStr))
    .reduce((sum: number, r: any) => sum + (r.leave_type === "half_day" ? 0.5 : daysBetween(r.start_date, r.end_date)), 0);
  // Also subtract pending paid/half_day requests this month so quota isn't exceeded
  const paid_pending  = leaveHistory
    .filter(r => r.status === "pending" && (r.leave_type === "paid" || r.leave_type === "half_day") && r.start_date?.startsWith(currentMonthStr))
    .reduce((sum: number, r: any) => sum + (r.leave_type === "half_day" ? 0.5 : daysBetween(r.start_date, r.end_date)), 0);
  const paid_left     = Math.max(0, paid_total - paid_used_month - paid_pending);
  const medical_total = 2;
  const medical_used  = leaveHistory
    .filter(r => r.leave_type === "medical" && r.status === "approved" && r.start_date?.startsWith(currentMonthStr))
    .reduce((sum: number, r: any) => sum + daysBetween(r.start_date, r.end_date), 0);
  const medical_left  = Math.max(0, medical_total - medical_used);

  const picUrl = hrProfile?.profile_pic_url;

  return (
    <div className="page-wrap" style={{ maxWidth: 780, width: "100%" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.6px", marginBottom: 28 }}>My Profile</div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
          <i className="ti ti-loader" style={{ fontSize: 32, opacity: .4 }} /><div style={{ marginTop: 12 }}>Loading…</div>
        </div>
      ) : (
        <>
          {/* ── On Leave Today Banner ── */}
          {onLeaveToday && (
            <div style={{ marginBottom: 16, padding: "14px 20px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 14, display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(74,222,128,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <i className="ti ti-beach" style={{ fontSize: 20, color: "#4ade80" }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#4ade80", marginBottom: 2 }}>You are on approved leave today</div>
                <div style={{ fontSize: 13, color: "var(--text2)" }}>
                  {onLeaveToday.leave_type === "half_day" ? "Paid Half Day" : onLeaveToday.leave_type?.charAt(0).toUpperCase() + onLeaveToday.leave_type?.slice(1)} leave ·{" "}
                  {new Date(onLeaveToday.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  {onLeaveToday.start_date !== onLeaveToday.end_date && ` – ${new Date(onLeaveToday.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                </div>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700, background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>Approved</span>
            </div>
          )}

          {/* ── Pending Request Banner ── */}
          {leaveHistory.some(r => r.status === "pending") && (
            <div style={{ marginBottom: 16, padding: "12px 18px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <i className="ti ti-clock" style={{ fontSize: 18, color: "#fbbf24", flexShrink: 0 }} />
              <div style={{ fontSize: 13, color: "var(--text2)" }}>
                You have <strong style={{ color: "#fbbf24" }}>{leaveHistory.filter(r => r.status === "pending").length}</strong> leave request{leaveHistory.filter(r => r.status === "pending").length > 1 ? "s" : ""} pending admin approval.
              </div>
            </div>
          )}

          {/* ── Profile Card ── */}
          <div className="crm-card" style={{ padding: 28, marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
              {/* Avatar with upload overlay */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                {picUrl
                  ? <img src={picUrl} alt={profile?.name} style={{ width: 88, height: 88, borderRadius: 20, objectFit: "cover", border: "2px solid rgba(255,255,255,0.1)" }} />
                  : <div style={{ width: 88, height: 88, borderRadius: 20, background: profile?.color || "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 800, color: "#fff" }}>{profile?.name?.[0]?.toUpperCase()}</div>
                }
                <label title="Change photo" style={{ position: "absolute", bottom: -6, right: -6, width: 28, height: 28, borderRadius: 8, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "2px solid var(--bg)", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
                  {uploadingPhoto ? <i className="ti ti-loader-2" style={{ fontSize: 14, color: "#fff" }} /> : <i className="ti ti-camera" style={{ fontSize: 14, color: "#fff" }} />}
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} disabled={uploadingPhoto} />
                </label>
              </div>

              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.4px" }}>{profile?.name}</div>
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700, background: "rgba(99,102,241,0.15)", color: "#a78bfa", border: "1px solid rgba(99,102,241,0.25)", textTransform: "capitalize" }}>{profile?.role || "member"}</span>
                </div>
                {hrProfile?.department && <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 6 }}><i className="ti ti-briefcase" style={{ marginRight: 6, color: "var(--text3)" }} />{hrProfile.department}</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {profile?.email && <div style={{ fontSize: 13, color: "var(--text2)" }}><i className="ti ti-mail" style={{ marginRight: 8, color: "var(--text3)", fontSize: 13 }} />{profile.email}</div>}
                  {profile?.phone && <div style={{ fontSize: 13, color: "var(--text2)" }}><i className="ti ti-phone" style={{ marginRight: 8, color: "var(--text3)", fontSize: 13 }} />{profile.phone}</div>}
                  {hrProfile?.date_of_joining && <div style={{ fontSize: 12, color: "var(--text3)" }}><i className="ti ti-calendar-plus" style={{ marginRight: 8 }} />Joined {new Date(hrProfile.date_of_joining).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>}
                </div>
              </div>
            </div>

            {/* Address row */}
            <div style={{ marginTop: 20, padding: "14px 16px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: editingAddress ? 10 : 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".6px" }}><i className="ti ti-map-pin" style={{ marginRight: 6 }} />Address</div>
                {!editingAddress && (
                  <button onClick={() => setEditingAddress(true)} style={{ background: "transparent", border: "1px solid var(--border2)", borderRadius: 7, padding: "4px 10px", color: "var(--text3)", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                    <i className="ti ti-pencil" style={{ marginRight: 4 }} />Edit
                  </button>
                )}
              </div>
              {editingAddress ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <textarea value={addressVal} onChange={e => setAddressVal(e.target.value)} rows={3} placeholder="Enter your full address…" style={{ ...IS, resize: "vertical" }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={saveAddress} disabled={savingAddress} className="btn-primary" style={{ padding: "8px 18px", fontSize: 13 }}>{savingAddress ? "Saving…" : "Save"}</button>
                    <button onClick={() => { setEditingAddress(false); setAddressVal(hrProfile?.address || ""); }} style={{ padding: "8px 14px", fontSize: 13, background: "transparent", border: "1px solid var(--border2)", borderRadius: 8, color: "var(--text2)", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: hrProfile?.address ? "var(--text2)" : "var(--text3)", marginTop: 6, fontStyle: hrProfile?.address ? "normal" : "italic" }}>
                  {hrProfile?.address || "No address added yet. Click Edit to add."}
                </div>
              )}
            </div>

            {hrProfile?.emergency_contact && (
              <div style={{ marginTop: 12, padding: "12px 16px", background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.12)", borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 4 }}>Emergency Contact</div>
                <div style={{ fontSize: 13, color: "var(--text2)" }}>{hrProfile.emergency_contact} {hrProfile.emergency_phone && <span style={{ color: "var(--text3)" }}>· {hrProfile.emergency_phone}</span>}</div>
              </div>
            )}
          </div>

          {/* ── KYC Documents ── */}
          <div className="crm-card" style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.3px" }}>
                <i className="ti ti-id-badge" style={{ marginRight: 8, color: "var(--text3)" }} />KYC Documents
              </div>
              {hrProfile?.kyc_status === "approved" ? (
                <span style={{ fontSize: 12, fontWeight: 700, padding: "5px 14px", borderRadius: 20, background: "rgba(74,222,128,0.12)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)", display: "flex", alignItems: "center", gap: 6 }}>
                  <i className="ti ti-circle-check" style={{ fontSize: 14 }} />Your KYC is up to date
                </span>
              ) : hrProfile?.kyc_status === "rejected" ? (
                <span style={{ fontSize: 12, fontWeight: 700, padding: "5px 14px", borderRadius: 20, background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>
                  KYC Rejected — please re-upload
                </span>
              ) : (hrProfile?.aadhar_front_url || hrProfile?.aadhar_back_url || hrProfile?.pan_card_url) ? (
                <span style={{ fontSize: 12, fontWeight: 700, padding: "5px 14px", borderRadius: 20, background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>
                  Pending Admin Review
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 20 }}>Upload Aadhaar card and PAN card for records. Admin only can view these.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
              {[
                { field: "aadhar_front_url", label: "Aadhaar Front", icon: "ti-id" },
                { field: "aadhar_back_url",  label: "Aadhaar Back",  icon: "ti-id" },
                { field: "pan_card_url",     label: "PAN Card",      icon: "ti-file-text" },
              ].map(({ field, label, icon }) => {
                const stored = hrProfile?.[field];
                const url = stored ? docUrls[stored] : undefined;
                const busy = uploadingKyc[field];
                return (
                  <div key={field} style={{ border: "1px solid var(--border2)", borderRadius: 12, overflow: "hidden", background: "var(--bg)" }}>
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
                        <img src={url} alt={label} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
                      </a>
                    ) : (
                      <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(128,128,128,0.05)" }}>
                        <i className={`ti ${icon}`} style={{ fontSize: 32, color: "var(--text3)", opacity: .4 }} />
                      </div>
                    )}
                    <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)" }}>{label}</div>
                        <div style={{ fontSize: 11, color: stored ? "#4ade80" : "var(--text3)" }}>{stored ? "Uploaded" : "Not uploaded"}</div>
                      </div>
                      <label style={{ background: "rgba(128,128,128,0.1)", border: "1px solid var(--border2)", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 12, color: "var(--text2)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                        {busy ? <i className="ti ti-loader-2" style={{ fontSize: 13 }} /> : <i className="ti ti-upload" style={{ fontSize: 13 }} />}
                        {stored ? "Replace" : "Upload"}
                        <input type="file" accept="image/*,.pdf" onChange={e => handleKycUpload(e, field, label)} style={{ display: "none" }} disabled={busy} />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Joining Letter ── */}
          {hrProfile?.joining_letter_url && (
            <div className="crm-card" style={{ padding: 20, marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <i className="ti ti-file-text" style={{ fontSize: 22, color: "#60a5fa" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>Letter of Joining</div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>Your official joining letter is available</div>
              </div>
              <a href={docUrls[hrProfile.joining_letter_url]} target="_blank" rel="noopener noreferrer" style={{ padding: "8px 16px", borderRadius: 9, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.35)", color: "#60a5fa", textDecoration: "none", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                <i className="ti ti-download" style={{ fontSize: 14 }} />View / Download
              </a>
            </div>
          )}

          {/* ── Leave Balance Card ── */}
          <div className="crm-card" style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.3px" }}>
                <i className="ti ti-beach" style={{ marginRight: 8, color: "#fbbf24" }} />Leave Balance · {year}
              </div>
              <button onClick={() => { setLeaveMsg(""); setLeaveForm(f => ({ ...f, leave_type: paid_left > 0 ? "paid" : medical_left > 0 ? "medical" : "unpaid" })); setShowLeaveModal(true); }} className="btn-primary" style={{ padding: "8px 16px", fontSize: 13 }}>
                <i className="ti ti-plus" /> Apply for Leave
              </button>
            </div>
            <div className="stat-grid-3" style={{ marginBottom: 0, gap: 12 }}>
              {[
                { label: "Paid Left",    val: paid_left % 1 !== 0 ? paid_left.toFixed(1) : paid_left,  color: "#4ade80", sub: `${paid_used_month % 1 !== 0 ? paid_used_month.toFixed(1) : paid_used_month} used${paid_pending > 0 ? ` · ${paid_pending % 1 !== 0 ? paid_pending.toFixed(1) : paid_pending} pending` : ""} of ${paid_total} this month` },
                { label: "Medical Left", val: medical_left, color: "#60a5fa", sub: `${medical_used} used of ${medical_total} this month` },
                { label: "Unpaid Used",  val: leaveHistory.filter(r => r.leave_type === "unpaid" && r.status === "approved").reduce((s: number, r: any) => s + daysBetween(r.start_date, r.end_date), 0), color: "#94a3b8", sub: "auto tracked" },
              ].map((s, i) => (
                <div key={i} style={{ padding: "16px 0", borderRadius: 12, background: `${s.color}08`, border: `1px solid ${s.color}20`, textAlign: "center" }}>
                  <div style={{ fontSize: 34, fontWeight: 900, color: s.color, letterSpacing: "-1px", lineHeight: 1 }}>{s.val}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: s.color, marginTop: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Leave History ── */}
          {leaveHistory.length > 0 && (
            <div className="crm-card" style={{ padding: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 18, letterSpacing: "-0.3px" }}>
                <i className="ti ti-history" style={{ marginRight: 8, color: "var(--text3)" }} />Leave History
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {leaveHistory.map(req => {
                  const days = daysBetween(req.start_date, req.end_date);
                  const st   = statusColor[req.status] || statusColor.pending;
                  const tc   = leaveTypeColor[req.leave_type] || "#94a3b8";
                  return (
                    <div key={req.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 700, background: `${tc}18`, color: tc, border: `1px solid ${tc}30` }}>
                            {req.leave_type === "half_day" ? "Paid Leave ½ Day" : req.leave_type?.charAt(0).toUpperCase() + req.leave_type?.slice(1) + " Leave"}
                          </span>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 700, background: st.bg, color: st.color, border: `1px solid ${st.color}30` }}>
                            {req.status?.charAt(0).toUpperCase() + req.status?.slice(1)}
                          </span>
                          <span style={{ fontSize: 12, color: "var(--text3)" }}>{req.leave_type === "half_day" ? "0.5 day" : `${days} day${days > 1 ? "s" : ""}`}</span>
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text2)" }}>
                          {new Date(req.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          {req.start_date !== req.end_date && ` – ${new Date(req.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                        </div>
                        {req.reason      && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 3, fontStyle: "italic" }}>"{req.reason}"</div>}
                        {req.admin_notes && req.status === "rejected" && <div style={{ fontSize: 12, color: "#f87171", marginTop: 3 }}>Admin: {req.admin_notes}</div>}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text3)", flexShrink: 0 }}>
                        {new Date(req.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Apply for Leave Modal ── */}
      {showLeaveModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
          <div style={{ width: 440, maxWidth: "95vw", background: "var(--bg)", border: "1px solid var(--border2)", borderRadius: 22, padding: 30 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)" }}>Apply for Leave</div>
              <button onClick={() => setShowLeaveModal(false)} style={{ background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 20 }}><i className="ti ti-x" /></button>
            </div>

            {/* Balance hint */}
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              <div style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: paid_left > 0 ? "rgba(74,222,128,0.06)" : "rgba(248,113,113,0.06)", border: `1px solid ${paid_left > 0 ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.25)"}`, textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: paid_left > 0 ? "#4ade80" : "#f87171" }}>{paid_left % 1 !== 0 ? paid_left.toFixed(1) : paid_left}</div>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>Paid Left</div>
              </div>
              <div style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: medical_left > 0 ? "rgba(96,165,250,0.06)" : "rgba(248,113,113,0.06)", border: `1px solid ${medical_left > 0 ? "rgba(96,165,250,0.2)" : "rgba(248,113,113,0.25)"}`, textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: medical_left > 0 ? "#60a5fa" : "#f87171" }}>{medical_left}</div>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>Medical Left</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div><label style={LS}>Start Date</label><input type="date" value={leaveForm.start_date} onChange={e => setLeaveForm({ ...leaveForm, start_date: e.target.value })} style={IS} /></div>
                <div><label style={LS}>End Date</label><input type="date" value={leaveForm.end_date} onChange={e => setLeaveForm({ ...leaveForm, end_date: e.target.value })} min={leaveForm.start_date} style={IS} /></div>
              </div>
              <div>
                <label style={LS}>Leave Type</label>
                <select value={leaveForm.leave_type} onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })} style={{ ...IS, cursor: "pointer" }}>
                  {paid_left > 0     && <option value="paid">Paid Leave ({paid_left % 1 !== 0 ? paid_left.toFixed(1) : paid_left} left this month)</option>}
                  {paid_left >= 0.5  && <option value="half_day">Half Day Leave ({paid_left % 1 !== 0 ? paid_left.toFixed(1) : paid_left} paid left)</option>}
                  {medical_left > 0  && <option value="medical">Medical Leave ({medical_left} left this month)</option>}
                  <option value="unpaid">Unpaid Leave</option>
                </select>
              </div>
              <div><label style={LS}>Reason (optional)</label><textarea value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} rows={3} placeholder="Briefly describe the reason…" style={{ ...IS, resize: "vertical" }} /></div>
            </div>

            {leaveForm.start_date && leaveForm.end_date && leaveForm.end_date >= leaveForm.start_date && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 10, fontSize: 13, color: "var(--text2)" }}>
                <i className="ti ti-info-circle" style={{ marginRight: 6, color: "#4ade80" }} />
                Requesting <strong>{daysBetween(leaveForm.start_date, leaveForm.end_date)} day(s)</strong> of {leaveForm.leave_type} leave. Admin will review and approve.
              </div>
            )}

            {leaveMsg && <div style={{ marginTop: 10, padding: "9px 14px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 8, fontSize: 13, color: "#f87171" }}>{leaveMsg}</div>}

            <button onClick={submitLeave} disabled={submitting || !leaveForm.start_date || !leaveForm.end_date} className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: 12, fontSize: 14, marginTop: 18, opacity: (submitting || !leaveForm.start_date || !leaveForm.end_date) ? .7 : 1 }}>
              {submitting ? "Submitting…" : "Submit Leave Request"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
