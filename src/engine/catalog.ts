import type {
  Adcs,
  Antenna,
  Battery,
  Computer,
  Difficulty,
  Ground,
  GroundId,
  Instrument,
  L,
  Measure,
  Orbit,
  OrbitId,
  PowerSource,
  Propulsion,
  Structure,
  Testing,
  Vehicle,
} from './types';

/*
 * The numbers below are simplified but keep real-world proportions:
 * masses in kg, power in W, cost in $M, data in GB/day.
 * Radio link factors are compressed for playability — the real drop with
 * distance is far steeper and is compensated by enormous ground dishes.
 */

export const MEASURES: Record<Measure, L> = {
  visible: { ru: 'Снимки в видимом свете', en: 'Visible imagery' },
  thermal: { ru: 'Тепловая съёмка', en: 'Thermal imaging' },
  multispectral: { ru: 'Многоспектральная съёмка', en: 'Multispectral imaging' },
  radar: { ru: 'Радарная съёмка', en: 'Radar imaging' },
  altimetry: { ru: 'Высота поверхности', en: 'Surface height' },
  atmosphere: { ru: 'Состав и профиль атмосферы', en: 'Atmosphere profile' },
  composition: { ru: 'Состав грунта', en: 'Surface composition' },
  topography: { ru: 'Рельеф', en: 'Topography' },
  magnetic: { ru: 'Магнитное поле', en: 'Magnetic field' },
  particles: { ru: 'Заряженные частицы', en: 'Charged particles' },
  solar: { ru: 'Наблюдение Солнца', en: 'Solar imaging' },
};

const contact = (own: number, network: number, dsn: number): Record<GroundId, number> => ({ own, network, dsn });

