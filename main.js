// island: a volcanic tropical island for Meta Quest 3 (WebXR), three.js r159.
// Classic script. Global THREE. Units are meters.
//
// Order of this file:
//   constants, math, terrain, textures, plants, rocks, shadows, camp,
//   lava, sky and water, clouds and smoke, birds, sound, input, player, main.
// The guns and the enemies are in game.js.

// ---------- constants ----------

var SIZE = 1100;         // side of the terrain square
var GRID = 220;          // cells on each side (5 m cells)
var CELL = SIZE / GRID;
var ISLAND_R = 330;      // approximate radius of the island
var VOLC_X = 60;         // volcano center
var VOLC_Z = -90;
var VOLC_R = 190;        // radius of the volcano base
var VOLC_H = 150;        // height of the cone before the crater cut
var CRATER_R = 28;
var CRATER_DEPTH = 26;
var LAGOON_X = -20;
var LAGOON_Z = 215;
var JETTY_LEN = 30;
var JETTY_Y = 0.7;
var EYE_H = 1.7;         // desktop eye height
var WALK_SPEED = 6;      // m/s
var SNAP_ANGLE = Math.PI / 6;
var SUN_ELEVATION = 27;  // degrees
var SUN_AZIMUTH = -112;  // degrees
var GRASS_N = 60;        // grass cells on each side of the square around the player
var GRASS_CELL = 0.9;    // one grass tuft for each cell
var FOG_COLOR = 0xd2d8dc; // same as the sky at the horizon

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

// color as [r, g, b] in linear space, from a hex value
function rgb(hex) {
	var c = new THREE.Color(hex);
	return [c.r, c.g, c.b];
}

function mix3(a, b, t) {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// ---------- terrain ----------

// height from the formula. Sea level is 0. Used one time, to fill the grid.
function height(x, z) {
	var n = fbm(x * 0.005 + 5, z * 0.005 + 5);
	var m = fbm(x * 0.02 + 40, z * 0.02 + 40);
	var r = Math.sqrt(x * x + z * z);
	var h = Math.max((1 - r / (ISLAND_R * (0.55 + 0.9 * n))) * 30, -14);
	h += 60 * bump(x, z, -170, 20, 90) * (0.5 + m);       // west ridge
	h += 34 * bump(x, z, 170, 130, 70) * (0.5 + m);       // east hill
	h -= 20 * bump(x, z, LAGOON_X, LAGOON_Z, 75);         // lagoon
	h += 24 * bump(x, z, 300, 330, 45);                   // small island
	h += 20 * bump(x, z, -380, -220, 40);                 // small island
	h = h > 0 ? h * h / (h + 5) : h * 0.6;                // flat beaches, shallow shelf
	h += (m - 0.5) * 9 * clamp(h / 5, 0, 1);              // rough ground on land

	var dx = x - VOLC_X, dz = z - VOLC_Z;
	var d = Math.sqrt(dx * dx + dz * dz);
	var cone = Math.max(0, 1 - Math.max(d, CRATER_R) / VOLC_R);
	h += Math.pow(cone, 1.7) * VOLC_H * (0.85 + 0.3 * m);
	h += cone * (1 - cone) * 14 * Math.sin(Math.atan2(dz, dx) * 13 + m * 8);  // gullies
	if (d < CRATER_R) {
		h -= smooth(1 - d / CRATER_R) * CRATER_DEPTH;
	}
	return h;
}

// the height grid. All other code reads the ground from this grid.
var H = new Float32Array((GRID + 1) * (GRID + 1));

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

function groundColor(x, z, h, slope, pal) {
	var n = fbm(x * 0.02, z * 0.02);
	var n2 = fbm(x * 0.08 + 3, z * 0.08 + 7);
	var dx = x - VOLC_X, dz = z - VOLC_Z;
	var nearVolc = clamp(1 - Math.sqrt(dx * dx + dz * dz) / 300, 0, 1);

	var sand = mix3(pal.sand, pal.blackSand, smooth(clamp((nearVolc - 0.2) / 0.25, 0, 1)));
	sand = mix3(sand, mix3(sand, [0, 0, 0], 0.35), clamp(1 - h / 0.7, 0, 1));   // wet sand
	if (h < 0) {
		var shallow = mix3(sand, pal.seaShallow, clamp(-h / 0.8, 0, 1));
		return mix3(shallow, pal.seaDeep, smooth(clamp(-h / 7, 0, 1)));
	}
	var grass = mix3(pal.grassDark, pal.grassLight, clamp(n * 1.6 - 0.2, 0, 1));
	grass = mix3(grass, pal.grassDry, clamp((n2 - 0.5) * 4, 0, 1) * 0.6);
	var c = mix3(sand, grass, smooth(clamp((h - 2.2 - n2 * 1.5) / 1.6, 0, 1)));
	var rock = mix3(pal.rock, pal.rockDark, n2);
	c = mix3(c, rock, smooth(clamp((slope - 0.5) / 0.3, 0, 1)));
	var basalt = mix3(pal.basalt, pal.rust, clamp((n2 - 0.45) * 3, 0, 1) * 0.6);
	c = mix3(c, basalt, smooth(clamp((h - 48 - 30 * n) / 22, 0, 1)));
	return c;
}

function makeTerrain(detailTex) {
	var pal = {
		sand: rgb(0xffe6ac), blackSand: rgb(0x4a4642),
		seaShallow: rgb(0x9ff5e0), seaDeep: rgb(0x04283f),
		grassLight: rgb(0x7fa64a), grassDark: rgb(0x355f2e), grassDry: rgb(0xa9a25a),
		rock: rgb(0x7d7467), rockDark: rgb(0x453e39),
		basalt: rgb(0x6a625c), rust: rgb(0x7a4630)
	};
	var geo = new THREE.PlaneGeometry(SIZE, SIZE, GRID, GRID);
	geo.rotateX(-Math.PI / 2);
	var pos = geo.attributes.position;
	var colors = new Float32Array(pos.count * 3);
	for (var iz = 0; iz <= GRID; iz++) {
		for (var ix = 0; ix <= GRID; ix++) {
			var i = iz * (GRID + 1) + ix;
			var x0 = Math.max(ix - 1, 0), x1 = Math.min(ix + 1, GRID);
			var z0 = Math.max(iz - 1, 0), z1 = Math.min(iz + 1, GRID);
			var gx = (H[iz * (GRID + 1) + x1] - H[iz * (GRID + 1) + x0]) / ((x1 - x0) * CELL);
			var gz = (H[z1 * (GRID + 1) + ix] - H[z0 * (GRID + 1) + ix]) / ((z1 - z0) * CELL);
			var c = groundColor(pos.getX(i), pos.getZ(i), H[i], Math.sqrt(gx * gx + gz * gz), pal);
			pos.setY(i, H[i]);
			colors[i * 3] = c[0];
			colors[i * 3 + 1] = c[1];
			colors[i * 3 + 2] = c[2];
		}
	}
	geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	geo.computeVertexNormals();
	return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTex }));
}

