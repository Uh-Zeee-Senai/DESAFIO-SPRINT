// === CONFIG ===
const CONFIG = {
	PLAYER_IMG: "carro1.png",
	RIVAL_IMAGES: ["carro2.png", "carro3.png", "carro2.png"],
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
	EASTER_EGG_TIME: 10000,

	// 🎯 Ajuste fácil da hitbox
	HITBOX_OFFSET_X: 8,
	HITBOX_OFFSET_Y: 15
};

// === Globals ===
let canvas, ctx, W, H;
let menu, startBtn, restartBtn, playerNameInput, debugDiv;
let hudName, hudDistance, hudSpeed;
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
let fiatUnoActive = false;
let musicEnabled = false;

// === Phase control ===
let currentPhase = 1; // 1 = fase reta (mais fácil). 2 = fase com C / sway
let phaseIntroShowing = false;

// === Audio ===
const gameMusic = new Audio("musicgame.mp3");
gameMusic.loop = true;
gameMusic.volume = 0.45;

// 💥 Novos sons
const soundCollision = new Audio("collision.mp3");
soundCollision.volume = 0.8;

const soundVictory = new Audio("victory.mp3");
soundVictory.volume = 0.9;

// === Overlays ===
let overlayDiv;

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

	createOverlays();
	addMusicToggle();
	createPhaseSelector();

	// Start opens phase intro (so user can confirm phase)
	startBtn && startBtn.addEventListener("click", () => showPhaseIntro(currentPhase));
	restartBtn && restartBtn.addEventListener("click", () => {
		// restartBtn in menu should just show menu (keeps everything)
		resetState();
		menu.style.display = "flex";
		overlayDiv.style.display = "none";
		updatePhaseLabelInMenu();
	});

	window.addEventListener("resize", resize);
	window.addEventListener("keydown", e => keys[e.key] = true);
	window.addEventListener("keyup", e => keys[e.key] = false);

	resize();
	drawMenuPreview();
	updatePhaseLabelInMenu();
});

// === Music toggle button ===
function addMusicToggle() {
	const musicBtn = document.createElement("button");
	musicBtn.id = "musicToggleBtn";
	musicBtn.textContent = "🎵 Música: OFF";
	Object.assign(musicBtn.style, {
		position: "absolute",
		bottom: "20px",
		left: "20px",
		padding: "8px 14px",
		background: "#222",
		color: "#fff",
		border: "2px solid #555",
		fontFamily: "'Press Start 2P', monospace",
		cursor: "pointer",
		zIndex: "2000"
	});
	musicBtn.onclick = () => {
		musicEnabled = !musicEnabled;
		musicBtn.textContent = musicEnabled ? "🎵 Música: ON" : "🎵 Música: OFF";
		if (musicEnabled) {
			gameMusic.play().catch(()=>{});
		} else {
			gameMusic.pause();
		}
		localStorage.setItem("musicOn", musicEnabled ? "true" : "false");
	};
	document.body.appendChild(musicBtn);

	// Carrega estado salvo
	const saved = localStorage.getItem("musicOn");
	if (saved === "true") {
		musicEnabled = true;
		musicBtn.textContent = "🎵 Música: ON";
	}
}

// === Phase selector in menu ===
function createPhaseSelector() {
	if (!menu) return;
	const existing = document.getElementById("phaseSelectorContainer");
	if (existing) return;
	const faseContainer = document.createElement("div");
	faseContainer.id = "phaseSelectorContainer";
	Object.assign(faseContainer.style, {
		marginTop: "12px",
		fontFamily: "'Press Start 2P', monospace",
		fontSize: "12px"
	});
	faseContainer.innerHTML = `
		<label style="display:block;margin-bottom:8px;">Escolha a fase:</label>
		<div style="display:flex;gap:8px;justify-content:center;">
			<button id="fase1Btn">Fase 1 (Reta)</button>
			<button id="fase2Btn">Fase 2 (Curvas)</button>
		</div>
	`;
	menu.appendChild(faseContainer);

	document.getElementById("fase1Btn").onclick = () => {
		currentPhase = 1;
		updatePhaseLabelInMenu();
	};
	document.getElementById("fase2Btn").onclick = () => {
		currentPhase = 2;
		updatePhaseLabelInMenu();
	};
}

