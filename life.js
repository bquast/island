// island life: day and night, rain, animals, friendly people, treasure chests.
// Classic script. It uses world.js, game.js (walkEnemy, enemyLegGeometry, boxesGeometry, sound) and main.js (the env object).
// main.js calls makeLife() one time and updateLife() each frame.
//
// Order of this file:
//   constants, day and night, rain, animals, friends, chests, make and update.

// ---------- constants ----------

var DAY_MINUTES = 24;      // minutes for one day and night. Approximately 17 minutes of light and 7 of dark.
var RAIN_EVERY = 420;      // s, a shower starts each 7 minutes
var RAIN_LENGTH = 90;      // s
// animals. hp: health. size, aimY: the ball for hits. speed, run: m/s. bite: damage.
var BOAR = { name: 'boar', hp: 70, size: 0.7, aimY: 0.5, speed: 1.8, run: 8, bite: 12, count: 6 };
var SHARK = { name: 'shark', hp: 140, size: 1.0, aimY: -0.1, speed: 3, run: 9, bite: 22, count: 5 };

// ---------- day and night ----------

function makeStars() {
	var rand = makeRandom(42);
	var pos = [];
	for (var i = 0; i < 600; i++) {
		var a = rand() * 6.28, up = 0.05 + rand() * 0.95;
		var flat = Math.sqrt(1 - up * up);
		pos.push(Math.cos(a) * flat * 6000, up * 6000, Math.sin(a) * flat * 6000);
	}
	var geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	var stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }));
	stars.frustumCulled = false;
	return stars;
}

// set the sun, the light, the fog and the colors for the time of day and for the rain.
// env has the objects from main.js: sun, sunLight, hemi, sky, water, fog, cloudMats, plumes, shadowMat, birds.
// rain is 0 (dry) to 1 (full rain).
function updateSky(game, env, life, time, rain) {
	var turn = time / (DAY_MINUTES * 60) + 0.06;   // + 0.06: the game starts in the morning
	var elev = 22 + 46 * Math.sin(turn * Math.PI * 2);   // height of the sun in degrees. Below 0 is night.
	var azim = SUN_AZIMUTH + turn * 360;
	var day = smooth(clamp((elev + 6) / 14, 0, 1));      // 0 = night, 1 = day
	var low = clamp(1 - Math.abs(elev - 2) / 14, 0, 1);  // 1 at sunrise and sunset

	env.sun.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(azim));
	env.sky.material.uniforms.sunPosition.value.copy(env.sun);
	env.sky.material.uniforms.turbidity.value = 1.2 + rain * 6;
	env.sky.material.uniforms.rayleigh.value = 2.2 - rain * 0.8;

	// the light comes from the sun in the day and from the moon at night
	var from = life.lightDir;
	if (elev > 2) {
		from.copy(env.sun);
	} else {
		from.setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(azim + 180));
	}
	env.sunLight.position.copy(from).multiplyScalar(100);
	env.sunLight.color.set(0x8fa6d8).lerp(life.c1.set(0xffe6c0), day).lerp(life.c1.set(0xff9a50), low * 0.6);
	env.sunLight.intensity = (0.9 + 5.9 * day) * (1 - 0.45 * rain);
	env.hemi.intensity = (1.2 + 3.0 * day) * (1 - 0.35 * rain);
	env.water.material.uniforms.sunDirection.value.copy(from);
	env.water.material.uniforms.sunColor.value.copy(env.sunLight.color).multiplyScalar(0.15 + 0.85 * day);

	// fog: the color of the sky at the horizon. More fog in the rain.
	env.fog.color.set(0x0c1424).lerp(life.c1.set(FOG_COLOR), day).lerp(life.c1.set(0xd9966a), low * 0.55 * day).lerp(life.c1.set(0x8a9298), rain * 0.7 * day);
	env.fog.density = 0.00055 + rain * 0.0012;

	// clouds, smoke and shadows are not lit by the lights, thus set their colors here
	var cloud = life.c2.set(0x232a3a).lerp(life.c1.set(0xfff7ee), day).lerp(life.c1.set(0xffb080), low * 0.5 * day).multiplyScalar(1 - 0.4 * rain);
	for (var i = 0; i < env.cloudMats.length; i++) {
		env.cloudMats[i].color.copy(cloud);
	}
	for (var p = 0; p < env.plumes.length; p++) {
		var sprites = env.plumes[p].group.children;
		for (var s = 0; s < sprites.length; s++) {
			sprites[s].material.color.set(env.plumes[p].color).multiplyScalar(0.15 + 0.85 * day);
		}
	}
	env.shadowMat.opacity = 0.5 * day * (1 - 0.7 * rain);
	env.birds.visible = day > 0.3;
	life.stars.material.opacity = (1 - day) * (1 - rain);
	life.stars.visible = day < 0.98;

	// at night the enemies see less far
	game.sight = 0.55 + 0.45 * day;
}

