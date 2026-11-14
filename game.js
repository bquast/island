// island game: guns, enemies and outposts.
// Classic script. It uses ground(), slopeAt() and clamp() from world.js.
// main.js calls makeGame() one time and updateGame() each frame.
//
// The goal: each outpost has guards. When all guards of an outpost are dead, the outpost is free.
//
// Order of this file:
//   constants, sound, geometry, ray math, guns, effects, HUD, enemies, game.

// ---------- constants ----------

var GUARDS = 5;               // enemies at each outpost
var ROAMERS = 24;              // enemies that walk around on the islands
var ENEMY_FAR = 450;         // m, enemies farther than this are not shown and do not move
var ENEMY_SEE = 55;          // m, an enemy sees you at this distance
var ENEMY_HEAR = 140;        // m, an enemy hears your shots at this distance
var ENEMY_RANGE = 28;        // m, an enemy stops at this distance and shoots
var ENEMY_DAMAGE = 9;
var RIFLE = { auto: true, interval: 0.11, damage: 34, spread: 0.012, muzzle: 0.58 };
var PISTOL = { auto: false, interval: 0.22, damage: 70, spread: 0, muzzle: 0.22 };

// ---------- sound (made in code, no audio files) ----------

var audio = { ac: null, shot: null };

// the browser lets the sound start only after a click or a controller press
function getAudio() {
	var AC = window.AudioContext || window.webkitAudioContext;
	if (audio.ac || !AC) {
		if (audio.ac && audio.ac.state === 'suspended') {
			audio.ac.resume();
		}
		return audio.ac;
	}
	var ac = new AC();
	var rate = ac.sampleRate;
	var buffer = ac.createBuffer(1, Math.floor(rate * 0.3), rate);
	var data = buffer.getChannelData(0);
	for (var i = 0; i < data.length; i++) {
		var t = i / rate;
		data[i] = (Math.random() * 2 - 1) * Math.exp(-t / 0.035) + Math.sin(t * 2 * Math.PI * 90) * Math.exp(-t / 0.05) * 0.8;
	}
	audio.ac = ac;
	audio.shot = buffer;
	return ac;
}

function playShot(volume, pitch) {
	var ac = getAudio();
	if (!ac) {
		return;
	}
	var source = ac.createBufferSource();
	var gain = ac.createGain();
	source.buffer = audio.shot;
	source.playbackRate.value = pitch;
	gain.gain.value = volume;
	source.connect(gain);
	gain.connect(ac.destination);
	source.start();
}

// ---------- geometry ----------

// one geometry from a list of boxes. Each box is [width, height, depth, x, y, z, color].
function boxesGeometry(boxes) {
	var pos = [], nor = [], col = [];
	var color = new THREE.Color();
	for (var b = 0; b < boxes.length; b++) {
		var box = boxes[b];
		var geo = new THREE.BoxGeometry(box[0], box[1], box[2]).toNonIndexed();
		geo.translate(box[3], box[4], box[5]);
		color.set(box[6]);
		var p = geo.attributes.position.array, n = geo.attributes.normal.array;
		for (var i = 0; i < p.length; i += 3) {
			pos.push(p[i], p[i + 1], p[i + 2]);
			nor.push(n[i], n[i + 1], n[i + 2]);
			col.push(color.r, color.g, color.b);
		}
	}
	var out = new THREE.BufferGeometry();
	out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
	out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
	return out;
}

// the guns point to -z. The hand is at the origin.
function rifleGeometry() {
	return boxesGeometry([
		[0.045, 0.07, 0.32, 0, 0, -0.12, 0x2a2c2e],      // body
		[0.022, 0.022, 0.3, 0, 0.012, -0.43, 0x1c1d1f],  // barrel
		[0.04, 0.06, 0.2, 0, -0.012, 0.14, 0x6b4a2e],    // stock
		[0.035, 0.12, 0.05, 0, -0.09, -0.15, 0x1c1d1f],  // magazine
		[0.035, 0.09, 0.04, 0, -0.075, 0, 0x6b4a2e],     // grip
		[0.01, 0.028, 0.01, 0, 0.048, -0.27, 0x1c1d1f]   // sight
	]);
}

