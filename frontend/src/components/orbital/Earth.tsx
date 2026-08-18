import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sunDirectionScene, gmstAngle } from "@/utils/orbitalPropagation";

/**
 * Photoreal Earth: real NASA-derived imagery (day, night lights, topography)
 * blended by the true solar terminator, with an atmospheric scattering shell.
 * Rotation is driven by GMST so the surface stays registered with ECI orbits.
 */

const TEX_BASE = "/textures";

const vertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldNormal;

  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uTopo;
  uniform vec3 uSunDir;      // world space
  uniform float uHasTex;

  void main() {
    vec3 n = normalize(vWorldNormal);
    float sun = dot(n, normalize(uSunDir));
    float day = smoothstep(-0.12, 0.22, sun);

    vec3 dayCol, nightCol;
    if (uHasTex > 0.5) {
      dayCol = texture2D(uDay, vUv).rgb;
      nightCol = texture2D(uNight, vUv).rgb;
      // subtle relief shading from the topography map
      float h = texture2D(uTopo, vUv).r;
      float hx = texture2D(uTopo, vUv + vec2(0.0015, 0.0)).r - h;
      float hy = texture2D(uTopo, vUv + vec2(0.0, 0.0015)).r - h;
      dayCol *= 1.0 + clamp((hx + hy) * 6.0, -0.25, 0.25);
    } else {
      dayCol = vec3(0.05, 0.16, 0.28);
      nightCol = vec3(0.01, 0.02, 0.05);
    }

    // slight cool cast + gentle exposure so it reads as space imagery
    dayCol *= vec3(0.96, 1.0, 1.06);
    vec3 col = mix(nightCol * 1.8, dayCol * (0.55 + 0.95 * clamp(sun, 0.0, 1.0)) * 1.25, day);

    // specular sheen on oceans near the sun glint
    float glint = pow(clamp(dot(reflect(-normalize(uSunDir), n), normalize(vViewDir)), 0.0, 1.0), 24.0);
    col += vec3(0.35, 0.45, 0.55) * glint * 0.12 * day;

    // rim atmosphere, brighter on the lit limb
    float fres = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0), 3.0);
    col += vec3(0.22, 0.52, 0.95) * fres * (0.30 + 0.65 * day);

    gl_FragColor = vec4(col, 1.0);
  }
`;

const atmoVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const atmoFragment = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldNormal;
  uniform vec3 uSunDir;
  void main() {
    float fres = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0), 3.2);
    float sun = clamp(dot(normalize(vWorldNormal), normalize(uSunDir)) * 1.6 + 0.35, 0.0, 1.0);
    vec3 tint = mix(vec3(0.10, 0.24, 0.55), vec3(0.35, 0.66, 1.0), sun);
    gl_FragColor = vec4(tint, fres * (0.18 + 0.62 * sun));
  }
`;

function useEarthTextures() {
  const [tex, setTex] = useState<{
    day: THREE.Texture;
    night: THREE.Texture;
    topo: THREE.Texture;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const load = (f: string) =>
      new Promise<THREE.Texture>((res, rej) => loader.load(`${TEX_BASE}/${f}`, res, undefined, rej));

    Promise.all([
      load("earth-day.jpg"),
      load("earth-night.jpg"),
      load("earth-topology.png"),
    ])
      .then(([day, night, topo]) => {
        if (cancelled) return;
        for (const t of [day, night, topo]) {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 8;
        }
        setTex({ day, night, topo });
      })
      .catch(() => {
        /* offline — procedural fallback shading is used */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return tex;
}

export function Earth({ radius = 1 }: { radius?: number }) {
  const globe = useRef<THREE.Mesh>(null);
  const tex = useEarthTextures();

  const uniforms = useMemo(
    () => ({
      uDay: { value: null as THREE.Texture | null },
      uNight: { value: null as THREE.Texture | null },
      uTopo: { value: null as THREE.Texture | null },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uHasTex: { value: 0 },
    }),
    [],
  );

  const atmoUniforms = useMemo(
    () => ({ uSunDir: { value: new THREE.Vector3(1, 0, 0) } }),
    [],
  );

  const surfaceMat = useMemo(
    () =>
      new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms }),
    [uniforms],
  );

  const atmoMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: atmoVertex,
        fragmentShader: atmoFragment,
        uniforms: atmoUniforms,
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [atmoUniforms],
  );

  useEffect(() => {
    if (!tex) return;
    uniforms.uDay.value = tex.day;
    uniforms.uNight.value = tex.night;
    uniforms.uTopo.value = tex.topo;
    uniforms.uHasTex.value = 1;
    surfaceMat.needsUpdate = true;
  }, [tex, uniforms, surfaceMat]);

  useFrame(() => {
    const now = new Date();
    // Real sidereal rotation keeps the surface aligned with inertial orbits.
    if (globe.current) globe.current.rotation.y = gmstAngle(now) - Math.PI / 2;
    const sun = sunDirectionScene(now);
    uniforms.uSunDir.value.copy(sun);
    atmoUniforms.uSunDir.value.copy(sun);
  });

  return (
    <group>
      <mesh ref={globe}>
        <sphereGeometry args={[radius, 128, 128]} />
        <primitive object={surfaceMat} attach="material" />
      </mesh>

      {/* atmospheric shell */}
      <mesh scale={1.022}>
        <sphereGeometry args={[radius, 64, 64]} />
        <primitive object={atmoMat} attach="material" />
      </mesh>
    </group>
  );
}