// a flat floor below the sea, for the area out of the terrain square
function makeSeaFloor() {
	var geo = new THREE.PlaneGeometry(12000, 12000);
	geo.rotateX(-Math.PI / 2);
	var mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x04283f }));
	mesh.position.y = -9;
	return mesh;
}

// ---------- textures (all drawn on a canvas, no image files) ----------

function canvasTexture(w, h, draw) {
	var canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	draw(canvas.getContext('2d'), w, h);
	var tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

// light gray grain. It is multiplied with the terrain colors.
function makeDetailTexture(renderer) {
	var tex = canvasTexture(256, 256, function (ctx, w, h) {
		var rand = makeRandom(5);
		var img = ctx.createImageData(w, h);
		for (var i = 0; i < w * h; i++) {
			var v = 205 + rand() * 50;
			img.data[i * 4] = v;
			img.data[i * 4 + 1] = v;
			img.data[i * 4 + 2] = v;
			img.data[i * 4 + 3] = 255;
		}
		ctx.putImageData(img, 0, 0);
		for (var k = 0; k < 70; k++) {
			ctx.fillStyle = rand() < 0.5 ? 'rgba(120,110,90,0.06)' : 'rgba(255,255,255,0.08)';
			ctx.beginPath();
			ctx.arc(rand() * w, rand() * h, 4 + rand() * 14, 0, Math.PI * 2);
			ctx.fill();
		}
	});
	tex.wrapS = THREE.RepeatWrapping;
	tex.wrapT = THREE.RepeatWrapping;
	tex.repeat.set(280, 280);
	tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
	return tex;
}

// one palm frond: a center rib with many thin leaves
function makeFrondTexture() {
	return canvasTexture(256, 64, function (ctx, w, h) {
		var rand = makeRandom(21);
		ctx.lineCap = 'round';
		for (var i = 0; i < 50; i++) {
			var t = i / 49;
			var x = 4 + t * 236;
			var len = 29 * Math.pow(Math.sin(Math.PI * (0.08 + 0.92 * t)), 0.6);
			ctx.strokeStyle = 'hsl(' + (88 + rand() * 30) + ',62%,' + (24 + rand() * 16) + '%)';
			ctx.lineWidth = 3.4;
			ctx.beginPath();
			ctx.moveTo(x, h / 2);
			ctx.lineTo(x + 12, h / 2 - len);
			ctx.moveTo(x, h / 2);
			ctx.lineTo(x + 12, h / 2 + len);
			ctx.stroke();
		}
		ctx.strokeStyle = '#6f7a2c';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(0, h / 2);
		ctx.lineTo(w - 8, h / 2);
		ctx.stroke();
	});
}

// a round group of small leaves, for tree crowns and bushes
function makeLeavesTexture() {
	return canvasTexture(128, 128, function (ctx) {
		var rand = makeRandom(33);
		for (var i = 0; i < 90; i++) {
			var a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 52;
			ctx.fillStyle = 'hsl(' + (80 + rand() * 40) + ',48%,' + (20 + rand() * 24) + '%)';
			ctx.beginPath();
			ctx.ellipse(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 13, 6, rand() * Math.PI, 0, Math.PI * 2);
			ctx.fill();
		}
	});
}

function makeGrassTexture() {
	return canvasTexture(128, 128, function (ctx, w, h) {
		var rand = makeRandom(44);
		ctx.lineCap = 'round';
		for (var i = 0; i < 34; i++) {
			var x = 10 + rand() * 108, len = 50 + rand() * 70, lean = (rand() - 0.5) * 50;
			ctx.strokeStyle = 'hsl(' + (70 + rand() * 35) + ',48%,' + (34 + rand() * 20) + '%)';
			ctx.lineWidth = 3 + rand() * 2.5;
			ctx.beginPath();
			ctx.moveTo(x, h);
			ctx.quadraticCurveTo(x, h - len * 0.6, x + lean, h - len);
			ctx.stroke();
		}
	});
}

function makeFlowerTexture() {
	return canvasTexture(128, 128, function (ctx, w, h) {
		var rand = makeRandom(55);
		var colors = ['#ff4fa3', '#ffd23a', '#ffffff', '#ff7b2e', '#c86bff'];
		for (var i = 0; i < 6; i++) {
			var x = 14 + i * 20, top = 22 + rand() * 50;
			ctx.strokeStyle = '#3f7a2a';
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.moveTo(x, h);
			ctx.lineTo(x + (rand() - 0.5) * 10, top);
			ctx.stroke();
			ctx.fillStyle = colors[i % colors.length];
			for (var p = 0; p < 5; p++) {
				ctx.beginPath();
				ctx.arc(x + Math.cos(p * 1.257) * 6, top + Math.sin(p * 1.257) * 6, 5.5, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.fillStyle = '#7a4a10';
			ctx.beginPath();
			ctx.arc(x, top, 3, 0, Math.PI * 2);
			ctx.fill();
		}
	});
}

// a soft cloud. White at the top, blue-gray at the bottom.
function makePuffTexture(seed) {
	return canvasTexture(256, 128, function (ctx, w, h) {
		var rand = makeRandom(seed);
		for (var i = 0; i < 34; i++) {
			var x = 46 + rand() * 164, y = 46 + rand() * 40, r = 18 + rand() * 26;
			var g = ctx.createRadialGradient(x, y, 0, x, y, r);
			g.addColorStop(0, 'rgba(255,255,255,0.5)');
			g.addColorStop(1, 'rgba(255,255,255,0)');
			ctx.fillStyle = g;
			ctx.fillRect(x - r, y - r, r * 2, r * 2);
		}
		ctx.globalCompositeOperation = 'source-atop';
		var shade = ctx.createLinearGradient(0, 30, 0, 110);
		shade.addColorStop(0, 'rgba(255,255,255,0)');
		shade.addColorStop(1, 'rgba(120,140,170,0.55)');
		ctx.fillStyle = shade;
		ctx.fillRect(0, 0, w, h);
	});
}

// a soft round spot, for the shadows below the trees
function makeBlobTexture() {
	return canvasTexture(64, 64, function (ctx) {
		var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
		g.addColorStop(0, 'rgba(255,255,255,1)');
		g.addColorStop(0.5, 'rgba(255,255,255,0.75)');
		g.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 64, 64);
	});
}

function makeLavaTexture() {
	var tex = canvasTexture(128, 128, function (ctx, w, h) {
		var rand = makeRandom(66);
		ctx.fillStyle = '#ff6a12';
		ctx.fillRect(0, 0, w, h);
		for (var i = 0; i < 46; i++) {
			var hot = i % 2 === 0;
			var x = rand() * w, y = rand() * h, r = hot ? 10 + rand() * 18 : 5 + rand() * 9;
			var g = ctx.createRadialGradient(x, y, 0, x, y, r);
			g.addColorStop(0, hot ? 'rgba(255,225,120,0.85)' : 'rgba(70,18,6,0.85)');
			g.addColorStop(1, hot ? 'rgba(255,225,120,0)' : 'rgba(70,18,6,0)');
			ctx.fillStyle = g;
			// draw 9 copies, so the texture has no seam when it repeats
			for (var k = 0; k < 9; k++) {
				var ox = x + (k % 3 - 1) * w, oy = y + (Math.floor(k / 3) - 1) * h;
				ctx.setTransform(1, 0, 0, 1, ox - x, oy - y);
				ctx.fillRect(x - r, y - r, r * 2, r * 2);
			}
			ctx.setTransform(1, 0, 0, 1, 0, 0);
		}
	});
	tex.wrapS = THREE.RepeatWrapping;
	tex.wrapT = THREE.RepeatWrapping;
	return tex;
}

// ---------- geometry helpers ----------

// a geometry from a list of quads. Each quad is 4 points [x, y, z], counterclockwise.
// normalOf(point) gives the normal for a point.
function quadGeometry(quads, normalOf) {
	var pos = [], nor = [], uv = [], idx = [];
	var corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
	for (var q = 0; q < quads.length; q++) {
		for (var k = 0; k < 4; k++) {
			var p = quads[q][k], n = normalOf(p);
			pos.push(p[0], p[1], p[2]);
			nor.push(n[0], n[1], n[2]);
			uv.push(corners[k][0], corners[k][1]);
		}
		idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
	}
	var geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
	geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
	geo.setIndex(idx);
	return geo;
}

function normalUp() {
	return [0, 1, 0];
}

// material for leaves and grass: a texture with holes, visible from the 2 sides.
// glsl is one line for the vertex shader. It moves the vertices in the wind.
// The back side gets the same light as the front side. If not, half of the leaves are dark.
var wind = { value: 0 };

function leafMaterial(tex, alphaTest, glsl) {
	var mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: alphaTest, side: THREE.DoubleSide });
	mat.onBeforeCompile = function (shader) {
		shader.uniforms.windTime = wind;
		shader.vertexShader = 'uniform float windTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + glsl);
		shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
			THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
	};
	return mat;
}

