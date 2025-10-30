// === CONFIGURAÇÕES (edite AQUI) ===
const CONFIG = {
	PLAYER_IMG: "ngtr.png",
	BOT_IMG: "bot.png",
	BOOST_IMG: "supercar.png", // A imagem do carro turbo/boost
	EASTER_IMG: "ea.png",      // A imagem do próprio easter egg na pista
	TRACK_BG: "pista.jpg", 
    CURVE_ARROW_IMG: "curve_arrow.png",

	// Física e controle
	MAX_SPEED: 18,
	ACCEL: 0.3,
	BRAKE: 1.2,
	FRICTION: 0.03,
	TURN_SPEED: 5.0,
	BOOST_MULTIPLIER: 1.9,
	BOOST_DURATION: 5000,

	// Pistas / fases 
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
	AI_VARIANCE: 0.4,
	ROAD_WIDTH_PERC: 0.7,
	ROAD_SCROLL_SPEED_MULT: 0.8,
	BG_SCROLL_SPEED_MULT: 0.1,

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

    // Chevrons Laterais (Verde, inspirado no Free Gear)
    ROAD_SIDE_CHEVRON_WIDTH: 20,
    ROAD_SIDE_CHEVRON_COLOR_LIGHT: "#00ff00",
    ROAD_SIDE_CHEVRON_COLOR_DARK: "#00aa00",
    ROAD_SIDE_CHEVRON_DASH_LENGTH: 8,

    // Minimapa
    MINIMAP_SCALE: 0.005, 
    MINIMAP_PLAYER_COLOR: "#00ff00",
    MINIMAP_BOT_COLOR: "#ff0000",
    MINIMAP_TRACK_COLOR: "#ffffff",
    MINIMAP_TRACK_LENGTH_FACTOR: 0.00005, 
    MINIMAP_POINT_SIZE: 5,

    // Elementos 3D na pista (setas)
    CURVE_ARROWS_COUNT: 5, 
    CURVE_ARROW_DIST: 1500,

    CAR_BASE_Y_PIXELS: 500 // NOVO: Posição Y fixa em pixels para debug do carro. Será ajustado por H.
};

// === VARIÁVEIS GLOBAIS ===
let canvas, ctx, W, H;
let menuDiv, gameDiv, startBtn, resetDataBtn, nameInput, debugDiv;
let hudPos, hudLap, hudSpeedVal, hudMinimapCanvas, hudMinimapCtx, hudTime, hudBestTime, rpmSegments;
let gameTime = 0;
let bestLapTime = Infinity;
let player, bot;
let currentSectorIndex = 0; let sectorProgress = 0; let laps = 0;
let easter = null; let easterTimer = null;
let gameRunning = false;
let keys = {};
let lastFrameTime = 0;
let boostRemaining = 0;
let trackScrollOffset = 0;
let bgScrollOffset = 0;
let vanishingPointX = 0;
let trackObjects = [];
let totalTrackLength = 0;

// === CARREGA IMAGENS ===
const IMG = {
	player: loadIfExists(CONFIG.PLAYER_IMG),
	bot: loadIfExists(CONFIG.BOT_IMG),
	boost: loadIfExists(CONFIG.BOOST_IMG), // Carrega a imagem do carro turbo
	easter: loadIfExists(CONFIG.EASTER_IMG), // Carrega a imagem do próprio easter egg (item a ser coletado)
	track: loadIfExists(CONFIG.TRACK_BG),
    curveArrow: loadIfExists(CONFIG.CURVE_ARROW_IMG)
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

	menuDiv = document.getElementById("menu");
	gameDiv = document.getElementById("game");
	startBtn = document.getElementById("startBtn");
	resetDataBtn = document.getElementById("resetDataBtn");
	nameInput = document.getElementById("playerName");
	debugDiv = document.getElementById("debug");

	hudPos = document.getElementById("hudPos");
	hudLap = document.getElementById("hudLap");
    hudSpeedVal = document.getElementById("hudSpeedVal");
    hudMinimapCanvas = document.getElementById("hudMinimap");
    if (hudMinimapCanvas) {
        hudMinimapCtx = hudMinimapCanvas.getContext("2d");
    }
    hudTime = document.getElementById("hudTime");
    hudBestTime = document.getElementById("hudBestTime");
    rpmSegments = document.querySelectorAll("#hud-rpm-bar .rpm-segment");

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
    if (hudMinimapCanvas) {
        hudMinimapCanvas.width = hudMinimapCanvas.parentElement.clientWidth;
        hudMinimapCanvas.height = hudMinimapCanvas.parentElement.clientHeight;
    }
}

