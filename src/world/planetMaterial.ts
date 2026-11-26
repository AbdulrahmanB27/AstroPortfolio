import * as THREE from 'three'
import type { PlanetSpec, PlanetType } from '../content/schema'
import { STAR_POS } from './constants'
import { SNOISE } from './glsl'

/** Default palettes: base, secondary, accent, plus atmosphere rim. Muted but distinct. */
export const PLANET_LOOKS: Record<PlanetType, { palette: [string, string, string]; rim: string; rimPower: number }> = {
  rock: { palette: ['#6b6965', '#8f8b84', '#454449'], rim: '#6a7484', rimPower: 0.22 },
  gas: { palette: ['#b98a4e', '#e3c79a', '#7a4a26'], rim: '#ffcf9a', rimPower: 0.5 },
  ice: { palette: ['#b3c3cc', '#e8eef1', '#6d8da2'], rim: '#a9d4ff', rimPower: 0.62 },
  desert: { palette: ['#a4573a', '#cf8a5c', '#5a3628'], rim: '#ffb28a', rimPower: 0.36 },
  ocean: { palette: ['#1d6672', '#5d7648', '#b3a078'], rim: '#7fd0e8', rimPower: 0.72 },
  ember: { palette: ['#332d2a', '#6b5c50', '#ff6a1e'], rim: '#ff8a4a', rimPower: 0.26 },
  moon: { palette: ['#96948e', '#c2bfb6', '#6b6966'], rim: '#8c94a0', rimPower: 0.12 },
}
const TYPE_INDEX: Record<PlanetType, number> = { rock: 0, gas: 1, ice: 2, desert: 3, ocean: 4, ember: 5, moon: 6 }

