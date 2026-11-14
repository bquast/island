// island weapons: rockets, grenades, explosions, barrels, and the change of guns.
// Classic script. It uses game.js (guns, enemies, effects, sound), foes.js (enemy vehicles) and life.js (animals).
// main.js calls makeWeapons() one time and updateWeapons() each frame.
//
// Right hand: the A button (or Q, or the keys 1 2 3) changes the gun: rifle, sniper rifle, rocket launcher.
// Left hand: the X button (or G) throws a grenade.
// Desktop: hold Shift with the sniper rifle to zoom.
//
// Order of this file:
//   constants, explosions, flying shots, barrels, ray targets, change of guns, make and update.

// ---------- constants ----------

var ROCKET_BLAST = { radius: 10, damage: 420 };
var GRENADE_BLAST = { radius: 8, damage: 300 };
var BARREL_BLAST = { radius: 9, damage: 300 };
var GRENADE_WAIT = 1.2;    // s between grenades

// ---------- explosions ----------

// the picture of an explosion: a ball of fire that grows and fades
function makeBlasts(scene, tex, count) {
	var list = [];
	for (var i = 0; i < count; i++) {
		var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffa030, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
		sprite.visible = false;
		scene.add(sprite);
		list.push({ mesh: sprite, life: 0, size: 1 });
	}
	return list;
}

function showBlast(game, x, y, z, size) {
	var b = game.blasts[game.nextBlast];
	game.nextBlast = (game.nextBlast + 1) % game.blasts.length;
	b.mesh.position.set(x, y + size * 0.3, z);
	b.mesh.visible = true;
	b.life = 0.7;
	b.size = size;
}

function updateBlasts(game, dt) {
	for (var i = 0; i < game.blasts.length; i++) {
		var b = game.blasts[i];
		b.life -= dt;
		b.mesh.visible = b.life > 0;
		var age = 1 - clamp(b.life / 0.7, 0, 1);
		var s = b.size * (0.5 + age * 1.6);
		b.mesh.scale.set(s * 1.6, s * 1.2, 1);
		b.mesh.material.opacity = 1 - age * age;
		b.mesh.material.color.setRGB(1, 0.75 - age * 0.55, 0.3 - age * 0.3);
	}
}

// an explosion at (x, y, z). It hurts all things in the radius: enemies, enemy vehicles, animals, barrels, and you.
// The damage is full at the center and 0 at the radius.
function explode(game, x, y, z, blast) {
	function part(px, py, pz) {
		var d = Math.sqrt((px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z));
		return clamp(1 - d / blast.radius, 0, 1);
	}
	showBlast(game, x, y, z, blast.radius);
	var eye = new THREE.Vector3();
	game.camera.getWorldPosition(eye);
	var far = eye.distanceTo(new THREE.Vector3(x, y, z));
	playShot(clamp(60 / far, 0.1, 1), 0.3);
	game.noise = 3;

	for (var i = 0; i < game.enemies.length; i++) {
		var e = game.enemies[i];
		var p = part(e.x, e.y + 1, e.z);
		if (e.state !== 'dead' && p > 0) {
			hurtEnemy(game, e, blast.damage * p);
		}
	}
	for (var f = 0; f < game.foes.length; f++) {
		var foe = game.foes[f];
		var pf = part(foe.x, foe.y + 1, foe.z);
		if (foe.state !== 'dead' && pf > 0) {
			hurtFoe(game, foe, blast.damage * pf);
		}
	}
	for (var a = 0; a < game.animals.length; a++) {
		var animal = game.animals[a];
		var pa = part(animal.x, animal.y, animal.z);
		if (animal.hp > 0 && pa > 0) {
			hurtAnimal(game, animal, blast.damage * pa);
		}
	}
	// a barrel in the radius explodes a moment later
	for (var b = 0; b < game.barrels.length; b++) {
		var barrel = game.barrels[b];
		if (barrel.alive && barrel.fuse < 0 && part(barrel.x, barrel.y, barrel.z) > 0) {
			barrel.fuse = 0.12 + Math.random() * 0.2;
		}
	}
	var me = part(eye.x, eye.y - 0.8, eye.z);
	if (me > 0) {
		game.hp -= blast.damage * me * 0.25;
		game.hurtTime = 0;
		game.hud.red.material.opacity = 0.5;
	}
}

