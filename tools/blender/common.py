"""Shared helpers for the headless Blender asset pipeline.

Run any build script with:
    blender -b --factory-startup -P tools/blender/build_<asset>.py

Conventions
- Blender units are metres, Z up. glTF export converts to Y up, so Blender +Y is three.js -Z.
- "Star side" of every prop is Blender +Y. The home camera sits on the -Y side.
- Every exported mesh carries baked ambient occlusion in its active colour attribute (COLOR_0).
"""
import bpy
import bmesh
import math
import os
import sys
import time
from mathutils import Vector, Matrix, Euler

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MODELS = os.path.join(ROOT, 'public', 'models')
TEXTURES = os.path.join(ROOT, 'public', 'textures')
WORK = os.path.join(ROOT, 'tools', 'blender', '_work')
for _d in (MODELS, TEXTURES, WORK):
    os.makedirs(_d, exist_ok=True)

T0 = time.time()


def log(*a):
    print('[build %6.1fs]' % (time.time() - T0), *a)
    sys.stdout.flush()


# ───────────────────────────────────────────────────────────────── scene ──
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    if sc.world is None:
        sc.world = bpy.data.worlds.new('World')
    return sc


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ───────────────────────────────────────────────────────────── materials ──
def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(hexstr):
    h = hexstr.lstrip('#')
    return tuple(_lin(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def material(name, color, rough=0.6, metal=0.0, emit=None, emit_strength=0.0, alpha=1.0, coat=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*rgb(color), 1.0)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*rgb(emit), 1.0)
        b.inputs['Emission Strength'].default_value = emit_strength
    if alpha < 1.0:
        b.inputs['Alpha'].default_value = alpha
    if coat > 0 and 'Coat Weight' in b.inputs:
        b.inputs['Coat Weight'].default_value = coat
    m.diffuse_color = (*rgb(color), 1.0)
    return m


# ────────────────────────────────────────────────────────────── meshes ──
def M(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    if isinstance(scale, (int, float)):
        scale = (scale, scale, scale)
    return Matrix.LocRotScale(Vector(loc), Euler(rot, 'XYZ'), Vector(scale))


def from_bm(name, bm, mat=None):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    if mat:
        me.materials.append(mat)
    return ob


def xf(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    """Bake a transform straight into the mesh data."""
    ob.data.transform(M(loc, rot, scale))
    ob.data.update()
    return ob


def realize(ob):
    """Apply every modifier (and convert curves) into plain mesh data."""
    if ob.type == 'MESH' and not ob.modifiers:
        return ob
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    if ob.type == 'MESH':
        old = ob.data
        ob.modifiers.clear()
        ob.data = me
        if old.users == 0:
            bpy.data.meshes.remove(old)
        return ob
    new = link(bpy.data.objects.new(ob.name + '_m', me))
    new.matrix_world = ob.matrix_world
    name = ob.name
    bpy.data.objects.remove(ob)
    new.name = name
    return new


def shade(ob, angle=38):
    me = ob.data
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    if angle is not None and angle < 180:
        me.set_sharp_from_angle(angle=math.radians(angle))
    me.update()
    return ob


def bevel(ob, width=0.01, segs=2, angle=35, profile=0.5):
    m = ob.modifiers.new('Bevel', 'BEVEL')
    m.width = width
    m.segments = segs
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle)
    m.profile = profile
    m.harden_normals = False
    return ob


def subsurf(ob, levels=2):
    m = ob.modifiers.new('Subsurf', 'SUBSURF')
    m.levels = levels
    m.render_levels = levels
    return ob


def solidify(ob, thickness=0.02, offset=-1.0):
    m = ob.modifiers.new('Solid', 'SOLIDIFY')
    m.thickness = thickness
    m.offset = offset
    m.use_even_offset = True
    return ob


def box(name, size, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, bev=0.0, segs=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    ob = from_bm(name, bm, mat)
    xf(ob, scale=size)
    if bev > 0:
        bevel(ob, bev, segs, angle=30)
        realize(ob)
    xf(ob, loc, rot)
    return shade(ob)


def cyl(name, r, h, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, segs=32, bev=0.0, r2=None, bsegs=2):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=r, radius2=r if r2 is None else r2, depth=h)
    ob = from_bm(name, bm, mat)
    if bev > 0:
        bevel(ob, bev, bsegs, angle=30)
        realize(ob)
    xf(ob, loc, rot)
    return shade(ob)


def sphere(name, r, loc=(0, 0, 0), scale=(1, 1, 1), mat=None, segs=32, rings=16, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    ob = from_bm(name, bm, mat)
    xf(ob, loc, rot, scale)
    return shade(ob, 180)


def ico(name, r, subdiv=3, loc=(0, 0, 0), scale=(1, 1, 1), mat=None):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    ob = from_bm(name, bm, mat)
    xf(ob, loc, (0, 0, 0), scale)
    return shade(ob, 180)


def torus(name, R, r, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, seg=48, rseg=12, scale=(1, 1, 1)):
    bm = bmesh.new()
    for i in range(seg):
        a = 2 * math.pi * i / seg
        for j in range(rseg):
            b = 2 * math.pi * j / rseg
            bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
    bm.verts.ensure_lookup_table()
    for i in range(seg):
        for j in range(rseg):
            a, b = i * rseg + j, i * rseg + (j + 1) % rseg
            c, d = ((i + 1) % seg) * rseg + (j + 1) % rseg, ((i + 1) % seg) * rseg + j
            bm.faces.new((bm.verts[a], bm.verts[d], bm.verts[c], bm.verts[b]))
    ob = from_bm(name, bm, mat)
    xf(ob, loc, rot, scale)
    return shade(ob, 180)


def lathe(name, profile, segs=64, mat=None, arc=(0.0, 2 * math.pi), angle=38):
    """Revolve (radius, z) pairs around Z. arc limits the sweep (open patch)."""
    a0, a1 = arc
    full = abs((a1 - a0) - 2 * math.pi) < 1e-6
    n = segs if full else segs + 1
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        if r < 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(a0 + (a1 - a0) * i / segs),
                                        r * math.sin(a0 + (a1 - a0) * i / segs), z)) for i in range(n)])
    for a, b in zip(rings[:-1], rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        for i in range(segs):
            j = (i + 1) % n
            if len(a) == 1:
                bm.faces.new((a[0], b[j], b[i]))
            elif len(b) == 1:
                bm.faces.new((a[i], a[j], b[0]))
            else:
                bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = from_bm(name, bm, mat)
    return shade(ob, angle)


def tube(name, pts, r, mat=None, res=3, cyclic=False, smooth=False, caps=True):
    """Round bar following a polyline (or a smooth NURBS path when smooth=True)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = res
    cu.use_fill_caps = caps
    sp = cu.splines.new('NURBS' if smooth else 'POLY')
    sp.points.add(len(pts) - 1)
    for p, co in zip(sp.points, pts):
        p.co = (co[0], co[1], co[2], 1.0)
    sp.use_cyclic_u = cyclic
    if smooth:
        sp.order_u = min(4, len(pts))
        sp.use_endpoint_u = not cyclic
        cu.resolution_u = 8
    ob = link(bpy.data.objects.new(name, cu))
    ob = realize(ob)
    if mat:
        ob.data.materials.append(mat)
    return shade(ob, 60)


def hull_panel(name, rfun, z0, z1, a0, a1, mat, gap=0.02, thick=0.03, nz=4, na=4, lift=0.0, bev=0.008):
    """One curved plate on a body of revolution r=rfun(z), inset by `gap`, with thickness and chamfer."""
    bm = bmesh.new()
    grid = []
    for iz in range(nz + 1):
        z = z0 + (z1 - z0) * iz / nz
        r = rfun(z) + lift
        row = []
        for ia in range(na + 1):
            a = a0 + (a1 - a0) * ia / na
            row.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        grid.append(row)
    for iz in range(nz):
        for ia in range(na):
            bm.faces.new((grid[iz][ia], grid[iz][ia + 1], grid[iz + 1][ia + 1], grid[iz + 1][ia]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # pull the border in by the seam gap
    rmid = rfun((z0 + z1) / 2)
    da = gap / max(rmid, 1e-3)
    for iz, row in enumerate(grid):
        for ia, v in enumerate(row):
            z = v.co.z
            a = math.atan2(v.co.y, v.co.x)
            fz = iz / nz
            fa = ia / na
            z2 = (z0 + gap) + (z1 - z0 - 2 * gap) * fz
            a2 = (a0 + da) + (a1 - a0 - 2 * da) * fa
            r = rfun(z2) + lift
            v.co = Vector((r * math.cos(a2), r * math.sin(a2), z2))
    ob = from_bm(name, bm, mat)
    solidify(ob, thick, -1.0)
    if bev > 0:
        bevel(ob, bev, 2, angle=50)
    realize(ob)
    return shade(ob, 50)


def interp(table):
    """Smooth (cubic Hermite) interpolation through sorted (x, y) pairs. Returns f(x)."""
    xs = [p[0] for p in table]
    ys = [p[1] for p in table]
    n = len(xs)
    ms = []
    for i in range(n):
        if i == 0:
            ms.append((ys[1] - ys[0]) / (xs[1] - xs[0]))
        elif i == n - 1:
            ms.append((ys[-1] - ys[-2]) / (xs[-1] - xs[-2]))
        else:
            ms.append((ys[i + 1] - ys[i - 1]) / (xs[i + 1] - xs[i - 1]))

    def f(x):
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        i = 0
        while x > xs[i + 1]:
            i += 1
        h = xs[i + 1] - xs[i]
        t = (x - xs[i]) / h
        h00 = 2 * t ** 3 - 3 * t ** 2 + 1
        h10 = t ** 3 - 2 * t ** 2 + t
        h01 = -2 * t ** 3 + 3 * t ** 2
        h11 = t ** 3 - t ** 2
        return h00 * ys[i] + h10 * h * ms[i] + h01 * ys[i + 1] + h11 * h * ms[i + 1]
    return f


def hull_patch(name, rfun, a0, a1, zlo, zhi, mat, gap=0.012, thick=0.03, nz=4, na=6, lift=0.0, bev=0.006):
    """Curved plate on a body of revolution. zlo / zhi may be numbers or functions of the azimuth,
    so plates can follow shaped openings (windows, cowls). Inset by `gap`, solid, chamfered."""
    fl = zlo if callable(zlo) else (lambda a, v=zlo: v)
    fh = zhi if callable(zhi) else (lambda a, v=zhi: v)
    am = (a0 + a1) / 2
    rmid = max(rfun((fl(am) + fh(am)) / 2), 0.05)
    da = gap / rmid
    bm = bmesh.new()
    grid = []
    for iz in range(nz + 1):
        row = []
        for ia in range(na + 1):
            a = (a0 + da) + (a1 - a0 - 2 * da) * ia / na
            lo, hi = fl(a) + gap, fh(a) - gap
            if hi - lo < 0.004:
                mid = (lo + hi) / 2
                lo, hi = mid - 0.002, mid + 0.002
            z = lo + (hi - lo) * iz / nz
            r = rfun(z) + lift
            row.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        grid.append(row)
    for iz in range(nz):
        for ia in range(na):
            bm.faces.new((grid[iz][ia], grid[iz][ia + 1], grid[iz + 1][ia + 1], grid[iz + 1][ia]))
    bm.normal_update()
    f0 = bm.faces[:][0]
    c = f0.calc_center_median()
    if f0.normal.dot(Vector((c.x, c.y, 0)).normalized()) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    ob = from_bm(name, bm, mat)
    if thick > 0:
        solidify(ob, thick, -1.0)
    if bev > 0:
        bevel(ob, bev, 2, angle=50)
    realize(ob)
    shade(ob, 50)
    revolve_normals(ob, rfun, lift)
    return ob


def revolve_normals(ob, rfun, lift=0.0, tol=0.0018):
    """Give every vertex lying on the ideal surface of revolution its analytic normal, so separate
    plates shade as one continuous shell instead of looking faceted or pillowed."""
    me = ob.data
    normals = []
    hit = 0
    for v in me.vertices:
        x, y, z = v.co
        r = math.hypot(x, y)
        if r > 1e-4 and abs(r - (rfun(z) + lift)) < tol:
            dr = (rfun(z + 0.01) - rfun(z - 0.01)) / 0.02
            n = Vector((x / r, y / r, -dr)).normalized()
            normals.append(n)
            hit += 1
        else:
            normals.append(v.normal.copy())
    if hit:
        me.normals_split_custom_set_from_vertices(normals)
    return ob


def strut(name, p0, p1, w, d, mat, bev=0.03, up=(0, 0, 1), segs=3):
    """Rectangular-section beam from p0 to p1. `w` is measured along `up`-ish, `d` across."""
    p0, p1 = Vector(p0), Vector(p1)
    axis = p1 - p0
    length = axis.length
    z = axis.normalized()
    x = Vector(up).cross(z)
    if x.length < 1e-4:
        x = Vector((1, 0, 0)).cross(z)
    x.normalize()
    y = z.cross(x)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    ob = from_bm(name, bm, mat)
    xf(ob, scale=(d, w, length))
    if bev > 0:
        bevel(ob, bev, segs, angle=30)
        realize(ob)
    rot = Matrix((x, y, z)).transposed().to_4x4()
    ob.data.transform(Matrix.Translation((p0 + p1) / 2) @ rot)
    ob.data.update()
    return shade(ob)


def prism(name, r, h, sides=6, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, bev=0.0, r2=None):
    return cyl(name, r, h, loc, rot, mat, segs=sides, bev=bev, r2=r2)


def join(objs, name):
    objs = [realize(o) for o in objs if o is not None]
    if not objs:
        return None
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def set_origin(ob, point):
    """Move the object origin to `point` (world) without moving the geometry."""
    p = Vector(point)
    ob.data.transform(Matrix.Translation(-(p - ob.location)))
    ob.location = p
    return ob


def parent(child, par):
    child.parent = par
    child.matrix_parent_inverse = par.matrix_world.inverted()
    return child


def tri_count(objs=None):
    objs = objs or bpy.context.scene.objects
    n = 0
    for o in [o for o in objs if o.type == 'MESH']:
        o.data.calc_loop_triangles()
        n += len(o.data.loop_triangles)
    return n


# ───────────────────────────────────────────────────────────── baking ──
def cycles(samples=32, gpu=False):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.device = 'CPU'
    if gpu:
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            prefs.compute_device_type = 'ONEAPI'
            prefs.get_devices()
            for d in prefs.devices:
                d.use = True
            sc.cycles.device = 'GPU'
        except Exception as e:  # noqa
            log('GPU unavailable, using CPU:', e)
    return sc


def bake_ao(objs, samples=48, distance=1.5, attr='AO'):
    """Bake ambient occlusion of the whole scene into each object's vertex colours."""
    sc = cycles(samples)
    sc.world.light_settings.distance = distance
    objs = [o for o in objs if o and o.type == 'MESH']
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        me = o.data
        if not me.materials:
            me.materials.append(material('_default', '#808080'))
        ca = me.color_attributes.get(attr) or me.color_attributes.new(attr, 'BYTE_COLOR', 'CORNER')
        me.color_attributes.active_color = ca
        me.color_attributes.render_color_index = list(me.color_attributes).index(ca)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    sc.render.bake.target = 'VERTEX_COLORS'
    t = time.time()
    bpy.ops.object.bake(type='AO')
    log('baked AO on %d objects in %.1fs' % (len(objs), time.time() - t))


# ─────────────────────────────────────────────────────────── preview ──
def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def preview(path, cam, target, lens=50, res=(1280, 720), samples=40,
            sun_dir=(0.4, 0.9, 0.35), sun_strength=4.5, sun_color='#ffd9a0',
            fill='#3b4658', fill_strength=0.55, ground=False, extra_lights=()):
    """Quick Cycles still for reviewing a model. Lighting mimics the site: warm key, cool fill."""
    sc = cycles(samples)
    w = sc.world
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs[0].default_value = (*rgb(fill), 1.0)
    bg.inputs[1].default_value = fill_strength
    tmp = []
    cd = bpy.data.cameras.new('PrevCam')
    cd.lens = lens
    cd.clip_end = 5000
    co = link(bpy.data.objects.new('PrevCam', cd))
    co.location = cam
    look_at(co, target)
    sc.camera = co
    tmp.append(co)
    sd = bpy.data.lights.new('PrevSun', 'SUN')
    sd.energy = sun_strength
    sd.color = rgb(sun_color)
    sd.angle = math.radians(3)
    so = link(bpy.data.objects.new('PrevSun', sd))
    so.rotation_euler = Vector(sun_dir).normalized().to_track_quat('Z', 'Y').to_euler()
    tmp.append(so)
    for (loc, energy, col, size) in extra_lights:
        ld = bpy.data.lights.new('PrevArea', 'AREA')
        ld.energy = energy
        ld.color = rgb(col)
        ld.size = size
        lo = link(bpy.data.objects.new('PrevArea', ld))
        lo.location = loc
        look_at(lo, target)
        tmp.append(lo)
    if ground:
        g = box('PrevGround', (400, 400, 0.02), (0, 0, -0.01), mat=material('_ground', '#2b2e33', 0.95))
        tmp.append(g)
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.filepath = path
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'None'
    t = time.time()
    bpy.ops.render.render(write_still=True)
    log('preview %s in %.1fs' % (os.path.basename(path), time.time() - t))
    for o in tmp:
        bpy.data.objects.remove(o, do_unlink=True)


# ──────────────────────────────────────────────────────────── export ──
def export_glb(path, objs, vertex_color=True):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_materials='EXPORT', export_cameras=False, export_lights=False, export_extras=True,
        export_animations=False, export_normals=True, export_texcoords=True, export_tangents=False,
    )
    if vertex_color:
        kw.update(export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                  export_active_vertex_color_when_no_material=True)
    else:
        kw.update(export_vertex_color='NONE')
    bpy.ops.export_scene.gltf(**kw)
    log('exported %s  %.0f KB  %d tris' % (os.path.basename(path), os.path.getsize(path) / 1024, tri_count(objs)))