// ---------- rain ----------

// 900 short lines that fall around the player
function makeRain() {
	var rand = makeRandom(8);
	var pos = [];
	for (var i = 0; i < 900; i++) {
		var x = (rand() - 0.5) * 50, y = rand() * 30 - 6, z = (rand() - 0.5) * 50;
		pos.push(x, y, z, x + 0.15, y + 0.9, z);
	}
	var geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	var rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xb8c4d0, transparent: true, opacity: 0, depthWrite: false, fog: false }));
	rain.frustumCulled = false;
	rain.visible = false;
	return rain;
}

// level of rain, 0 to 1: a shower of RAIN_LENGTH seconds each RAIN_EVERY seconds
function rainLevel(life, time, dt) {
	var t = time % RAIN_EVERY;
	var want = t > RAIN_EVERY - RAIN_LENGTH ? 1 : 0;
	life.rain += clamp(want - life.rain, -0.25 * dt, 0.25 * dt);
	return life.rain;
}

function moveRain(life, eye, dt) {
	var rain = life.rainMesh;
	rain.visible = life.rain > 0.03;
	rain.material.opacity = life.rain * 0.55;
	if (!rain.visible) {
		return;
	}
	rain.position.copy(eye);
	var pos = rain.geometry.attributes.position;
	for (var i = 0; i < pos.count; i += 2) {
		var y = pos.getY(i) - 26 * dt;
		if (y < -6) {
			y += 30;
		}
		pos.setY(i, y);
		pos.setY(i + 1, y + 0.9);
	}
	pos.needsUpdate = true;
}

// rain sound: high noise. It starts with the first rain (after the first click, when sound is permitted).
function rainSound(life) {
	var ac = audio.ac;   // from game.js
	if (!ac) {
		return;
	}
	if (!life.rainGain) {
		var buffer = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
		var data = buffer.getChannelData(0);
		for (var i = 0; i < data.length; i++) {
			data[i] = Math.random() * 2 - 1;
		}
		var source = ac.createBufferSource(), filter = ac.createBiquadFilter();
		life.rainGain = ac.createGain();
		source.buffer = buffer;
		source.loop = true;
		filter.type = 'highpass';
		filter.frequency.value = 1800;
		source.connect(filter);
		filter.connect(life.rainGain);
		life.rainGain.connect(ac.destination);
		source.start();
	}
	life.rainGain.gain.value = life.rain * 0.035;
}

// ---------- animals ----------

// the animals are always near the player: an animal that is far goes to a new location near the player.
// A boar attacks when you walk near it. A shark attacks when you swim.

function boarModel(mat) {
	var brown = 0x4a3626, dark = 0x2e2118;
	return new THREE.Mesh(boxesGeometry([
		[0.5, 0.5, 1.0, 0, 0.6, 0, brown],                                             // body
		[0.36, 0.36, 0.4, 0, 0.58, -0.65, brown], [0.2, 0.2, 0.22, 0, 0.5, -0.92, dark], // head, nose
		[0.05, 0.05, 0.16, -0.13, 0.46, -0.95, 0xf0ead8], [0.05, 0.05, 0.16, 0.13, 0.46, -0.95, 0xf0ead8], // tusks
		[0.12, 0.36, 0.12, -0.17, 0.18, -0.35, dark], [0.12, 0.36, 0.12, 0.17, 0.18, -0.35, dark],
		[0.12, 0.36, 0.12, -0.17, 0.18, 0.35, dark], [0.12, 0.36, 0.12, 0.17, 0.18, 0.35, dark]
	]), mat);
}

