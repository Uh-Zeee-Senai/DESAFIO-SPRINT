// === CONFIGURAÇÕES (mude só aqui) ===
const CONFIG = {
	// imagens (nomes/fones)
	PLAYER_IMG: "ngtr.png",      // carro do jogador
	BOT_IMG: "bot.png",          // carro da IA
	BOOST_IMG: "supercar.png",   // visual durante boost
	EASTER_IMG: "ea.png",        // ícone do Easter Egg
	TRACK_BG: "pista.jpg",       // imagem da pista (opcional) - deix pilha no fundo

	// controle e física
	MAX_SPEED: 14,               // velocidade máxima base
	ACCEL: 0.35,                 // aceleração por frame quando ↑
	BRAKE: 0.6,                  // desaceleração ao frear (↓)
	FRICTION: 0.03,              // arrasto natural
	TURN_SPEED: 3.6,             // velocidade lateral (px/frame) base
	BOOST_MULTIPLIER: 1.9,       // multiplicador de velocidade no boost
	BOOST_DURATION: 5000,        // duração do boost em ms

	// pista / fases
	SECTORS: [
		{ name: "Rampa do Lago", color: "#f5e9a8", length: 1500 },
		{ name: "Fase de Nadar", color: "#f1c7c7", length: 1200 },
		{ name: "Fase da Escalada", color: "#b9c5f7", length: 1300 },
		{ name: "Fase do Espaço", color: "#c6f7c3", length: 1500 },
		{ name: "Fase do Flash", color: "#ffd8b0", length: 1000 },
		{ name: "Fase do Multiverso", color: "#e4c3f0", length: 2000 }
	],
	LAPS_TO_FINISH: 2,           // voltas necessárias para finalizar

	// gameplay misc
	SPAWN_EASTER_MIN: 6000,     // min ms para spawn do egg
	SPAWN_EASTER_MAX: 14000,    // max ms para spawn do egg
	AI_VARIANCE: 0.6            // variação no comportamento da IA
};

// === VARIÁVEIS GLOBAIS ===
let canvas, ctx, W, H;
let player, bot;
let hudPlayer, hudPhase, hudLap, hudSpeed, hudDist, hudPos;
let menuDiv, gameDiv, startBtn, nameInput, resetDataBtn;
let trackImage = null;
let currentSectorIndex = 0;
let sectorProgress = 0;     // distância percorrida no setor atual (metros)
let laps = 0;
let easter = null;         // {x,y,img,active}
let easterTimer = null;
let gameRunning = false;
let keys = {};
let lastFrameTime = 0;

// === CARREGA IMAGENS PRINCIPAIS ===
const IMG = {
	player: new Image(),
	bot: new Image(),
	boost: new Image(),
	easter: new Image(),
	track: new Image()
};
IMG.player.src = CONFIG.PLAYER_IMG;
IMG.bot.src = CONFIG.BOT_IMG;
IMG.boost.src = CONFIG.BOOST_IMG;
IMG.easter.src = CONFIG.EASTER_IMG;
IMG.track.src = CONFIG.TRACK_BG;

// === UTIL E INICIALIZAÇÃO DOM ===
window.addEventListener("DOMContentLoaded", () => {
	// DOM refs
	canvas = document.getElementById("gameCanvas");
	ctx = canvas.getContext("2d");

	menuDiv = document.getElementById("menu");
	gameDiv = document.getElementById("game");
	startBtn = document.getElementById("startBtn");
	nameInput = document.getElementById("playerName");
	resetDataBtn = document.getElementById("resetDataBtn");

	hudPlayer = document.getElementById("hudPlayer");
	hudPhase = document.getElementById("hudPhase");
	hudLap = document.getElementById("hudLap");
	hudSpeed = document.getElementById("hudSpeed");
	hudDist = document.getElementById("hudDist");
	hudPos = document.getElementById("hudPos");

	// restore last name
	const last = localStorage.getItem("lastPlayer");
	if (last) nameInput.value = last;

	// events
	startBtn.addEventListener("click", onStart);
	resetDataBtn.addEventListener("click", ()=>{ localStorage.removeItem("lastPlayer"); nameInput.value=""; });

	window.addEventListener("resize", onResize);
	window.addEventListener("keydown", e => keys[e.key] = true);
	window.addEventListener("keyup", e => keys[e.key] = false);

	onResize();
	renderMenu();
});

