"""Build the orbital survey probe in metres, with the display facing Blender -Y.

Screen is the site's display surface. ProbeBody is static. Dish, WingL and
WingR have independent pivots for the site's animation.
"""
import math
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(__file__))
from common import (  # noqa: E402
    MODELS, WORK, Vector, bake_ao, bevel, bmesh, box, cyl, export_glb,
    from_bm, join, lathe, log, material, preview, realize, reset, set_origin,
    shade, strut, torus, tri_count, tube, xf,
)


reset()

CER = material('Ceramic', '#d8d3c8', rough=0.5)
CER2 = material('CeramicB', '#c4beb2', rough=0.56)
GRA = material('Graphite', '#2c2f35', rough=0.5, metal=0.3)
DKM = material('DarkMetal', '#3c3f45', rough=0.38, metal=1.0)
MET = material('LegMetal', '#a0a4ab', rough=0.3, metal=1.0)
AMB = material('AmberLight', '#2a1c08', rough=0.4, emit='#ffb24a', emit_strength=8.0)
GLASS = material('Screen', '#0b0d10', rough=0.25)
CELL = material('SolarCell', '#141a24', rough=0.46, metal=0.22)

SIDE_AXIS = (0, math.pi / 2, 0)
FRONT_AXIS = (math.pi / 2, 0, 0)
DISH_PIVOT = Vector((0.83, 1.88, 1.62))


def octagon(x, z, cut):
    return [(x - cut, z), (-x + cut, z), (-x, z - cut), (-x, -z + cut),
            (-x + cut, -z), (x - cut, -z), (x, -z + cut), (x, z - cut)]


def xz_loft(name, rings, mat, chamfer, cap_ends):
    bm = bmesh.new()
    loops = [[bm.verts.new((x, y, z)) for x, z in outline] for outline, y in rings]
    if cap_ends:
        bm.faces.new(loops[0])
        bm.faces.new(loops[-1])
        next_loops = loops[1:]
    else:
        next_loops = loops[1:] + loops[:1]
    for a, b in zip(loops, next_loops):
        for i in range(len(a)):
            j = (i + 1) % len(a)
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = from_bm(name, bm, mat)
    bevel(ob, chamfer, 2, angle=25)
    return shade(realize(ob))


def xz_solid(name, outline, front, back, mat, chamfer):
    return xz_loft(name, [(outline, front), (outline, back)], mat, chamfer, cap_ends=True)


def frame(name, outer, inner, front, back, mat, chamfer):
    rings = [(outer, front), (inner, front), (inner, back), (outer, back)]
    return xz_loft(name, rings, mat, chamfer, cap_ends=False)


def screen_quad():
    bm = bmesh.new()
    corners = [(-1.6, 0, -1), (1.6, 0, -1), (1.6, 0, 1), (-1.6, 0, 1)]
    bm.faces.new([bm.verts.new(point) for point in corners])
    ob = from_bm('Screen', bm, GLASS)
    uv = ob.data.uv_layers.new(name='UVMap')
    for loop in ob.data.loops:
        x, _, z = ob.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((x + 1.6) / 3.2, (z + 1) / 2)
    return ob


def fastener(point, axis=FRONT_AXIS, radius=0.030):
    return cyl('Fastener', radius, 0.026, point, axis, MET, segs=12, bev=0.004)


