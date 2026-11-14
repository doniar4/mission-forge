"""Catalogue pictures -> public/thumbs/*.webp

Every card in the hangar's part carousel shows a render of the part. They are made here from the
same kit, rockets and launch-complex models the game uses (run build_kit.py and build_rockets.py
first), plus a few models that only appear on cards: batteries, computers, ground stations,
structure samples, test rigs, planets and orbit diagrams.

Run inside Blender. render_all() does everything; render_some(['inst_sar', ...]) re-renders a few.
"""
import importlib
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import mf_common as mf  # noqa: E402

importlib.reload(mf)
Part = mf.Part
pi, tau, cos, sin = math.pi, math.tau, math.cos, math.sin
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'public', 'thumbs'))
SCENE = 'MFThumbs'


# ---- the photo studio ---------------------------------------------------------

def studio():
    sc = bpy.data.scenes.get(SCENE) or bpy.data.scenes.new(SCENE)
    try:
        sc.render.engine = 'BLENDER_EEVEE'
    except TypeError:
        pass
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.quality = 84
    sc.render.resolution_percentage = 100
    try:
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    if not sc.world:
        sc.world = bpy.data.worlds.new('MFThumbWorld')
    w = sc.world
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (0.12, 0.15, 0.24, 1)
    bg.inputs[1].default_value = 0.55

    cam = bpy.data.objects.get('MFThumbCam')
    if not cam:
        cam = bpy.data.objects.new('MFThumbCam', bpy.data.cameras.new('MFThumbCam'))
        sc.collection.objects.link(cam)
    cam.data.lens = 70
    cam.data.clip_start = 0.01
    cam.data.clip_end = 5000
    sc.camera = cam

    def sun(name, rot, energy, color):
        ob = bpy.data.objects.get(name)
        if not ob:
            ob = bpy.data.objects.new(name, bpy.data.lights.new(name, 'SUN'))
            sc.collection.objects.link(ob)
        ob.data.energy = energy
        ob.data.color = color
        ob.data.angle = math.radians(4)
        ob.rotation_euler = rot
        return ob

    sun('MFKey', (math.radians(48), math.radians(12), math.radians(-38)), 4.2, (1.0, 0.96, 0.9))
    sun('MFRim', (math.radians(-60), math.radians(-20), math.radians(160)), 5.0, (0.55, 0.72, 1.0))
    sun('MFFill', (math.radians(80), 0, math.radians(120)), 0.8, (0.9, 0.85, 1.0))

    stage = bpy.data.collections.get('MFStage') or bpy.data.collections.new('MFStage')
    if stage.name not in sc.collection.children:
        sc.collection.children.link(stage)
    return sc, cam, stage


def clear(stage):
    for ob in list(stage.objects):
        bpy.data.objects.remove(ob, do_unlink=True)


def dup(src, stage, parent=None):
    """Copies an object and its children; meshes stay shared with the originals."""
    ob = src.copy()
    stage.objects.link(ob)
    ob.parent = parent
    if parent is None:
        ob.matrix_world = Matrix.Identity(4)
    for c in src.children:
        dup(c, stage, ob)
    return ob