// === RENDER DO MENU (simples) ===
function renderMenu() {
	// nada especial, o HTML já mostra
}

// === INICIA A CORRIDA ===
function onStart() {
	const pName = (nameInput.value || "Piloto").trim();
	localStorage.setItem("lastPlayer", pName);

	// inicializa objetos do jogo
	initRace(pName);

	// troca telas
	menuDiv.style.display = "none";
	gameDiv.style.display = "block";

	// começa loop
	gameRunning = true;
	lastFrameTime = performance.now();
	requestAnimationFrame(gameLoop);

	// schedule first easter
	scheduleEasterSpawn();
}

// === INICIALIZA RACE ===
function initRace(playerName) {
	// canvas sizing
	onResize();

	// player e bot
	player = {
		name: playerName,
		x: W/2 - 140,
		y: H - 260,
		width: 100,
		height: 140,
		speed: 0,
		angle: 0,            // visual tilt
		img: IMG.player,
		boosting: false
	};

	bot = {
		name: "Rival",
		x: W/2 + 40,
		y: H - 300,
		width: 100,
		height: 140,
		speed: CONFIG.MAX_SPEED * 0.9,
		angle: 0,
		img: IMG.bot,
		aiState: 0
	};

	// reset pista/fases
	currentSectorIndex = 0;
	sectorProgress = 0;
	laps = 0;
	easter = null;

	// HUD default
	hudPlayer.textContent = player.name;
	updateHUD();
}

// === REDIMENSIONA CANVAS ===
function onResize() {
	W = window.innerWidth; H = window.innerHeight;
	canvas.width = W; canvas.height = H;
}

// === LOOP PRINCIPAL ===
function gameLoop(ts) {
	if (!gameRunning) return;
	const dt = Math.min(40, ts - lastFrameTime) / 16.6667; // dt em frames (~1 = 16.66ms)
	lastFrameTime = ts;

	update(dt);
	draw();

	requestAnimationFrame(gameLoop);
}