def make_display():
    shell = octagon(1.84, 1.24, 0.235)
    aperture = octagon(1.62, 1.02, 0.035)
    parts = [frame('Display casting', shell, aperture, -0.071, 0.205, GRA, 0.023),
             frame('Glazing seal', octagon(1.652, 1.052, 0.061),
                   octagon(1.597, 0.997, 0.014), -0.013, 0.042, DKM, 0.007),
             xz_solid('Back cover', octagon(1.78, 1.175, 0.24), 0.158, 0.300, DKM, 0.035),
             xz_solid('Stamped rear shield', octagon(1.54, 1.01, 0.18), 0.280, 0.350, GRA, 0.026)]

    for sz in (-1, 1):
        for sx in (-1, 1):
            shoe = [(1.44, 1.255), (1.629, 1.255), (1.855, 1.029),
                    (1.855, 0.844), (1.703, 0.844), (1.703, 0.964),
                    (1.563, 1.104), (1.44, 1.104)]
            parts.append(xz_solid('Corner armor', [(sx * x, sz * z) for x, z in shoe],
                                  -0.115, 0.212, DKM, 0.019))
            for x, z in ((1.532, 1.174), (1.775, 0.931)):
                bolt = lathe('Socket head bolt', [(0, -0.015), (0.035, -0.015), (0.035, 0.008),
                             (0.030, 0.013), (0.017, 0.013), (0.013, 0.003), (0, 0.003)],
                             24, MET, angle=35)
                parts.append(xf(bolt, (sx * x, -0.115, sz * z), FRONT_AXIS))

    for sx in (-1, 1):
        parts.append(box('Bezel upright', (0.133, 0.070, 1.59), (sx * 1.752, -0.054, 0),
                         mat=DKM, bev=0.016))
        parts.append(box('Crown rail', (1.34, 0.055, 0.105), (sx * 0.715, -0.045, 1.18),
                         mat=DKM, bev=0.014))
        parts.append(box('Sill rail', (0.62, 0.060, 0.105), (sx * 1.07, -0.047, -1.162),
                         mat=DKM, bev=0.015))
        parts.append(box('Sill service inset', (0.244, 0.039, 0.104), (sx * 0.60, -0.056, -1.163),
                         mat=DKM, bev=0.015))
        for x in (0.535, 0.600, 0.665):
            parts.append(box('Sill louvre', (0.024, 0.021, 0.059), (sx * x, -0.080, -1.163),
                             (0, math.radians(16), 0), GRA, bev=0.005))

        rail = [(1.83, -0.008, -0.55), (1.96, -0.008, -0.55),
                (2.025, -0.008, -0.515), (2.055, -0.008, -0.442),
                (2.055, -0.008, 0.442), (2.025, -0.008, 0.515),
                (1.96, -0.008, 0.55), (1.83, -0.008, 0.55)]
        parts.append(tube('Grab handle', [(sx * x, y, z) for x, y, z in rail], 0.039, MET, res=3))
        for z in (-0.55, 0.55):
            parts.append(box('Handle socket', (0.13, 0.135, 0.15), (sx * 1.84, 0.012, z),
                             mat=GRA, bev=0.021))
            parts.append(cyl('Handle ferrule', 0.052, 0.052, (sx * 1.913, -0.008, z),
                             SIDE_AXIS, DKM, segs=20, bev=0.009))

    parts.append(xz_solid('Status panel', [(-0.42, -1.076), (0.42, -1.076), (0.46, -1.13),
                                          (0.36, -1.252), (-0.36, -1.252), (-0.46, -1.13)],
                          -0.101, -0.035, GRA, 0.018))
    for x in (-0.211, 0, 0.211):
        parts.append(box('Status recess', (0.158, 0.032, 0.075), (x, -0.104, -1.164),
                         mat=DKM, bev=0.015))
        parts.append(box('Status light', (0.106, 0.017, 0.032), (x, -0.121, -1.164),
                         mat=AMB, bev=0.007))
    return parts


