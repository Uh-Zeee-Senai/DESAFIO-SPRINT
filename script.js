// === CONFIGURAÇÕES (edite AQUI) ===
const CONFIG = {
	PLAYER_IMG: "ngtr.png",
	BOT_IMG: "bot.png",
	BOOST_IMG: "supercar.png",
	EASTER_IMG: "ea.png",
	TRACK_BG: "pista.jpg", // Imagem para o efeito parallax do fundo

	// Física e controle
	MAX_SPEED: 18,          // maior para corrida mais longa
	ACCEL: 0.3,             // aceleração por frame (segurando ↑)
	BRAKE: 1.2,             // desaceleração ao frear (↓)
	FRICTION: 0.03,         // desaceleração natural
	TURN_SPEED: 5.0,        // movimento lateral (px/frame)
	BOOST_MULTIPLIER: 1.9,
	BOOST_DURATION: 5000,

	// Pistas / fases (distâncias levemente ajustadas)
	SECTORS: [
		{ name: "Rampa do Lago", color: "#6699ff", length: 8500, aiMult: 1.05, img: "sector_lake.jpg" },
		{ name: "Fase de Nadar", color: "#33ccff", length: 9000, aiMult: 1.08, img: "sector_water.jpg" },
		{ name: "Fase da Escalada", color: "#b366ff", length: 8500, aiMult: 1.06, img: "sector_climb.jpg" },
		{ name: "Fase do Espaço", color: "#66ffcc", length: 10000, aiMult: 1.12, img: "sector_space.jpg" },
		{ name: "Fase do Flash", color: "#ffaa00", length: 7000, aiMult: 1.15, img: "sector_flash.jpg" },
		{ name: "Fase do Multiverso", color: "#ff66cc", length: 11000, aiMult: 1.18, img: "sector_multi.jpg" }
	],
	LAPS_TO_FINISH: 2,

	// misc
	SPAWN_EASTER_MIN: 9000,
	SPAWN_EASTER_MAX: 20000,
	AI_VARIANCE: 0.4,       // Variação na IA
	ROAD_WIDTH_PERC: 0.7,    // Largura máxima da pista na parte de baixo
	ROAD_SCROLL_SPEED_MULT: 0.8, // Multiplicador para velocidade de scroll da pista
	BG_SCROLL_SPEED_MULT: 0.1, // Multiplicador para velocidade de scroll do background (parallax)

    // NOVO: Parâmetros de Curva/Perspectiva
    CURVE_SENSITIVITY: 0.02, // Quão rápido a pista curva (0.0 a 1.0)
    MAX_CURVE_OFFSET: 0.4,   // Offset máximo do ponto de fuga (0.0 a 1.0, % da largura da tela)
    LANE_LINES_PER_SLICE: 4 // Quantas fatias para uma linha tracejada
};

// === VARIÁVEIS GLOBAIS ===
let canvas, ctx, W, H;
let menuDiv, gameDiv, startBtn, resetDataBtn, nameInput, debugDiv;
let hudPlayer, hudPhase, hudLap, hudSpeed, hudDist, hudPos;
let player, bot;
let currentSectorIndex = 0; let sectorProgress = 0; let laps = 0;
let easter = null; let easterTimer = null;
let obstacles = [];
let gameRunning = false;
let keys = {};
let lastFrameTime = 0;
let boostRemaining = 0;

let trackScrollOffset = 0;
let bgScrollOffset = 0;
// NOVO: Ponto de fuga da perspectiva (0 = centro, -1 = esquerda, 1 = direita)
let vanishingPointX = 0;


// === CARREGA IMAGENS (fallbacks se não existirem) ===
const IMG = {
	player: loadIfExists(CONFIG.PLAYER_IMG),
	bot: loadIfExists(CONFIG.BOT_IMG),
	boost: loadIfExists(CONFIG.BOOST_IMG),
	easter: loadIfExists(CONFIG.EASTER_IMG),
	track: loadIfExists(CONFIG.TRACK_BG)
};

for (let s of CONFIG.SECTORS) s._img = s.img ? loadIfExists(s.img) : null;

