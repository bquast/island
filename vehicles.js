// island vehicles: jeeps and boats.
// Classic script. It uses ground(), clamp(), findShore() from world.js and boxesGeometry(), hurtEnemy(), getAudio() from game.js.
// main.js calls makeRides() one time, and updateRides() each frame.
// When the player is in a vehicle, main.js calls driveRide() and does not call movePlayer().
//
// Enter or exit: the grip button of a Quest controller, or the E key.
// Drive: the left stick, or W A S D.

// ---------- constants ----------

// speed in m/s, turn in radians/s. seatX, seatZ, seatY: where the player is in the vehicle. reach: distance to enter.
var JEEP = { boat: false, speed: 22, reverse: 7, accel: 8, turn: 1.5, seatX: -0.45, seatZ: 0.25, seatY: 0.35, reach: 4.5 };
var BOAT = { boat: true, speed: 19, reverse: 5, accel: 6, turn: 1.1, seatX: 0, seatZ: 0.7, seatY: 0.35, reach: 6.5 };

// ---------- models (the front points to -z) ----------

function jeepModel(mat) {
	var green = 0x556b3a, dark = 0x26282a;
	var group = new THREE.Group();
	group.add(new THREE.Mesh(boxesGeometry([
		[1.7, 0.45, 3.5, 0, 0.75, 0, green],                                                 // body
		[1.6, 0.3, 1.2, 0, 1.1, -1.1, 0x4d6235],                                             // hood
		[0.1, 0.4, 1.9, -0.8, 1.15, 0.75, green], [0.1, 0.4, 1.9, 0.8, 1.15, 0.75, green],   // sides
		[1.7, 0.4, 0.1, 0, 1.15, 1.7, green],                                                // rear
		[0.5, 0.5, 0.12, -0.45, 1.2, 0.68, dark], [0.5, 0.5, 0.12, 0.45, 1.2, 0.68, dark],   // seat backs
		[0.5, 0.12, 0.5, -0.45, 1.0, 0.4, dark], [0.5, 0.12, 0.5, 0.45, 1.0, 0.4, dark],     // seats
		[0.06, 0.7, 0.06, -0.78, 1.6, -0.5, dark], [0.06, 0.7, 0.06, 0.78, 1.6, -0.5, dark], // windshield frame
		[1.62, 0.06, 0.06, 0, 1.95, -0.5, dark],
		[0.07, 0.9, 0.07, -0.78, 1.75, 0.95, dark], [0.07, 0.9, 0.07, 0.78, 1.75, 0.95, dark], // roll bar
		[1.62, 0.07, 0.07, 0, 2.2, 0.95, dark],
		[1.8, 0.15, 0.15, 0, 0.6, -1.8, dark],                                               // bumper
		[0.25, 0.18, 0.05, -0.55, 1.0, -1.72, 0xfff2b0], [0.25, 0.18, 0.05, 0.55, 1.0, -1.72, 0xfff2b0], // lights
		[0.3, 0.3, 0.05, -0.45, 1.35, -0.3, dark],                                           // steering wheel
		[0.7, 0.7, 0.2, 0, 1.2, 1.85, 0x1c1c1c]                                              // spare wheel
	]), mat));
	var wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
	wheelGeo.rotateZ(Math.PI / 2);
	var wheelMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
	var wheels = [];
	var at = [[-0.85, -1.15], [0.85, -1.15], [-0.85, 1.15], [0.85, 1.15]];
	for (var i = 0; i < 4; i++) {
		var wheel = new THREE.Mesh(wheelGeo, wheelMat);
		wheel.position.set(at[i][0], 0.42, at[i][1]);
		group.add(wheel);
		wheels.push(wheel);
	}
	return { group: group, wheels: wheels };
}

function boatModel(mat) {
	var white = 0xf2f0e8, blue = 0x1f5fa8;
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
	return { group: group, wheels: [] };
}

// ---------- make ----------

