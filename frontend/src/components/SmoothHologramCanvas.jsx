import React, { useEffect, useRef, useState } from "react";

// Pre-import 8 clean high-res 360-degree angle assets
import angle0 from "../assets/holo_equal_0.png";
import angle45 from "../assets/holo_equal_45.png";
import angle90 from "../assets/holo_equal_90.png";
import angle135 from "../assets/holo_equal_135.png";
import angle180 from "../assets/holo_equal_180.png";
import angle225 from "../assets/holo_equal_225.png";
import angle270 from "../assets/holo_equal_270.png";
import angle315 from "../assets/holo_equal_315.png";

const EQUAL_ANGLE_SOURCES = [
  angle0,
  angle45,
  angle90,
  angle135,
  angle180,
  angle225,
  angle270,
  angle315,
];

export default function SmoothHologramCanvas() {
  const canvasRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const imagesRef = useRef([]);

  // Preload all 8 clean angle images
  useEffect(() => {
    let count = 0;
    const imgs = [];

    EQUAL_ANGLE_SOURCES.forEach((src, idx) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        count++;
        if (count === EQUAL_ANGLE_SOURCES.length) {
          setLoaded(true);
        }
      };
      imgs[idx] = img;
    });

    imagesRef.current = imgs;
  }, []);

  // 60 FPS Crisp Turntable Animation Loop (NO Double-Vision Reflection)
  useEffect(() => {
    if (!loaded) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let animationFrameId;
    let startTime = performance.now();

    const render = (now) => {
      // Clear canvas cleanly with zero ghosting
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const elapsed = (now - startTime) / 1000;
      const rotationSpeed = 20; // 20 degrees per second -> 18s smooth full rotation
      const currentDegree = (elapsed * rotationSpeed) % 360;

      // Select exact active frame (0 to 7) for 100% crisp, sharp silhouette
      const frameIndex = Math.floor((currentDegree / 360) * 8) % 8;
      const currentImg = imagesRef.current[frameIndex];

      if (currentImg && currentImg.complete && currentImg.naturalHeight > 0) {
        ctx.save();
        // Render 1 single sharp frame centered (No overlapping double reflections)
        ctx.drawImage(currentImg, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [loaded]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={600}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        background: "transparent",
      }}
    />
  );
}
