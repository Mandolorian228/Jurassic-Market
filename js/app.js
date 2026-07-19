(function () {
const { LOCATIONS, TUTORIAL_LOCATION, normalizeSpeciesKey } = window.GameData;
const {
  renderBoard,
  highlightCell,
  getCellInfoHTML,
} = window.Board;
const {
  createGame,
  getCurrentPlayer,
  getPlayerById,
  getOwnerId,
  getDinosaurIncome,
  getRentFine,
  getRentableIncome,
  getDinoCoverValue,
  getRentCoverCandidates,
  settleRentCash,
  payRentWithDinosaur,
  getAttractiveness,
  getOwnedDinosaurs,
  getOwnedDinosaursAllLocations,
  getAliveOwnedDinosaursAllLocations,
  getOtherPlayersDinosaursAllLocations,
  hasSpeciesSetBonus,
  tradeRefKey,
  parseTradeRefKey,
  hasPendingAction,
  canBuyPending,
  buyDinosaur,
  canBuyDnaPending,
  buyDnaSample,
  canIncubatePending,
  incubateDinosaur,
  getPlayerDnaInventory,
  getDnaCount,
  getDnaCatalogEntry,
  dnaTradeRefKey,
  describeTradeAsset,
  DNA_SAMPLE_LIMIT,
  sellDinosaur,
  declinePendingAction,
  acceptRestaurant,
  confirmTraining,
  confirmExperiment,
  canProposeBattle,
  proposeBattle,
  acceptBattle,
  declineBattle,
  cancelBattle,
  selectBattleDino,
  submitBattleChoice,
  resolveBattleAftermath,
  healOwnedDinosaur,
  reviveOwnedDinosaur,
  getHpRestoreCost,
  performRoll,
  resetGame,
  travelToLocation,
  canTravelToLocation,
  isLocationBlockedForPlayer,
  isLapLimitActive,
  getPlayerLapState,
  LAPS_BEFORE_BLOCK,
  setLocationCatalog,
  syncBoardToCurrentPlayer,
  getPlayersOnLocation,
  getPlayerLocationId,
  serializeGameState,
  hydrateGameState,
  saveCampaignLocal,
  loadCampaignLocal,
  clearCampaignLocal,
  nextTurn,
  teleportTo,
  triggerCurrentCell,
  setPlayerMoney,
  adjustPlayerMoney,
  setPlayerJail,
  setCurrentPlayerIndex,
  payJailBail,
  waitInJail,
  canPayJailBail,
  proposeTrade,
  acceptTrade,
  declineTrade,
  cancelTrade,
  CHARACTER_NAME,
  SELL_BONUS,
  DEFAULT_TRAIN_COST,
  INCUBATE_COST,
  JAIL_BAIL,
  WIN_GOAL,
  getWinner,
  PLAYER_COLORS,
  START_MONEY,
  MIN_OFFLINE_PLAYERS,
  MAX_OFFLINE_PLAYERS,
  getCellCount,
  addOfflinePlayer,
  removeOfflinePlayer,
} = window.Game;

const { getDinoPortraitUrl } = window.GameData;

const $ = (sel) => document.querySelector(sel);

const TUTORIAL_HINTS = [
  'Бросьте кубик, чтобы начать ход по учебному полигону.',
  'Попав на клетку с динозавром, вы можете купить его за наличные.',
  'За каждый полный круг вы получаете $2000 и доход с купленных динозавров.',
  'Агент позволяет продать динозавра дороже цены покупки.',
  'Цель обычной игры — первым накопить $125 000. Здесь можно спокойно освоить правила.',
];

let state = {
  locationIndex: 0,
  game: null,
  devMode: false,
  /** 'boot' | 'auth' | 'main-menu' | 'room-lobby' | 'game' */
  screen: 'boot',
  mode: 'offline', // 'offline' | 'online' | 'tutorial'
  user: null,
  profile: null,
  room: null,
  roomPlayers: [],
  unsubLobby: null,
  unsubGame: null,
  applyingRemote: false,
  tutorialHintStep: 0,
  pendingJoinCode: null,
  /** Очередь окон результата боя (офлайн: победитель → проигравший) */
  battleModalQueue: [],
  /** Чтобы не показывать окно конца боя повторно */
  battleEndModalKey: null,
};

async function init() {
  bindEvents();
  buildDevDiceGrid();

  const online = window.JMAuth?.isOnlineReady?.();
  if (!online) {
    $('#auth-mode-hint').textContent =
      'Онлайн не настроен (js/config.js). Можно играть офлайн или заполнить Supabase.';
    showAuthGate();
    return;
  }

  $('#auth-mode-hint').textContent = 'Войдите или зарегистрируйтесь, чтобы открыть меню.';
  window.JMAuth.onAuthStateChange(async (session) => {
    if (state.screen === 'game' && state.mode === 'online') return;
    if (session?.user) {
      state.user = session.user;
      state.profile = await window.JMAuth.getProfile(session.user.id);
      if (!state.profile) {
        state.profile = await window.JMAuth.upsertProfile(session.user);
      }
      await enterMainMenu();
      const code = state.pendingJoinCode || window.JMNet.parseRoomCodeFromUrl();
      if (code) {
        state.pendingJoinCode = null;
        await joinRoomByCode(code);
      }
    } else if (state.screen !== 'game' || (state.mode !== 'offline' && state.mode !== 'tutorial')) {
      showAuthGate();
    }
  });

  const session = await window.JMAuth.getSession();
  if (session?.user) {
    state.user = session.user;
    state.profile = await window.JMAuth.getProfile(session.user.id);
    await enterMainMenu();
    const code = window.JMNet.parseRoomCodeFromUrl();
    if (code) await joinRoomByCode(code);
  } else {
    showAuthGate();
    const code = window.JMNet.parseRoomCodeFromUrl();
    if (code) {
      state.pendingJoinCode = code;
      const input = $('#lobby-join-code');
      if (input) input.value = code;
    }
  }
}

function hideAllGates() {
  ['#auth-gate', '#main-menu-gate', '#lobby-gate', '#join-modal', '#game-app'].forEach((sel) => {
    const el = $(sel);
    if (el) el.hidden = true;
  });
}

function showAuthGate() {
  state.screen = 'auth';
  hideAllGates();
  $('#auth-gate').hidden = false;
}

async function enterMainMenu() {
  state.screen = 'main-menu';
  hideAllGates();
  hideJoinModal();
  $('#main-menu-gate').hidden = false;
  const name =
    state.profile?.display_name || state.user?.email?.split('@')[0] || 'Игрок';
  const nameEl = $('#menu-player-name');
  if (nameEl) nameEl.textContent = name;
  setMenuError('');
}

async function enterRoomLobby() {
  state.screen = 'room-lobby';
  hideAllGates();
  hideJoinModal();
  $('#lobby-gate').hidden = false;
  $('#lobby-user-label').textContent = state.profile
    ? `Вы: ${state.profile.display_name}`
    : state.user?.email || '';
  renderLobbyRoom();
}

function showGameScreen() {
  state.screen = 'game';
  hideAllGates();
  $('#game-app').hidden = false;
  updateSessionMeta();
  syncTutorialUi();
}

function setMenuError(msg) {
  const el = $('#menu-error');
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function showJoinModal() {
  const modal = $('#join-modal');
  if (!modal) return;
  modal.hidden = false;
  setJoinModalError('');
  $('#lobby-join-code')?.focus();
}

function hideJoinModal() {
  const modal = $('#join-modal');
  if (modal) modal.hidden = true;
  setJoinModalError('');
}

function setJoinModalError(msg) {
  const el = $('#join-modal-error');
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

/** Офлайн-обучение: 1 игрок, 20 клеток, подсказки. */
function startTutorial() {
  teardownNet();
  state.mode = 'tutorial';
  state.room = null;
  state.roomPlayers = [];
  state.tutorialHintStep = 0;

  const pupilName =
    state.profile?.display_name || state.user?.email?.split('@')[0] || 'Ученик';
  const game = createGame(TUTORIAL_LOCATION, {
    players: [
      {
        id: 0,
        name: pupilName,
        color: PLAYER_COLORS[0],
        money: START_MONEY * 2,
        position: 0,
        inJail: false,
        eventShield: false,
      },
    ],
    locations: [TUTORIAL_LOCATION],
    isTutorial: true,
    introSeen: true,
  });
  setLocationCatalog(game, [TUTORIAL_LOCATION]);
  syncBoardToCurrentPlayer(game);
  state.game = game;
  state.locationIndex = 0;

  showGameScreen();
  renderLocationTabs();
  renderAll();
  syncDevPanel();
  syncTutorialUi();
}

function syncTutorialUi() {
  const isTut = state.mode === 'tutorial' || state.game?.isTutorial;
  const exitBtn = $('#exit-tutorial-btn');
  const menuBtn = $('#back-to-menu-btn');
  const hintPanel = $('#tutorial-hint-panel');
  if (exitBtn) exitBtn.hidden = !isTut;
  if (menuBtn) menuBtn.hidden = !(state.user && !isTut && state.mode === 'offline');
  if (!hintPanel) return;
  if (!isTut) {
    hintPanel.hidden = true;
    return;
  }
  hintPanel.hidden = false;
  updateTutorialHintText();
}

function updateTutorialHintText() {
  const el = $('#tutorial-hint-text');
  if (!el) return;
  const step = Math.min(state.tutorialHintStep, TUTORIAL_HINTS.length - 1);
  el.textContent = TUTORIAL_HINTS[step] || '';
  const nextBtn = $('#tutorial-hint-next');
  if (nextBtn) {
    nextBtn.hidden = state.tutorialHintStep >= TUTORIAL_HINTS.length - 1;
  }
}

function advanceTutorialHint() {
  if (state.tutorialHintStep < TUTORIAL_HINTS.length - 1) {
    state.tutorialHintStep += 1;
    updateTutorialHintText();
  }
}

function exitTutorial() {
  state.game = null;
  state.mode = 'offline';
  state.tutorialHintStep = 0;
  if (state.user) enterMainMenu();
  else showAuthGate();
}

async function backToMainMenuFromGame() {
  if (state.mode === 'online') {
    if (!confirm('Покинуть партию и вернуться в меню?')) return;
    teardownNet();
    state.game = null;
    state.room = null;
    state.roomPlayers = [];
    history.replaceState({}, '', window.location.pathname);
  } else if (state.mode === 'tutorial') {
    exitTutorial();
    return;
  } else {
    state.game = null;
  }
  if (state.user) await enterMainMenu();
  else showAuthGate();
}

function startOfflineCampaign({ fresh = false } = {}) {
  teardownNet();
  state.mode = 'offline';
  state.room = null;
  state.roomPlayers = [];

  let game = null;
  if (!fresh) game = loadCampaignLocal(LOCATIONS);
  if (!game) game = createGame(LOCATIONS[0], { locations: LOCATIONS });
  setLocationCatalog(game, LOCATIONS);
  syncBoardToCurrentPlayer(game);

  state.game = game;
  state.locationIndex = Math.max(
    0,
    LOCATIONS.findIndex((l) => l.id === game.location.id)
  );
  if (state.locationIndex < 0) state.locationIndex = 0;

  showGameScreen();
  renderLocationTabs();
  renderAll();
  syncDevPanel();
  syncTutorialUi();
  maybeShowIntroBeforeFirstRoll();
}

function persistState() {
  if (!state.game || state.applyingRemote) return;
  if (state.mode === 'offline') {
    saveCampaignLocal(state.game);
    return;
  }
  if (state.mode === 'tutorial') return;
  if (state.mode === 'online' && state.game.roomId && state.user) {
    window.JMNet.pushGameState(state.game.roomId, state.game, state.user.id).catch((err) => {
      console.warn('[JM] push failed', err);
    });
  }
}

function afterGameAction() {
  persistState();
  renderAll();
  syncTutorialUi();
  maybeShowLapLimitModal();
}

function maybeShowLapLimitModal() {
  const notice = state.game?.lapLimitNotice;
  if (!notice) return;
  const modal = $('#lap-limit-modal');
  const text = $('#lap-limit-modal-text');
  if (text) {
    text.textContent = `Вы прошли ${LAPS_BEFORE_BLOCK} круга на локации «${
      notice.locationName || 'текущая'
    }». Бросок здесь недоступен — перейдите на другую карту. Покупки, обмен и бои по-прежнему можно. Вернуться на заблокированную карту можно после полного круга на другой локации (тогда откроются все карты).`;
  }
  if (modal) modal.hidden = false;
}

function hideLapLimitModal() {
  const modal = $('#lap-limit-modal');
  if (modal) modal.hidden = true;
  if (state.game) state.game.lapLimitNotice = null;
  persistState();
}

function updateSessionMeta() {
  const el = $('#session-meta');
  if (!el) return;
  if (state.mode === 'tutorial') {
    el.textContent = 'Режим: обучение (1 игрок, учебный полигон)';
    return;
  }
  if (state.mode === 'online' && state.game?.roomCode) {
    el.innerHTML = `Онлайн · комната <strong>${state.game.roomCode}</strong>${
      state.user ? ` · вы: ${state.profile?.display_name || state.user.email}` : ''
    }`;
  } else {
    el.textContent = 'Офлайн-кампания · прогресс в localStorage';
  }
}

function teardownNet() {
  if (state.unsubLobby) {
    state.unsubLobby();
    state.unsubLobby = null;
  }
  if (state.unsubGame) {
    state.unsubGame();
    state.unsubGame = null;
  }
  window.JMNet?.unsubscribeGame?.();
}

function mySeatIndex() {
  if (!state.game?.online || !state.user) return state.game?.currentPlayerIndex ?? 0;
  return state.game.players.findIndex((p) => p.userId === state.user.id);
}

function isMyOnlineTurn() {
  if (state.mode !== 'online') return true;
  const seat = mySeatIndex();
  return seat >= 0 && seat === state.game.currentPlayerIndex;
}

function isIntroOpen() {
  const modal = $('#intro-modal');
  return Boolean(modal && !modal.hidden);
}

/** Партия уже началась (кто-то ходил / покупал) — цитату больше не показываем. */
function hasGameProgress(game) {
  if (!game) return false;
  if (game.finished || game.pendingAction) return true;
  if (Object.keys(game.ownership || {}).length > 0) return true;
  const campaign = game.campaign?.ownershipByLocation || {};
  if (Object.values(campaign).some((map) => map && Object.keys(map).length > 0)) return true;
  return game.players.some((p) => p.position !== 0 || p.inJail);
}

function maybeShowIntroBeforeFirstRoll() {
  if (!state.game) return;
  if (state.game.introSeen) {
    hideIntroModal();
    return;
  }
  if (hasGameProgress(state.game)) {
    state.game.introSeen = true;
    hideIntroModal();
    return;
  }
  showIntroModal();
  updateRollButton();
}

function showIntroModal() {
  const modal = $('#intro-modal');
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add('intro-open');
  $('#intro-modal-ok')?.focus();
}

function hideIntroModal() {
  const modal = $('#intro-modal');
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('intro-open');
  if (state.game && !state.game.introSeen) {
    state.game.introSeen = true;
    persistState();
  }
  updateRollButton();
}

function activeLocations() {
  if (state.mode === 'tutorial' || state.game?.isTutorial) {
    return [TUTORIAL_LOCATION];
  }
  return LOCATIONS;
}

function syncLocationIndexFromGame() {
  if (!state.game) return;
  const locs = activeLocations();
  const idx = locs.findIndex((l) => l.id === state.game.location.id);
  state.locationIndex = idx >= 0 ? idx : 0;
}

function travelerForLocationSwitch() {
  if (!state.game) return -1;
  if (state.mode === 'online') return mySeatIndex();
  return state.game.currentPlayerIndex;
}

function renderLocationTabs() {
  const nav = $('#location-tabs');
  nav.innerHTML = '';
  if (!state.game) return;

  const locs = activeLocations();
  const travelerIndex = travelerForLocationSwitch();
  const traveler = travelerIndex >= 0 ? state.game.players[travelerIndex] : null;

  locs.forEach((loc, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const here = getPlayersOnLocation(state.game, loc.id);
    const marks = here.map((p) => '●').join('');
    const blocked =
      traveler &&
      isLapLimitActive(state.game) &&
      isLocationBlockedForPlayer(state.game, traveler.id, loc.id);
    btn.className = `location-tab${i === state.locationIndex ? ' location-tab--active' : ''}${
      blocked ? ' location-tab--blocked' : ''
    }`;
    btn.textContent = marks ? `${loc.name} ${marks}` : loc.name;
    let title = here.length
      ? `${loc.name}: ${here.map((p) => p.name).join(', ')}`
      : `${loc.name} (никого)`;
    if (blocked) {
      title += ' — заблокирована (нужен полный круг на другой карте)';
      btn.disabled = true;
    }
    btn.title = title;
    btn.dataset.index = i;
    if (!blocked) btn.addEventListener('click', () => switchLocation(i));
    nav.appendChild(btn);
  });
}

function switchLocation(index) {
  if (!state.game || state.game.finished) return;
  if (state.mode === 'tutorial') return;

  const loc = activeLocations()[index];
  if (!loc) return;

  const travelerIndex = travelerForLocationSwitch();
  if (travelerIndex < 0) return;

  const pending = state.game.pendingAction;
  if (pending && pending.playerIndex === travelerIndex) return;

  const gate = canTravelToLocation(state.game, travelerIndex, loc.id);
  if (!gate.ok) {
    alert(gate.reason || 'локация недоступна');
    return;
  }

  travelToLocation(state.game, travelerIndex, loc);
  syncLocationIndexFromGame();
  renderLocationTabs();
  afterGameAction();
  syncDevPanel();
}

function renderAll() {
  if (!state.game) return;
  setLocationCatalog(state.game, LOCATIONS);
  syncBoardToCurrentPlayer(state.game);
  syncLocationIndexFromGame();

  const location = state.game.location;
  $('#location-subtitle').textContent = location.subtitle;

  const onBoard = getPlayersOnLocation(state.game, location.id);
  const boardHost = $('#board');
  boardHost.innerHTML = '';
  const boardWrap = renderBoard(
    location,
    onBoard,
    state.game.ownership,
    state.game.players
  );
  boardHost.appendChild(boardWrap);
  const boardEl = boardWrap.classList?.contains('board')
    ? boardWrap
    : boardWrap.querySelector('.board') || boardWrap;

  if (state.devMode) {
    boardEl.classList.add('board--dev');
    boardEl.addEventListener('click', onBoardClick);
  }

  const current = getCurrentPlayer(state.game);
  const currentOnBoard =
    getPlayerLocationId(current, location.id) === location.id;
  const focusIndex = state.game.pendingAction
    ? state.game.pendingAction.cellIndex
    : currentOnBoard
      ? current.position
      : 0;

  highlightCell(boardEl, focusIndex);
  updateCellInfo(focusIndex);
  renderPendingActions();
  renderPlayers();
  renderAssets();
  renderTradePanel();
  renderBattlePanel();
  renderLog();
  updateRollButton();
  syncDevPanel();
  renderLocationTabs();
}

function canEditOfflineRoster() {
  return (
    state.mode === 'offline' &&
    state.game &&
    !state.game.online &&
    !state.game.isTutorial &&
    !state.game.finished
  );
}

function renderOfflineRosterControls() {
  const box = $('#offline-roster');
  const addBtn = $('#add-player-btn');
  const hint = $('#offline-roster-hint');
  if (!box || !addBtn) return;

  const editable = canEditOfflineRoster();
  box.hidden = !editable;
  if (!editable) return;

  const n = state.game.players.length;
  addBtn.disabled = n >= MAX_OFFLINE_PLAYERS;
  if (hint) {
    hint.textContent = `Офлайн: ${n} из ${MAX_OFFLINE_PLAYERS} (мин. ${MIN_OFFLINE_PLAYERS})`;
  }
}

function renderPlayers() {
  const list = $('#players-list');
  list.innerHTML = '';
  const currentIdx = state.game.currentPlayerIndex;
  const winner = getWinner(state.game);
  const rosterEditable = canEditOfflineRoster();
  const canRemove = rosterEditable && state.game.players.length > MIN_OFFLINE_PLAYERS;

  state.game.players.forEach((p, i) => {
    const owned = getOwnedDinosaurs(state.game, p.id);
    const income = owned.reduce((sum, d) => sum + d.income, 0);
    const progress = Math.min(100, Math.round((p.money / WIN_GOAL) * 100));
    const isWinner = winner && winner.id === p.id;
    const locId = getPlayerLocationId(p, state.game.location.id);
    const locName = LOCATIONS.find((l) => l.id === locId)?.name || '';
    const lapLimitOn = isLapLimitActive(state.game) && !p.bankrupt;
    let lapsHtml = '';
    if (lapLimitOn) {
      const lapState = getPlayerLapState(state.game, p.id);
      const laps = Math.min(
        LAPS_BEFORE_BLOCK,
        Number(lapState.lapsByLocation[locId]) || 0
      );
      const blocked = Boolean(lapState.blocked[locId]);
      const warn = laps >= 1 || blocked;
      const title = blocked
        ? 'Лимит кругов: ход на этой карте заблокирован'
        : `Круги на текущей карте: ${laps} из ${LAPS_BEFORE_BLOCK}`;
      lapsHtml = `<span class="player__laps${warn ? ' player__laps--warn' : ''}" title="${title}">${laps}/${LAPS_BEFORE_BLOCK}</span>`;
    }
    const li = document.createElement('li');
    li.className = `player${i === currentIdx ? ' player--active' : ''}${isWinner ? ' player--winner' : ''}${
      p.bankrupt ? ' player--bankrupt' : ''
    }`;
    li.innerHTML = `
      <span class="player__token" style="background:${p.color}"></span>
      <div class="player__body">
        <div class="player__top">
          <span class="player__name">${p.name}${p.bankrupt ? ' (банкрот)' : ''}${p.inJail ? ' 🔒' : ''}${isWinner ? ' ★' : ''}</span>
          ${lapsHtml}
        </div>
        <span class="player__money">${p.bankrupt ? 'наблюдение' : `$${p.money.toLocaleString('ru')}`}</span>
        <span class="player__progress">${p.bankrupt ? '—' : `${progress}% → $${WIN_GOAL.toLocaleString('ru')}`}</span>
        ${locName && !p.bankrupt ? `<span class="player__loc" title="Локация">${locName}</span>` : ''}
        ${!p.bankrupt && owned.length ? `<span class="player__dinos" title="Доход за полный круг на этой локации">🦖${owned.length} · +$${income.toLocaleString('ru')}</span>` : ''}
      </div>
      ${
        canRemove
          ? `<button type="button" class="player__remove" data-player-index="${i}" title="Удалить игрока">×</button>`
          : ''
      }
    `;
    // Офлайн / tutorial / Dev: клик по игроку делает его активным (нужно для боя hot-seat)
    if (
      !state.game.finished &&
      (state.mode !== 'online' || state.devMode)
    ) {
      li.style.cursor = 'pointer';
      li.title = 'Сделать активным (для боя и hot-seat)';
      li.addEventListener('click', (e) => {
        if (e.target.closest('.player__remove')) return;
        setCurrentPlayerIndex(state.game, i);
        syncBoardToCurrentPlayer(state.game);
        syncLocationIndexFromGame();
        afterGameAction();
      });
    }
    const removeBtn = li.querySelector('.player__remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onRemoveOfflinePlayer(i);
      });
    }
    list.appendChild(li);
  });

  renderOfflineRosterControls();

  const winBanner = $('#win-banner');
  if (winner) {
    winBanner.hidden = false;
    winBanner.innerHTML = `Победа: <span style="color:${winner.color}">${winner.name}</span><br><small>Цель $${WIN_GOAL.toLocaleString('ru')} достигнута</small>`;
  } else {
    winBanner.hidden = true;
    winBanner.innerHTML = '';
  }
}

function onAddOfflinePlayer() {
  const result = addOfflinePlayer(state.game);
  if (!result.success) {
    alert(result.reason || 'не удалось добавить');
    return;
  }
  afterGameAction();
}

function onRemoveOfflinePlayer(playerIndex) {
  const p = state.game.players[playerIndex];
  if (!p) return;
  if (
    !confirm(
      `Удалить ${p.name}? Его динозавры станут свободными, деньги исчезнут из партии.`
    )
  ) {
    return;
  }
  const result = removeOfflinePlayer(state.game, playerIndex);
  if (!result.success) {
    alert(result.reason || 'не удалось удалить');
    return;
  }
  syncBoardToCurrentPlayer(state.game);
  syncLocationIndexFromGame();
  afterGameAction();
}

function isDinoSpecial(d) {
  return Boolean(d?.dead || d?.aggression || d?.intellect || d?.trained);
}

function specialTraitsLabel(d) {
  return [
    d.dead ? 'мёртв' : null,
    d.aggression ? 'агрессия' : null,
    d.intellect ? 'интеллект' : null,
    d.trained ? 'дрессирован' : null,
  ]
    .filter(Boolean)
    .join(', ');
}

function dinoLapIncome(game, playerId, d, catalog) {
  let income = getDinosaurIncome(d.cell);
  if (
    !d.labCrafted &&
    hasSpeciesSetBonus(game, playerId, d.cell.label, catalog)
  ) {
    income *= 2;
  }
  return income;
}

function groupOwnedDinosaursBySpecies(game, playerId, owned, catalog) {
  const normalize = normalizeSpeciesKey || ((l) => l);
  const groups = new Map();
  owned.forEach((d) => {
    const key = normalize(d.cell.label);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: key || d.cell.label,
        items: [],
      });
    }
    const g = groups.get(key);
    g.items.push(d);
    // предпочитаем русское/каноническое имя ключа
    if (d.cell.label === key) g.label = d.cell.label;
  });

  return [...groups.values()].map((g) => {
    const setBonus =
      !g.items[0]?.labCrafted &&
      hasSpeciesSetBonus(game, playerId, g.items[0].cell.label, catalog);
    const totalIncome = g.items.reduce(
      (sum, d) => sum + dinoLapIncome(game, playerId, d, catalog),
      0
    );
    const specials = g.items.filter(isDinoSpecial);
    const ordinary = g.items.find((d) => !isDinoSpecial(d)) || g.items[0];
    return {
      ...g,
      count: g.items.length,
      setBonus,
      totalIncome,
      specials,
      ordinary,
      unique: g.items.length === 1,
    };
  });
}