def make_bus():
    parts = [box('Instrument bus', (1.85, 1.03, 1.93), (-0.13, 1.97, -0.07),
                 mat=GRA, bev=0.16, segs=3),
             box('Avionics cowl', (1.99, 1.13, 0.90), (-0.13, 1.98, 0.54),
                 mat=CER, bev=0.115, segs=3),
             box('Lower service cowl', (1.84, 1.10, 0.66), (-0.13, 1.98, -0.69),
                 mat=CER2, bev=0.10, segs=3),
             xf(xz_solid('Survey instrument', octagon(0.465, 0.415, 0.115), -0.51, 0.51, CER, 0.033),
                (-0.18, 1.49, -1.46)),
             box('Instrument connector plate', (0.65, 0.10, 0.26), (-0.18, 0.968, -1.59),
                 mat=DKM, bev=0.030),
             box('Top equipment saddle', (1.32, 0.84, 0.34), (0.20, 1.87, 1.030),
                 mat=GRA, bev=0.052),
             box('Crown instrument cover', (0.72, 0.68, 0.37), (0.035, 1.625, 1.10),
                 mat=CER2, bev=0.072),
             box('Crown instrument face', (0.40, 0.14, 0.14), (0.035, 1.292, 1.14),
                 mat=DKM, bev=0.025),
             box('Crown instrument light', (0.238, 0.030, 0.033), (0.035, 1.215, 1.14),
                 mat=AMB, bev=0.007)]
    for x in (-0.43, 0.07):
        parts.append(box('Instrument suspension bracket', (0.18, 0.46, 0.24), (x, 1.72, -1.035),
                         mat=DKM, bev=0.026))
    for x in (-0.382, -0.18, 0.022):
        parts.append(box('Instrument connector socket', (0.148, 0.032, 0.132), (x, 0.916, -1.59),
                         mat=GRA, bev=0.022))
        parts.append(box('Instrument connector lip', (0.080, 0.027, 0.027), (x, 0.899, -1.59),
                         mat=MET, bev=0.009))

    for sx in (-1, 1):
        x = -0.13 + sx * 0.90
        upper = Vector((sx * 1.50, 0.33, 0.71))
        lower = Vector((sx * 1.50, 0.33, -0.74))
        elbow = Vector((x + sx * 0.43, 1.64, -0.14))
        for p in (upper, lower):
            parts.append(box('Rear bulkhead cleat', (0.28, 0.23, 0.27), p, mat=GRA, bev=0.036))
            parts.append(strut('Display truss', p, elbow, 0.145, 0.155, DKM, bev=0.021))
            a = p.lerp(elbow, 0.12) + Vector((sx * 0.076, 0, 0))
            b = p.lerp(elbow, 0.90) + Vector((sx * 0.076, 0, 0))
            parts.append(strut('Truss flange', a, b, 0.077, 0.038, MET, bev=0.010, segs=2))
        parts.append(strut('Rear upright', upper, lower, 0.145, 0.117, DKM, bev=0.019))
        parts.append(box('Truss anchor lug', (0.63, 0.39, 0.39),
                         elbow - Vector((sx * 0.19, -0.03, 0)), mat=GRA, bev=0.048))
        parts.append(cyl('Truss pin', 0.127, 0.27, elbow + Vector((sx * 0.025, 0, 0)),
                         SIDE_AXIS, DKM, segs=24, bev=0.016))
        parts.append(fastener(elbow + Vector((sx * 0.162, 0, 0)), SIDE_AXIS, 0.065))

        parts.append(box('Access door', (0.086, 0.54, 0.47), (x + sx * 0.093, 2.01, 0.54),
                         mat=CER2, bev=0.033))
        for dy in (-0.19, 0.19):
            for z in (0.38, 0.70):
                parts.append(fastener((x + sx * 0.136, 2.01 + dy, z), SIDE_AXIS, 0.022))
        parts.append(box('Radiator surround', (0.14, 0.61, 0.37), (x + sx * 0.036, 2.11, -0.68),
                         mat=GRA, bev=0.040))
        for i in range(6):
            parts.append(box('Radiator fin', (0.055, 0.033, 0.27),
                             (x + sx * 0.111, 1.89 + i * 0.087, -0.68), mat=DKM, bev=0.006))

        tx = sx * 0.86 - 0.13
        parts.append(box('Thruster riser', (0.44, 0.69, 0.62), (tx, 1.51, -1.16),
                         mat=DKM, bev=0.055))
        parts.append(box('Thruster shroud', (0.49, 0.63, 0.36), (tx, 1.39, -1.49),
                         mat=CER2, bev=0.060))
        parts.append(xf(lathe('Recessed nozzle', [(0, 0.03), (0.115, 0.03), (0.157, -0.005),
                         (0.167, -0.13), (0.144, -0.163), (0.107, -0.163),
                         (0.078, -0.066), (0, -0.060)], 32, DKM, angle=46), (tx, 1.40, -1.656)))
        parts.append(box('Thruster indicator bezel', (0.235, 0.074, 0.09), (tx, 1.065, -1.527),
                         mat=GRA, bev=0.019))
        parts.append(box('Thruster indicator', (0.138, 0.027, 0.034), (tx, 1.026, -1.527),
                         mat=AMB, bev=0.008))

    parts.append(box('Rear radiator plate', (1.33, 0.13, 0.74), (-0.13, 2.49, -0.10),
                     mat=DKM, bev=0.06))
    for i in range(8):
        parts.append(box('Rear radiator fin', (0.048, 0.111, 0.56),
                         (-0.67 + i * 0.154, 2.57, -0.10), mat=GRA, bev=0.010))
    return parts


