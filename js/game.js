(function () {
const {
  CELL_TYPES,
  SENEGAL_DNA_SPECIES = [],
  DNA_SAMPLE_LIMIT = 3,
  INCUBATOR_DINO_LABEL = 'Индоминус Рекс',
  SENEGAL_LOCATION_ID = 'senegal-lab',
  dnaPriceFromDinoPrice,
  dnaAttractivenessFromDino,
} = window.GameData;

const LAB_CELL_BASE = 900;

const PLAYER_COLORS = [
  '#e63946',
  '#457b9d',
  '#f4a261',
  '#2a9d8f',
  '#9b5de5',
  '#00bbf9',
  '#fee440',
  '#f15bb5',
];
const START_MONEY = 15000;
const MIN_OFFLINE_PLAYERS = 2;
const MAX_OFFLINE_PLAYERS = 6;
/** Размер классических локаций; фактический круг берётся из location.cells.length */
const TOTAL_CELLS = 40;

function getCellCount(gameOrLocation) {
  const cells = gameOrLocation?.location?.cells || gameOrLocation?.cells;
  const n = cells?.length;
  return n > 0 ? n : TOTAL_CELLS;
}
const INCOME_RATE = 0.1;
const SELL_BONUS = 1000;
/** Бонус продажи: агрессия или интеллект → +25% цены; дрессированный → +50%. */
const SELL_TRAIT_BONUS_RATE = 0.25;
const SELL_TRAINED_BONUS_RATE = 0.5;
const DEFAULT_TRAIN_COST = 5000;
const INCUBATE_COST = 0;
/** Лимит полных кругов на локации до блокировки хода. */
const LAPS_BEFORE_BLOCK = 2;
/** Награда победителю принудительного боя на Арене (из банка). */
const ARENA_REWARD = 3000;
/** Штраф за попадание на чужого динозавра: доля от дохода (с учётом сета ×2). */
const RENT_INCOME_RATE = 0.5;
/** Мёртвый динозавр покрывает штраф по этой доле цены. */
const DEAD_DINO_COVER_RATE = 0.75;
const JAIL_BAIL = 2000;
const WIN_GOAL = 125000;
const CHARACTER_NAME = 'Агент';

function getSellBonus(cell) {
  if (cell && cell.sellBonus != null) return cell.sellBonus;
  return SELL_BONUS;
}

const DEFAULT_PLAYERS = [
  { id: 0, name: 'Игрок 1', color: PLAYER_COLORS[0], money: START_MONEY, position: 0, inJail: false, eventShield: false, locationId: null },
  { id: 1, name: 'Игрок 2', color: PLAYER_COLORS[1], money: START_MONEY, position: 0, inJail: false, eventShield: false, locationId: null },
];

function nextOfflinePlayerId(game) {
  const used = new Set(game.players.map((p) => Number(p.id)));
  let id = 0;
  while (used.has(id)) id += 1;
  return id;
}

function nextOfflinePlayerName(game) {
  const used = new Set(game.players.map((p) => String(p.name)));
  let n = 1;
  while (used.has(`Игрок ${n}`)) n += 1;
  return `Игрок ${n}`;
}

function stripPlayerOwnership(game, playerId) {
  const pid = Number(playerId);
  syncOwnershipToCampaign(game);
  const campaign = ensureCampaign(game);
  Object.keys(campaign.ownershipByLocation || {}).forEach((locId) => {
    const map = campaign.ownershipByLocation[locId];
    if (!map) return;
    Object.keys(map).forEach((cellKey) => {
      if (Number(map[cellKey]) !== pid) return;
      delete map[cellKey];
      clearDinoMeta(game, locId, Number(cellKey));
    });
  });
  Object.keys(game.ownership || {}).forEach((cellKey) => {
    if (Number(game.ownership[cellKey]) === pid) {
      delete game.ownership[cellKey];
      clearDinoMeta(game, game.location.id, Number(cellKey));
    }
  });
  if (campaign.dnaByPlayer) delete campaign.dnaByPlayer[String(pid)];
}

/** Добавить игрока в офлайн hot-seat (2–6). */
function addOfflinePlayer(game) {
  if (!game || game.online || game.isTutorial) {
    return { success: false, reason: 'доступно только в офлайн-режиме' };
  }
  if (game.finished) return { success: false, reason: 'игра уже окончена' };
  if (game.players.length >= MAX_OFFLINE_PLAYERS) {
    return { success: false, reason: `максимум ${MAX_OFFLINE_PLAYERS} игроков` };
  }
  if (game.pendingAction || game.pendingTrade || game.pendingBattle) {
    return { success: false, reason: 'сначала завершите текущее действие / обмен / бой' };
  }

  const id = nextOfflinePlayerId(game);
  const locId = game.location?.id || null;
  const player = {
    id,
    name: nextOfflinePlayerName(game),
    color: PLAYER_COLORS[id % PLAYER_COLORS.length],
    money: START_MONEY,
    position: 0,
    inJail: false,
    eventShield: false,
    locationId: locId,
  };
  game.players.push(player);

  const campaign = ensureCampaign(game);
  if (locId) {
    if (!campaign.positionsByLocation[locId]) campaign.positionsByLocation[locId] = {};
    campaign.positionsByLocation[locId][String(id)] = 0;
  }

  addLog(game, `В партию добавлен <strong>${player.name}</strong>`);
  return { success: true, player };
}

/** Удалить игрока из офлайн hot-seat. Клетки освобождаются. */
function removeOfflinePlayer(game, playerIndex) {
  if (!game || game.online || game.isTutorial) {
    return { success: false, reason: 'доступно только в офлайн-режиме' };
  }
  if (game.finished) return { success: false, reason: 'игра уже окончена' };
  if (game.players.length <= MIN_OFFLINE_PLAYERS) {
    return { success: false, reason: `нужно минимум ${MIN_OFFLINE_PLAYERS} игрока` };
  }
  if (game.pendingAction || game.pendingTrade || game.pendingBattle) {
    return { success: false, reason: 'сначала завершите текущее действие / обмен / бой' };
  }

  const idx = Number(playerIndex);
  if (!Number.isFinite(idx) || idx < 0 || idx >= game.players.length) {
    return { success: false, reason: 'игрок не найден' };
  }

  const [removed] = game.players.splice(idx, 1);
  stripPlayerOwnership(game, removed.id);

  const campaign = ensureCampaign(game);
  Object.keys(campaign.positionsByLocation || {}).forEach((locId) => {
    const map = campaign.positionsByLocation[locId];
    if (map) delete map[String(removed.id)];
  });

  if (game.currentPlayerIndex > idx) {
    game.currentPlayerIndex -= 1;
  } else if (game.currentPlayerIndex >= game.players.length) {
    game.currentPlayerIndex = 0;
  }

  addLog(game, `<strong>${removed.name}</strong> удалён из партии`);
  return { success: true, removed };
}

function createGame(location, options = {}) {
  const locId = location.id;
  const players = options.players
    ? options.players.map((p) => ({
        eventShield: false,
        ...p,
        locationId: p.locationId || locId,
        bankrupt: Boolean(p.bankrupt),
      }))
    : DEFAULT_PLAYERS.map((p) => ({ ...p, locationId: locId, bankrupt: false }));

  const game = {
    location,
    players,
    currentPlayerIndex: 0,
    canRoll: true,
    log: [],
    finished: false,
    /** @type {number | string | null} */
    winnerId: null,
    /** @type {Record<number, number|string>} cellIndex → playerId */
    ownership: {},
    pendingAction: null,
    pendingTrade: null,
    pendingBattle: null,
    /** Цитата Soyona показана / закрыта до первого броска */
    introSeen: Boolean(options.introSeen),
    /** Кампания: собственность и позиции по локациям */
    campaign: {
      ownershipByLocation: {},
      positionsByLocation: {},
      attrBonusByLocation: {},
      traitsByLocation: {},
      dinoHpByLocation: {},
      dnaByPlayer: {},
      labCellsByLocation: {},
      trainedByLocation: {},
      lapByPlayer: {},
    },
    /** Каталог локаций для смены доски по игроку */
    locationCatalog: options.locations || null,
    /** Онлайн-метаданные */
    online: Boolean(options.online),
    roomId: options.roomId || null,
    roomCode: options.roomCode || null,
    /** Режим обучения (1 игрок, подсказки в UI) */
    isTutorial: Boolean(options.isTutorial),
    /**
     * Лимит кругов на локации (2 → блок хода).
     * Обычная игра / онлайн: всегда true. Туториал: false.
     * Dev-галочка может выключить.
     */
    lapLimitEnabled:
      options.lapLimitEnabled != null
        ? Boolean(options.lapLimitEnabled)
        : !options.isTutorial,
    /** UI: только что сработала блокировка после 2 кругов */
    lapLimitNotice: null,
  };

  return game;
}

function setLocationCatalog(game, locations) {
  if (!game) return null;
  game.locationCatalog = locations || null;
  return game;
}

function getPlayerLocationId(player, fallbackId) {
  return player?.locationId || fallbackId;
}

function getPlayersOnLocation(game, locationId) {
  const id = locationId || game.location.id;
  return game.players.filter((p) => getPlayerLocationId(p, game.location.id) === id);
}

/** Подставить доску и ownership локации текущего игрока. */
function syncBoardToCurrentPlayer(game) {
  const catalog = game.locationCatalog;
  if (!catalog || !catalog.length) return game;
  const player = getCurrentPlayer(game);
  if (!player) return game;
  if (!player.locationId) player.locationId = game.location.id;

  syncOwnershipToCampaign(game);

  const loc = catalog.find((l) => l.id === player.locationId) || catalog[0];
  game.location = loc;
  game.ownership = { ...(ensureCampaign(game).ownershipByLocation[loc.id] || {}) };
  ensureCampaign(game).ownershipByLocation[loc.id] = game.ownership;
  return game;
}

const CAMPAIGN_STORAGE_KEY = 'jm_campaign_v1';

function ensureCampaign(game) {
  if (!game.campaign) {
    game.campaign = {
      ownershipByLocation: {},
      positionsByLocation: {},
      attrBonusByLocation: {},
      traitsByLocation: {},
      dinoHpByLocation: {},
      dnaByPlayer: {},
      labCellsByLocation: {},
      trainedByLocation: {},
      lapByPlayer: {},
    };
  }
  if (!game.campaign.ownershipByLocation) game.campaign.ownershipByLocation = {};
  if (!game.campaign.positionsByLocation) game.campaign.positionsByLocation = {};
  if (!game.campaign.attrBonusByLocation) game.campaign.attrBonusByLocation = {};
  if (!game.campaign.traitsByLocation) game.campaign.traitsByLocation = {};
  if (!game.campaign.dinoHpByLocation) game.campaign.dinoHpByLocation = {};
  if (!game.campaign.dnaByPlayer) game.campaign.dnaByPlayer = {};
  if (!game.campaign.labCellsByLocation) game.campaign.labCellsByLocation = {};
  if (!game.campaign.trainedByLocation) game.campaign.trainedByLocation = {};
  if (!game.campaign.lapByPlayer) game.campaign.lapByPlayer = {};
  return game.campaign;
}

function isLapLimitActive(game) {
  if (!game || game.isTutorial) return false;
  if (game.lapLimitEnabled === false) return false;
  return true;
}

function getPlayerLapState(game, playerId) {
  const campaign = ensureCampaign(game);
  const key = String(playerId);
  if (!campaign.lapByPlayer[key]) {
    campaign.lapByPlayer[key] = {
      lapsByLocation: {},
      blocked: {},
    };
  }
  const state = campaign.lapByPlayer[key];
  if (!state.lapsByLocation) state.lapsByLocation = {};
  if (!state.blocked) state.blocked = {};
  return state;
}

function isLocationBlockedForPlayer(game, playerId, locationId) {
  if (!isLapLimitActive(game) || !locationId) return false;
  return Boolean(getPlayerLapState(game, playerId).blocked[locationId]);
}

function clearLapBlocksAndCounters(game, playerId) {
  const state = getPlayerLapState(game, playerId);
  state.lapsByLocation = {};
  state.blocked = {};
}

function canTravelToLocation(game, playerIndex, locationId) {
  const player = game.players[playerIndex];
  if (!player || !locationId) return { ok: false, reason: 'игрок не найден' };
  if (getPlayerLocationId(player, game.location.id) === locationId) {
    return { ok: true };
  }
  if (!isLapLimitActive(game)) return { ok: true };
  if (isLocationBlockedForPlayer(game, player.id, locationId)) {
    return {
      ok: false,
      reason: 'локация заблокирована — сначала пройдите полный круг на другой карте',
      blocked: true,
    };
  }
  return { ok: true };
}

/** Учёт круга для лимита локаций (после +$2000 / дохода). */
function applyLapLimitAfterLap(game, player) {
  if (!isLapLimitActive(game) || !player) return null;
  const locId = getPlayerLocationId(player, game.location.id);
  const state = getPlayerLapState(game, player.id);
  const hadBlocked = Object.keys(state.blocked).some((id) => state.blocked[id]);

  if (hadBlocked) {
    clearLapBlocksAndCounters(game, player.id);
    addLog(
      game,
      `<strong>${player.name}</strong>: полный круг на другой карте — все локации снова доступны`
    );
    return { unlockedAll: true, locationId: locId };
  }

  const next = (Number(state.lapsByLocation[locId]) || 0) + 1;
  state.lapsByLocation[locId] = next;

  if (next >= LAPS_BEFORE_BLOCK) {
    state.blocked[locId] = true;
    const locName =
      (game.locationCatalog || []).find((l) => l.id === locId)?.name ||
      game.location?.name ||
      locId;
    game.lapLimitNotice = {
      playerId: player.id,
      locationId: locId,
      locationName: locName,
    };
    addLog(
      game,
      `<strong>${player.name}</strong>: ${LAPS_BEFORE_BLOCK} круга на <strong>${locName}</strong> — ход здесь заблокирован, смените локацию`
    );
    return { blocked: true, locationId: locId, locationName: locName };
  }

  return { laps: next, locationId: locId };
}

function isDinoTrained(game, locationId, cellIndex) {
  const map = game?.campaign?.trainedByLocation?.[locationId];
  return Boolean(map?.[String(cellIndex)]);
}

function markDinoTrained(game, locationId, cellIndex) {
  const campaign = ensureCampaign(game);
  if (!campaign.trainedByLocation[locationId]) campaign.trainedByLocation[locationId] = {};
  campaign.trainedByLocation[locationId][String(cellIndex)] = true;
}

function clearDinoTrained(game, locationId, cellIndex) {
  const campaign = ensureCampaign(game);
  if (!campaign.trainedByLocation[locationId]) return;
  delete campaign.trainedByLocation[locationId][String(cellIndex)];
}

/** Доля бонуса к цене при продаже: дрессировка 50%, иначе агр./инт. 25%. */
function getSellTraitBonusRate(game, locationId, cellIndex) {
  if (isDinoTrained(game, locationId, cellIndex)) return SELL_TRAINED_BONUS_RATE;
  const traits = getDinoTraits(game, locationId, cellIndex);
  if (traits.intellect || traits.aggression) return SELL_TRAIT_BONUS_RATE;
  return 0;
}

function isSenegalLab(gameOrLocationId) {
  const id =
    typeof gameOrLocationId === 'string'
      ? gameOrLocationId
      : gameOrLocationId?.location?.id || gameOrLocationId?.id;
  return id === SENEGAL_LOCATION_ID;
}

function cellOffersDna(cell, locationId) {
  return Boolean(cell?.offersDna) || (isSenegalLab(locationId) && cell?.type === CELL_TYPES.PROPERTY);
}

function getDnaCatalogEntry(game, species, locations) {
  const locs = locations || game.locationCatalog || [game.location];
  const loc = findLocationById(locs, SENEGAL_LOCATION_ID);
  const cell = loc?.cells?.find((c) => c.type === CELL_TYPES.PROPERTY && c.label === species);
  if (!cell) return null;
  const attractiveness = getAttractiveness(cell, game, SENEGAL_LOCATION_ID);
  const priceFn = dnaPriceFromDinoPrice || ((p) => Math.max(10, Math.round((p * 0.3) / 10) * 10));
  const attrFn = dnaAttractivenessFromDino || ((a) => Math.max(1, Math.round(a * 0.3)));
  return {
    species,
    dinoPrice: cell.price || 0,
    price: priceFn(cell.price || 0),
    attractiveness: attrFn(attractiveness),
    cell,
  };
}

function getDnaCount(game, playerId, species) {
  const bag = ensureCampaign(game).dnaByPlayer[String(playerId)];
  return Math.max(0, Number(bag?.[species]) || 0);
}

function getPlayerDnaInventory(game, playerId) {
  const bag = ensureCampaign(game).dnaByPlayer[String(playerId)] || {};
  return SENEGAL_DNA_SPECIES.map((species) => {
    const entry = getDnaCatalogEntry(game, species);
    return {
      species,
      count: Math.max(0, Number(bag[species]) || 0),
      price: entry?.price || 0,
      attractiveness: entry?.attractiveness || 1,
      limit: DNA_SAMPLE_LIMIT,
    };
  });
}

function setDnaCount(game, playerId, species, count) {
  const campaign = ensureCampaign(game);
  const key = String(playerId);
  if (!campaign.dnaByPlayer[key]) campaign.dnaByPlayer[key] = {};
  const next = Math.max(0, Math.min(DNA_SAMPLE_LIMIT, Number(count) || 0));
  if (next <= 0) delete campaign.dnaByPlayer[key][species];
  else campaign.dnaByPlayer[key][species] = next;
  return next;
}

function addDnaSample(game, playerId, species, delta = 1) {
  const cur = getDnaCount(game, playerId, species);
  return setDnaCount(game, playerId, species, cur + delta);
}

function playerHasFullDnaSet(game, playerId) {
  return SENEGAL_DNA_SPECIES.every((sp) => getDnaCount(game, playerId, sp) >= 1);
}

function spendFullDnaSet(game, playerId) {
  if (!playerHasFullDnaSet(game, playerId)) return false;
  SENEGAL_DNA_SPECIES.forEach((sp) => {
    setDnaCount(game, playerId, sp, getDnaCount(game, playerId, sp) - 1);
  });
  return true;
}

function getLocationCell(game, locationId, cellIndex, locations) {
  const locs = locations || game.locationCatalog || [game.location];
  const loc =
    findLocationById(locs, locationId) ||
    (game.location?.id === locationId ? game.location : null);
  if (!loc) return null;
  const idx = Number(cellIndex);
  if (loc.cells && loc.cells[idx]) return loc.cells[idx];
  const labMap = ensureCampaign(game).labCellsByLocation[locationId];
  if (!labMap) return null;
  return labMap[String(idx)] || labMap[idx] || null;
}

function nextLabCellIndex(game, locationId) {
  const campaign = ensureCampaign(game);
  const ownership = getMutableOwnershipMap(game, locationId);
  const labMap = campaign.labCellsByLocation[locationId] || {};
  let idx = LAB_CELL_BASE;
  while (ownership[idx] != null || labMap[String(idx)] || labMap[idx]) {
    idx += 1;
  }
  return idx;
}

function createIncubatorDinoCell() {
  const statsFactory = window.GameData;
  const label = INCUBATOR_DINO_LABEL;
  const film = statsFactory?.DINO_FILM_STATS?.[label] || {
    size: 10,
    fame: 10,
    diet: statsFactory?.DIET?.CARNIVORE || 'carnivore',
    attractiveness: 96,
    damage: 42,
    maxHp: 150,
    description:
      'Лабораторный гибрид: сила тираннозавра, размер гигантозавра, ум велоцираптора.',
  };
  const diet = film.diet;
  const dietLabel = statsFactory?.DIET_LABELS?.[diet] || diet;
  const attractiveness =
    film.attractiveness != null
      ? film.attractiveness
      : statsFactory.calcAttractiveness(film.size, film.fame, diet, false);
  const combat = statsFactory.calcCombatStats(film.size, film.fame);
  if (film.damage != null) combat.damage = film.damage;
  if (film.maxHp != null) combat.maxHp = film.maxHp;
  const price = statsFactory.priceFromAttractiveness(attractiveness);
  return {
    type: CELL_TYPES.PROPERTY,
    label,
    price,
    size: film.size,
    fame: film.fame,
    diet,
    dietLabel,
    flies: Boolean(film.flies),
    attractiveness,
    maxHp: combat.maxHp,
    damage: combat.damage,
    income: Math.max(50, Math.round(price * 0.1)),
    description: film.description || null,
    labCrafted: true,
    offersDna: false,
  };
}

function getDinoTraits(game, locationId, cellIndex) {
  const map = game?.campaign?.traitsByLocation?.[locationId];
  const t = map?.[String(cellIndex)];
  return {
    intellect: Boolean(t?.intellect),
    aggression: Boolean(t?.aggression),
  };
}

function setDinoTrait(game, locationId, cellIndex, trait, value = true) {
  const campaign = ensureCampaign(game);
  if (!campaign.traitsByLocation[locationId]) campaign.traitsByLocation[locationId] = {};
  const key = String(cellIndex);
  const cur = campaign.traitsByLocation[locationId][key] || {
    intellect: false,
    aggression: false,
  };
  cur[trait] = Boolean(value);
  campaign.traitsByLocation[locationId][key] = cur;
  return cur;
}

function clearDinoTraits(game, locationId, cellIndex) {
  const campaign = ensureCampaign(game);
  if (!campaign.traitsByLocation[locationId]) return;
  delete campaign.traitsByLocation[locationId][String(cellIndex)];
}

function getCellCombatBase(cell) {
  const calc = window.GameData?.calcCombatStats;
  const fromStats = calc ? calc(cell?.size, cell?.fame) : null;
  const maxHp =
    cell?.maxHp != null
      ? Math.max(1, Number(cell.maxHp) || 0)
      : fromStats?.maxHp ?? 50;
  const damage =
    cell?.damage != null
      ? Math.max(1, Number(cell.damage) || 0)
      : fromStats?.damage ?? 12;
  return { maxHp, damage };
}

/** Стоимость хила/реанимации: доля потерянного HP от цены особи. */
function getHpRestoreCost(price, hp, maxHp) {
  const p = Math.max(0, Number(price) || 0);
  const max = Math.max(1, Number(maxHp) || 1);
  const cur = Math.max(0, Math.min(max, Number(hp) || 0));
  if (cur >= max) return 0;
  return Math.max(0, Math.floor((p * (max - cur)) / max));
}

function getDinoHpState(game, locationId, cellIndex, cell) {
  const campaign = ensureCampaign(game);
  const base = getCellCombatBase(cell);
  const map = campaign.dinoHpByLocation[locationId] || {};
  const saved = map[String(cellIndex)];
  if (!saved) {
    return {
      hp: base.maxHp,
      maxHp: base.maxHp,
      dead: false,
      damage: base.damage,
      startsToFullHeal: null,
    };
  }
  const dead = Boolean(saved.dead);
  const hp = dead ? 0 : Math.min(base.maxHp, Number(saved.hp) || 0);
  let startsToFullHeal = null;
  if (!dead && hp < base.maxHp && saved.startsToFullHeal != null) {
    startsToFullHeal = Math.max(0, Number(saved.startsToFullHeal) || 0);
  }
  return {
    hp,
    maxHp: base.maxHp,
    dead,
    damage: base.damage,
    startsToFullHeal,
  };
}

function setDinoHpState(game, locationId, cellIndex, state) {
  const campaign = ensureCampaign(game);
  if (!campaign.dinoHpByLocation[locationId]) campaign.dinoHpByLocation[locationId] = {};
  const key = String(cellIndex);
  const hp = Math.max(0, Number(state.hp) || 0);
  const dead = Boolean(state.dead) || hp <= 0;
  const entry = {
    hp: dead ? 0 : hp,
    dead,
  };
  if (!dead && state.startsToFullHeal != null && Number(state.startsToFullHeal) > 0) {
    entry.startsToFullHeal = Math.max(0, Math.floor(Number(state.startsToFullHeal)));
  }
  campaign.dinoHpByLocation[locationId][key] = entry;
}

/** Пометить особь после боя: ранение → 2 старта до бесплатного полного хила. */
function persistDinoCombatHp(game, locationId, cellIndex, hp, maxHp) {
  const max = Math.max(1, Number(maxHp) || 1);
  const cur = Math.max(0, Number(hp) || 0);
  if (cur <= 0) {
    setDinoHpState(game, locationId, cellIndex, { hp: 0, dead: true });
    return;
  }
  if (cur >= max) {
    setDinoHpState(game, locationId, cellIndex, { hp: max, dead: false });
    return;
  }
  setDinoHpState(game, locationId, cellIndex, {
    hp: cur,
    dead: false,
    startsToFullHeal: 2,
  });
}

function clearDinoHpState(game, locationId, cellIndex) {
  const campaign = ensureCampaign(game);
  if (!campaign.dinoHpByLocation[locationId]) return;
  delete campaign.dinoHpByLocation[locationId][String(cellIndex)];
}

function clearLabCellDef(game, locationId, cellIndex) {
  const campaign = ensureCampaign(game);
  const map = campaign.labCellsByLocation[locationId];
  if (!map) return;
  delete map[String(cellIndex)];
  delete map[cellIndex];
}

function clearDinoMeta(game, locationId, cellIndex) {
  clearAttrBonus(game, locationId, cellIndex);
  clearDinoTraits(game, locationId, cellIndex);
  clearDinoHpState(game, locationId, cellIndex);
  clearDinoTrained(game, locationId, cellIndex);
  clearLabCellDef(game, locationId, cellIndex);
}

function getAttrBonus(game, locationId, cellIndex) {
  const map = game?.campaign?.attrBonusByLocation?.[locationId];
  if (!map) return 0;
  return Number(map[String(cellIndex)]) || 0;
}

function addAttrBonus(game, locationId, cellIndex, delta) {
  const campaign = ensureCampaign(game);
  if (!campaign.attrBonusByLocation[locationId]) {
    campaign.attrBonusByLocation[locationId] = {};
  }
  const key = String(cellIndex);
  const next = (campaign.attrBonusByLocation[locationId][key] || 0) + delta;
  campaign.attrBonusByLocation[locationId][key] = Math.max(0, next);
  return campaign.attrBonusByLocation[locationId][key];
}

function clearAttrBonus(game, locationId, cellIndex) {
  const campaign = ensureCampaign(game);
  if (!campaign.attrBonusByLocation[locationId]) return;
  delete campaign.attrBonusByLocation[locationId][String(cellIndex)];
}

/**
 * Один игрок переходит на другую локацию (остальные остаются где были).
 * Деньги общие; собственность и позиция — по локациям.
 */
function travelToLocation(game, playerIndex, newLocation) {
  const player = game.players[playerIndex];
  if (!player || !newLocation) return game;
  if (!player.locationId) player.locationId = game.location.id;

  if (player.locationId === newLocation.id) {
    if (playerIndex === game.currentPlayerIndex) syncBoardToCurrentPlayer(game);
    return game;
  }

  const gate = canTravelToLocation(game, playerIndex, newLocation.id);
  if (!gate.ok) {
    addLog(game, `<strong>${player.name}</strong>: ${gate.reason}`);
    return game;
  }

  const campaign = ensureCampaign(game);
  const oldId = player.locationId;

  if (!campaign.positionsByLocation[oldId]) campaign.positionsByLocation[oldId] = {};
  campaign.positionsByLocation[oldId][String(player.id)] = {
    position: player.position,
    inJail: Boolean(player.inJail),
  };

  syncOwnershipToCampaign(game);

  player.locationId = newLocation.id;
  const saved = (campaign.positionsByLocation[newLocation.id] || {})[String(player.id)];
  if (saved) {
    player.position = clampCell(saved.position, getCellCount(newLocation));
    player.inJail = Boolean(saved.inJail);
  } else {
    player.position = 0;
    player.inJail = false;
  }

  if (game.pendingAction && game.pendingAction.playerIndex === playerIndex) {
    game.pendingAction = null;
  }

  addLog(
    game,
    `<strong>${player.name}</strong> переходит на локацию <strong>${newLocation.name}</strong>`
  );

  if (playerIndex === game.currentPlayerIndex) {
    game.location = newLocation;
    game.ownership = { ...(campaign.ownershipByLocation[newLocation.id] || {}) };
    campaign.ownershipByLocation[newLocation.id] = game.ownership;
    if (!game.finished) prepareTurn(game);
    else game.canRoll = false;
  }

  return game;
}

/** @deprecated используйте travelToLocation — переключает только текущего игрока */
function switchGameLocation(game, newLocation, options = {}) {
  const playerIndex =
    options.playerIndex != null ? options.playerIndex : game.currentPlayerIndex;
  return travelToLocation(game, playerIndex, newLocation);
}

function serializeGameState(game) {
  const campaign = ensureCampaign(game);
  syncOwnershipToCampaign(game);

  game.players.forEach((p) => {
    const locId = getPlayerLocationId(p, game.location.id);
    if (!campaign.positionsByLocation[locId]) campaign.positionsByLocation[locId] = {};
    campaign.positionsByLocation[locId][String(p.id)] = {
      position: p.position,
      inJail: Boolean(p.inJail),
    };
  });

  return {
    locationId: game.location.id,
    players: game.players.map((p) => ({
      id: p.id,
      userId: p.userId || null,
      name: p.name,
      color: p.color,
      money: p.money,
      position: p.position,
      inJail: Boolean(p.inJail),
      eventShield: Boolean(p.eventShield),
      bankrupt: Boolean(p.bankrupt),
      locationId: getPlayerLocationId(p, game.location.id),
    })),
    currentPlayerIndex: game.currentPlayerIndex,
    canRoll: game.canRoll,
    finished: game.finished,
    winnerId: game.winnerId,
    ownership: { ...game.ownership },
    pendingAction: game.pendingAction ? { ...game.pendingAction } : null,
    pendingTrade: game.pendingTrade ? { ...game.pendingTrade } : null,
    pendingBattle: game.pendingBattle
      ? JSON.parse(JSON.stringify(game.pendingBattle))
      : null,
    introSeen: Boolean(game.introSeen),
    campaign: {
      ownershipByLocation: JSON.parse(JSON.stringify(campaign.ownershipByLocation)),
      positionsByLocation: JSON.parse(JSON.stringify(campaign.positionsByLocation)),
      attrBonusByLocation: JSON.parse(
        JSON.stringify(campaign.attrBonusByLocation || {})
      ),
      traitsByLocation: JSON.parse(JSON.stringify(campaign.traitsByLocation || {})),
      dinoHpByLocation: JSON.parse(JSON.stringify(campaign.dinoHpByLocation || {})),
      dnaByPlayer: JSON.parse(JSON.stringify(campaign.dnaByPlayer || {})),
      labCellsByLocation: JSON.parse(JSON.stringify(campaign.labCellsByLocation || {})),
      trainedByLocation: JSON.parse(JSON.stringify(campaign.trainedByLocation || {})),
      lapByPlayer: JSON.parse(JSON.stringify(campaign.lapByPlayer || {})),
    },
    lapLimitEnabled: game.lapLimitEnabled !== false && !game.isTutorial,
    lapLimitNotice: game.lapLimitNotice ? { ...game.lapLimitNotice } : null,
    online: game.online,
    roomId: game.roomId,
    roomCode: game.roomCode,
    isTutorial: Boolean(game.isTutorial),
    log: game.log.slice(0, 20),
  };
}

function hydrateGameState(snapshot, locations) {
  if (!snapshot) return null;
  const location =
    locations.find((l) => l.id === snapshot.locationId) || locations[0];
  const game = createGame(location, {
    players: snapshot.players,
    online: snapshot.online,
    roomId: snapshot.roomId,
    roomCode: snapshot.roomCode,
    locations,
  });
  game.currentPlayerIndex = snapshot.currentPlayerIndex || 0;
  game.canRoll = snapshot.canRoll !== false && !snapshot.finished;
  game.finished = Boolean(snapshot.finished);
  game.winnerId = snapshot.winnerId ?? null;
  game.pendingAction = snapshot.pendingAction || null;
  game.pendingTrade = snapshot.pendingTrade || null;
  game.pendingBattle = snapshot.pendingBattle || null;
  game.introSeen = Boolean(snapshot.introSeen);
  game.isTutorial = Boolean(snapshot.isTutorial);
  game.campaign = snapshot.campaign || {
    ownershipByLocation: {},
    positionsByLocation: {},
    attrBonusByLocation: {},
    traitsByLocation: {},
    dinoHpByLocation: {},
    dnaByPlayer: {},
    labCellsByLocation: {},
    trainedByLocation: {},
    lapByPlayer: {},
  };
  ensureCampaign(game);
  game.log = snapshot.log || [];
  game.locationCatalog = locations;
  game.lapLimitEnabled =
    snapshot.lapLimitEnabled != null
      ? Boolean(snapshot.lapLimitEnabled) && !game.isTutorial
      : !game.isTutorial;
  game.lapLimitNotice = snapshot.lapLimitNotice || null;

  game.players.forEach((p) => {
    if (!p.locationId) p.locationId = snapshot.locationId || location.id;
  });

  syncBoardToCurrentPlayer(game);
  if (snapshot.ownership && game.location.id === snapshot.locationId) {
    game.ownership = { ...snapshot.ownership };
    ensureCampaign(game).ownershipByLocation[game.location.id] = game.ownership;
  }
  return game;
}

function saveCampaignLocal(game) {
  try {
    localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(serializeGameState(game)));
  } catch (_) {
    /* ignore quota */
  }
}

function loadCampaignLocal(locations) {
  try {
    const raw = localStorage.getItem(CAMPAIGN_STORAGE_KEY);
    if (!raw) return null;
    return hydrateGameState(JSON.parse(raw), locations);
  } catch (_) {
    return null;
  }
}

function clearCampaignLocal() {
  try {
    localStorage.removeItem(CAMPAIGN_STORAGE_KEY);
  } catch (_) {
    /* ignore */
  }
}

function getWinner(game) {
  if (!game.finished || game.winnerId == null) return null;
  return getPlayerById(game, game.winnerId);
}

function getActivePlayers(game) {
  return (game.players || []).filter((p) => !p.bankrupt);
}

/** Первый, кто накопил WIN_GOAL, или последний небакрот — побеждает. */
function checkWin(game) {
  if (game.finished) return getWinner(game);

  const active = getActivePlayers(game);
  if (active.length === 1 && game.players.length > 1) {
    const winner = active[0];
    game.finished = true;
    game.winnerId = winner.id;
    game.canRoll = false;
    game.pendingAction = null;
    addLog(
      game,
      `🏆 <strong>${winner.name}</strong> побеждает — остальные игроки банкроты`
    );
    return winner;
  }

  const winner = active.find((p) => p.money >= WIN_GOAL);
  if (!winner) return null;

  game.finished = true;
  game.winnerId = winner.id;
  game.canRoll = false;
  game.pendingAction = null;
  addLog(
    game,
    `🏆 <strong>${winner.name}</strong> накопил $${WIN_GOAL.toLocaleString('ru')} и побеждает!`
  );
  return winner;
}

function getCurrentPlayer(game) {
  return game.players[game.currentPlayerIndex];
}

function getPlayerById(game, playerId) {
  return game.players.find((p) => p.id === playerId) || null;
}

function getOwnerId(game, cellIndex) {
  const id = game.ownership[cellIndex];
  return id === undefined ? null : id;
}

function getDinosaurIncome(cell) {
  if (!cell || cell.type !== CELL_TYPES.PROPERTY) return 0;
  if (cell.income != null) return cell.income;
  if (cell.price == null) return 0;
  return Math.max(50, Math.round(cell.price * INCOME_RATE));
}

function getAttractiveness(cell, game = null, locationId = null) {
  if (!cell || cell.type !== CELL_TYPES.PROPERTY) return 0;
  let base = 50;
  if (cell.attractiveness != null) {
    base = cell.attractiveness;
  } else {
    const calc = window.GameData?.calcAttractiveness;
    if (calc && cell.size != null && cell.fame != null) {
      base = calc(cell.size, cell.fame, cell.diet, cell.flies);
    } else if (cell.size != null && cell.fame != null) {
      base = cell.size * 5 + cell.fame * 5;
    }
  }
  const locId = locationId || game?.location?.id;
  const bonus = game && locId != null ? getAttrBonus(game, locId, cell.index) : 0;
  return Math.min(100, base + bonus);
}

/**
 * Цена продажи агенту: цена покупки + бонус агента + % за черты/дрессировку.
 * @param {{ game?: object, locationId?: string, cellIndex?: number }} [ctx]
 */
function getSellPrice(cell, sellBonus = SELL_BONUS, ctx = null) {
  if (!cell || cell.price == null) return 0;
  const price = Number(cell.price) || 0;
  let traitBonus = 0;
  if (ctx?.game != null && ctx.locationId != null && ctx.cellIndex != null) {
    const rate = getSellTraitBonusRate(ctx.game, ctx.locationId, ctx.cellIndex);
    traitBonus = Math.round(price * rate);
  }
  return price + sellBonus + traitBonus;
}

function hasPendingAction(game) {
  if (game.pendingAction) return true;
  // Принудительный бой на Арене блокирует кубик до завершения
  if (game.pendingBattle?.forced) return true;
  return false;
}

function clampCell(index, cellCount = TOTAL_CELLS) {
  const total = cellCount > 0 ? cellCount : TOTAL_CELLS;
  const n = Number(index);
  if (!Number.isFinite(n)) return 0;
  return ((Math.trunc(n) % total) + total) % total;
}

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

function movePlayer(game, steps) {
  const player = getCurrentPlayer(game);
  const oldPos = player.position;
  const total = getCellCount(game);
  player.position = (player.position + steps) % total;

  if (player.position < oldPos) {
    onCompletedLap(game, player);
  }

  return player.position;
}

/** Полный круг по полю: бонус старта + доход с динозавров. */
function onCompletedLap(game, player) {
  if (player.eventShield) {
    player.eventShield = false;
    addLog(game, `<strong>${player.name}</strong>: щит ресторана сгорел в конце круга`);
  }
  player.money += 2000;
  addLog(game, `<strong>${player.name}</strong> завершил круг (+$2000 за старт)`);
  collectDinosaurIncome(game, player);
  tickStartHealingForPlayer(game, player);
  applyLapLimitAfterLap(game, player);
  checkWin(game);
}

/**
 * Каждый проход старта снижает счётчик раненых особей.
 * На 2-м старте — полное бесплатное восстановление HP.
 */
function tickStartHealingForPlayer(game, player) {
  if (!player || player.bankrupt) return;
  const locations = getCampaignLocations(game);
  const owned = getOwnedDinosaursAllLocations(game, player.id, locations);
  owned.forEach((d) => {
    if (d.dead || d.hp >= d.maxHp) return;
    const prev =
      d.startsToFullHeal != null ? Number(d.startsToFullHeal) : 2;
    const next = Math.max(0, prev - 1);
    if (next <= 0) {
      setDinoHpState(game, d.locationId, d.cellIndex, {
        hp: d.maxHp,
        dead: false,
      });
      addLog(
        game,
        `<strong>${player.name}</strong>: <strong>${d.cell.label}</strong> полностью восстановил HP на 2-м старте`
      );
    } else {
      setDinoHpState(game, d.locationId, d.cellIndex, {
        hp: d.hp,
        dead: false,
        startsToFullHeal: next,
      });
      addLog(
        game,
        `<strong>${player.name}</strong>: <strong>${d.cell.label}</strong> — до полного хила осталось стартов: ${next}`
      );
    }
  });
}

/** Щит с ресторана: пропускает одно негативное событие. */
function consumeEventShield(game, player, what) {
  if (!player?.eventShield) return false;
  player.eventShield = false;
  addLog(
    game,
    `<strong>${player.name}</strong> защищён щитом ресторана и избегает ${what}`
  );
  return true;
}

/** Предложить сделку ресторана (согласие / отказ). */
function resolveRestaurantLanding(game, player, cell, cellIndex) {
  const percent = cell.taxPercent != null ? Number(cell.taxPercent) : 20;
  const loss = Math.max(0, Math.floor((player.money * percent) / 100));
  game.pendingAction = {
    type: 'restaurant',
    cellIndex,
    playerIndex: game.currentPlayerIndex,
    taxPercent: percent,
    loss,
  };
  addLog(
    game,
    `<strong>${player.name}</strong> у ресторана: можно отдать $${loss.toLocaleString('ru')} (${percent}% от текущего баланса) за щит на круг — или отказаться`
  );
}

function acceptRestaurant(game, { advanceTurn = true } = {}) {
  if (!game.pendingAction || game.pendingAction.type !== 'restaurant') {
    return { success: false, reason: 'нет предложения ресторана' };
  }
  const { playerIndex, taxPercent, loss } = game.pendingAction;
  const player = game.players[playerIndex];
  if (!player) return { success: false, reason: 'игрок не найден' };

  const percent = taxPercent != null ? taxPercent : 20;
  const pay = loss != null ? loss : Math.max(0, Math.floor((player.money * percent) / 100));
  player.money -= pay;
  player.eventShield = true;
  game.pendingAction = null;

  addLog(
    game,
    `<strong>${player.name}</strong> согласился: −$${pay.toLocaleString('ru')} (${percent}% от текущего баланса), щит на круг`
  );

  endAction(game, advanceTurn);
  return { success: true, player, loss: pay };
}

function declineRestaurant(game, { advanceTurn = true } = {}) {
  if (!game.pendingAction || game.pendingAction.type !== 'restaurant') return false;
  const player = game.players[game.pendingAction.playerIndex];
  game.pendingAction = null;
  addLog(
    game,
    `<strong>${player?.name || 'Игрок'}</strong> отказался от сделки ресторана`
  );
  endAction(game, advanceTurn);
  return true;
}

/** Свои динозавры только на текущей локации (для дрессировки / эксперимента). */
function getOwnedDinosaursOnCurrentLocation(game, playerId) {
  return getOwnedDinosaurs(game, playerId).map((d) => ({
    ...d,
    attractiveness: getAttractiveness(d.cell, game, game.location.id),
  }));
}

function resolveTrainingLanding(game, player, cell, cellIndex) {
  const locations = getExperimentLocations(game);
  const owned = getOwnedDinosaursAllLocations(game, player.id, locations);
  if (!owned.length) {
    addLog(
      game,
      `<strong>${player.name}</strong> на «${cell.label}», но нет своих динозавров ни на одной локации`
    );
    return;
  }
  const bonus = cell.trainBonus != null ? Number(cell.trainBonus) : 5;
  const cost = cell.trainCost != null ? Number(cell.trainCost) : DEFAULT_TRAIN_COST;
  game.pendingAction = {
    type: 'training',
    cellIndex,
    playerIndex: game.currentPlayerIndex,
    trainBonus: bonus,
    trainCost: cost,
    anyLocation: true,
  };
  addLog(
    game,
    `<strong>${player.name}</strong> на «${cell.label}»: можно дрессировать любого своего динозавра за $${cost.toLocaleString('ru')} (+${bonus} ★; при продаже +50%)`
  );
}

/**
 * Дрессировка любого своего динозавра (любая локация).
 * target: { locationId, cellIndex } | cellIndex | строка locationId|cellIndex.
 */
function confirmTraining(game, target, { advanceTurn = true } = {}) {
  if (!game.pendingAction || game.pendingAction.type !== 'training') {
    return { success: false, reason: 'нет дрессировки' };
  }
  const { playerIndex, trainBonus, trainCost } = game.pendingAction;
  const player = game.players[playerIndex];
  if (!player) return { success: false, reason: 'игрок не найден' };

  const ref =
    typeof target === 'string' || typeof target === 'number'
      ? parseTradeRefKey(String(target)) || {
          locationId: game.location.id,
          cellIndex: Number(target),
        }
      : target;
  const locationId = ref?.locationId || game.location.id;
  const cellIndex = Number(ref?.cellIndex);
  if (!Number.isFinite(cellIndex)) {
    return { success: false, reason: 'не выбран динозавр' };
  }

  const locations = getExperimentLocations(game);
  const loc = findLocationById(locations, locationId) || game.location;
  const cell = getLocationCell(game, locationId, cellIndex, locations) || loc.cells?.[cellIndex];
  if (!cell || cell.type !== CELL_TYPES.PROPERTY) {
    return { success: false, reason: 'некорректная клетка' };
  }
  if (!sameOwnerId(getOwnerOnLocation(game, locationId, cellIndex), player.id)) {
    return { success: false, reason: 'не ваш динозавр' };
  }

  const cost = trainCost != null ? Number(trainCost) : DEFAULT_TRAIN_COST;
  if (player.money < cost) {
    addLog(
      game,
      `<strong>${player.name}</strong> не хватает денег на дрессировку (нужно $${cost.toLocaleString('ru')})`
    );
    return { success: false, reason: 'недостаточно денег' };
  }

  const bonus = trainBonus != null ? Number(trainBonus) : 5;
  player.money -= cost;
  const before = getAttractiveness(cell, game, locationId);
  addAttrBonus(game, locationId, cellIndex, bonus);
  markDinoTrained(game, locationId, cellIndex);
  const after = getAttractiveness(cell, game, locationId);
  game.pendingAction = null;

  addLog(
    game,
    `<strong>${player.name}</strong> дрессировал <strong>${cell.label}</strong> (${loc.name}) за $${cost.toLocaleString('ru')}: ★${before} → ★${after} (+${bonus}), бонус продажи +50%`
  );

  endAction(game, advanceTurn);
  return { success: true, player, cell, locationId, locationName: loc.name, before, after, cost };
}

function skipTraining(game, { advanceTurn = true } = {}) {
  if (!game.pendingAction || game.pendingAction.type !== 'training') return false;
  const player = game.players[game.pendingAction.playerIndex];
  game.pendingAction = null;
  addLog(game, `<strong>${player?.name || 'Игрок'}</strong> отказался от дрессировки`);
  endAction(game, advanceTurn);
  return true;
}

function getExperimentLocations(game) {
  if (game.locationCatalog && game.locationCatalog.length) return game.locationCatalog;
  if (window.GameData?.LOCATIONS?.length) return window.GameData.LOCATIONS;
  return [game.location];
}

function resolveExperimentLanding(game, player, cell, cellIndex) {
  const locations = getExperimentLocations(game);
  const owned = getOwnedDinosaursAllLocations(game, player.id, locations);
  if (!owned.length) {
    addLog(
      game,
      `<strong>${player.name}</strong> у «${cell.label}», но нет своих динозавров ни на одной локации`
    );
    return;
  }
  const bonus = cell.trainBonus != null ? Number(cell.trainBonus) : 5;
  const cost = cell.trainCost != null ? Number(cell.trainCost) : 3000;
  game.pendingAction = {
    type: 'experiment',
    cellIndex,
    playerIndex: game.currentPlayerIndex,
    trainBonus: bonus,
    trainCost: cost,
    anyLocation: true,
  };
  addLog(
    game,
    `<strong>${player.name}</strong> у «${cell.label}»: за $${cost.toLocaleString('ru')} — интеллект ↑★, агрессия ↑★ или смерть; выберите любого своего динозавра`
  );
}

/**
 * Эксперимент над любым своим динозавром (любая локация).
 * target: { locationId, cellIndex } или строка locationId|cellIndex.
 */
function confirmExperiment(game, target, { advanceTurn = true } = {}) {
  if (!game.pendingAction || game.pendingAction.type !== 'experiment') {
    return { success: false, reason: 'нет эксперимента' };
  }
  const { playerIndex, trainBonus, trainCost } = game.pendingAction;
  const player = game.players[playerIndex];
  if (!player) return { success: false, reason: 'игрок не найден' };

  const ref =
    typeof target === 'string' || typeof target === 'number'
      ? parseTradeRefKey(String(target)) || {
          locationId: game.location.id,
          cellIndex: Number(target),
        }
      : target;
  const locationId = ref?.locationId || game.location.id;
  const cellIndex = Number(ref?.cellIndex);
  if (!Number.isFinite(cellIndex)) {
    return { success: false, reason: 'не выбран динозавр' };
  }

  const locations = getExperimentLocations(game);
  const loc = findLocationById(locations, locationId) || game.location;
  const cell = loc.cells[cellIndex];
  if (!cell || cell.type !== CELL_TYPES.PROPERTY) {
    return { success: false, reason: 'некорректная клетка' };
  }
  if (!sameOwnerId(getOwnerOnLocation(game, locationId, cellIndex), player.id)) {
    return { success: false, reason: 'не ваш динозавр' };
  }

  const cost = trainCost != null ? Number(trainCost) : 3000;
  if (player.money < cost) {
    addLog(
      game,
      `<strong>${player.name}</strong> не хватает денег на эксперимент (нужно $${cost.toLocaleString('ru')})`
    );
    return { success: false, reason: 'недостаточно денег' };
  }

  const bonus = trainBonus != null ? Number(trainBonus) : 5;
  player.money -= cost;
  const roll = Math.floor(Math.random() * 3); // 0 intellect, 1 aggression, 2 death
  game.pendingAction = null;
  const baseResult = {
    success: true,
    player,
    cell,
    locationId,
    locationName: loc.name,
    dinoName: cell.label,
    bonus,
    cost,
  };

  if (roll === 2) {
    if (consumeEventShield(game, player, 'смерти в эксперименте')) {
      endAction(game, advanceTurn);
      return { ...baseResult, outcome: 'shielded' };
    }
    const map = getMutableOwnershipMap(game, locationId);
    delete map[cellIndex];
    clearDinoMeta(game, locationId, cellIndex);
    syncOwnershipToCampaign(game);
    addLog(
      game,
      `<strong>${player.name}</strong>: эксперимент над <strong>${cell.label}</strong> (${loc.name}) — смерть. Динозавр потерян`
    );
    endAction(game, advanceTurn);
    return { ...baseResult, outcome: 'death' };
  }

  const before = getAttractiveness(cell, game, locationId);
  addAttrBonus(game, locationId, cellIndex, bonus);
  const outcome = roll === 0 ? 'intellect' : 'aggression';
  setDinoTrait(game, locationId, cellIndex, outcome, true);
  const after = getAttractiveness(cell, game, locationId);
  const label = outcome === 'intellect' ? 'интеллект' : 'агрессия';
  addLog(
    game,
    `<strong>${player.name}</strong>: эксперимент — ${label} у <strong>${cell.label}</strong> (${loc.name}): ★${before} → ★${after} (+${bonus}), черта «${label}»`
  );

  endAction(game, advanceTurn);
  return { ...baseResult, outcome, before, after };
}

function skipExperiment(game, { advanceTurn = true } = {}) {
  if (!game.pendingAction || game.pendingAction.type !== 'experiment') return false;
  const player = game.players[game.pendingAction.playerIndex];
  game.pendingAction = null;
  addLog(game, `<strong>${player?.name || 'Игрок'}</strong> отказался от эксперимента`);
  endAction(game, advanceTurn);
  return true;
}

function resolveCellEffect(game, cellIndex) {
  const player = getCurrentPlayer(game);
  const cell = game.location.cells[cellIndex];

  switch (cell.type) {
    case CELL_TYPES.START:
      addLog(game, `<strong>${player.name}</strong> на старте`);
      break;

    case CELL_TYPES.PROPERTY:
      resolvePropertyLanding(game, player, cell, cellIndex);
      break;

    case CELL_TYPES.MONEY: {
      let amount = 500;
      if (cell.amount != null) amount = Number(cell.amount) || 0;
      else if (cell.sublabel && cell.sublabel.includes('13000')) amount = 13000;
      else if (cell.sublabel && /\d/.test(cell.sublabel)) {
        const n = Number(String(cell.sublabel).replace(/[^\d]/g, ''));
        if (Number.isFinite(n) && n > 0) amount = n;
      }
      player.money += amount;
      addLog(
        game,
        `<strong>${player.name}</strong> получил бонус $${amount.toLocaleString('ru')}`
      );
      checkWin(game);
      break;
    }

    case CELL_TYPES.CHARACTER:
      resolveCharacterLanding(game, player, cell, cellIndex);
      break;

    case CELL_TYPES.EVENT:
      if (cell.effect === 'jail') {
        if (consumeEventShield(game, player, 'тюрьмы')) break;
        if (cell.fine) {
          player.money -= cell.fine;
          addLog(
            game,
            `<strong>${player.name}</strong> платит штраф $${cell.fine.toLocaleString('ru')}`
          );
        }
        player.inJail = true;
        player.position = findPrisonCellIndex(game);
        addLog(game, `<strong>${player.name}</strong> отправлен в тюрьму!`);
      } else if (cell.effect === 'mystery') {
        const bonus = Math.random() < 0.5 ? 1000 : -1000;
        player.money += bonus;
        addLog(
          game,
          `<strong>${player.name}</strong> — событие «?»: ${bonus >= 0 ? '+' : ''}$${bonus.toLocaleString('ru')}`
        );
        checkWin(game);
      } else if (cell.effect === 'return_start') {
        if (consumeEventShield(game, player, 'возврата на старт')) break;
        player.position = 0;
        addLog(
          game,
          `<strong>${player.name}</strong> — ${cell.label || 'событие'}: возврат на старт`
        );
      } else if (cell.effect === 'fine') {
        if (consumeEventShield(game, player, 'штрафа')) break;
        const fine = cell.fine || 0;
        player.money -= fine;
        addLog(
          game,
          `<strong>${player.name}</strong> платит $${fine.toLocaleString('ru')} (${cell.label || 'штраф'})`
        );
      } else if (cell.effect === 'restaurant') {
        resolveRestaurantLanding(game, player, cell, cellIndex);
      } else if (cell.effect === 'training') {
        resolveTrainingLanding(game, player, cell, cellIndex);
      } else if (cell.effect === 'experiment') {
        resolveExperimentLanding(game, player, cell, cellIndex);
      }
      break;

    case CELL_TYPES.CORNER:
      if (cell.effect === 'fights') {
        if (player.inJail) {
          addLog(game, `<strong>${player.name}</strong> в тюрьме (${cell.label || 'Тюрьма'})`);
        } else {
          addLog(game, `<strong>${player.name}</strong> — ${cell.label || 'Тюрьма'} (просто проходит)`);
        }
      } else if (cell.effect === 'incubator') {
        resolveIncubatorLanding(game, player, cell, cellIndex);
      } else if (cell.effect === 'arena') {
        resolveArenaLanding(game, player, cell, cellIndex);
      } else if (cell.effect === 'rest') {
        addLog(
          game,
          `<strong>${player.name}</strong> — ${cell.label || 'отдых'}${
            cell.description ? `: ${cell.description}` : ''
          }`
        );
      }
      break;

    default:
      break;
  }

  return cell;
}

/** Доход клетки для штрафа: с учётом сета ×2 владельца. */
function getRentableIncome(game, locationId, cellIndex, cell, ownerId) {
  let income = getDinosaurIncome(cell);
  if (hasSpeciesSetBonus(game, ownerId, cell.label, getCampaignLocations(game))) {
    income *= 2;
  }
  return income;
}

function getRentFine(game, locationId, cellIndex, cell, ownerId) {
  const income = getRentableIncome(game, locationId, cellIndex, cell, ownerId);
  return Math.max(0, Math.round(income * RENT_INCOME_RATE));
}

function getDinoCoverValue(game, locationId, cellIndex, cell) {
  const price = Number(cell?.price) || 0;
  const hp = getDinoHpState(game, locationId, cellIndex, cell);
  if (hp.dead) return Math.max(0, Math.floor(price * DEAD_DINO_COVER_RATE));
  return price;
}

function resolvePropertyLanding(game, player, cell, cellIndex) {
  const ownerId = getOwnerId(game, cellIndex);
  const income = getDinosaurIncome(cell);
  const priceLabel = `$${cell.price?.toLocaleString('ru')}`;
  const locId = game.location.id;
  const offersDna = cellOffersDna(cell, locId);
  const dnaEntry = offersDna ? getDnaCatalogEntry(game, cell.label) : null;

  if (ownerId == null) {
    game.pendingAction = {
      type: 'buy',
      cellIndex,
      playerIndex: game.currentPlayerIndex,
      allowDna: Boolean(dnaEntry),
      dnaSpecies: dnaEntry?.species || null,
      dnaPrice: dnaEntry?.price || null,
    };
    const dnaHint = dnaEntry
      ? `; ДНК образец $${dnaEntry.price.toLocaleString('ru')} (до ${DNA_SAMPLE_LIMIT} шт.)`
      : '';
    addLog(
      game,
      `<strong>${player.name}</strong> у клетки <strong>${cell.label}</strong> (${priceLabel}, доход $${income.toLocaleString('ru')}/круг) — можно купить${dnaHint}`
    );
    return;
  }

  if (ownerId === player.id) {
    if (offersDna && dnaEntry) {
      game.pendingAction = {
        type: 'buy_dna',
        cellIndex,
        playerIndex: game.currentPlayerIndex,
        dnaSpecies: dnaEntry.species,
        dnaPrice: dnaEntry.price,
      };
      addLog(
        game,
        `<strong>${player.name}</strong> на своём динозавре <strong>${cell.label}</strong> — можно купить ДНК за $${dnaEntry.price.toLocaleString('ru')} (${getDnaCount(game, player.id, dnaEntry.species)}/${DNA_SAMPLE_LIMIT})`
      );
      return;
    }
    addLog(game, `<strong>${player.name}</strong> на своём динозавре <strong>${cell.label}</strong>`);
    return;
  }

  const owner = getPlayerById(game, ownerId);
  if (owner?.bankrupt) {
    addLog(
      game,
      `<strong>${player.name}</strong> на клетке <strong>${cell.label}</strong> банкрота — штраф не взимается`
    );
    if (offersDna && dnaEntry) {
      game.pendingAction = {
        type: 'buy_dna',
        cellIndex,
        playerIndex: game.currentPlayerIndex,
        dnaSpecies: dnaEntry.species,
        dnaPrice: dnaEntry.price,
      };
    }
    return;
  }

  const rentIncome = getRentableIncome(game, locId, cellIndex, cell, ownerId);
  const fine = getRentFine(game, locId, cellIndex, cell, ownerId);
  game.pendingAction = {
    type: 'rent',
    cellIndex,
    playerIndex: game.currentPlayerIndex,
    ownerId,
    fine,
    paidCash: 0,
    needsDino: false,
    rentIncome,
    allowDna: Boolean(dnaEntry),
    dnaSpecies: dnaEntry?.species || null,
    dnaPrice: dnaEntry?.price || null,
  };
  addLog(
    game,
    `<strong>${player.name}</strong> на чужом <strong>${cell.label}</strong> (${owner?.name || '—'}): штраф $${fine.toLocaleString('ru')} (50% дохода $${rentIncome.toLocaleString('ru')}/круг)`
  );
}

function resolveIncubatorLanding(game, player, cell, cellIndex) {
  if (playerHasFullDnaSet(game, player.id)) {
    const cost = cell.incubateCost != null ? Number(cell.incubateCost) : INCUBATE_COST;
    game.pendingAction = {
      type: 'incubate',
      cellIndex,
      playerIndex: game.currentPlayerIndex,
      dinoLabel: INCUBATOR_DINO_LABEL,
      incubateCost: cost,
    };
    addLog(
      game,
      cost > 0
        ? `<strong>${player.name}</strong> у <strong>${cell.label || 'Инкубатор'}</strong> — полный набор ДНК, синтез <strong>${INCUBATOR_DINO_LABEL}</strong> за $${cost.toLocaleString('ru')}`
        : `<strong>${player.name}</strong> у <strong>${cell.label || 'Инкубатор'}</strong> — полный набор ДНК, бесплатный синтез <strong>${INCUBATOR_DINO_LABEL}</strong>`
    );
    return;
  }

  const missing = SENEGAL_DNA_SPECIES.filter((sp) => getDnaCount(game, player.id, sp) < 1);
  addLog(
    game,
    `<strong>${player.name}</strong> — ${cell.label || 'Инкубатор'}: нужен полный набор ДНК (не хватает: ${missing.join(', ') || '—'})`
  );
}

function resolveCharacterLanding(game, player, cell, cellIndex) {
  const brokerName = cell.label || CHARACTER_NAME;
  const sellBonus = getSellBonus(cell);
  const owned = getOwnedDinosaurs(game, player.id, sellBonus);

  if (!owned.length) {
    addLog(
      game,
      `<strong>${player.name}</strong> встретил <strong>${brokerName}</strong>, но продавать нечего`
    );
    return;
  }

  game.pendingAction = {
    type: 'sell',
    cellIndex,
    playerIndex: game.currentPlayerIndex,
    sellBonus,
    brokerName,
  };

  addLog(
    game,
    `<strong>${player.name}</strong> встретил <strong>${brokerName}</strong> — продажа: цена + $${sellBonus.toLocaleString('ru')}; агр./инт. +25%, дрессировка +50%`
  );
}

function findPrisonCellIndex(game) {
  const fightsCorner = game.location.cells.findIndex((c) => c.effect === 'fights');
  return fightsCorner >= 0 ? fightsCorner : 10;
}

function prepareTurn(game) {
  syncBoardToCurrentPlayer(game);
  if (game.finished) {
    game.pendingAction = null;
    game.canRoll = false;
    return;
  }
  game.pendingAction = null;
  const player = getCurrentPlayer(game);
  if (!player || player.bankrupt) {
    game.canRoll = false;
    if (!game.finished) finishTurn(game);
    return;
  }
  if (game.pendingBattle?.forced) {
    game.canRoll = false;
    return;
  }
  game.canRoll = true;
  const locId = getPlayerLocationId(player, game.location.id);
  if (isLocationBlockedForPlayer(game, player.id, locId)) {
    game.canRoll = false;
  }
  if (!player.inJail) return;

  game.pendingAction = {
    type: 'jail',
    playerIndex: game.currentPlayerIndex,
    cellIndex: player.position,
  };
  game.canRoll = false;
}

function finishTurn(game) {
  if (game.finished) return;
  game.pendingAction = null;
  if (!game.players.length) return;
  let guard = 0;
  do {
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    guard += 1;
  } while (game.players[game.currentPlayerIndex]?.bankrupt && guard < game.players.length);
  if (checkWin(game)) return;
  prepareTurn(game);
}

function canPayJailBail(game) {
  if (!game.pendingAction || game.pendingAction.type !== 'jail') {
    return { ok: false, reason: 'нет заключения' };
  }
  const player = game.players[game.pendingAction.playerIndex];
  if (!player) return { ok: false, reason: 'игрок не найден' };
  if (player.money < JAIL_BAIL) {
    return { ok: false, reason: 'недостаточно денег', player };
  }
  return { ok: true, player };
}

/** Выйти из тюрьмы, заплатив $2000 — затем можно бросать кубик. */
function payJailBail(game) {
  const check = canPayJailBail(game);
  if (!check.ok) {
    if (check.reason === 'недостаточно денег') {
      addLog(
        game,
        `<strong>${check.player.name}</strong> не хватает денег на выход из тюрьмы (нужно $${JAIL_BAIL.toLocaleString('ru')})`
      );
    }
    return { success: false, reason: check.reason };
  }

  const { player } = check;
  player.money -= JAIL_BAIL;
  player.inJail = false;
  game.pendingAction = null;
  refreshCanRollForCurrentPlayer(game);

  addLog(
    game,
    `<strong>${player.name}</strong> заплатил $${JAIL_BAIL.toLocaleString('ru')} и вышел из тюрьмы`
  );
  return { success: true, player };
}

/** Пропустить ход: освобождение со следующего хода. */
function waitInJail(game) {
  if (!game.pendingAction || game.pendingAction.type !== 'jail') return false;
  const player = game.players[game.pendingAction.playerIndex];
  if (!player) return false;

  player.inJail = false;
  addLog(
    game,
    `<strong>${player.name}</strong> отсидел ход в тюрьме и будет свободен со следующего своего хода`
  );
  finishTurn(game);
  return true;
}

function addLog(game, message) {
  game.log.unshift({ message, time: new Date() });
  if (game.log.length > 30) game.log.pop();
}

function getCampaignLocations(game) {
  return game.locationCatalog || window.GameData?.LOCATIONS || [game.location];
}

/** Полный сет вида (≥2 особей в кампании) — все клетки вида принадлежат игроку. */
function playerOwnsFullSpeciesSet(game, playerId, speciesKey, locations) {
  const normalize = window.GameData?.normalizeSpeciesKey || ((l) => l);
  const getCatalog = window.GameData?.getSpeciesCatalog;
  const key = normalize(speciesKey);
  const catalog = getCatalog ? getCatalog(locations || getCampaignLocations(game)) : {};
  const slots = catalog[key] || [];
  if (slots.length < 2) return false;
  const pid = Number(playerId);
  return slots.every((slot) =>
    sameOwnerId(getOwnerOnLocation(game, slot.locationId, slot.cellIndex), pid)
  );
}

function hasSpeciesSetBonus(game, playerId, label, locations) {
  const normalize = window.GameData?.normalizeSpeciesKey || ((l) => l);
  const getCatalog = window.GameData?.getSpeciesCatalog;
  const key = normalize(label);
  const catalog = getCatalog ? getCatalog(locations || getCampaignLocations(game)) : {};
  const slots = catalog[key] || [];
  if (slots.length < 2) return false;
  return playerOwnsFullSpeciesSet(game, playerId, key, locations);
}

/** Доход со всех динозавров игрока при завершении полного круга по карте. */
function collectDinosaurIncome(game, player = getCurrentPlayer(game)) {
  let total = 0;
  const names = [];
  const locations = getCampaignLocations(game);

  Object.entries(game.ownership).forEach(([cellKey, ownerId]) => {
    if (ownerId !== player.id) return;
    const cell = getLocationCell(game, game.location.id, Number(cellKey));
    if (!cell || cell.type !== CELL_TYPES.PROPERTY) return;
    let income = getDinosaurIncome(cell);
    const setBonus = hasSpeciesSetBonus(game, player.id, cell.label, locations);
    if (setBonus) income *= 2;
    total += income;
    names.push(
      `${cell.label} (+$${income.toLocaleString('ru')}${setBonus ? ', сет ×2' : ''})`
    );
  });

  if (total <= 0) return 0;

  player.money += total;
  addLog(
    game,
    `<strong>${player.name}</strong> получил доход с динозавров за круг: $${total.toLocaleString('ru')} <small>(${names.join(', ')})</small>`
  );
  return total;
}

function refreshCanRollForCurrentPlayer(game) {
  if (game.finished || hasPendingAction(game)) {
    game.canRoll = false;
    return;
  }
  const player = getCurrentPlayer(game);
  if (!player) {
    game.canRoll = false;
    return;
  }
  if (player.inJail) {
    game.canRoll = false;
    return;
  }
  const locId = getPlayerLocationId(player, game.location.id);
  game.canRoll = !isLocationBlockedForPlayer(game, player.id, locId);
}

/** Закрыть действие без передачи хода (удобно в Dev). */
function clearPendingKeepTurn(game) {
  game.pendingAction = null;
  refreshCanRollForCurrentPlayer(game);
}

function endAction(game, advanceTurn = true) {
  if (advanceTurn) finishTurn(game);
  else clearPendingKeepTurn(game);
}

function nextTurn(game) {
  finishTurn(game);
}

function canBuyPending(game) {
  if (!game.pendingAction || game.pendingAction.type !== 'buy') {
    return { ok: false, reason: 'нет предложения' };
  }
  const { cellIndex, playerIndex } = game.pendingAction;
  const player = game.players[playerIndex];
  const cell = game.location.cells[cellIndex];

  if (!player || !cell || cell.type !== CELL_TYPES.PROPERTY) {
    return { ok: false, reason: 'некорректная клетка' };
  }
  if (getOwnerId(game, cellIndex) != null) {
    return { ok: false, reason: 'уже куплен' };
  }
  if (player.money < cell.price) {
    return { ok: false, reason: 'недостаточно денег', player, cell };
  }
  return { ok: true, player, cell, cellIndex };
}

function buyDinosaur(game, { advanceTurn = true } = {}) {
  const check = canBuyPending(game);
  if (!check.ok) {
    if (check.reason === 'недостаточно денег') {
      addLog(
        game,
        `<strong>${check.player.name}</strong> не хватает денег на <strong>${check.cell.label}</strong> (нужно $${check.cell.price.toLocaleString('ru')})`
      );
    }
    return { success: false, reason: check.reason };
  }

  const { player, cell, cellIndex } = check;
  player.money -= cell.price;
  game.ownership[cellIndex] = player.id;
  syncOwnershipToCampaign(game);
  game.pendingAction = null;

  addLog(
    game,
    `<strong>${player.name}</strong> купил <strong>${cell.label}</strong> за $${cell.price.toLocaleString('ru')} (доход $${getDinosaurIncome(cell).toLocaleString('ru')}/круг)`
  );

  endAction(game, advanceTurn);
  return { success: true, cell, player };
}

function declineBuy(game, { advanceTurn = true } = {}) {
  if (!game.pendingAction || game.pendingAction.type !== 'buy') return false;
  const player = game.players[game.pendingAction.playerIndex];
  const cell = game.location.cells[game.pendingAction.cellIndex];
  addLog(game, `<strong>${player?.name || 'Игрок'}</strong> отказался от покупки <strong>${cell?.label || 'динозавра'}</strong>`);
  endAction(game, advanceTurn);
  return true;
}

function canBuyDnaPending(game) {
  const pending = game.pendingAction;
  if (!pending || (pending.type !== 'buy' && pending.type !== 'buy_dna')) {
    return { ok: false, reason: 'нет предложения ДНК' };
  }
  if (pending.type === 'buy' && !pending.allowDna) {
    return { ok: false, reason: 'ДНК здесь недоступна' };
  }
  const player = game.players[pending.playerIndex];
  const species = pending.dnaSpecies;
  const price = Number(pending.dnaPrice);
  if (!player || !species || !Number.isFinite(price)) {
    return { ok: false, reason: 'некорректное предложение ДНК' };
  }
  const count = getDnaCount(game, player.id, species);
  if (count >= DNA_SAMPLE_LIMIT) {
    return {
      ok: false,
      reason: `лимит ${DNA_SAMPLE_LIMIT} образца`,
      player,
      species,
      price,
      count,
    };
  }
  if (player.money < price) {
    return { ok: false, reason: 'недостаточно денег', player, species, price, count };
  }
  return { ok: true, player, species, price, count, pending };
}

function buyDnaSample(game, { advanceTurn = true } = {}) {
  const check = canBuyDnaPending(game);
  if (!check.ok) {
    if (check.reason === 'недостаточно денег') {
      addLog(
        game,
        `<strong>${check.player.name}</strong> не хватает денег на ДНК <strong>${check.species}</strong> (нужно $${check.price.toLocaleString('ru')})`
      );
    } else if (check.reason?.startsWith('лимит')) {
      addLog(
        game,
        `<strong>${check.player.name}</strong>: уже максимум ДНК <strong>${check.species}</strong> (${DNA_SAMPLE_LIMIT}/${DNA_SAMPLE_LIMIT})`
      );
    }
    return { success: false, reason: check.reason };
  }

  const { player, species, price } = check;
  player.money -= price;
  const nextCount = addDnaSample(game, player.id, species, 1);
  game.pendingAction = null;
  addLog(
    game,
    `<strong>${player.name}</strong> купил образец ДНК <strong>${species}</strong> за $${price.toLocaleString('ru')} (${nextCount}/${DNA_SAMPLE_LIMIT})`
  );
  endAction(game, advanceTurn);
  return { success: true, player, species, price, count: nextCount };
}

function declineBuyDna(game, { advanceTurn = true } = {}) {
  if (!game.pendingAction || game.pendingAction.type !== 'buy_dna') return false;
  const player = game.players[game.pendingAction.playerIndex];
  const species = game.pendingAction.dnaSpecies;
  addLog(
    game,
    `<strong>${player?.name || 'Игрок'}</strong> отказался от покупки ДНК <strong>${species || ''}</strong>`
  );
  endAction(game, advanceTurn);
  return true;
}

function canIncubatePending(game) {
  if (!game.pendingAction || game.pendingAction.type !== 'incubate') {
    return { ok: false, reason: 'нет предложения синтеза' };
  }
  const player = game.players[game.pendingAction.playerIndex];
  if (!player) return { ok: false, reason: 'игрок не найден' };
  if (!playerHasFullDnaSet(game, player.id)) {
    return { ok: false, reason: 'нет полного набора ДНК', player };
  }
  const cost =
    game.pendingAction.incubateCost != null
      ? Number(game.pendingAction.incubateCost)
      : INCUBATE_COST;
  if (player.money < cost) {
    return { ok: false, reason: 'недостаточно денег', player, cost };
  }
  return { ok: true, player, cost };
}

function incubateDinosaur(game, { advanceTurn = true } = {}) {
  const check = canIncubatePending(game);
  if (!check.ok) {
    if (check.reason === 'недостаточно денег') {
      addLog(
        game,
        `<strong>${check.player.name}</strong> не хватает денег на синтез (нужно $${Number(
          check.cost || INCUBATE_COST
        ).toLocaleString('ru')})`
      );
    }
    return { success: false, reason: check.reason };
  }

  const { player, cost } = check;
  if (!spendFullDnaSet(game, player.id)) {
    return { success: false, reason: 'нет полного набора ДНК' };
  }
  player.money -= cost;

  const locationId = SENEGAL_LOCATION_ID;
  const cell = createIncubatorDinoCell();
  const cellIndex = nextLabCellIndex(game, locationId);
  cell.index = cellIndex;
  cell.income = Math.max(50, Math.round((cell.price || 0) * 0.1));
  const campaign = ensureCampaign(game);
  if (!campaign.labCellsByLocation[locationId]) {
    campaign.labCellsByLocation[locationId] = {};
  }
  campaign.labCellsByLocation[locationId][String(cellIndex)] = cell;

  const map = getMutableOwnershipMap(game, locationId);
  map[cellIndex] = player.id;
  syncOwnershipToCampaign(game);
  game.pendingAction = null;

  addLog(
    game,
    cost > 0
      ? `<strong>${player.name}</strong> синтезировал <strong>${cell.label}</strong> в инкубаторе за $${cost.toLocaleString('ru')} (списан набор ДНК)`
      : `<strong>${player.name}</strong> синтезировал <strong>${cell.label}</strong> в инкубаторе бесплатно (списан набор ДНК)`
  );

  endAction(game, advanceTurn);
  return { success: true, player, cell, cellIndex, locationId, cost };
}

function declineIncubate(game, { advanceTurn = true } = {}) {
  if (!game.pendingAction || game.pendingAction.type !== 'incubate') return false;
  const player = game.players[game.pendingAction.playerIndex];
  addLog(game, `<strong>${player?.name || 'Игрок'}</strong> отказался от синтеза в инкубаторе`);
  endAction(game, advanceTurn);
  return true;
}

function canSellPending(game, dinoCellIndex) {
  if (!game.pendingAction || game.pendingAction.type !== 'sell') {
    return { ok: false, reason: 'нет предложения' };
  }
  const player = game.players[game.pendingAction.playerIndex];
  if (!player) return { ok: false, reason: 'игрок не найден' };

  const sellBonus = game.pendingAction.sellBonus ?? SELL_BONUS;
  const owned = getOwnedDinosaurs(game, player.id, sellBonus);
  if (!owned.length) return { ok: false, reason: 'нет динозавров', player };

  const targetIndex = dinoCellIndex != null ? Number(dinoCellIndex) : null;
  const dino = owned.find((d) => d.cellIndex === targetIndex) || null;
  if (dinoCellIndex != null && !dino) {
    return { ok: false, reason: 'динозавр не принадлежит игроку', player };
  }

  return { ok: true, player, owned, dino };
}

function sellDinosaur(game, dinoCellIndex, { advanceTurn = true } = {}) {
  const check = canSellPending(game, dinoCellIndex);
  if (!check.ok || !check.dino) {
    return { success: false, reason: check.reason || 'не выбран динозавр' };
  }

  const { player, dino } = check;
  const sellBonus = game.pendingAction.sellBonus ?? SELL_BONUS;
  const brokerName = game.pendingAction.brokerName || CHARACTER_NAME;
  const locId = game.location.id;
  const traitRate = getSellTraitBonusRate(game, locId, dino.cellIndex);
  const traitBonus = Math.round((dino.cell.price || 0) * traitRate);
  const sellPrice = getSellPrice(dino.cell, sellBonus, {
    game,
    locationId: locId,
    cellIndex: dino.cellIndex,
  });

  delete game.ownership[dino.cellIndex];
  clearDinoMeta(game, locId, dino.cellIndex);
  syncOwnershipToCampaign(game);
  player.money += sellPrice;
  game.pendingAction = null;

  const traitHint =
    traitRate > 0
      ? ` + $${traitBonus.toLocaleString('ru')} (${Math.round(traitRate * 100)}% за ${
          traitRate >= SELL_TRAINED_BONUS_RATE ? 'дрессировку' : 'агр./инт.'
        })`
      : '';
  addLog(
    game,
    `<strong>${player.name}</strong> продал <strong>${dino.cell.label}</strong> персонажу <strong>${brokerName}</strong> за $${sellPrice.toLocaleString('ru')} (покупка $${dino.cell.price.toLocaleString('ru')} + $${sellBonus.toLocaleString('ru')}${traitHint})`
  );

  if (checkWin(game)) {
    return { success: true, cell: dino.cell, sellPrice, player, won: true };
  }

  endAction(game, advanceTurn);
  return { success: true, cell: dino.cell, sellPrice, player };
}

function declineSell(game, { advanceTurn = true } = {}) {
  if (!game.pendingAction || game.pendingAction.type !== 'sell') return false;
  const player = game.players[game.pendingAction.playerIndex];
  const brokerName = game.pendingAction.brokerName || CHARACTER_NAME;
  addLog(
    game,
    `<strong>${player?.name || 'Игрок'}</strong> не стал продавать динозавра персонажу <strong>${brokerName}</strong>`
  );
  endAction(game, advanceTurn);
  return true;
}

/** Универсальный отказ от текущего действия (покупка / продажа / ресторан / …). */
function getRentCoverCandidates(game, playerId, remaining) {
  const locations = getCampaignLocations(game);
  const need = Math.max(0, Number(remaining) || 0);
  return getOwnedDinosaursAllLocations(game, playerId, locations)
    .map((d) => ({
      ...d,
      coverValue: getDinoCoverValue(game, d.locationId, d.cellIndex, d.cell),
    }))
    .filter((d) => d.coverValue >= need)
    .sort((a, b) => a.coverValue - b.coverValue);
}

function finishRentSuccess(game, { advanceTurn = true } = {}) {
  const pending = game.pendingAction;
  if (!pending || pending.type !== 'rent') return { success: false };
  const allowDna = pending.allowDna;
  const dnaSpecies = pending.dnaSpecies;
  const dnaPrice = pending.dnaPrice;
  const cellIndex = pending.cellIndex;
  const playerIndex = pending.playerIndex;
  const payer = game.players[playerIndex];
  game.pendingAction = null;
  checkWin(game);
  if (game.finished) return { success: true, done: true };

  if (allowDna && dnaSpecies && payer && !payer.bankrupt) {
    game.pendingAction = {
      type: 'buy_dna',
      cellIndex,
      playerIndex,
      dnaSpecies,
      dnaPrice,
    };
    addLog(
      game,
      `<strong>${payer.name}</strong>: штраф оплачен — можно купить ДНК <strong>${dnaSpecies}</strong>`
    );
    return { success: true, dnaOffer: true };
  }

  endAction(game, advanceTurn);
  return { success: true };
}

/** Списать доступные деньги в счёт штрафа; при нехватке — выбор динозавра. */
function settleRentCash(game, { advanceTurn = true } = {}) {
  const pending = game.pendingAction;
  if (!pending || pending.type !== 'rent') {
    return { success: false, reason: 'нет штрафа' };
  }
  const payer = game.players[pending.playerIndex];
  const owner = getPlayerById(game, pending.ownerId);
  if (!payer || !owner || payer.bankrupt) {
    return { success: false, reason: 'игроки недоступны' };
  }

  const remaining = Math.max(0, pending.fine - (pending.paidCash || 0));
  const cash = Math.min(Math.max(0, payer.money), remaining);
  payer.money -= cash;
  owner.money += cash;
  pending.paidCash = (pending.paidCash || 0) + cash;

  if (pending.paidCash >= pending.fine) {
    addLog(
      game,
      `<strong>${payer.name}</strong> заплатил штраф $${pending.fine.toLocaleString('ru')} игроку <strong>${owner.name}</strong>`
    );
    return finishRentSuccess(game, { advanceTurn });
  }

  const stillDue = pending.fine - pending.paidCash;
  pending.needsDino = true;
  const candidates = getRentCoverCandidates(game, payer.id, stillDue);
  if (!candidates.length) {
    return declareBankruptcy(game, pending.playerIndex, {
      reason: 'нечем покрыть штраф',
      advanceTurn,
    });
  }

  addLog(
    game,
    `<strong>${payer.name}</strong> отдал $${cash.toLocaleString('ru')}; осталось $${stillDue.toLocaleString('ru')} — выберите динозавра на покрытие`
  );
  return { success: true, needsDino: true, remaining: stillDue, candidates };
}

function payRentWithDinosaur(game, offerLocationId, offerCellIndex, { advanceTurn = true } = {}) {
  const pending = game.pendingAction;
  if (!pending || pending.type !== 'rent') {
    return { success: false, reason: 'нет штрафа' };
  }
  const payer = game.players[pending.playerIndex];
  const owner = getPlayerById(game, pending.ownerId);
  if (!payer || !owner || payer.bankrupt) {
    return { success: false, reason: 'игроки недоступны' };
  }

  // Сначала добираем оставшиеся деньги (если ещё не списали)
  if (!pending.needsDino) {
    const pre = settleRentCash(game, { advanceTurn: false });
    if (pre.dnaOffer || pre.done || (pre.success && !pre.needsDino)) return pre;
    if (pre.bankrupt) return pre;
  }

  const remaining = Math.max(0, pending.fine - (pending.paidCash || 0));
  if (remaining <= 0) return finishRentSuccess(game, { advanceTurn });

  const locId = offerLocationId;
  const cellIndex = Number(offerCellIndex);
  if (getOwnerOnLocation(game, locId, cellIndex) !== payer.id) {
    return { success: false, reason: 'динозавр вам не принадлежит' };
  }
  const cell = getLocationCell(game, locId, cellIndex, getCampaignLocations(game));
  if (!cell || cell.type !== CELL_TYPES.PROPERTY) {
    return { success: false, reason: 'некорректный динозавр' };
  }

  const cover = getDinoCoverValue(game, locId, cellIndex, cell);
  if (cover < remaining) {
    return { success: false, reason: 'динозавр не покрывает остаток штрафа' };
  }

  const map = getMutableOwnershipMap(game, locId);
  map[cellIndex] = owner.id;
  syncOwnershipToCampaign(game);

  const change = cover - remaining;
  if (change > 0) {
    payer.money += change;
  }

  const deadBit = getDinoHpState(game, locId, cellIndex, cell).dead ? ' (мёртвый, 75%)' : '';
  addLog(
    game,
    `<strong>${payer.name}</strong> отдал <strong>${cell.label}</strong>${deadBit} (покрытие $${cover.toLocaleString('ru')}) игроку <strong>${owner.name}</strong> в счёт штрафа${
      change > 0 ? `; сдача $${change.toLocaleString('ru')} из банка` : ''
    }`
  );

  pending.paidCash = pending.fine;
  checkWin(game);
  return finishRentSuccess(game, { advanceTurn });
}

function declareBankruptcy(game, playerIndex, { reason = '', advanceTurn = true } = {}) {
  const player = game.players[playerIndex];
  if (!player || player.bankrupt) {
    return { success: false, reason: 'уже банкрот', bankrupt: true };
  }

  player.bankrupt = true;
  player.money = 0;
  player.inJail = false;
  player.eventShield = false;
  stripPlayerOwnership(game, player.id);

  const campaign = ensureCampaign(game);
  if (campaign.dnaByPlayer) delete campaign.dnaByPlayer[String(player.id)];
  if (campaign.lapByPlayer) delete campaign.lapByPlayer[String(player.id)];

  game.pendingAction = null;
  if (game.pendingTrade) {
    const t = game.pendingTrade;
    if (t.proposerIndex === playerIndex || t.partnerIndex === playerIndex) {
      game.pendingTrade = null;
    }
  }
  if (game.pendingBattle) {
    const b = game.pendingBattle;
    if (b.proposerIndex === playerIndex || b.partnerIndex === playerIndex) {
      game.pendingBattle = null;
    }
  }

  addLog(
    game,
    `💀 <strong>${player.name}</strong> банкрот${reason ? ` (${reason})` : ''} — наблюдает за игрой`
  );

  if (checkWin(game)) {
    return { success: true, bankrupt: true, player, won: true };
  }

  if (game.currentPlayerIndex === playerIndex) {
    endAction(game, advanceTurn);
  }
  return { success: true, bankrupt: true, player };
}

function declinePendingAction(game, options = {}) {
  if (!game.pendingAction) return false;
  if (game.pendingAction.type === 'buy') return declineBuy(game, options);
  if (game.pendingAction.type === 'buy_dna') return declineBuyDna(game, options);
  if (game.pendingAction.type === 'incubate') return declineIncubate(game, options);
  if (game.pendingAction.type === 'sell') return declineSell(game, options);
  if (game.pendingAction.type === 'rent') {
    // Штраф обязателен — отказ = попытка банкротства через settle
    return settleRentCash(game, options).success;
  }
  if (game.pendingAction.type === 'restaurant') return declineRestaurant(game, options);
  if (game.pendingAction.type === 'training') return skipTraining(game, options);
  if (game.pendingAction.type === 'experiment') return skipExperiment(game, options);
  return false;
}

function getOwnedDinosaurs(game, playerId, sellBonus = SELL_BONUS) {
  const pid = Number(playerId);
  const locId = game.location.id;
  return Object.entries(game.ownership)
    .filter(([, ownerId]) => Number(ownerId) === pid)
    .map(([cellKey]) => {
      const cellIndex = Number(cellKey);
      const cell = getLocationCell(game, locId, cellIndex);
      if (!cell || cell.type !== CELL_TYPES.PROPERTY) return null;
      const traits = getDinoTraits(game, locId, cellIndex);
      const trained = isDinoTrained(game, locId, cellIndex);
      const sellTraitRate = getSellTraitBonusRate(game, locId, cellIndex);
      return {
        cellIndex,
        cell,
        income: getDinosaurIncome(cell),
        sellPrice: getSellPrice(cell, sellBonus, { game, locationId: locId, cellIndex }),
        sellTraitRate,
        trained,
        intellect: traits.intellect,
        aggression: traits.aggression,
        attractiveness: getAttractiveness(cell, game, locId),
      };
    })
    .filter(Boolean);
}

/** Синхронизировать ownership текущей локации в кампанию. */
function syncOwnershipToCampaign(game) {
  const campaign = ensureCampaign(game);
  campaign.ownershipByLocation[game.location.id] = game.ownership;
  return campaign;
}

function getMutableOwnershipMap(game, locationId) {
  const campaign = syncOwnershipToCampaign(game);
  if (locationId === game.location.id) return game.ownership;
  if (!campaign.ownershipByLocation[locationId]) {
    campaign.ownershipByLocation[locationId] = {};
  }
  return campaign.ownershipByLocation[locationId];
}

function getOwnerOnLocation(game, locationId, cellIndex) {
  const map = getMutableOwnershipMap(game, locationId);
  const id = map[cellIndex];
  return id === undefined || id === null ? null : id;
}

/** Сравнение владельца с игроком; учитывает id === 0 (Number(null) === 0 — ловушка). */
function sameOwnerId(ownerId, playerId) {
  if (ownerId === undefined || ownerId === null || ownerId === '') return false;
  return Number(ownerId) === Number(playerId);
}

function findLocationById(locations, locationId) {
  if (!locations || !locations.length) return null;
  return locations.find((l) => l.id === locationId) || null;
}

/**
 * Все купленные динозавры игрока по всем локациям кампании.
 * @param {object[]} locations — каталог локаций (GameData.LOCATIONS)
 */
function getOwnedDinosaursAllLocations(game, playerId, locations, sellBonus = SELL_BONUS) {
  if (!locations || !locations.length) {
    return getOwnedDinosaurs(game, playerId, sellBonus).map((d) => ({
      ...d,
      locationId: game.location.id,
      locationName: game.location.name,
    }));
  }

  syncOwnershipToCampaign(game);
  const campaign = ensureCampaign(game);
  const pid = Number(playerId);
  const result = [];

  locations.forEach((loc) => {
    const ownership =
      loc.id === game.location.id
        ? game.ownership
        : campaign.ownershipByLocation[loc.id] || {};

    Object.entries(ownership).forEach(([cellKey, ownerId]) => {
      if (Number(ownerId) !== pid) return;
      const cellIndex = Number(cellKey);
      const cell = getLocationCell(game, loc.id, cellIndex, locations);
      if (!cell || cell.type !== CELL_TYPES.PROPERTY) return;
      const traits = getDinoTraits(game, loc.id, cellIndex);
      const hpState = getDinoHpState(game, loc.id, cellIndex, cell);
      const trained = isDinoTrained(game, loc.id, cellIndex);
      result.push({
        locationId: loc.id,
        locationName: loc.name,
        cellIndex,
        cell,
        income: getDinosaurIncome(cell),
        sellPrice: getSellPrice(cell, sellBonus, {
          game,
          locationId: loc.id,
          cellIndex,
        }),
        sellTraitRate: getSellTraitBonusRate(game, loc.id, cellIndex),
        attractiveness: getAttractiveness(cell, game, loc.id),
        ownerId: pid,
        owner: getPlayerById(game, pid),
        intellect: traits.intellect,
        aggression: traits.aggression,
        trained,
        hp: hpState.hp,
        maxHp: hpState.maxHp,
        damage: hpState.damage,
        dead: hpState.dead,
        startsToFullHeal: hpState.startsToFullHeal,
        healCost: hpState.dead
          ? 0
          : getHpRestoreCost(cell.price, hpState.hp, hpState.maxHp),
        reviveCost: getHpRestoreCost(cell.price, 0, hpState.maxHp),
        labCrafted: Boolean(cell.labCrafted),
      });
    });
  });

  return result;
}

function getAliveOwnedDinosaursAllLocations(game, playerId, locations) {
  return getOwnedDinosaursAllLocations(game, playerId, locations).filter((d) => !d.dead);
}

/** Купленные динозавры всех игроков, кроме указанного (по всем локациям). */
function getOtherPlayersDinosaursAllLocations(game, exceptPlayerId, locations) {
  if (!locations || !locations.length) return [];
  const except = Number(exceptPlayerId);
  const result = [];
  game.players.forEach((p) => {
    if (Number(p.id) === except) return;
    getOwnedDinosaursAllLocations(game, p.id, locations).forEach((d) => {
      result.push({ ...d, ownerId: p.id, owner: p });
    });
  });
  return result;
}

function tradeRefKey(locationId, cellIndex) {
  return `${locationId}|${cellIndex}`;
}

function dnaTradeRefKey(ownerId, species) {
  return `dna|${ownerId}|${species}`;
}

function parseTradeRefKey(value) {
  if (value == null || value === '') return null;
  const str = String(value);
  if (str.startsWith('dna|')) {
    const parts = str.split('|');
    if (parts.length < 3) return null;
    const ownerId = Number(parts[1]);
    const species = parts.slice(2).join('|');
    if (!Number.isFinite(ownerId) || !species) return null;
    return { kind: 'dna', ownerId, species };
  }
  const sep = str.lastIndexOf('|');
  if (sep <= 0) return null;
  const locationId = str.slice(0, sep);
  const cellIndex = Number(str.slice(sep + 1));
  if (!locationId || !Number.isFinite(cellIndex)) return null;
  return { kind: 'dino', locationId, cellIndex };
}

function describeTradeAsset(game, locations, asset) {
  if (!asset) return null;
  if (asset.kind === 'dna') {
    const entry = getDnaCatalogEntry(game, asset.species, locations);
    const owner = getPlayerById(game, asset.ownerId);
    return {
      kind: 'dna',
      label: `ДНК ${asset.species}`,
      locationName: 'Сенегал',
      attractiveness: entry?.attractiveness || 1,
      owner,
      ownerId: asset.ownerId,
      species: asset.species,
      count: getDnaCount(game, asset.ownerId, asset.species),
    };
  }
  const cell = getLocationCell(game, asset.locationId, asset.cellIndex, locations);
  const loc = findLocationById(locations, asset.locationId);
  if (!cell) return null;
  const ownerId = getOwnerOnLocation(game, asset.locationId, asset.cellIndex);
  return {
    kind: 'dino',
    label: cell.label,
    locationName: loc?.name || '',
    attractiveness: getAttractiveness(cell, game, asset.locationId),
    owner: getPlayerById(game, ownerId),
    ownerId,
    locationId: asset.locationId,
    cellIndex: asset.cellIndex,
    cell,
  };
}

/**
 * Обмен 1↔1: динозавр↔динозавр, ДНК↔ДНК, динозавр↔ДНК.
 * Аргументы — либо старые (locationId, cellIndex ×2), либо объекты/refs.
 */
function normalizeTradeAssetArgs(a, b, c, d) {
  if (a && typeof a === 'object' && a.kind) {
    return { offer: a, request: b };
  }
  if (typeof a === 'string' && String(a).includes('|') && (b == null || typeof b === 'string')) {
    return { offer: parseTradeRefKey(a), request: parseTradeRefKey(b) };
  }
  return {
    offer: { kind: 'dino', locationId: a, cellIndex: b },
    request: { kind: 'dino', locationId: c, cellIndex: d },
  };
}

function canProposeTrade(game, locations, proposerIndex, offerArg, requestArg, requestLocationId, requestCellIndex) {
  if (game.finished) return { ok: false, reason: 'игра окончена' };
  if (game.pendingTrade) return { ok: false, reason: 'уже есть предложение обмена' };
  if (game.pendingBattle) return { ok: false, reason: 'сначала завершите бой' };

  const proposer = game.players[proposerIndex];
  if (!proposer || proposer.bankrupt) return { ok: false, reason: 'игрок не найден' };

  const { offer, request } = normalizeTradeAssetArgs(
    offerArg,
    requestArg,
    requestLocationId,
    requestCellIndex
  );
  if (!offer || !request) return { ok: false, reason: 'некорректный выбор обмена' };

  const offerDesc = describeTradeAsset(game, locations, offer);
  const requestDesc = describeTradeAsset(game, locations, request);
  if (!offerDesc || !requestDesc) return { ok: false, reason: 'актив недоступен' };

  if (offer.kind === 'dino') {
    if (offerDesc.ownerId !== proposer.id) {
      return { ok: false, reason: 'динозавр вам не принадлежит' };
    }
  } else if (offer.kind === 'dna') {
    if (Number(offer.ownerId) !== Number(proposer.id)) {
      return { ok: false, reason: 'ДНК вам не принадлежит' };
    }
    if (getDnaCount(game, proposer.id, offer.species) < 1) {
      return { ok: false, reason: 'нет образца ДНК' };
    }
  } else {
    return { ok: false, reason: 'некорректный ваш актив' };
  }

  let partnerId = null;
  if (request.kind === 'dino') {
    partnerId = requestDesc.ownerId;
    if (partnerId == null) {
      return { ok: false, reason: 'можно обменивать только на купленного другим игроком' };
    }
    if (Number(partnerId) === Number(proposer.id)) {
      return { ok: false, reason: 'это уже ваш динозавр' };
    }
  } else if (request.kind === 'dna') {
    partnerId = request.ownerId;
    if (Number(partnerId) === Number(proposer.id)) {
      return { ok: false, reason: 'это уже ваша ДНК' };
    }
    if (getDnaCount(game, partnerId, request.species) < 1) {
      return { ok: false, reason: 'у партнёра нет этой ДНК' };
    }
  } else {
    return { ok: false, reason: 'некорректный актив партнёра' };
  }

  if (
    offer.kind === 'dino' &&
    request.kind === 'dino' &&
    offer.locationId === request.locationId &&
    Number(offer.cellIndex) === Number(request.cellIndex)
  ) {
    return { ok: false, reason: 'нужны разные активы' };
  }

  const partnerIndex = game.players.findIndex((p) => Number(p.id) === Number(partnerId));
  const partner = partnerIndex >= 0 ? game.players[partnerIndex] : null;
  if (!partner || partner.bankrupt) return { ok: false, reason: 'партнёр не найден' };

  return {
    ok: true,
    proposer,
    partner,
    partnerIndex,
    offer,
    request,
    offerDesc,
    requestDesc,
    offerAttr: offerDesc.attractiveness,
    requestAttr: requestDesc.attractiveness,
    // обратная совместимость для старого UI
    offerLocationId: offer.kind === 'dino' ? offer.locationId : null,
    offerCellIndex: offer.kind === 'dino' ? offer.cellIndex : null,
    requestLocationId: request.kind === 'dino' ? request.locationId : null,
    requestCellIndex: request.kind === 'dino' ? request.cellIndex : null,
    offerCell: offerDesc.cell || null,
    requestCell: requestDesc.cell || null,
    offerLoc: offer.kind === 'dino' ? findLocationById(locations, offer.locationId) : null,
    requestLoc: request.kind === 'dino' ? findLocationById(locations, request.locationId) : null,
  };
}

/** Предложить обмен (динозавр/ДНК), не блокирует кубик. */
function proposeTrade(game, locations, proposerIndex, offerArg, requestArg, requestLocationId, requestCellIndex) {
  const check = canProposeTrade(
    game,
    locations,
    proposerIndex,
    offerArg,
    requestArg,
    requestLocationId,
    requestCellIndex
  );
  if (!check.ok) return { success: false, reason: check.reason };

  game.pendingTrade = {
    proposerIndex,
    partnerIndex: check.partnerIndex,
    offer: check.offer,
    request: check.request,
    offerLocationId: check.offerLocationId,
    offerCellIndex: check.offerCellIndex,
    requestLocationId: check.requestLocationId,
    requestCellIndex: check.requestCellIndex,
  };

  const delta = check.requestAttr - check.offerAttr;
  const fairHint =
    delta === 0
      ? 'обмен равный по привлекательности'
      : delta > 0
        ? `партнёр отдаёт на ${delta} привлекательности больше`
        : `вы отдаёте на ${Math.abs(delta)} привлекательности больше`;

  addLog(
    game,
    `<strong>${check.proposer.name}</strong> предлагает обмен: <strong>${check.offerDesc.label}</strong> (${check.offerDesc.locationName}, ★${check.offerAttr}) ⇄ <strong>${check.requestDesc.label}</strong> (${check.requestDesc.locationName}, ★${check.requestAttr}) — ${fairHint}`
  );

  return { success: true, pendingTrade: game.pendingTrade, ...check };
}

function tradeAssetStillValid(game, locations, asset, expectedOwnerId) {
  if (!asset) return false;
  if (asset.kind === 'dna') {
    return (
      Number(asset.ownerId) === Number(expectedOwnerId) &&
      getDnaCount(game, asset.ownerId, asset.species) >= 1
    );
  }
  return getOwnerOnLocation(game, asset.locationId, asset.cellIndex) === expectedOwnerId;
}

function transferTradeAsset(game, asset, fromId, toId) {
  if (asset.kind === 'dna') {
    const fromCount = getDnaCount(game, fromId, asset.species);
    const toCount = getDnaCount(game, toId, asset.species);
    if (fromCount < 1) return false;
    if (toCount >= DNA_SAMPLE_LIMIT) return false;
    setDnaCount(game, fromId, asset.species, fromCount - 1);
    setDnaCount(game, toId, asset.species, toCount + 1);
    return true;
  }
  const map = getMutableOwnershipMap(game, asset.locationId);
  if (map[asset.cellIndex] !== fromId) return false;
  map[asset.cellIndex] = toId;
  return true;
}

function acceptTrade(game, { actorUserId = null, locations = null } = {}) {
  const trade = game.pendingTrade;
  if (!trade) return { success: false, reason: 'нет предложения' };

  const proposer = game.players[trade.proposerIndex];
  const partner = game.players[trade.partnerIndex];
  const locs = locations || game.locationCatalog || [game.location];

  if (game.online && actorUserId != null) {
    if (!partner?.userId || partner.userId !== actorUserId) {
      return { success: false, reason: 'принять обмен может только партнёр' };
    }
  }

  const offer =
    trade.offer ||
    (trade.offerLocationId != null
      ? { kind: 'dino', locationId: trade.offerLocationId, cellIndex: trade.offerCellIndex }
      : null);
  const request =
    trade.request ||
    (trade.requestLocationId != null
      ? {
          kind: 'dino',
          locationId: trade.requestLocationId,
          cellIndex: trade.requestCellIndex,
        }
      : null);

  if (
    !proposer ||
    !partner ||
    !tradeAssetStillValid(game, locs, offer, proposer.id) ||
    !tradeAssetStillValid(game, locs, request, partner.id)
  ) {
    game.pendingTrade = null;
    addLog(game, 'Обмен отменён: активы больше недоступны');
    return { success: false, reason: 'активы недоступны' };
  }

  // Лимит ДНК у получателя
  if (offer.kind === 'dna' && getDnaCount(game, partner.id, offer.species) >= DNA_SAMPLE_LIMIT) {
    return { success: false, reason: `у партнёра лимит ДНК ${offer.species}` };
  }
  if (request.kind === 'dna' && getDnaCount(game, proposer.id, request.species) >= DNA_SAMPLE_LIMIT) {
    return { success: false, reason: `у вас лимит ДНК ${request.species}` };
  }

  const okOffer = transferTradeAsset(game, offer, proposer.id, partner.id);
  if (!okOffer) {
    game.pendingTrade = null;
    addLog(game, 'Обмен отменён: не удалось передать активы');
    return { success: false, reason: 'не удалось передать активы' };
  }
  const okRequest = transferTradeAsset(game, request, partner.id, proposer.id);
  if (!okRequest) {
    transferTradeAsset(game, offer, partner.id, proposer.id);
    game.pendingTrade = null;
    addLog(game, 'Обмен отменён: не удалось передать активы');
    return { success: false, reason: 'не удалось передать активы' };
  }

  syncOwnershipToCampaign(game);
  game.pendingTrade = null;

  const offerDesc = describeTradeAsset(game, locs, {
    ...offer,
    ownerId: offer.kind === 'dna' ? partner.id : offer.ownerId,
  });
  const requestDesc = describeTradeAsset(game, locs, {
    ...request,
    ownerId: request.kind === 'dna' ? proposer.id : request.ownerId,
  });
  // После обмена DNA ownerId в asset устарел — опишем по kind/species напрямую
  const offerLabel =
    offer.kind === 'dna' ? `ДНК ${offer.species}` : getLocationCell(game, offer.locationId, offer.cellIndex, locs)?.label;
  const requestLabel =
    request.kind === 'dna'
      ? `ДНК ${request.species}`
      : getLocationCell(game, request.locationId, request.cellIndex, locs)?.label;
  const offerAttr =
    offer.kind === 'dna'
      ? getDnaCatalogEntry(game, offer.species, locs)?.attractiveness || 1
      : getAttractiveness(
          getLocationCell(game, offer.locationId, offer.cellIndex, locs),
          game,
          offer.locationId
        );
  const requestAttr =
    request.kind === 'dna'
      ? getDnaCatalogEntry(game, request.species, locs)?.attractiveness || 1
      : getAttractiveness(
          getLocationCell(game, request.locationId, request.cellIndex, locs),
          game,
          request.locationId
        );

  addLog(
    game,
    `Обмен состоялся: <strong>${proposer.name}</strong> отдал <strong>${offerLabel}</strong> (★${offerAttr}) и получил <strong>${requestLabel}</strong> (★${requestAttr}) от <strong>${partner.name}</strong>`
  );

  return {
    success: true,
    proposer,
    partner,
    offerCell: offer.kind === 'dino' ? getLocationCell(game, offer.locationId, offer.cellIndex, locs) : null,
    requestCell:
      request.kind === 'dino'
        ? getLocationCell(game, request.locationId, request.cellIndex, locs)
        : null,
    offerDesc,
    requestDesc,
  };
}

function declineTrade(game, { actorUserId = null } = {}) {
  const trade = game.pendingTrade;
  if (!trade) return false;
  const proposer = game.players[trade.proposerIndex];
  const partner = game.players[trade.partnerIndex];

  if (game.online && actorUserId != null) {
    if (!partner?.userId || partner.userId !== actorUserId) {
      return false;
    }
  }

  game.pendingTrade = null;
  addLog(
    game,
    `<strong>${partner?.name || 'Партнёр'}</strong> отклонил обмен от <strong>${proposer?.name || 'игрока'}</strong>`
  );
  return true;
}

function cancelTrade(game, { actorUserId = null } = {}) {
  const trade = game.pendingTrade;
  if (!trade) return false;
  const proposer = game.players[trade.proposerIndex];

  if (game.online && actorUserId != null) {
    if (!proposer?.userId || proposer.userId !== actorUserId) {
      return false;
    }
  }

  game.pendingTrade = null;
  addLog(game, `<strong>${proposer?.name || 'Игрок'}</strong> отозвал предложение обмена`);
  return true;
}

/* ===================== БИТВЫ ===================== */

function battleSidePlayer(game, battle, side) {
  const idx = side === 'proposer' ? battle.proposerIndex : battle.partnerIndex;
  return game.players[idx] || null;
}

function buildFighterSnapshot(game, locations, locationId, cellIndex) {
  const loc = findLocationById(locations, locationId);
  const cell = getLocationCell(game, locationId, cellIndex, locations);
  if (!cell) return null;
  const traits = getDinoTraits(game, locationId, cellIndex);
  const hpState = getDinoHpState(game, locationId, cellIndex, cell);
  return {
    locationId,
    cellIndex,
    label: cell.label,
    locationName: loc.name,
    price: cell.price || 0,
    attractiveness: getAttractiveness(cell, game, locationId),
    intellect: traits.intellect,
    aggression: traits.aggression,
    maxHp: hpState.maxHp,
    hp: hpState.dead ? 0 : hpState.hp,
    damage: hpState.damage,
    dead: Boolean(hpState.dead),
  };
}

function determineBattleFirstSide(battle) {
  const a = battle.fighters.proposer;
  const b = battle.fighters.partner;
  if (a.aggression && !b.aggression) return 'proposer';
  if (b.aggression && !a.aggression) return 'partner';
  if (a.attractiveness > b.attractiveness) return 'proposer';
  if (b.attractiveness > a.attractiveness) return 'partner';
  return 'proposer';
}

function otherBattleSide(side) {
  return side === 'proposer' ? 'partner' : 'proposer';
}

function isArenaCell(cell) {
  return Boolean(cell && cell.effect === 'arena');
}

/** Клетка, на которой сейчас стоит игрок (с учётом его локации). */
function getPlayerBoardCell(game, player) {
  if (!player) return null;
  const locId = getPlayerLocationId(player, game.location.id);
  const locs = getCampaignLocations(game);
  const loc =
    findLocationById(locs, locId) ||
    (game.location?.id === locId ? game.location : null);
  if (!loc?.cells?.length) return null;
  const cellIndex = clampCell(player.position, loc.cells.length);
  return {
    locationId: locId,
    location: loc,
    cellIndex,
    cell: loc.cells[cellIndex],
  };
}

function getPlayersOnArenas(game, { excludePlayerId = null } = {}) {
  return (game.players || []).filter((p) => {
    if (!p || p.bankrupt) return false;
    if (excludePlayerId != null && Number(p.id) === Number(excludePlayerId)) return false;
    const info = getPlayerBoardCell(game, p);
    return info && isArenaCell(info.cell);
  });
}

/**
 * Посадка на Арену: принудительный бой с другим игроком на любой Арене
 * (в т.ч. на другой локации). Награда победителю — ARENA_REWARD.
 */
function resolveArenaLanding(game, player, cell) {
  const reward =
    cell?.arenaReward != null ? Number(cell.arenaReward) : ARENA_REWARD;
  addLog(
    game,
    `<strong>${player.name}</strong> на <strong>${cell?.label || 'Арене'}</strong> — принудительный бой (награда $${reward.toLocaleString('ru')})`
  );

  if (game.pendingBattle) {
    addLog(game, 'Арена: сейчас уже идёт другой бой — дождитесь его окончания');
    return { started: false, reason: 'busy' };
  }
  if (game.pendingTrade) {
    addLog(game, 'Арена: сначала завершите обмен');
    return { started: false, reason: 'trade' };
  }

  const locations = getCampaignLocations(game);
  const myDinos = getAliveOwnedDinosaursAllLocations(game, player.id, locations);
  if (!myDinos.length) {
    addLog(
      game,
      `<strong>${player.name}</strong> ждёт на Арене: нет живых динозавров для боя`
    );
    return { started: false, reason: 'no_dinos' };
  }

  const opponents = getPlayersOnArenas(game, { excludePlayerId: player.id }).filter(
    (p) => getAliveOwnedDinosaursAllLocations(game, p.id, locations).length > 0
  );
  if (!opponents.length) {
    addLog(
      game,
      `<strong>${player.name}</strong> ждёт соперника на любой Арене (можно на другой карте)`
    );
    return { started: false, reason: 'waiting' };
  }

  const opponent = opponents[0];
  const proposerIndex = game.players.findIndex((p) => Number(p.id) === Number(player.id));
  const partnerIndex = game.players.findIndex((p) => Number(p.id) === Number(opponent.id));
  if (proposerIndex < 0 || partnerIndex < 0) {
    return { started: false, reason: 'player_missing' };
  }

  return startForcedArenaBattle(game, proposerIndex, partnerIndex, reward);
}

function startForcedArenaBattle(game, proposerIndex, partnerIndex, reward = ARENA_REWARD) {
  const locations = getCampaignLocations(game);
  const check = canProposeBattle(game, proposerIndex, partnerIndex, locations);
  if (!check.ok) {
    addLog(game, `Арена: бой не начался (${check.reason})`);
    return { started: false, reason: check.reason };
  }

  game.pendingBattle = {
    status: 'pick_dinos',
    forced: true,
    source: 'arena',
    arenaReward: reward,
    rewardPaid: false,
    proposerIndex,
    partnerIndex,
    proposerDino: null,
    partnerDino: null,
    fighters: null,
    firstSide: null,
    chooserSide: null,
    hiddenChoice: null,
    round: 0,
    lastReveal: null,
    loserSide: null,
    winnerSide: null,
    draw: false,
  };
  game.canRoll = false;

  addLog(
    game,
    `Арена: принудительный бой <strong>${check.proposer.name}</strong> vs <strong>${check.partner.name}</strong> — выберите динозавров (награда $${Number(
      reward
    ).toLocaleString('ru')})`
  );
  return { started: true, pendingBattle: game.pendingBattle };
}

function payArenaRewardIfNeeded(game, battle) {
  if (!battle?.forced || battle.rewardPaid || battle.draw || !battle.winnerSide) return false;
  const reward =
    battle.arenaReward != null ? Number(battle.arenaReward) : ARENA_REWARD;
  if (!(reward > 0)) return false;
  const winner = battleSidePlayer(game, battle, battle.winnerSide);
  if (!winner || winner.bankrupt) return false;
  winner.money += reward;
  battle.rewardPaid = true;
  addLog(
    game,
    `<strong>${winner.name}</strong> получает $${reward.toLocaleString('ru')} за победу на Арене`
  );
  checkWin(game);
  return true;
}

function canProposeBattle(game, proposerIndex, partnerIndex, locations) {
  if (game.finished) return { ok: false, reason: 'игра окончена' };
  if (game.pendingBattle) return { ok: false, reason: 'уже идёт бой или вызов' };
  if (game.pendingTrade) return { ok: false, reason: 'сначала завершите обмен' };
  const proposer = game.players[proposerIndex];
  const partner = game.players[partnerIndex];
  if (!proposer || !partner || proposer.bankrupt || partner.bankrupt) {
    return { ok: false, reason: 'игрок не найден' };
  }
  if (proposer.id === partner.id) return { ok: false, reason: 'нельзя вызвать себя' };
  const myDinos = getAliveOwnedDinosaursAllLocations(game, proposer.id, locations);
  const theirDinos = getAliveOwnedDinosaursAllLocations(game, partner.id, locations);
  if (!myDinos.length) return { ok: false, reason: 'нет живых динозавров для боя' };
  if (!theirDinos.length) return { ok: false, reason: 'у соперника нет живых динозавров' };
  return { ok: true, proposer, partner, myDinos, theirDinos };
}

function proposeBattle(game, proposerIndex, partnerIndex, locations) {
  const check = canProposeBattle(game, proposerIndex, partnerIndex, locations);
  if (!check.ok) return { success: false, reason: check.reason };
  game.pendingBattle = {
    status: 'awaiting_accept',
    proposerIndex,
    partnerIndex,
    proposerDino: null,
    partnerDino: null,
    fighters: null,
    firstSide: null,
    chooserSide: null,
    hiddenChoice: null,
    round: 0,
    lastReveal: null,
    loserSide: null,
    winnerSide: null,
    draw: false,
  };
  addLog(
    game,
    `<strong>${check.proposer.name}</strong> вызывает <strong>${check.partner.name}</strong> на бой!`
  );
  return { success: true, pendingBattle: game.pendingBattle };
}

function declineBattle(game, { actorUserId = null, actorPlayerId = null } = {}) {
  const battle = game.pendingBattle;
  if (!battle || battle.status !== 'awaiting_accept') return false;
  if (battle.forced) return false;
  const partner = game.players[battle.partnerIndex];
  const proposer = game.players[battle.proposerIndex];
  if (game.online && actorUserId != null) {
    if (!partner?.userId || partner.userId !== actorUserId) return false;
  } else if (actorPlayerId != null && Number(partner?.id) !== Number(actorPlayerId)) {
    return false;
  }
  game.pendingBattle = null;
  addLog(
    game,
    `<strong>${partner?.name || 'Игрок'}</strong> отклонил бой от <strong>${proposer?.name || 'игрока'}</strong>`
  );
  return true;
}

function cancelBattle(game, { actorUserId = null, actorPlayerId = null } = {}) {
  const battle = game.pendingBattle;
  if (!battle) return false;
  if (battle.forced) return false;
  if (battle.status !== 'awaiting_accept' && battle.status !== 'pick_dinos') return false;
  const proposer = game.players[battle.proposerIndex];
  if (game.online && actorUserId != null) {
    if (!proposer?.userId || proposer.userId !== actorUserId) return false;
  } else if (actorPlayerId != null && Number(proposer?.id) !== Number(actorPlayerId)) {
    return false;
  }
  game.pendingBattle = null;
  addLog(game, `<strong>${proposer?.name || 'Игрок'}</strong> отменил бой`);
  return true;
}

function acceptBattle(game, { actorUserId = null, actorPlayerId = null } = {}) {
  const battle = game.pendingBattle;
  if (!battle || battle.status !== 'awaiting_accept') {
    return { success: false, reason: 'нет вызова' };
  }
  const partner = game.players[battle.partnerIndex];
  if (game.online && actorUserId != null) {
    if (!partner?.userId || partner.userId !== actorUserId) {
      return { success: false, reason: 'принять может только вызванный' };
    }
  } else if (actorPlayerId != null && Number(partner?.id) !== Number(actorPlayerId)) {
    return { success: false, reason: 'принять может только вызванный — кликните его имя слева' };
  }
  battle.status = 'pick_dinos';
  addLog(game, `<strong>${partner.name}</strong> принял бой — выберите динозавров`);
  return { success: true };
}

function selectBattleDino(
  game,
  side,
  locationId,
  cellIndex,
  locations,
  { actorUserId = null, actorPlayerId = null } = {}
) {
  const battle = game.pendingBattle;
  if (!battle || battle.status !== 'pick_dinos') {
    return { success: false, reason: 'сейчас нельзя выбрать динозавра' };
  }
  const player = battleSidePlayer(game, battle, side);
  if (!player) return { success: false, reason: 'игрок не найден' };
  if (game.online && actorUserId != null) {
    if (!player.userId || player.userId !== actorUserId) {
      return { success: false, reason: 'не ваш выбор' };
    }
  } else if (actorPlayerId != null && Number(player.id) !== Number(actorPlayerId)) {
    return { success: false, reason: 'не ваш выбор — кликните своё имя слева' };
  }
  if (!sameOwnerId(getOwnerOnLocation(game, locationId, cellIndex), player.id)) {
    return { success: false, reason: 'не ваш динозавр' };
  }
  const snap = buildFighterSnapshot(game, locations, locationId, cellIndex);
  if (!snap || snap.dead) return { success: false, reason: 'динозавр недоступен' };

  if (side === 'proposer') battle.proposerDino = { locationId, cellIndex };
  else battle.partnerDino = { locationId, cellIndex };

  addLog(
    game,
    `<strong>${player.name}</strong> выбрал для боя <strong>${snap.label}</strong> (${snap.locationName})`
  );

  if (battle.proposerDino && battle.partnerDino) {
    return startBattleFight(game, locations);
  }
  return { success: true, pendingBattle: battle };
}

function startBattleFight(game, locations) {
  const battle = game.pendingBattle;
  if (!battle?.proposerDino || !battle?.partnerDino) {
    return { success: false, reason: 'динозавры не выбраны' };
  }
  const proposerF = buildFighterSnapshot(
    game,
    locations,
    battle.proposerDino.locationId,
    battle.proposerDino.cellIndex
  );
  const partnerF = buildFighterSnapshot(
    game,
    locations,
    battle.partnerDino.locationId,
    battle.partnerDino.cellIndex
  );
  if (!proposerF || !partnerF || proposerF.dead || partnerF.dead) {
    game.pendingBattle = null;
    return { success: false, reason: 'динозавры недоступны' };
  }
  battle.fighters = { proposer: proposerF, partner: partnerF };
  battle.status = 'fighting';
  battle.round = 1;
  battle.firstSide = determineBattleFirstSide(battle);
  battle.chooserSide = battle.firstSide;
  battle.hiddenChoice = null;
  battle.lastReveal = null;
  addLog(
    game,
    `Бой: <strong>${proposerF.label}</strong> (${proposerF.hp} HP) vs <strong>${partnerF.label}</strong> (${partnerF.hp} HP). Первым ходит ${
      battle.firstSide === 'proposer'
        ? game.players[battle.proposerIndex].name
        : game.players[battle.partnerIndex].name
    }`
  );
  return { success: true, pendingBattle: battle };
}

function submitBattleChoice(game, choice, { actorUserId = null, actorPlayerId = null } = {}) {
  const battle = game.pendingBattle;
  if (!battle || battle.status !== 'fighting') {
    return { success: false, reason: 'бой не идёт' };
  }
  if (choice !== 'attack' && choice !== 'shield') {
    return { success: false, reason: 'нужно attack или shield' };
  }
  const side = battle.chooserSide;
  const player = battleSidePlayer(game, battle, side);
  if (!player) return { success: false, reason: 'игрок не найден' };
  if (game.online && actorUserId != null) {
    if (!player.userId || player.userId !== actorUserId) {
      return { success: false, reason: 'сейчас не ваш ход в бою' };
    }
  } else if (actorPlayerId != null && Number(player.id) !== Number(actorPlayerId)) {
    return {
      success: false,
      reason: 'сейчас не ваш ход — кликните имя нужного игрока слева',
    };
  }

  if (battle.hiddenChoice == null) {
    battle.hiddenChoice = { side, choice };
    battle.chooserSide = otherBattleSide(side);
    addLog(game, `<strong>${player.name}</strong> сделал скрытый выбор в бою`);
    return { success: true, phase: 'wait_second' };
  }

  const first = battle.hiddenChoice;
  const second = { side, choice };
  return resolveBattleRound(game, first, second);
}

function resolveBattleRound(game, first, second) {
  const battle = game.pendingBattle;
  const bySide = {
    [first.side]: first.choice,
    [second.side]: second.choice,
  };
  const propChoice = bySide.proposer;
  const partChoice = bySide.partner;
  const prop = battle.fighters.proposer;
  const part = battle.fighters.partner;

  let dmgToProp = 0;
  let dmgToPart = 0;

  if (partChoice === 'attack') {
    dmgToProp = part.damage;
    if (prop.intellect) dmgToProp = Math.floor(dmgToProp * 0.5);
    if (propChoice === 'shield') dmgToProp = 0;
  }
  if (propChoice === 'attack') {
    dmgToPart = prop.damage;
    if (part.intellect) dmgToPart = Math.floor(dmgToPart * 0.5);
    if (partChoice === 'shield') dmgToPart = 0;
  }

  prop.hp = Math.max(0, prop.hp - dmgToProp);
  part.hp = Math.max(0, part.hp - dmgToPart);

  const choiceLabel = (c) => (c === 'attack' ? 'атака' : 'щит');
  battle.lastReveal = {
    round: battle.round,
    proposerChoice: propChoice,
    partnerChoice: partChoice,
    dmgToProp,
    dmgToPart,
    propHp: prop.hp,
    partHp: part.hp,
  };
  battle.hiddenChoice = null;

  addLog(
    game,
    `Раунд ${battle.round}: ${game.players[battle.proposerIndex].name} — ${choiceLabel(propChoice)}, ${
      game.players[battle.partnerIndex].name
    } — ${choiceLabel(partChoice)}. Урон: ${prop.label} −${dmgToProp} (HP ${prop.hp}), ${part.label} −${dmgToPart} (HP ${part.hp})`
  );

  const propDead = prop.hp <= 0;
  const partDead = part.hp <= 0;

  if (propDead || partDead) {
    persistFighterHp(game, battle);
    if (propDead && partDead) {
      battle.status = 'aftermath';
      battle.draw = true;
      battle.loserSide = null;
      battle.winnerSide = null;
      battle.winnerHealPending = false;
      addLog(game, 'Бой: оба динозавра погибли!');
    } else if (propDead) {
      battle.status = 'aftermath';
      battle.draw = false;
      battle.loserSide = 'proposer';
      battle.winnerSide = 'partner';
      battle.winnerHealPending = part.hp > 0 && part.hp < part.maxHp;
      addLog(
        game,
        `Победа: <strong>${game.players[battle.partnerIndex].name}</strong> — <strong>${prop.label}</strong> погиб`
      );
      payArenaRewardIfNeeded(game, battle);
    } else {
      battle.status = 'aftermath';
      battle.draw = false;
      battle.loserSide = 'partner';
      battle.winnerSide = 'proposer';
      battle.winnerHealPending = prop.hp > 0 && prop.hp < prop.maxHp;
      addLog(
        game,
        `Победа: <strong>${game.players[battle.proposerIndex].name}</strong> — <strong>${part.label}</strong> погиб`
      );
      payArenaRewardIfNeeded(game, battle);
    }
    return { success: true, phase: 'aftermath', pendingBattle: battle };
  }

  battle.round += 1;
  battle.firstSide = determineBattleFirstSide(battle);
  battle.chooserSide = battle.firstSide;
  return { success: true, phase: 'next_round', pendingBattle: battle };
}

function persistFighterHp(game, battle) {
  ['proposer', 'partner'].forEach((side) => {
    const f = battle.fighters[side];
    persistDinoCombatHp(game, f.locationId, f.cellIndex, f.hp, f.maxHp);
  });
}

function reviveCostForFighter(fighter) {
  return getHpRestoreCost(fighter.price, 0, fighter.maxHp || 1);
}

function healCostForFighter(fighter) {
  if (!fighter || fighter.dead || fighter.hp <= 0) return 0;
  return getHpRestoreCost(fighter.price, fighter.hp, fighter.maxHp || 1);
}

function finishBattleCleanup(game, battle) {
  const wasForced = Boolean(battle?.forced);
  game.pendingBattle = null;
  checkWin(game);
  if (wasForced && !game.finished) {
    finishTurn(game);
  }
  return { success: true, done: true, forced: wasForced };
}

/** Хил победителя после решения проигравшего. */
function resolveWinnerHealAftermath(
  game,
  action,
  { actorUserId = null, actorPlayerId = null } = {}
) {
  const battle = game.pendingBattle;
  if (!battle || battle.status !== 'aftermath' || !battle.loserResolved) {
    return { success: false, reason: 'сначала проигравший решает судьбу динозавра' };
  }
  if (!battle.winnerHealPending || !battle.winnerSide) {
    return finishBattleCleanup(game, battle);
  }

  const winner = battleSidePlayer(game, battle, battle.winnerSide);
  const alive = battle.fighters[battle.winnerSide];
  if (!winner || !alive) return finishBattleCleanup(game, battle);

  if (game.online && actorUserId != null) {
    if (!winner.userId || winner.userId !== actorUserId) {
      return { success: false, reason: 'решает победитель' };
    }
  } else if (actorPlayerId != null && Number(winner.id) !== Number(actorPlayerId)) {
    return { success: false, reason: 'решает победитель — кликните его имя слева' };
  }

  if (action === 'heal_winner') {
    const cost = healCostForFighter(alive);
    if (cost > 0 && winner.money < cost) {
      return { success: false, reason: 'недостаточно денег' };
    }
    if (cost > 0) winner.money -= cost;
    const pct = alive.price
      ? Math.round((cost / Math.max(1, alive.price)) * 100)
      : 0;
    setDinoHpState(game, alive.locationId, alive.cellIndex, {
      hp: alive.maxHp,
      dead: false,
    });
    alive.hp = alive.maxHp;
    addLog(
      game,
      `<strong>${winner.name}</strong> восстановил <strong>${alive.label}</strong> до полного HP за $${cost.toLocaleString('ru')} (~${pct}% цены)`
    );
  } else if (action === 'skip_heal_winner') {
    addLog(
      game,
      `<strong>${winner.name}</strong> оставил <strong>${alive.label}</strong> раненым (HP ${alive.hp}/${alive.maxHp}) — полное восстановление на 2-м старте`
    );
  } else {
    return { success: false, reason: 'неизвестное действие' };
  }

  battle.winnerHealPending = false;
  checkWin(game);
  return finishBattleCleanup(game, battle);
}

/**
 * Исход после смерти: сначала revive | give | abandon у проигравшего,
 * затем (если нужно) хил победителя.
 * При ничьей side обязателен (proposer/partner).
 */
function resolveBattleAftermath(
  game,
  action,
  { actorUserId = null, actorPlayerId = null, side = null } = {}
) {
  const battle = game.pendingBattle;
  if (!battle || battle.status !== 'aftermath') {
    return { success: false, reason: 'нет исхода боя' };
  }

  // Фаза 2: хил победителя — только после решения проигравшего
  if (action === 'heal_winner' || action === 'skip_heal_winner') {
    return resolveWinnerHealAftermath(game, action, { actorUserId, actorPlayerId });
  }

  if (battle.loserResolved && battle.winnerHealPending) {
    return { success: false, reason: 'победитель решает лечение' };
  }

  let loserSide = battle.loserSide;
  if (battle.draw) {
    loserSide = side;
    if (loserSide !== 'proposer' && loserSide !== 'partner') {
      return { success: false, reason: 'укажите сторону' };
    }
  }
  if (!loserSide) return { success: false, reason: 'нет проигравшего' };

  const loser = battleSidePlayer(game, battle, loserSide);
  const winnerSide = battle.draw ? otherBattleSide(loserSide) : battle.winnerSide;
  const winner = battleSidePlayer(game, battle, winnerSide);
  const dead = battle.fighters[loserSide];

  if (game.online && actorUserId != null) {
    if (!loser?.userId || loser.userId !== actorUserId) {
      return { success: false, reason: 'решает владелец погибшего' };
    }
  } else if (actorPlayerId != null && Number(loser?.id) !== Number(actorPlayerId)) {
    return { success: false, reason: 'решает владелец погибшего — кликните его имя слева' };
  }

  if (action === 'revive') {
    const cost = reviveCostForFighter(dead);
    if (loser.money < cost) {
      return { success: false, reason: 'недостаточно денег' };
    }
    loser.money -= cost;
    setDinoHpState(game, dead.locationId, dead.cellIndex, {
      hp: dead.maxHp,
      dead: false,
    });
    dead.hp = dead.maxHp;
    dead.dead = false;
    addLog(
      game,
      `<strong>${loser.name}</strong> реанимировал <strong>${dead.label}</strong> за $${cost.toLocaleString('ru')}`
    );
  } else if (action === 'give') {
    if (battle.draw) {
      return { success: false, reason: 'при ничьей нельзя отдать победителю' };
    }
    const map = getMutableOwnershipMap(game, dead.locationId);
    map[dead.cellIndex] = winner.id;
    setDinoHpState(game, dead.locationId, dead.cellIndex, { hp: 0, dead: true });
    syncOwnershipToCampaign(game);
    addLog(
      game,
      `<strong>${loser.name}</strong> отдал погибшего <strong>${dead.label}</strong> победителю <strong>${winner.name}</strong>`
    );
  } else if (action === 'abandon') {
    const map = getMutableOwnershipMap(game, dead.locationId);
    delete map[dead.cellIndex];
    clearDinoMeta(game, dead.locationId, dead.cellIndex);
    syncOwnershipToCampaign(game);
    addLog(
      game,
      `<strong>${loser.name}</strong> лишился <strong>${dead.label}</strong> — клетка свободна`
    );
  } else {
    return { success: false, reason: 'неизвестное действие' };
  }

  if (battle.draw) {
    battle.fighters[loserSide]._aftermathDone = true;
    const other = otherBattleSide(loserSide);
    if (!battle.fighters[other]._aftermathDone) {
      return { success: true, pendingBattle: battle, waitingOther: true };
    }
    return finishBattleCleanup(game, battle);
  }

  battle.loserResolved = true;
  if (battle.winnerHealPending) {
    addLog(
      game,
      `Победитель <strong>${winner?.name || ''}</strong> решает: вылечить динозавра или ждать 2 старта`
    );
    return { success: true, pendingBattle: battle, waitingWinnerHeal: true };
  }

  return finishBattleCleanup(game, battle);
}

function healOwnedDinosaur(game, locationId, cellIndex, playerIndex) {
  const player = game.players[playerIndex];
  if (!player) return { success: false, reason: 'игрок не найден' };
  if (!sameOwnerId(getOwnerOnLocation(game, locationId, cellIndex), player.id)) {
    return { success: false, reason: 'не ваш динозавр' };
  }
  const locations = getExperimentLocations(game);
  const loc = findLocationById(locations, locationId);
  const cell = getLocationCell(game, locationId, cellIndex, locations) || loc?.cells?.[cellIndex];
  if (!cell) return { success: false, reason: 'клетка не найдена' };
  const hpState = getDinoHpState(game, locationId, cellIndex, cell);
  if (hpState.dead) return { success: false, reason: 'сначала реанимируйте' };
  if (hpState.hp >= hpState.maxHp) return { success: false, reason: 'уже полное HP' };
  const cost = getHpRestoreCost(cell.price, hpState.hp, hpState.maxHp);
  if (player.money < cost) return { success: false, reason: 'недостаточно денег' };
  player.money -= cost;
  setDinoHpState(game, locationId, cellIndex, { hp: hpState.maxHp, dead: false });
  addLog(
    game,
    `<strong>${player.name}</strong> восстановил <strong>${cell.label}</strong> за $${cost.toLocaleString('ru')}`
  );
  checkWin(game);
  return { success: true, cost };
}

function reviveOwnedDinosaur(game, locationId, cellIndex, playerIndex) {
  const player = game.players[playerIndex];
  if (!player) return { success: false, reason: 'игрок не найден' };
  if (!sameOwnerId(getOwnerOnLocation(game, locationId, cellIndex), player.id)) {
    return { success: false, reason: 'не ваш динозавр' };
  }
  const locations = getExperimentLocations(game);
  const loc = findLocationById(locations, locationId);
  const cell = getLocationCell(game, locationId, cellIndex, locations) || loc?.cells?.[cellIndex];
  if (!cell) return { success: false, reason: 'клетка не найдена' };
  const hpState = getDinoHpState(game, locationId, cellIndex, cell);
  if (!hpState.dead) return { success: false, reason: 'динозавр не мёртв' };
  const cost = getHpRestoreCost(cell.price, 0, hpState.maxHp);
  if (player.money < cost) return { success: false, reason: 'недостаточно денег' };
  player.money -= cost;
  setDinoHpState(game, locationId, cellIndex, { hp: hpState.maxHp, dead: false });
  addLog(
    game,
    `<strong>${player.name}</strong> реанимировал <strong>${cell.label}</strong> за $${cost.toLocaleString('ru')}`
  );
  checkWin(game);
  return { success: true, cost };
}

function performRoll(game, forcedDice) {
  if (!game.canRoll || game.finished || hasPendingAction(game)) return null;
  const roller = getCurrentPlayer(game);
  if (!roller || roller.bankrupt) return null;
  const rollLoc = getPlayerLocationId(roller, game.location.id);
  if (isLocationBlockedForPlayer(game, roller.id, rollLoc)) {
    addLog(
      game,
      `<strong>${roller.name}</strong>: ход заблокирован — смените локацию (лимит ${LAPS_BEFORE_BLOCK} кругов)`
    );
    return null;
  }

  game.canRoll = false;
  const dice = forcedDice != null ? clampDice(forcedDice) : rollDice();
  const playerBefore = getCurrentPlayer(game);
  const newPos = movePlayer(game, dice);
  const cell = resolveCellEffect(game, newPos);

  addLog(
    game,
    `<strong>${playerBefore.name}</strong> бросил ${dice} → клетка ${newPos + 1}`
  );

  if (game.finished) {
    return { dice, position: newPos, cell, pendingAction: null, won: true };
  }

  if (hasPendingAction(game)) {
    return { dice, position: newPos, cell, pendingAction: game.pendingAction };
  }

  finishTurn(game);
  return { dice, position: newPos, cell, pendingAction: null };
}

function clampDice(value) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.min(6, Math.max(1, n));
}

