const config = window.CATAN_CONFIG || {};
const resourceLimits = config.resourceLimits || {};
const tokenLimits = Object.fromEntries(
  Object.entries(config.tokenLimits || {}).map(([key, value]) => [Number(key), value])
);

const boardElement = document.getElementById('board');
const analyzeButton = document.getElementById('analyze-button');
const randomizeButton = document.getElementById('randomize-button');
const clearBoardButton = document.getElementById('clear-board');
const vertexOverlayElement = document.getElementById('vertex-overlay');
const helpButton = document.getElementById('help-button');
const helpPopover = document.getElementById('help-popover');
const closeHelpButton = document.getElementById('close-help');

const messagePanel = document.getElementById('message-panel');
const messagesList = document.getElementById('messages');
const resultsEmpty = document.getElementById('results-empty');
const resultsGrid = document.getElementById('results-grid');
const topVerticesList = document.getElementById('top-vertices');
const topPairsList = document.getElementById('top-pairs');

const editorOverlay = document.getElementById('tile-editor');
const closeEditorButton = document.getElementById('close-editor');
const saveTileButton = document.getElementById('save-tile');
const clearTileButton = document.getElementById('clear-tile');
const editorHint = document.getElementById('editor-hint');
const tileNumberLabel = document.getElementById('editor-tile-number');
const resourceOptionButtons = Array.from(
  document.querySelectorAll('#resource-options .option-chip')
);
const tokenOptionButtons = Array.from(document.querySelectorAll('#token-options .option-chip'));
const tokenSection = document.getElementById('token-section');

const rootStyles = getComputedStyle(document.documentElement);
const HEX_RADIUS = parseFloat(rootStyles.getPropertyValue('--hex-radius')) || 60;
const HEX_DIAMETER = HEX_RADIUS * 2;
const HEX_HEIGHT = Math.sqrt(3) * HEX_RADIUS;
const BOARD_PADDING = HEX_RADIUS * 1.6;
const HELP_STORAGE_KEY = 'catanalyst_help_dismissed';

const tiles = Array.from(document.querySelectorAll('.hex-tile'))
  .map((element) => ({
    id: Number(element.dataset.tile),
    q: Number(element.dataset.q),
    r: Number(element.dataset.r),
    resource: null,
    token: null,
    element,
  }))
  .sort((a, b) => a.id - b.id);

const vertices = (config.vertices || []).map((vertex) => ({
  id: Number(vertex.id),
  x: Number(vertex.x),
  y: Number(vertex.y),
  tiles: Array.isArray(vertex.tiles)
    ? vertex.tiles.map((value) => Number(value) - 1).filter((value) => value >= 0)
    : [],
  element: null,
}));

const vertexLookup = new Map(vertices.map((vertex) => [vertex.id, vertex]));

const resourceCounts = Object.fromEntries(
  Object.keys(resourceLimits).map((resource) => [resource, 0])
);
const tokenCounts = Object.fromEntries(
  Object.keys(tokenLimits).map((token) => [Number(token), 0])
);

let editingTileId = null;
let editorResource = null;
let editorToken = null;
let boardBounds = { minX: 0, minY: 0, width: 0, height: 0 };

function axialToPixel(q, r) {
  const x = HEX_RADIUS * 1.5 * q;
  const y = HEX_RADIUS * Math.sqrt(3) * (r + q / 2);
  return { x, y };
}

function initVertexMarkers() {
  if (!vertexOverlayElement) {
    return;
  }
  vertexOverlayElement.innerHTML = '';
  vertices.forEach((vertex) => {
    const marker = document.createElement('span');
    marker.className = 'vertex-node';
    marker.dataset.vertex = vertex.id;
    vertexOverlayElement.appendChild(marker);
    vertex.element = marker;
  });
}

function positionVertexMarkers(bounds) {
  if (!vertexOverlayElement) {
    return;
  }
  const { minX, minY } = bounds;
  vertices.forEach((vertex) => {
    if (!vertex.element) {
      return;
    }
    const px = vertex.x * HEX_RADIUS;
    const py = vertex.y * HEX_RADIUS;
    const offsetX = px - minX + BOARD_PADDING;
    const offsetY = py - minY + BOARD_PADDING;
    vertex.element.style.left = `${offsetX}px`;
    vertex.element.style.top = `${offsetY}px`;
  });
}