function makeRide(parent, stats, x, z, yaw, mat) {
	var model = stats.boat ? boatModel(mat) : jeepModel(mat);
	var ride = { stats: stats, group: model.group, wheels: model.wheels, x: x, z: z, y: 0, yaw: yaw, speed: 0 };
	model.group.rotation.order = 'YXZ';
	parent.add(model.group);
	settleRide(ride, 0);
	return ride;
}

// one jeep and one boat for the camp and for each outpost. The boat is at the nearest point of the open sea.
function makeRides(game, parent, camp, jx, outposts) {
	var mat = new THREE.MeshLambertMaterial({ vertexColors: true });
	var rides = { list: [], current: null, want: false, keyDown: false, engine: null };
	rides.list.push(makeRide(parent, JEEP, jx - 34, camp.z - 8, 1, mat));
	rides.list.push(makeRide(parent, BOAT, jx + JETTY_LEN + 3.5, camp.z, 0, mat));
	for (var i = 0; i < outposts.length; i++) {
		var o = outposts[i];
		var shore = findShore(o.x, o.z);
		rides.list.push(makeRide(parent, JEEP, o.x + 8, o.z + 8, i * 1.3, mat));
		rides.list.push(makeRide(parent, BOAT, shore.x, shore.z, i * 2.1, mat));
	}
	// the grip button of each controller
	for (var h = 0; h < game.hands.length; h++) {
		game.hands[h].controller.addEventListener('squeezestart', function () {
			rides.want = true;
		});
	}
	return rides;
}

// ---------- position on the ground or the water ----------

// put the model at its position. A jeep follows the slope of the ground. A boat floats.
function settleRide(ride, time) {
	var fx = -Math.sin(ride.yaw), fz = -Math.cos(ride.yaw);
	var part = ride.speed / ride.stats.speed;
	if (ride.stats.boat) {
		ride.y = 0.05 + Math.sin(time * 1.7 + ride.x) * 0.05;
		ride.group.rotation.set(part * 0.1 + Math.sin(time * 1.3 + ride.z) * 0.02, ride.yaw, Math.sin(time * 1.1 + ride.x) * 0.03, 'YXZ');
	} else {
		var front = ground(ride.x + fx * 1.4, ride.z + fz * 1.4), back = ground(ride.x - fx * 1.4, ride.z - fz * 1.4);
		var right = ground(ride.x - fz * 0.85, ride.z + fx * 0.85), left = ground(ride.x + fz * 0.85, ride.z - fx * 0.85);
		ride.y = Math.max((front + back + right + left) / 4, -1.2);
		ride.group.rotation.set(Math.atan2(front - back, 2.8), ride.yaw, Math.atan2(right - left, 1.7), 'YXZ');
	}
	ride.group.position.set(ride.x, ride.y, ride.z);
}

// ---------- drive ----------