export function resolvePalette(spec: PlanetSpec): [THREE.Color, THREE.Color, THREE.Color] {
  const look = PLANET_LOOKS[spec.type]
  const custom = [0, 1, 2].map((i) => /^#[0-9a-fA-F]{6}$/.test(spec.palette[i] ?? ''))
  const r = Math.abs(Math.sin(spec.seed * 12.9898) * 43758.5453) % 1
  const r2 = Math.abs(Math.sin(spec.seed * 78.233) * 12543.123) % 1
  return [0, 1, 2].map((i) => {
    const c = new THREE.Color(custom[i] ? spec.palette[i] : look.palette[i])
    // default palettes drift a little in hue and value with the seed; explicit colours are left alone
    if (!custom[i]) c.offsetHSL((r - 0.5) * 0.09, (r2 - 0.5) * 0.12, (r2 - 0.5) * 0.08)
    return c
  }) as [THREE.Color, THREE.Color, THREE.Color]
}

const VERT = /* glsl */ `
uniform vec3 uStar;
varying vec3 vObj; varying vec3 vWorld; varying vec3 vN; varying vec3 vLo;
void main(){
  vObj = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  // direction to the star in the planet's own frame, for the close-up relief shading
  vLo = normalize((uStar - w.xyz) * mat3(modelMatrix));
  gl_Position = projectionMatrix * viewMatrix * w;
}`

const FRAG = /* glsl */ `
${SNOISE}
const int uType = PTYPE;   // compile-time: dead branches are dropped, each type compiles to a small program
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uRim;
uniform float uSeed; uniform float uTime; uniform vec3 uStar; uniform float uDim; uniform float uBump;
varying vec3 vObj; varying vec3 vWorld; varying vec3 vN; varying vec3 vLo;

vec3 spin(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }
vec3 hash33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }

/**
 * Crater field. Every crater has its own depth, rim sharpness and age; outlines are slightly irregular.
 * Only the 8 cells around the point are searched: a crater reaches at most half a cell, so nothing is missed.
 */
float craters(vec3 p, float scale){
  p *= scale;
  float wob = snoise(p * 1.7);
  p += 0.085 * vec3(wob, snoise(p * 1.7 + 4.1), -wob);
  vec3 b = floor(p - 0.5); vec3 f = p - b; float h = 0.0;
  for (int x = 0; x <= 1; x++) for (int y = 0; y <= 1; y++) for (int z = 0; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = hash33(b + g);
    vec3 o2 = hash33(b + g + 17.0);
    float rr = 0.1 + 0.26 * o.x * o.x;
    float d = length(g + o - f) / rr;
    if (o2.z > 0.22 && d < 1.38) {
      float age = o2.x;                                   // 0 fresh .. 1 worn down
      float depth = mix(0.6, 0.18, age) * (0.6 + 0.8 * o2.y);
      float bowl = d < 1.0 ? -(1.0 - d * d) * depth : 0.0;
      float rim = exp(-pow((d - 1.0) / mix(0.12, 0.24, age), 2.0)) * mix(0.26, 0.06, age) * smoothstep(1.38, 1.12, d);
      float peak = (rr > 0.27 && d < 0.3) ? (1.0 - d / 0.3) * 0.15 * (1.0 - age) : 0.0;
      h += bowl + rim + peak;
    }
  }
  return h;
}

/** Cellular plates: x = distance to the nearest site, y = to the second nearest, z = id of the nearest. */
vec3 plates(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p); float f1 = 9.0; float f2 = 9.0; float id = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = hash33(i + g);
    float d = length(g + o - f);
    if (d < f1) { f2 = f1; f1 = d; id = o.x + o.y * 0.37; } else if (d < f2) { f2 = d; }
  }
  return vec3(f1, f2, id);
}

/** Rock and moon: returns height, writes the large-scale tone and the crater term. */
float rockField(vec3 sp, out float n, out float cr){
  n = fbm5(sp * 1.9);
  float scale = uType == 6 ? 2.9 : 2.2;
  cr = craters(sp, scale) + 0.45 * craters(sp + 3.1, scale * 2.5);
  return n * 0.05 + cr * 0.06;
}

/** Ember: crust plates. Returns height, writes the seam distance, plate tone, noise and the molten mask. */
float emberField(vec3 sp, out float gap, out float tone, out float n, out float molten){
  n = fbm5(sp * 1.4);
  vec3 q = sp * 2.1 + 0.22 * vec3(fbm3(sp * 1.6), fbm3(sp * 1.6 + 5.0), fbm3(sp * 1.6 + 9.0));
  vec3 pl = plates(q);
  gap = pl.y - pl.x;
  tone = fract(pl.z * 7.3);
  molten = smoothstep(0.02, 0.36, fbm3(sp * 0.7 + 3.0));
  return n * 0.035 + tone * 0.022 - smoothstep(0.1, 0.0, gap) * 0.05;
}

/** Height only (no colour), used for the two extra samples that build the close-up normal. */
float reliefH(vec3 sp){
  float r = 0.0;
  if (uType == 4) {
    float cont = fbm5(sp * 1.3);
    r = smoothstep(0.02, 0.11, cont) * smoothstep(0.1, 0.6, cont) * 0.045;
  } else if (uType == 2) {
    float n = fbm5(sp * 1.6);
    r = n * 0.03 - pow(clamp(1.0 - abs(snoise(sp * 3.1 + n * 0.8)), 0.0, 1.0), 9.0) * 0.03;
  } else if (uType == 3) {
    r = fbm5(sp * 1.5) * 0.05 + craters(sp, 2.6) * 0.018;
  } else if (uType == 5) {
    float a, b, c, d;
    r = emberField(sp, a, b, c, d);
  } else if (uType != 1) {
    float a, b;
    r = rockField(sp, a, b);
  }
  return r;
}

void main(){
  vec3 p = spin(normalize(vObj), uTime * 0.012 + uSeed);
  vec3 sp = p + uSeed * 0.37;
  vec3 alb = uA; float h = 0.0; vec3 emi = vec3(0.0); float gloss = 0.0; float cloud = 0.0;

  if (uType == 1) {                      // banded gas giant
    float lat = p.y;
    float lon = atan(p.z, p.x);
    // zonal jets of uneven width, with turbulence carried along them
    float jet = snoise(vec3(lat * 2.3 + uSeed, uSeed * 1.7, 0.0));
    vec3 q = vec3(sp.x * 2.2, sp.y * 9.0, sp.z * 2.2);
    float t1 = fbm5(q + vec3(uTime * 0.004, 0.0, 0.0));
    float t2 = snoise(q * 2.7 + 11.0 + t1 * 0.8);
    float y2 = lat + 0.05 * jet + 0.042 * t1 + 0.012 * t2;
    float bands = sin(y2 * 16.0 + uSeed) * 0.5 + 0.5;
    // narrow dark belts of uneven strength riding between the broad zones
    float belt = smoothstep(0.62, 0.98, sin(y2 * 31.0 + jet * 3.0 + 0.6)) * (0.45 + 0.55 * snoise(vec3(lat * 5.0, uSeed, 2.0)));
    float fine = sin(y2 * 47.0 + 1.7 + t1 * 2.2) * 0.5 + 0.5;
    float hair = sin(y2 * 120.0 + t2 * 3.0) * 0.5 + 0.5;
    alb = mix(uA, uB, smoothstep(0.25, 0.75, bands));
    alb = mix(alb, uC, smoothstep(0.55, 1.0, fine) * 0.4 * (1.0 - 0.55 * bands));
    alb = mix(alb, uC * 0.78, clamp(belt, 0.0, 1.0) * 0.55);
    alb *= 0.9 + 0.16 * hair;
    // shear at the band edges curls into chevrons and festoons
    float edge = 1.0 - abs(bands * 2.0 - 1.0);
    float eddy = snoise(vec3(sp.x * 7.0 + t1 * 2.4, y2 * 34.0, sp.z * 7.0));
    alb = mix(alb, mix(uB * 1.05, uC, 0.5 + 0.5 * eddy), edge * edge * 0.62 * smoothstep(-0.1, 0.7, eddy));
    float streak = snoise(vec3(sp.x * 1.3, sp.y * 60.0, sp.z * 1.3) + t1) * 0.6 + snoise(vec3(sp.x * 2.9, sp.y * 131.0, sp.z * 2.9)) * 0.4;
    alb *= 0.86 + 0.3 * streak * (0.5 + 0.5 * bands);
    // a great storm with a dark collar and a turbulent wake
    vec2 sc = vec2(lon * 0.55, lat) - vec2(0.5, -0.26);
    vec2 sw = sc * vec2(1.0, 1.9);
    float rs = dot(sw, sw);
    float storm = exp(-rs * 26.0);
    float collar = exp(-pow((sqrt(rs) - 0.25) / 0.05, 2.0));
    float swirl = 0.5 + 0.5 * sin(atan(sw.y, sw.x) * 2.0 + sqrt(rs) * 46.0 + t1 * 2.0);
    float wake = exp(-pow((lat + 0.26) / 0.07, 2.0)) * smoothstep(0.1, 0.45, sc.x) * smoothstep(1.2, 0.4, sc.x);
    alb = mix(alb, mix(uA, uB, 0.5 + 0.5 * eddy), wake * 0.55);
    alb = mix(alb, uC * 0.72, collar * 0.45);
    alb = mix(alb, mix(uC * 1.25 + 0.04, uB, swirl * 0.55), storm * 0.9);
    // a second, paler storm on the far side, and a string of small ovals
    vec2 s2 = (vec2((lon < 0.0 ? lon + 6.2832 : lon) * 0.55, lat) - vec2(2.25, 0.22)) * vec2(1.0, 1.8);
    float r2 = dot(s2, s2);
    alb = mix(alb, uC * 0.8, exp(-pow((sqrt(r2) - 0.17) / 0.04, 2.0)) * 0.35);
    alb = mix(alb, uB * 1.1, exp(-r2 * 60.0) * 0.85);
    // a dark barge a third of the way round, so some storm is in view from any side
    vec2 s3 = (vec2((lon < -1.0 ? lon + 6.2832 : lon) * 0.55, lat) - vec2(1.35, -0.06)) * vec2(1.0, 2.6);
    float r3 = dot(s3, s3);
    alb = mix(alb, uC * 0.62, exp(-r3 * 95.0) * 0.85);
    alb = mix(alb, uB, exp(-pow((sqrt(r3) - 0.13) / 0.03, 2.0)) * 0.3);
    float pl = lat - 0.36;
    alb = mix(alb, uB * 1.12, exp(-pl * pl * 900.0) * smoothstep(0.6, 0.95, 0.5 + 0.5 * sin(lon * 9.0 + uSeed)) * 0.75);
    // polar hoods
    alb = mix(alb, mix(uC, uA, 0.4) * 0.8, smoothstep(0.6, 0.95, abs(lat)) * 0.7);
    h = 0.0;
  } else if (uType == 4) {               // ocean world
    float cont = fbm5(sp * 1.3);
    float land = smoothstep(0.02, 0.11, cont);
    float elev = smoothstep(0.1, 0.6, cont);
    vec3 sea = mix(uA * 0.5, uA, smoothstep(-0.5, 0.05, cont));
    alb = mix(sea, mix(uB, uC, elev), land);
    float cap = smoothstep(0.8, 0.9, abs(p.y) + cont * 0.08);
    alb = mix(alb, vec3(0.9, 0.93, 0.95), cap);
    gloss = (1.0 - land) * 0.9;
    h = land * elev * 0.045;
    cloud = smoothstep(0.1, 0.5, fbm5(spin(p, uTime * 0.007) * 2.5 + 9.0 + uSeed)) * 0.85;
  } else if (uType == 2) {               // ice
    float n = fbm5(sp * 1.6);
    float crack = pow(clamp(1.0 - abs(snoise(sp * 3.1 + n * 0.8)), 0.0, 1.0), 9.0);
    float crack2 = pow(clamp(1.0 - abs(snoise(sp * 7.4 - n)), 0.0, 1.0), 12.0);
    alb = mix(uA, uB, smoothstep(-0.4, 0.5, n));
    alb = mix(alb, uC, clamp(crack * 0.9 + crack2 * 0.5, 0.0, 1.0));
    gloss = 0.45; h = n * 0.03 - crack * 0.03;
  } else if (uType == 3) {               // desert
    float n = fbm5(sp * 1.5);
    float dunes = sin((sp.x + sp.y * 0.6) * 36.0 + n * 9.0) * 0.5 + 0.5;
    float dark = smoothstep(0.1, 0.5, fbm3(sp * 0.9 + 5.0));
    alb = mix(uA, uB, smoothstep(-0.35, 0.45, n));
    alb = mix(alb, uC, dark * 0.72);
    alb *= 0.93 + 0.09 * dunes;
    float cap = smoothstep(0.85, 0.93, abs(p.y) + n * 0.05);
    alb = mix(alb, vec3(0.86, 0.84, 0.8), cap * 0.8);
    h = n * 0.05 + craters(sp, 2.6) * 0.018;
  } else if (uType == 5) {               // ember: readable crust plates, a few molten seams
    float gap, tone, n, molten;
    h = emberField(sp, gap, tone, n, molten);
    float fissure = smoothstep(0.07, 0.012, gap) * molten;
    float halo = smoothstep(0.32, 0.0, gap) * molten;
    alb = mix(uA, uB, 0.2 + 0.65 * tone) * (0.85 + 0.3 * smoothstep(-0.4, 0.6, n));
    alb *= 0.9 + 0.2 * fbm3(sp * 8.0);
    alb *= 1.0 - 0.55 * smoothstep(0.12, 0.0, gap);       // dark seams between all plates
    float pulse = 0.82 + 0.18 * sin(uTime * 0.5 + tone * 20.0);
    emi = mix(uC * vec3(1.0, 0.42, 0.22), uC * vec3(1.2, 1.0, 0.7), fissure) * (fissure * 1.5 + halo * halo * 0.09) * pulse;
  } else {                                // rock / moon
    float n, cr;
    h = rockField(sp, n, cr);
    float maria = smoothstep(0.05, 0.45, fbm3(sp * 0.8 + 2.0));
    alb = mix(uA, uB, smoothstep(-0.4, 0.5, n));
    alb = mix(alb, uC, maria * 0.6);
    alb *= 1.0 + clamp(cr, -0.5, 0.4) * 0.16;
    alb *= 0.92 + 0.16 * fbm3(sp * 9.0);                  // fine mottling instead of repeated crater tone
  }

  vec3 G = normalize(vN);
  vec3 L = normalize(uStar - vWorld);
  vec3 V = normalize(cameraPosition - vWorld);
  float geo = dot(G, L);
  float mu = max(dot(G, V), 0.0);
  bool gas = uType == 1;
  float ndl = geo;
#if PTYPE != 1
  {
    // Close-up relief. Diffuse shading only needs the slope along the light, so one extra height sample
    // (a step towards the star along the surface) replaces a full normal from two.
    vec3 sx = dFdx(vWorld); vec3 sy = dFdy(vWorld);
    float foot = max(length(sx), length(sy)) / max(uBump, 1.0);
    float k = smoothstep(0.02, 0.0035, foot);
    vec3 d0 = normalize(vObj);
    vec3 lt = vLo - d0 * dot(vLo, d0);
    float st = length(lt);
    if (k > 0.001 && st > 0.02) {
      float e = 0.006;
      float h1 = reliefH(spin(normalize(d0 + (lt / st) * e), uTime * 0.012 + uSeed) + uSeed * 0.37);
      float slope = 0.6 * k * (h1 - h) / e;
      ndl = (geo - slope * st) / sqrt(1.0 + slope * slope);
    }
  }
#endif
  // gas giants scatter light round the terminator; solid bodies keep a crisper edge
  float day = smoothstep(gas ? -0.18 : -0.06, gas ? 0.5 : 0.34, ndl) * smoothstep(-0.14, 0.1, geo);
  vec3 sun = vec3(1.95, 1.66, 1.34);
  vec3 col = alb * day * sun;
  if (gas) col *= mix(0.5, 1.0, pow(mu, 0.45));           // limb darkening: reads as depth of atmosphere
  if (cloud > 0.0) col = mix(col, vec3(1.0, 0.97, 0.93) * smoothstep(-0.1, 0.3, geo) * sun * 0.85, cloud * 0.8);
  col += vec3(1.0, 0.9, 0.75) * pow(max(dot(G, normalize(L + V)), 0.0), 64.0) * gloss * day * 1.3;
  // night side: a cool fill so no body ever vanishes into the sky
  col += alb * vec3(0.05, 0.058, 0.072) * (1.0 + 1.6 * pow(1.0 - mu, 2.0));
  col += emi;
  float fres = pow(1.0 - mu, gas ? 4.5 : 3.0);
  col += uRim * fres * (0.2 + 0.8 * smoothstep(-0.3, 0.4, geo)) * (gas ? 1.35 : 1.0);
  gl_FragColor = vec4(col * uDim, 1.0);
}`

export function makePlanetMaterial(spec: PlanetSpec) {
  const [a, b, c] = resolvePalette(spec)
  const look = PLANET_LOOKS[spec.type]
  return new THREE.ShaderMaterial({
    defines: { PTYPE: TYPE_INDEX[spec.type] },
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uA: { value: a },
      uB: { value: b },
      uC: { value: c },
      uRim: { value: new THREE.Color(look.rim).multiplyScalar(look.rimPower) },
      uSeed: { value: (spec.seed % 97) * 0.731 },
      uTime: { value: 0 },
      uStar: { value: STAR_POS.clone() },
      uDim: { value: 1 },
      uBump: { value: 1 },
    },
  })
}