export const ORBITS: Orbit[] = [
  {
    id: 'leo',
    body: 'earth',
    name: { ru: 'Низкая околоземная', en: 'Low Earth orbit' },
    altitude: { ru: '500 км, наклон 52°', en: '500 km, 52° inclination' },
    desc: {
      ru: 'Дёшево добраться, детальные снимки. Но остатки атмосферы тормозят аппарат, а полюса остаются за кадром.',
      en: 'Cheap to reach and close to the ground. Thin air still drags the spacecraft down, and the poles stay out of view.',
    },
    capFactor: 1,
    insertionDv: 0,
    stationDv: 20,
    disposalDv: 0,
    decayYears: 4,
    sunFraction: 0.62,
    eclipseHours: 0.6,
    solarFactor: 1,
    radiation: 1,
    commsFactor: 1,
    contact: contact(0.7, 3, 0.5),
    transitMonths: 0,
    lowThrustMonths: 0,
    magnetic: true,
    heaterW: 0,
    opsPerYear: 2,
  },
  {
    id: 'sso',
    body: 'earth',
    name: { ru: 'Солнечно-синхронная', en: 'Sun-synchronous orbit' },
    altitude: { ru: '700 км, через полюса', en: '700 km, over the poles' },
    desc: {
      ru: 'Проходит над каждой точкой Земли в одно и то же местное время — снимки удобно сравнивать. Мусор здесь живёт десятилетиями, поэтому аппарат нужно свести с орбиты.',
      en: 'Passes over every place at the same local time, so images are easy to compare. Debris lasts decades here, so the spacecraft must be deorbited.',
    },
    capFactor: 0.75,
    insertionDv: 0,
    stationDv: 2,
    disposalDv: 120,
    decayYears: null,
    sunFraction: 0.7,
    eclipseHours: 0.55,
    solarFactor: 1,
    radiation: 1,
    commsFactor: 1,
    contact: contact(1, 4.5, 0.5),
    transitMonths: 0,
    lowThrustMonths: 0,
    magnetic: true,
    heaterW: 0,
    opsPerYear: 2,
  },
  {
    id: 'geo',
    body: 'earth',
    name: { ru: 'Геостационарная', en: 'Geostationary orbit' },
    altitude: { ru: '35 786 км над экватором', en: '35,786 km above the equator' },
    desc: {
      ru: 'Аппарат висит над одной точкой и видит полушарие без перерыва. Далеко: мелкие детали не разглядеть, а ракета довозит только до переходной орбиты.',
      en: 'Hangs over one spot and watches a hemisphere non-stop. Far away: fine detail is lost, and the rocket only takes you to a transfer orbit.',
    },
    capFactor: 0.4,
    insertionDv: 1500,
    stationDv: 50,
    disposalDv: 15,
    decayYears: null,
    sunFraction: 0.99,
    eclipseHours: 1.2,
    solarFactor: 1,
    radiation: 3,
    commsFactor: 0.2,
    contact: contact(24, 24, 24),
    transitMonths: 0,
    lowThrustMonths: 5,
    magnetic: false,
    heaterW: 10,
    opsPerYear: 3,
  },
  {
    id: 'llo',
    body: 'moon',
    name: { ru: 'Низкая полярная лунная', en: 'Low lunar polar orbit' },
    altitude: { ru: '100 км над Луной', en: '100 km above the Moon' },
    desc: {
      ru: 'Лучшее разрешение и пролёты над полюсами. Неровная гравитация Луны сбивает орбиту — нужно много топлива на поддержание.',
      en: 'Best resolution and passes over both poles. The Moon’s lumpy gravity keeps bending the orbit, so holding it costs a lot of fuel.',
    },
    capFactor: 0.28,
    insertionDv: 900,
    stationDv: 150,
    disposalDv: 0,
    decayYears: 0.5,
    sunFraction: 0.6,
    eclipseHours: 0.8,
    solarFactor: 1,
    radiation: 2,
    commsFactor: 0.004,
    contact: contact(8, 12, 16),
    transitMonths: 1,
    lowThrustMonths: 6,
    magnetic: false,
    heaterW: 20,
    opsPerYear: 6,
  },
  {
    id: 'elo',
    body: 'moon',
    name: { ru: 'Вытянутая «замороженная» лунная', en: 'Elliptical frozen lunar orbit' },
    altitude: { ru: '200 × 6 000 км', en: '200 × 6,000 km' },
    desc: {
      ru: 'Орбита почти не требует топлива и проще для входа, но большую часть времени аппарат далеко от поверхности.',
      en: 'Needs almost no fuel to hold and is easier to enter, but the spacecraft spends most of its time far from the surface.',
    },
    capFactor: 0.28,
    insertionDv: 650,
    stationDv: 10,
    disposalDv: 0,
    decayYears: null,
    sunFraction: 0.85,
    eclipseHours: 1.5,
    solarFactor: 1,
    radiation: 2,
    commsFactor: 0.004,
    contact: contact(8, 12, 16),
    transitMonths: 1,
    lowThrustMonths: 6,
    magnetic: false,
    heaterW: 20,
    opsPerYear: 6,
  },
  {
    id: 'l1',
    body: 'sun',
    name: { ru: 'Точка Лагранжа L1', en: 'Sun–Earth L1 point' },
    altitude: { ru: '1,5 млн км в сторону Солнца', en: '1.5 million km sunward' },
    desc: {
      ru: 'Солнце видно всегда, тени нет. Солнечный ветер приходит сюда на час раньше, чем к Земле, — идеальный пост раннего оповещения.',
      en: 'The Sun is always in view and there is no shadow. Solar wind arrives here an hour before it hits Earth — a perfect early-warning post.',
    },
    capFactor: 0.27,
    insertionDv: 150,
    stationDv: 5,
    disposalDv: 0,
    decayYears: null,
    sunFraction: 1,
    eclipseHours: 0,
    solarFactor: 1,
    radiation: 2,
    commsFactor: 0.002,
    contact: contact(8, 12, 16),
    transitMonths: 4,
    lowThrustMonths: 3,
    magnetic: false,
    heaterW: 15,
    opsPerYear: 5,
  },
  {
    id: 'lmo',
    body: 'mars',
    name: { ru: 'Низкая орбита Марса', en: 'Low Mars orbit' },
    altitude: { ru: '300 км над Марсом', en: '300 km above Mars' },
    desc: {
      ru: 'Близко к планете: детальные данные об атмосфере и поверхности. Торможение у Марса требует огромного запаса топлива.',
      en: 'Close to the planet for detailed atmosphere and surface data. Braking at Mars takes a huge amount of fuel.',
    },
    capFactor: 0.2,
    insertionDv: 2200,
    stationDv: 20,
    disposalDv: 0,
    decayYears: null,
    sunFraction: 0.62,
    eclipseHours: 0.7,
    solarFactor: 0.43,
    radiation: 2,
    commsFactor: 0.0004,
    contact: contact(6, 8, 10),
    transitMonths: 8,
    lowThrustMonths: 5,
    magnetic: false,
    heaterW: 40,
    opsPerYear: 8,
  },
  {
    id: 'emo',
    body: 'mars',
    name: { ru: 'Вытянутая орбита Марса', en: 'Elliptical Mars orbit' },
    altitude: { ru: '300 × 30 000 км', en: '300 × 30,000 km' },
    desc: {
      ru: 'Вдвое меньше топлива на торможение и вид на всю планету целиком, но вблизи аппарат бывает лишь изредка.',
      en: 'Half the braking fuel and a view of the whole planet, but the spacecraft only comes close now and then.',
    },
    capFactor: 0.2,
    insertionDv: 1100,
    stationDv: 5,
    disposalDv: 0,
    decayYears: null,
    sunFraction: 0.85,
    eclipseHours: 1.5,
    solarFactor: 0.43,
    radiation: 2,
    commsFactor: 0.0004,
    contact: contact(6, 8, 10),
    transitMonths: 8,
    lowThrustMonths: 5,
    magnetic: false,
    heaterW: 40,
    opsPerYear: 8,
  },
];

export const TIERS: Record<1 | 2 | 3, L> = {
  1: { ru: 'Базовый класс', en: 'Entry class' },
  2: { ru: 'Стандартный класс', en: 'Standard class' },
  3: { ru: 'Профессиональный класс', en: 'Professional class' },
};

/**
 * Science instruments come in three classes. Class 1 is what a student team can afford,
 * class 2 is the working standard, class 3 is what an agency flies. Quality rises much more
 * slowly than mass, power, data and price: the last quarter of quality costs as much again.
 */
