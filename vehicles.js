// island vehicles: the powered delta wing (the primary vehicle), jeeps, boats, helicopters, and the parachute.
// Also the ring course in the sky.
// Classic script. It uses ground(), clamp(), findShore() from world.js and boxesGeometry(), hurtEnemy(), getAudio() from game.js.
//
// main.js calls makeRides() one time and updateRides() each frame.
// Each frame main.js also calls one of these:
//   driveRide()   when the player is in a vehicle
//   fallPlayer()  when the player falls or hangs on the parachute
//   movePlayer()  (in main.js) when the player walks
//
// One button does all: the grip button of a Quest controller, or the E key.
//   near a vehicle: enter.  In a vehicle: exit.  In the air after an exit: open the parachute.
// Drive or fly: the left stick, or W A S D.
// The right stick up and down (or R and F): engine power of the delta wing, or up and down in the helicopter.
//
// Order of this file:
//   constants, models, make, jeep and boat, helicopter, delta wing, parachute, enter and exit, rings, sound, update.

// ---------- constants ----------

// speed in m/s, turn in radians/s. seatX, seatZ: where the player is in the vehicle. reach: distance to enter.
// eye: the height of the eyes of the player above the bottom of the vehicle. It is the same if you sit or stand
// in the real room: the game measures the height of your head when you enter, and sets the seat height from that.
var JEEP = { kind: 'jeep', speed: 22, reverse: 7, accel: 8, turn: 1.5, seatX: -0.45, seatZ: 0.35, eye: 1.95, reach: 4.5 };
var BOAT = { kind: 'boat', speed: 26, reverse: 5, accel: 6, turn: 1.1, seatX: 0, seatZ: 0.7, eye: 1.9, reach: 6.5 };
var HELI = { kind: 'heli', speed: 55, reverse: 12, climb: 11, turn: 1.2, seatX: -0.4, seatZ: -0.9, eye: 1.8, reach: 6 };
// the delta wing has an engine. thrust: m/s2 at full power. lift: m/s, it leaves the ground above this speed.
var WING = { kind: 'wing', speed: 45, thrust: 7.5, lift: 15, seatX: 0, seatZ: 0, eye: 1.75, reach: 5 };
var SPAWN_ALT = 450;     // m, the game starts on the delta wing at this height
var RING_COUNT = 14;     // rings of the course in the sky
var RING_SIZE = 24;      // m, radius of a ring
var CHUTE_FALL = 6;      // m/s, fall speed with the parachute
var DEADLY_FALL = 14;    // m/s, a landing on land faster than this kills

// ---------- models (the front points to -z) ----------

// paint is the color of the body. The enemy vehicles (foes.js) use the same models with a different paint.
function jeepModel(mat, paint) {
	var green = paint, dark = 0x26282a;
	var group = new THREE.Group();
	group.add(new THREE.Mesh(boxesGeometry([
		[1.7, 0.45, 3.5, 0, 0.75, 0, green],                                                 // body
		[1.6, 0.2, 1.2, 0, 1.05, -1.1, green],                                            // hood
		[0.1, 0.4, 1.9, -0.8, 1.15, 0.75, green], [0.1, 0.4, 1.9, 0.8, 1.15, 0.75, green],   // sides
		[1.7, 0.4, 0.1, 0, 1.15, 1.7, green],                                                // rear
		[0.5, 0.5, 0.12, -0.45, 1.2, 0.68, dark], [0.5, 0.5, 0.12, 0.45, 1.2, 0.68, dark],   // seat backs
		[0.5, 0.12, 0.5, -0.45, 1.0, 0.4, dark], [0.5, 0.12, 0.5, 0.45, 1.0, 0.4, dark],     // seats
		[0.07, 0.9, 0.07, -0.78, 1.75, 0.95, dark], [0.07, 0.9, 0.07, 0.78, 1.75, 0.95, dark], // roll bar
		[1.62, 0.07, 0.07, 0, 2.2, 0.95, dark],
		[1.8, 0.15, 0.15, 0, 0.6, -1.8, dark],                                               // bumper
		[0.25, 0.18, 0.05, -0.55, 1.0, -1.72, 0xfff2b0], [0.25, 0.18, 0.05, 0.55, 1.0, -1.72, 0xfff2b0], // lights
		[0.3, 0.3, 0.04, -0.45, 1.0, -0.62, dark],                                           // steering wheel (low, below the view)
		[0.7, 0.7, 0.2, 0, 1.2, 1.85, 0x1c1c1c]                                              // spare wheel
	]), mat));
	var wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
	wheelGeo.rotateZ(Math.PI / 2);
	var wheelMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
	var spin = [];
	var at = [[-0.85, -1.15], [0.85, -1.15], [-0.85, 1.15], [0.85, 1.15]];
	for (var i = 0; i < 4; i++) {
		var wheel = new THREE.Mesh(wheelGeo, wheelMat);
		wheel.position.set(at[i][0], 0.42, at[i][1]);
		group.add(wheel);
		spin.push(wheel);
	}
	return { group: group, spin: spin };
}

