// island foes: the enemy vehicles and guns. Jeeps on the roads, boats around the islands, helicopters in the air,
// large ships around the large islands, and an anti-aircraft gun in each outpost.
// Classic script. It uses world.js (ground, ROADS, ISLANDS), game.js (effects, sound, enemy shapes),
// vehicles.js (the models, settleRide) and weapons.js (showBlast).
// main.js calls makeFoes() one time and updateFoes() each frame.
//
// A foe goes on its route (patrol). When it sees you, it comes to you and shoots (chase).
// When its health is 0 it explodes (dead). Later a new one starts on the same route.
//
// Order of this file:
//   constants, models, make, health, movement, the kinds, update.

// ---------- constants ----------

// hp: health. size: radius for hits. speed, chase: m/s. see: m, it sees you at this distance.
// stop: m, it stops at this distance. reach: m, it shoots from this distance. wait: s between shots.
// back: s after death until a new one starts.
var FOE_JEEP = { kind: 'jeep', hp: 220, size: 1.9, speed: 11, chase: 15, see: 130, stop: 24, reach: 110, wait: 0.5, damage: 7, back: 50 };
var FOE_BOAT = { kind: 'boat', hp: 220, size: 2.1, speed: 10, chase: 18, see: 170, stop: 32, reach: 120, wait: 0.5, damage: 7, back: 50 };
var FOE_HELI = { kind: 'heli', hp: 340, size: 2.7, speed: 26, chase: 32, see: 300, stop: 75, reach: 170, wait: 0.35, damage: 6, back: 80 };
// a ship is large and slow, with much health: a target for bombs. It does not chase you, but its guns shoot.
var FOE_SHIP = { kind: 'ship', hp: 1800, size: 8, speed: 4, chase: 4, see: 420, stop: 0, reach: 380, wait: 0.7, damage: 8, back: 240 };
// an anti-aircraft gun in an outpost. It does not move. It shoots when you fly, or when you are near. It does not come back.
var FOE_GUN = { kind: 'gun', hp: 160, size: 1.7, speed: 0, chase: 0, see: 380, stop: 0, reach: 380, wait: 0.9, damage: 8, back: 1e9 };
var FOE_JEEPS = 8, FOE_BOATS = 12, FOE_HELIS = 4, FOE_SHIPS = 3;
var FOE_FAR = 900;       // m, foes farther than this are not shown and do not move
var FOE_PAINT = 0x8a1f1a;

// ---------- models ----------

// a gray ship, 44 m long. The front points to -z.
function shipModel(mat) {
	var gray = 0x5a6068, dark = 0x33383e, white = 0xd8dadc;
	var group = new THREE.Group();
	group.add(new THREE.Mesh(boxesGeometry([
		[8, 3.4, 34, 0, 0.6, 2, gray],                                               // hull
		[6, 3.2, 6, 0, 0.7, -17, gray], [3.5, 3, 4, 0, 0.8, -21, gray],              // bow
		[8.2, 0.5, 34.2, 0, -0.6, 2, 0x8a1f1a],                                      // red line at the water
		[5.5, 3.6, 9, 0, 4.1, 9, white], [4.5, 2.2, 5, 0, 7, 9.5, white],            // bridge
		[1.6, 3, 1.6, 0, 9.2, 11, dark],                                             // funnel
		[2.2, 1.2, 2.2, 0, 2.9, -9, dark], [0.3, 0.3, 4, 0, 3.4, -11.5, dark],       // front gun
		[2.2, 1.2, 2.2, 0, 2.9, 16.5, dark], [0.3, 0.3, 4, 0, 3.4, 18.8, dark],      // rear gun
		[3, 1.4, 5, 0, 3, -2.5, 0x7a6a45], [3, 1.4, 5, 0, 3, 2.8, 0x5f6b45]          // cargo
	]), mat));
	return { group: group, spin: [] };
}

// a gun on a base of sand bags. spin[0] is the barrel, it points to you.
function gunModel(mat) {
	var group = new THREE.Group();
	group.add(new THREE.Mesh(boxesGeometry([
		[2.6, 0.7, 2.6, 0, 0.35, 0, 0x9a8a62], [1.0, 0.8, 1.0, 0, 1.1, 0, 0x33383e]
	]), mat));
	var barrel = new THREE.Mesh(boxesGeometry([
		[0.16, 0.16, 2.6, -0.2, 0, 1.3, 0x23262a], [0.16, 0.16, 2.6, 0.2, 0, 1.3, 0x23262a], [0.7, 0.5, 0.8, 0, 0, 0, 0x33383e]
	]), mat);
	barrel.position.set(0, 1.7, 0);
	group.add(barrel);
	return { group: group, spin: [barrel] };
}

