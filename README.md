# Mission Forge

An educational simulator: design a space mission, launch it, and find out why it worked — or didn't.

**Play it:** https://mission-forge-three.vercel.app · NASA Space Apps Challenge 2026 · Team Try2Fly (Oral, Kazakhstan)

The player gets a brief from a "customer" (spot wildfires, map lunar ice, forecast Martian weather), then picks an orbit, science instruments, a power source, comms, an engine and a rocket, and watches the spacecraft come together in 3D. Then comes the flight: countdown, lift-off, staging, fairing jettison, orbit insertion, the transfer and years of work at the target. Every choice has a price: an instrument adds science but brings mass, power, data and cost with it. After the flight the game explains in plain words which decisions worked, and compares the spacecraft with a real NASA mission that did the same job (Landsat 9, Sentinel-6 Michael Freilich, Lunar Trailblazer, ACE, MAVEN), with a source for every number. The interface is in English by default, with Russian one click away.

## What's in the game

- **A training flight** that walks a first-time player through every step, with a generous budget and an easy objective.
- **30 science instruments in three classes**: entry (cheap and light, about half the objective), standard (meets the objective) and professional (best quality for more mass, power, data and money).
- **Five missions and a sandbox**: Earth orbit, the Moon, the Sun–Earth L1 point and Mars, on three difficulty levels.
- **The hangar**: the spacecraft in full-screen 3D above its destination. Parts are picked one by one with arrows or from "All options". Hovering a part tries it on the spacecraft at once, and its card shows what it changes for the whole spacecraft: mass, power and cost. How much science a design returns is not shown before launch — that is what the flight is for. The camera flies to the part you are working on.
- **Seven build steps**: objective, orbit, instruments, power, platform, comms, launch.
- **Budgets in plain sight**: mass, power, data, money and development time update with every change, with the design's weakest point above them and a link to the right section. For a couple of seconds each gauge shows how far the last choice moved it.
- **"Next step" hint**: one required fix in plain words, with a button to the right section.
- **Review board**: blockers keep the mission on the ground; risks let it fly, and their consequences show up in flight.
- **Concept maturity on JPL's scale (CML 1–4)**: the hangar shows how far the design has got, from a "cocktail napkin" idea to a point design the review board will pass. Development after that is labelled as NASA Phases C–D.
- **Development**: three quarters of surprises before launch — heavier parts, weaker arrays, late suppliers, budget cuts — each paid for with mass, money or time.
- **3D flight simulator**:
  - the launch complex, a go/no-go poll by role and the countdown;
  - a physics-based ascent (thrust, gravity, drag, falling mass): lift-off, max Q, booster and stage separation, fairing jettison, orbit at 7.8 km/s;
  - live telemetry — altitude, speed, g-load, propellant per stage — and an explanation of each event as it happens;
  - spacecraft separation and array deployment, the transfer to the Moon, Mars or L1, the braking burn;
  - work in orbit: the planet's shadow draining the battery, ground passes filling and emptying storage, an imaging swath that paints the planet only where the orbit reaches;
  - two cameras — beside the spacecraft and the whole orbit; the scene can be rotated.
- **Decisions in flight**: mid-mission the game pauses on one of five kinds of decision — a solar storm, calibration drift, a budget cut, a ground-station outage, a debris approach. Each has a cautious and a bold option; the decision re-flies the mission and shows up in the debrief. Long missions meet up to three.
- **Power and data telemetry**: in flight, a live trace of battery charge and storage with shadow and ground-pass bands; in the debrief, the battery over one orbit and storage over one day.
- **Debrief**: a score made of seven parts, a grade, a plain-language "why it went this way" and the comparison with the real NASA mission: mass, power, design life, cost, orbit and payload, a takeaway and source links.
- **Records table**, saving designs and a link that opens your design on someone else's screen.
- **Team play for four**: a room by code or link, four roles, one per player (mission manager, science lead, systems engineer, comms and data engineer). Each role edits only its own sections and has its own goals, which pull the design apart. The mission launches when everyone signs off; the flight and score are the same on every screen. In flight every decision is a 30-second team vote; the majority wins, and in a tie the decision's lead role has the casting vote. Connects over the internet (PeerJS/WebRTC) or between tabs of one browser.
- **Optional accounts** (Supabase): sign in to keep one account across devices.