function renderAssets() {
  const host = $('#assets-list');
  const catalog = state.mode === 'tutorial' ? activeLocations() : LOCATIONS;
  const rows = state.game.players.map((p) => {
    const owned = getOwnedDinosaursAllLocations(state.game, p.id, catalog);
    const dnaInv = getPlayerDnaInventory(state.game, p.id).filter((d) => d.count > 0);
    if (!owned.length && !dnaInv.length) {
      return `<div class="assets__player"><span class="assets__name" style="color:${p.color}">${p.name}</span><span class="assets__empty">нет активов</span></div>`;
    }

    const groups = groupOwnedDinosaursBySpecies(state.game, p.id, owned, catalog);
    const dinoItems = groups
      .map((g) => {
        const setBit = g.setBonus ? ' <span class="assets__set">×2</span>' : '';
        const incomeBit = ` · $${g.totalIncome.toLocaleString('ru')}/круг`;
        const ref = g.ordinary
          ? `${p.id}|${g.ordinary.locationId}|${g.ordinary.cellIndex}`
          : '';

        if (g.unique) {
          const traits = specialTraitsLabel(g.items[0]);
          const traitBit = traits ? ` · ${traits}` : '';
          const labBit = g.items[0].labCrafted ? ' · инкубатор' : '';
          return `<li class="assets__species">
            <button type="button" class="assets__species-btn" data-asset-ref="${ref}" data-asset-mode="unique">
              <strong>${g.label}</strong>${labBit}${traitBit}${incomeBit}${setBit}
            </button>
          </li>`;
        }

        const specialLines = g.specials
          .map((d) => {
            const traits = specialTraitsLabel(d);
            return `<li class="assets__special">${d.locationName}: ${d.cell.label} — ${traits}</li>`;
          })
          .join('');

        return `<li class="assets__species">
          <button type="button" class="assets__species-btn" data-asset-ref="${ref}" data-asset-mode="group">
            <strong>${g.label}</strong> ${g.count} шт.${incomeBit}${setBit}
          </button>
          ${specialLines ? `<ul class="assets__specials">${specialLines}</ul>` : ''}
        </li>`;
      })
      .join('');

    const dnaItems = dnaInv
      .map(
        (d) =>
          `<li class="assets__dna"><strong>ДНК ${d.species}</strong> · ${d.count}/${d.limit} · $${d.price.toLocaleString('ru')}/шт.</li>`
      )
      .join('');
    return `<div class="assets__player"><span class="assets__name" style="color:${p.color}">${p.name}</span><ul class="assets__list">${dinoItems}${dnaItems}</ul></div>`;
  });
  host.innerHTML = rows.join('');
}

