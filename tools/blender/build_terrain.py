"""Home planet: a 300 m-radius rocky planetoid.

Outputs
  public/models/home_terrain.glb   Terrain (dense sculpted cap around the landing site) + Rocks
  public/models/home_planet.glb    Planet  (whole low-detail globe, same height function)
  public/models/home_layout.json   anchors (three.js coordinates) for astronaut / rocket / planet centre

Blender frame: site at the origin, +Z up, +Y towards the star. three.js frame: (x, z, -y).
Vertex colours carry albedo x baked AO; fine grain is added by the site shader.
"""
import os
import sys
import math
import json
import random

sys.path.insert(0, os.path.dirname(__file__))
from common import *  # noqa
from mathutils import noise
import numpy as np

reset()
R = 300.0
SEED = 7

# ── authored layout (site tangent plane, metres: x right, y towards the star) ──
ASTRO = (-2.55, -4.4)
ROCKET = (11.2, 25.5)
PAD_R = 7.0
CRATERS = [  # (x, y, radius, depth factor)
    (-13.5, 21.0, 8.5, 0.8), (-6.4, 5.2, 1.7, 1.0), (1.3, 1.6, 0.95, 0.9),
    (15.5, 7.0, 3.1, 1.0), (-2.5, 17.5, 2.4, 1.0), (22.0, 16.0, 4.0, 0.9), (-24.0, 4.0, 5.5, 0.9),
    (7.5, -4.0, 1.4, 0.8), (-9.5, -6.5, 2.2, 0.9), (30.0, 34.0, 9.0, 0.8), (-34.0, 38.0, 11.0, 0.8),
    (0.5, 40.0, 6.0, 0.9), (12.0, 52.0, 10.0, 0.8),
]
RIDGES = [  # (x, y, radius of influence, height) - kept out of the star's sightline
    (-29.0, 31.0, 15.0, 3.4), (-42.0, 15.0, 13.0, 2.6), (33.0, 22.0, 11.0, 2.8), (47.0, 42.0, 18.0, 3.8),
    (-55.0, 58.0, 22.0, 4.5), (-18.0, -3.0, 6.0, 1.3), (64.0, 8.0, 20.0, 4.0), (-66.0, -12.0, 22.0, 4.0),
    (-34.0, 62.0, 14.0, 2.6), (40.0, 70.0, 16.0, 3.0),
]

rnd = random.Random(SEED)
GLOBAL_CRATERS = []
while len(GLOBAL_CRATERS) < 70:
    d = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1))).normalized()
    if d.z > 0.955:      # keep the authored neighbourhood clean
        continue
    GLOBAL_CRATERS.append((d, rnd.uniform(7.0, 34.0), rnd.uniform(0.6, 1.0)))


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def crater_profile(t, rad, depth):
    """t = distance / radius."""
    h = 0.0
    if t < 1.0:
        h -= depth * rad * 0.2 * (1.0 - t * t) ** 1.4
    h += rad * 0.055 * depth * math.exp(-((t - 1.0) / 0.22) ** 2)
    return h


def eroded_crater(x, y):
    """A shallow impact basin with a broken far rim and an open approach."""
    u, v = (x - 0.8) / 6.3, (y - 9.5 - 0.17 * (x - 0.8)) / 4.5
    r = math.hypot(u, v)
    if r >= 1.65:
        return 0.0
    a = math.atan2(v, u)
    r += 0.035 * math.sin(a * 5 + 0.9) + 0.016 * math.sin(a * 9)
    bowl = -0.92 * (1.0 - smooth(0.38, 1.04, r))
    crest = math.exp(-((r - 1.02) / (0.19 if r < 1.02 else 0.29)) ** 2)
    far_wall = smooth(-0.18, 0.65, v) * smooth(1.16, 0.36, u)
    weathering = 0.83 + 0.11 * math.sin(a * 7) + 0.06 * math.sin(a * 13 + 1.7)
    gullies = 0.055 * math.sin(a * 27 + 3.1 * r) * far_wall
    grooves = gullies + 0.077 * noise.fractal(Vector((x, y, 4.0)) * 0.95, 0.9, 2.1, 2)
    rim = ((0.14 + 0.63 * far_wall) * weathering + grooves) * crest
    return bowl + rim * smooth(1.65, 1.48, r)