export const INSTRUMENTS: Instrument[] = [
  {
    id: 'cam_wide', tier: 1,
    name: { ru: 'Широкоугольная камера', en: 'Wide-angle camera' },
    desc: { ru: 'Базовый класс. Лёгкая обзорная камера размером с кружку. Видит много, но без мелких деталей.', en: 'Entry class. A light survey camera the size of a mug. Sees a lot, but no fine detail.' },
    mass: 4, power: 8, cost: 1, data: 3, pointing: 1, devMonths: 6,
    measures: { visible: 0.4 },
  },
  {
    id: 'cam_mid', tier: 2,
    name: { ru: 'Камера среднего разрешения', en: 'Medium-resolution camera' },
    desc: { ru: 'Стандартный класс. Телескоп с зеркалом 25 см: различает дома и дороги. Уже требует ровного наведения.', en: 'Standard class. A telescope with a 25 cm mirror: resolves houses and roads. It already needs steady pointing.' },
    mass: 16, power: 28, cost: 7, data: 20, pointing: 2, devMonths: 12,
    measures: { visible: 0.7, topography: 0.15 },
  },
  {
    id: 'cam_hires', tier: 3,
    name: { ru: 'Телескоп высокого разрешения', en: 'High-resolution telescope' },
    desc: { ru: 'Профессиональный класс. Зеркало 70 см: различает объекты размером с автомобиль. Требует очень точного наведения и создаёт гору данных.', en: 'Professional class. A 70 cm mirror: resolves objects the size of a car. Needs very steady pointing and produces a mountain of data.' },
    mass: 48, power: 65, cost: 24, data: 70, pointing: 3, devMonths: 18,
    measures: { visible: 1, topography: 0.3 },
  },
  {
    id: 'thermal_micro', tier: 1,
    name: { ru: 'Микроболометр', en: 'Microbolometer' },
    desc: { ru: 'Базовый класс. Неохлаждаемый тепловой датчик. Замечает крупные очаги тепла, но путает небольшой пожар с нагретой крышей.', en: 'Entry class. An uncooled thermal sensor. Spots large hot areas, but confuses a small fire with a sun-warmed roof.' },
    mass: 3, power: 7, cost: 1.2, data: 2, pointing: 1, devMonths: 7,
    measures: { thermal: 0.4 },
  },
  {
    id: 'thermal_ir', tier: 2,
    name: { ru: 'Тепловизор', en: 'Thermal infrared imager' },
    desc: { ru: 'Стандартный класс. Измеряет температуру поверхности: находит пожары, вулканы, тёплые течения — днём и ночью.', en: 'Standard class. Measures surface temperature: finds fires, volcanoes and warm currents, day and night.' },
    mass: 22, power: 45, cost: 10, data: 18, pointing: 2, devMonths: 14,
    measures: { thermal: 0.75 },
  },
  {
    id: 'thermal_cryo', tier: 3,
    name: { ru: 'Охлаждаемый инфракрасный радиометр', en: 'Cryocooled infrared radiometer' },
    desc: { ru: 'Профессиональный класс. Датчик охлаждён до −190 °C: различает десятые доли градуса и очаг размером с костёр. Холодильник тяжёл и ест много энергии.', en: 'Professional class. Its detector is cooled to −190 °C: it resolves tenths of a degree and a fire the size of a campfire. The cooler is heavy and power-hungry.' },
    mass: 38, power: 95, cost: 18, data: 45, pointing: 3, devMonths: 20,
    measures: { thermal: 1, atmosphere: 0.15 },
  },
  {
    id: 'multispec_lite', tier: 1,
    name: { ru: 'Четырёхканальная камера', en: 'Four-band camera' },
    desc: { ru: 'Базовый класс. Синий, зелёный, красный и ближний инфракрасный каналы: хватает для индекса растительности.', en: 'Entry class. Blue, green, red and near-infrared bands: enough for a vegetation index.' },
    mass: 6, power: 12, cost: 2, data: 8, pointing: 1, devMonths: 8,
    measures: { multispectral: 0.4, visible: 0.25 },
  },
  {
    id: 'multispec', tier: 2,
    name: { ru: 'Многоспектральная камера', en: 'Multispectral imager' },
    desc: { ru: 'Стандартный класс. Снимает в десятке цветовых каналов: видно здоровье растений, гарь, состав воды.', en: 'Standard class. Images in a dozen colour bands, revealing plant health, burn scars and water quality.' },
    mass: 30, power: 50, cost: 13, data: 40, pointing: 2, devMonths: 14,
    measures: { multispectral: 0.75, visible: 0.5 },
  },
  {
    id: 'hyperspec', tier: 3,
    name: { ru: 'Гиперспектральная камера', en: 'Hyperspectral imager' },
    desc: { ru: 'Профессиональный класс. Сотни узких каналов: по спектру узнаёт породу дерева и минерал. Данных — как от радара.', en: 'Professional class. Hundreds of narrow bands: it tells a tree species or a mineral by its spectrum. As much data as a radar.' },
    mass: 62, power: 120, cost: 34, data: 140, pointing: 3, devMonths: 22,
    measures: { multispectral: 1, visible: 0.6, composition: 0.3 },
  },
  {
    id: 'scatterometer', tier: 1,
    name: { ru: 'Скаттерометр', en: 'Scatterometer' },
    desc: { ru: 'Базовый класс. Простой радар без изображения: по отражению от ряби измеряет ветер над морем и влажность почвы.', en: 'Entry class. A simple radar that makes no image: from the echo off ripples it measures wind over the sea and soil moisture.' },
    mass: 12, power: 45, cost: 3.5, data: 0.5, pointing: 1, devMonths: 10,
    measures: { radar: 0.4 },
  },
  {
    id: 'sar_compact', tier: 2,
    name: { ru: 'Компактный радар', en: 'Compact radar' },
    desc: { ru: 'Стандартный класс. Малая антенна и короткие сеансы съёмки. Видит сквозь облака и ночью, но полосу в несколько раз уже, чем большой радар.', en: 'Standard class. A small antenna and short imaging sessions. Sees through cloud and at night, over a swath several times narrower than the big radar.' },
    mass: 55, power: 280, cost: 20, data: 60, pointing: 2, devMonths: 18,
    measures: { radar: 0.6, topography: 0.25 },
  },
  {
    id: 'sar', tier: 3,
    name: { ru: 'Радар с синтезированной апертурой', en: 'Synthetic aperture radar' },
    desc: { ru: 'Профессиональный класс. Сам подсвечивает поверхность радиоволнами: видит сквозь облака и ночью. Очень тяжёлый и прожорливый.', en: 'Professional class. Lights up the surface with its own radio waves, so it sees through cloud and at night. Very heavy and power-hungry.' },
    mass: 120, power: 600, cost: 45, data: 150, pointing: 2, devMonths: 24, advanced: true,
    measures: { radar: 1, topography: 0.5 },
  },
  {
    id: 'alt_lidar', tier: 1,
    name: { ru: 'Лазерный дальномер', en: 'Laser rangefinder' },
    desc: { ru: 'Базовый класс. Один луч под аппаратом. Высоты получаются точными, но только вдоль тонкой линии.', en: 'Entry class. A single beam straight down. Heights are accurate, but only along a thin line.' },
    mass: 5, power: 14, cost: 2, data: 0.3, pointing: 2, devMonths: 9,
    measures: { altimetry: 0.4, topography: 0.35 },
  },
  {
    id: 'altimeter', tier: 2,
    name: { ru: 'Радиовысотомер', en: 'Radar altimeter' },
    desc: { ru: 'Стандартный класс. Измеряет расстояние до поверхности с точностью до сантиметров: уровень моря, высота гор и кратеров.', en: 'Standard class. Measures the distance to the surface to within centimetres: sea level, mountains and craters.' },
    mass: 35, power: 70, cost: 15, data: 2, pointing: 2, devMonths: 16,
    measures: { altimetry: 0.75, topography: 0.7 },
  },
  {
    id: 'alt_pro', tier: 3,
    name: { ru: 'Высотомер с радиометром', en: 'Altimeter with radiometer' },
    desc: { ru: 'Профессиональный класс. Двухчастотный высотомер и радиометр, который вычитает задержку сигнала в водяном паре. Точность — миллиметры.', en: 'Professional class. A dual-frequency altimeter with a radiometer that removes the signal delay in water vapour. Accurate to millimetres.' },
    mass: 70, power: 145, cost: 30, data: 6, pointing: 2, devMonths: 22,
    measures: { altimetry: 1, topography: 0.9, atmosphere: 0.2 },
  },
  {
    id: 'sounder_lite', tier: 1,
    name: { ru: 'Малый микроволновый радиометр', en: 'Small microwave radiometer' },
    desc: { ru: 'Базовый класс. Шесть каналов вместо двадцати: грубые профили температуры без деталей по высоте.', en: 'Entry class. Six channels instead of twenty: coarse temperature profiles with little vertical detail.' },
    mass: 5, power: 10, cost: 1.5, data: 1, pointing: 1, devMonths: 8,
    measures: { atmosphere: 0.4 },
  },
  {
    id: 'sounder', tier: 2,
    name: { ru: 'Атмосферный зонд', en: 'Atmospheric sounder' },
    desc: { ru: 'Стандартный класс. Строит профили температуры и влажности по высоте. Работает и сквозь облака.', en: 'Standard class. Builds temperature and humidity profiles through the atmosphere, even through cloud.' },
    mass: 28, power: 55, cost: 11, data: 5, pointing: 1, devMonths: 14,
    measures: { atmosphere: 0.75, thermal: 0.3 },
  },
  {
    id: 'sounder_pro', tier: 3,
    name: { ru: 'Инфракрасный фурье-зонд', en: 'Infrared Fourier sounder' },
    desc: { ru: 'Профессиональный класс. Тысячи спектральных каналов: профиль температуры через каждый километр высоты и следовые газы.', en: 'Professional class. Thousands of spectral channels: a temperature profile for every kilometre of height, plus trace gases.' },
    mass: 60, power: 130, cost: 29, data: 30, pointing: 2, devMonths: 22,
    measures: { atmosphere: 1, thermal: 0.45, composition: 0.25 },
  },
  {
    id: 'neutron', tier: 1,
    name: { ru: 'Нейтронный счётчик', en: 'Neutron counter' },
    desc: { ru: 'Базовый класс. Ищет водород — а значит, водяной лёд — под поверхностью. Показывает, что лёд есть, но не сколько его и где граница.', en: 'Entry class. Hunts for hydrogen — and therefore water ice — below the surface. It shows that ice is there, but not how much or where it ends.' },
    mass: 9, power: 10, cost: 3.5, data: 0.1, pointing: 1, devMonths: 12,
    measures: { composition: 0.45 },
  },
  {
    id: 'spectrometer', tier: 2,
    name: { ru: 'Инфракрасный спектрометр', en: 'Infrared spectrometer' },
    desc: { ru: 'Стандартный класс. Раскладывает свет на спектр и по «отпечаткам» узнаёт газы и минералы.', en: 'Standard class. Splits light into a spectrum and recognises gases and minerals by their fingerprints.' },
    mass: 18, power: 25, cost: 12, data: 8, pointing: 2, devMonths: 16,
    measures: { composition: 0.7, atmosphere: 0.5 },
  },
  {
    id: 'gamma_suite', tier: 3,
    name: { ru: 'Гамма-нейтронный комплекс', en: 'Gamma-ray and neutron suite' },
    desc: { ru: 'Профессиональный класс. Гамма-спектрометр на штанге и коллимированный нейтронный телескоп: карта льда и химических элементов с разрешением 10 км.', en: 'Professional class. A boom-mounted gamma-ray spectrometer and a collimated neutron telescope: a map of ice and chemical elements at 10 km resolution.' },
    mass: 38, power: 45, cost: 32, data: 1, pointing: 1, devMonths: 22,
    measures: { composition: 1 },
  },
  {
    id: 'mag_chip', tier: 1,
    name: { ru: 'Магнитометр на корпусе', en: 'Body-mounted magnetometer' },
    desc: { ru: 'Базовый класс. Микросхема на плате. Электроника аппарата шумит рядом с ней, поэтому слабые поля не видны.', en: 'Entry class. A chip on a circuit board. The spacecraft’s own electronics are noisy beside it, so weak fields are lost.' },
    mass: 0.5, power: 1, cost: 0.3, data: 0.02, pointing: 1, devMonths: 4,
    measures: { magnetic: 0.4 },
  },
  {
    id: 'magnetometer', tier: 2,
    name: { ru: 'Магнитометр на штанге', en: 'Boom magnetometer' },
    desc: { ru: 'Стандартный класс. Измеряет магнитное поле. Вынесен на штангу, чтобы электроника аппарата не мешала.', en: 'Standard class. Measures the magnetic field. Sits on a boom so the spacecraft’s own electronics do not disturb it.' },
    mass: 3, power: 4, cost: 2, data: 0.05, pointing: 1, devMonths: 8,
    measures: { magnetic: 0.75 },
  },
  {
    id: 'mag_pro', tier: 3,
    name: { ru: 'Пара магнитометров на длинной штанге', en: 'Dual magnetometers on a long boom' },
    desc: { ru: 'Профессиональный класс. Два датчика на шестиметровой штанге: по разнице показаний вычитается поле самого аппарата.', en: 'Professional class. Two sensors on a six-metre boom: the difference between them removes the spacecraft’s own field.' },
    mass: 9, power: 10, cost: 9, data: 0.2, pointing: 1, devMonths: 14,
    measures: { magnetic: 1 },
  },
  {
    id: 'particles_lite', tier: 1,
    name: { ru: 'Счётчик радиации', en: 'Radiation counter' },
    desc: { ru: 'Базовый класс. Считает частицы, но не различает ни их вид, ни энергию.', en: 'Entry class. Counts particles, but cannot tell their kind or their energy.' },
    mass: 1.5, power: 3, cost: 0.6, data: 0.02, pointing: 1, devMonths: 5,
    measures: { particles: 0.4 },
  },
  {
    id: 'particles', tier: 2,
    name: { ru: 'Детектор частиц', en: 'Particle detector' },
    desc: { ru: 'Стандартный класс. Считает протоны и электроны солнечного ветра и измеряет их энергию.', en: 'Standard class. Counts solar-wind protons and electrons and measures their energy.' },
    mass: 8, power: 12, cost: 5, data: 0.3, pointing: 1, devMonths: 10,
    measures: { particles: 0.75 },
  },
  {
    id: 'plasma_suite', tier: 3,
    name: { ru: 'Плазменный комплекс', en: 'Plasma suite' },
    desc: { ru: 'Профессиональный класс. Анализаторы ионов и электронов и масс-спектрометр: скорость, плотность, температура и состав солнечного ветра.', en: 'Professional class. Ion and electron analysers with a mass spectrometer: the speed, density, temperature and make-up of the solar wind.' },
    mass: 24, power: 38, cost: 19, data: 2, pointing: 1, devMonths: 18,
    measures: { particles: 1, magnetic: 0.2 },
  },
  {
    id: 'solar_xray', tier: 1,
    name: { ru: 'Рентгеновский монитор Солнца', en: 'Solar X-ray monitor' },
    desc: { ru: 'Базовый класс. Измеряет яркость Солнца в рентгене: вспышку видит, а куда летит выброс — нет.', en: 'Entry class. Measures the Sun’s X-ray brightness: it sees a flare, but not where the eruption is heading.' },
    mass: 3, power: 5, cost: 1.5, data: 0.1, pointing: 2, devMonths: 8,
    measures: { solar: 0.4 },
  },
  {
    id: 'euv_imager', tier: 2,
    name: { ru: 'Ультрафиолетовый телескоп', en: 'Ultraviolet telescope' },
    desc: { ru: 'Стандартный класс. Снимает диск Солнца: видны активные области и начало выброса.', en: 'Standard class. Images the Sun’s disc: active regions and the start of an eruption.' },
    mass: 14, power: 20, cost: 8, data: 6, pointing: 2, devMonths: 14,
    measures: { solar: 0.7 },
  },
  {
    id: 'coronagraph', tier: 3,
    name: { ru: 'Коронограф', en: 'Coronagraph' },
    desc: { ru: 'Профессиональный класс. Закрывает диск Солнца и снимает его корону — видно, как выбросы плазмы летят к Земле, и можно измерить их скорость.', en: 'Professional class. Blocks the Sun’s disc to image its corona, showing plasma eruptions heading for Earth and how fast they travel.' },
    mass: 36, power: 45, cost: 24, data: 14, pointing: 3, devMonths: 18,
    measures: { solar: 1 },
  },
];

