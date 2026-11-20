"""Rocket cockpit interior with baked lighting (see docs/concepts/cockpit.png).

Room frame (Blender): origin at the floor centre, +Y forward (window / star), +Z up.
The cabin is a horizontal cylinder (radius 1.55 m, axis 0.85 m above the floor) with a flat deck.

Outputs
  public/models/cockpit.glb         CockpitBaked (one material, UV atlas), CockpitLights (emissive, unbaked),
                                    Screen (display surface, local XY after export, +Z to the viewer), WindowGlass
  public/textures/cockpit_sun.webp  baked light from the star through the window (always on)
  public/textures/cockpit_lamp.webp baked light from the cabin's own lamps and screen (scaled by cockpit power)

Usage: blender -b --factory-startup -P build_cockpit.py -- [--res 4096] [--spp 160] [--preview-only]
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(__file__))
from common import *  # noqa

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default):
    return type(default)(argv[argv.index(name) + 1]) if name in argv else default


RES = arg('--res', 2048)
SPP = arg('--spp', 96)
GPU = '--gpu' in argv
PREVIEW_ONLY = '--preview-only' in argv

reset()

# ── materials (no metallic: everything is baked as diffuse) ────────────────
WALL = material('Wall', '#a39c8e', rough=0.6)
WALLB = material('WallB', '#5a5852', rough=0.7)
RIB = material('Rib', '#1c1e22', rough=0.5)
TRIM = material('Trim', '#b5762e', rough=0.55)
GRIP = material('Grip', '#141517', rough=0.85)
FLOOR = material('Floor', '#34363a', rough=0.6)
FLOORB = material('FloorB', '#26282b', rough=0.7)
SHELL = material('ConsoleShell', '#aea798', rough=0.5)
DARK = material('ConsoleDark', '#1f2125', rough=0.5)
KEY = material('Keycap', '#c9c3b5', rough=0.45)
KEYD = material('KeycapDark', '#3a3b3f', rough=0.5)
INK = material('Ink', '#191a1c', rough=0.7)
PAINT = material('Paint', '#d8d2c2', rough=0.6)
PAD = material('Padding', '#3b3530', rough=0.8)
BAG = material('Cargo', '#6f695d', rough=0.85)
STRAP = material('Strap', '#1c1d1f', rough=0.7)
PIPE = material('Pipe', '#494b50', rough=0.45)
HANDLE = material('Handle', '#a09f9b', rough=0.4)
SCREEN = material('Screen', '#07090c', rough=0.3, emit='#b9c6d8', emit_strength=0.0)
CEIL = material('CeilingLight', '#30281c', rough=0.5, emit='#ffe0b0', emit_strength=0.0)
AMB = material('AmberLight', '#2a1c08', rough=0.4, emit='#ffb24a', emit_strength=0.0)
WHT = material('WhiteLight', '#20242a', rough=0.4, emit='#e6efff', emit_strength=0.0)
GLASS = material('CabinGlass', '#101010', rough=0.05)

R_CAB, Z_AX = 1.55, 0.85
PHI_FLOOR = -math.degrees(math.asin(Z_AX / R_CAB))      # -33.26
Y_BACK, Y_FRONT = -2.05, 1.30
HALF_FLOOR = math.sqrt(R_CAB ** 2 - Z_AX ** 2)


def deg(d):
    return math.radians(d)


def cab(phi, y, r=R_CAB):
    a = deg(phi)
    return Vector((r * math.cos(a), y, Z_AX + r * math.sin(a)))


baked = []
lights = []


def add(o):
    baked.append(o)
    return o


monitor_parts = []


def mon(o):
    """Parts of the main display housing: baked with the room, exported as their own node."""
    monitor_parts.append(o)
    return o


def label(text, size, loc, rot, mat, depth=0.0008):
    """Stencilled lettering as thin geometry, so it stays crisp whatever the light-map density."""
    cu = bpy.data.curves.new('Txt', 'FONT')
    cu.body = text
    cu.size = size
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    cu.extrude = depth
    cu.resolution_u = 2
    ob = link(bpy.data.objects.new('Txt', cu))
    ob.location = loc
    ob.rotation_euler = rot
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    mo = link(bpy.data.objects.new('Label', me))
    mo.matrix_world = ob.matrix_world.copy()
    bpy.data.objects.remove(ob, do_unlink=True)
    me.materials.clear()
    me.materials.append(mat)
    return mo


def radial(phi):
    """Rotation that points a part's local +Z at the cabin axis from angle phi."""
    return (0, deg(90 - phi), 0)


def wall_panel(name, phi0, phi1, y0, y1, mat, gap=0.012, thick=0.03, lift=0.0, nphi=6, ny=2, bev=0.006):
    """Curved plate on the inside of the cabin cylinder, facing the axis."""
    r = R_CAB - lift
    dphi = math.degrees(gap / r)
    bm = bmesh.new()
    grid = []
    for iy in range(ny + 1):
        y = (y0 + gap) + (y1 - y0 - 2 * gap) * iy / ny
        grid.append([bm.verts.new(cab((phi0 + dphi) + (phi1 - phi0 - 2 * dphi) * ip / nphi, y, r)) for ip in range(nphi + 1)])
    for iy in range(ny):
        for ip in range(nphi):
            bm.faces.new((grid[iy][ip], grid[iy][ip + 1], grid[iy + 1][ip + 1], grid[iy + 1][ip]))
    bm.normal_update()
    f0 = bm.faces[:][0]
    c = f0.calc_center_median()
    if f0.normal.dot(Vector((-c.x, 0, Z_AX - c.z))) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    ob = from_bm(name, bm, mat)
    if thick > 0:
        solidify(ob, thick, -1.0)
    if bev > 0:
        bevel(ob, bev, 2, angle=50)
    realize(ob)
    return shade(ob, 50)