def make_dish(body_parts):
    x, y, z = DISH_PIVOT
    body_parts.extend([
        box('Mast saddle wing', (0.50, 0.60, 0.32), (x - 0.08, y, 1.12), mat=CER, bev=0.055),
        cyl('Azimuth collar', 0.245, 0.16, (x, y, 1.285), mat=DKM, segs=32, bev=0.025),
        box('Antenna mast', (0.255, 0.25, 0.32), (x, y, 1.45), mat=GRA, bev=0.045),
    ])
    for sx in (-1, 1):
        body_parts.append(strut('Gimbal clevis', (x + sx * 0.08, y, 1.36),
                               (x + sx * 0.146, y, z + 0.038), 0.158, 0.075, DKM, bev=0.018))

    parts = [cyl('Gimbal axle', 0.104, 0.422, DISH_PIVOT, SIDE_AXIS, DKM, segs=28, bev=0.012)]
    for sx in (-1, 1):
        parts.append(fastener(DISH_PIVOT + Vector((sx * 0.216, 0, 0)), SIDE_AXIS, 0.056))

    surface = [(r, 0.245 + 0.38 * r * r) for r in (0, 0.07, 0.15, 0.24, 0.34, 0.44, 0.54, 0.61, 0.644)]
    back = [(r, height - (0.036 if r > 0.54 else 0.052)) for r, height in reversed(surface)]
    tilted = [lathe('Reflector', surface + [(0.651, 0.390)] + back, 64, CER, angle=75),
              torus('Reflector rolled edge', 0.642, 0.012, (0, 0, 0.390),
                    mat=CER2, seg=64, rseg=8),
              cyl('Reflector back hub', 0.16, 0.16, (0, 0, 0.143), mat=DKM, segs=32, bev=0.02),
              cyl('Feed horn plinth', 0.076, 0.077, (0, 0, 0.265), mat=DKM, segs=24, bev=0.013),
              cyl('Feed stem', 0.038, 0.269, (0, 0, 0.414), mat=DKM, segs=24, bev=0.007),
              cyl('Feed horn', 0.061, 0.122, (0, 0, 0.574), mat=CER2, segs=28, bev=0.010, r2=0.092),
              cyl('Feed horn cap', 0.066, 0.024, (0, 0, 0.634), mat=DKM, segs=24, bev=0.005)]
    for i in range(3):
        angle = math.radians(20 + 120 * i)
        px, py = 0.554 * math.cos(angle), 0.554 * math.sin(angle)
        tilted.append(cyl('Feed stay shoe', 0.034, 0.027, (px, py, 0.363),
                          mat=CER2, segs=16, bev=0.006))
        tilted.append(tube('Feed stay', [(px, py, 0.373), (px * 0.117, py * 0.117, 0.552)],
                           0.013, MET, res=2))
    for i in range(6):
        angle = math.radians(48 + 60 * i)
        tilted.append(tube('Reflector petal seam',
                           [(r * math.cos(angle), r * math.sin(angle), height)
                            for r, height in surface[2:]], 0.003, CER2, res=1))
    for ob in tilted:
        parts.append(xf(ob, DISH_PIVOT, (math.radians(41), math.radians(11), math.radians(-5))))
    return set_origin(join(parts, 'Dish'), DISH_PIVOT)