// ---------- palms ----------

// one frond along +x, length 1. It goes up a small distance, then down.
function frondGeometry() {
	var pos = [], uv = [], idx = [];
	var segs = 5;
	for (var i = 0; i <= segs; i++) {
		var t = i / segs;
		var y = 0.28 * t - 0.72 * t * t;
		pos.push(t, y - 0.05, -0.17, t, y, 0, t, y - 0.05, 0.17);
		uv.push(t, 0, t, 0.5, t, 1);
		if (i < segs) {
			var a = i * 3;
			idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4);
		}
	}
	var geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
	geo.setIndex(idx);
	geo.computeVertexNormals();
	return geo;
}

// a trunk with a bend. Height 1, the top is at x = 1.6.
function palmTrunkGeometry() {
	var geo = new THREE.CylinderGeometry(0.12, 0.21, 1, 7, 6);
	geo.translate(0, 0.5, 0);
	var pos = geo.attributes.position;
	for (var i = 0; i < pos.count; i++) {
		var y = pos.getY(i);
		pos.setX(i, pos.getX(i) + 1.6 * y * y);
	}
	geo.computeVertexNormals();
	return geo;
}

// find locations for plants. accept(x, z, h) gives true for a good location.
function scatter(count, seed, accept) {
	var rand = makeRandom(seed);
	var out = [];
	for (var tries = 0; tries < count * 200 && out.length < count; tries++) {
		var x = (rand() - 0.5) * SIZE * 0.96, z = (rand() - 0.5) * SIZE * 0.96;
		var h = ground(x, z);
		if (accept(x, z, h)) {
			out.push({ x: x, z: z, h: h });
		}
	}
	return out;
}

// palms: returns { mesh, tops }. tops is used for the shadows.
function makePalms(spots, frondTex) {
	var rand = makeRandom(8);
	var perPalm = 11;
	var trunkMat = new THREE.MeshLambertMaterial({ color: 0x9a8468 });
	var frondMat = leafMaterial(frondTex, 0.4, 'transformed.y += sin(windTime * 1.4 + instanceMatrix[3][0] + instanceMatrix[0][0] * 9.0) * 0.045 * uv.x * uv.x;');
	var trunks = new THREE.InstancedMesh(palmTrunkGeometry(), trunkMat, spots.length);
	var fronds = new THREE.InstancedMesh(frondGeometry(), frondMat, spots.length * perPalm);
	var dummy = new THREE.Object3D();
	var top = new THREE.Vector3();
	var tops = [];
	for (var i = 0; i < spots.length; i++) {
		var s = spots[i];
		var tall = 6 + rand() * 6;
		dummy.position.set(s.x, s.h - 0.3, s.z);
		dummy.rotation.set(0, rand() * Math.PI * 2, 0, 'XYZ');
		dummy.scale.set(1, tall, 1);
		dummy.updateMatrix();
		trunks.setMatrixAt(i, dummy.matrix);
		top.set(1.6, 1, 0).applyMatrix4(dummy.matrix);
		tops.push({ x: top.x, z: top.z, tall: tall, r: 3.2 });
		for (var j = 0; j < perPalm; j++) {
			var len = 3.2 + rand() * 1.6;
			dummy.position.copy(top);
			dummy.rotation.set(0, (j / perPalm) * Math.PI * 2 + rand() * 0.5, 0.65 - rand() * 1.1, 'YZX');
			dummy.scale.set(len, len, len);
			dummy.updateMatrix();
			fronds.setMatrixAt(i * perPalm + j, dummy.matrix);
		}
	}
	var group = new THREE.Group();
	group.add(trunks);
	group.add(fronds);
	return { mesh: group, tops: tops };
}