function boatModel(mat, paint) {
	var white = 0xf2f0e8, blue = paint;
	var group = new THREE.Group();
	group.add(new THREE.Mesh(boxesGeometry([
		[1.9, 0.6, 4.0, 0, 0.05, 0.2, white],                                                // hull
		[1.3, 0.55, 0.9, 0, 0.08, -2.2, white], [0.7, 0.5, 0.6, 0, 0.1, -2.9, white],        // bow
		[1.6, 0.05, 3.4, 0, 0.37, 0.3, 0x8c6f4e],                                            // floor
		[0.08, 0.25, 4.0, -0.95, 0.45, 0.2, blue], [0.08, 0.25, 4.0, 0.95, 0.45, 0.2, blue], // sides
		[1.9, 0.25, 0.08, 0, 0.45, 2.2, blue],
		[0.6, 0.6, 0.3, 0, 0.7, -0.3, white],                                                // console
		[0.35, 0.7, 0.4, 0, 0.5, 2.45, 0x222222]                                             // engine
	]), mat));
	return { group: group, spin: [] };
}

// the cabin is 2 closed boxes. From the seat you look out through them (a box is not visible from its inner side).
// spin[0] is the main rotor, spin[1] is the tail rotor.
function heliModel(mat, paint) {
	var olive = paint, dark = 0x23262a;
	var group = new THREE.Group();
	group.add(new THREE.Mesh(boxesGeometry([
		[1.8, 0.7, 3.2, 0, 0.85, -0.7, olive],                                               // lower cabin
		[1.7, 0.9, 3.0, 0, 1.65, -0.7, 0x2c3e4c],                                            // upper cabin (glass)
		[0.4, 0.4, 3.8, 0, 1.6, 2.7, olive],                                                 // tail boom
		[0.12, 1.3, 0.6, 0, 2.1, 4.4, olive],                                                // tail fin
		[0.12, 0.12, 3.2, -0.95, 0.06, -0.6, dark], [0.12, 0.12, 3.2, 0.95, 0.06, -0.6, dark], // skids
		[0.08, 0.5, 0.08, -0.95, 0.3, -1.5, dark], [0.08, 0.5, 0.08, 0.95, 0.3, -1.5, dark],
		[0.08, 0.5, 0.08, -0.95, 0.3, 0.3, dark], [0.08, 0.5, 0.08, 0.95, 0.3, 0.3, dark],
		[0.25, 0.45, 0.25, 0, 2.3, -0.5, dark]                                               // rotor mast
	]), mat));
	var rotor = new THREE.Mesh(boxesGeometry([
		[10, 0.05, 0.32, 0, 0, 0, dark], [0.32, 0.05, 10, 0, 0, 0, dark]
	]), mat);
	rotor.position.set(0, 2.55, -0.5);
	var tail = new THREE.Mesh(boxesGeometry([
		[0.05, 1.8, 0.2, 0, 0, 0, dark], [0.05, 0.2, 1.8, 0, 0, 0, dark]
	]), mat);
	tail.position.set(0.2, 2.2, 4.4);
	group.add(rotor);
	group.add(tail);
	return { group: group, spin: [rotor, tail] };
}

// a bar from point a to point b
function barMesh(a, b, mat) {
	var bar = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 1), mat);
	bar.position.copy(a).add(b).multiplyScalar(0.5);
	bar.lookAt(b);
	bar.scale.z = a.distanceTo(b);
	return bar;
}