// ---------- make ----------

// home has the data of the route: { road } for a jeep, { island } for a boat or a ship,
// { post } for a helicopter or a gun
function makeFoe(parent, stats, home, gunnerGeo, gunnerMat) {
	var mat = new THREE.MeshLambertMaterial({ vertexColors: true });   // its own material: it becomes dark when the foe is dead
	var model = stats.kind === 'jeep' ? jeepModel(mat, FOE_PAINT) : stats.kind === 'boat' ? boatModel(mat, FOE_PAINT) : stats.kind === 'heli' ? heliModel(mat, FOE_PAINT) : stats.kind === 'ship' ? shipModel(mat) : gunModel(mat);
	var gunner = new THREE.Mesh(gunnerGeo, gunnerMat);
	gunner.position.set(0, stats.kind === 'jeep' ? 0.35 : -0.2, stats.kind === 'jeep' ? 0.9 : 1.0);
	gunner.rotation.y = Math.PI;   // the model of the person looks to +z, the vehicle goes to -z
	gunner.visible = stats.kind === 'jeep' || stats.kind === 'boat';
	model.group.add(gunner);
	model.group.rotation.order = 'YXZ';
	parent.add(model.group);
	var foe = {
		stats: stats, home: home, group: model.group, spin: model.spin, mat: mat, gunner: gunner, size: stats.size,
		x: 0, y: 0, z: 0, yaw: 0, speed: 0, vx: 0, vy: 0, vz: 0,
		hp: stats.hp, state: 'patrol', timer: 0, deadTime: 0,
		wp: 0, dir: 1,           // jeep: the next point of the road, and the direction on the road
		angle: 0,                // boat: the angle on its circle around the island. Helicopter: the angle around you.
		tx: 0, tz: 0,            // helicopter: where it goes
		callTime: 0, callX: 0, callZ: 0   // an alarm called this foe to (callX, callZ)
	};
	resetFoe(foe);
	return foe;
}

// put a foe at the start of its route, with full health
function resetFoe(foe) {
	var home = foe.home;
	if (foe.stats.kind === 'jeep') {
		foe.wp = Math.floor(home.road.length / 2);
		foe.x = home.road[foe.wp].x;
		foe.z = home.road[foe.wp].z;
		foe.y = ground(foe.x, foe.z);
	}
	if (foe.stats.kind === 'boat') {
		foe.angle = Math.random() * 6.28;
		foe.x = home.island[0] + Math.cos(foe.angle) * home.island[2] * 1.7;
		foe.z = home.island[1] + Math.sin(foe.angle) * home.island[2] * 1.7;
		foe.y = 0;
	}
	if (foe.stats.kind === 'heli') {
		foe.x = home.post.x;
		foe.z = home.post.z;
		foe.y = ground(foe.x, foe.z) + 80;
		foe.tx = foe.x;
		foe.tz = foe.z;
	}
	if (foe.stats.kind === 'ship') {
		// start at a point of the circle where the sea is deep
		for (var t = 0; t < 40; t++) {
			foe.angle = t * 0.37;
			foe.x = home.island[0] + Math.cos(foe.angle) * home.island[2] * 2.2;
			foe.z = home.island[1] + Math.sin(foe.angle) * home.island[2] * 2.2;
			if (ground(foe.x, foe.z) < -7) {
				break;
			}
		}
		foe.y = 0;
	}
	if (foe.stats.kind === 'gun') {
		foe.x = home.post.x + 17;
		foe.z = home.post.z + 15;
		foe.y = ground(foe.x, foe.z);
	}
	foe.hp = foe.stats.hp;
	foe.state = 'patrol';
	foe.speed = 0;
	foe.vx = 0;
	foe.vy = 0;
	foe.vz = 0;
	foe.callTime = 0;
	foe.mat.color.set(0xffffff);
	foe.gunner.visible = foe.stats.kind === 'jeep' || foe.stats.kind === 'boat';
	foe.group.rotation.set(0, foe.yaw, 0, 'YXZ');
	foe.group.position.set(foe.x, foe.y, foe.z);
}

