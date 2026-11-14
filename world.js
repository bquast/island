// island world: the shape of the land. No graphics in this file.
// Classic script. Units are meters. Sea level is 0.
//
// Order of this file:
//   constants, math, height formula, height grid, outposts, roads, open sea.

// ---------- constants ----------

var SIZE = 8000;         // side of the terrain square
var GRID = 1000;         // cells on each side (8 m cells)
var CELL = SIZE / GRID;
var VOLC_X = 450;        // volcano center
var VOLC_Z = -550;
var VOLC_R = 800;        // radius of the volcano base
var VOLC_H = 600;        // height of the cone before the crater cut
var CRATER_R = 100;
var CRATER_DEPTH = 80;
var LAGOON_X = -150;     // the bay at the start camp
var LAGOON_Z = 1150;
var JETTY_LEN = 30;
var JETTY_Y = 0.7;
// islands: x, z, radius, height of the base. The first island is the main island.
var ISLANDS = [
	[0, 0, 1500, 56], [2600, -2100, 800, 40], [-2700, 1900, 750, 38], [2800, 1500, 600, 32],
	[-2600, -2300, 560, 30], [300, 3100, 420, 24], [-1100, -3200, 380, 22], [1500, -3300, 300, 18],
	[-3300, -200, 340, 22], [3400, -300, 300, 18], [1400, 3000, 260, 16], [-1500, 3200, 240, 16],
	[3300, 3200, 280, 18], [-3400, 3300, 220, 14]
];
var OUTPOSTS_ON = [6, 2, 2, 1, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0];   // number of enemy outposts on each island

// ---------- math ----------


function clamp(v, lo, hi) {
	return Math.max(lo, Math.min(hi, v));
}

function smooth(t) {
	return t * t * (3 - 2 * t);
}

function hash(x, z) {
	var s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
	return s - Math.floor(s);
}

function noise(x, z) {
	var xi = Math.floor(x), zi = Math.floor(z);
	var u = smooth(x - xi), v = smooth(z - zi);
	var a = hash(xi, zi), b = hash(xi + 1, zi);
	var c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
	return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, z) {
	return noise(x, z) * 0.5 + noise(x * 2, z * 2) * 0.25 + noise(x * 4, z * 4) * 0.125 + noise(x * 8, z * 8) * 0.0625;
}

// a round hill with center (cx, cz). The result is 1 at the center.
function bump(x, z, cx, cz, r) {
	var dx = x - cx, dz = z - cz;
	return Math.exp(-(dx * dx + dz * dz) / (r * r));
}