// a powered delta wing (a trike). The pilot is at the origin, the sail is above the head,
// the control bar is in front of the chest, the engine and the propeller are behind.
// spin[0] is the propeller.
function wingModel(mat) {
	var group = new THREE.Group();
	var sail = new THREE.BufferGeometry();
	sail.setAttribute('position', new THREE.Float32BufferAttribute([
		0, 2.65, -1.7, -4.6, 2.5, 1.5, 0, 2.5, 0.9,
		0, 2.65, -1.7, 0, 2.5, 0.9, 4.6, 2.5, 1.5
	], 3));
	sail.setAttribute('color', new THREE.Float32BufferAttribute([
		1, 0.75, 0.1, 0.9, 0.2, 0.1, 1, 0.75, 0.1,
		1, 0.75, 0.1, 1, 0.75, 0.1, 0.9, 0.2, 0.1
	], 3));
	sail.computeVertexNormals();
	group.add(new THREE.Mesh(sail, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
	var metal = new THREE.MeshLambertMaterial({ color: 0x9aa0a6 });
	var top = new THREE.Vector3(0, 2.55, -0.3), left = new THREE.Vector3(-0.85, 0.95, -0.8), right = new THREE.Vector3(0.85, 0.95, -0.8);
	group.add(barMesh(top, left, metal));
	group.add(barMesh(top, right, metal));
	group.add(barMesh(left, right, metal));
	group.add(barMesh(new THREE.Vector3(0, 2.62, -1.7), new THREE.Vector3(0, 2.5, 0.9), metal));
	group.add(barMesh(top, new THREE.Vector3(0, 0.5, 0.7), metal));   // mast to the cart
	var dark = 0x26282a;
	group.add(new THREE.Mesh(boxesGeometry([
		[0.36, 0.1, 1.7, 0, 0.3, 0.3, 0xc8261a],                                           // floor of the cart (narrow: you look down past it)
		[0.5, 0.5, 0.1, 0, 0.75, 0.55, dark],                                              // seat back
		[0.45, 0.4, 0.45, 0, 0.75, 0.95, dark],                                            // engine
		[0.16, 0.3, 0.16, -0.7, 0.15, 0.6, dark], [0.16, 0.3, 0.16, 0.7, 0.15, 0.6, dark], // rear wheels
		[1.4, 0.06, 0.06, 0, 0.3, 0.6, 0x9aa0a6],                                          // axle
		[0.12, 0.3, 0.14, 0, 0.15, -0.5, dark]                                             // front wheel
	]), mat));
	var prop = new THREE.Mesh(boxesGeometry([[1.7, 0.12, 0.04, 0, 0, 0, 0x3a2a1c], [0.12, 1.7, 0.04, 0, 0, 0, 0x3a2a1c]]), mat);
	prop.position.set(0, 0.95, 1.25);
	group.add(prop);
	return { group: group, spin: [prop] };
}

// the parachute: a round canopy above the player, and lines. It is a child of the player group.
function chuteModel() {
	var group = new THREE.Group();
	var canopy = new THREE.Mesh(new THREE.SphereGeometry(3.6, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.45),
		new THREE.MeshLambertMaterial({ color: 0xf07a1a, side: THREE.DoubleSide }));
	canopy.position.y = 4.2;
	group.add(canopy);
	var points = [];
	for (var i = 0; i < 8; i++) {
		var a = i / 8 * Math.PI * 2;
		points.push(0, 1.5, 0, Math.cos(a) * 3.5, 4.8, Math.sin(a) * 3.5);
	}
	var lines = new THREE.BufferGeometry();
	lines.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
	group.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0xffffff })));
	group.visible = false;
	return group;
}

// ---------- make ----------

function makeRide(parent, stats, x, z, yaw, mat) {
	var model = stats.kind === 'jeep' ? jeepModel(mat, 0x556b3a) : stats.kind === 'boat' ? boatModel(mat, 0x1f5fa8) : stats.kind === 'heli' ? heliModel(mat, 0x5a6240) : wingModel(mat);
	var ride = {
		stats: stats, group: model.group, spin: model.spin,
		x: x, z: z, y: stats.kind === 'boat' ? 0 : Math.max(ground(x, z), 0), yaw: yaw,
		seatY: 0,                   // height of the feet of the player in the vehicle (set when the player enters)
		speed: 0,                   // forward speed (jeep, boat, delta wing)
		vx: 0, vy: 0, vz: 0,        // velocity (helicopter)
		pitch: 0, roll: 0, rotor: 0, // delta wing angles, rotor speed 0 to 1
		throttle: 0,                // delta wing: engine power, 0 to 1
		follow: false               // delta wing: true when it flies to the player with no pilot
	};
	model.group.rotation.order = 'YXZ';
	model.group.position.set(ride.x, ride.y, ride.z);
	model.group.rotation.y = yaw;
	parent.add(model.group);
	return ride;
}

// the camp and each outpost get a jeep and a boat. The boat is at the nearest point of the open sea.
// The camp and each third outpost get a helicopter. The camp and each outpost get a delta wing.
// More delta wings are on the volcano and on the mountains.
function makeRides(game, parent, camp, jx, outposts) {
	var mat = new THREE.MeshLambertMaterial({ vertexColors: true });
	var rides = {
		list: [], current: null,
		fall: null,           // { vx, vy, vz, chute } when the player is in the air with no vehicle
		chute: chuteModel(),
		startWing: null,      // your own delta wing: the game starts on it, and it comes to you when you left it in the air
		rings: null, ring: 0, laps: 0,   // the ring course
		started: false,       // the first flight waits for the first click, key or VR session
		want: false, keyDown: false, engine: null
	};
	game.player.add(rides.chute);
	rides.list.push(makeRide(parent, JEEP, jx - 34, camp.z - 8, 1, mat));
	rides.list.push(makeRide(parent, BOAT, jx + JETTY_LEN + 3.5, camp.z, 0, mat));
	rides.list.push(makeRide(parent, HELI, jx - 46, camp.z + 16, 1.5, mat));
	for (var i = 0; i < outposts.length; i++) {
		var o = outposts[i];
		var shore = findShore(o.x, o.z);
		rides.list.push(makeRide(parent, JEEP, o.x + 8, o.z + 8, i * 1.3, mat));
		rides.list.push(makeRide(parent, BOAT, shore.x, shore.z, i * 2.1, mat));
		rides.list.push(makeRide(parent, WING, o.x - 20, o.z - 22, i * 1.7, mat));
		if (i % 3 === 0) {
			rides.list.push(makeRide(parent, HELI, o.x - 14, o.z + 2, i * 0.9, mat));
		}
	}
	rides.list.push(makeRide(parent, WING, jx - 30, camp.z + 24, 2.2, mat));
	rides.list.push(makeRide(parent, WING, VOLC_X, VOLC_Z + CRATER_R + 14, 0, mat));
	rides.list.push(makeRide(parent, WING, VOLC_X - CRATER_R - 14, VOLC_Z, 0, mat));
	rides.list.push(makeRide(parent, WING, -850, 100, 0, mat));
	rides.list.push(makeRide(parent, WING, 2650, -2150, 0, mat));
	rides.startWing = makeRide(parent, WING, 0, 0, 0, mat);
	rides.list.push(rides.startWing);
	rides.rings = makeRings(parent);
	game.ringTotal = RING_COUNT;

	// the grip button of each controller
	for (var h = 0; h < game.hands.length; h++) {
		game.hands[h].controller.addEventListener('squeezestart', function () {
			rides.want = true;
		});
	}
	// the first flight starts at the first click, key, or VR session
	function go() {
		rides.started = true;
	}
	window.addEventListener('keydown', go);
	window.addEventListener('pointerdown', go);
	game.renderer.xr.addEventListener('sessionstart', go);
	return rides;
}

