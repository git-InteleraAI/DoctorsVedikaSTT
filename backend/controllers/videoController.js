const { supabase, isSupabaseConfigured } = require("../config/supabase");

// Fallback seed videos if Supabase table is not yet populated
const SAMPLE_VIDEOS = [
    // --- YOUTUBE VIDEOS (16:9) ---
    {
        id: "v-001",
        platform: "youtube",
        content_type: "video",
        external_id: "dQw4w9WgXcQ",
        title: "Understanding Heart Health & Prevention",
        description: "Comprehensive guide on cardiovascular wellness, preventative measures, and early warning signs.",
        thumbnail_url: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&auto=format&fit=crop&q=80",
        video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        duration: "12:45",
        views_count: 12400,
        doctor_name: "Dr. Rohan Verma",
        category: "Cardiology",
        is_verified: true,
        published_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "v-002",
        platform: "youtube",
        content_type: "video",
        external_id: "3JZ_D3ELwOQ",
        title: "Hypertension Explained Simply by Dr. Rohan Verma",
        description: "Everything you need to know about high blood pressure management and lifestyle adjustments.",
        thumbnail_url: "https://images.unsplash.com/photo-1581594693702-fbdc51b2763b?w=600&auto=format&fit=crop&q=80",
        video_url: "https://www.youtube.com/embed/3JZ_D3ELwOQ",
        duration: "10:32",
        views_count: 8500,
        doctor_name: "Dr. Rohan Verma",
        category: "Cardiology",
        is_verified: true,
        published_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "v-003",
        platform: "youtube",
        content_type: "video",
        external_id: "L_LUpnjgPso",
        title: "ECG Basics For Medical Students & Practitioners",
        description: "Step-by-step ECG interpretation guide for medical residents and clinical professionals.",
        thumbnail_url: "https://images.unsplash.com/photo-1516549655169-df83a0774514?w=600&auto=format&fit=crop&q=80",
        video_url: "https://www.youtube.com/embed/L_LUpnjgPso",
        duration: "8:15",
        views_count: 15000,
        doctor_name: "MedEdu Hub",
        category: "Diagnostics",
        is_verified: true,
        published_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "v-004",
        platform: "youtube",
        content_type: "video",
        external_id: "fJ9rUzIMcZQ",
        title: "Diabetes Management Tips for a Better Life",
        description: "Clinical guidelines on HbA1c control, dietary intervention, and insulin management.",
        thumbnail_url: "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=600&auto=format&fit=crop&q=80",
        video_url: "https://www.youtube.com/embed/fJ9rUzIMcZQ",
        duration: "9:20",
        views_count: 9200,
        doctor_name: "Dr. Neha Kapoor",
        category: "General Medicine",
        is_verified: true,
        published_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "v-005",
        platform: "youtube",
        content_type: "video",
        external_id: "tgbNymZ7vqY",
        title: "Mental Health & Well-being – Tips by Experts",
        description: "Addressing stress, burnout, and mental wellness techniques for healthcare professionals.",
        thumbnail_url: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&auto=format&fit=crop&q=80",
        video_url: "https://www.youtube.com/embed/tgbNymZ7vqY",
        duration: "11:18",
        views_count: 6100,
        doctor_name: "Mind & Medicine",
        category: "Health Tips",
        is_verified: true,
        published_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    },

    // --- YOUTUBE SHORTS (9:16) ---
    {
        id: "s-001",
        platform: "youtube",
        content_type: "short",
        external_id: "short-001",
        title: "3 Signs of Heart Problem You Shouldn't Ignore",
        description: "Quick 60-second summary on subtle cardiac warning symptoms.",
        thumbnail_url: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=400&auto=format&fit=crop&q=80",
        video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        duration: "0:58",
        views_count: 45000,
        doctor_name: "Dr. Rohan Verma",
        category: "Cardiology",
        is_verified: true,
        published_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "s-002",
        platform: "youtube",
        content_type: "short",
        external_id: "short-002",
        title: "Brain Health Tips for Better Life",
        description: "Simple cognitive exercises and sleep habits for neuro health.",
        thumbnail_url: "https://images.unsplash.com/photo-1559757175-5700dde675bc?w=400&auto=format&fit=crop&q=80",
        video_url: "https://www.youtube.com/embed/3JZ_D3ELwOQ",
        duration: "0:45",
        views_count: 32000,
        doctor_name: "Dr. Priya Sharma",
        category: "Neurology",
        is_verified: true,
        published_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "s-003",
        platform: "youtube",
        content_type: "short",
        external_id: "short-003",
        title: "How to Control Blood Pressure Naturally",
        description: "Dietary sodium reduction and breathing exercises.",
        thumbnail_url: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400&auto=format&fit=crop&q=80",
        video_url: "https://www.youtube.com/embed/L_LUpnjgPso",
        duration: "0:52",
        views_count: 58000,
        doctor_name: "Dr. Ananya Ray",
        category: "Cardiology",
        is_verified: true,
        published_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "s-004",
        platform: "youtube",
        content_type: "short",
        external_id: "short-004",
        title: "Superfoods for a Strong Heart",
        description: "Top 5 antioxidant-rich foods for arterial health.",
        thumbnail_url: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=400&auto=format&fit=crop&q=80",
        video_url: "https://www.youtube.com/embed/fJ9rUzIMcZQ",
        duration: "0:40",
        views_count: 27000,
        doctor_name: "HealthEdu Short",
        category: "Health Tips",
        is_verified: true,
        published_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "s-005",
        platform: "youtube",
        content_type: "short",
        external_id: "short-005",
        title: "Stress Management in 60 Seconds",
        description: "4-7-8 breathing technique for high pressure work environments.",
        thumbnail_url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&auto=format&fit=crop&q=80",
        video_url: "https://www.youtube.com/embed/tgbNymZ7vqY",
        duration: "0:47",
        views_count: 19000,
        doctor_name: "Dr. Vikram Seth",
        category: "General Medicine",
        is_verified: true,
        published_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "s-006",
        platform: "youtube",
        content_type: "short",
        external_id: "short-006",
        title: "Better Sleep Better Health",
        description: "Circadian rhythm tips for deeper REM sleep.",
        thumbnail_url: "https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=400&auto=format&fit=crop&q=80",
        video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        duration: "0:50",
        views_count: 39000,
        doctor_name: "Sleep Science Hub",
        category: "Health Tips",
        is_verified: true,
        published_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
    },

    // --- INSTAGRAM SHORTS (PORTRAIT) ---
    {
        id: "ig-001",
        platform: "instagram",
        content_type: "short",
        external_id: "ig-001",
        title: "Healthy Heart Habits",
        description: "Daily cardio tips.",
        thumbnail_url: "https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?w=400&auto=format&fit=crop&q=80",
        video_url: "https://www.youtube.com/embed/3JZ_D3ELwOQ",
        duration: "0:30",
        views_count: 88000,
        doctor_name: "Dr. Rohan Verma",
        category: "Cardiology",
        is_verified: true,
        published_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "ig-002",
        platform: "instagram",
        content_type: "short",
        external_id: "ig-002",
        title: "Quick Health Tips",
        description: "Hydration & posture check.",
        thumbnail_url: "https://images.unsplash.com/photo-1594824813571-24a69c100d37?w=400&auto=format&fit=crop&q=80",
        video_url: "https://www.youtube.com/embed/L_LUpnjgPso",
        duration: "0:45",
        views_count: 64000,
        doctor_name: "Dr. Ananya Ray",
        category: "General Medicine",
        is_verified: true,
        published_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "ig-003",
        platform: "instagram",
        content_type: "short",
        external_id: "ig-003",
        title: "Doctor's Tip of the Day",
        description: "Preventative screening schedules.",
        thumbnail_url: "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=400&auto=format&fit=crop&q=80",
        video_url: "https://www.youtube.com/embed/fJ9rUzIMcZQ",
        duration: "0:40",
        views_count: 91000,
        doctor_name: "Dr. Neha Kapoor",
        category: "Health Tips",
        is_verified: true,
        published_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "ig-004",
        platform: "instagram",
        content_type: "short",
        external_id: "ig-004",
        title: "Stay Hydrated Stay Healthy",
        description: "Optimal water intake guidelines.",
        thumbnail_url: "https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=400&auto=format&fit=crop&q=80",
        video_url: "https://www.youtube.com/embed/tgbNymZ7vqY",
        duration: "0:35",
        views_count: 52000,
        doctor_name: "Wellness Daily",
        category: "General Medicine",
        is_verified: true,
        published_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "ig-005",
        platform: "instagram",
        content_type: "short",
        external_id: "ig-005",
        title: "Daily Stretch for Good Posture",
        description: "5 desk stretches for spine health.",
        thumbnail_url: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&auto=format&fit=crop&q=80",
        video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        duration: "0:50",
        views_count: 73000,
        doctor_name: "PhysioCare Clinic",
        category: "Surgery",
        is_verified: true,
        published_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "ig-006",
        platform: "instagram",
        content_type: "short",
        external_id: "ig-006",
        title: "Wellness Starts Within",
        description: "Mindful eating habits.",
        thumbnail_url: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&auto=format&fit=crop&q=80",
        video_url: "https://www.youtube.com/embed/3JZ_D3ELwOQ",
        duration: "0:45",
        views_count: 41000,
        doctor_name: "Dr. Harshini Jakki",
        category: "Cardiology",
        is_verified: true,
        published_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    }
];

