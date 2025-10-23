// script.js — versão com Easter Egg imagem ea.png + projeção 3D

(() => {
	const canvas = document.getElementById('gameCanvas');
	const ctx = canvas.getContext('2d');
	let W = window.innerWidth, H = window.innerHeight;
	canvas.width = W; canvas.height = H;
	window.addEventListener('resize', ()=>{
		W = window.innerWidth; H = window.innerHeight;
		canvas.width = W; canvas.height = H;
		player.y = H - player.offsetFromBottom;
	});
	
	// jogador / carro
	const player = {
		w: 96,
		h: 128,
		x: 0,
		y: 0,
		speed: 6,
		maxSpeed: 10,
		offsetFromBottom: 150,
		img: new Image()
	};
	player.img.src = 'Carro.png';  // ou 'ngtr.png' conforme seu arquivo real
	
	// Easter Egg imagem
	const eeImg = new Image();
	eeImg.src = 'ngtr.png';
	
	// pickups / obstáculos
	let pickups = [];
	let obstacles = [];
	let eggsFound = 0;
	let collected = 0;
	const keys = {};
	let paused = false;
	let frame = 0;
	
	const Z_MAX = 3000;
	
	// função de projeção (xRoad em [-1,1], z distância)
	function project(xRoad, z) {
		const perspective = 1 - (z / (Z_MAX + 200));
		const roadWidthTop = Math.max(200, W * 0.18);
		const roadWidthBottom = Math.min(W * 0.94, W * 0.78);
		const roadW = roadWidthTop + (roadWidthBottom - roadWidthTop) * perspective;
		const centerX = W / 2;
		const screenX = centerX + xRoad * (roadW / 2);
		const screenY = H - perspective * (H * 0.95);
		const scale = 0.35 + 0.65 * (1 - z / (Z_MAX + 1));
		return { x: screenX, y: screenY, scale, roadW };
	}
	
	function rand(a,b) { return a + Math.random()*(b-a); }
	
	function spawnPickup(type) {
		pickups.push({ x: rand(-0.8,0.8), z: Z_MAX, baseSize: 64, type, active: true });
	}
	function spawnObstacle() {
		obstacles.push({ x: rand(-0.8,0.8), z: Z_MAX, baseSize: 120 });
	}
	
	function checkCollision(obj) {
		const proj = project(obj.x, obj.z);
		const carX = player.x, carY = player.y;
		const carW = player.w, carH = player.h;
		const ow = obj.baseSize * proj.scale * 0.9;
		const oh = obj.baseSize * proj.scale * 0.6;
		const ox = proj.x - ow/2;
		const oy = proj.y - oh/2;
		return !(carX + carW/2 < ox || carX - carW/2 > ox + ow || carY + carH/2 < oy || carY - carH/2 > oy + oh);
	}
	
	document.addEventListener('keydown', e => {
		keys[e.key] = true;
		if (e.key.toLowerCase() === 'p') paused = !paused;
		if (e.key.toLowerCase() === 'r') resetGame();
	});
	document.addEventListener('keyup', e => keys[e.key] = false);
	
	function resetGame() {
		pickups = [];
		obstacles = [];
		collected = 0;
		eggsFound = 0;
		player.speed = 6;
		player.img.src = 'Carro.png';
	}
	
	function update() {
		if (paused) {
			requestAnimationFrame(update);
			return;
		}
		frame++;
		
		// spawn condicional
		if (Math.random() < 0.018) spawnPickup('boost');
		if (Math.random() < 0.008) spawnPickup('repair');
		// spawn Easter Egg só se condição: por exemplo collected > 20 e frame > 500
		if (collected >= 20 && frame % 500 === 0) {
			spawnPickup('egg');
		}
		if (Math.random() < 0.02) spawnObstacle();
		
		// mover
		const baseSpeed = player.speed * 10;
		for (let p of pickups) p.z -= baseSpeed;
		for (let o of obstacles) o.z -= baseSpeed;
		
		// filtrar fora de tela
		pickups = pickups.filter(p => p.z > -50 && p.active);
		obstacles = obstacles.filter(o => o.z > -50);
		
		// colisões pickups
		for (let p of pickups) {
			if (p.type === 'egg' && p.z < 180 && p.active && checkCollision(p)) {
				p.active = false;
				eggsFound++;
				// aplica Easter Egg: troca imagem do carro para ea.png por um tempo
				player.img = eeImg;
				setTimeout(() => {
					player.img.src = 'Carro.png';
				}, 5000);
			}
			else if (p.active && p.type !== 'egg' && p.z < 180 && checkCollision(p)) {
				p.active = false;
				collected++;
				// boost exemplo:
				if (p.type === 'boost') {
					player.speed = Math.min(player.maxSpeed + 3, player.speed + 3);
					setTimeout(() => {
						player.speed = Math.max(4, player.speed - 3);
					}, 3000);
				}
			}
		}
		
		// colisões obstáculos
		for (let o of obstacles) {
			if (o.z < 180 && checkCollision(o)) {
				player.speed = Math.max(2, player.speed - 2);
			}
		}
		
		// controles laterais
		if (keys['ArrowLeft'] || keys['a']) player.x -= 8;
		if (keys['ArrowRight'] || keys['d']) player.x += 8;
		const margin = 60;
		player.x = Math.max(margin, Math.min(W - margin, player.x));
		
		render();
		requestAnimationFrame(update);
	}
	
	function drawBackground() {
		const sky = ctx.createLinearGradient(0,0,0,H*0.5);
		sky.addColorStop(0, '#7ec0ee');
		sky.addColorStop(1, '#2b6aa3');
		ctx.fillStyle = sky;
		ctx.fillRect(0,0,W,H*0.5);
	}
	
	function render() {
		ctx.clearRect(0,0,W,H);
		drawBackground();
		
		// desenha pista em fatias
		const slices = 50;
		for (let i = slices -1; i >= 0; i--) {
			const z = (i/slices) * Z_MAX;
			const perspective = 1 - (z / (Z_MAX + 200));
			const roadWidthTop = Math.max(200, W * 0.18);
			const roadWidthBottom = Math.min(W * 0.94, W * 0.78);
			const roadW = roadWidthTop + (roadWidthBottom - roadWidthTop) * perspective;
			const y = H - perspective * (H * 0.95);
			
			ctx.fillStyle = '#1f8b2f';
			ctx.fillRect(0, y, W, Math.ceil(H/slices)+1);
			
			const laneX = W/2 - roadW/2;
			ctx.fillStyle = '#5b5b5b';
			ctx.fillRect(laneX, y, roadW, Math.ceil(H/slices)+1);
			ctx.strokeStyle = '#303030';
			ctx.lineWidth = 2;
			ctx.strokeRect(laneX, y, roadW, Math.ceil(H/slices)+1);
		}
		
		// objetos (pickups & obstáculos) ordenados por z decrescente
		const objs = [];
		for (let p of pickups) objs.push({type:'pickup', o:p, z:p.z});
		for (let o of obstacles) objs.push({type:'obstacle', o:o, z:o.z});
		objs.sort((a,b) => b.z - a.z);
		
		for (let item of objs) {
			const obj = item.o;
			const proj = project(obj.x, obj.z);
			const s = proj.scale;
			if (item.type === 'pickup') {
				ctx.save();
				ctx.translate(proj.x, proj.y);
				const size = obj.baseSize * s * 0.5;
				if (obj.type === 'egg') {
					// desenha imagem ea.png
					if (eeImg.complete) {
						const w = obj.baseSize * s * 0.7;
						const h = obj.baseSize * s * 0.7;
						ctx.drawImage(eeImg, -w/2, -h/2, w, h);
					} else {
						ctx.beginPath();
						ctx.fillStyle = '#c06';
						ctx.arc(0,0, size,0,Math.PI*2);
						ctx.fill();
					}
				} else {
					ctx.beginPath();
					ctx.fillStyle = obj.type==='boost' ? '#ffd700' : '#4cd964';
					ctx.arc(0,0, size,0,Math.PI*2);
					ctx.fill();
				}
				ctx.restore();
			} else {
				ctx.save();
				const w = obj.baseSize * s * 0.9;
				const h = obj.baseSize * s * 0.6;
				ctx.fillStyle = '#222';
				ctx.fillRect(proj.x - w/2, proj.y - h/2, w, h);
				ctx.strokeStyle = '#111';
				ctx.strokeRect(proj.x - w/2, proj.y - h/2, w, h);
				ctx.restore();
			}
		}
		
		// desenhar carro jogador
		const carX = player.x - player.w/2;
		const carY = player.y - player.h/2;
		if (player.img && player.img.complete) {
			ctx.save();
			ctx.shadowColor = 'rgba(0,0,0,0.6)';
			ctx.shadowBlur = 12;
			ctx.drawImage(player.img, carX, carY, player.w, player.h);
			ctx.restore();
		} else {
			ctx.fillStyle = '#ff3c3c';
			ctx.fillRect(carX, carY, player.w, player.h);
		}
		
		document.getElementById('speedVal').textContent = Math.round(player.speed);
		document.getElementById('egFound').textContent = eggsFound;
	}
	
	resetGame();
	update();
})();