function updatePhaseLabelInMenu() {
	if (!menu) return;
	let lbl = menu.querySelector(".phase-label");
	if (!lbl) {
		lbl = document.createElement("div");
		lbl.className = "phase-label";
		lbl.style.marginTop = "8px";
		lbl.style.fontFamily = "'Press Start 2P', monospace";
		lbl.style.fontSize = "12px";
		lbl.style.opacity = "0.95";
		menu.appendChild(lbl);
	}
	lbl.textContent = `Fase atual: ${currentPhase} ${currentPhase === 1 ? "(Reta - Fácil)" : "(Curvas em C - Difícil)"}`;
}

// === Overlays ===
function createOverlays() {
	overlayDiv = document.createElement("div");
	overlayDiv.id = "overlayDiv";
	Object.assign(overlayDiv.style, {
		position: "fixed",
		top: "0", left: "0",
		width: "100%", height: "100%",
		display: "none",
		alignItems: "center",
		justifyContent: "center",
		flexDirection: "column",
		backgroundColor: "rgba(0,0,0,0.85)",
		color: "white",
		fontFamily: "'Press Start 2P', monospace",
		textAlign: "center",
		zIndex: "9999",
		padding: "16px",
		boxSizing: "border-box"
	});
	document.body.appendChild(overlayDiv);
}

// === START / RESTART ===
// startGame() será chamada quando o jogador confirmar na intro da fase
function startGame() {
	playerName = (playerNameInput && playerNameInput.value.trim()) ? playerNameInput.value.trim() : "Piloto";
	hudName.textContent = playerName;
	menu.style.display = "none";
	if (restartBtn) restartBtn.style.display = "none";
	resetState();
	initRun();

	if (musicEnabled) {
		gameMusic.currentTime = 0;
		gameMusic.play().catch(()=>{});
	}

	// 🔥 EASTER EGG: Fiat Uno
	if (playerName.toLowerCase() === "fiat uno") {
		CONFIG.PLAYER_IMG = "uno.png";
		IMAGES.player.src = CONFIG.PLAYER_IMG;
		CONFIG.MAX_SCROLL = 100000000;
		CONFIG.SCROLL_BASE = 20000;
		CONFIG.SCROLL_ACCEL = 50000;
		fiatUnoActive = true;
	} else if (playerName.toLowerCase() === "peugeot") {
		CONFIG.PLAYER_IMG = "p206.png";
		IMAGES.player.src = CONFIG.PLAYER_IMG;
		CONFIG.MAX_SCROLL = 15;
		CONFIG.SCROLL_BASE = 3.5;
		CONFIG.SCROLL_ACCEL = 2.8;
		fiatUnoActive = false;
	} else {
		CONFIG.MAX_SCROLL = 18;
		CONFIG.SCROLL_BASE = 3.5;
		CONFIG.SCROLL_ACCEL = 2.8;
		CONFIG.PLAYER_IMG = "carro1.png";
		IMAGES.player.src = CONFIG.PLAYER_IMG;
		fiatUnoActive = false;
	}

	gameRunning = true;
	lastTime = performance.now();
	requestAnimationFrame(loop);
}

function restartGame() {
	// volta pro menu sem alterar a fase atual
	resetState();
	menu.style.display = "flex";
	overlayDiv.style.display = "none";
	if (restartBtn) restartBtn.style.display = "none";
	gameMusic.pause();
	gameMusic.currentTime = 0;
	updatePhaseLabelInMenu();
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
	fiatUnoActive = false;
	if (debugDiv) debugDiv.textContent = "";
}

// === Phase intro screen ===
function showPhaseIntro(phaseNumber) {
	phaseIntroShowing = true;
	overlayDiv.innerHTML = `
		<h1 style="font-size:22px;">Fase ${phaseNumber}</h1>
		<p style="margin-top:8px;">${phaseNumber === 1 ? "Pista reta — carros seguem em linha reta. Fácil." : "Pista com curvas em 'C' — cuidado com o desvio (mais difícil)."} </p>
		<p style="margin-top:6px;">Controles: ← → mover | ↑ acelerar | ↓ frear/ré</p>
		<div style="margin-top:18px;">
			<button id="btnStartPhase" style="padding:10px 16px;margin-right:10px;cursor:pointer;font-family:'Press Start 2P'">Começar Fase ${phaseNumber}</button>
			<button id="btnBackMenu" style="padding:10px 16px;cursor:pointer;font-family:'Press Start 2P'">Voltar ao Menu</button>
		</div>
	`;
	overlayDiv.style.display = "flex";

	document.getElementById("btnStartPhase").onclick = () => {
		overlayDiv.style.display = "none";
		phaseIntroShowing = false;
		startGame();
	};
	document.getElementById("btnBackMenu").onclick = () => {
		overlayDiv.style.display = "none";
		phaseIntroShowing = false;
		menu.style.display = "flex";
		updatePhaseLabelInMenu();
	};
}