// the shark is below the water. Only the fin is above.
function sharkModel(mat) {
	var gray = 0x4f5a66;
	return new THREE.Mesh(boxesGeometry([
		[0.7, 0.6, 3.2, 0, -0.45, 0, gray],          // body
		[0.4, 0.4, 0.7, 0, -0.45, -1.9, gray],       // nose
		[0.08, 0.6, 0.55, 0, 0.1, 0.1, 0x3d4650],    // fin
		[0.08, 0.6, 0.35, 0, -0.2, 1.75, 0x3d4650]   // tail
	]), mat);
}

// find a new location near the player. Returns false when there is none (for example no sea near).
function placeAnimal(a, player) {
	for (var i = 0; i < 30; i++) {
		var angle = Math.random() * 6.28, far = 70 + Math.random() * 180;
		var x = player.position.x + Math.cos(angle) * far, z = player.position.z + Math.sin(angle) * far;
		var h = ground(x, z);
		var good = a.kind === SHARK ? h < -3 : (h > 3 && h < 150 && slopeAt(x, z) < 0.5);
		if (good) {
			a.x = x;
			a.z = z;
			a.y = a.kind === SHARK ? 0 : h;
			a.tx = x;
			a.tz = z;
			a.hp = a.kind.hp;
			a.state = 'walk';
			a.timer = 0;
			a.deadTime = 0;
			a.group.rotation.z = 0;
			return true;
		}
	}
	a.hp = 0;
	a.deadTime = 99;
	return false;
}

function makeAnimals(parent, player) {
	var mat = new THREE.MeshLambertMaterial({ vertexColors: true });
	var kinds = [BOAR, SHARK];
	var list = [];
	for (var k = 0; k < kinds.length; k++) {
		for (var i = 0; i < kinds[k].count; i++) {
			var group = new THREE.Group();
			group.add(kinds[k] === BOAR ? boarModel(mat) : sharkModel(mat));
			group.rotation.order = 'YXZ';
			parent.add(group);
			var a = { kind: kinds[k], group: group, x: 0, y: 0, z: 0, tx: 0, tz: 0, hp: 0, state: 'walk', timer: 0, deadTime: 0, step: 0, wait: Math.random() * 3 };
			placeAnimal(a, player);
			list.push(a);
		}
	}
	return list;
}

function hurtAnimal(game, a, damage) {
	a.hp -= damage;
	a.state = 'flee';
	a.timer = 5;
	if (a.hp <= 0) {
		a.deadTime = 0;
		a.group.rotation.z = Math.PI / 2;   // on its side
	}
}

// go to (tx, tz). A boar stays on land, a shark stays in deep water. Returns false when the way is blocked.
function moveAnimal(a, tx, tz, speed, dt) {
	var dx = tx - a.x, dz = tz - a.z;
	var d = Math.sqrt(dx * dx + dz * dz);
	if (d < 0.6) {
		return false;
	}
	var nx = a.x + dx / d * speed * dt, nz = a.z + dz / d * speed * dt;
	var h = ground(nx, nz);
	if (a.kind === SHARK ? h > -1.3 : (h < 0.5 || slopeAt(nx, nz) > 0.9)) {
		return false;
	}
	a.x = nx;
	a.z = nz;
	a.step += speed * dt * 3;
	a.group.rotation.y = Math.atan2(-dx, -dz);
	return true;
}

