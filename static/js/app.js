const config = window.CATAN_CONFIG || {};
const resourceLimits = config.resourceLimits || {};
const tokenLimits = Object.fromEntries(
  Object.entries(config.tokenLimits || {}).map(([key, value]) => [Number(key), value])
);

const tileButtons = Array.from(document.querySelectorAll('.hex-tile'));
const resourceSelect = document.getElementById('resource-select');
const tokenSelect = document.getElementById('token-select');
const applyButton = document.getElementById('apply-selection');
const clearButton = document.getElementById('clear-selection');
const analyzeButton = document.getElementById('analyze-button');
const resourceCountItems = Array.from(
  document.querySelectorAll('#resource-counts li')
).reduce((acc, li) => {
  acc[li.dataset.resource] = li;
  return acc;
}, {});
const tokenCountItems = Array.from(document.querySelectorAll('#token-counts li')).reduce(
  (acc, li) => {
    acc[Number(li.dataset.token)] = li;
    return acc;
  },
  {}
);

const resourceCounts = Object.fromEntries(
  Object.keys(resourceLimits).map((resource) => [resource, 0])
);
const tokenCounts = Object.fromEntries(Object.keys(tokenLimits).map((token) => [Number(token), 0]));

const tiles = [];
tileButtons.forEach((button) => {
  const id = Number(button.dataset.tile);
  tiles[id] = {
    id,
    resource: null,
    token: null,
    element: button,
  };
});

let selectedTileId = null;

const messagesPanel = document.getElementById('message-panel');
const messagesList = document.getElementById('messages');
const resultsEmpty = document.getElementById('results-empty');
const resultsGrid = document.getElementById('results-grid');
const topVerticesList = document.getElementById('top-vertices');
const topPairsList = document.getElementById('top-pairs');