// === Init Run ===
function initRun() {
	resize();
	player = {
		img: IMAGES.player,
		width: Math.min(140, Math.floor(W * 0.12)),
		height: Math.min(200, Math.floor(H * 0.18)),
		x: Math.floor(W / 2 - Math.min(140, Math.floor(W * 0.12)) / 2),
		y: Math.floor(H - Math.min(200, Math.floor(H * 0.18)) - 24),
		speedSide: CONFIG.PLAYER_SIDE_SPEED,
		crashed: false
	};
	rivals = [];
	spawnTimer = performance.now() + randInterval();
	distance = 0;
	scrollSpeed = CONFIG.SCROLL_BASE;
}

// === Main loop ===
function loop(ts) {
	if (!gameRunning) return;
	const dt = Math.min(50, ts - lastTime) / 16.6667;
	lastTime = ts;
	update(dt);
	render();
	requestAnimationFrame(loop);
}

// === Update ===
function update(dt) {
	if (player && !player.crashed) {
		if (keys["ArrowLeft"] || keys["a"]) player.x -= Math.round(player.speedSide * dt);
		if (keys["ArrowRight"] || keys["d"]) player.x += Math.round(player.speedSide * dt);
		player.x = clamp(player.x, 8, W - player.width - 8);

		if (keys["ArrowUp"] || keys["w"]) {
			scrollSpeed += CONFIG.SCROLL_ACCEL * dt;
			reverseStartTime = null;
		} else if (!fiatUnoActive) {
			if (scrollSpeed > CONFIG.SCROLL_BASE) scrollSpeed -= CONFIG.SCROLL_BASE * 0.02 * dt;
			else if (scrollSpeed < CONFIG.SCROLL_BASE) scrollSpeed += CONFIG.SCROLL_BASE * 0.02 * dt;
		} else {
			if (scrollSpeed < CONFIG.SCROLL_BASE) scrollSpeed = CONFIG.SCROLL_BASE;
		}

		if (keys["ArrowDown"] || keys["s"]) {
			scrollSpeed -= CONFIG.SCROLL_DECEL * dt;
			if (!reverseStartTime) reverseStartTime = performance.now();
			else if (performance.now() - reverseStartTime >= CONFIG.EASTER_EGG_TIME && !easterEggTriggered) {
				easterEggTriggered = true;
				showWinOverlay(true);
				return;
			}
		} else reverseStartTime = null;

		scrollSpeed = clamp(scrollSpeed, -CONFIG.MAX_SCROLL, CONFIG.MAX_SCROLL);
	}

	// distância e checks
	if (scrollSpeed > 0 && !fiatUnoActive) {
		distance += Math.round(scrollSpeed * dt);

		// === Peugeot: quebra após 1000m ===
		if (playerName.toLowerCase() === "peugeot" && distance >= 1000 && !player.crashed) {
			player.crashed = true;
			showLoseOverlay("💥 O Peugeot 206 quebrou após 1000m!");
			return;
		}

		if (distance >= CONFIG.MAX_DISTANCE && !normalWinTriggered) {
			normalWinTriggered = true;
			showWinOverlay(false);
			return;
		}
	} else if (scrollSpeed < 0) {
		distance = Math.max(0, distance + Math.round(scrollSpeed * dt));
	}

	// spawn rivals
	const now = performance.now();
	if (now >= spawnTimer) {
		spawnRival();
		spawnTimer = now + randInterval();
	}

	// update rivals positions
	for (let i = rivals.length - 1; i >= 0; i--) {
		const r = rivals[i];
		if (currentPhase === 1) {
			// fase 1: carros seguem reto (sem sway)
			r.y += (scrollSpeed >= 0 ? scrollSpeed : scrollSpeed * 0.6) * dt + r.speed * dt;
		} else {
			// fase 2: curvas (sway)
			const baseDown = (scrollSpeed >= 0) ? scrollSpeed : scrollSpeed * 0.6;
			r.y += (baseDown + r.speed) * dt;
			r.x += Math.sin((now + r.offset) / 600) * r.sway * dt;
		}

		if (r.y > H + 120) {
			rivals.splice(i, 1);
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

// === Overlays: Win / Lose / Next-phase behavior ===
function showWinOverlay(isEaster) {
	gameRunning = false;
	if (musicEnabled) gameMusic.pause();
	try { soundVictory.currentTime = 0; soundVictory.play(); } catch(e){}

	let nextBtnHtml = '';
	if (currentPhase === 1) {
		nextBtnHtml = `<button id="btnNext" style="margin-top:20px;padding:10px 16px;font-family:'Press Start 2P';cursor:pointer;">Ir para Fase 2</button>`;
	} else {
		nextBtnHtml = `<button id="btnNext" style="margin-top:20px;padding:10px 16px;font-family:'Press Start 2P';cursor:pointer;">Revisitar Fase 1</button>`;
	}

	overlayDiv.innerHTML = `
		<h1 style="color:${isEaster ? "#00ff99" : "#ffd166"};font-size:26px;">
			${isEaster ? "🎉 EASTER EGG DESCOBERTO! 🎉" : "🏁 VOCÊ VENCEU! 🏁"}
		</h1>
		<p>${isEaster ? "Você segurou ré por 10s e descobriu o segredo!" : "Você alcançou a distância máxima!"}</p>
		<p>Parabéns, ${playerName}!</p>
		${nextBtnHtml}
		<button id="btnRestart" style="margin-top:12px;padding:10px 16px;font-family:'Press Start 2P';cursor:pointer;">Jogar Novamente</button>
		<button id="btnMenu" style="margin-top:12px;padding:10px 16px;font-family:'Press Start 2P';cursor:pointer;">Voltar ao Menu</button>
	`;
	overlayDiv.style.display = "flex";

	document.getElementById("btnRestart").onclick = () => {
		// reinicia a mesma fase (volta ao intro para confirmação)
		overlayDiv.style.display = "none";
		showPhaseIntro(currentPhase);
	};

	document.getElementById("btnMenu").onclick = () => {
		overlayDiv.style.display = "none";
		restartGame(); // leva ao menu (mantém fase selecionada)
	};

	document.getElementById("btnNext").onclick = () => {
		if (currentPhase === 1) {
			currentPhase = 2;
			updatePhaseLabelInMenu();
			overlayDiv.style.display = "none";
			showPhaseIntro(2);
		} else {
			currentPhase = 1;
			updatePhaseLabelInMenu();
			overlayDiv.style.display = "none";
			showPhaseIntro(1);
		}
	};
}

function showLoseOverlay(customMessage) {
	gameRunning = false;
	if (musicEnabled) gameMusic.pause();
	try { soundCollision.currentTime = 0; soundCollision.play(); } catch(e){}

	overlayDiv.innerHTML = `
		<h1 style="color:#ff4444;font-size:26px;">${customMessage ? customMessage : "💥 COLISÃO! 💥"}</h1>
		<p>${playerName}, você parou após ${distance}m.</p>
		<div style="margin-top:12px;">
			<button id="btnRetry" style="padding:10px 16px;font-family:'Press Start 2P';cursor:pointer;margin-right:8px;">Tentar Novamente</button>
			<button id="btnMenu" style="padding:10px 16px;font-family:'Press Start 2P';cursor:pointer;">Voltar ao Menu</button>
		</div>
	`;
	overlayDiv.style.display = "flex";
	document.getElementById("btnRetry").onclick = () => {
		overlayDiv.style.display = "none";
		showPhaseIntro(currentPhase); // reinicia a mesma fase via intro
	};
	document.getElementById("btnMenu").onclick = () => {
		overlayDiv.style.display = "none";
		restartGame();
	};
}

// === Misc ===
function spawnRival() {
	const idx = Math.floor(Math.random() * IMAGES.rivals.length);
	const img = IMAGES.rivals[idx];
	const w = Math.min(120, Math.floor(W * (0.10 + Math.random() * 0.02)));
	const h = Math.min(170, Math.floor(H * (0.14 + Math.random() * 0.03)));
	// escolher posição X baseada em "faixas" (3 faixas) para mais previsibilidade
	const lanes = [
		Math.floor(W * 0.2 - w/2),
		Math.floor(W * 0.5 - w/2),
		Math.floor(W * 0.8 - w/2)
	];
	const laneIndex = Math.floor(Math.random() * lanes.length);
	const laneX = lanes[laneIndex];

	const r = {
		img,
		width: w,
		height: h,
		x: laneX,
		y: -h - 20,
		speed: 2 + Math.random() * 3.2,
		// sway só relevante para fase 2
		sway: 8 + Math.random() * 12,
		offset: Math.random() * 1000
	};
	rivals.push(r);
}

function render() {
	// se jogo não está rodando por overlay, evita redesenhar 'jogo' normal
	if (!gameRunning && (easterEggTriggered || normalWinTriggered)) return;

	ctx.clearRect(0, 0, W, H);
	if (IMAGES.track && IMAGES.track.complete && IMAGES.track.naturalWidth) {
		const img = IMAGES.track;
		const t = Math.floor(distance % img.height);
		ctx.drawImage(img, 0, -t, W, img.height);
		ctx.drawImage(img, 0, img.height - t, W, img.height);
	} else {
		ctx.fillStyle = CONFIG.CANVAS_BG_COLOR;
		ctx.fillRect(0, 0, W, H);
	}

	// pista mais larga
	const roadW = Math.floor(W * 0.9);
	const roadX = Math.floor((W - roadW) / 2);
	ctx.fillStyle = "#202830";
	ctx.fillRect(roadX, 0, roadW, H);

	// center dashed lane
	const laneXCenter = Math.floor(W / 2);
	ctx.strokeStyle = "#f2f2f2";
	ctx.lineWidth = 4;
	ctx.setLineDash([10, 20]);
	for (let y = -(distance % 40); y < H; y += 40) {
		ctx.beginPath();
		ctx.moveTo(laneXCenter, y);
		ctx.lineTo(laneXCenter, y + 16);
		ctx.stroke();
	}
	ctx.setLineDash([]);

	// draw rivals
	for (const r of rivals) {
		if (r.img && r.img.complete) ctx.drawImage(r.img, r.x, Math.floor(r.y), r.width, r.height);
		else { ctx.fillStyle = "#b33"; ctx.fillRect(r.x, Math.floor(r.y), r.width, r.height); }

		// optional small label (visual only)
		ctx.fillStyle = "#fff";
		ctx.font = "12px monospace";
		ctx.fillText("RIVAL", r.x + 6, Math.floor(r.y) + 14);
	}

	// draw player (on top)
	if (player) {
		if (player.img && player.img.complete) ctx.drawImage(player.img, player.x, player.y, player.width, player.height);
		else { ctx.fillStyle = "#ff3b3b"; ctx.fillRect(player.x, player.y, player.width, player.height); }

		// nome do jogador (apenas visual — hitbox não conta o texto)
		ctx.fillStyle = "#fff";
		ctx.font = "12px monospace";
		ctx.fillText(playerName, player.x + 6, player.y + 14);
	}
}

function updateHUD() {
	hudDistance.textContent = "DIST: " + String(Math.min(CONFIG.MAX_DISTANCE, distance)).padStart(6, "0");
	hudSpeed.textContent = "SPEED: " + Math.round(scrollSpeed);
}

function randInterval() { return CONFIG.SPAWN_INTERVAL + Math.random() * CONFIG.SPAWN_VARIANCE; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// 🎯 colisão com hitbox ajustável (o nome desenhado NÃO conta, apenas a caixa ajustada)
function rectOverlap(a, b) {
	const ax1 = a.x + CONFIG.HITBOX_OFFSET_X;
	const ay1 = a.y + CONFIG.HITBOX_OFFSET_Y;
	const ax2 = a.x + a.width - CONFIG.HITBOX_OFFSET_X;
	const ay2 = a.y + a.height - CONFIG.HITBOX_OFFSET_Y;

	const bx1 = b.x;
	const by1 = b.y;
	const bx2 = b.x + b.width;
	const by2 = b.y + b.height;

	return !(ax2 < bx1 || ax1 > bx2 || ay2 < by1 || ay1 > by2);
}

function resize() {
	W = window.innerWidth;
	H = window.innerHeight;
	canvas.width = W;
	canvas.height = H;
	if (player) {
		player.width = Math.min(140, Math.floor(W * 0.12));
		player.height = Math.min(200, Math.floor(H * 0.18));
		player.x = Math.floor(W / 2 - player.width / 2);
		player.y = Math.floor(H - player.height - 24);
	}
}

function drawMenuPreview() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = "rgba(0,0,0,0.45)";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = "#fff";
	ctx.font = "18px monospace";
	ctx.fillText("Pressione Iniciar para começar a corrida (Desktop - Vista Aérea)", 24, 48);
}
