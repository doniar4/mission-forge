"""Launch vehicles and the launch complex -> public/models/rockets.glb, pad.glb

The five rockets are fictional. Each is an empty named after the vehicle id with
children <id>_s1, <id>_s2, <id>_fair_a, <id>_fair_b and <id>_b0..n (boosters),
placed where they sit on the pad so the game can separate them in flight.
"""
import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import mf_common as mf  # noqa: E402

importlib.reload(mf)
Part = mf.Part
pi, tau, cos, sin = math.pi, math.tau, math.cos, math.sin


def bell_down(p, rt, re, length, loc=(0, 0, 0), m='nozzle', t=0.03, n=6, seg=20):
    """Engine bell opening downwards: exit plane at loc.z, throat `length` above it."""
    pts = [(re - (re - rt) * (i / n) ** 1.6, length * i / n) for i in range(n + 1)]
    p.lathe(pts + [(max(0.01, r - t), z) for r, z in reversed(pts)] + [pts[0]], m=m, seg=seg, loc=loc)
    p.cyl(rt, rt, 0.02, loc=(loc[0], loc[1], loc[2] + length - 0.02), m='black', seg=10)


def cone_to(p, a, b, r1, r2, m, seg=8):
    a, b = mf.Vector(a), mf.Vector(b)
    dd = b - a
    M = mf.T((a + b) / 2) @ mf.Vector((0, 0, 1)).rotation_difference(dd).to_matrix().to_4x4()
    res = mf.bmesh.ops.create_cone(p.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=dd.length, matrix=M)
    p._tag(res['verts'], m)


def engine_cluster(p, n, r_body, z0=0.0):
    """Puts n bells under a stage and returns how far they hang below the body."""
    if n == 1:
        re = r_body * 0.62
        length = re * 2.0
        bell_down(p, re * 0.28, re, length, loc=(0, 0, z0))
        return length * 0.72
    ring = n if n < 7 else n - 1
    k = sin(pi / ring)
    re = min(r_body * 0.42, r_body * 0.92 * k / (1 + k))
    length = re * 2.1
    rr = r_body * 0.92 - re
    for i in range(ring):
        a = i * tau / ring
        bell_down(p, re * 0.3, re, length, loc=(rr * cos(a), rr * sin(a), z0), seg=14)
    if ring != n:
        bell_down(p, re * 0.3, re, length, loc=(0, 0, z0), seg=14)
    return length * 0.72


def ogive(r, h, z0, n=10):
    """Nose profile from the shoulder (r, z0) to the tip (0, z0 + h)."""
    return [(r * math.sqrt(max(0.0, 1 - (i / n) ** 1.8)), z0 + h * i / n) for i in range(n + 1)]


