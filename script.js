// === CONFIGURAÇÕES (edite AQUI) ===
const CONFIG = {
	PLAYER_IMG: "ngtr.png",
	BOT_IMG: "bot.png",
	BOOST_IMG: "supercar.png",
	EASTER_IMG: "ea.png",
	TRACK_BG: "pista.jpg", // Imagem para o efeito parallax do fundo
    CURVE_ARROW_IMG: "curve_arrow.png", // NOVO: Imagem para setas de curva

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

    // Parâmetros de Curva/Perspectiva
    CURVE_SENSITIVITY: 0.06,
    MAX_CURVE_OFFSET: 0.6,
    LANE_LINES_PER_SLICE: 4,

    // Distorção de Velocidade
    BASE_HORIZON_Y_PERC: 0.15,
    SPEED_ZOOM_FACTOR: 0.08,
    
    // Fator de Distorção da Pista para o Free Gear Look
    ROAD_DISTORTION_FACTOR: 3.5,
    ROAD_SIDE_STRIPE_WIDTH: 15,
    ROAD_CENTER_DASH_WIDTH: 12,

    // NOVO: Minimapa
    MINIMAP_SCALE: 0.005, // Escala do minimapa (quanto menor, mais distante a visão)
    MINIMAP_PLAYER_COLOR: "#00ff00",
    MINIMAP_BOT_COLOR: "#ff0000",
    MINIMAP_TRACK_COLOR: "#ffffff",

    // NOVO: Elementos 3D na pista (setas)
    CURVE_ARROWS_COUNT: 5, // Quantas setas de curva visíveis
    CURVE_ARROW_DIST: 2000 // Distância entre as setas
};

// === VARIÁVEIS GLOBAIS ===
let canvas, ctx, W, H;
let menuDiv, gameDiv, startBtn, resetDataBtn, nameInput, debugDiv;

// NOVAS REFERÊNCIAS DO HUD
let hudPos, hudLap, hudSpeedVal, hudMinimapCanvas, hudMinimapCtx, hudTime, hudBestTime, rpmSegments;
let gameTime = 0; // Tempo total da corrida
let bestLapTime = Infinity; // Melhor tempo de volta

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
let vanishingPointX = 0; // Ponto de fuga da perspectiva (-1 a 1)

// NOVO: Estrutura para elementos 3D na pista
let trackObjects = [];


// === CARREGA IMAGENS (fallbacks se não existirem) ===
const IMG = {
	player: loadIfExists(CONFIG.PLAYER_IMG),
	bot: loadIfExists(CONFIG.BOT_IMG),
	boost: loadIfExists(CONFIG.BOOST_IMG),
	easter: loadIfExists(CONFIG.EASTER_IMG),
	track: loadIfExists(CONFIG.TRACK_BG),
    curveArrow: loadIfExists(CONFIG.CURVE_ARROW_IMG) // Carrega a imagem da seta
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

	// NOVAS REFERÊNCIAS DO HUD
	hudPos = document.getElementById("hudPos");
	hudLap = document.getElementById("hudLap");
    hudSpeedVal = document.getElementById("hudSpeedVal");
    hudMinimapCanvas = document.getElementById("hudMinimap");
    hudMinimapCtx = hudMinimapCanvas.getContext("2d");
    hudTime = document.getElementById("hudTime");
    hudBestTime = document.getElementById("hudBestTime");
    rpmSegments = document.querySelectorAll("#hud-rpm-bar .rpm-segment");

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
    if (hudMinimapCanvas) { // Redimensionar o minimapa também
        hudMinimapCanvas.width = hudMinimapCanvas.parentElement.clientWidth;
        hudMinimapCanvas.height = hudMinimapCanvas.parentElement.clientHeight;
    }
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
    gameTime = 0; // Reinicia o tempo da corrida
	requestAnimationFrame(gameLoop);
	scheduleEasterSpawn();
}