// ---------- jungle trees and bushes ----------

// leaf cards in a ball. The normals point out from the center, for soft light.
function crownGeometry() {
	var rand = makeRandom(13);
	var quads = [];
	for (var i = 0; i < 18; i++) {
		var c = new THREE.Vector3(rand() - 0.5, (rand() - 0.5) * 0.7, rand() - 0.5).multiplyScalar(1.3);
		var a = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
		var b = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).cross(a).normalize();
		a.multiplyScalar(0.75);
		b.multiplyScalar(0.75);
		quads.push([
			[c.x - a.x - b.x, c.y - a.y - b.y, c.z - a.z - b.z],
			[c.x + a.x - b.x, c.y + a.y - b.y, c.z + a.z - b.z],
			[c.x + a.x + b.x, c.y + a.y + b.y, c.z + a.z + b.z],
			[c.x - a.x + b.x, c.y - a.y + b.y, c.z - a.z + b.z]
		]);
	}
	return quadGeometry(quads, function (p) {
		var n = new THREE.Vector3(p[0], p[1] + 0.6, p[2]).normalize();
		return [n.x, n.y, n.z];
	});
}

// trees: a trunk and 2 crowns for each tree. Bushes: 1 small crown on the ground.
function makeJungle(treeSpots, bushSpots, leavesTex) {
	var rand = makeRandom(9);
	var trunkGeo = new THREE.CylinderGeometry(0.16, 0.34, 1, 6);
	trunkGeo.translate(0, 0.5, 0);
	var leafMat = leafMaterial(leavesTex, 0.5, 'transformed.x += sin(windTime * 1.1 + instanceMatrix[3][0] * 0.3 + position.y * 2.0) * 0.035;');
	var trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x6a5642 }), treeSpots.length);
	var crowns = new THREE.InstancedMesh(crownGeometry(), leafMat, treeSpots.length * 2 + bushSpots.length);
	var dummy = new THREE.Object3D();
	var color = new THREE.Color();
	var tops = [];
	var k = 0;
	for (var i = 0; i < treeSpots.length; i++) {
		var s = treeSpots[i];
		var tall = 5 + rand() * 6;
		dummy.position.set(s.x, s.h - 0.3, s.z);
		dummy.rotation.set((rand() - 0.5) * 0.2, 0, (rand() - 0.5) * 0.2, 'XYZ');
		dummy.scale.set(1 + rand() * 0.6, tall, 1 + rand() * 0.6);
		dummy.updateMatrix();
		trunks.setMatrixAt(i, dummy.matrix);
		for (var j = 0; j < 2; j++) {
			var size = 2.4 + rand() * 1.6;
			dummy.position.set(s.x + (rand() - 0.5) * 2.5, s.h + tall + (j - 0.4) * 1.8, s.z + (rand() - 0.5) * 2.5);
			dummy.rotation.set(0, rand() * 6.28, 0, 'XYZ');
			dummy.scale.set(size, size * 0.8, size);
			dummy.updateMatrix();
			crowns.setMatrixAt(k, dummy.matrix);
			crowns.setColorAt(k, color.setHSL(0.25 + rand() * 0.1, 0.3, 0.6 + rand() * 0.3));
			k++;
		}
		tops.push({ x: s.x, z: s.z, tall: tall, r: 4.5 });
	}
	for (var b = 0; b < bushSpots.length; b++) {
		var p = bushSpots[b];
		var bs = 0.6 + rand() * 0.9;
		dummy.position.set(p.x, p.h + bs * 0.45, p.z);
		dummy.rotation.set(0, rand() * 6.28, 0, 'XYZ');
		dummy.scale.set(bs, bs * 0.7, bs);
		dummy.updateMatrix();
		crowns.setMatrixAt(k, dummy.matrix);
		crowns.setColorAt(k, color.setHSL(0.22 + rand() * 0.12, 0.3, 0.55 + rand() * 0.35));
		k++;
	}
	var group = new THREE.Group();
	group.add(trunks);
	group.add(crowns);
	return { mesh: group, tops: tops };
}

// ---------- grass and flowers (they follow the player) ----------

// 2 vertical quads that cross. Width w, height h.
function tuftGeometry(w, h) {
	var a = w / 2;
	return quadGeometry([
		[[-a, 0, 0], [a, 0, 0], [a, h, 0], [-a, h, 0]],
		[[0, 0, a], [0, 0, -a], [0, h, -a], [0, h, a]]
	], normalUp);
}

function makeTufts(tex, w, h) {
	var mat = leafMaterial(tex, 0.5, 'transformed.x += sin(windTime * 1.8 + instanceMatrix[3][0] * 0.6 + instanceMatrix[3][2] * 0.4) * 0.1 * uv.y;');
	var mesh = new THREE.InstancedMesh(tuftGeometry(w, h), mat, GRASS_N * GRASS_N);
	mesh.frustumCulled = false;
	return mesh;
}

// put the tufts on a grid around (px, pz). keep is the part of the cells that get a tuft.
// Each cell always gives the same tuft, thus the grass does not change when you come back.
function placeTufts(mesh, px, pz, keep, salt) {
	var dummy = new THREE.Object3D();
	var cx = Math.floor(px / GRASS_CELL), cz = Math.floor(pz / GRASS_CELL);
	var reach = GRASS_N * GRASS_CELL / 2;
	var k = 0;
	for (var i = 0; i < GRASS_N; i++) {
		for (var j = 0; j < GRASS_N; j++) {
			var gx = cx + i - GRASS_N / 2, gz = cz + j - GRASS_N / 2;
			var x = (gx + hash(gx + salt, gz)) * GRASS_CELL;
			var z = (gz + hash(gz, gx + salt)) * GRASS_CELL;
			var h = ground(x, z);
			var dist = Math.sqrt((x - px) * (x - px) + (z - pz) * (z - pz));
			var s = (0.7 + hash(gx + 5, gz + 9 + salt) * 0.8) * clamp((reach - dist) / 6, 0, 1);
			if (h < 2.9 || h > 70 || slopeAt(x, z) > 0.7 || hash(gx * 3.1 + salt, gz * 1.7) > keep) {
				s = 0;
			}
			dummy.position.set(x, h - 0.05, z);
			dummy.rotation.set(0, hash(gx, gz + salt) * Math.PI, 0, 'XYZ');
			dummy.scale.set(s, s, s);
			dummy.updateMatrix();
			mesh.setMatrixAt(k, dummy.matrix);
			k++;
		}
	}
	mesh.instanceMatrix.needsUpdate = true;
}

