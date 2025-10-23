// ==================== CONFIGURAÇÕES ====================
const CONFIG = {
	PLAYER_IMG: "ngtr.png",
	BOT_IMG: "P.png",
	BOOST_IMG: "DG.png",
	EASTER_IMG: "ea.png",
	ROAD_SPEED: 6,
	BOOST_MULTIPLIER: 1.8,
	BOOST_DURATION: 5000,
	TRACK_LENGTH: 5000,
	CANVAS_BG: "#222",
	SPAWN_EASTER_DELAY: 8000 // tempo em ms até o easter aparecer
};

// ==================== VARIÁVEIS GLOBAIS ====================
let canvas, ctx;
let player, bot, easterEgg = null;
let gameRunning = false;
let playerName = "";
let distance = CONFIG.TRACK_LENGTH;
let boostActive = false;
let keys = {};

// ==================== EVENTOS INICIAIS ====================
window.addEventListener("DOMContentLoaded", () => {
	canvas = document.getElementById("gameCanvas");
	ctx = canvas.getContext("2d");

	document.getElementById("startBtn").addEventListener("click", startGame);

	const saved = localStorage.getItem("lastPlayer");
	if (saved) document.getElementById("playerName").value = saved;

	window.addEventListener("keydown", e => keys[e.key] = true);
	window.addEventListener("keyup", e => keys[e.key] = false);
});

// ==================== FUNÇÕES DO JOGO ====================

function startGame() {
	playerName = document.getElementById("playerName").value.trim();
	if (!playerName) return alert("Digite seu nome para jogar!");

	localStorage.setItem("lastPlayer", playerName);

	document.getElementById("menu").style.display = "none";
	document.getElementById("hud").style.display = "flex";

	resetGame();
	gameRunning = true;
	requestAnimationFrame(gameLoop);
	setTimeout(spawnEasterEgg, CONFIG.SPAWN_EASTER_DELAY);
}

function resetGame() {
	player = { x: 300, y: 500, speed: 0, img: new Image(), baseSpeed: 6 };
	player.img.src = CONFIG.PLAYER_IMG;

	bot = { x: 350, y: 200, speed: 5, img: new Image(), drift: 0 };
	bot.img.src = CONFIG.BOT_IMG;

	easterEgg = null;
	distance = CONFIG.TRACK_LENGTH;
	boostActive = false;
}

function spawnEasterEgg() {
	easterEgg = {
		x: Math.random() * (canvas.width - 60),
		y: -50,
		img: new Image()
	};
	easterEgg.img.src = CONFIG.EASTER_IMG;
}

// ==================== GAME LOOP ====================
function gameLoop() {
	if (!gameRunning) return;

	update();
	draw();

	requestAnimationFrame(gameLoop);
}

// ==================== ATUALIZAÇÃO ====================
function update() {
	// Movimento do jogador
	if (keys["ArrowLeft"] || keys["a"]) player.x -= 5;
	if (keys["ArrowRight"] || keys["d"]) player.x += 5;
	if (keys["ArrowUp"] || keys["w"]) player.speed = player.baseSpeed;
	else player.speed *= 0.98; // desacelera se não estiver acelerando

	// Movimento da IA
	bot.speed = 5 + Math.random() * 0.5;
	bot.y += bot.speed;
	if (Math.random() < 0.01) bot.x += (Math.random() - 0.5) * 40;

	// Movimento da pista (efeito)
	distance -= player.speed * 0.5;
	if (distance <= 0) endRace();

	// Movimento do Easter Egg
	if (easterEgg) {
		easterEgg.y += CONFIG.ROAD_SPEED;
		if (easterEgg.y > canvas.height) easterEgg = null;

		// Verifica colisão com o player
		if (collides(player, easterEgg)) {
			activateBoost();
			easterEgg = null;
		}
	}

	// Mantém dentro da pista
	player.x = Math.max(0, Math.min(canvas.width - 80, player.x));
}

function activateBoost() {
	if (boostActive) return;

	boostActive = true;
	player.img.src = CONFIG.BOOST_IMG;
	player.baseSpeed *= CONFIG.BOOST_MULTIPLIER;

	setTimeout(() => {
		player.baseSpeed /= CONFIG.BOOST_MULTIPLIER;
		player.img.src = CONFIG.PLAYER_IMG;
		boostActive = false;
	}, CONFIG.BOOST_DURATION);
}

// ==================== DESENHO ====================
function draw() {
	ctx.fillStyle = CONFIG.CANVAS_BG;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Desenha estrada
	const roadWidth = canvas.width * 0.6;
	const roadX = (canvas.width - roadWidth) / 2;
	ctx.fillStyle = "#555";
	ctx.fillRect(roadX, 0, roadWidth, canvas.height);

	// Desenha o bot
	ctx.drawImage(bot.img, bot.x, bot.y, 70, 100);
	bot.y += 2;
	if (bot.y > canvas.height) bot.y = -100;

	// Desenha o player
	ctx.drawImage(player.img, player.x, player.y, 80, 120);

	// Desenha o Easter Egg
	if (easterEgg) ctx.drawImage(easterEgg.img, easterEgg.x, easterEgg.y, 60, 60);

	// Atualiza HUD
	document.getElementById("hudPlayer").textContent = `${playerName}`;
	document.getElementById("hudSpeed").textContent = `Vel: ${Math.round(player.speed * 20)} km/h`;
	document.getElementById("hudDist").textContent = `Distância: ${Math.max(0, Math.round(distance))}`;
}

function collides(a, b) {
	if (!a || !b) return false;
	return a.x < b.x + 50 &&
	       a.x + 80 > b.x &&
	       a.y < b.y + 50 &&
	       a.y + 120 > b.y;
}

function endRace() {
	gameRunning = false;
	document.getElementById("menu").style.display = "flex";
	document.getElementById("hud").style.display = "none";
	alert("🏁 Corrida encerrada!");
}