def kit(stage, name, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    src = bpy.data.objects[name]
    ob = dup(src, stage)
    ob.location = loc
    ob.rotation_euler = rot
    ob.scale = (scale, scale, scale) if isinstance(scale, (int, float)) else scale
    return ob


def frame(sc, cam, stage, view=(1.0, -1.25, 0.7), margin=1.12):
    bpy.context.view_layer.update()
    pts = []
    for ob in stage.all_objects:
        if ob.type in ('MESH', 'CURVE'):
            pts += [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centre = (lo + hi) / 2
    d = Vector(view).normalized()
    # Fit the box as the camera sees it: project its corners onto the camera plane.
    look = -d
    right = look.cross(Vector((0, 0, 1))).normalized()
    up = right.cross(look).normalized()
    corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    half_w = max(abs((c - centre).dot(right)) for c in corners)
    half_h = max(abs((c - centre).dot(up)) for c in corners)
    depth = max(abs((c - centre).dot(look)) for c in corners)
    aspect = sc.render.resolution_x / sc.render.resolution_y
    fov = cam.data.angle  # horizontal for a landscape frame
    if aspect >= 1:
        tan_h = math.tan(fov / 2)
        tan_v = tan_h / aspect
    else:
        tan_v = math.tan(fov / 2)
        tan_h = tan_v * aspect
    dist = max(half_w / tan_h, half_h / tan_v) * margin + depth * 0.35
    cam.location = centre + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_start = max(0.001, dist * 0.01)
    cam.data.clip_end = dist * 10


def shoot(sc, name):
    os.makedirs(OUT, exist_ok=True)
    sc.render.filepath = os.path.join(OUT, name + '.webp')
    with bpy.context.temp_override(scene=sc):
        bpy.ops.render.render(write_still=True, scene=sc.name)


# ---- models that exist only on cards ------------------------------------------

def mat_emit(name, color, strength):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = mf.lin(color)
    b.inputs['Emission Color'].default_value = mf.lin(color)
    b.inputs['Emission Strength'].default_value = strength
    return m


def mat_planet(kind):
    """Procedural surfaces: noise and Voronoi, no photographs."""
    name = 'mf_planet_' + kind
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nodes, links = nt.nodes, nt.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nodes.new('ShaderNodeTexNoise')
    tex.inputs['Scale'].default_value = {'earth': 2.2, 'moon': 3.0, 'mars': 2.6, 'sun': 6.0}[kind]
    tex.inputs['Detail'].default_value = 9
    tex.inputs['Roughness'].default_value = 0.6
    ramp = nodes.new('ShaderNodeValToRGB')
    links.new(tex.outputs['Fac'], ramp.inputs['Fac'])
    cr = ramp.color_ramp
    stops = {
        'earth': [(0.0, '#0A2A6B'), (0.5, '#1A4FA0'), (0.53, '#2F6B2A'), (0.62, '#6A7A3A'), (0.72, '#A88E5C')],
        'moon': [(0.0, '#4A4A4E'), (0.45, '#77777C'), (0.7, '#B4B4B8')],
        'mars': [(0.0, '#5A2210'), (0.45, '#9A4420'), (0.7, '#C9733E')],
        'sun': [(0.0, '#FF8A1C'), (0.5, '#FFC23A'), (1.0, '#FFF2B0')],
    }[kind]
    cr.elements[0].position, cr.elements[0].color = stops[0][0], mf.lin(stops[0][1])
    cr.elements[1].position, cr.elements[1].color = stops[-1][0], mf.lin(stops[-1][1])
    for pos, col in stops[1:-1]:
        e = cr.elements.new(pos)
        e.color = mf.lin(col)
    if kind == 'sun':
        links.new(ramp.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.6
        bsdf.inputs['Base Color'].default_value = (0, 0, 0, 1)
    else:
        links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.85 if kind != 'earth' else 0.5
        if kind in ('moon', 'mars'):
            vor = nodes.new('ShaderNodeTexVoronoi')
            vor.inputs['Scale'].default_value = 9 if kind == 'moon' else 5
            bump = nodes.new('ShaderNodeBump')
            bump.inputs['Strength'].default_value = 0.5 if kind == 'moon' else 0.25
            links.new(vor.outputs['Distance'], bump.inputs['Height'])
            links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def planet(stage, kind, radius=1.0, loc=(0, 0, 0)):
    me = bpy.data.meshes.get('mf_sphere') or _sphere_mesh()
    ob = bpy.data.objects.new('planet_' + kind, me.copy())
    ob.data.materials.clear()
    ob.data.materials.append(mat_planet(kind))
    stage.objects.link(ob)
    ob.location = loc
    ob.scale = (radius, radius, radius)
    ob.rotation_euler = (0.3, 0.2, 0.6)
    if kind == 'earth':  # a thin cloud shell
        cl = bpy.data.objects.new('clouds', me.copy())
        cm = bpy.data.materials.get('mf_clouds')
        if not cm:
            cm = bpy.data.materials.new('mf_clouds')
            cm.use_nodes = True
            nt = cm.node_tree
            b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
            n = nt.nodes.new('ShaderNodeTexNoise')
            n.inputs['Scale'].default_value = 4
            n.inputs['Detail'].default_value = 12
            r = nt.nodes.new('ShaderNodeValToRGB')
            r.color_ramp.elements[0].position = 0.55
            r.color_ramp.elements[1].position = 0.75
            nt.links.new(n.outputs['Fac'], r.inputs['Fac'])
            nt.links.new(r.outputs['Color'], b.inputs['Alpha'])
            b.inputs['Base Color'].default_value = (1, 1, 1, 1)
            cm.blend_method = 'BLEND' if hasattr(cm, 'blend_method') else cm.blend_method
        cl.data.materials.clear()
        cl.data.materials.append(cm)
        stage.objects.link(cl)
        cl.location = loc
        cl.scale = (radius * 1.015,) * 3
    return ob


def _sphere_mesh():
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=1.0)
    for f in bm.faces:
        f.smooth = True
    me = bpy.data.meshes.new('mf_sphere')
    bm.to_mesh(me)
    bm.free()
    return me


def ring(stage, a, e=0.0, inc=0.0, node=0.0, loc=(0, 0, 0), width=0.012, color='#F0C869'):
    """An orbit drawn as a glowing tube; the body sits at one focus."""
    cu = bpy.data.curves.new('orbit', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = width
    cu.bevel_resolution = 2
    sp = cu.splines.new('POLY')
    n = 160
    sp.points.add(n - 1)
    b = a * math.sqrt(1 - e * e)
    for i in range(n):
        t = i / n * tau
        x, y = a * cos(t) - a * e, b * sin(t)
        sp.points[i].co = (x, y, 0, 1)
    sp.use_cyclic_u = True
    ob = bpy.data.objects.new('orbit', cu)
    cu.materials.append(mat_emit('mf_orbit_glow_' + color, color, 1.1))
    stage.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (inc, 0, node)
    return ob


def build_extra(stage, name):
    """Card-only models, built fresh each time into the stage."""
    p = Part(name)
    if name.startswith('battery_'):
        n = {'b100': 2, 'b500': 4, 'b2000': 8, 'b6000': 16}[name[8:]]
        cols = min(4, n)
        rows = math.ceil(n / cols)
        p.box((cols * 0.1 + 0.04, rows * 0.1 + 0.04, 0.03), loc=(0, 0, 0.015), m='dark', bevel=0.006)
        for i in range(n):
            x = (i % cols - (cols - 1) / 2) * 0.1
            y = (i // cols - (rows - 1) / 2) * 0.1
            p.cyl(0.042, 0.042, 0.2, loc=(x, y, 0.03), m='navy', seg=20)
            p.cyl(0.043, 0.043, 0.03, loc=(x, y, 0.17), m='orange', seg=20)
            p.cyl(0.015, 0.015, 0.012, loc=(x, y, 0.23), m='alu', seg=10)
    elif name.startswith('computer_'):
        tier = name[9:]
        w = {'basic': 0.16, 'standard': 0.24, 'advanced': 0.32}[tier]
        m = {'basic': 'teal', 'standard': 'alu', 'advanced': 'gold'}[tier]
        p.box((w, w * 0.8, 0.08), loc=(0, 0, 0.04), m=m, bevel=0.006)
        for i in range(int(w / 0.03)):
            p.box((0.008, w * 0.8, 0.03), loc=(-w / 2 + 0.02 + i * 0.03, 0, 0.095), m='dark')
        for i in range(3):
            p.cyl(0.012, 0.012, 0.03, loc=(w / 2 + 0.012, -w * 0.25 + i * w * 0.25, 0.04), rot=(0, pi / 2, 0), m='alu', seg=10)
        if tier == 'basic':
            p.box((w * 0.9, w * 0.7, 0.006), loc=(0, 0, 0.0), m='teal')
    elif name.startswith('ground_'):
        kind = name[7:]
        spots = {'own': [(0, 0, 1.0)], 'network': [(-1.6, 0.4, 0.8), (0, -0.3, 1.0), (1.6, 0.5, 0.8)], 'dsn': [(0, 0, 2.6)]}[kind]
        for x, y, s in spots:
            p.cyl(0.18 * s, 0.24 * s, 0.9 * s, loc=(x, y, 0), m='white', seg=16)
            p.box((0.5 * s, 0.25 * s, 0.25 * s), loc=(x, y, 1.0 * s), m='steel')
            dish = [(0.9 * s * i / 8, 1.25 * s + (0.9 * s * i / 8) ** 2 / (2.4 * s)) for i in range(9)]
            p.lathe([(r, z - 0.03 * s) for r, z in dish] + list(reversed(dish)), loc=(x, y, 0), rot=(0.55, 0, 0), m='white', seg=40)
            p.cyl(0.04 * s, 0.03 * s, 0.6 * s, loc=(x, y + 0.33 * s, 1.55 * s), rot=(0.55, 0, 0), m='alu', seg=8)
        p.cyl(2.6 if kind != 'dsn' else 3.4, 2.6 if kind != 'dsn' else 3.4, 0.08, loc=(0, 0, -0.08), m='concrete', seg=48)
    elif name.startswith('structure_'):
        comp = name.endswith('composite')
        p.box((1.0, 1.0, 0.04), loc=(0, 0, 0.02), m='black' if comp else 'alu', bevel=0.01)
        if comp:
            for i in range(-4, 5):
                for j in range(-4, 5):
                    p.cyl(0.05, 0.05, 0.02, loc=(i * 0.1 + (j % 2) * 0.05, j * 0.087, 0.035), m='dark', seg=6)
            p.box((1.02, 0.04, 0.05), loc=(0, 0.5, 0.025), m='gold')
        else:
            for k in range(-4, 5):  # machined waffle ribs
                p.box((0.98, 0.014, 0.05), loc=(0, k * 0.11, 0.05), m='alu')
                p.box((0.014, 0.98, 0.05), loc=(k * 0.11, 0, 0.05), m='alu')
    elif name.startswith('testing_'):
        kind = name[8:]
        p.box((0.6, 0.6, 0.6), loc=(0, 0, 0.75), m='gold', bevel=0.02)
        p.box((0.5, 0.02, 0.4), loc=(0, -0.31, 0.75), m='cell')
        if kind == 'minimal':
            p.box((1.2, 1.0, 0.08), loc=(0, 0, 0.41), m='steel')
            for x in (-0.5, 0.5):
                for y in (-0.4, 0.4):
                    p.box((0.06, 0.06, 0.4), loc=(x, y, 0.2), m='steel')
        elif kind == 'standard':  # shake table
            p.box((1.0, 1.0, 0.12), loc=(0, 0, 0.39), m='alu', bevel=0.01)
            p.box((1.4, 1.4, 0.3), loc=(0, 0, 0.15), m='navy', bevel=0.02)
            for x in (-0.55, 0.55):
                p.cyl(0.06, 0.06, 0.12, loc=(x, -0.62, 0.3), m='orange', seg=12)
        else:  # thermal-vacuum chamber, door open
            p.lathe([(1.0, 0.0), (1.0, 1.9), (0.95, 1.9), (0.95, 0.05), (1.0, 0.0)], loc=(0, 0.2, 0.05), rot=(pi / 2, 0, 0), m='alu', seg=48, start=0.2, sweep=tau - 0.4)
            p.cyl(1.02, 1.02, 0.08, loc=(0, 1.0, 0.05), rot=(pi / 2, 0, 0), m='steel', seg=48)
            p.box((1.4, 2.2, 0.08), loc=(0, 0.2, 0.0), m='steel')
            p.box((0.8, 0.8, 0.1), loc=(0, 0, 0.4), m='steel')
    elif name.startswith('redundancy_'):
        two = name.endswith('redundant')
        for i, x in enumerate((-0.2, 0.2) if two else (0,)):
            p.box((0.32, 0.4, 0.26), loc=(x, 0, 0.13), m='white', bevel=0.012)
            p.box((0.33, 0.06, 0.265), loc=(x, 0, 0.1325), m='orange' if i else 'teal')
            p.cyl(0.02, 0.02, 0.06, loc=(x, 0.2, 0.18), rot=(-pi / 2, 0, 0), m='alu', seg=8)
        if two:
            p.strut((-0.2, 0.25, 0.18), (0.2, 0.25, 0.18), 0.012, m='black')
    else:
        return None
    return p.finish(stage)


# ---- what each card shows ---------------------------------------------------------

def compose(stage, name):
    """Builds the picture for one card. Returns (resolution, view direction)."""
    land = (480, 360)
    if name.startswith('inst_'):
        kit(stage, name)
        return land, (1.0, -1.25, 0.75)
    if name in ('ant_uhf', 'ant_sband', 'ant_laser', 'adcs_torquer', 'adcs_wheels', 'adcs_startracker', 'rtg', 'rcs', 'adapter'):
        kit(stage, name)
        return land, (1.0, -1.25, 0.75)
    if name in ('ant_xband', 'ant_kaband'):
        s = 1.6 if name == 'ant_kaband' else 0.85
        kit(stage, 'ant_mast', scale=s)
        kit(stage, 'dish', loc=(0, 0, 0.64 * s), rot=(0.5, 0, 0), scale=(1.6 if name == 'ant_kaband' else 0.75))
        return land, (1.0, -1.25, 0.6)
    if name.startswith('adcs_'):
        kit(stage, 'adcs_wheels', loc=(-0.2, 0, 0))
        kit(stage, 'adcs_startracker', loc=(0.25, 0, 0))
        return land, (1.0, -1.25, 0.85)
    if name.startswith('eng_'):
        if name == 'eng_none':
            kit(stage, 'bus', scale=0.6)
            kit(stage, 'adapter', loc=(0, 0, -0.3), rot=(pi, 0, 0), scale=0.45)
            return land, (1.0, -1.25, -0.5)
        kit(stage, name, rot=(pi, 0, 0))
        return land, (1.0, -1.25, 0.25)
    if name.startswith('power_'):
        kind = name[6:]
        if kind == 'rtg':
            kit(stage, 'rtg')
            return land, (1.0, -1.25, 0.6)
        kit(stage, 'bus', scale=0.8)
        if kind == 'body':
            for loc, rot in (((0.4, 0, 0), (0, pi / 2, 0)), ((0, -0.4, 0), (pi / 2, 0, 0)), ((0, 0, 0.4), (0, 0, 0))):
                kit(stage, 'cells', loc=loc, rot=rot, scale=(0.8, 0.8, 1))
            return land, (1.0, -1.25, 0.75)
        n, length, width = {'small': (2, 0.55, 0.8), 'medium': (3, 0.8, 1.2), 'large': (4, 1.2, 1.9), 'xl': (6, 1.6, 2.6)}[kind]
        for side in (1, -1):
            x0 = side * 0.4
            # Mirror the left wing rather than turn it, so both show their cells to the camera.
            kit(stage, 'yoke', loc=(x0, 0, 0), scale=(side * width, width, width))
            for i in range(n):
                off = 0.4 * width + i * length
                kit(stage, 'panel', loc=(x0 + side * off, 0, 0), rot=(pi / 2 - 0.35, 0, 0), scale=(side * length, 1, width))
        return land, (0.55, -1.25, 0.85)
    if name in ('kolibri', 'vector', 'rideshare', 'atlant', 'titan'):
        kit(stage, name)
        return (300, 600), (1.0, -1.6, 0.18)
    if name.startswith('planet_'):
        kind = name[7:]
        planet(stage, kind)
        return (512, 512), (1.0, -1.4, 0.45)
    if name.startswith('orbit_'):
        o = name[6:]
        if o == 'l1':
            planet(stage, 'sun', radius=1.4, loc=(-3.2, 0, 0))
            planet(stage, 'earth', radius=0.45, loc=(2.6, 0, 0))
            ring(stage, 0.5, loc=(1.4, 0, 0), inc=pi / 2, node=pi / 2, width=0.02)
            ring(stage, 2.8, loc=(0, 0, 0), e=0.0, width=0.004, color='#6F7FB5')
            return land, (0.25, -1.4, 0.55)
        body = {'leo': 'earth', 'sso': 'earth', 'geo': 'earth', 'llo': 'moon', 'elo': 'moon', 'lmo': 'mars', 'emo': 'mars'}[o]
        planet(stage, body)
        a, e, inc = {
            'leo': (1.32, 0, math.radians(52)), 'sso': (1.36, 0, math.radians(98)), 'geo': (2.6, 0, 0),
            'llo': (1.3, 0, math.radians(90)), 'elo': (2.6, 0.55, math.radians(90)),
            'lmo': (1.32, 0, math.radians(93)), 'emo': (3.0, 0.62, math.radians(75)),
        }[o]
        ring(stage, a, e, inc, node=2.05, width=0.022)
        return land, (1.0, -1.5, 0.55)
    if build_extra(stage, name) is not None:
        view = (1.0, -1.25, 0.9) if name.startswith(('battery', 'computer', 'structure')) else (1.0, -1.25, 0.6)
        return land, view
    raise KeyError(name)


def names():
    from itertools import chain
    insts = [
        'cam_wide', 'cam_mid', 'cam_hires', 'thermal_micro', 'thermal_ir', 'thermal_cryo',
        'multispec_lite', 'multispec', 'hyperspec', 'scatterometer', 'sar_compact', 'sar',
        'alt_lidar', 'altimeter', 'alt_pro', 'sounder_lite', 'sounder', 'sounder_pro',
        'neutron', 'spectrometer', 'gamma_suite', 'mag_chip', 'magnetometer', 'mag_pro',
        'particles_lite', 'particles', 'plasma_suite', 'solar_xray', 'euv_imager', 'coronagraph',
    ]
    return list(chain(
        ['inst_' + i for i in insts],
        ['power_' + p for p in ('body', 'small', 'medium', 'large', 'xl', 'rtg')],
        ['battery_' + b for b in ('b100', 'b500', 'b2000', 'b6000')],
        ['ant_' + a for a in ('uhf', 'sband', 'xband', 'kaband', 'laser')],
        ['ground_' + g for g in ('own', 'network', 'dsn')],
        ['computer_' + c for c in ('basic', 'standard', 'advanced')],
        ['adcs_torquer', 'adcs_wheels', 'adcs_precise'],
        ['eng_' + e for e in ('none', 'coldgas', 'mono', 'biprop', 'ion')],
        ['structure_aluminium', 'structure_composite'],
        ['kolibri', 'vector', 'rideshare', 'atlant', 'titan'],
        ['testing_' + t for t in ('minimal', 'standard', 'extensive')],
        ['redundancy_single', 'redundancy_redundant'],
        ['planet_' + p for p in ('earth', 'moon', 'mars', 'sun')],
        ['orbit_' + o for o in ('leo', 'sso', 'geo', 'llo', 'elo', 'l1', 'lmo', 'emo')],
    ))


def render_some(which):
    sc, cam, stage = studio()
    if bpy.context.window:
        bpy.context.window.scene = sc
    done = []
    for name in which:
        clear(stage)
        (rx, ry), view = compose(stage, name)
        sc.render.resolution_x, sc.render.resolution_y = rx, ry
        frame(sc, cam, stage, view, 0.86 if name.startswith(('planet_', 'orbit_')) else 1.08)
        shoot(sc, name)
        done.append(name)
    clear(stage)
    return done


def render_all():
    return render_some(names())


if __name__ == '__main__':
    # Best run headless, so a long batch cannot take an open Blender down with it:
    #   blender -b tools/blender/mission-forge-assets.blend --python tools/blender/render_thumbs.py [-- name ...]
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    done = render_some(argv) if argv else render_all()
    print(len(done), 'thumbnails ->', OUT)
