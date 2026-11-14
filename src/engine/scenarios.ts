import { MEASURES, ORBITS } from './catalog';
import type { Design, Measure, OrbitId, Scenario } from './types';

const allMeasures = Object.keys(MEASURES) as Measure[];

export const SCENARIOS: Scenario[] = [
  {
    id: 'firewatch',
    body: 'earth',
    stars: 1,
    name: { ru: 'Пожарный дозор', en: 'Fire Watch' },
    tagline: { ru: 'Находить лесные пожары раньше, чем их заметят с земли', en: 'Spot wildfires before anyone on the ground does' },
    brief: {
      ru: 'Служба охраны лесов просит спутник, который находит очаги возгорания по теплу и показывает, куда движется огонь. Главное — тепловая съёмка; цветные и многоспектральные снимки помогают оценить ущерб.',
      en: 'The forest service wants a satellite that finds fires by their heat and shows where the flames are heading. Thermal imaging matters most; colour and multispectral images help assess the damage.',
    },
    budget: 106,
    deadlineMonths: 40,
    targetYears: 3,
    weights: { thermal: 0.55, multispectral: 0.25, visible: 0.2 },
    orbits: {
      sso: { fit: 1, note: { ru: 'Видит всю планету, включая северные леса, всегда в одно и то же время суток.', en: 'Sees the whole planet, northern forests included, always at the same time of day.' } },
      leo: { fit: 0.72, note: { ru: 'Детальные снимки, но тайга севернее 52° остаётся без наблюдения.', en: 'Detailed images, but forests north of 52° go unwatched.' } },
      geo: { fit: 0.75, note: { ru: 'Замечает пожар за минуты, но только на одном полушарии и без мелких деталей.', en: 'Catches a fire within minutes, but only on one hemisphere and without fine detail.' } },
    },
  },
  {
    id: 'ocean',
    body: 'earth',
    stars: 2,
    name: { ru: 'Пульс океана', en: 'Ocean Pulse' },
    tagline: { ru: 'Семь лет следить за уровнем моря и погодой над ним', en: 'Track sea level and the weather above it for seven years' },
    brief: {
      ru: 'Климатологам нужен длинный непрерывный ряд измерений: уровень моря с точностью до сантиметров, профили атмосферы и радарные снимки льдов. Ценность данных растёт с каждым годом работы — аппарат должен прожить долго.',
      en: 'Climate scientists need a long unbroken record: sea level to the centimetre, atmosphere profiles and radar images of ice. The data grows more valuable with every year, so the spacecraft has to last.',
    },
    budget: 156,
    deadlineMonths: 48,
    targetYears: 7,
    weights: { altimetry: 0.45, atmosphere: 0.3, radar: 0.25 },
    orbits: {
      leo: { fit: 0.9, note: { ru: 'Покрывает почти весь океан, но за 7 лет атмосфера «съест» орбиту без двигателя.', en: 'Covers nearly all the ocean, but over 7 years drag will eat the orbit unless you have an engine.' } },
      sso: { fit: 1, note: { ru: 'Видит и полярные льды. По окончании миссии аппарат обязан сойти с орбиты.', en: 'Sees the polar ice too. The spacecraft must be deorbited when the mission ends.' } },
      geo: { fit: 0.15, note: { ru: 'С 36 000 км высотомер и радар почти бесполезны.', en: 'From 36,000 km an altimeter and a radar are almost useless.' } },
    },
  },
  {
    id: 'lunarice',
    body: 'moon',
    stars: 2,
    name: { ru: 'Лунный лёд', en: 'Lunar Ice' },
    tagline: { ru: 'Составить карту водяного льда у полюсов Луны', en: 'Map the water ice near the Moon’s poles' },
    brief: {
      ru: 'Будущей лунной базе нужна вода. Найдите лёд в вечно затенённых кратерах: определите состав грунта, постройте карту рельефа для посадки и снимите подходы к кратерам.',
      en: 'A future Moon base needs water. Find the ice in permanently shadowed craters: identify what the soil is made of, map the terrain for landing and image the approaches.',
    },
    budget: 168,
    deadlineMonths: 48,
    targetYears: 2,
    weights: { composition: 0.5, topography: 0.3, visible: 0.2 },
    orbits: {
      llo: { fit: 1, note: { ru: 'Приборы в 100 км от льда и над полюсом на каждом витке.', en: 'Instruments 100 km from the ice and over the pole on every orbit.' } },
      elo: { fit: 0.6, note: { ru: 'Экономит топливо, но издалека приборы различают меньше.', en: 'Saves fuel, but from far away the instruments make out less.' } },
    },
  },
  {
    id: 'sentinel',
    body: 'sun',
    stars: 2,
    name: { ru: 'Солнечный страж', en: 'Solar Sentinel' },
    tagline: { ru: 'Предупреждать Землю о солнечных бурях', en: 'Warn Earth about solar storms' },
    brief: {
      ru: 'Солнечные бури выводят из строя энергосети и спутники. Нужен часовой, который измеряет солнечный ветер и его магнитное поле и следит за выбросами плазмы. Предупреждение бесполезно, если пришло с опозданием: данные должны идти на Землю без пропусков.',
      en: 'Solar storms knock out power grids and satellites. We need a sentry that measures the solar wind and its magnetic field and watches for plasma eruptions. A late warning is worthless: the data must reach Earth without gaps.',
    },
    budget: 184,
    deadlineMonths: 46,
    targetYears: 5,
    weights: { particles: 0.35, magnetic: 0.3, solar: 0.35 },
    orbits: {
      l1: { fit: 1, note: { ru: 'Солнечный ветер проходит здесь за час до Земли.', en: 'The solar wind passes here an hour before it reaches Earth.' } },
      geo: { fit: 0.35, note: { ru: 'Внутри магнитного щита Земли: ветер виден уже после удара.', en: 'Inside Earth’s magnetic shield: you see the wind only after it has hit.' } },
    },
  },
  {
    id: 'marsweather',
    body: 'mars',
    stars: 3,
    name: { ru: 'Погода Красной планеты', en: 'Red Planet Weather' },
    tagline: { ru: 'Научиться предсказывать пылевые бури Марса', en: 'Learn to forecast Martian dust storms' },
    brief: {
      ru: 'Перед полётом людей нужно понять марсианскую погоду: профили атмосферы, температуру поверхности, снимки бурь и то, как солнечный ветер сдувает воздух планеты. До Марса 8 месяцев пути, Солнце светит вдвое слабее, а сигнал — в тысячи раз тише.',
      en: 'Before people go, we must understand Martian weather: atmosphere profiles, surface temperature, storm images and how the solar wind strips the planet’s air. Mars is 8 months away, sunlight is half as strong and the signal thousands of times fainter.',
    },
    budget: 270,
    deadlineMonths: 50,
    targetYears: 3,
    weights: { atmosphere: 0.45, thermal: 0.2, visible: 0.2, magnetic: 0.15 },
    orbits: {
      lmo: { fit: 1, note: { ru: 'Детальные профили атмосферы, но торможение удваивает массу аппарата.', en: 'Detailed atmosphere profiles, but braking doubles the spacecraft’s mass.' } },
      emo: { fit: 0.65, note: { ru: 'Видна вся планета разом, топлива вдвое меньше, деталей тоже.', en: 'The whole planet at a glance, half the fuel — and half the detail.' } },
    },
  },
  {
    id: 'sandbox',
    body: 'earth',
    stars: 1,
    sandbox: true,
    name: { ru: 'Песочница', en: 'Sandbox' },
    tagline: { ru: 'Любая орбита, любые приборы, почти без ограничений', en: 'Any orbit, any instruments, almost no limits' },
    brief: {
      ru: 'Свободный режим для экспериментов: все орбиты и компоненты открыты, бюджет огромен, сроков нет. Законы физики остаются в силе.',
      en: 'Free play for experiments: every orbit and component is open, the budget is huge and there is no deadline. The laws of physics still apply.',
    },
    budget: 3000,
    deadlineMonths: 240,
    targetYears: 3,
    weights: Object.fromEntries(allMeasures.map((m) => [m, 1 / allMeasures.length])),
    orbits: Object.fromEntries(
      ORBITS.map((o) => [o.id, { fit: 1, note: { ru: 'В песочнице подходит любая орбита.', en: 'Any orbit works in the sandbox.' } }]),
    ) as Scenario['orbits'],
  },
];

export const scenarioById = (id: string): Scenario => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];

export const scenarioOrbits = (sc: Scenario): OrbitId[] => Object.keys(sc.orbits) as OrbitId[];

/** The cheapest possible starting point: the player builds up from here. */
export function emptyDesign(sc: Scenario): Design {
  return {
    orbit: null,
    instruments: [],
    power: 'body',
    battery: 'b100',
    comms: 'uhf',
    ground: 'own',
    computer: 'basic',
    adcs: 'magnetic',
    propulsion: 'none',
    structure: 'aluminium',
    redundancy: 'single',
    testing: 'standard',
    vehicle: null,
    lifeYears: sc.targetYears,
  };
}
