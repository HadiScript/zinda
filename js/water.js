import * as THREE from 'three';

// Stylised ocean: GPU waves, depth-based colour from a seabed map, animated
// shoreline foam, fresnel sky reflection and sun/moon glints.

const MAX_DEPTH = 20;

function depthTexture(heightAt, extent, res = 384) {
  const data = new Uint8Array(res * res * 4);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = (i / (res - 1) - 0.5) * 2 * extent;
      const z = (j / (res - 1) - 0.5) * 2 * extent;
      const d = Math.min(1, Math.max(0, -heightAt(x, z) / MAX_DEPTH));
      data[(j * res + i) * 4] = Math.round(d * 255);
      data[(j * res + i) * 4 + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, res, res);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function buildWater(heightAt, extent) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uDepth: { value: null },
      uExtent: { value: extent },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color('#fff1d0') },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uSkyTop: { value: new THREE.Color('#2f6fd6') },
      uSkyHorizon: { value: new THREE.Color('#b4defa') },
      uDay: { value: 1 },
      uNight: { value: 0 },
    },
  ]);
  uniforms.uDepth.value = depthTexture(heightAt, extent);

  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    transparent: true,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position;
        p.y += sin(p.x * 0.06 + uTime * 0.8) * 0.45 + cos(p.z * 0.05 + uTime * 0.6) * 0.45
             + sin((p.x + p.z) * 0.13 + uTime * 1.5) * 0.15;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uExtent, uDay, uNight;
      uniform sampler2D uDepth;
      uniform vec3 uSunDir, uSunColor, uMoonDir, uSkyTop, uSkyHorizon;
      varying vec3 vWorld;
      #include <fog_pars_fragment>

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }

      // Sum of directional sine waves -> analytic slope for the normal
      vec2 waveSlope(vec2 p, float t, float fine) {
        vec2 g = vec2(0.0);
        vec2 d; float ph;
        d = normalize(vec2(1.0, 0.25));  ph = dot(d, p) * 0.09 + t * 0.9;  g += d * 0.09 * 0.55 * cos(ph);
        d = normalize(vec2(-0.4, 1.0));  ph = dot(d, p) * 0.13 + t * 1.1;  g += d * 0.13 * 0.35 * cos(ph);
        d = normalize(vec2(0.8, -0.6));  ph = dot(d, p) * 0.31 + t * 1.7;  g += d * 0.31 * 0.12 * cos(ph);
        d = normalize(vec2(0.3, 1.0));   ph = dot(d, p) * 0.9 + t * 2.6;   g += d * 0.9 * 0.035 * fine * cos(ph);
        d = normalize(vec2(-0.9, 0.35)); ph = dot(d, p) * 1.6 + t * 3.4;   g += d * 1.6 * 0.018 * fine * cos(ph);
        d = normalize(vec2(0.6, 0.8));   ph = dot(d, p) * 2.7 + t * 4.3;   g += d * 2.7 * 0.008 * fine * cos(ph);
        return g;
      }

      void main() {
        vec2 uv = vWorld.xz / (2.0 * uExtent) + 0.5;
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        float depth = mix(1.0, texture2D(uDepth, clamp(uv, 0.0, 1.0)).r, inside);

        // fade out fine ripples with distance so they don't alias into stripes
        float fine = 1.0 - smoothstep(40.0, 220.0, distance(cameraPosition, vWorld));
        vec2 g = waveSlope(vWorld.xz, uTime, fine);
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);

        vec3 shallow = vec3(0.06, 0.72, 0.66);
        vec3 mid     = vec3(0.01, 0.36, 0.55);
        vec3 deep    = vec3(0.004, 0.07, 0.22);
        vec3 water = mix(shallow, mid, smoothstep(0.0, 0.18, depth));
        water = mix(water, deep, smoothstep(0.18, 0.75, depth));

        float light = mix(0.12, 1.0, uDay);
        water *= mix(vec3(0.35, 0.45, 0.8), vec3(1.0), uDay) * light;
        // subsurface-ish lift on wave faces toward the sun
        water += shallow * 0.12 * max(dot(N, normalize(uSunDir)), 0.0) * uDay * (1.0 - smoothstep(0.0, 0.4, depth));

        vec3 R = reflect(-V, N);
        vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.5, R.y));
        vec3 col = mix(water, sky, clamp(fres * 0.85 + 0.06, 0.0, 1.0));

        float sunUp = smoothstep(-0.05, 0.1, uSunDir.y);
        float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 220.0) * 4.0
                   + pow(max(dot(R, normalize(uSunDir)), 0.0), 24.0) * 0.12;
        col += uSunColor * spec * sunUp;
        col += vec3(0.7, 0.8, 1.0) * pow(max(dot(R, normalize(uMoonDir)), 0.0), 160.0) * 1.6 * uNight;

        // Shoreline foam: a solid lip plus bands that roll in toward the beach
        float n = vnoise(vWorld.xz * 0.35 + uTime * 0.15) * 0.6 + vnoise(vWorld.xz * 1.3 - uTime * 0.3) * 0.4;
        float lip = 1.0 - smoothstep(0.0, 0.035 + n * 0.02, depth);
        float bands = smoothstep(0.62, 0.95, sin(depth * 140.0 - uTime * 2.4 + n * 4.0) * 0.5 + 0.5);
        bands *= 1.0 - smoothstep(0.02, 0.12, depth);
        float caps = smoothstep(0.78, 0.95, n) * smoothstep(0.3, 0.6, depth) * 0.25; // sparse open-sea whitecaps
        float foam = clamp(lip + bands * (0.55 + n * 0.45) + caps, 0.0, 1.0);
        col = mix(col, vec3(0.95, 0.99, 1.0) * mix(0.25, 1.0, uDay), foam);

        float alpha = mix(0.5, 0.96, smoothstep(0.0, 0.25, depth));
        alpha = max(alpha, foam * 0.95);
        alpha = max(alpha, fres * 0.9);
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }`,
  });

  const geo = new THREE.PlaneGeometry(2000, 2000, 220, 220).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;

  function update(t, { sunDir, sunColor, moonDir, skyTop, skyHorizon, day, night }) {
    uniforms.uTime.value = t;
    uniforms.uSunDir.value.copy(sunDir);
    uniforms.uSunColor.value.copy(sunColor);
    uniforms.uMoonDir.value.copy(moonDir);
    uniforms.uSkyTop.value.copy(skyTop);
    uniforms.uSkyHorizon.value.copy(skyHorizon);
    uniforms.uDay.value = day;
    uniforms.uNight.value = night;
  }

  return { mesh, update };
}
