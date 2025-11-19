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
	MAX_DISTANCE: 99999,
	EASTER_EGG_TIME: 10000,

	// 🎯 Ajuste fácil da hitbox
	HITBOX_OFFSET_X: 3,
	HITBOX_OFFSET_Y: 6
};

// === Globals ===
let canvas, ctx, W, H;
let menu, startBtn, restartBtn, playerNameInput, debugDiv;
let carSelect, carPreview;
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
let currentPhase = 1; // 1 = reta, 2 = curvas, 3 = final (desbloqueada após vencer 2)
let phaseIntroShowing = false;
let phase3Unlocked = false;

// === Audio ===
const gameMusic = new Audio("musicgame.mp3");
gameMusic.loop = true;
gameMusic.volume = 0.45;

// 💥 Novos sons
const soundCollision = new Audio("collision.mp3");
soundCollision.volume = 0.8;

const soundVictory = new Audio("victory.mp3");
soundVictory.volume = 0.9;

// fase 3 specific audio
const seeyou = new Audio("seeyouagain.mp3");
seeyou.volume = 0.9;

// === Overlays ===
let overlayDiv;

// car map (select value -> file + flags)
const CAR_MAP = {
	"carro1": { file: "carro1.png", isUno: false, isPeugeot: false },
	"player2": { file: "player2.png", isUno: false, isPeugeot: false },
	"uno":    { file: "uno.png", isUno: true, isPeugeot: false },
	"peugeot":{ file: "p206.png", isUno: false, isPeugeot: true }
};

// === Images ===
const IMAGES = {
	player: new Image(),
	rivals: [],
	track: new Image(),
	toretto: new Image(), // fase 3 car
	brian: new Image()    // brian car
};
IMAGES.player.src = CONFIG.PLAYER_IMG;
for (let i = 0; i < CONFIG.RIVAL_IMAGES.length; i++) {
	const im = new Image();
	im.src = CONFIG.RIVAL_IMAGES[i];
	IMAGES.rivals.push(im);
}
IMAGES.track.src = CONFIG.TRACK_BG;
IMAGES.toretto.src = "toretto.png";
IMAGES.brian.src = "brian.png";

// === Phase3 runtime vars ===
let inPhase3Sequence = false;
let brianActive = false;
let brianCar = null;
let phase3Timers = []; // store timeouts to clear on restart

