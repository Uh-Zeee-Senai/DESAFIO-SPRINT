const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = canvas.width; const H = canvas.height;

const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const speedVal = document.getElementById('speedVal');
const collectedEl = document.getElementById('collected');
const egFoundEl = document.getElementById('egFound');
const statusMsg = document.getElementById('statusMsg');
const trackContainer = document.getElementById('trackContainer');

let running = false;
let paused = false;
let frame = 0;

// Jogador
let player = {
	x: W/2,
	y: H-100,
	w: 50,
	h: 80,
	speed: 0,
	maxSpeed: 6,
	color: '#ff3c3c',
	img: null
};

// Easter Eggs com carros icônicos
const easterEggs = [
	{ name:'DeLorean', src:'https://i.imgur.com/T7FsHqF.png' },
	{ name:'KITT', src:'https://i.imgur.com/LqGHfXG.png' },
	{ name:'Herbie', src:'https://i.imgur.com/bdQy7Xg.png' }
];

let pickups = [];
let obstacles = [];
let collected = 0;
let eggsFound = 0;
let keys = {};

function rand(min,max){ return Math.random()*(max-min)+min; }
function makePickup(type,x,y){ return {type,x,y,w:30,h:30,active:true}; }
function makeObstacle(x,y){ return {x,y,w:50,h:30}; }

function initLevel(){
	pickups=[]; obstacles=[]; collected=0; eggsFound=0; frame=0;
	player.x = W/2; player.speed=2; player.img=null;
	trackContainer.classList.remove('bg-movie');
}

// --- Função pseudo-3D estilo Top Gear ---
function drawRoad(){
	const roadWidthTop = 100;
	const roadWidthBottom = 400;
	const roadColor = '#777';
	const grassColor = '#228B22';

	ctx.fillStyle = grassColor;
	ctx.fillRect(0,0,W,H);

	ctx.fillStyle = roadColor;
	ctx.beginPath();
	ctx.moveTo(W/2 - roadWidthTop/2,0);
	ctx.lineTo(W/2 + roadWidthTop/2,0);
	ctx.lineTo(W/2 + roadWidthBottom/2,H);
	ctx.lineTo(W/2 - roadWidthBottom/2,H);
	ctx.closePath();
	ctx.fill();

	// linha central
	ctx.strokeStyle='#fff';
	ctx.lineWidth=4;
	ctx.setLineDash([20,20]);
	ctx.beginPath();
	ctx.moveTo(W/2,0);
	ctx.lineTo(W/2,H);
	ctx.stroke();
	ctx.setLineDash([]);
}

function update(){
	if(!running || paused) return;
	frame++;

	// spawn pickups e obstáculos
	if(frame%100===0){
		if(Math.random()<0.6) pickups.push(makePickup('boost', rand(W/2-180,W/2+180), -40));
		if(Math.random()<0.25) pickups.push(makePickup('repair', rand(W/2-180,W/2+180), -40));
		if(Math.random()<0.05) pickups.push(makePickup('movie', rand(W/2-180,W/2+180), -40));
		if(Math.random()<0.03) pickups.push(makePickup('egg', rand(W/2-180,W/2+180), -40));
		if(Math.random()<0.5) obstacles.push(makeObstacle(rand(W/2-180,W/2+180), -30));
	}

	// mover pickups e obstáculos (pseudo-3D: se aproximam do jogador)
	for(let p of pickups) p.y += 4 + player.speed/2;
	for(let o of obstacles) o.y += 4 + player.speed/2;

	// controles
	if(keys['ArrowLeft']) player.x -= 6;
	if(keys['ArrowRight']) player.x += 6;
	player.x = Math.max(50, Math.min(W-50, player.x));

	// colisões pickups
	for(let p of pickups){
		if(p.active && rectCollide(player,p)){
			p.active=false; collected++; collectedEl.textContent=collected;
			handlePickup(p);
		}
	}

	// colisões obstáculos
	for(let o of obstacles){
		if(rectCollide(player,o)){
			player.speed = Math.max(1, player.speed-2);
			statusMsg.textContent='Colidiu! Velocidade reduzida.';
		}
	}

	pickups = pickups.filter(p=>p.y<H+40 && p.active);
	obstacles = obstacles.filter(o=>o.y<H+40);

	if(player.speed<player.maxSpeed) player.speed += 0.03;
	speedVal.textContent=player.speed.toFixed(1);

	render();
	requestAnimationFrame(update);
}