function drawMenuFrame() {
	onResize();
	ctx.fillStyle = "#071023";
	ctx.fillRect(0,0,W,H);
	if (IMG.track && IMG.track.complete) {
		ctx.globalAlpha = 0.12;
		ctx.drawImage(IMG.track, 0, H - Math.min(H*0.6, IMG.track.height || H), W, Math.min(H*0.6, IMG.track.height || H));
		ctx.globalAlpha = 1;
	}
}

// === START / INIT RACE ===
function onStart() {
    onResize(); 
    if (W === 0 || H === 0) {
        console.error("ERRO CRÍTICO: Dimensões da tela não definidas. Recarregue a página.");
        return; 
    }

	const name = (nameInput.value || "Piloto").trim();
	localStorage.setItem("lastPlayer", name);
	initRace(name);
	
	menuDiv.style.display = "none";
	gameDiv.style.display = "block";
	
	gameRunning = true;
	lastFrameTime = performance.now();
    gameTime = 0;
	requestAnimationFrame(gameLoop);
	scheduleEasterSpawn();
}

function initRace(playerName) {
    totalTrackLength = CONFIG.SECTORS.reduce((sum, s) => sum + s.length, 0) * CONFIG.LAPS_TO_FINISH;

	player = {
		name: playerName,
		img: IMG.player,
		x: W/2 - 55,
		y: H - CONFIG.CAR_BASE_Y_PIXELS, // Ajustado para ser mais visível na base da tela
		width: 110, height: 150,
		speed: 0, angle: 0, boosting: false,
        totalDistance: 0
	};
	bot = {
		name: "Rival",
		img: IMG.bot,
		x: W/2 + 40,
		y: H - CONFIG.CAR_BASE_Y_PIXELS, // Ajustado para ser mais visível
		width: 110, height: 150,
		speed: CONFIG.MAX_SPEED * 0.9,
		aiOffset: 0,
        aiTargetX: W/2,
        totalDistance: 0
	};
	currentSectorIndex = 0; sectorProgress = 0; laps = 0; easter = null; trackObjects = []; boostRemaining = 0;
	trackScrollOffset = 0;
	bgScrollOffset = 0;
    vanishingPointX = 0;
    generateTrackObjects();
    gameTime = 0;
    bestLapTime = Infinity;

	debug("Race initialized. Player Y: " + player.y + ". Car base pixels: " + CONFIG.CAR_BASE_Y_PIXELS);
	updateHUD();
}

function generateTrackObjects() {
    trackObjects = [];
    for (let i = 0; i < totalTrackLength; i += CONFIG.CURVE_ARROW_DIST) {
        const isLeftCurve = Math.random() > 0.5;
        trackObjects.push({
            type: 'curveArrow',
            img: IMG.curveArrow,
            x: (isLeftCurve ? -1 : 1),
            z: i,
            width: 80, height: 80, 
            angle: isLeftCurve ? Math.PI/2 : -Math.PI/2,
            lane: isLeftCurve ? 'left' : 'right'
        });
    }
    trackObjects.sort((a,b) => b.z - a.z);
}

// === GAME LOOP ===
function gameLoop(ts) {
	if (!gameRunning) return;
    
    const deltaMs = ts - lastFrameTime;
	const dt = Math.min(48, deltaMs) / 16.6667;
	lastFrameTime = ts;
    gameTime += deltaMs;

	update(dt, deltaMs);
	render();

	requestAnimationFrame(gameLoop);
}