Without WebGL, or with "reduce motion" switched on, the game shows flat diagrams instead of 3D scenes.

## NASA resources used

Every number the game compares against comes from a cited source; the links are also shown in the debrief.

| Resource | How the game uses it |
|---|---|
| NASA mission pages and fact sheets: [Landsat 9](https://science.nasa.gov/mission/landsat-9), [Sentinel-6 Michael Freilich](https://www.jpl.nasa.gov/news/press_kits/sentinel-6/facts/), [Lunar Trailblazer](https://science.nasa.gov/mission/lunar-trailblazer-fact-sheet), [ACE](https://science.nasa.gov/mission/ace), [MAVEN](https://science.nasa.gov/mission/maven) | The real counterpart of each mission in the debrief: launch mass, power, design life, cost, orbit and payload (`src/engine/realMissions.ts`). |
| [CRS report R46560](https://www.everycrsreport.com/reports/R46560.html) | Landsat 9 life-cycle cost. |
| JPL Concept Maturity Levels (Wessen et al., IEEE Aerospace Conference, 2013) | The CML 1–4 scale shown in the hangar (`src/engine/maturity.ts`). |
| NASA project life cycle, [NASA Systems Engineering Handbook (SP-2016-6105 Rev2)](https://www.nasa.gov/reference/systems-engineering-handbook/) | Development is labelled as Phases C–D: final design, build and test. |

Catalogue prices and masses were fact-checked in November 2026 against NASA, JPL and ESA pages and published launch prices.

## AI & tooling disclosure

- **What the team did:** the concept, the game design, the choice of missions and numbers, testing and every decision about what ships.
- **AI assistance:** parts of the code, documentation and the pitch deck were drafted with an AI coding assistant (Claude, by Anthropic, used through Claude Code) under the team's direction. All of it was reviewed by the team and is covered by the automated tests (`npm test`).
- **No AI in the game itself:** the simulation is deterministic code; no player data or text is sent to an AI service.
- **No AI-generated data:** mission figures come from the sources above, not from a model. 3D models are generated by our own Blender scripts (see below); there are no AI-generated images in the game.
- **Other tools:** React, TypeScript, Vite, three.js, PeerJS, Supabase, Blender, Canva (pitch deck).

## For collaborators and AI models

- [docs/HANDOFF.md](docs/HANDOFF.md) — the full description: every module and function, formulas, 3D scenes, the team-play protocol, principles, known issues and tasks with acceptance criteria (in Russian).
- [AGENTS.md](AGENTS.md) — the short mandatory rules for working on the code.
- [docs/PLAN.md](docs/PLAN.md) — the roadmap and next tasks.

## Running it

Needs Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173). The server also listens on the local network: the `http://192.168.x.x:5173` address from the `Network` line opens on phones and laptops on the same Wi-Fi, and the team-play invite link points there.

```bash
npm test        # tests of the engine, the ascent and the flight
npm run build   # type check and build into dist/
```

## Accounts (Supabase)

Accounts are optional: without one the game works fully, and designs and records are kept in the browser. Sign-in and sign-up work out of the box, with no `.env` files: the Supabase project URL and its publishable key are set in `src/auth/supabase.ts` (`PROJECT_URL`, `PUBLISHABLE_KEY`).

- The Supabase publishable key is public by design and limited by Row Level Security. Never put the secret key (`service_role`, `sb_secret_…`) in the code.
- A build can point at another project with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (for example in the Vercel project settings). They take precedence over the built-in values and are baked in at build time, so changing them needs a new deploy.
- In Supabase, **Authentication → URL Configuration**: *Site URL* and *Redirect URLs* must list the addresses the game opens from (`http://localhost:5173`, the local-network address, the Vercel address) — confirmation and password-reset emails link there.

## How the code is organised

```
src/
  engine/            the simulation core, with no UI dependencies
    types.ts         types: orbit, component, design, result
    catalog.ts       orbits, instruments, components, rockets, difficulty levels
    scenarios.ts     missions: objective, budget, deadline, suitable orbits
    evaluate.ts      mass, power, data, money and time budgets + review-board findings
    simulate.ts      the flight month by month, with a deterministic random generator
    ascent.ts        the climb to orbit: second-by-second integration, launch events
    report.ts        the score and the explanation of the result
    design.ts        sanitize(): brings any design to a valid state
    team.ts          the team-play referee and each role's goals
    *.test.ts        tests of physics, balance, ascent and team logic
  flight/            the flight on screen
    director.ts      phases: launch → ascent → deployment → transfer → burn → operations
    notes.ts         what each launch event means and why it happens
  three/             3D scenes (three.js), loaded only when needed
    assets.ts        model loading and shared materials
    craft.ts         builds the spacecraft from the player's design
    rocket.ts        the rocket by stages and the launch complex
    planet.ts        Earth, the Moon and Mars — drawn by shaders, no photographs
    orbits.ts        geometry of the working orbits
    fx.ts            engine plume, smoke, sky, terrain around the pad
    CraftStage.ts    the hangar scene
    FlightStage.ts   the flight scene
    HeroStage.ts     the rocket on the home page
    AuthStage.ts     Earth from orbit behind the sign-in page
  team/              networking: PeerJS and BroadcastChannel, rooms
  ui/                screens: home, lobby, hangar, flight, debrief
  store.ts           game state (zustand), browser saves, design links
  i18n.ts            English/Russian switch
public/models/       models: spacecraft parts, rockets, the launch complex (glTF)
tools/blender/       the scripts that generated those models in Blender
```

The core is pure functions: `evaluate(design, scenario, difficulty)` returns every budget and finding, `simulate(design, scenario, difficulty, seed)` the whole flight history, `simulateAscent(vehicle, load)` the ascent trajectory. The same `seed` always gives the same flight, so in team play the host sends only the design and a number, and every screen computes the flight itself. The 3D scenes decide nothing: they show what the core has already computed.

## Models and images

All 3D models are original: they are generated in Blender by the scripts in `tools/blender/` (`mf_common.py`, `build_kit.py`, `build_rockets.py`) and exported to `public/models/`. The pictures on part, mission and orbit cards (`public/thumbs/`, 83 of them, including all 30 instruments in three classes) are rendered in Blender by `render_thumbs.py`:

```bash
blender -b --gpu-backend opengl tools/blender/mission-forge-assets.blend --python tools/blender/render_thumbs.py
```

(`--gpu-backend opengl`: on the Vulkan backend, background rendering in Blender 5.3 sometimes crashes.) To rebuild them, open Blender (tested with 5.3) and run `build_kit.py` and `build_rockets.py` (each twice on the first run: the first run creates the working scene). The source scene is `tools/blender/mission-forge-assets.blend`.

The planets are drawn by shaders. The only external data is Earth's land outline from Natural Earth (public domain), via the [world-atlas](https://github.com/topojson/world-atlas) package. There are no photographs, third-party models or logos in the game.

## How realistic it is

The numbers are simplified, but the proportions are real:

- Propellant follows the Tsiolkovsky rocket equation, including tank mass.
- The ascent is integrated second by second: the rocket lifts off at a thrust-to-weight of about 1.36, passes max Q at 10–14 km, the first stage burns for about three minutes and the second takes the spacecraft to 7.8 km/s at 200 km. The heavier the spacecraft for its rocket, the less propellant is left in the second stage.
- Solar arrays give power only in sunlight, and weaken with distance from the Sun (43% at Mars) and with age. Deployable arrays deliver 50–67 W/kg, as real rigid arrays do.
- Data returned is the link rate times the contact time with ground stations.
- Magnetorquers work only in Earth's magnetic field.
- In sun-synchronous orbit the spacecraft must be deorbited at the end of its mission.
- Orbit sizes and inclinations in 3D are real: the imaging swath from a 52° low orbit never reaches the poles, while a sun-synchronous one covers the whole planet.

Deliberate simplifications: the fall of the radio link with distance is compressed (in reality it is far steeper and is made up for by huge ground dishes); time in the 3D scenes is compressed — an orbit takes under a minute and ground passes are shown as stylised overflights; the distance to Mars is shortened so the planets fit in one frame.

The rockets and services in the game are fictional, each with its real counterpart named for reference: Kolibri ≈ Rocket Lab Electron (300 kg for about $7.5M), Vector ≈ Firefly Alpha or Vega-C, Atlant ≈ a medium launcher such as Soyuz-2 or Antares, Titan-X ≈ SpaceX Falcon 9 (about $70M), the rideshare slot ≈ SpaceX Transporter and Bandwagon ($350k for the first 50 kg, $7k per kg after).