function onAssetsClick(e) {
  const btn = e.target.closest('.assets__species-btn');
  if (!btn || !state.game) return;
  const ref = btn.getAttribute('data-asset-ref');
  if (!ref) return;
  const parts = ref.split('|');
  if (parts.length < 3) return;
  const playerId = Number(parts[0]);
  const locationId = parts[1];
  const cellIndex = Number(parts[2]);
  const mode = btn.getAttribute('data-asset-mode') || 'unique';
  const catalog = state.mode === 'tutorial' ? activeLocations() : LOCATIONS;
  const owned = getOwnedDinosaursAllLocations(state.game, playerId, catalog);
  const dino = owned.find(
    (d) => d.locationId === locationId && d.cellIndex === cellIndex
  );
  if (!dino) return;
  const player = getPlayerById(state.game, playerId);
  // Группа: обычная карточка вида (без черт особой особи). Уник: карточка этой особи.
  showPurchaseModal(dino.cell, player, {
    advanceTurn: false,
    viewOnly: true,
    locationId: dino.locationId,
    specimen: mode === 'unique' ? dino : null,
  });
}

function tradeDinoOptionLabel(d) {
  const loc = d.locationName || '';
  return `${loc}: ${d.cell.label} — ★${d.attractiveness} ($${d.cell.price.toLocaleString('ru')}) · ${d.owner?.name || 'игрок'}`;
}

function tradeMyDinoOptionLabel(d) {
  const loc = d.locationName || '';
  return `${loc}: ${d.cell.label} — ★${d.attractiveness} ($${d.cell.price.toLocaleString('ru')})`;
}

function tradeDnaOptionLabel(item, { mine = false } = {}) {
  const ownerBit = mine ? '' : ` · ${item.ownerName}`;
  return `ДНК ${item.species} — ★${item.attractiveness} (${item.count}/${item.limit})${ownerBit}`;
}

function collectTradeDnaOptions(game, playerId, { mine = true } = {}) {
  const options = [];
  game.players.forEach((p) => {
    if (mine && Number(p.id) !== Number(playerId)) return;
    if (!mine && Number(p.id) === Number(playerId)) return;
    getPlayerDnaInventory(game, p.id).forEach((d) => {
      if (d.count < 1) return;
      options.push({
        ...d,
        ownerId: p.id,
        ownerName: p.name,
        ref: dnaTradeRefKey(p.id, d.species),
      });
    });
  });
  return options;
}

function resolveTradeAssetFromPending(trade, side) {
  const asset =
    side === 'offer'
      ? trade.offer ||
        (trade.offerLocationId != null
          ? { kind: 'dino', locationId: trade.offerLocationId, cellIndex: trade.offerCellIndex }
          : null)
      : trade.request ||
        (trade.requestLocationId != null
          ? {
              kind: 'dino',
              locationId: trade.requestLocationId,
              cellIndex: trade.requestCellIndex,
            }
          : null);
  return describeTradeAsset(state.game, LOCATIONS, asset);
}

function renderTradePanel() {
  const offerSelect = $('#trade-offer-select');
  const requestSelect = $('#trade-request-select');
  const compare = $('#trade-compare');
  const proposeRow = $('#trade-propose-row');
  const pendingControls = $('#trade-pending-controls');
  const pendingText = $('#trade-pending-text');
  const proposeBtn = $('#trade-propose-btn');
  const trade = state.game.pendingTrade;
  const finished = state.game.finished;

  const current =
    state.mode === 'online' && state.user
      ? state.game.players[mySeatIndex()] || getCurrentPlayer(state.game)
      : getCurrentPlayer(state.game);

  const myDinos = getOwnedDinosaursAllLocations(state.game, current.id, LOCATIONS).filter(
    (d) => !d.dead
  );
  const theirDinos = getOtherPlayersDinosaursAllLocations(
    state.game,
    current.id,
    LOCATIONS
  ).filter((d) => !d.dead);
  const myDna = collectTradeDnaOptions(state.game, current.id, { mine: true });
  const theirDna = collectTradeDnaOptions(state.game, current.id, { mine: false });

  const prevOffer = offerSelect.value;
  const prevRequest = requestSelect.value;

  const offerOptions = [
    ...myDinos.map(
      (d) =>
        `<option value="${tradeRefKey(d.locationId, d.cellIndex)}">${tradeMyDinoOptionLabel(d)}</option>`
    ),
    ...myDna.map(
      (d) => `<option value="${d.ref}">${tradeDnaOptionLabel(d, { mine: true })}</option>`
    ),
  ];
  const requestOptions = [
    ...theirDinos.map(
      (d) =>
        `<option value="${tradeRefKey(d.locationId, d.cellIndex)}">${tradeDinoOptionLabel(d)}</option>`
    ),
    ...theirDna.map(
      (d) => `<option value="${d.ref}">${tradeDnaOptionLabel(d, { mine: false })}</option>`
    ),
  ];

  offerSelect.innerHTML = offerOptions.length
    ? offerOptions.join('')
    : '<option value="">нет своих активов</option>';
  requestSelect.innerHTML = requestOptions.length
    ? requestOptions.join('')
    : '<option value="">у других нет активов</option>';

  if ([...offerSelect.options].some((o) => o.value === prevOffer)) offerSelect.value = prevOffer;
  if ([...requestSelect.options].some((o) => o.value === prevRequest)) requestSelect.value = prevRequest;

  const offerRef = parseTradeRefKey(offerSelect.value);
  const requestRef = parseTradeRefKey(requestSelect.value);
  const offerAsset = offerRef ? describeTradeAsset(state.game, LOCATIONS, offerRef) : null;
  const requestAsset = requestRef ? describeTradeAsset(state.game, LOCATIONS, requestRef) : null;

  if (offerAsset && requestAsset) {
    const delta = requestAsset.attractiveness - offerAsset.attractiveness;
    const fair =
      delta === 0
        ? 'равный обмен по ★'
        : delta > 0
          ? `партнёр отдаёт на ★${delta} больше`
          : `вы отдаёте на ★${Math.abs(delta)} больше`;
    compare.innerHTML = `★${offerAsset.attractiveness} ⇄ ★${requestAsset.attractiveness} — <em>${fair}</em>. Согласие: <strong>${requestAsset.owner?.name || 'владельца'}</strong>.`;
  } else {
    compare.textContent =
      'Выберите свой актив и актив другого игрока (динозавр или ДНК). ★ ДНК видна только в обмене.';
  }

  const canPropose = !finished && !trade && offerAsset && requestAsset;

  proposeBtn.disabled = !canPropose;
  proposeBtn.textContent = 'Предложить обмен';
  offerSelect.disabled = Boolean(trade) || finished;
  requestSelect.disabled = Boolean(trade) || finished;

  if (trade) {
    proposeRow.hidden = true;
    pendingControls.hidden = false;
    const proposer = state.game.players[trade.proposerIndex];
    const partner = state.game.players[trade.partnerIndex];
    const offer = resolveTradeAssetFromPending(trade, 'offer');
    const request = resolveTradeAssetFromPending(trade, 'request');
    pendingText.innerHTML = `
      <strong>${proposer.name}</strong>: <strong>${offer?.label || '—'}</strong> (${offer?.locationName || ''}, ★${offer?.attractiveness ?? '—'})
      ⇄ <strong>${request?.label || '—'}</strong> (${request?.locationName || ''}, ★${request?.attractiveness ?? '—'})
      <br><small>${
        state.mode === 'online'
          ? 'Партнёр принимает или отклоняет. Автор может отозвать.'
          : 'Партнёр — Принять / Отклонить. Автор предложения — Отозвать.'
      }</small>
    `;

    const meUserId = state.user?.id;
    const isOnline = state.mode === 'online' && state.game.online;
    const amPartner = isOnline && partner?.userId === meUserId;
    const amProposer = isOnline && proposer?.userId === meUserId;

    $('#trade-accept-btn').hidden = isOnline ? !amPartner : false;
    $('#trade-decline-btn').hidden = isOnline ? !amPartner : false;
    $('#trade-cancel-btn').hidden = isOnline ? !amProposer : false;
    $('#trade-accept-btn').disabled = finished;
    $('#trade-decline-btn').disabled = finished;
    $('#trade-cancel-btn').disabled = finished;
  } else {
    proposeRow.hidden = false;
    pendingControls.hidden = true;
  }
}

function battleActorOpts() {
  const me = meBattlePlayer();
  const opts = {};
  if (me) opts.actorPlayerId = me.id;
  if (state.mode === 'online' && state.user) opts.actorUserId = state.user.id;
  return opts;
}

function meBattlePlayer() {
  if (state.mode === 'online' && state.user) {
    return state.game.players[mySeatIndex()] || getCurrentPlayer(state.game);
  }
  return getCurrentPlayer(state.game);
}

function myBattleSide(battle) {
  const me = meBattlePlayer();
  if (!me || !battle) return null;
  if (Number(state.game.players[battle.proposerIndex]?.id) === Number(me.id)) {
    return 'proposer';
  }
  if (Number(state.game.players[battle.partnerIndex]?.id) === Number(me.id)) {
    return 'partner';
  }
  return null;
}

function renderBattleFighters(battle) {
  const box = $('#battle-fighters');
  if (!box || !battle?.fighters) {
    if (box) box.hidden = true;
    return;
  }
  box.hidden = false;
  const sides = ['proposer', 'partner'];
  box.innerHTML = sides
    .map((side) => {
      const f = battle.fighters[side];
      const p = state.game.players[side === 'proposer' ? battle.proposerIndex : battle.partnerIndex];
      const pct = f.maxHp ? Math.max(0, Math.round((f.hp / f.maxHp) * 100)) : 0;
      const traits = [
        f.aggression ? 'агрессия' : null,
        f.intellect ? 'интеллект' : null,
      ]
        .filter(Boolean)
        .join(', ');
      return `<div class="battle-fighter">
        <div><strong>${p?.name || side}</strong></div>
        <div>${f.label} · ★${f.attractiveness}</div>
        <div>Урон ${f.damage}${traits ? ` · ${traits}` : ''}</div>
        <div>HP ${f.hp}/${f.maxHp}</div>
        <div class="battle-fighter__hp"><span style="width:${pct}%"></span></div>
      </div>`;
    })
    .join('');
}

function hideBattleActionRows() {
  [
    '#battle-cancel-row',
    '#battle-accept-row',
    '#battle-pick-row',
    '#battle-choice-row',
    '#battle-aftermath-row',
    '#battle-winner-heal-row',
    '#battle-dino-field',
    '#battle-fighters',
    '#battle-wait-hint',
  ].forEach((sel) => {
    const el = $(sel);
    if (el) el.hidden = true;
  });
}

function setBattleWaitHint(text) {
  const el = $('#battle-wait-hint');
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = text;
}

function fillBattleDinoSelect(player, catalog) {
  const dinoSelect = $('#battle-dino-select');
  const alive = getAliveOwnedDinosaursAllLocations(state.game, player.id, catalog);
  dinoSelect.innerHTML = alive
    .map((d) => {
      const traits = [d.aggression ? 'агр.' : null, d.intellect ? 'инт.' : null]
        .filter(Boolean)
        .join('/');
      return `<option value="${tradeRefKey(d.locationId, d.cellIndex)}">${d.locationName}: ${d.cell.label} · HP ${d.hp} · урон ${d.damage}${
        traits ? ` · ${traits}` : ''
      }</option>`;
    })
    .join('');
  return alive;
}

