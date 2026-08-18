import { Suspense, useMemo, useRef, useState, useCallback } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Line, Html, Stars } from "@react-three/drei";
import * as THREE from "three";
import { Earth } from "./Earth";
import {
  buildFleet,
  heroPair,
  orbitPathPoints,
  orbitPosition,
  riskColor,
  type OrbitElement,
} from "./orbital-math";

export interface SceneFilters {
  constellations: Record<string, boolean>;
  debris: boolean;
  risk: boolean;
  paths: boolean;
  maneuver: boolean;
}

export const DEFAULT_FILTERS: SceneFilters = {
  constellations: { starlink: true, oneweb: true, gps: true, custom: true },
  debris: true,
  risk: true,
  paths: true,
  maneuver: false,
};

const dummy = new THREE.Object3D();
const tmp = new THREE.Vector3();

function Fleet({
  fleet,
  filters,
  onSelect,
  onHover,
}: {
  fleet: OrbitElement[];
  filters: SceneFilters;
  onSelect: (o: OrbitElement) => void;
  onHover: (o: OrbitElement | null) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  const visible = useMemo(
    () =>
      fleet.filter((o) =>
        o.kind === "debris"
          ? filters.debris
          : filters.constellations[o.constellation] !== false,
      ),
    [fleet, filters],
  );

  const colors = useMemo(() => {
    const arr = new Float32Array(visible.length * 3);
    visible.forEach((o, i) => {
      const c = filters.risk
        ? riskColor(o.risk, o.kind)
        : riskColor(0, o.kind);
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    });
    return arr;
  }, [visible, filters.risk]);

  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < visible.length; i++) {
      const o = visible[i]!;
      orbitPosition(o, t, tmp);
      dummy.position.copy(tmp);
      const s = o.kind === "debris" ? 0.007 : 0.012;
      const pulse = filters.risk && o.risk > 0.75 ? 1 + Math.sin(t * 6) * 0.35 : 1;
      dummy.scale.setScalar(s * pulse);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  const pick = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const id = e.instanceId;
      if (id === undefined) return null;
      return visible[id] ?? null;
    },
    [visible],
  );

  return (
    <instancedMesh
      key={visible.length}
      ref={ref}
      args={[undefined, undefined, visible.length]}
      frustumCulled={false}
      onPointerMove={(e) => {
        e.stopPropagation();
        onHover(pick(e));
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        const o = pick(e as unknown as ThreeEvent<PointerEvent>);
        if (o) onSelect(o);
      }}
    >
      <icosahedronGeometry args={[1, 0]}>
        <instancedBufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </icosahedronGeometry>
      <meshBasicMaterial vertexColors toneMapped={false} />
    </instancedMesh>
  );
}

function OrbitPaths({ fleet, filters }: { fleet: OrbitElement[]; filters: SceneFilters }) {
  const paths = useMemo(() => {
    const perGroup: Record<string, OrbitElement[]> = {};
    for (const o of fleet) {
      if (o.kind === "debris") continue;
      (perGroup[o.constellation] ??= []).push(o);
    }
    const out: { key: string; group: string; pts: THREE.Vector3[] }[] = [];
    for (const [group, items] of Object.entries(perGroup)) {
      const step = Math.max(1, Math.floor(items.length / 11));
      for (let i = 0; i < items.length; i += step) {
        out.push({
          key: `${group}-${i}`,
          group,
          pts: orbitPathPoints(items[i]!, 128),
        });
      }
    }
    return out;
  }, [fleet]);

  if (!filters.paths) return null;

  return (
    <>
      {paths
        .filter((p) => filters.constellations[p.group] !== false)
        .map((p) => (
          <Line
            key={p.key}
            points={p.pts}
            color={p.group === "oneweb" ? "#8b5cf6" : "#38d9f5"}
            transparent
            opacity={0.13}
            lineWidth={1}
          />
        ))}
    </>
  );
}