// === UPDATE (gameplay) ===
function update(dt, deltaMs) {
    if (dt <= 0) dt = 1;

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

	player.x += lateral * CONFIG.TURN_SPEED * (1 + (player.speed / CONFIG.MAX_SPEED)) * dt;
	player.angle = lateral * -0.18 * (player.speed / CONFIG.MAX_SPEED);

	const targetVanishPoint = lateral * CONFIG.MAX_CURVE_OFFSET;
    vanishingPointX += (targetVanishPoint - vanishingPointX) * CONFIG.CURVE_SENSITIVITY * dt;
    vanishingPointX = clamp(vanishingPointX, -CONFIG.MAX_CURVE_OFFSET, CONFIG.MAX_CURVE_OFFSET);
	
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

	// 3. BOT AI (Mantido)
	const sector = CONFIG.SECTORS[currentSectorIndex];
	const aiTargetSpeed = CONFIG.MAX_SPEED * (sector.aiMult || 1) * (0.95 + Math.random()*0.08);
	bot.speed += (aiTargetSpeed - bot.speed) * 0.02 * dt + (Math.random()-0.5) * CONFIG.AI_VARIANCE;
	bot.speed = clamp(bot.speed, 0, CONFIG.MAX_SPEED * (sector.aiMult || 1) * 1.1);

	const playerCenter = player.x + player.width / 2;
    const centerLine = W / 2;
    const roadHalfWidth = W * CONFIG.ROAD_WIDTH_PERC / 2;
    if (Math.abs(playerCenter - centerLine) < 50) {
        bot.aiTargetX = centerLine + (bot.aiOffset || 0);
    } else {
        bot.aiTargetX = (playerCenter < centerLine) ? centerLine + (roadHalfWidth / 2) - bot.width/2 : centerLine - (roadHalfWidth / 2) + bot.width/2;
    }

    bot.x += (bot.aiTargetX - (bot.x + bot.width/2)) * 0.05 * dt;
	bot.x = clamp(bot.x, roadMargin, W - roadMargin - bot.width);


	// 4. Progresso de Setor / Fase e Scroll
	const progInc = player.speed * 18 * dt;
	sectorProgress += progInc;
	player.totalDistance += progInc;
    bot.totalDistance += bot.speed * 18 * dt;
	
	trackScrollOffset = (trackScrollOffset + player.speed * CONFIG.ROAD_SCROLL_SPEED_MULT * dt) % (H / 2);
	bgScrollOffset = (bgScrollOffset + player.speed * CONFIG.BG_SCROLL_SPEED_MULT * dt + (vanishingPointX * player.speed * 8) ) % H;

	if (sectorProgress >= sector.length) {
		sectorProgress -= sector.length;
		currentSectorIndex = (currentSectorIndex + 1) % CONFIG.SECTORS.length;
		if (currentSectorIndex === 0) {
			laps++;
            if (gameTime < bestLapTime) {
                bestLapTime = gameTime; 
            }
            gameTime = 0;
			if (laps >= CONFIG.LAPS_TO_FINISH) finishRace();
		}
	}

	// 5. Easter movement + collide
	if (easter) {
        const roadCenter = W/2 + vanishingPointX * W * CONFIG.MAX_CURVE_OFFSET; 
        const zRelativeToPlayer = easter.z - player.totalDistance;
        const perspectiveProjectionDistance = 200; 
        const scale = perspectiveProjectionDistance / (zRelativeToPlayer + perspectiveProjectionDistance);
        const horizonY = H * (CONFIG.BASE_HORIZON_Y_PERC - CONFIG.SPEED_ZOOM_FACTOR * (player.speed / (CONFIG.MAX_SPEED * CONFIG.BOOST_MULTIPLIER)));
        const displayY = horizonY + (H - horizonY) * (1 - (zRelativeToPlayer / (totalTrackLength / CONFIG.LAPS_TO_FINISH * 0.5)));
        const worldX = roadCenter + (easter.x * W * 0.2) * scale;
        
        if (displayY > player.y - player.height * 0.5 && displayY < player.y + player.height) {
            const collisionRect = { x: worldX - (easter.width * scale)/2, y: displayY - (easter.height * scale)/2, width: easter.width * scale, height: easter.height * scale };
            const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };

            if (rectsOverlap(collisionRect, playerRect)) {
                collectEaster();
                easter = null;
                scheduleEasterSpawn();
            }
        }
	}

    // 6. Atualiza posição dos objetos 3D na pista
    for (let obj of trackObjects) {
        obj.z -= player.speed * 18 * dt;
        if (obj.z < -CONFIG.CURVE_ARROW_DIST * 2) {
            obj.z += totalTrackLength;
            const isLeftCurve = Math.random() > 0.5;
            obj.x = (isLeftCurve ? -1 : 1);
            obj.lane = isLeftCurve ? 'left' : 'right';
            obj.angle = isLeftCurve ? Math.PI/2 : -Math.PI/2;
        }
    }
	
	// 7. Atualiza HUD
	updateHUD();
}