// === UPDATE (gameplay) ===
function update(dt) {
	// --- PLAYER INPUT: acelera / freia / lateral ---
	if (keys["ArrowUp"] || keys["w"]) player.speed += CONFIG.ACCEL * dt;
	else player.speed -= CONFIG.FRICTION * dt;

	if (keys["ArrowDown"] || keys["s"]) player.speed -= CONFIG.BRAKE * dt;

	player.speed = Math.max(0, Math.min(CONFIG.MAX_SPEED * (player.boosting ? CONFIG.BOOST_MULTIPLIER : 1), player.speed));

	// lateral
	let lateral = 0;
	if (keys["ArrowLeft"] || keys["a"]) lateral = -1;
	if (keys["ArrowRight"] || keys["d"]) lateral = 1;
	player.x += lateral * CONFIG.TURN_SPEED * (1 + (player.speed / CONFIG.MAX_SPEED)) * dt;

	// small tilt for visual
	player.angle = lateral * -0.18 * (player.speed / CONFIG.MAX_SPEED);

	// clamp player inside road bounds (central road area)
	const roadMargin = 0.17 * W;
	player.x = Math.max(roadMargin, Math.min(W - roadMargin - player.width, player.x));

	// --- BOT AI: simples seguidor com variação ---
	// bot tries to match player's progress plus some randomness
	const aiAdjust = (Math.sin(performance.now() / 3000 + bot.aiState) * CONFIG.AI_VARIANCE) + (Math.random() - 0.5) * 0.2;
	bot.speed += ( (CONFIG.MAX_SPEED * 0.9) - bot.speed ) * 0.02 * dt + aiAdjust * 0.02;
	// bot lateral correction toward center + small sway
	const desiredX = W/2 + Math.sin(performance.now()/1200 + bot.aiState) * 80;
	bot.x += (desiredX - bot.x) * 0.015 * dt;

	// clamp bot
	bot.x = Math.max(roadMargin, Math.min(W - roadMargin - bot.width, bot.x));

	// --- advance progress in current sector by player's forward travel ---
	// distance increment is proportional to player speed (bot also advances separately)
	const progressInc = player.speed * 18 * dt; // scale to "meters"
	sectorProgress += progressInc;

	// bot progress (so it can win or lose)
	const botProgressInc = bot.speed * 18 * dt * (0.9 + Math.random() * 0.2);
	// we won't store bot sector progress separately; instead compare relative speed/positions for "position"

	// if sector done -> move to next sector (this simulates crossing the start/finish line)
	const currentSector = CONFIG.SECTORS[currentSectorIndex];
	if (sectorProgress >= currentSector.length) {
		sectorProgress -= currentSector.length;
		currentSectorIndex = (currentSectorIndex + 1) % CONFIG.SECTORS.length;
		// if we wrapped, completed a lap
		if (currentSectorIndex === 0) {
			laps++;
			// check finish
			if (laps >= CONFIG.LAPS_TO_FINISH) finishRace();
		}
		// when crossing the line: change sector visual/effects
		applySectorEffects(currentSectorIndex);
	}

	// --- easter movement and pickup ---
	if (easter) {
		// Easter descends toward player (gives feeling of approaching)
		easter.y += 3 + player.speed * 0.3;
		// check collision with player
		if (rectsOverlap(easter, player)) {
			collectEaster();
			easter = null;
			scheduleEasterSpawn();
		} else if (easter.y > H + 100) {
			// missed
			easter = null;
			scheduleEasterSpawn();
		}
	}

	// update HUD values
	updateHUD();
}

// === APLICA EFEITOS AO MUDAR DE SECTOR ===
function applySectorEffects(sectorIndex) {
	// exemplo: cada setor pode alterar max speed / friction / visual
	const s = CONFIG.SECTORS[sectorIndex];
	// pequenas ideias:
	if (s.name.includes("Nadar")) {
		// slow down region effect
		CONFIG.MAX_SPEED = Math.max(6, CONFIG.MAX_SPEED - 0.5);
	} else if (s.name.includes("Flash")) {
		CONFIG.MAX_SPEED = Math.min(20, CONFIG.MAX_SPEED + 0.6);
	} else if (s.name.includes("Espaço")) {
		// low gravity: easier lateral movement (no direct gravity used here, just flavor)
		CONFIG.TURN_SPEED = Math.min(6, CONFIG.TURN_SPEED + 0.6);
	}
	// You can reset configs more deliberately if you want deterministic behavior.
}

// === DESENHO ===
function draw() {
	// background / track
	ctx.clearRect(0,0,W,H);

	// draw sky / background color based on current sector
	const s = CONFIG.SECTORS[currentSectorIndex];
	ctx.fillStyle = s.color || "#102030";
	ctx.fillRect(0,0,W,H);

	// optionally draw track image small faded at bottom
	if (IMG.track.complete) {
		ctx.save();
		ctx.globalAlpha = 0.18;
		const h = Math.min(H * 0.6, IMG.track.height);
		ctx.drawImage(IMG.track, 0, H - h, W, h);
		ctx.restore();
	}

	// draw road (perspective stripes)
	drawRoadSlices();

	// draw Easter Egg if present (above road)
	if (easter && IMG.easter.complete) {
		ctx.drawImage(IMG.easter, easter.x, easter.y, easter.width, easter.height);
	} else if (easter) {
		// fallback circle
		ctx.fillStyle = "#ffcc00";
		ctx.beginPath();
		ctx.arc(easter.x + easter.width/2, easter.y + easter.height/2, 18, 0, Math.PI*2);
		ctx.fill();
	}

	// draw bot behind player to give depth feel
	drawCar(bot);
	// draw player on top
	drawCar(player);
}

