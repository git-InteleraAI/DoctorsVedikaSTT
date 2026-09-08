import React, { useRef, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Float, Ring } from "@react-three/drei";
import * as THREE from "three";

/**
 * Medical Hologram Model Component
 * Supports loading external .gltf/.glb files OR rendering procedural hologram geometry
 */
function HologramModel({ modelUrl }) {
  const groupRef = useRef();
  const ringRef = useRef();

  // Continuous 360-degree Y-axis rotation animation loop
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.6; // Smooth Y-axis rotation
    }
    if (ringRef.current) {
      ringRef.current.rotation.z -= delta * 0.4; // Counter-rotating base ring
    }
  });

  // Try loading custom GLTF model if URL is provided
  if (modelUrl) {
    try {
      const { scene } = useGLTF(modelUrl);
      
      // Clone scene & apply medical hologram glowing cyan material
      const hologramScene = scene.clone();
      hologramScene.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: "#00b4d8",
            emissive: "#00b4d8",
            emissiveIntensity: 0.8,
            wireframe: true,
            transparent: true,
            opacity: 0.75,
          });
        }
      });

      return (
        <group ref={groupRef} position={[0, -1.2, 0]} scale={[1.8, 1.8, 1.8]}>
          <primitive object={hologramScene} />
        </group>
      );
    } catch (e) {
      console.warn("Could not load GLTF model, falling back to procedural hologram.", e);
    }
  }

  // Fallback Procedural Medical Hologram Body (Humanoid Silhouette + Wireframe Grid)
  return (
    <group ref={groupRef} position={[0, -0.2, 0]}>
      {/* Head */}
      <mesh position={[0, 1.5, 0]}>
        <sphereGeometry args={[0.3, 24, 24]} />
        <meshStandardMaterial
          color="#00b4d8"
          emissive="#00b4d8"
          emissiveIntensity={0.6}
          wireframe
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Torso / Spine */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.35, 0.25, 1.4, 24, 12]} />
        <meshStandardMaterial
          color="#00b4d8"
          emissive="#00b4d8"
          emissiveIntensity={0.7}
          wireframe
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Ribcage Structure Inner Glow */}
      <mesh position={[0, 0.75, 0]}>
        <sphereGeometry args={[0.38, 16, 16]} />
        <meshStandardMaterial
          color="#08AEB8"
          emissive="#08AEB8"
          emissiveIntensity={0.9}
          wireframe
          transparent
          opacity={0.6}
        />
      </mesh>

      {/* Pelvis & Upper Legs */}
      <mesh position={[-0.2, -0.5, 0]}>
        <cylinderGeometry args={[0.12, 0.08, 1.1, 16]} />
        <meshStandardMaterial
          color="#00b4d8"
          emissive="#00b4d8"
          emissiveIntensity={0.7}
          wireframe
          transparent
          opacity={0.8}
        />
      </mesh>
      <mesh position={[0.2, -0.5, 0]}>
        <cylinderGeometry args={[0.12, 0.08, 1.1, 16]} />
        <meshStandardMaterial
          color="#00b4d8"
          emissive="#00b4d8"
          emissiveIntensity={0.7}
          wireframe
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Arms */}
      <mesh position={[-0.48, 0.6, 0]} rotation={[0, 0, 0.2]}>
        <cylinderGeometry args={[0.08, 0.06, 1.1, 16]} />
        <meshStandardMaterial
          color="#00b4d8"
          emissive="#00b4d8"
          emissiveIntensity={0.6}
          wireframe
          transparent
          opacity={0.75}
        />
      </mesh>
      <mesh position={[0.48, 0.6, 0]} rotation={[0, 0, -0.2]}>
        <cylinderGeometry args={[0.08, 0.06, 1.1, 16]} />
        <meshStandardMaterial
          color="#00b4d8"
          emissive="#00b4d8"
          emissiveIntensity={0.6}
          wireframe
          transparent
          opacity={0.75}
        />
      </mesh>

      {/* Glowing Base Pedestal Ring Anchor */}
      <group ref={ringRef} position={[0, -1.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <Ring args={[0.8, 0.95, 64]} position={[0, 0, 0]}>
          <meshBasicMaterial color="#00b4d8" wireframe side={THREE.DoubleSide} transparent opacity={0.8} />
        </Ring>

        <Ring args={[1.05, 1.12, 64]} position={[0, 0, 0]}>
          <meshBasicMaterial color="#08AEB8" side={THREE.DoubleSide} transparent opacity={0.4} />
        </Ring>
      </group>
    </group>
  );
}

/**
 * Main 3D Hologram Canvas Export Component
 */
export default function Hologram3DCanvas({ modelUrl }) {
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 0.2, 4.2], fov: 45 }}
        style={{ background: "transparent" }}
      >
        {/* Hologram Medical Lighting */}
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 10, 5]} intensity={1.2} color="#00b4d8" />
        <pointLight position={[0, -1, 2]} intensity={2.0} color="#08AEB8" />

        {/* Floating Hologram Stage */}
        <Suspense fallback={null}>
          <Float speed={2} rotationIntensity={0.2} floatIntensity={0.4}>
            <HologramModel modelUrl={modelUrl} />
          </Float>
        </Suspense>
      </Canvas>
    </div>
  );
}