def make_wing(side, body_parts):
    root = Vector((side * 1.09 - 0.13, 2.00, 0.725))
    tip = Vector((side * 2.48, 2.25, 1.02))
    body_parts.append(box('Wing root mount', (0.27, 0.40, 0.38), root - Vector((side * 0.12, 0, 0)),
                          mat=GRA, bev=0.047))
    parts = [cyl('Root hinge', 0.144, 0.34, root, FRONT_AXIS, DKM, segs=28, bev=0.018),
             cyl('Root hinge cap', 0.086, 0.375, root, FRONT_AXIS, MET, segs=24, bev=0.011),
             strut('Solar wing boom', root, tip, 0.144, 0.135, DKM, bev=0.023),
             strut('Solar boom brace', root + Vector((0, 0, -0.105)), tip, 0.067, 0.087, GRA, bev=0.014)]

    panels = []
    for panel, center in enumerate((0.635, 1.979)):
        cx = side * center
        panels.append(box('Solar blanket backing', (1.27, 0.073, 1.10), (cx, 0.014, 0),
                          mat=GRA, bev=0.027))
        panels.append(box('Solar cell field', (1.18, 0.022, 1.016), (cx, -0.029, 0),
                          mat=CELL, bev=0.009))

        for j in range(1, 7):
            panels.append(box('Cell column busbar', (0.012, 0.013, 1.018),
                              (cx - 0.59 + j * 1.18 / 7, -0.039, 0), mat=GRA, bev=0.002, segs=1))
        for row in range(1, 5):
            panels.append(box('Cell row busbar', (1.179, 0.013, 0.009),
                              (cx, -0.037, -0.508 + row * 1.016 / 5), mat=GRA, bev=0.002, segs=1))
        for z in (-0.526, 0.526):
            panels.append(box('Solar edge extrusion', (1.238, 0.079, 0.046), (cx, -0.010, z),
                              mat=DKM, bev=0.011))
        for s in (-1, 1):
            panels.append(box('Solar end extrusion', (0.046, 0.079, 1.043),
                              (cx + s * 0.612, -0.010, 0), mat=DKM, bev=0.011))
            for z in (-0.517, 0.517):
                panels.append(box('Solar corner clip', (0.106, 0.054, 0.071),
                                  (cx + s * 0.579, -0.037, z), mat=MET, bev=0.010))
        panels.append(box('Blanket back spar', (1.08, 0.072, 0.13), (cx, 0.061, 0),
                          mat=DKM, bev=0.016))

    for px, zs in ((0, (0,)), (1.307, (-0.39, 0.39))):
        for z in zs:
            panels.append(box('Blanket hinge leaf', (0.19, 0.10, 0.14), (side * px, 0.018, z),
                              mat=DKM, bev=0.018))
            panels.append(cyl('Blanket hinge pin', 0.057, 0.173, (side * px, -0.006, z),
                              mat=MET, segs=20, bev=0.010))

    for ob in panels:
        parts.append(xf(ob, tip, (math.radians(-26), 0, side * math.radians(9))))
    return set_origin(join(parts, 'WingL' if side < 0 else 'WingR'), root)


screen = screen_quad()
body_parts = make_display() + make_bus()
dish = make_dish(body_parts)
left = make_wing(-1, body_parts)
right = make_wing(1, body_parts)
body = join(body_parts, 'ProbeBody')
objects = [screen, body, dish, left, right]
triangles = tri_count(objects)
if triangles > 70_000:
    raise RuntimeError(f'Probe exceeds triangle budget: {triangles:,}')

points = [tuple(v.co + ob.location) for ob in objects for v in ob.data.vertices]
minimum = tuple(round(min(axis), 4) for axis in zip(*points))
maximum = tuple(round(max(axis), 4) for axis in zip(*points))
log('Blender bounds in metres:', minimum, maximum)
for ob in objects:
    log(ob.name, 'origin', tuple(round(v, 4) for v in ob.location), 'triangles', tri_count([ob]))

bake_ao(objects, samples=64, distance=1.2)
for color in screen.data.color_attributes.active_color.data:
    color.color = (1, 1, 1, 1)

path = os.path.join(MODELS, 'probe.glb')
export_glb(path, [screen, body, dish, left, right])
if os.path.getsize(path) > 3_000_000:
    raise RuntimeError('Probe exceeds the 3 MB GLB budget')

if '--no-preview' not in sys.argv:
    lights = (((-3.9, -2.0, 4.8), 350, '#dbe5ff', 4.0),
              ((3.2, 4.0, 3.6), 360, '#ffe7c6', 3.0),
              ((4.6, -1.7, 1.9), 460, '#e5ecff', 3.4))
    preview(os.path.join(WORK, 'probe_front.png'), (0, -9, 0.2), (0, 0, 0), lens=50,
            res=(1200, 800), samples=24, sun_dir=(-0.6, -0.6, 0.4), fill='#606a78', extra_lights=lights)
    preview(os.path.join(WORK, 'probe_34.png'), (-6.8, -7.7, 2.2), (-1.18, 0.60, 0.15), lens=36,
            res=(1200, 800), samples=24, sun_dir=(-0.6, -0.6, 0.4), fill='#606a78', extra_lights=lights)
    preview(os.path.join(WORK, 'probe_front_wide.png'), (0, -9, 0.2), (0, 0, 0), lens=36,
            res=(1200, 800), samples=24, sun_dir=(-0.6, -0.6, 0.4), fill='#606a78', extra_lights=lights)
    if '--review-side' in sys.argv:
        preview(os.path.join(WORK, 'probe_side.png'), (-10, 0.4, 0.6), (0, 1.57, 0.2), lens=42,
                res=(1200, 800), samples=24, sun_dir=(-0.6, -0.6, 0.4), fill='#606a78', extra_lights=lights)
