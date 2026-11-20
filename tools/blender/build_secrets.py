"""Build the flight props headless. Blender +Y maps to glTF -Z."""
import math
import os
import sys
from bisect import bisect_right

import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from common import (
    MODELS, WORK, bake_ao, bevel, box, cyl, export_glb, from_bm, lathe, log,
    interp, join, material, preview, realize, reset, set_origin, shade, strut, torus, tri_count, xf,
)


def palette():
    return {
        'cer': material('Ceramic', '#d8d3c8', rough=0.5),
        'alt': material('CeramicB', '#c4beb2', rough=0.56),
        'gra': material('Graphite', '#2c2f35', rough=0.5, metal=0.3),
        'dark': material('DarkMetal', '#3c3f45', rough=0.38, metal=1.0),
        'metal': material('LegMetal', '#a0a4ab', rough=0.3, metal=1.0),
        'glass': material('Glazing', '#120c05', rough=0.05, coat=1.0,
                          emit='#ffb45a', emit_strength=0.12),
        'amber': material('AmberLight', '#2a1c08', rough=0.4, emit='#ffb24a', emit_strength=8.0),
        'engine': material('EngineGlow', '#0a0a0c', rough=0.6, emit='#ffd9a0', emit_strength=4.0),
    }


def loft(name, sections, mat, chamfer=0.0, smooth_angle=42):
    """Join equally ordered, closed cross-sections and cap the ends."""
    bm = bmesh.new()
    rings = [[bm.verts.new(point) for point in section] for section in sections]
    count = len(rings[0])
    bm.faces.new(rings[0][::-1])
    for first, second in zip(rings, rings[1:]):
        for i in range(count):
            j = (i + 1) % count
            bm.faces.new((first[i], first[j], second[j], second[i]))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = from_bm(name, bm, mat)
    if chamfer:
        bevel(obj, chamfer, 3, angle=24)
        realize(obj)
    return shade(obj, smooth_angle)


def plate(name, outline, lower, upper, mat, chamfer=0.035, slope=(0, 0)):
    dx, dy = slope
    return loft(name, [[(x, y, z + dx * x + dy * y) for x, y in outline]
                       for z in (lower, upper)], mat, chamfer)


def polar(radius, angle, z):
    return (radius * math.cos(angle), radius * math.sin(angle), z)


def sweep(name, profile, mat, start, end, segments=32, angle=42):
    return lathe(name, profile, segments, mat, arc=(math.radians(start), math.radians(end)), angle=angle)


def flight_section(y, width, keel, crown):
    return [(width * x, y, keel + (crown - keel) * z) for x, z in (
        (-0.60, 0), (0.60, 0), (0.91, 0.17), (1.0, 0.43), (0.94, 0.66),
        (0.66, 0.96), (0.50, 1), (-0.50, 1), (-0.66, 0.96), (-0.94, 0.66),
        (-1.0, 0.43), (-0.91, 0.17),
    )]


def canopy_section(y, width, base, top):
    return [(width * math.cos(a), y, base + (top - base) * math.sin(a))
            for a in (math.pi * i / 24 for i in range(25))]


