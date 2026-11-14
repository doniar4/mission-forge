import type { AscentEventId } from '../engine/ascent';
import type { L } from '../engine/types';

/** What each moment of the launch is, and why it happens — shown as it happens. */
export const ASCENT_NOTES: Record<AscentEventId, { title: L; note: L }> = {
  liftoff: {
    title: { ru: 'Отрыв от стартового стола', en: 'Lift-off' },
    note: {
      ru: 'Тяга двигателей стала больше веса ракеты. Первые секунды она разгоняется медленно: почти вся её масса — топливо.',
      en: 'Thrust now exceeds the rocket’s weight. It gathers speed slowly at first: nearly all of its mass is propellant.',
    },
  },
  maxq: {
    title: { ru: 'Максимальный скоростной напор', en: 'Max Q: peak air pressure' },
    note: {
      ru: 'Скорость уже большая, а воздух ещё плотный — на корпус давит наибольшая сила. Выше воздух редеет, и нагрузка спадает.',
      en: 'Speed is already high while the air is still thick, so the airframe feels its greatest load. Higher up the air thins and the load eases.',
    },
  },
  boosters: {
    title: { ru: 'Отделение ускорителей', en: 'Booster separation' },
    note: {
      ru: 'Боковые ускорители выработали топливо. Пустой бак — лишний груз, который пришлось бы разгонять дальше.',
      en: 'The strap-on boosters are empty. An empty tank is dead weight that would have to be accelerated all the way up.',
    },
  },
  meco: {
    title: { ru: 'Отключение первой ступени', en: 'Main engine cut-off' },
    note: {
      ru: 'Первая ступень вынесла ракету из плотной атмосферы и дала первые километры в секунду. Её работа закончена.',
      en: 'The first stage has lifted the rocket out of the thick air and given it its first kilometres per second. Its job is done.',
    },
  },
  separation: {
    title: { ru: 'Разделение ступеней', en: 'Stage separation' },
    note: {
      ru: 'По формуле Циолковского выгоднее сбросить пустую ступень, чем везти её дальше: чем легче остаток, тем больше скорости даёт каждый килограмм топлива.',
      en: 'The rocket equation rewards dropping an empty stage: the lighter what remains, the more speed each kilogram of propellant buys.',
    },
  },
  ignition2: {
    title: { ru: 'Запуск второй ступени', en: 'Second-stage ignition' },
    note: {
      ru: 'Вторая ступень почти не набирает высоту — она разгоняет аппарат вдоль Земли. Орбита — это прежде всего скорость, а не высота.',
      en: 'The second stage barely climbs — it accelerates the spacecraft sideways. An orbit is mostly about speed, not height.',
    },
  },
  fairing: {
    title: { ru: 'Сброс головного обтекателя', en: 'Fairing jettison' },
    note: {
      ru: 'Выше 110 км воздуха почти нет: защищать аппарат от потока больше не нужно, а лишние килограммы отнимают скорость.',
      en: 'Above 110 km there is almost no air: the spacecraft no longer needs shielding, and every spare kilogram costs speed.',
    },
  },
  seco: {
    title: { ru: 'Опорная орбита достигнута', en: 'Parking orbit reached' },
    note: {
      ru: 'Скорость 7,8 км/с: аппарат всё время падает на Землю — и всё время промахивается мимо неё. Двигатель выключен.',
      en: 'At 7.8 km/s the spacecraft is always falling towards Earth — and always missing it. The engine is off.',
    },
  },
  deploy: {
    title: { ru: 'Отделение аппарата', en: 'Spacecraft separation' },
    note: {
      ru: 'Аппарат отделился от ступени. Теперь он сам раскрывает солнечные панели и ищет Землю антенной.',
      en: 'The spacecraft has left the stage. From here it unfolds its own arrays and looks for Earth with its antenna.',
    },
  },
  failure: {
    title: { ru: 'Авария носителя', en: 'Launch failure' },
    note: {
      ru: 'Двигатель разрушился в полёте. Надёжность ракеты — это доля запусков, которые заканчиваются иначе.',
      en: 'An engine came apart in flight. A rocket’s reliability is the share of launches that end differently.',
    },
  },
};

/** The order of the launch timeline shown beside the scene. */
export const ASCENT_ORDER: AscentEventId[] = ['liftoff', 'maxq', 'boosters', 'meco', 'separation', 'ignition2', 'fairing', 'seco', 'deploy'];