// put the player on the own delta wing, high in the air, with the nose to the camp and the engine on.
// This is the start of the game, and the start after each death.
function startFlight(game, rides) {
	var wing = rides.startWing;
	wing.x = game.start.x - 300;
	wing.z = game.start.z - 2300;
	wing.y = SPAWN_ALT;
	wing.yaw = Math.atan2(wing.x - game.start.x, wing.z - game.start.z);
	wing.speed = 30;
	wing.throttle = 0.6;
	wing.pitch = 0;
	wing.roll = 0;
	wing.follow = false;
	wing.seatY = clamp(WING.eye - game.camera.position.y, 0, 1.4);
	rides.current = wing;
	rides.fall = null;
	rides.chute.visible = false;
	game.player.position.set(wing.x, wing.y, wing.z);
	game.player.rotation.y = wing.yaw;
	placeRide(wing);
}

function placeRide(ride) {
	ride.group.position.set(ride.x, ride.y, ride.z);
}

// ---------- jeep and boat ----------

// put the model at its position. A jeep follows the slope of the ground. A boat floats.
function settleRide(ride, time) {
	var fx = -Math.sin(ride.yaw), fz = -Math.cos(ride.yaw);
	var part = ride.speed / ride.stats.speed;
	if (ride.stats.kind === 'boat') {
		ride.y = 0.05 + Math.sin(time * 1.7 + ride.x) * 0.05;
		ride.group.rotation.set(part * 0.1 + Math.sin(time * 1.3 + ride.z) * 0.02, ride.yaw, Math.sin(time * 1.1 + ride.x) * 0.03, 'YXZ');
	} else {
		var front = ground(ride.x + fx * 1.4, ride.z + fz * 1.4), back = ground(ride.x - fx * 1.4, ride.z - fz * 1.4);
		var right = ground(ride.x - fz * 0.85, ride.z + fx * 0.85), left = ground(ride.x + fz * 0.85, ride.z - fx * 0.85);
		ride.y = Math.max((front + back + right + left) / 4, -1.2);
		ride.group.rotation.set(Math.atan2(front - back, 2.8), ride.yaw, Math.atan2(right - left, 1.7), 'YXZ');
	}
	placeRide(ride);
}

// input.mz is the throttle (-1 = full forward), input.mx is the steering
function driveGround(game, ride, input, dt) {
	var stats = ride.stats;
	var throttle = Math.abs(input.mz) > 0.15 ? -input.mz : 0;
	var steer = Math.abs(input.mx) > 0.15 ? input.mx : 0;

	// speed: go to the target speed. Braking is 2 times faster than acceleration.
	var target = throttle > 0 ? throttle * stats.speed : throttle * stats.reverse;
	var change = target - ride.speed;
	var brake = Math.abs(target) < Math.abs(ride.speed) || target * ride.speed < 0;
	ride.speed += clamp(change, -stats.accel * dt * (brake ? 2 : 1), stats.accel * dt * (brake ? 2 : 1));

	// steering: it needs speed, and it is opposite in reverse
	ride.yaw -= steer * stats.turn * dt * clamp(ride.speed / 6, -1, 1);

	// move, if the next point is good for this vehicle
	var fx = -Math.sin(ride.yaw), fz = -Math.cos(ride.yaw);
	var nx = clamp(ride.x + fx * ride.speed * dt, -SIZE / 2 + 20, SIZE / 2 - 20);
	var nz = clamp(ride.z + fz * ride.speed * dt, -SIZE / 2 + 20, SIZE / 2 - 20);
	var here = ground(ride.x, ride.z), there = ground(nx, nz);
	var grade = (there - here) / Math.max(Math.abs(ride.speed * dt), 0.01);   // slope in the direction of the movement
	var ok = stats.kind === 'boat' ? there < -0.5 : (there > -1.1 && grade < 0.9);
	if (ok) {
		ride.x = nx;
		ride.z = nz;
	} else {
		ride.speed = 0;
	}
	if (stats.kind === 'jeep') {
		// slower up a hill and in water
		ride.speed -= ride.speed * clamp(Math.max(0, grade) * 1.6 + (here < -0.3 ? 2 : 0), 0, 5) * dt;
		for (var w = 0; w < ride.spin.length; w++) {
			ride.spin[w].rotation.x -= ride.speed * dt / 0.42;
		}
		// a fast jeep kills the enemies that it hits
		for (var i = 0; i < game.enemies.length; i++) {
			var e = game.enemies[i];
			if (e.state !== 'dead' && Math.abs(ride.speed) > 5 && Math.abs(e.x - ride.x) < 1.7 && Math.abs(e.z - ride.z) < 1.7) {
				hurtEnemy(game, e, 500);
			}
		}
	}
	settleRide(ride, performance.now() / 1000);
}