// ---------- rocks ----------

function rockGeometry() {
	var geo = new THREE.IcosahedronGeometry(1, 1);
	var pos = geo.attributes.position;
	for (var i = 0; i < pos.count; i++) {
		var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
		var f = 0.72 + 0.5 * hash(Math.round(x * 20) + Math.round(y * 20) * 3, Math.round(z * 20));
		pos.setXYZ(i, x * f, y * f, z * f);
	}
	geo.computeVertexNormals();
	return geo;
}

// land rocks are small. Sea rocks are tall.
function makeRocks(landSpots, seaSpots) {
	var rand = makeRandom(10);
	var mesh = new THREE.InstancedMesh(rockGeometry(), new THREE.MeshLambertMaterial({ color: 0xffffff }), landSpots.length + seaSpots.length);
	var dummy = new THREE.Object3D();
	var color = new THREE.Color();
	for (var i = 0; i < landSpots.length + seaSpots.length; i++) {
		var sea = i >= landSpots.length;
		var s = sea ? seaSpots[i - landSpots.length] : landSpots[i];
		var size = sea ? 3 + rand() * 5 : 0.3 + rand() * rand() * 2.5;
		dummy.position.set(s.x, s.h + size * (sea ? 0.6 : 0.2), s.z);
		dummy.rotation.set(rand() * 0.5, rand() * 6.28, rand() * 0.5, 'XYZ');
		dummy.scale.set(size, size * (sea ? 1.6 + rand() : 0.6 + rand() * 0.5), size * (0.7 + rand() * 0.6));
		dummy.updateMatrix();
		mesh.setMatrixAt(i, dummy.matrix);
		mesh.setColorAt(i, color.setHSL(0.07 + rand() * 0.04, 0.08 + rand() * 0.1, 0.16 + rand() * 0.22));
	}
	return mesh;
}

// ---------- shadows ----------

// a dark soft spot on the ground for each tree. The spot is on the side opposite to the sun.
function makeShadows(tops, sun, blobTex) {
	var geo = new THREE.PlaneGeometry(2, 2);
	geo.rotateX(-Math.PI / 2);
	var mat = new THREE.MeshBasicMaterial({
		map: blobTex, color: 0x0a1a10, transparent: true, opacity: 0.5, depthWrite: false,
		polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
	});
	var mesh = new THREE.InstancedMesh(geo, mat, tops.length);
	var dummy = new THREE.Object3D();
	var up = new THREE.Vector3(0, 1, 0);
	var normal = new THREE.Vector3();
	var flat = Math.sqrt(sun.x * sun.x + sun.z * sun.z);
	var count = 0;
	for (var i = 0; i < tops.length; i++) {
		var t = tops[i];
		var away = t.tall * 0.8 * flat / sun.y;
		var x = t.x - sun.x / flat * away, z = t.z - sun.z / flat * away;
		var h = ground(x, z);
		if (h < 0.3) {
			continue;
		}
		normal.set(-slopeX(x, z), 1, -slopeZ(x, z)).normalize();
		dummy.position.set(x, h + 0.12, z);
		dummy.quaternion.setFromUnitVectors(up, normal);
		dummy.scale.set(t.r, 1, t.r);
		dummy.updateMatrix();
		mesh.setMatrixAt(count, dummy.matrix);
		count++;
	}
	mesh.count = count;
	return mesh;
}

// ---------- camp: jetty and huts ----------

// the jetty starts on the west shore of the lagoon and goes east
function findJettyStart() {
	var x = -160;
	while (x < 0 && ground(x, LAGOON_Z) > 0.9) {
		x += 1;
	}
	return x - 4;
}

function makeHut(x, z) {
	var hut = new THREE.Group();
	var wall = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.4, 12), new THREE.MeshLambertMaterial({ color: 0xb48f5c }));
	var roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.6, 12), new THREE.MeshLambertMaterial({ color: 0xc9a85e }));
	var door = new THREE.Mesh(new THREE.BoxGeometry(1, 1.9, 0.2), new THREE.MeshLambertMaterial({ color: 0x3a2a1c }));
	wall.position.y = 1.2;
	roof.position.y = 3.6;
	door.position.set(0, 0.95, 2.15);
	hut.add(wall);
	hut.add(roof);
	hut.add(door);
	hut.position.set(x, ground(x, z) - 0.1, z);
	return hut;
}

function makeCamp(jx) {
	var camp = new THREE.Group();
	var wood = new THREE.MeshLambertMaterial({ color: 0x8c6f4e });
	var deck = new THREE.Mesh(new THREE.BoxGeometry(JETTY_LEN, 0.14, 2.2), wood);
	deck.position.set(jx + JETTY_LEN / 2, JETTY_Y - 0.07, LAGOON_Z);
	camp.add(deck);
	var postGeo = new THREE.CylinderGeometry(0.11, 0.11, 4, 6);
	var posts = new THREE.InstancedMesh(postGeo, wood, 14);
	var dummy = new THREE.Object3D();
	for (var i = 0; i < 14; i++) {
		dummy.position.set(jx + 1 + Math.floor(i / 2) * 4.6, JETTY_Y - 1.4, LAGOON_Z + (i % 2 ? 1.05 : -1.05));
		dummy.updateMatrix();
		posts.setMatrixAt(i, dummy.matrix);
	}
	camp.add(posts);
	camp.add(makeHut(jx - 13, LAGOON_Z - 13));
	camp.add(makeHut(jx - 20, LAGOON_Z + 12));
	return camp;
}

// ---------- lava ----------

function makeLavaLake(lavaTex) {
	var geo = new THREE.CircleGeometry(CRATER_R * 0.62, 24);
	geo.rotateX(-Math.PI / 2);
	var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: lavaTex, toneMapped: false }));
	mesh.position.set(VOLC_X, ground(VOLC_X, VOLC_Z) + 4, VOLC_Z);
	return mesh;
}