// === DRAW (Renderização) ===
function render() {
	const s = CONFIG.SECTORS[currentSectorIndex];

	// 1. Background
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

	if (IMG.track && IMG.track.complete && IMG.track.naturalWidth !== 0) {
		ctx.save();
		ctx.globalAlpha = 0.18;
		const h = Math.min(H * 0.6, IMG.track.height || H*0.5);
		ctx.drawImage(IMG.track, 0, H - h, W, h);
		ctx.restore();
	}

	// 2. Draw Road
	drawRoad();

    // 3. Desenha objetos 3D na pista
    let allRenderableObjects = [...trackObjects];
    if (easter) {
        allRenderableObjects.push(easter);
    }
    allRenderableObjects.sort((a,b) => b.z - a.z);

    for (let obj of allRenderableObjects) {
        if (obj.type === 'curveArrow') {
            drawCurveArrow(obj);
        } else if (obj.type === 'easter') {
            drawEasterEgg3D(obj);
        }
    }

	// 4. DRAW CARS (CRÍTICO: DEVE APARECER AGORA)
	drawCar(bot, bot.y);
	drawCar(player, player.y);

    // DEBUG VISUAL: Desenha um círculo no player.y para verificar a posição
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(player.x + player.width / 2, player.y + player.height / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.fillText("Player Y: " + player.y.toFixed(2), player.x, player.y - 10);
    // FIM DO DEBUG VISUAL

    // 5. Desenha o minimapa
    drawMinimap();
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
        // FALLBACK DE DEBUG: DEVE APARECER SEMPRE QUE A IMAGEM FALHAR
		ctx.save();
		const carColor = c === player ? (c.boosting ? "#ff00d9" : "#ff3b3b") : "#4a90e2";
		ctx.fillStyle = carColor;
		
        // Retângulo simples e menor para facilitar a visualização se as imagens falharem
		ctx.fillRect(c.x + c.width * 0.1, fixedY + c.height * 0.1, c.width * 0.8, c.height * 0.8); 

		ctx.fillStyle = "#fff";
		ctx.font = "bold 14px Arial";
		ctx.fillText(c.name, c.x + 8, fixedY + c.height/2 + 6);
		ctx.restore();
	}
}

// === OUTRAS FUNÇÕES (Mantidas) ===