// ---------- helicopter ----------

// left stick: forward and back, and turn. input.up: +1 = up, -1 = down.
// The helicopter has inertia: it goes slowly to the speed that you ask for.
function flyHeli(ride, input, dt) {
	var stats = ride.stats;
	var push = Math.abs(input.mz) > 0.15 ? -input.mz : 0;
	var steer = Math.abs(input.mx) > 0.15 ? input.mx : 0;
	var up = Math.abs(input.up) > 0.15 ? input.up : 0;
	var floor = Math.max(ground(ride.x, ride.z), -0.2);
	var onGround = ride.y <= floor + 0.05;

	ride.rotor = Math.min(1, ride.rotor + dt * 0.7);
	ride.yaw -= steer * stats.turn * dt;
	var fx = -Math.sin(ride.yaw), fz = -Math.cos(ride.yaw);
	var want = push > 0 ? push * stats.speed : push * stats.reverse;
	if (onGround) {
		want = 0;   // no movement on the skids
	}
	ride.vx += (fx * want - ride.vx) * (onGround ? 4 : 0.9) * dt;
	ride.vz += (fz * want - ride.vz) * (onGround ? 4 : 0.9) * dt;
	ride.vy += (up * stats.climb * ride.rotor - ride.vy) * 2 * dt;

	ride.x = clamp(ride.x + ride.vx * dt, -SIZE / 2 + 20, SIZE / 2 - 20);
	ride.z = clamp(ride.z + ride.vz * dt, -SIZE / 2 + 20, SIZE / 2 - 20);
	ride.y = Math.min(ride.y + ride.vy * dt, 1500);
	floor = Math.max(ground(ride.x, ride.z), -0.2);
	if (ride.y < floor) {
		ride.y = floor;
		ride.vy = Math.max(ride.vy, 0);
	}

	// the nose goes down when the helicopter goes forward
	var forward = ride.vx * fx + ride.vz * fz;
	ride.group.rotation.set(-forward / stats.speed * 0.28, ride.yaw, -steer * 0.18 * Math.abs(forward) / stats.speed, 'YXZ');
	placeRide(ride);
}

// a helicopter with no pilot: it comes down slowly, and the rotor stops
function parkHeli(ride, dt) {
	var floor = Math.max(ground(ride.x, ride.z), -0.2);
	ride.rotor = Math.max(0, ride.rotor - dt * 0.25);
	if (ride.y > floor) {
		ride.y = Math.max(floor, ride.y - 8 * dt);
		ride.x += ride.vx * dt;
		ride.z += ride.vz * dt;
		ride.vx -= ride.vx * dt;
		ride.vz -= ride.vz * dt;
		ride.group.rotation.set(0, ride.yaw, 0, 'YXZ');
		placeRide(ride);
	}
}

// ---------- delta wing ----------

