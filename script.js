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

const carImg = new Image(); carImg.src = 'https://i.imgur.com/8QfQqQb.png';
const movieCarImg = new Image(); movieCarImg.src = 'https://i.imgur.com/2fXJkO8.png';

let running = false; let paused = false; let frame = 0;
let player = { x: W/2, y: H - 120, w:50, h:90, speed:0, maxSpeed:6, color:'#ff5c5c', img:carImg };
let collected = 0; let eggsFound = 0;
let pickups = []; let obstacles = [];
let keys = {};
const SPAWN_INTERVAL = 80;

function rand(min,max){ return Math.random()*(max-min)+min; }
function makePickup(type,x,y){ return { type, x, y, w:34, h:34, active:true }; }
function makeObstacle(x,y){ return { x,y,w:60,h:30 }; }
function initLevel(){
	pickups=[]; obstacles=[]; collected=0; eggsFound=0; frame=0; player.x = W/2; player.speed=2; player.img = carImg;
	trackContainer.classList.remove('bg-movie-1');
}

function update(){
	if(!running || paused) return;
	frame++;
	if(frame % SPAWN_INTERVAL === 0){
		if(Math.random()<0.7) pickups.push(makePickup('boost', rand(80,W-80), -40));
		if(Math.random()<0.25) pickups.push(makePickup('repair', rand(80,W-80), -40));
		if(Math.random()<0.06) pickups.push(makePickup('movie', rand(80,W-80), -40));
		if(Math.random()<0.03) pickups.push(makePickup('egg', rand(80,W-80), -40));
		if(Math.random()<0.6) obstacles.push(makeObstacle(rand(60,W-120), -30));
	}

	for(let p of pickups){ p.y += 3 + (player.speed/2); }
	for(let o of obstacles){ o.y += 3 + (player.speed/2); }
	if(keys['ArrowLeft']) player.x -= 6;
	if(keys['ArrowRight']) player.x += 6;
	player.x = Math.max(60, Math.min(W-60, player.x));

	for(let p of pickups){
		if(p.active && rectCollide(player,p)){
			p.active = false; collected++;
			collectedEl.textContent = collected;
			handlePickup(p);
		}
	}

	for(let o of obstacles){
		if(rectCollide(player,o)){
			player.speed = Math.max(1, player.speed - 2);
			statusMsg.textContent = 'Colidiu! Velocidade reduzida.';
		}
	}

	pickups = pickups.filter(p => p.y < H+60 && p.active);
	obstacles = obstacles.filter(o => o.y < H+60);
	if(player.speed < player.maxSpeed) player.speed += 0.02;
	speedVal.textContent = player.speed.toFixed(2);
	render();
	requestAnimationFrame(update);
}

function handlePickup(p){
	switch(p.type){
		case 'boost':
			statusMsg.textContent = 'Boost coletado! +velocidade por 3s.';
			player.maxSpeed += 3;
			setTimeout(()=>{ player.maxSpeed -= 3; statusMsg.textContent = 'Boost terminou.'; }, 3000);
			break;
		case 'repair':
			statusMsg.textContent = 'Repair! Recuperou integridade.';
			break;
		case 'movie':
			statusMsg.textContent = 'Movie Power-up! Transformando...';
			player.img = movieCarImg;
			trackContainer.classList.add('bg-movie-1');
			setTimeout(()=>{ player.img = carImg; trackContainer.classList.remove('bg-movie-1'); statusMsg.textContent='Tema do filme terminou.'; }, 8000);
			break;
		case 'egg':
			eggsFound++;
			egFoundEl.textContent = eggsFound;
			alert('Você encontrou um Easter Egg secreto! \nMensagem: "Velocidade é só o começo."');
			break;
	}
}