function drawCurveArrow(obj) {
    const horizonY = H * (CONFIG.BASE_HORIZON_Y_PERC - CONFIG.SPEED_ZOOM_FACTOR * (player.speed / (CONFIG.MAX_SPEED * CONFIG.BOOST_MULTIPLIER)));
    const currentVanishPointX = W/2 + vanishingPointX * W * 0.5;

    const zRelativeToPlayer = obj.z - player.totalDistance;

    if (zRelativeToPlayer < 0 || zRelativeToPlayer > totalTrackLength / CONFIG.LAPS_TO_FINISH * 0.5) return;

    const perspectiveProjectionDistance = 200;
    const scale = perspectiveProjectionDistance / (zRelativeToPlayer + perspectiveProjectionDistance);

    const worldX = currentVanishPointX + (obj.x * W * 0.3) * scale;

    const maxDrawDistance = totalTrackLength / CONFIG.LAPS_TO_FINISH * 0.5;
    const normalizedZ = clamp(zRelativeToPlayer / maxDrawDistance, 0, 1);
    const displayY = horizonY + (H - horizonY) * (1 - normalizedZ);

    const displayWidth = obj.width * scale;
    const displayHeight = obj.height * scale;

    if (obj.img && obj.img.complete) {
        ctx.save();
        ctx.translate(worldX, displayY);
        ctx.rotate(obj.angle);
        ctx.drawImage(obj.img, -displayWidth / 2, -displayHeight / 2, displayWidth, displayHeight);
        ctx.restore();
    } else {
        ctx.fillStyle = obj.lane === 'left' ? "yellow" : "orange";
        ctx.fillRect(worldX - displayWidth/2, displayY - displayHeight/2, displayWidth, displayHeight);
    }
}

function drawEasterEgg3D(obj) {
    const horizonY = H * (CONFIG.BASE_HORIZON_Y_PERC - CONFIG.SPEED_ZOOM_FACTOR * (player.speed / (CONFIG.MAX_SPEED * CONFIG.BOOST_MULTIPLIER)));
    const currentVanishPointX = W/2 + vanishingPointX * W * 0.5;

    const zRelativeToPlayer = obj.z - player.totalDistance;

    if (zRelativeToPlayer < 0 || zRelativeToPlayer > totalTrackLength / CONFIG.LAPS_TO_FINISH * 0.5) return;

    const perspectiveProjectionDistance = 200;
    const scale = perspectiveProjectionDistance / (zRelativeToPlayer + perspectiveProjectionDistance);

    const worldX = currentVanishPointX + (obj.x * W * 0.2) * scale;
    const maxDrawDistance = totalTrackLength / CONFIG.LAPS_TO_FINISH * 0.5;
    const normalizedZ = clamp(zRelativeToPlayer / maxDrawDistance, 0, 1);
    const displayY = horizonY + (H - horizonY) * (1 - normalizedZ);

    const displayWidth = obj.width * scale;
    const displayHeight = obj.height * scale;

    drawItem({x: worldX - displayWidth/2, y: displayY - displayHeight/2, width: displayWidth, height: displayHeight}, obj.img, "#ffcc00", displayWidth/2);
}

function drawRoad() {
	const roadColor = "#2b2b2b";
	const stripesColor = "#f2f2f2";
    const sideColor = "#0d1b2a";

	const roadWidthTop = W * 0.05;
	const roadWidthBottom = W * CONFIG.ROAD_WIDTH_PERC;
    
    const speedFactor = player.speed / (CONFIG.MAX_SPEED * CONFIG.BOOST_MULTIPLIER);
	const horizonY = H * (CONFIG.BASE_HORIZON_Y_PERC - CONFIG.SPEED_ZOOM_FACTOR * speedFactor); 
    
	const slices = 40;

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

		// Faixas Laterais da Pista (Brancas)
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

        // CHEVRONS LATERAIS (Grass/Off-Road pattern)
        if (Math.floor(t * slices) % CONFIG.ROAD_SIDE_CHEVRON_DASH_LENGTH < CONFIG.ROAD_SIDE_CHEVRON_DASH_LENGTH/2) {
            ctx.fillStyle = CONFIG.ROAD_SIDE_CHEVRON_COLOR_LIGHT;
        } else {
            ctx.fillStyle = CONFIG.ROAD_SIDE_CHEVRON_COLOR_DARK;
        }

        // Chevron Esquerdo
        ctx.beginPath();
        ctx.moveTo(0, yStart);
        ctx.lineTo(xLeftStart - stripeW, yStart);
        ctx.lineTo(xLeftEnd - stripeW, yEnd);
        ctx.lineTo(0, yEnd);
        ctx.fill();

        // Chevron Direito
        ctx.beginPath();
        ctx.moveTo(W, yStart);
        ctx.lineTo(xRightStart + stripeW, yStart);
        ctx.lineTo(xRightEnd + stripeW, yEnd);
        ctx.lineTo(W, yEnd);
        ctx.fill();
	}
}