// === DOM READY ===
window.addEventListener("DOMContentLoaded", () => {
	canvas = document.getElementById("gameCanvas");
	ctx = canvas.getContext("2d");

	menu = document.getElementById("menu");
	startBtn = document.getElementById("startBtn");
	restartBtn = document.getElementById("restartBtn");
	playerNameInput = document.getElementById("playerName");
	debugDiv = document.getElementById("debug");

	carSelect = document.getElementById("carSelect");
	carPreview = document.getElementById("carPreview");

	hudName = document.getElementById("hud-name");
	hudDistance = document.getElementById("hud-distance");
	hudSpeed = document.getElementById("hud-speed");

	createOverlays();
	addMusicToggle();
	createPhaseSelector();

	// bind car selector and preview
	if (carSelect) {
		carSelect.addEventListener("change", onCarSelectChange);
		// initial preview
		setTimeout(() => onCarSelectChange(), 30);
	}

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

// when player selects a car in menu
function onCarSelectChange() {
	if (!carSelect || !carPreview) return;
	const val = carSelect.value || "carro1";
	const info = CAR_MAP[val] || CAR_MAP["carro1"];
	// preview image
	carPreview.src = info.file;
	// update IMAGES.player so preview in canvas/menu is consistent (but actual in-game behavior also set on startGame)
	IMAGES.player.src = info.file;
	CONFIG.PLAYER_IMG = info.file;
}

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
			<button id="fase3Btn">Fase 3 (Final)</button>
		</div>
	`;
	menu.appendChild(faseContainer);

	document.getElementById("fase1Btn").onclick = () => { currentPhase = 1; updatePhaseLabelInMenu(); };
	document.getElementById("fase2Btn").onclick = () => { currentPhase = 2; updatePhaseLabelInMenu(); };
	document.getElementById("fase3Btn").onclick = () => {
		if (phase3Unlocked) {
			currentPhase = 3;
			updatePhaseLabelInMenu();
		} else {
			alert("Fase 3 só é liberada após zerar a Fase 2.");
		}
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
	let extra = currentPhase === 1 ? "(Reta - Fácil)" : (currentPhase === 2 ? "(Curvas em C - Difícil)" : "(Final - Cinemático)");
	if (currentPhase === 3 && !phase3Unlocked) extra += " — BLOQUEADA";
	lbl.textContent = `Fase atual: ${currentPhase} ${extra}`;
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
	// player name purely from input
	playerName = (playerNameInput && playerNameInput.value.trim()) ? playerNameInput.value.trim() : "Piloto";
	hudName.textContent = playerName;

	// choose car based on selector (selector determines special behaviours)
	let sel = carSelect ? carSelect.value : "carro1";
	const selInfo = CAR_MAP[sel] || CAR_MAP["carro1"];
	CONFIG.PLAYER_IMG = selInfo.file;
	IMAGES.player.src = selInfo.file;

	// reset special flags
	fiatUnoActive = false;
	// apply car-specific rules
	if (selInfo.isUno) {
		// Fiat Uno special
		fiatUnoActive = true;
		CONFIG.MAX_SCROLL = 50000;
		CONFIG.SCROLL_BASE = 6;
		CONFIG.SCROLL_ACCEL = 8;
	} else if (selInfo.isPeugeot) {
		// Peugeot behavior: will break at 1000m (we keep the existing message logic but based on selected car now)
		CONFIG.MAX_SCROLL = 15;
		CONFIG.SCROLL_BASE = 3.5;
		CONFIG.SCROLL_ACCEL = 2.8;
	} else {
		CONFIG.MAX_SCROLL = 18;
		CONFIG.SCROLL_BASE = 3.5;
		CONFIG.SCROLL_ACCEL = 2.8;
	}

	menu.style.display = "none";
	if (restartBtn) restartBtn.style.display = "none";
	resetState();
	initRun();

	// phase 3 sequence flags cleared
	inPhase3Sequence = false;
	brianActive = false;
	phase3Timers.forEach(t => clearTimeout(t));
	phase3Timers = [];

	if (musicEnabled) {
		gameMusic.currentTime = 0;
		gameMusic.play().catch(()=>{});
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
	// reset fiatUnoActive here (will be set on start)
	fiatUnoActive = false;
	inPhase3Sequence = false;
	brianActive = false;
	phase3Timers.forEach(t => clearTimeout(t));
	phase3Timers = [];
	if (debugDiv) debugDiv.textContent = "";
}

// === Phase intro screen ===
function showPhaseIntro(phaseNumber) {
	phaseIntroShowing = true;
	let lockedText = "";
	if (phaseNumber === 3 && !phase3Unlocked) lockedText = "<p style='color:#f55;margin-top:8px;'>Fase 3 bloqueada — vença a Fase 2 para liberar.</p>";
	overlayDiv.innerHTML = `
		<h1 style="font-size:22px;">Fase ${phaseNumber}</h1>
		<p style="margin-top:8px;">${phaseNumber === 1 ? "Pista reta — carros seguem em linha reta. Fácil." : (phaseNumber === 2 ? "Pista com curvas em 'C' — cuidado com o desvio (mais difícil)." : "Fase Final — sequência cinematográfica; sobreviva até o final!")}</p>
		<p style="margin-top:6px;">Controles: ← → mover | ↑ acelerar | ↓ frear/ré</p>
		${lockedText}
		<div style="margin-top:18px;">
			<button id="btnStartPhase" style="padding:10px 16px;margin-right:10px;cursor:pointer;font-family:'Press Start 2P'">Começar Fase ${phaseNumber}</button>
			<button id="btnBackMenu" style="padding:10px 16px;cursor:pointer;font-family:'Press Start 2P'">Voltar ao Menu</button>
		</div>
	`;
	overlayDiv.style.display = "flex";

	document.getElementById("btnStartPhase").onclick = () => {
		if (phaseNumber === 3 && !phase3Unlocked) {
			alert("Fase 3 ainda bloqueada. Zere a Fase 2 primeiro.");
			return;
		}
		overlayDiv.style.display = "none";
		phaseIntroShowing = false;
		currentPhase = phaseNumber;
		updatePhaseLabelInMenu();
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
	if (scrollSpeed > 0) {
		distance += Math.round(scrollSpeed * dt);

		// === Peugeot: quebra após 1000m ===
		// now based on selected car (we check the current image name)
		if (IMAGES.player.src && IMAGES.player.src.indexOf("p206") !== -1 && distance >= 1000 && !player.crashed) {
			player.crashed = true;
			showLoseOverlay("💥 O Peugeot 206 quebrou após 1000m!");
			return;
		}

		// special final-phase triggers:
		if (currentPhase === 3) {
			// spawn rivals until 4999 (i.e., when distance < 5000)
			if (!inPhase3Sequence && distance >= 5000) {
				// trigger cinematic sequence
				startPhase3Sequence();
			}
		}

		if (distance >= CONFIG.MAX_DISTANCE && !normalWinTriggered) {
			normalWinTriggered = true;
			showWinOverlay(false);
			return;
		}
	} else if (scrollSpeed < 0) {
		distance = Math.max(0, distance + Math.round(scrollSpeed * dt));
	}

	// spawn rivals (phase-specific behavior)
	const now = performance.now();
	if (now >= spawnTimer) {
		// phase 3: only spawn while distance < 5000 and NOT in sequence
		if (currentPhase === 3) {
			if (!inPhase3Sequence && distance < 5000) {
				spawnRivalPhase3();
				// more difficult: reduce interval (40% faster)
				spawnTimer = now + Math.max(200, randInterval() * 0.6);
			} else {
				// don't spawn after sequence started
				spawnTimer = now + 1000;
			}
		} else if (currentPhase === 2) {
			// phase2: a little harder than phase1
			spawnRival();
			spawnTimer = now + Math.max(200, randInterval() * 0.85);
		} else {
			// phase1
			spawnRival();
			spawnTimer = now + randInterval();
		}
	}

	// update rivals positions
	for (let i = rivals.length - 1; i >= 0; i--) {
		const r = rivals[i];
		if (currentPhase === 1) {
			// fase 1: carros seguem reto (sem sway)
			r.y += (scrollSpeed >= 0 ? scrollSpeed : scrollSpeed * 0.6) * dt + r.speed * dt;
		} else {
			// fase 2 & phase3 pre-sequence: curvas (sway)
			const baseDown = (scrollSpeed >= 0) ? scrollSpeed : scrollSpeed * 0.6;
			r.y += (baseDown + r.speed) * dt;
			// phase3 pre-sequence still uses sway
			r.x += Math.sin((now + r.offset) / 600) * r.sway * dt;
		}

		// recycle if off bottom
		if (r.y > H + 120) {
			rivals.splice(i, 1);
			continue;
		}

		// collision check with player using adjustable hitbox
		if (player && !player.crashed && rectOverlap(player, r)) {
			player.crashed = true;
			showLoseOverlay();
			return;
		}
	}

	// if Brian is active, sync him to player's movement
	if (brianActive && brianCar) {
		// keep brian to the right side of player (or left if no space)
		const sideOffset = Math.min(140, player.width + 12);
		const targetX = (player.x + player.width + sideOffset < W - 8) ? (player.x + player.width + 12) : Math.max(8, player.x - player.width - 12);
		// smooth follow
		brianCar.x += (targetX - brianCar.x) * 0.35;
		brianCar.y = player.y; // same vertical position
	}

	updateHUD();
}

// === Phase 3 cinematic sequence starter ===
function startPhase3Sequence() {
	if (inPhase3Sequence) return;
	inPhase3Sequence = true;

	// 1) stop spawning rivals and freeze existing rivals from descending (they can drift off-screen)
	// We'll stop adding new rivals and also gradually clear rivals by not updating their y (set speed to 0)
	for (const r of rivals) {
		// reduce speed so they stop descending (but keep them visible)
		r.speed = 0;
	}

	// 2) swap player image to Toretto immediately
	IMAGES.player.src = "toretto.png";
	// optional: adjust player size slightly for the new sprite (keep proportions)
	player.img = IMAGES.player;

	// 3) stop the normal music and immediately play See You Again
	if (musicEnabled) {
		try { gameMusic.pause(); } catch (e) {}
	}
	try { seeyou.currentTime = 0; seeyou.play(); } catch (e) {}

	// 4) after 5 seconds, Brian "desce" e aparece ao lado e sincroniza
	const t1 = setTimeout(() => {
		brianActive = true;
		// create brianCar object
		brianCar = {
			img: IMAGES.brian,
			width: Math.min(140, Math.floor(W * 0.12)),
			height: Math.min(200, Math.floor(H * 0.18)),
			// start off-screen above and then settle aside of player
			x: player.x + player.width + 60,
			y: player.y - 40
		};
		// small arrival animation: slide down to player's y
		const arriveAnim = setInterval(() => {
			brianCar.y += 6;
			if (brianCar.y >= player.y) {
				brianCar.y = player.y;
				clearInterval(arriveAnim);
			}
		}, 16);
	}, 5000);
	phase3Timers.push(t1);

	// 5) after +20 seconds from Brian's arrival (i.e., ~25s from 5000), end game with final completion
	const t2 = setTimeout(() => {
		// mark phase3 as completed and unlock any future logic
		phase3Unlocked = true;
		// stop See You Again and show final "zerou o jogo"
		try { seeyou.pause(); seeyou.currentTime = 0; } catch (e) {}
		showFinalCompletion();
	}, 5000 + 20000);
	phase3Timers.push(t2);
}

// === Final completion overlay (end of game) ===
function showFinalCompletion() {
	gameRunning = false;
	inPhase3Sequence = false;
	brianActive = false;
	brianCar = null;

	const msg = `
		<h1 style="color:#ffd166;font-size:26px;">🏁 PARABÉNS — JOGO ZERADO! 🏁</h1>
		<p>Você completou a corrida final ao lado do Brian.</p>
		<p>Obrigado por jogar!</p>
		<div style="margin-top:16px;">
			<button id="btnBackToMenu" style="padding:10px 16px;font-family:'Press Start 2P';cursor:pointer;margin-right:8px;">Voltar ao Menu</button>
			<button id="btnReplayAll" style="padding:10px 16px;font-family:'Press Start 2P';cursor:pointer;">Jogar Novamente (Fase 1)</button>
		</div>
	`;
	overlayDiv.innerHTML = msg;
	overlayDiv.style.display = "flex";

	document.getElementById("btnBackToMenu").onclick = () => {
		overlayDiv.style.display = "none";
		restartGame();
	};
	document.getElementById("btnReplayAll").onclick = () => {
		overlayDiv.style.display = "none";
		currentPhase = 1;
		updatePhaseLabelInMenu();
		showPhaseIntro(1);
	};
}

// === Overlays: Win / Lose / Next-phase behavior ===
function showWinOverlay(isEaster) {
	gameRunning = false;
	if (musicEnabled) gameMusic.pause();
	try { soundVictory.currentTime = 0; soundVictory.play(); } catch(e){}

	// if player won phase 2, unlock phase 3
	if (currentPhase === 2) {
		phase3Unlocked = true;
	}

	let nextBtnHtml = '';
	if (currentPhase === 1) {
		nextBtnHtml = `<button id="btnNext" style="margin-top:20px;padding:10px 16px;font-family:'Press Start 2P';cursor:pointer;">Ir para Fase 2</button>`;
	} else if (currentPhase === 2) {
		nextBtnHtml = `<button id="btnNext" style="margin-top:20px;padding:10px 16px;font-family:'Press Start 2P';cursor:pointer;">Ir para Fase 3</button>`;
	} else {
		nextBtnHtml = `<button id="btnNext" style="margin-top:20px;padding:10px 16px;font-family:'Press Start 2P';cursor:pointer;">Jogar Novamente</button>`;
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
		// reinicia mesma fase via intro
		overlayDiv.style.display = "none";
		showPhaseIntro(currentPhase);
	};

	document.getElementById("btnMenu").onclick = () => {
		overlayDiv.style.display = "none";
		restartGame();
	};

	document.getElementById("btnNext").onclick = () => {
		if (currentPhase === 1) {
			currentPhase = 2;
			updatePhaseLabelInMenu();
			overlayDiv.style.display = "none";
			showPhaseIntro(2);
		} else if (currentPhase === 2) {
			if (!phase3Unlocked) {
				phase3Unlocked = true;
			}
			currentPhase = 3;
			updatePhaseLabelInMenu();
			overlayDiv.style.display = "none";
			showPhaseIntro(3);
		} else {
			// from phase 3 just replay phase1
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
// Updated spawnRival: Phase 1 spawns across the road width (random X inside road),
// phases 2/3 keep lane-based spawns for predictability.
function spawnRival() {
	const idx = Math.floor(Math.random() * IMAGES.rivals.length);
	const img = IMAGES.rivals[idx];
	const w = Math.min(120, Math.floor(W * (0.10 + Math.random() * 0.02)));
	const h = Math.min(170, Math.floor(H * (0.14 + Math.random() * 0.03)));

	let laneX;
	if (currentPhase === 1) {
		// Spawn anywhere across the road width for phase 1
		const roadW = Math.floor(W * 0.9);
		const roadX = Math.floor((W - roadW) / 2);
		laneX = Math.floor(roadX + Math.random() * (roadW - w));
	} else {
		// keep lane-based spawns for phase 2 and normal phase 3 spawns
		const lanes = [
			Math.floor(W * 0.2 - w / 2),
			Math.floor(W * 0.5 - w / 2),
			Math.floor(W * 0.8 - w / 2)
		];
		const laneIndex = Math.floor(Math.random() * lanes.length);
		laneX = lanes[laneIndex];
	}

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

// phase3 spawn uses faster, stronger rivals
function spawnRivalPhase3() {
	const idx = Math.floor(Math.random() * IMAGES.rivals.length);
	const img = IMAGES.rivals[idx];
	const w = Math.min(130, Math.floor(W * (0.11 + Math.random() * 0.03)));
	const h = Math.min(180, Math.floor(H * (0.15 + Math.random() * 0.04)));
	// lanes tuned to be within visible road area
	const roadW = Math.floor(W * 0.9);
	const roadX = Math.floor((W - roadW) / 2);
	const lanePositions = [
		Math.floor(roadX + roadW * 0.12 - w/2),
		Math.floor(roadX + roadW * 0.38 - w/2),
		Math.floor(roadX + roadW * 0.64 - w/2),
		Math.floor(roadX + roadW * 0.88 - w/2)
	];
	const laneIndex = Math.floor(Math.random() * lanePositions.length);
	const laneX = lanePositions[laneIndex];

	const r = {
		img,
		width: w,
		height: h,
		x: laneX,
		y: -h - 20,
		// stronger rivals: higher base speed
		speed: 4 + Math.random() * 4.5,
		sway: 10 + Math.random() * 18,
		offset: Math.random() * 1000
	};
	rivals.push(r);
}

function render() {
	// se jogo não está rodando por overlay, evita redesenhar ciclo normal aqui.
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
		const ry = Math.floor(r.y);
		if (r.img && r.img.complete) ctx.drawImage(r.img, r.x, ry, r.width, r.height);
		else { ctx.fillStyle = "#b33"; ctx.fillRect(r.x, ry, r.width, r.height); }

		// optional small label (visual only)
		ctx.fillStyle = "#fff";
		ctx.font = "12px monospace";
		ctx.fillText("RIVAL", r.x + 6, ry + 14);
	}

	// draw player (on top)
	if (player) {
		// ensure player.img assigned (sometimes IMAGES.player was updated)
		if (player.img && player.img.complete) ctx.drawImage(player.img, player.x, player.y, player.width, player.height);
		else { ctx.fillStyle = "#ff3b3b"; ctx.fillRect(player.x, player.y, player.width, player.height); }

		// nome do jogador (apenas visual — hitbox não conta o texto)
		ctx.fillStyle = "#fff";
		ctx.font = "12px monospace";
		ctx.fillText(playerName, player.x + 6, player.y + 14);
	}

	// draw brian car if active
	if (brianActive && brianCar) {
		if (IMAGES.brian && IMAGES.brian.complete) ctx.drawImage(IMAGES.brian, Math.floor(brianCar.x), Math.floor(brianCar.y), brianCar.width, brianCar.height);
		else { ctx.fillStyle = "#3399ff"; ctx.fillRect(Math.floor(brianCar.x), Math.floor(brianCar.y), brianCar.width, brianCar.height); }
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
	if (!canvas) return;
	canvas.width = W;
	canvas.height = H;
	if (player) {
		player.width = Math.min(140, Math.floor(W * 0.12));
		player.height = Math.min(200, Math.floor(H * 0.18));
		player.x = Math.floor(W / 2 - player.width / 2);
		player.y = Math.floor(H - player.height - 24);
	}
	// if brianCar exists, adapt size
	if (brianCar) {
		brianCar.width = Math.min(140, Math.floor(W * 0.12));
		brianCar.height = Math.min(200, Math.floor(H * 0.18));
	}
}

function drawMenuPreview() {
	if (!ctx) return;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = "rgba(0,0,0,0.45)";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = "#fff";
	ctx.font = "18px monospace";
	ctx.fillText("Pressione Iniciar para começar a corrida (Desktop - Vista Aérea)", 24, 48);
	// small preview draw (center) using current IMAGES.player if available
	const previewW = Math.min(120, Math.floor(W * 0.12));
	const previewH = Math.min(160, Math.floor(H * 0.12));
	const px = Math.floor(W/2 - previewW/2);
	const py = Math.floor(H/2 - previewH/2);
	if (IMAGES.player && IMAGES.player.complete) {
		ctx.drawImage(IMAGES.player, px, py, previewW, previewH);
	} else {
		ctx.fillStyle = "#ff3b3b";
		ctx.fillRect(px, py, previewW, previewH);
	}
}