function pistolGeometry() {
	return boxesGeometry([
		[0.034, 0.045, 0.2, 0, 0.015, -0.1, 0x2a2c2e],   // slide
		[0.032, 0.1, 0.045, 0, -0.05, -0.02, 0x3a2a1c]   // grip
	]);
}

// an enemy: 1.8 m tall, the face points to +z. Red shirt, rifle in the hands.
function enemyBodyGeometry() {
	return boxesGeometry([
		[0.5, 0.6, 0.28, 0, 1.15, 0, 0xb3261e],          // shirt
		[0.46, 0.14, 0.27, 0, 0.82, 0, 0x2c2a26],        // belt
		[0.24, 0.26, 0.24, 0, 1.62, 0, 0xc48a5a],        // head
		[0.26, 0.08, 0.26, 0, 1.74, 0, 0x7a1612],        // bandana
		[0.12, 0.12, 0.46, 0.29, 1.3, 0.2, 0xc48a5a],    // right arm
		[0.12, 0.12, 0.52, -0.2, 1.3, 0.24, 0xc48a5a],   // left arm
		[0.06, 0.1, 0.75, 0.1, 1.3, 0.5, 0x1c1d1f]       // rifle
	]);
}

// one leg. The top of the leg is at the origin, thus the leg turns at the hip.
function enemyLegGeometry() {
	return boxesGeometry([
		[0.19, 0.62, 0.21, 0, -0.31, 0, 0x8a7a55],       // trousers
		[0.2, 0.18, 0.28, 0, -0.71, 0.03, 0x2c2a26]      // boot
	]);
}

// ---------- ray math ----------

// distance along a ray to a sphere. Returns -1 for a miss.
function raySphere(o, d, cx, cy, cz, r) {
	var x = cx - o.x, y = cy - o.y, z = cz - o.z;
	var along = x * d.x + y * d.y + z * d.z;
	if (along < 0) {
		return -1;
	}
	var off2 = x * x + y * y + z * z - along * along;
	if (off2 > r * r) {
		return -1;
	}
	return along - Math.sqrt(r * r - off2);
}

// distance along a ray to the ground or the sea
function rayGround(o, d, max) {
	for (var t = 0; t < max; t += 1.5) {
		var y = o.y + d.y * t;
		if (y < 0 || y < ground(o.x + d.x * t, o.z + d.z * t)) {
			return t;
		}
	}
	return max;
}

// true when no hill is between the 2 points
function clearLine(a, b) {
	for (var i = 1; i < 10; i++) {
		var k = i / 10;
		var y = a.y + (b.y - a.y) * k;
		if (y < ground(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k)) {
			return false;
		}
	}
	return true;
}

// distance along a ray to an enemy. The body is 3 spheres, the head is 1 small sphere.
// Returns { t, head } or null.
function rayEnemy(o, d, e) {
	var head = raySphere(o, d, e.x, e.y + 1.63, e.z, 0.2);
	var best = head;
	var heights = [0.4, 0.8, 1.2];
	for (var i = 0; i < 3; i++) {
		var t = raySphere(o, d, e.x, e.y + heights[i], e.z, 0.38);
		if (t >= 0 && (best < 0 || t < best)) {
			best = t;
		}
	}
	if (best < 0) {
		return null;
	}
	return { t: best, head: head >= 0 && head <= best + 0.3 };
}

// ---------- guns ----------

var gunMaterial = null;

function makeGun(stats, flashTex) {
	gunMaterial = gunMaterial || new THREE.MeshLambertMaterial({ vertexColors: true });
	var gun = new THREE.Mesh(stats === RIFLE ? rifleGeometry() : pistolGeometry(), gunMaterial);
	var flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: 0xffd060, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
	flash.position.set(0, 0.012, -stats.muzzle - 0.06);
	flash.scale.set(0.22, 0.14, 1);
	flash.visible = false;
	gun.add(flash);
	return gun;
}