// seeded random numbers, so the island is the same on each load
function makeRandom(seed) {
	var s = seed;
	return function () {
		s = (s + 0x6D2B79F5) | 0;
		var t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// ---------- height formula ----------

// height from the formula. Used one time, to fill the grid.
function height(x, z) {
	// far from all islands: deep sea. No more calculation is necessary (this makes the load fast).
	var near = false;
	for (var e = 0; e < ISLANDS.length; e++) {
		var ex = x - ISLANDS[e][0], ez = z - ISLANDS[e][1], er = ISLANDS[e][2] * 1.62;
		near = near || ex * ex + ez * ez < er * er;
	}
	if (!near) {
		return -8.4;
	}
	var n = fbm(x * 0.0018 + 5, z * 0.0018 + 5);      // shape of the coast
	var c = fbm(x * 0.006 + 11, z * 0.006 + 3);       // bays and capes
	var k = fbm(x * 0.0035 + 70, z * 0.0035 + 20);    // hills and valleys
	var m = fbm(x * 0.02 + 40, z * 0.02 + 40);        // rough ground
	var h = -14;
	for (var i = 0; i < ISLANDS.length; i++) {
		var s = ISLANDS[i];
		var dx0 = x - s[0], dz0 = z - s[1];
		h = Math.max(h, (1 - Math.sqrt(dx0 * dx0 + dz0 * dz0) / (s[2] * (0.42 + 0.8 * n + 0.38 * c))) * s[3]);
	}
	var inland = clamp(h / 20, 0, 1);
	h += inland * inland * (k - 0.38) * 230;
	h += 260 * bump(x, z, -850, 100, 420) * (0.4 + m);    // west mountains of the main island
	h += 200 * bump(x, z, 2650, -2150, 320) * (0.4 + m);  // mountain on the north-east island
	h += 150 * bump(x, z, -2750, 1850, 300) * (0.4 + m);  // mountain on the south-west island
	h -= 30 * bump(x, z, LAGOON_X, LAGOON_Z, 150);        // lagoon
	for (var q = 1; q <= 6; q++) {                        // channel from the lagoon to the sea
		h -= 24 * bump(x, z, LAGOON_X + q * 12, LAGOON_Z + q * 85, 62);
	}
	h = h > 0 ? h * h / (h + 4) : h * 0.6;                // flat beaches, shallow shelf
	h += (m - 0.5) * 9 * clamp(h / 5, 0, 1);              // rough ground on land

	var dx = x - VOLC_X, dz = z - VOLC_Z;
	var d = Math.sqrt(dx * dx + dz * dz);
	var cone = Math.max(0, 1 - Math.max(d, CRATER_R) / VOLC_R);
	h += Math.pow(cone, 1.7) * VOLC_H * (0.85 + 0.3 * m);
	h += cone * (1 - cone) * 46 * Math.sin(Math.atan2(dz, dx) * 21 + m * 8);  // gullies
	if (d < CRATER_R) {
		h -= smooth(1 - d / CRATER_R) * CRATER_DEPTH;
	}
	return h;
}

// ---------- height grid ----------

// the height grid. All other code reads the ground from this grid.
var H = new Float32Array((GRID + 1) * (GRID + 1));
var ROAD = new Float32Array((GRID + 1) * (GRID + 1));   // 1 on a road, 0 off a road

function fillHeights() {
	for (var iz = 0; iz <= GRID; iz++) {
		for (var ix = 0; ix <= GRID; ix++) {
			H[iz * (GRID + 1) + ix] = height(ix * CELL - SIZE / 2, iz * CELL - SIZE / 2);
		}
	}
}

// height of the terrain mesh at (x, z). Same triangles as the mesh.
function ground(x, z) {
	var fx = clamp((x + SIZE / 2) / CELL, 0, GRID - 0.001);
	var fz = clamp((z + SIZE / 2) / CELL, 0, GRID - 0.001);
	var ix = Math.floor(fx), iz = Math.floor(fz);
	fx -= ix;
	fz -= iz;
	var i = iz * (GRID + 1) + ix;
	var a = H[i], d = H[i + 1], b = H[i + GRID + 1], c = H[i + GRID + 2];
	if (fx + fz < 1) {
		return a + (d - a) * fx + (b - a) * fz;
	}
	return c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
}

function slopeX(x, z) {
	return (ground(x + 2.5, z) - ground(x - 2.5, z)) / 5;
}

function slopeZ(x, z) {
	return (ground(x, z + 2.5) - ground(x, z - 2.5)) / 5;
}

function slopeAt(x, z) {
	var gx = slopeX(x, z), gz = slopeZ(x, z);
	return Math.sqrt(gx * gx + gz * gz);
}

// road value at (x, z), from the nearest grid point
function roadAt(x, z) {
	var ix = clamp(Math.round((x + SIZE / 2) / CELL), 0, GRID);
	var iz = clamp(Math.round((z + SIZE / 2) / CELL), 0, GRID);
	return ROAD[iz * (GRID + 1) + ix];
}

// change the grid in a circle: f(index, weight). The weight is 1 in the inner radius and 0 at the outer radius.
function stamp(x, z, inner, outer, f) {
	var x0 = Math.max(0, Math.floor((x - outer + SIZE / 2) / CELL)), x1 = Math.min(GRID, Math.ceil((x + outer + SIZE / 2) / CELL));
	var z0 = Math.max(0, Math.floor((z - outer + SIZE / 2) / CELL)), z1 = Math.min(GRID, Math.ceil((z + outer + SIZE / 2) / CELL));
	for (var iz = z0; iz <= z1; iz++) {
		for (var ix = x0; ix <= x1; ix++) {
			var dx = ix * CELL - SIZE / 2 - x, dz = iz * CELL - SIZE / 2 - z;
			var w = smooth(clamp((outer - Math.sqrt(dx * dx + dz * dz)) / (outer - inner), 0, 1));
			if (w > 0) {
				f(iz * (GRID + 1) + ix, w);
			}
		}
	}
}

// ---------- outposts and roads ----------

function nearestIsland(x, z) {
	var best = 0, bestD = 1e9;
	for (var i = 0; i < ISLANDS.length; i++) {
		var d = Math.sqrt((x - ISLANDS[i][0]) * (x - ISLANDS[i][0]) + (z - ISLANDS[i][1]) * (z - ISLANDS[i][1])) / ISLANDS[i][2];
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	}
	return best;
}

// find flat locations on land for the enemy outposts. They are far from each other and from the camp.
// OUTPOSTS_ON gives the number for each island.
function findOutposts(campX, campZ) {
	var rand = makeRandom(31);
	var out = [];
	var count = ISLANDS.map(function () { return 0; });
	for (var tries = 0; tries < 80000; tries++) {
		var x = (rand() - 0.5) * SIZE * 0.9, z = (rand() - 0.5) * SIZE * 0.9;
		var k = nearestIsland(x, z);
		if (count[k] >= OUTPOSTS_ON[k]) {
			continue;
		}
		var h = ground(x, z);
		var rough = Math.abs(ground(x + 30, z) - h) + Math.abs(ground(x - 30, z) - h) + Math.abs(ground(x, z + 30) - h) + Math.abs(ground(x, z - 30) - h);
		var far = (x - campX) * (x - campX) + (z - campZ) * (z - campZ) > 600 * 600;
		for (var i = 0; i < out.length; i++) {
			far = far && (x - out[i].x) * (x - out[i].x) + (z - out[i].z) * (z - out[i].z) > 650 * 650;
		}
		if (h > 5 && h < 70 && rough < 9 && far) {
			out.push({ x: x, z: z, y: h, alive: 0, free: false, flag: null });
			count[k]++;
		}
	}
	return out;
}

// make the ground flat in a circle
function flatten(x, z, radius) {
	var h = ground(x, z);
	stamp(x, z, radius * 0.6, radius, function (i, w) {
		H[i] += (h - H[i]) * w;
	});
}

// find a way on land from a to b, on a coarse grid (40 m). The cost is high on steep ground.
// Returns a list of points, or null when there is no way (for example to a different island).
function findWay(a, b) {
	var step = 40, n = SIZE / step + 1;
	function cellOf(p) {
		return Math.round((p.z + SIZE / 2) / step) * n + Math.round((p.x + SIZE / 2) / step);
	}
	function px(c) { return (c % n) * step - SIZE / 2; }
	function pz(c) { return Math.floor(c / n) * step - SIZE / 2; }
	var start = cellOf(a), goal = cellOf(b);
	var cost = new Float32Array(n * n).fill(1e9), from = new Int32Array(n * n).fill(-1), done = new Uint8Array(n * n);
	var open = [start];
	cost[start] = 0;
	while (open.length > 0) {
		// take the open cell with the lowest cost + distance to the goal
		var best = 0, bestF = 1e9;
		for (var k = 0; k < open.length; k++) {
			var c = open[k];
			var f = cost[c] + Math.sqrt((px(c) - px(goal)) * (px(c) - px(goal)) + (pz(c) - pz(goal)) * (pz(c) - pz(goal)));
			if (f < bestF) {
				bestF = f;
				best = k;
			}
		}
		var cur = open[best];
		open[best] = open[open.length - 1];
		open.pop();
		if (cur === goal) {
			break;
		}
		done[cur] = 1;
		for (var dz = -1; dz <= 1; dz++) {
			for (var dx = -1; dx <= 1; dx++) {
				var x = px(cur) + dx * step, z = pz(cur) + dz * step;
				var next = cur + dz * n + dx;
				if ((dx === 0 && dz === 0) || Math.abs(x) > SIZE / 2 - step || Math.abs(z) > SIZE / 2 - step || done[next]) {
					continue;
				}
				var h0 = ground(px(cur), pz(cur)), h1 = ground(x, z);
				var len = step * Math.sqrt(dx * dx + dz * dz);
				var grade = (h1 - h0) / len;
				if (h1 < 1.5 || Math.abs(grade) > 0.45) {
					continue;
				}
				var c1 = cost[cur] + len * (1 + 90 * grade * grade);
				if (c1 < cost[next]) {
					if (cost[next] > 9e8) {
						open.push(next);
					}
					cost[next] = c1;
					from[next] = cur;
				}
			}
		}
	}
	if (from[goal] < 0) {
		return null;
	}
	var way = [];
	for (var p = goal; p >= 0; p = from[p]) {
		way.push({ x: px(p), z: pz(p) });
	}
	way[0] = { x: b.x, z: b.z };
	way[way.length - 1] = { x: a.x, z: a.z };
	return way;
}

// make the corners of a way round: each segment gives 2 points, at 1/4 and 3/4
function roundWay(way) {
	var out = [way[0]];
	for (var i = 0; i < way.length - 1; i++) {
		var a = way[i], b = way[i + 1];
		out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
		out.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
	}
	out.push(way[way.length - 1]);
	return out;
}

// put a road on the grid: mark it, and make the ground level across the road
function stampRoad(way) {
	for (var i = 0; i < way.length - 1; i++) {
		var a = way[i], b = way[i + 1];
		var len = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z));
		var ha = ground(a.x, a.z), hb = ground(b.x, b.z);
		for (var t = 0; t < len; t += 3) {
			var k = t / len;
			var h = ha + (hb - ha) * k;
			stamp(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k, 4, 13, function (j, w) {
				ROAD[j] = Math.max(ROAD[j], w);
				H[j] += (h - H[j]) * w * 0.8;
			});
		}
	}
}