function initRace(playerName) {
	onResize();
	player = {
		name: playerName,
		img: IMG.player,
		x: W/2 - 55,
		y: H - 260,
		width: 110, height: 150,
		speed: 0, angle: 0, boosting: false,
        totalDistance: 0 // NOVO: Distância total para o minimapa
	};
	bot = {
		name: "Rival",
		img: IMG.bot,
		x: W/2 + 40,
		y: H - 300,
		width: 110, height: 150,
		speed: CONFIG.MAX_SPEED * 0.9,
		aiOffset: 0,
        aiTargetX: W/2,
        totalDistance: 0 // NOVO: Distância total para o minimapa
	};
	currentSectorIndex = 0; sectorProgress = 0; laps = 0; easter = null; obstacles = []; boostRemaining = 0;
	trackScrollOffset = 0;
	bgScrollOffset = 0;
    vanishingPointX = 0;
    trackObjects = []; // Limpa objetos 3D
    generateTrackObjects(); // Gera novos objetos para a pista
    gameTime = 0;
    bestLapTime = Infinity;

	debug("Race initialized. Images ok? player=" + IMG.player.complete + " bot=" + IMG.bot.complete);
	updateHUD();
}

// NOVO: Geração de objetos 3D na pista
function generateTrackObjects() {
    trackObjects = [];
    let totalTrackLength = CONFIG.SECTORS.reduce((sum, s) => sum + s.length, 0) * CONFIG.LAPS_TO_FINISH;

    for (let i = 0; i < totalTrackLength; i += CONFIG.CURVE_ARROW_DIST) {
        // Para simplificar, vamos alternar setas para esquerda e direita, ou adicionar curvas.
        // Em um jogo real, a pista teria dados de curva. Aqui, é uma simulação simples.
        const isLeftCurve = Math.random() > 0.5;
        trackObjects.push({
            type: 'curveArrow',
            img: IMG.curveArrow,
            // x: (isLeftCurve ? W * 0.2 : W * 0.8), // Posição lateral fixa para demonstração
            x: W/2 + (isLeftCurve ? -W * 0.2 : W * 0.2), // Posição lateral
            y: i, // Distância na pista
            width: 80, height: 80,
            angle: isLeftCurve ? Math.PI/2 : -Math.PI/2, // Rotação da seta
            lane: isLeftCurve ? 'left' : 'right'
        });
    }
    // Sort by y (distance) to draw correctly
    trackObjects.sort((a,b) => b.y - a.y); // Do mais distante para o mais perto
}

// === GAME LOOP ===
function gameLoop(ts) {
	if (!gameRunning) return;
	const dt = Math.min(48, ts - lastFrameTime) / 16.6667;
	const deltaMs = ts - lastFrameTime;
	lastFrameTime = ts;
    gameTime += deltaMs; // Atualiza o tempo da corrida

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
	player.angle = lateral * -0.18 * (player.speed / CONFIG.MAX_SPEED);

	// Ajusta o ponto de fuga da perspectiva (curva da pista) com maior sensibilidade
    const targetVanishPoint = lateral * CONFIG.MAX_CURVE_OFFSET;
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

	// Lógica de Overtaking do Bot
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
	player.totalDistance += progInc; // Atualiza a distância total do jogador
    bot.totalDistance += bot.speed * 18 * dt; // Atualiza a distância total do bot
	
	trackScrollOffset = (trackScrollOffset + player.speed * CONFIG.ROAD_SCROLL_SPEED_MULT * dt) % (H / 2);
	bgScrollOffset = (bgScrollOffset + player.speed * CONFIG.BG_SCROLL_SPEED_MULT * dt + (vanishingPointX * player.speed * 8) ) % H;

	if (sectorProgress >= sector.length) {
		sectorProgress -= sector.length;
		currentSectorIndex = (currentSectorIndex + 1) % CONFIG.SECTORS.length;
		if (currentSectorIndex === 0) {
			laps++;
            if (gameTime < bestLapTime) {
                bestLapTime = gameTime; // Define o tempo de volta como o tempo total até agora
            }
            gameTime = 0; // Reinicia o tempo para a próxima volta
			if (laps >= CONFIG.LAPS_TO_FINISH) finishRace();
		}
		debug("Entered sector: " + CONFIG.SECTORS[currentSectorIndex].name);
	}

	// 5. Easter movement + collide
	if (easter) {
		easter.y += (3 * dt * 10) + (player.speed * CONFIG.ROAD_SCROLL_SPEED_MULT * dt); 

		const roadCenter = W/2 + vanishingPointX * W * CONFIG.MAX_CURVE_OFFSET; 
		easter.x += (roadCenter - (easter.x + easter.width/2)) * 0.08 * dt;

		if (rectsOverlap(easter, player)) {
			collectEaster();
			easter = null;
			scheduleEasterSpawn();
		} else if (easter.y > H + 200) {
			easter = null;
			scheduleEasterSpawn();
		}
	}

    // 6. Atualiza posição dos objetos 3D na pista
    for (let obj of trackObjects) {
        // 'obj.y' é a distância na pista.
        // Para converter isso para a coordenada Y da tela, precisamos de uma função de perspectiva.
        // Por enquanto, vamos simular o movimento com o scroll da pista.
        // A lógica completa de 3D será no render.
        // Esta parte é mais para simular que eles se movem para fora da tela.
        if (player.speed > 0) { // Somente se o jogador estiver se movendo
            obj.y -= player.speed * 18 * dt; // Move o objeto para "trás" na pista

            // Se o objeto passou muito para trás, reposiciona ele na frente
            if (obj.y < -CONFIG.CURVE_ARROW_DIST) {
                obj.y += CONFIG.SECTORS.reduce((sum, s) => sum + s.length, 0) * CONFIG.LAPS_TO_FINISH;
            }
        }
    }
	
	// 7. Atualiza HUD
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
		if (imgW < W) { imgW = W; imgH = W / imgRatio; }

		const targetBgX = (W - imgW) / 2 - (vanishingPointX * W * 0.4); 
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

	// 2. Draw Road (Pseudo-3D perspective com Curvas Free Gear-like e Zoom)
	drawRoad();

    // 3. Desenha objetos 3D na pista (setas de curva)
    drawTrackObjects();

	// 4. Draw easter
	if (easter) drawItem(easter, IMG.easter, "#ffcc00", 25);

	// 5. Draw bot then player
	drawCar(bot, bot.y);
	drawCar(player, player.y);

    // 6. Desenha o minimapa
    drawMinimap();
}