// one hand = one Quest controller. The right hand gets the rifle, the left hand gets the pistol.
function makeHand(game, index, flashTex) {
	var controller = game.renderer.xr.getController(index);
	var hand = { controller: controller, aim: controller, gun: null, stats: null, held: false, pulled: false, cooldown: 0, flashTime: 0, gamepad: null };
	game.player.add(hand.controller);
	hand.controller.addEventListener('connected', function (e) {
		hand.stats = e.data.handedness === 'left' ? PISTOL : RIFLE;
		hand.gun = makeGun(hand.stats, flashTex);
		hand.gamepad = e.data.gamepad;
		hand.controller.add(hand.gun);
	});
	hand.controller.addEventListener('disconnected', function () {
		if (hand.gun) {
			hand.controller.remove(hand.gun);
		}
		hand.gun = null;
		hand.stats = null;
	});
	hand.controller.addEventListener('selectstart', function () {
		hand.held = true;
		hand.pulled = true;
	});
	hand.controller.addEventListener('selectend', function () {
		hand.held = false;
	});
	return hand;
}

// the desktop hand: a rifle in front of the camera, Space = fire.
// The shot goes to the cross in the center of the screen.
function makeDeskHand(game, flashTex) {
	var holder = new THREE.Group();
	holder.position.set(0.2, -0.16, -0.3);
	var hand = { controller: holder, aim: game.camera, gun: makeGun(RIFLE, flashTex), stats: RIFLE, held: false, pulled: false, cooldown: 0, flashTime: 0, gamepad: null };
	holder.add(hand.gun);
	game.camera.add(holder);
	return hand;
}

function shake(gamepad) {
	if (gamepad && gamepad.hapticActuators && gamepad.hapticActuators[0]) {
		gamepad.hapticActuators[0].pulse(0.7, 40);
	}
}

// fire one shot from a hand. The shot is a ray: it hits immediately.
// The ray starts at hand.aim (the controller, or the camera on the desktop).
// The tracer starts at the muzzle of the gun.
function fireHand(game, hand) {
	var stats = hand.stats;
	hand.aim.updateWorldMatrix(true, false);
	hand.controller.updateWorldMatrix(true, false);
	var dir = new THREE.Vector3((Math.random() - 0.5) * stats.spread, (Math.random() - 0.5) * stats.spread, -1);
	dir.transformDirection(hand.aim.matrixWorld);
	var eye = new THREE.Vector3().setFromMatrixPosition(hand.aim.matrixWorld);
	var from = new THREE.Vector3(0, 0.012, -stats.muzzle).applyMatrix4(hand.controller.matrixWorld);

	// find the nearest thing on the ray: the ground or an enemy
	var best = null;
	var bestT = rayGround(eye, dir, 300);
	var head = false;
	for (var i = 0; i < game.enemies.length; i++) {
		var e = game.enemies[i];
		var hit = e.state === 'dead' ? null : rayEnemy(eye, dir, e);
		if (hit && hit.t < bestT) {
			best = e;
			bestT = hit.t;
			head = hit.head;
		}
	}
	var to = eye.clone().addScaledVector(dir, bestT);
	showTracer(game, from, to, 0xffe9a0);
	showPuff(game, to, best ? 0xc04030 : 0xd8cdb0, best ? 0.5 : 1);
	if (best) {
		hurtEnemy(game, best, stats.damage * (head ? 2 : 1));
	}

	playShot(stats === RIFLE ? 0.5 : 0.4, stats === RIFLE ? 1 : 1.5);
	shake(hand.gamepad);
	hand.cooldown = stats.interval;
	hand.flashTime = 0.05;
	game.noise = 1.5;
}

function updateHand(game, hand, dt) {
	hand.cooldown -= dt;
	hand.flashTime -= dt;
	if (hand.gun) {
		hand.gun.children[0].visible = hand.flashTime > 0;
		var want = hand.stats.auto ? hand.held : hand.pulled;
		if (want && hand.cooldown <= 0) {
			fireHand(game, hand);
		}
	}
	hand.pulled = false;
}

// ---------- effects: tracers and puffs ----------