function loadIfExists(src) {
	const img = new Image();
	if (!src) return img;
	img.src = src;
	img.onload = () => console.log("Loaded image:", src);
	img.onerror = () => console.warn("Image not found (using placeholder):", src);
	return img;
}

function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function debug(m){ if (debugDiv) debugDiv.textContent = m; console.log("[G]", m); }

// === DOM READY ===
window.addEventListener("DOMContentLoaded", () => {
	canvas = document.getElementById("gameCanvas");
	ctx = canvas.getContext("2d");

	// Elementos UI
	menuDiv = document.getElementById("menu");
	gameDiv = document.getElementById("game");
	startBtn = document.getElementById("startBtn");
	resetDataBtn = document.getElementById("resetDataBtn");
	nameInput = document.getElementById("playerName");
	debugDiv = document.getElementById("debug");

	hudPlayer = document.getElementById("hudPlayer");
	hudPhase = document.getElementById("hudPhase");
	hudLap = document.getElementById("hudLap");
	hudSpeed = document.getElementById("hudSpeed");
	hudDist = document.getElementById("hudDist");
	hudPos = document.getElementById("hudPos");

	// restore nome salvo
	const last = localStorage.getItem("lastPlayer");
	if (last) nameInput.value = last;

	startBtn.addEventListener("click", onStart);
	resetDataBtn.addEventListener("click", ()=>{ localStorage.removeItem("lastPlayer"); nameInput.value=""; debug("Saved name cleared"); });

	window.addEventListener("resize", onResize);
	window.addEventListener("keydown", e => keys[e.key] = true);
	window.addEventListener("keyup", e => keys[e.key] = false);

	onResize();
	drawMenuFrame();
});

// === LAYOUT / MENU PREVIEW ===
function onResize() {
	W = window.innerWidth; H = window.innerHeight;
	if (canvas) { canvas.width = W; canvas.height = H; }
}

function drawMenuFrame() {
	onResize();
	ctx.fillStyle = "#071023";
	ctx.fillRect(0,0,W,H);
	// Preview da Pista
	if (IMG.track && IMG.track.complete) {
		ctx.globalAlpha = 0.12;
		ctx.drawImage(IMG.track, 0, H - Math.min(H*0.6, IMG.track.height || H), W, Math.min(H*0.6, IMG.track.height || H));
		ctx.globalAlpha = 1;
	}
}

// === START / INIT RACE ===
function onStart() {
	const name = (nameInput.value || "Piloto").trim();
	localStorage.setItem("lastPlayer", name);
	initRace(name);
	menuDiv.style.display = "none";
	gameDiv.style.display = "block";
	gameRunning = true;
	lastFrameTime = performance.now();
	requestAnimationFrame(gameLoop);
	scheduleEasterSpawn();
}

function initRace(playerName) {
	onResize();
	player = {
		name: playerName,
		img: IMG.player,
		x: W/2 - 55, // Carro centralizado
		y: H - 260, // Posição Y fixa
		width: 110, height: 150,
		speed: 0, angle: 0, boosting: false
	};
	bot = {
		name: "Rival",
		img: IMG.bot,
		x: W/2 + 40,
		y: H - 300,
		width: 110, height: 150,
		speed: CONFIG.MAX_SPEED * 0.9,
		aiOffset: 0,
        aiTargetX: W/2
	};
	currentSectorIndex = 0; sectorProgress = 0; laps = 0; easter = null; obstacles = []; boostRemaining = 0;
	trackScrollOffset = 0;
	bgScrollOffset = 0;
    vanishingPointX = 0; // Reset do ponto de fuga

	debug("Race initialized. Images ok? player=" + IMG.player.complete + " bot=" + IMG.bot.complete);
	updateHUD();
}

// === GAME LOOP ===
function gameLoop(ts) {
	if (!gameRunning) return;
	const dt = Math.min(48, ts - lastFrameTime) / 16.6667;
	const deltaMs = ts - lastFrameTime;
	lastFrameTime = ts;

	update(dt, deltaMs);
	render();

	requestAnimationFrame(gameLoop);
}

