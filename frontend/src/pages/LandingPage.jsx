import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css'; // Will create this for mobile menu specifics if needed, or put in styles.css

export default function LandingPage() {
    const navigate = useNavigate();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    
    useEffect(() => {
        if (window.location.hash.includes('access_token=')) {
            navigate('/auth/callback' + window.location.hash);
            return;
        }
        
        const observerOptions = { root: null, rootMargin: '0px', threshold: 0.15 };
        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);
        const revealElements = document.querySelectorAll('.reveal-trigger');
        revealElements.forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    return (
        <>



            <nav className="premium-nav entry-fade-down">
                <div className="nav-container">
                    <div className="nav-left">
                        <a href="#home" className="logo-link">
                            <img src="images/logo.png" alt="Doctors Vedika Logo" className="main-logo" />
                        </a>
                    </div>

                    <div className="nav-center-links">
                        <a href="#home" className="nav-item active">Home</a>
                        <a href="#modules" className="nav-item">Modules</a>
                        <a href="#automation" className="nav-item">Automation</a>
                        <a href="#operations" className="nav-item">Operations</a>
                        <a href="/dashboard" className="nav-item">Live Transcribe</a>
                    </div>

                    <div className="nav-right" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <a href="/login" className="nav-item desktop-only" style={{ fontWeight: 600, color: "#0093a8" }}>
                            Doctor Portal
                        </a>
                        <a href="#collaborate" className="btn-nav-action desktop-only">
                            Partner With Us <i className="fa-solid fa-arrow-up-right"></i>
                        </a>
                        <button 
                            className="mobile-menu-toggle"
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: 'var(--dark-slate)', display: 'none' }}
                        >
                            <i className={`fa-solid ${isMobileMenuOpen ? 'fa-xmark' : 'fa-bars'}`}></i>
                        </button>
                    </div>
                </div>
                
                {/* Mobile Menu Overlay */}
                <div className={`mobile-menu-overlay ${isMobileMenuOpen ? 'open' : ''}`}>
                    <div className="mobile-nav-links">
                        <a href="#home" className="mobile-nav-item" onClick={() => setIsMobileMenuOpen(false)}>Home</a>
                        <a href="#modules" className="mobile-nav-item" onClick={() => setIsMobileMenuOpen(false)}>Modules</a>
                        <a href="#automation" className="mobile-nav-item" onClick={() => setIsMobileMenuOpen(false)}>Automation</a>
                        <a href="#operations" className="mobile-nav-item" onClick={() => setIsMobileMenuOpen(false)}>Operations</a>
                        <a href="/dashboard" className="mobile-nav-item" onClick={() => setIsMobileMenuOpen(false)}>Live Transcribe</a>
                        <div className="mobile-nav-divider"></div>
                        <a href="/login" className="mobile-nav-item" style={{ color: "#0093a8", fontWeight: 700 }} onClick={() => setIsMobileMenuOpen(false)}>Doctor Portal</a>
                        <a href="#collaborate" className="btn-nav-action" style={{ textAlign: 'center', marginTop: '1rem' }} onClick={() => setIsMobileMenuOpen(false)}>Partner With Us</a>
                    </div>
                </div>
            </nav>


            <header id="home" className="hero-section">
                <div className="ambient-glow bg-blob-1"></div>
                <div className="ambient-glow bg-blob-2"></div>

                <div className="hero-container">

                    <div className="hero-text-stack">
                        <div className="hero-badge entry-reveal-item" style={{ "--anim-order": "1" }}>
                            <span className="badge-pulse"></span>
                            <span className="badge-text">⚡ Next-Gen Ambient Medical AI</span>
                        </div>


                        <h1 className="hero-title entry-reveal-item" style={{ "--anim-order": "2" }}>
                            <div className="typewriter-line-1">The AI-Powered Operating System</div>
                            <div className="typewriter-line-2">for <span className="text-gradient">Elite Medical Practices</span></div>
                        </h1>

                        <p className="hero-subtitle entry-reveal-item" style={{ "--anim-order": "3" }}>
                            Automate multi-lingual clinical scribing, streamline smart prescriptions, and deploy autonomous
                            post-surgery AI care pathways. Run your entire practice on a single secure ecosystem.
                        </p>
                        <div className="hero-actions entry-reveal-item" style={{ "--anim-order": "4" }}>
                            <a href="#collaborate" className="btn-hero-primary">Partner With Us</a>
                            <a href="#modules" className="btn-hero-secondary">Explore AI Modules <i
                                className="fa-solid fa-arrow-right"></i></a>
                        </div>

                        <div className="lang-support-tags entry-reveal-item" style={{ "--anim-order": "5" }}>
                            <span><i className="fa-solid fa-language"></i> Dynamic Interface Localization:</span>
                            <span className="tag">English</span>
                            <span className="tag">తెలుగు</span>
                            <span className="tag">हिंदी</span>
                        </div>
                    </div>


                    <div className="hero-visual-anchor">
                        <div className="scene-3d-container">
                            <div className="carousel-3d-ring">


                                <div className="stage-3d-card card-s1 entry-3d-stagger" style={{ "--stage-order": "1" }}>
                                    <div className="stage-num-badge">01</div>
                                    <div className="stage-icon-box"><i className="fa-solid fa-microphone-lines"></i></div>
                                    <div className="stage-details">
                                        <h3>Ambient Ingestion</h3>
                                        <p>AI listens to multi-lingual patient conversations securely.</p>
                                    </div>
                                </div>


                                <div className="stage-3d-card card-s2 entry-3d-stagger" style={{ "--stage-order": "2" }}>
                                    <div className="stage-num-badge">02</div>
                                    <div className="stage-icon-box"><i className="fa-solid fa-brain"></i></div>
                                    <div className="stage-details">
                                        <h3>AI Note Synthesis</h3>
                                        <p>Instantly structures clinical data into diagnostic zones.</p>
                                    </div>
                                </div>


                                <div className="stage-3d-card card-s3 entry-3d-stagger" style={{ "--stage-order": "3" }}>
                                    <div className="stage-num-badge">03</div>
                                    <div className="stage-icon-box"><i className="fa-solid fa-file-waveform"></i></div>
                                    <div className="stage-details">
                                        <h3>Smart Rx Generation</h3>
                                        <p>Compiles doses into downloadable official PDF prescriptions.</p>
                                    </div>
                                </div>


                                <div className="stage-3d-card card-s4 entry-3d-stagger" style={{ "--stage-order": "4" }}>
                                    <div className="stage-num-badge">04</div>
                                    <div className="stage-icon-box"><i className="fa-solid fa-phone-volume"></i></div>
                                    <div className="stage-details">
                                        <h3>Autonomous Follow-Up</h3>
                                        <p>Triggers post-surgery recall calls and refill alerts paths.</p>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
            </header>








            <section id="modules" className="clinical-intelligence-section dark-mode-active">
                <div className="dark-ambient-glow"></div>

                <div className="modules-container">
                    <div className="modules-header-stack reveal-trigger">
                        <span className="section-subtitle-tag">⚡ SYSTEM CORE</span>
                        <h2 className="modules-main-title">Clinical Intelligence Suite</h2>
                        <p className="modules-description">Next-generation medical applications engineered to eliminate chart
                            clutter and automate patient transcription inline.</p>
                    </div>

                    <div className="bento-grid-layout">

                        <div className="bento-card bento-wide has-mockup reveal-trigger delay-1">
                            <div className="content-side">
                                <div className="bento-icon-badge"><i className="fa-solid fa-microphone-lines"></i></div>
                                <div className="bento-text-content">
                                    <h3>Ambient AI Medical Scribe</h3>
                                    <p>Securely listens to multi-lingual patient conversations and automatically drafts highly
                                        structured clinical notes in real-time.</p>
                                </div>
                                <div className="graphic-element translation-stream">
                                    <span className="lang-node telugu">తెలుగు</span>
                                    <span className="stream-arrow"><i className="fa-solid fa-right-long"></i></span>
                                    <span className="lang-node english">English Transcript Drafted</span>
                                </div>
                            </div>
                            <div className="mockup-side">
                                <img src="images/AIscribe.png" alt="AI Scribe Interface Mockup" className="floating-mockup" />
                            </div>
                        </div>

                        <div className="bento-card image-reveal reveal-trigger delay-2">
                            <div className="bg-image"
                                style={{ "backgroundImage": "url('https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80')" }}>
                            </div>
                            <div className="glass-overlay"></div>

                            <div className="bento-card-inner">
                                <div className="bento-icon-badge"><i className="fa-solid fa-rectangle-list"></i></div>
                                <div className="bento-text-content">
                                    <h3>Structured Draft Summary</h3>
                                    <p>Organizes session text into standard zones like symptoms, diagnosis, and treatment plans
                                        for quick sign-off.</p>
                                </div>
                                <div className="graphic-element zonal-pill-container">
                                    <span className="zonal-pill"><i className="fa-solid fa-check"></i> Symptoms</span>
                                    <span className="zonal-pill"><i className="fa-solid fa-check"></i> Diagnosis</span>
                                    <span className="zonal-pill"><i className="fa-solid fa-check"></i> Plan</span>
                                </div>
                            </div>
                        </div>

                        <div className="bento-card image-reveal reveal-trigger delay-3">
                            <div className="bg-image"
                                style={{ "backgroundImage": "url('https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=800&q=80')" }}>
                            </div>
                            <div className="glass-overlay"></div>

                            <div className="bento-card-inner">
                                <div className="bento-icon-badge"><i className="fa-solid fa-file-pdf"></i></div>
                                <div className="bento-text-content">
                                    <h3>Digital Prescription Generator</h3>
                                    <p>Automatically compiles medication names, dosages, and active intervals into a clean,
                                        downloadable official PDF prescription.</p>
                                </div>
                                <div className="graphic-element rx-action-trigger">
                                    <span className="mini-pdf-btn"><i className="fa-solid fa-file-arrow-down"></i> Download Rx
                                        PDF</span>
                                </div>
                            </div>
                        </div>

                        <div className="bento-card bento-wide has-mockup reveal-trigger delay-4">
                            <div className="content-side">
                                <div className="bento-icon-badge"><i className="fa-solid fa-clock-rotate-left"></i></div>
                                <div className="bento-text-content">
                                    <h3>Historical Care Timeline</h3>
                                    <p>Provides a fast, read-only lookup console to review a patient's entire chronological
                                        history of past clinic visits and clinical notes instantly.</p>
                                </div>
                                <div className="graphic-element chronology-pipeline">
                                    <div className="timeline-node active"><span>May 26</span></div>
                                    <div className="timeline-line"></div>
                                    <div className="timeline-node"><span>Jun 26</span></div>
                                    <div className="timeline-line"></div>
                                    <div className="timeline-node"><span>Jul 26</span></div>
                                </div>
                            </div>
                            <div className="mockup-side">
                                <img src="images/patientTimeline.png" alt="Historical Timeline Interface Mockup"
                                    className="floating-mockup" style={{ "animationDelay": "-3s" }} />
                            </div>
                        </div>

                    </div>
                </div>
            </section>








            <section id="automation" className="automation-section">
                <div className="ambient-glow bg-blob-1" style={{ "top": "-50px", "right": "-100px" }}></div>
                <div className="ambient-glow bg-blob-2" style={{ "bottom": "-50px", "left": "-100px" }}></div>

                <div className="aurora-container">
                    <div className="aurora-header-stack reveal-trigger">
                        <span className="section-subtitle-tag aurora-tag">⚡ THE AUTONOMOUS CARE ENGINE</span>
                        <h2 className="aurora-main-title">Scale Your Empathy.<br />Automate Your Retention.</h2>
                        <p className="aurora-description">Extend your premium care beyond the clinic walls. Ensure perfect patient
                            compliance and continuous follow-ups with zero operational overhead.</p>
                    </div>

                    <div className="horizontal-cards-container">

                        <div className="aurora-card horizontal-card reveal-trigger delay-1">
                            <div className="aurora-content-side">
                                <div className="aurora-icon-badge"><i className="fa-solid fa-map-location-dot"></i></div>
                                <div className="aurora-text-content">
                                    <h3>Pre- & Post-Procedure Care Pathways</h3>
                                    <p>Eliminate surgical anxiety. Automatically assign visual preparation and recovery roadmaps
                                        to ensure patient compliance and pristine outcomes without endless front-desk phone
                                        calls.</p>
                                </div>
                                <div className="aurora-graphic-element">
                                    <div className="pathway-track">
                                        <span className="path-node past"><i className="fa-solid fa-check"></i> Day -3 Fasting</span>
                                        <span className="path-line active"></span>
                                        <span className="path-node current"><i className="fa-solid fa-spinner fa-spin"></i> Day 0
                                            Surgery</span>
                                        <span className="path-line"></span>
                                        <span className="path-node future"><i className="fa-solid fa-person-walking"></i> Day +5
                                            Rehab</span>
                                    </div>
                                </div>
                            </div>
                            <div className="aurora-image-side">
                                <img src="images/PrePost.png" alt="Care Pathway Roadmap" className="rounded-feature-img" />
                            </div>
                        </div>

                        <div className="aurora-card horizontal-card reverse-layout reveal-trigger delay-2">
                            <div className="aurora-content-side">
                                <div className="aurora-icon-badge"><i className="fa-solid fa-headset"></i></div>
                                <div className="aurora-text-content">
                                    <h3>AI Post-Op Voice Check-ins</h3>
                                    <p>Empathy at scale. Our AI acts as a dedicated post-op nurse, proactively calling patients
                                        at home to systematically collect pain metrics and immediately flag complications.</p>
                                </div>
                                <div className="aurora-graphic-element">
                                    <div className="voice-wave-container">
                                        <span className="wave-bar"></span><span className="wave-bar"></span><span
                                            className="wave-bar"></span>
                                        <div className="call-status">Live AI Call in Progress...</div>
                                    </div>
                                </div>
                            </div>
                            <div className="aurora-image-side">
                                <img src="images/Post-Op.png" alt="AI Voice Calling" className="rounded-feature-img" />
                            </div>
                        </div>

                        <div className="aurora-card horizontal-card reveal-trigger delay-3">
                            <div className="aurora-content-side">
                                <div className="aurora-icon-badge"><i className="fa-solid fa-prescription-bottle-medical"></i></div>
                                <div className="aurora-text-content">
                                    <h3>Automated Chronic Recall</h3>
                                    <p>Plug revenue leaks. The system tracks maintenance medications and automatically nudges
                                        long-term patients to book their mandatory routine review appointments.</p>
                                </div>
                                <div className="aurora-graphic-element">
                                    <div className="retention-alert">
                                        <i className="fa-solid fa-bell bell-shake"></i>
                                        <div className="alert-text">
                                            <strong>Refill Required</strong>
                                            <span>Automated SMS sent to patient.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="aurora-image-side">
                                <img src="images/ChronicRecall.png" alt="Chronic Recall Alerts" className="rounded-feature-img" />
                            </div>
                        </div>

                    </div>
                </div>
            </section>















        </>
    );
}
