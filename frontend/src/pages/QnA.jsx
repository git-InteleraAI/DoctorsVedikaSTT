import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";

const API = import.meta.env.VITE_NODE_API_URL;

/* ── helpers ── */
function timeLabel(dt) {
    if (!dt) return "";
    const d = new Date(dt);
    const diff = Date.now() - d.getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min} min ago`;
    if (min < 1440) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (min < 2880) return "Yesterday";
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${d.getDate()} ${months[d.getMonth()]}`;
}

function chatTime(dt) {
    if (!dt) return "";
    return new Date(dt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function chatDate(dt) {
    if (!dt) return "";
    return new Date(dt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
function calcAge(dob) {
    if (!dob) return null;
    return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365));
}

const AVATAR_COLORS = ["#4F46E5","#7C3AED","#EC4899","#10B981","#F59E0B","#EF4444","#06B6D4","#8B5CF6","#059669","#DC2626"];
function avatarColor(name = "") {
    let h = 0;
    for (const c of name) h += c.charCodeAt(0);
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function Avatar({ name = "?", size = 40, src = null }) {
    if (src) {
        return (
            <img
                src={src}
                alt={name}
                style={{
                    width: size, height: size, borderRadius: "50%",
                    objectFit: "cover", flexShrink: 0
                }}
            />
        );
    }
    const initials = name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
    return (
        <div style={{
            width: size, height: size, borderRadius: "50%",
            background: avatarColor(name),
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
            letterSpacing: "0.02em",
        }}>{initials}</div>
    );
}

/* ── Tab button style ── */
function tabStyle(active) {
    return {
        padding: "9px 14px",
        border: "none",
        background: "transparent",
        color: active ? "#082B68" : "#94a3b8",
        fontWeight: active ? 700 : 500,
        fontSize: "0.85rem",
        cursor: "pointer",
        borderBottom: active ? "2.5px solid #08AEB8" : "2.5px solid transparent",
        transition: "all 0.2s",
        whiteSpace: "nowrap",
    };
}

export default function QnA() {
    const navigate = useNavigate();
    const { doctor, loading: authLoading } = useAuth();

    const [questions, setQuestions] = useState([]);
    const [selectedPatientId, setSelectedPatientId] = useState(null);
    const [tab, setTab] = useState("all");
    const [searchQ, setSearchQ] = useState("");
    const [replyText, setReplyText] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [apiError, setApiError] = useState(null);
    const [archiving, setArchiving] = useState(false);

    const msgEndRef = useRef(null);

    /* ── auth guard ── */
    useEffect(() => {
        if (!authLoading && !doctor) navigate("/login");
    }, [doctor, authLoading]);

    /* ── fetch on mount ── */
    useEffect(() => {
        if (doctor) fetchQuestions();
    }, [doctor]);

    /* ─────────────────────────────────────────────
       FETCH QUESTIONS FROM BACKEND
    ───────────────────────────────────────────── */
    const fetchQuestions = useCallback(async (preserveSelected = false) => {
        setLoading(true);
        setApiError(null);
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            const res = await axios.get(`${API}/api/questions`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const qs = res.data?.questions || [];
            setQuestions(qs);

            if (!preserveSelected) {
                const firstPid = qs[0]?.patient?.id || qs[0]?.patient_id;
                setSelectedPatientId(firstPid || null);
            }
        } catch (err) {
            console.error("[QnA] Fetch error:", err);
            setApiError("Unable to load questions. Check your connection.");
        } finally {
            setLoading(false);
        }
    }, [doctor]);

    /* ── group questions by patient thread ── */
    const threadsMap = {};
    for (const q of questions) {
        const pid = q.patient?.id || q.patient_id || q.id;
        if (!threadsMap[pid]) {
            threadsMap[pid] = {
                patientId: pid,
                patient: q.patient || {},
                questions: [],
            };
        }
        threadsMap[pid].questions.push(q);
    }

    const threads = Object.values(threadsMap).map(t => {
        // Sort questions chronological (oldest to newest)
        const sortedQs = [...t.questions].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const latestQ = sortedQs[sortedQs.length - 1];
        const pendingQs = sortedQs.filter(q => q.status === "pending");
        return {
            ...t,
            questions: sortedQs,
            latestQuestion: latestQ,
            hasPending: pendingQs.length > 0,
            pendingCount: pendingQs.length,
            answeredCount: sortedQs.length - pendingQs.length,
            latestTime: latestQ?.created_at,
        };
    }).sort((a, b) => new Date(b.latestTime) - new Date(a.latestTime));

    /* ── derived filtering ── */
    const filteredThreads = threads.filter(t => {
        const pName = (t.patient?.full_name || t.patient?.name || "Patient").toLowerCase();
        const matchesSearch = !searchQ || pName.includes(searchQ.toLowerCase()) || t.questions.some(q => q.question_text?.toLowerCase().includes(searchQ.toLowerCase()));
        if (!matchesSearch) return false;

        if (tab === "pending") return t.hasPending;
        if (tab === "answered") return !t.hasPending;
        return true;
    });

    const totalCount = threads.length;
    const pendingCount = threads.filter(t => t.hasPending).length;
    const answeredCount = threads.filter(t => !t.hasPending).length;

    const selectedThread = filteredThreads.find(t => t.patientId === selectedPatientId) || filteredThreads[0] || null;

    /* ── scroll to bottom on selected thread / message change ── */
    useEffect(() => {
        msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [selectedThread]);

    /* ─────────────────────────────────────────────
       SEND ANSWER
    ───────────────────────────────────────────── */
    const handleSend = async () => {
        if (!replyText.trim() || !selectedThread || sending) return;

        // Find target question: first pending question, or latest question
        const pendingQ = selectedThread.questions.find(q => q.status === "pending");
        const targetQ = pendingQ || selectedThread.latestQuestion;
        if (!targetQ) return;

        setSending(true);
        const replyVal = replyText.trim();
        setReplyText("");

        const optimistic = {
            ...targetQ,
            answer_text: replyVal,
            status: "answered",
            answered_at: new Date().toISOString(),
        };

        setQuestions(prev => prev.map(q => q.id === targetQ.id ? optimistic : q));

        try {
            const token = localStorage.getItem("doctors_vedika_token");
            const res = await axios.post(
                `${API}/api/questions/${targetQ.id}/answer`,
                { answer_text: replyVal },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.data?.question) {
                const srv = res.data.question;
                setQuestions(prev => prev.map(q => q.id === targetQ.id ? { ...optimistic, ...srv } : q));
            }
        } catch (err) {
            console.error("[QnA] Answer error:", err?.response?.data || err);
        } finally {
            setSending(false);
        }
    };

    /* ─────────────────────────────────────────────
       ARCHIVE CONVERSATION
    ───────────────────────────────────────────── */
    const handleArchive = async () => {
        if (!selectedThread || archiving) return;
        setArchiving(true);
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            const pendingQs = selectedThread.questions.filter(q => q.status === "pending");
            await Promise.all(pendingQs.map(q => 
                axios.patch(
                    `${API}/api/questions/${q.id}/status`,
                    { status: "answered" },
                    { headers: { Authorization: `Bearer ${token}` } }
                )
            ));
            await fetchQuestions(true);
        } catch (err) {
            console.error("[QnA] Archive error:", err);
        } finally {
            setArchiving(false);
        }
    };

    /* ── patient info derived for right panel ── */
    const patient = selectedThread?.patient || {};
    const patientName = patient.full_name || patient.name || "Patient";
    const patientAge = calcAge(patient.date_of_birth);
    const patientPhone = patient.phone || patient.phone_number || "";
    const patientLocation = [patient.locality || patient.city, patient.address, patient.state].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
    const attachments = selectedThread ? selectedThread.questions.filter(q => q.report_url) : [];

    /* ═══════════════════════════════════════════════
       RENDER
    ═══════════════════════════════════════════════ */
    return (
        <DashboardLayout activePage="qna" searchPlaceholder="Search questions, patients...">
            {/* ── Page Header ── */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#082B68,#08AEB8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <i className="fa-solid fa-comments" style={{ color: "#fff", fontSize: "1.3rem" }} />
                    </div>
                    <div>
                        <h1 style={{ color: "#082B68", fontWeight: 800, fontSize: "1.6rem", margin: 0 }}>Q & A</h1>
                        <p style={{ color: "#64748b", margin: 0, fontSize: "0.85rem" }}>Answer questions and help patients with expert medical guidance.</p>
                    </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => fetchQuestions(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", background: "#f8fafc", color: "#082B68", border: "1.5px solid #e2e8f0", borderRadius: 10, fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" }}>
                        <i className="fa-solid fa-rotate" /> Refresh
                    </button>
                </div>
            </div>

            {/* ── API Error Banner ── */}
            {apiError && (
                <div style={{ marginBottom: 16, padding: "12px 18px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, color: "#ef4444", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 10 }}>
                    <i className="fa-solid fa-triangle-exclamation" />
                    {apiError}
                    <button onClick={() => fetchQuestions()} style={{ marginLeft: "auto", background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 700, fontSize: "0.82rem" }}>Retry</button>
                </div>
            )}

            {/* ── 3-Column Layout ── */}
            <div style={{ display: "flex", height: "calc(100vh - 200px)", borderRadius: 16, overflow: "hidden", border: "1px solid #e2e8f0", background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>

                {/* ═══ LEFT: Patient Thread List ═══ */}
                <div style={{ width: 310, flexShrink: 0, borderRight: "1px solid #f1f5f9", display: "flex", flexDirection: "column", background: "#fff" }}>

                    {/* Filter Tabs */}
                    <div style={{ display: "flex", borderBottom: "1px solid #f1f5f9", padding: "0 12px", overflowX: "auto" }}>
                        <button style={tabStyle(tab === "all")} onClick={() => setTab("all")}>
                            All <span style={{ background: "#082B68", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: "0.7rem", marginLeft: 4, fontWeight: 700 }}>{totalCount}</span>
                        </button>
                        <button style={tabStyle(tab === "pending")} onClick={() => setTab("pending")}>
                            Unread {pendingCount > 0 && <span style={{ background: "#f59e0b", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: "0.7rem", marginLeft: 4, fontWeight: 700 }}>{pendingCount}</span>}
                        </button>
                        <button style={tabStyle(tab === "answered")} onClick={() => setTab("answered")}>
                            Answered {answeredCount > 0 && <span style={{ background: "#10B981", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: "0.7rem", marginLeft: 4, fontWeight: 700 }}>{answeredCount}</span>}
                        </button>
                    </div>

                    {/* Search within threads */}
                    <div style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9" }}>
                        <div style={{ position: "relative" }}>
                            <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: "0.8rem" }} />
                            <input
                                type="text"
                                placeholder="Search questions, patients..."
                                value={searchQ}
                                onChange={e => setSearchQ(e.target.value)}
                                style={{ width: "100%", padding: "8px 10px 8px 30px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.82rem", outline: "none", color: "#334155", background: "#f8fafc", boxSizing: "border-box" }}
                            />
                        </div>
                    </div>

                    {/* Patient Items */}
                    <div style={{ flex: 1, overflowY: "auto" }}>
                        {loading ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
                                {[1,2,3,4].map(i => (
                                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#f1f5f9", flexShrink: 0 }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ height: 12, background: "#f1f5f9", borderRadius: 6, marginBottom: 6, width: "60%" }} />
                                            <div style={{ height: 10, background: "#f8fafc", borderRadius: 6, width: "90%" }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : filteredThreads.length === 0 ? (
                            <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>
                                <i className="fa-regular fa-comments" style={{ fontSize: "2.5rem", marginBottom: 12, display: "block" }} />
                                <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 4 }}>No conversations found</div>
                                <div style={{ fontSize: "0.78rem" }}>Patient conversations addressed to you will appear here.</div>
                            </div>
                        ) : filteredThreads.map(t => {
                            const isActive = selectedThread?.patientId === t.patientId;
                            const pName = t.patient?.full_name || t.patient?.name || "Patient";
                            const snippet = t.latestQuestion?.question_text || "";
                            return (
                                <div
                                    key={t.patientId}
                                    onClick={() => { setSelectedPatientId(t.patientId); setReplyText(""); }}
                                    style={{
                                        padding: "13px 14px",
                                        cursor: "pointer",
                                        background: isActive ? "rgba(8,174,184,0.06)" : "transparent",
                                        borderLeft: isActive ? "3px solid #08AEB8" : "3px solid transparent",
                                        borderBottom: "1px solid #f8fafc",
                                        transition: "all 0.15s",
                                    }}
                                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#f8fafc"; }}
                                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                                >
                                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                        <Avatar name={pName} size={36} src={t.patient?.profile_photo} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                                                <span style={{ fontWeight: 700, fontSize: "0.86rem", color: "#0f172a" }}>{pName}</span>
                                                <span style={{ fontSize: "0.7rem", color: "#94a3b8", whiteSpace: "nowrap", marginLeft: 6 }}>{timeLabel(t.latestTime)}</span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                                {snippet}
                                            </p>
                                        </div>
                                        {t.hasPending && (
                                            <div style={{ width: 18, height: 18, background: "#08AEB8", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.62rem", color: "#fff", fontWeight: 700, flexShrink: 0 }}>
                                                {t.pendingCount > 1 ? t.pendingCount : "!"}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer count */}
                    {!loading && filteredThreads.length > 0 && (
                        <div style={{ padding: "10px 14px", borderTop: "1px solid #f1f5f9", fontSize: "0.75rem", color: "#94a3b8" }}>
                            Showing {filteredThreads.length} of {totalCount} patient conversation{totalCount !== 1 ? "s" : ""}
                        </div>
                    )}
                </div>

                {/* ═══ CENTER: Chat View ═══ */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "#f8fafc" }}>
                    {loading ? (
                        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", flexDirection: "column", gap: 12 }}>
                            <div style={{ width: 36, height: 36, border: "3px solid #e2e8f0", borderTopColor: "#08AEB8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                            <span style={{ fontSize: "0.85rem" }}>Loading conversations...</span>
                        </div>
                    ) : !selectedThread ? (
                        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", flexDirection: "column", gap: 12 }}>
                            <i className="fa-regular fa-comments" style={{ fontSize: "3rem" }} />
                            <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>Select a patient conversation to view</span>
                            <span style={{ fontSize: "0.8rem" }}>{filteredThreads.length === 0 ? "No conversations available" : "Click a patient on the left"}</span>
                        </div>
                    ) : (
                        <>
                            {/* Chat Header */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", background: "#fff", borderBottom: "1px solid #f1f5f9", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <Avatar name={patientName} size={42} src={patient.profile_photo} />
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#0f172a" }}>{patientName}</div>
                                        <div style={{ fontSize: "0.76rem", color: "#64748b" }}>
                                            {patientAge ? `${patientAge} Years` : ""}
                                            {patient.gender ? `, ${patient.gender}` : ""}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ background: selectedThread.hasPending ? "rgba(245,158,11,0.1)" : "rgba(8,174,184,0.1)", color: selectedThread.hasPending ? "#f59e0b" : "#08AEB8", padding: "3px 12px", borderRadius: 20, fontSize: "0.76rem", fontWeight: 600 }}>
                                        {selectedThread.hasPending ? `Pending (${selectedThread.pendingCount})` : "All Answered"}
                                    </span>
                                </div>
                            </div>

                            {/* Messages Stream */}
                            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
                                {selectedThread.questions.map((q, idx) => {
                                    const prevQ = selectedThread.questions[idx - 1];
                                    const showDateHeader = !prevQ || chatDate(prevQ.created_at) !== chatDate(q.created_at);

                                    return (
                                        <React.Fragment key={q.id}>
                                            {/* Date divider */}
                                            {showDateHeader && (
                                                <div style={{ textAlign: "center", my: 4 }}>
                                                    <span style={{ background: "#e2e8f0", padding: "4px 16px", borderRadius: 20, fontSize: "0.75rem", color: "#64748b" }}>
                                                        {chatDate(q.created_at)}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Patient question */}
                                            <div style={{ display: "flex", gap: 10, maxWidth: "82%" }}>
                                                <Avatar name={patientName} size={32} src={patient.profile_photo} />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ background: "#fff", padding: "12px 16px", borderRadius: "0 16px 16px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", fontSize: "0.88rem", color: "#1e293b", lineHeight: 1.65, border: "1px solid #f1f5f9" }}>
                                                        {q.question_text}
                                                        {q.report_url && (
                                                            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
                                                                <a href={q.report_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#08AEB8", fontSize: "0.78rem", textDecoration: "none", fontWeight: 600, background: "rgba(8,174,184,0.08)", padding: "4px 10px", borderRadius: 6 }}>
                                                                    <i className="fa-solid fa-paperclip" /> View Attached Medical Report
                                                                </a>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: 4, display: "block" }}>{chatTime(q.created_at)}</span>
                                                </div>
                                            </div>

                                            {/* Doctor reply */}
                                            {q.answer_text && (
                                                <div style={{ display: "flex", flexDirection: "row-reverse", gap: 10, maxWidth: "82%", alignSelf: "flex-end" }}>
                                                    <Avatar name={doctor?.fullName || "Dr"} size={32} />
                                                    <div>
                                                        <div style={{ background: "linear-gradient(135deg,#082B68,#08AEB8)", padding: "12px 16px", borderRadius: "16px 0 16px 16px", fontSize: "0.88rem", color: "#fff", lineHeight: 1.65 }}>
                                                            {q.answer_text}
                                                        </div>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end", marginTop: 4 }}>
                                                            <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{chatTime(q.answered_at)}</span>
                                                            <i className="fa-solid fa-check-double" style={{ fontSize: "0.68rem", color: "#08AEB8" }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Pending hint for unanswered question */}
                                            {q.status === "pending" && !q.answer_text && (
                                                <div style={{ textAlign: "center", margin: "4px 0" }}>
                                                    <span style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b", padding: "5px 16px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 600 }}>
                                                        <i className="fa-solid fa-clock" style={{ marginRight: 5 }} />
                                                        Awaiting your reply to this question
                                                    </span>
                                                </div>
                                            )}
                                        </React.Fragment>
                                    );
                                })}

                                <div ref={msgEndRef} />
                            </div>

                            {/* Encryption notice */}
                            <div style={{ textAlign: "center", padding: "5px", fontSize: "0.72rem", color: "#94a3b8", background: "#fff", borderTop: "1px solid #f1f5f9" }}>
                                <i className="fa-solid fa-lock" style={{ marginRight: 4 }} />
                                This conversation is secured and encrypted
                            </div>

                            {/* Message Input */}
                            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#fff", borderTop: "1px solid #f1f5f9" }}>
                                <button style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid #e2e8f0", background: "transparent", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <i className="fa-regular fa-face-smile" />
                                </button>
                                <input
                                    type="text"
                                    placeholder={selectedThread.hasPending ? "Type your answer..." : "Add additional follow-up reply..."}
                                    value={replyText}
                                    onChange={e => setReplyText(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                                    style={{ flex: 1, padding: "10px 16px", border: "1px solid #e2e8f0", borderRadius: 24, fontSize: "0.85rem", outline: "none", color: "#334155", background: "#f8fafc", transition: "border 0.2s" }}
                                    onFocus={e => e.target.style.borderColor = "#08AEB8"}
                                    onBlur={e => e.target.style.borderColor = "#e2e8f0"}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={sending || !replyText.trim()}
                                    title="Send reply"
                                    style={{
                                        width: 40, height: 40, borderRadius: "50%", border: "none",
                                        background: replyText.trim() ? "linear-gradient(135deg,#082B68,#08AEB8)" : "#e2e8f0",
                                        cursor: replyText.trim() ? "pointer" : "not-allowed",
                                        color: replyText.trim() ? "#fff" : "#94a3b8",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        boxShadow: replyText.trim() ? "0 4px 12px rgba(8,174,184,0.3)" : "none",
                                        transition: "all 0.2s",
                                        flexShrink: 0,
                                    }}
                                >
                                    {sending
                                        ? <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "0.85rem" }} />
                                        : <i className="fa-solid fa-paper-plane" style={{ fontSize: "0.85rem" }} />
                                    }
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* ═══ RIGHT: Patient Details ═══ */}
                <div style={{ width: 280, flexShrink: 0, borderLeft: "1px solid #f1f5f9", background: "#fff", overflowY: "auto", display: "flex", flexDirection: "column" }}>
                    {selectedThread && !loading ? (
                        <div style={{ padding: "18px 16px", display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
                            {/* Patient Details */}
                            <section>
                                <h3 style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 7 }}>
                                    <i className="fa-solid fa-user-circle" style={{ color: "#08AEB8" }} /> Patient Details
                                </h3>
                                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, padding: "12px", background: "#f8fafc", borderRadius: 10, border: "1px solid #f1f5f9" }}>
                                    <Avatar name={patientName} size={46} src={patient.profile_photo} />
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a" }}>{patientName}</div>
                                        <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                            {patient.patient_code && (
                                                <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "1px 6px", borderRadius: 4, fontWeight: 700, fontSize: "0.7rem" }}>{patient.patient_code}</span>
                                            )}
                                            <span>
                                                {patientAge ? `${patientAge} Yrs` : ""}
                                                {patient.gender ? `, ${patient.gender}` : ""}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                                    {patient.blood_group && (
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.8rem", color: "#475569" }}>
                                            <i className="fa-solid fa-droplet" style={{ color: "#ef4444", width: 14 }} /> Blood Group: <strong style={{ color: "#1e293b" }}>{patient.blood_group}</strong>
                                        </div>
                                    )}
                                    {patientPhone && (
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.8rem", color: "#475569" }}>
                                            <i className="fa-solid fa-phone" style={{ color: "#08AEB8", width: 14 }} /> {patientPhone}
                                        </div>
                                    )}
                                    {patient.email && (
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.8rem", color: "#475569" }}>
                                            <i className="fa-solid fa-envelope" style={{ color: "#08AEB8", width: 14 }} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", wordBreak: "break-all" }}>{patient.email}</span>
                                        </div>
                                    )}
                                    {patient.created_at && (
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.8rem", color: "#475569" }}>
                                            <i className="fa-solid fa-calendar" style={{ color: "#08AEB8", width: 14 }} />
                                            Joined {new Date(patient.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                        </div>
                                    )}
                                    {patientLocation && (
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.8rem", color: "#475569" }}>
                                            <i className="fa-solid fa-location-dot" style={{ color: "#08AEB8", width: 14 }} /> {patientLocation}
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Attachments */}
                            {attachments.length > 0 && (
                                <section>
                                    <h3 style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 7 }}>
                                        <i className="fa-solid fa-paperclip" style={{ color: "#08AEB8" }} /> Attachments ({attachments.length})
                                    </h3>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        {attachments.map((attQ, i) => (
                                            <a key={attQ.id} href={attQ.report_url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, textDecoration: "none", color: "#334155", fontSize: "0.8rem", fontWeight: 600 }}>
                                                <i className="fa-solid fa-file-medical" style={{ color: "#08AEB8", fontSize: "1.2rem" }} />
                                                <div>
                                                    <div>Report #{i + 1}</div>
                                                    <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{chatDate(attQ.created_at)} • Click to open</div>
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Conversation Info */}
                            <section>
                                <h3 style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 7 }}>
                                    <i className="fa-solid fa-circle-info" style={{ color: "#08AEB8" }} /> Conversation Info
                                </h3>
                                <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "#f8fafc", padding: "12px", borderRadius: 10, border: "1px solid #f1f5f9", fontSize: "0.8rem" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ color: "#94a3b8" }}>Total Questions</span>
                                        <span style={{ fontWeight: 600, color: "#334155" }}>{selectedThread.questions.length}</span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span style={{ color: "#94a3b8" }}>Status</span>
                                        <span style={{
                                            background: !selectedThread.hasPending ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)",
                                            color: !selectedThread.hasPending ? "#10B981" : "#f59e0b",
                                            padding: "2px 10px", borderRadius: 12, fontSize: "0.72rem", fontWeight: 700
                                        }}>
                                            {!selectedThread.hasPending ? "All Answered" : `Pending (${selectedThread.pendingCount})`}
                                        </span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ color: "#94a3b8" }}>Latest Activity</span>
                                        <span style={{ fontWeight: 600, color: "#334155", fontSize: "0.72rem" }}>{chatDate(selectedThread.latestTime)}</span>
                                    </div>
                                </div>
                            </section>

                            {/* Archive Button */}
                            {selectedThread.hasPending && (
                                <button
                                    onClick={handleArchive}
                                    disabled={archiving}
                                    style={{
                                        width: "100%", padding: "11px", border: "2px solid rgba(239,68,68,0.25)", borderRadius: 10,
                                        background: "rgba(239,68,68,0.04)", color: "#ef4444", fontWeight: 700, cursor: archiving ? "not-allowed" : "pointer",
                                        fontSize: "0.83rem", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                        marginTop: "auto",
                                    }}
                                >
                                    {archiving
                                        ? <><i className="fa-solid fa-spinner fa-spin" /> Archiving...</>
                                        : <><i className="fa-solid fa-box-archive" /> Mark Thread as Answered</>
                                    }
                                </button>
                            )}
                        </div>
                    ) : !loading && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, color: "#94a3b8", gap: 10, padding: 24 }}>
                            <i className="fa-solid fa-user" style={{ fontSize: "2rem" }} />
                            <span style={{ fontSize: "0.82rem", textAlign: "center" }}>Select a conversation to see patient details</span>
                        </div>
                    )}
                </div>

            </div>
        </DashboardLayout>
    );
}