def build_scout():
    m = palette()
    spine = [(-3.06, 0.69, -0.63, 0.27), (-2.65, 1.01, -0.74, 0.46),
             (-1.47, 1.16, -0.74, 0.55), (-0.22, 0.99, -0.68, 0.55),
             (1.26, 0.74, -0.53, 0.48), (2.44, 0.47, -0.35, 0.28),
             (3.33, 0.21, -0.17, 0.09), (3.58, 0.10, -0.11, -0.01)]
    parts = [loft('Structural keel', [flight_section(*row) for row in spine], m['gra'], 0.075)]
    structure = parts.copy()
    # The external ceramic lofts follow the keel with a narrow transverse gap.
    skins = [
        (m['alt'], [(-2.83, 0.91, 0.40), (-2.62, 1.00, 0.52), (-1.54, 1.16, 0.62)]),
        (m['cer'], [(-1.48, 1.16, 0.62), (-0.20, 1.00, 0.62), (1.43, 0.72, 0.53)]),
        (m['cer'], [(1.49, 0.71, 0.52), (2.48, 0.48, 0.34), (3.33, 0.22, 0.14), (3.56, 0.10, 0.035)]),
    ]
    for mat, rows in skins:
        parts.append(loft('Ceramic fuselage skin', [flight_section(y, w, z - 0.45, z)
                                                   for y, w, z in rows], mat, 0.047))

    canopy = [(-0.98, 0.37, 0.53, 0.65), (-0.68, 0.57, 0.55, 0.91),
              (-0.30, 0.60, 0.55, 1.05), (0.38, 0.53, 0.51, 1.03),
              (1.00, 0.37, 0.48, 0.83), (1.55, 0.19, 0.43, 0.57),
              (1.66, 0.10, 0.42, 0.48)]
    parts.append(loft('Canopy frame', [canopy_section(y, w + 0.072, b - 0.030, b + 0.17)
                                       for y, w, b, _ in canopy], m['gra'], 0.041))
    width, base, top = [interp([(row[0], row[i]) for row in canopy]) for i in (1, 2, 3)]
    ys = [canopy[0][0] + (canopy[-1][0] - canopy[0][0]) * i / 32 for i in range(33)]
    parts.append(loft('Canopy glazing', [canopy_section(y, width(y), base(y) - 0.005, top(y) + 0.027)
                                         for y in ys], m['glass'], 0.013, 55))
    nose_access = [(-0.21, 1.68), (0.21, 1.68), (0.25, 1.94), (0.10, 2.77),
                   (0.04, 2.88), (-0.04, 2.88), (-0.10, 2.77), (-0.25, 1.94)]
    parts.append(plate('Nose avionics lip', nose_access, 0.754, 0.864, m['gra'], 0.021, (0, -0.198)))
    inset_nose = [(x * 0.81, 2.24 + (y - 2.24) * 0.93) for x, y in nose_access]
    parts.append(plate('Nose avionics cover', inset_nose, 0.850, 0.884, m['alt'], 0.015, (0, -0.198)))
    fin_profile = [(-2.56, 0.43), (-2.33, 0.88), (-2.04, 0.91), (-1.45, 0.58)]
    parts.append(loft('Dorsal sensor fin', [[(x, y, z) for y, z in fin_profile]
                                           for x in (-0.105, 0.105)], m['alt'], 0.046))
    parts.append(box('Sensor socket', (0.43, 1.10, 0.11), (0, -1.99, 0.572), mat=m['gra'], bev=0.055))
    parts.append(box('Aft power bay bulkhead', (1.08, 0.21, 0.53), (0, -3.01, -0.18),
                     mat=m['dark'], bev=0.091))
    parts.append(box('Aft radiator recess', (0.73, 0.062, 0.31), (0, -3.128, -0.19),
                     mat=m['gra'], bev=0.044))
    for z in (-0.28, -0.19, -0.10):
        parts.append(box('Aft radiator louver', (0.59, 0.048, 0.039), (0, -3.160, z),
                         mat=m['metal'], bev=0.013))

    for side in (-1, 1):
        def mirror(points):
            return [(side * x, y) for x, y in points]

        wing_outline = [(0.69, 0.65), (1.01, 0.57), (2.43, -1.27), (2.50, -1.73),
                        (2.31, -2.13), (1.29, -1.90), (0.65, -1.40)]
        parts.append(plate('Wing spar', mirror(wing_outline), -0.34, 0.115, m['gra'],
                           0.085, (-side * 0.067, 0)))
        structure.append(parts[-1])
        panels = [
            (m['cer'], [(0.76, 0.58), (1.00, 0.51), (2.39, -1.29), (2.43, -1.54),
                        (1.33, -1.19), (0.72, -0.92)]),
            (m['alt'], [(0.73, -0.99), (1.34, -1.25), (2.44, -1.60), (2.45, -1.75),
                        (2.29, -2.07), (1.32, -1.84), (0.68, -1.39)]),
        ]
        for mat, outline in panels:
            parts.append(plate('Wing control surface', mirror(outline), 0.056, 0.198, mat,
                               0.042, (-side * 0.067, 0)))
        access = [(1.14, -0.02), (1.27, -0.10), (1.94, -0.94), (1.90, -1.04),
                  (1.71, -0.99), (1.18, -0.34)]
        parts.append(plate('Wing actuator panel', mirror(access), 0.177, 0.215, m['alt'],
                           0.016, (-side * 0.067, 0)))
        marker = (side * 2.38, -1.72, 0.046)
        parts.append(box('Wing tip lamp housing', (0.20, 0.36, 0.14), marker, mat=m['dark'], bev=0.055))
        parts.append(box('Wing tip marker', (0.088, 0.20, 0.057),
                         (marker[0] + side * 0.018, marker[1], 0.117), mat=m['amber'], bev=0.026))

        engine = (side * 1.31, -2.29, -0.096)
        rotation = (math.pi / 2, 0, 0)
        pod = [(0, -1.12), (0.21, -1.12), (0.33, -1.01), (0.47, -0.73),
               (0.54, -0.28), (0.55, 0.30), (0.49, 0.49), (0, 0.49)]
        housing = [(0, 0.35), (0.48, 0.35), (0.52, 0.55), (0.53, 0.82),
                   (0.50, 1.02), (0.46, 1.12), (0.39, 1.12), (0.35, 1.06),
                   (0.30, 0.72), (0, 0.72)]
        parts.append(xf(lathe('Ceramic nacelle', pod, 48, m['alt'], angle=48), engine, rotation))
        parts.append(xf(lathe('Recessed nozzle housing', housing, 48, m['dark'], angle=48), engine, rotation))
        structure.extend(parts[-2:])
        parts.append(xf(torus('Nozzle rim', 0.433, 0.022, (0, 0, 1.122), mat=m['metal'], seg=48, rseg=8),
                        engine, rotation))
        parts.append(xf(cyl('Recessed exhaust face', 0.294, 0.028, (0, 0, 0.748), mat=m['engine'], segs=48),
                        engine, rotation))
        parts.append(box('Nacelle cooling pocket', (0.38, 0.56, 0.083),
                         (engine[0], -2.16, 0.439), mat=m['gra'], bev=0.035))
        for i in range(4):
            parts.append(box('Nacelle cooling vane', (0.25, 0.040, 0.037),
                             (engine[0], -2.34 + i * 0.116, 0.481), mat=m['dark'], bev=0.014))

    return parts, structure


