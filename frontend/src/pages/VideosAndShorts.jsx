import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import "../index.css";

const API = import.meta.env.VITE_NODE_API_URL;


// Utility to format relative time
function timeAgo(dateStr) {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    const weeks = Math.floor(days / 7);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
    if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
    return `${weeks} week${weeks !== 1 ? "s" : ""} ago`;
}

function formatViews(n) {
    if (!n) return "0";
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(n);
}

/* ──────────────────────────────────────────
   SEED / FALLBACK DATA (mirrors controller)
────────────────────────────────────────── */
const SEED_VIDEOS = [
    { id: "v-001", platform: "youtube", content_type: "video", external_id: "dQw4w9WgXcQ", title: "Understanding Heart Health & Prevention", thumbnail_url: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&auto=format&fit=crop&q=80", video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ", duration: "12:45", views_count: 12400, doctor_name: "Dr. Rohan Verma", category: "Cardiology", is_verified: true, published_at: new Date(Date.now() - 2 * 86400000).toISOString() },
    { id: "v-002", platform: "youtube", content_type: "video", external_id: "3JZ_D3ELwOQ", title: "Hypertension Explained Simply by Dr. Rohan Verma", thumbnail_url: "https://images.unsplash.com/photo-1581594693702-fbdc51b2763b?w=600&auto=format&fit=crop&q=80", video_url: "https://www.youtube.com/embed/3JZ_D3ELwOQ", duration: "10:32", views_count: 8500, doctor_name: "Dr. Rohan Verma", category: "Cardiology", is_verified: true, published_at: new Date(Date.now() - 5 * 86400000).toISOString() },
    { id: "v-003", platform: "youtube", content_type: "video", external_id: "L_LUpnjgPso", title: "ECG Basics For Medical Students & Practitioners", thumbnail_url: "https://images.unsplash.com/photo-1516549655169-df83a0774514?w=600&auto=format&fit=crop&q=80", video_url: "https://www.youtube.com/embed/L_LUpnjgPso", duration: "8:15", views_count: 15000, doctor_name: "MedEdu Hub", category: "Diagnostics", is_verified: true, published_at: new Date(Date.now() - 7 * 86400000).toISOString() },
    { id: "v-004", platform: "youtube", content_type: "video", external_id: "fJ9rUzIMcZQ", title: "Diabetes Management Tips for a Better Life", thumbnail_url: "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=600&auto=format&fit=crop&q=80", video_url: "https://www.youtube.com/embed/fJ9rUzIMcZQ", duration: "9:20", views_count: 9200, doctor_name: "Dr. Neha Kapoor", category: "General Medicine", is_verified: true, published_at: new Date(Date.now() - 7 * 86400000).toISOString() },
    { id: "v-005", platform: "youtube", content_type: "video", external_id: "tgbNymZ7vqY", title: "Mental Health & Well-being – Tips by Experts", thumbnail_url: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&auto=format&fit=crop&q=80", video_url: "https://www.youtube.com/embed/tgbNymZ7vqY", duration: "11:18", views_count: 6100, doctor_name: "Mind & Medicine", category: "Health Tips", is_verified: true, published_at: new Date(Date.now() - 8 * 86400000).toISOString() },
];
const SEED_YT_SHORTS = [
    { id: "s-001", platform: "youtube", content_type: "short", title: "3 Signs of Heart Problem You Shouldn't Ignore", thumbnail_url: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=400&auto=format&fit=crop&q=80", video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ", duration: "0:58", views_count: 45000, doctor_name: "Dr. Rohan Verma", is_verified: true, published_at: new Date(Date.now() - 86400000).toISOString() },
    { id: "s-002", platform: "youtube", content_type: "short", title: "Brain Health Tips for Better Life", thumbnail_url: "https://images.unsplash.com/photo-1559757175-5700dde675bc?w=400&auto=format&fit=crop&q=80", video_url: "https://www.youtube.com/embed/3JZ_D3ELwOQ", duration: "0:45", views_count: 32000, doctor_name: "Dr. Priya Sharma", is_verified: true, published_at: new Date(Date.now() - 3 * 86400000).toISOString() },
    { id: "s-003", platform: "youtube", content_type: "short", title: "How to Control Blood Pressure Naturally", thumbnail_url: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400&auto=format&fit=crop&q=80", video_url: "https://www.youtube.com/embed/L_LUpnjgPso", duration: "0:52", views_count: 58000, doctor_name: "Dr. Ananya Ray", is_verified: true, published_at: new Date(Date.now() - 4 * 86400000).toISOString() },
    { id: "s-004", platform: "youtube", content_type: "short", title: "Superfoods for a Strong Heart", thumbnail_url: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=400&auto=format&fit=crop&q=80", video_url: "https://www.youtube.com/embed/fJ9rUzIMcZQ", duration: "0:40", views_count: 27000, doctor_name: "HealthEdu Short", is_verified: true, published_at: new Date(Date.now() - 5 * 86400000).toISOString() },
    { id: "s-005", platform: "youtube", content_type: "short", title: "Stress Management in 60 Seconds", thumbnail_url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&auto=format&fit=crop&q=80", video_url: "https://www.youtube.com/embed/tgbNymZ7vqY", duration: "0:47", views_count: 19000, doctor_name: "Dr. Vikram Seth", is_verified: true, published_at: new Date(Date.now() - 6 * 86400000).toISOString() },
    { id: "s-006", platform: "youtube", content_type: "short", title: "Better Sleep Better Health", thumbnail_url: "https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=400&auto=format&fit=crop&q=80", video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ", duration: "0:50", views_count: 39000, doctor_name: "Sleep Science Hub", is_verified: true, published_at: new Date(Date.now() - 6 * 86400000).toISOString() },
];
const SEED_IG_SHORTS = [
    { id: "ig-001", platform: "instagram", content_type: "short", title: "Healthy Heart Habits", thumbnail_url: "https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?w=400&auto=format&fit=crop&q=80", video_url: "https://www.youtube.com/embed/3JZ_D3ELwOQ", duration: "0:30", views_count: 88000, doctor_name: "Dr. Rohan Verma", is_verified: true, published_at: new Date(Date.now() - 86400000).toISOString() },
    { id: "ig-002", platform: "instagram", content_type: "short", title: "Quick Health Tips", thumbnail_url: "https://images.unsplash.com/photo-1594824813571-24a69c100d37?w=400&auto=format&fit=crop&q=80", video_url: "https://www.youtube.com/embed/L_LUpnjgPso", duration: "0:45", views_count: 64000, doctor_name: "Dr. Ananya Ray", is_verified: true, published_at: new Date(Date.now() - 2 * 86400000).toISOString() },
    { id: "ig-003", platform: "instagram", content_type: "short", title: "Doctor's Tip of the Day", thumbnail_url: "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=400&auto=format&fit=crop&q=80", video_url: "https://www.youtube.com/embed/fJ9rUzIMcZQ", duration: "0:40", views_count: 91000, doctor_name: "Dr. Neha Kapoor", is_verified: true, published_at: new Date(Date.now() - 3 * 86400000).toISOString() },
    { id: "ig-004", platform: "instagram", content_type: "short", title: "Stay Hydrated Stay Healthy", thumbnail_url: "https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=400&auto=format&fit=crop&q=80", video_url: "https://www.youtube.com/embed/tgbNymZ7vqY", duration: "0:35", views_count: 52000, doctor_name: "Wellness Daily", is_verified: true, published_at: new Date(Date.now() - 4 * 86400000).toISOString() },
    { id: "ig-005", platform: "instagram", content_type: "short", title: "Daily Stretch for Good Posture", thumbnail_url: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&auto=format&fit=crop&q=80", video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ", duration: "0:50", views_count: 73000, doctor_name: "PhysioCare Clinic", is_verified: true, published_at: new Date(Date.now() - 5 * 86400000).toISOString() },
    { id: "ig-006", platform: "instagram", content_type: "short", title: "Wellness Starts Within", thumbnail_url: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&auto=format&fit=crop&q=80", video_url: "https://www.youtube.com/embed/3JZ_D3ELwOQ", duration: "0:45", views_count: 41000, doctor_name: "Dr. Harshini Jakki", is_verified: true, published_at: new Date(Date.now() - 5 * 86400000).toISOString() },
];

const CATEGORIES = ["All Categories", "Cardiology", "General Medicine", "Surgery", "Pediatrics", "Neurology", "Health Tips", "Diagnostics"];
const PLATFORM_TABS = [
    { key: "youtube-video", label: "YouTube Videos", icon: "fa-brands fa-youtube", color: "#FF0000" },
    { key: "youtube-short", label: "YouTube Shorts", icon: "fa-brands fa-youtube", color: "#FF0000" },
    { key: "instagram-short", label: "Instagram Shorts", icon: "fa-brands fa-instagram", color: "#E1306C" },
];

/* ──────────────────────────────────────────
   VIDEO PLAYER MODAL
────────────────────────────────────────── */
function VideoModal({ video, onClose }) {
    useEffect(() => {
        const handler = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    if (!video) return null;
    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed", inset: 0, zIndex: 9999,
                background: "rgba(0,0,0,0.82)",
                backdropFilter: "blur(8px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                animation: "fadeIn 0.2s ease",
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: "#0d1117",
                    borderRadius: "20px",
                    overflow: "hidden",
                    width: "min(880px, 95vw)",
                    boxShadow: "0 40px 100px rgba(0,0,0,0.6)",
                    animation: "slideUp 0.25s ease",
                    border: "1px solid rgba(255,255,255,0.08)",
                }}
            >
                {/* Modal Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: "1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{video.title}</div>
                        <div style={{ color: "#9ca3af", fontSize: "0.82rem", marginTop: 3 }}>{video.doctor_name} {video.is_verified && "✓"}</div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", width: 36, height: 36, borderRadius: "50%", cursor: "pointer", fontSize: "1rem", flexShrink: 0, marginLeft: 12, display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                        <i className="fa-solid fa-xmark" />
                    </button>
                </div>
                {/* Embed */}
                <div style={{ aspectRatio: video.content_type === "short" ? "9/16" : "16/9", maxHeight: "70vh", background: "#000" }}>
                    <iframe
                        src={`${video.video_url}?autoplay=1&rel=0`}
                        title={video.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        style={{ width: "100%", height: "100%", border: "none" }}
                    />
                </div>
                {/* Footer */}
                <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ background: "#1a1f2e", color: "#9ca3af", fontSize: "0.8rem", padding: "4px 10px", borderRadius: 20 }}>
                        <i className="fa-solid fa-eye" style={{ marginRight: 5 }} />{formatViews(video.views_count)} views
                    </span>
                    <span style={{ background: "#1a1f2e", color: "#9ca3af", fontSize: "0.8rem", padding: "4px 10px", borderRadius: 20 }}>
                        <i className="fa-solid fa-clock" style={{ marginRight: 5 }} />{video.duration}
                    </span>
                    <span style={{ background: "#1a1f2e", color: "#9ca3af", fontSize: "0.8rem", padding: "4px 10px", borderRadius: 20 }}>
                        {timeAgo(video.published_at)}
                    </span>
                </div>
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────
   YOUTUBE VIDEO CARD (16:9 horizontal)
────────────────────────────────────────── */
function VideoCard({ video, onClick }) {
    const [hovered, setHovered] = useState(false);
    return (
        <div
            onClick={() => onClick(video)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                borderRadius: 14,
                overflow: "hidden",
                cursor: "pointer",
                background: "#fff",
                boxShadow: hovered ? "0 12px 40px rgba(8,43,104,0.14)" : "0 4px 12px rgba(0,0,0,0.06)",
                transition: "all 0.25s ease",
                transform: hovered ? "translateY(-4px)" : "translateY(0)",
                border: "1px solid #f1f5f9",
                minWidth: 0,
            }}
        >
            {/* Thumbnail */}
            <div style={{ position: "relative", aspectRatio: "16/9", background: "#e2e8f0", overflow: "hidden" }}>
                <img
                    src={video.thumbnail_url}
                    alt={video.title}
                    style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.4s ease", transform: hovered ? "scale(1.05)" : "scale(1)" }}
                    onError={(e) => { e.target.src = `https://img.youtube.com/vi/${video.external_id}/hqdefault.jpg`; }}
                />
                {/* Play Overlay */}
                <div style={{
                    position: "absolute", inset: 0,
                    background: "rgba(0,0,0,0.35)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    opacity: hovered ? 1 : 0, transition: "opacity 0.2s ease",
                }}>
                    <div style={{ width: 50, height: 50, background: "rgba(255,255,255,0.95)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
                        <i className="fa-solid fa-play" style={{ color: "#FF0000", fontSize: "1.2rem", marginLeft: 4 }} />
                    </div>
                </div>
                {/* Duration Badge */}
                <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.8)", color: "#fff", fontSize: "0.75rem", padding: "2px 7px", borderRadius: 6, fontWeight: 600, letterSpacing: "0.02em" }}>
                    {video.duration}
                </div>
            </div>
            {/* Info */}
            <div style={{ padding: "12px 14px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", marginBottom: 8 }}>
                    {video.title}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg, #082B68, #08AEB8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <i className="fa-solid fa-user-doctor" style={{ color: "#fff", fontSize: "0.65rem" }} />
                    </div>
                    <span style={{ fontSize: "0.8rem", color: "#374151", fontWeight: 600 }}>{video.doctor_name || "Medical Expert"}</span>
                    {video.is_verified && <i className="fa-solid fa-circle-check" style={{ color: "#08AEB8", fontSize: "0.72rem" }} />}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                    {formatViews(video.views_count)} views • {timeAgo(video.published_at)}
                </div>
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────
   YOUTUBE SHORT CARD (portrait 9:16)
────────────────────────────────────────── */
function ShortCard({ video, onClick }) {
    const [hovered, setHovered] = useState(false);
    return (
        <div
            onClick={() => onClick(video)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                borderRadius: 14,
                overflow: "hidden",
                cursor: "pointer",
                position: "relative",
                aspectRatio: "9/16",
                background: "#111",
                boxShadow: hovered ? "0 16px 40px rgba(0,0,0,0.25)" : "0 4px 14px rgba(0,0,0,0.12)",
                transition: "all 0.25s ease",
                transform: hovered ? "translateY(-4px) scale(1.02)" : "translateY(0) scale(1)",
                minWidth: 0,
            }}
        >
            <img
                src={video.thumbnail_url}
                alt={video.title}
                style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }}
            />
            {/* Gradient overlay */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.85) 40%, transparent 70%)" }} />
            {/* Duration */}
            <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.75)", color: "#fff", fontSize: "0.72rem", padding: "2px 7px", borderRadius: 6, fontWeight: 700 }}>
                {video.duration}
            </div>
            {/* Play icon overlay on hover */}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: hovered ? 1 : 0, transition: "opacity 0.2s" }}>
                <div style={{ width: 44, height: 44, background: "rgba(255,255,255,0.9)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="fa-solid fa-play" style={{ color: "#FF0000", fontSize: "1.1rem", marginLeft: 3 }} />
                </div>
            </div>
            {/* Bottom content */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 12px 14px" }}>
                <div style={{ color: "#fff", fontSize: "0.82rem", fontWeight: 700, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
                    {video.title}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
                    <span style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.72rem" }}>{video.doctor_name}</span>
                    {video.is_verified && <i className="fa-solid fa-circle-check" style={{ color: "#08AEB8", fontSize: "0.65rem" }} />}
                </div>
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.68rem", marginTop: 2 }}>
                    {formatViews(video.views_count)} views
                </div>
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────
   INSTAGRAM SHORT CARD (soft portrait)
────────────────────────────────────────── */
const IG_GRADIENT_STYLES = [
    { bg: "linear-gradient(135deg, #fde68a, #fbbf24)" },
    { bg: "linear-gradient(135deg, #bfdbfe, #60a5fa)" },
    { bg: "linear-gradient(135deg, #bbf7d0, #34d399)" },
    { bg: "linear-gradient(135deg, #fbcfe8, #f472b6)" },
    { bg: "linear-gradient(135deg, #ddd6fe, #a78bfa)" },
    { bg: "linear-gradient(135deg, #fed7aa, #fb923c)" },
];

function InstagramCard({ video, index, onClick }) {
    const [hovered, setHovered] = useState(false);
    const gradStyle = IG_GRADIENT_STYLES[index % IG_GRADIENT_STYLES.length];
    return (
        <div
            onClick={() => onClick(video)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                borderRadius: 16,
                overflow: "hidden",
                cursor: "pointer",
                position: "relative",
                aspectRatio: "3/4",
                background: gradStyle.bg,
                boxShadow: hovered ? "0 16px 36px rgba(0,0,0,0.18)" : "0 4px 14px rgba(0,0,0,0.08)",
                transition: "all 0.25s ease",
                transform: hovered ? "translateY(-4px) scale(1.02)" : "translateY(0) scale(1)",
                minWidth: 0,
            }}
        >
            <img
                src={video.thumbnail_url}
                alt={video.title}
                style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0, opacity: 0.75 }}
            />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.65) 45%, transparent 70%)" }} />

            {/* Instagram icon */}
            <div style={{ position: "absolute", top: 10, right: 10 }}>
                <i className="fa-brands fa-instagram" style={{ color: "#fff", fontSize: "1.1rem", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }} />
            </div>

            {/* Duration badge */}
            <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: "0.72rem", padding: "2px 7px", borderRadius: 6, fontWeight: 700 }}>
                {video.duration}
            </div>

            {/* Play overlay */}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: hovered ? 1 : 0, transition: "opacity 0.2s" }}>
                <div style={{ width: 42, height: 42, background: "rgba(255,255,255,0.92)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="fa-solid fa-play" style={{ color: "#E1306C", fontSize: "1rem", marginLeft: 3 }} />
                </div>
            </div>

            {/* Bottom content */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 12px 14px" }}>
                <div style={{ color: "#fff", fontSize: "0.85rem", fontWeight: 700, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {video.title}
                </div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.72rem", marginTop: 4 }}>
                    {video.doctor_name}
                </div>
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────
   HORIZONTAL SCROLL SECTION
────────────────────────────────────────── */
function VideoSection({ title, icon, iconColor, items, type, onVideoClick, onViewAll }) {
    const scrollRef = React.useRef(null);

    const scroll = (dir) => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({ left: dir * 280, behavior: "smooth" });
        }
    };

    if (!items || items.length === 0) return null;

    return (
        <div style={{ marginBottom: 40 }}>
            {/* Section Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: type === "instagram" ? "linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)" : "linear-gradient(135deg,#FF0000,#cc0000)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <i className={icon} style={{ color: "#fff", fontSize: "0.9rem" }} />
                    </div>
                    <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#0f172a" }}>{title}</h2>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button onClick={onViewAll} style={{ background: "none", border: "none", color: "#08AEB8", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                        View all <i className="fa-solid fa-chevron-right" style={{ fontSize: "0.7rem" }} />
                    </button>
                    <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => scroll(-1)} style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                            <i className="fa-solid fa-chevron-left" style={{ fontSize: "0.75rem" }} />
                        </button>
                        <button onClick={() => scroll(1)} style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                            <i className="fa-solid fa-chevron-right" style={{ fontSize: "0.75rem" }} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Scrollable Row */}
            <div
                ref={scrollRef}
                style={{
                    display: "grid",
                    gridAutoFlow: "column",
                    gridAutoColumns: type === "video" ? "minmax(220px, 260px)" : "minmax(130px, 160px)",
                    gap: type === "video" ? 16 : 12,
                    overflowX: "auto",
                    scrollbarWidth: "none",
                    msOverflowStyle: "none",
                    paddingBottom: 4,
                }}
            >
                {items.map((video, idx) =>
                    type === "video" ? (
                        <VideoCard key={video.id || idx} video={video} onClick={onVideoClick} />
                    ) : type === "short" ? (
                        <ShortCard key={video.id || idx} video={video} onClick={onVideoClick} />
                    ) : (
                        <InstagramCard key={video.id || idx} video={video} index={idx} onClick={onVideoClick} />
                    )
                )}
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────
   MAIN PAGE
────────────────────────────────────────── */
export default function VideosAndShorts() {
    const navigate = useNavigate();
    const { doctor } = useAuth();

    const [activeTab, setActiveTab] = useState("all"); // all | youtube-video | youtube-short | instagram-short
    const [activeCategory, setActiveCategory] = useState("All Categories");
    const [searchQuery, setSearchQuery] = useState("");
    const [ytVideos, setYtVideos] = useState(SEED_VIDEOS);
    const [ytShorts, setYtShorts] = useState(SEED_YT_SHORTS);
    const [igShorts, setIgShorts] = useState(SEED_IG_SHORTS);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [loading, setLoading] = useState(true);
    const loadVideos = useCallback(async () => {
        try {
            const token = localStorage.getItem("doctors_vedika_token");
            const res = await axios.get(`${API}/api/educational-videos`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    category: activeCategory !== "All Categories" ? activeCategory : undefined,
                    search: searchQuery || undefined,
                },
            });
            if (res.data?.youtubeVideos) setYtVideos(res.data.youtubeVideos.length ? res.data.youtubeVideos : SEED_VIDEOS);
            if (res.data?.youtubeShorts) setYtShorts(res.data.youtubeShorts.length ? res.data.youtubeShorts : SEED_YT_SHORTS);
            if (res.data?.instagramShorts) setIgShorts(res.data.instagramShorts.length ? res.data.instagramShorts : SEED_IG_SHORTS);
        } catch {
            // fall back to seed data silently
        } finally {
            setLoading(false);
        }
    }, [activeCategory, searchQuery]);

    useEffect(() => {
        const delay = setTimeout(() => loadVideos(), 300);
        return () => clearTimeout(delay);
    }, [loadVideos]);

    const showYTVideos = activeTab === "all" || activeTab === "youtube-video";
    const showYTShorts = activeTab === "all" || activeTab === "youtube-short";
    const showIGShorts = activeTab === "all" || activeTab === "instagram-short";

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
                * { box-sizing: border-box; }
                body { font-family: 'Inter', sans-serif; margin: 0; }
                .vns-tabs-bar { display: flex; gap: 4px; padding: 4px; background: #f1f5f9; border-radius: 14px; margin-bottom: 20px; }
                .vns-tab { flex: 1; padding: 10px 14px; border: none; background: none; border-radius: 10px; cursor: pointer; font-size: 0.85rem; font-weight: 600; color: #64748b; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s; white-space: nowrap; }
                .vns-tab.active { background: #fff; color: #0f172a; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                .vns-tab:hover:not(.active) { background: rgba(255,255,255,0.6); color: #0f172a; }
                .cat-pill { padding: 7px 16px; border-radius: 24px; border: 1.5px solid #e2e8f0; background: #fff; color: #64748b; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
                .cat-pill.active { background: #082B68; color: #fff; border-color: #082B68; }
                .cat-pill:hover:not(.active) { border-color: #08AEB8; color: #08AEB8; }
                ::-webkit-scrollbar { width: 0; height: 0; }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>

            <DashboardLayout
                activePage="videos"
                searchPlaceholder="Search videos, topics, doctors..."
                searchValue={searchQuery}
                onSearchChange={(e) => setSearchQuery(e.target.value)}
            >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: "1.8rem", fontWeight: 900, color: "#0f172a" }}>Videos & Shorts</h1>
                        <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: "0.95rem" }}>Stay updated with medical knowledge from top experts</p>
                    </div>
                    <button
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", border: "1.5px solid #e2e8f0", background: "#fff", borderRadius: 50, cursor: "pointer", fontWeight: 700, fontSize: "0.85rem", color: "#0f172a" }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = "#08AEB8"}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "#e2e8f0"}
                    >
                        <i className="fa-regular fa-bookmark" style={{ color: "#08AEB8" }} /> My Watchlist
                    </button>
                </div>

                <div className="vns-tabs-bar">
                    <button className={`vns-tab${activeTab === "all" ? " active" : ""}`} onClick={() => setActiveTab("all")}><i className="fa-solid fa-grip" /> All</button>
                    <button className={`vns-tab${activeTab === "youtube-video" ? " active" : ""}`} onClick={() => setActiveTab("youtube-video")}><i className="fa-brands fa-youtube" style={{ color: activeTab === "youtube-video" ? "#FF0000" : undefined }} /> YouTube Videos</button>
                    <button className={`vns-tab${activeTab === "youtube-short" ? " active" : ""}`} onClick={() => setActiveTab("youtube-short")}><i className="fa-brands fa-youtube" style={{ color: activeTab === "youtube-short" ? "#FF0000" : undefined }} /> YouTube Shorts</button>
                    <button className={`vns-tab${activeTab === "instagram-short" ? " active" : ""}`} onClick={() => setActiveTab("instagram-short")}><i className="fa-brands fa-instagram" style={{ color: activeTab === "instagram-short" ? "#E1306C" : undefined }} /> Instagram Shorts</button>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 32, alignItems: "center" }}>
                    {CATEGORIES.map(cat => (
                        <button key={cat} className={`cat-pill${activeCategory === cat ? " active" : ""}`} onClick={() => setActiveCategory(cat)}>{cat}</button>
                    ))}
                    <button style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 24, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}>
                        <i className="fa-solid fa-sliders" /> Filter
                    </button>
                </div>

                {loading ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "center", justifyContent: "center", minHeight: 300, color: "#94a3b8" }}>
                        <div style={{ width: 50, height: 50, border: "4px solid #e2e8f0", borderTopColor: "#08AEB8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                        <p style={{ margin: 0, fontWeight: 600 }}>Loading videos...</p>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                ) : (
                    <>
                        {showYTVideos && <VideoSection title="YouTube Videos" icon="fa-brands fa-youtube" iconColor="#FF0000" items={ytVideos} type="video" onVideoClick={setSelectedVideo} onViewAll={() => setActiveTab("youtube-video")} />}
                        {showYTShorts && <VideoSection title="YouTube Shorts" icon="fa-brands fa-youtube" iconColor="#FF0000" items={ytShorts} type="short" onVideoClick={setSelectedVideo} onViewAll={() => setActiveTab("youtube-short")} />}
                        {showIGShorts && <VideoSection title="Instagram Shorts" icon="fa-brands fa-instagram" iconColor="#E1306C" items={igShorts} type="instagram" onVideoClick={setSelectedVideo} onViewAll={() => setActiveTab("instagram-short")} />}
                    </>
                )}
            </DashboardLayout>

            {selectedVideo && <VideoModal video={selectedVideo} onClose={() => setSelectedVideo(null)} />}
        </>
    );
}