// jeeps: one on each road. Boats: one for each larger island. Helicopters: they start at outposts.
// Ships: around the 3 largest islands of the center. Guns: one in each outpost.
function makeFoes(game, parent) {
	var gunnerGeo = enemyBodyGeometry(0xb3261e, 0x7a1612);
	var gunnerMat = new THREE.MeshLambertMaterial({ vertexColors: true });
	var list = [];
	for (var r = 0; r < ROADS.length && r < FOE_JEEPS; r++) {
		list.push(makeFoe(parent, FOE_JEEP, { road: ROADS[r] }, gunnerGeo, gunnerMat));
	}
	var boats = 0;
	for (var i = 0; i < ISLANDS.length && boats < FOE_BOATS; i++) {
		if (ISLANDS[i][2] >= 330) {
			list.push(makeFoe(parent, FOE_BOAT, { island: ISLANDS[i] }, gunnerGeo, gunnerMat));
			boats++;
		}
	}
	for (var h = 0; h < FOE_HELIS; h++) {
		var post = game.outposts[(3 + h * 7) % game.outposts.length];
		list.push(makeFoe(parent, FOE_HELI, { post: post }, gunnerGeo, gunnerMat));
	}
	for (var s = 0; s < FOE_SHIPS; s++) {
		list.push(makeFoe(parent, FOE_SHIP, { island: ISLANDS[s] }, gunnerGeo, gunnerMat));
	}
	for (var g = 0; g < game.outposts.length; g++) {
		list.push(makeFoe(parent, FOE_GUN, { post: game.outposts[g] }, gunnerGeo, gunnerMat));
	}
	game.foes = list;
}

// the balls for hits on a foe. A ship is long, thus it has 3 balls. All other foes have 1.
function foePoints(foe) {
	if (foe.stats.kind !== 'ship') {
		return [new THREE.Vector3(foe.x, foe.y + 1.2, foe.z)];
	}
	var fx = -Math.sin(foe.yaw), fz = -Math.cos(foe.yaw);
	return [
		new THREE.Vector3(foe.x, 2, foe.z),
		new THREE.Vector3(foe.x + fx * 13, 2, foe.z + fz * 13),
		new THREE.Vector3(foe.x - fx * 13, 2, foe.z - fz * 13)
	];
}

// ---------- health ----------

function hurtFoe(game, foe, damage) {
	foe.hp -= damage;
	if (foe.state === 'patrol') {
		foe.state = 'chase';
		foe.timer = 1;
	}
	if (foe.hp <= 0) {
		foe.state = 'dead';
		foe.deadTime = 0;
		foe.mat.color.set(0x2a2a2a);
		foe.gunner.visible = false;
		game.kills++;
		showBlast(game, foe.x, foe.y + 1, foe.z, foe.stats.kind === 'ship' ? 22 : 7);
		playShot(0.8, 0.3);
	}
}

// an alarm calls the nearest jeep and the nearest helicopter to (x, z)
function callFoes(game, x, z) {
	var kinds = ['jeep', 'heli'];
	for (var k = 0; k < kinds.length; k++) {
		var best = null, bestD = 2500;
		for (var i = 0; i < game.foes.length; i++) {
			var foe = game.foes[i];
			var d = Math.sqrt((foe.x - x) * (foe.x - x) + (foe.z - z) * (foe.z - z));
			if (foe.stats.kind === kinds[k] && foe.state !== 'dead' && d < bestD) {
				bestD = d;
				best = foe;
			}
		}
		if (best) {
			best.callTime = 90;
			best.callX = x;
			best.callZ = z;
		}
	}
}

// ---------- movement ----------

// turn to (tx, tz) and go forward. A jeep stays on land, a boat stays on the sea.
// When the way is blocked, the foe turns on the spot to find a different way.
function steerFoe(foe, tx, tz, speed, dt) {
	var want = Math.atan2(-(tx - foe.x), -(tz - foe.z));
	var diff = Math.atan2(Math.sin(want - foe.yaw), Math.cos(want - foe.yaw));
	foe.yaw += clamp(diff, -1.6 * dt, 1.6 * dt);
	var fx = -Math.sin(foe.yaw), fz = -Math.cos(foe.yaw);
	var nx = foe.x + fx * speed * dt, nz = foe.z + fz * speed * dt;
	var here = ground(foe.x, foe.z), there = ground(nx, nz);
	var grade = (there - here) / Math.max(speed * dt, 0.01);
	var ok = foe.stats.kind === 'ship' ? there < -1.5 : foe.stats.kind === 'boat' ? there < -0.8 : (there > -0.9 && grade < 0.9);
	if (ok) {
		foe.x = nx;
		foe.z = nz;
		foe.speed = speed;
	} else {
		foe.yaw += 1.4 * dt;
		foe.speed = 0;
	}
	for (var w = 0; foe.stats.kind === 'jeep' && w < foe.spin.length; w++) {
		foe.spin[w].rotation.x -= foe.speed * dt / 0.42;
	}
	if (foe.stats.kind === 'ship') {
		foe.group.rotation.set(0, foe.yaw, 0, 'YXZ');
		foe.group.position.set(foe.x, foe.y, foe.z);
	} else {
		settleRide(foe, performance.now() / 1000);   // vehicles.js: the slope of the ground, or the waves
	}
}