function renderBattlePanel() {
  const battle = state.game?.pendingBattle;
  const finished = state.game?.finished;
  const me = meBattlePlayer();
  const catalog = state.mode === 'tutorial' ? activeLocations() : LOCATIONS;

  const targetSelect = $('#battle-target-select');
  const proposeRow = $('#battle-propose-row');
  const targetField = $('#battle-target-field');
  const active = $('#battle-active');
  const statusText = $('#battle-status-text');
  const reviveOwn = $('#battle-revive-own');
  const reviveSelect = $('#battle-revive-select');

  if (!targetSelect || !state.game) return;

  const others = state.game.players.filter(
    (p) => Number(p.id) !== Number(me?.id) && !p.bankrupt
  );
  targetSelect.innerHTML = others
    .map((p) => `<option value="${p.id}">${p.name}</option>`)
    .join('');

  const myOwned = me
    ? getOwnedDinosaursAllLocations(state.game, me.id, catalog)
    : [];
  const myDead = myOwned.filter((d) => d.dead);
  const myHurt = myOwned.filter((d) => !d.dead && d.hp < d.maxHp);
  const healOwn = $('#battle-heal-own');
  const healSelect = $('#battle-heal-select');
  if (reviveOwn) {
    // Реанимация доступна в любой момент вне активного боя
    reviveOwn.hidden = myDead.length === 0 || Boolean(battle);
    if (myDead.length) {
      reviveSelect.innerHTML = myDead
        .map(
          (d) =>
            `<option value="${tradeRefKey(d.locationId, d.cellIndex)}">${d.locationName}: ${d.cell.label} — $${d.reviveCost.toLocaleString('ru')}</option>`
        )
        .join('');
    }
  }
  if (healOwn) {
    healOwn.hidden = myHurt.length === 0 || Boolean(battle);
    if (myHurt.length && healSelect) {
      healSelect.innerHTML = myHurt
        .map((d) => {
          const starts =
            d.startsToFullHeal != null ? ` · старт ${d.startsToFullHeal}/2` : '';
          return `<option value="${tradeRefKey(d.locationId, d.cellIndex)}">${d.locationName}: ${d.cell.label} HP ${d.hp}/${d.maxHp} — $${Number(d.healCost || 0).toLocaleString('ru')}${starts}</option>`;
        })
        .join('');
    }
  }

  hideBattleActionRows();

  if (!battle) {
    active.hidden = true;
    proposeRow.hidden = finished;
    targetField.hidden = finished;
    $('#battle-propose-btn').disabled = finished || others.length === 0;
    return;
  }

  // Есть активный бой/вызов — форма вызова скрыта
  proposeRow.hidden = true;
  targetField.hidden = true;
  active.hidden = false;

  const mySide = myBattleSide(battle);
  const proposer = state.game.players[battle.proposerIndex];
  const partner = state.game.players[battle.partnerIndex];
  const amProposer = mySide === 'proposer';
  const amPartner = mySide === 'partner';

  if (battle.status === 'awaiting_accept') {
    statusText.innerHTML = `<strong>${proposer.name}</strong> вызывает <strong>${partner.name}</strong> на бой.`;
    if (amProposer) {
      $('#battle-cancel-row').hidden = false;
      setBattleWaitHint(
        state.mode !== 'online'
          ? `Ожидание ${partner.name}. Кликните его имя слева → «Принять бой».`
          : `Ожидание ответа от ${partner.name}…`
      );
    } else if (amPartner) {
      $('#battle-accept-row').hidden = false;
      setBattleWaitHint('Примите или отклоните вызов — затем выберите динозавра.');
    } else if (state.mode !== 'online') {
      setBattleWaitHint(
        `${proposer.name} вызвал ${partner.name}. Кликните имя нужного игрока слева.`
      );
    } else {
      setBattleWaitHint('Вы не участник этого вызова.');
    }
    return;
  }

  if (battle.status === 'pick_dinos') {
    // Очередь выбора: сначала вызвавший, потом принявший
    const nextPickSide = !battle.proposerDino
      ? 'proposer'
      : !battle.partnerDino
        ? 'partner'
        : null;
    const nextPickPlayer = nextPickSide
      ? state.game.players[
          nextPickSide === 'proposer' ? battle.proposerIndex : battle.partnerIndex
        ]
      : null;
    const myTurnToPick = Boolean(mySide && nextPickSide && mySide === nextPickSide);
    const reward = battle.arenaReward != null ? Number(battle.arenaReward) : 3000;

    statusText.innerHTML = battle.forced
      ? `Принудительный бой на <strong>Арене</strong>: <strong>${proposer.name}</strong> vs <strong>${partner.name}</strong>. Награда победителю <strong>$${reward.toLocaleString('ru')}</strong>. Выберите динозавра.`
      : `Бой принят. Выберите динозавра для боя.`;

    if (myTurnToPick && nextPickPlayer) {
      const alive = fillBattleDinoSelect(nextPickPlayer, catalog);
      $('#battle-dino-field').hidden = false;
      $('#battle-pick-row').hidden = alive.length === 0;
      $('#battle-pick-btn').disabled = alive.length === 0;
      const pickBtn = $('#battle-pick-btn');
      if (pickBtn) pickBtn.dataset.pickSide = nextPickSide;
      setBattleWaitHint(
        `Ваш ход, ${nextPickPlayer.name}: выберите динозавра (${alive.length} доступно).`
      );
      if (alive.length === 0) {
        setBattleWaitHint(
          `У ${nextPickPlayer.name} нет живых динозавров для боя. Отмените бой или реанимируйте динозавра.`
        );
      }
    } else if (nextPickPlayer) {
      setBattleWaitHint(
        `Сейчас выбирает ${nextPickPlayer.name}. Кликните его имя слева в списке игроков.`
      );
    } else if (mySide) {
      setBattleWaitHint('Вы выбрали динозавра. Ждём соперника…');
    } else {
      setBattleWaitHint('Ожидание выбора динозавров…');
    }
    return;
  }

  if (battle.status === 'fighting') {
    renderBattleFighters(battle);
    $('#battle-fighters').hidden = false;
    const chooser = battleSidePlayerName(battle, battle.chooserSide);
    const last = battle.lastReveal;
    let extra = '';
    if (last) {
      extra = `<br><small>Прошлый раунд: ${choiceRu(last.proposerChoice)} / ${choiceRu(
        last.partnerChoice
      )}. Урон ${last.dmgToProp}/${last.dmgToPart}.</small>`;
    }
    statusText.innerHTML = `Раунд ${battle.round}. Сейчас ходит: <strong>${chooser}</strong>.${extra}`;

    const myTurn = Boolean(mySide && battle.chooserSide === mySide);
    if (myTurn) {
      $('#battle-choice-row').hidden = false;
      setBattleWaitHint(
        battle.hiddenChoice
          ? 'Сделайте скрытый ответ (атака или щит).'
          : 'Сделайте скрытый выбор (атака или щит). Соперник не должен видеть.'
      );
    } else if (mySide) {
      setBattleWaitHint(
        state.mode !== 'online'
          ? `Ход ${chooser}. Кликните его имя слева — тогда появятся «Атака» / «Щит».`
          : `Ждём ход: ${chooser}…`
      );
    } else {
      setBattleWaitHint('Вы наблюдаете за боем.');
    }
    return;
  }

  if (battle.status === 'aftermath') {
    renderBattleFighters(battle);
    $('#battle-fighters').hidden = false;
    showBattleEndMessages(battle);

    if (battle.draw) {
      statusText.innerHTML = `Ничья: оба динозавра погибли.`;
      const needSide = mySide && !battle.fighters[mySide]?._aftermathDone;
      if (needSide) {
        const dead = battle.fighters[mySide];
        const cost = getHpRestoreCost(dead?.price, 0, dead?.maxHp || 1);
        $('#battle-aftermath-row').hidden = false;
        $('#battle-give-btn').hidden = true;
        $('#battle-abandon-btn').hidden = false;
        $('#battle-revive-btn').textContent = `Реанимировать ($${cost.toLocaleString('ru')})`;
      } else if (mySide) {
        setBattleWaitHint('Ждём решение второго игрока…');
      } else if (state.mode !== 'online') {
        setBattleWaitHint('Кликните имя игрока слева, чтобы принять решение о своём динозавре.');
      }
      return;
    }

    const loser = state.game.players[
      battle.loserSide === 'proposer' ? battle.proposerIndex : battle.partnerIndex
    ];
    const winner = state.game.players[
      battle.winnerSide === 'proposer' ? battle.proposerIndex : battle.partnerIndex
    ];
    const dead = battle.fighters[battle.loserSide];
    const alive = battle.fighters[battle.winnerSide];

    // Фаза 2: после решения проигравшего — хил победителя
    if (battle.loserResolved && battle.winnerHealPending) {
      const healCost = getHpRestoreCost(alive?.price, alive?.hp, alive?.maxHp || 1);
      statusText.innerHTML = `Победа <strong>${winner.name}</strong>. Проигравший решил. Теперь лечение: <strong>${alive?.label || 'динозавр'}</strong> (HP ${alive?.hp}/${alive?.maxHp}).`;
      if (mySide === battle.winnerSide) {
        $('#battle-winner-heal-row').hidden = false;
        const healBtn = $('#battle-heal-winner-btn');
        if (healBtn) {
          healBtn.textContent = `Вылечить ($${healCost.toLocaleString('ru')})`;
          healBtn.disabled = healCost > 0 && winner.money < healCost;
        }
        setBattleWaitHint(
          `Можно вылечить сейчас (цена = доля потерянного HP) или ждать 2 прохода старта для бесплатного полного HP.`
        );
      } else if (mySide) {
        setBattleWaitHint(`Ждём решение ${winner.name} о лечении…`);
      } else if (state.mode !== 'online') {
        setBattleWaitHint(
          `Решает победитель ${winner.name}. Кликните его имя слева.`
        );
      }
      return;
    }

    const cost = getHpRestoreCost(dead?.price, 0, dead?.maxHp || 1);
    statusText.innerHTML = `Победа <strong>${winner.name}</strong>. Сначала решает владелец погибшего: <strong>${loser.name}</strong>.`;

    if (mySide === battle.loserSide) {
      $('#battle-aftermath-row').hidden = false;
      $('#battle-give-btn').hidden = false;
      $('#battle-give-btn').textContent = 'Отдать победителю';
      $('#battle-abandon-btn').hidden = false;
      $('#battle-revive-btn').textContent = `Реанимировать ($${cost.toLocaleString('ru')})`;
    } else if (mySide) {
      setBattleWaitHint(`Ждём решение ${loser.name}…`);
    } else if (state.mode !== 'online') {
      setBattleWaitHint(
        `Решает ${loser.name}. Кликните его имя слева в списке игроков.`
      );
    }
  }
}

function battleSidePlayerName(battle, side) {
  const idx = side === 'proposer' ? battle.proposerIndex : battle.partnerIndex;
  return state.game.players[idx]?.name || side;
}

function choiceRu(c) {
  return c === 'attack' ? 'атака' : 'щит';
}

function updateCellInfo(cellIndex) {
  const location = activeLocations()[state.locationIndex] || state.game?.location;
  const cell = location?.cells[cellIndex];
  const ownerId = getOwnerId(state.game, cellIndex);
  const owner = ownerId != null ? getPlayerById(state.game, ownerId) : null;
  const income = cell?.type === 'property' ? getDinosaurIncome(cell) : null;
  const attractiveness =
    cell?.type === 'property'
      ? getAttractiveness(cell, state.game, location.id)
      : null;
  const current = getCurrentPlayer(state.game);
  let dnaInfo = null;
  if (cell?.offersDna || (location?.id === 'senegal-lab' && cell?.type === 'property')) {
    const entry = getDnaCatalogEntry(state.game, cell.label, LOCATIONS);
    if (entry) {
      dnaInfo = {
        price: entry.price,
        limit: DNA_SAMPLE_LIMIT,
        count: current ? getDnaCount(state.game, current.id, cell.label) : 0,
      };
    }
  }
  let rentFine = null;
  if (
    cell?.type === 'property' &&
    owner &&
    current &&
    Number(owner.id) !== Number(current.id) &&
    !owner.bankrupt
  ) {
    rentFine = getRentFine(state.game, location.id, cellIndex, cell, owner.id);
  }
  $('#cell-info').innerHTML = getCellInfoHTML(cell, {
    owner,
    income,
    attractiveness,
    dnaInfo,
    rentFine,
    hideAttractiveness: false,
  });
}

function hideAllPendingControls() {
  [
    '#pending-buy-controls',
    '#pending-buy-dna-controls',
    '#pending-rent-controls',
    '#pending-incubate-controls',
    '#pending-sell-controls',
    '#pending-jail-controls',
    '#pending-restaurant-controls',
    '#pending-training-controls',
    '#pending-experiment-controls',
  ].forEach((sel) => {
    const el = $(sel);
    if (el) el.hidden = true;
  });
}

function renderPendingActions() {
  const panel = $('#pending-actions');
  const pending = state.game.pendingAction;

  if (!pending || state.game.finished) {
    panel.hidden = true;
    hideAllPendingControls();
    return;
  }

  panel.hidden = false;
  hideAllPendingControls();

  if (pending.type === 'buy') {
    $('#pending-buy-controls').hidden = false;
    renderBuyPending(pending);
    return;
  }

  if (pending.type === 'buy_dna') {
    $('#pending-buy-dna-controls').hidden = false;
    renderBuyDnaPending(pending);
    return;
  }

  if (pending.type === 'rent') {
    $('#pending-rent-controls').hidden = false;
    renderRentPending(pending);
    return;
  }

  if (pending.type === 'incubate') {
    $('#pending-incubate-controls').hidden = false;
    renderIncubatePending(pending);
    return;
  }

  if (pending.type === 'sell') {
    $('#pending-sell-controls').hidden = false;
    renderSellPending(pending);
    return;
  }

  if (pending.type === 'jail') {
    $('#pending-jail-controls').hidden = false;
    renderJailPending(pending);
    return;
  }

  if (pending.type === 'restaurant') {
    $('#pending-restaurant-controls').hidden = false;
    renderRestaurantPending(pending);
    return;
  }

  if (pending.type === 'training') {
    $('#pending-training-controls').hidden = false;
    renderTrainingPending(pending);
    return;
  }

  if (pending.type === 'experiment') {
    $('#pending-experiment-controls').hidden = false;
    renderExperimentPending(pending);
    return;
  }

  panel.hidden = true;
}

function renderRestaurantPending(pending) {
  const player = state.game.players[pending.playerIndex];
  const cell = state.game.location.cells[pending.cellIndex];
  const percent = pending.taxPercent ?? 20;
  const loss =
    pending.loss != null
      ? pending.loss
      : Math.max(0, Math.floor(((player?.money || 0) * percent) / 100));

  $('#pending-actions-text').innerHTML = `
    <strong>${player?.name || 'Игрок'}</strong> в <strong>${cell?.label || 'ресторане'}</strong>.
    <br><small>Согласиться: −$${loss.toLocaleString('ru')} (${percent}% от текущего баланса) и щит на круг от одного негативного события. Или отказаться.</small>
  `;

  const acceptBtn = $('#restaurant-accept-btn');
  acceptBtn.textContent = `Согласиться (−$${loss.toLocaleString('ru')})`;
}

function fillOwnedDinoSelect(selectEl, playerId, bonus) {
  const owned = getOwnedDinosaurs(state.game, playerId);
  selectEl.innerHTML = owned
    .map(
      (d) =>
        `<option value="${d.cellIndex}">${d.cell.label} — ★${d.attractiveness}${
          bonus ? ` → ★${Math.min(100, d.attractiveness + bonus)}` : ''
        }</option>`
    )
    .join('');
  return owned;
}