/** Dev: телепорт текущего игрока на клетку. */
function teleportTo(game, cellIndex, { triggerEffect = true, passGo = false } = {}) {
  const player = getCurrentPlayer(game);
  const target = clampCell(cellIndex, getCellCount(game));
  const oldPos = player.position;

  game.pendingAction = null;

  if (passGo && target < oldPos) {
    onCompletedLap(game, player);
  }

  player.position = target;
  addLog(game, `[DEV] <strong>${player.name}</strong> → клетка ${target + 1}`);

  let cell = game.location.cells[target];
  if (triggerEffect) {
    cell = resolveCellEffect(game, player.position);
  }

  refreshCanRollForCurrentPlayer(game);

  return { position: player.position, cell, pendingAction: game.pendingAction };
}

/** Dev: только эффект текущей клетки. */
function triggerCurrentCell(game) {
  game.pendingAction = null;
  const player = getCurrentPlayer(game);
  const cell = resolveCellEffect(game, player.position);
  addLog(game, `[DEV] эффект клетки ${player.position + 1}`);
  refreshCanRollForCurrentPlayer(game);
  return cell;
}

function setPlayerMoney(game, playerIndex, money) {
  const player = game.players[playerIndex];
  if (!player) return null;
  player.money = Math.trunc(Number(money)) || 0;
  addLog(game, `[DEV] ${player.name}: $${player.money.toLocaleString('ru')}`);
  checkWin(game);
  return player;
}