// ---------- flying shots: rockets and grenades ----------

function makeShots(scene, count) {
	var rocketGeo = new THREE.BoxGeometry(0.09, 0.09, 0.6);
	var mat = new THREE.MeshLambertMaterial({ color: 0x3a4032 });
	var list = [];
	for (var i = 0; i < count; i++) {
		var mesh = new THREE.Mesh(rocketGeo, mat);
		mesh.visible = false;
		scene.add(mesh);
		list.push({ mesh: mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, kind: '', smoke: 0 });
	}
	return list;
}

// kind is 'rocket' or 'grenade'. vel is the velocity in m/s.
function launchShot(game, pos, vel, kind) {
	var s = game.shots[game.nextShot];
	game.nextShot = (game.nextShot + 1) % game.shots.length;
	s.pos.copy(pos);
	s.vel.copy(vel);
	s.kind = kind;
	s.life = kind === 'rocket' ? 8 : 6;
	s.smoke = 0;
	s.mesh.scale.set(1, 1, kind === 'rocket' ? 1 : 0.25);
	s.mesh.visible = true;
}

// a shot explodes when it hits the ground, the sea, an enemy, or an enemy vehicle
function updateShots(game, dt) {
	for (var i = 0; i < game.shots.length; i++) {
		var s = game.shots[i];
		if (s.life <= 0) {
			continue;
		}
		s.life -= dt;
		s.vel.y -= (s.kind === 'rocket' ? 2 : 9.8) * dt;
		s.pos.addScaledVector(s.vel, dt);
		s.mesh.position.copy(s.pos);
		s.mesh.lookAt(s.pos.x + s.vel.x, s.pos.y + s.vel.y, s.pos.z + s.vel.z);

		// a line of smoke behind a rocket
		s.smoke -= dt;
		if (s.kind === 'rocket' && s.smoke <= 0) {
			s.smoke = 0.05;
			showPuff(game, s.pos, 0xdddddd, 0.6);
		}

		var hit = s.pos.y <= Math.max(ground(s.pos.x, s.pos.z), 0) || s.life <= 0;
		for (var e = 0; e < game.enemies.length && !hit; e++) {
			var en = game.enemies[e];
			hit = en.state !== 'dead' && Math.abs(en.x - s.pos.x) < 1 && Math.abs(en.z - s.pos.z) < 1 && s.pos.y > en.y && s.pos.y < en.y + 2.2;
		}
		for (var f = 0; f < game.foes.length && !hit; f++) {
			var foe = game.foes[f];
			hit = foe.state !== 'dead' && s.pos.distanceTo(new THREE.Vector3(foe.x, foe.y + 1.2, foe.z)) < foe.size + 0.5;
		}
		if (hit) {
			s.life = 0;
			s.mesh.visible = false;
			explode(game, s.pos.x, s.pos.y, s.pos.z, s.kind === 'rocket' ? ROCKET_BLAST : GRENADE_BLAST);
		}
	}
}

// throw a grenade from the left hand (VR) or from the camera (desktop)
function throwGrenade(game) {
	var inVR = game.renderer.xr.isPresenting;
	var from = game.camera;
	for (var i = 0; inVR && i < game.hands.length; i++) {
		if (game.hands[i].side === 'left') {
			from = game.hands[i].controller;
		}
	}
	from.updateWorldMatrix(true, false);
	var dir = new THREE.Vector3(0, 0, -1).transformDirection(from.matrixWorld);
	var pos = new THREE.Vector3().setFromMatrixPosition(from.matrixWorld).addScaledVector(dir, 0.4);
	launchShot(game, pos, dir.multiplyScalar(19).add(new THREE.Vector3(0, 5, 0)), 'grenade');
}

// ---------- barrels ----------

// 3 red barrels in each outpost. A shot or an explosion makes a barrel explode.
function makeBarrels(parent, outposts) {
	var geo = new THREE.CylinderGeometry(0.4, 0.4, 1.1, 10);
	var mat = new THREE.MeshLambertMaterial({ color: 0xc8261a });
	var at = [[3, -4], [4.1, -4.4], [-7, -3]];
	var list = [];
	for (var i = 0; i < outposts.length; i++) {
		for (var k = 0; k < at.length; k++) {
			var x = outposts[i].x + at[k][0], z = outposts[i].z + at[k][1];
			var mesh = new THREE.Mesh(geo, mat);
			mesh.position.set(x, ground(x, z) + 0.55, z);
			parent.add(mesh);
			list.push({ mesh: mesh, x: x, y: ground(x, z) + 0.55, z: z, alive: true, fuse: -1 });
		}
	}
	return list;
}

