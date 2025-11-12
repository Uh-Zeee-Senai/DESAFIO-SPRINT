// === CONFIG (mude apenas aqui se quiser trocar imagens/valores) ===
const CONFIG = {
	PLAYER_IMG: "carro1.png",
	RIVAL_IMAGES: ["carro2.png","carro3.png","carro2.png"],
	TRACK_BG: "pista.jpg",
	CANVAS_BG_COLOR: "#071427",
	PLAYER_SIDE_SPEED: 6,
	SCROLL_BASE: 3.5,
	SCROLL_ACCEL: 2.8,
	SCROLL_DECEL: 3.5,
	MAX_SCROLL: 18,
	SPAWN_INTERVAL: 900,
	SPAWN_VARIANCE: 800,
	MAX_DISTANCE: 999999,
	EASTER_EGG_TIME: 10000
};

// === Globals ===
let canvas, ctx, W, H;
let menu, startBtn, restartBtn, playerNameInput, debugDiv;
let hudName, hudDistance, hudSpeed, hudPos, hudLaps;

let keys = {};
let gameRunning = false;
let lastTime = 0;
let scrollSpeed = CONFIG.SCROLL_BASE;

let player = null;
let rivals = [];
let spawnTimer = 0;
let distance = 0;
let playerName = "Piloto";
let reverseStartTime = null;
let easterEggTriggered = false;
let normalWinTriggered = false;
let faseAtual = 1;

let overlayDiv, victoryDiv, loseDiv;
let music, musicEnabled = true;

// === Images ===
const IMAGES = {
	player: new Image(),
	rivals: [],
	track: new Image()
};
IMAGES.player.src = CONFIG.PLAYER_IMG;
for (let i = 0; i < CONFIG.RIVAL_IMAGES.length; i++) {
	const im = new Image();
	im.src = CONFIG.RIVAL_IMAGES[i];
	IMAGES.rivals.push(im);
}
IMAGES.track.src = CONFIG.TRACK_BG;

// === DOM READY ===
window.addEventListener("DOMContentLoaded", () => {
	canvas = document.getElementById("gameCanvas");
	ctx = canvas.getContext("2d");

	menu = document.getElementById("menu");
	startBtn = document.getElementById("startBtn");
	restartBtn = document.getElementById("restartBtn");
	playerNameInput = document.getElementById("playerName");
	debugDiv = document.getElementById("debug");

	hudName = document.getElementById("hud-name");
	hudDistance = document.getElementById("hud-distance");
	hudSpeed = document.getElementById("hud-speed");
	hudPos = document.getElementById("hud-pos");
	hudLaps = document.getElementById("hud-laps");

	createOverlays();
	createMusic();
	createFaseSelector();

	startBtn && startBtn.addEventListener("click", startGame);
	restartBtn && restartBtn.addEventListener("click", restartGame);

	window.addEventListener("resize", resize);
	window.addEventListener("keydown", e => { keys[e.key] = true; });
	window.addEventListener("keyup", e => { keys[e.key] = false; });

	resize();
	drawMenuPreview();
});

// === Música ===
function createMusic() {
	music = new Audio("musicgame.mp3");
	music.loop = true;

	const musicBtn = document.createElement("button");
	musicBtn.textContent = "🎵 Música: ON";
	Object.assign(musicBtn.style, {
		position: "absolute",
		top: "12px",
		right: "12px",
		padding: "8px 14px",
		fontFamily: "'Press Start 2P', monospace",
		cursor: "pointer"
	});
	musicBtn.onclick = () => {
		musicEnabled = !musicEnabled;
		musicBtn.textContent = musicEnabled ? "🎵 Música: ON" : "🎵 Música: OFF";
		if (!musicEnabled) music.pause();
		else music.play();
	};
	document.body.appendChild(musicBtn);
}

