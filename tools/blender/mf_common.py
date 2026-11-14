"""Shared helpers for the Mission Forge asset generators.

Run inside Blender (tested with 5.3). Every model in the game is generated from these
scripts, so the art is original, reproducible and free of third-party licences.

Conventions
- Units are metres. Blender Z is up; the glTF exporter converts to Y-up.
- Kit parts stand on the ground plane and point up (+Z): the game rotates them
  onto whichever face of the spacecraft they belong to.
- Materials are named mf_<key>; the game looks them up by that name.
"""
import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector


def lin(hex_color):
    """sRGB hex -> linear RGBA, which is what Principled BSDF expects."""
    c = hex_color.lstrip('#')
    out = []
    for i in (0, 2, 4):
        u = int(c[i:i + 2], 16) / 255
        out.append(u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


# key: (base colour, metallic, roughness, emission (colour, strength) or None)
MATS = {
    'gold': ('#C99A2E', 1.0, 0.38, None),       # multi-layer insulation foil
    'white': ('#E9EDF2', 0.0, 0.55, None),
    'alu': ('#AEB7C4', 1.0, 0.42, None),
    'dark': ('#232A3B', 0.2, 0.6, None),
    'black': ('#0E1119', 0.1, 0.7, None),
    'cell': ('#12234F', 0.5, 0.25, None),       # solar cells
    'lens': ('#0A1430', 0.9, 0.08, None),
    'orange': ('#E8500A', 0.0, 0.5, None),
    'radiator': ('#F4F6F8', 0.1, 0.25, None),
    'nozzle': ('#3A3D45', 1.0, 0.35, None),
    'glow': ('#5CC8FF', 0.0, 0.4, ('#5CC8FF', 4.0)),
    'navy': ('#14213D', 0.1, 0.5, None),
    'teal': ('#1C7C8C', 0.1, 0.5, None),
    'violet': ('#5B4BB7', 0.1, 0.5, None),
    'concrete': ('#9097A0', 0.0, 0.92, None),
    'steel': ('#596270', 0.8, 0.5, None),
    'signal': ('#C8321E', 0.0, 0.55, None),      # tower warning paint
    'frost': ('#DCE6EE', 0.0, 0.3, None),        # cryogenic tank skin
    'lamp': ('#FFF4D6', 0.0, 0.4, ('#FFE9B0', 6.0)),
}


def get_mat(key):
    name = 'mf_' + key
    m = bpy.data.materials.get(name)
    if m:
        return m
    color, metallic, rough, emit = MATS[key]
    m = bpy.data.materials.new(name)
    if not m.node_tree:
        m.use_nodes = True
    nodes = m.node_tree.nodes
    bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        bsdf = nodes.new('ShaderNodeBsdfPrincipled')
        out = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None) or nodes.new('ShaderNodeOutputMaterial')
        m.node_tree.links.new(bsdf.outputs[0], out.inputs[0])
    bsdf.inputs['Base Color'].default_value = lin(color)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = rough
    if emit:
        bsdf.inputs['Emission Color'].default_value = lin(emit[0])
        bsdf.inputs['Emission Strength'].default_value = emit[1]
    m.diffuse_color = lin(color)
    return m


def T(loc):
    return Matrix.Translation(Vector(loc))


def R(rot):
    return Euler(rot, 'XYZ').to_matrix().to_4x4()