def make_rocket(coll, key, origin, d, h1, h2, fd, fh, n_eng, accent, boosters=None, fins=False, d2=None):
    root = mf.empty(key, coll, loc=origin)
    r = d / 2
    r2 = (d2 or d) / 2
    rf = fd / 2

    # ---- first stage --------------------------------------------------------
    p = Part(f'{key}_s1')
    hang = engine_cluster(p, n_eng, r)
    skirt = 0.045 * h1
    inter = 0.07 * h1
    p.cyl(r * 0.98, r, skirt, loc=(0, 0, hang), m='dark', seg=32)
    body0 = hang + skirt
    body1 = h1 - inter
    p.cyl(r, r, body1 - body0, loc=(0, 0, body0), m='white', seg=32)
    # Interstage with the black-and-white roll pattern that lets trackers see the rocket turn.
    p.cyl(r, r2, inter, loc=(0, 0, body1), m='white', seg=32)
    for q in range(4):
        z0, z1 = body1 + 0.02, body1 + inter - 0.02
        p.lathe([(r + 0.012, z0), (r2 + 0.012, z1), (r2 + 0.002, z1), (r + 0.002, z0), (r + 0.012, z0)], m='black', seg=6, start=q * pi / 2, sweep=pi / 4)
    # Where the two propellant tanks meet: a weld band and a vent.
    tank = body0 + 0.38 * (body1 - body0)
    p.cyl(r + 0.006, r + 0.006, 0.05 * d, loc=(0, 0, tank), m='alu', seg=32)
    p.box((0.12 * d, 0.06 * d, 0.12 * d), loc=(r * 0.98, 0, tank + 0.4 * d), m='dark')
    # The thrust section is dark with soot.
    p.cyl(r + 0.004, r + 0.004, 0.03 * h1, loc=(0, 0, body0), m='black', seg=32)
    p.cyl(r + 0.012, r + 0.012, 0.035 * h1, loc=(0, 0, body0 + 0.62 * (body1 - body0)), m=accent, seg=32)
    p.cyl(r + 0.012, r + 0.012, 0.012 * h1, loc=(0, 0, body0 + 0.56 * (body1 - body0)), m='dark', seg=32)
    p.box((0.1 * d, 0.05 * d, body1 - body0 - 0.5), loc=(0, -r - 0.02 * d, (body0 + body1) / 2), m='alu')
    if fins:
        for i in range(4):
            a = pi / 4 + i * pi / 2
            p.box((0.55 * d, 0.03 * d, 0.9 * d), loc=((r + 0.22 * d) * cos(a), (r + 0.22 * d) * sin(a), hang + 0.5 * d), rot=(0, 0, a), m=accent)
    p.finish(coll, parent=root)

    # ---- second stage (its own origin sits on top of the first) -------------
    p = Part(f'{key}_s2')
    re2 = r2 * 0.5
    bell_down(p, re2 * 0.25, re2, inter * 0.92, loc=(0, 0, -inter * 0.92))
    p.cyl(r2, r2, h2 * 0.86, m='frost', seg=32)
    p.cyl(r2 + 0.012, r2 + 0.012, h2 * 0.08, loc=(0, 0, h2 * 0.5), m=accent, seg=32)
    p.cyl(r2, rf, h2 * 0.14, loc=(0, 0, h2 * 0.86), m='dark', seg=32)
    p.cyl(rf * 0.8, rf * 0.34, 0.16 * fd, loc=(0, 0, h2), m='alu', seg=24)  # payload adapter
    for i in range(4):  # attitude-control thruster pods
        a = pi / 4 + i * pi / 2
        c = (r2 * cos(a), r2 * sin(a), h2 * 0.78)
        p.box((0.14 * d, 0.1 * d, 0.16 * d), loc=c, rot=(0, 0, a), m='dark')
        cone_to(p, (c[0] * 1.06, c[1] * 1.06, c[2]), (c[0] * 1.12, c[1] * 1.12, c[2]), 0.012 * d, 0.03 * d, 'nozzle')
    p.box((0.18 * d, 0.06 * d, 0.22 * d), loc=(0, -r2, h2 * 0.3), m='alu')  # umbilical plate
    p.finish(coll, parent=root, loc=(0, 0, h1))

    # ---- fairing halves ------------------------------------------------------
    t = 0.035
    straight = fh * 0.5
    outer = [(rf, 0.0), (rf, straight)] + ogive(rf, fh - straight, straight)[1:]
    inner = [(max(0.0, rr - t), z - (t if rr < 1e-6 else 0)) for rr, z in reversed(outer)]
    for tag, start in (('a', -pi / 2), ('b', pi / 2)):
        p = Part(f'{key}_fair_{tag}')
        p.lathe(outer, m='white', seg=16, start=start, sweep=pi)
        p.lathe(inner, m='dark', seg=16, start=start, sweep=pi)
        band = [(rf + 0.012, straight * 0.55), (rf + 0.012, straight * 0.8)]
        p.lathe(band, m=accent, seg=16, start=start, sweep=pi)
        # Separation rails along both edges of the half.
        seam = [(rr + 0.008, z) for rr, z in outer[:-1]]
        p.lathe(seam, m='dark', seg=1, start=start + 0.004, sweep=0.03)
        p.lathe(seam, m='dark', seg=1, start=start + pi - 0.034, sweep=0.03)
        p.lathe([(rf + 0.008, 0.0), (rf + 0.008, 0.06 * fh)], m='alu', seg=16, start=start, sweep=pi)
        p.finish(coll, parent=root, loc=(0, 0, h1 + h2), recalc=False)

    # ---- strap-on boosters ---------------------------------------------------
    if boosters:
        n, db, hb, zb = boosters
        rb = db / 2
        for i in range(n):
            a = i * pi if n == 2 else pi / 4 + i * tau / n
            p = Part(f'{key}_b{i}')
            hangb = engine_cluster(p, 1, rb)
            p.cyl(rb * 0.98, rb, 0.05 * hb, loc=(0, 0, hangb), m='dark', seg=24)
            p.cyl(rb, rb, hb * 0.8, loc=(0, 0, hangb + 0.05 * hb), m='white', seg=24)
            p.cyl(rb + 0.01, rb + 0.01, 0.04 * hb, loc=(0, 0, hangb + 0.55 * hb), m=accent, seg=24)
            p.lathe(ogive(rb, hb * 0.15, hangb + 0.85 * hb) + [(0, hangb + 0.85 * hb)], m='white', seg=24)
            p.cyl(rb + 0.006, rb + 0.006, 0.02 * hb, loc=(0, 0, hangb + 0.85 * hb - 0.01 * hb), m='black', seg=24)
            for k in (-1, 1):  # small motors that push the empty booster away
                cone_to(p, (rb * 0.7, k * rb * 0.5, hangb + 0.82 * hb), (rb * 1.05, k * rb * 0.62, hangb + 0.8 * hb), 0.05 * db, 0.08 * db, 'nozzle')
            for z in (hangb + 0.15 * hb, hangb + 0.72 * hb):  # attach struts reach back to the core (-X)
                p.strut((-rb * 0.6, 0, z), (-rb - 0.12 * d, 0, z + 0.2), 0.06 * db, m='steel', seg=6)
            ob = p.finish(coll, parent=root, loc=((r + rb + 0.08 * d) * cos(a), (r + rb + 0.08 * d) * sin(a), zb))
            ob.rotation_euler = (0, 0, a)
    return root