def build_freighter():
    m = palette()
    profile = [(0, -0.68), (1.32, -0.68), (2.13, -0.58), (3.41, -0.37),
               (3.81, -0.29), (3.99, -0.21), (4.00, -0.15), (3.80, -0.104),
               (3.79, 0.106), (3.99, 0.165), (4.00, 0.22), (3.94, 0.28),
               (3.64, 0.36), (3.40, 0.40), (2.16, 0.59), (1.28, 0.665), (0, 0.665)]
    parts = [lathe('Saucer and equatorial channel', profile, 120, m['gra'], angle=38)]
    structure = parts.copy()
    decks = [
        (0, 360, [(0, 0.661), (1.20, 0.661), (1.27, 0.682), (1.23, 0.721), (0, 0.729)], m['alt']),
        (1.3, 77, [(1.30, 0.668), (1.33, 0.712), (2.11, 0.643), (2.15, 0.615), (2.16, 0.579)], m['cer']),
        (79, 190, [(1.30, 0.668), (1.33, 0.712), (2.11, 0.643), (2.15, 0.615), (2.16, 0.579)], m['alt']),
        (192, 358.7, [(1.30, 0.668), (1.33, 0.712), (2.11, 0.643), (2.15, 0.615), (2.16, 0.579)], m['cer']),
    ]
    for lo, hi, shape, mat in decks:
        # The outer shell of each open deck strip runs from outside to inside.
        if lo != 0:
            shape = shape[::-1]
        parts.append(sweep('Inner deck panel', shape, mat, lo, hi, max(16, int((hi - lo) / 3))))

    outer_panels = [(0.8, 42, 'alt'), (43, 84, 'cer'), (85, 119, 'alt'), (120, 159, 'cer'),
                    (160, 178, 'gra'), (179, 208, 'cer'), (209, 234, 'alt'), (235, 253, 'gra'),
                    (254, 294, 'cer'), (295, 313, 'gra'), (314, 332, 'alt'),
                    (333, 359.2, 'cer')]
    for lo, hi, key in outer_panels:
        lip = [(3.96, 0.217), (4.011, 0.240), (3.96, 0.291), (3.65, 0.401)]
        deck = [(3.39, 0.454), (2.25, 0.633), (2.19, 0.625), (2.18, 0.571)]
        if key == 'gra':
            parts.append(sweep('Exposed structural rim', lip + [(3.48, 0.432), (3.43, 0.403)], m[key], lo, hi, 16))
            lip = [(3.42, 0.390), (3.40, 0.444)]
            key = 'alt'
        parts.append(sweep('Outer ceramic armor', lip + deck, m[key], lo, hi, 20))
    for lo, hi in ((215, 234), (238, 254), (289, 307), (311, 330)):
        parts.append(sweep('Engine inspection deck', [(3.79, 0.338), (3.77, 0.393), (3.67, 0.439),
                           (3.07, 0.541), (2.99, 0.533), (2.97, 0.477)], m['gra'], lo, hi, 16))
    for lo, hi in ((6, 85), (95, 174), (184, 263), (273, 354)):
        shape = [(1.30, -0.66), (1.34, -0.709), (2.11, -0.63), (3.35, -0.432),
                 (3.76, -0.347), (3.89, -0.272), (3.89, -0.239)]
        parts.append(sweep('Lower armor slab', shape, m['alt'], lo, hi, 27))

    # A curved exhaust set into the graphite equatorial channel.
    for z in (-0.116, 0.112):
        parts.append(sweep('Exhaust rail', [(3.81, z - 0.041), (3.951, z - 0.028),
                                            (3.978, z), (3.951, z + 0.020), (3.81, z + 0.029)],
                           m['dark'], 210, 330, 48))
    parts.append(sweep('Wide recessed engine strip', [(3.89, -0.079), (3.90, -0.059),
                                                       (3.90, 0.059), (3.89, 0.079)],
                       m['engine'], 210, 330, 60, angle=55))
    for angle in range(210, 331, 15):
        a = math.radians(angle)
        parts.append(box('Exhaust separator', (0.19, 0.075, 0.265), polar(3.90, a, 0),
                         (0, 0, a), m['dark'], bev=0.025))

    for side in (-1, 1):
        def mirror(points):
            return [(side * x, y) for x, y in points]

        footprint = [(0.46, 3.16), (1.50, 2.69), (2.88, 2.35), (2.26, 3.90),
                     (1.61, 5.20), (1.26, 5.49), (0.75, 5.50), (0.52, 5.31)]
        parts.append(plate('Mandible frame', mirror(footprint), -0.44, 0.20, m['gra'], 0.10, (0, -0.013)))
        structure.append(parts[-1])
        outline = [(0.55, 3.56), (1.25, 3.37), (2.46, 3.22), (2.14, 3.89),
                   (1.58, 5.15), (1.24, 5.42), (0.78, 5.44), (0.58, 5.24)]
        parts.append(plate('Mandible ceramic plating', mirror(outline), 0.136, 0.381, m['cer'],
                           0.071, (0, -0.013)))
        hatch = [(0.68, 3.98), (1.25, 3.98), (1.31, 4.20), (1.05, 5.19),
                 (0.78, 5.23), (0.68, 5.04)]
        parts.append(plate('Mandible access hatch', mirror(hatch), 0.379, 0.420, m['alt'],
                           0.021, (0, -0.013)))
        hardpoint = [(1.42, 4.01), (1.98, 3.94), (1.55, 4.78), (1.37, 4.91), (1.27, 4.75)]
        parts.append(plate('Mandible power fairing', mirror(hardpoint), 0.355, 0.475, m['gra'],
                           0.036, (0, -0.019)))
        parts.append(box('Mandible marker well', (0.36, 0.20, 0.09), (side * 1.02, 5.275, 0.287),
                         mat=m['gra'], bev=0.03))
        parts.append(box('Mandible position lamp', (0.19, 0.069, 0.034), (side * 1.02, 5.31, 0.333),
                         mat=m['amber'], bev=0.014))

    pod_x, pod_y, pod_z = 4.16, 2.31, 0.14
    parts.append(cyl('Cockpit boarding tube', 0.315, 2.10, (3.19, 2.13, 0.07),
                     (0, math.pi / 2, 0.18), m['dark'], segs=40, bev=0.035))
    structure.append(parts[-1])
    parts.append(cyl('Boarding tube collar', 0.355, 0.20, (3.62, 2.21, 0.07),
                     (0, math.pi / 2, 0.18), m['metal'], segs=40, bev=0.028))
    pod_rot = (-math.pi / 2, 0, 0)
    pod_at = (pod_x, pod_y, pod_z)
    pod = [(0, -1.11), (0.43, -1.11), (0.53, -0.94), (0.55, -0.61),
           (0.54, 0.33), (0.50, 0.45), (0, 0.45)]
    parts.append(xf(lathe('Starboard cockpit pressure shell', pod, 48, m['alt'], angle=45), pod_at, pod_rot))
    structure.append(parts[-1])
    parts.append(xf(cyl('Cockpit aft pressure collar', 0.468, 0.204, (0, 0, -1.080),
                        mat=m['gra'], segs=40, bev=0.063), pod_at, pod_rot))
    parts.append(xf(cyl('Cockpit aft service cap', 0.25, 0.079, (0, 0, -1.181),
                        mat=m['metal'], segs=32, bev=0.026), pod_at, pod_rot))
    frame = [(0, 0.26), (0.511, 0.26), (0.52, 0.46), (0.44, 0.77),
             (0.34, 0.96), (0, 0.99)]
    parts.append(xf(lathe('Cockpit visor frame', frame, 48, m['gra'], angle=48), pod_at, pod_rot))
    visor = [(0.511, 0.39), (0.514, 0.48), (0.437, 0.76), (0.348, 0.944),
             (0.287, 0.995), (0.133, 1.025), (0, 1.029)]
    parts.append(xf(lathe('Wraparound cockpit glass', visor, 48, m['glass'], angle=55), pod_at, pod_rot))
    parts.append(xf(torus('Cockpit visor gasket', 0.505, 0.026, (0, 0, 0.455),
                          mat=m['dark'], seg=48, rseg=8), pod_at, pod_rot))

    for x, y, z, turn, width, slats in ((-1.39, -1.81, 0.624, 0.40, 0.79, 4),
                                        (0.94, -2.26, 0.600, -0.23, 0.62, 3),
                                        (2.38, 0.61, 0.603, 1.23, 0.54, 4)):
        parts.append(box('Deck vent well', (width, 0.14 + 0.084 * slats, 0.104), (x, y, z),
                         (0, 0, turn), m['gra'], bev=0.075))
        for i in range(slats):
            dy = (i - (slats - 1) / 2) * 0.084
            parts.append(box('Deck radiator slat', (width - 0.15, 0.040, 0.033),
                             (x - dy * math.sin(turn), y + dy * math.cos(turn), z + 0.056),
                             (0, 0, turn), m['dark'], bev=0.014))

    for x, y, z, radius in ((0.42, 0.00, 0.727, 0.40), (-1.86, -0.49, 0.665, 0.27)):
        parts.append(cyl('Hatch flange', radius, 0.13, (x, y, z), mat=m['gra'], segs=40, bev=0.030))
        parts.append(cyl('Ceramic hatch cover', radius * 0.82, 0.081, (x, y, z + 0.073),
                         mat=m['alt'], segs=40, bev=0.026))
        parts.append(box('Recessed hatch latch', (radius * 0.81, 0.078, 0.034),
                         (x, y, z + 0.115), mat=m['dark'], bev=0.016))

    dish_at = (-1.77, 0.89, 1.10)
    dish_rot = (math.radians(41), math.radians(-18), 0)
    parts.append(cyl('Scanner deck mount', 0.34, 0.19, (-1.78, 0.89, 0.70), mat=m['gra'], segs=40, bev=0.037))
    parts.append(strut('Scanner gimbal strut', (-1.78, 0.89, 0.72), dish_at, 0.22, 0.19, m['dark'], bev=0.039))
    dish = [(0, -0.065), (0.20, -0.048), (0.34, 0.006), (0.48, 0.122),
            (0.487, 0.160), (0.459, 0.185), (0.423, 0.153), (0.315, 0.073),
            (0.17, 0.022), (0, 0.008)]
    parts.append(xf(lathe('Scanner reflector', dish, 48, m['alt'], angle=58), dish_at, dish_rot))
    parts.append(xf(cyl('Scanner feed stalk', 0.047, 0.20, (0, 0, 0.095), mat=m['dark'], segs=24, bev=0.012),
                    dish_at, dish_rot))
    parts.append(xf(cyl('Scanner receiver', 0.086, 0.057, (0, 0, 0.202), mat=m['metal'], segs=24, bev=0.018),
                    dish_at, dish_rot))
    return parts, structure