// input.mz is the throttle (-1 = full forward), input.mx is the steering
function driveRide(game, rides, input, dt) {
	var ride = rides.current, stats = ride.stats;
	var throttle = Math.abs(input.mz) > 0.15 ? -input.mz : 0;
	var steer = Math.abs(input.mx) > 0.15 ? input.mx : 0;

	// speed: go to the target speed. Braking is 2 times faster than acceleration.
	var target = throttle > 0 ? throttle * stats.speed : throttle * stats.reverse;
	var change = target - ride.speed;
	var brake = Math.abs(target) < Math.abs(ride.speed) || target * ride.speed < 0;
	ride.speed += clamp(change, -stats.accel * dt * (brake ? 2 : 1), stats.accel * dt * (brake ? 2 : 1));

	// steering: it needs speed, and it is opposite in reverse
	var oldYaw = ride.yaw;
	ride.yaw -= steer * stats.turn * dt * clamp(ride.speed / 6, -1, 1);

	// move, if the next point is good for this vehicle
	var fx = -Math.sin(ride.yaw), fz = -Math.cos(ride.yaw);
	var nx = clamp(ride.x + fx * ride.speed * dt, -SIZE / 2 + 20, SIZE / 2 - 20);
	var nz = clamp(ride.z + fz * ride.speed * dt, -SIZE / 2 + 20, SIZE / 2 - 20);
	var here = ground(ride.x, ride.z), there = ground(nx, nz);
	var grade = (there - here) / Math.max(Math.abs(ride.speed * dt), 0.01);   // slope in the direction of the movement
	var ok = stats.boat ? there < -0.5 : (there > -1.1 && grade < 0.9);
	if (ok) {
		ride.x = nx;
		ride.z = nz;
	} else {
		ride.speed = 0;
	}
	if (!stats.boat) {
		// slower up a hill and in water
		ride.speed -= ride.speed * clamp(Math.max(0, grade) * 1.6 + (here < -0.3 ? 2 : 0), 0, 5) * dt;
		for (var w = 0; w < ride.wheels.length; w++) {
			ride.wheels[w].rotation.x -= ride.speed * dt / 0.42;
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

	// the player is on the seat, and turns with the vehicle.
	// The seat goes up and down with the slope of the vehicle, but the player stays upright (this is better in VR).
	var p = game.player;
	ride.group.updateMatrixWorld(true);
	p.position.set(stats.seatX, stats.seatY, stats.seatZ).applyMatrix4(ride.group.matrixWorld);
	p.rotation.y += ride.yaw - oldYaw;
}

// enter the nearest vehicle, or exit the vehicle
function toggleRide(game, rides) {
	var p = game.player.position;
	if (rides.current) {
		// exit to the left side
		var r = rides.current;
		var fx = -Math.sin(r.yaw), fz = -Math.cos(r.yaw);
		p.x = r.x + fz * 2.3;
		p.z = r.z - fx * 2.3;
		r.speed = 0;
		rides.current = null;
		return;
	}
	for (var i = 0; i < rides.list.length; i++) {
		var ride = rides.list[i];
		var d = Math.sqrt((ride.x - p.x) * (ride.x - p.x) + (ride.z - p.z) * (ride.z - p.z));
		if (d < ride.stats.reach) {
			rides.current = ride;
			if (!game.renderer.xr.isPresenting) {
				game.player.rotation.y = ride.yaw;
			}
			return;
		}
	}
}

// engine sound: one low tone. The pitch goes up with the speed.
function engineSound(rides) {
	var ac = getAudio();
	if (!ac) {
		return;
	}
	if (!rides.engine) {
		var osc = ac.createOscillator(), filter = ac.createBiquadFilter(), gain = ac.createGain();
		osc.type = 'sawtooth';
		filter.type = 'lowpass';
		filter.frequency.value = 320;
		gain.gain.value = 0;
		osc.connect(filter);
		filter.connect(gain);
		gain.connect(ac.destination);
		osc.start();
		rides.engine = { osc: osc, gain: gain };
	}
	rides.engine.osc.frequency.value = rides.current ? 38 + Math.abs(rides.current.speed) * 4 : 38;
	rides.engine.gain.gain.value = rides.current ? 0.05 : 0;
}

// each frame: the enter/exit button, the hint on the HUD, the boats on the waves, the engine sound
function updateRides(game, rides, keys, dt) {
	var inVR = game.renderer.xr.isPresenting;
	var p = game.player.position;
	var time = performance.now() / 1000;

	// the E key: one action for each press
	if (keys.KeyE && !rides.keyDown) {
		rides.want = true;
	}
	rides.keyDown = keys.KeyE === true;
	if (game.restarted) {
		rides.current = null;
		game.restarted = false;
	}
	if (rides.want) {
		toggleRide(game, rides);
		rides.want = false;
	}

	game.hint = rides.current ? (inVR ? 'GRIP: EXIT' : 'E: EXIT') : '';
	for (var i = 0; i < rides.list.length; i++) {
		var ride = rides.list[i];
		var d = Math.sqrt((ride.x - p.x) * (ride.x - p.x) + (ride.z - p.z) * (ride.z - p.z));
		ride.group.visible = d < 700;
		if (ride.stats.boat && ride !== rides.current && d < 300) {
			settleRide(ride, time);
		}
		if (!rides.current && d < ride.stats.reach) {
			game.hint = inVR ? 'GRIP: DRIVE' : 'E: DRIVE';
		}
	}
	if (rides.current || rides.engine) {
		engineSound(rides);
	}
}