const RING_FRAG = /* glsl */ `
${SNOISE}
uniform vec3 uB; uniform vec3 uC; uniform vec3 uStar; uniform vec3 uCenter; uniform float uRadius; uniform float uDim; uniform float uSeed;
varying vec3 vObj; varying vec3 vWorld; varying vec3 vN;
void main(){
  float r = length(vObj.xy);              // 1.35 .. 2.25 planet radii
  float t = (r - 1.35) / 0.9;
  // a few broad tonal bands with one clean division, not wire loops
  float broad = 0.5 + 0.5 * snoise(vec3(r * 4.2 + uSeed, 0.0, 0.0));
  float fine = 0.5 + 0.5 * snoise(vec3(r * 21.0, 3.0, uSeed));
  float bands = 0.42 + 0.5 * broad + 0.12 * fine;
  float gapA = smoothstep(0.0, 0.045, abs(t - 0.58));
  float alpha = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.86, t) * (0.45 + 0.55 * broad) * gapA;
  vec3 L = normalize(uStar - vWorld);
  vec3 rel = vWorld - uCenter;
  float along = dot(rel, L);
  float perp = length(rel - along * L);
  float shadow = (along < 0.0 && perp < uRadius) ? 0.12 : 1.0;
  float lit = 0.35 + 0.65 * abs(dot(normalize(vN), L));
  vec3 col = mix(uC, uB, bands) * lit * shadow * 1.5;
  gl_FragColor = vec4(col * uDim, alpha * 0.82);
}`

export function makeRingMaterial(spec: PlanetSpec) {
  const [, b, c] = resolvePalette(spec)
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: RING_FRAG,
    uniforms: {
      uB: { value: b },
      uC: { value: c },
      uStar: { value: STAR_POS.clone() },
      uCenter: { value: new THREE.Vector3() },
      uRadius: { value: 1 },
      uDim: { value: 1 },
      uSeed: { value: spec.seed * 0.37 },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
}