// The delta wing has an engine. input.up changes the power (right stick, or R and F). The power stays where you put it.
// In the air: stick forward = nose down, stick back = nose up, stick left and right = turn.
//   With power you fly level or go up. With no power you glide down slowly.
// On the ground or on the water: the wing rolls. Above the lift speed it goes up again.
//   To land: decrease the power and come down. To stop: no power.
function flyWing(ride, input, dt) {
	var stats = ride.stats;
	var push = Math.abs(input.mz) > 0.15 ? -input.mz : 0;
	var steer = Math.abs(input.mx) > 0.15 ? input.mx : 0;
	var power = Math.abs(input.up) > 0.15 ? input.up : 0;
	ride.throttle = clamp(ride.throttle + power * 0.8 * dt, 0, 1);

	var floor = Math.max(ground(ride.x, ride.z), 0);
	var fx = -Math.sin(ride.yaw), fz = -Math.cos(ride.yaw);
	if (ride.y <= floor + 0.05) {
		// on the ground: engine, friction, steering
		ride.speed += (stats.thrust * ride.throttle - 2 - 0.003 * ride.speed * ride.speed) * dt;
		ride.speed = Math.max(ride.speed, 0);
		ride.yaw -= steer * 1.2 * dt * Math.min(1, ride.speed / 4);
		var nx = clamp(ride.x + fx * ride.speed * dt, -SIZE / 2 + 20, SIZE / 2 - 20);
		var nz = clamp(ride.z + fz * ride.speed * dt, -SIZE / 2 + 20, SIZE / 2 - 20);
		var next = Math.max(ground(nx, nz), 0);
		if ((next - floor) / Math.max(ride.speed * dt, 0.01) > 0.7) {
			ride.speed = 0;   // a wall of rock
		} else {
			ride.x = nx;
			ride.z = nz;
		}
		ride.y = Math.max(ground(ride.x, ride.z), 0);
		ride.pitch = 0;
		ride.roll = 0;
		// fast: leave the ground
		if (ride.speed > stats.lift && push < 0.3) {
			ride.y += 0.3;
			ride.pitch = 0.15;
		}
	} else {
		// in the air. With half power or more, the wing flies level when the stick is free.
		// With less power it glides down. glide is 1 with no power and 0 from half power.
		var glide = clamp(1 - ride.throttle * 2, 0, 1);
		var wantPitch = -0.08 * glide - push * (push > 0 ? 0.45 : 0.4);
		if (ride.y < floor + 25 && ride.throttle > 0.5 && push <= 0) {
			wantPitch = Math.max(wantPitch, 0.18);   // after the start: go up
		}
		ride.pitch += (wantPitch - ride.pitch) * 2 * dt;
		ride.roll += (steer * 0.75 - ride.roll) * 2.5 * dt;
		ride.yaw -= ride.roll * 0.9 * dt;

		// speed from the engine, gravity and drag. At low speed the wing does not carry and goes down fast.
		ride.speed += (stats.thrust * ride.throttle - 9 * Math.sin(ride.pitch) - 0.003 * ride.speed * ride.speed) * dt;
		ride.speed = clamp(ride.speed, 6, stats.speed);
		var sink = 1.2 * glide + Math.max(0, 13 - ride.speed) * 0.5;
		ride.x = clamp(ride.x + fx * ride.speed * Math.cos(ride.pitch) * dt, -SIZE / 2 + 20, SIZE / 2 - 20);
		ride.z = clamp(ride.z + fz * ride.speed * Math.cos(ride.pitch) * dt, -SIZE / 2 + 20, SIZE / 2 - 20);
		ride.vy = ride.speed * Math.sin(ride.pitch) - sink;
		ride.y = Math.min(ride.y + ride.vy * dt, 2000);
		floor = Math.max(ground(ride.x, ride.z), 0);
		if (ride.y <= floor) {
			ride.y = floor;   // landing. The wing rolls on.
			ride.vy = 0;
		}
	}
	ride.spin[0].rotation.z += (4 + ride.throttle * 40) * dt;
	ride.group.rotation.set(ride.pitch, ride.yaw, -ride.roll, 'YXZ');
	placeRide(ride);
}

// a wing with no pilot. In the air it comes down.
// Your own wing, when you left it in the air (ride.follow), flies to you and lands near you.
function parkWing(ride, dt, player) {
	var floor = Math.max(ground(ride.x, ride.z), 0);
	ride.throttle = 0;
	ride.speed = 0;
	if (ride.follow) {
		var dx = player.x - ride.x, dz = player.z - ride.z;
		var d = Math.sqrt(dx * dx + dz * dz);
		if (d > 9) {
			ride.x += dx / d * 24 * dt;
			ride.z += dz / d * 24 * dt;
			ride.yaw = Math.atan2(-dx, -dz);
			ride.spin[0].rotation.z += 30 * dt;
		}
		floor = Math.max(ground(ride.x, ride.z), 0);
		ride.y = Math.max(floor, ride.y - (d > 60 ? 4 : 10) * dt);
		ride.follow = d > 9 || ride.y > floor;
		ride.group.rotation.set(0, ride.yaw, 0, 'YXZ');
		placeRide(ride);
	} else if (ride.y > floor) {
		ride.y = Math.max(floor, ride.y - 12 * dt);
		ride.group.rotation.set(0, ride.yaw, 0, 'YXZ');
		placeRide(ride);
	}
}

// ---------- the player in a vehicle ----------

function driveRide(game, rides, input, dt) {
	var ride = rides.current, stats = ride.stats;
	var oldYaw = ride.yaw;
	var p = game.player;
	var x0 = ride.x, y0 = ride.y, z0 = ride.z;

	if (stats.kind === 'wing') {
		// the first flight waits for the first click, key, or VR session
		if (rides.started) {
			flyWing(ride, input, dt);
		}
	} else if (stats.kind === 'heli') {
		flyHeli(ride, input, dt);
	} else {
		driveGround(game, ride, input, dt);
	}
	// the velocity of the vehicle, for the bombs (weapons.js)
	if (dt > 0) {
		game.flyVel.set((ride.x - x0) / dt, (ride.y - y0) / dt, (ride.z - z0) / dt);
	}

	// the player is on the seat, and turns with the vehicle.
	// The seat goes up and down with the slope of the vehicle, but the player stays upright (this is better in VR).
	ride.group.updateMatrixWorld(true);
	p.position.set(stats.seatX, ride.seatY, stats.seatZ).applyMatrix4(ride.group.matrixWorld);
	p.rotation.y += ride.yaw - oldYaw;
}