function fillOwnedDinoSelectAllLocations(selectEl, playerId, bonus) {
  const owned = getOwnedDinosaursAllLocations(state.game, playerId, LOCATIONS);
  selectEl.innerHTML = owned
    .map((d) => {
      const key = tradeRefKey(d.locationId, d.cellIndex);
      const next = bonus ? ` → ★${Math.min(100, d.attractiveness + bonus)}` : '';
      return `<option value="${key}">${d.locationName}: ${d.cell.label} — ★${d.attractiveness}${next}</option>`;
    })
    .join('');
  return owned;
}

function renderTrainingPending(pending) {
  const player = state.game.players[pending.playerIndex];
  const cell = state.game.location.cells[pending.cellIndex];
  const bonus = pending.trainBonus ?? 5;
  const cost = pending.trainCost ?? DEFAULT_TRAIN_COST;
  const select = $('#training-dino-select');
  const owned = fillOwnedDinoSelectAllLocations(select, player.id, bonus);
  const canPay = (player?.money || 0) >= cost;

  $('#pending-actions-text').innerHTML = `
    <strong>${player?.name || 'Игрок'}</strong> на <strong>${cell?.label || 'Дрессировка'}</strong>.
    <br><small>Стоимость $${cost.toLocaleString('ru')}. Любой свой динозавр (все локации): +${bonus} к привлекательности и +50% к цене при продаже агенту.</small>
  `;

  const btn = $('#training-confirm-btn');
  btn.disabled = owned.length === 0 || !canPay;
  if (!owned.length) btn.textContent = 'Нет динозавров';
  else if (!canPay) btn.textContent = 'Недостаточно денег';
  else btn.textContent = `Дрессировать (−$${cost.toLocaleString('ru')}, +${bonus} ★)`;
}

function renderExperimentPending(pending) {
  const player = state.game.players[pending.playerIndex];
  const cell = state.game.location.cells[pending.cellIndex];
  const bonus = pending.trainBonus ?? 5;
  const cost = pending.trainCost ?? 3000;
  const select = $('#experiment-dino-select');
  const owned = fillOwnedDinoSelectAllLocations(select, player.id, bonus);
  const canPay = (player?.money || 0) >= cost;

  $('#pending-actions-text').innerHTML = `
    <strong>${player?.name || 'Игрок'}</strong> у <strong>${cell?.label || 'Эксперимент'}</strong>.
    <br><small>Стоимость $${cost.toLocaleString('ru')}. Любой свой динозавр (все локации). Случайно: интеллект (+${bonus} ★), агрессия (+${bonus} ★) или смерть.</small>
  `;

  const btn = $('#experiment-confirm-btn');
  btn.disabled = owned.length === 0 || !canPay;
  if (!owned.length) btn.textContent = 'Нет динозавров';
  else if (!canPay) btn.textContent = 'Недостаточно денег';
  else btn.textContent = `Эксперимент (−$${cost.toLocaleString('ru')})`;
}

function renderBuyPending(pending) {
  const cell = state.game.location.cells[pending.cellIndex];
  const player = state.game.players[pending.playerIndex];
  const check = canBuyPending(state.game);
  const income = getDinosaurIncome(cell);
  const dnaCheck = pending.allowDna ? canBuyDnaPending(state.game) : { ok: false };
  const dnaCount = pending.dnaSpecies
    ? getDnaCount(state.game, player.id, pending.dnaSpecies)
    : 0;

  let dnaLine = '';
  if (pending.allowDna && pending.dnaPrice != null) {
    dnaLine = `<br><small>Или образец ДНК <strong>${pending.dnaSpecies}</strong> за $${Number(
      pending.dnaPrice
    ).toLocaleString('ru')} (${dnaCount}/${DNA_SAMPLE_LIMIT}, без дохода и без владения клеткой).</small>`;
  }

  $('#pending-actions-text').innerHTML = `
    <strong>${player.name}</strong>: купить <strong>${cell.label}</strong>
    за <strong>$${cell.price.toLocaleString('ru')}</strong>?
    <br><small>Доход $${income.toLocaleString('ru')} за каждый полный круг. Другие игроки купить не смогут.</small>
    ${dnaLine}
  `;

  const buyBtn = $('#buy-btn');
  buyBtn.disabled = !check.ok;
  buyBtn.title = check.ok ? '' : check.reason || '';
  buyBtn.textContent = check.ok
    ? `Купить за $${cell.price.toLocaleString('ru')}`
    : check.reason === 'недостаточно денег'
      ? 'Недостаточно денег'
      : 'Купить';

  const dnaBtn = $('#buy-dna-btn');
  if (dnaBtn) {
    dnaBtn.hidden = !pending.allowDna;
    if (pending.allowDna) {
      dnaBtn.disabled = !dnaCheck.ok;
      dnaBtn.title = dnaCheck.ok ? '' : dnaCheck.reason || '';
      if (dnaCheck.ok) {
        dnaBtn.textContent = `Купить ДНК ($${Number(pending.dnaPrice).toLocaleString('ru')})`;
      } else if (dnaCheck.reason?.startsWith('лимит')) {
        dnaBtn.textContent = `ДНК: лимит ${DNA_SAMPLE_LIMIT}`;
      } else if (dnaCheck.reason === 'недостаточно денег') {
        dnaBtn.textContent = 'ДНК: нет денег';
      } else {
        dnaBtn.textContent = 'Купить ДНК';
      }
    }
  }
}

function renderRentPending(pending) {
  const player = state.game.players[pending.playerIndex];
  const owner = getPlayerById(state.game, pending.ownerId);
  const cell = state.game.location.cells[pending.cellIndex];
  const fine = Number(pending.fine) || 0;
  const paid = Number(pending.paidCash) || 0;
  const remaining = Math.max(0, fine - paid);
  const rentIncome = pending.rentIncome != null ? pending.rentIncome : getDinosaurIncome(cell);
  const canPayAll = (player?.money || 0) >= remaining && remaining > 0;
  const needsDino = Boolean(pending.needsDino) || (player?.money || 0) < remaining;

  $('#pending-actions-text').innerHTML = `
    <strong>${player?.name || 'Игрок'}</strong> на чужом <strong>${cell?.label || 'динозавре'}</strong>
    (<span style="color:${owner?.color || 'inherit'}">${owner?.name || '—'}</span>).
    <br><small>Штраф <strong>$${fine.toLocaleString('ru')}</strong> — 50% дохода $${Number(
      rentIncome
    ).toLocaleString('ru')}/круг${
      rentIncome > getDinosaurIncome(cell) ? ' (сет ×2)' : ''
    }. Оплачено: $${paid.toLocaleString('ru')}. Осталось: $${remaining.toLocaleString('ru')}.</small>
  `;

  const payBtn = $('#rent-pay-btn');
  const dinoBtn = $('#rent-dino-btn');
  const dinoField = $('#rent-dino-field');
  const select = $('#rent-dino-select');

  if (needsDino && remaining > 0) {
    const candidates = getRentCoverCandidates(state.game, player.id, remaining);
    payBtn.hidden = true;
    dinoBtn.hidden = false;
    if (dinoField) dinoField.hidden = false;
    if (select) {
      select.innerHTML = candidates.length
        ? candidates
            .map((d) => {
              const dead = d.dead ? ' · мёртв 75%' : '';
              return `<option value="${tradeRefKey(d.locationId, d.cellIndex)}">${d.locationName}: ${d.cell.label} — покрытие $${d.coverValue.toLocaleString('ru')}${dead}</option>`;
            })
            .join('')
        : '<option value="">нет динозавра, покрывающего остаток</option>';
    }
    dinoBtn.disabled = candidates.length === 0;
    dinoBtn.textContent =
      candidates.length > 0
        ? `Отдать динозавра (остаток $${remaining.toLocaleString('ru')})`
        : 'Банкротство — нечем покрыть';
  } else {
    payBtn.hidden = false;
    dinoBtn.hidden = true;
    if (dinoField) dinoField.hidden = true;
    payBtn.disabled = !canPayAll && remaining > 0;
    if (remaining <= 0) payBtn.textContent = 'Готово';
    else if (canPayAll) payBtn.textContent = `Заплатить $${remaining.toLocaleString('ru')}`;
    else payBtn.textContent = `Отдать деньги и выбрать динозавра`;
    payBtn.disabled = false;
  }
}

function renderBuyDnaPending(pending) {
  const player = state.game.players[pending.playerIndex];
  const check = canBuyDnaPending(state.game);
  const count = getDnaCount(state.game, player.id, pending.dnaSpecies);

  $('#pending-actions-text').innerHTML = `
    <strong>${player.name}</strong>: купить образец ДНК <strong>${pending.dnaSpecies}</strong>
    за <strong>$${Number(pending.dnaPrice).toLocaleString('ru')}</strong>?
    <br><small>У вас: ${count}/${DNA_SAMPLE_LIMIT}. ДНК не даёт доход и не забирает клетку динозавра.</small>
  `;

  const btn = $('#buy-dna-only-btn');
  if (!btn) return;
  btn.disabled = !check.ok;
  btn.title = check.ok ? '' : check.reason || '';
  if (check.ok) {
    btn.textContent = `Купить ДНК ($${Number(pending.dnaPrice).toLocaleString('ru')})`;
  } else if (check.reason?.startsWith('лимит')) {
    btn.textContent = `Лимит ${DNA_SAMPLE_LIMIT} образца`;
  } else if (check.reason === 'недостаточно денег') {
    btn.textContent = 'Недостаточно денег';
  } else {
    btn.textContent = 'Купить ДНК';
  }
}

function renderIncubatePending(pending) {
  const player = state.game.players[pending.playerIndex];
  const check = canIncubatePending(state.game);
  const label = pending.dinoLabel || 'Индоминус Рекс';
  const cost = pending.incubateCost != null ? Number(pending.incubateCost) : INCUBATE_COST;
  const costLabel =
    cost > 0
      ? ` за <strong>$${cost.toLocaleString('ru')}</strong>`
      : ' <strong>бесплатно</strong>';

  $('#pending-actions-text').innerHTML = `
    <strong>${player.name}</strong> у инкубатора: синтезировать <strong>${label}</strong>${costLabel}?
    <br><small>Списывается по 1 образцу ДНК каждого вида Сенегала. Динозавр появится в активах (вне поля).</small>
  `;

  const btn = $('#incubate-btn');
  if (!btn) return;
  btn.disabled = !check.ok;
  btn.title = check.ok ? '' : check.reason || '';
  if (check.ok) {
    btn.textContent = cost > 0 ? `Синтезировать (−$${cost.toLocaleString('ru')})` : 'Синтезировать бесплатно';
  } else if (check.reason === 'недостаточно денег') {
    btn.textContent = 'Недостаточно денег';
  } else {
    btn.textContent = 'Нет набора ДНК';
  }
}

function sellTraitHint(d) {
  if (d.trained || (d.sellTraitRate && d.sellTraitRate >= 0.5)) return '+50% дресс.';
  if (d.sellTraitRate && d.sellTraitRate > 0) return '+25% агр./инт.';
  if (d.aggression || d.intellect) return '+25% агр./инт.';
  return null;
}

function renderSellPending(pending) {
  const player = state.game.players[pending.playerIndex];
  const sellBonus = pending.sellBonus ?? SELL_BONUS;
  const brokerName = pending.brokerName || CHARACTER_NAME;
  const owned = getOwnedDinosaurs(state.game, player.id, sellBonus);
  const select = $('#sell-dino-select');

  $('#pending-actions-text').innerHTML = `
    <strong>${player.name}</strong> встретил <strong>${brokerName}</strong>.
    <br><small>Цена покупки + $${sellBonus.toLocaleString('ru')}. Агрессия/интеллект: +25% цены особи. Дрессированный: +50%.</small>
  `;

  select.innerHTML = owned
    .map((d) => {
      const hint = sellTraitHint(d);
      return `<option value="${d.cellIndex}">${d.cell.label} — $${d.sellPrice.toLocaleString('ru')} (было $${d.cell.price.toLocaleString('ru')}${
        hint ? `, ${hint}` : ''
      })</option>`;
    })
    .join('');

  const sellBtn = $('#sell-btn');
  sellBtn.disabled = owned.length === 0;
  const selected = owned[0];
  sellBtn.textContent = selected
    ? `Продать за $${selected.sellPrice.toLocaleString('ru')}`
    : 'Продать';

  select.onchange = () => {
    const dino = owned.find((d) => d.cellIndex === Number(select.value));
    sellBtn.textContent = dino
      ? `Продать за $${dino.sellPrice.toLocaleString('ru')}`
      : 'Продать';
  };
}

function renderJailPending(pending) {
  const player = state.game.players[pending.playerIndex];
  const check = canPayJailBail(state.game);
  const cell = state.game.location.cells[pending.cellIndex];

  $('#pending-actions-text').innerHTML = `
    <strong>${player.name}</strong> в тюрьме
    (${cell?.label || 'Тюрьма'}).
    <br><small>Выйти: заплатить $${JAIL_BAIL.toLocaleString('ru')} и ходить сейчас, либо отсидеть этот ход.</small>
  `;

  const payBtn = $('#jail-pay-btn');
  payBtn.disabled = !check.ok;
  payBtn.title = check.ok ? '' : check.reason || '';
  payBtn.textContent = check.ok
    ? `Заплатить $${JAIL_BAIL.toLocaleString('ru')}`
    : check.reason === 'недостаточно денег'
      ? 'Недостаточно денег'
      : `Заплатить $${JAIL_BAIL.toLocaleString('ru')}`;
}

function renderLog() {
  const log = $('#game-log');
  log.innerHTML = state.game.log
    .map((entry) => `<li>${entry.message}</li>`)
    .join('');
}

