// === CONFIGURAÇÕES (edite AQUI) ===
const CONFIG = {
    PLAYER_IMG: "ngtr.png",
    BOT_IMG: "bot.png",
    BOOST_IMG: "supercar.png",
    EASTER_IMG: "ea.png",
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

    CAR_BASE_Y_PERC: 0.75 // Posição Y base dos carros (75% da altura da tela)
};

// === VARIÁVEIS GLOBAIS ===
let canvas, ctx, W, H;
let DOM = {}; // Objeto para guardar elementos DOM
let hudMinimapCtx; // Contexto do minimapa separado

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
    boost: loadIfExists(CONFIG.BOOST_IMG),
    easter: loadIfExists(CONFIG.EASTER_IMG),
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

// === UTILS ===
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

function debug(m){ 
    if (DOM.debugDiv) {
        let currentDebug = DOM.debugDiv.textContent.split('\n');
        if (currentDebug.length > 3) currentDebug = currentDebug.slice(3);
        
        const speed = player ? `Speed: ${player.speed.toFixed(2)}` : 'Speed: 0.00';
        const angle = player ? `Angle: ${player.angle.toFixed(2)}` : 'Angle: 0.00';
        const z = player ? `Z: ${player.totalDistance.toFixed(0)}` : 'Z: 0';
        
        DOM.debugDiv.textContent = `${z}\n${speed}\n${angle}\n${m}\n${currentDebug.join('\n')}`;
    } 
    console.log("[G]", m);
}

// 🔑 FUNÇÃO NECESSÁRIA PARA FORMATAR O TEMPO DO HUD
function formatTime(ms) {
    let totalSeconds = Math.floor(ms / 1000);
    const min = Math.floor(totalSeconds / 60);
    const sec = totalSeconds % 60;
    const mini = Math.floor((ms % 1000) / 10); // Centésimos de segundo
    return `${min.toString().padStart(2, '0')}'${sec.toString().padStart(2, '0')}"${mini.toString().padStart(2, '0')}`;
}

// 🔑 FUNÇÃO NECESSÁRIA PARA CHECAGEM DE COLISÃO
function rectsOverlap(r1, r2) {
    return r1.x < r2.x + r2.width &&
           r1.x + r1.width > r2.x &&
           r1.y < r2.y + r2.height &&
           r1.y + r1.height > r2.y;
}


// === DOM READY ===
window.addEventListener("DOMContentLoaded", () => {
    canvas = document.getElementById("gameCanvas");
    ctx = canvas.getContext("2d");

    // 🔑 Captura Correta de TODOS os elementos DOM
    DOM.menuDiv = document.getElementById("menu"); 
    DOM.gameDiv = document.getElementById("game"); 
    // 🔑 CORRIGIDO: Agora busca o ID que o script.js espera
    DOM.startBtn = document.getElementById("startGameBtn"); 
    DOM.resetDataBtn = document.getElementById("resetDataBtn");
    DOM.nameInput = document.getElementById("playerName");
    DOM.debugDiv = document.getElementById("debug");

    // 🛠️ AJUSTADO: Capturando os IDs de HUD corrigidos no HTML
    DOM.hudPos = document.getElementById("pos-display"); 
    DOM.hudLap = document.getElementById("lap-display"); 
    DOM.hudSpeedVal = document.getElementById("hudSpeedVal"); 
    DOM.hudMinimapCanvas = document.getElementById("hudMinimap");
    DOM.hudTime = document.getElementById("hudTime"); 
    DOM.hudBestTime = document.getElementById("hudBestTime"); 
    DOM.rpmSegments = document.querySelectorAll("#hud-rpm-bar .rpm-segment");

    if (DOM.hudMinimapCanvas) {
        hudMinimapCtx = DOM.hudMinimapCanvas.getContext("2d");
    }

    const last = localStorage.getItem("lastPlayer");
    if (last && DOM.nameInput) DOM.nameInput.value = last;

    // Event listeners
    // 🔑 O evento agora será anexado porque DOM.startBtn não é mais null.
    if (DOM.startBtn) DOM.startBtn.addEventListener("click", onStart);
    if (DOM.resetDataBtn) DOM.resetDataBtn.addEventListener("click", ()=>{ localStorage.removeItem("lastPlayer"); localStorage.removeItem("bestTime"); localStorage.removeItem("bestTimeMs"); bestLapTime = Infinity; DOM.nameInput.value=""; debug("Saved data cleared"); });

    window.addEventListener("resize", onResize);
    // CRÍTICO: Key listeners para input
    window.addEventListener("keydown", e => keys[e.key] = true);
    window.addEventListener("keyup", e => keys[e.key] = false);

    onResize();
    drawMenuFrame();
});