DISH_LAT = math.radians(35)
DISH_CUT = 0.269
DISH_PLANE = math.sqrt(1 - DISH_CUT ** 2)


def planet_point(latitude, azimuth, radius):
    return polar(radius * math.cos(latitude), azimuth, radius * math.sin(latitude))


def station_shell(materials):
    # Latitude-aligned rings preserve the continuous grooves. Each ring opens
    # where the dish plane intersects it, leaving an actual hole in the shell.
    edge = math.degrees(math.asin(DISH_CUT))
    profile = [(-90, 1.0, 0), (-4.3, 1.0, 0), (-3.75, 0.996, 1),
               (-2.45, 0.956, 2), (-1.65, 0.946, 2), (1.65, 0.946, 2),
               (2.45, 0.956, 2), (3.75, 0.996, 1), (4.3, 1.0, 0), (90, 1.0, 1)]
    bands = (-70, -55, -39, -22, -11, 12, 24, 39, 53, 69, 81)
    for i, latitude in enumerate(bands):
        mat = i % 2
        profile.extend([(latitude - 1.05, 1.0, mat), (latitude - 0.52, 0.995, 1),
                        (latitude - 0.28, 0.984, 2), (latitude + 0.28, 0.984, 2),
                        (latitude + 0.52, 0.995, 1), (latitude + 1.05, 1.0, mat)])
    profile.sort()
    rows = []
    for (lo, r0, mat), (hi, r1, _) in zip(profile, profile[1:]):
        steps = math.ceil((hi - lo) / 2.6)
        rows.extend((lo + (hi - lo) * i / steps, r0 + (r1 - r0) * i / steps, mat)
                    for i in range(steps))
    rows.append(profile[-1])
    for latitude in (35 - edge, 35 + edge):
        for (lo, r0, mat), (hi, r1, _) in zip(rows, rows[1:]):
            if lo < latitude < hi:
                rows.append((latitude, r0 + (r1 - r0) * (latitude - lo) / (hi - lo), mat))
                rows.sort()
                break

    bm = bmesh.new()
    segments = 144
    phases = (4, 10, 16)
    joints = [i for i in range(segments) if i % 18 in phases]
    samples = sorted([*range(segments), *(i + step for i in joints for step in (-0.22, 0.22))])
    band_edges = sorted((-90, *bands, -4.3, 4.3, 90))
    rings = []
    for degrees, radius, mat in rows:
        lat = math.radians(degrees)
        if abs(degrees) == 90:
            vertex = bm.verts.new((0, 0, math.copysign(radius, degrees)))
            rings.append(([vertex] * (len(samples) + 1), mat))
            continue
        cut = 0.0
        if abs(degrees - 35) < edge - 1e-6:
            cosine = (DISH_PLANE - math.sin(DISH_LAT) * math.sin(lat)) / (math.cos(DISH_LAT) * math.cos(lat))
            cut = math.acos(min(1.0, max(-1.0, cosine)))
        band = bisect_right(band_edges, degrees) - 1
        clearance = min(degrees - band_edges[band], band_edges[band + 1] - degrees)
        depth = 0.0065 * min(1.0, max(0.0, (clearance - 0.6) / 1.3))
        if abs(degrees) > 77 or abs(degrees) < 4.3:
            depth = 0.0
        phase = phases[band % len(phases)]
        verts = []
        for i in samples + ([segments] if cut else []):
            angle = 2 * math.pi * i / segments
            # Carry the mouth of the cut into nearby cells with a smooth falloff.
            near_edge = min(angle, 2 * math.pi - angle)
            blend = max(0.0, 1.0 - near_edge / math.radians(50))
            shift = cut * blend * blend * (3 - 2 * blend)
            angle += shift if angle < math.pi else -shift
            inset = depth if i % 18 == phase else 0.0
            if cut:
                margin = near_edge + shift - cut
                inset *= min(1.0, max(0.0, (margin - 0.09) / 0.14))
            verts.append(bm.verts.new(planet_point(lat, angle - math.pi / 2, radius - inset)))
        if cut == 0:
            verts.append(verts[0])
        rings.append((verts, mat))

    for (below, mat), (above, _) in zip(rings, rings[1:]):
        for i in range(len(samples)):
            corners = list(dict.fromkeys((below[i], below[i + 1], above[i + 1], above[i])))
            face = bm.faces.new(corners)
            face.material_index = mat
    obj = from_bm('Machined latitude bands', bm)
    for mat in materials:
        obj.data.materials.append(mat)
    return shade(obj, 29)