// === UPDATE (gameplay) ===
function update(dt, deltaMs) {
	// 1. PLAYER CONTROLS
	if (keys["ArrowUp"] || keys["w"]) {
		player.speed += CONFIG.ACCEL * dt;
	} else {
		player.speed -= CONFIG.FRICTION * dt;
	}
	if (keys["ArrowDown"] || keys["s"]) player.speed -= CONFIG.BRAKE * dt;

	player.speed = clamp(player.speed, 0, CONFIG.MAX_SPEED * (player.boosting ? CONFIG.BOOST_MULTIPLIER : 1));

	let lateral = 0;
	if (keys["ArrowLeft"] || keys["a"]) lateral = -1;
	if (keys["ArrowRight"] || keys["d"]) lateral = 1;

	// Movimento lateral do carro na tela
	player.x += lateral * CONFIG.TURN_SPEED * (1 + (player.speed / CONFIG.MAX_SPEED)) * dt;
	player.angle = lateral * -0.18 * (player.speed / CONFIG.MAX_SPEED); // Inclina o carro ao virar

	// NOVO: Ajusta o ponto de fuga da perspectiva (curva da pista)
    const targetVanishPoint = lateral * CONFIG.MAX_CURVE_OFFSET; // Alvo do ponto de fuga (-1 a 1)
    vanishingPointX += (targetVanishPoint - vanishingPointX) * CONFIG.CURVE_SENSITIVITY * dt;
    vanishingPointX = clamp(vanishingPointX, -CONFIG.MAX_CURVE_OFFSET, CONFIG.MAX_CURVE_OFFSET);
	
	// Clamp player to road area
	const roadMargin = W * (1 - CONFIG.ROAD_WIDTH_PERC) / 2;
	player.x = clamp(player.x, roadMargin, W - roadMargin - player.width);

	// 2. BOOST TIMER
	if (player.boosting) {
		boostRemaining = Math.max(0, boostRemaining - deltaMs);
		if (boostRemaining === 0) {
			player.boosting = false;
			player.img = IMG.player;
			player.speed = Math.min(player.speed, CONFIG.MAX_SPEED);
		}
	}

	// 3. BOT AI (Ajuste Fino de Dificuldade)
	const sector = CONFIG.SECTORS[currentSectorIndex];
	const aiTargetSpeed = CONFIG.MAX_SPEED * (sector.aiMult || 1) * (0.95 + Math.random()*0.08);

	bot.speed += (aiTargetSpeed - bot.speed) * 0.02 * dt + (Math.random()-0.5) * CONFIG.AI_VARIANCE;
	bot.speed = clamp(bot.speed, 0, CONFIG.MAX_SPEED * (sector.aiMult || 1) * 1.1);

	// Lógica de Overtaking do Bot (Continua a mesma, focada na posição)
    const playerCenter = player.x + player.width / 2;
    const botCenter = bot.x + bot.width / 2;
    const centerLine = W / 2;
    const roadHalfWidth = W * CONFIG.ROAD_WIDTH_PERC / 2;

    if (Math.abs(playerCenter - centerLine) < 50) {
        bot.aiTargetX = centerLine + (bot.aiOffset || 0);
    } else {
        bot.aiTargetX = (playerCenter < centerLine) ? centerLine + (roadHalfWidth / 2) - bot.width/2 : centerLine - (roadHalfWidth / 2) + bot.width/2;
    }

    bot.x += (bot.aiTargetX - botCenter) * 0.05 * dt;

	// Clamp bot to road area
	bot.x = clamp(bot.x, roadMargin, W - roadMargin - bot.width);


	// 4. Progresso de Setor / Fase e Scroll
	const progInc = player.speed * 18 * dt;
	sectorProgress += progInc;
	
	trackScrollOffset = (trackScrollOffset + player.speed * CONFIG.ROAD_SCROLL_SPEED_MULT * dt) % (H / 2);
	bgScrollOffset = (bgScrollOffset + player.speed * CONFIG.BG_SCROLL_SPEED_MULT * dt + (vanishingPointX * player.speed * 2) ) % H; // NOVO: Fundo também scrolla lateralmente com a curva

	if (sectorProgress >= sector.length) {
		sectorProgress -= sector.length;
		currentSectorIndex = (currentSectorIndex + 1) % CONFIG.SECTORS.length;
		if (currentSectorIndex === 0) {
			laps++;
			if (laps >= CONFIG.LAPS_TO_FINISH) finishRace();
		}
		debug("Entered sector: " + CONFIG.SECTORS[currentSectorIndex].name);
	}

	// 5. Easter movement + collide
	if (easter) {
		easter.y += (3 * dt * 10) + (player.speed * CONFIG.ROAD_SCROLL_SPEED_MULT * dt); 
		// NOVO: Easter Egg também é afetado pelo vanishingPointX para dar a sensação de que está na pista curva
		const roadCenter = W/2 + vanishingPointX * W * 0.5; // Ponto central da pista no horizonte
		const roadWidthAtEasterY = roadWidthTop + (roadWidthBottom - roadWidthTop) * ((easter.y - horizonY) / (H - horizonY));
		const roadXLeft = roadCenter - roadWidthAtEasterY/2;
		const roadXRight = roadCenter + roadWidthAtEasterY/2;

		// Move easter lateralmente para acompanhar a curva da pista
		easter.x += (roadCenter - (easter.x + easter.width/2)) * 0.05 * dt;

		if (rectsOverlap(easter, player)) {
			collectEaster();
			easter = null;
			scheduleEasterSpawn();
		} else if (easter.y > H + 200) {
			easter = null;
			scheduleEasterSpawn();
		}
	}
	
	// 6. Atualiza HUD
	updateHUD();
}

