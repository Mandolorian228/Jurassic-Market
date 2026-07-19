/**
 * Модель игровых локаций.
 * Клетки идут по часовой стрелке с верхнего левого угла (индекс 0).
 * Мальта + карты по бумажным фото: BioSyn → Isla Sorna → Сен-Юбер →
 * Сан-Альбертус → Сенегал (лаборатория).
 * На каждой локации состав клеток и цены — как на оригинальном рисунке.
 */
(function () {
const CELL_TYPES = {
  START: 'start',
  EMPTY: 'empty',
  PROPERTY: 'property',
  MONEY: 'money',
  CHARACTER: 'character',
  EVENT: 'event',
  CORNER: 'corner',
};

const AGENT = {
  type: CELL_TYPES.CHARACTER,
  label: 'Агент',
  effect: 'sell',
  description:
    'Продажа: цена покупки + $1000. Агрессия или интеллект: ещё +25% цены особи. Дрессированный: +50%.',
};

const SOYONA = {
  type: CELL_TYPES.CHARACTER,
  label: 'Soyona Santos',
  sublabel: '+$5000',
  effect: 'sell',
  sellBonus: 5000,
  description:
    'Продажа: цена покупки + $5000. Агрессия или интеллект: ещё +25% цены особи. Дрессированный: +50%.',
};

/** Угол тюрьмы (сюда отправляют при аресте). */
const FIGHTS_PRISON = {
  type: CELL_TYPES.CORNER,
  label: 'Тюрьма',
  sublabel: 'Заключение',
  effect: 'fights',
  description: 'Выйти из заключения: $2000 или пропустить один ход.',
};

/** Арена: принудительный бой с игроком на любой Арене (даже на другой карте). */
const ARENA_CELL = {
  type: CELL_TYPES.CORNER,
  label: 'Арена',
  sublabel: 'Бой',
  effect: 'arena',
  arenaReward: 3000,
  description:
    'Принудительный бой с другим игроком, стоящим на любой клетке «Арена» (в том числе на другой локации). Отказ невозможен. Победитель получает $3000.',
};

/** Рацион: влияет на привлекательность (dietScore × 2). */
const DIET = {
  HERBIVORE: 'herbivore',
  CARNIVORE: 'carnivore',
  OMNIVORE: 'omnivore',
  PISCIVORE: 'piscivore',
};

const DIET_LABELS = {
  herbivore: 'растительноядный',
  carnivore: 'плотоядный',
  omnivore: 'всеядный',
  piscivore: 'рыбоядный',
};

/** Вклад рациона в ★ (1–10). */
const DIET_SCORE = {
  herbivore: 3,
  omnivore: 5,
  piscivore: 7,
  carnivore: 8,
};

/**
 * Статы динозавра: size, fame, diet, flies (летающие).
 * ★ ≈ size×4 + fame×4 + dietScore×2 + (полёт ? 5 : 0).
 */
const DINO_FILM_STATS = {
  Компсогнат: { size: 1, fame: 6, diet: DIET.CARNIVORE },
  Dimorphodon: { size: 3, fame: 4, diet: DIET.PISCIVORE, flies: true },
  Pteranodon: { size: 5, fame: 7, diet: DIET.PISCIVORE, flies: true },
  Птеранодон: { size: 5, fame: 7, diet: DIET.PISCIVORE, flies: true },
  Atrociraptor: { size: 4, fame: 5, diet: DIET.CARNIVORE },
  Velociraptor: { size: 4, fame: 10, diet: DIET.CARNIVORE },
  Велоцираптор: { size: 4, fame: 10, diet: DIET.CARNIVORE },
  Carnotaurus: { size: 7, fame: 6, diet: DIET.CARNIVORE },
  Карнотавр: { size: 7, fame: 6, diet: DIET.CARNIVORE },
  Allosaurus: { size: 7, fame: 5, diet: DIET.CARNIVORE },
  Аллозавр: { size: 7, fame: 5, diet: DIET.CARNIVORE },
  Кетцалькоатль: { size: 9, fame: 6, diet: DIET.PISCIVORE, flies: true },
  Паразауролоф: { size: 5, fame: 5, diet: DIET.HERBIVORE },
  Трицератопс: { size: 6, fame: 8, diet: DIET.HERBIVORE },
  Анкилозавр: { size: 5, fame: 6, diet: DIET.HERBIVORE },
  Стегозавр: { size: 6, fame: 7, diet: DIET.HERBIVORE },
  Брахиозавр: { size: 9, fame: 9, diet: DIET.HERBIVORE },
  Дилофозавр: { size: 4, fame: 9, diet: DIET.CARNIVORE },
  Пирораптор: { size: 4, fame: 7, diet: DIET.CARNIVORE },
  Теризинозавр: { size: 7, fame: 6, diet: DIET.HERBIVORE },
  // Урон/★ чуть выше формулы size/fame: в фильме спинозавр победил T-Rex
  Гиганотозавр: { size: 9, fame: 11, diet: DIET.CARNIVORE, attractiveness: 90, damage: 38 },
  Гигантозавр: { size: 9, fame: 11, diet: DIET.CARNIVORE, attractiveness: 90, damage: 38 },
  Тираннозавр: { size: 9, fame: 10, diet: DIET.CARNIVORE },
  Спинозавр: { size: 9, fame: 11, diet: DIET.PISCIVORE, attractiveness: 93, damage: 40 },
  Мозазавр: { size: 10, fame: 8, diet: DIET.PISCIVORE },
  Титанозавр: { size: 9, fame: 5, diet: DIET.HERBIVORE },
  /**
   * Дистортус Рекс (Rebirth) — мутировавший «король», сильнее обычных гибридов.
   * Дороже и мощнее Индоминуса: потолок цены/боя на карте.
   */
  'Дистортус Рекс': {
    size: 10,
    fame: 11,
    diet: DIET.CARNIVORE,
    attractiveness: 100,
    damage: 50,
    maxHp: 180,
  },
  /**
   * Индоминус Рекс — гибрид Jurassic World (~16.9 м).
   * По силе равен прежнему Дистортусу (до усиления): ★96, урон 42.
   * Награда инкубатора Сенегала.
   */
  'Индоминус Рекс': {
    size: 10,
    fame: 10,
    diet: DIET.CARNIVORE,
    attractiveness: 96,
    damage: 42,
    maxHp: 150,
    description:
      'Лабораторный гибрид (~17 м): сила тираннозавра, размер гигантозавра, ум велоцираптора, броня и длинные когти. Маскировка и скрытие тепла.',
  },
  Мутадон: { size: 5, fame: 6, diet: DIET.CARNIVORE, flies: true },
  Диметродон: { size: 5, fame: 6, diet: DIET.CARNIVORE },
  'Морос интрепид': { size: 1, fame: 5, diet: DIET.CARNIVORE },
  Дейноних: { size: 4, fame: 7, diet: DIET.CARNIVORE },
  Монолофозавр: { size: 5, fame: 5, diet: DIET.CARNIVORE },
  Стигимолох: { size: 4, fame: 7, diet: DIET.HERBIVORE },
  Насутоцератопс: { size: 5, fame: 6, diet: DIET.HERBIVORE },
  Синоцератопс: { size: 6, fame: 7, diet: DIET.HERBIVORE },
  Барионикс: { size: 7, fame: 8, diet: DIET.PISCIVORE },
  Зухомим: { size: 8, fame: 6, diet: DIET.PISCIVORE },
  Беклеспинакс: { size: 7, fame: 4, diet: DIET.CARNIVORE },
};

/**
 * ★ = размер×4 + экран×4 + рацион×2 + бонус за полёт (5).
 * Рацион влияет частично; у летающих дополнительно отмечен полёт.
 */
function calcAttractiveness(size, fame, diet = DIET.OMNIVORE, flies = false) {
  const dietScore = DIET_SCORE[diet] != null ? DIET_SCORE[diet] : 5;
  const base = size * 4 + fame * 4 + dietScore * 2 + (flies ? 5 : 0);
  return Math.max(10, Math.min(100, base));
}

/**
 * Цена от привлекательности (баланс при старте $15 000, цель $125 000).
 * ★≈30 → $500, ★55 → ~$5 000, ★70 → ~$11 000, ★100 → $30 000.
 * Кривая квадратичная: мелкие доступны сразу, топы — поздняя цель.
 */
function priceFromAttractiveness(attractiveness) {
  const attr = Number(attractiveness);
  const a = Number.isFinite(attr) ? attr : 50;
  const t = Math.max(0, Math.min(1, (a - 25) / 75));
  const raw = 500 + t * t * 29500;
  return Math.max(500, Math.round(raw / 500) * 500);
}

/** Боевые статы от размера/славы: HP и урон за атаку. */
function calcCombatStats(size = 5, fame = 5) {
  const s = Number(size) || 5;
  const f = Number(fame) || 5;
  return {
    maxHp: Math.max(30, Math.round(30 + s * 12)),
    damage: Math.max(6, Math.round(6 + f * 3)),
  };
}

function dino(label) {
  const stats = DINO_FILM_STATS[label] || {
    size: 5,
    fame: 5,
    diet: DIET.OMNIVORE,
    flies: false,
  };
  const diet = stats.diet || DIET.OMNIVORE;
  const flies = Boolean(stats.flies);
  const attractiveness =
    stats.attractiveness != null
      ? Math.max(10, Math.min(100, Number(stats.attractiveness)))
      : calcAttractiveness(stats.size, stats.fame, diet, flies);
  const combat = calcCombatStats(stats.size, stats.fame);
  if (stats.damage != null) combat.damage = Math.max(1, Number(stats.damage) || combat.damage);
  if (stats.maxHp != null) combat.maxHp = Math.max(1, Number(stats.maxHp) || combat.maxHp);
  const cell = {
    type: CELL_TYPES.PROPERTY,
    label,
    price: priceFromAttractiveness(attractiveness),
    size: stats.size,
    fame: stats.fame,
    diet,
    dietLabel: DIET_LABELS[diet] || diet,
    flies,
    attractiveness,
    maxHp: combat.maxHp,
    damage: combat.damage,
  };
  if (stats.description) cell.description = stats.description;
  return cell;
}

function empty() {
  return { type: CELL_TYPES.EMPTY };
}

function money(sublabel = 'Бонус') {
  return { type: CELL_TYPES.MONEY, label: '$', sublabel };
}

/** Собирает клетки (по умолчанию 40) и считает доход для динозавров. */
function makeCells(list, expectedLength = 40) {
  if (list.length !== expectedLength) {
    throw new Error(`Ожидалось ${expectedLength} клеток, получено ${list.length}`);
  }
  return list.map((cell, i) => {
    const merged = { ...cell, index: i };
    if (merged.type === CELL_TYPES.PROPERTY && merged.price != null && merged.income == null) {
      merged.income = Math.max(50, Math.round(merged.price * 0.1));
    }
    return merged;
  });
}

/** Шаблон Мальты (IMG_2102) — эталон механики. */
function createBoardCells(overrides) {
  const defaults = [
    { type: CELL_TYPES.START, label: 'СТАРТ', sublabel: '+2000' },
    empty(), empty(), empty(), empty(), empty(),
    dino('Компсогнат'),
    money('Бонус'),
    empty(), empty(),
    { ...FIGHTS_PRISON },
    empty(), empty(), empty(),
    dino('Dimorphodon'),
    empty(), empty(),
    dino('Pteranodon'),
    empty(), empty(),
    { ...ARENA_CELL },
    empty(), empty(), empty(), empty(),
    dino('Atrociraptor'),
    dino('Velociraptor'),
    empty(), empty(), empty(),
    {
      type: CELL_TYPES.EVENT,
      label: 'Полиция!',
      sublabel: '→ Тюрьма',
      effect: 'jail',
      description:
        'Увы, кто-то заявил о вас и вашей работе в полицию. Вы отправляетесь в тюрьму.',
    },
    dino('Carnotaurus'),
    { ...AGENT }, { ...AGENT }, { ...AGENT },
    dino('Allosaurus'),
    { ...AGENT }, { ...AGENT },
    money('13000'),
    { ...SOYONA },
  ];

  return defaults.map((cell, i) => {
    const merged = { ...cell, ...(overrides[i] || {}), index: i };
    if (merged.type === CELL_TYPES.PROPERTY && merged.price != null && merged.income == null) {
      merged.income = Math.max(50, Math.round(merged.price * 0.1));
    }
    return merged;
  });
}

/**
 * IMG_2103 — BioSyn, Доломиты.
 * По фото: Кетцалькоатль → бои → травоядные слева → гиганты внизу →
 * Dilophosaurus / Microraptor справа → тюрьма BioSyn → $ и Компсогнат.
 */
function cellsBioSyn() {
  return makeCells([
    // 0–9 top
    { type: CELL_TYPES.START, label: 'СТАРТ', sublabel: '+2000' },
    empty(),
    dino('Кетцалькоатль'),
    empty(),
    dino('Паразауролоф'),
    empty(),
    dino('Трицератопс'),
    dino('Анкилозавр'),
    dino('Стегозавр'),
    empty(),
    // 10 TR — тюрьма
    { ...FIGHTS_PRISON },
    // 11–19 right
    dino('Брахиозавр'),
    empty(),
    empty(),
    dino('Дилофозавр'),
    empty(),
    empty(),
    dino('Пирораптор'),
    empty(),
    empty(),
    // 20 BR — Арена
    { ...ARENA_CELL },
    // 21–29 bottom (визуально справа налево)
    empty(),
    dino('Теризинозавр'),
    dino('Гиганотозавр'),
    dino('Тираннозавр'),
    dino('Диметродон'),
    empty(),
    money('Дождик'),
    money('Бонус'),
    empty(),
    // 30 BL — тюрьма BioSyn
    {
      type: CELL_TYPES.EVENT,
      label: 'BioSyn!',
      sublabel: '→ Тюрьма',
      effect: 'jail',
      description:
        'Увы, т.к. вы замешаны в делах BioSyn, вы отправляетесь в тюрьму.',
    },
    // 31–39 left — перед стартом 5 агентов (как на бумажной карте)
    dino('Компсогнат'),
    money('Бонус'),
    empty(),
    empty(),
    { ...AGENT },
    { ...AGENT },
    { ...AGENT },
    { ...AGENT },
    { ...AGENT },
  ]);
}

/**
 * IMG_2104 — Isla Sorna, Объект Б.
 * По фото: Спинозавр / T-Rex / стадо → Арена → Компсогнат / Дилофо /
 * Велоцираптор / Птеранодон → Ян Малкольм и $ → Штраф $10000.
 */
function cellsIslaSorna() {
  return makeCells([
    { type: CELL_TYPES.START, label: 'СТАРТ', sublabel: '+2000' },
    dino('Спинозавр'),
    dino('Тираннозавр'),
    empty(),
    dino('Анкилозавр'),
    dino('Трицератопс'),
    dino('Брахиозавр'),
    dino('Стегозавр'),
    dino('Паразауролоф'),
    empty(),
    { ...FIGHTS_PRISON },
    empty(),
    empty(),
    dino('Компсогнат'),
    empty(),
    dino('Дилофозавр'),
    empty(),
    dino('Велоцираптор'),
    empty(),
    dino('Птеранодон'),
    { ...ARENA_CELL },
    empty(),
    empty(),
    empty(),
    empty(),
    { ...AGENT },
    { ...AGENT },
    { ...AGENT },
    {
      type: CELL_TYPES.CHARACTER,
      label: 'Ян Малкольм',
      effect: 'sell',
      description: 'Можно продать любого своего динозавра за цену покупки + $1000.',
    },
    money('Бонус'),
    {
      type: CELL_TYPES.EVENT,
      label: 'Штраф!',
      sublabel: '→ Тюрьма',
      effect: 'jail',
      fine: 10000,
      description:
        'Вы должны заплатить штраф $10 000, т.к. находитесь в запретной зоне. Вы отправляетесь в тюрьму.',
    },
    empty(),
    empty(),
    empty(),
    empty(),
    empty(),
    empty(),
    empty(),
    empty(),
    empty(),
  ]);
}

/**
 * IMG_2105 — Остров Сен-Юбер, лаборатория InGen.
 * По фото от СТАРТ по кругу: $ и крупные водные/сухопутные динозавры справа,
 * ? внизу, гибриды и хищники слева. Боёв и Soyona на рисунке нет.
 */
function cellsSaintHubert() {
  return makeCells([
    { type: CELL_TYPES.START, label: 'СТАРТ', sublabel: '+2000' },
    money('Бонус'),
    dino('Мозазавр'),
    empty(),
    dino('Спинозавр'),
    empty(),
    dino('Титанозавр'),
    empty(),
    dino('Брахиозавр'),
    empty(),
    // 10 TR — Арена
    { ...ARENA_CELL },
    dino('Стегозавр'),
    empty(),
    dino('Анкилозавр'),
    empty(),
    dino('Трицератопс'),
    empty(),
    empty(),
    empty(),
    empty(),
    empty(),
    empty(),
    empty(),
    empty(),
    empty(),
    dino('Дистортус Рекс'),
    empty(),
    dino('Мутадон'),
    dino('Дилофозавр'),
    empty(),
    // 30 — клетка «?» с фото
    {
      type: CELL_TYPES.EVENT,
      label: '?',
      sublabel: 'Событие',
      effect: 'mystery',
      description: 'Неизвестное событие на заброшенной территории InGen.',
    },
    empty(),
    dino('Кетцалькоатль'),
    empty(),
    empty(),
    dino('Тираннозавр'),
    empty(),
    dino('Велоцираптор'),
    empty(),
    empty(),
  ]);
}

const LOCATIONS = [
  {
    id: 'malta',
    name: 'Мальта',
    subtitle: 'О. Мальта, Valletta, Чёрный рынок',
    theme: {
      '--board-bg': '#0d2818',
      '--board-border': '#1b4332',
      '--center-bg': 'linear-gradient(135deg, #1b4332 0%, #081c15 50%, #1b4332 100%)',
      '--cell-empty': 'linear-gradient(180deg, #2d6a4f 0%, #1b4332 100%)',
      '--cell-property': 'linear-gradient(180deg, #40916c 0%, #2d6a4f 100%)',
      '--cell-danger': 'linear-gradient(180deg, #9b2226 0%, #660708 100%)',
      '--cell-bonus': 'linear-gradient(180deg, #ee9b00 0%, #ca6702 100%)',
      '--cell-start': 'linear-gradient(180deg, #52b788 0%, #2d6a4f 100%)',
      '--cell-character': 'linear-gradient(180deg, #5a189a 0%, #3c096c 100%)',
      '--accent': '#95d5b2',
      '--text': '#d8f3dc',
      '--water': '#0077b6',
    },
    center: {
      mapTitle: 'Valletta',
      mapSubtitle: 'Чёрный рынок',
      image: 'img/malta-valletta.png',
    },
    cells: createBoardCells([]),
  },

  {
    id: 'biosyn-dolomites',
    name: 'BioSyn',
    subtitle: 'Италия, Доломитовые Альпы, заповедник BioSyn',
    theme: {
      '--board-bg': '#0e1a22',
      '--board-border': '#1e3a4c',
      '--center-bg': 'linear-gradient(135deg, #1a3344 0%, #0a1520 50%, #1a3344 100%)',
      '--cell-empty': 'linear-gradient(180deg, #2a4a5c 0%, #1a3344 100%)',
      '--cell-property': 'linear-gradient(180deg, #3d7ea6 0%, #2a5a7a 100%)',
      '--cell-danger': 'linear-gradient(180deg, #8b1e1e 0%, #4a0f0f 100%)',
      '--cell-bonus': 'linear-gradient(180deg, #c4a035 0%, #8a7020 100%)',
      '--cell-start': 'linear-gradient(180deg, #5a9bb8 0%, #2f6f8f 100%)',
      '--cell-character': 'linear-gradient(180deg, #4a3d6d 0%, #2e2548 100%)',
      '--accent': '#7eb8d4',
      '--text': '#e4eef4',
      '--water': '#2a6f8f',
    },
    center: {
      mapTitle: 'BioSyn Genetics',
      mapSubtitle: 'Доломитовые Альпы',
      image: 'img/biosyn-genetics.png',
    },
    cells: cellsBioSyn(),
  },

  {
    id: 'isla-sorna',
    name: 'Isla Sorna',
    subtitle: 'Коста-Рика, остров Сорна, Объект Б',
    theme: {
      '--board-bg': '#0c1a0c',
      '--board-border': '#1e3d1e',
      '--center-bg': 'linear-gradient(135deg, #1a3d1a 0%, #0a180a 50%, #1a3d1a 100%)',
      '--cell-empty': 'linear-gradient(180deg, #2d5a2d 0%, #1a3d1a 100%)',
      '--cell-property': 'linear-gradient(180deg, #4a8f3c 0%, #2f6b28 100%)',
      '--cell-danger': 'linear-gradient(180deg, #9b2226 0%, #5c1012 100%)',
      '--cell-bonus': 'linear-gradient(180deg, #e0b000 0%, #b8860b 100%)',
      '--cell-start': 'linear-gradient(180deg, #6bbf5a 0%, #3d8f30 100%)',
      '--cell-character': 'linear-gradient(180deg, #5a3d2e 0%, #3a281c 100%)',
      '--accent': '#8fdf7a',
      '--text': '#e8f5e4',
      '--water': '#1a5a6e',
    },
    center: {
      mapTitle: 'Site B',
      mapSubtitle: 'InGen · Isla Sorna',
      image: 'img/isla-sorna.png',
    },
    cells: cellsIslaSorna(),
  },

  {
    id: 'saint-hubert',
    name: 'Сен-Юбер',
    subtitle: 'Остров Сен-Юбер, заброшенная лаборатория InGen',
    theme: {
      '--board-bg': '#12100e',
      '--board-border': '#3a3228',
      '--center-bg': 'linear-gradient(135deg, #2a241c 0%, #100e0c 50%, #2a241c 100%)',
      '--cell-empty': 'linear-gradient(180deg, #3a342c 0%, #242018 100%)',
      '--cell-property': 'linear-gradient(180deg, #8b6914 0%, #5c450c 100%)',
      '--cell-danger': 'linear-gradient(180deg, #6b1a1a 0%, #3a0c0c 100%)',
      '--cell-bonus': 'linear-gradient(180deg, #c9a227 0%, #8a6e14 100%)',
      '--cell-start': 'linear-gradient(180deg, #6a5a40 0%, #3d3428 100%)',
      '--cell-character': 'linear-gradient(180deg, #4a3048 0%, #2e1c2e 100%)',
      '--accent': '#d4b45a',
      '--text': '#f0e6d0',
      '--water': '#1a3040',
    },
    center: {
      mapTitle: 'InGen Lab',
      mapSubtitle: 'Abandoned Facility',
      image: 'img/saint-hubert.png',
    },
    cells: cellsSaintHubert(),
  },

  {
    id: 'san-albertus',
    name: 'Полуостров Сан-Альбертус',
    subtitle: 'Катакомбы города',
    /** По фото IMG_2106: top/bottom=3, left/right=3 → 16 клеток */
    boardLayout: { sideH: 3, sideV: 3 },
    theme: {
      '--board-bg': '#1a1512',
      '--board-border': '#3d3228',
      '--center-bg': 'linear-gradient(145deg, #2a221c 0%, #12100e 45%, #1f1914 100%)',
      '--cell-empty': 'linear-gradient(180deg, #3a322c 0%, #241e18 100%)',
      '--cell-property': 'linear-gradient(180deg, #6b5344 0%, #4a382c 100%)',
      '--cell-danger': 'linear-gradient(180deg, #6b1a1a 0%, #3a0c0c 100%)',
      '--cell-bonus': 'linear-gradient(180deg, #b8860b 0%, #8a6508 100%)',
      '--cell-start': 'linear-gradient(180deg, #8a7355 0%, #5c4a38 100%)',
      '--cell-character': 'linear-gradient(180deg, #4a3d48 0%, #2e242c 100%)',
      '--accent': '#c4a882',
      '--text': '#ebe0d0',
      '--water': '#2a2420',
    },
    center: {
      mapTitle: 'Катакомбы города',
      mapSubtitle: 'Полуостров Сан-Альбертус',
      image: 'img/san-albertus-catacombs.png',
    },
    cells: cellsSanAlbertus(),
  },

  {
    id: 'senegal-lab',
    name: 'Сенегал',
    subtitle: 'Подземная лаборатория',
    boardLayout: { sideH: 3, sideV: 2 },
    theme: {
      '--board-bg': '#0a1218',
      '--board-border': '#1e3a4a',
      '--center-bg': 'linear-gradient(145deg, #152a38 0%, #0a141c 50%, #1a3040 100%)',
      '--cell-empty': 'linear-gradient(180deg, #243848 0%, #152830 100%)',
      '--cell-property': 'linear-gradient(180deg, #2a6a7a 0%, #1a4550 100%)',
      '--cell-danger': 'linear-gradient(180deg, #8b1e3a 0%, #4a0f20 100%)',
      '--cell-bonus': 'linear-gradient(180deg, #3d8b9a 0%, #2a5a68 100%)',
      '--cell-start': 'linear-gradient(180deg, #4a9aab 0%, #2a6a7a 100%)',
      '--cell-character': 'linear-gradient(180deg, #3a4a6d 0%, #242e48 100%)',
      '--accent': '#7ec8d8',
      '--text': '#e0f0f4',
      '--water': '#1a4050',
    },
    center: {
      mapTitle: 'Подземная лаборатория',
      mapSubtitle: 'Сенегал',
      image: 'img/senegal-lab.png',
    },
    cells: cellsSenegalLab(),
  },
];

/** Виды ДНК на Сенегале (1 образец каждого нужен для синтеза). */
const SENEGAL_DNA_SPECIES = [
  'Велоцираптор',
  'Тираннозавр',
  'Карнотавр',
  'Аллозавр',
  'Гигантозавр',
];
const DNA_SAMPLE_LIMIT = 3;
const INCUBATOR_DINO_LABEL = 'Индоминус Рекс';
const SENEGAL_LOCATION_ID = 'senegal-lab';

function dnaPriceFromDinoPrice(price) {
  return Math.max(10, Math.round((Number(price) * 0.3) / 10) * 10);
}

function dnaAttractivenessFromDino(attr) {
  return Math.max(1, Math.round(Number(attr) * 0.3));
}

/**
 * IMG_2107 — Сенегал, подземная лаборатория.
 */
function cellsSenegalLab() {
  return makeCells(
    [
      { type: CELL_TYPES.START, label: 'СТАРТ', sublabel: '+2000' },
      {
        type: CELL_TYPES.CORNER,
        label: 'Инкубатор',
        sublabel: 'ДНК',
        effect: 'incubator',
        incubateCost: 0,
        description:
          'Соберите по образцу ДНК каждого вида Сенегала (до 3 шт. каждого). При полном наборе синтез Индоминус Рекса бесплатен.',
      },
      { ...dino('Велоцираптор'), offersDna: true },
      { ...dino('Тираннозавр'), offersDna: true },
      { ...dino('Карнотавр'), offersDna: true },
      {
        type: CELL_TYPES.CORNER,
        label: 'Показатели',
        sublabel: 'Отдых',
        effect: 'rest',
        description: 'Показатели выступления активов. Отдохните.',
      },
      { ...dino('Аллозавр'), offersDna: true },
      { ...dino('Гигантозавр'), offersDna: true },
      {
        type: CELL_TYPES.EVENT,
        label: 'Дрессировка',
        sublabel: '$5000',
        effect: 'training',
        trainBonus: 5,
        trainCost: 5000,
        description:
          'За $5000 выберите любого своего динозавра с любой локации: +5 к привлекательности. Дрессированный даёт +50% к цене при продаже агенту.',
      },
      {
        type: CELL_TYPES.EVENT,
        label: 'Дрессировка',
        sublabel: '$5000',
        effect: 'training',
        trainBonus: 5,
        trainCost: 5000,
        description:
          'За $5000 выберите любого своего динозавра с любой локации: +5 к привлекательности. Дрессированный даёт +50% к цене при продаже агенту.',
      },
      { ...ARENA_CELL },
      {
        type: CELL_TYPES.EVENT,
        label: 'Дрессировка',
        sublabel: '$5000',
        effect: 'training',
        trainBonus: 5,
        trainCost: 5000,
        description:
          'За $5000 выберите любого своего динозавра с любой локации: +5 к привлекательности. Дрессированный даёт +50% к цене при продаже агенту.',
      },
      {
        type: CELL_TYPES.MONEY,
        label: '$',
        sublabel: '3000',
        amount: 3000,
        description: 'Бонус лаборатории $3000.',
      },
      {
        type: CELL_TYPES.EVENT,
        label: 'Эксперимент',
        sublabel: '$3000',
        effect: 'experiment',
        trainBonus: 5,
        trainCost: 3000,
        description:
          'За $3000: интеллект ↑★, агрессия ↑★ или смерть. Можно выбрать любого своего динозавра с любой локации.',
      },
    ],
    14
  );
}

/**
 * IMG_2106 — п-ов Сан-Альбертус.
 * По часовой: старт → динозавры → кафе → … → атроцирапторы →
 * сино/барио → штраф → зухомим / беклеспинакс → ресторан.
 */
function cellsSanAlbertus() {
  return makeCells(
    [
      // 0 TL
      { type: CELL_TYPES.START, label: 'СТАРТ', sublabel: '+2000' },
      // 1–3 top
      dino('Морос интрепид'),
      dino('Дейноних'),
      dino('Монолофозавр'),
      // 4 TR — кафе (клетка «Выход» убрана)
      {
        type: CELL_TYPES.CORNER,
        label: 'Кафе',
        sublabel: 'Отдых',
        effect: 'rest',
        description: 'Отдохните, выпейте кофе.',
      },
      // 5–7 right — Арена у кафе
      { ...ARENA_CELL },
      dino('Стигимолох'),
      dino('Насутоцератопс'),
      // 8 BR
      {
        type: CELL_TYPES.EVENT,
        label: 'Атроцирапторы!',
        sublabel: '→ Старт',
        effect: 'return_start',
        description:
          'На вас кто-то натравил атроцирапторов. Вернитесь на старт.',
      },
      // 9–11 bottom (визуально справа налево)
      dino('Синоцератопс'),
      dino('Барионикс'),
      empty(),
      // 12 BL
      {
        type: CELL_TYPES.EVENT,
        label: 'Штраф',
        sublabel: '$5000',
        effect: 'fine',
        fine: 5000,
        description: 'Заплатите $5 000 с текущего баланса.',
      },
      // 13–15 left (визуально снизу вверх)
      dino('Зухомим'),
      dino('Беклеспинакс'),
      {
        type: CELL_TYPES.EVENT,
        label: 'Ресторан',
        sublabel: '−20%',
        effect: 'restaurant',
        taxPercent: 20,
        description:
          'Можно согласиться: −20% от текущего баланса и щит на круг — или отказаться.',
      },
    ],
    16
  );
}

/**
 * Учебный полигон: 20 клеток (sideH=4, sideV=4).
 * Не входит в LOCATIONS кампании — только режим обучения.
 */
function cellsTutorial() {
  return makeCells(
    [
      { type: CELL_TYPES.START, label: 'СТАРТ', sublabel: '+2000' },
      dino('Компсогнат'),
      empty(),
      money('Бонус'),
      dino('Велоцираптор'),
      {
        type: CELL_TYPES.CORNER,
        label: 'Отдых',
        sublabel: 'Пауза',
        effect: 'rest',
        description: 'Отдохните — ничего не происходит.',
      },
      dino('Дилофозавр'),
      empty(),
      { ...AGENT },
      empty(),
      {
        type: CELL_TYPES.EVENT,
        label: '?',
        sublabel: 'Событие',
        effect: 'mystery',
        description: 'Случайный бонус или штраф $1000.',
      },
      dino('Трицератопс'),
      empty(),
      dino('Стегозавр'),
      money('Бонус'),
      { ...FIGHTS_PRISON },
      empty(),
      {
        type: CELL_TYPES.EVENT,
        label: 'Штраф',
        sublabel: '$500',
        effect: 'fine',
        fine: 500,
        description: 'Небольшой штраф для обучения.',
      },
      dino('Тираннозавр'),
      empty(),
    ],
    20
  );
}

const TUTORIAL_LOCATION = {
  id: 'tutorial',
  name: 'Учебный полигон',
  subtitle: 'Обучение · 20 клеток',
  boardLayout: { sideH: 4, sideV: 4 },
  theme: {
    '--board-bg': '#0e1612',
    '--board-border': '#2d5a40',
    '--center-bg': 'linear-gradient(145deg, #1a2e24 0%, #0c1410 50%, #162820 100%)',
    '--cell-empty': 'linear-gradient(180deg, #2a3d34 0%, #1a2820 100%)',
    '--cell-property': 'linear-gradient(180deg, #3d6b4f 0%, #2a4a38 100%)',
    '--cell-danger': 'linear-gradient(180deg, #6b2a2a 0%, #3a1515 100%)',
    '--cell-bonus': 'linear-gradient(180deg, #a8862a 0%, #6b5518 100%)',
    '--cell-start': 'linear-gradient(180deg, #4a8a62 0%, #2e5a42 100%)',
    '--cell-character': 'linear-gradient(180deg, #3a4a5a 0%, #243038 100%)',
    '--accent': '#c9a227',
    '--text': '#e8f0e8',
    '--water': '#1a3028',
  },
  center: {
    mapTitle: 'Учебный полигон',
    mapSubtitle: 'Обучение основам',
    showDecorMap: true,
  },
  cells: cellsTutorial(),
};

/** Англ./варианты написания → канонический ключ вида. */
const SPECIES_ALIASES = {
  Velociraptor: 'Велоцираптор',
  Pteranodon: 'Птеранодон',
  Carnotaurus: 'Карнотавр',
  Allosaurus: 'Аллозавр',
  Гиганотозавр: 'Гигантозавр',
};

function normalizeSpeciesKey(label) {
  if (!label) return '';
  return SPECIES_ALIASES[label] || label;
}

/**
 * Каталог клеток вида по кампании: speciesKey → [{ locationId, cellIndex, label }].
 * Только статичные клетки локаций (без лабораторного Индоминуса).
 */
function buildSpeciesCatalog(locations) {
  const catalog = {};
  (locations || []).forEach((loc) => {
    if (!loc?.cells) return;
    loc.cells.forEach((cell, cellIndex) => {
      if (!cell || cell.type !== CELL_TYPES.PROPERTY || !cell.label) return;
      const key = normalizeSpeciesKey(cell.label);
      if (!catalog[key]) catalog[key] = [];
      catalog[key].push({
        locationId: loc.id,
        locationName: loc.name,
        cellIndex,
        label: cell.label,
      });
    });
  });
  return catalog;
}

let _speciesCatalogCache = null;
let _speciesCatalogSource = null;

function getSpeciesCatalog(locations) {
  const locs = locations || LOCATIONS;
  if (_speciesCatalogCache && _speciesCatalogSource === locs) return _speciesCatalogCache;
  _speciesCatalogCache = buildSpeciesCatalog(locs);
  _speciesCatalogSource = locs;
  return _speciesCatalogCache;
}

function getSpeciesSlotCount(label, locations) {
  const key = normalizeSpeciesKey(label);
  return (getSpeciesCatalog(locations)[key] || []).length;
}

window.GameData = {
  CELL_TYPES,
  LOCATIONS,
  TUTORIAL_LOCATION,
  DINO_FILM_STATS,
  DIET,
  DIET_LABELS,
  DIET_SCORE,
  calcAttractiveness,
  priceFromAttractiveness,
  calcCombatStats,
  createBoardCells,
  makeCells,
  ARENA_CELL,
  FIGHTS_PRISON,
  cellsBioSyn,
  cellsIslaSorna,
  cellsSaintHubert,
  cellsSanAlbertus,
  cellsSenegalLab,
  cellsTutorial,
  SENEGAL_DNA_SPECIES,
  DNA_SAMPLE_LIMIT,
  INCUBATOR_DINO_LABEL,
  SENEGAL_LOCATION_ID,
  dnaPriceFromDinoPrice,
  dnaAttractivenessFromDino,
  SPECIES_ALIASES,
  normalizeSpeciesKey,
  buildSpeciesCatalog,
  getSpeciesCatalog,
  getSpeciesSlotCount,
};
})();