export const POWER: PowerSource[] = [
  {
    id: 'body',
    name: { ru: 'Панели на корпусе', en: 'Body-mounted cells' },
    desc: { ru: 'Солнечные элементы прямо на стенках. Ничего не раскрывается — нечему ломаться.', en: 'Solar cells glued to the walls. Nothing unfolds, so nothing can jam.' },
    mass: 3, power: 0, cost: 0.3, watts: 60, solar: true,
  },
  {
    id: 'small',
    name: { ru: 'Малые раскрывающиеся панели', en: 'Small deployable arrays' },
    desc: { ru: 'Два небольших крыла.', en: 'Two small wings.' },
    mass: 10, power: 0, cost: 1.2, watts: 250, solar: true,
  },
  {
    id: 'medium',
    name: { ru: 'Средние панели', en: 'Medium arrays' },
    desc: { ru: 'Стандарт для научных спутников.', en: 'The standard for science satellites.' },
    mass: 28, power: 0, cost: 4, watts: 800, solar: true,
  },
  {
    id: 'large',
    name: { ru: 'Большие панели', en: 'Large arrays' },
    desc: { ru: 'Для радаров и дальних полётов, где Солнце светит слабее.', en: 'For radars and distant flights where sunlight is weaker.' },
    mass: 75, power: 0, cost: 9, watts: 2500, solar: true,
  },
  {
    id: 'xl',
    name: { ru: 'Сверхбольшие панели', en: 'Extra-large arrays' },
    desc: { ru: 'Размах с теннисный корт. Мощно, тяжело, дорого.', en: 'A wingspan the size of a tennis court. Powerful, heavy, expensive.' },
    mass: 160, power: 0, cost: 18, watts: 6000, solar: true, advanced: true,
  },
  {
    id: 'rtg',
    name: { ru: 'Радиоизотопный генератор', en: 'Radioisotope generator (RTG)' },
    desc: { ru: 'Тепло распада плутония превращается в электричество. Работает в тени и вдали от Солнца, но стоит очень дорого.', en: 'Turns the heat of decaying plutonium into electricity. Works in shadow and far from the Sun, at a very high price.' },
    mass: 55, power: 0, cost: 90, watts: 300, solar: false, advanced: true, devMonths: 12,
  },
];