function updateAnimal(game, a, dt) {
	var p = game.player.position;
	var dx = p.x - a.x, dz = p.z - a.z;
	var dist = Math.sqrt(dx * dx + dz * dz);

	// dead, or far: after some seconds, start again at a new location near the player
	if (a.hp <= 0 || dist > 420) {
		a.deadTime += dt;
		a.group.visible = a.hp <= 0 && a.deadTime < 12 && dist < 420;
		a.wait -= dt;
		if ((a.deadTime > 12 || dist > 420) && a.wait <= 0) {
			a.wait = 3;
			placeAnimal(a, game.player);
		}
		return;
	}
	a.group.visible = true;

	// the target of the attack: a boar attacks a person on foot, a shark attacks a swimmer
	var prey = a.kind === SHARK ? game.swimming : (game.onFoot && !game.swimming);
	var moved = false;
	a.timer -= dt;
	if (a.state === 'walk') {
		moved = moveAnimal(a, a.tx, a.tz, a.kind.speed, dt);
		if (!moved && a.timer <= 0) {
			a.tx = a.x + (Math.random() - 0.5) * 60;
			a.tz = a.z + (Math.random() - 0.5) * 60;
			a.timer = 1 + Math.random() * 4;
		}
		if (prey && dist < (a.kind === SHARK ? 80 : 9)) {
			a.state = 'attack';
		}
	} else if (a.state === 'attack') {
		moved = moveAnimal(a, p.x, p.z, a.kind.run, dt);
		if (dist < 1.6 && prey) {
			game.hp -= a.kind.bite;
			game.hurtTime = 0;
			game.hud.red.material.opacity = 0.4;
			a.state = 'flee';
			a.timer = a.kind === SHARK ? 1.3 : 4;
		}
		if (!prey || dist > 100) {
			a.state = 'walk';
		}
	} else {
		// flee: run away from the player for some seconds
		moved = moveAnimal(a, a.x - dx, a.z - dz, a.kind.run, dt);
		if (a.timer <= 0) {
			a.state = 'walk';
		}
	}
	a.y = a.kind === SHARK ? 0 : ground(a.x, a.z);
	a.group.position.set(a.x, a.y + (a.kind === BOAR && moved ? Math.abs(Math.sin(a.step)) * 0.06 : 0), a.z);
}

// ---------- friends ----------

// people with blue shirts. They walk in the start camp, and in each outpost after it is free.
function friendBodyGeometry() {
	return boxesGeometry([
		[0.5, 0.6, 0.28, 0, 1.15, 0, 0x2a6fd6],          // shirt
		[0.46, 0.14, 0.27, 0, 0.82, 0, 0x2c2a26],        // belt
		[0.24, 0.26, 0.24, 0, 1.62, 0, 0xc48a5a],        // head
		[0.42, 0.06, 0.42, 0, 1.78, 0, 0xd9c27a],        // hat
		[0.12, 0.55, 0.12, 0.31, 1.15, 0, 0xc48a5a],     // arms
		[0.12, 0.55, 0.12, -0.31, 1.15, 0, 0xc48a5a]
	]);
}

function addFriends(life, parent, home, count) {
	for (var i = 0; i < count; i++) {
		var group = new THREE.Group();
		var legL = new THREE.Mesh(life.legGeo, life.friendMat), legR = new THREE.Mesh(life.legGeo, life.friendMat);
		legL.position.set(-0.13, 0.8, 0);
		legR.position.set(0.13, 0.8, 0);
		group.add(new THREE.Mesh(life.friendGeo, life.friendMat));
		group.add(legL);
		group.add(legR);
		parent.add(group);
		var x = home.x + (Math.random() - 0.5) * 30, z = home.z + (Math.random() - 0.5) * 30;
		life.friends.push({ group: group, legL: legL, legR: legR, home: home, x: x, z: z, tx: x, tz: z, timer: Math.random() * 3, step: 0 });
	}
}

function updateFriend(game, f, dt) {
	var dx = game.player.position.x - f.x, dz = game.player.position.z - f.z;
	f.group.visible = dx * dx + dz * dz < 400 * 400;
	if (!f.group.visible) {
		return;
	}
	f.timer -= dt;
	var moved = walkEnemy(f, f.tx, f.tz, 1.3, dt);   // from game.js: walk on land
	if (!moved && f.timer <= 0) {
		f.tx = f.home.x + (Math.random() - 0.5) * 50;
		f.tz = f.home.z + (Math.random() - 0.5) * 50;
		f.timer = 2 + Math.random() * 6;
	}
	if (moved) {
		f.group.rotation.y = Math.atan2(f.tx - f.x, f.tz - f.z);
	}
	var swing = moved ? Math.sin(f.step) * 0.5 : 0;
	f.legL.rotation.x = swing;
	f.legR.rotation.x = -swing;
	f.group.position.set(f.x, ground(f.x, f.z), f.z);
}

// ---------- chests ----------