function updateRollButton() {
  const btn = $('#roll-btn');
  if (!state.game) {
    btn.disabled = true;
    btn.textContent = '…';
    return;
  }
  const current = getCurrentPlayer(state.game);

  if (state.game.finished) {
    const winner = getWinner(state.game);
    btn.disabled = true;
    btn.textContent = winner ? `Победа: ${winner.name}` : 'Игра окончена';
    return;
  }

  if (isIntroOpen() || !state.game.introSeen) {
    btn.disabled = true;
    btn.textContent = 'Сначала цитата Soyona';
    return;
  }

  if (state.mode === 'online' && !isMyOnlineTurn()) {
    btn.disabled = true;
    btn.textContent = `Ход: ${current.name}`;
    return;
  }

  if (hasPendingAction(state.game)) {
    btn.disabled = true;
    if (state.game.pendingBattle?.forced) {
      btn.textContent = 'Сначала завершите бой на Арене';
      return;
    }
    const type = state.game.pendingAction?.type;
    if (type === 'sell') btn.textContent = 'Сначала решите продажу';
    else if (type === 'jail') btn.textContent = 'Сначала решите тюрьму';
    else if (type === 'restaurant') btn.textContent = 'Сначала решите ресторан';
    else if (type === 'training') btn.textContent = 'Сначала решите дрессировку';
    else if (type === 'experiment') btn.textContent = 'Сначала решите эксперимент';
    else if (type === 'buy_dna') btn.textContent = 'Сначала решите ДНК';
    else if (type === 'rent') btn.textContent = 'Сначала заплатите штраф';
    else if (type === 'incubate') btn.textContent = 'Сначала решите инкубатор';
    else btn.textContent = 'Сначала решите покупку';
    return;
  }

  const locId = getPlayerLocationId(current, state.game.location.id);
  if (
    isLapLimitActive(state.game) &&
    isLocationBlockedForPlayer(state.game, current.id, locId)
  ) {
    btn.disabled = true;
    btn.textContent = 'Смените локацию (лимит кругов)';
    return;
  }

  btn.disabled = !state.game.canRoll;
  btn.textContent = state.game.canRoll ? `Ход: ${current.name}` : 'Ждите...';
}

function buildDevDiceGrid() {
  const grid = $('#dev-dice-grid');
  grid.innerHTML = '';
  for (let n = 1; n <= 6; n++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--dev-dice';
    btn.textContent = String(n);
    btn.addEventListener('click', () => forcedRoll(n));
    grid.appendChild(btn);
  }
}

function syncDevPanel() {
  if (!state.game) return;

  const select = $('#dev-player');
  const currentIdx = state.game.currentPlayerIndex;
  select.innerHTML = state.game.players
    .map(
      (p, i) =>
        `<option value="${i}"${i === currentIdx ? ' selected' : ''}>${p.name} (кл. ${p.position + 1})</option>`
    )
    .join('');

  const current = getCurrentPlayer(state.game);
  const cellTotal = getCellCount(state.game);
  const devCell = $('#dev-cell');
  devCell.min = 1;
  devCell.max = cellTotal;
  devCell.value = Math.min(current.position + 1, cellTotal);
  const cellLabel = devCell.closest('label')?.querySelector('span');
  if (cellLabel) cellLabel.textContent = `Номер (1–${cellTotal})`;
  $('#dev-money').value = current.money;

  const lapCb = $('#dev-lap-limit');
  if (lapCb) {
    lapCb.disabled = Boolean(state.game.isTutorial);
    lapCb.checked = isLapLimitActive(state.game);
  }

  document.body.classList.toggle('dev-mode', state.devMode);
  $('#dev-toggle').classList.toggle('btn--dev-active', state.devMode);
  $('#dev-panel').hidden = !state.devMode;
}

function setDevMode(on) {
  state.devMode = Boolean(on);
  renderAll();
}

function bindEvents() {
  $('#assets-list')?.addEventListener('click', onAssetsClick);
  $('#roll-btn').addEventListener('click', onRoll);
  $('#new-game-btn').addEventListener('click', onNewGame);
  $('#buy-btn').addEventListener('click', onBuy);
  $('#buy-dna-btn')?.addEventListener('click', onBuyDna);
  $('#buy-dna-only-btn')?.addEventListener('click', onBuyDna);
  $('#decline-dna-btn')?.addEventListener('click', onDeclineAction);
  $('#rent-pay-btn')?.addEventListener('click', onRentPay);
  $('#rent-dino-btn')?.addEventListener('click', onRentDino);
  $('#incubate-btn')?.addEventListener('click', onIncubate);
  $('#decline-incubate-btn')?.addEventListener('click', onDeclineAction);
  $('#sell-btn').addEventListener('click', onSell);
  $('#decline-action-btn').addEventListener('click', onDeclineAction);
  $('#decline-sell-btn').addEventListener('click', onDeclineAction);
  $('#jail-pay-btn').addEventListener('click', onJailPay);
  $('#jail-wait-btn').addEventListener('click', onJailWait);
  $('#restaurant-accept-btn')?.addEventListener('click', onRestaurantAccept);
  $('#restaurant-decline-btn')?.addEventListener('click', onRestaurantDecline);
  $('#training-confirm-btn')?.addEventListener('click', onTrainingConfirm);
  $('#training-skip-btn')?.addEventListener('click', onDeclineAction);
  $('#experiment-confirm-btn')?.addEventListener('click', onExperimentConfirm);
  $('#experiment-skip-btn')?.addEventListener('click', onDeclineAction);
  $('#trade-propose-btn').addEventListener('click', onTradePropose);
  $('#trade-accept-btn').addEventListener('click', onTradeAccept);
  $('#trade-decline-btn').addEventListener('click', onTradeDecline);
  $('#trade-cancel-btn').addEventListener('click', onTradeCancel);
  $('#trade-offer-select').addEventListener('change', () => renderTradePanel());
  $('#trade-request-select').addEventListener('change', () => renderTradePanel());

  $('#battle-propose-btn')?.addEventListener('click', onBattlePropose);
  $('#battle-accept-btn')?.addEventListener('click', onBattleAccept);
  $('#battle-decline-btn')?.addEventListener('click', onBattleDecline);
  $('#battle-cancel-btn')?.addEventListener('click', onBattleCancel);
  $('#battle-pick-btn')?.addEventListener('click', onBattlePick);
  $('#battle-attack-btn')?.addEventListener('click', () => onBattleChoice('attack'));
  $('#battle-shield-btn')?.addEventListener('click', () => onBattleChoice('shield'));
  $('#battle-revive-btn')?.addEventListener('click', () => onBattleAftermath('revive'));
  $('#battle-give-btn')?.addEventListener('click', () => onBattleAftermath('give'));
  $('#battle-abandon-btn')?.addEventListener('click', () => onBattleAftermath('abandon'));
  $('#battle-heal-winner-btn')?.addEventListener('click', () => onBattleAftermath('heal_winner'));
  $('#battle-skip-heal-btn')?.addEventListener('click', () => onBattleAftermath('skip_heal_winner'));
  $('#battle-revive-own-btn')?.addEventListener('click', onReviveOwnDead);
  $('#battle-heal-own-btn')?.addEventListener('click', onHealOwnHurt);
  $('#intro-modal-ok').addEventListener('click', hideIntroModal);
  $('#experiment-result-ok')?.addEventListener('click', hideExperimentResultModal);
  $('#experiment-result-modal')?.querySelector('.result-modal__backdrop')?.addEventListener('click', hideExperimentResultModal);
  $('#purchase-modal-ok')?.addEventListener('click', hidePurchaseModal);
  $('#lap-limit-modal-ok')?.addEventListener('click', hideLapLimitModal);
  $('#lap-limit-modal')?.querySelector('.result-modal__backdrop')?.addEventListener('click', hideLapLimitModal);
  $('#purchase-modal')?.querySelector('.purchase-modal__backdrop')?.addEventListener('click', hidePurchaseModal);

  $('#play-offline-btn')?.addEventListener('click', () => startOfflineCampaign());
  $('#btn-offline-hotseat')?.addEventListener('click', () => startOfflineCampaign());
  $('#add-player-btn')?.addEventListener('click', onAddOfflinePlayer);
  $('#btn-tutorial')?.addEventListener('click', () => startTutorial());
  $('#btn-create-room')?.addEventListener('click', onCreateRoom);
  $('#btn-join-room')?.addEventListener('click', showJoinModal);
  $('#btn-logout')?.addEventListener('click', onSignOut);
  $('#join-modal-cancel')?.addEventListener('click', hideJoinModal);
  $('#exit-tutorial-btn')?.addEventListener('click', exitTutorial);
  $('#back-to-menu-btn')?.addEventListener('click', () => backToMainMenuFromGame());
  $('#tutorial-hint-next')?.addEventListener('click', advanceTutorialHint);
  $('#lobby-back-menu-btn')?.addEventListener('click', onLeaveRoom);
  $('#auth-form')?.addEventListener('submit', onAuthSignIn);
  $('#auth-signup-btn')?.addEventListener('click', onAuthSignUp);
  $('#lobby-join-btn')?.addEventListener('click', () =>
    joinRoomByCode($('#lobby-join-code').value.trim())
  );
  $('#lobby-join-code')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      joinRoomByCode($('#lobby-join-code').value.trim());
    }
  });
  $('#lobby-copy-btn')?.addEventListener('click', onCopyInvite);
  $('#lobby-copy-code-btn')?.addEventListener('click', onCopyRoomCode);
  $('#lobby-start-btn')?.addEventListener('click', onStartOnlineGame);
  $('#lobby-leave-btn')?.addEventListener('click', onLeaveRoom);

  $('#dev-toggle').addEventListener('click', () => setDevMode(!state.devMode));
  $('#dev-close').addEventListener('click', () => setDevMode(false));
  $('#dev-lap-limit')?.addEventListener('change', (e) => {
    if (!state.game || state.game.isTutorial) return;
    state.game.lapLimitEnabled = Boolean(e.target.checked);
    if (state.game.lapLimitEnabled) {
      // счётчики остаются; блок снова действует
    } else {
      state.game.lapLimitNotice = null;
    }
    persistState();
    renderAll();
  });

  $('#dev-player').addEventListener('change', (e) => {
    setCurrentPlayerIndex(state.game, Number(e.target.value));
    renderAll();
  });

  $('#dev-jail-on').addEventListener('click', () => {
    setPlayerJail(state.game, state.game.currentPlayerIndex, true);
    renderAll();
  });

  $('#dev-jail-off').addEventListener('click', () => {
    setPlayerJail(state.game, state.game.currentPlayerIndex, false);
    renderAll();
  });

  $('#dev-teleport').addEventListener('click', () => {
    const cellIndex = Number($('#dev-cell').value) - 1;
    teleportTo(state.game, cellIndex, {
      triggerEffect: $('#dev-trigger-effect').checked,
      passGo: $('#dev-pass-go').checked,
    });
    renderAll();
  });

  $('#dev-trigger').addEventListener('click', () => {
    triggerCurrentCell(state.game);
    renderAll();
  });

  $('#dev-money-set').addEventListener('click', () => {
    setPlayerMoney(state.game, state.game.currentPlayerIndex, Number($('#dev-money').value));
    renderAll();
  });

  $('#dev-money-plus').addEventListener('click', () => {
    adjustPlayerMoney(state.game, state.game.currentPlayerIndex, 1000);
    renderAll();
  });

  $('#dev-money-minus').addEventListener('click', () => {
    adjustPlayerMoney(state.game, state.game.currentPlayerIndex, -1000);
    renderAll();
  });

  $('#dev-allow-roll').addEventListener('click', () => {
    if (!hasPendingAction(state.game)) {
      state.game.canRoll = true;
    }
    renderAll();
  });

  $('#dev-next-turn').addEventListener('click', () => {
    if (hasPendingAction(state.game)) {
      declinePendingAction(state.game);
    } else {
      nextTurn(state.game);
    }
    renderAll();
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault();
      setDevMode(!state.devMode);
    }
  });
}

function onBuy() {
  if (state.mode === 'online' && !isMyOnlineTurn()) return;
  const shouldAdvance = !state.devMode;
  const result = buyDinosaur(state.game, { advanceTurn: false });
  afterGameAction();
  if (result?.success && result.cell) {
    showPurchaseModal(result.cell, result.player, { advanceTurn: shouldAdvance });
  } else if (result?.reason && result.reason !== 'недостаточно денег') {
    alert(result.reason);
  }
}

function onBuyDna() {
  if (state.mode === 'online' && !isMyOnlineTurn()) return;
  const shouldAdvance = !state.devMode;
  const result = buyDnaSample(state.game, { advanceTurn: shouldAdvance });
  afterGameAction();
  if (!result?.success && result?.reason && result.reason !== 'недостаточно денег') {
    alert(result.reason);
  }
}

function onRentPay() {
  if (state.mode === 'online' && !isMyOnlineTurn()) return;
  const shouldAdvance = !state.devMode;
  const result = settleRentCash(state.game, { advanceTurn: shouldAdvance });
  afterGameAction();
  if (!result?.success && result?.reason) alert(result.reason);
}

function onRentDino() {
  if (state.mode === 'online' && !isMyOnlineTurn()) return;
  const shouldAdvance = !state.devMode;
  const pending = state.game.pendingAction;
  if (!pending || pending.type !== 'rent') return;

  if (!pending.needsDino) {
    const pre = settleRentCash(state.game, { advanceTurn: false });
    afterGameAction();
    if (pre?.bankrupt || pre?.dnaOffer || (pre?.success && !pre?.needsDino)) return;
  }

  const remaining = Math.max(0, pending.fine - (pending.paidCash || 0));
  const payer = state.game.players[pending.playerIndex];
  const candidates = getRentCoverCandidates(state.game, payer.id, remaining);
  if (!candidates.length) {
    settleRentCash(state.game, { advanceTurn: shouldAdvance });
    afterGameAction();
    return;
  }

  const ref = parseTradeRefKey($('#rent-dino-select').value);
  if (!ref || ref.kind === 'dna') {
    alert('выберите динозавра');
    return;
  }
  const result = payRentWithDinosaur(state.game, ref.locationId, ref.cellIndex, {
    advanceTurn: shouldAdvance,
  });
  afterGameAction();
  if (!result?.success && result?.reason) alert(result.reason);
}