export const BATTERIES: Battery[] = [
  { id: 'b100', name: { ru: 'Малая, 100 Вт·ч', en: 'Small, 100 Wh' }, desc: { ru: 'Как пара ноутбучных аккумуляторов.', en: 'About two laptop batteries.' }, mass: 1.2, power: 0, cost: 0.15, wh: 100 },
  { id: 'b500', name: { ru: 'Средняя, 500 Вт·ч', en: 'Medium, 500 Wh' }, desc: { ru: 'Хватает небольшому аппарату на время тени.', en: 'Carries a small spacecraft through eclipse.' }, mass: 5, power: 0, cost: 0.6, wh: 500 },
  { id: 'b2000', name: { ru: 'Большая, 2 000 Вт·ч', en: 'Large, 2,000 Wh' }, desc: { ru: 'Для аппаратов с мощной нагрузкой.', en: 'For spacecraft with a heavy load.' }, mass: 18, power: 0, cost: 2, wh: 2000 },
  { id: 'b6000', name: { ru: 'Сверхбольшая, 6 000 Вт·ч', en: 'Extra-large, 6,000 Wh' }, desc: { ru: 'Питает радар в тени планеты.', en: 'Keeps a radar running in the planet’s shadow.' }, mass: 50, power: 0, cost: 5, wh: 6000, advanced: true },
];