// one treasure chest on each island, with a column of yellow light that you can see from far.
// A chest gives full health and 5 more maximum health.
function makeChests(game, parent) {
	var rand = makeRandom(55);
	var boxMat = new THREE.MeshLambertMaterial({ vertexColors: true });
	var boxGeo = boxesGeometry([
		[1.0, 0.6, 0.65, 0, 0.3, 0, 0x6b4426], [1.04, 0.14, 0.69, 0, 0.62, 0, 0xe0b030],
		[0.12, 0.64, 0.69, -0.3, 0.32, 0, 0xe0b030], [0.12, 0.64, 0.69, 0.3, 0.32, 0, 0xe0b030]
	]);
	var beamGeo = new THREE.CylinderGeometry(0.7, 0.7, 90, 8, 1, true);
	beamGeo.translate(0, 45, 0);
	var beamMat = new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
	var list = [];
	for (var i = 0; i < ISLANDS.length; i++) {
		var s = ISLANDS[i];
		var x = s[0], z = s[1];
		for (var tries = 0; tries < 200; tries++) {
			var tx = s[0] + (rand() - 0.5) * s[2] * 1.5, tz = s[1] + (rand() - 0.5) * s[2] * 1.5;
			var h = ground(tx, tz);
			var good = h > 4 && slopeAt(tx, tz) < 0.4 && roadAt(tx, tz) < 0.1;
			for (var o = 0; o < game.outposts.length; o++) {
				good = good && Math.abs(game.outposts[o].x - tx) + Math.abs(game.outposts[o].z - tz) > 160;
			}
			if (good) {
				x = tx;
				z = tz;
				break;
			}
		}
		var group = new THREE.Group();
		group.add(new THREE.Mesh(boxGeo, boxMat));
		group.add(new THREE.Mesh(beamGeo, beamMat));
		group.position.set(x, Math.max(ground(x, z), 0), z);
		group.rotation.y = rand() * 6.28;
		parent.add(group);
		list.push({ group: group, x: x, y: Math.max(ground(x, z), 0), z: z, found: false });
	}
	game.chestTotal = list.length;
	return list;
}

function updateChests(game, life) {
	var p = game.player.position;
	for (var i = 0; i < life.chests.length; i++) {
		var c = life.chests[i];
		var d = Math.abs(c.x - p.x) + Math.abs(c.z - p.z);
		c.group.visible = !c.found && d < 3000;
		if (!c.found && game.onFoot && d < 2.6 && Math.abs(c.y - p.y) < 3) {
			c.found = true;
			game.chests++;
			game.maxHp += 5;
			game.hp = game.maxHp;
			playShot(0.3, 3);
		}
	}
}

// ---------- make and update ----------

// camp is { x, z }: the start camp, for the first friends
function makeLife(game, parent, scene, camp) {
	var life = {
		stars: makeStars(), rainMesh: makeRain(), rain: 0, rainGain: null,
		shift: 0,   // seconds added to the clock. For tests, the URL can set it in minutes: ?t=16
		lightDir: new THREE.Vector3(), c1: new THREE.Color(), c2: new THREE.Color(),
		friends: [], friendGeo: friendBodyGeometry(), legGeo: enemyLegGeometry(), friendMat: new THREE.MeshLambertMaterial({ vertexColors: true }),
		chests: makeChests(game, parent), parent: parent
	};
	scene.add(life.stars);
	scene.add(life.rainMesh);
	game.animals = makeAnimals(parent, game.player);
	addFriends(life, parent, camp, 5);
	return life;
}

function updateLife(game, life, env, dt, clock) {
	var time = clock + life.shift;
	var eye = new THREE.Vector3();
	game.camera.getWorldPosition(eye);

	var rain = rainLevel(life, time, dt);
	updateSky(game, env, life, time, rain);
	life.stars.position.copy(eye);
	moveRain(life, eye, dt);
	if (rain > 0.03 || life.rainGain) {
		rainSound(life);
	}

	for (var a = 0; a < game.animals.length; a++) {
		updateAnimal(game, game.animals[a], dt);
	}
	// a free outpost gets 3 friends
	for (var o = 0; o < game.outposts.length; o++) {
		if (game.outposts[o].free && !game.outposts[o].friendly) {
			game.outposts[o].friendly = true;
			addFriends(life, life.parent, game.outposts[o], 3);
		}
	}
	for (var f = 0; f < life.friends.length; f++) {
		updateFriend(game, life.friends[f], dt);
	}
	updateChests(game, life);
}