function render(){
	ctx.clearRect(0,0,W,H);
	ctx.fillStyle = '#222'; ctx.fillRect(0,0,W,H);
	ctx.fillStyle = '#444'; ctx.fillRect(60,0,W-120,H);
	ctx.strokeStyle = '#ddd'; ctx.lineWidth = 6; ctx.setLineDash([20,18]);
	ctx.beginPath(); ctx.moveTo(W/2,0); ctx.lineTo(W/2,H); ctx.stroke(); ctx.setLineDash([]);

	for(let p of pickups){ if(p.active) drawPickup(p); }
	for(let o of obstacles){ ctx.fillStyle = '#333'; ctx.fillRect(o.x - o.w/2, o.y - o.h/2, o.w, o.h); ctx.strokeStyle = '#111'; ctx.strokeRect(o.x - o.w/2, o.y - o.h/2, o.w, o.h); }
	if(player.img.complete){ ctx.drawImage(player.img, player.x - player.w/2, player.y - player.h/2, player.w, player.h); }
	else { ctx.fillStyle = player.color; ctx.fillRect(player.x - player.w/2, player.y - player.h/2, player.w, player.h); }
	ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(8,8,160,48);
	ctx.fillStyle = '#fff'; ctx.font = '14px Arial'; ctx.fillText('Vel: '+player.speed.toFixed(2), 16,28);
	ctx.fillText('Pickups: '+collected, 16,46);
}

function drawPickup(p){
	const x = p.x, y = p.y;
	switch(p.type){
		case 'boost': ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.moveTo(x,y-12); ctx.lineTo(x+8,y); ctx.lineTo(x+2,y); ctx.lineTo(x+10,y+12); ctx.lineTo(x-2,y+2); ctx.lineTo(x-8,y+6); ctx.closePath(); ctx.fill(); break;
		case 'repair': ctx.fillStyle = '#4cd964'; ctx.fillRect(x-12,y-12,24,24); ctx.fillStyle = '#fff'; ctx.fillRect(x-4,y-2,8,4); ctx.fillRect(x-2,y-6,4,12); break;
		case 'movie': ctx.fillStyle = '#c06'; ctx.beginPath(); ctx.arc(x,y,14,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#fff'; ctx.font='12px Arial'; ctx.fillText('F', x-5, y+4); break;
		case 'egg': ctx.fillStyle = '#6b5b5b'; ctx.beginPath(); ctx.ellipse(x,y,18,12,0,0,Math.PI*2); ctx.fill(); break;
	}
}

function rectCollide(a,b){
	const ax1 = a.x - a.w/2, ay1 = a.y - a.h/2, ax2 = a.x + a.w/2, ay2 = a.y + a.h/2;
	const bx1 = b.x - (b.w||20)/2, by1 = b.y - (b.h||20)/2, bx2 = b.x + (b.w||20)/2, by2 = b.y + (b.h||20)/2;
	return !(ax2 < bx1 || ax1 > bx2 || ay2 < by1 || ay1 > by2);
}

document.addEventListener('keydown', e => { keys[e.key] = true; if(e.key.toLowerCase()==='p'){ paused = !paused; statusMsg.textContent = paused ? 'Pausado' : 'Retomado'; if(!paused) requestAnimationFrame(update); } if(e.key.toLowerCase()==='r') resetGame(); });
document.addEventListener('keyup', e => { keys[e.key] = false; });

startBtn.addEventListener('click', ()=>{ if(!running){ running=true; paused=false; statusMsg.textContent='Rodando...'; requestAnimationFrame(update); } else { paused=false; statusMsg.textContent='Retomado'; requestAnimationFrame(update); } });
pauseBtn.addEventListener('click', ()=>{ paused = !paused; statusMsg.textContent = paused ? 'Pausado' : 'Retomado'; if(!paused) requestAnimationFrame(update); });
resetBtn.addEventListener('click', resetGame);

function resetGame(){ running=false; paused=false; initLevel(); collectedEl.textContent = collected; egFoundEl.textContent = eggsFound; speedVal.textContent = player.speed.toFixed(2); statusMsg.textContent='Reiniciado. Pressione Iniciar.'; render(); }

initLevel(); render();