class VideoController {
    /**
     * Get educational videos & shorts with category and platform filters
     */
    async getVideos(req, res) {
        try {
            const { platform, contentType, category, search } = req.query;

            let videos = [];

            if (isSupabaseConfigured) {
                let query = supabase
                    .from("educational_videos")
                    .select("*")
                    .eq("is_active", true)
                    .order("published_at", { ascending: false });

                if (platform) {
                    query = query.eq("platform", platform);
                }
                if (contentType) {
                    query = query.eq("content_type", contentType);
                }

                const { data, error } = await query;

                if (!error && data && data.length > 0) {
                    videos = data;
                } else {
                    videos = SAMPLE_VIDEOS;
                }
            } else {
                videos = SAMPLE_VIDEOS;
            }

            // Apply in-memory filtering for category & search
            if (platform) {
                videos = videos.filter(v => v.platform.toLowerCase() === platform.toLowerCase());
            }
            if (contentType) {
                videos = videos.filter(v => v.content_type.toLowerCase() === contentType.toLowerCase());
            }
            if (category && category !== "All Categories") {
                videos = videos.filter(v => v.category?.toLowerCase() === category.toLowerCase());
            }
            if (search) {
                const term = search.toLowerCase();
                videos = videos.filter(v =>
                    v.title.toLowerCase().includes(term) ||
                    (v.description && v.description.toLowerCase().includes(term)) ||
                    (v.doctor_name && v.doctor_name.toLowerCase().includes(term))
                );
            }

            // Group videos into categories for easy frontend rendering
            const youtubeVideos = videos.filter(v => v.platform === "youtube" && v.content_type === "video");
            const youtubeShorts = videos.filter(v => v.platform === "youtube" && v.content_type === "short");
            const instagramShorts = videos.filter(v => v.platform === "instagram");

            return res.json({
                success: true,
                total: videos.length,
                youtubeVideos,
                youtubeShorts,
                instagramShorts,
                allVideos: videos
            });
        } catch (error) {
            console.error("[VideoController] Get error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new VideoController();