// ---------- parachute ----------

// the player is in the air with no vehicle. With no parachute the fall is fast.
// With the parachute the fall is slow, and the left stick moves the player (in the direction of the head).
function fallPlayer(game, rides, input, dt) {
	var f = rides.fall, p = game.player.position;
	if (f.chute) {
		var dir = new THREE.Vector3();
		game.camera.getWorldDirection(dir);
		dir.y = 0;
		dir.normalize();
		var mx = Math.abs(input.mx) > 0.15 ? input.mx : 0;
		var mz = Math.abs(input.mz) > 0.15 ? input.mz : 0;
		f.vx += ((-dir.x * mz - dir.z * mx) * 8 - f.vx) * 1.5 * dt;
		f.vz += ((-dir.z * mz + dir.x * mx) * 8 - f.vz) * 1.5 * dt;
		f.vy += (-CHUTE_FALL - f.vy) * 3 * dt;
	} else {
		f.vx -= f.vx * 0.3 * dt;
		f.vz -= f.vz * 0.3 * dt;
		f.vy = Math.max(f.vy - 9.8 * dt, -55);
	}
	p.x = clamp(p.x + f.vx * dt, -SIZE / 2 + 10, SIZE / 2 - 10);
	p.z = clamp(p.z + f.vz * dt, -SIZE / 2 + 10, SIZE / 2 - 10);
	p.y += f.vy * dt;

	// landing. A fast landing on land kills. Deep water is safe.
	var h = ground(p.x, p.z);
	if (p.y <= Math.max(h, -0.6)) {
		if (f.vy < -DEADLY_FALL && h > -1.5) {
			game.hp = -1;
		}
		rides.fall = null;
		rides.chute.visible = false;
	}
}

// ---------- enter and exit ----------

// one button: open the parachute, or exit the vehicle, or enter the nearest vehicle
function toggleRide(game, rides) {
	var p = game.player.position;
	if (rides.fall) {
		rides.fall.chute = true;
		rides.chute.visible = true;
		return;
	}
	if (rides.current) {
		var r = rides.current;
		var fx = -Math.sin(r.yaw), fz = -Math.cos(r.yaw);
		var air = r.y > Math.max(ground(r.x, r.z), 0) + 3;
		rides.current = null;
		if (air) {
			// exit in the air: the player falls with the velocity of the vehicle
			var vx = r.stats.kind === 'heli' ? r.vx : fx * r.speed;
			var vz = r.stats.kind === 'heli' ? r.vz : fz * r.speed;
			rides.fall = { vx: vx, vy: Math.min(r.vy, 0), vz: vz, chute: false };
			p.y -= 2;
			r.follow = r === rides.startWing;   // your own wing comes to you after you land
		} else {
			// exit to the left side
			p.x = r.x + fz * 2.3;
			p.z = r.z - fx * 2.3;
		}
		r.speed = 0;
		return;
	}
	for (var i = 0; i < rides.list.length; i++) {
		var ride = rides.list[i];
		var d = Math.sqrt((ride.x - p.x) * (ride.x - p.x) + (ride.z - p.z) * (ride.z - p.z));
		if (d < ride.stats.reach && Math.abs(ride.y - p.y) < 4) {
			rides.current = ride;
			// seat height: put the eyes at stats.eye. camera.position.y is the height of the head in the real room.
			ride.seatY = ride.stats.eye > 0 ? clamp(ride.stats.eye - game.camera.position.y, 0, 1.4) : 0;
			ride.follow = false;
			ride.throttle = 0;
			if (!game.renderer.xr.isPresenting) {
				game.player.rotation.y = ride.yaw;
			}
			return;
		}
	}
}

// ---------- rings ----------

// a course of rings in the sky around the main island. Fly through the yellow ring, then the next ring becomes yellow.
// One lap gives 10 more maximum health.
function makeRings(parent) {
	var geo = new THREE.TorusGeometry(RING_SIZE, 1.3, 6, 28);
	var list = [];
	for (var i = 0; i < RING_COUNT; i++) {
		var a = i / RING_COUNT * Math.PI * 2;
		var far = 1750 + Math.sin(i * 2.3) * 450;
		var x = Math.cos(a) * far, z = Math.sin(a) * far;
		var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, fog: false, toneMapped: false }));
		mesh.position.set(x, Math.max(ground(x, z), 0) + 90 + (Math.sin(i * 1.7) + 1) * 130, z);
		mesh.rotation.y = -a;   // the hole points along the circle
		parent.add(mesh);
		list.push(mesh);
	}
	return list;
}

function updateRings(game, rides) {
	var p = game.player.position;
	for (var i = 0; i < rides.rings.length; i++) {
		var ring = rides.rings[i];
		var next = i === rides.ring;
		ring.material.color.set(next ? 0xffd84a : 0xffffff);
		ring.material.opacity = next ? 1 : 0.3;
		ring.visible = Math.abs(ring.position.x - p.x) + Math.abs(ring.position.z - p.z) < (next ? 6000 : 2500);
	}
	var target = rides.rings[rides.ring].position;
	if (rides.current && target.distanceTo(p) < RING_SIZE) {
		rides.ring++;
		playShot(0.3, 3);
		if (rides.ring === rides.rings.length) {
			rides.ring = 0;
			rides.laps++;
			game.maxHp += 10;
			game.hp = game.maxHp;
		}
	}
	game.ringDone = rides.ring;
}