// a tracer is a thin bright line that shows the path of a shot for a moment
function makeTracers(scene, count) {
	var geo = new THREE.BoxGeometry(0.025, 0.025, 1);
	geo.translate(0, 0, 0.5);
	var list = [];
	for (var i = 0; i < count; i++) {
		var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, toneMapped: false }));
		mesh.visible = false;
		scene.add(mesh);
		list.push({ mesh: mesh, life: 0 });
	}
	return list;
}

function showTracer(game, from, to, color) {
	var t = game.tracers[game.nextTracer];
	game.nextTracer = (game.nextTracer + 1) % game.tracers.length;
	t.mesh.position.copy(from);
	t.mesh.lookAt(to);
	t.mesh.scale.set(1, 1, from.distanceTo(to));
	t.mesh.material.color.set(color);
	t.mesh.visible = true;
	t.life = 0.08;
}

// a puff is a small cloud of dust where a shot hits
function makePuffs(scene, tex, count) {
	var list = [];
	for (var i = 0; i < count; i++) {
		var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
		sprite.visible = false;
		scene.add(sprite);
		list.push({ mesh: sprite, life: 0, size: 1 });
	}
	return list;
}

function showPuff(game, at, color, size) {
	var p = game.puffs[game.nextPuff];
	game.nextPuff = (game.nextPuff + 1) % game.puffs.length;
	p.mesh.position.copy(at);
	p.mesh.material.color.set(color);
	p.mesh.visible = true;
	p.life = 0.4;
	p.size = size;
}

function updateEffects(game, dt) {
	for (var i = 0; i < game.tracers.length; i++) {
		var t = game.tracers[i];
		t.life -= dt;
		t.mesh.visible = t.life > 0;
		t.mesh.material.opacity = clamp(t.life / 0.08, 0, 1);
	}
	for (var k = 0; k < game.puffs.length; k++) {
		var p = game.puffs[k];
		p.life -= dt;
		p.mesh.visible = p.life > 0;
		var age = 1 - clamp(p.life / 0.4, 0, 1);
		var s = p.size * (0.4 + age * 1.4);
		p.mesh.scale.set(s * 1.6, s * 0.8, 1);
		p.mesh.material.opacity = 0.8 * (1 - age);
	}
}

// ---------- HUD: a small panel in front of the eyes ----------

function makeHud(camera) {
	var canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 112;
	var tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	var panel = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.0875),
		new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
	panel.position.set(-0.1, -0.27, -0.8);
	panel.renderOrder = 1000;
	camera.add(panel);

	// a red plane that fills the view when you are hit
	var red = new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
		new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
	red.position.set(0, 0, -0.3);
	red.renderOrder = 999;
	camera.add(red);
	return { canvas: canvas, tex: tex, red: red, shown: '' };
}

// line 1: health, kills, free outposts. Line 2: an arrow and the distance to the nearest enemy outpost, and a hint.
// target is { dist, turn } or null. turn is the angle from your view to the outpost (radians, + is right).
function drawHud(hud, game, target) {
	var text = [Math.ceil(game.hp), game.kills, game.freed, game.hint, target ? Math.round(target.dist / 10) : -1, target ? Math.round(target.turn * 5) : 0].join(' ');
	if (text === hud.shown) {
		return;
	}
	hud.shown = text;
	var ctx = hud.canvas.getContext('2d');
	ctx.clearRect(0, 0, 512, 112);
	ctx.fillStyle = 'rgba(0,0,0,0.45)';
	ctx.fillRect(0, 0, 512, 112);
	ctx.fillStyle = '#5a1a14';
	ctx.fillRect(12, 14, 170, 26);
	ctx.fillStyle = game.hp > 35 ? '#4fd14a' : '#ff4a3a';
	ctx.fillRect(12, 14, 170 * clamp(game.hp / 100, 0, 1), 26);
	ctx.fillStyle = '#ffffff';
	ctx.font = 'bold 26px sans-serif';
	ctx.textBaseline = 'middle';
	ctx.fillText('KILLS ' + game.kills, 198, 28);
	ctx.fillText('FREE ' + game.freed + '/' + game.outposts.length, 345, 28);
	if (target) {
		ctx.save();
		ctx.translate(28, 80);
		ctx.rotate(target.turn);
		ctx.beginPath();
		ctx.moveTo(0, -15);
		ctx.lineTo(11, 11);
		ctx.lineTo(-11, 11);
		ctx.fill();
		ctx.restore();
		ctx.fillText('OUTPOST ' + Math.round(target.dist / 10) * 10 + ' m', 52, 82);
	} else {
		ctx.fillText('ALL OUTPOSTS FREE', 14, 82);
	}
	ctx.fillStyle = '#ffe27a';
	ctx.fillText(game.hint, 330, 82);
	hud.tex.needsUpdate = true;
}