// NOVO: Desenha os objetos 3D (setas de curva)
function drawTrackObjects() {
    const horizonY = H * (CONFIG.BASE_HORIZON_Y_PERC - CONFIG.SPEED_ZOOM_FACTOR * (player.speed / (CONFIG.MAX_SPEED * CONFIG.BOOST_MULTIPLIER)));
    const currentVanishPointX = W/2 + vanishingPointX * W * 0.5;

    for (let obj of trackObjects) {
        // Calcula a posição Z (profundidade) do objeto
        // Quanto maior a distância (obj.y), mais no fundo da pista ele está
        const z = obj.y - player.totalDistance; // Distância relativa ao jogador

        // Se o objeto estiver atrás do jogador ou muito perto, não desenha
        if (z < 0 || z > H * 5) continue; // H*5 é uma distância arbitrária para desenhar

        // Convert Z (profundidade) para uma coordenada Y na tela (perspectiva)
        // Isso é uma simplificação da projeção 3D
        const perspectiveFactor = H / (z + 100); // +100 para evitar divisão por zero/distorção extrema
        const displayY = horizonY + (H - horizonY) * (1 - (z / (H * 5))); // Ajuste para que Y esteja entre horizonY e H

        // Calcula a posição X com base na distorção da curva
        const normalizedZ = clamp(z / (H * 5), 0, 1); // Z normalizado (0 a 1)
        const curveOffset = vanishingPointX * W * 0.3 * (1 - normalizedZ); // Deslocamento X com base na curva e profundidade
        const displayX = currentVanishPointX + curveOffset + (obj.x - W/2) * perspectiveFactor;

        const displayWidth = obj.width * perspectiveFactor;
        const displayHeight = obj.height * perspectiveFactor;

        // Desenha a imagem (a seta)
        if (obj.img && obj.img.complete) {
            ctx.save();
            ctx.translate(displayX, displayY);
            // Ajusta a rotação para virar para o lado da pista
            if (obj.lane === 'left') {
                ctx.rotate(-Math.PI / 4); // Seta apontando para cima e esquerda
            } else {
                ctx.rotate(Math.PI / 4); // Seta apontando para cima e direita
            }
            
            ctx.drawImage(obj.img, -displayWidth / 2, -displayHeight / 2, displayWidth, displayHeight);
            ctx.restore();
        } else {
            // Placeholder se a imagem não carregar
            ctx.fillStyle = obj.lane === 'left' ? "yellow" : "orange";
            ctx.fillRect(displayX - displayWidth/2, displayY - displayHeight/2, displayWidth, displayHeight);
        }
    }
}