def height(d, detail=1.0):
    """Surface height (m) above the base sphere for unit direction d."""
    p = d * R
    q = Vector((p.x, p.y, p.z + 913.0))
    h = 2.2 * noise.fractal(q * 0.012, 1.0, 2.0, 4)
    h += 0.55 * noise.fractal(q * 0.05, 1.0, 2.0, 3)
    h += 0.11 * detail * noise.fractal(q * 0.22, 0.9, 2.1, 3)
    h += 0.028 * detail * noise.fractal(q * 1.1, 0.8, 2.1, 2)
    # far-side relief: ridged mountains fading in away from the site
    far = smooth(0.90, 0.55, d.z)
    if far > 0:
        h += far * 9.0 * (noise.ridged_multi_fractal(q * 0.006, 1.0, 2.0, 4, 1.0, 2.0) - 0.9)
    for (cd, rad, dep) in GLOBAL_CRATERS:
        c = cd.dot(d)
        if c > 0.97:
            dist = math.acos(min(1.0, c)) * R
            if dist < rad * 1.7:
                h += crater_profile(dist / rad, rad, dep)
    if d.z > 0.5:
        lx, ly = R * d.x / d.z, R * d.y / d.z
        for (cx, cy, rad, hgt) in RIDGES:
            dist = math.hypot(lx - cx, ly - cy)
            if dist < rad:
                m = smooth(rad, rad * 0.15, dist)
                rg = noise.ridged_multi_fractal(Vector((lx, ly, 3.0)) * 0.07, 1.0, 2.1, 4, 1.0, 2.0)
                h += m * hgt * (0.35 + 0.42 * rg)
        for (cx, cy, rad, dep) in CRATERS:
            dist = math.hypot(lx - cx, ly - cy)
            if dist < rad * 1.7:
                h += crater_profile(dist / rad, rad, dep)
        h += eroded_crater(lx, ly)
        # a low shelf under the astronaut and a level pad under the rocket
        da = math.hypot(lx - ASTRO[0], ly - ASTRO[1])
        h += 0.38 * smooth(4.2, 1.2, da)
        dx, dy = lx - ROCKET[0], ly - ROCKET[1]
        dr = math.hypot(dx, dy)
        if dr < PAD_R * 1.6:
            h = h + (PAD_H - h) * smooth(PAD_R * 1.6, PAD_R * 0.8, dr)
            # Grade the apron towards the camera so the footpads clear the near shoulder.
            apron = smooth(-12.0, -8.0, dy) * smooth(-2.7, -5.0, dy)
            h -= 0.39 * apron * smooth(7.5, 3.5, abs(dx - 0.30 * dy))
    return h


def dir_from_local(lx, ly):
    return Vector((lx, ly, R)).normalized()


PAD_H = 0.0
PAD_H = 0.35 + 2.2 * noise.fractal(Vector((ROCKET[0], ROCKET[1], R + 913.0)) * 0.012, 1.0, 2.0, 4)
H0 = height(dir_from_local(0.0, 0.0))


def surface(lx, ly, detail=1.0):
    d = dir_from_local(lx, ly)
    return d * (R + height(d, detail)) - Vector((0, 0, R + H0))


def local_up(lx, ly):
    return dir_from_local(lx, ly)


# ════════════════════════════════════════════════════════════ terrain cap ══
N = 250
L = 125.0
A = 0.105


def warp(u):
    return math.copysign(L * (A * abs(u) + (1 - A) * abs(u) ** 3.2), u)


log('sculpting terrain cap')
bm = bmesh.new()
grid = []
OFF_Y = 6.0     # shift the dense centre a little towards the mid-ground
for iy in range(N + 1):
    row = []
    for ix in range(N + 1):
        lx = warp(2 * ix / N - 1)
        ly = warp(2 * iy / N - 1) + OFF_Y
        co = surface(lx, ly)
        edge = max(abs(lx), abs(ly - OFF_Y))
        co -= dir_from_local(lx, ly) * 3.2 * smooth(L * 0.80, L, edge)
        row.append(bm.verts.new(co))
    grid.append(row)
for iy in range(N):
    for ix in range(N):
        bm.faces.new((grid[iy][ix], grid[iy][ix + 1], grid[iy + 1][ix + 1], grid[iy + 1][ix]))
