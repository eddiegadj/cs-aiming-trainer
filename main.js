import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

(function () {
  "use strict";

  const gameContainer = document.getElementById("gameContainer");
  const crosshair = document.getElementById("crosshair");
  const flashOverlay = document.getElementById("flashOverlay");
  const countdownEl = document.getElementById("countdown");
  const resultsOverlay = document.getElementById("resultsOverlay");
  const overlay = document.getElementById("overlay");
  const resultScoreEl = document.getElementById("resultScore");
  const resultHitsEl = document.getElementById("resultHits");
  const resultMissesEl = document.getElementById("resultMisses");
  const resultAccuracyEl = document.getElementById("resultAccuracy");
  const resultReactionEl = document.getElementById("resultReaction");
  const resultsBackBtn = document.getElementById("resultsBackBtn");
  const resultsStartAgainBtn = document.getElementById("resultsStartAgainBtn");
  const arena = document.querySelector(".arena");
  const startBtn = document.getElementById("startBtn");
  const resetBtn = document.getElementById("resetBtn");
  const mapSelect = document.getElementById("mapSelect");
  const targetSizeSelect = document.getElementById("targetSize");
  const durationInput = document.getElementById("duration");
  const sensitivityInput = document.getElementById("sensitivity");
  const sensitivityValueEl = document.getElementById("sensitivityValue");

  const SPAWN_DISTANCE = 18 * 2.2;
  const SPAWN_SPREAD = 8;
  const SENSITIVITY_DEG = 0.12;
  const MOVE_SPEED = 18;
  const EYE_HEIGHT = 1.7;
  const ROOM_HALF = 24;
  const ROOM_HEIGHT = 8;
  const ROOM_SPAWN_MARGIN = 3;
  const MIN_SPAWN_DISTANCE = 5;
  const GRAVITY = 20;
  const JUMP_VELOCITY = 7;
  const WALL_MARGIN = 0.5;
  const WALL_DEPTH = 0.5;

  // Square map: 4 perimeter walls [x, z, width, depth]. Map -24..24.
  const SQUARE_WALLS = [
    [ -ROOM_HALF - WALL_DEPTH / 2, -ROOM_HALF, WALL_DEPTH, ROOM_HALF * 2 ],
    [ ROOM_HALF, -ROOM_HALF, WALL_DEPTH, ROOM_HALF * 2 ],
    [ -ROOM_HALF, -ROOM_HALF - WALL_DEPTH / 2, ROOM_HALF * 2, WALL_DEPTH ],
    [ -ROOM_HALF, ROOM_HALF, ROOM_HALF * 2, WALL_DEPTH ],
  ];

  // WALLS map (de_dust2-style layout): [x, z, width, depth]. Map -24..24.
  const WALLS_MAP = [
    [ -ROOM_HALF, -ROOM_HALF, ROOM_HALF * 2, 1 ],
    [ -ROOM_HALF, ROOM_HALF - 1, ROOM_HALF * 2, 1 ],
    [ -ROOM_HALF, -ROOM_HALF, 1, ROOM_HALF * 2 ],
    [ ROOM_HALF - 1, -ROOM_HALF, 1, ROOM_HALF * 2 ],
    [ 8, -ROOM_HALF, 1, ROOM_HALF * 2 ],
    [ 8, -8, 16, 1 ],
    [ -8, -ROOM_HALF, 1, 40 ],
    [ -ROOM_HALF, 8, 16, 1 ],
  ];

  let scene, camera, renderer, rendererCanvas, raycaster, mouseNDC;
  let targetsGroup;
  let dust2Walls = [];
  let floorMesh = null;
  let wallMeshes = [];
  let animationId = null;
  let clock = new THREE.Clock();
  const keys = { w: false, s: false, a: false, d: false };

  let state = {
    playing: false,
    targets: [],
    score: 0,
    hits: 0,
    misses: 0,
    reactions: [],
    roundEndAt: 0,
    roundTimerId: null,
    spawnIntervalId: null,
    yaw: 0,
    pitch: 0,
    velocityY: 0,
    flashHitUntil: 0,
    flashMissUntil: 0,
  };

  function buildMap(mapId) {
    if (floorMesh) {
      scene.remove(floorMesh);
      floorMesh.geometry.dispose();
      floorMesh.material.dispose();
      floorMesh = null;
    }
    wallMeshes.forEach((mesh) => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    wallMeshes = [];

    const roomGeo = new THREE.PlaneGeometry(ROOM_HALF * 2, ROOM_HALF * 2);
    const roomMat = new THREE.MeshStandardMaterial({
      color: 0x444c56,
      metalness: 0.05,
      roughness: 0.9,
    });
    floorMesh = new THREE.Mesh(roomGeo, roomMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const wallRects = mapId === "walls" ? WALLS_MAP : SQUARE_WALLS;
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x545d68,
      metalness: 0.05,
      roughness: 0.9,
    });
    const wallHeight = ROOM_HEIGHT;
    dust2Walls = wallRects.map(([x, z, w, d]) => {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(w, wallHeight, d),
        wallMat
      );
      wall.position.set(x + w / 2, wallHeight / 2, z + d / 2);
      scene.add(wall);
      wallMeshes.push(wall);
      return { x, z, w, d };
    });
  }

  function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2d333b);

    const width = gameContainer.clientWidth;
    const height = gameContainer.clientHeight;
    camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(0, EYE_HEIGHT, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererCanvas = renderer.domElement;
    gameContainer.insertBefore(rendererCanvas, crosshair);

    const ambient = new THREE.AmbientLight(0xa0a8b8, 1.3);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(8, 14, 10);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0xe8ecf0, 0.5);
    fill.position.set(-6, 4, -8);
    scene.add(fill);

    targetsGroup = new THREE.Group();
    scene.add(targetsGroup);

    buildMap(mapSelect.value);

    raycaster = new THREE.Raycaster();
    mouseNDC = new THREE.Vector2(0, 0);

    window.addEventListener("resize", onResize);
  }

  function onResize() {
    const width = gameContainer.clientWidth;
    const height = gameContainer.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function getTargetRadius() {
    const v = targetSizeSelect.value;
    if (v === "24") return 0.35;
    if (v === "44") return 0.7;
    return 0.5;
  }

  function getForward() {
    const v = new THREE.Vector3(0, 0, -1);
    v.applyEuler(new THREE.Euler(state.pitch, state.yaw, 0, "YXZ"));
    return v;
  }

  function spawnTarget() {
    const radius = getTargetRadius();
    const eyeY = camera.position.y;
    const heightRange = eyeY * 0.3;
    const targetY = eyeY + (Math.random() - 0.5) * 2 * heightRange;
    const minXZ = -ROOM_HALF + ROOM_SPAWN_MARGIN;
    const maxXZ = ROOM_HALF - ROOM_SPAWN_MARGIN;

    let pos = new THREE.Vector3();
    for (let tries = 0; tries < 40; tries++) {
      pos.set(
        minXZ + Math.random() * (maxXZ - minXZ),
        targetY,
        minXZ + Math.random() * (maxXZ - minXZ)
      );
      if (pointInWall(pos.x, pos.z)) continue;
      const dx = pos.x - camera.position.x;
      const dz = pos.z - camera.position.z;
      if (dx * dx + dz * dz >= MIN_SPAWN_DISTANCE * MIN_SPAWN_DISTANCE) break;
    }
    pos.y = targetY;

    const geometry = new THREE.SphereGeometry(radius, 24, 24);
    const material = new THREE.MeshStandardMaterial({
      color: 0xf85149,
      metalness: 0.2,
      roughness: 0.6,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(pos);
    mesh.userData.spawnedAt = performance.now();
    targetsGroup.add(mesh);
    state.targets.push({ mesh, spawnedAt: mesh.userData.spawnedAt });
  }

  function removeTarget(obj) {
    const idx = state.targets.findIndex((t) => t.mesh === obj);
    if (idx !== -1) state.targets.splice(idx, 1);
    targetsGroup.remove(obj);
    obj.geometry.dispose();
    obj.material.dispose();
  }

  function updateCameraRotation() {
    camera.rotation.order = "YXZ";
    camera.rotation.y = state.yaw;
    camera.rotation.x = state.pitch;
  }

  function updateMovement(dt) {
    const forward = getForward();
    const forwardXZ = new THREE.Vector3(forward.x, 0, forward.z).normalize();
    const rightXZ = new THREE.Vector3(-forwardXZ.z, 0, forwardXZ.x);
    let dx = 0,
      dz = 0;
    if (keys.w) { dx += forwardXZ.x; dz += forwardXZ.z; }
    if (keys.s) { dx -= forwardXZ.x; dz -= forwardXZ.z; }
    if (keys.d) { dx += rightXZ.x; dz += rightXZ.z; }
    if (keys.a) { dx -= rightXZ.x; dz -= rightXZ.z; }
    if (dx !== 0 || dz !== 0) {
      const len = Math.sqrt(dx * dx + dz * dz);
      const scale = (MOVE_SPEED * dt) / len;
      camera.position.x += dx * scale;
      camera.position.z += dz * scale;
    }

    state.velocityY -= GRAVITY * dt;
    camera.position.y += state.velocityY * dt;
    if (camera.position.y <= EYE_HEIGHT) {
      camera.position.y = EYE_HEIGHT;
      state.velocityY = 0;
    }
    const maxY = ROOM_HEIGHT - 0.5;
    if (camera.position.y > maxY) {
      camera.position.y = maxY;
      state.velocityY = 0;
    }

    camera.position.x = Math.max(-ROOM_HALF, Math.min(ROOM_HALF, camera.position.x));
    camera.position.z = Math.max(-ROOM_HALF, Math.min(ROOM_HALF, camera.position.z));

    for (let iter = 0; iter < 3; iter++) {
      for (const wall of dust2Walls) {
        const { x, z, w, d } = wall;
        const left = x - WALL_MARGIN, right = x + w + WALL_MARGIN;
        const bottom = z - WALL_MARGIN, top = z + d + WALL_MARGIN;
        const px = camera.position.x, pz = camera.position.z;
        if (px >= left && px <= right && pz >= bottom && pz <= top) {
          const dl = px - left, dr = right - px, db = pz - bottom, dt = top - pz;
          const minD = Math.min(dl, dr, db, dt);
          if (minD === dl) camera.position.x = left;
          else if (minD === dr) camera.position.x = right;
          else if (minD === db) camera.position.z = bottom;
          else camera.position.z = top;
        }
      }
    }
  }

  function pointInWall(x, z) {
    for (const wall of dust2Walls) {
      const { x: wx, z: wz, w, d } = wall;
      const left = wx - WALL_MARGIN, right = wx + w + WALL_MARGIN;
      const bottom = wz - WALL_MARGIN, top = wz + d + WALL_MARGIN;
      if (x >= left && x <= right && z >= bottom && z <= top) return true;
    }
    return false;
  }

  function raycastCenter() {
    raycaster.setFromCamera(mouseNDC, camera);
    const meshes = state.targets.map((t) => t.mesh);
    const hits = raycaster.intersectObjects(meshes);
    return hits.length > 0 ? hits[0] : null;
  }

  function showFlash(kind) {
    flashOverlay.classList.remove("flash-hit", "flash-miss");
    flashOverlay.classList.add(kind);
    setTimeout(() => flashOverlay.classList.remove("flash-hit", "flash-miss"), 80);
  }

  let resultsButtonsCooldownId = null;

  function showResults() {
    resultScoreEl.textContent = state.score;
    resultHitsEl.textContent = state.hits;
    resultMissesEl.textContent = state.misses;
    const total = state.hits + state.misses;
    resultAccuracyEl.textContent =
      total > 0 ? Math.round((state.hits / total) * 100) + "%" : "—";
    const avgMs = state.reactions.length > 0
      ? state.reactions.reduce((a, b) => a + b, 0) / state.reactions.length
      : 0;
    resultReactionEl.textContent =
      state.reactions.length > 0
        ? (avgMs >= 1000 ? (avgMs / 1000).toFixed(1) + " sec" : avgMs.toFixed(0) + " ms")
        : "—";
    resultsOverlay.classList.remove("hidden");
    resultsOverlay.setAttribute("aria-hidden", "false");

    resultsBackBtn.disabled = true;
    resultsStartAgainBtn.disabled = true;
    if (resultsButtonsCooldownId) clearTimeout(resultsButtonsCooldownId);
    resultsButtonsCooldownId = setTimeout(() => {
      resultsButtonsCooldownId = null;
      resultsBackBtn.disabled = false;
      resultsStartAgainBtn.disabled = false;
    }, 2000);
  }

  function goToMain() {
    resultsOverlay.classList.add("hidden");
    resultsOverlay.setAttribute("aria-hidden", "true");
    overlay.classList.remove("hidden");
  }

  function endRound() {
    state.playing = false;
    document.exitPointerLock();
    clearInterval(state.spawnIntervalId);
    clearTimeout(state.roundTimerId);
    state.spawnIntervalId = null;
    state.roundTimerId = null;
    arena.classList.remove("playing");
    updateStats();
    state.targets.slice().forEach((t) => removeTarget(t.mesh));
    showResults();
  }

  function updateStats() {
    const scoreEl = document.querySelector('[data-stat="score"] strong');
    const hitsEl = document.querySelector('[data-stat="hits"] strong');
    const missesEl = document.querySelector('[data-stat="misses"] strong');
    const accEl = document.querySelector('[data-stat="accuracy"] strong');
    const reactEl = document.querySelector('[data-stat="reaction"] strong');
    if (!scoreEl) return; // main-page stats commented out

    scoreEl.textContent = state.score;
    hitsEl.textContent = state.hits;
    missesEl.textContent = state.misses;

    const total = state.hits + state.misses;
    if (total > 0) {
      accEl.textContent = Math.round((state.hits / total) * 100) + "%";
    } else {
      accEl.textContent = "—";
    }

    if (state.reactions.length > 0) {
      const avg = state.reactions.reduce((a, b) => a + b, 0) / state.reactions.length;
      reactEl.textContent = avg >= 1000 ? (avg / 1000).toFixed(1) + " sec" : avg.toFixed(0) + " ms";
    } else {
      reactEl.textContent = "—";
    }
  }

  function onClick(e) {
    if (!state.playing) return;
    e.preventDefault();
    const hit = raycastCenter();
    if (hit) {
      const target = state.targets.find((t) => t.mesh === hit.object);
      if (target) {
        state.hits++;
        const reactionMs = performance.now() - target.spawnedAt;
        state.score += Math.max(5, 50 - Math.floor(reactionMs / 20));
        state.reactions.push(reactionMs);
        removeTarget(hit.object);
        showFlash("flash-hit");
      }
    } else {
      state.misses++;
      showFlash("flash-miss");
    }
    updateStats();
  }

  function startRound() {
    const durationSec = Math.max(5, Number(durationInput.value) || 60);
    state.playing = true;
    state.targets = [];
    state.yaw = 0;
    state.pitch = 0;
    state.velocityY = 0;
    state.roundEndAt = performance.now() + durationSec * 1000;
    camera.position.set(0, EYE_HEIGHT, 0);
    keys.w = keys.s = keys.a = keys.d = false;
    arena.classList.add("playing");
    overlay.classList.add("hidden");
    updateCameraRotation();

    rendererCanvas.requestPointerLock();

    spawnTarget();
    state.spawnIntervalId = setInterval(() => {
      if (!state.playing) return;
      if (performance.now() >= state.roundEndAt) {
        endRound();
        return;
      }
      spawnTarget();
    }, 800);

    state.roundTimerId = setTimeout(endRound, durationSec * 1000);
    updateStats();
  }

  function reset() {
    document.exitPointerLock();
    if (state.roundTimerId) clearTimeout(state.roundTimerId);
    if (state.spawnIntervalId) clearInterval(state.spawnIntervalId);
    state.targets.slice().forEach((t) => removeTarget(t.mesh));
    state.playing = false;
    state.targets = [];
    state.score = 0;
    state.hits = 0;
    state.misses = 0;
    state.reactions = [];
    state.roundEndAt = 0;
    state.roundTimerId = null;
    state.spawnIntervalId = null;
    state.yaw = 0;
    state.pitch = 0;
    state.velocityY = 0;
    state.flashHitUntil = 0;
    state.flashMissUntil = 0;
    camera.position.set(0, EYE_HEIGHT, 0);
    keys.w = keys.s = keys.a = keys.d = false;
    arena.classList.remove("playing");
    overlay.classList.remove("hidden");
    overlay.querySelector(".overlay-message").innerHTML =
      "Improve your Counter-Strike aim: crosshair stays center, move the mouse to aim and click to shoot. Hit red targets, practice flick shots and reaction time—misses count against accuracy.";
    updateStats();
    updateCameraRotation();
  }

  function onMouseMove(e) {
    if (!state.playing) return;
    const dx = e.movementX;
    const dy = e.movementY;
    if (dx === 0 && dy === 0) return;
    const sens = (Number(sensitivityInput.value) || 1.3) * SENSITIVITY_DEG * (Math.PI / 180);
    state.yaw -= dx * sens;
    state.pitch -= dy * sens;
    state.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, state.pitch));
    updateCameraRotation();
  }

  function updateCountdown() {
    if (!state.playing || !state.roundEndAt) {
      countdownEl.classList.remove("visible");
      countdownEl.textContent = "";
      countdownEl.setAttribute("aria-hidden", "true");
      return;
    }
    const remaining = state.roundEndAt - performance.now();
    if (remaining <= 0) {
      countdownEl.classList.remove("visible");
      countdownEl.textContent = "";
      countdownEl.setAttribute("aria-hidden", "true");
      return;
    }
    if (remaining <= 5000) {
      const sec = Math.ceil(remaining / 1000);
      countdownEl.textContent = String(sec);
      countdownEl.classList.add("visible");
      countdownEl.setAttribute("aria-hidden", "false");
    } else {
      countdownEl.classList.remove("visible");
      countdownEl.textContent = "";
      countdownEl.setAttribute("aria-hidden", "true");
    }
  }

  function animate() {
    animationId = requestAnimationFrame(animate);
    const dt = clock.getDelta();
    if (state.playing) {
      updateMovement(dt);
      updateCountdown();
    } else {
      countdownEl.classList.remove("visible");
      countdownEl.textContent = "";
    }
    renderer.render(scene, camera);
  }

  document.addEventListener("pointerlockchange", () => {
    if (!document.pointerLockElement && state.playing) endRound();
  });

  document.addEventListener("keydown", (e) => {
    const k = { KeyW: "w", KeyS: "s", KeyA: "a", KeyD: "d" }[e.code];
    if (k) {
      keys[k] = true;
      if (state.playing) e.preventDefault();
    }
    if (e.code === "Space" && state.playing) {
      const onGround = camera.position.y <= EYE_HEIGHT + 0.05;
      if (onGround) {
        state.velocityY = JUMP_VELOCITY;
        e.preventDefault();
      }
    }
  });
  document.addEventListener("keyup", (e) => {
    const k = { KeyW: "w", KeyS: "s", KeyA: "a", KeyD: "d" }[e.code];
    if (k) keys[k] = false;
  });

  sensitivityInput.addEventListener("input", () => {
    sensitivityValueEl.textContent = Number(sensitivityInput.value).toFixed(1);
  });

  mapSelect.addEventListener("change", () => {
    buildMap(mapSelect.value);
  });

  document.querySelectorAll(".target-size-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const value = tab.getAttribute("data-value");
      if (!value) return;
      targetSizeSelect.value = value;
      document.querySelectorAll(".target-size-tab").forEach((t) => {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
    });
  });

  startBtn.addEventListener("click", startRound);
  if (resetBtn) resetBtn.addEventListener("click", reset);
  resultsBackBtn.addEventListener("click", goToMain);
  resultsStartAgainBtn.addEventListener("click", () => {
    resultsOverlay.classList.add("hidden");
    resultsOverlay.setAttribute("aria-hidden", "true");
    startRound();
  });

  initThree();
  rendererCanvas.addEventListener("click", onClick);
  rendererCanvas.addEventListener("mousemove", onMouseMove);
  animate();
})();
