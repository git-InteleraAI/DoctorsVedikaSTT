import { useParams, Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../../utils/apiConfig";

import "./QREducationVideos.css";


const API = getApiBaseUrl();

const TABS = [
    { key: "all", label: "All", icon: "fa-solid fa-layer-group" },
    { key: "video", label: "Videos", icon: "fa-solid fa-circle-play" },
    { key: "short", label: "Shorts", icon: "fa-solid fa-bolt" },
];

function isSafeVideoUrl(url) {
    if (!url) return false;

    try {
        const parsed = new URL(url);

        return (
            parsed.protocol === "https:" &&
            (
                parsed.hostname === "www.youtube.com" ||
                parsed.hostname === "youtube.com" ||
                parsed.hostname === "www.youtube-nocookie.com" ||
                parsed.hostname === "youtube-nocookie.com"
            ) &&
            parsed.pathname.startsWith("/embed/")
        );
    } catch {
        return false;
    }
}

function formatDuration(duration) {
    if (!duration) return "";

    // ISO duration: PT1H2M10S
    const match = String(duration).match(
        /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/
    );

    if (!match) return duration;

    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(
            seconds
        ).padStart(2, "0")}`;
    }

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getVideoThumbnail(video) {
    if (video?.thumbnailUrl) {
        return video.thumbnailUrl;
    }

    if (video?.externalId) {
        return `https://img.youtube.com/vi/${video.externalId}/hqdefault.jpg`;
    }

    return "";
}