function updateBarrels(game, dt) {
	for (var i = 0; i < game.barrels.length; i++) {
		var b = game.barrels[i];
		if (b.alive && b.fuse >= 0) {
			b.fuse -= dt;
			if (b.fuse < 0) {
				b.alive = false;
				b.mesh.visible = false;
				explode(game, b.x, b.y, b.z, BARREL_BLAST);
			}
		}
	}
}

// ---------- ray targets ----------

// the nearest thing on the ray of a gun that is not a person and not the ground:
// an enemy vehicle, a barrel, an alarm box, or an animal.
// Returns { t, act } or null. t is the distance. act(damage) applies the hit.
function rayOthers(game, o, d, maxT) {
	var best = null, bestT = maxT;
	function test(x, y, z, r, act) {
		var t = raySphere(o, d, x, y, z, r);
		if (t >= 0 && t < bestT) {
			bestT = t;
			best = act;
		}
	}
	game.foes.forEach(function (foe) {
		if (foe.state !== 'dead') {
			test(foe.x, foe.y + 1.2, foe.z, foe.size, function (damage) { hurtFoe(game, foe, damage); });
		}
	});
	game.barrels.forEach(function (b) {
		if (b.alive) {
			test(b.x, b.y, b.z, 0.6, function () { b.fuse = 0; });
		}
	});
	game.outposts.forEach(function (post) {
		if (!post.alarmOff) {
			test(post.box.position.x, post.box.position.y, post.box.position.z, 0.45, function () { stopAlarm(post); });
		}
	});
	game.animals.forEach(function (animal) {
		if (animal.hp > 0) {
			test(animal.x, animal.y + animal.kind.aimY, animal.z, animal.kind.size, function (damage) { hurtAnimal(game, animal, damage); });
		}
	});
	return best ? { t: bestT, act: best } : null;
}

// ---------- change of guns ----------

// the hand that has the 3 guns: the right controller in VR, the desktop hand if not
function mainHand(game) {
	if (!game.renderer.xr.isPresenting) {
		return game.desk;
	}
	for (var i = 0; i < game.hands.length; i++) {
		if (game.hands[i].side === 'right' && game.hands[i].guns) {
			return game.hands[i];
		}
	}
	return null;
}

// ---------- make and update ----------

function makeWeapons(game, parent, puffTex) {
	game.blasts = makeBlasts(game.scene, puffTex, 6);
	game.nextBlast = 0;
	game.shots = makeShots(game.scene, 8);
	game.nextShot = 0;
	game.barrels = makeBarrels(parent, game.outposts);
	game.grenadeWait = 0;
	game.wasA = false;
	game.wasX = false;
}

// input.a = the A button or Q (next gun). input.x = the X button or G (grenade).
function updateWeapons(game, input, keys, dt) {
	var hand = mainHand(game);
	if (hand) {
		if (input.a && !game.wasA) {
			selectGun(hand, (hand.index + 1) % hand.guns.length);
		}
		if (keys.Digit1) { selectGun(hand, 0); }
		if (keys.Digit2) { selectGun(hand, 1); }
		if (keys.Digit3) { selectGun(hand, 2); }
		game.gunName = hand.stats.name;
	}
	game.wasA = input.a;

	game.grenadeWait -= dt;
	if (input.x && !game.wasX && game.grenadeWait <= 0) {
		throwGrenade(game);
		game.grenadeWait = GRENADE_WAIT;
	}
	game.wasX = input.x;

	// desktop: Shift with the sniper rifle = zoom
	var fov = !game.renderer.xr.isPresenting && hand && hand.stats === SNIPER && (keys.ShiftLeft || keys.ShiftRight) ? 16 : 70;
	if (!game.renderer.xr.isPresenting && game.camera.fov !== fov) {
		game.camera.fov = fov;
		game.camera.updateProjectionMatrix();
	}

	updateShots(game, dt);
	updateBarrels(game, dt);
	updateBlasts(game, dt);
}