// the nearest outpost that is not free: distance and direction, for the HUD
function nearestOutpost(game) {
	var p = game.player.position;
	var best = null, bestD = 1e9;
	for (var i = 0; i < game.outposts.length; i++) {
		var o = game.outposts[i];
		var d = Math.sqrt((o.x - p.x) * (o.x - p.x) + (o.z - p.z) * (o.z - p.z));
		if (!o.free && d < bestD) {
			bestD = d;
			best = o;
		}
	}
	if (!best) {
		return null;
	}
	var f = new THREE.Vector3();
	game.camera.getWorldDirection(f);
	var tx = best.x - p.x, tz = best.z - p.z;
	return { dist: bestD, turn: Math.atan2(tx * -f.z + tz * f.x, tx * f.x + tz * f.z) };
}

// ---------- enemies ----------

// a random location on land, not near the player
function findSpawn(player) {
	for (var i = 0; i < 400; i++) {
		var x = (Math.random() - 0.5) * (SIZE - 300), z = (Math.random() - 0.5) * (SIZE - 300);
		var h = ground(x, z);
		var dx = x - player.position.x, dz = z - player.position.z;
		if (h > 2 && h < 60 && slopeAt(x, z) < 0.5 && dx * dx + dz * dz > 150 * 150) {
			return { x: x, z: z };
		}
	}
	return { x: 150, z: 100 };
}

// put an enemy at the start of its life. A guard starts in its outpost (e.home). A roamer starts at a random location.
function placeEnemy(e, player) {
	var s = e.home ? { x: e.home.x + (Math.random() - 0.5) * 50, z: e.home.z + (Math.random() - 0.5) * 50 } : findSpawn(player);
	e.x = s.x;
	e.z = s.z;
	e.y = ground(e.x, e.z);
	e.tx = e.x;
	e.tz = e.z;
	e.hp = 100;
	e.state = 'patrol';
	e.timer = 0;
	e.deadTime = 0;
	e.group.rotation.x = 0;
}

function makeEnemy(parent, player, home, mat, bodyGeo, legGeo) {
	var group = new THREE.Group();
	var legL = new THREE.Mesh(legGeo, mat), legR = new THREE.Mesh(legGeo, mat);
	legL.position.set(-0.13, 0.8, 0);
	legR.position.set(0.13, 0.8, 0);
	group.add(new THREE.Mesh(bodyGeo, mat));
	group.add(legL);
	group.add(legR);
	group.rotation.order = 'YXZ';
	parent.add(group);
	var e = { group: group, legL: legL, legR: legR, home: home, x: 0, y: 0, z: 0, tx: 0, tz: 0, hp: 100, state: 'patrol', timer: 0, deadTime: 0, step: Math.random() * 6, side: 1 };
	placeEnemy(e, player);
	return e;
}

// GUARDS enemies for each outpost, and ROAMERS enemies with no home
function makeEnemies(parent, player, outposts) {
	var mat = new THREE.MeshLambertMaterial({ vertexColors: true });
	var bodyGeo = enemyBodyGeometry(), legGeo = enemyLegGeometry();
	var list = [];
	for (var i = 0; i < outposts.length; i++) {
		outposts[i].alive = GUARDS;
		for (var k = 0; k < GUARDS; k++) {
			list.push(makeEnemy(parent, player, outposts[i], mat, bodyGeo, legGeo));
		}
	}
	for (var r = 0; r < ROAMERS; r++) {
		list.push(makeEnemy(parent, player, null, mat, bodyGeo, legGeo));
	}
	return list;
}

