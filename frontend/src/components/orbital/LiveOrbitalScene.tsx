import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, Line, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { Earth } from "./Earth";
import {
  GROUP_COLOR,
  eciToScene,
  orbitTrack,
  stateAt,
  sunDirectionScene,
  type SatGroup,
  type SatelliteObject,
} from "@/utils/orbitalPropagation";
import { riskHex, type ConjunctionResult } from "@/utils/collisionAnalysis";

export interface GlobeFilters {
  groups: Record<SatGroup | "all", boolean>;
  orbits: boolean;
  riskMode: boolean;
}

export const DEFAULT_GLOBE_FILTERS: GlobeFilters = {
  groups: { all: true, starlink: true, oneweb: true, gps: true, other: true },
  orbits: false,
  riskMode: false,
};

/** Real time only: satellites are propagated against the actual UTC clock. */
const PROP_INTERVAL_MS = 250;
const EARTH_R_KM = 6371;

const dummy = new THREE.Object3D();
const tmpV = new THREE.Vector3();

function riskOf(o: SatelliteObject) {
  // Prototype congestion heuristic: crowded LEO shells + high eccentricity.
  const alt = o.meanAltitudeKm;
  const shell = alt > 480 && alt < 620 ? 0.7 : alt < 900 ? 0.45 : 0.2;
  const ecc = Math.min(1, o.eccentricity * 60);
  const debris = o.objectType !== "PAYLOAD" ? 0.25 : 0;
  return Math.min(1, shell * 0.7 + ecc * 0.3 + debris);
}

function colorFor(o: SatelliteObject, riskMode: boolean) {
  if (!riskMode) return new THREE.Color(GROUP_COLOR[o.group]);
  const r = riskOf(o);
  if (r > 0.78) return new THREE.Color(riskHex.CRITICAL);
  if (r > 0.6) return new THREE.Color(riskHex.HIGH);
  if (r > 0.42) return new THREE.Color(riskHex.MODERATE);
  return new THREE.Color(riskHex.LOW);
}