// a helicopter flies to (tx, ty, tz) with inertia, and looks to (lookX, lookZ)
function flyFoe(foe, tx, ty, tz, lookX, lookZ, speed, dt) {
	var dx = tx - foe.x, dy = ty - foe.y, dz = tz - foe.z;
	var d = Math.sqrt(dx * dx + dz * dz) + 0.001;
	var v = Math.min(speed, d);
	foe.vx += (dx / d * v - foe.vx) * 1.2 * dt;
	foe.vz += (dz / d * v - foe.vz) * 1.2 * dt;
	foe.vy += (clamp(dy, -8, 8) - foe.vy) * 1.5 * dt;
	foe.x += foe.vx * dt;
	foe.y += foe.vy * dt;
	foe.z += foe.vz * dt;
	foe.y = Math.max(foe.y, ground(foe.x, foe.z) + 12);
	var want = Math.atan2(-(lookX - foe.x), -(lookZ - foe.z));
	var diff = Math.atan2(Math.sin(want - foe.yaw), Math.cos(want - foe.yaw));
	foe.yaw += clamp(diff, -1.5 * dt, 1.5 * dt);
	foe.spin[0].rotation.y += 28 * dt;
	foe.spin[1].rotation.x += 40 * dt;
	foe.group.rotation.set(-0.12, foe.yaw, 0, 'YXZ');
	foe.group.position.set(foe.x, foe.y, foe.z);
}

// the gunner of a foe shoots at you
function foeShoot(game, foe, eye, range) {
	var from = new THREE.Vector3(foe.x, foe.y + 1.7, foe.z);
	var to = eye.clone();
	to.y -= 0.25;
	var hit = Math.random() < clamp(0.42 - range / (foe.stats.reach * 2.4), 0.05, 0.4);
	if (!hit) {
		to.x += (Math.random() - 0.5) * 3.5;
		to.y += Math.random() * 1.5;
		to.z += (Math.random() - 0.5) * 3.5;
	}
	showTracer(game, from, to, 0xff9a70);
	playShot(clamp(12 / range, 0.05, 0.4), 0.9);
	if (hit) {
		game.hp -= foe.stats.damage;
		game.hurtTime = 0;
		game.hud.red.material.opacity = 0.35;
	}
}

// ---------- the kinds ----------

// jeep: go on the road, point by point, and turn back at the ends
function patrolJeep(foe, dt) {
	var road = foe.home.road;
	var p = road[foe.wp];
	if (Math.abs(p.x - foe.x) + Math.abs(p.z - foe.z) < 9) {
		if (foe.wp + foe.dir < 0 || foe.wp + foe.dir >= road.length) {
			foe.dir = -foe.dir;
		}
		foe.wp += foe.dir;
	}
	steerFoe(foe, road[foe.wp].x, road[foe.wp].z, foe.stats.speed, dt);
}

// boat or ship: go in a circle around its island. The circle of a ship is larger.
function patrolBoat(foe, dt) {
	var s = foe.home.island;
	var far = s[2] * (foe.stats.kind === 'ship' ? 2.2 : 1.7);
	var tx = s[0] + Math.cos(foe.angle) * far, tz = s[1] + Math.sin(foe.angle) * far;
	// near the point, or the point is on land (a different island is in the way): go to the next point
	if (Math.abs(tx - foe.x) + Math.abs(tz - foe.z) < 60 || ground(tx, tz) > -1.5) {
		foe.angle += 0.25;
	}
	steerFoe(foe, tx, tz, foe.stats.speed, dt);
}

// helicopter: fly from outpost to outpost
function patrolHeli(game, foe, dt) {
	if (Math.abs(foe.tx - foe.x) + Math.abs(foe.tz - foe.z) < 80) {
		var post = game.outposts[Math.floor(Math.random() * game.outposts.length)];
		foe.tx = post.x;
		foe.tz = post.z;
	}
	flyFoe(foe, foe.tx, ground(foe.x, foe.z) + 90, foe.tz, foe.tx, foe.tz, foe.stats.speed, dt);
}

// ---------- update ----------