TER = material('Regolith', '#ffffff', rough=0.94)
terrain = from_bm('Terrain', bm, TER)
shade(terrain, 180)

# ═════════════════════════════════════════════════════════════════ rocks ══
ROCK = material('Rock', '#ffffff', rough=0.9)


def make_rock(seed, size, hero=False):
    """Weathered boulder: an icosphere carved by many shallow planes, then softened and roughened."""
    r = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=4 if hero else 2, radius=1.0)
    for k in range(r.randint(16, 24) if hero else r.randint(8, 12)):
        n = Vector((r.gauss(0, 1), r.gauss(0, 1), r.gauss(0.1, 0.8))).normalized()
        dcut = r.uniform(0.6, 0.93)
        for v in bm.verts:
            over = v.co.dot(n) - dcut
            if over > 0:
                v.co -= n * over * 0.92
    off = Vector((seed * 1.7, seed * 0.3, 0))
    for v in bm.verts:
        d = v.co.normalized()
        v.co += d * (0.09 * noise.fractal(v.co * 1.6 + off, 1.0, 2.0, 3) + (0.03 * noise.noise(v.co * 6.0 + off) if hero else 0.0))
    ob = from_bm('Rock', bm, ROCK)
    xf(ob, scale=(size * r.uniform(0.95, 1.45), size * r.uniform(0.8, 1.2), size * r.uniform(0.55, 0.85)))
    xf(ob, rot=(r.uniform(-0.25, 0.25), r.uniform(-0.25, 0.25), r.uniform(0, 6.28)))
    return shade(ob, 42 if hero else 30)


def place(ob, lx, ly, sink):
    base = surface(lx, ly)
    up = local_up(lx, ly)
    ob.data.transform(Matrix.Translation(base - up * sink))
    return ob


def keep_rock(ob):
    """Reject meshes whose footprint crosses the clear zones."""
    points = [v.co * (R / (v.co.z + R + H0)) for v in ob.data.vertices]
    left, right = min(p.x for p in points), max(p.x for p in points)
    near, far = min(p.y for p in points), max(p.y for p in points)
    for (x, y), radius in ((ROCKET, PAD_R + 0.06), (ASTRO, 0.47)):
        dx = max(left - x, x - right, 0)
        dy = max(near - y, y - far, 0)
        if math.hypot(dx, dy) < radius:
            return False
    return not (left < 5 and right > -3 and near < -5 and far > -9
                and max(right - left, far - near) > 0.36)


def add_rock(ob):
    if keep_rock(ob):
        rocks.append(ob)
        return True
    mesh = ob.data
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(mesh)
    return False


log('scattering rocks')
rocks = []
HERO_ROCKS = [  # (x, y, size) - nothing large between the camera and the rocket
    (-6.6, -5.0, 1.15), (-4.6, -6.5, 0.45), (0.1, -3.4, 0.24), (1.5, -4.6, 0.18), (4.6, -3.2, 0.28),
    (-8.8, 1.5, 1.0), (-10.4, 3.2, 0.5), (5.6, 1.6, 0.26), (-1.4, 6.3, 0.20), (13.8, -1.4, 0.8),
    (-15.5, 9.0, 1.7), (-17.6, 11.2, 0.9), (17.5, 12.5, 1.3), (-5.5, 13.0, 0.7), (2.5, 16.5, 0.45),
    (-20.0, 20.5, 2.2), (23.5, 27.0, 1.8), (-1.5, 27.5, 0.9), (-7.5, 30.0, 1.4), (18.5, 33.5, 1.1),
    (-0.6, -6.2, 0.2), (0.6, -1.2, 0.16), (-3.6, -0.8, 0.24), (7.2, -5.6, 0.5), (9.4, -3.8, 0.24),
    # clusters: a few stones leaning together read as outcrops rather than scattered props
    (-11.6, 8.6, 1.25), (-10.2, 9.9, 0.7), (-12.6, 10.4, 0.5), (-10.9, 7.4, 0.36),
    (14.6, 5.6, 1.05), (15.9, 6.8, 0.62), (13.6, 6.9, 0.4),
    (-3.2, 21.5, 1.0), (-2.0, 22.6, 0.55), (-4.3, 22.8, 0.4),
    (6.6, 12.4, 0.7), (7.5, 13.1, 0.38),
]
for i, (x, y, s) in enumerate(HERO_ROCKS):
    add_rock(place(make_rock(100 + i, s, hero=True), x, y, s * 0.26))