function Conjunction({
  filters,
  onSelect,
}: {
  filters: SceneFilters;
  onSelect: (o: OrbitElement) => void;
}) {
  const [a, b] = useMemo(() => heroPair(), []);
  const proposed = useMemo(() => ({ ...a, radius: a.radius + 0.055 }), [a]);
  const refA = useRef<THREE.Mesh>(null);
  const refB = useRef<THREE.Mesh>(null);
  const link = useRef<THREE.Line>(null);
  const [close, setClose] = useState(false);
  const [mid, setMid] = useState(() => new THREE.Vector3(0, 1.5, 0));

  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    orbitPosition(filters.maneuver ? proposed : a, t, pa);
    orbitPosition(b, t, pb);
    refA.current?.position.copy(pa);
    refB.current?.position.copy(pb);
    const d = pa.distanceTo(pb);
    const isClose = d < 0.28;
    setClose(isClose);
    if (isClose) setMid(pa.clone().lerp(pb, 0.5).multiplyScalar(1.06));
    const geo = link.current?.geometry as THREE.BufferGeometry | undefined;
    if (geo) {
      const arr = geo.attributes["position"]!.array as Float32Array;
      arr[0] = pa.x; arr[1] = pa.y; arr[2] = pa.z;
      arr[3] = pb.x; arr[4] = pb.y; arr[5] = pb.z;
      geo.attributes["position"]!.needsUpdate = true;
    }
  });

  const hazardColor = filters.maneuver ? "#22d3a6" : "#ef4444";

  return (
    <group>
      <Line
        points={orbitPathPoints(a, 160)}
        color={filters.maneuver ? "#4b5f78" : "#ef4444"}
        transparent
        opacity={filters.maneuver ? 0.28 : 0.6}
        lineWidth={1.4}
        dashed={filters.maneuver}
        dashSize={0.06}
        gapSize={0.05}
      />
      {filters.maneuver && (
        <Line
          points={orbitPathPoints(proposed, 160)}
          color="#22d3a6"
          transparent
          opacity={0.75}
          lineWidth={1.6}
        />
      )}
      <Line points={orbitPathPoints(b, 160)} color="#8b5cf6" transparent opacity={0.5} lineWidth={1.2} />

      <mesh ref={refA} onClick={(e) => { e.stopPropagation(); onSelect(a); }}>
        <sphereGeometry args={[0.022, 12, 12]} />
        <meshBasicMaterial color={hazardColor} toneMapped={false} />
      </mesh>
      <mesh ref={refB} onClick={(e) => { e.stopPropagation(); onSelect(b); }}>
        <sphereGeometry args={[0.022, 12, 12]} />
        <meshBasicMaterial color={filters.maneuver ? "#22d3a6" : "#f97316"} toneMapped={false} />
      </mesh>

      {/* @ts-expect-error r3f line primitive */}
      <line ref={link}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array(6), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={hazardColor}
          transparent
          opacity={close && filters.risk ? 0.9 : 0}
          toneMapped={false}
        />
      </line>

      {close && filters.risk && (
        <Html position={mid} center distanceFactor={4} zIndexRange={[10, 0]}>
          <div className="pointer-events-none whitespace-nowrap border border-risk-critical/60 bg-background/85 px-2 py-1 font-mono text-[9px] tracking-[0.2em] text-risk-critical backdrop-blur-sm">
            {filters.maneuver ? "CONFLICT RESOLVED" : "CLOSE APPROACH DETECTED"}
          </div>
        </Html>
      )}
    </group>
  );
}

function HoverLabel({ hovered }: { hovered: OrbitElement | null }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!hovered || !ref.current) return;
    orbitPosition(hovered, state.clock.elapsedTime, tmp);
    ref.current.position.copy(tmp);
  });
  if (!hovered) return null;
  return (
    <group ref={ref}>
      <Html center distanceFactor={5} zIndexRange={[8, 0]}>
        <div className="pointer-events-none translate-y-[-22px] whitespace-nowrap border border-primary/50 bg-background/85 px-2 py-1 font-mono text-[9px] tracking-[0.16em] text-primary backdrop-blur-sm">
          {hovered.label} · {hovered.constellation.toUpperCase()}
        </div>
      </Html>
    </group>
  );
}

export function OrbitalScene({
  filters = DEFAULT_FILTERS,
  onSelect,
  className,
  autoRotate = true,
}: {
  filters?: SceneFilters | undefined;
  onSelect?: ((o: OrbitElement) => void) | undefined;
  className?: string | undefined;
  autoRotate?: boolean | undefined;
}) {
  const fleet = useMemo(() => buildFleet(), []);
  const [hovered, setHovered] = useState<OrbitElement | null>(null);

  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 1.4, 3.6], fov: 42 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onPointerMissed={() => setHovered(null)}
      >
        <color attach="background" args={["#080c14"]} />
        <ambientLight intensity={0.6} />
        <Suspense fallback={null}>
          <Stars radius={80} depth={40} count={2600} factor={3} saturation={0} fade speed={0.4} />
          <Earth />
          <OrbitPaths fleet={fleet} filters={filters} />
          <Fleet
            fleet={fleet}
            filters={filters}
            onSelect={(o) => onSelect?.(o)}
            onHover={setHovered}
          />
          <Conjunction filters={filters} onSelect={(o) => onSelect?.(o)} />
          <HoverLabel hovered={hovered} />
        </Suspense>
        <OrbitControls
          enablePan
          enableZoom
          minDistance={1.6}
          maxDistance={9}
          autoRotate={autoRotate}
          autoRotateSpeed={0.28}
          rotateSpeed={0.5}
          zoomSpeed={0.7}
        />
      </Canvas>
    </div>
  );
}