// a river of lava. It starts at the crater rim and goes down the steepest slope to the sea.
// Returns { mesh, end }. end is the last point, for the steam.
function makeLavaRiver(lavaTex) {
	var angle = 2.2;
	var x = VOLC_X + Math.cos(angle) * (CRATER_R + 2), z = VOLC_Z + Math.sin(angle) * (CRATER_R + 2);
	var dx = Math.cos(angle), dz = Math.sin(angle);
	var pos = [], uv = [], idx = [];
	var rows = 0;
	for (var i = 0; i < 260; i++) {
		if (ground(x, z) < -0.8) {
			break;
		}
		var w = 1.2 + Math.min(i * 0.02, 1.8);
		for (var k = -1; k <= 1; k++) {
			var vx = x - dz * w * k, vz = z + dx * w * k;
			pos.push(vx, ground(vx, vz) + 0.4, vz);
			uv.push(k * 0.5 + 0.5, i * 0.35);
		}
		if (i > 0) {
			var a = (rows - 1) * 3;
			idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4);
		}
		rows++;
		// next direction: 70 % the old direction, 30 % the steepest slope down
		var gx = -slopeX(x, z), gz = -slopeZ(x, z);
		var gl = Math.sqrt(gx * gx + gz * gz) + 0.0001;
		dx = dx * 0.7 + gx / gl * 0.3;
		dz = dz * 0.7 + gz / gl * 0.3;
		var dl = Math.sqrt(dx * dx + dz * dz);
		dx /= dl;
		dz /= dl;
		x += dx * 3;
		z += dz * 3;
	}
	var geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
	geo.setIndex(idx);
	var mat = new THREE.MeshBasicMaterial({ map: lavaTex, toneMapped: false, side: THREE.DoubleSide });
	return { mesh: new THREE.Mesh(geo, mat), end: { x: x, z: z } };
}

// ---------- sky, sun, water ----------

function sunDirection() {
	var phi = THREE.MathUtils.degToRad(90 - SUN_ELEVATION);
	var theta = THREE.MathUtils.degToRad(SUN_AZIMUTH);
	return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
}

function makeSky(sun) {
	var sky = new THREE.Sky();
	sky.scale.setScalar(10000);
	var u = sky.material.uniforms;
	u.turbidity.value = 1.2;
	u.rayleigh.value = 2.2;
	u.mieCoefficient.value = 0.003;
	u.mieDirectionalG.value = 0.85;
	u.sunPosition.value.copy(sun);
	return sky;
}

// the water is transparent when you look down, thus the shallow sand shows as turquoise.
// hidden is a group that the reflection does not show (small objects, for speed).
function makeWater(sun, hidden) {
	var normals = new THREE.TextureLoader().load('waternormals.jpg');
	normals.wrapS = THREE.RepeatWrapping;
	normals.wrapT = THREE.RepeatWrapping;
	var water = new THREE.Water(new THREE.PlaneGeometry(12000, 12000), {
		textureWidth: 512,
		textureHeight: 512,
		waterNormals: normals,
		sunDirection: sun.clone(),
		sunColor: 0xfff2d8,
		waterColor: 0x0c7fa8,
		distortionScale: 3.2,
		alpha: 0.5,
		fog: true
	});
	water.rotation.x = -Math.PI / 2;
	water.material.transparent = true;
	// 3 changes to the three.js water shader:
	// 1. the water keeps some of its own color at all angles, thus the far sea is blue, not white
	// 2. less reflection at low angles
	// 3. transparent when you look down, opaque when you look far
	var fs = water.material.fragmentShader;
	fs = fs.replace('vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;',
		'vec3 scatter = ( 1.0 + 0.8 * max( 0.0, dot( surfaceNormal, eyeDirection ) ) ) * waterColor;');
	fs = fs.replace('gl_FragColor = vec4( outgoingLight, alpha );',
		'gl_FragColor = vec4( outgoingLight, mix( alpha, 1.0, smoothstep( 0.3, 0.6, reflectance ) ) );');
	fs = fs.replace('vec3 albedo = mix(', 'reflectance = min( reflectance, 0.62 );\n\t\t\t\t\tvec3 albedo = mix(');
	water.material.fragmentShader = fs;
	var render = water.onBeforeRender;
	water.onBeforeRender = function (renderer, scene, camera) {
		hidden.visible = false;
		render(renderer, scene, camera);
		hidden.visible = true;
	};
	return water;
}

// ---------- clouds, smoke, steam ----------

function makeClouds(textures, count) {
	var rand = makeRandom(11);
	var group = new THREE.Group();
	for (var i = 0; i < count; i++) {
		var mat = new THREE.SpriteMaterial({ map: textures[i % textures.length], color: 0xfff7ee, transparent: true, depthWrite: false, opacity: 0.92, fog: false, toneMapped: false });
		var s = new THREE.Sprite(mat);
		var a = rand() * Math.PI * 2, r = 600 + rand() * 3200;
		var w = 300 + rand() * 450 + r * 0.15;
		s.position.set(Math.cos(a) * r, 320 + rand() * 260, Math.sin(a) * r);
		s.scale.set(w, w * 0.5, 1);
		group.add(s);
	}
	return group;
}

function moveClouds(clouds, dt) {
	for (var i = 0; i < clouds.children.length; i++) {
		var p = clouds.children[i].position;
		p.x += 6 * dt;
		if (p.x > 3800) {
			p.x = -3800;
		}
	}
}

// a column of puffs that go up. Used for the volcano smoke and the lava steam.
function makePlume(tex, count, color, x, y, z) {
	var group = new THREE.Group();
	for (var i = 0; i < count; i++) {
		var mat = new THREE.SpriteMaterial({ map: tex, color: color, transparent: true, depthWrite: false, fog: false });
		group.add(new THREE.Sprite(mat));
	}
	group.position.set(x, y, z);
	return group;
}

// each puff goes up, becomes larger, and fades. Then it starts again.
function movePlume(plume, time, rise, drift, size, opacity) {
	var n = plume.children.length;
	for (var i = 0; i < n; i++) {
		var s = plume.children[i];
		var t = (time * 0.05 + i / n) % 1;
		var w = size * (0.25 + t);
		s.position.set(t * drift + Math.sin(i * 12.9) * size * 0.07, t * rise, Math.cos(i * 4.1) * size * 0.07);
		s.scale.set(w * 1.6, w * 0.8, 1);
		s.material.opacity = opacity * (1 - t) * Math.min(1, t * 8);
	}
}

// ---------- birds ----------