r2 = random.Random(SEED + 1)
count = 0
while count < 700:
    ang = r2.uniform(0, 2 * math.pi)
    dist = 2.0 + 62.0 * r2.random() ** 2.0
    x, y = math.cos(ang) * dist * 0.9, math.sin(ang) * dist + 8.0
    if math.hypot(x - ROCKET[0], y - ROCKET[1]) < PAD_R * 1.05:
        continue
    if math.hypot(x - ASTRO[0], y - ASTRO[1]) < 0.9:
        continue
    if abs(x + 1.3) < 1.0 and -10.5 < y < -6.5:      # keep the camera's feet clear
        continue
    s = 0.045 + 0.5 * r2.random() ** 3.4
    if dist > 30:
        s *= 1.8
    if add_rock(place(make_rock(1000 + count, s), x, y, s * 0.19)):
        count += 1


def fractured_piece(seed, x, y, size, heading, pitch, roll, burial, split=0):
    """Build a bedrock fragment from warped rings with chipped shoulders."""
    r = random.Random(seed)
    width, depth, thickness = size
    bm = bmesh.new()
    # Clip the ends asymmetrically, leaving broad planes between the chips.
    outline = [(-0.5, -0.23), (-0.32, -0.5), (0.22, -0.5), (0.5, -0.27),
               (0.5, 0.23), (0.27, 0.5), (-0.23, 0.5), (-0.5, 0.32)]
    outline = [(u + r.uniform(-0.09, 0.09), v + r.uniform(-0.09, 0.09)) for u, v in outline]
    top_drift = r.uniform(-0.19, 0.19)
    rings = []
    for level, taper in ((0.0, 0.86), (0.17, 1.0), (0.42, 0.94), (0.51, 0.96), (0.78, 0.89), (1.0, 0.68)):
        rings.append([
            bm.verts.new(((u * taper + level * top_drift + r.uniform(-0.055, 0.055)) * width,
                          (v * taper + r.uniform(-0.07, 0.07)) * depth,
                          (level + r.uniform(-0.036, 0.036)) * thickness))
            for u, v in outline
        ])
    bm.faces.new(list(reversed(rings[0])))
    for lower, upper in zip(rings, rings[1:]):
        for i in range(len(outline)):
            j = (i + 1) % len(outline)
            bm.faces.new((lower[i], lower[j], upper[j], upper[i]))
    bm.faces.new(rings[-1])

    if split:
        # Both halves share the same fracture plane and buried foot.
        normal = Vector((split, -0.35 * split, -0.27 * split))
        cut = bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                                    dist=0.0001, plane_co=(0, 0, thickness * 0.44),
                                    plane_no=normal, clear_outer=True)
        edges = [edge for edge in cut['geom_cut'] if isinstance(edge, bmesh.types.BMEdge) and edge.is_boundary]
        bmesh.ops.holes_fill(bm, edges=edges)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))

    base = surface(x, y)
    rotation = Euler((roll, pitch, heading), 'XYZ').to_matrix()
    buried_base = base - local_up(x, y) * burial
    for vert in bm.verts:
        at_foot = vert.co.z < thickness * 0.10
        vert.co.x -= split * 0.13 * smooth(0.12, 0.84, vert.co.z / thickness)
        vert.co = rotation @ vert.co + buried_base
        if at_foot:
            # Extend the buried cap under the surrounding ground on tilted slopes.
            ground = surface(vert.co.x, vert.co.y).z
            vert.co.z = min(vert.co.z, ground - 0.10)
    piece = from_bm('Fractured bedrock', bm, ROCK)
    bevel(piece, min(size) * 0.036, 2, angle=42)
    return shade(realize(piece), 40)


