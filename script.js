// === CONFIGURAÇÕES PRINCIPAIS (FÁCEIS DE EDITAR) ===
const CONFIG = {
	PLAYER_IMG: "ngtr.png",
	BOT_IMG: "bot.png",
	BOOST_IMG: "supercar.png",
	EASTER_IMG: "ea.png",
	ROAD_SPEED: 10,
	BOOST_MULTIPLIER: 1.8,
	BOOST_DURATION: 5000,
	TRACK_LENGTH: 5000,
	CANVAS_BG: "#222"
};

// === VARIÁVEIS GLOBAIS ===
let canvas, ctx, W, H;
let player, bot, easterEgg = null;
let distance = CONFIG.TRACK_LENGTH;
let gameRunning = false;
let playerName = "";
let keys = {};
let boostActive = false;
let easterTimeout;

// === LOGIN E INÍCIO ===
document.getElementById("startBtn").addEventListener("click", startGame);
function startGame() {
	const input = document.getElementById("playerName");
	playerName = input.value.trim() || "Jogador";
	localStorage.setItem("lastPlayer", playerName);
	document.getElementById("playerLabel").textContent = "Player: " + playerName;
	document.getElementById("loginScreen").style.display = "none";
	document.getElementById("gameContainer").style.display = "block";
	init();
}

// Carrega nome anterior, se existir
window.onload = () => {
	const saved = localStorage.getItem("lastPlayer");
	if (saved) document.getElementById("playerName").value = saved;
};

// === INICIALIZAÇÃO DO JOGO ===
function init() {
	canvas = document.getElementById("gameCanvas");
	ctx = canvas.getContext("2d");
	resize();
	window.addEventListener("resize", resize);
	document.addEventListener("keydown", e => keys[e.key] = true);
	document.addEventListener("keyup", e => keys[e.key] = false);

	player = new Car(CONFIG.PLAYER_IMG, W / 2 - 100, H - 150, 6);
	bot = new Car(CONFIG.BOT_IMG, W / 2 + 100, H - 300, 6);

	gameRunning = true;
	spawnEasterEgg();
	loop();
}

// === AJUSTE DE TELA ===
function resize() {
	W = window.innerWidth;
	H = window.innerHeight;
	canvas.width = W;
	canvas.height = H;
}

// === CLASSE DE CARROS ===
class Car {
	constructor(imgSrc, x, y, speed) {
		this.img = new Image();
		this.img.src = imgSrc;
		this.x = x;
		this.y = y;
		this.speed = speed;
		this.width = 90;
		this.height = 150;
	}
	draw() {
		ctx.drawImage(this.img, this.x, this.y, this.width, this.height);
	}
}

// === EASTER EGG ===
function spawnEasterEgg() {
	const delay = Math.random() * 7000 + 3000; // aparece entre 3 e 10s
	easterTimeout = setTimeout(() => {
		easterEgg = {
			img: new Image(),
			x: Math.random() * (W - 100),
			y: -100,
			width: 60,
			height: 60
		};
		easterEgg.img.src = CONFIG.EASTER_IMG;
	}, delay);
}

// === BOOST TEMPORÁRIO ===
function activateBoost() {
	if (boostActive) return;
	boostActive = true;
	player.img.src = CONFIG.BOOST_IMG;
	player.speed *= CONFIG.BOOST_MULTIPLIER;
	setTimeout(() => {
		player.img.src = CONFIG.PLAYER_IMG;
		player.speed /= CONFIG.BOOST_MULTIPLIER;
		boostActive = false;
	}, CONFIG.BOOST_DURATION);
}

// === LOOP PRINCIPAL ===
function loop() {
	if (!gameRunning) return;

	update();
	render();
	requestAnimationFrame(loop);
}

// === ATUALIZAÇÃO ===
function update() {
	// Movimento do player
	if (keys["ArrowLeft"] || keys["a"]) player.x -= player.speed;
	if (keys["ArrowRight"] || keys["d"]) player.x += player.speed;
	player.x = Math.max(0, Math.min(W - player.width, player.x));

	// Movimento do bot (IA simples)
	bot.y -= (Math.random() * 2 - 1) * 2; // pequenas variações
	bot.x += (Math.random() * 2 - 1) * 2; // move lateralmente
	bot.x = Math.max(0, Math.min(W - bot.width, bot.x));

	// Movimento da pista e distância
	distance -= CONFIG.ROAD_SPEED;
	if (distance <= 0) finishRace();

	// Movimento do Easter Egg
	if (easterEgg) {
		easterEgg.y += 8;
		if (checkCollision(player, easterEgg)) {
			easterEgg = null;
			clearTimeout(easterTimeout);
			activateBoost();
			spawnEasterEgg();
		}
		if (easterEgg && easterEgg.y > H) easterEgg = null;
	}

	document.getElementById("speedVal").textContent = Math.floor(player.speed * 20);
	document.getElementById("distVal").textContent = Math.max(0, distance);
	document.getElementById("posVal").textContent = player.y < bot.y ? "1º" : "2º";
}

// === DESENHO ===
function render() {
	ctx.fillStyle = CONFIG.CANVAS_BG;
	ctx.fillRect(0, 0, W, H);

	// Desenha "pista"
	const roadWidth = W * 0.6;
	const roadX = (W - roadWidth) / 2;
	ctx.fillStyle = "#444";
	ctx.fillRect(roadX, 0, roadWidth, H);

	// Linha de chegada
	if (distance < 500) {
		ctx.fillStyle = "white";
		ctx.fillRect(roadX, 100, roadWidth, 20);
	}

	// Desenha Easter Egg
	if (easterEgg) ctx.drawImage(easterEgg.img, easterEgg.x, easterEgg.y, easterEgg.width, easterEgg.height);

	// Desenha carros
	player.draw();
	bot.draw();
}

// === COLISÃO ===
function checkCollision(a, b) {
	return (
		a.x < b.x + b.width &&
		a.x + a.width > b.x &&
		a.y < b.y + b.height &&
		a.y + a.height > b.y
	);
}

// === FINAL DA CORRIDA ===
function finishRace() {
	gameRunning = false;
	alert(player.y < bot.y ? "🏆 Você venceu, " + playerName + "!" : "😢 Você perdeu!");
	document.location.reload();
}