// === EASTER SPAWN / COLLECT ===
function scheduleEasterSpawn() {
	clearTimeout(easterTimer);
	const delay = CONFIG.SPAWN_EASTER_MIN + Math.random() * (CONFIG.SPAWN_EASTER_MAX - CONFIG.SPAWN_EASTER_MIN);
	easterTimer = setTimeout(()=> {
		const roadMargin = W * (1 - CONFIG.ROAD_WIDTH_PERC);
		easter = { x: roadMargin/2 + Math.random() * (W - roadMargin - 74), y: -140, width: 74, height: 74, img: IMG.easter };
		debug("Easter spawned");
	}, delay);
}

function collectEaster() {
	if (player.boosting) return;
	player.boosting = true;
	player.img = IMG.boost;
    boostRemaining = CONFIG.BOOST_DURATION;
	player.speed = Math.min(player.speed * CONFIG.BOOST_MULTIPLIER, CONFIG.MAX_SPEED * CONFIG.BOOST_MULTIPLIER);
}

// === DRAW (Renderização Avançada de Cenário) ===
function render() {
	const s = CONFIG.SECTORS[currentSectorIndex];

	// 1. Background (Sector Image or Color) com Parallax e Curva
	if (s._img && s._img.complete && s._img.naturalWidth !== 0) {
		const imgRatio = s._img.width / s._img.height;
		let imgH = H;
		let imgW = H * imgRatio;
		if (imgW < W) { imgW = W; imgH = W / imgRatio; } // Garante que cobre a largura

		// Calcula a posição X com base no vanishingPointX (curva) e bgScrollOffset (parallax)
		const targetBgX = (W - imgW) / 2 - (vanishingPointX * W * 0.2); // Movimento horizontal do fundo com a curva
		const drawX1 = targetBgX;
		const drawY1 = bgScrollOffset - imgH;
		const drawY2 = bgScrollOffset;


		ctx.drawImage(s._img, 0, 0, s._img.width, s._img.height, drawX1, drawY1, imgW, imgH);
		ctx.drawImage(s._img, 0, 0, s._img.width, s._img.height, drawX1, drawY2, imgW, imgH);


		ctx.fillStyle = "rgba(0,0,0,0.30)";
		ctx.fillRect(0,0,W,H);
	} else {
		ctx.fillStyle = s.color || "#0b1220";
		ctx.fillRect(0,0,W,H);
	}

	// Faint track texture bottom if available
	if (IMG.track && IMG.track.complete && IMG.track.naturalWidth !== 0) {
		ctx.save();
		ctx.globalAlpha = 0.18;
		const h = Math.min(H * 0.6, IMG.track.height || H*0.5);
		ctx.drawImage(IMG.track, 0, H - h, W, h);
		ctx.restore();
	}

	// 2. Draw Road (Pseudo-3D perspective com Curvas Free Gear-like)
	drawRoad();

	// 3. Draw easter
	if (easter) drawItem(easter, IMG.easter, "#ffcc00", 25);

	// 4. Draw bot then player
	drawCar(bot, bot.y);
	drawCar(player, player.y);
}

