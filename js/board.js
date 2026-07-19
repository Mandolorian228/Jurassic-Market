(function () {
const { CELL_TYPES } = window.GameData;

const TYPE_LABELS = {
  [CELL_TYPES.START]: 'Старт',
  [CELL_TYPES.EMPTY]: 'Пусто',
  [CELL_TYPES.PROPERTY]: 'Динозавр',
  [CELL_TYPES.MONEY]: 'Бонус',
  [CELL_TYPES.CHARACTER]: 'Агент',
  [CELL_TYPES.EVENT]: 'Событие',
  [CELL_TYPES.CORNER]: 'Зона',
};

/** Классическое поле 40 клеток: 9×9 сторон. */
const DEFAULT_BOARD_LAYOUT = { sideH: 9, sideV: 9 };

/**
 * Карта индексов по сторонам.
 * sideH — клетки сверху/снизу (без углов), sideV — слева/справа.
 */
function buildSideMap(sideH = 9, sideV = 9) {
  let i = 0;
  const tl = i++;
  const topStart = i;
  i += sideH;
  const top = [topStart, i - 1];
  const tr = i++;
  const rightStart = i;
  i += sideV;
  const right = [rightStart, i - 1];
  const br = i++;
  const bottomStart = i;
  i += sideH;
  const bottom = [bottomStart, i - 1];
  const bl = i++;
  const leftStart = i;
  i += sideV;
  const left = [leftStart, i - 1];
  return { tl, top, tr, right, br, bottom, bl, left, total: i, sideH, sideV };
}

const SIDE_MAP = buildSideMap(DEFAULT_BOARD_LAYOUT.sideH, DEFAULT_BOARD_LAYOUT.sideV);

function getBoardLayout(location) {
  const layout = location?.boardLayout;
  if (layout && layout.sideH > 0 && layout.sideV > 0) {
    return { sideH: layout.sideH, sideV: layout.sideV };
  }
  return { ...DEFAULT_BOARD_LAYOUT };
}

function findPlayerById(players, id) {
  if (id == null || !players?.length) return null;
  return players.find((p) => Number(p.id) === Number(id)) || null;
}

function createCellElement(cell, playersOnBoard, ownership, allPlayers) {
  const roster = allPlayers?.length ? allPlayers : playersOnBoard;
  const el = document.createElement('div');
  el.className = `cell cell--${cell.type}`;
  el.dataset.index = cell.index;
  el.title = buildCellTitle(cell, roster, ownership);

  if (cell.type !== CELL_TYPES.EMPTY) {
    if (cell.type === CELL_TYPES.MONEY) {
      el.innerHTML = `<span class="cell__icon">💰</span><span class="cell__label">${cell.label || '$'}</span>`;
    } else if (cell.type === CELL_TYPES.CHARACTER) {
      el.innerHTML = `
        <span class="cell__icon">👤</span>
        <span class="cell__label">${cell.label || ''}</span>
        ${cell.sublabel ? `<span class="cell__sublabel">${cell.sublabel}</span>` : ''}
      `;
      if (cell.sellBonus && cell.sellBonus > 1000) {
        el.classList.add('cell--broker');
      }
    } else if (cell.type === CELL_TYPES.PROPERTY) {
      el.innerHTML = `
        <span class="cell__price">$${cell.price?.toLocaleString('ru') || ''}</span>
        <span class="cell__label">${cell.label || ''}</span>
        <span class="cell__income">+$${getIncomeLabel(cell)}</span>
      `;
    } else if (cell.type === CELL_TYPES.EVENT) {
      el.innerHTML = `
        <span class="cell__icon">🚨</span>
        <span class="cell__label">${cell.label || ''}</span>
        <span class="cell__sublabel">${cell.sublabel || ''}</span>
      `;
    } else if (cell.type === CELL_TYPES.CORNER) {
      const arenaIcon = cell.effect === 'arena' ? '<span class="cell__icon">⚔️</span>' : '';
      if (cell.effect === 'arena') el.classList.add('cell--arena');
      el.innerHTML = `
        ${arenaIcon}
        <span class="cell__label">${cell.label || ''}</span>
        <span class="cell__sublabel">${cell.sublabel || ''}</span>
      `;
    } else {
      el.innerHTML = `
        <span class="cell__label">${cell.label || ''}</span>
        ${cell.sublabel ? `<span class="cell__sublabel">${cell.sublabel}</span>` : ''}
      `;
    }
  }

  const ownerId = ownership[cell.index] ?? ownership[String(cell.index)];
  if (ownerId != null && cell.type === CELL_TYPES.PROPERTY) {
    const owner = findPlayerById(roster, ownerId);
    if (owner?.color) {
      el.classList.add('cell--owned');
      el.style.setProperty('--owner-color', owner.color);
      el.title = `${el.title} — владелец: ${owner.name}`;
    }
  }

  const tokens = (playersOnBoard || []).filter((p) => p.position === cell.index);
  if (tokens.length) {
    const tokensEl = document.createElement('div');
    tokensEl.className = 'cell__tokens';
    tokens.forEach((p) => {
      const dot = document.createElement('span');
      dot.className = 'cell__token';
      dot.style.background = p.color;
      dot.title = p.name;
      tokensEl.appendChild(dot);
    });
    el.appendChild(tokensEl);
  }

  return el;
}

function getIncomeLabel(cell) {
  if (cell.income != null) return cell.income.toLocaleString('ru');
  if (cell.price != null) return Math.max(50, Math.round(cell.price * 0.1)).toLocaleString('ru');
  return '0';
}

function buildCellTitle(cell, players, ownership) {
  const parts = [TYPE_LABELS[cell.type] || cell.type];
  if (cell.label) parts.push(cell.label);
  if (cell.price) parts.push(`цена $${cell.price}`);
  if (cell.type === CELL_TYPES.PROPERTY) {
    if (cell.attractiveness != null) parts.push(`★${cell.attractiveness}`);
    if (cell.dietLabel) parts.push(cell.dietLabel);
    if (cell.flies) parts.push('летает');
    parts.push(`доход $${getIncomeLabel(cell)}`);
  }
  const ownerId = ownership[cell.index];
  if (ownerId != null) {
    const owner = players.find((p) => p.id === ownerId);
    parts.push(`владелец: ${owner?.name || ownerId}`);
  }
  if (cell.description) parts.push(cell.description);
  return parts.join(' — ');
}

function renderCenter(location) {
  const { center } = location;
  const el = document.createElement('div');
  el.className = 'board__center';
  if (center.image) {
    el.classList.add('board__center--photo');
    el.style.setProperty('--center-photo', `url("${center.image}")`);
  } else if (!center.showDecorMap) {
    el.classList.add('board__center--text');
  }

  const mapBlock = center.image
    ? `<div class="center__map" aria-hidden="true">
        <div class="center__photo" style="background-image:url('${center.image}')"></div>
      </div>`
    : center.showDecorMap
      ? `<div class="center__map" aria-hidden="true">
          <div class="center__water"></div>
          <div class="center__island center__island--small"></div>
          <div class="center__island center__island--main"></div>
          <span class="center__map-label">${center.mapTitle}</span>
        </div>`
      : '';

  el.innerHTML = `
    <div class="center__header">
      <h3 class="center__title">${center.mapTitle}</h3>
      ${center.mapSubtitle ? `<p class="center__subtitle">${center.mapSubtitle}</p>` : ''}
    </div>
    ${mapBlock}
  `;

  return el;
}

function applyBoardGridAreas(parts, sideH, sideV) {
  const cEnd = sideH + 2;
  const rEnd = sideV + 2;
  parts.tl.style.gridArea = '1 / 1 / 2 / 2';
  parts.top.style.gridArea = `1 / 2 / 2 / ${cEnd}`;
  parts.tr.style.gridArea = `1 / ${cEnd} / 2 / ${cEnd + 1}`;
  parts.left.style.gridArea = `2 / 1 / ${rEnd} / 2`;
  parts.center.style.gridArea = `2 / 2 / ${rEnd} / ${cEnd}`;
  parts.right.style.gridArea = `2 / ${cEnd} / ${rEnd} / ${cEnd + 1}`;
  parts.bl.style.gridArea = `${rEnd} / 1 / ${rEnd + 1} / 2`;
  parts.bottom.style.gridArea = `${rEnd} / 2 / ${rEnd + 1} / ${cEnd}`;
  parts.br.style.gridArea = `${rEnd} / ${cEnd} / ${rEnd + 1} / ${cEnd + 1}`;
}

function renderBoard(location, playersOnBoard = [], ownership = {}, allPlayers = null) {
  /** Обёртка: название локации вне CSS Grid, иначе сетка «съезжает». */
  const wrap = document.createElement('div');
  wrap.className = 'board-wrap';

  const board = document.createElement('div');
  board.className = 'board';
  board.setAttribute('role', 'grid');
  const roster = allPlayers?.length ? allPlayers : playersOnBoard;

  Object.entries(location.theme || {}).forEach(([key, value]) => {
    board.style.setProperty(key, value);
  });

  const { sideH, sideV } = getBoardLayout(location);
  const sideMap = buildSideMap(sideH, sideV);
  board.style.gridTemplateColumns = `var(--corner-size) repeat(${sideH}, 1fr) var(--corner-size)`;
  board.style.gridTemplateRows = `var(--corner-size) repeat(${sideV}, 1fr) var(--corner-size)`;
  board.dataset.sideH = String(sideH);
  board.dataset.sideV = String(sideV);

  const nameTag = document.createElement('div');
  nameTag.className = 'board__location-name';
  nameTag.textContent = location.name;
  wrap.appendChild(nameTag);

  const cells = location.cells;
  if (!cells || cells.length !== sideMap.total) {
    console.warn(
      `[JM] локация ${location.id}: клеток ${cells?.length ?? 0}, ожидалось ${sideMap.total}`
    );
  }

  const corners = {
    tl: createSideWrapper('board__corner board__corner--tl'),
    tr: createSideWrapper('board__corner board__corner--tr'),
    br: createSideWrapper('board__corner board__corner--br'),
    bl: createSideWrapper('board__corner board__corner--bl'),
  };

  const cellEl = (index) =>
    createCellElement(cells[index], playersOnBoard, ownership, roster);

  corners.tl.appendChild(cellEl(sideMap.tl));
  corners.tr.appendChild(cellEl(sideMap.tr));
  corners.br.appendChild(cellEl(sideMap.br));
  corners.bl.appendChild(cellEl(sideMap.bl));

  const top = createSideWrapper('board__top');
  for (let i = sideMap.top[0]; i <= sideMap.top[1]; i++) {
    top.appendChild(cellEl(i));
  }

  const right = createSideWrapper('board__right');
  for (let i = sideMap.right[0]; i <= sideMap.right[1]; i++) {
    right.appendChild(cellEl(i));
  }

  const bottom = createSideWrapper('board__bottom');
  for (let i = sideMap.bottom[0]; i <= sideMap.bottom[1]; i++) {
    bottom.appendChild(cellEl(i));
  }

  const left = createSideWrapper('board__left');
  for (let i = sideMap.left[0]; i <= sideMap.left[1]; i++) {
    left.appendChild(cellEl(i));
  }

  const center = renderCenter(location);
  applyBoardGridAreas(
    {
      tl: corners.tl,
      tr: corners.tr,
      br: corners.br,
      bl: corners.bl,
      top,
      right,
      bottom,
      left,
      center,
    },
    sideH,
    sideV
  );

  board.append(corners.tl, top, corners.tr, left, center, right, corners.bl, bottom, corners.br);
  wrap.appendChild(board);

  return wrap;
}

function createSideWrapper(className) {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

function highlightCell(boardEl, index) {
  boardEl.querySelectorAll('.cell--highlight').forEach((c) => c.classList.remove('cell--highlight'));
  const cell = boardEl.querySelector(`.cell[data-index="${index}"]`);
  if (cell) cell.classList.add('cell--highlight');
}

function getCellInfoHTML(
  cell,
  {
    owner = null,
    income = null,
    attractiveness = null,
    dnaInfo = null,
    rentFine = null,
    hideAttractiveness = false,
  } = {}
) {
  if (!cell) return '<p class="cell-info__placeholder">Клетка не найдена</p>';

  const typeLabel = TYPE_LABELS[cell.type] || cell.type;
  let html = `<span class="cell-info__type">${typeLabel}</span>`;

  if (cell.label) {
    html += `<p class="cell-info__label">${cell.label}${cell.sublabel ? ` <small>(${cell.sublabel})</small>` : ''}</p>`;
  }

  if (cell.price) {
    html += `<p class="cell-info__price">Цена: $${cell.price.toLocaleString('ru')}</p>`;
  }

  if (cell.type === CELL_TYPES.PROPERTY) {
    const inc = income != null ? income : cell.income;
    if (inc != null) {
      html += `<p class="cell-info__income">Доход: $${Number(inc).toLocaleString('ru')} / круг</p>`;
    }
    if (!hideAttractiveness) {
      const attr = attractiveness != null ? attractiveness : cell.attractiveness;
      if (attr != null) {
        const dietBit = cell.dietLabel ? ` · ${cell.dietLabel}` : '';
        const flyBit = cell.flies ? ' · летает' : '';
        const baseBit =
          cell.attractiveness != null && attractiveness != null && attractiveness !== cell.attractiveness
            ? ` · база ★${cell.attractiveness}`
            : '';
        html += `<p class="cell-info__attr">Привлекательность: ★${attr} <small>(размер ${cell.size}/10 · экран ${cell.fame}/10${dietBit}${flyBit}${baseBit})</small></p>`;
      }
    }
    if (cell.dietLabel || cell.flies) {
      html += `<p class="cell-info__diet">Рацион: <strong>${cell.dietLabel || '—'}</strong>${
        cell.flies ? ' · <strong>летает</strong>' : ''
      }</p>`;
    }
    if (owner) {
      html += `<p class="cell-info__owner">Владелец: <span style="color:${owner.color}">${owner.name}</span></p>`;
      if (rentFine != null) {
        html += `<p class="cell-info__price">Штраф чужому: $${Number(rentFine).toLocaleString('ru')} <small>(50% дохода)</small></p>`;
      }
    } else {
      html += '<p class="cell-info__owner">Свободен — можно купить</p>';
    }
  }

  if (dnaInfo) {
    html += `<p class="cell-info__price">Образец ДНК: $${Number(dnaInfo.price).toLocaleString('ru')} <small>(до ${dnaInfo.limit} шт., доход не даёт)</small></p>`;
    if (dnaInfo.count != null) {
      html += `<p class="cell-info__desc">У вас образцов: ${dnaInfo.count}/${dnaInfo.limit}</p>`;
    }
  }

  if (cell.description) {
    html += `<p class="cell-info__desc">${cell.description}</p>`;
  }

  if (cell.type === CELL_TYPES.EMPTY) {
    html += '<p class="cell-info__desc">Спокойная клетка — ничего не происходит.</p>';
  }

  return html;
}

window.Board = {
  renderBoard,
  highlightCell,
  getCellInfoHTML,
  TYPE_LABELS,
  SIDE_MAP,
  DEFAULT_BOARD_LAYOUT,
  buildSideMap,
  getBoardLayout,
};
})();