function layoutBoard() {
  if (!boardElement) {
    return;
  }
  const positions = tiles.map((tile) => {
    const position = axialToPixel(tile.q, tile.r);
    return { id: tile.id, ...position };
  });

  const xs = positions.map((pos) => pos.x);
  const ys = positions.map((pos) => pos.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const width = maxX - minX + BOARD_PADDING * 2;
  const height = maxY - minY + BOARD_PADDING * 2;

  boardBounds = { minX, minY, width, height };
  boardElement.style.width = `${width}px`;
  boardElement.style.height = `${height}px`;

  positions.forEach((pos) => {
    const tile = tiles[pos.id];
    const offsetX = pos.x - minX + BOARD_PADDING;
    const offsetY = pos.y - minY + BOARD_PADDING;
    tile.element.style.left = `${offsetX - HEX_DIAMETER / 2}px`;
    tile.element.style.top = `${offsetY - HEX_HEIGHT / 2}px`;
  });

  if (vertexOverlayElement) {
    vertexOverlayElement.style.width = `${width}px`;
    vertexOverlayElement.style.height = `${height}px`;
    positionVertexMarkers(boardBounds);
  }
}

function clearVertexHighlights() {
  vertices.forEach((vertex) => {
    if (vertex.element) {
      vertex.element.classList.remove('highlighted');
    }
  });
  tiles.forEach((tile) => {
    tile.element.classList.remove('highlighted');
  });
}

function highlightVerticesOnBoard(vertexIds) {
  if (!Array.isArray(vertexIds) || vertexIds.length === 0) {
    clearVertexHighlights();
    return;
  }
  const unique = new Set(vertexIds);
  clearVertexHighlights();
  unique.forEach((vertexId) => {
    const vertex = vertexLookup.get(vertexId);
    if (!vertex) {
      return;
    }
    if (vertex.element) {
      vertex.element.classList.add('highlighted');
    }
    vertex.tiles.forEach((tileId) => {
      const tile = tiles[tileId];
      if (tile) {
        tile.element.classList.add('highlighted');
      }
    });
  });
}

function attachRecommendationHover(element, vertexIds) {
  if (!element) {
    return;
  }
  const ids = Array.isArray(vertexIds) ? vertexIds.slice() : [];
  if (!element.hasAttribute('tabindex')) {
    element.tabIndex = 0;
  }
  element.addEventListener('mouseenter', () => highlightVerticesOnBoard(ids));
  element.addEventListener('focusin', () => highlightVerticesOnBoard(ids));
  element.addEventListener('mouseleave', () => clearVertexHighlights());
  element.addEventListener('focusout', () => clearVertexHighlights());
}

function showHelpPopover() {
  if (!helpPopover) {
    return;
  }
  helpPopover.classList.remove('hidden');
  helpPopover.setAttribute('aria-hidden', 'false');
  if (helpButton) {
    helpButton.setAttribute('aria-expanded', 'true');
  }
}

function hideHelpPopover(persist = false) {
  if (!helpPopover) {
    return;
  }
  if (!helpPopover.classList.contains('hidden')) {
    helpPopover.classList.add('hidden');
  }
  helpPopover.setAttribute('aria-hidden', 'true');
  if (helpButton) {
    helpButton.setAttribute('aria-expanded', 'false');
  }
  if (persist) {
    try {
      localStorage.setItem(HELP_STORAGE_KEY, '1');
    } catch (error) {
      /* ignore storage errors */
    }
  }
}

function initializeHelpPopover() {
  if (!helpPopover) {
    return;
  }
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(HELP_STORAGE_KEY) === '1';
  } catch (error) {
    dismissed = false;
  }
  if (dismissed) {
    hideHelpPopover(false);
    return;
  }
  requestAnimationFrame(() => {
    showHelpPopover();
  });
}