export const ANTENNAS: Antenna[] = [
  {
    id: 'uhf',
    name: { ru: 'УКВ-антенна', en: 'UHF antenna' },
    desc: { ru: 'Простой штырь. Наводить не нужно, но канал узкий.', en: 'A simple whip. No pointing needed, but the channel is narrow.' },
    mass: 1, power: 5, cost: 0.1, mbps: 0.1, pointing: 1, availability: 1,
  },
  {
    id: 'sband',
    name: { ru: 'S-диапазон', en: 'S-band' },
    desc: { ru: 'Надёжная рабочая лошадка для малых спутников.', en: 'The reliable workhorse of small satellites.' },
    mass: 3, power: 15, cost: 0.6, mbps: 4, pointing: 1, availability: 1,
  },
  {
    id: 'xband',
    name: { ru: 'X-диапазон с тарелкой', en: 'X-band dish' },
    desc: { ru: 'Узкий луч и высокая скорость. Тарелку нужно направлять на Землю.', en: 'A narrow beam and a high rate. The dish has to be aimed at Earth.' },
    mass: 12, power: 60, cost: 4, mbps: 150, pointing: 2, availability: 1,
  },
  {
    id: 'kaband',
    name: { ru: 'Ka-диапазон, большая тарелка', en: 'Ka-band large dish' },
    desc: { ru: 'Ещё быстрее, но тяжелее и дороже. Для дальнего космоса и потоков данных с радара.', en: 'Faster still, but heavier and pricier. For deep space and radar-sized data streams.' },
    mass: 28, power: 120, cost: 12, mbps: 800, pointing: 2, availability: 0.95,
  },
  {
    id: 'laser',
    name: { ru: 'Лазерный терминал', en: 'Laser terminal' },
    desc: { ru: 'Рекордная скорость, но луч нужно удерживать с ювелирной точностью, а облака над станцией его блокируют.', en: 'Record-breaking speed, but the beam needs jeweller’s precision and clouds over the station block it.' },
    mass: 18, power: 90, cost: 20, mbps: 4000, pointing: 3, availability: 0.6, advanced: true, devMonths: 6,
  },
];

export const GROUNDS: Ground[] = [
  {
    id: 'own',
    name: { ru: 'Одна своя станция', en: 'One station of your own' },
    desc: { ru: 'Дёшево, но низкий спутник пролетает над ней всего несколько минут за виток.', en: 'Cheap, but a low satellite is overhead for only minutes per orbit.' },
    setupCost: 2, yearlyCost: 0.5, gain: 1,
  },
  {
    id: 'network',
    name: { ru: 'Коммерческая сеть станций', en: 'Commercial station network' },
    desc: { ru: 'Аренда антенн по всему миру, включая полярные: в разы больше времени на связь.', en: 'Rented antennas around the world, including polar sites: several times more contact time.' },
    setupCost: 0, yearlyCost: 1.5, gain: 1.5,
  },
  {
    id: 'dsn',
    name: { ru: 'Сеть дальней космической связи', en: 'Deep space network' },
    desc: { ru: 'Тарелки по 34–70 метров. Ловят шёпот с Марса, но стоят дорого и плохо следят за быстрыми низкими спутниками.', en: '34–70 metre dishes. They hear a whisper from Mars, but cost a lot and track fast low satellites poorly.' },
    setupCost: 0, yearlyCost: 6, gain: 25,
  },
];