def arch(name, y, width, depth, mat, phi0=PHI_FLOOR, phi1=180 - PHI_FLOOR, steps=64, proud=0.0):
    """Structural rib: a rectangular section swept round the cabin."""
    bm = bmesh.new()
    rings = []
    for i in range(steps + 1):
        phi = phi0 + (phi1 - phi0) * i / steps
        ro, ri = R_CAB + 0.03, R_CAB - depth - proud
        rings.append([bm.verts.new(cab(phi, y - width / 2, ro)), bm.verts.new(cab(phi, y + width / 2, ro)),
                      bm.verts.new(cab(phi, y + width / 2, ri)), bm.verts.new(cab(phi, y - width / 2, ri))])
    for a, b in zip(rings[:-1], rings[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = from_bm(name, bm, mat)
    bevel(ob, 0.012, 2, angle=40)
    realize(ob)
    return shade(ob, 40)


# ═══════════════════════════════════════════════════════════════ shell ══
STATIONS = [Y_BACK, -1.18, -0.30, 0.56, Y_FRONT]
BANDS = [(PHI_FLOOR, 4), (4, 44), (44, 90), (90, 136), (136, 176), (176, 180 - PHI_FLOOR)]
k = 0
for (y0, y1) in zip(STATIONS[:-1], STATIONS[1:]):
    for (p0, p1) in BANDS:
        mat = WALLB if (k * 5) % 7 in (0, 3) else WALL
        add(wall_panel('WallPanel', p0, p1, y0 + 0.05, y1 - 0.05, mat, gap=0.012, thick=0.03, nphi=8, ny=2))
        k += 1
# dark liner behind the seams
add(wall_panel('Liner', PHI_FLOOR - 2, 180 - PHI_FLOOR + 2, Y_BACK - 0.1, Y_FRONT + 0.1, RIB, gap=0.0, thick=0.0, lift=-0.035, nphi=64, ny=1, bev=0.0))
for y in STATIONS[1:-1]:
    add(arch('Rib', y, 0.11, 0.085, RIB))
    add(arch('RibCap', y, 0.05, 0.02, SHELL, proud=0.085))
    for phi in range(-20, 201, 20):
        for dy in (-0.04, 0.04):
            add(cyl('RibBolt', 0.011, 0.008, cab(phi, y + dy, R_CAB - 0.088), radial(phi), PIPE, segs=10))
add(arch('RibFront', Y_FRONT - 0.04, 0.16, 0.10, RIB))
add(arch('RibBack', Y_BACK + 0.04, 0.16, 0.10, RIB))
# longitudinal stringers
for phi in (4, 44, 136, 176):
    a = cab(phi, 0, R_CAB - 0.045)
    add(box('Stringer', (0.07, Y_FRONT - Y_BACK, 0.07), (a.x, (Y_FRONT + Y_BACK) / 2, a.z), (0, deg(-phi), 0), RIB, bev=0.012))

# ── floor ───────────────────────────────────────────────────────────────────
add(box('FloorBase', (HALF_FLOOR * 2 + 0.2, Y_FRONT - Y_BACK + 0.2, 0.06), (0, (Y_FRONT + Y_BACK) / 2, -0.05), mat=FLOORB))
ys = [Y_BACK + 0.02 + i * 0.67 for i in range(6)]
for (y0, y1) in zip(ys[:-1], ys[1:]):
    for (x0, x1) in ((-HALF_FLOOR + 0.03, -0.3), (0.3, HALF_FLOOR - 0.03)):
        add(box('FloorPlate', (x1 - x0 - 0.016, y1 - y0 - 0.016, 0.03), ((x0 + x1) / 2, (y0 + y1) / 2, -0.012), mat=FLOOR, bev=0.006))
        for (bx, by) in ((x0 + 0.07, y0 + 0.07), (x1 - 0.07, y0 + 0.07), (x0 + 0.07, y1 - 0.07), (x1 - 0.07, y1 - 0.07)):
            add(cyl('FloorBolt', 0.014, 0.008, (bx, by, 0.006), mat=PIPE, segs=10))
# central walkway grating
add(box('Walkway', (0.56, Y_FRONT - Y_BACK - 0.06, 0.02), (0, (Y_FRONT + Y_BACK) / 2, -0.014), mat=FLOORB, bev=0.004))
n_slat = 46
for i in range(n_slat):
    y = Y_BACK + 0.08 + i * (Y_FRONT - Y_BACK - 0.16) / (n_slat - 1)
    add(box('Slat', (0.5, 0.028, 0.018), (0, y, 0.0), mat=FLOOR, bev=0.004))
for sx in (-1, 1):
    add(box('WalkRail', (0.03, Y_FRONT - Y_BACK - 0.06, 0.03), (sx * 0.285, (Y_FRONT + Y_BACK) / 2, 0.0), mat=PIPE, bev=0.006))

# ── front bulkhead with the panoramic window ────────────────────────────────
WC = Vector((0.0, 0.0, 1.49))
WA, WB, WN = 1.10, 0.77, 2.6
N = 96
inner, outer = [], []
for i in range(N):
    t = 2 * math.pi * i / N
    ca, sa = math.cos(t), math.sin(t)
    sx = abs(ca) ** (2 / WN) * (1 if ca >= 0 else -1) * WA
    sz = abs(sa) ** (2 / WN) * (1 if sa >= 0 else -1) * WB
    inner.append(Vector((sx, 0, WC.z + sz)))
    # matching point on the cabin outline (cylinder clipped at the floor), slightly oversized
    d = Vector((sx, 0, sz)).normalized() if (sx or sz) else Vector((1, 0, 0))
    rr = 1.62
    px, pz = d.x * 3, WC.z + d.z * 3
    # project the ray from the window centre onto the circle
    ox, oz = 0.0, WC.z - Z_AX
    bq = ox * d.x + oz * d.z
    cq = ox * ox + oz * oz - rr * rr
    tt = -bq + math.sqrt(max(bq * bq - cq, 0.0))
    px, pz = d.x * tt, WC.z + d.z * tt
    pz = max(pz, -0.06)
    outer.append(Vector((px, 0, pz)))
bm = bmesh.new()
vi = [bm.verts.new((p.x, Y_FRONT, p.z)) for p in inner]
vo = [bm.verts.new((p.x, Y_FRONT, p.z)) for p in outer]
for i in range(N):
    j = (i + 1) % N
    bm.faces.new((vi[i], vi[j], vo[j], vo[i]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
bulk = from_bm('Bulkhead', bm, WALL)
bm2 = bulk.data
if bm2.polygons[0].normal.y > 0:
    bm2.flip_normals()
solidify(bulk, 0.14, -1.0)
bevel(bulk, 0.012, 2, angle=40)
realize(bulk)
add(shade(bulk, 40))
add(tube('WindowGasket', [(p.x * 0.985, Y_FRONT - 0.02, WC.z + (p.z - WC.z) * 0.985) for p in inner], 0.05, RIB, res=3, cyclic=True))
add(tube('WindowTrim', [(p.x * 1.07, Y_FRONT - 0.005, WC.z + (p.z - WC.z) * 1.09) for p in inner], 0.022, SHELL, res=3, cyclic=True))
for i in range(0, N, 4):
    q = inner[i]
    add(cyl('WindowBolt', 0.013, 0.01, (q.x * 1.135, Y_FRONT - 0.004, WC.z + (q.z - WC.z) * 1.17), (deg(90), 0, 0), PIPE, segs=10))
for sx in (-1, 1):
    # bolted corner plates
    add(box('BulkPlate', (0.26, 0.02, 0.5), (sx * 1.22, Y_FRONT - 0.012, 0.42), mat=WALLB, bev=0.008))
    for (bx, bz) in ((-0.1, -0.21), (0.1, -0.21), (-0.1, 0.21), (0.1, 0.21)):
        add(cyl('BulkBolt', 0.012, 0.008, (sx * 1.22 + bx, Y_FRONT - 0.026, 0.42 + bz), (deg(90), 0, 0), PIPE, segs=10))
    add(label('0%d' % (1 if sx < 0 else 2), 0.07, (sx * 1.22, Y_FRONT - 0.024, 0.44), (deg(90), 0, 0), PAINT))
glass = box('WindowGlass', (WA * 2 + 0.05, 0.01, WB * 2 + 0.05), (0, Y_FRONT + 0.03, WC.z), mat=GLASS)
glass.hide_render = True      # never blocks baked light

# ── back bulkhead with the entry hatch ──────────────────────────────────────
add(box('BackWall', (3.4, 0.08, 2.7), (0, Y_BACK - 0.02, 1.2), mat=WALLB))
add(box('BackHatchFrame', (1.0, 0.07, 1.86), (0, Y_BACK + 0.05, 0.96), mat=RIB, bev=0.04, segs=3))
add(box('BackHatch', (0.84, 0.07, 1.70), (0, Y_BACK + 0.085, 0.96), mat=SHELL, bev=0.03, segs=3))
add(cyl('BackHatchPort', 0.14, 0.03, (0, Y_BACK + 0.125, 1.42), (deg(90), 0, 0), DARK, segs=28, bev=0.006))
add(tube('BackHatchBar', [(-0.26, Y_BACK + 0.13, 0.95), (-0.26, Y_BACK + 0.19, 0.95), (0.26, Y_BACK + 0.19, 0.95), (0.26, Y_BACK + 0.13, 0.95)], 0.018, HANDLE))

# ═════════════════════════════════════════════════════════════ console ══
SC = Vector((0.0, 0.86, 1.24))           # screen centre
TILT = deg(4.0)
N_SC = Vector((0, -math.cos(TILT), math.sin(TILT)))
U_SC = Vector((0, math.sin(TILT), math.cos(TILT)))
SW, SH = 1.36, 0.85
ROT = (-TILT, 0, 0)


def on_screen(x, u, d=0.0):
    """Point in the screen plane: x right, u up, d towards the viewer."""
    return SC + Vector((x, 0, 0)) + U_SC * u + N_SC * d


# housing: ceramic shell with a dark inner bezel
mon(box('ScreenShell', (SW + 0.30, 0.20, SH + 0.21), on_screen(0, -0.012, -0.085), ROT, SHELL, bev=0.06, segs=4))
mon(box('ScreenBezel', (SW + 0.13, 0.06, SH + 0.11), on_screen(0, 0, 0.012), ROT, DARK, bev=0.03, segs=3))
mon(box('ScreenBack', (SW * 0.7, 0.22, SH * 0.6), on_screen(0, -0.02, -0.22), ROT, RIB, bev=0.05, segs=3))
for sx in (-1, 1):
    for su in (-1, 1):
        mon(cyl('ShellBolt', 0.018, 0.012, on_screen(sx * (SW / 2 + 0.105), su * (SH / 2 + 0.07) - 0.012, 0.018), (deg(90) - TILT, 0, 0), PIPE, segs=12))
    # side grab handles
    mon(tube('ShellHandle', [on_screen(sx * (SW / 2 + 0.19), 0.24, -0.02), on_screen(sx * (SW / 2 + 0.25), 0.24, 0.07),
                             on_screen(sx * (SW / 2 + 0.25), -0.24, 0.07), on_screen(sx * (SW / 2 + 0.19), -0.24, -0.02)], 0.024, PIPE, res=4))
    mon(box('HandleMount', (0.07, 0.06, 0.1), on_screen(sx * (SW / 2 + 0.185), 0.24, -0.03), ROT, RIB, bev=0.014))
    mon(box('HandleMount', (0.07, 0.06, 0.1), on_screen(sx * (SW / 2 + 0.185), -0.24, -0.03), ROT, RIB, bev=0.014))
    # support arms down to the deck
    mon(strut('ShellArm', on_screen(sx * 0.52, -SH / 2 - 0.06, -0.12), (sx * 0.52, 0.86, 0.42), 0.16, 0.10, RIB, bev=0.02, up=(1, 0, 0)))
mon(label('AB-01', 0.03, on_screen(-SW / 2 + 0.02, -SH / 2 - 0.075, 0.018), (deg(90) - TILT, 0, 0), INK))
mon(box('ShellVent', (0.2, 0.012, 0.012), on_screen(SW / 2 - 0.12, -SH / 2 - 0.068, 0.018), ROT, RIB))
mon(box('ShellVent', (0.2, 0.012, 0.012), on_screen(SW / 2 - 0.12, -SH / 2 - 0.088, 0.018), ROT, RIB))
# screen surface: plane in local XZ, facing local -Y (becomes local XY / +Z in three.js)
bm = bmesh.new()
q = [bm.verts.new((-SW / 2, 0, -SH / 2)), bm.verts.new((SW / 2, 0, -SH / 2)), bm.verts.new((SW / 2, 0, SH / 2)), bm.verts.new((-SW / 2, 0, SH / 2))]
f = bm.faces.new(q)
uvl = bm.loops.layers.uv.new('UVMap')
for loop, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
    loop[uvl].uv = uv
screen = from_bm('Screen', bm, SCREEN)
if screen.data.polygons[0].normal.y > 0:
    screen.data.flip_normals()
screen.location = on_screen(0, 0, 0.046)
screen.rotation_euler = ROT

# deck: sloped work surface with the keys
DECK_C = Vector((0, 0.36, 0.735))
DECK_T = deg(9.0)
DROT = (DECK_T, 0, 0)


def on_deck(x, v, h=0.0):
    """x right, v towards the back of the deck, h above its surface."""
    return DECK_C + Vector((x, 0, 0)) + Vector((0, math.cos(DECK_T), math.sin(DECK_T))) * v + Vector((0, -math.sin(DECK_T), math.cos(DECK_T))) * (h + 0.05)


add(box('Deck', (1.86, 0.62, 0.10), DECK_C, DROT, SHELL, bev=0.035, segs=4))
add(box('DeckInset', (1.66, 0.44, 0.03), on_deck(0, 0.01, -0.01), DROT, DARK, bev=0.012))
add(box('DeckLip', (1.86, 0.06, 0.13), on_deck(0, -0.29, -0.04), DROT, RIB, bev=0.02))
# keyboard: staggered rows, a few accent keys, a legend on every cap
GLYPHS = 'QWERTYUIOASDFGHJKLZXCVBNM<>'
gi = 0
for r_ in range(4):
    for c_ in range(9):
        if r_ == 3 and 2 <= c_ <= 6:
            continue
        kx = -0.72 + c_ * 0.06 + (0.01 if r_ % 2 else 0.0)
        kv = -0.12 + r_ * 0.056
        cap = TRIM if (r_, c_) in ((0, 8), (2, 8)) else KEYD if (r_, c_) in ((3, 0), (3, 1), (3, 7), (3, 8), (0, 0)) else KEY
        add(box('Keycap', (0.05, 0.044, 0.022), on_deck(kx, kv, 0.012), DROT, cap, bev=0.007))
        add(label(GLYPHS[gi % len(GLYPHS)], 0.02, on_deck(kx - 0.008, kv + 0.004, 0.0234), DROT, INK if cap is KEY else PAINT))
        gi += 1
add(box('Spacebar', (0.29, 0.044, 0.022), on_deck(-0.72 + 4 * 0.06, -0.12 + 3 * 0.056, 0.012), DROT, KEY, bev=0.007))
add(box('KeyTray', (0.6, 0.27, 0.012), on_deck(-0.48, -0.035, 0.0), DROT, RIB, bev=0.006))
# toggle switches
for i in range(3):
    p = on_deck(-0.04 + i * 0.085, -0.02, 0.0)
    add(cyl('ToggleBase', 0.022, 0.012, p, (DECK_T, 0, 0), PIPE, segs=14))
    add(tube('ToggleLever', [p, on_deck(-0.04 + i * 0.085, -0.02 + (0.012 if i != 1 else -0.012), 0.05)], 0.008, HANDLE))
add(box('TogglePlate', (0.27, 0.11, 0.01), on_deck(0.045, -0.02, 0.0), DROT, RIB, bev=0.005))
for i, word in enumerate(('PWR', 'NAV', 'COM')):
    add(label(word, 0.016, on_deck(-0.04 + i * 0.085, 0.062, 0.0062), DROT, PAINT))
add(label('SEQ', 0.016, on_deck(0.388, 0.078, 0.0062), DROT, PAINT))
add(label('GAIN', 0.016, on_deck(0.62, 0.062, 0.0062), DROT, PAINT))
add(label('THR', 0.016, on_deck(-0.86, 0.0, 0.058), DROT, INK))
for sx in (-1, 1):
    for sv in (-1, 1):
        add(cyl('DeckScrew', 0.009, 0.006, on_deck(sx * 0.8, sv * 0.19 + 0.01, 0.006), (DECK_T, 0, 0), PIPE, segs=10))
# button pad
for r_ in range(2):
    for c_ in range(3):
        add(box('PadButton', (0.058, 0.05, 0.02), on_deck(0.32 + c_ * 0.068, -0.05 + r_ * 0.06, 0.01), DROT, (KEYD, KEY, TRIM)[(r_ * 3 + c_) % 3] if (r_ + c_) % 2 == 0 else DARK, bev=0.008))
add(box('PadPlate', (0.23, 0.15, 0.01), on_deck(0.388, -0.02, 0.0), DROT, RIB, bev=0.005))
# rotary knob
kp = on_deck(0.62, -0.02, 0.0)
add(cyl('KnobBase', 0.05, 0.014, kp, (DECK_T, 0, 0), PIPE, segs=24, bev=0.003))
add(cyl('Knob', 0.038, 0.04, on_deck(0.62, -0.02, 0.022), (DECK_T, 0, 0), DARK, segs=24, bev=0.006))
add(box('KnobMark', (0.006, 0.026, 0.004), on_deck(0.62, -0.006, 0.044), DROT, KEY))
# indicator lights on the deck (emissive, not baked)
for i, (x, v, m) in enumerate(((0.74, 0.07, AMB), (0.80, 0.07, WHT), (0.74, -0.10, WHT), (0.80, -0.10, AMB), (-0.10, 0.13, AMB), (0.22, 0.13, WHT))):
    lights.append(box('DeckLight', (0.034, 0.03, 0.012), on_deck(x, v, 0.008), DROT, m, bev=0.005))
    add(box('DeckLightBezel', (0.046, 0.042, 0.008), on_deck(x, v, 0.002), DROT, RIB, bev=0.004))
# pedestal
for sx in (-1, 1):
    add(box('Pylon', (0.26, 0.58, 0.69), (sx * 0.66, 0.46, 0.345), mat=SHELL, bev=0.04, segs=3))
    add(box('PylonPanel', (0.02, 0.42, 0.42), (sx * 0.535, 0.44, 0.37), mat=DARK, bev=0.008))
    add(box('PylonFoot', (0.32, 0.66, 0.06), (sx * 0.66, 0.46, 0.03), mat=RIB, bev=0.014))
    lights.append(box('PylonLight', (0.012, 0.05, 0.016), (sx * 0.522, 0.30, 0.52), mat=AMB, bev=0.004))
add(box('KneeWell', (1.06, 0.30, 0.62), (0, 0.62, 0.31), mat=DARK, bev=0.02))
add(box('FootBar', (1.0, 0.05, 0.05), (0, 0.26, 0.14), (deg(20), 0, 0), PIPE, bev=0.012))

# flight controls: a side stick on the right, a throttle quadrant on the left
sp = on_deck(0.86, -0.19, 0.0)
add(cyl('StickBase', 0.06, 0.03, sp, (DECK_T, 0, 0), RIB, segs=24, bev=0.006))
add(cyl('StickBoot', 0.045, 0.05, on_deck(0.86, -0.19, 0.03), (DECK_T, 0, 0), GRIP, segs=20, bev=0.012, r2=0.026))
add(tube('StickShaft', [on_deck(0.86, -0.19, 0.04), on_deck(0.855, -0.215, 0.17)], 0.014, PIPE))
add(box('StickGrip', (0.05, 0.055, 0.13), on_deck(0.852, -0.228, 0.22), (DECK_T - deg(11), 0, 0), GRIP, bev=0.02, segs=3))
lights.append(box('StickButton', (0.016, 0.01, 0.016), on_deck(0.852, -0.262, 0.262), (DECK_T - deg(11), 0, 0), AMB, bev=0.004))
tq = on_deck(-0.86, -0.16, 0.0)
add(box('ThrottlePlate', (0.13, 0.22, 0.014), tq, DROT, RIB, bev=0.006))
add(box('ThrottleSlot', (0.02, 0.17, 0.006), on_deck(-0.86, -0.16, 0.008), DROT, GRIP))
add(tube('ThrottleLever', [on_deck(-0.86, -0.12, 0.004), on_deck(-0.86, -0.085, 0.12)], 0.012, PIPE))
add(box('ThrottleHandle', (0.1, 0.035, 0.035), on_deck(-0.86, -0.08, 0.135), DROT, GRIP, bev=0.014, segs=3))
add(box('DeckTrim', (1.86, 0.012, 0.012), on_deck(0, -0.262, 0.004), DROT, TRIM))

# ═══════════════════════════════════════════════════════ cabin dressing ══
# seat (seen during the entry move)
add(box('SeatBase', (0.46, 0.46, 0.36), (0, -0.22, 0.19), mat=RIB, bev=0.05, segs=3))
add(box('SeatCushion', (0.54, 0.5, 0.11), (0, -0.20, 0.43), (deg(4), 0, 0), PAD, bev=0.045, segs=4))
add(box('SeatBack', (0.54, 0.12, 0.56), (0, -0.50, 0.74), (deg(-8), 0, 0), PAD, bev=0.05, segs=4))
add(box('SeatBackShell', (0.58, 0.05, 0.62), (0, -0.57, 0.74), (deg(-8), 0, 0), SHELL, bev=0.03, segs=3))
add(box('Headrest', (0.30, 0.10, 0.15), (0, -0.585, 1.045), (deg(-8), 0, 0), PAD, bev=0.04, segs=4))
for sx in (-1, 1):
    add(box('ArmRest', (0.08, 0.40, 0.05), (sx * 0.31, -0.22, 0.60), mat=RIB, bev=0.02))
    add(box('ArmPost', (0.05, 0.06, 0.18), (sx * 0.31, -0.38, 0.51), mat=PIPE, bev=0.012))

# side wall equipment
for sx in (-1, 1):
    side = 0 if sx > 0 else 1

    def w(phi, y, lift=0.0):
        return cab(phi if sx > 0 else 180 - phi, y, R_CAB - lift)

    def roll(phi):
        return deg(-(phi if sx > 0 else 180 - phi) + 90)

    # locker doors
    for (ya, phi) in ((0.12, 24), (-0.74, 24)):
        add(wall_panel('Locker', (22 if sx > 0 else 136) - 16 + 16, (22 if sx > 0 else 136) + 22, ya - 0.33, ya + 0.33, SHELL, gap=0.0, thick=0.03, lift=0.04, nphi=6, ny=2, bev=0.012))
        add(wall_panel('LockerInset', 25 if sx > 0 else 147, 33 if sx > 0 else 155, ya - 0.2, ya + 0.2, WALLB, gap=0.0, thick=0.012, lift=0.052, nphi=2, ny=1, bev=0.006))
        add(box('LockerLatch', (0.03, 0.09, 0.05), w(40, ya + 0.24, 0.085), (0, roll(40), 0), RIB, bev=0.01))
        for bphi in (24, 42):
            for by in (-0.29, 0.29):
                add(box('LockerBolt', (0.01, 0.022, 0.022), w(bphi, ya + by, 0.075), (0, roll(bphi), 0), PIPE, bev=0.004))
        add(box('LockerTag', (0.004, 0.13, 0.034), w(30.5, ya + 0.1, 0.066), (0, roll(30.5), 0), PAINT, bev=0.0))
        add(box('LockerTagInk', (0.004, 0.09, 0.006), w(30.9, ya + 0.1, 0.0685), (0, roll(30.9), 0), INK))
        add(box('LockerTagInk', (0.004, 0.06, 0.006), w(30.1, ya + 0.085, 0.0685), (0, roll(30.1), 0), INK))
        add(box('LockerStripe', (0.004, 0.36, 0.012), w(26.6, ya, 0.066), (0, roll(26.6), 0), TRIM))
    # vent grille
    add(wall_panel('VentFrame', -20 if sx > 0 else 184, -4 if sx > 0 else 200, 0.0, 0.5, RIB, gap=0.0, thick=0.03, lift=0.045, nphi=4, ny=1, bev=0.01))
    for j in range(5):
        ph = -18.5 + j * 3.2
        add(wall_panel('VentSlat', ph if sx > 0 else 180 - ph - 1.6, ph + 1.6 if sx > 0 else 180 - ph, 0.04, 0.46, PIPE, gap=0.0, thick=0.014, lift=0.06, nphi=1, ny=1, bev=0.003))
    # small switch panel with indicators
    add(wall_panel('SwitchPanel', 8 if sx > 0 else 160, 20 if sx > 0 else 172, 0.72, 1.12, DARK, gap=0.0, thick=0.03, lift=0.05, nphi=3, ny=1, bev=0.01))
    for j in range(4):
        sp_ = w(16.5, 0.79 + j * 0.085, 0.084)
        add(box('PanelSwitch', (0.03, 0.02, 0.03), sp_, (0, roll(16.5) + deg(18 if j % 2 else -18), 0), (HANDLE, KEY, HANDLE, TRIM)[j], bev=0.005))
        add(box('PanelSwitchSeat', (0.008, 0.034, 0.044), w(16.5, 0.79 + j * 0.085, 0.079), (0, roll(16.5), 0), RIB, bev=0.003))
    add(box('PanelTag', (0.004, 0.3, 0.014), w(18.9, 0.92, 0.0795), (0, roll(18.9), 0), PAINT))
    for j, m in enumerate((AMB, WHT, WHT, AMB)):
        p = w(10.5 + (j % 2) * 5, 0.82 + (j // 2) * 0.16, 0.088)
        lights.append(box('WallLight', (0.008, 0.022, 0.022), p, (0, roll(10.5 + (j % 2) * 5), 0), m, bev=0.003))
        add(box('WallLightBezel', (0.012, 0.045, 0.034), w(10.5 + (j % 2) * 5, 0.82 + (j // 2) * 0.16, 0.078), (0, roll(10.5 + (j % 2) * 5), 0), RIB, bev=0.004))
    # upper control strip
    add(wall_panel('UpperStrip', 50 if sx > 0 else 118, 62 if sx > 0 else 130, -0.2, 1.0, DARK, gap=0.0, thick=0.03, lift=0.05, nphi=3, ny=2, bev=0.01))
    for j in range(3):
        lights.append(box('StripLight', (0.008, 0.024, 0.016), w(56, 0.18 + j * 0.3, 0.084), (0, roll(56), 0), AMB if j % 2 else WHT, bev=0.003))
        add(box('StripSwitch', (0.016, 0.03, 0.05), w(59.5, 0.18 + j * 0.3, 0.088), (0, roll(59.5), 0), PIPE, bev=0.005))
    # multi-function display on the mid wall
    add(wall_panel('MfdFrame', 24 if sx > 0 else 140, 40 if sx > 0 else 156, 0.18, 0.64, RIB, gap=0.0, thick=0.035, lift=0.05, nphi=4, ny=2, bev=0.012))
    add(wall_panel('MfdGlass', 25.6 if sx > 0 else 141.6, 38.4 if sx > 0 else 154.4, 0.22, 0.60, GRIP, gap=0.0, thick=0.01, lift=0.062, nphi=4, ny=2, bev=0.0))
    for j, hgt in enumerate((0.5, 0.8, 0.35, 0.65, 0.9, 0.55)):
        ph = 27.0 + hgt * 4.4
        lights.append(box('MfdBar', (0.006, 0.03, 0.018 + hgt * 0.085), w(27.0 + hgt * 2.2, 0.27 + j * 0.055, 0.074), (0, roll(27.0 + hgt * 2.2), 0), AMB if j % 3 else WHT))
    lights.append(box('MfdLine', (0.006, 0.3, 0.006), w(36.4, 0.41, 0.074), (0, roll(36.4), 0), WHT))
    lights.append(box('MfdBase', (0.004, 0.34, 0.004), w(26.5, 0.41, 0.074), (0, roll(26.5), 0), WHT))
    for j in range(7):
        lights.append(box('MfdTick', (0.004, 0.004, 0.012), w(26.1, 0.25 + j * 0.055, 0.074), (0, roll(26.1), 0), WHT))
    for j in range(3):
        lights.append(box('MfdBlock', (0.004, 0.026, 0.018), w(34.4, 0.47 + j * 0.04, 0.074), (0, roll(34.4), 0), AMB if j != 1 else WHT))
    lights.append(box('MfdTrace', (0.004, 0.11, 0.004), w(33.2, 0.30, 0.074), (deg(14), roll(33.2), 0), AMB))
    lights.append(box('MfdTrace', (0.004, 0.09, 0.004), w(32.3, 0.385, 0.074), (deg(-22), roll(32.3), 0), AMB))
    for (bphi, by) in ((24.8, 0.2), (39.2, 0.2), (24.8, 0.62), (39.2, 0.62)):
        add(box('MfdBolt', (0.008, 0.018, 0.018), w(bphi, by, 0.088), (0, roll(bphi), 0), PIPE, bev=0.003))
    # round gauges above it
    for j in range(3):
        gp = w(47.5, 0.26 + j * 0.15, 0.062)
        add(cyl('GaugeBody', 0.05, 0.03, gp, (0, roll(47.5) + deg(90), 0), RIB, segs=24, bev=0.006))
        add(cyl('GaugeFace', 0.041, 0.006, w(47.5, 0.26 + j * 0.15, 0.079), (0, roll(47.5) + deg(90), 0), KEY, segs=24))
        lights.append(box('GaugeNeedle', (0.004, 0.006, 0.034), w(47.5, 0.26 + j * 0.15, 0.084), (deg(-40 + j * 55), roll(47.5), 0), AMB))
    # thin LED strips tucked under the stringers: they graze the wall panels and pick out every rib
    lights.append(box('LedStrip', (0.012, Y_FRONT - Y_BACK - 0.5, 0.014), w(42.2, (Y_FRONT + Y_BACK) / 2, 0.075), (0, roll(42.2), 0), WHT))
    lights.append(box('LedStripLow', (0.012, Y_FRONT - Y_BACK - 0.5, 0.014), w(2.6, (Y_FRONT + Y_BACK) / 2, 0.075), (0, roll(2.6), 0), AMB))
    add(wall_panel('RibTrim', 44.5 if sx > 0 else 134.3, 45.7 if sx > 0 else 135.5, Y_BACK + 0.1, Y_FRONT - 0.1, TRIM, gap=0.0, thick=0.006, lift=0.094, nphi=1, ny=1, bev=0.0))
    # conduits along the upper wall
    add(tube('Conduit', [w(70, Y_BACK + 0.1, 0.07), w(70, Y_FRONT - 0.1, 0.07)], 0.028, PIPE, res=4))
    add(tube('Conduit', [w(76, Y_BACK + 0.1, 0.06), w(76, Y_FRONT - 0.1, 0.06)], 0.018, RIB, res=4))
    for y in (-1.5, -0.7, 0.1, 0.95):
        add(box('ConduitClamp', (0.05, 0.05, 0.11), w(72, y, 0.065), (0, roll(72), 0), RIB, bev=0.01))
    # ceiling lamp: housing (baked) + emissive panel (not baked)
    add(box('LampHousing', (0.36, 0.26, 0.07), w(66, 0.30, 0.075), (0, roll(66), 0), SHELL, bev=0.02, segs=3))
    lights.append(box('CeilingLamp', (0.27, 0.17, 0.02), w(66, 0.30, 0.118), (0, roll(66), 0), CEIL, bev=0.006))
    for dy in (-0.058, 0.0, 0.058):
        add(box('LampLouvre', (0.3, 0.012, 0.014), w(66, 0.30 + dy, 0.134), (0, roll(66), 0), RIB, bev=0.003))
    add(box('LampLouvreSpine', (0.014, 0.2, 0.014), w(66, 0.30, 0.136), (0, roll(66), 0), RIB, bev=0.003))
    add(box('LampHousingRear', (0.46, 0.30, 0.07), w(64, -1.0, 0.075), (0, roll(64), 0), SHELL, bev=0.02, segs=3))
    lights.append(box('CeilingLampRear', (0.36, 0.21, 0.02), w(64, -1.0, 0.118), (0, roll(64), 0), CEIL, bev=0.006))
    for dy in (-0.07, 0.0, 0.07):
        add(box('LampLouvre', (0.4, 0.012, 0.014), w(64, -1.0 + dy, 0.134), (0, roll(64), 0), RIB, bev=0.003))
    # floor-level kick boxes
    add(box('KickBox', (0.2, 0.9, 0.24), (sx * (HALF_FLOOR - 0.12), -0.3, 0.12), mat=WALLB, bev=0.03, segs=3))

# strapped cargo case on the left
add(box('CargoCase', (0.5, 0.74, 0.44), (-0.98, -1.28, 0.24), (0, 0, deg(8)), BAG, bev=0.07, segs=4))
for dy in (-0.2, 0.2):
    add(box('CargoStrap', (0.53, 0.06, 0.47), (-0.98 + 0.03 * dy, -1.28 + dy, 0.24), (0, 0, deg(8)), STRAP, bev=0.02))
    add(box('CargoBuckle', (0.03, 0.075, 0.06), (-0.715 + 0.03 * dy, -1.245 + dy, 0.30), (0, 0, deg(8)), HANDLE, bev=0.008))
# ceiling spine
add(box('CeilSpine', (0.34, Y_FRONT - Y_BACK - 0.3, 0.07), (0, (Y_FRONT + Y_BACK) / 2, Z_AX + R_CAB - 0.075), mat=WALLB, bev=0.02))
add(box('CeilVent', (0.2, 0.36, 0.03), (0.06, 0.78, 2.292), mat=RIB, bev=0.008))

log('baked parts', len(baked), 'light parts', len(lights))
room = join(baked, 'CockpitBaked')
shade(room, 42)
mon_tmp = join(monitor_parts, 'MonitorTmp')
shade(mon_tmp, 42)
N_ROOM = len(room.data.polygons)
room = join([room, mon_tmp], 'CockpitBaked')
log('room faces', N_ROOM, 'with monitor', len(room.data.polygons))
lamp_obj = join(lights, 'CockpitLights')
shade(lamp_obj, 42)
log('tris', tri_count([room, lamp_obj]))

import json


def three(v):
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]


with open(os.path.join(MODELS, 'cockpit_layout.json'), 'w') as fh:
    json.dump({'screen': {'center': three(on_screen(0, 0, 0.046)), 'normal': three(N_SC), 'up': three(U_SC), 'width': SW, 'height': SH},
               'window': {'center': three(Vector((0, Y_FRONT, WC.z))), 'halfWidth': WA, 'halfHeight': WB}}, fh, indent=2)

# ═════════════════════════════════════════════════════════════ lighting ══
sc = cycles(SPP, gpu=GPU)
sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.004, 0.005, 0.007, 1)
sc.world.node_tree.nodes['Background'].inputs[1].default_value = 1.0

sun_d = bpy.data.lights.new('StarSun', 'SUN')
sun_d.color = rgb('#ffc487')
sun_d.angle = deg(24)
sun = link(bpy.data.objects.new('StarSun', sun_d))
# light arrives from the window side, a few degrees above level
sun.rotation_euler = Vector((0.0, 1.0, 0.085)).normalized().to_track_quat('Z', 'Y').to_euler()
glow_d = bpy.data.lights.new('StarGlow', 'AREA')
glow_d.shape = 'RECTANGLE'
glow_d.size, glow_d.size_y = 2.6, 1.5
glow_d.color = rgb('#ffb06a')
glow = link(bpy.data.objects.new('StarGlow', glow_d))
glow.location = (0, Y_FRONT + 0.5, 1.45)
glow.rotation_euler = (deg(90), 0, 0)      # shines towards -Y


def set_lights(star, lamps):
    sun_d.energy = 10.0 * star
    glow_d.energy = 2100.0 * star
    for m, s in ((CEIL, 26.0), (AMB, 16.0), (WHT, 14.0), (SCREEN, 0.5)):
        m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = s * lamps


def hero_preview(path, star, lamps):
    set_lights(star, lamps)
    cam = SC + N_SC * 2.39 + U_SC * 0.19
    look = cam - N_SC * 2.0
    cd = bpy.data.cameras.new('Hero')
    cd.sensor_fit = 'VERTICAL'
    cd.angle_y = deg(46)
    co = link(bpy.data.objects.new('Hero', cd))
    co.location = cam
    look_at(co, look)
    sc.camera = co
    sc.render.resolution_x, sc.render.resolution_y = 1120, 630
    sc.render.filepath = path
    sc.view_settings.view_transform = 'Standard'
    sc.cycles.samples = 28
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(co, do_unlink=True)
    log('preview', os.path.basename(path))


if '--no-preview' not in argv:
    hero_preview(os.path.join(WORK, 'cockpit_hero_on.png'), 1.0, 1.0)
    hero_preview(os.path.join(WORK, 'cockpit_hero_off.png'), 1.0, 0.0)
if PREVIEW_ONLY:
    sys.exit(0)

# ══════════════════════════════════════════════════════════════ baking ══
log('unwrapping')
for o in bpy.context.scene.objects:
    o.select_set(False)
room.select_set(True)
bpy.context.view_layer.objects.active = room
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=deg(66), island_margin=0.0025, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')


def bake(name, star, lamps, path):
    set_lights(star, lamps)
    img = bpy.data.images.new(name, RES, RES, alpha=False, float_buffer=True)
    for slot in room.material_slots:
        nt = slot.material.node_tree
        node = nt.nodes.get('BakeTarget') or nt.nodes.new('ShaderNodeTexImage')
        node.name = 'BakeTarget'
        node.image = img
        nt.nodes.active = node
    for o in bpy.context.scene.objects:
        o.select_set(False)
    room.select_set(True)
    bpy.context.view_layer.objects.active = room
    sc.cycles.samples = SPP
    b = sc.render.bake
    b.target = 'IMAGE_TEXTURES'
    b.margin = 8
    b.use_pass_direct = True
    b.use_pass_indirect = True
    b.use_pass_diffuse = True
    b.use_pass_glossy = False
    b.use_pass_transmission = False
    b.use_pass_emit = True
    t = time.time()
    bpy.ops.object.bake(type='COMBINED')
    log('baked %s in %.0fs' % (name, time.time() - t))
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.quality = 88
    sc.render.image_settings.color_mode = 'RGB'
    img.save_render(path, scene=sc)
    log('saved', os.path.basename(path), '%.0f KB' % (os.path.getsize(path) / 1024))


suffix = '' if RES >= 4096 else '_%d' % RES
bake('BakeSun', 1.0, 0.0, os.path.join(TEXTURES, 'cockpit_sun%s.webp' % suffix))
bake('BakeLamp', 0.0, 1.0, os.path.join(TEXTURES, 'cockpit_lamp%s.webp' % suffix))

# one material, one draw call
one = material('CockpitBake', '#808080', rough=0.8)
me = room.data
me.materials.clear()
me.materials.append(one)
for p in me.polygons:
    p.material_index = 0
set_lights(0.0, 1.0)
for o in bpy.context.scene.objects:
    o.select_set(False)
room.select_set(True)
bpy.context.view_layer.objects.active = room
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_mode(type='FACE')
bpy.ops.mesh.select_all(action='DESELECT')
bme = bmesh.from_edit_mesh(room.data)
bme.faces.ensure_lookup_table()
for f in bme.faces:
    f.select_set(f.index >= N_ROOM)
bmesh.update_edit_mesh(room.data)
bpy.ops.mesh.separate(type='SELECTED')
bpy.ops.object.mode_set(mode='OBJECT')
monitor = [o for o in bpy.context.selected_objects if o is not room][0]
monitor.name = 'Monitor'
monitor.data.name = 'Monitor'
set_origin(monitor, on_screen(0, 0, 0))
log('monitor faces', len(monitor.data.polygons), 'room faces', len(room.data.polygons))
export_glb(os.path.join(MODELS, 'cockpit.glb'), [room, monitor, lamp_obj, screen, glass], vertex_color=False)