function adjustPlayerMoney(game, playerIndex, delta) {
  const player = game.players[playerIndex];
  if (!player) return null;
  player.money += Math.trunc(Number(delta)) || 0;
  addLog(game, `[DEV] ${player.name} ${delta >= 0 ? '+' : ''}${delta} → $${player.money.toLocaleString('ru')}`);
  checkWin(game);
  return player;
}

function setPlayerJail(game, playerIndex, inJail) {
  const player = game.players[playerIndex];
  if (!player) return null;
  player.inJail = Boolean(inJail);
  if (player.inJail) {
    player.position = findPrisonCellIndex(game);
  }
  if (playerIndex === game.currentPlayerIndex) {
    prepareTurn(game);
  }
  addLog(game, `[DEV] ${player.name}: ${player.inJail ? 'тюрьма' : 'свободен'}`);
  return player;
}

function setCurrentPlayerIndex(game, index) {
  const i = ((Math.trunc(Number(index)) % game.players.length) + game.players.length) % game.players.length;
  game.currentPlayerIndex = i;
  prepareTurn(game);
  addLog(game, `[DEV] ход: ${getCurrentPlayer(game).name}`);
  return getCurrentPlayer(game);
}

function resetGame(location) {
  return createGame(location);
}

window.Game = {
  createGame,
  getCurrentPlayer,
  getPlayerById,
  getOwnerId,
  getDinosaurIncome,
  getAttractiveness,
  getSellPrice,
  getSellBonus,
  getSellTraitBonusRate,
  isDinoTrained,
  SELL_TRAIT_BONUS_RATE,
  SELL_TRAINED_BONUS_RATE,
  DEFAULT_TRAIN_COST,
  INCUBATE_COST,
  ARENA_REWARD,
  RENT_INCOME_RATE,
  DEAD_DINO_COVER_RATE,
  getRentFine,
  getRentableIncome,
  getDinoCoverValue,
  getRentCoverCandidates,
  settleRentCash,
  payRentWithDinosaur,
  declareBankruptcy,
  getActivePlayers,
  getOwnedDinosaurs,
  getOwnedDinosaursAllLocations,
  getOtherPlayersDinosaursAllLocations,
  tradeRefKey,
  parseTradeRefKey,
  hasPendingAction,
  canBuyPending,
  canSellPending,
  buyDinosaur,
  declineBuy,
  canBuyDnaPending,
  buyDnaSample,
  declineBuyDna,
  canIncubatePending,
  incubateDinosaur,
  declineIncubate,
  getPlayerDnaInventory,
  getDnaCount,
  playerHasFullDnaSet,
  getDnaCatalogEntry,
  dnaTradeRefKey,
  describeTradeAsset,
  DNA_SAMPLE_LIMIT,
  SENEGAL_DNA_SPECIES,
  INCUBATOR_DINO_LABEL,
  sellDinosaur,
  declineSell,
  declinePendingAction,
  acceptRestaurant,
  declineRestaurant,
  confirmTraining,
  skipTraining,
  confirmExperiment,
  skipExperiment,
  getOwnedDinosaursOnCurrentLocation,
  canProposeTrade,
  proposeTrade,
  acceptTrade,
  declineTrade,
  cancelTrade,
  canProposeBattle,
  proposeBattle,
  acceptBattle,
  declineBattle,
  cancelBattle,
  isArenaCell,
  getPlayersOnArenas,
  getPlayerBoardCell,
  selectBattleDino,
  submitBattleChoice,
  resolveBattleAftermath,
  healOwnedDinosaur,
  reviveOwnedDinosaur,
  getHpRestoreCost,
  healCostForFighter,
  getAliveOwnedDinosaursAllLocations,
  getDinoTraits,
  getDinoHpState,
  collectDinosaurIncome,
  hasSpeciesSetBonus,
  playerOwnsFullSpeciesSet,
  isLapLimitActive,
  isLocationBlockedForPlayer,
  canTravelToLocation,
  getPlayerLapState,
  LAPS_BEFORE_BLOCK,
  performRoll,
  resetGame,
  switchGameLocation,
  travelToLocation,
  setLocationCatalog,
  syncBoardToCurrentPlayer,
  getPlayersOnLocation,
  getPlayerLocationId,
  serializeGameState,
  hydrateGameState,
  saveCampaignLocal,
  loadCampaignLocal,
  clearCampaignLocal,
  CAMPAIGN_STORAGE_KEY,
  addLog,
  nextTurn,
  finishTurn,
  payJailBail,
  waitInJail,
  canPayJailBail,
  teleportTo,
  triggerCurrentCell,
  setPlayerMoney,
  adjustPlayerMoney,
  setPlayerJail,
  setCurrentPlayerIndex,
  resolveCellEffect,
  PLAYER_COLORS,
  TOTAL_CELLS,
  getCellCount,
  START_MONEY,
  MIN_OFFLINE_PLAYERS,
  MAX_OFFLINE_PLAYERS,
  INCOME_RATE,
  SELL_BONUS,
  JAIL_BAIL,
  WIN_GOAL,
  CHARACTER_NAME,
  checkWin,
  getWinner,
  addOfflinePlayer,
  removeOfflinePlayer,
};
})();