// === Criação das telas ===
function createOverlays() {
	overlayDiv = document.createElement("div");
	overlayDiv.id = "overlay";
	Object.assign(overlayDiv.style, {
		position: "fixed",
		top: "0",
		left: "0",
		width: "100%",
		height: "100%",
		display: "none",
		alignItems: "center",
		justifyContent: "center",
		flexDirection: "column",
		backgroundColor: "rgba(0,0,0,0.85)",
		color: "white",
		fontFamily: "'Press Start 2P', monospace",
		textAlign: "center",
		zIndex: "9999"
	});
	document.body.appendChild(overlayDiv);
}

function createFaseSelector() {
	const faseContainer = document.createElement("div");
	faseContainer.id = "faseSelector";
	Object.assign(faseContainer.style, {
		marginTop: "20px"
	});
	faseContainer.innerHTML = `
		<p>Selecione a Fase:</p>
		<div style="display:flex;gap:12px;justify-content:center;">
			<button id="fase1Btn">Fase 1</button>
			<button id="fase2Btn">Fase 2</button>
		</div>
	`;
	menu.appendChild(faseContainer);

	document.getElementById("fase1Btn").onclick = () => faseAtual = 1;
	document.getElementById("fase2Btn").onclick = () => faseAtual = 2;
}

// === Setup / Start / Restart ===
function startGame() {
	playerName = (playerNameInput && playerNameInput.value.trim()) ? playerNameInput.value.trim() : "Piloto";
	hudName.textContent = playerName;
	menu.style.display = "none";
	if (restartBtn) restartBtn.style.display = "none";
	resetState();
	initRun();
	gameRunning = true;
	lastTime = performance.now();
	if (musicEnabled) music.play();
	requestAnimationFrame(loop);
}

function restartGame() {
	resetState();
	menu.style.display = "flex";
	overlayDiv.style.display = "none";
	if (restartBtn) restartBtn.style.display = "none";
}

function resetState() {
	gameRunning = false;
	player = null;
	rivals = [];
	distance = 0;
	scrollSpeed = CONFIG.SCROLL_BASE;
	spawnTimer = 0;
	reverseStartTime = null;
	easterEggTriggered = false;
	normalWinTriggered = false;
	if (debugDiv) debugDiv.textContent = "";
}

// === Inicializa corrida ===
function initRun() {
	resize();
	player = {
		img: IMAGES.player,
		width: Math.min(140, Math.floor(W * 0.12)),
		height: Math.min(200, Math.floor(H * 0.18)),
		x: Math.floor(W/2 - Math.min(140, Math.floor(W * 0.12))/2),
		y: Math.floor(H - Math.min(200, Math.floor(H * 0.18)) - 24),
		speedSide: CONFIG.PLAYER_SIDE_SPEED,
		crashed: false
	};
	rivals = [];
	spawnTimer = performance.now() + randInterval();
	distance = 0;
	scrollSpeed = CONFIG.SCROLL_BASE;

	showFaseTitle();
}

function showFaseTitle() {
	const faseDiv = document.createElement("div");
	faseDiv.textContent = `🚗 Fase ${faseAtual}`;
	Object.assign(faseDiv.style, {
		position: "fixed",
		top: "45%",
		left: "50%",
		transform: "translate(-50%, -50%)",
		fontFamily: "'Press Start 2P', monospace",
		fontSize: "28px",
		color: "white",
		zIndex: "10000",
	});
	document.body.appendChild(faseDiv);
	setTimeout(() => faseDiv.remove(), 1500);
}

// === LOOP ===
function loop(ts) {
	if (!gameRunning) return;
	const dt = Math.min(50, ts - lastTime) / 16.6667;
	lastTime = ts;
	update(dt);
	render();
	requestAnimationFrame(loop);
}