function onIncubate() {
  if (state.mode === 'online' && !isMyOnlineTurn()) return;
  const shouldAdvance = !state.devMode;
  const result = incubateDinosaur(state.game, { advanceTurn: false });
  afterGameAction();
  if (result?.success && result.cell) {
    showPurchaseModal(result.cell, result.player, {
      advanceTurn: shouldAdvance,
      crafted: true,
    });
  } else if (result?.reason) {
    alert(result.reason);
  }
}

function showPurchaseModal(
  cell,
  player,
  { advanceTurn = true, crafted = false, viewOnly = false, locationId = null, specimen = null } = {}
) {
  const modal = $('#purchase-modal');
  if (!modal || !cell) return;

  state.purchaseModal = { advanceTurn: viewOnly ? false : Boolean(advanceTurn) };

  const buyer = player?.name || 'Игрок';
  const locId = locationId || specimen?.locationId || state.game?.location?.id;
  const locName =
    specimen?.locationName ||
    LOCATIONS.find((l) => l.id === locId)?.name ||
    state.game?.location?.name ||
    '';
  if (viewOnly) {
    $('#purchase-modal-eyebrow').textContent = `${buyer} · ${locName || 'актив'}`;
  } else {
    $('#purchase-modal-eyebrow').textContent = crafted
      ? `${buyer} синтезировал · ${locName}`
      : `${buyer} купил · ${locName}`;
  }
  $('#purchase-modal-title').textContent = cell.label || 'Динозавр';

  const img = $('#purchase-modal-img');
  const placeholder = $('#purchase-modal-placeholder');
  const url = typeof getDinoPortraitUrl === 'function' ? getDinoPortraitUrl(cell.label) : null;
  if (img) {
    img.hidden = true;
    img.removeAttribute('src');
    img.alt = cell.label || '';
    img.onload = () => {
      img.hidden = false;
      if (placeholder) placeholder.hidden = true;
    };
    img.onerror = () => {
      img.hidden = true;
      if (placeholder) placeholder.hidden = false;
    };
    if (url) {
      if (placeholder) placeholder.hidden = true;
      img.src = `${url}?t=${Date.now()}`;
    } else if (placeholder) {
      placeholder.hidden = false;
    }
  }

  const income = getDinosaurIncome(cell);
  const attr = getAttractiveness(cell, state.game, locId);
  const combat = window.GameData?.calcCombatStats
    ? window.GameData.calcCombatStats(cell.size, cell.fame)
    : { maxHp: cell.maxHp, damage: cell.damage };
  const hp =
    specimen != null
      ? `${specimen.dead ? 0 : specimen.hp}/${specimen.maxHp}`
      : String(cell.maxHp != null ? cell.maxHp : combat.maxHp);
  const dmg =
    specimen?.damage != null
      ? specimen.damage
      : cell.damage != null
        ? cell.damage
        : combat.damage;
  const diet = cell.dietLabel || cell.diet || '—';
  const flies = cell.flies ? 'да' : 'нет';
  const traits = specimen ? specialTraitsLabel(specimen) : '';

  const stats = $('#purchase-modal-stats');
  if (stats) {
    const rows = [
      ['Цена', `$${Number(cell.price || 0).toLocaleString('ru')}`],
      ['Доход / круг', `$${Number(income).toLocaleString('ru')}`],
      ['Привлекательность', `★${attr}`],
      ['Урон', String(dmg ?? '—')],
      ['HP', String(hp ?? '—')],
      ['Рацион', diet],
      ['Размер', `${cell.size ?? '—'}/10`],
      ['Экранность', `${cell.fame ?? '—'}/10`],
      ['Полёт', flies],
    ];
    if (traits) rows.push(['Особенности', traits]);
    if (specimen?.labCrafted || cell.labCrafted) rows.push(['Происхождение', 'инкубатор']);
    stats.innerHTML = rows
      .map(
        ([k, v], i, arr) =>
          `<li${i === arr.length - 1 && arr.length % 2 === 1 ? ' class="purchase-modal__stat--wide"' : ''}><span>${k}</span><strong>${v}</strong></li>`
      )
      .join('');
  }

  const okBtn = $('#purchase-modal-ok');
  if (okBtn) okBtn.textContent = viewOnly ? 'Закрыть' : 'Отлично';

  modal.hidden = false;
  document.body.classList.add('purchase-modal-open');
  okBtn?.focus();
}

function hidePurchaseModal() {
  const modal = $('#purchase-modal');
  if (!modal || modal.hidden) return;
  const advance = Boolean(state.purchaseModal?.advanceTurn);
  state.purchaseModal = null;
  modal.hidden = true;
  document.body.classList.remove('purchase-modal-open');
  const okBtn = $('#purchase-modal-ok');
  if (okBtn) okBtn.textContent = 'Отлично';
  if (advance && state.game && !state.game.finished) {
    nextTurn(state.game);
  }
  afterGameAction();
}

function onSell() {
  if (state.mode === 'online' && !isMyOnlineTurn()) return;
  const cellIndex = Number($('#sell-dino-select').value);
  sellDinosaur(state.game, cellIndex, { advanceTurn: !state.devMode });
  afterGameAction();
}

function onDeclineAction() {
  if (state.mode === 'online' && !isMyOnlineTurn()) return;
  declinePendingAction(state.game, { advanceTurn: !state.devMode });
  afterGameAction();
}

function onJailPay() {
  if (state.mode === 'online' && !isMyOnlineTurn()) return;
  payJailBail(state.game);
  afterGameAction();
}

function onJailWait() {
  if (state.mode === 'online' && !isMyOnlineTurn()) return;
  waitInJail(state.game);
  afterGameAction();
}

function onRestaurantAccept() {
  if (state.mode === 'online' && !isMyOnlineTurn()) return;
  acceptRestaurant(state.game, { advanceTurn: !state.devMode });
  afterGameAction();
}

function onRestaurantDecline() {
  if (state.mode === 'online' && !isMyOnlineTurn()) return;
  declinePendingAction(state.game, { advanceTurn: !state.devMode });
  afterGameAction();
}

function onTrainingConfirm() {
  if (state.mode === 'online' && !isMyOnlineTurn()) return;
  const ref = parseTradeRefKey($('#training-dino-select').value);
  if (!ref) return;
  confirmTraining(state.game, ref, { advanceTurn: !state.devMode });
  afterGameAction();
}

function onExperimentConfirm() {
  if (state.mode === 'online' && !isMyOnlineTurn()) return;
  const ref = parseTradeRefKey($('#experiment-dino-select').value);
  if (!ref) return;
  const result = confirmExperiment(state.game, ref, { advanceTurn: !state.devMode });
  afterGameAction();
  if (result?.success) showExperimentResultModal(result);
}

function experimentResultCopy(result) {
  const name = result.dinoName || result.cell?.label || 'Динозавр';
  const loc = result.locationName || 'локация';
  const bonus = result.bonus ?? 5;

  switch (result.outcome) {
    case 'intellect':
      return {
        title: 'Интеллект повышен',
        tone: 'good',
        text: `Эксперимент дал черту «интеллект» <strong>${name}</strong> (${loc}): в бою урон по нему −50%. ★${result.before} → ★${result.after} (+${bonus}).`,
      };
    case 'aggression':
      return {
        title: 'Агрессия повышена',
        tone: 'good',
        text: `Эксперимент дал черту «агрессия» <strong>${name}</strong> (${loc}): в бою ходит первым. ★${result.before} → ★${result.after} (+${bonus}).`,
      };
    case 'death':
      return {
        title: 'Смерть',
        tone: 'bad',
        text: `Эксперимент закончился гибелью <strong>${name}</strong> (${loc}). Динозавр потерян, клетка снова свободна.`,
      };
    case 'shielded':
      return {
        title: 'Смерть предотвращена',
        tone: 'warn',
        text: `Эксперимент грозил смертью <strong>${name}</strong> (${loc}), но щит ресторана спас динозавра. Щит израсходован.`,
      };
    default:
      return {
        title: 'Результат эксперимента',
        tone: 'warn',
        text: `Эксперимент над <strong>${name}</strong> (${loc}) завершён.`,
      };
  }
}

function showResultModal({ eyebrow, title, outcome, text, tone = 'warn' }) {
  const modal = $('#experiment-result-modal');
  if (!modal) return;

  const eyebrowEl = $('#result-modal-eyebrow');
  const outcomeEl = $('#experiment-result-outcome');
  const textEl = $('#experiment-result-text');

  if (eyebrowEl) eyebrowEl.textContent = eyebrow || 'Jurassic Market';
  $('#experiment-result-title').textContent = title || 'Результат';
  outcomeEl.textContent = outcome || '';
  outcomeEl.className = `result-modal__outcome result-modal__outcome--${tone}`;
  textEl.innerHTML = text || '';

  modal.hidden = false;
  document.body.classList.add('result-modal-open');
  $('#experiment-result-ok')?.focus();
}

function showExperimentResultModal(result) {
  if (!result?.success) return;
  const copy = experimentResultCopy(result);
  showResultModal({
    eyebrow: 'Подземная лаборатория',
    title: 'Результат эксперимента',
    outcome: copy.title,
    text: copy.text,
    tone: copy.tone,
  });
}

function hideExperimentResultModal() {
  const modal = $('#experiment-result-modal');
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('result-modal-open');
  if (state.battleModalQueue?.length) {
    const next = state.battleModalQueue.shift();
    if (next) showResultModal(next);
  }
}

function buildBattleEndModal(battle, role) {
  const winner = state.game.players[
    battle.winnerSide === 'proposer' ? battle.proposerIndex : battle.partnerIndex
  ];
  const loser = state.game.players[
    battle.loserSide === 'proposer' ? battle.proposerIndex : battle.partnerIndex
  ];
  const dead = battle.fighters[battle.loserSide];
  const alive = battle.fighters[battle.winnerSide];

  if (role === 'winner') {
    return {
      eyebrow: 'Арена',
      title: 'Победа в бою',
      outcome: 'Вы выиграли!',
      tone: 'good',
      text: `<strong>${winner?.name || 'Победитель'}</strong> победил. Динозавр <strong>${
        alive?.label || '—'
      }</strong> остался в строю (HP ${alive?.hp ?? '—'}/${alive?.maxHp ?? '—'}). У соперника погиб <strong>${
        dead?.label || 'динозавр'
      }</strong>.`,
    };
  }

  return {
    eyebrow: 'Арена',
    title: 'Поражение в бою',
    outcome: 'Ваш динозавр погиб',
    tone: 'bad',
    text: `<strong>${loser?.name || 'Игрок'}</strong>: <strong>${
      dead?.label || 'динозавр'
    }</strong> погиб в бою против <strong>${winner?.name || 'соперника'}</strong>. Выберите: реанимировать (50% цены), отдать победителю или лишиться клетки.`,
  };
}

function buildBattleDrawModal(battle, side) {
  const player =
    state.game.players[side === 'proposer' ? battle.proposerIndex : battle.partnerIndex];
  const dino = battle.fighters[side];
  return {
    eyebrow: 'Арена',
    title: 'Ничья в бою',
    outcome: 'Ваш динозавр погиб',
    tone: 'bad',
    text: `<strong>${player?.name || 'Игрок'}</strong>: оба динозавра погибли. Ваш <strong>${
      dino?.label || 'динозавр'
    }</strong> мёртв — решите: реанимировать или лишиться клетки.`,
  };
}

/** Показать окна конца боя победителю и проигравшему. */
function showBattleEndMessages(battle) {
  if (!battle || battle.status !== 'aftermath') return;
  const key = [
    battle.round,
    battle.draw ? 'draw' : 'win',
    battle.loserSide || '',
    battle.winnerSide || '',
    battle.fighters?.proposer?.hp,
    battle.fighters?.partner?.hp,
  ].join('|');
  if (state.battleEndModalKey === key) return;
  state.battleEndModalKey = key;
  state.battleModalQueue = [];

  if (battle.draw) {
    const side = myBattleSide(battle);
    if (state.mode === 'online') {
      if (side) showResultModal(buildBattleDrawModal(battle, side));
      return;
    }
    state.battleModalQueue = [
      buildBattleDrawModal(battle, 'proposer'),
      buildBattleDrawModal(battle, 'partner'),
    ];
    const first = state.battleModalQueue.shift();
    if (first) showResultModal(first);
    return;
  }

  const winnerModal = buildBattleEndModal(battle, 'winner');
  const loserModal = buildBattleEndModal(battle, 'loser');
  const mySide = myBattleSide(battle);

  if (state.mode === 'online') {
    if (mySide === battle.winnerSide) showResultModal(winnerModal);
    else if (mySide === battle.loserSide) showResultModal(loserModal);
    return;
  }

  // Офлайн: сначала победителю, затем проигравшему
  state.battleModalQueue = [loserModal];
  showResultModal(winnerModal);
}

function onBattlePropose() {
  if (state.game.finished || state.game.pendingBattle || state.game.pendingTrade) return;
  const me = meBattlePlayer();
  const targetId = Number($('#battle-target-select').value);
  const partnerIndex = state.game.players.findIndex((p) => Number(p.id) === targetId);
  const proposerIndex = state.game.players.findIndex((p) => Number(p.id) === Number(me.id));
  if (proposerIndex < 0 || partnerIndex < 0) return;
  const catalog = state.mode === 'tutorial' ? activeLocations() : LOCATIONS;
  const check = canProposeBattle(state.game, proposerIndex, partnerIndex, catalog);
  if (!check.ok) {
    alert(check.reason);
    return;
  }
  proposeBattle(state.game, proposerIndex, partnerIndex, catalog);
  afterGameAction();
}

function onBattleAccept() {
  acceptBattle(state.game, battleActorOpts());
  afterGameAction();
}

function onBattleDecline() {
  declineBattle(state.game, battleActorOpts());
  afterGameAction();
}

function onBattleCancel() {
  cancelBattle(state.game, battleActorOpts());
  afterGameAction();
}