function hurtEnemy(game, e, damage) {
	e.hp -= damage;
	if (e.state === 'patrol') {
		e.timer = 0.5 + Math.random();
	}
	e.state = 'alert';
	if (e.hp <= 0) {
		e.state = 'dead';
		e.deadTime = 0;
		game.kills++;
		// the last guard of an outpost: the outpost is free, the flag becomes blue
		if (e.home) {
			e.home.alive--;
			if (e.home.alive === 0) {
				e.home.free = true;
				e.home.flag.material.color.set(0x2a6fd6);
				game.freed++;
			}
		}
	}
}

// move an enemy to (tx, tz). It does not go into the sea or up a cliff. Returns false when the way is blocked.
function walkEnemy(e, tx, tz, speed, dt) {
	var dx = tx - e.x, dz = tz - e.z;
	var d = Math.sqrt(dx * dx + dz * dz);
	if (d < 0.5) {
		return false;
	}
	var nx = e.x + dx / d * speed * dt, nz = e.z + dz / d * speed * dt;
	if (ground(nx, nz) < 0.4 || slopeAt(nx, nz) > 0.9) {
		return false;
	}
	e.x = nx;
	e.z = nz;
	e.step += speed * dt * 2.6;
	return true;
}

// an enemy shoots at the player. The chance of a hit is smaller at a large distance.
function enemyShoot(game, e, eye, dist) {
	var from = new THREE.Vector3(e.x, e.y + 1.3, e.z);
	var to = eye.clone();
	to.y -= 0.25;
	from.addScaledVector(to.clone().sub(from).normalize(), 0.9);
	var hit = Math.random() < clamp(0.5 - dist / 130, 0.08, 0.45);
	if (!hit) {
		to.x += (Math.random() - 0.5) * 3;
		to.y += Math.random() * 1.2;
		to.z += (Math.random() - 0.5) * 3;
	}
	showTracer(game, from, to, 0xff9a70);
	playShot(clamp(12 / dist, 0.05, 0.4), 0.8);
	if (hit) {
		game.hp -= ENEMY_DAMAGE;
		game.hurtTime = 0;
		game.hud.red.material.opacity = 0.35;
	}
}

function updateEnemy(game, e, eye, dt) {
	var dx = game.player.position.x - e.x, dz = game.player.position.z - e.z;
	var dist = Math.sqrt(dx * dx + dz * dz);
	var moved = false;

	if (e.state === 'dead') {
		// fall on the back and stay for 8 s. A guard stays dead. A roamer starts again at a new location.
		e.deadTime += dt;
		e.group.visible = e.deadTime < 8 && dist < ENEMY_FAR;
		e.group.rotation.x = -Math.min(1, e.deadTime / 0.35) * Math.PI / 2;
		e.group.position.set(e.x, e.y + 0.14, e.z);
		if (!e.home && e.deadTime > 25) {
			placeEnemy(e, game.player);
		}
		return;
	}

	// far enemies are not shown and do not move
	e.group.visible = dist < ENEMY_FAR;
	if (dist >= ENEMY_FAR) {
		return;
	}

	if (e.state === 'patrol') {
		if (dist < ENEMY_SEE || (game.noise > 0 && dist < ENEMY_HEAR)) {
			e.state = 'alert';
			e.timer = 0.6 + Math.random();
		}
		// walk to a point near. When it is there, or the way is blocked, select a new point.
		// A guard stays near its outpost.
		e.timer -= dt;
		moved = walkEnemy(e, e.tx, e.tz, 1.5, dt);
		if (!moved && e.timer <= 0) {
			e.tx = (e.home ? e.home.x : e.x) + (Math.random() - 0.5) * 60;
			e.tz = (e.home ? e.home.z : e.z) + (Math.random() - 0.5) * 60;
			e.timer = 1 + Math.random() * 3;
		}
		if (moved) {
			e.group.rotation.y = Math.atan2(e.tx - e.x, e.tz - e.z);
		}
	}

	if (e.state === 'alert') {
		e.group.rotation.y = Math.atan2(dx, dz);
		if (dist > ENEMY_RANGE) {
			moved = walkEnemy(e, game.player.position.x, game.player.position.z, 3.4, dt);
		} else {
			// in range: move to the side, and change the side at each shot
			moved = walkEnemy(e, e.x + dz / dist * e.side * 5, e.z - dx / dist * e.side * 5, 1.2, dt);
		}
		e.timer -= dt;
		if (e.timer <= 0) {
			e.timer = 1.2 + Math.random() * 1.6;
			e.side = -e.side;
			var chest = new THREE.Vector3(e.x, e.y + 1.4, e.z);
			// the distance for the shot includes the height (the player can be in the air)
			var range = Math.sqrt(dist * dist + (eye.y - chest.y) * (eye.y - chest.y));
			if (range < 110 && clearLine(chest, eye)) {
				enemyShoot(game, e, eye, range);
			}
		}
		if (dist > 200) {
			e.state = 'patrol';
		}
	}

	e.y = ground(e.x, e.z);
	e.group.position.set(e.x, e.y, e.z);
	var swing = moved ? Math.sin(e.step) * 0.6 : 0;
	e.legL.rotation.x = swing;
	e.legR.rotation.x = -swing;
}