// NOVO: Desenha a pista com distorção Free Gear Otimizada
function drawRoad() {
	const roadColor = "#2b2b2b";
	const stripesColor = "#f2f2f2";
    const sideColor = "#0d1b2a";

	const roadWidthTop = W * 0.05;
	const roadWidthBottom = W * CONFIG.ROAD_WIDTH_PERC;
    
    // Posição do horizonte ajustada pela velocidade (Zoom)
    const speedFactor = player.speed / (CONFIG.MAX_SPEED * CONFIG.BOOST_MULTIPLIER);
	const horizonY = H * (CONFIG.BASE_HORIZON_Y_PERC - CONFIG.SPEED_ZOOM_FACTOR * speedFactor); 
    
	const slices = 40;

    // Desenha as laterais (off-road)
    ctx.fillStyle = sideColor;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    const currentVanishPointX = W/2 + vanishingPointX * W * 0.5;

	for (let i = 0; i < slices; i++) {
		const tBase = i / slices;
		const tOffset = (trackScrollOffset / (H/2)) * (1/slices);
		const t = (tBase + tOffset) % 1;

		if (horizonY + (H - horizonY) * t < horizonY) continue; 

		const yStart = horizonY + (H - horizonY) * t;
		const yEnd = horizonY + (H - horizonY) * (t + 1/slices);

		const roadWStart = roadWidthTop + (roadWidthBottom - roadWidthTop) * t;
		const roadWEnd = roadWidthTop + (roadWidthBottom - roadWidthTop) * (t + 1/slices);
        
        const distortionFactor = CONFIG.ROAD_DISTORTION_FACTOR; 
        const curveInfluenceStart = Math.abs(vanishingPointX) * (1 - t) * distortionFactor;
        const curveInfluenceEnd = Math.abs(vanishingPointX) * (1 - (t + 1/slices)) * distortionFactor;

        const effectiveRoadWStart = roadWStart / (1 + curveInfluenceStart);
        const effectiveRoadWEnd = roadWEnd / (1 + curveInfluenceEnd);

        const centerOffsetStart = vanishingPointX * (1 - t) * W * 0.3;
        const centerOffsetEnd = vanishingPointX * (1 - (t + 1/slices)) * W * 0.3;

        const xLeftStart = currentVanishPointX + centerOffsetStart - effectiveRoadWStart / 2;
        const xRightStart = currentVanishPointX + centerOffsetStart + effectiveRoadWStart / 2;

        const xLeftEnd = currentVanishPointX + centerOffsetEnd - effectiveRoadWEnd / 2;
        const xRightEnd = currentVanishPointX + centerOffsetEnd + effectiveRoadWEnd / 2;


		// Pista Principal
		ctx.fillStyle = roadColor;
		ctx.beginPath();
		ctx.moveTo(xLeftStart, yStart);
		ctx.lineTo(xLeftEnd, yEnd);
		ctx.lineTo(xRightEnd, yEnd);
		ctx.lineTo(xRightStart, yStart);
		ctx.fill();

		// Faixas Laterais
		const stripeW = CONFIG.ROAD_SIDE_STRIPE_WIDTH;
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
            const dashW = CONFIG.ROAD_CENTER_DASH_WIDTH;
            ctx.fillStyle = stripesColor;
            ctx.beginPath();
            ctx.moveTo(currentVanishPointX + centerOffsetStart - dashW/2, yStart);
            ctx.lineTo(currentVanishPointX + centerOffsetEnd - dashW/2, yEnd);
            ctx.lineTo(currentVanishPointX + centerOffsetEnd + dashW/2, yEnd);
            ctx.lineTo(currentVanishPointX + centerOffsetStart + dashW/2, yStart);
            ctx.fill();
		}
	}
}

