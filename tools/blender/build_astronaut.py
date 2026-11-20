"""Stylised astronaut puppet (see docs/concepts/astronaut_sheet.png).

Faces +Y (the star); the home camera sees the back (-Y). Feet on z = 0, ~1.87 m tall.
Rigid hierarchy with pivots at the joints so the site can pose it with node rotations:

  Astronaut > Hips > Torso > Head
                           > ArmL > ForearmL      (L = -X)
                           > ArmR > ForearmR
                   > ThighL > ShinL
                   > ThighR > ShinR
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(__file__))
from common import *  # noqa

reset()

FAB = material('SuitFabric', '#cbc1ab', rough=0.86)
FAB2 = material('SuitFabricB', '#b9ae97', rough=0.88)
ARM = material('Ceramic', '#d8d3c8', rough=0.5)
RUB = material('SuitRubber', '#24262a', rough=0.78)
GRA = material('Graphite', '#2c2f35', rough=0.5, metal=0.3)
DKM = material('DarkMetal', '#3c3f45', rough=0.38, metal=1.0)
MET = material('LegMetal', '#a0a4ab', rough=0.3, metal=1.0)
VIS = material('Visor', '#b98a34', rough=0.1, metal=1.0)
AMB = material('AmberLight', '#2a1c08', rough=0.4, emit='#ffb24a', emit_strength=8.0)


def deg(d):
    return math.radians(d)


def loft(name, rings, mat, segs=20, sub=2):
    """Skin elliptical rings (cx, cy, z, rx, ry) into a soft volume."""
    bm = bmesh.new()
    vr = []
    for (cx, cy, z, rx, ry) in rings:
        vr.append([bm.verts.new((cx + rx * math.cos(2 * math.pi * i / segs),
                                 cy + ry * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)])
    for a, b in zip(vr[:-1], vr[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(vr[0])))
    bm.faces.new(vr[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = from_bm(name, bm, mat)
    if sub:
        subsurf(ob, sub)
        realize(ob)
    return shade(ob, 180)


def ribbed(name, cx, cy, z0, z1, r, ribs, depth, mat, sx=1.0, sy=1.0, segs=28):
    """Bellows joint: a scalloped body of revolution."""
    prof = [(r * 0.86, z0 - 0.004)]
    n = ribs * 6
    for k in range(n + 1):
        z = z0 + (z1 - z0) * k / n
        prof.append((r + depth * (0.5 - 0.5 * math.cos(2 * math.pi * k / 6)), z))
    prof.append((r * 0.86, z1 + 0.004))
    ob = lathe(name, prof, segs, mat, angle=180)
    xf(ob, (cx, cy, 0), (0, 0, 0), (sx, sy, 1))
    return ob


def plate(name, cx, cy, r, a_mid, a_span, z0, z1, mat, thick=0.014, lift=0.0, na=8, nz=4, bev=0.004):
    """Curved armour plate wrapped round a limb of radius r, centred on azimuth a_mid (degrees)."""
    ob = hull_patch(name, lambda z: r, deg(a_mid - a_span / 2), deg(a_mid + a_span / 2), z0, z1, mat,
                    gap=0.0, thick=thick, nz=nz, na=na, lift=lift, bev=bev)
    xf(ob, (cx, cy, 0))
    return ob


def group(name, objs, pivot):
    ob = join(objs, name)
    shade(ob, 50)
    set_origin(ob, pivot)
    return ob


# ════════════════════════════════════════════════════════════════ hips ══
hips_parts = [
    loft('Pelvis', [(0, 0, 0.80, 0.07, 0.08), (0, 0, 0.86, 0.19, 0.138), (0, 0, 0.955, 0.208, 0.148),
                    (0, -0.004, 1.035, 0.19, 0.138), (0, -0.004, 1.06, 0.15, 0.11)], FAB, segs=24),
    # belt
    lathe('Belt', [(1.0, 1.005), (1.035, 1.012), (1.035, 1.058), (1.0, 1.065)], 40, RUB, angle=40),
]
xf(hips_parts[-1], (0, -0.004, 0), (0, 0, 0), (0.196, 0.146, 1))
hips_parts.append(box('Buckle', (0.075, 0.022, 0.05), (0, 0.146, 1.035), mat=DKM, bev=0.006))
for sx in (-1, 1):
    hips_parts.append(box('BeltPouch', (0.085, 0.05, 0.095), (sx * 0.135, -0.118, 1.00), (0, 0, deg(-sx * 28)), FAB2, bev=0.012))
    hips_parts.append(box('BeltPouchFlap', (0.089, 0.054, 0.03), (sx * 0.135, -0.118, 1.036), (0, 0, deg(-sx * 28)), FAB, bev=0.008))
    hips_parts.append(box('SidePouch', (0.045, 0.09, 0.085), (sx * 0.214, 0.0, 0.985), mat=FAB2, bev=0.01))
hips = group('Hips', hips_parts, (0, 0, 0.98))

# ═══════════════════════════════════════════════════════════════ torso ══
tp = [
    loft('Chest', [(0, 0, 1.03, 0.165, 0.118), (0, 0, 1.075, 0.186, 0.136), (0, 0.004, 1.17, 0.200, 0.148), (0, 0.008, 1.29, 0.236, 0.162),
                   (0, 0.006, 1.40, 0.262, 0.160), (0, 0, 1.475, 0.248, 0.142), (0, -0.004, 1.53, 0.14, 0.112), (0, -0.004, 1.555, 0.095, 0.092)],
         FAB, segs=28),
    ribbed('Collar', 0, -0.004, 1.515, 1.565, 0.108, 2, 0.008, RUB),
    torus('NeckRing', 0.118, 0.02, (0, -0.004, 1.572), mat=DKM, seg=40, rseg=10),
    # waist bellows
    ribbed('Waist', 0, 0, 1.055, 1.10, 1.0, 2, 0.02, FAB2, sx=0.196, sy=0.144),
]
# shoulder yokes + harness
for sx in (-1, 1):
    tp.append(sphere('ShoulderBall', 0.088, (sx * 0.272, 0, 1.445), mat=RUB, segs=24, rings=12))
    tp.append(torus('ShoulderRing', 0.09, 0.014, (sx * 0.242, 0, 1.447), (0, deg(90 - sx * 18), 0), DKM, seg=28, rseg=8))
# chest control unit
tp.append(box('ChestUnit', (0.21, 0.07, 0.125), (0, 0.185, 1.30), (deg(-6), 0, 0), ARM, bev=0.016, segs=3))
tp.append(cyl('ChestDial', 0.032, 0.02, (-0.055, 0.224, 1.305), (deg(84), 0, 0), DKM, segs=20, bev=0.004))
tp.append(cyl('ChestDialCap', 0.018, 0.026, (-0.055, 0.226, 1.305), (deg(84), 0, 0), MET, segs=16, bev=0.003))
for i in range(3):
    tp.append(box('ChestLed', (0.014, 0.008, 0.03), (0.02 + i * 0.026, 0.223, 1.318), (deg(-6), 0, 0), AMB, bev=0.003))
tp.append(box('ChestSlot', (0.085, 0.008, 0.016), (0.045, 0.222, 1.272), (deg(-6), 0, 0), DKM, bev=0.003))
# hoses from chest unit round the ribs to the pack
for sx in (-1, 1):
    tp.append(tube('Hose', [(sx * 0.085, 0.20, 1.245), (sx * 0.13, 0.215, 1.19), (sx * 0.205, 0.15, 1.15), (sx * 0.245, 0.02, 1.155),
                            (sx * 0.225, -0.11, 1.19), (sx * 0.185, -0.17, 1.22)], 0.021, RUB, res=4, smooth=True))
    tp.append(cyl('HoseSocket', 0.03, 0.03, (sx * 0.085, 0.203, 1.248), (deg(60), 0, 0), DKM, segs=16, bev=0.005))

# ── life-support pack (dominant in the opening shot) ────────────────────────
PY = -0.262           # pack centre depth
tp.append(box('PackCore', (0.40, 0.19, 0.60), (0, PY, 1.285), mat=ARM, bev=0.035, segs=4))
tp.append(box('PackYoke', (0.33, 0.13, 0.10), (0, PY + 0.05, 1.555), mat=FAB2, bev=0.03, segs=3))
tp.append(box('PackSpine', (0.24, 0.05, 0.50), (0, PY + 0.10, 1.29), mat=RUB, bev=0.012))
# raised back plate with recessed centre panel
tp.append(box('PackPlate', (0.30, 0.035, 0.40), (0, PY - 0.105, 1.325), mat=ARM, bev=0.02, segs=3))
tp.append(box('PackPanel', (0.19, 0.02, 0.20), (0, PY - 0.124, 1.365), mat=GRA, bev=0.008))
for i in range(3):
    tp.append(box('PackLed', (0.05, 0.012, 0.016), (0, PY - 0.135, 1.335 + i * 0.03), mat=AMB, bev=0.004))
tp.append(box('PackLabel', (0.07, 0.008, 0.022), (0, PY - 0.132, 1.435), mat=DKM, bev=0.003))
# vent grille
tp.append(box('PackVent', (0.20, 0.03, 0.085), (0, PY - 0.105, 1.07), mat=GRA, bev=0.01))
for i in range(5):
    tp.append(box('PackVentSlat', (0.17, 0.012, 0.007), (0, PY - 0.123, 1.042 + i * 0.014), mat=DKM, bev=0.002))
# side canisters + corner blocks
for sx in (-1, 1):
    tp.append(cyl('PackTank', 0.048, 0.40, (sx * 0.222, PY - 0.01, 1.27), mat=GRA, segs=20, bev=0.014))
    tp.append(cyl('PackTankCap', 0.036, 0.03, (sx * 0.222, PY - 0.01, 1.485), mat=MET, segs=18, bev=0.006))
    tp.append(box('PackClampA', (0.03, 0.115, 0.03), (sx * 0.222, PY - 0.01, 1.37), mat=DKM, bev=0.006))
    tp.append(box('PackClampB', (0.03, 0.115, 0.03), (sx * 0.222, PY - 0.01, 1.15), mat=DKM, bev=0.006))
    tp.append(box('PackCorner', (0.075, 0.06, 0.075), (sx * 0.168, PY - 0.085, 1.555), (0, deg(sx * 0), 0), GRA, bev=0.016))
    tp.append(box('PackFoot', (0.085, 0.06, 0.05), (sx * 0.145, PY - 0.08, 0.995), mat=GRA, bev=0.012))
tp.append(tube('PackHandle', [(-0.085, PY - 0.02, 1.585), (-0.085, PY - 0.02, 1.63), (0.085, PY - 0.02, 1.63), (0.085, PY - 0.02, 1.585)], 0.012, MET))
tp.append(cyl('PackAntennaBase', 0.02, 0.04, (-0.155, PY + 0.03, 1.61), mat=DKM, segs=14, bev=0.004))
tp.append(tube('PackAntenna', [(-0.155, PY + 0.03, 1.62), (-0.158, PY + 0.02, 1.93)], 0.006, MET))
tp.append(box('PackBeacon', (0.03, 0.03, 0.022), (0.155, PY + 0.03, 1.617), mat=AMB, bev=0.006))
torso = group('Torso', tp, (0, 0, 1.08))

# ════════════════════════════════════════════════════════════════ head ══
HC = (0, 0.004, 1.70)
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=56, v_segments=28, radius=0.158)
kill = []
for f in bm.faces:
    c = f.calc_center_median().normalized()
    az = math.degrees(math.atan2(c.x, c.y))
    el = math.degrees(math.asin(max(-1, min(1, c.z))))
    if (abs(az) / 66) ** 4 + (abs(el - 4) / 36) ** 4 < 1.0:
        kill.append(f)
bmesh.ops.delete(bm, geom=kill, context='FACES')
shell = from_bm('HelmetShell', bm, ARM)
solidify(shell, 0.016, -1.0)
bevel(shell, 0.004, 2, angle=40)
realize(shell)
xf(shell, HC, (0, 0, 0), (1.0, 1.04, 1.05))
shade(shell, 50)
hp = [shell]
hp.append(sphere('VisorGlass', 0.146, HC, (1.0, 1.04, 1.05), VIS, segs=40, rings=20))
# visor gasket
gasket = []
for i in range(64):
    t = 2 * math.pi * i / 64
    ca, sa = math.cos(t), math.sin(t)
    u = (abs(ca) ** (2 / 4)) * (1 if ca >= 0 else -1) * 66
    v = (abs(sa) ** (2 / 4)) * (1 if sa >= 0 else -1) * 36 + 4
    azr, elr = math.radians(u), math.radians(v)
    d = Vector((math.sin(azr) * math.cos(elr), math.cos(azr) * math.cos(elr), math.sin(elr)))
    gasket.append((HC[0] + d.x * 0.159, HC[1] + d.y * 0.159 * 1.04, HC[2] + d.z * 0.159 * 1.05))
hp.append(tube('VisorGasket', gasket, 0.0085, RUB, res=3, cyclic=True))
for sx in (-1, 1):
    hp.append(cyl('EarCup', 0.062, 0.04, (sx * 0.156, -0.006, 1.695), (0, deg(90), 0), GRA, segs=28, bev=0.008))
    hp.append(torus('EarRing', 0.043, 0.006, (sx * 0.178, -0.006, 1.695), (0, deg(90), 0), AMB, seg=28, rseg=6))
    hp.append(cyl('EarCap', 0.03, 0.012, (sx * 0.18, -0.006, 1.695), (0, deg(90), 0), DKM, segs=20, bev=0.003))
    hp.append(box('JawBlock', (0.035, 0.085, 0.045), (sx * 0.138, 0.05, 1.612), (deg(-30), 0, deg(-sx * 10)), GRA, bev=0.01))
hp.append(box('RearUnit', (0.15, 0.05, 0.085), (0, -0.143, 1.648), (deg(14), 0, 0), GRA, bev=0.014, segs=3))
hp.append(box('RearVent', (0.09, 0.012, 0.03), (0, -0.172, 1.644), (deg(14), 0, 0), DKM, bev=0.003))
hp.append(strut('CrownRidge', (0, 0.10, 1.828), (0, -0.108, 1.824), 0.05, 0.016, ARM, bev=0.006, up=(1, 0, 0)))
hp.append(box('CrownLamp', (0.04, 0.028, 0.022), (0.0, 0.112, 1.834), (deg(-28), 0, 0), DKM, bev=0.005))
hp.append(ribbed('NeckSeal', 0, -0.004, 1.565, 1.60, 0.118, 1, 0.008, RUB))
head = group('Head', hp, (0, -0.004, 1.585))

# ════════════════════════════════════════════════════════════════ arms ══


def build_arm(sx):
    X = sx * 0.292
    S = (X, 0.0, 1.445)
    up = [
        loft('UpperArm', [(X, 0, 1.475, 0.066, 0.068), (X, 0, 1.42, 0.084, 0.086), (X, 0, 1.33, 0.082, 0.085), (X, 0, 1.24, 0.074, 0.077),
                          (X, 0, 1.185, 0.068, 0.07)], FAB, segs=20),
        ribbed('ShoulderBellows', X, 0, 1.36, 1.43, 0.088, 3, 0.009, RUB),
        sphere('Pauldron', 1.0, (X + sx * 0.012, 0, 1.462), (0.098, 0.106, 0.058), ARM, segs=28, rings=14),
        plate('PauldronRim', X + sx * 0.008, 0, 0.097, 90 - sx * 90, 190, 1.40, 1.445, ARM, thick=0.014, na=12, nz=2),
        plate('BicepBand', X, 0, 0.086, 0, 360, 1.262, 1.288, RUB, thick=0.008, na=20, nz=1, bev=0.002),
    ]
    arm = group('Arm' + ('R' if sx > 0 else 'L'), up, S)
    E = (X, 0.0, 1.17)
    lo = [
        ribbed('ElbowBellows', X, 0, 1.115, 1.22, 0.074, 4, 0.009, RUB),
        loft('Forearm', [(X, 0, 1.15, 0.064, 0.066), (X, 0, 1.08, 0.072, 0.074), (X, 0, 0.98, 0.067, 0.069), (X, 0, 0.905, 0.057, 0.059)], FAB, segs=20),
        plate('ForearmPlate', X, 0, 0.081, 90 - sx * 90 - sx * 30, 205, 0.935, 1.10, ARM, thick=0.014, na=10, nz=4),
        torus('Cuff', 0.061, 0.014, (X, 0, 0.898), mat=DKM, seg=28, rseg=8),
        ribbed('WristBellows', X, 0, 0.862, 0.895, 0.054, 2, 0.006, RUB),
        loft('Palm', [(X, 0.004, 0.868, 0.05, 0.033), (X, 0.006, 0.83, 0.055, 0.035), (X, 0.008, 0.785, 0.052, 0.031), (X, 0.012, 0.765, 0.044, 0.026)], RUB, segs=16),
        loft('Fingers', [(X, 0.012, 0.775, 0.046, 0.026), (X, 0.02, 0.74, 0.044, 0.025), (X, 0.034, 0.705, 0.038, 0.023), (X, 0.045, 0.69, 0.028, 0.017)], RUB, segs=16),
        loft('Thumb', [(X - sx * 0.04, 0.022, 0.83, 0.019, 0.019), (X - sx * 0.055, 0.036, 0.80, 0.018, 0.018), (X - sx * 0.057, 0.046, 0.772, 0.013, 0.013)], RUB, segs=10),
        box('GlovePlate', (0.075, 0.012, 0.058), (X, -0.034, 0.83), mat=GRA, bev=0.006),
    ]
    fore = group('Forearm' + ('R' if sx > 0 else 'L'), lo, E)
    return arm, fore


armL, foreL = build_arm(-1)
armR, foreR = build_arm(1)

# ════════════════════════════════════════════════════════════════ legs ══


def build_leg(sx):
    X = sx * 0.122
    H = (X, 0.0, 0.925)
    th = [
        loft('Thigh', [(X, 0, 0.96, 0.095, 0.105), (X, 0, 0.88, 0.116, 0.122), (X, 0, 0.76, 0.110, 0.115), (X, 0, 0.64, 0.097, 0.101),
                       (X, 0, 0.565, 0.088, 0.092)], FAB, segs=22),
        plate('ThighStrap', X, 0, 0.119, 0, 360, 0.80, 0.83, RUB, thick=0.008, na=22, nz=1, bev=0.002),
        box('ThighPocket', (0.04, 0.12, 0.15), (X + sx * 0.122, 0.0, 0.715), (0, deg(sx * 4), 0), FAB2, bev=0.012),
        box('ThighPocketFlap', (0.045, 0.126, 0.042), (X + sx * 0.124, 0.0, 0.777), (0, deg(sx * 4), 0), FAB, bev=0.008),
        plate('ThighPlate', X, 0, 0.121, 90, 105, 0.625, 0.775, ARM, thick=0.014, na=8, nz=4),
    ]
    thigh = group('Thigh' + ('R' if sx > 0 else 'L'), th, H)
    K = (X, 0.0, 0.515)
    sh = [
        ribbed('KneeBellows', X, 0, 0.445, 0.585, 0.093, 5, 0.01, RUB),
        plate('KneePad', X, 0, 0.112, 90, 140, 0.46, 0.575, ARM, thick=0.02, na=10, nz=5, bev=0.006),
        loft('Shin', [(X, 0, 0.47, 0.088, 0.09), (X, -0.004, 0.38, 0.092, 0.098), (X, -0.002, 0.26, 0.084, 0.088), (X, 0, 0.165, 0.077, 0.079)], FAB, segs=22),
        plate('ShinPlate', X, 0, 0.106, 90, 200, 0.205, 0.425, ARM, thick=0.016, na=12, nz=5),
        plate('CalfStrapA', X, 0, 0.104, 270, 175, 0.385, 0.41, RUB, thick=0.008, na=10, nz=1, bev=0.002),
        plate('CalfStrapB', X, 0, 0.097, 270, 175, 0.245, 0.27, RUB, thick=0.008, na=10, nz=1, bev=0.002),
        ribbed('AnkleBellows', X, 0, 0.135, 0.185, 0.083, 2, 0.008, RUB),
        loft('BootUpper', [(X, 0.006, 0.15, 0.08, 0.085), (X, 0.02, 0.105, 0.086, 0.112), (X, 0.034, 0.06, 0.084, 0.142), (X, 0.036, 0.04, 0.08, 0.14)], FAB2, segs=22),
        box('ToeCap', (0.146, 0.112, 0.08), (X, 0.132, 0.066), mat=GRA, bev=0.03, segs=4),
        box('Sole', (0.166, 0.335, 0.044), (X, 0.034, 0.022), mat=RUB, bev=0.012, segs=3),
        box('HeelBlock', (0.136, 0.064, 0.09), (X, -0.104, 0.08), mat=GRA, bev=0.018, segs=3),
        box('HeelLight', (0.076, 0.008, 0.014), (X, -0.138, 0.08), mat=AMB, bev=0.003),
        box('BootStrap', (0.172, 0.03, 0.022), (X, 0.047, 0.122), (deg(-24), 0, 0), RUB, bev=0.006),
    ]
    for i in range(5):
        sh.append(box('Tread', (0.17, 0.032, 0.012), (X, -0.096 + i * 0.066, 0.004), mat=DKM, bev=0.004))
    shin = group('Shin' + ('R' if sx > 0 else 'L'), sh, K)
    return thigh, shin


thighL, shinL = build_leg(-1)
thighR, shinR = build_leg(1)

# ═══════════════════════════════════════════════════════ hierarchy + pose ══
root = link(bpy.data.objects.new('Astronaut', None))
parent(hips, root)
parent(torso, hips)
parent(head, torso)
for arm, fore in ((armL, foreL), (armR, foreR)):
    parent(arm, torso)
    parent(fore, arm)
for th, sh in ((thighL, shinL), (thighR, shinR)):
    parent(th, hips)
    parent(sh, th)
bpy.context.view_layer.update()


def pose(ob, rx=0.0, ry=0.0, rz=0.0):
    ob.rotation_euler = (deg(rx), deg(ry), deg(rz))


# relaxed stance, weight on the left leg, looking up at the star
pose(hips, 0, 0, 0)
pose(torso, -2.0, 1.0, -2.0)
pose(head, 9.0, 0, -6.0)
pose(armL, 5.0, -13.0, 0)
pose(foreL, 16.0, -3.0, 0)
pose(armR, -6.0, 15.0, 0)
pose(foreR, 24.0, 4.0, 0)
pose(thighL, 1.0, -6.0, -4.0)
pose(shinL, -1.0, 0, 0)
pose(thighR, 10.0, 8.0, 8.0)
pose(shinR, -14.0, 0, 0)
bpy.context.view_layer.update()

meshes = [hips, torso, head, armL, foreL, armR, foreR, thighL, shinL, thighR, shinR]
# drop the figure so the lowest sole sits on the ground
low = min((o.matrix_world @ v.co).z for o in (shinL, shinR) for v in o.data.vertices)
root.location.z = -low
bpy.context.view_layer.update()
log('lowest point was', round(low, 4), 'tris', tri_count(meshes))

bake_ao(meshes, samples=64, distance=0.45)
export_glb(os.path.join(MODELS, 'astronaut.glb'), [root] + meshes)

if '--no-preview' not in sys.argv:
    preview(os.path.join(WORK, 'astro_back.png'), (-1.3, -3.6, 1.35), (0, 0, 0.98), lens=62, res=(800, 1100),
            sun_dir=(-0.5, -0.6, 0.5), ground=True, samples=28, fill_strength=0.7)
    preview(os.path.join(WORK, 'astro_front.png'), (1.5, 3.4, 1.45), (0, 0, 0.98), lens=62, res=(800, 1100),
            sun_dir=(0.4, 0.8, 0.45), ground=True, samples=28, fill_strength=0.7)