def station_windows(mat):
    bm = bmesh.new()
    clusters = [(-57, -114, 5, 1), (-44, 76, 4, 1), (-32, -68, 6, 2), (-26, 154, 4, 1),
                (-16, -136, 7, 2), (-8, -43, 4, 1), (7, -94, 7, 2), (15.5, 28, 5, 1),
                (16, -152, 6, 2), (28, -47, 6, 1), (33, 140, 5, 2), (46, -135, 6, 2),
                (58, -70, 4, 1), (63, 99, 5, 1)]
    for latitude, azimuth, count, levels in clusters:
        for row in range(levels):
            for i in range(count):
                if (i + 2 * row) % 5 == 3:
                    continue
                lat = math.radians(latitude + row * 1.15)
                az = math.radians(azimuth + (i + row * 0.4) * 1.6)
                height = math.radians(0.19 + 0.06 * (i % 3))
                width = math.radians(0.24 + 0.045 * ((i + row) % 3)) / math.cos(lat)
                points = [(lat - height, az - width), (lat - height, az + width),
                          (lat + height, az + width), (lat + height, az - width)]
                # Paint-thin lenses follow the radius within float precision.
                bm.faces.new([bm.verts.new(planet_point(b, a, 1.0)) for b, a in points])
    return from_bm('Window clusters', bm, mat)