function makeBirds(count) {
	var geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.16, 0, 0, 0.2, 1, 0, 0.05], 3));
	geo.computeVertexNormals();
	var mat = new THREE.MeshBasicMaterial({ color: 0xf4f4f0, side: THREE.DoubleSide });
	var birds = new THREE.Group();
	for (var i = 0; i < count; i++) {
		var bird = new THREE.Group();
		var left = new THREE.Mesh(geo, mat);
		var right = new THREE.Mesh(geo, mat);
		right.scale.x = -1;
		bird.add(left);
		bird.add(right);
		birds.add(bird);
	}
	return birds;
}

// the birds fly in circles above the lagoon
function moveBirds(birds, time) {
	for (var i = 0; i < birds.children.length; i++) {
		var bird = birds.children[i];
		var radius = 30 + i * 9;
		var a = time * (0.32 - i * 0.015) + i * 2.4;
		bird.position.set(LAGOON_X + Math.cos(a) * radius, 16 + i * 2 + Math.sin(time * 0.4 + i) * 3, LAGOON_Z + Math.sin(a) * radius);
		bird.rotation.y = -a;
		var flap = Math.sin(time * 7 + i * 1.7) * 0.55;
		bird.children[0].rotation.z = flap;
		bird.children[1].rotation.z = -flap;
	}
}

// ---------- sound ----------

// sea sound: filtered noise, with a slow change of volume. No audio file.
function startSea() {
	var ac = getAudio();   // from game.js
	if (!ac) {
		return;
	}
	var buffer = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
	var data = buffer.getChannelData(0);
	for (var i = 0; i < data.length; i++) {
		data[i] = Math.random() * 2 - 1;
	}
	var source = ac.createBufferSource();
	var filter = ac.createBiquadFilter();
	var gain = ac.createGain();
	var lfo = ac.createOscillator();
	var lfoGain = ac.createGain();
	source.buffer = buffer;
	source.loop = true;
	filter.type = 'lowpass';
	filter.frequency.value = 700;
	gain.gain.value = 0.06;
	lfo.frequency.value = 0.12;
	lfoGain.gain.value = 0.04;
	lfo.connect(lfoGain);
	lfoGain.connect(gain.gain);
	source.connect(filter);
	filter.connect(gain);
	gain.connect(ac.destination);
	source.start();
	lfo.start();
}

// ---------- input ----------

// thumbsticks of the Quest controllers (xr-standard mapping: axes 2 and 3)
function readSticks(session) {
	var out = { mx: 0, mz: 0, turn: 0 };
	for (var i = 0; i < session.inputSources.length; i++) {
		var src = session.inputSources[i];
		if (!src.gamepad || src.gamepad.axes.length < 4) {
			continue;
		}
		if (src.handedness === 'left') {
			out.mx = src.gamepad.axes[2];
			out.mz = src.gamepad.axes[3];
		}
		if (src.handedness === 'right') {
			out.turn = src.gamepad.axes[2];
		}
	}
	return out;
}

function readKeys(keys) {
	var out = { mx: 0, mz: 0, turn: 0 };
	if (keys.KeyW || keys.ArrowUp) { out.mz -= 1; }
	if (keys.KeyS || keys.ArrowDown) { out.mz += 1; }
	if (keys.KeyA || keys.ArrowLeft) { out.mx -= 1; }
	if (keys.KeyD || keys.ArrowRight) { out.mx += 1; }
	return out;
}

function setupDesktopInput(canvas, keys, player, camera, renderer) {
	window.addEventListener('keydown', function (e) { keys[e.code] = true; });
	window.addEventListener('keyup', function (e) { keys[e.code] = false; });
	canvas.addEventListener('pointermove', function (e) {
		if (e.buttons !== 1 || renderer.xr.isPresenting) {
			return;
		}
		player.rotation.y -= e.movementX * 0.004;
		camera.rotation.x = clamp(camera.rotation.x - e.movementY * 0.004, -1.4, 1.4);
	});
}

// ---------- player ----------

var snapReady = true;

function movePlayer(player, camera, input, dt, jx) {
	// snap turn
	if (Math.abs(input.turn) < 0.3) {
		snapReady = true;
	}
	if (Math.abs(input.turn) > 0.6 && snapReady) {
		player.rotation.y -= Math.sign(input.turn) * SNAP_ANGLE;
		snapReady = false;
	}

	// move in the direction of the head, on the horizontal plane
	var dir = new THREE.Vector3();
	camera.getWorldDirection(dir);
	dir.y = 0;
	dir.normalize();
	var mx = Math.abs(input.mx) > 0.15 ? input.mx : 0;
	var mz = Math.abs(input.mz) > 0.15 ? input.mz : 0;
	var p = player.position;
	p.x += (-dir.x * mz - dir.z * mx) * WALK_SPEED * dt;
	p.z += (-dir.z * mz + dir.x * mx) * WALK_SPEED * dt;

	// stay on the terrain square
	p.x = clamp(p.x, -SIZE / 2 + 10, SIZE / 2 - 10);
	p.z = clamp(p.z, -SIZE / 2 + 10, SIZE / 2 - 10);

	// stay on the ground. In the sea, stay near the surface.
	p.y = Math.max(ground(p.x, p.z), -0.6);

	// stay on the jetty deck
	if (p.x > jx && p.x < jx + JETTY_LEN && Math.abs(p.z - LAGOON_Z) < 1.1) {
		p.y = Math.max(p.y, JETTY_Y);
	}
}

// ---------- VR button ----------

function setupButton(renderer, camera) {
	var b = document.getElementById('enter');
	if (!navigator.xr) {
		b.textContent = 'WEBXR NOT AVAILABLE';
		b.disabled = true;
		return;
	}
	navigator.xr.isSessionSupported('immersive-vr').then(function (ok) {
		if (!ok) {
			b.textContent = 'VR NOT SUPPORTED';
			b.disabled = true;
		}
	});
	b.onclick = function () {
		if (renderer.xr.isPresenting) {
			renderer.xr.getSession().end();
			return;
		}
		navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] }).then(function (session) {
			renderer.xr.setSession(session);
		});
	};
	renderer.xr.addEventListener('sessionstart', function () {
		b.textContent = 'EXIT VR';
	});
	renderer.xr.addEventListener('sessionend', function () {
		b.textContent = 'ENTER VR';
		camera.position.set(0, EYE_H, 0);
		camera.rotation.set(0, 0, 0);
	});
}

// ---------- main ----------