export default function QREducationVideos() {
    const { hospitalCode, accessToken } = useParams();
    const [videos, setVideos] = useState([]);
    const [activeTab, setActiveTab] = useState("all");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedVideo, setSelectedVideo] = useState(null);

    useEffect(() => {
        let cancelled = false;

        const loadVideos = async () => {
            if (!accessToken) {
                setError("Educational session token is unavailable.");
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError("");

                const response = await axios.get(
                    `${API}/api/v1/public/qr/sessions/${encodeURIComponent(
                        accessToken
                    )}/education`
                );

                if (cancelled) return;

                if (!response.data?.success) {
                    throw new Error(
                        response.data?.message ||
                            "Unable to load health education."
                    );
                }

                const receivedVideos =
                    response.data?.data?.videos || [];

                setVideos(
                    Array.isArray(receivedVideos)
                        ? receivedVideos
                        : []
                );
            } catch (err) {
                if (cancelled) return;

                console.error(
                    "[QR Education] Failed to load videos:",
                    err
                );

                setError(
                    err.response?.data?.message ||
                        err.message ||
                        "Unable to load health education."
                );
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        loadVideos();

        return () => {
            cancelled = true;
        };
    }, [accessToken]);

    const filteredVideos = useMemo(() => {
        if (activeTab === "all") {
            return videos;
        }

        return videos.filter(
            (video) =>
                String(video?.contentType || "").toLowerCase() ===
                activeTab
        );
    }, [videos, activeTab]);

    const videoCount = videos.filter(
        (video) => video?.contentType === "video"
    ).length;

    const shortCount = videos.filter(
        (video) => video?.contentType === "short"
    ).length;

    if (loading) {
        return (
            <section className="qr-education-section">
                <Link
    to={`/qr/${encodeURIComponent(
        hospitalCode || ""
    )}/chat/${encodeURIComponent(
        accessToken || ""
    )}`}
    className="qr-education-back"
>
    <i className="fa-solid fa-arrow-left" />
    Back to Assessment
</Link>
                <div className="qr-education-header">
                    <div>
                        <span className="qr-education-eyebrow">
                            Health Education
                        </span>
                        <h3>Helpful Health Information</h3>
                    </div>
                </div>

                <div className="qr-education-loading">
                    <div className="qr-education-spinner" />
                    <p>Loading health education...</p>
                </div>
            </section>
        );
    }

    if (error) {
        return (
            <section className="qr-education-section">
                <div className="qr-education-header">
                    <div>
                        <span className="qr-education-eyebrow">
                            Health Education
                        </span>
                        <h3>Helpful Health Information</h3>
                    </div>
                </div>

                <div className="qr-education-error">
                    <div className="qr-education-error-icon">
                        <i className="fa-solid fa-circle-exclamation" />
                    </div>

                    <h4>Unable to load education</h4>

                    <p>{error}</p>

                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="qr-education-retry"
                    >
                        Try Again
                    </button>
                </div>
            </section>
        );
    }

    return (
        <section className="qr-education-section">
            {/* Header */}
            <div className="qr-education-header">
                <div>
                    <span className="qr-education-eyebrow">
                        Health Education
                    </span>

                    <h3>Learn More About Your Health</h3>

                    <p>
                        Explore doctor-curated health education videos
                        and Shorts while you wait.
                    </p>
                </div>

                <div className="qr-education-count">
                    <strong>{videos.length}</strong>
                    <span>Resources</span>
                </div>
            </div>

            {/* Disclaimer */}
            <div className="qr-education-disclaimer">
                <i className="fa-solid fa-circle-info" />

                <span>
                    These educational videos are provided for general
                    health awareness only. They do not replace a
                    medical consultation or emergency care.
                </span>
            </div>

            {/* Filters */}
            <div className="qr-education-tabs">
                {TABS.map((tab) => {
                    const count =
                        tab.key === "all"
                            ? videos.length
                            : tab.key === "video"
                            ? videoCount
                            : shortCount;

                    return (
                        <button
                            key={tab.key}
                            type="button"
                            className={`qr-education-tab ${
                                activeTab === tab.key
                                    ? "active"
                                    : ""
                            }`}
                            onClick={() =>
                                setActiveTab(tab.key)
                            }
                        >
                            <i className={tab.icon} />
                            <span>{tab.label}</span>
                            <b>{count}</b>
                        </button>
                    );
                })}
            </div>

            {/* Empty State */}
            {filteredVideos.length === 0 ? (
                <div className="qr-education-empty">
                    <div className="qr-education-empty-icon">
                        <i className="fa-solid fa-video-slash" />
                    </div>

                    <h4>No educational videos available</h4>

                    <p>
                        There are currently no active health education
                        resources in this category.
                    </p>
                </div>
            ) : (
                <div className="qr-education-grid">
                    {filteredVideos.map((video) => {
                        const safeUrl = isSafeVideoUrl(
                            video?.videoUrl
                        );

                        return (
                            <article
                                key={
                                    video.id ||
                                    video.externalId
                                }
                                className="qr-education-card"
                            >
                                <div className="qr-education-thumbnail">
                                    {getVideoThumbnail(video) ? (
                                        <img
                                            src={getVideoThumbnail(
                                                video
                                            )}
                                            alt={
                                                video.title ||
                                                "Health education video"
                                            }
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="qr-education-thumbnail-fallback">
                                            <i className="fa-solid fa-heart-pulse" />
                                        </div>
                                    )}

                                    <span className="qr-education-platform">
                                        <i className="fa-brands fa-youtube" />
                                        YouTube
                                    </span>

                                    {video.contentType ===
                                        "short" && (
                                        <span className="qr-education-short-badge">
                                            SHORT
                                        </span>
                                    )}

                                    {video.duration && (
                                        <span className="qr-education-duration">
                                            {formatDuration(
                                                video.duration
                                            )}
                                        </span>
                                    )}
                                </div>

                                <div className="qr-education-card-body">
                                    <h4 title={video.title}>
                                        {video.title ||
                                            "Health Education"}
                                    </h4>

                                    {video.description && (
                                        <p>
                                            {video.description}
                                        </p>
                                    )}

                                    <div className="qr-education-card-footer">
                                        <span>
                                            <i className="fa-solid fa-shield-heart" />
                                            Health Education
                                        </span>

                                        {safeUrl && (
                                            <button
                                                type="button"
                                                className="qr-education-watch-btn"
                                                onClick={() =>
                                                    setSelectedVideo(
                                                        video
                                                    )
                                                }
                                            >
                                                Watch
                                                <i className="fa-solid fa-arrow-right" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}

            {/* Video Modal */}
            {selectedVideo &&
                isSafeVideoUrl(selectedVideo.videoUrl) && (
                    <div
                        className="qr-education-modal-backdrop"
                        onClick={() =>
                            setSelectedVideo(null)
                        }
                    >
                        <div
                            className="qr-education-modal"
                            onClick={(event) =>
                                event.stopPropagation()
                            }
                        >
                            <div className="qr-education-modal-header">
                                <div>
                                    <span>
                                        Health Education
                                    </span>

                                    <h3>
                                        {selectedVideo.title ||
                                            "Health Education"}
                                    </h3>
                                </div>

                                <button
                                    type="button"
                                    onClick={() =>
                                        setSelectedVideo(null)
                                    }
                                    aria-label="Close video"
                                >
                                    <i className="fa-solid fa-xmark" />
                                </button>
                            </div>

                            <div className="qr-education-video-frame">
                                <iframe
                                    src={selectedVideo.videoUrl}
                                    title={
                                        selectedVideo.title ||
                                        "Health education video"
                                    }
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen
                                />
                            </div>

                            <div className="qr-education-modal-footer">
                                <span>
                                    General health awareness
                                    content
                                </span>
                            </div>
                        </div>
                    </div>
                )}
        </section>
    );
}