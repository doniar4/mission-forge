"""Spacecraft parts kit -> public/models/kit.glb

Every part stands on the ground plane and points up (+Z). The game mounts
them on the faces of the bus according to the player's design.
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


def dish(p, R, f, z0=0.0, m='white', t=0.012, n=8, seg=32):
    """Parabolic reflector opening towards +Z, vertex at z0."""
    pts = [(R * i / n, z0 + (R * i / n) ** 2 / (4 * f)) for i in range(n + 1)]
    p.lathe([(r, z - t) for r, z in pts] + list(reversed(pts)), m=m, seg=seg)


def bell(p, rt, re, z0, length, m='nozzle', t=0.006, n=8, seg=24, loc=(0, 0, 0)):
    """Engine bell: throat at z0, exit at z0 + length."""
    pts = [(rt + (re - rt) * (i / n) ** 0.6, z0 + length * i / n) for i in range(n + 1)]
    p.lathe(pts + [(r - t, z) for r, z in reversed(pts)] + [pts[0]], m=m, seg=seg, loc=loc)
    p.cyl(rt, rt, 0.004, loc=(loc[0], loc[1], loc[2] + z0), m='black', seg=12)


def cone_to(p, a, b, r1, r2, m, seg=10):
    a, b = mf.Vector(a), mf.Vector(b)
    d = b - a
    M = mf.T((a + b) / 2) @ mf.Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
    res = mf.bmesh.ops.create_cone(p.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=d.length, matrix=M)
    p._tag(res['verts'], m)


def build(scene):
    coll = mf.fresh_collection(scene, 'mf_kit')
    made = []

    def done(p, **kw):
        i = len(made)
        made.append(p.finish(coll, loc=((i % 8) * 3.2, -(i // 8) * 3.6, 0), **kw))

    # ---- bus ---------------------------------------------------------------
    p = Part('bus')
    p.box((1, 1, 1), m='gold', bevel=0.035)
    p.box((0.9, 0.9, 0.02), loc=(0, 0, 0.5), m='white')
    p.box((0.92, 0.92, 0.02), loc=(0, 0, -0.5), m='dark')
    for s in (1, -1):
        p.box((0.62, 0.016, 0.5), loc=(0, s * 0.5, -0.06), m='radiator')
    for x in (1, -1):
        for y in (1, -1):
            for z in (1, -1):
                p.box((0.07, 0.07, 0.07), loc=(x * 0.47, y * 0.47, z * 0.47), m='alu')
    done(p)

    # ---- power -------------------------------------------------------------
    p = Part('cells')  # body-mounted solar cells, one face
    p.box((0.88, 0.88, 0.012), loc=(0, 0, 0.006), m='cell', uv_scale=(1 / 0.88, 1 / 0.88))
    done(p)

    p = Part('panel')  # one deployable panel: hinge on the origin, extends along +X
    p.box((1.0, 1.0, 0.02), loc=(0.5, 0, 0), m='white')
    p.box((0.95, 0.95, 0.008), loc=(0.5, 0, 0.014), m='cell', uv_scale=(1 / 0.95, 1 / 0.95))
    p.cyl(0.018, 0.018, 0.3, loc=(0, -0.15, 0), rot=(-pi / 2, 0, 0), m='alu', seg=8)
    done(p)

    p = Part('yoke')
    p.strut((0, -0.06, 0), (0.4, -0.36, 0), 0.014)
    p.strut((0, 0.06, 0), (0.4, 0.36, 0), 0.014)
    p.strut((0.4, -0.4, 0), (0.4, 0.4, 0), 0.014)
    p.cyl(0.03, 0.03, 0.16, loc=(0, -0.08, 0), rot=(-pi / 2, 0, 0), m='alu', seg=10)
    done(p)

    p = Part('rtg')
    p.strut((0, 0, 0), (0, 0, 0.7), 0.03)
    p.cyl(0.15, 0.15, 0.04, loc=(0, 0, 0.68), m='alu', seg=16)
    p.cyl(0.14, 0.14, 0.9, loc=(0, 0, 0.7), m='dark', seg=16)
    for i in range(8):
        a = i * tau / 8
        p.box((0.16, 0.015, 0.8), loc=(0.22 * cos(a), 0.22 * sin(a), 1.15), rot=(0, 0, a), m='black')
    p.cyl(0.15, 0.1, 0.06, loc=(0, 0, 1.6), m='alu', seg=16)
    done(p)

    # ---- antennas ----------------------------------------------------------
    p = Part('ant_uhf')
    p.box((0.14, 0.14, 0.05), loc=(0, 0, 0.025), m='alu')
    for i in range(4):
        a = pi / 4 + i * pi / 2
        p.strut((0.05 * cos(a), 0.05 * sin(a), 0.05), (0.42 * cos(a), 0.42 * sin(a), 0.42), 0.008, seg=6)
    done(p)

    p = Part('ant_sband')
    p.cyl(0.02, 0.02, 0.05, m='alu', seg=8)
    p.box((0.18, 0.18, 0.02), loc=(0, 0, 0.06), m='white')
    p.box((0.1, 0.1, 0.006), loc=(0, 0, 0.073), m='gold')
    p.cyl(0.035, 0.02, 0.14, loc=(0.17, 0, 0), m='white', seg=12)
    done(p)

    p = Part('ant_mast')  # the dish pivots at z = 0.64
    p.cyl(0.05, 0.04, 0.06, m='alu', seg=12)
    p.cyl(0.03, 0.03, 0.5, loc=(0, 0, 0.06), m='alu', seg=10)
    p.box((0.26, 0.04, 0.03), loc=(0, 0, 0.56), m='alu')
    p.box((0.03, 0.04, 0.12), loc=(0.115, 0, 0.62), m='alu')
    p.box((0.03, 0.04, 0.12), loc=(-0.115, 0, 0.62), m='alu')
    done(p)

    p = Part('dish')  # radius 0.5, pivot on the origin, boresight +Z
    dish(p, 0.5, 0.3, z0=0.07)
    p.cyl(0.08, 0.06, 0.1, loc=(0, 0, -0.04), m='alu', seg=12)
    for i in range(3):
        a = i * tau / 3 + 0.3
        p.strut((0.47 * cos(a), 0.47 * sin(a), 0.255), (0.05 * cos(a), 0.05 * sin(a), 0.38), 0.008, seg=6)
    p.cyl(0.05, 0.03, 0.07, loc=(0, 0, 0.33), m='alu', seg=10)
    p.cyl(0.03, 0.03, 0.03, loc=(0, 0, 0.4), m='gold', seg=10)
    done(p)

    p = Part('ant_laser')
    p.cyl(0.11, 0.1, 0.08, m='alu', seg=16)
    p.cyl(0.06, 0.06, 0.1, loc=(0, 0, 0.08), m='alu', seg=12)
    p.sphere(0.12, loc=(0, 0, 0.26), m='white', seg=16)
    tilt = -0.87
    ax = (0, sin(-tilt), cos(-tilt))
    p.cyl(0.075, 0.075, 0.2, loc=(0, 0, 0.26), rot=(tilt, 0, 0), m='white', seg=16)
    p.cyl(0.06, 0.06, 0.012, loc=(0, ax[1] * 0.2, 0.26 + ax[2] * 0.2), rot=(tilt, 0, 0), m='lens', seg=16)
    done(p)

    # ---- instruments -------------------------------------------------------
    p = Part('inst_cam_wide')
    p.box((0.18, 0.18, 0.12), loc=(0, 0, 0.06), m='white', bevel=0.01)
    p.cyl(0.06, 0.06, 0.07, loc=(0, 0, 0.12), m='dark', seg=16)
    p.cyl(0.045, 0.045, 0.008, loc=(0, 0, 0.19), m='lens', seg=16)
    done(p)

    p = Part('inst_cam_hires')
    p.cyl(0.24, 0.24, 0.38, m='gold', seg=24)
    p.cyl(0.22, 0.22, 0.66, loc=(0, 0, 0.38), m='white', seg=24)
    p.cyl(0.245, 0.245, 0.07, loc=(0, 0, 1.04), m='dark', seg=24)
    p.cyl(0.2, 0.2, 0.01, loc=(0, 0, 1.105), m='lens', seg=24)
    p.cyl(0.05, 0.05, 0.02, loc=(0, 0, 1.115), m='dark', seg=10)
    for i in range(3):
        a = i * tau / 3
        p.strut((0.05 * cos(a), 0.05 * sin(a), 1.125), (0.24 * cos(a), 0.24 * sin(a), 1.125), 0.006, m='dark', seg=4)
    p.box((0.16, 0.12, 0.22), loc=(0.3, 0, 0.13), m='white')
    done(p)

    p = Part('inst_thermal_ir')
    p.box((0.34, 0.3, 0.34), loc=(0, 0, 0.17), m='gold', bevel=0.012)
    p.box((0.2, 0.15, 0.1), loc=(0, 0, 0.39), m='dark')
    p.box((0.15, 0.1, 0.008), loc=(0, 0, 0.442), m='lens')
    p.box((0.02, 0.34, 0.36), loc=(0.27, 0, 0.2), rot=(0, -0.25, 0), m='radiator')
    p.strut((0.17, 0, 0.12), (0.25, 0, 0.14), 0.012)
    p.strut((0.17, 0, 0.28), (0.25, 0, 0.3), 0.012)
    done(p)

    p = Part('inst_multispec')
    p.box((0.4, 0.32, 0.28), loc=(0, 0, 0.14), m='white', bevel=0.012)
    p.cyl(0.15, 0.24, 0.2, loc=(0, 0, 0.28), rot=(0, 0, pi / 4), m='dark', seg=4)
    p.box((0.26, 0.26, 0.008), loc=(0, 0, 0.482), m='lens')
    done(p)

    p = Part('inst_sar')  # 4 m radar antenna on stand-offs
    p.box((0.3, 0.3, 0.1), loc=(0, 0, 0.05), m='alu')
    p.box((4.0, 1.0, 0.05), loc=(0, 0, 0.3), m='alu')
    for i in range(8):
        p.box((0.44, 0.9, 0.012), loc=(-1.75 + i * 0.5, 0, 0.331), m='white')
    for sx in (-1, 1):
        p.strut((sx * 0.1, 0, 0.1), (sx * 1.5, 0, 0.28), 0.02)
        p.strut((sx * 0.1, 0.1, 0.1), (sx * 0.8, 0.4, 0.28), 0.015)
        p.strut((sx * 0.1, -0.1, 0.1), (sx * 0.8, -0.4, 0.28), 0.015)
    done(p)

    p = Part('inst_altimeter')
    p.cyl(0.1, 0.08, 0.09, m='alu', seg=12)
    dish(p, 0.4, 0.4, z0=0.1)
    for i in range(3):
        a = i * tau / 3
        p.strut((0.37 * cos(a), 0.37 * sin(a), 0.185), (0.03 * cos(a), 0.03 * sin(a), 0.37), 0.007, seg=6)
    p.cyl(0.04, 0.025, 0.05, loc=(0, 0, 0.34), m='alu', seg=10)
    p.box((0.14, 0.14, 0.14), loc=(0.4, 0.22, 0.07), m='gold', bevel=0.008)
    done(p)

    p = Part('inst_sounder')
    p.box((0.36, 0.3, 0.26), loc=(0, 0, 0.13), m='white', bevel=0.012)
    p.cyl(0.1, 0.1, 0.3, loc=(-0.15, 0, 0.31), rot=(0, pi / 2, 0), m='gold', seg=16)
    p.box((0.2, 0.1, 0.02), loc=(0, 0, 0.405), m='lens')
    p.box((0.03, 0.24, 0.24), loc=(0.165, 0, 0.3), m='alu')
    p.box((0.03, 0.24, 0.24), loc=(-0.165, 0, 0.3), m='alu')
    done(p)

    p = Part('inst_spectrometer')
    p.box((0.28, 0.24, 0.28), loc=(0, 0, 0.14), m='gold', bevel=0.012)
    p.cyl(0.075, 0.085, 0.13, loc=(0.03, 0, 0.28), m='dark', seg=16)
    p.cyl(0.065, 0.065, 0.008, loc=(0.03, 0, 0.41), m='lens', seg=16)
    p.box((0.3, 0.015, 0.22), loc=(0, 0.16, 0.2), m='radiator')
    done(p)

    p = Part('inst_neutron')
    p.box((0.2, 0.16, 0.08), loc=(0, 0, 0.04), m='alu')
    p.cyl(0.085, 0.085, 0.3, loc=(0, 0, 0.08), m='gold', seg=16)
    p.cyl(0.092, 0.092, 0.03, loc=(0, 0, 0.08), m='alu', seg=16)
    p.cyl(0.092, 0.092, 0.03, loc=(0, 0, 0.35), m='alu', seg=16)
    p.sphere(0.085, loc=(0, 0, 0.38), m='gold', seg=14, scale=(1, 1, 0.5))
    done(p)

    p = Part('inst_magnetometer')  # 2.4 m boom
    p.cyl(0.04, 0.04, 0.06, m='alu', seg=10)
    p.strut((0, 0, 0.06), (0, 0, 1.2), 0.016, seg=6)
    p.cyl(0.03, 0.03, 0.05, loc=(0, 0, 1.18), m='dark', seg=8)
    p.strut((0, 0, 1.22), (0, 0, 2.3), 0.012, seg=6)
    p.box((0.1, 0.1, 0.14), loc=(0, 0, 2.36), m='gold', bevel=0.01)
    p.box((0.07, 0.07, 0.09), loc=(0.05, 0, 1.5), m='gold')
    done(p)

    p = Part('inst_particles')
    p.box((0.22, 0.2, 0.16), loc=(0, 0, 0.08), m='white', bevel=0.01)
    p.sphere(0.07, loc=(0, 0, 0.16), m='gold', seg=14)
    for a in (-0.75, 0.0, 0.75):
        base = (0.06 * sin(a), 0, 0.16 + 0.06 * cos(a))
        tip = (0.17 * sin(a), 0, 0.16 + 0.17 * cos(a))
        cone_to(p, base, tip, 0.025, 0.045, 'dark')
    done(p)

    p = Part('inst_coronagraph')
    p.box((0.2, 0.2, 0.1), loc=(0, 0, 0.05), m='alu')
    p.cyl(0.11, 0.11, 0.25, loc=(0, 0, 0.1), m='gold', seg=20)
    p.cyl(0.1, 0.1, 0.65, loc=(0, 0, 0.35), m='white', seg=20)
    p.cyl(0.115, 0.115, 0.04, loc=(0, 0, 1.0), m='dark', seg=20)
    p.cyl(0.09, 0.09, 0.006, loc=(0, 0, 1.04), m='lens', seg=20)
    for i in range(3):
        a = i * tau / 3
        p.strut((0.11 * cos(a), 0.11 * sin(a), 1.04), (0.03 * cos(a), 0.03 * sin(a), 1.3), 0.005, m='dark', seg=4)
    p.cyl(0.045, 0.045, 0.012, loc=(0, 0, 1.3), m='black', seg=16)
    done(p)

    # ---- entry and professional classes of the instruments ------------------
    # Class 1 is small and simple, class 3 carries what makes it better: coolers, radiators,
    # longer booms, bigger optics.
    p = Part('inst_cam_mid')
    p.box((0.22, 0.22, 0.14), loc=(0, 0, 0.07), m='gold', bevel=0.01)
    p.cyl(0.13, 0.13, 0.42, loc=(0, 0, 0.14), m='white', seg=20)
    p.cyl(0.14, 0.14, 0.05, loc=(0, 0, 0.56), m='dark', seg=20)
    p.cyl(0.11, 0.11, 0.008, loc=(0, 0, 0.61), m='lens', seg=20)
    done(p)

    p = Part('inst_thermal_micro')
    p.box((0.12, 0.1, 0.08), loc=(0, 0, 0.04), m='dark', bevel=0.006)
    p.cyl(0.035, 0.035, 0.03, loc=(0, 0, 0.08), m='black', seg=14)
    p.cyl(0.028, 0.028, 0.004, loc=(0, 0, 0.11), m='lens', seg=14)
    done(p)

    p = Part('inst_thermal_cryo')
    p.box((0.42, 0.36, 0.4), loc=(0, 0, 0.2), m='gold', bevel=0.014)
    p.box((0.24, 0.18, 0.12), loc=(0, 0, 0.46), m='dark')
    p.box((0.18, 0.12, 0.008), loc=(0, 0, 0.524), m='lens')
    p.cyl(0.07, 0.07, 0.3, loc=(-0.21, 0.12, 0.2), rot=(0, pi / 2, 0), m='alu', seg=16)  # cryocooler
    for k in range(5):
        p.cyl(0.085, 0.085, 0.01, loc=(-0.24 - k * 0.04, 0.12, 0.2), rot=(0, pi / 2, 0), m='alu', seg=16)
    p.box((0.02, 0.6, 0.5), loc=(0.33, 0, 0.3), rot=(0, -0.3, 0), m='radiator')
    p.strut((0.21, 0, 0.12), (0.3, 0, 0.16), 0.014)
    p.strut((0.21, 0, 0.32), (0.3, 0, 0.36), 0.014)
    done(p)

    p = Part('inst_multispec_lite')
    p.box((0.2, 0.18, 0.12), loc=(0, 0, 0.06), m='white', bevel=0.008)
    for x in (-0.045, 0.045):
        for y in (-0.04, 0.04):
            p.cyl(0.03, 0.03, 0.04, loc=(x, y, 0.12), m='dark', seg=14)
            p.cyl(0.024, 0.024, 0.004, loc=(x, y, 0.16), m='lens', seg=14)
    done(p)

    p = Part('inst_hyperspec')
    p.box((0.56, 0.42, 0.32), loc=(0, 0, 0.16), m='white', bevel=0.014)
    p.box((0.4, 0.3, 0.06), loc=(0, 0, 0.35), m='gold')
    p.cyl(0.14, 0.24, 0.24, loc=(0, 0, 0.38), rot=(0, 0, pi / 4), m='dark', seg=4)
    p.box((0.3, 0.05, 0.008), loc=(0, 0, 0.625), m='lens')
    p.box((0.02, 0.46, 0.4), loc=(0.34, 0, 0.22), rot=(0, -0.2, 0), m='radiator')
    done(p)

    p = Part('inst_scatterometer')
    p.cyl(0.1, 0.12, 0.08, m='alu', seg=16)
    p.cyl(0.04, 0.04, 0.16, loc=(0, 0, 0.08), m='dark', seg=12)
    p.box((0.9, 0.09, 0.05), loc=(0, 0, 0.27), rot=(0, 0.35, 0), m='white')
    p.box((0.86, 0.06, 0.012), loc=(0.01, 0, 0.298), rot=(0, 0.35, 0), m='dark')
    done(p)

    p = Part('inst_sar_compact')
    p.box((0.24, 0.24, 0.08), loc=(0, 0, 0.04), m='alu')
    p.box((2.0, 0.6, 0.04), loc=(0, 0, 0.24), m='alu')
    for i in range(4):
        p.box((0.44, 0.52, 0.01), loc=(-0.72 + i * 0.48, 0, 0.265), m='white')
    for sx in (-1, 1):
        p.strut((sx * 0.08, 0, 0.08), (sx * 0.8, 0, 0.22), 0.016)
    done(p)

    p = Part('inst_alt_lidar')
    p.box((0.16, 0.14, 0.1), loc=(0, 0, 0.05), m='gold', bevel=0.006)
    p.cyl(0.06, 0.06, 0.18, loc=(0, 0, 0.1), m='white', seg=16)
    p.cyl(0.05, 0.05, 0.004, loc=(0, 0, 0.28), m='lens', seg=16)
    p.cyl(0.012, 0.012, 0.06, loc=(0.09, 0, 0.1), m='orange', seg=8)  # laser head
    done(p)

    p = Part('inst_alt_pro')
    p.cyl(0.12, 0.1, 0.1, m='alu', seg=14)
    dish(p, 0.5, 0.45, z0=0.11)
    for i in range(3):
        a = i * tau / 3
        p.strut((0.47 * cos(a), 0.47 * sin(a), 0.2), (0.03 * cos(a), 0.03 * sin(a), 0.43), 0.008, seg=6)
    p.cyl(0.045, 0.03, 0.06, loc=(0, 0, 0.4), m='alu', seg=10)
    p.box((0.2, 0.2, 0.18), loc=(0.55, 0.25, 0.09), m='gold', bevel=0.01)  # radiometer
    p.cyl(0.07, 0.05, 0.16, loc=(0.55, 0.25, 0.18), m='white', seg=14)
    done(p)

    p = Part('inst_sounder_lite')
    p.box((0.18, 0.16, 0.12), loc=(0, 0, 0.06), m='white', bevel=0.008)
    p.cyl(0.05, 0.05, 0.16, loc=(-0.08, 0, 0.15), rot=(0, pi / 2, 0), m='gold', seg=14)
    done(p)

    p = Part('inst_sounder_pro')
    p.box((0.62, 0.46, 0.38), loc=(0, 0, 0.19), m='white', bevel=0.016)
    p.cyl(0.14, 0.14, 0.46, loc=(-0.23, 0, 0.46), rot=(0, pi / 2, 0), m='gold', seg=20)
    p.box((0.3, 0.12, 0.02), loc=(0.05, 0, 0.6), m='lens')
    p.box((0.03, 0.4, 0.36), loc=(0.29, 0, 0.44), m='alu')
    p.box((0.02, 0.5, 0.42), loc=(0.38, 0, 0.26), rot=(0, -0.2, 0), m='radiator')
    done(p)

    p = Part('inst_gamma_suite')  # gamma-ray head on a 1.4 m boom
    p.box((0.24, 0.2, 0.16), loc=(0, 0, 0.08), m='gold', bevel=0.01)
    p.cyl(0.07, 0.07, 0.12, loc=(0.08, 0, 0.16), m='dark', seg=14)
    p.strut((0, 0, 0.16), (0, 0, 1.3), 0.018, seg=6)
    p.cyl(0.09, 0.09, 0.22, loc=(0, 0, 1.28), m='gold', seg=16)
    p.cyl(0.095, 0.095, 0.02, loc=(0, 0, 1.5), m='alu', seg=16)
    done(p)

    p = Part('inst_mag_chip')
    p.box((0.1, 0.07, 0.01), loc=(0, 0, 0.005), m='teal')
    p.box((0.03, 0.03, 0.012), loc=(0.01, 0, 0.016), m='black')
    for i in range(4):
        p.box((0.006, 0.02, 0.004), loc=(-0.035 + i * 0.008, -0.02, 0.012), m='gold')
    done(p)

    p = Part('inst_mag_pro')  # two sensors on a long boom
    p.cyl(0.05, 0.05, 0.08, m='alu', seg=10)
    for k in range(3):
        p.strut((0, 0, 0.08 + k * 1.0), (0, 0, 1.06 + k * 1.0), 0.02 - k * 0.003, seg=6)
        p.cyl(0.035, 0.035, 0.05, loc=(0, 0, 1.04 + k * 1.0), m='dark', seg=8)
    p.box((0.1, 0.1, 0.14), loc=(0, 0, 2.1), m='gold', bevel=0.01)
    p.box((0.12, 0.12, 0.16), loc=(0, 0, 3.12), m='gold', bevel=0.01)
    done(p)

    p = Part('inst_particles_lite')
    p.box((0.12, 0.1, 0.08), loc=(0, 0, 0.04), m='white', bevel=0.006)
    cone_to(p, (0, 0, 0.08), (0, 0, 0.16), 0.018, 0.034, 'dark')
    done(p)

    p = Part('inst_plasma_suite')
    p.box((0.4, 0.32, 0.22), loc=(0, 0, 0.11), m='white', bevel=0.012)
    p.cyl(0.1, 0.1, 0.06, loc=(-0.08, 0, 0.22), m='alu', seg=18)
    p.sphere(0.1, loc=(-0.08, 0, 0.28), m='gold', seg=16, scale=(1, 1, 0.55))  # top-hat analyser
    p.cyl(0.05, 0.05, 0.22, loc=(0.12, 0.06, 0.22), m='dark', seg=12)  # mass spectrometer
    for a in (-0.7, 0.0, 0.7):
        base = (0.12 + 0.05 * sin(a), -0.08, 0.22 + 0.05 * cos(a))
        tip = (0.12 + 0.15 * sin(a), -0.08, 0.22 + 0.15 * cos(a))
        cone_to(p, base, tip, 0.02, 0.04, 'dark')
    done(p)

    p = Part('inst_solar_xray')
    p.box((0.14, 0.12, 0.08), loc=(0, 0, 0.04), m='alu', bevel=0.006)
    p.cyl(0.035, 0.035, 0.12, loc=(0, 0, 0.08), m='gold', seg=14)
    p.cyl(0.03, 0.03, 0.004, loc=(0, 0, 0.2), m='black', seg=14)
    done(p)

    p = Part('inst_euv_imager')
    p.box((0.2, 0.2, 0.1), loc=(0, 0, 0.05), m='alu')
    p.cyl(0.1, 0.1, 0.6, loc=(0, 0, 0.1), m='white', seg=20)
    p.cyl(0.11, 0.11, 0.04, loc=(0, 0, 0.7), m='dark', seg=20)
    p.cyl(0.085, 0.085, 0.006, loc=(0, 0, 0.74), m='lens', seg=20)
    p.box((0.02, 0.24, 0.3), loc=(0.14, 0, 0.3), m='radiator')
    done(p)

    # ---- propulsion (exhaust leaves along +Z) ------------------------------
    p = Part('eng_coldgas')
    p.cyl(0.13, 0.13, 0.02, m='alu', seg=16)
    p.sphere(0.11, loc=(0, 0, 0.03), m='white', seg=16)
    for i in range(4):
        a = pi / 4 + i * pi / 2
        b = (0.19 * cos(a), 0.19 * sin(a), 0.0)
        cone_to(p, b, (b[0] * 1.2, b[1] * 1.2, 0.07), 0.012, 0.03, 'nozzle')
    done(p)

    p = Part('eng_mono')
    p.cyl(0.2, 0.2, 0.03, m='alu', seg=20)
    p.cyl(0.06, 0.045, 0.07, loc=(0, 0, 0.03), m='alu', seg=14)
    bell(p, 0.025, 0.1, 0.1, 0.18)
    for i in range(4):
        a = pi / 4 + i * pi / 2
        b = (0.15 * cos(a), 0.15 * sin(a), 0.03)
        cone_to(p, b, (b[0] * 1.3, b[1] * 1.3, 0.1), 0.012, 0.028, 'nozzle')
    done(p)

    p = Part('eng_biprop')
    p.cyl(0.26, 0.26, 0.03, m='alu', seg=24)
    for i in range(6):
        a = i * tau / 6
        p.strut((0.24 * cos(a), 0.24 * sin(a), 0.03), (0.08 * cos(a), 0.08 * sin(a), 0.2), 0.012, seg=6)
    p.cyl(0.08, 0.06, 0.12, loc=(0, 0, 0.14), m='alu', seg=16)
    bell(p, 0.045, 0.27, 0.26, 0.46)
    p.sphere(0.09, loc=(0.2, 0, 0.11), m='gold', seg=14)
    p.sphere(0.09, loc=(-0.2, 0, 0.11), m='gold', seg=14)
    done(p)

    p = Part('eng_ion')
    p.cyl(0.2, 0.2, 0.03, m='alu', seg=24)
    p.cyl(0.17, 0.19, 0.2, loc=(0, 0, 0.03), m='white', seg=24)
    p.cyl(0.2, 0.2, 0.025, loc=(0, 0, 0.23), m='alu', seg=24)
    p.cyl(0.155, 0.155, 0.012, loc=(0, 0, 0.25), m='glow', seg=24)
    p.cyl(0.02, 0.02, 0.1, loc=(0.2, 0, 0.17), m='alu', seg=8)
    done(p)

    # ---- attitude control and spares ---------------------------------------
    p = Part('adcs_startracker')
    for s in (-1, 1):
        p.box((0.09, 0.09, 0.08), loc=(s * 0.1, 0, 0.04), m='white')
        cone_to(p, (s * 0.1, 0, 0.08), (s * 0.17, 0, 0.22), 0.035, 0.06, 'dark', seg=12)
    done(p)

    p = Part('adcs_torquer')
    p.strut((-0.16, 0, 0.03), (0.16, 0, 0.03), 0.014, m='gold')
    p.strut((0, -0.16, 0.06), (0, 0.16, 0.06), 0.014, m='gold')
    p.strut((0.12, 0.12, 0), (0.12, 0.12, 0.3), 0.014, m='gold')
    done(p)

    p = Part('adcs_wheels')
    p.box((0.26, 0.26, 0.03), loc=(0, 0, 0.015), m='alu')
    for i in range(4):
        a = pi / 4 + i * pi / 2
        b = (0.07 * cos(a), 0.07 * sin(a), 0.03)
        cone_to(p, b, (b[0] * 1.5, b[1] * 1.5, 0.08), 0.055, 0.055, 'dark', seg=14)
    done(p)

    p = Part('rcs')  # attitude thruster quad for a corner of the bus; the nozzles point along +X and +-Z
    p.box((0.07, 0.07, 0.07), m='alu')
    for v in ((1, 0, 0), (0, 0, 1), (0, 0, -1), (0.7, 0.7, 0)):
        base = (v[0] * 0.035, v[1] * 0.035, v[2] * 0.035)
        cone_to(p, base, (v[0] * 0.075, v[1] * 0.075, v[2] * 0.075), 0.008, 0.02, 'nozzle')
    done(p)

    p = Part('adapter')  # launch adapter ring left on the spacecraft, 1 m across
    p.lathe([(0.5, 0.0), (0.5, 0.06), (0.44, 0.06), (0.44, 0.0), (0.5, 0.0)], m='alu', seg=32)
    for i in range(8):
        a = i * tau / 8
        p.box((0.05, 0.03, 0.05), loc=(0.47 * cos(a), 0.47 * sin(a), 0.085), rot=(0, 0, a), m='dark')
    done(p)

    p = Part('sunsensor')
    p.box((0.05, 0.05, 0.02), loc=(0, 0, 0.01), m='alu')
    p.cyl(0.015, 0.015, 0.006, loc=(0, 0, 0.02), m='lens', seg=10)
    done(p)

    p = Part('spare')  # the visible half of a redundant set
    p.box((0.26, 0.18, 0.12), loc=(0, 0, 0.06), m='white', bevel=0.01)
    p.box((0.27, 0.04, 0.125), loc=(0, 0, 0.0625), m='orange')
    done(p)

    return coll


if __name__ == '__main__':
    scene = mf.work_scene()
    coll = build(scene)
    out = os.path.normpath(os.path.join(HERE, '..', '..', 'public', 'models', 'kit.glb'))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    mf.export_glb(coll, out)
    print('kit:', len(coll.objects), 'parts ->', out, os.path.getsize(out) // 1024, 'KB')
