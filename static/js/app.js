const config = window.CATAN_CONFIG || {};
const resourceLimits = config.resourceLimits || {};
const tokenLimits = Object.fromEntries(
  Object.entries(config.tokenLimits || {}).map(([key, value]) => [Number(key), value])
);

const boardElement = document.getElementById('board');
const analyzeButton = document.getElementById('analyze-button');
const randomizeButton = document.getElementById('randomize-button');
const clearBoardButton = document.getElementById('clear-board');

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

const resourceCounts = Object.fromEntries(
  Object.keys(resourceLimits).map((resource) => [resource, 0])
);
const tokenCounts = Object.fromEntries(
  Object.keys(tokenLimits).map((token) => [Number(token), 0])
);

let editingTileId = null;
let editorResource = null;
let editorToken = null;

function axialToPixel(q, r) {
  const x = HEX_RADIUS * Math.sqrt(3) * (q + r / 2);
  const y = HEX_RADIUS * 1.5 * r;
  return { x, y };
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

  boardElement.style.width = `${width}px`;
  boardElement.style.height = `${height}px`;

  positions.forEach((pos) => {
    const tile = tiles[pos.id];
    const offsetX = pos.x - minX + BOARD_PADDING;
    const offsetY = pos.y - minY + BOARD_PADDING;
    tile.element.style.left = `${offsetX - HEX_DIAMETER / 2}px`;
    tile.element.style.top = `${offsetY - HEX_HEIGHT / 2}px`;
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
  li.innerHTML = `
    <span class="score">Score ${entry.score}</span>
    <span class="meta">Touches tiles ${entry.tiles.join(', ')}</span>
    <span class="resources">${resourceList}</span>
  `;
  return li;
}

function renderPairEntry(entry) {
  const li = document.createElement('li');
  const resources = entry.resources.map(titleCase).join(', ');
  const description = entry.vertices
    .map(
      (vertex) =>
        `Corner ${vertex.vertex + 1} (tiles ${vertex.tiles.join(', ')}, score ${vertex.score})`
    )
    .join(' &amp; ');
  li.innerHTML = `
    <span class="score">Pair score ${entry.score}</span>
    <span class="meta">${description}</span>
    <span class="resources">Combined resources: ${resources}</span>
  `;
  return li;
}

async function analyzeBoard() {
  try {
    clearMessages();
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
    });

    topPairsList.innerHTML = '';
    pairs.forEach((entry) => {
      const item = renderPairEntry(entry);
      topPairsList.appendChild(item);
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

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !editorOverlay.classList.contains('hidden')) {
      closeEditor();
    }
  });
}

layoutBoard();
resetCounts();
bindEvents();

