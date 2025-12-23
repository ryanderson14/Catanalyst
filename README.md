# Catanalyst

Catanalyst is a Flask web application that helps Settlers of Catan players design a valid game board and analyze the best starting settlements.

## Features

- Interactive hex-board editor with polished visuals.
- Enforces the official distribution of resources and number tokens.
- Provides real-time counters for remaining resources and tokens.
- Runs a probability-driven heuristic to rank the strongest intersections.
- Suggests high-value opening settlement pairs while respecting distance rules.

## Getting started

### Prerequisites

- Python 3.10+

### Installation

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Running the app

```bash
flask --app app run --debug
```

Then open <http://localhost:5000> in your browser.

## Project structure

- `app.py` &mdash; Flask entry point plus the settlement analysis engine.
- `templates/index.html` &mdash; Main page with the interactive board layout.
- `static/css/styles.css` &mdash; Styling for the application.
- `static/js/app.js` &mdash; Front-end logic for editing the board and displaying results.

## License

This project is provided as-is under the MIT license.