function titleCase(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function clearMessages() {
  messagesList.innerHTML = '';
  messagesPanel.hidden = true;
}

function showMessages(messages) {
  messagesList.innerHTML = '';
  if (!messages || !messages.length) {
    messagesPanel.hidden = true;
    return;
  }
  messages.forEach((message) => {
    const li = document.createElement('li');
    li.textContent = message;
    messagesList.appendChild(li);
  });
  messagesPanel.hidden = false;
}

function recomputeCounts() {
  Object.keys(resourceCounts).forEach((key) => {
    resourceCounts[key] = 0;
  });
  Object.keys(tokenCounts).forEach((key) => {
    tokenCounts[key] = 0;
  });

  tiles.forEach((tile) => {
    if (!tile || !tile.resource) return;
    resourceCounts[tile.resource] += 1;
    if (tile.resource !== 'desert' && tile.token !== null) {
      tokenCounts[tile.token] += 1;
    }
  });

  Object.entries(resourceCounts).forEach(([resource, count]) => {
    const limit = resourceLimits[resource] || 0;
    const item = resourceCountItems[resource];
    if (!item) return;
    const value = item.querySelector('.value');
    if (value) {
      value.textContent = `${count} / ${limit}`;
    }
    item.classList.toggle('complete', count === limit);
  });

  Object.entries(tokenCounts).forEach(([token, count]) => {
    const limit = tokenLimits[token] || 0;
    const item = tokenCountItems[token];
    if (!item) return;
    const value = item.querySelector('.value');
    if (value) {
      value.textContent = `${count} / ${limit}`;
    }
    item.classList.toggle('complete', count === limit);
  });
}

function updateOptionState(currentResource, currentToken) {
  Array.from(resourceSelect.options).forEach((option) => {
    if (option.dataset.placeholder !== undefined) {
      option.disabled = false;
      return;
    }
    const resource = option.value;
    const limit = resourceLimits[resource];
    if (typeof limit === 'number' && limit >= 0) {
      option.disabled = resourceCounts[resource] >= limit && resource !== currentResource;
    }
  });

  if (currentResource === 'desert') {
    tokenSelect.value = '';
    tokenSelect.disabled = true;
    return;
  }

  tokenSelect.disabled = false;
  Array.from(tokenSelect.options).forEach((option) => {
    if (option.dataset.placeholder !== undefined) {
      option.disabled = false;
      return;
    }
    const token = Number(option.value);
    const limit = tokenLimits[token];
    if (typeof limit === 'number') {
      option.disabled = tokenCounts[token] >= limit && token !== currentToken;
    }
  });
}

function updateTileDisplay(tile) {
  const { element, resource, token } = tile;
  const resourceLabel = element.querySelector('[data-role="resource"]');
  const tokenLabel = element.querySelector('[data-role="token"]');

  if (!resource) {
    delete element.dataset.resource;
    resourceLabel.textContent = 'Choose';
    tokenLabel.innerHTML = '&nbsp;';
    return;
  }

  element.dataset.resource = resource;
  resourceLabel.textContent = resource === 'desert' ? 'Desert' : titleCase(resource);

  if (resource === 'desert') {
    tokenLabel.textContent = '';
  } else if (token !== null) {
    tokenLabel.textContent = token;
  } else {
    tokenLabel.innerHTML = '&nbsp;';
  }
}

function selectTile(button) {
  tileButtons.forEach((btn) => btn.classList.remove('active'));
  button.classList.add('active');
  selectedTileId = Number(button.dataset.tile);
  const tile = tiles[selectedTileId];

  if (!tile) return;

  resourceSelect.value = tile.resource ?? '';
  tokenSelect.value = tile.token !== null ? String(tile.token) : '';
  updateOptionState(tile.resource, tile.token);
}

function applySelection() {
  if (selectedTileId === null) {
    showMessages(['Select a tile on the board before applying changes.']);
    return;
  }

  const chosenResource = resourceSelect.value || null;
  if (!chosenResource) {
    showMessages(['Please choose a terrain resource for this tile.']);
    return;
  }

  let chosenToken = null;
  if (chosenResource !== 'desert') {
    const tokenValue = tokenSelect.value;
    if (!tokenValue) {
      showMessages(['Assign a number token for non-desert tiles.']);
      return;
    }
    chosenToken = Number(tokenValue);
  }

  const tile = tiles[selectedTileId];
  tile.resource = chosenResource;
  tile.token = chosenResource === 'desert' ? null : chosenToken;
  updateTileDisplay(tile);
  recomputeCounts();
  updateOptionState(tile.resource, tile.token);
  clearMessages();
}

function clearSelection() {
  if (selectedTileId === null) {
    showMessages(['Select a tile to clear its assignment.']);
    return;
  }
  const tile = tiles[selectedTileId];
  tile.resource = null;
  tile.token = null;
  updateTileDisplay(tile);
  resourceSelect.value = '';
  tokenSelect.value = '';
  tokenSelect.disabled = false;
  recomputeCounts();
  updateOptionState(null, null);
}

function validateLocalBoard() {
  const missingResources = tiles.filter(Boolean).some((tile) => !tile.resource);
  if (missingResources) {
    showMessages(['Assign a resource to every tile before analyzing.']);
    return false;
  }
  const missingTokens = tiles
    .filter(Boolean)
    .some((tile) => tile.resource && tile.resource !== 'desert' && tile.token === null);
  if (missingTokens) {
    showMessages(['Every non-desert tile must have a number token.']);
    return false;
  }
  clearMessages();
  return true;
}

function renderVertices(vertices) {
  topVerticesList.innerHTML = '';
  if (!vertices || !vertices.length) {
    const li = document.createElement('li');
    li.textContent = 'No productive intersections identified with the current layout.';
    topVerticesList.appendChild(li);
    return;
  }

  vertices.forEach((vertex, index) => {
    const li = document.createElement('li');
    const resources = vertex.resources.length ? vertex.resources.map(titleCase).join(', ') : 'None';
    li.innerHTML = `
      <div class="result-title">#${index + 1}: Intersection ${vertex.vertex + 1}</div>
      <div class="result-meta">
        <span class="tag strong">Score ${vertex.score}</span>
        <span class="tag">Touches tiles ${vertex.tiles.join(', ')}</span>
      </div>
      <div class="result-meta">
        <span class="tag">Resources ${resources}</span>
      </div>
    `;
    topVerticesList.appendChild(li);
  });
}

function renderPairs(pairs) {
  topPairsList.innerHTML = '';
  if (!pairs || !pairs.length) {
    const li = document.createElement('li');
    li.textContent = 'No valid settlement pairs found yet. Ensure the board is fully populated.';
    topPairsList.appendChild(li);
    return;
  }

  pairs.forEach((pair, index) => {
    const [first, second] = pair.vertices;
    const firstResources = first.resources.length
      ? first.resources.map(titleCase).join(', ')
      : 'None';
    const secondResources = second.resources.length
      ? second.resources.map(titleCase).join(', ')
      : 'None';
    const combinedResources = pair.resources.length
      ? pair.resources.map(titleCase).join(', ')
      : 'None';
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="result-title">#${index + 1}: Intersections ${first.vertex + 1} & ${second.vertex + 1}</div>
      <div class="result-meta">
        <span class="tag strong">Pair score ${pair.score}</span>
        <span class="tag">Probability ${pair.base_score}</span>
        <span class="tag">Coverage tiles ${pair.coverage.join(', ')}</span>
      </div>
      <div class="result-meta">
        <span class="tag">A: ${firstResources}</span>
        <span class="tag">B: ${secondResources}</span>
      </div>
      <div class="result-meta">
        <span class="tag">Combined: ${combinedResources}</span>
      </div>
    `;
    topPairsList.appendChild(li);
  });
}

function handleAnalyze() {
  if (!validateLocalBoard()) {
    resultsGrid.hidden = true;
    resultsEmpty.hidden = false;
    return;
  }

  const payload = {
    tiles: tiles.filter(Boolean).map((tile) => ({
      id: tile.id,
      resource: tile.resource,
      token: tile.resource === 'desert' ? null : tile.token,
    })),
  };

  analyzeButton.disabled = true;
  analyzeButton.textContent = 'Analyzing…';

  fetch('/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
    .then(async (response) => {
      analyzeButton.disabled = false;
      analyzeButton.textContent = 'Analyze Settlements';

      const data = await response.json().catch(() => null);
      if (!response.ok || !data || !data.ok) {
        const errors = (data && data.errors) || ['Unable to analyze board configuration.'];
        showMessages(errors);
        resultsGrid.hidden = true;
        resultsEmpty.hidden = false;
        return;
      }

      clearMessages();
      renderVertices(data.vertices);
      renderPairs(data.pairs);
      resultsEmpty.hidden = true;
      resultsGrid.hidden = false;
    })
    .catch(() => {
      analyzeButton.disabled = false;
      analyzeButton.textContent = 'Analyze Settlements';
      showMessages(['Network error: unable to reach the analysis service.']);
      resultsGrid.hidden = true;
      resultsEmpty.hidden = false;
    });
}

resourceSelect.addEventListener('change', () => {
  const currentResource = resourceSelect.value || null;
  if (currentResource === 'desert') {
    tokenSelect.value = '';
  }
  const currentToken = tokenSelect.value ? Number(tokenSelect.value) : null;
  updateOptionState(currentResource, currentToken);
});

tokenSelect.addEventListener('change', () => {
  const currentResource = resourceSelect.value || null;
  const currentToken = tokenSelect.value ? Number(tokenSelect.value) : null;
  updateOptionState(currentResource, currentToken);
});

applyButton.addEventListener('click', applySelection);
clearButton.addEventListener('click', clearSelection);
analyzeButton.addEventListener('click', handleAnalyze);

tileButtons.forEach((button) => {
  button.addEventListener('click', () => selectTile(button));
});

recomputeCounts();
updateOptionState(null, null);