def build_station():
    m = palette()
    hull = material('StationHull', '#4a4d53', rough=0.6, metal=0.4)
    alternate = material('StationHullB', '#3a3d42', rough=0.6, metal=0.4)
    lights = material('StationLights', '#141218', rough=0.45, emit='#ffd9a0', emit_strength=5.0)
    parts = [station_shell((hull, alternate, m['gra'])), station_windows(lights)]
    dish_rot = (math.pi / 2 - DISH_LAT, 0, 0)
    lip = [(0.280, 0.955), (0.285, 0.956), (0.283, 0.958), (0.274, 0.961),
           (0.265, 0.961), (0.256, 0.950), (0.251, 0.925)]
    bowl = [(0.257, 0.948), (0.250, 0.939), (0.234, 0.921), (0.210, 0.902),
            (0.180, 0.885), (0.148, 0.870), (0.108, 0.858), (0.063, 0.851), (0.0, 0.849)]
    parts.append(xf(lathe('Dish machined lip', lip, 96, alternate, angle=55), rot=dish_rot))
    parts.append(xf(lathe('Dish concave reflector', bowl, 96, hull, angle=55), rot=dish_rot))
    parts.append(xf(torus('Dish focusing ring', 0.186, 0.004, (0, 0, 0.891),
                          mat=alternate, seg=72, rseg=8), rot=dish_rot))
    for sector in range(15, 360, 60):
        a = math.radians(sector)
        parts.append(xf(box('Reflector calibration pad', (0.040, 0.020, 0.013), polar(0.227, a, 0.9165),
                            (0, -0.62, a), alternate, bev=0.0045), rot=dish_rot))
    parts.append(xf(cyl('Emitter foundation', 0.078, 0.020, (0, 0, 0.863), mat=m['gra'], segs=40, bev=0.007),
                    rot=dish_rot))
    for sector in (34, 154, 274):
        a = math.radians(sector)
        parts.append(xf(box('Emitter radial support', (0.059, 0.023, 0.022), polar(0.083, a, 0.862),
                            (0, -0.15, a), alternate, bev=0.006), rot=dish_rot))
    boss = [(0, 0.862), (0.064, 0.862), (0.066, 0.875), (0.047, 0.886),
            (0.029, 0.921), (0.025, 0.928), (0, 0.929)]
    parts.append(xf(lathe('Dish central emitter', boss, 40, m['dark'], angle=51), rot=dish_rot))
    parts.append(xf(cyl('Emitter contact cap', 0.019, 0.008, (0, 0, 0.931),
                        mat=m['metal'], segs=32, bev=0.003), rot=dish_rot))
    for sector in (0, 90, 180, 270):
        a = math.radians(sector)
        parts.append(xf(box('Dish collar clamp', (0.026, 0.026, 0.012), polar(0.262, a, 0.952),
                            (0, -0.7, a), hull, bev=0.004), rot=dish_rot))
    for z in (-0.021, 0.018):
        parts.append(lathe('Trench conduit', [(0.944, z - 0.003), (0.953, z - 0.002),
                                              (0.953, z + 0.002), (0.944, z + 0.003)],
                           120, alternate, angle=40))
    for sector in range(0, 360, 30):
        a = math.radians(sector)
        width = 0.052 if sector % 60 == 0 else 0.029
        parts.append(box('Trench interlock', (0.022, width, 0.048), polar(0.955, a, 0),
                         (0, 0, a), alternate, bev=0.006))
    return parts, []