# Fragments are laid out individually so their silhouettes and bedding read at a low eye level.
# Each row is (x, y, width, depth, thickness, heading, pitch, roll, burial).
formations = (
    (  # Exposed bedding on the left lip, stepping down towards the basin
        ((-4.9, 10.8, 3.6, 1.3, 0.72, 0.30, -0.16, 0.21, 0.31),
         (-3.2, 11.35, 2.8, 1.1, 0.55, 0.40, -0.12, 0.19, 0.33),
         (-5.38, 9.90, 2.6, 0.91, 0.45, 0.31, -0.10, 0.23, 0.24),
         (-3.40, 9.55, 1.06, 0.55, 0.28, -0.17, -0.16, 0.08, 0.16)),
        (-4.5, 10.0, 2.9, 1.45, 0.32),
    ),
    (  # Shattered outcrop with its pieces kicked out onto the apron
        ((7.05, 6.0, 1.45, 1.18, 1.29, -0.62, -0.31, 0.14, 0.38),
         (7.98, 6.44, 1.55, 1.28, 0.89, 0.25, 0.34, -0.22, 0.31),
         (7.03, 4.62, 1.22, 0.71, 0.48, -0.94, 0.08, 0.15, 0.20),
         (6.54, 5.26, 0.81, 0.63, 0.62, 0.73, -0.32, -0.25, 0.19),
         (8.23, 4.95, 0.71, 0.61, 0.67, -0.12, 0.40, 0.35, 0.21)),
        (7.5, 5.4, 2.25, 1.65, -0.53),
    ),
    (  # Dipping fins along the far skyline
        ((1.1, 28.1, 2.68, 0.44, 1.55, -0.26, -0.13, -0.43, 0.48),
         (1.8, 27.2, 3.27, 0.46, 1.31, -0.20, -0.24, -0.47, 0.43),
         (2.69, 26.15, 2.33, 0.37, 0.93, 0.45, 0.21, -0.44, 0.31),
         (3.20, 25.72, 1.28, 0.27, 0.61, 0.35, 0.22, -0.42, 0.28)),
        (1.9, 26.5, 2.65, 1.72, 0.55),
    ),
    (  # Pavement of almost buried blocks beyond the pad
        ((20.0, 30.1, 3.22, 1.65, 0.86, -0.50, -0.09, 0.10, 0.48),
         (18.65, 31.25, 2.0, 1.33, 0.73, -0.54, 0.04, 0.13, 0.45),
         (20.65, 31.9, 2.68, 1.72, 0.86, -0.40, 0.19, 0.02, 0.56)),
        (19.75, 30.7, 2.85, 1.74, -0.49),
    ),
)

for i, (pieces, _) in enumerate(formations):
    for j, (x, y, w, d, h, heading, pitch, roll, burial) in enumerate(pieces):
        add_rock(fractured_piece(500 + 20 * i + j, x, y, (w, d, h), heading, pitch, roll, burial))

# A single leaning body with a narrow split that opens at the crown.
for side in (-1, 1):
    add_rock(fractured_piece(631, -8.0, 14.8, (1.66, 1.28, 2.38), -0.60, 0.30, -0.13, 0.52, split=side))


def scatter_scree(seed, x, y, length, width, heading, count):
    """Taper debris density and size down each outcrop's debris apron."""
    r = random.Random(seed)
    c, s = math.cos(heading), math.sin(heading)
    for j in range(count):
        angle = r.uniform(0, math.tau)
        distance = 0.25 + 1.25 * r.random() ** 1.7
        u = length * distance * math.cos(angle)
        v = width * distance * math.sin(angle) - 0.32
        lx, ly = x + c * u - s * v, y + s * u + c * v
        size = 0.028 + 0.32 * r.random() ** 2.0 * (1.0 - 0.62 * distance / 1.5)
        add_rock(place(make_rock(seed * 100 + j, size), lx, ly, size * 0.24))


# A rounded boulder pile anchors the outer side of the pad approach.
for i, (x, y, size, burial) in enumerate(((14.85, 16.7, 1.31, 0.40),
                                         (13.75, 16.21, 0.68, 0.22),
                                         (15.53, 16.01, 0.62, 0.22))):
    add_rock(place(make_rock(651 + i, size, hero=True), x, y, burial))

aprons = [data[1] for data in formations]
aprons.extend([(-7.8, 14.35, 1.95, 1.45, -0.46), (14.8, 16.25, 2.6, 1.51, 0.20)])
for i, apron in enumerate(aprons):
    scatter_scree(70 + i, *apron, 73)