function resetCounts() {
  Object.keys(resourceCounts).forEach((resource) => {
    resourceCounts[resource] = 0;
  });
  Object.keys(tokenCounts).forEach((token) => {
    tokenCounts[token] = 0;
  });

  tiles.forEach((tile) => {
    if (!tile.resource) {
      return;
    }
    resourceCounts[tile.resource] += 1;
    if (tile.resource !== 'desert' && tile.token !== null) {
      tokenCounts[tile.token] += 1;
    }
  });
}

function titleCase(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function updateTileAppearance(tile) {
  const resourceLabel = tile.element.querySelector('[data-role="resource"]');
  const tokenLabel = tile.element.querySelector('[data-role="token"]');

  if (!tile.resource) {
    tile.element.classList.add('empty');
    tile.element.dataset.resource = '';
    resourceLabel.textContent = 'Click to choose';
    tokenLabel.textContent = '';
    tile.element.classList.remove('has-token');
    return;
  }

  tile.element.classList.remove('empty');
  tile.element.dataset.resource = tile.resource;
  resourceLabel.textContent = tile.resource === 'desert' ? 'Desert' : titleCase(tile.resource);

  if (tile.resource === 'desert') {
    tokenLabel.textContent = '';
    tile.element.classList.remove('has-token');
    return;
  }

  if (tile.token !== null) {
    tokenLabel.textContent = tile.token;
    tile.element.classList.add('has-token');
  } else {
    tokenLabel.textContent = '';
    tile.element.classList.remove('has-token');
  }
}

function applyTileState(tile, resource, token) {
  tile.resource = resource;
  tile.token = resource === 'desert' ? null : token;
  updateTileAppearance(tile);
  resetCounts();
}

function clearTile(tile) {
  tile.resource = null;
  tile.token = null;
  updateTileAppearance(tile);
  resetCounts();
}

function setEditorHint(message, isError = false) {
  if (!editorHint) return;
  editorHint.textContent = message;
  editorHint.classList.toggle('error', Boolean(isError));
}

function updateResourceOptions(baseResourceCounts) {
  resourceOptionButtons.forEach((button) => {
    const resource = button.dataset.resource;
    const limit = resourceLimits[resource];
    const used = baseResourceCounts[resource] || 0;
    const remaining = Math.max(limit - used, 0);

    button.disabled = remaining <= 0;
    button.classList.toggle('selected', editorResource === resource);

    const remainingLabel = button.querySelector('[data-role="remaining"]');
    if (remainingLabel) {
      remainingLabel.textContent = `${remaining} left`;
    }
  });
}

function updateTokenOptions(baseTokenCounts) {
  if (!tokenSection) {
    return;
  }
  if (!editorResource || editorResource === 'desert') {
    tokenSection.classList.add('disabled');
    tokenOptionButtons.forEach((button) => {
      button.classList.remove('selected');
    });
    return;
  }

  tokenSection.classList.remove('disabled');
  tokenOptionButtons.forEach((button) => {
    const token = Number(button.dataset.token);
    const limit = tokenLimits[token];
    const used = baseTokenCounts[token] || 0;
    const remaining = Math.max(limit - used, 0);

    button.disabled = remaining <= 0;
    button.classList.toggle('selected', editorToken === token);

    const remainingLabel = button.querySelector('[data-role="remaining"]');
    if (remainingLabel) {
      remainingLabel.textContent = `${remaining} left`;
    }
  });
}

function openEditor(tile) {
  editingTileId = tile.id;
  editorResource = tile.resource;
  editorToken = tile.token;
  tileNumberLabel.textContent = tile.id + 1;

  const baseResourceCounts = { ...resourceCounts };
  const baseTokenCounts = { ...tokenCounts };
  if (tile.resource) {
    baseResourceCounts[tile.resource] -= 1;
    if (tile.resource !== 'desert' && tile.token !== null) {
      baseTokenCounts[tile.token] -= 1;
    }
  }

  updateResourceOptions(baseResourceCounts);
  updateTokenOptions(baseTokenCounts);
  setEditorHint('Select a terrain for this hex.');

  editorOverlay.classList.remove('hidden');
  document.body.classList.add('scroll-locked');
}

function closeEditor() {
  editingTileId = null;
  editorResource = null;
  editorToken = null;
  editorOverlay.classList.add('hidden');
  document.body.classList.remove('scroll-locked');
}

function handleResourceSelection(event) {
  const button = event.currentTarget;
  if (button.disabled) return;

  const resource = button.dataset.resource;
  editorResource = resource;
  if (resource === 'desert') {
    editorToken = null;
  }

  const tile = tiles[editingTileId];
  const baseResourceCounts = { ...resourceCounts };
  const baseTokenCounts = { ...tokenCounts };
  if (tile.resource) {
    baseResourceCounts[tile.resource] -= 1;
    if (tile.resource !== 'desert' && tile.token !== null) {
      baseTokenCounts[tile.token] -= 1;
    }
  }

  updateResourceOptions(baseResourceCounts);
  updateTokenOptions(baseTokenCounts);

  if (resource === 'desert') {
    setEditorHint('Deserts do not receive number tokens.');
  } else {
    setEditorHint('Select a number token for this terrain.');
  }
}

function handleTokenSelection(event) {
  const button = event.currentTarget;
  if (button.disabled) return;
  editorToken = Number(button.dataset.token);
  tokenOptionButtons.forEach((btn) => {
    btn.classList.toggle('selected', btn === button);
  });
}

function saveEditingTile() {
  if (editingTileId === null) {
    return;
  }

  if (!editorResource) {
    setEditorHint('Choose a terrain before saving.', true);
    return;
  }

  if (editorResource !== 'desert' && editorToken === null) {
    setEditorHint('Select a number token for this terrain.', true);
    return;
  }

  const tile = tiles[editingTileId];
  applyTileState(tile, editorResource, editorToken);
  closeEditor();
}

function clearEditingTile() {
  if (editingTileId === null) {
    return;
  }
  const tile = tiles[editingTileId];
  clearTile(tile);
  closeEditor();
}

function clearBoard() {
  tiles.forEach((tile) => {
    tile.resource = null;
    tile.token = null;
    updateTileAppearance(tile);
  });
  resetCounts();
  clearMessages();
  clearVertexHighlights();
  resultsGrid.hidden = true;
  resultsEmpty.hidden = false;
}

function applyRandomTiles(randomTiles) {
  tiles.forEach((tile) => {
    const match = randomTiles.find((item) => item.id === tile.id);
    if (!match) {
      tile.resource = null;
      tile.token = null;
      updateTileAppearance(tile);
      return;
    }
    tile.resource = match.resource;
    tile.token = match.resource === 'desert' ? null : match.token;
    updateTileAppearance(tile);
  });
  resetCounts();
  clearMessages();
  clearVertexHighlights();
  resultsGrid.hidden = true;
  resultsEmpty.hidden = false;
}

async function randomizeBoard() {
  try {
    const response = await fetch('/random-board');
    if (!response.ok) {
      throw new Error('Unable to generate random board.');
    }
    const data = await response.json();
    applyRandomTiles(data.tiles || []);
  } catch (error) {
    showMessages([error.message || 'Unable to generate random board.']);
  }
}

function serializeTiles() {
  return tiles.map((tile) => ({
    id: tile.id,
    resource: tile.resource,
    token: tile.token,
  }));
}

function clearMessages() {
  if (!messagePanel) return;
  messagesList.innerHTML = '';
  messagePanel.hidden = true;
}

function showMessages(messages) {
  if (!messagePanel) return;
  messagesList.innerHTML = '';
  messages.forEach((message) => {
    const li = document.createElement('li');
    li.textContent = message;
    messagesList.appendChild(li);
  });
  messagePanel.hidden = messages.length === 0;
}

function renderVertexEntry(entry) {
  const li = document.createElement('li');
  const resourceList = entry.resources.map(titleCase).join(', ');
  const cornerLabel = `Corner ${entry.vertex + 1}`;
  li.innerHTML = `
    <span class="score">${cornerLabel} · Score ${entry.score}</span>
    <span class="meta">Touches tiles ${entry.tiles.join(', ')}</span>
    <span class="resources">${resourceList}</span>
  `;
  li.dataset.vertexIds = String(entry.vertex);
  return li;
}

function renderPairEntry(entry) {
  const li = document.createElement('li');
  const resources = entry.resources.map(titleCase).join(', ');
  const verticesSummary = entry.vertices
    .map(
      (vertex) =>
        `Corner ${vertex.vertex + 1} (tiles ${vertex.tiles.join(', ')}, score ${vertex.score})`
    )
    .join(' &amp; ');
  const vertexIds = entry.vertices.map((vertex) => vertex.vertex);
  li.innerHTML = `
    <span class="score">Pair score ${entry.score}</span>
    <span class="meta">${verticesSummary}</span>
    <span class="resources">Combined resources: ${resources}</span>
  `;
  li.dataset.vertexIds = vertexIds.join(',');
  return li;
}

async function analyzeBoard() {
  try {
    clearMessages();
    clearVertexHighlights();
    const response = await fetch('/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tiles: serializeTiles() }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ errors: ['Board is invalid.'] }));
      showMessages(data.errors || ['Board is invalid.']);
      resultsGrid.hidden = true;
      resultsEmpty.hidden = false;
      return;
    }

    const data = await response.json();
    const vertices = data.vertices || [];
    const pairs = data.pairs || [];

    topVerticesList.innerHTML = '';
    vertices.forEach((entry) => {
      const item = renderVertexEntry(entry);
      topVerticesList.appendChild(item);
      attachRecommendationHover(item, [entry.vertex]);
    });

    topPairsList.innerHTML = '';
    pairs.forEach((entry) => {
      const item = renderPairEntry(entry);
      topPairsList.appendChild(item);
      const pairVertexIds = entry.vertices.map((vertex) => vertex.vertex);
      attachRecommendationHover(item, pairVertexIds);
    });

    resultsEmpty.hidden = true;
    resultsGrid.hidden = false;
  } catch (error) {
    showMessages(['Something went wrong while analyzing the board.']);
    resultsGrid.hidden = true;
    resultsEmpty.hidden = false;
  }
}

function bindEvents() {
  tiles.forEach((tile) => {
    tile.element.addEventListener('click', () => openEditor(tile));
  });

  resourceOptionButtons.forEach((button) => {
    button.addEventListener('click', handleResourceSelection);
  });

  tokenOptionButtons.forEach((button) => {
    button.addEventListener('click', handleTokenSelection);
  });

  if (closeEditorButton) {
    closeEditorButton.addEventListener('click', closeEditor);
  }

  if (editorOverlay) {
    editorOverlay.addEventListener('click', (event) => {
      if (event.target === editorOverlay) {
        closeEditor();
      }
    });
  }

  if (saveTileButton) {
    saveTileButton.addEventListener('click', saveEditingTile);
  }

  if (clearTileButton) {
    clearTileButton.addEventListener('click', clearEditingTile);
  }

  if (randomizeButton) {
    randomizeButton.addEventListener('click', randomizeBoard);
  }

  if (clearBoardButton) {
    clearBoardButton.addEventListener('click', clearBoard);
  }

  if (analyzeButton) {
    analyzeButton.addEventListener('click', analyzeBoard);
  }

  if (helpButton && helpPopover) {
    helpButton.addEventListener('click', () => {
      const isHidden = helpPopover.classList.contains('hidden');
      if (isHidden) {
        showHelpPopover();
      } else {
        hideHelpPopover(true);
      }
    });
  }

  if (closeHelpButton) {
    closeHelpButton.addEventListener('click', () => hideHelpPopover(true));
  }

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !editorOverlay.classList.contains('hidden')) {
      closeEditor();
    }
    if (event.key === 'Escape' && helpPopover && !helpPopover.classList.contains('hidden')) {
      hideHelpPopover(true);
    }
  });
}

initVertexMarkers();
layoutBoard();
resetCounts();
bindEvents();
initializeHelpPopover();
window.addEventListener('resize', () => {
  layoutBoard();
});