function handlePickup(p){
	switch(p.type){
		case 'boost':
			player.maxSpeed += 3;
			statusMsg.textContent='Boost ativo!';
			setTimeout(()=>{ player.maxSpeed-=3; statusMsg.textContent='Boost terminou';},3000);
			break;
		case 'repair':
			statusMsg.textContent='Repair coletado!';
			break;
		case 'movie':
			statusMsg.textContent='Movie Power-up!';
			trackContainer.classList.add('bg-movie');
			setTimeout(()=>{ trackContainer.classList.remove('bg-movie'); statusMsg.textContent='Tema acabou';},5000);
			break;
		case 'egg':
			let egg = easterEggs[Math.floor(Math.random()*easterEggs.length)];
			let img = new Image(); img.src=egg.src;
			player.img = img;
			eggsFound++; egFoundEl.textContent=eggsFound;
			statusMsg.textContent='Easter Egg: '+egg.name;
			setTimeout(()=>{ player.img=null; statusMsg.textContent='Voltou ao carro normal';},5000);
			break;
	}
}

function rectCollide(a,b){
	const ax1=a.x-a.w/2, ay1=a.y-a.h/2, ax2=a.x+a.w/2, ay2=a.y+a.h/2;
	const bx1=b.x-b.w/2, by1=b.y-b.h/2, bx2=b.x+b.w/2, by2=b.y+b.h/2;
	return !(ax2<bx1||ax1>bx2||ay2<by1||ay1>by2);
}

function render(){
	ctx.clearRect(0,0,W,H);
	drawRoad();

	// pickups
	for(let p of pickups) if(p.active) drawPickup(p);

	// obstáculos
	for(let o of obstacles){
		ctx.fillStyle='#222'; ctx.fillRect(o.x-o.w/2,o.y-o.h/2,o.w,o.h);
		ctx.strokeStyle='#111'; ctx.strokeRect(o.x-o.w/2,o.y-o.h/2,o.w,o.h);
	}

	// carro
	if(player.img && player.img.complete){
		ctx.drawImage(player.img, player.x-player.w/2, player.y-player.h/2, player.w, player.h);
	}else{
		ctx.fillStyle=player.color; ctx.fillRect(player.x-player.w/2, player.y-player.h/2, player.w, player.h);
	}

	// HUD overlay
	ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fillRect(10,10,180,60);
	ctx.fillStyle='#fff'; ctx.font='14px Arial';
	ctx.fillText('Vel: '+player.speed.toFixed(1),16,28);
	ctx.fillText('Pickups: '+collected,16,46);
	ctx.fillText('Easter Eggs: '+eggsFound,16,64);
}

function drawPickup(p){
	switch(p.type){
		case 'boost': ctx.fillStyle='#ffd700'; ctx.fillRect(p.x-10,p.y-10,20,20); break;
		case 'repair': ctx.fillStyle='#4cd964'; ctx.fillRect(p.x-10,p.y-10,20,20); break;
		case 'movie': ctx.fillStyle='#c06'; ctx.beginPath(); ctx.arc(p.x,p.y,12,0,Math.PI*2); ctx.fill(); break;
		case 'egg': ctx.fillStyle='#6b5b5b'; ctx.beginPath(); ctx.ellipse(p.x,p.y,15,10,0,0,Math.PI*2); ctx.fill(); break;
	}
}

document.addEventListener('keydown', e=>{ keys[e.key]=true; if(e.key.toLowerCase()==='p'){ paused=!paused; statusMsg.textContent=paused?'Pausado':'Rodando'; if(!paused) requestAnimationFrame(update);} if(e.key.toLowerCase()==='r') resetGame(); });
document.addEventListener('keyup', e=>{ keys[e.key]=false; });

startBtn.addEventListener('click', ()=>{ if(!running){ running=true; paused=false; requestAnimationFrame(update);} });
pauseBtn.addEventListener('click', ()=>{ paused=!paused; statusMsg.textContent=paused?'Pausado':'Rodando'; if(!paused) requestAnimationFrame(update); });
resetBtn.addEventListener('click', resetGame);

function resetGame(){ running=false; paused=false; initLevel(); collectedEl.textContent=collected; egFoundEl.textContent=eggsFound; speedVal.textContent=player.speed.toFixed(1); statusMsg.textContent='Reiniciado'; render(); }

initLevel(); render();