def center_of_mass(structure):
    """Use closed structural volumes as the ships' equal-density mass proxy."""
    moment = Vector((0, 0, 0))
    volume = 0.0
    for obj in structure:
        mesh = obj.data
        mesh.calc_loop_triangles()
        for face in mesh.loop_triangles:
            a, b, c = (mesh.vertices[index].co for index in face.vertices)
            tetra_volume = a.dot(b.cross(c)) / 6.0
            moment += tetra_volume * (a + b + c) / 4.0
            volume += tetra_volume
    return moment / volume if volume else moment


def finish(name, builder, limit, ao_distance, cameras):
    reset()
    log('building', name)
    parts, structure = builder()
    origin = center_of_mass(structure)
    obj = join(parts, name)
    set_origin(obj, origin)
    obj.location = (0, 0, 0)
    triangles = tri_count([obj])
    if triangles > limit:
        raise RuntimeError(f'{name} has {triangles} triangles, limit {limit}')
    coords = [v.co for v in obj.data.vertices]
    bounds = [(min(v[i] for v in coords), max(v[i] for v in coords)) for i in range(3)]
    log(name, 'bounds XYZ:', ', '.join(f'{lo:.4f} to {hi:.4f}' for lo, hi in bounds))
    if name == 'Station':
        radius = max(v.length for v in coords)
        log('Station maximum radius:', f'{radius:.7f}')
        if abs(radius - 1.0) > 1e-6:
            raise RuntimeError(f'Station radius is {radius:.7f}, expected 1 m')
    bake_ao([obj], samples=48, distance=ao_distance)
    # Keep self-shadowing on the holding hardware while the lenses retain their color.
    ao = obj.data.color_attributes.active_color
    emissive = {'Glazing', 'AmberLight', 'EngineGlow', 'StationLights'}
    for polygon in obj.data.polygons:
        if obj.data.materials[polygon.material_index].name in emissive:
            for i in polygon.loop_indices:
                ao.data[i].color = (1, 1, 1, 1)

    file_stem = name.lower()
    export_glb(os.path.join(MODELS, f'{file_stem}.glb'), [obj])
    for suffix, camera in zip('ab', cameras):
        pos, target, lens, sun, light = camera
        light_pos, energy, color, size = light
        preview(os.path.join(WORK, f'secret_{file_stem}_{suffix}.png'), Vector(pos) - origin, Vector(target) - origin,
                lens=lens, res=(1000, 800), samples=24, sun_dir=sun, sun_strength=3.7,
                fill='#3b4658', fill_strength=0.65, extra_lights=((Vector(light_pos) - origin, energy, color, size),))