def build_rockets(scene):
    coll = mf.fresh_collection(scene, 'mf_rockets')
    specs = [
        dict(key='kolibri', d=1.2, h1=11.5, h2=2.6, fd=1.3, fh=3.2, n_eng=5, accent='orange', fins=True),
        dict(key='vector', d=2.2, h1=18.0, h2=5.0, fd=2.6, fh=6.0, n_eng=3, accent='navy', fins=True),
        dict(key='rideshare', d=3.4, h1=27.0, h2=7.5, fd=3.6, fh=9.0, n_eng=7, accent='violet'),
        dict(key='atlant', d=3.7, h1=30.0, h2=9.0, fd=4.4, fh=11.0, n_eng=2, accent='teal', boosters=(4, 1.5, 15.0, 0.0)),
        dict(key='titan', d=4.6, h1=40.0, h2=11.0, fd=5.4, fh=14.0, n_eng=3, accent='orange', boosters=(2, 3.4, 34.0, 0.0)),
    ]
    for i, s in enumerate(specs):
        make_rocket(coll, origin=(i * 16.0, 0, 0), **s)
    return coll


# ---- launch complex -------------------------------------------------------------

def build_pad(scene):
    coll = mf.fresh_collection(scene, 'mf_pad')
    made = []

    def done(p, **kw):
        i = len(made)
        made.append(p.finish(coll, loc=(i * 30.0, 40.0, 0), **kw))

    p = Part('pad_base')  # top surface at z = 0
    p.box((64, 64, 1.6), loc=(0, 0, -0.8), m='concrete', bevel=0.3)
    p.box((10, 64, 0.04), loc=(0, 0, 0.02), m='dark')        # flame trench
    for s in (-1, 1):
        p.box((0.5, 64, 0.5), loc=(s * 5.3, 0, 0.25), m='concrete')
        p.box((64, 0.25, 0.05), loc=(0, s * 20, 0.03), m='orange')
    done(p)

    p = Part('pad_mount')  # for a rocket base 1 m wide: the game scales it; the rocket stands at z = 0.5
    ring = [(0.62, 0.36), (1.0, 0.36), (1.0, 0.5), (0.62, 0.5), (0.62, 0.36)]
    p.lathe(ring, m='steel', seg=8, start=pi / 8)
    for i in range(4):
        a = pi / 4 + i * pi / 2
        p.box((0.2, 0.2, 0.36), loc=(0.82 * cos(a), 0.82 * sin(a), 0.18), rot=(0, 0, a), m='steel')
        p.box((0.16, 0.1, 0.1), loc=(0.6 * cos(a), 0.6 * sin(a), 0.55), rot=(0, 0, a), m='orange')
    p.cyl(0.6, 0.05, 0.3, rot=(0, 0, pi / 4), m='dark', seg=4)  # flame deflector
    done(p)

    p = Part('tower_seg')  # 4 x 4 x 4 m lattice bay, origin at the centre of its base
    for x in (-2, 2):
        for y in (-2, 2):
            p.box((0.3, 0.3, 4.0), loc=(x, y, 2.0), m='steel')
    for s in (-2, 2):
        p.box((4.0, 0.2, 0.2), loc=(0, s, 3.9), m='steel')
        p.box((0.2, 4.0, 0.2), loc=(s, 0, 3.9), m='steel')
        p.strut((-2, s, 0.1), (2, s, 3.8), 0.07, m='steel', seg=4)
        p.strut((s, 2, 0.1), (s, -2, 3.8), 0.07, m='steel', seg=4)
    p.box((3.8, 3.8, 0.08), loc=(0, 0, 3.96), m='dark')
    done(p)

    p = Part('tower_arm')  # 1 m long along +X: the game stretches it to reach the rocket
    for y in (-0.45, 0.45):
        for z in (-0.45, 0.45):
            p.box((1.0, 0.12, 0.12), loc=(0.5, y, z), m='steel')
    for k in range(4):
        x0 = k * 0.25
        p.strut((x0, -0.45, -0.45), (x0 + 0.25, -0.45, 0.45), 0.035, m='steel', seg=4)
        p.strut((x0, 0.45, 0.45), (x0 + 0.25, 0.45, -0.45), 0.035, m='steel', seg=4)
    p.box((0.06, 1.1, 1.1), loc=(0.98, 0, 0), m='orange')
    p.strut((0.0, 0, -0.3), (1.0, 0, -0.3), 0.08, m='black', seg=6)  # umbilical hose
    done(p)

    p = Part('tower_top')
    p.box((4.6, 4.6, 0.3), loc=(0, 0, 0.15), m='steel')
    p.cyl(0.25, 0.06, 9.0, loc=(0, 0, 0.3), m='steel', seg=8)
    p.box((7.0, 0.5, 0.5), loc=(2.0, 0, 1.2), m='orange')  # crane jib
    p.sphere(0.22, loc=(0, 0, 9.4), m='signal', seg=8)
    done(p)

    p = Part('mast')  # 60 m lightning mast
    p.cyl(0.9, 0.9, 0.6, m='concrete', seg=8)
    p.cyl(0.45, 0.12, 56.0, loc=(0, 0, 0.6), m='steel', seg=8)
    p.cyl(0.05, 0.01, 3.4, loc=(0, 0, 56.6), m='alu', seg=6)
    for z in (20, 40):
        p.cyl(0.36, 0.36, 0.8, loc=(0, 0, z), m='signal', seg=8)
    done(p)

    p = Part('tank_sphere')  # cryogenic sphere on legs
    p.sphere(4.0, loc=(0, 0, 5.4), m='frost', seg=24)
    for i in range(6):
        a = i * tau / 6
        p.strut((3.4 * cos(a), 3.4 * sin(a), 0), (3.2 * cos(a), 3.2 * sin(a), 4.2), 0.16, m='steel', seg=6)
    p.cyl(0.25, 0.25, 1.4, loc=(0, 0, 9.3), m='steel', seg=8)
    p.box((1.0, 1.0, 0.08), loc=(0, 0, 10.7), m='steel')
    done(p)

    p = Part('tank_cyl')  # horizontal propellant tank
    p.cyl(1.9, 1.9, 9.0, loc=(-4.5, 0, 2.6), rot=(0, pi / 2, 0), m='white', seg=20)
    p.sphere(1.9, loc=(-4.5, 0, 2.6), m='white', seg=20, scale=(0.5, 1, 1))
    p.sphere(1.9, loc=(4.5, 0, 2.6), m='white', seg=20, scale=(0.5, 1, 1))
    for x in (-3, 3):
        p.box((0.6, 3.4, 1.4), loc=(x, 0, 0.7), m='concrete')
    p.cyl(1.92, 1.92, 0.5, loc=(-0.25, 0, 2.6), rot=(0, pi / 2, 0), m='orange', seg=20)
    done(p)

    p = Part('bunker')
    p.box((14, 8, 4), loc=(0, 0, 2), m='concrete', bevel=0.15)
    p.box((10, 0.1, 1.0), loc=(0, -4.03, 2.6), m='lens')
    p.box((3, 3, 1.2), loc=(4, 1, 4.6), m='concrete')
    p.cyl(0.08, 0.04, 5.0, loc=(-5, 2, 4), m='alu', seg=6)
    done(p)

    p = Part('floodlight')  # 24 m mast with a lamp bank facing +X
    p.cyl(0.3, 0.16, 24.0, m='steel', seg=8)
    p.box((0.5, 4.2, 2.2), loc=(0.2, 0, 24.6), rot=(0, 0.35, 0), m='steel')
    for y in (-1.5, -0.5, 0.5, 1.5):
        for z in (-0.5, 0.5):
            p.box((0.1, 0.8, 0.8), loc=(0.5 + 0.35 * z, y, 24.6 + z * 0.94), rot=(0, 0.35, 0), m='lamp')
    done(p)

    return coll


if __name__ == '__main__':
    scene = mf.work_scene()
    out_dir = os.path.normpath(os.path.join(HERE, '..', '..', 'public', 'models'))
    os.makedirs(out_dir, exist_ok=True)
    for name, fn in (('rockets', build_rockets), ('pad', build_pad)):
        coll = fn(scene)
        out = os.path.join(out_dir, name + '.glb')
        mf.export_glb(coll, out)
        print(name + ':', len(coll.all_objects), 'objects ->', os.path.getsize(out) // 1024, 'KB')