// === LAYOUT / MENU PREVIEW ===
function onResize() {
    W = window.innerWidth; H = window.innerHeight;
    if (canvas) { canvas.width = W; canvas.height = H; }
    if (DOM.hudMinimapCanvas && DOM.hudMinimapCanvas.parentElement) {
        DOM.hudMinimapCanvas.width = DOM.hudMinimapCanvas.parentElement.clientWidth;
        DOM.hudMinimapCanvas.height = DOM.hudMinimapCanvas.parentElement.clientHeight;
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
    // Atualiza o preview do HUD Best Time
    if (DOM.hudBestTime) {
        const savedTime = localStorage.getItem('bestTime') || '--\'--"--';
        DOM.hudBestTime.textContent = `BEST ${savedTime}`; // Adiciona o texto BEST de volta aqui caso não esteja no HTML
    }
    // Desenha o frame menu sempre
    requestAnimationFrame(drawMenuFrame);
}

// === START / INIT RACE ===
function onStart() {
    onResize(); 
    if (W === 0 || H === 0) {
        console.error("ERRO CRÍTICO: Dimensões da tela não definidas. Recarregue a página.");
        return; 
    }

    const name = (DOM.nameInput.value || "Piloto").trim();
    localStorage.setItem("lastPlayer", name);
    initRace(name);
    
    if (DOM.menuDiv) DOM.menuDiv.style.display = "none";
    if (DOM.gameDiv) DOM.gameDiv.style.display = "block"; 
    
    gameRunning = true;
    lastFrameTime = performance.now();
    gameTime = 0; // CRÍTICO: Zera o tempo para iniciar a contagem da primeira volta
    requestAnimationFrame(gameLoop);
    scheduleEasterSpawn();
}

function initRace(playerName) {
    totalTrackLength = CONFIG.SECTORS.reduce((sum, s) => sum + s.length, 0) * CONFIG.LAPS_TO_FINISH;

    player = {
        name: playerName,
        img: IMG.player,
        x: W/2 - 55, 
        y: H * CONFIG.CAR_BASE_Y_PERC, 
        width: 110, height: 150,
        speed: 0, angle: 0, boosting: false,
        totalDistance: 0
    };
    bot = {
        name: "Rival",
        img: IMG.bot,
        x: W/2 + 40,
        y: H * CONFIG.CAR_BASE_Y_PERC, 
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
    const savedBestTime = localStorage.getItem('bestTimeMs');
    if (savedBestTime) bestLapTime = parseFloat(savedBestTime);

    debug("Race initialized. Player Y: " + player.y);
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
    // CRÍTICO: dt em segundos, limitado a 1/15s para evitar bugs em travamentos
    const dt = Math.min(deltaMs / 1000, 1/15); 
    lastFrameTime = ts;
    gameTime += deltaMs;

    update(dt, deltaMs);
    render();

    requestAnimationFrame(gameLoop);
}

// === UPDATE (gameplay) ===
function update(dt, deltaMs) {
    if (dt <= 0) return;

    // CRÍTICO: Fator de escala para normalizar as constantes de física baseadas em 60 FPS.
    const frameFactor = dt * 60; 

    // 1. PLAYER CONTROLS (FÍSICA CORRIGIDA para usar frameFactor)
    if (keys["ArrowUp"] || keys["w"]) {
        player.speed += CONFIG.ACCEL * frameFactor; 
    } else {
        player.speed -= CONFIG.FRICTION * frameFactor; 
    }
    if (keys["ArrowDown"] || keys["s"]) {
        player.speed -= CONFIG.BRAKE * frameFactor;
    } 
    
    player.speed = Math.max(0, player.speed);
    player.speed = clamp(player.speed, 0, CONFIG.MAX_SPEED * (player.boosting ? CONFIG.BOOST_MULTIPLIER : 1));

    let lateral = 0;
    if (keys["ArrowLeft"] || keys["a"]) lateral = -1;
    if (keys["ArrowRight"] || keys["d"]) lateral = 1;
    
    // Movimento Lateral e Curva (usa frameFactor)
    player.x += lateral * CONFIG.TURN_SPEED * (0.5 + (player.speed / CONFIG.MAX_SPEED) * 0.5) * frameFactor;

    player.angle = lateral * -0.18 * (player.speed / CONFIG.MAX_SPEED); 

    const targetVanishPoint = lateral * CONFIG.MAX_CURVE_OFFSET;
    vanishingPointX += (targetVanishPoint - vanishingPointX) * CONFIG.CURVE_SENSITIVITY * frameFactor;
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

    // 3. BOT AI
    const sector = CONFIG.SECTORS[currentSectorIndex];
    const aiTargetSpeed = CONFIG.MAX_SPEED * (sector.aiMult || 1) * (0.95 + Math.random()*0.08);
    // Bot speed usa frameFactor
    bot.speed += (aiTargetSpeed - bot.speed) * 0.02 * frameFactor + (Math.random()-0.5) * CONFIG.AI_VARIANCE;
    bot.speed = clamp(bot.speed, 0, CONFIG.MAX_SPEED * (sector.aiMult || 1) * 1.1);

    const centerLine = W / 2;
    bot.aiTargetX = centerLine + (vanishingPointX * W * 0.2) + (bot.aiOffset || 0);

    bot.x += (bot.aiTargetX - (bot.x + bot.width/2)) * 0.05 * frameFactor;
    bot.x = clamp(bot.x, roadMargin, W - roadMargin - bot.width);


    // 4. Progresso de Setor / Fase e Scroll
    const progInc = player.speed * 18 * frameFactor; // CORRIGIDO: usa frameFactor
    sectorProgress += progInc;
    player.totalDistance += progInc;
    bot.totalDistance += bot.speed * 18 * frameFactor; // CORRIGIDO: usa frameFactor
    
    // Scroll
    trackScrollOffset = (trackScrollOffset + player.speed * CONFIG.ROAD_SCROLL_SPEED_MULT * frameFactor) % (H / 2);
    bgScrollOffset = (bgScrollOffset + player.speed * CONFIG.BG_SCROLL_SPEED_MULT * frameFactor + (vanishingPointX * player.speed * 8 * frameFactor) ) % H;

    // Checagem de Setor/Volta
    if (sectorProgress >= sector.length) {
        sectorProgress -= sector.length;
        currentSectorIndex = (currentSectorIndex + 1) % CONFIG.SECTORS.length;
        if (currentSectorIndex === 0) {
            laps++;
            if (gameTime < bestLapTime) {
                bestLapTime = gameTime;
                localStorage.setItem('bestTimeMs', bestLapTime);
                localStorage.setItem('bestTime', formatTime(bestLapTime));
            }
            gameTime = 0;
            if (laps >= CONFIG.LAPS_TO_FINISH) finishRace();
        }
    }

    // 5. Easter movement + collide
    if (easter) {
        easter.z -= player.speed * 18 * frameFactor; // CORRIGIDO: usa frameFactor

        const roadCenter = W/2 + vanishingPointX * W * CONFIG.MAX_CURVE_OFFSET; 
        const zRelativeToPlayer = easter.z - player.totalDistance;
        
        const perspectiveProjectionDistance = 200; 
        const scale = perspectiveProjectionDistance / (zRelativeToPlayer + perspectiveProjectionDistance);
        const horizonY = H * (CONFIG.BASE_HORIZON_Y_PERC - CONFIG.SPEED_ZOOM_FACTOR * (player.speed / (CONFIG.MAX_SPEED * CONFIG.BOOST_MULTIPLIER)));
        const maxDrawDistance = totalTrackLength / CONFIG.LAPS_TO_FINISH * 0.5;
        const normalizedZ = clamp(zRelativeToPlayer / maxDrawDistance, 0, 1);
        const displayY = horizonY + (H - horizonY) * (1 - normalizedZ);
        const worldX = roadCenter + (easter.x * W * 0.2) * scale;
        
        if (displayY > player.y - player.height * 0.5 && displayY < player.y + player.height) {
            const collisionRect = { 
                x: worldX - (easter.width * scale)/2, 
                y: displayY - (easter.height * scale)/2, 
                width: easter.width * scale, 
                height: easter.height * scale 
            };
            const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };

            if (rectsOverlap(collisionRect, playerRect)) {
                collectEaster();
                easter = null;
                scheduleEasterSpawn();
            }
        }
        
        if (zRelativeToPlayer < -200) {
            easter = null;
            scheduleEasterSpawn();
        }
    }

    // 6. Atualiza posição dos objetos 3D na pista
    for (let obj of trackObjects) {
        obj.z -= player.speed * 18 * frameFactor; // CORRIGIDO: usa frameFactor
        if (obj.z < player.totalDistance - CONFIG.CURVE_ARROW_DIST * 2) {
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

// === AUXILIARES DE JOGO (Stubs para evitar erros) ===
function finishRace() {
    gameRunning = false;
    debug("Corrida Finalizada! Voltas: " + laps);
    if (DOM.menuDiv) DOM.menuDiv.style.display = "flex";
    if (DOM.gameDiv) DOM.gameDiv.style.display = "none";
}

function scheduleEasterSpawn() {
    clearTimeout(easterTimer);
    const delay = Math.random() * (CONFIG.SPAWN_EASTER_MAX - CONFIG.SPAWN_EASTER_MIN) + CONFIG.SPAWN_EASTER_MIN;
    easterTimer = setTimeout(() => {
        if (gameRunning) {
            easter = {
                type: 'easter',
                img: IMG.easter,
                x: Math.random() * 2 - 1, // Posição lateral aleatória (-1 a 1)
                z: player.totalDistance + totalTrackLength * 0.4, // Aparece à frente
                width: 50, height: 50,
            };
            debug("Easter Egg Spawned!");
        }
    }, delay);
}

function collectEaster() {
    player.boosting = true;
    boostRemaining = CONFIG.BOOST_DURATION;
    player.img = IMG.boost;
    debug("BOOST Coletado!");
}


// === DRAW (Renderização) ===
function render() {
    const s = CONFIG.SECTORS[currentSectorIndex];

    // 1. Background (Mantido)
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

    // 2. Draw Road (Mantido)
    drawRoad();

    // 3. Desenha objetos 3D na pista (Mantido)
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

    // 4. DRAW CARS
    drawCar(bot, bot.y);
    drawCar(player, player.y);

    // 5. Desenha o minimapa (Mantido)
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
        ctx.drawImage(img, -c.width/2, -c.height/2, clamp(c.width, 1, c.width), clamp(c.height, 1, c.height));
        ctx.restore();
    } else {
        // FALLBACK DE DEBUG
        const carColor = c === player ? (c.boosting ? "#ff00d9" : "#ff3b3b") : "#4a90e2";
        ctx.fillStyle = carColor;
        ctx.fillRect(c.x, fixedY, c.width, c.height); 

        ctx.fillStyle = "#fff";
        ctx.font = "bold 14px Arial";
        ctx.fillText(c.name, c.x + 8, fixedY + c.height/2 + 6);
    }
}

// Função placeholder que seu código usa, mas que não foi enviada
function drawItem(rect, img, fallbackColor, cornerRadius) {
    if (img && img.complete && img.naturalWidth) {
        ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height);
    } else {
        ctx.fillStyle = fallbackColor;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
}


// === DRAWING FUNCS (Mantidas) ===

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
        const stripeW = CONFIG.ROAD_SIDE_STRIPE_WIDTH * (1-t); // Diminui com a distância
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
            const dashW = CONFIG.ROAD_CENTER_DASH_WIDTH * (1-t);
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

        const chevW = CONFIG.ROAD_SIDE_CHEVRON_WIDTH * (1-t);
        
        // Chevron Esquerdo
        ctx.beginPath();
        ctx.moveTo(xLeftStart - chevW, yStart);
        ctx.lineTo(xLeftEnd - chevW, yEnd);
        ctx.lineTo(xLeftEnd, yEnd);
        ctx.lineTo(xLeftStart, yStart);
        ctx.fill();

        // Chevron Direito
        ctx.beginPath();
        ctx.moveTo(xRightStart + chevW, yStart);
        ctx.lineTo(xRightEnd + chevW, yEnd);
        ctx.lineTo(xRightEnd, yEnd);
        ctx.lineTo(xRightStart, yStart);
        ctx.fill();
    }
}

function drawMinimap() {
    if (!DOM.hudMinimapCanvas || !hudMinimapCtx) return;

    const mapW = DOM.hudMinimapCanvas.width;
    const mapH = DOM.hudMinimapCanvas.height;
    hudMinimapCtx.clearRect(0, 0, mapW, mapH);

    const trackLength = totalTrackLength;
    const playerZ = player.totalDistance;
    const botZ = bot.totalDistance;

    // Fator de escala vertical (garante que 100% da pista caiba)
    const yFactor = mapH / trackLength;

    // Pista (Linha Branca)
    hudMinimapCtx.fillStyle = CONFIG.MINIMAP_TRACK_COLOR;
    const roadCenter = mapW / 2;
    hudMinimapCtx.fillRect(roadCenter - 1, 0, 2, mapH); // Linha Central

    // Posições (O Z crescente vai de baixo para cima)
    const playerY = mapH - (playerZ * yFactor);
    const botY = mapH - (botZ * yFactor);
    
    // Player
    hudMinimapCtx.fillStyle = CONFIG.MINIMAP_PLAYER_COLOR;
    hudMinimapCtx.beginPath();
    hudMinimapCtx.arc(roadCenter - 5, playerY, CONFIG.MINIMAP_POINT_SIZE, 0, Math.PI * 2);
    hudMinimapCtx.fill();

    // Bot
    hudMinimapCtx.fillStyle = CONFIG.MINIMAP_BOT_COLOR;
    hudMinimapCtx.beginPath();
    hudMinimapCtx.arc(roadCenter + 5, botY, CONFIG.MINIMAP_POINT_SIZE, 0, Math.PI * 2);
    hudMinimapCtx.fill();
}

function updateHUD() {
    // Velocidade
    if (DOM.hudSpeedVal) {
        DOM.hudSpeedVal.textContent = Math.round(player.speed * 10).toString().padStart(3, '0');
    }
    
    // Tempo
    if (DOM.hudTime) {
        DOM.hudTime.textContent = `TIME ${formatTime(gameTime)}`;
    }

    // Melhor Tempo
    if (DOM.hudBestTime) {
        const displayTime = bestLapTime === Infinity ? '--\'--"--' : formatTime(bestLapTime);
        DOM.hudBestTime.textContent = `BEST ${displayTime}`;
    }

    // Posição/Volta (Simplificado para 1x1)
    if (DOM.hudPos) {
        const position = player.totalDistance > bot.totalDistance ? 1 : 2;
        DOM.hudPos.textContent = `POS ${position}/2`;
    }
    if (DOM.hudLap) {
        DOM.hudLap.textContent = `LAP ${Math.min(laps + 1, CONFIG.LAPS_TO_FINISH)}/${CONFIG.LAPS_TO_FINISH}`;
    }

    // RPM Bar
    if (DOM.rpmSegments && player) {
        const rpm = player.speed / (CONFIG.MAX_SPEED * (player.boosting ? CONFIG.BOOST_MULTIPLIER : 1));
        const activeCount = Math.floor(rpm * DOM.rpmSegments.length);
        
        DOM.rpmSegments.forEach((segment, index) => {
            segment.classList.remove('active-green', 'active-yellow', 'active-red');
            if (index < activeCount) {
                if (rpm < 0.7) {
                    segment.classList.add('active-green');
                } else if (rpm < 0.9) {
                    segment.classList.add('active-yellow');
                } else {
                    segment.classList.add('active-red');
                }
            }
        });
    }

    // Debug
    debug(`Sector: ${CONFIG.SECTORS[currentSectorIndex].name} | Boost: ${player.boosting ? 'ON' : 'OFF'} (${(boostRemaining/1000).toFixed(1)}s)`);
}