// === UPDATE ===
function update(dt) {
	if (player && !player.crashed) {
		if (keys["ArrowLeft"] || keys["a"]) player.x -= Math.round(player.speedSide * dt);
		if (keys["ArrowRight"] || keys["d"]) player.x += Math.round(player.speedSide * dt);
		player.x = clamp(player.x, 8, W - player.width - 8);

		if (keys["ArrowUp"] || keys["w"]) {
			scrollSpeed += CONFIG.SCROLL_ACCEL * dt;
			reverseStartTime = null;
		} else {
			if (scrollSpeed > CONFIG.SCROLL_BASE) scrollSpeed -= CONFIG.SCROLL_BASE * 0.02 * dt;
			else if (scrollSpeed < CONFIG.SCROLL_BASE) scrollSpeed += CONFIG.SCROLL_BASE * 0.02 * dt;
		}

		if (keys["ArrowDown"] || keys["s"]) {
			scrollSpeed -= CONFIG.SCROLL_DECEL * dt;
			if (!reverseStartTime) reverseStartTime = performance.now();
			else {
				const held = performance.now() - reverseStartTime;
				if (held >= CONFIG.EASTER_EGG_TIME && !easterEggTriggered) {
					easterEggTriggered = true;
					showWinOverlay(true);
					return;
				}
			}
		} else reverseStartTime = null;

		scrollSpeed = clamp(scrollSpeed, -CONFIG.MAX_SCROLL, CONFIG.MAX_SCROLL);
	}

	if (scrollSpeed > 0) {
		distance += Math.round(scrollSpeed * dt);
		if (distance >= CONFIG.MAX_DISTANCE && !normalWinTriggered) {
			normalWinTriggered = true;
			showWinOverlay(false);
			return;
		}
	} else if (scrollSpeed < 0) {
		distance = Math.max(0, distance + Math.round(scrollSpeed * dt));
	}

	const now = performance.now();
	if (now >= spawnTimer) {
		spawnRival();
		spawnTimer = now + randInterval();
	}

	for (let i = rivals.length - 1; i >= 0; i--) {
		const r = rivals[i];
		let swayPattern = 0;
		if (faseAtual === 2) swayPattern = Math.sin((now + r.offset) / 600) * r.sway * dt; 
		r.y += (scrollSpeed >= 0 ? scrollSpeed : scrollSpeed * 0.6) * dt + r.speed * dt;
		r.x += swayPattern;
		if (r.y > H + 120) {
			rivals.splice(i,1);
			continue;
		}
		if (player && !player.crashed && rectOverlap(player, r)) {
			player.crashed = true;
			showLoseOverlay();
			return;
		}
	}
	updateHUD();
}

// === VITÓRIA / DERROTA ===
function showWinOverlay(isEaster) {
	gameRunning = false;
	music.pause();
	overlayDiv.innerHTML = `
		<h1 style="color:${isEaster ? "#00ff99" : "#ffd166"};font-size:26px;">
			${isEaster ? "🎉 EASTER EGG DESCOBERTO! 🎉" : "🏁 VOCÊ VENCEU! 🏁"}
		</h1>
		<p>${isEaster ? "Você segurou ré por 10s e descobriu o segredo!" : "Você alcançou a distância máxima!"}</p>
		<p>Parabéns, ${playerName}!</p>
		<button id="btnNext" style="margin-top:20px;padding:10px 16px;font-family:'Press Start 2P';cursor:pointer;">${faseAtual === 1 ? "Próxima Fase" : "Jogar Novamente"}</button>
		<button id="btnMenu" style="margin-top:12px;padding:10px 16px;font-family:'Press Start 2P';cursor:pointer;">Voltar ao Menu</button>
	`;
	overlayDiv.style.display = "flex";
	document.getElementById("btnNext").onclick = () => {
		if (faseAtual === 1) {
			faseAtual = 2;
			overlayDiv.style.display = "none";
			startGame();
		} else {
			restartGame();
		}
	};
	document.getElementById("btnMenu").onclick = restartGame;
}

function showLoseOverlay() {
	gameRunning = false;
	music.pause();
	overlayDiv.innerHTML = `
		<h1 style="color:#ff4444;font-size:26px;">💥 COLISÃO! 💥</h1>
		<p>${playerName}, você bateu após ${distance}m.</p>
		<button id="btnRetry" style="margin-top:20px;padding:10px 16px;font-family:'Press Start 2P';cursor:pointer;">Tentar Novamente</button>
		<button id="btnMenu" style="margin-top:12px;padding:10px 16px;font-family:'Press Start 2P';cursor:pointer;">Voltar ao Menu</button>
	`;
	overlayDiv.style.display = "flex";
	document.getElementById("btnRetry").onclick = startGame;
	document.getElementById("btnMenu").onclick = restartGame;
}