function main() {
	var renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 0.4;
	renderer.xr.enabled = true;
	renderer.xr.setReferenceSpaceType('local-floor');
	renderer.xr.setFoveation(1);
	document.body.appendChild(renderer.domElement);

	var scene = new THREE.Scene();
	scene.fog = new THREE.FogExp2(FOG_COLOR, 0.00075);
	var camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 20000);
	camera.rotation.order = 'YXZ';
	camera.position.set(0, EYE_H, 0);

	fillHeights();
	var jx = findJettyStart();

	// the player is a group. The stick moves the group. The headset moves the camera in the group.
	// Start on the beach near the jetty, with the face to the volcano.
	// For tests, the URL can set the start: ?x=100&z=50&yaw=90&pitch=-20
	var query = new URLSearchParams(window.location.search);
	var player = new THREE.Group();
	player.add(camera);
	player.position.set(jx - 26, 0, LAGOON_Z + 2);
	player.rotation.y = Math.atan2(player.position.x - VOLC_X, player.position.z - VOLC_Z);
	var start = { x: player.position.x, z: player.position.z, yaw: player.rotation.y };
	if (query.has('x')) {
		player.position.set(Number(query.get('x')), 0, Number(query.get('z')));
		player.rotation.y = THREE.MathUtils.degToRad(Number(query.get('yaw') || 0));
		camera.rotation.x = THREE.MathUtils.degToRad(Number(query.get('pitch') || 0));
	}
	scene.add(player);

	var sun = sunDirection();
	var sunLight = new THREE.DirectionalLight(0xffe6c0, 6.8);
	sunLight.position.copy(sun).multiplyScalar(100);
	scene.add(sunLight);
	scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x8a7f5a, 4.2));

	// textures
	var puffs = [makePuffTexture(3), makePuffTexture(4), makePuffTexture(6)];
	var lavaTex = makeLavaTexture();
	var lakeTex = makeLavaTexture();
	lavaTex.repeat.set(1, 1);
	lakeTex.repeat.set(3, 3);

	// locations for the plants and rocks. The camp area stays clear.
	function clear(x, z) {
		var dx = x - (jx - 14), dz = z - LAGOON_Z;
		return dx * dx + dz * dz > 30 * 30;
	}
	var palmSpots = scatter(170, 1, function (x, z, h) {
		return h > 1.5 && h < 9 && slopeAt(x, z) < 0.4 && clear(x, z);
	});
	var treeSpots = scatter(230, 2, function (x, z, h) {
		return h > 5 && h < 62 && slopeAt(x, z) < 0.55 && fbm(x * 0.012 + 9, z * 0.012) > 0.4 && clear(x, z);
	});
	var bushSpots = scatter(520, 3, function (x, z, h) {
		return h > 2.8 && h < 75 && slopeAt(x, z) < 0.7 && clear(x, z);
	});
	var rockSpots = scatter(260, 4, function (x, z, h) {
		return h > -1.5 && (slopeAt(x, z) > 0.3 || h < 1.5 || h > 60) && clear(x, z);
	});
	var seaRockSpots = scatter(12, 5, function (x, z, h) {
		return h > -6.5 && h < -3;
	});

	// world: the reflection in the water shows these objects
	var lavaRiver = makeLavaRiver(lavaTex);
	var palms = makePalms(palmSpots, makeFrondTexture());
	var clouds = makeClouds(puffs, 34);
	var craterY = ground(VOLC_X, VOLC_Z);
	var smoke = makePlume(puffs[0], 14, 0x77706a, VOLC_X, craterY + 12, VOLC_Z);
	var lake = makeLavaLake(lakeTex);
	scene.add(makeSky(sun));
	scene.add(makeSeaFloor());
	scene.add(makeTerrain(makeDetailTexture(renderer)));
	scene.add(palms.mesh);
	scene.add(clouds);
	scene.add(smoke);
	scene.add(lake);
	scene.add(lavaRiver.mesh);

	// detail: the reflection does not show these objects
	var jungle = makeJungle(treeSpots, bushSpots, makeLeavesTexture());
	var grass = makeTufts(makeGrassTexture(), 1.2, 0.8);
	var flowers = makeTufts(makeFlowerTexture(), 0.9, 0.7);
	var birds = makeBirds(9);
	var steam = makePlume(puffs[1], 8, 0xffffff, lavaRiver.end.x, 1, lavaRiver.end.z);
	var detail = new THREE.Group();
	detail.add(jungle.mesh);
	detail.add(makeRocks(rockSpots, seaRockSpots));
	detail.add(makeShadows(palms.tops.concat(jungle.tops), sun, makeBlobTexture()));
	detail.add(makeCamp(jx));
	detail.add(grass);
	detail.add(flowers);
	detail.add(birds);
	detail.add(steam);
	scene.add(detail);

	// guns and enemies (game.js). window.game lets you look at the state in the console.
	var game = makeGame(scene, player, camera, renderer, detail, puffs[1], start);
	window.game = game;

	var water = makeWater(sun, detail);
	scene.add(water);

	var keys = {};
	setupDesktopInput(renderer.domElement, keys, player, camera, renderer);
	setupButton(renderer, camera);
	window.addEventListener('pointerdown', startSea, { once: true });

	window.addEventListener('resize', function () {
		if (renderer.xr.isPresenting) {
			return;
		}
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(window.innerWidth, window.innerHeight);
	});

	var clock = new THREE.Clock();
	var grassX = 1e9, grassZ = 1e9;   // where the grass was put the last time
	renderer.setAnimationLoop(function () {
		var dt = Math.min(clock.getDelta(), 0.1);
		var time = clock.elapsedTime;
		var session = renderer.xr.getSession();
		var input = session ? readSticks(session) : readKeys(keys);
		movePlayer(player, camera, input, dt, jx);
		updateGame(game, dt, keys);

		// put the grass around the player again after 3 m of movement
		var p = player.position;
		if (Math.abs(p.x - grassX) > 3 || Math.abs(p.z - grassZ) > 3) {
			grassX = p.x;
			grassZ = p.z;
			placeTufts(grass, p.x, p.z, 0.8, 0);
			placeTufts(flowers, p.x, p.z, 0.05, 50);
		}

		moveClouds(clouds, dt);
		movePlume(smoke, time, 190, 110, 120, 0.8);
		movePlume(steam, time * 2.5, 45, 20, 30, 0.6);
		moveBirds(birds, time);
		lavaTex.offset.y = time * 0.12;
		lakeTex.offset.x = time * 0.01;
		lake.material.color.setScalar(0.85 + 0.15 * Math.sin(time * 1.5));
		wind.value = time;
		water.material.uniforms.time.value = time * 0.6;
		renderer.render(scene, camera);
	});
}

main();