def main():
    finish('Scout', build_scout, 25_000, 1.4, (
        ((8.2, -12.0, 10.2), (0, 0.10, 0.0), 61, (-0.65, -0.48, 0.8), ((1, 5, 9), 1050, '#fff0d8', 6)),
        ((0, -0.01, 16.0), (0, 0, 0), 57, (-0.70, -0.35, 0.8), ((4, 2, 9), 850, '#fff0d8', 6)),
    ))
    finish('Freighter', build_freighter, 35_000, 1.9, (
        ((11.6, -16.0, 13.3), (0.12, 0.62, 0), 64, (-0.6, -0.62, 0.80), ((3, 6, 12), 1900, '#fff0d8', 9)),
        ((0.15, 0.57, 21.6), (0.15, 0.58, 0), 54, (-0.75, -0.37, 0.85), ((6, 3, 12), 1400, '#fff0d8', 10)),
    ))
    finish('Station', build_station, 60_000, 0.15, (
        ((1.41, -4.65, 2.37), (0, 0, 0), 64, (-0.77, -0.62, 0.69), ((2.6, -2.6, 1.4), 110, '#dce8ff', 2.6)),
        ((5.40, 0.0, 0.17), (0, 0, 0), 64, (0.45, -0.70, 0.75), ((2, 2, 1.5), 100, '#dce8ff', 2.6)),
    ))
    log('secret props complete')


if __name__ == '__main__':
    main()