function onBattlePick() {
  const battle = state.game.pendingBattle;
  if (!battle || battle.status !== 'pick_dinos') return;
  const ref = parseTradeRefKey($('#battle-dino-select').value);
  if (!ref) return;
  const catalog = state.mode === 'tutorial' ? activeLocations() : LOCATIONS;

  const nextPickSide = !battle.proposerDino
    ? 'proposer'
    : !battle.partnerDino
      ? 'partner'
      : null;
  const side = myBattleSide(battle);
  if (!side || side !== nextPickSide) {
    alert('Сейчас выбирает другой игрок — кликните его имя слева.');
    return;
  }
  if (side === 'proposer' && battle.proposerDino) return;
  if (side === 'partner' && battle.partnerDino) return;

  const result = selectBattleDino(
    state.game,
    side,
    ref.locationId,
    ref.cellIndex,
    catalog,
    battleActorOpts()
  );
  if (!result.success) alert(result.reason || 'не удалось выбрать');
  afterGameAction();
}

function onBattleChoice(choice) {
  const result = submitBattleChoice(state.game, choice, battleActorOpts());
  if (!result.success) alert(result.reason || 'не ваш ход');
  afterGameAction();
}

function onBattleAftermath(action) {
  const battle = state.game.pendingBattle;
  if (!battle) return;
  const opts = { ...battleActorOpts() };
  if (battle.draw) {
    opts.side = myBattleSide(battle);
  }
  const result = resolveBattleAftermath(state.game, action, opts);
  if (!result.success) alert(result.reason || 'ошибка');
  if (result?.done) {
    state.battleEndModalKey = null;
    state.battleModalQueue = [];
  }
  afterGameAction();
}

function onReviveOwnDead() {
  const me = meBattlePlayer();
  const ref = parseTradeRefKey($('#battle-revive-select').value);
  if (!ref || !me) return;
  const idx = state.game.players.findIndex((p) => Number(p.id) === Number(me.id));
  const result = reviveOwnedDinosaur(state.game, ref.locationId, ref.cellIndex, idx);
  if (!result.success) alert(result.reason || 'не удалось');
  afterGameAction();
}

function onHealOwnHurt() {
  const me = meBattlePlayer();
  const ref = parseTradeRefKey($('#battle-heal-select').value);
  if (!ref || !me) return;
  const idx = state.game.players.findIndex((p) => Number(p.id) === Number(me.id));
  const result = healOwnedDinosaur(state.game, ref.locationId, ref.cellIndex, idx);
  if (!result.success) alert(result.reason || 'не удалось');
  afterGameAction();
}

function onTradePropose() {
  if (state.game.finished || state.game.pendingTrade) return;

  const offerRef = parseTradeRefKey($('#trade-offer-select').value);
  const requestRef = parseTradeRefKey($('#trade-request-select').value);
  if (!offerRef || !requestRef) return;

  const proposerIndex =
    state.mode === 'online' && state.user
      ? mySeatIndex()
      : state.game.currentPlayerIndex;

  if (proposerIndex < 0) return;

  const result = proposeTrade(state.game, LOCATIONS, proposerIndex, offerRef, requestRef);
  if (!result.success) addTradeHint(result.reason);
  afterGameAction();
}

function addTradeHint(reason) {
  const compare = $('#trade-compare');
  if (compare && reason) compare.textContent = reason;
}

function onTradeAccept() {
  const opts = {
    locations: LOCATIONS,
    ...(state.mode === 'online' && state.user ? { actorUserId: state.user.id } : {}),
  };
  const result = acceptTrade(state.game, opts);
  if (result && result.success === false && result.reason) addTradeHint(result.reason);
  afterGameAction();
}

function onTradeDecline() {
  const opts =
    state.mode === 'online' && state.user ? { actorUserId: state.user.id } : {};
  declineTrade(state.game, opts);
  afterGameAction();
}

function onTradeCancel() {
  const opts =
    state.mode === 'online' && state.user ? { actorUserId: state.user.id } : {};
  cancelTrade(state.game, opts);
  afterGameAction();
}

function onBoardClick(e) {
  if (!state.devMode) return;
  const cellEl = e.target.closest('.cell');
  if (!cellEl) return;

  const cellIndex = Number(cellEl.dataset.index);
  if (!Number.isFinite(cellIndex)) return;

  teleportTo(state.game, cellIndex, {
    triggerEffect: $('#dev-trigger-effect').checked,
    passGo: $('#dev-pass-go').checked,
  });
  afterGameAction();
}

function forcedRoll(dice) {
  if (isIntroOpen() || !state.game?.introSeen) {
    maybeShowIntroBeforeFirstRoll();
    return;
  }
  if (hasPendingAction(state.game)) return;

  if (!state.game.canRoll) {
    state.game.canRoll = true;
  }

  const skipTurn = $('#dev-skip-turn').checked;
  const result = performRoll(state.game, dice);

  if (result && skipTurn && !result.pendingAction) {
    state.game.currentPlayerIndex =
      (state.game.currentPlayerIndex - 1 + state.game.players.length) % state.game.players.length;
    state.game.canRoll = true;
  }

  $('#dice').textContent = result ? result.dice : '—';
  afterGameAction();
}

async function onAuthSignIn(e) {
  e.preventDefault();
  const err = $('#auth-error');
  err.hidden = true;
  try {
    if (!window.JMAuth.isOnlineReady()) {
      throw new Error('Заполните SUPABASE_URL и SUPABASE_ANON_KEY в js/config.js');
    }
    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;
    const data = await window.JMAuth.signIn(email, password);
    state.user = data.user;
    state.profile = await window.JMAuth.getProfile(data.user.id);
    await enterMainMenu();
    const pending = state.pendingJoinCode || window.JMNet.parseRoomCodeFromUrl();
    if (pending) {
      state.pendingJoinCode = null;
      await joinRoomByCode(pending);
    }
  } catch (ex) {
    err.hidden = false;
    err.textContent = ex.message || String(ex);
  }
}

async function onAuthSignUp() {
  const err = $('#auth-error');
  err.hidden = true;
  try {
    if (!window.JMAuth.isOnlineReady()) {
      throw new Error('Заполните SUPABASE_URL и SUPABASE_ANON_KEY в js/config.js');
    }
    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;
    const name = $('#auth-name').value.trim() || email.split('@')[0];
    const data = await window.JMAuth.signUp(email, password, name);
    if (!data.session) {
      err.hidden = false;
      err.textContent = 'Проверьте почту для подтверждения, затем войдите.';
      return;
    }
    state.user = data.user;
    state.profile = await window.JMAuth.getProfile(data.user.id);
    await enterMainMenu();
  } catch (ex) {
    err.hidden = false;
    err.textContent = ex.message || String(ex);
  }
}

async function onSignOut() {
  teardownNet();
  try {
    await window.JMAuth.signOut();
  } catch (_) {
    /* ignore */
  }
  state.user = null;
  state.profile = null;
  state.room = null;
  state.roomPlayers = [];
  hideJoinModal();
  showAuthGate();
}

function setLobbyError(msg) {
  const el = $('#lobby-error');
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function renderLobbyRoom() {
  const box = $('#lobby-room');
  if (!box) return;
  if (!state.room) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const max = window.AppConfig.MAX_ROOM_PLAYERS || 4;
  const min = window.AppConfig.MIN_ROOM_PLAYERS || 2;
  const count = state.roomPlayers.length;

  $('#lobby-room-code').textContent = state.room.code;
  const countEl = $('#room-players-count');
  if (countEl) countEl.textContent = `${count}/${max}`;
  $('#lobby-invite-url').value = window.JMNet.inviteUrl(state.room.code);

  const list = $('#lobby-players');
  list.innerHTML = state.roomPlayers
    .map(
      (p) =>
        `<li><span class="player__token" style="background:${p.avatar_color}"></span>${p.display_name}${
          p.user_id === state.room.host_id ? ' · хост' : ''
        }</li>`
    )
    .join('');

  const isHost = state.user && state.room.host_id === state.user.id;
  const startBtn = $('#lobby-start-btn');
  startBtn.hidden = !isHost;
  startBtn.disabled = count < min;
  if (isHost) {
    startBtn.textContent =
      count < min
        ? `Нужно минимум ${min} игрока`
        : `Запустить игру (${count}/${max})`;
  }
}

async function onCreateRoom() {
  setMenuError('');
  setLobbyError('');
  if (!state.user) {
    showAuthGate();
    return;
  }
  try {
    const room = await window.JMNet.createRoom(state.user, state.profile);
    state.room = room;
    state.roomPlayers = await window.JMNet.listRoomPlayers(room.id);
    if (state.unsubLobby) state.unsubLobby();
    state.unsubLobby = window.JMNet.subscribeLobby(room.id, (players) => {
      state.roomPlayers = players;
      renderLobbyRoom();
    });
    history.replaceState({}, '', `?room=${room.code}`);
    await enterRoomLobby();
  } catch (ex) {
    setMenuError(ex.message || String(ex));
  }
}

async function joinRoomByCode(code) {
  const raw = (code || '').trim().toUpperCase();
  if (!raw) {
    setJoinModalError('Введите код комнаты');
    return;
  }
  setLobbyError('');
  setJoinModalError('');
  try {
    if (!state.user) {
      state.pendingJoinCode = raw;
      hideJoinModal();
      showAuthGate();
      const input = $('#lobby-join-code');
      if (input) input.value = raw;
      return;
    }
    const { room, players } = await window.JMNet.joinRoom(raw, state.user, state.profile);
    state.room = room;
    state.roomPlayers = players;
    if (state.unsubLobby) state.unsubLobby();
    state.unsubLobby = window.JMNet.subscribeLobby(room.id, (plist) => {
      state.roomPlayers = plist;
      renderLobbyRoom();
    });
    history.replaceState({}, '', `?room=${room.code}`);
    hideJoinModal();

    if (room.status === 'playing') {
      await resumeOnlineGame(room);
      return;
    }
    await enterRoomLobby();
  } catch (ex) {
    const msg = ex.message || String(ex);
    if (!$('#join-modal')?.hidden) setJoinModalError(msg);
    else setLobbyError(msg);
    setMenuError(msg);
  }
}

async function onCopyInvite() {
  const url = $('#lobby-invite-url').value;
  try {
    await navigator.clipboard.writeText(url);
  } catch (_) {
    $('#lobby-invite-url').select();
  }
}

async function onCopyRoomCode() {
  const code = state.room?.code || $('#lobby-room-code')?.textContent || '';
  if (!code || code === '—') return;
  try {
    await navigator.clipboard.writeText(code);
  } catch (_) {
    /* ignore */
  }
}

async function onStartOnlineGame() {
  setLobbyError('');
  try {
    const { game } = await window.JMNet.startGame(state.room, state.roomPlayers, LOCATIONS);
    await beginOnlineGame(game);
  } catch (ex) {
    setLobbyError(ex.message || String(ex));
  }
}

async function restartOnlineGame() {
  if (!state.room) return;
  state.roomPlayers = await window.JMNet.listRoomPlayers(state.room.id);
  const { game } = await window.JMNet.startGame(state.room, state.roomPlayers, LOCATIONS);
  await beginOnlineGame(game);
}

async function resumeOnlineGame(room) {
  const game = await window.JMNet.fetchGameState(room.id, LOCATIONS);
  if (!game) throw new Error('Состояние партии не найдено');
  await beginOnlineGame(game);
}

async function beginOnlineGame(game) {
  if (state.unsubLobby) {
    state.unsubLobby();
    state.unsubLobby = null;
  }
  window.JMNet.unsubscribeGame();
  state.mode = 'online';
  setLocationCatalog(game, LOCATIONS);
  syncBoardToCurrentPlayer(game);
  state.game = game;
  state.locationIndex = Math.max(
    0,
    LOCATIONS.findIndex((l) => l.id === game.location.id)
  );
  state.unsubGame = window.JMNet.subscribeGame(game.roomId, (row) => {
    if (!row?.state) return;
    if (state.applyingRemote) return;
    state.applyingRemote = true;
    try {
      const next = hydrateGameState(row.state, LOCATIONS);
      if (!next) return;
      next.online = true;
      next.roomId = game.roomId;
      next.roomCode = game.roomCode || next.roomCode;
      state.game = next;
      state.locationIndex = Math.max(
        0,
        LOCATIONS.findIndex((l) => l.id === next.location.id)
      );
      renderLocationTabs();
      renderAll();
      syncDevPanel();
      if (next.introSeen) hideIntroModal();
      else maybeShowIntroBeforeFirstRoll();
    } finally {
      state.applyingRemote = false;
    }
  });
  showGameScreen();
  renderLocationTabs();
  renderAll();
  syncDevPanel();
  maybeShowIntroBeforeFirstRoll();
}

async function onLeaveRoom() {
  const roomId = state.room?.id;
  const userId = state.user?.id;
  try {
    if (roomId && userId && window.JMNet.leaveRoom) {
      await window.JMNet.leaveRoom(roomId, userId);
    }
  } catch (ex) {
    console.warn('[JM] leaveRoom', ex);
  }
  teardownNet();
  state.room = null;
  state.roomPlayers = [];
  history.replaceState({}, '', window.location.pathname);
  await enterMainMenu();
}

function onNewGame() {
  if (state.mode === 'tutorial') {
    if (!confirm('Начать обучение заново?')) return;
    startTutorial();
    return;
  }
  if (state.mode === 'online') {
    if (!confirm('Начать новую онлайн-партию в этой комнате? Прогресс сбросится.')) return;
    restartOnlineGame();
    return;
  }
  if (!confirm('Начать новую локальную кампанию? Сохранение будет сброшено.')) return;
  clearCampaignLocal();
  startOfflineCampaign({ fresh: true });
}

function onRoll() {
  if (isIntroOpen() || !state.game?.introSeen) {
    maybeShowIntroBeforeFirstRoll();
    return;
  }
  if (hasPendingAction(state.game)) return;
  if (state.mode === 'online' && !isMyOnlineTurn()) return;

  const diceEl = $('#dice');
  diceEl.classList.add('dice--rolling');
  diceEl.textContent = '…';

  setTimeout(() => {
    const result = performRoll(state.game);
    diceEl.classList.remove('dice--rolling');

    if (result) {
      diceEl.textContent = result.dice;
      afterGameAction();
      if (state.mode === 'tutorial') advanceTutorialHint();
    } else {
      renderAll();
    }
  }, 350);
}

init();
})();