// === Resto do código ===
function spawnRival() {
	const idx = Math.floor(Math.random() * IMAGES.rivals.length);
	const img = IMAGES.rivals[idx];
	const w = Math.min(120, Math.floor(W * (0.10 + Math.random()*0.02)));
	const h = Math.min(170, Math.floor(H * (0.14 + Math.random()*0.03)));
	const laneX = Math.floor(16 + Math.random() * (W - 32 - w));
	const r = { img, width: w, height: h, x: laneX, y: -h - 20, speed: 2 + Math.random() * 3.2, sway: 8 + Math.random() * 12, offset: Math.random() * 1000 };
	rivals.push(r);
}

function render() {
	if (!gameRunning && (easterEggTriggered || normalWinTriggered)) return;
	ctx.clearRect(0,0,W,H);
	if (IMAGES.track && IMAGES.track.complete && IMAGES.track.naturalWidth) {
		const img = IMAGES.track;
		const t = Math.floor(distance % img.height);
		ctx.drawImage(img, 0, -t, W, img.height);
		ctx.drawImage(img, 0, img.height - t, W, img.height);
	} else {
		ctx.fillStyle = CONFIG.CANVAS_BG_COLOR;
		ctx.fillRect(0,0,W,H);
	}
	const roadW = Math.floor(W * 0.88); // cobre mais lateral
	const roadX = Math.floor((W - roadW)/2);
	ctx.fillStyle = "#202830";
	ctx.fillRect(roadX, 0, roadW, H);

	const laneXCenter = Math.floor(W/2);
	ctx.strokeStyle = "#f2f2f2";
	ctx.lineWidth = 4;
	ctx.setLineDash([10,20]);
	for (let y = -(distance % 40); y < H; y+=40) {
		ctx.beginPath();
		ctx.moveTo(laneXCenter, y);
		ctx.lineTo(laneXCenter, y+16);
		ctx.stroke();
	}
	ctx.setLineDash([]);

	for (const r of rivals) {
		if (r.img && r.img.complete) ctx.drawImage(r.img, r.x, r.y, r.width, r.height);
		else {
			ctx.fillStyle = "#b33";
			ctx.fillRect(r.x, r.y, r.width, r.height);
		}
	}

	if (player) {
		if (player.img && player.img.complete) ctx.drawImage(player.img, player.x, player.y, player.width, player.height);
		else {
			ctx.fillStyle = "#ff3b3b";
			ctx.fillRect(player.x, player.y, player.width, player.height);
		}
	}
}

function updateHUD() {
	hudDistance.textContent = "DIST: " + String(Math.min(CONFIG.MAX_DISTANCE, distance)).padStart(6, "0");
	hudSpeed.textContent = "SPEED: " + Math.round(scrollSpeed);
}

function randInterval() { return CONFIG.SPAWN_INTERVAL + Math.random() * CONFIG.SPAWN_VARIANCE; }
function clamp(v,a,b) { return Math.max(a, Math.min(b, v)); }
function rectOverlap(a,b) { return !(a.x + a.width < b.x || a.x > b.x + b.width || a.y + a.height < b.y || a.y > b.y + b.height); }

function resize() {
	W = window.innerWidth;
	H = window.innerHeight;
	canvas.width = W;
	canvas.height = H;
	if (player) {
		player.width = Math.min(140, Math.floor(W * 0.12));
		player.height = Math.min(200, Math.floor(H * 0.18));
		player.x = Math.floor(W/2 - player.width/2);
		player.y = Math.floor(H - player.height - 24);
	}
}

function drawMenuPreview() {
	ctx.clearRect(0,0,canvas.width,canvas.height);
	ctx.fillStyle = "rgba(0,0,0,0.45)";
	ctx.fillRect(0,0,canvas.width,canvas.height);
	ctx.fillStyle = "#fff";
	ctx.font = "18px monospace";
	ctx.fillText("Pressione Iniciar para começar a corrida (Desktop - Vista Aérea)", 24, 48);
}