function drawMinimap() {
    if (!hudMinimapCtx) return;

    const mmW = hudMinimapCanvas.width;
    const mmH = hudMinimapCanvas.height;
    hudMinimapCtx.clearRect(0, 0, mmW, mmH);

    hudMinimapCtx.strokeStyle = CONFIG.MINIMAP_TRACK_COLOR;
    hudMinimapCtx.lineWidth = 2;
    hudMinimapCtx.strokeRect(mmW * 0.1, mmH * 0.1, mmW * 0.8, mmH * 0.8);

    const playerTrackProgress = (player.totalDistance % totalTrackLength) / totalTrackLength;
    const botTrackProgress = (bot.totalDistance % totalTrackLength) / totalTrackLength;

    const trackVisualLength = mmH * 0.8;
    const trackVisualStartX = mmW * 0.1 + (mmW * 0.8 / 2);
    const trackVisualStartY = mmH * 0.1 + trackVisualLength;

    // Posição do jogador
    hudMinimapCtx.fillStyle = CONFIG.MINIMAP_PLAYER_COLOR;
    hudMinimapCtx.beginPath();
    hudMinimapCtx.arc(trackVisualStartX, trackVisualStartY - (trackVisualLength * playerTrackProgress), CONFIG.MINIMAP_POINT_SIZE, 0, Math.PI * 2);
    hudMinimapCtx.fill();

    // Posição do bot
    hudMinimapCtx.fillStyle = CONFIG.MINIMAP_BOT_COLOR;
    hudMinimapCtx.beginPath();
    hudMinimapCtx.arc(trackVisualStartX, trackVisualStartY - (trackVisualLength * botTrackProgress), CONFIG.MINIMAP_POINT_SIZE, 0, Math.PI * 2);
    hudMinimapCtx.fill();
}

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

// === UTIL ===
function rectsOverlap(a,b) {
	if (!a || !b) return false;
	return !(a.x > b.x + (b.width || b.w) || a.x + (a.width || a.w) < b.x || a.y > b.y + (b.height || b.h) || a.y + (b.height || b.h) < b.y);
}

function formatTime(ms) {
    if (ms === Infinity) return `--'--" --`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const centiseconds = Math.floor((ms % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}'${String(seconds).padStart(2, '0')}"${String(centiseconds).padStart(2, '0')}`;
}


function updateHUD() {
	hudPos.textContent = `1/${CONFIG.SECTORS.length}`;
	hudLap.textContent = `${laps}/${CONFIG.LAPS_TO_FINISH}`;

	const speedKPH = Math.round(player.speed * 10);
	hudSpeedVal.textContent = String(speedKPH).padStart(3, '0');

    const maxSpeedForRpm = CONFIG.MAX_SPEED * CONFIG.BOOST_MULTIPLIER;
    const rpmLevel = Math.floor((player.speed / maxSpeedForRpm) * rpmSegments.length);

    rpmSegments.forEach((segment, index) => {
        segment.classList.remove('active-green', 'active-yellow', 'active-red');
        if (index < rpmLevel) {
            if (index < rpmSegments.length * 0.6) {
                segment.classList.add('active-green');
            } else if (index < rpmSegments.length * 0.85) {
                segment.classList.add('active-yellow');
            } else {
                segment.classList.add('active-red');
            }
        }
    });

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