// ---------- game ----------

// parent is the group for the enemies. start is { x, z, yaw }: the player goes there after death.
// outposts is the list from world.js.
function makeGame(scene, player, camera, renderer, parent, puffTex, start, outposts) {
	var game = {
		scene: scene, player: player, camera: camera, renderer: renderer, start: start, outposts: outposts,
		hp: 100, kills: 0, deaths: 0, freed: 0,
		hint: '',         // short text on the HUD, for example how to enter a vehicle
		restarted: false, // true for one frame after the death of the player
		noise: 0,         // seconds that the enemies can still hear the last shot
		hurtTime: 99,     // seconds after the last hit on the player
		enemies: makeEnemies(parent, player, outposts),
		tracers: makeTracers(scene, 12), nextTracer: 0,
		puffs: makePuffs(scene, puffTex, 8), nextPuff: 0,
		hud: makeHud(camera),
		hands: [], desk: null
	};
	game.hands.push(makeHand(game, 0, puffTex));
	game.hands.push(makeHand(game, 1, puffTex));
	game.desk = makeDeskHand(game, puffTex);
	return game;
}

// the player died: go back to the start camp. The enemies stop the attack. Roamers near the camp go to other locations.
function restartPlayer(game) {
	game.deaths++;
	game.hp = 100;
	game.restarted = true;
	game.player.position.set(game.start.x, 0, game.start.z);
	game.player.rotation.y = game.start.yaw;
	game.hud.red.material.opacity = 0.8;
	for (var i = 0; i < game.enemies.length; i++) {
		var e = game.enemies[i];
		var dx = e.x - game.start.x, dz = e.z - game.start.z;
		if (e.state === 'dead') {
			continue;
		}
		e.state = 'patrol';
		if (!e.home && dx * dx + dz * dz < 150 * 150) {
			placeEnemy(e, game.player);
		}
	}
}

function updateGame(game, dt, keys) {
	var inVR = game.renderer.xr.isPresenting;
	var eye = new THREE.Vector3();
	game.camera.getWorldPosition(eye);

	// guns. Desktop: Space or a click fires.
	updateHand(game, game.hands[0], dt);
	updateHand(game, game.hands[1], dt);
	game.desk.controller.visible = !inVR;
	game.desk.held = !inVR && (keys.Space === true || keys.Mouse === true);
	updateHand(game, game.desk, dt);

	// enemies
	game.noise -= dt;
	for (var i = 0; i < game.enemies.length; i++) {
		updateEnemy(game, game.enemies[i], eye, dt);
	}

	// health comes back slowly, 5 s after the last hit
	game.hurtTime += dt;
	if (game.hurtTime > 5) {
		game.hp = Math.min(100, game.hp + 5 * dt);
	}
	if (game.hp <= 0) {
		restartPlayer(game);
	}

	updateEffects(game, dt);
	game.hud.red.material.opacity = Math.max(0, game.hud.red.material.opacity - dt * 1.2);
	drawHud(game.hud, game, nearestOutpost(game));
}