export const COMPUTERS: Computer[] = [
  {
    id: 'basic',
    name: { ru: 'Обычная электроника', en: 'Commercial electronics' },
    desc: { ru: 'Как в смартфоне: дёшево и легко, но космическая радиация вызывает сбои. Память 32 ГБ.', en: 'Smartphone-grade: cheap and light, but space radiation makes it glitch. 32 GB of storage.' },
    mass: 1, power: 5, cost: 0.2, storage: 32, radTol: 1, compression: 1,
  },
  {
    id: 'standard',
    name: { ru: 'Радиационно-стойкий компьютер', en: 'Radiation-tolerant computer' },
    desc: { ru: 'Переносит умеренную радиацию и сжимает данные на 30%. Память 256 ГБ.', en: 'Handles moderate radiation and shrinks data by 30%. 256 GB of storage.' },
    mass: 4, power: 15, cost: 1.5, storage: 256, radTol: 2, compression: 0.7,
  },
  {
    id: 'advanced',
    name: { ru: 'Защищённый компьютер с обработкой на борту', en: 'Hardened computer with onboard processing' },
    desc: { ru: 'Выдерживает радиационные пояса, сам отбирает полезные кадры и сжимает данные на 60%. Память 2 ТБ.', en: 'Survives the radiation belts, picks the useful frames itself and shrinks data by 60%. 2 TB of storage.' },
    mass: 9, power: 40, cost: 8, storage: 2000, radTol: 3, compression: 0.4, advanced: true,
  },
];

export const ADCS: Adcs[] = [
  {
    id: 'magnetic',
    name: { ru: 'Магнитные катушки', en: 'Magnetorquers' },
    desc: { ru: 'Толкаются о магнитное поле Земли. Грубое наведение, и работает только у Земли.', en: 'Push against Earth’s magnetic field. Coarse pointing, and only works near Earth.' },
    mass: 1.5, power: 3, cost: 0.15, pointing: 1, magneticOnly: true,
  },
  {
    id: 'wheels',
    name: { ru: 'Маховики', en: 'Reaction wheels' },
    desc: { ru: 'Раскручивая маховики, аппарат поворачивается сам. Среднее по точности наведение.', en: 'Spinning wheels turn the spacecraft the other way. Medium pointing accuracy.' },
    mass: 6, power: 12, cost: 1.5, pointing: 2, magneticOnly: false,
  },
  {
    id: 'precise',
    name: { ru: 'Маховики и звёздные датчики', en: 'Wheels with star trackers' },
    desc: { ru: 'Аппарат сверяется со звёздами и держит цель неподвижно — как нужно телескопу или лазеру.', en: 'The spacecraft checks itself against the stars and holds a target rock-steady, as a telescope or laser needs.' },
    mass: 14, power: 28, cost: 6, pointing: 3, magneticOnly: false,
  },
];

export const PROPULSION: Propulsion[] = [
  {
    id: 'none',
    name: { ru: 'Без двигателя', en: 'No engine' },
    desc: { ru: 'Аппарат остаётся там, куда его доставила ракета.', en: 'The spacecraft stays wherever the rocket leaves it.' },
    mass: 0, power: 0, cost: 0, isp: 0, maxProp: null, needsWatts: 0, lowThrust: false,
  },
  {
    id: 'coldgas',
    name: { ru: 'Двигатели на сжатом газе', en: 'Cold-gas thrusters' },
    desc: { ru: 'Баллон с азотом и клапаны. Просто, но хватает лишь на мелкие поправки (до 15 кг газа).', en: 'A nitrogen bottle and valves. Simple, but only good for small nudges (up to 15 kg of gas).' },
    mass: 4, power: 0, cost: 0.5, isp: 65, maxProp: 15, needsWatts: 0, lowThrust: false,
  },
  {
    id: 'mono',
    name: { ru: 'Однокомпонентный (гидразин)', en: 'Monopropellant (hydrazine)' },
    desc: { ru: 'Классика для удержания орбиты и схода с неё.', en: 'The classic choice for holding an orbit and leaving it.' },
    mass: 12, power: 0, cost: 2.5, isp: 225, maxProp: null, needsWatts: 0, lowThrust: false,
  },
  {
    id: 'biprop',
    name: { ru: 'Двухкомпонентный двигатель', en: 'Bipropellant engine' },
    desc: { ru: 'Топливо и окислитель: экономнее гидразина в полтора раза. Нужен для торможения у Луны и Марса.', en: 'Fuel plus oxidiser: half again as efficient as hydrazine. What you brake with at the Moon or Mars.' },
    mass: 35, power: 0, cost: 9, isp: 320, maxProp: null, needsWatts: 0, lowThrust: false,
  },
  {
    id: 'ion',
    name: { ru: 'Ионный двигатель', en: 'Ion engine' },
    desc: { ru: 'Топлива нужно в разы меньше, но тяга — как вес листа бумаги: перелёт длится дольше и требует 1 500 Вт.', en: 'Needs several times less propellant, but pushes with the weight of a sheet of paper: the trip takes longer and needs 1,500 W.' },
    mass: 45, power: 0, cost: 15, isp: 1600, maxProp: null, needsWatts: 1500, lowThrust: true, advanced: true, devMonths: 6,
  },
];

