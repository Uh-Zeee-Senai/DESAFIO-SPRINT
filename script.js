const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let W = window.innerWidth;
let H = window.innerHeight;
canvas.width = W;
canvas.height = H;

window.addEventListener('resize', ()=>{
	W = window.innerWidth;
	H = window.innerHeight;
	canvas.width = W;
	canvas.height = H;
	player.x = W/2;
	player.y = H-150;
});

// Carro jogador
let player = {
	w: 60,
	h: 120,
	x: W/2,
	y: H-150,
	speed: 5,
	img: new Image()
};
player.img.src = 'Carro.png';

// Cenário lateral (parallax)
let bgLayers = [];
let treeImg = new Image();
treeImg.src = 'arvore.png'; // árvore lateral
let wallImg = new Image();
wallImg.src = 'muro.png'; // muro lateral
bgLayers.push({img: treeImg, speed: 1, x:0, y:0});
bgLayers.push({img: wallImg, speed: 2, x:0, y:0});

// Obstáculos e pickups
let obstacles = [];
let pickups = [];
let easterEggs = [
	{ name:'DeLorean', src:'https://i.imgur.com/T7FsHqF.png' },
	{ name:'KITT', src:'https://i.imgur.com/LqGHfXG.png' }
];
let collected = 0;
let eggsFound = 0;

const speedVal = document.getElementById('speedVal');
const collectedEl = document.getElementById('collected');
const egFoundEl = document.getElementById('egFound');

let keys = {};

function rand(min,max){ return Math.random()*(max-min)+min; }

function makeObstacle(){ return { x: rand(W/4,3*W/4), y: -100, w:50, h:50, img:null }; }
function makePickup(type){ return { x: rand(W/4,3*W/4), y:-50, w:40, h:40, type, img:null, active:true }; }

function rectCollide(a,b){
	return !(a.x+a.w/2 < b.x-b.w/2 || a.x-a.w/2 > b.x+b.w/2 || a.y+a.h/2 < b.y-b.h/2 || a.y-a.h/2 > b.y+b.h/2);
}

function handlePickup(p){
	switch(p.type){
		case 'boost':
			player.speed += 3;
			setTimeout(()=>{ player.speed -=3; },3000);
			break;
		case 'egg':
			let egg = easterEggs[Math.floor(Math.random()*easterEggs.length)];
			let img = new Image(); img.src = egg.src;
			player.img = img;
			eggsFound++; egFoundEl.textContent = eggsFound;
			setTimeout(()=>{ player.img.src='Carro.png'; },5000);
			break;
	}
}

function update(){
	// spawn pickups e obstáculos
	if(Math.random()<0.02) pickups.push(makePickup('boost'));
	if(Math.random()<0.005) pickups.push(makePickup('egg'));
	if(Math.random()<0.02) obstacles.push(makeObstacle());

	// mover pickups e obstáculos
	for(let p of pickups) p.y += 4 + player.speed/2;
	for(let o of obstacles) o.y += 4 + player.speed/2;

	// colisão pickups
	for(let p of pickups){
		if(p.active && rectCollide(player,p)){
			p.active=false;
			collected++; collectedEl.textContent = collected;
			handlePickup(p);
		}
	}
	pickups = pickups.filter(p=>p.active && p.y<H+50);
	obstacles = obstacles.filter(o=>o.y<H+50);

	// controles
	if(keys['ArrowLeft']) player.x = Math.max(player.w/2, player.x-6);
	if(keys['ArrowRight']) player.x = Math.min(W-player.w/2, player.x+6);

	render();
	requestAnimationFrame(update);
}

function drawRoad(){
	const lines = 30;
	for(let i=0;i<lines;i++){
		let perspective = i/lines;
		let roadWidth = 300 + (1-perspective)*(W-600);
		let laneX = W/2 - roadWidth/2;
		let y = H - perspective*H;
		// grama lateral
		ctx.fillStyle = '#228B22';
		ctx.fillRect(0, y, W, H/lines);
		// pista
		ctx.fillStyle = '#555';
		ctx.fillRect(laneX, y, roadWidth, H/lines);
		// linha central
		ctx.strokeStyle = '#fff';
		ctx.lineWidth = 2;
		ctx.setLineDash([20,20]);
		ctx.beginPath();
		ctx.moveTo(W/2, y);
		ctx.lineTo(W/2, y+H/lines);
		ctx.stroke();
		ctx.setLineDash([]);
	}
}

function drawBackground(){
	for(let layer of bgLayers){
		layer.y += layer.speed;
		if(layer.y>H) layer.y=0;
		ctx.drawImage(layer.img, layer.x, layer.y, W, H);
		ctx.drawImage(layer.img, layer.x, layer.y-H, W, H);
	}
}

function render(){
	ctx.clearRect(0,0,W,H);

	// cenário
	drawBackground();

	// pista
	drawRoad();

	// pickups
	for(let p of pickups){
		switch(p.type){
			case 'boost': ctx.fillStyle='#ffd700'; break;
			case 'egg': ctx.fillStyle='#6b5b5b'; break;
		}
		ctx.fillRect(p.x-20, p.y-20, p.w, p.h);
	}

	// obstáculos
	ctx.fillStyle='#222';
	for(let o of obstacles){
		ctx.fillRect(o.x-o.w/2, o.y-o.h/2, o.w, o.h);
		ctx.strokeStyle='#111';
		ctx.strokeRect(o.x-o.w/2, o.y-o.h/2, o.w, o.h);
	}

	// carro jogador
	if(player.img && player.img.complete){
		ctx.drawImage(player.img, player.x-player.w/2, player.y, player.w, player.h);
	}

	speedVal.textContent = "Velocidade: "+player.speed.toFixed(1);
}

document.addEventListener('keydown', e=>{ keys[e.key]=true; });
document.addEventListener('keyup', e=>{ keys[e.key]=false; });

update();
