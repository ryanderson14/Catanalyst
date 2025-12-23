import math
import random
from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, List, Tuple

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

RESOURCE_LIMITS = {
    "brick": 3,
    "lumber": 4,
    "ore": 3,
    "grain": 4,
    "wool": 4,
    "desert": 1,
}

TOKEN_LIMITS = {
    2: 1,
    3: 2,
    4: 2,
    5: 2,
    6: 2,
    8: 2,
    9: 2,
    10: 2,
    11: 2,
    12: 1,
}

PROBABILITY_WEIGHTS = {
    2: 1,
    3: 2,
    4: 3,
    5: 4,
    6: 6,
    8: 6,
    9: 4,
    10: 3,
    11: 2,
    12: 1,
}

HEX_COORDS: List[Tuple[int, int]] = []
for q in range(-2, 3):
    for r in range(-2, 3):
        s = -q - r
        if max(abs(q), abs(r), abs(s)) <= 2:
            HEX_COORDS.append((q, r))
HEX_COORDS.sort(key=lambda t: (t[1], t[0]))

HEX_ROWS: Dict[int, List[int]] = defaultdict(list)
for idx, (_, r) in enumerate(HEX_COORDS):
    HEX_ROWS[r].append(idx)

HEX_ROW_ORDER = sorted(HEX_ROWS.keys())


@dataclass(frozen=True)
class Vertex:
    index: int
    x: float
    y: float
    tiles: Tuple[int, ...]


VERTICES: List[Vertex] = []
VERTEX_TILES: Dict[int, Tuple[int, ...]] = {}
VERTEX_NEIGHBORS: Dict[int, Tuple[int, ...]] = {}


def axial_to_pixel(q: int, r: int, size: float = 1.0) -> Tuple[float, float]:
    x = size * 1.5 * q
    y = size * math.sqrt(3) * (r + q / 2)
    return x, y


def hex_corner_points(q: int, r: int) -> List[Tuple[float, float]]:
    cx, cy = axial_to_pixel(q, r)
    corners = []
    for i in range(6):
        angle = math.radians(60 * i)
        corners.append((cx + math.cos(angle), cy + math.sin(angle)))
    return corners


def build_vertex_graph() -> None:
    vertex_map: Dict[Tuple[float, float], int] = {}
    temp_tiles: Dict[int, List[int]] = defaultdict(list)
    neighbor_map: Dict[int, set] = defaultdict(set)

    for tile_index, (q, r) in enumerate(HEX_COORDS):
        corners = hex_corner_points(q, r)
        corner_indices: List[int] = []
        for x, y in corners:
            key = (round(x, 5), round(y, 5))
            if key not in vertex_map:
                vertex_map[key] = len(vertex_map)
            corner_indices.append(vertex_map[key])
            temp_tiles[vertex_map[key]].append(tile_index)
        for i in range(6):
            a = corner_indices[i]
            b = corner_indices[(i + 1) % 6]
            if a == b:
                continue
            neighbor_map[a].add(b)
            neighbor_map[b].add(a)

    global VERTICES, VERTEX_TILES, VERTEX_NEIGHBORS
    VERTICES = []
    for key, index in sorted(vertex_map.items(), key=lambda item: item[1]):
        tiles = tuple(sorted(temp_tiles[index]))
        VERTICES.append(Vertex(index=index, x=key[0], y=key[1], tiles=tiles))
    VERTEX_TILES = {vertex.index: vertex.tiles for vertex in VERTICES}
    VERTEX_NEIGHBORS = {
        idx: tuple(sorted(neighbor_map.get(idx, set()))) for idx in range(len(vertex_map))
    }


build_vertex_graph()


def validate_board(tiles: List[Dict]) -> Tuple[bool, List[str]]:
    errors: List[str] = []

    if len(tiles) != len(HEX_COORDS):
        errors.append("Board configuration is incomplete.")
        return False, errors

    resource_counts = defaultdict(int)
    token_counts = defaultdict(int)

    for tile in tiles:
        resource = tile.get("resource")
        token = tile.get("token")
        tile_index = tile.get("id")

        if resource not in RESOURCE_LIMITS:
            errors.append(f"Tile {tile_index + 1} has an unknown resource selection.")
            continue
        resource_counts[resource] += 1

        if resource == "desert":
            if token not in (None, "", 0):
                errors.append(f"Tile {tile_index + 1} is a desert and should not have a number token.")
            continue

        if token is None:
            errors.append(f"Tile {tile_index + 1} is missing a number token.")
            continue

        if token not in TOKEN_LIMITS:
            errors.append(f"Tile {tile_index + 1} has an invalid number token: {token}.")
            continue

        token_counts[token] += 1

    for resource, required in RESOURCE_LIMITS.items():
        if resource_counts[resource] != required:
            errors.append(
                f"Expected {required} {resource} tiles but found {resource_counts[resource]}."
            )

    for token, required in TOKEN_LIMITS.items():
        if token_counts[token] != required:
            errors.append(
                f"Expected token {token} to appear {required} times but found {token_counts[token]}."
            )

    return len(errors) == 0, errors


