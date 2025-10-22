const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let W = window.innerWidth;
let H = window.innerHeight;
canvas.width = W;
canvas.height = H;

// Jogador
let player = {
	w: 50,
	h: 80,
	x: W/2,
	y: H-120,
	speed: 5,
	maxSpeed: 8,
	color: '#ff3c3c',
	img: null
};

let pickups = [];
let obstacles = [];
let easterEggs = [
	{ name:'DeLorean', src:'https://i.imgur.com/T7FsHqF.png' },
	{ name:'KITT', src:'https://i.imgur.com/LqGHfXG.png' },
	{ name:'Herbie', src:'https://i.imgur.com/bdQy7Xg.png' }
];
let collected = 0;
let eggsFound = 0;
let keys = {};

const speedVal = document.getElementById('speedVal');
const collectedEl = document.getElementById('collected');
const egFoundEl = document.getElementById('egFound');

window.addEventListener('resize', () => {
	W = window.innerWidth;
	H = window.innerHeight;
	canvas.width = W;
	canvas.height = H;
	player.x = W/2;
	player.y = H-120;
});

// --- Funções auxiliares ---
function rand(min,max){ return Math.random()*(max-min)+min; }
function makePickup(type){ return { type, x: rand(W/4,3*W/4), y: -50, w:30, h:30, active:true }; }
function makeObstacle(){ return { x: rand(W/4,3*W/4), y: -50, w:50, h:50 }; }

function rectCollide(a,b){
	const ax1 = a.x - a.w/2, ay1 = a.y - a.h/2, ax2 = a.x + a.w/2, ay2 = a.y + a.h/2;
	const bx1 = b.x - b.w/2, by1 = b.y - b.h/2, bx2 = b.x + b.w/2, by2 = b.y + b.h/2;
	return !(ax2<bx1||ax1>bx2||ay2<by1||ay1>by2);
}

// --- Pista pseudo-3D ---
function drawRoad(){
	const lines = 20;
	for(let i=0;i<lines;i++){
		let perspective = i/lines;
		let roadWidth = 200 + (1-perspective)*(W-400);
		let laneX = W/2 - roadWidth/2;
		let y = H - perspective*H;
		// grama lateral
		ctx.fillStyle = '#228B22';
		ctx.fillRect(0, y, W, H/lines);
		// pista
		ctx.fillStyle = '#777';
		ctx.fillRect(laneX, y, roadWidth, H/lines);
		// linha central
		ctx.strokeStyle = '#fff';
		ctx.lineWidth = 2;
		ctx.setLineDash([20,20]);
		ctx.beginPath();
		ctx.moveTo(W/2, y);
		ctx.lineTo(W/2, y + H/lines);
		ctx.stroke();
		ctx.setLineDash([]);
	}
}

function handlePickup(p){
	switch(p.type){
		case 'boost':
			player.maxSpeed += 3;
			setTimeout(()=>{ player.maxSpeed -=3; },3000);
			break;
		case 'repair':
			break;
		case 'egg':
			let egg = easterEggs[Math.floor(Math.random()*easterEggs.length)];
			let img = new Image(); img.src = egg.src;
			player.img = img;
			eggsFound++; egFoundEl.textContent = eggsFound;
			setTimeout(()=>{ player.img = null; },5000);
			break;
	}
}

function update(){
	// spawn pickups/obstacles
	if(Math.random()<0.02) pickups.push(makePickup('boost'));
	if(Math.random()<0.01) pickups.push(makePickup('repair'));
	if(Math.random()<0.005) pickups.push(makePickup('egg'));
	if(Math.random()<0.02) obstacles.push(makeObstacle());

	// mover pickups/obstáculos
	for(let p of pickups) p.y += 4 + player.speed/2;
	for(let o of obstacles) o.y += 4 + player.speed/2;

	// colisões pickups
	for(let p of pickups){
		if(p.active && rectCollide(player,p)){
			p.active=false; collected++; collectedEl.textContent = collected;
			handlePickup(p);
		}
	}
	pickups = pickups.filter(p=>p.active && p.y<H+50);
	obstacles = obstacles.filter(o=>o.y<H+50);

	// controles
	if(keys['ArrowLeft']) player.x = Math.max(player.w/2, player.x - 6);
	if(keys['ArrowRight']) player.x = Math.min(W - player.w/2, player.x + 6);

	render();
	requestAnimationFrame(update);
}

function render(){
	ctx.clearRect(0,0,W,H);
	drawRoad();

	// pickups
	for(let p of pickups){
		switch(p.type){
			case 'boost': ctx.fillStyle='#ffd700'; break;
			case 'repair': ctx.fillStyle='#4cd964'; break;
			case 'egg': ctx.fillStyle='#6b5b5b'; break;
		}
		ctx.fillRect(p.x-15, p.y-15, p.w, p.h);
	}

	// obstáculos
	for(let o of obstacles){
		ctx.fillStyle='#222';
		ctx.fillRect(o.x-o.w/2, o.y-o.h/2, o.w, o.h);
		ctx.strokeStyle='#111';
		ctx.strokeRect(o.x-o.w/2, o.y-o.h/2, o.w, o.h);
	}

	// carro jogador
	if(player.img && player.img.complete){
		ctx.drawImage(player.img, player.x - player.w/2, player.y, player.w, player.h);
	}else{
		ctx.fillStyle = player.color;
		ctx.fillRect(player.x - player.w/2, player.y, player.w, player.h);
	}

	speedVal.textContent = "Velocidade: " + player.speed.toFixed(1);
}

document.addEventListener('keydown', e=>{ keys[e.key] = true; });
document.addEventListener('keyup', e=>{ keys[e.key] = false; });

update();
	