export const STRUCTURES: Structure[] = [
  {
    id: 'aluminium',
    name: { ru: 'Алюминиевый корпус', en: 'Aluminium structure' },
    desc: { ru: 'Проверенный и недорогой. Весит около 22% от всего, что несёт.', en: 'Proven and cheap. Weighs about 22% of everything it carries.' },
    fraction: 0.22, baseCost: 1.5, costPerKg: 0.01,
  },
  {
    id: 'composite',
    name: { ru: 'Композитный корпус', en: 'Composite structure' },
    desc: { ru: 'Углепластик: на треть легче, но заметно дороже.', en: 'Carbon fibre: a third lighter, but noticeably more expensive.' },
    fraction: 0.14, baseCost: 5, costPerKg: 0.05, advanced: true,
  },
];

const EARTH: OrbitId[] = ['leo', 'sso', 'geo'];
const ALL: OrbitId[] = ['leo', 'sso', 'geo', 'llo', 'elo', 'l1', 'lmo', 'emo'];

export const VEHICLES: Vehicle[] = [
  {
    id: 'rideshare',
    name: { ru: 'Попутный запуск', en: 'Rideshare slot' },
    desc: { ru: 'Место на чужой ракете. Очень дёшево, но только на солнечно-синхронную орбиту и с ожиданием очереди.', en: 'A seat on someone else’s rocket. Very cheap, but only to sun-synchronous orbit and after waiting in line.' },
    leoKg: 267, cost: 2, reliability: 0.97, reach: ['sso'], leadMonths: 6,
  },
  {
    id: 'kolibri',
    name: { ru: '«Колибри», сверхлёгкая', en: 'Kolibri, micro launcher' },
    desc: { ru: 'Собственный запуск для малого спутника. Новые ракеты пока менее надёжны.', en: 'A dedicated ride for a small satellite. New rockets are still less reliable.' },
    leoKg: 300, cost: 7.5, reliability: 0.9, reach: ['leo', 'sso'], leadMonths: 2,
  },
  {
    id: 'vector',
    name: { ru: '«Вектор», лёгкая', en: 'Vector, light launcher' },
    desc: { ru: 'Дотягивается до геопереходной орбиты, Луны и точки L1 — с небольшим грузом.', en: 'Reaches geostationary transfer, the Moon and L1 — with a small payload.' },
    leoKg: 1500, cost: 25, reliability: 0.94, reach: [...EARTH, 'llo', 'elo', 'l1'], leadMonths: 3,
  },
  {
    id: 'atlant',
    name: { ru: '«Атлант», средняя', en: 'Atlant, medium launcher' },
    desc: { ru: 'Главная ракета научных миссий: летит куда угодно.', en: 'The mainstay of science missions: goes anywhere.' },
    leoKg: 8000, cost: 75, reliability: 0.97, reach: ALL, leadMonths: 3,
  },
  {
    id: 'titan',
    name: { ru: '«Титан-Икс», тяжёлая', en: 'Titan-X, heavy launcher' },
    desc: { ru: 'Поднимает что угодно, и самая надёжная. Цена соответствующая.', en: 'Lifts anything and is the most reliable. Priced to match.' },
    leoKg: 22000, cost: 150, reliability: 0.985, reach: ALL, leadMonths: 4, advanced: true,
  },
];

export const TESTING: Testing[] = [
  {
    id: 'minimal',
    name: { ru: 'Минимальные', en: 'Minimal' },
    desc: { ru: 'Включили, проверили, полетели. Быстро и дёшево, но дефекты всплывут уже в космосе.', en: 'Switch on, check, fly. Fast and cheap, but defects will surface in space.' },
    cost: 1, months: 2, failFactor: 1.8,
  },
  {
    id: 'standard',
    name: { ru: 'Стандартные', en: 'Standard' },
    desc: { ru: 'Вибростенд, термовакуумная камера, проверка программ.', en: 'Shake table, thermal-vacuum chamber, software checks.' },
    cost: 5, months: 5, failFactor: 1,
  },
  {
    id: 'extensive',
    name: { ru: 'Расширенные', en: 'Extensive' },
    desc: { ru: 'Каждый узел испытан с запасом, все аварии отрепетированы. Вдвое меньше отказов в полёте.', en: 'Every unit tested beyond its limits, every failure rehearsed. Half as many failures in flight.' },
    cost: 10, months: 8, failFactor: 0.4,
  },
];

export const DIFFICULTY: Record<
  Difficulty,
  { name: L; desc: L; budget: number; events: number; launchFailures: boolean; advanced: boolean; scoreFactor: number }
> = {
  cadet: {
    name: { ru: 'Кадет', en: 'Cadet' },
    desc: { ru: 'Бюджет +25%, ракеты не взрываются, меньше неожиданностей, только базовые компоненты.', en: '+25% budget, rockets never fail, fewer surprises, basic components only.' },
    budget: 1.25, events: 0.4, launchFailures: false, advanced: false, scoreFactor: 0.85,
  },
  engineer: {
    name: { ru: 'Инженер', en: 'Engineer' },
    desc: { ru: 'Реалистичный бюджет и риски, полный каталог компонентов.', en: 'Realistic budget and risks, full component catalogue.' },
    budget: 1, events: 1, launchFailures: true, advanced: true, scoreFactor: 1,
  },
  director: {
    name: { ru: 'Руководитель полёта', en: 'Flight director' },
    desc: { ru: 'Бюджет −12%, космос чаще преподносит сюрпризы. Очки ×1,15.', en: '−12% budget and space throws more surprises. Score ×1.15.' },
    budget: 0.88, events: 1.5, launchFailures: true, advanced: true, scoreFactor: 1.15,
  },
};

export function byId<T extends { id: string }>(list: T[], id: string | null): T | undefined {
  return list.find((x) => x.id === id);
}

/** Like byId, but falls back to the first (simplest) option so a stale saved design never crashes. */
export function pick<T extends { id: string }>(list: T[], id: string | null): T {
  return byId(list, id) ?? list[0];
}