function Fleet({
  sats,
  riskMode,
  onHover,
  onPick,
}: {
  sats: SatelliteObject[];
  riskMode: boolean;
  onHover: (o: SatelliteObject | null) => void;
  onPick: (o: SatelliteObject) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const pos = useMemo(() => new Float32Array(sats.length * 3), [sats]);
  const vel = useMemo(() => new Float32Array(sats.length * 3), [sats]);
  const lastProp = useRef(0);

  const colors = useMemo(() => {
    const arr = new Float32Array(sats.length * 3);
    sats.forEach((o, i) => {
      const c = colorFor(o, riskMode);
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    });
    return arr;
  }, [sats, riskMode]);

  const propagate = useCallback(
    (simMs: number) => {
      const d = new Date(simMs);
      for (let i = 0; i < sats.length; i++) {
        const s = stateAt(sats[i]!, d);
        if (!s) {
          pos[i * 3 + 1] = 1e6;
          continue;
        }
        pos[i * 3] = s.position.x / EARTH_R_KM;
        pos[i * 3 + 1] = s.position.z / EARTH_R_KM;
        pos[i * 3 + 2] = -s.position.y / EARTH_R_KM;
        vel[i * 3] = s.velocity.x / EARTH_R_KM;
        vel[i * 3 + 1] = s.velocity.z / EARTH_R_KM;
        vel[i * 3 + 2] = -s.velocity.y / EARTH_R_KM;
      }
      lastProp.current = simMs;
    },
    [sats, pos, vel],
  );

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || !sats.length) return;
    const simMs = Date.now();
    if (simMs - lastProp.current > PROP_INTERVAL_MS) propagate(simMs);
    const dt = (simMs - lastProp.current) / 1000;
    for (let i = 0; i < sats.length; i++) {
      dummy.position.set(
        pos[i * 3]! + vel[i * 3]! * dt,
        pos[i * 3 + 1]! + vel[i * 3 + 1]! * dt,
        pos[i * 3 + 2]! + vel[i * 3 + 2]! * dt,
      );
      dummy.scale.setScalar(0.0105);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  const pick = (e: ThreeEvent<PointerEvent>) =>
    e.instanceId === undefined ? null : (sats[e.instanceId] ?? null);

  return (
    <instancedMesh
      key={sats.length}
      ref={ref}
      args={[undefined, undefined, Math.max(1, sats.length)]}
      frustumCulled={false}
      onPointerMove={(e) => {
        e.stopPropagation();
        onHover(pick(e));
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        const o = pick(e as unknown as ThreeEvent<PointerEvent>);
        if (o) onPick(o);
      }}
    >
      <icosahedronGeometry args={[1, 0]}>
        <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
      </icosahedronGeometry>
      <meshBasicMaterial vertexColors toneMapped={false} />
    </instancedMesh>
  );
}

/** Live-tracked marker for a selected satellite. */
function TrackedSatellite({
  sat,
  color,
  label,
  onPositionChange,
}: {
  sat: SatelliteObject;
  color: string;
  label: string;
  onPositionChange?: ((v: THREE.Vector3) => void) | undefined;
}) {
  const group = useRef<THREE.Group>(null);
  const track = useMemo(() => orbitTrack(sat, new Date(), 360), [sat]);

  useFrame(() => {
    const simMs = Date.now();
    const s = stateAt(sat, new Date(simMs));
    if (!s || !group.current) return;
    eciToScene(s.position.x, s.position.y, s.position.z, tmpV);
    group.current.position.copy(tmpV);
    onPositionChange?.(tmpV);
  });

  return (
    <>
      {track.length > 2 && (
        <Line points={track} color={color} transparent opacity={0.7} lineWidth={1.6} />
      )}
      <group ref={group}>
        <mesh>
          <sphereGeometry args={[0.024, 16, 16]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshBasicMaterial color={color} transparent opacity={0.16} toneMapped={false} />
        </mesh>
        <Html center zIndexRange={[9, 0]}>
          <div
            className="pointer-events-none translate-y-[-26px] whitespace-nowrap border bg-background/85 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.18em] backdrop-blur-sm"
            style={{ borderColor: color, color }}
          >
            {label} · {sat.name}
          </div>
        </Html>
      </group>
    </>
  );
}

function ConjunctionVisualization({
  a,
  b,
  result,
}: {
  a: SatelliteObject;
  b: SatelliteObject;
  result: ConjunctionResult | null;
}) {
  const line = useRef<THREE.Line>(null);
  const pa = useMemo(() => new THREE.Vector3(), []);
  const pb = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const d = new Date();
    const sa = stateAt(a, d);
    const sb = stateAt(b, d);
    if (!sa || !sb) return;
    eciToScene(sa.position.x, sa.position.y, sa.position.z, pa);
    eciToScene(sb.position.x, sb.position.y, sb.position.z, pb);
    const geo = line.current?.geometry as THREE.BufferGeometry | undefined;
    if (geo) {
      const arr = geo.attributes["position"]!.array as Float32Array;
      arr[0] = pa.x; arr[1] = pa.y; arr[2] = pa.z;
      arr[3] = pb.x; arr[4] = pb.y; arr[5] = pb.z;
      geo.attributes["position"]!.needsUpdate = true;
      geo.computeBoundingSphere();
    }
  });

  const hex = result ? riskHex[result.riskClass] : "#f97316";

  return (
    <group>
      {/* @ts-expect-error r3f line primitive */}
      <line ref={line}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array(6), 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={hex} transparent opacity={0.7} toneMapped={false} />
      </line>

      {result && (
        <group position={result.closestPoint}>
          <mesh>
            <sphereGeometry args={[0.016, 12, 12]} />
            <meshBasicMaterial color={hex} toneMapped={false} />
          </mesh>
          {/* translucent prototype uncertainty volume */}
          <mesh>
            <sphereGeometry args={[0.055, 20, 20]} />
            <meshBasicMaterial color={hex} transparent opacity={0.14} toneMapped={false} />
          </mesh>
          <Html center zIndexRange={[9, 0]}>
            <div
              className="pointer-events-none translate-y-[-30px] whitespace-nowrap border bg-background/85 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.18em] backdrop-blur-sm"
              style={{ borderColor: hex, color: hex }}
            >
              TCA · CLOSEST APPROACH
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

function HoverLabel({ sat }: { sat: SatelliteObject | null }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!sat || !group.current) return;
    const s = stateAt(sat, new Date());
    if (!s) return;
    eciToScene(s.position.x, s.position.y, s.position.z, tmpV);
    group.current.position.copy(tmpV);
  });
  if (!sat) return null;
  return (
    <group ref={group}>
      <Html center zIndexRange={[8, 0]}>
        <div className="pointer-events-none translate-y-[-20px] whitespace-nowrap border border-primary/60 bg-background/85 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.16em] text-primary backdrop-blur-sm">
          {sat.name}
        </div>
      </Html>
    </group>
  );
}

/** Smooth camera transitions toward a moving satellite or a fixed point. */
function CameraDirector({
  focus,
  version,
}: {
  focus: THREE.Vector3 | null;
  version: number;
}) {
  const { camera, controls } = useThree();
  const active = useRef(0);
  const target = useRef(new THREE.Vector3());

  useEffect(() => {
    if (focus) active.current = 1;
  }, [version, focus]);

  useFrame(() => {
    const c = controls as unknown as
      | { target: THREE.Vector3; update: () => void; autoRotate: boolean }
      | null;
    if (!c) return;
    if (!focus || active.current <= 0) return;
    target.current.copy(focus);
    c.target.lerp(target.current, 0.06);
    const desired = target.current
      .clone()
      .normalize()
      .multiplyScalar(target.current.length() + 2.2);
    camera.position.lerp(desired, 0.045);
    c.update();
    if (camera.position.distanceTo(desired) < 0.02) active.current = 0;
  });

  return null;
}

export function LiveOrbitalScene({
  satellites,
  filters,
  selectedA,
  selectedB,
  conjunction,
  onPick,
  className,
}: {
  satellites: SatelliteObject[];
  filters: GlobeFilters;
  selectedA: SatelliteObject | null;
  selectedB: SatelliteObject | null;
  conjunction: ConjunctionResult | null;
  onPick: (o: SatelliteObject) => void;
  className?: string | undefined;
}) {
  const [hovered, setHovered] = useState<SatelliteObject | null>(null);
  const [focus, setFocus] = useState<THREE.Vector3 | null>(null);
  const focusVersion = useRef(0);

  const visible = useMemo(
    () => satellites.filter((s) => filters.groups[s.group] !== false),
    [satellites, filters.groups],
  );

  const orbitLines = useMemo(() => {
    if (!filters.orbits) return [];
    const step = Math.max(1, Math.floor(visible.length / 90));
    const now = new Date();
    const out: { id: string; pts: THREE.Vector3[]; color: string }[] = [];
    for (let i = 0; i < visible.length; i += step) {
      const s = visible[i]!;
      const pts = orbitTrack(s, now, 220);
      if (pts.length > 2) out.push({ id: s.id, pts, color: GROUP_COLOR[s.group] });
    }
    return out;
  }, [visible, filters.orbits]);

  // Recentre the camera whenever the selection changes.
  const selectionKey = `${selectedA?.id ?? ""}-${selectedB?.id ?? ""}-${conjunction?.tca.getTime() ?? ""}`;
  useEffect(() => {
    focusVersion.current += 1;
  }, [selectionKey]);

  const focusPoint = conjunction ? conjunction.closestPoint : focus;

  // Start on the sunlit hemisphere so the globe reads as a lit Earth from space.
  const initialCamera = useMemo(() => {
    const sun = sunDirectionScene(new Date());
    const dir = sun.clone().setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize().multiplyScalar(3.6);
    return [dir.x, 1.35, dir.z] as [number, number, number];
  }, []);

  return (
    <div className={className}>
      <Canvas
        camera={{ position: initialCamera, fov: 42 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onPointerMissed={() => setHovered(null)}
      >
        <color attach="background" args={["#05070d"]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 2, 4]} intensity={1.1} />
        <Suspense fallback={null}>
          <Stars radius={90} depth={45} count={3200} factor={3} saturation={0} fade speed={0.3} />
          <Earth />
          {orbitLines.map((o) => (
            <Line
              key={o.id}
              points={o.pts}
              color={o.color}
              transparent
              opacity={0.16}
              lineWidth={1.1}
            />
          ))}
          <Fleet
            sats={visible}
            riskMode={filters.riskMode}
            onHover={setHovered}
            onPick={onPick}
          />
          {selectedA && (
            <TrackedSatellite
              sat={selectedA}
              color="#38d9f5"
              label="A"
              onPositionChange={selectedB ? undefined : (v) => setFocus(v.clone())}
            />
          )}
          {selectedB && <TrackedSatellite sat={selectedB} color="#f7c948" label="B" />}
          {selectedA && selectedB && (
            <ConjunctionVisualization a={selectedA} b={selectedB} result={conjunction} />
          )}
          <HoverLabel sat={hovered} />
        </Suspense>
        <CameraDirector focus={focusPoint} version={focusVersion.current} />
        <OrbitControls
          makeDefault
          enablePan={false}
          minDistance={1.35}
          maxDistance={12}
          autoRotate={!selectedA}
          autoRotateSpeed={0.22}
          rotateSpeed={0.5}
          zoomSpeed={0.7}
        />
      </Canvas>
    </div>
  );
}