// NOVO: Desenha a pista com perspectiva 3D, scroll E CURVAS FREE GEAR-LIKE
function drawRoad() {
	const roadColor = "#2b2b2b";
	const stripesColor = "#f2f2f2";
    const sideColor = "#0d1b2a";

	const roadWidthTop = W * 0.05;
	const roadWidthBottom = W * CONFIG.ROAD_WIDTH_PERC;
	const horizonY = H * 0.15;
	const slices = 30; // Mais fatias = mais suave

    // O ponto de fuga é W/2 + (offset baseado em vanishingPointX)
    const currentVanishPointX = W/2 + vanishingPointX * W * 0.5; // Multiplica por W * 0.5 para escala

    // Desenha as laterais (off-road)
    ctx.fillStyle = sideColor;
    ctx.fillRect(0, horizonY, W, H - horizonY);

	for (let i = 0; i < slices; i++) {
		const tBase = i / slices;
		const tOffset = (trackScrollOffset / (H/2)) * (1/slices);
		const t = (tBase + tOffset) % 1;

		if (horizonY + (H - horizonY) * t < horizonY) continue; 

		const yStart = horizonY + (H - horizonY) * t;
		const yEnd = horizonY + (H - horizonY) * (t + 1/slices);

		const roadWStart = roadWidthTop + (roadWidthBottom - roadWidthTop) * t;
		const roadWEnd = roadWidthTop + (roadWidthBottom - roadWidthTop) * (t + 1/slices);
        
        // NOVO: Calcula o X da esquerda e direita da pista em relação ao ponto de fuga
        // Isso cria a distorção de perspectiva de curva
        const scaleStart = 1 - t; // Quanto mais perto (t=0), menor a escala de distorção
        const scaleEnd = 1 - (t + 1/slices);

        const xLeftStart = currentVanishPointX - (roadWStart / 2) / (1 + scaleStart * Math.abs(vanishingPointX) * 2);
        const xRightStart = currentVanishPointX + (roadWStart / 2) / (1 + scaleStart * Math.abs(vanishingPointX) * 2);

        const xLeftEnd = currentVanishPointX - (roadWEnd / 2) / (1 + scaleEnd * Math.abs(vanishingPointX) * 2);
        const xRightEnd = currentVanishPointX + (roadWEnd / 2) / (1 + scaleEnd * Math.abs(vanishingPointX) * 2);


		// Pista Principal
		ctx.fillStyle = roadColor;
		ctx.beginPath();
		ctx.moveTo(xLeftStart, yStart);
		ctx.lineTo(xLeftEnd, yEnd);
		ctx.lineTo(xRightEnd, yEnd);
		ctx.lineTo(xRightStart, yStart);
		ctx.fill();

		// Faixas Laterais
		const stripeW = 12; // Faixa mais grossa
		ctx.fillStyle = stripesColor;
		
        // Faixa Esquerda
		ctx.beginPath();
		ctx.moveTo(xLeftStart, yStart);
		ctx.lineTo(xLeftEnd, yEnd);
		ctx.lineTo(xLeftEnd + stripeW, yEnd);
		ctx.lineTo(xLeftStart + stripeW, yStart);
		ctx.fill();
        
        // Faixa Direita
        ctx.beginPath();
		ctx.moveTo(xRightStart - stripeW, yStart);
		ctx.lineTo(xRightEnd - stripeW, yEnd);
		ctx.lineTo(xRightEnd, yEnd);
		ctx.lineTo(xRightStart, yStart);
		ctx.fill();
        
		// Faixa Central tracejada
		if (Math.floor(t * slices) % CONFIG.LANE_LINES_PER_SLICE < CONFIG.LANE_LINES_PER_SLICE/2) {
            const dashW = 10; // Faixa central mais grossa
            ctx.fillStyle = stripesColor;
            ctx.beginPath();
            ctx.moveTo(currentVanishPointX - dashW/2, yStart);
            ctx.lineTo(currentVanishPointX - dashW/2, yEnd);
            ctx.lineTo(currentVanishPointX + dashW/2, yEnd);
            ctx.lineTo(currentVanishPointX + dashW/2, yStart);
            ctx.fill();
		}
	}
}