# pebbles close to the camera and around the boots and pads
r3 = random.Random(SEED + 9)
for k in range(260):
    cx, cy = r3.choice([(ASTRO[0], ASTRO[1]), (-1.0, -6.5), (2.0, -4.5), (ROCKET[0], ROCKET[1]), (-3.5, -2.0)])
    rad_ = 5.5 if (cx, cy) != (ROCKET[0], ROCKET[1]) else PAD_R * 1.5
    ang = r3.uniform(0, 6.283)
    dd = rad_ * r3.random() ** 0.7
    x, y = cx + math.cos(ang) * dd, cy + math.sin(ang) * dd
    if math.hypot(x - ASTRO[0], y - ASTRO[1]) < 0.45:
        continue
    s = 0.025 + 0.07 * r3.random() ** 2
    add_rock(place(make_rock(4000 + k, s), x, y, s * 0.20))

rock_obj = join(rocks, 'Rocks')
log('terrain:', tri_count([terrain]), 'tris; rocks:', tri_count([rock_obj]), 'tris')

# ═══════════════════════════════════════════════════════════ AO + albedo ══
bake_ao([terrain, rock_obj], samples=48, distance=3.0)


def lin(hexstr):
    return np.array(rgb(hexstr))


DUST = lin('#77736b')
DUST_DARK = lin('#5a5852')
ROCKC = lin('#585a5f')
ROCK_DARK = lin('#46474a')
ROCK_DUST = lin('#74716b')


def tint_terrain(ob):
    me = ob.data
    ca = me.color_attributes.active_color
    n = len(ca.data)
    col = np.empty(n * 4, dtype=np.float32)
    ca.data.foreach_get('color', col)
    col = col.reshape(n, 4)
    vidx = np.empty(n, dtype=np.int32)
    me.loops.foreach_get('vertex_index', vidx)
    vt = np.empty((len(me.vertices), 3), dtype=np.float32)
    for i, v in enumerate(me.vertices):
        q = Vector(v.co) * 0.06
        a = 0.5 + 0.5 * noise.fractal(q, 1.0, 2.0, 3)
        b = 0.5 + 0.5 * noise.fractal(Vector(v.co) * 0.5 + Vector((40, 0, 0)), 1.0, 2.0, 2)
        slope = 1.0 - v.normal.z
        c = DUST * (0.55 + 0.45 * a) + DUST_DARK * (0.45 - 0.45 * a)
        c = c * (0.9 + 0.2 * b)
        k = min(1.0, slope * 3.0)
        c = c * (1 - k) + ROCKC * k
        vt[i] = c
    ao = np.clip(col[:, :3].mean(axis=1), 0, 1)
    ao = 0.30 + 0.70 * ao ** 1.25
    col[:, :3] = vt[vidx] * ao[:, None]
    col[:, 3] = 1.0
    ca.data.foreach_set('color', col.reshape(-1))


def tint_rocks(ob):
    me = ob.data
    ca = me.color_attributes.active_color
    n = len(ca.data)
    col = np.empty(n * 4, dtype=np.float32)
    ca.data.foreach_get('color', col)
    col = col.reshape(n, 4)
    vidx = np.empty(n, dtype=np.int32)
    me.loops.foreach_get('vertex_index', vidx)
    vt = np.empty((len(me.vertices), 3), dtype=np.float32)
    for i, v in enumerate(me.vertices):
        a = 0.5 + 0.5 * noise.fractal(Vector(v.co) * 0.35, 1.0, 2.0, 2)
        stone = ROCKC * (0.5 + 0.5 * a) + ROCK_DARK * (0.5 - 0.5 * a)
        dust = 0.38 * a * smooth(0.10, 0.92, v.normal.z)
        vt[i] = stone * (1.0 - dust) + ROCK_DUST * dust
    ao = np.clip(col[:, :3].mean(axis=1), 0, 1)
    ao = 0.25 + 0.75 * ao ** 1.3
    col[:, :3] = vt[vidx] * ao[:, None]
    col[:, 3] = 1.0
    ca.data.foreach_set('color', col.reshape(-1))