// ---------- sound ----------

// engine sound: one low tone. The pitch goes up with the speed. The helicopter has a fast beat.
function engineSound(rides) {
	var ac = getAudio();
	if (!ac) {
		return;
	}
	if (!rides.engine) {
		var osc = ac.createOscillator(), filter = ac.createBiquadFilter(), gain = ac.createGain();
		var beat = ac.createOscillator(), beatGain = ac.createGain();
		osc.type = 'sawtooth';
		filter.type = 'lowpass';
		filter.frequency.value = 320;
		gain.gain.value = 0;
		beat.type = 'square';
		beat.frequency.value = 19;
		beatGain.gain.value = 0;
		osc.connect(filter);
		filter.connect(gain);
		gain.connect(ac.destination);
		beat.connect(beatGain);
		beatGain.connect(gain.gain);
		osc.start();
		beat.start();
		rides.engine = { osc: osc, gain: gain, beatGain: beatGain };
	}
	var r = rides.current;
	var kind = r ? r.stats.kind : '';
	var speed = r ? (kind === 'heli' ? Math.sqrt(r.vx * r.vx + r.vz * r.vz) * 0.4 : Math.abs(r.speed)) : 0;
	rides.engine.osc.frequency.value = kind === 'wing' ? 50 + r.throttle * 70 : (kind === 'heli' ? 62 : 38) + speed * 4;
	rides.engine.gain.gain.value = !r ? 0 : kind === 'wing' ? 0.012 + r.throttle * 0.035 : 0.05;
	rides.engine.beatGain.gain.value = kind === 'heli' ? 0.04 : 0;
}

// ---------- update ----------

// each frame: the button, the hint on the HUD, the vehicles with no driver, the sound
function updateRides(game, rides, keys, dt) {
	var inVR = game.renderer.xr.isPresenting;
	var p = game.player.position;
	var time = performance.now() / 1000;
	var key = inVR ? 'GRIP: ' : 'E: ';

	// the E key: one action for each press
	if (keys.KeyE && !rides.keyDown) {
		rides.want = true;
	}
	rides.keyDown = keys.KeyE === true;
	// the player died: start again on the delta wing
	if (game.restarted) {
		startFlight(game, rides);
		game.restarted = false;
		rides.want = false;
	}
	if (rides.want) {
		toggleRide(game, rides);
		rides.want = false;
	}

	// the hint on the HUD
	var cur = rides.current;
	game.hint = '';
	if (cur && !rides.started) {
		game.hint = 'CLICK: START';
	} else if (cur && cur.stats.kind === 'wing') {
		// altitude and engine power. On the ground with no power: how to start.
		var alt = Math.round((cur.y - Math.max(ground(cur.x, cur.z), 0)) / 5) * 5;
		game.hint = alt === 0 && cur.throttle < 0.05 ? (inVR ? 'R STICK UP: GO' : 'R: POWER') : 'ALT ' + alt + ' P' + Math.round(cur.throttle * 10) * 10;
	} else if (cur && cur.stats.kind === 'heli') {
		game.hint = 'ALT ' + Math.round((cur.y - Math.max(ground(cur.x, cur.z), 0)) / 5) * 5 + ' m';
	} else if (cur) {
		game.hint = key + 'EXIT';
	} else if (rides.fall && !rides.fall.chute) {
		game.hint = key + 'CHUTE';
	}

	for (var i = 0; i < rides.list.length; i++) {
		var ride = rides.list[i];
		var d = Math.sqrt((ride.x - p.x) * (ride.x - p.x) + (ride.z - p.z) * (ride.z - p.z));
		ride.group.visible = d < 900;
		if (ride !== cur) {
			if (ride.stats.kind === 'boat' && d < 300) {
				settleRide(ride, time);
			}
			if (ride.stats.kind === 'heli') {
				parkHeli(ride, dt);
			}
			if (ride.stats.kind === 'wing') {
				parkWing(ride, dt, p);
			}
			if (!cur && !rides.fall && d < ride.stats.reach && Math.abs(ride.y - p.y) < 4) {
				game.hint = key + (ride.stats.kind === 'heli' || ride.stats.kind === 'wing' ? 'FLY' : 'DRIVE');
			}
		}
		// rotors
		if (ride.stats.kind === 'heli') {
			ride.spin[0].rotation.y += ride.rotor * 28 * dt;
			ride.spin[1].rotation.x += ride.rotor * 40 * dt;
		}
	}
	game.flying = cur !== null && (cur.stats.kind === 'wing' || cur.stats.kind === 'heli');
	if (!cur) {
		game.flyVel.set(0, 0, 0);
	}
	updateRings(game, rides);
	if (rides.started && (cur || rides.engine)) {
		engineSound(rides);
	}
}