def evaluate_vertices(tiles: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
    vertex_scores: List[Dict] = []
    tile_lookup = {tile["id"]: tile for tile in tiles}

    for vertex in VERTICES:
        resources = []
        score = 0
        for tile_index in vertex.tiles:
            tile = tile_lookup[tile_index]
            resource = tile["resource"]
            token = tile.get("token")
            if resource == "desert" or token is None:
                continue
            resources.append(resource)
            score += PROBABILITY_WEIGHTS.get(token, 0)
        if score == 0:
            continue
        vertex_scores.append(
            {
                "vertex": vertex.index,
                "score": score,
                "resources": sorted(set(resources)),
                "tiles": [index + 1 for index in vertex.tiles],
            }
        )

    vertex_scores.sort(key=lambda item: item["score"], reverse=True)

    top_vertices = vertex_scores[:5]
    vertex_lookup = {item["vertex"]: item for item in vertex_scores}

    pairs: List[Dict] = []
    for i in range(len(vertex_scores)):
        for j in range(i + 1, len(vertex_scores)):
            a = vertex_scores[i]["vertex"]
            b = vertex_scores[j]["vertex"]
            if b in VERTEX_NEIGHBORS.get(a, ()):  # distance rule
                continue
            combined_resources = sorted(
                set(vertex_scores[i]["resources"]) | set(vertex_scores[j]["resources"])
            )
            combined_score = vertex_scores[i]["score"] + vertex_scores[j]["score"]
            diversity_bonus = 0.3 * len(combined_resources)
            total_score = combined_score + diversity_bonus
            pairs.append(
                {
                    "vertices": [
                        {
                            "vertex": a,
                            "score": vertex_lookup[a]["score"],
                            "resources": vertex_lookup[a]["resources"],
                            "tiles": vertex_lookup[a]["tiles"],
                        },
                        {
                            "vertex": b,
                            "score": vertex_lookup[b]["score"],
                            "resources": vertex_lookup[b]["resources"],
                            "tiles": vertex_lookup[b]["tiles"],
                        },
                    ],
                    "score": round(total_score, 2),
                    "base_score": combined_score,
                    "resources": combined_resources,
                    "coverage": sorted({tile for tile in vertex_lookup[a]["tiles"] + vertex_lookup[b]["tiles"]}),
                }
            )
    pairs.sort(key=lambda item: item["score"], reverse=True)
    top_pairs = pairs[:5]

    return top_vertices, top_pairs


def generate_random_board() -> List[Dict]:
    resource_pool: List[str] = []
    for resource, count in RESOURCE_LIMITS.items():
        resource_pool.extend([resource] * count)

    token_pool: List[int] = []
    for token, count in TOKEN_LIMITS.items():
        token_pool.extend([token] * count)

    random.shuffle(resource_pool)
    random.shuffle(token_pool)

    tiles: List[Dict] = []
    token_index = 0
    for idx, resource in enumerate(resource_pool):
        token = None
        if resource != "desert":
            token = token_pool[token_index]
            token_index += 1
        tiles.append({"id": idx, "resource": resource, "token": token})

    return tiles


@app.route("/")
def index():
    tiles = [
        {"id": idx, "display": idx + 1, "q": coord[0], "r": coord[1]}
        for idx, coord in enumerate(HEX_COORDS)
    ]
    vertices = [
        {
            "id": vertex.index,
            "x": vertex.x,
            "y": vertex.y,
            "tiles": [tile + 1 for tile in vertex.tiles],
        }
        for vertex in VERTICES
    ]
    return render_template(
        "index.html",
        tiles=tiles,
        resource_limits=RESOURCE_LIMITS,
        token_limits=TOKEN_LIMITS,
        tile_count=len(HEX_COORDS),
        vertices=vertices,
    )


@app.get("/random-board")
def random_board():
    tiles = generate_random_board()
    return jsonify({"tiles": tiles})


@app.post("/analyze")
def analyze():
    payload = request.get_json(silent=True) or {}
    tiles = payload.get("tiles", [])

    is_valid, errors = validate_board(tiles)
    if not is_valid:
        return jsonify({"ok": False, "errors": errors}), 400

    top_vertices, top_pairs = evaluate_vertices(tiles)

    return jsonify(
        {
            "ok": True,
            "vertices": top_vertices,
            "pairs": top_pairs,
        }
    )


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