// ... Resto das funções (drawItem, drawCar, updateHUD, etc.) permanecem as mesmas ...

function drawItem(item, img, fallbackColor, fallbackSize) {
    if (img && img.complete && img.naturalWidth) {
		ctx.drawImage(img, item.x, item.y, item.width || item.w, item.height || item.h);
	} else {
		ctx.fillStyle = fallbackColor;
        ctx.beginPath();
		ctx.arc(item.x + (item.width || item.w)/2, item.y + (item.height || item.h)/2, fallbackSize, 0, Math.PI*2);
        ctx.fill();
	}
}

function drawCar(c, fixedY) {
	const img = (c === player && c.boosting) ? IMG.boost : c.img;
	if (img && img.complete && img.naturalWidth) {
		ctx.save();
		const cx = c.x + c.width/2;
		const cy = fixedY + c.height/2;
		ctx.translate(cx, cy);
		ctx.rotate(c.angle || 0);
		ctx.drawImage(img, -c.width/2, -c.height/2, c.width, c.height);
		ctx.restore();
	} else {
		ctx.save();
		const carColor = c === player ? (c.boosting ? "#ff00d9" : "#ff3b3b") : "#4a90e2";
		ctx.fillStyle = carColor;
		
		ctx.fillRect(c.x, fixedY + c.height * 0.2, c.width, c.height * 0.8);
        
        ctx.fillRect(c.x + c.width * 0.15, fixedY, c.width * 0.7, c.height * 0.3);

		ctx.fillStyle = "#fff";
		ctx.font = "bold 14px Arial";
		ctx.fillText(c === player ? (c.boosting ? "BOOST" : c.name) : c.name, c.x + 8, fixedY + c.height/2 + 6);
		ctx.restore();
	}
}

// === HUD / COLLISIONS / UTIL ===
function rectsOverlap(a,b) {
	if (!a || !b) return false;
	return !(a.x > b.x + (b.width || b.w) || a.x + (a.width || a.w) < b.x || a.y > b.y + (b.height || b.h) || a.y + (b.height || b.h) < b.y);
}

function updateHUD() {
	hudPlayer.textContent = player.name + (player.boosting ? ` (BOOST ${Math.ceil(boostRemaining / 1000)}s)` : ''); // Feedback de boost
	hudPhase.textContent = CONFIG.SECTORS[currentSectorIndex].name;
	hudLap.textContent = `${laps}/${CONFIG.LAPS_TO_FINISH}`;
	hudSpeed.textContent = Math.round(player.speed * 10) + " km/h";
	hudDist.textContent = Math.max(0, Math.floor(CONFIG.SECTORS[currentSectorIndex].length - sectorProgress)) + "m";
	hudPos.textContent = (player.x < bot.x) ? "1º" : "2º";
}

function finishRace() {
	gameRunning = false;
	alert(`${player.name}, corrida finalizada! Voltas: ${laps}/${CONFIG.LAPS_TO_FINISH}`);
	menuDiv.style.display = "flex";
	gameDiv.style.display = "none";
	clearTimeout(easterTimer);
}