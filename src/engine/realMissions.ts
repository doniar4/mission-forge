import type { L } from './types';

/**
 * A real mission that did the same job as a game scenario, with published numbers to hold
 * the player's design against. Figures come from NASA, JPL and partner fact sheets; where
 * sources disagree the note says which one is used. Checked in November 2026.
 */
export interface RealMission {
  name: string;
  /** Who flew it, shown under the name. */
  agency: L;
  launched: number;
  /** Mass at launch, with propellant, kg. */
  massKg: number;
  /** Electrical power the spacecraft has to work with, W (see powerNote). */
  powerW: number;
  powerNote: L;
  /** Design life or prime mission, years. */
  lifeYears: number;
  /** Mission cost, $M; null where no reliable figure is published. */
  costM: number | null;
  costNote: L;
  orbit: L;
  /** What it carried for the same measurements. */
  payload: L;
  /** One sentence the player should take away from the comparison. */
  lesson: L;
  sources: { label: string; url: string }[];
}

export const REAL_MISSIONS: Record<string, RealMission> = {
  firewatch: {
    name: 'Landsat 9',
    agency: { ru: 'NASA и Геологическая служба США', en: 'NASA and USGS' },
    launched: 2021,
    massKg: 2710,
    powerW: 4300,
    powerNote: { ru: 'мощность солнечной батареи', en: 'solar array power' },
    lifeYears: 5,
    costM: 885,
    costNote: { ru: 'базовая стоимость полного цикла по оценке NASA', en: 'NASA baseline life-cycle cost' },
    orbit: { ru: 'солнечно-синхронная, 705 км', en: 'sun-synchronous, 705 km' },
    payload: {
      ru: 'тепловой сканер TIRS-2 и многоспектральная камера OLI-2',
      en: 'TIRS-2 thermal sensor and OLI-2 multispectral imager',
    },
    lesson: {
      ru: 'Landsat 9 снимает в 11 диапазонах с полосой 185 км и повтором через 16 суток. В игре другие требования к съёмке. Сравниваем масштаб, а игровой бюджет и стоимость полного цикла учитывают разные расходы.',
      en: 'Landsat 9 images in 11 bands with a 185 km swath and a 16-day repeat cycle. Fire Watch has different imaging requirements. This illustrates scale, and the game budget and real life-cycle cost cover different expenses.',
    },
    sources: [
      { label: 'NASA: Landsat 9', url: 'https://science.nasa.gov/mission/landsat-9' },
      { label: 'NASA Landsat 9 fast facts', url: 'https://www.nasa.gov/wp-content/uploads/2015/04/landsat_9_fast_facts.pdf' },
      { label: 'CRS report R46560 (cost)', url: 'https://www.everycrsreport.com/reports/R46560.html' },
    ],
  },
  ocean: {
    name: 'Sentinel-6 Michael Freilich',
    agency: { ru: 'NASA, ESA, EUMETSAT и NOAA', en: 'NASA, ESA, EUMETSAT and NOAA' },
    launched: 2020,
    massKg: 1192,
    powerW: 1000,
    powerNote: { ru: 'в среднем на орбите, по данным JPL', en: 'average in orbit, per JPL' },
    lifeYears: 5.5,
    costM: 500,
    costNote: {
      ru: 'доля NASA, по словам NASA — за оба спутника; Европа вложила ещё около $465 млн, всего около $1 млрд',
      en: 'NASA’s share, which NASA says covers both satellites; Europe added about $465M, about $1B in all',
    },
    orbit: { ru: 'наклонная 66°, 1 336 км', en: '66° inclined, 1,336 km' },
    payload: {
      ru: 'радиовысотомер Poseidon-4 и микроволновый радиометр',
      en: 'Poseidon-4 radar altimeter and a microwave radiometer',
    },
    lesson: {
      ru: 'Ряд уровня моря ценен только непрерывным: поэтому Sentinel-6B запустили следом за первым спутником, а каждый рассчитан на 5,5 лет.',
      en: 'A sea-level record is only valuable if it is unbroken, which is why Sentinel-6B followed the first satellite, each built for 5.5 years.',
    },
    sources: [
      { label: 'JPL: Sentinel-6 quick facts', url: 'https://www.jpl.nasa.gov/news/press_kits/sentinel-6/facts/' },
      { label: 'JPL: Sentinel-6 spacecraft (power)', url: 'https://www.jpl.nasa.gov/news/press_kits/sentinel-6/mission/spacecraft/' },
      { label: 'Spaceflight Now: Sentinel-6B launch (cost)', url: 'https://spaceflightnow.com/2025/11/17/spacex-launches-joint-nasa-european-sea-level-monitor/' },
      { label: 'ESA Copernicus: satellite description', url: 'https://sentinels.copernicus.eu/missions/sentinel-6/satellite-description' },
    ],
  },
  lunarice: {
    name: 'Lunar Trailblazer',
    agency: { ru: 'NASA, JPL и Калтех (программа SIMPLEx)', en: 'NASA, JPL and Caltech (SIMPLEx programme)' },
    launched: 2025,
    massKg: 210,
    powerW: 280,
    powerNote: { ru: 'мощность солнечных батарей', en: 'solar array power' },
    lifeYears: 2,
    costM: 94,
    costNote: {
      ru: 'итоговая стоимость по данным NASA; лимит программы при отборе был $55 млн',
      en: 'final cost reported by NASA; the programme cap at selection was $55M',
    },
    orbit: { ru: 'полярная окололунная, около 100 км', en: 'polar lunar orbit, about 100 km' },
    payload: {
      ru: 'спектрометр HVM3 для поиска воды и тепловой картограф LTM',
      en: 'HVM3 spectrometer to find water and the LTM thermal mapper',
    },
    lesson: {
      ru: 'Lunar Trailblazer потеряли через день после запуска в 2025 году: солнечные батареи не развернулись к Солнцу, и аккумуляторы разрядились. Систему наведения батарей ни разу не испытали целиком в реальных условиях. Испытания — не формальность.',
      en: 'Lunar Trailblazer was lost a day after launch in 2025: its solar arrays never turned to the Sun and the batteries ran flat. The array-pointing system had never been tested end to end under real conditions. Testing is not a formality.',
    },
    sources: [
      { label: 'NASA: Lunar Trailblazer', url: 'https://science.nasa.gov/mission/lunar-trailblazer-fact-sheet' },
      { label: 'NASA launch press kit, 2025', url: 'https://epizodyspace.ru/bibl/inostr-yazyki/NASA-Press-Kit/2025/NASA_Lunar_Trailblazer_Launch_Press_Kit_2025.pdf' },
      { label: 'JPL: mission ends (cause)', url: 'https://www.jpl.nasa.gov/news/nasas-lunar-trailblazer-moon-mission-ends/' },
    ],
  },
  sentinel: {
    name: 'ACE (Advanced Composition Explorer)',
    agency: { ru: 'NASA, программа Explorer', en: 'NASA Explorer programme' },
    launched: 1997,
    massKg: 785,
    powerW: 443,
    powerNote: { ru: 'мощность солнечных батарей', en: 'solar array power' },
    lifeYears: 5,
    costM: null,
    costNote: { ru: 'надёжной опубликованной суммы нет', en: 'no reliable published figure' },
    orbit: { ru: 'точка Лагранжа L1, 1,5 млн км от Земли', en: 'Sun–Earth L1, 1.5 million km from Earth' },
    payload: {
      ru: 'девять приборов: состав частиц солнечного ветра и магнитометр',
      en: 'nine instruments: solar-wind particle composition and a magnetometer',
    },
    lesson: {
      ru: 'ACE рассчитывали на 5 лет, а он предупреждал о солнечных бурях больше 25 лет. Надёжная платформа окупается годами работы.',
      en: 'ACE was built for five years and went on warning of solar storms for more than 25 years. A reliable platform pays off in years of service.',
    },
    sources: [
      { label: 'NASA: ACE', url: 'https://science.nasa.gov/mission/ace' },
      { label: 'Caltech: ACE brochure', url: 'https://izw1.caltech.edu/ACE/ASC/DATA/ACEbrochure/ACEbrochure-2nd-ed8.pdf' },
    ],
  },
  marsweather: {
    name: 'MAVEN',
    agency: { ru: 'NASA', en: 'NASA' },
    launched: 2013,
    massKg: 2454,
    powerW: 1135,
    powerNote: { ru: 'солнечные батареи, когда Марс дальше всего от Солнца', en: 'solar arrays, with Mars farthest from the Sun' },
    lifeYears: 1,
    costM: 582,
    costNote: {
      ru: 'постройка, запуск и основная миссия; другие источники называют до $671 млн',
      en: 'build, launch and prime mission; other sources give up to $671M',
    },
    orbit: { ru: 'вытянутая орбита Марса, 150 × 6 200 км', en: 'elliptical Mars orbit, 150 × 6,200 km' },
    payload: {
      ru: 'восемь приборов: спектрометры атмосферы, магнитометр, анализаторы частиц',
      en: 'eight instruments: atmosphere spectrometers, a magnetometer, particle analysers',
    },
    lesson: {
      ru: 'Две трети стартовой массы MAVEN — топливо: чтобы затормозить у Марса, нужна огромная скорость. Как и в игре, дальняя орбита — это прежде всего тонны топлива.',
      en: 'Two-thirds of MAVEN’s launch mass was propellant: braking into Mars orbit takes a huge change in speed. As in the game, a distant orbit means tonnes of fuel first.',
    },
    sources: [
      { label: 'NASA: MAVEN', url: 'https://science.nasa.gov/mission/maven' },
      { label: 'NASA MAVEN fact sheet, 2013', url: 'https://www.nasa.gov/sites/default/files/files/MAVENFactSheetRev11_2013.pdf' },
    ],
  },
};

export const realMissionFor = (scenarioId: string): RealMission | null => REAL_MISSIONS[scenarioId] ?? null;
