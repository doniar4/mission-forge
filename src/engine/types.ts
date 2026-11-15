/** Bilingual string. Every player-facing text in the engine is stored this way. */
export type L = { ru: string; en: string };

export type OrbitId = 'leo' | 'sso' | 'geo' | 'llo' | 'elo' | 'l1' | 'lmo' | 'emo';
export type GroundId = 'own' | 'network' | 'dsn';
export type Body = 'earth' | 'moon' | 'mars' | 'sun';
export type Difficulty = 'cadet' | 'engineer' | 'director';
export type Role = 'manager' | 'science' | 'engineer' | 'comms';
export type Level = 1 | 2 | 3;

/** Kinds of measurement a mission objective can ask for. */
export type Measure =
  | 'visible'
  | 'thermal'
  | 'multispectral'
  | 'radar'
  | 'altimetry'
  | 'atmosphere'
  | 'composition'
  | 'topography'
  | 'magnetic'
  | 'particles'
  | 'solar';

export interface Orbit {
  id: OrbitId;
  body: Body;
  name: L;
  altitude: L;
  desc: L;
  /** Share of the rocket's low-Earth-orbit capacity that reaches this destination. */
  capFactor: number;
  /** Velocity change (m/s) the spacecraft itself must provide to enter the orbit. */
  insertionDv: number;
  /** m/s per year to hold the orbit. */
  stationDv: number;
  /** m/s to dispose of the spacecraft responsibly at end of life. */
  disposalDv: number;
  /** Years until the orbit decays if it is not maintained (null = stable). */
  decayYears: number | null;
  /** Share of each orbit spent in sunlight. */
  sunFraction: number;
  /** Longest eclipse, hours. */
  eclipseHours: number;
  /** Sunlight intensity relative to Earth. */
  solarFactor: number;
  radiation: Level;
  /** Radio link data-rate multiplier relative to low Earth orbit. */
  commsFactor: number;
  /** Contact hours per day for each ground option. */
  contact: Record<GroundId, number>;
  transitMonths: number;
  /** Extra transit months when low-thrust electric propulsion is used. */
  lowThrustMonths: number;
  /** Is there a planetary magnetic field for magnetorquers to push against? */
  magnetic: boolean;
  /** Heater power needed to survive the cold, W. */
  heaterW: number;
  /** Operations team cost, $M per year. */
  opsPerYear: number;
}

export interface Part {
  id: string;
  name: L;
  desc: L;
  mass: number;
  /** Power consumed, W. */
  power: number;
  cost: number;
  /** Hidden on the easiest difficulty. */
  advanced?: boolean;
  /** Months added to development. */
  devMonths?: number;
}

export interface Instrument extends Part {
  /** Class: 1 entry-level, 2 standard, 3 professional. */
  tier: Level;
  /** Raw data produced, GB per day. */
  data: number;
  /** Quality (0..1) for every measurement this instrument can make. */
  measures: Partial<Record<Measure, number>>;
  /** Pointing accuracy it needs. */
  pointing: Level;
  devMonths: number;
}

export interface PowerSource extends Part {
  /** Output in full sunlight at Earth distance (or constant output for an RTG). */
  watts: number;
  solar: boolean;
}

export interface Battery extends Part {
  wh: number;
}

export interface Antenna extends Part {
  /** Data rate at low Earth orbit with a standard ground station, Mbit/s. */
  mbps: number;
  pointing: Level;
  /** Share of passes that actually work (lasers are blocked by clouds). */
  availability: number;
}

export interface Ground {
  id: GroundId;
  name: L;
  desc: L;
  setupCost: number;
  yearlyCost: number;
  /** Receiving-dish gain multiplier. */
  gain: number;
}

export interface Computer extends Part {
  storage: number;
  radTol: Level;
  /** Multiplier applied to data volume by onboard processing. */
  compression: number;
}

export interface Adcs extends Part {
  pointing: Level;
  magneticOnly: boolean;
}

export interface Propulsion extends Part {
  /** Specific impulse, s (0 = no engine). */
  isp: number;
  maxProp: number | null;
  /** Electrical power needed while thrusting, W. */
  needsWatts: number;
  lowThrust: boolean;
}

export interface Structure {
  id: string;
  name: L;
  desc: L;
  /** Structure mass as a share of everything it has to carry. */
  fraction: number;
  baseCost: number;
  costPerKg: number;
  advanced?: boolean;
}

export interface Vehicle {
  id: string;
  name: L;
  desc: L;
  leoKg: number;
  /** Price of the launch, $M; for a rideshare, the price of the first `baseKg`. */
  cost: number;
  /** Rideshare only: kilograms included in `cost`, and the price of each kilogram beyond, $M. */
  baseKg?: number;
  costPerKg?: number;
  reliability: number;
  reach: OrbitId[];
  leadMonths: number;
  advanced?: boolean;
}

export interface Testing {
  id: 'minimal' | 'standard' | 'extensive';
  name: L;
  desc: L;
  cost: number;
  months: number;
  failFactor: number;
}