// NOVO: Desenha o minimapa
function drawMinimap() {
    const mmW = hudMinimapCanvas.width;
    const mmH = hudMinimapCanvas.height;
    hudMinimapCtx.clearRect(0, 0, mmW, mmH);

    // Desenha o "caminho" da pista no minimapa (simples, apenas uma linha)
    hudMinimapCtx.strokeStyle = CONFIG.MINIMAP_TRACK_COLOR;
    hudMinimapCtx.lineWidth = 2;
    hudMinimapCtx.beginPath();
    // Simulação de uma pista circular para o minimapa (pode ser mais complexa com dados da pista real)
    hudMinimapCtx.arc(mmW / 2, mmH / 2, mmW * 0.4, 0, Math.PI * 2); 
    hudMinimapCtx.stroke();

    // Calcula a posição do jogador e bot no minimapa
    const totalTrackLength = CONFIG.SECTORS.reduce((sum, s) => sum + s.length, 0) * CONFIG.LAPS_TO_FINISH;
    const playerTrackProgress = (player.totalDistance % totalTrackLength) / totalTrackLength;
    const botTrackProgress = (bot.totalDistance % totalTrackLength) / totalTrackLength;

    // Converte progresso linear para posição em um círculo no minimapa
    const playerAngle = playerTrackProgress * Math.PI * 2 - Math.PI / 2; // -PI/2 para começar no "topo"
    const botAngle = botTrackProgress * Math.PI * 2 - Math.PI / 2;

    const radius = mmW * 0.4;
    const centerX = mmW / 2;
    const centerY = mmH / 2;

    // Desenha o jogador
    hudMinimapCtx.fillStyle = CONFIG.MINIMAP_PLAYER_COLOR;
    hudMinimapCtx.beginPath();
    hudMinimapCtx.arc(centerX + radius * Math.cos(playerAngle), centerY + radius * Math.sin(playerAngle), 5, 0, Math.PI * 2);
    hudMinimapCtx.fill();

    // Desenha o bot
    hudMinimapCtx.fillStyle = CONFIG.MINIMAP_BOT_COLOR;
    hudMinimapCtx.beginPath();
    hudMinimapCtx.arc(centerX + radius * Math.cos(botAngle), centerY + radius * Math.sin(botAngle), 5, 0, Math.PI * 2);
    hudMinimapCtx.fill();
}


// ... Resto das funções (drawItem, drawCar, rectsOverlap, finishRace) sem alteração principal...

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

// NOVO: Função para formatar o tempo (MM'SS"CC)
function formatTime(ms) {
    if (ms === Infinity) return `--'--" --`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const centiseconds = Math.floor((ms % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}'${String(seconds).padStart(2, '0')}"${String(centiseconds).padStart(2, '0')}`;
}


function updateHUD() {
	// Posição e Volta
	hudPos.textContent = `1/${CONFIG.SECTORS.length}`; // Posição hardcoded por enquanto
	hudLap.textContent = `${laps}/${CONFIG.LAPS_TO_FINISH}`;

	// Velocidade e RPM
	const speedKPH = Math.round(player.speed * 10);
	hudSpeedVal.textContent = String(speedKPH).padStart(3, '0');

    // RPM Bar - Simplesmente ativa segmentos com base na velocidade
    const maxSpeedForRpm = CONFIG.MAX_SPEED * CONFIG.BOOST_MULTIPLIER;
    const rpmLevel = Math.floor((player.speed / maxSpeedForRpm) * rpmSegments.length);

    rpmSegments.forEach((segment, index) => {
        segment.classList.remove('active-green', 'active-yellow', 'active-red');
        if (index < rpmLevel) {
            if (index < rpmSegments.length * 0.6) { // Verde até 60%
                segment.classList.add('active-green');
            } else if (index < rpmSegments.length * 0.85) { // Amarelo até 85%
                segment.classList.add('active-yellow');
            } else { // Vermelho no final
                segment.classList.add('active-red');
            }
        }
    });

    // Tempo
    hudTime.textContent = formatTime(gameTime);
    hudBestTime.textContent = formatTime(bestLapTime);
}

function finishRace() {
	gameRunning = false;
	alert(`${player.name}, corrida finalizada! Voltas: ${laps}/${CONFIG.LAPS_TO_FINISH}`);
	menuDiv.style.display = "flex";
	gameDiv.style.display = "none";
	clearTimeout(easterTimer);
}