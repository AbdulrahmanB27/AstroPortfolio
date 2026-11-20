"""Compact egg-shaped single-stage lander (see docs/concepts/rocket_sheet.png).

Azimuths are measured in Blender's XY plane: the panoramic visor is centred on +Y (90 deg, star side),
the hatch on -Y (270 deg, camera side). Ground is z = 0.

Exports public/models/rocket.glb with nodes:
  RocketBody   static hull, legs, ladder (multi-material)
  Hatch        sliding door, origin on the rocket axis (rotate about vertical to slide it round the hull)
  HatchGlow    warm interior plane behind the door (emissive, driven at runtime)
  EngineGlow   liner inside the main nozzle (emissive, driven at runtime)
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(__file__))
from common import *  # noqa

reset()

CER = material('Ceramic', '#d8d3c8', rough=0.5)
CER2 = material('CeramicB', '#c4beb2', rough=0.56)
GRA = material('Graphite', '#2c2f35', rough=0.5, metal=0.3)
UND = material('Underlayer', '#101114', rough=0.85)
MET = material('LegMetal', '#a0a4ab', rough=0.3, metal=1.0)
DKM = material('DarkMetal', '#3c3f45', rough=0.38, metal=1.0)
GLS = material('Glazing', '#120c05', rough=0.05, metal=0.0, coat=1.0, emit='#ffb45a', emit_strength=0.12)
AMB = material('AmberLight', '#2a1c08', rough=0.4, emit='#ffb24a', emit_strength=8.0)
WHT = material('WhiteLight', '#20242a', rough=0.4, emit='#e6efff', emit_strength=6.0)
NOZ = material('Nozzle', '#1b1c20', rough=0.42, metal=0.9)
STR = material('Stripe', '#b9772f', rough=0.55)
THR = material('ThrusterGlow', '#1a1006', rough=0.5, emit='#ff9a3c', emit_strength=3.0)
EGL = material('EngineGlow', '#0a0a0c', rough=0.6, emit='#ffd9a0', emit_strength=0.0)
HGL = material('HatchGlow', '#060607', rough=0.9, emit='#ffcf96', emit_strength=0.0)

Z_BASE, Z_SKIRT, Z_NOSE, Z_TOP = 1.90, 2.52, 8.72, 9.40
R_MAX, Z_MAX = 2.10, 3.05


def rfun(z):
    """Egg profile: half-ellipse below the widest point, fuller super-ellipse up to a rounded nose."""
    if z <= Z_MAX:
        t = min(1.0, (Z_MAX - z) / 2.05)
        return R_MAX * math.sqrt(max(0.0, 1.0 - t * t))
    t = min(1.0, (z - Z_MAX) / (Z_TOP - Z_MAX))
    return R_MAX * math.sqrt(max(0.0, 1.0 - t ** 1.55))


def pol(r, a, z):
    return (r * math.cos(a), r * math.sin(a), z)


def deg(d):
    return math.radians(d)


parts = []


def add(o):
    parts.append(o)
    return o


# ── underlayer (shows through the seams) ────────────────────────────────────
zs = [Z_BASE + i * (Z_TOP - 0.03 - Z_BASE) / 70 for i in range(71)]
add(lathe('Under', [(max(rfun(z) - 0.028, 0.0), z) for z in zs] + [(0.0, Z_TOP - 0.04)], 72, UND))

# ── graphite skirt + underside ──────────────────────────────────────────────
add(lathe('Skirt', [(1.60, 1.80), (1.74, 1.86)] + [(rfun(z) + 0.02, z) for z in (1.92, 2.05, 2.2, 2.35, 2.46)]
          + [(rfun(2.50) + 0.035, 2.49), (rfun(2.56) + 0.035, 2.57), (rfun(2.58) - 0.01, 2.60)], 72, GRA, angle=30))
add(lathe('Underside', [(1.60, 1.80), (1.36, 1.68), (0.95, 1.60), (0.70, 1.60), (0.66, 1.66), (0.66, 1.95), (0.0, 1.95)],
          64, NOZ, angle=40))
add(torus('UndersideRing', 1.22, 0.035, (0, 0, 1.655), mat=DKM, seg=64, rseg=8))
for i in range(16):
    a = deg(i * 22.5 + 11.25)
    if abs(((i * 22.5 + 11.25) % 90) - 45) < 14:
        continue
    add(box('SkirtBlock', (0.07, 0.30, 0.34), pol(rfun(2.2) + 0.04, a, 2.2), (0, deg(-22), a), DKM, bev=0.02))
for a_deg in (200, 250, 290, 340, 20, 160):
    add(box('SkirtMarker', (0.05, 0.16, 0.06), pol(rfun(2.34) + 0.045, deg(a_deg), 2.36), (0, deg(-14), deg(a_deg)), AMB, bev=0.012))

# ── main engine ─────────────────────────────────────────────────────────────
add(cyl('EngineMount', 0.60, 0.34, (0, 0, 1.50), mat=DKM, segs=40, bev=0.02))
add(lathe('Bell', [(0.34, 1.40), (0.44, 1.36), (0.50, 1.22), (0.66, 0.96), (0.84, 0.72), (0.935, 0.57), (0.95, 0.54),
                   (0.915, 0.54), (0.80, 0.72), (0.63, 0.95), (0.46, 1.22), (0.36, 1.34), (0.0, 1.34)], 56, NOZ, angle=50))
add(torus('BellRingA', 0.735, 0.03, (0, 0, 0.88), mat=DKM, seg=56, rseg=8))
add(torus('BellRingB', 0.56, 0.026, (0, 0, 1.13), mat=DKM, seg=56, rseg=8))
engine_glow = lathe('EngineGlow', [(0.0, 1.325), (0.345, 1.325), (0.45, 1.21), (0.62, 0.95), (0.79, 0.72)], 40, EGL, angle=180)
engine_glow.data.flip_normals()
for i in range(4):
    a = deg(i * 90)
    v = lathe('Thruster', [(0.10, 0.40), (0.14, 0.36), (0.15, 0.20), (0.24, 0.0), (0.21, 0.0), (0.12, 0.20), (0.0, 0.20)], 24, NOZ, angle=50)
    xf(v, pol(1.22, a, 1.28), (0, deg(6), a))
    add(v)
    g = cyl('ThrusterGlow', 0.115, 0.01, (0, 0, 0.195), mat=THR, segs=20)
    xf(g, pol(1.22, a, 1.28), (0, deg(6), a))
    add(g)

# ── visor geometry (panoramic window centred on +Y) ─────────────────────────
VC = deg(90)
VA = deg(116)
VH = 0.80
ZB0, ZB1 = 5.62, 7.36          # hull rows replaced by the visor band


def v_half(a):
    u = min(1.0, abs(a - VC) / VA)
    return VH * (1.0 - u ** 3.4) ** (1 / 3.4)


def v_mid(a):
    u = (a - VC) / VA
    return 6.50 - 0.13 * u * u


def v_lo(a):
    return v_mid(a) - v_half(a)


def v_hi(a):
    return v_mid(a) + v_half(a)


# ── hull plating ────────────────────────────────────────────────────────────
rows = [(Z_SKIRT + 0.08, 3.62, 10, 0), (3.62, 4.70, 10, 18), (4.70, ZB0, 10, 0),
        (ZB1, 8.08, 6, 20), (8.08, Z_NOSE, 6, 50)]
k = 0
for (z0, z1, ncol, off) in rows:
    for ci in range(ncol):
        a0 = deg(ci * 360 / ncol + off)
        a1 = deg((ci + 1) * 360 / ncol + off)
        mat = CER2 if (k * 7) % 11 in (0, 4) else CER
        add(hull_patch('Plate', rfun, a0, a1, z0, z1, mat, gap=0.011, thick=0.03, nz=5, na=6))
        k += 1
# band rows on the camera side (outside the visor cowl)
B0, B1 = VC + VA + deg(5), VC - VA - deg(5) + 2 * math.pi
for (z0, z1, n) in ((ZB0, 6.50, 3), (6.50, ZB1, 3)):
    for ci in range(n):
        a0 = B0 + (B1 - B0) * ci / n
        a1 = B0 + (B1 - B0) * (ci + 1) / n
        add(hull_patch('BandPlate', rfun, a0, a1, z0, z1, CER2 if ci == 1 and z0 > 6 else CER, gap=0.011, thick=0.03, nz=5, na=6))
# cowl above / below the glass
CA0, CA1 = VC - VA - deg(5), VC + VA + deg(5)
n_c = 6
for ci in range(n_c):
    a0 = CA0 + (CA1 - CA0) * ci / n_c
    a1 = CA0 + (CA1 - CA0) * (ci + 1) / n_c
    add(hull_patch('CowlLow', rfun, a0, a1, ZB0, lambda a: v_lo(a) - 0.075, CER, gap=0.011, thick=0.03, nz=3, na=10))
    add(hull_patch('CowlHigh', rfun, a0, a1, lambda a: v_hi(a) + 0.075, ZB1, CER, gap=0.011, thick=0.03, nz=3, na=10))
# glass, recessed slightly
add(hull_patch('Glazing', rfun, VC - VA, VC + VA, v_lo, v_hi, GLS, gap=0.0, thick=0.0, nz=8, na=64, lift=-0.035, bev=0.0))
shade(parts[-1], 180)
# gasket frame following the visor outline
outline = []
N = 72
for i in range(N + 1):
    a = (VC - VA * 0.996) + 2 * VA * 0.996 * i / N
    outline.append(pol(rfun(v_hi(a)) + 0.012, a, v_hi(a) + 0.03))
for i in range(N + 1):
    a = (VC + VA * 0.996) - 2 * VA * 0.996 * i / N
    outline.append(pol(rfun(v_lo(a)) + 0.012, a, v_lo(a) - 0.03))
add(tube('VisorGasket', outline, 0.05, DKM, res=3, cyclic=True))
for da in (-64, -22, 22, 64):
    a = VC + deg(da)
    add(hull_patch('Mullion', rfun, a - deg(1.3), a + deg(1.3), v_lo(a) - 0.02, v_hi(a) + 0.02, DKM, gap=0.0, thick=0.06, nz=6, na=1, lift=0.0, bev=0.006))

# nose cap + beacon
add(lathe('NoseCap', [(rfun(z) + 0.014, z) for z in [Z_NOSE + i * (9.36 - Z_NOSE) / 12 for i in range(13)]] + [(0.0, Z_TOP + 0.012)],
          48, CER2, angle=60))
add(lathe('NoseRing', [(rfun(Z_NOSE) + 0.005, Z_NOSE - 0.05), (rfun(Z_NOSE) + 0.03, Z_NOSE - 0.03), (rfun(Z_NOSE + 0.04) + 0.03, Z_NOSE + 0.04),
                       (rfun(Z_NOSE + 0.06) + 0.005, Z_NOSE + 0.06)], 48, DKM, angle=30))
add(cyl('Beacon', 0.045, 0.09, (0, 0, Z_TOP + 0.05), mat=AMB, segs=16, bev=0.012))

# ── hatch assembly (-Y) ─────────────────────────────────────────────────────
HA = deg(270)
HZ0, HZ1 = 2.64, 4.62
add(hull_patch('HatchFrame', rfun, HA - deg(20.5), HA + deg(20.5), HZ0 - 0.14, HZ1 + 0.14, GRA,
               gap=0.0, thick=0.10, nz=8, na=10, lift=0.05, bev=0.022))
hatch_glow = hull_patch('HatchGlow', rfun, HA - deg(15.5), HA + deg(15.5), HZ0 + 0.02, HZ1 - 0.02, HGL,
                        gap=0.0, thick=0.0, nz=5, na=6, lift=0.02, bev=0.0)
door = hull_patch('Door', rfun, HA - deg(16), HA + deg(16), HZ0, HZ1, CER, gap=0.012, thick=0.05, nz=8, na=10, lift=0.085, bev=0.014)
door_parts = [door]
RH = rfun(4.05)
door_parts.append(hull_patch('DoorWindow', rfun, HA - deg(5.2), HA + deg(5.2), 3.86, 4.26, GLS, gap=0.0, thick=0.02, nz=2, na=4, lift=0.094, bev=0.006))
door_parts.append(hull_patch('DoorWindowFrame', rfun, HA - deg(6.6), HA + deg(6.6), 3.81, 4.31, DKM, gap=0.0, thick=0.02, nz=2, na=4, lift=0.090, bev=0.008))
hy = HA + deg(10.5)
door_parts.append(tube('DoorHandle', [pol(rfun(3.5) + 0.095, hy, 3.52), pol(rfun(3.5) + 0.17, hy, 3.50),
                                      pol(rfun(3.2) + 0.17, hy, 3.22), pol(rfun(3.2) + 0.095, hy, 3.20)], 0.018, MET))
door_parts.append(hull_patch('DoorStripe', rfun, HA - deg(13.5), HA + deg(13.5), 2.78, 2.86, STR, gap=0.0, thick=0.008, nz=1, na=8, lift=0.092, bev=0.0))
# lamp + side lights
add(box('HatchLampHousing', (0.50, 0.15, 0.09), pol(rfun(4.84) + 0.10, HA, 4.86), (deg(-6), 0, 0), GRA, bev=0.018))
add(box('HatchLamp', (0.40, 0.05, 0.035), pol(rfun(4.82) + 0.145, HA, 4.825), (deg(-6), 0, 0), WHT, bev=0.008))
for sgn in (-1, 1):
    a = HA + sgn * deg(25.5)
    add(box('HatchSideLight', (0.045, 0.07, 0.26), pol(rfun(3.5) + 0.03, a, 3.5), (0, 0, a), AMB, bev=0.014))
    add(box('HatchSideLightBase', (0.03, 0.11, 0.32), pol(rfun(3.5) + 0.012, a, 3.5), (0, 0, a), DKM, bev=0.012))
# sill step + ladder
PY = -(rfun(HZ0) + 0.05)
add(box('Sill', (1.22, 0.46, 0.07), (0, PY - 0.22, HZ0 - 0.10), mat=DKM, bev=0.014))
for i in range(4):
    add(box('SillSlat', (1.10, 0.05, 0.02), (0, PY - 0.07 - i * 0.105, HZ0 - 0.056), mat=MET, bev=0.004))
for sx in (-1, 1):
    add(tube('SillStrut', [(sx * 0.52, PY - 0.40, HZ0 - 0.13), (sx * 0.52, PY + 0.06, HZ0 - 0.52)], 0.026, DKM))
LT = Vector((0.0, PY - 0.47, HZ0 - 0.09))
LB = Vector((0.0, PY - 1.28, 0.06))
for sx in (-1, 1):
    add(tube('LadderRail', [(sx * 0.27, LT.y + 0.04, LT.z + 0.92), (sx * 0.27, LT.y, LT.z + 0.04), (sx * 0.27, LB.y, LB.z)], 0.032, MET, res=4))
    add(box('LadderFoot', (0.12, 0.16, 0.05), (sx * 0.27, LB.y, 0.025), mat=DKM, bev=0.012))
nr = 8
for i in range(nr):
    t = (i + 0.6) / nr
    p = LT.lerp(LB, t)
    add(tube('Rung', [(-0.27, p.y, p.z), (0.27, p.y, p.z)], 0.02, MET))
for sx in (-1, 1):
    p = LT.lerp(LB, 0.42)
    add(tube('LadderBrace', [(sx * 0.27, p.y, p.z), (sx * 0.34, -(rfun(2.0) - 0.02), 2.02)], 0.018, DKM))

# ── landing legs ────────────────────────────────────────────────────────────
for i in range(4):
    a = deg(45 + i * 90)
    hip = Vector(pol(1.86, a, 2.16))
    knee = Vector(pol(3.02, a, 1.50))
    ankle = Vector(pol(3.30, a, 0.36))
    tang = Vector((-math.sin(a), math.cos(a), 0))
    rad = Vector((math.cos(a), math.sin(a), 0))
    # hip housing on the skirt
    add(box('HipHousing', (0.52, 0.66, 0.62), pol(1.82, a, 2.14), (0, deg(-14), a), GRA, bev=0.05, segs=3))
    # thigh: graphite beam with ceramic cladding on top
    add(strut('Thigh', hip, knee, 0.40, 0.30, GRA, bev=0.045, up=tang))
    d = (knee - hip).normalized()
    n = tang.cross(d).normalized()
    if n.z < 0:
        n = -n
    add(strut('ThighClad', hip.lerp(knee, 0.14) + n * 0.135, hip.lerp(knee, 0.84) + n * 0.135, 0.44, 0.10, CER, bev=0.03, up=tang))
    # shin
    add(strut('Shin', knee, ankle, 0.34, 0.26, GRA, bev=0.04, up=tang))
    d2 = (ankle - knee).normalized()
    n2 = tang.cross(d2).normalized()
    if n2.dot(rad) < 0:
        n2 = -n2
    add(strut('ShinClad', knee.lerp(ankle, 0.20) + n2 * 0.12, knee.lerp(ankle, 0.86) + n2 * 0.12, 0.38, 0.09, CER, bev=0.028, up=tang))
    # joints (axis along the tangent)
    for (p, r, w) in ((hip, 0.27, 0.50), (knee, 0.25, 0.48), (ankle, 0.17, 0.40)):
        c = cyl('Joint', r, w, (0, 0, 0), (deg(90), 0, 0), DKM, segs=28, bev=0.03)
        xf(c, p, (0, 0, a - deg(90) + deg(90)))
        add(c)
        c2 = cyl('JointCap', r * 0.55, w + 0.05, (0, 0, 0), (deg(90), 0, 0), MET, segs=24, bev=0.015)
        xf(c2, p, (0, 0, a))
        add(c2)
    # hydraulic strut from the underside to the shin
    h0 = Vector(pol(1.52, a, 1.76))
    h1 = knee.lerp(ankle, 0.42) - rad * 0.10
    hm = h0.lerp(h1, 0.55)
    add(tube('Piston', [h0, hm], 0.075, DKM, res=5))
    add(tube('PistonRod', [hm, h1], 0.045, MET, res=5))
    add(sphere('PistonEye', 0.085, h0, mat=DKM, segs=16, rings=8))
    # foot
    fx, fy = pol(3.30, a, 0)[0], pol(3.30, a, 0)[1]
    f = prism('FootPad', 0.60, 0.12, 6, (0, 0, 0.06), (0, 0, deg(30)), DKM, bev=0.03, r2=0.50)
    xf(f, (fx, fy, 0.0), (0, 0, a))
    add(f)
    f2 = prism('FootTop', 0.36, 0.11, 6, (0, 0, 0.17), (0, 0, deg(30)), GRA, bev=0.025, r2=0.27)
    xf(f2, (fx, fy, 0.0), (0, 0, a))
    add(f2)
    add(box('KneeLight', (0.05, 0.11, 0.05), knee + n * 0.26 + Vector((0, 0, 0.0)), (0, 0, a), AMB, bev=0.012))

# ── RCS, vents, grab bars, antenna ──────────────────────────────────────────
for a_deg in (0, 180, 228, 312):
    a = deg(a_deg)
    z = 5.12
    add(hull_patch('RcsBlister', rfun, a - deg(5.5), a + deg(5.5), z - 0.19, z + 0.19, GRA, gap=0.0, thick=0.05, nz=3, na=4, lift=0.05, bev=0.02))
    for (dz, da) in ((0.09, -2.6), (0.09, 2.6), (-0.09, -2.6), (-0.09, 2.6)):
        nz_ = lathe('RcsNoz', [(0.03, 0.0), (0.055, 0.06), (0.042, 0.06), (0.0, 0.01)], 14, NOZ, angle=60)
        xf(nz_, (0, 0, 0), (0, deg(90), 0))
        xf(nz_, (rfun(z + dz) + 0.045, 0, z + dz), (0, 0, 0))
        xf(nz_, (0, 0, 0), (0, 0, a + deg(da)))
        add(nz_)
# louvred vent beside the hatch
for (a_deg, z) in ((307, 3.15), (233, 3.15)):
    a = deg(a_deg)
    add(hull_patch('VentFrame', rfun, a - deg(6.5), a + deg(6.5), z - 0.20, z + 0.20, GRA, gap=0.0, thick=0.04, nz=2, na=4, lift=0.035, bev=0.012))
    for j in range(5):
        zz = z - 0.14 + j * 0.07
        add(hull_patch('VentSlat', rfun, a - deg(5.2), a + deg(5.2), zz - 0.018, zz + 0.018, DKM, gap=0.0, thick=0.02, nz=1, na=4, lift=0.05, bev=0.004))
# grab bars
for (a_deg, z) in ((243, 4.1), (297, 4.1), (205, 3.3), (335, 3.3), (150, 4.3), (30, 4.3)):
    a = deg(a_deg)
    add(tube('GrabBar', [pol(rfun(z + 0.17) + 0.005, a, z + 0.17), pol(rfun(z + 0.17) + 0.085, a, z + 0.15),
                         pol(rfun(z - 0.17) + 0.085, a, z - 0.15), pol(rfun(z - 0.17) + 0.005, a, z - 0.17)], 0.018, MET))
# access panels
for (a_deg, z, h) in ((212, 4.25, 0.5), (328, 4.25, 0.5), (140, 3.1, 0.7), (40, 3.1, 0.7)):
    a = deg(a_deg)
    add(hull_patch('AccessPanel', rfun, a - deg(6), a + deg(6), z - h / 2, z + h / 2, CER2, gap=0.0, thick=0.02, nz=3, na=4, lift=0.014, bev=0.008))
# whip antenna + small dish on the upper camera side
aw = deg(222)
add(cyl('WhipBase', 0.05, 0.14, pol(rfun(7.75) - 0.02, aw, 7.80), mat=DKM, segs=16, bev=0.012))
add(tube('Whip', [pol(rfun(7.75) - 0.02, aw, 7.84), pol(rfun(7.75) + 0.10, aw, 9.75)], 0.012, MET))
ad = deg(318)
base = Vector(pol(rfun(7.55) - 0.03, ad, 7.55))
tip = Vector(pol(rfun(7.55) + 0.36, ad, 8.02))
add(tube('DishMast', [base, tip], 0.03, DKM))
dish = lathe('Dish', [(0.0, 0.0), (0.12, 0.012), (0.24, 0.05), (0.33, 0.11), (0.34, 0.095), (0.24, 0.03), (0.12, -0.005), (0.0, -0.016)], 32, CER, angle=60)
xf(dish, (0, 0, 0), (deg(58), 0, 0))
xf(dish, (0, 0, 0), (0, 0, ad + deg(90)))
xf(dish, tip + Vector((0, 0, 0.04)))
add(dish)
# accent stripe ring segment on the camera side
add(hull_patch('Stripe', rfun, deg(196), deg(344), 4.74, 4.83, STR, gap=0.0, thick=0.006, nz=1, na=40, lift=0.004, bev=0.0))

# ── assemble ────────────────────────────────────────────────────────────────
log('parts:', len(parts))
body = join(parts, 'RocketBody')
hatch = join(door_parts, 'Hatch')
set_origin(hatch, (0, 0, 3.63))
for o in (body, hatch):
    shade(o, 40)

bake_ao([body, hatch, hatch_glow, engine_glow], samples=64, distance=1.6)
for o in (hatch_glow, engine_glow):
    ca = o.data.color_attributes.active_color
    for dd in ca.data:
        dd.color = (1, 1, 1, 1)

export_glb(os.path.join(MODELS, 'rocket.glb'), [body, hatch, hatch_glow, engine_glow])

if '--no-preview' not in sys.argv:
    preview(os.path.join(WORK, 'rocket_a.png'), (-7.5, -17.0, 4.6), (0, 0, 4.4), lens=52, res=(1000, 1100),
            sun_dir=(-0.6, -0.5, 0.45), ground=True, samples=24)
    preview(os.path.join(WORK, 'rocket_b.png'), (-6.0, -18.0, 2.4), (0, 0, 4.6), lens=50, res=(1000, 1100),
            sun_dir=(0.3, 0.9, 0.16), sun_strength=7, ground=True, fill_strength=0.8, samples=24)