for _o in (terrain, rock_obj):
    _ca = _o.data.color_attributes.active_color
    _n = len(_ca.data)
    _arr = np.empty(_n * 4, dtype=np.float32)
    _ca.data.foreach_get('color', _arr)
    _bb = [min(v.co[i] for v in _o.data.vertices) for i in range(3)] + [max(v.co[i] for v in _o.data.vertices) for i in range(3)]
    log('AO mean', _o.name, round(float(_arr.reshape(_n, 4)[:, :3].mean()), 3), 'bbox', [round(b, 1) for b in _bb])
log('tinting')
tint_terrain(terrain)
tint_rocks(rock_obj)
export_glb(os.path.join(MODELS, 'home_terrain.glb'), [terrain, rock_obj])

# ═════════════════════════════════════════════════════════════════ globe ══
log('building globe')
bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=6, radius=1.0)
cols = {}
CAP = math.atan(L * 0.86 / R)
for v in bm.verts:
    d = v.co.normalized()
    h = height(d, detail=0.0)
    ang = math.acos(max(-1.0, min(1.0, d.z)))
    sink = 2.6 * smooth(CAP * 1.02, CAP * 0.86, ang)
    a = 0.5 + 0.5 * noise.fractal(d * R * 0.02, 1.0, 2.0, 3)
    c = DUST * (0.5 + 0.5 * a) + DUST_DARK * (0.5 - 0.5 * a)
    shade_h = 0.72 + 0.28 * smooth(-6.0, 5.0, h)
    cols[v.index] = c * shade_h
    v.co = d * (R + h - sink) - Vector((0, 0, R + H0))
planet = from_bm('Planet', bm, material('PlanetRock', '#ffffff', rough=0.95))
shade(planet, 180)
me = planet.data
ca = me.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER')
me.color_attributes.active_color = ca
for li, loop in enumerate(me.loops):
    c = cols[loop.vertex_index]
    ca.data[li].color = (c[0], c[1], c[2], 1.0)
export_glb(os.path.join(MODELS, 'home_planet.glb'), [planet])

# ════════════════════════════════════════════════════════════════ layout ══


def three(v):
    return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]


layout = {
    'radius': R,
    'center': three(Vector((0, 0, -(R + H0)))),
    'astronaut': {'pos': three(surface(*ASTRO)), 'up': three(local_up(*ASTRO))},
    'rocket': {'pos': three(surface(*ROCKET)), 'up': three(local_up(*ROCKET))},
    'ground': {},
}
for name, (x, y) in {'camera': (-1.3, -9.2), 'origin': (0.0, 0.0)}.items():
    layout['ground'][name] = three(surface(x, y))
with open(os.path.join(MODELS, 'home_layout.json'), 'w') as f:
    json.dump(layout, f, indent=2)
log('layout', json.dumps(layout))

if '--no-preview' not in sys.argv:
    # Show the exported albedo and bake in Blender's review renders.
    for mat in (TER, ROCK, planet.data.materials[0]):
        nodes = mat.node_tree.nodes
        vertex_color = nodes.new('ShaderNodeVertexColor')
        vertex_color.layer_name = 'AO'
        mat.node_tree.links.new(vertex_color.outputs['Color'], nodes.get('Principled BSDF').inputs['Base Color'])

    # Match the desktop shot's elevation, heading and vertical FOV.
    cam = Vector((-0.75, -8.9, layout['ground']['camera'][1] + 1.22))
    yaw, pitch = math.radians(3.6), math.radians(3.4)
    forward = Vector((math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    lens = (36 * 720 / 1280) / (2 * math.tan(math.radians(39) / 2))
    preview(os.path.join(WORK, 'terrain_hero.png'), cam, cam + forward * 30, lens=lens, res=(1280, 720),
            sun_dir=(-0.32, 1.0, 0.18), sun_strength=7.0, fill='#687386', fill_strength=1.3, samples=24,
            extra_lights=(((-7.0, -9.0, 6.0), 2600, '#ffe4cb', 12.0),))
    preview(os.path.join(WORK, 'terrain_top.png'), (0.0, -16.0, 55.0), (2.0, 12.0, -1.0),
            lens=38, res=(1100, 800), sun_dir=(-0.65, 0.55, 0.39), fill='#70798a', fill_strength=1.25, samples=16)