// === DESENHA FATIAS DE PISTA (simples pseudo-3D) ===
function drawRoadSlices() {
	const slices = 28;
	for (let i = 0; i < slices; i++) {
		// farther slices at top
		const t = i / slices;
		const perspective = 1 - t;
		const roadWTop = Math.max(240, W*0.18);
		const roadWBottom = Math.min(W*0.92, W*0.78);
		const roadW = roadWTop + (roadWBottom - roadWTop) * (1 - t);
		const x = (W - roadW) / 2;
		const y = Math.floor(H * (0.12 + t * 0.88));
		ctx.fillStyle = "#2b2b2b";
		ctx.fillRect(x, y, roadW, Math.ceil(H / slices) + 1);
		// center stripe mark
		if (i % 4 === 0) {
			ctx.fillStyle = "#f2f2f2";
			const dashW = 6;
			ctx.fillRect(W/2 - dashW/2, y, dashW, Math.ceil(H / slices) + 1);
		}
	}
}

// === DESENHA UM CARRO COM ROTACAO (tilt visual) ===
function drawCar(c) {
	const img = (c === player && player.boosting) ? IMG.boost : c.img;
	if (img && img.complete) {
		ctx.save();
		const cx = c.x + c.width/2;
		const cy = c.y + c.height/2;
		ctx.translate(cx, cy);
		ctx.rotate(c.angle || 0);
		ctx.drawImage(img, -c.width/2, -c.height/2, c.width, c.height);
		ctx.restore();
	} else {
		// placeholder rectangle
		ctx.fillStyle = "#ff3b3b";
		ctx.fillRect(c.x, c.y, c.width, c.height);
	}
}

// === EASTER SPAWN ===
function scheduleEasterSpawn() {
	const delay = CONFIG.SPAWN_EASTER_MIN + Math.random() * (CONFIG.SPAWN_EASTER_MAX - CONFIG.SPAWN_EASTER_MIN);
	clearTimeout(easterTimer);
	easterTimer = setTimeout(()=> {
		easter = {
			x: (W * 0.18) + Math.random() * (W * 0.64),
			y: -120,
			width: 68,
			height: 68
		};
	}, delay);
}

// === COLETAR EASTER ===
function collectEaster() {
	// apply boost and swap sprite
	if (player.boosting) return;
	player.boosting = true;
	player.img = IMG.boost;
	player.speed = Math.min(player.speed * CONFIG.BOOST_MULTIPLIER, CONFIG.MAX_SPEED * CONFIG.BOOST_MULTIPLIER);

	setTimeout(()=> {
		player.boosting = false;
		player.img = IMG.player;
		// optionally reduce speed a bit after boost
		player.speed = Math.min(player.speed, CONFIG.MAX_SPEED);
	}, CONFIG.BOOST_DURATION);
}

// === CHECK OVERLAP ===
function rectsOverlap(a,b) {
	if (!a || !b) return false;
	return !(a.x > b.x + b.width || a.x + a.width < b.x || a.y > b.y + b.height || a.y + a.height < b.y);
}

// === UPDATE HUD ===
function updateHUD() {
	hudPhase.textContent = CONFIG.SECTORS[currentSectorIndex].name;
	hudLap.textContent = `${laps}/${CONFIG.LAPS_TO_FINISH}`;
	hudSpeed.textContent = Math.round(player.speed * 10) + " km/h";
	hudDist.textContent = Math.max(0, Math.floor(CONFIG.SECTORS[currentSectorIndex].length - sectorProgress)) + "m";
	// simplistic position: compare player & bot x (not perfect, but a simple stand-in)
	hudPos.textContent = (player.x < bot.x) ? "1º" : "2º";
}

// === FIM DE CORRIDA ===
function finishRace() {
	gameRunning = false;
	alert(`${player.name}, corrida finalizada! Voltas: ${laps}/${CONFIG.LAPS_TO_FINISH}`);
	// volta ao menu
	menuDiv.style.display = "flex";
	gameDiv.style.display = "none";
}

// === UTIL: restart ou parar ===
function stopGame() {
	gameRunning = false;
	clearTimeout(easterTimer);
}

// === fim do script ===