function updateFoe(game, foe, eye, dt) {
	var stats = foe.stats;
	var p = game.player.position;
	var dx = p.x - foe.x, dz = p.z - foe.z;
	var dist = Math.sqrt(dx * dx + dz * dz);
	var range = Math.sqrt(dist * dist + (eye.y - foe.y) * (eye.y - foe.y));
	var far = stats.kind === 'ship' ? 3000 : FOE_FAR;   // a ship is large: you can see it from far

	if (foe.state === 'dead') {
		// a dead helicopter falls. All wrecks stay for some time. Then a new foe starts, if you are not near.
		foe.deadTime += dt;
		var floor = stats.kind === 'ship' ? -7 : Math.max(ground(foe.x, foe.z), stats.kind === 'boat' ? -1.5 : 0);
		if (stats.kind === 'ship' && foe.deadTime < 6 && Math.random() < dt * 2) {
			showBlast(game, foe.x + (Math.random() - 0.5) * 20, 3, foe.z + (Math.random() - 0.5) * 20, 8);   // more explosions on a ship
		}
		if (foe.y > floor) {
			foe.y = Math.max(floor, foe.y - (stats.kind === 'heli' ? 22 : 0.3) * dt);
			foe.group.rotation.y += (stats.kind === 'heli' ? 3 : 0) * dt;
			foe.group.position.set(foe.x, foe.y, foe.z);
			if (foe.y === floor && stats.kind === 'heli') {
				showBlast(game, foe.x, foe.y + 1, foe.z, 9);
				playShot(clamp(60 / range, 0.1, 1), 0.3);
			}
		}
		foe.group.visible = dist < far && foe.deadTime < 30;
		if (foe.deadTime > stats.back && dist > 350) {
			resetFoe(foe);
		}
		return;
	}

	foe.group.visible = dist < far;
	if (dist >= far && foe.callTime <= 0) {
		return;
	}

	if (foe.state === 'patrol') {
		// an alarm called this foe: go there. If not, go on the route.
		foe.callTime -= dt;
		var called = foe.callTime > 0 && Math.abs(foe.callX - foe.x) + Math.abs(foe.callZ - foe.z) > 60;
		if (stats.kind === 'jeep') {
			if (called) {
				steerFoe(foe, foe.callX, foe.callZ, stats.chase, dt);
			} else {
				patrolJeep(foe, dt);
			}
		}
		if (stats.kind === 'boat' || stats.kind === 'ship') {
			patrolBoat(foe, dt);
		}
		if (stats.kind === 'heli') {
			if (called) {
				flyFoe(foe, foe.callX, ground(foe.x, foe.z) + 70, foe.callZ, foe.callX, foe.callZ, stats.chase, dt);
			} else {
				patrolHeli(game, foe, dt);
			}
		}
		// a boat sees you only when you are on the sea or on the beach
		// a gun sees you only when you fly, or when you are near
		var wet = stats.kind !== 'boat' || ground(p.x, p.z) < 2;
		if (stats.kind === 'gun') {
			wet = game.flying || range < 120;
		}
		if (wet && (range < stats.see * game.sight || (game.noise > 0 && range < stats.see * 1.3))) {
			foe.state = 'chase';
			foe.timer = 1 + Math.random();
		}
		return;
	}

	// chase: come near, stop at some distance, shoot
	if (stats.kind === 'ship') {
		patrolBoat(foe, dt);   // a ship stays on its route
	} else if (stats.kind === 'gun') {
		foe.spin[0].lookAt(eye);   // the barrel points to you
	} else if (stats.kind === 'heli') {
		foe.angle += 0.35 * dt;
		var ox = p.x + Math.cos(foe.angle) * stats.stop, oz = p.z + Math.sin(foe.angle) * stats.stop;
		flyFoe(foe, ox, Math.max(eye.y + 38, ground(ox, oz) + 35), oz, p.x, p.z, stats.chase, dt);
	} else if (dist > stats.stop) {
		steerFoe(foe, p.x, p.z, stats.chase, dt);
	} else {
		steerFoe(foe, p.x, p.z, 0, dt);
	}
	foe.timer -= dt;
	if (foe.timer <= 0) {
		foe.timer = stats.wait + Math.random() * 0.5;
		var gun = new THREE.Vector3(foe.x, foe.y + 1.7, foe.z);
		if (range < stats.reach && clearLine(gun, eye)) {
			foeShoot(game, foe, eye, range);
		}
	}
	if (range > stats.see * 2.2) {
		foe.state = 'patrol';
	}
}

function updateFoes(game, dt) {
	var eye = new THREE.Vector3();
	game.camera.getWorldPosition(eye);
	for (var i = 0; i < game.foes.length; i++) {
		updateFoe(game, game.foes[i], eye, dt);
	}
}
