import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, AbsoluteFill } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import type { Globe3DProps } from "./schema";
import { COLOR_TOKENS, FONTS, scaleFontSize } from "../../tokens";
import { EASINGS, MOTION_DURATIONS } from "../../motion";
import { getSafeBounds } from "../../layout";

// Convert latitude/longitude to 3D Cartesian coordinates on sphere
function latLonToVector3(lat: number, lon: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return [x, y, z];
}

const HUBS = [
  { name: "London", lat: 51.5, lon: -0.1 },
  { name: "New York", lat: 40.7, lon: -74.0 },
  { name: "Tokyo", lat: 35.7, lon: 139.7 },
  { name: "Singapore", lat: 1.3, lon: 103.8 },
];

export const Globe3D: React.FC<Globe3DProps> = ({
  title = "Global Currency Corridors",
  subtitle = "Interbank Settlement Network (24/7 Continuous Liquidity)",
  rotationSpeed = 0.015,
  glowColor = COLOR_TOKENS.accent,
  nodeColor = COLOR_TOKENS.accent2,
  enterAtFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Entrance interpolation
  const enterProgress = interpolate(
    frame,
    [enterAtFrame, enterAtFrame + MOTION_DURATIONS.enterHeroFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASINGS.outExpo,
    }
  );

  const radius = 2.4;
  const rotY = (frame / 30) * rotationSpeed * Math.PI * 2;

  // Compute hub positions and transfer curve
  const hubVectors = useMemo(() => {
    return HUBS.map((h) => ({
      ...h,
      pos: latLonToVector3(h.lat, h.lon, radius),
    }));
  }, [radius]);

  // Arcs connecting financial hubs
  const arcGeometries = useMemo(() => {
    const geoms: THREE.BufferGeometry[] = [];
    if (hubVectors.length >= 2) {
      // NY to London
      const vNY = new THREE.Vector3(...hubVectors[1].pos);
      const vLDN = new THREE.Vector3(...hubVectors[0].pos);
      const mid1 = vNY.clone().add(vLDN).multiplyScalar(0.5).normalize().multiplyScalar(radius * 1.35);
      const curve1 = new THREE.QuadraticBezierCurve3(vNY, mid1, vLDN);
      geoms.push(new THREE.BufferGeometry().setFromPoints(curve1.getPoints(40)));

      // London to Tokyo
      const vTKY = new THREE.Vector3(...hubVectors[2].pos);
      const mid2 = vLDN.clone().add(vTKY).multiplyScalar(0.5).normalize().multiplyScalar(radius * 1.4);
      const curve2 = new THREE.QuadraticBezierCurve3(vLDN, mid2, vTKY);
      geoms.push(new THREE.BufferGeometry().setFromPoints(curve2.getPoints(40)));
    }
    return geoms;
  }, [hubVectors, radius]);

  const safe = getSafeBounds(width, height);
  const titleSize = scaleFontSize(48, width);
  const subSize = scaleFontSize(24, width);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* 3D WebGL Canvas Layer */}
      <div
        style={{
          width: "100%",
          height: "100%",
          opacity: enterProgress,
          transform: `scale(${interpolate(enterProgress, [0, 1], [0.85, 1.0])})`,
        }}
      >
        <ThreeCanvas
          width={width}
          height={height}
          camera={{ position: [0, 0, 6.2], fov: 45 }}
        >
          <ambientLight intensity={0.7} />
          <directionalLight position={[6, 6, 8]} intensity={1.5} color="#FFFFFF" />
          <pointLight position={[-8, -4, -4]} intensity={1.2} color={glowColor} />

          <group rotation={[0.3, rotY, 0]}>
            {/* Core Dark Sphere */}
            <mesh>
              <sphereGeometry args={[radius, 48, 48]} />
              <meshStandardMaterial
                color="#0E141C"
                roughness={0.75}
                metalness={0.25}
              />
            </mesh>

            {/* Glowing Wireframe Latitude/Longitude Grid */}
            <mesh>
              <sphereGeometry args={[radius + 0.01, 24, 24]} />
              <meshBasicMaterial
                color={nodeColor}
                wireframe
                transparent
                opacity={0.16}
              />
            </mesh>

            {/* Financial Hub Nodes */}
            {hubVectors.map((h, idx) => (
              <mesh key={`hub-${idx}`} position={h.pos}>
                <sphereGeometry args={[0.07, 16, 16]} />
                <meshBasicMaterial color={nodeColor} />
              </mesh>
            ))}

            {/* Financial Arcs */}
            {arcGeometries.map((geom, idx) => {
              const LineComp = "line" as any;
              return (
                <LineComp key={`arc-${idx}`} geometry={geom}>
                  <lineBasicMaterial color={glowColor} linewidth={2} />
                </LineComp>
              );
            })}
          </group>
        </ThreeCanvas>
      </div>

      {/* HTML Narrative Header Overlay */}
      <div
        style={{
          position: "absolute",
          top: safe.safeTop,
          left: safe.safeLeft,
          opacity: enterProgress,
          transform: `translateY(${interpolate(enterProgress, [0, 1], [-20, 0])}px)`,
          pointerEvents: "none",
        }}
      >
        {title && (
          <h2
            style={{
              fontFamily: FONTS.sans,
              fontSize: titleSize,
              fontWeight: 800,
              color: COLOR_TOKENS.text,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </h2>
        )}
        {subtitle && (
          <p
            style={{
              fontFamily: FONTS.sans,
              fontSize: subSize,
              color: COLOR_TOKENS.muted,
              marginTop: 8,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </AbsoluteFill>
  );
};