export interface Scenario {
  id: string;
  body: Body;
  stars: Level;
  name: L;
  tagline: L;
  brief: L;
  /** $M at the "engineer" difficulty. */
  budget: number;
  /** Months available for development before launch. */
  deadlineMonths: number;
  /** Years of operation the science team is asking for. */
  targetYears: number;
  /** How much each measurement matters. Sums to 1. */
  weights: Partial<Record<Measure, number>>;
  /** Orbits that can serve this objective, with how well they fit and why. */
  orbits: Partial<Record<OrbitId, { fit: number; note: L }>>;
  sandbox?: boolean;
}

export interface Design {
  orbit: OrbitId | null;
  instruments: string[];
  power: string;
  battery: string;
  comms: string;
  ground: GroundId;
  computer: string;
  adcs: string;
  propulsion: string;
  structure: string;
  redundancy: 'single' | 'redundant';
  testing: Testing['id'];
  vehicle: string | null;
  lifeYears: number;
  /** Development events drawn when the design went into production, and the choices made (engine/development.ts). */
  dev?: DevRecord;
}

export type DevKind = 'mass' | 'budget' | 'delay' | 'power' | 'test' | 'gift';

export interface DevEvent {
  kind: DevKind;
  /** What the event is about: an instrument id (mass, gift) or a part kind (delay: comms, power, adcs). */
  target?: string;
  /** How bad it is: a share (mass growth, budget cut, power loss), months (delay) or a risk factor (test). */
  size: number;
  /** Who decides in a team. */
  role: Role;
}

export interface DevRecord {
  seed: number;
  events: DevEvent[];
  /** The option chosen for each event, null while undecided. */
  choices: (string | null)[];
}

export interface Check {
  id: string;
  /** blocker = the review board will not let this fly. */
  level: 'blocker' | 'warn';
  role: Role;
  title: L;
  why: L;
}

export interface Evaluation {
  mass: {
    payload: number;
    bus: number;
    structure: number;
    dry: number;
    propellant: number;
    wet: number;
    capacity: number;
    /** (capacity - wet) / capacity */
    margin: number;
  };
  power: {
    busLoad: number;
    instLoad: number;
    load: number;
    /** Orbit-average generation at start and at end of design life. */
    average: number;
    averageEol: number;
    margin: number;
    eclipseNeedWh: number;
    batteryWh: number;
  };
  data: {
    generated: number;
    downlink: number;
    rateMbps: number;
    contactHours: number;
    storage: number;
    storageNeed: number;
    returnFraction: number;
  };
  cost: {
    payload: number;
    bus: number;
    launch: number;
    ground: number;
    ops: number;
    dev: number;
    testing: number;
    total: number;
    budget: number;
    margin: number;
  };
  time: {
    devMonths: number;
    deadline: number;
    transitMonths: number;
    lifeYears: number;
    /** Life actually achievable (orbit decay can cut it short). */
    effectiveYears: number;
  };
  dv: { insertion: number; station: number; disposal: number; total: number; disposalOk: boolean };
  science: {
    quality: Partial<Record<Measure, number>>;
    orbitFit: number;
    ratePerYear: number;
    target: number;
    /** Projected science as a share of the target, before anything goes wrong. */
    projected: number;
    /**
     * The honest forecast: a likely range, not a promise. Wide while development is ahead
     * (instruments may grow, budgets may shrink) and narrower once it is done; flight risks
     * (launch, failures) pull the low end down.
     */
    range: [number, number];
  };
  launchReliability: number;
  checks: Check[];
  blockers: number;
}

export interface SimEvent {
  month: number;
  kind: 'good' | 'info' | 'warn' | 'bad';
  title: L;
  text: L;
}

export interface MonthRecord {
  /** Months since launch. */
  t: number;
  phase: 'transit' | 'ops';
  /** Share of instrument power demand that was met. */
  power: number;
  /** Share of produced data that reached Earth. */
  data: number;
  /** Cumulative science as a share of target. */
  science: number;
}

/** A decision the mission team has to take in flight. */
export type CrisisKind = 'storm' | 'drift' | 'budget' | 'outage' | 'debris';
export interface Crisis {
  id: string;
  kind: CrisisKind;
  /** Month since launch (as in MonthRecord.t) when the decision comes up. */
  month: number;
  options: string[];
  /** The option this flight was simulated with. */
  chosen: string;
  /** True when nobody chose and the cautious default was taken. */
  defaulted: boolean;
  /** For an instrument problem: which instrument. */
  instrument?: L;
}
/** Decisions taken so far, by crisis id. */
export type Choices = Record<string, string>;

export interface SimResult {
  seed: number;
  crises: Crisis[];
  months: MonthRecord[];
  events: SimEvent[];
  lost: { month: number; cause: L } | null;
  launchFailed: boolean;
  monthsOperated: number;
  plannedMonths: number;
  dataGenerated: number;
  dataReturned: number;
  sciencePct: number;
  outcome: 'success' | 'partial' | 'failure';
}

export interface ScoreLine {
  id: string;
  label: L;
  points: number;
  max: number;
}

export interface Insight {
  kind: 'good' | 'warn' | 'bad';
  title: L;
  text: L;
}

export interface Report {
  lines: ScoreLine[];
  total: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  insights: Insight[];
}