class Part:
    """Accumulates primitives into one mesh with several material slots."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.slots = []
        self.uv = self.bm.loops.layers.uv.new('UVMap')

    def _slot(self, key):
        if key not in self.slots:
            self.slots.append(key)
        return self.slots.index(key)

    def _tag(self, verts, key):
        idx = self._slot(key)
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            f.material_index = idx
        return faces

    def box(self, size, loc=(0, 0, 0), rot=(0, 0, 0), m='white', bevel=0.0, uv_scale=None):
        """Box centred on loc. uv_scale maps local XY to UV (used for solar cells)."""
        M = T(loc) @ R(rot) @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=M)
        faces = self._tag(r['verts'], m)
        if uv_scale:
            inv = (T(loc) @ R(rot)).inverted()
            for f in faces:
                for loop in f.loops:
                    p = inv @ loop.vert.co
                    loop[self.uv].uv = (p.x * uv_scale[0] + 0.5, p.y * uv_scale[1] + 0.5)
        if bevel > 0:
            edges = list({e for f in faces for e in f.edges})
            res = bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, offset_type='OFFSET', segments=1, profile=0.5, affect='EDGES')
            idx = self._slot(m)
            for f in res['faces']:
                f.material_index = idx
        return self

    def cyl(self, r1, r2, h, loc=(0, 0, 0), rot=(0, 0, 0), m='white', seg=24):
        """Cylinder or cone standing on loc and extending h along its local +Z."""
        M = T(loc) @ R(rot) @ T((0, 0, h / 2))
        r = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h, matrix=M)
        self._tag(r['verts'], m)
        return self

    def sphere(self, r, loc=(0, 0, 0), m='white', seg=20, scale=(1, 1, 1)):
        M = T(loc) @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=max(8, seg // 2), radius=r, matrix=M)
        self._tag(res['verts'], m)
        return self

    def strut(self, a, b, r, m='alu', seg=8):
        a, b = Vector(a), Vector(b)
        d = b - a
        M = T((a + b) / 2) @ Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=d.length, matrix=M)
        self._tag(res['verts'], m)
        return self

    def lathe(self, profile, loc=(0, 0, 0), rot=(0, 0, 0), m='white', seg=32, start=0.0, sweep=math.tau):
        """Revolves a (radius, z) profile around local Z. A closed profile gives a solid shell."""
        M = T(loc) @ R(rot)
        full = abs(sweep - math.tau) < 1e-6
        n = seg if full else seg + 1
        rings = []
        for (r, z) in profile:
            if r < 1e-6:
                rings.append([self.bm.verts.new(M @ Vector((0, 0, z)))])
            else:
                rings.append([
                    self.bm.verts.new(M @ Vector((r * math.cos(start + sweep * j / seg), r * math.sin(start + sweep * j / seg), z)))
                    for j in range(n)
                ])
        idx = self._slot(m)
        steps = seg if full else seg
        for i in range(len(rings) - 1):
            A, B = rings[i], rings[i + 1]
            if len(A) == 1 and len(B) == 1:
                continue
            for j in range(steps):
                j2 = (j + 1) % n
                if len(A) == 1:
                    vs = (A[0], B[j2], B[j])
                elif len(B) == 1:
                    vs = (A[j], A[j2], B[0])
                else:
                    vs = (A[j], A[j2], B[j2], B[j])
                try:
                    f = self.bm.faces.new(vs)
                    f.material_index = idx
                except ValueError:
                    pass
        return self

    def finish(self, coll, loc=(0, 0, 0), sharp_deg=32.0, parent=None, recalc=True):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
        if recalc:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        limit = math.radians(sharp_deg)
        for f in bm.faces:
            f.smooth = True
        for e in bm.edges:
            e.smooth = len(e.link_faces) == 2 and e.calc_face_angle(0.0) < limit
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for key in self.slots:
            me.materials.append(get_mat(key))
        ob = bpy.data.objects.new(self.name, me)
        coll.objects.link(ob)
        ob.location = loc
        if parent is not None:
            ob.parent = parent
        return ob


def empty(name, coll, loc=(0, 0, 0), parent=None):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.5
    coll.objects.link(ob)
    ob.location = loc
    if parent is not None:
        ob.parent = parent
    return ob


def fresh_collection(scene, name):
    """Returns an empty collection of this name inside the scene, deleting what it held before."""
    coll = bpy.data.collections.get(name)
    if coll:
        for ob in list(coll.objects):
            me = ob.data
            bpy.data.objects.remove(ob, do_unlink=True)
            if me and me.users == 0 and isinstance(me, bpy.types.Mesh):
                bpy.data.meshes.remove(me)
    else:
        coll = bpy.data.collections.new(name)
    if coll.name not in scene.collection.children:
        scene.collection.children.link(coll)
    return coll


def work_scene(name='MissionForge'):
    """The generators work in their own scene and leave the user's scenes alone."""
    scene = bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
    if bpy.context.window:
        bpy.context.window.scene = scene
    return scene


def export_glb(coll, path):
    """Exports one collection as a binary glTF with modifiers applied."""
    scene = next(s for s in bpy.data.scenes if coll.name in s.collection.children)
    if bpy.context.scene != scene:
        # A scene switch only takes effect once the running script returns, and the exporter
        # works on the active scene's selection. Run the generator a second time.
        raise RuntimeError(f'Scene "{scene.name}" is not active yet: run the script again to export.')
    for other in bpy.data.scenes:
        for ob in other.objects:
            ob.select_set(False, view_layer=other.view_layers[0])
    layer = scene.view_layers[0]
    for ob in coll.all_objects:
        ob.select_set(True, view_layer=layer)
    layer.objects.active = next(iter(coll.all_objects))
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )
    return path