// roads: each place gets a road to the nearest earlier place on the same island. The first place is the camp.
function makeRoads(places) {
	var roads = [];
	for (var i = 1; i < places.length; i++) {
		var b = places[i];
		var best = null, bestD = 1e9;
		for (var j = 0; j < i; j++) {
			var a = places[j];
			var d = Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z));
			if (nearestIsland(a.x, a.z) === nearestIsland(b.x, b.z) && d < bestD) {
				bestD = d;
				best = a;
			}
		}
		var way = best ? findWay(best, b) : null;
		if (way) {
			roads.push(roundWay(roundWay(way)));
		}
	}
	for (var r = 0; r < roads.length; r++) {
		stampRoad(roads[r]);
	}
	return roads;
}

// ---------- open sea ----------

// SEA is a coarse grid (40 m). A cell is 1 when a boat can go from there to the edge of the map.
// Lakes on the islands are not open sea.
var SEA_STEP = 40;
var SEA_N = SIZE / SEA_STEP + 1;
var SEA = new Uint8Array(SEA_N * SEA_N);

function fillSea() {
	var todo = [0];
	SEA[0] = 1;
	while (todo.length > 0) {
		var c = todo.pop();
		var cx = c % SEA_N, cz = Math.floor(c / SEA_N);
		var next = [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]];
		for (var i = 0; i < 4; i++) {
			var x = next[i][0], z = next[i][1];
			if (x < 0 || z < 0 || x >= SEA_N || z >= SEA_N || SEA[z * SEA_N + x]) {
				continue;
			}
			if (ground(x * SEA_STEP - SIZE / 2, z * SEA_STEP - SIZE / 2) < -1.5) {
				SEA[z * SEA_N + x] = 1;
				todo.push(z * SEA_N + x);
			}
		}
	}
}

// the nearest point of the open sea, for a boat
function findShore(x, z) {
	var best = { x: x, z: z }, bestD = 1e9;
	for (var cz = 0; cz < SEA_N; cz++) {
		for (var cx = 0; cx < SEA_N; cx++) {
			var sx = cx * SEA_STEP - SIZE / 2, sz = cz * SEA_STEP - SIZE / 2;
			var d = (sx - x) * (sx - x) + (sz - z) * (sz - z);
			if (SEA[cz * SEA_N + cx] && d < bestD) {
				bestD = d;
				best = { x: sx, z: sz };
			}
		}
	}
	return best;
}
