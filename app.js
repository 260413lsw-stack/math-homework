/**
 * TSP 게임화 로직 (Brute Force Algorithm) + 멀티플레이어 + 다중 모드
 */

class SoundEngine {
    constructor() {
        this.ctx = null;
        this.bgmOsc = null;
        this.bgmGain = null;
        this.isMuted = false;
    }
    
    initContext() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }
    
    initBGM() {
        this.initContext();
        if(this.isMuted) return;
        if(this.bgmOsc) this.stopBGM();
        
        this.bgmOsc = this.ctx.createOscillator();
        this.bgmGain = this.ctx.createGain();
        this.bgmOsc.type = 'sawtooth';
        this.bgmOsc.frequency.setValueAtTime(110, this.ctx.currentTime);
        this.bgmGain.gain.setValueAtTime(0.03, this.ctx.currentTime);
        
        let lfo = this.ctx.createOscillator();
        lfo.frequency.value = 2;
        let lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 5;
        lfo.connect(lfoGain);
        lfoGain.connect(this.bgmOsc.frequency);
        lfo.start();
        
        this.bgmOsc.connect(this.bgmGain);
        this.bgmGain.connect(this.ctx.destination);
        this.bgmOsc.start();
    }
    
    stopBGM() {
        if(this.bgmOsc) { this.bgmOsc.stop(); this.bgmOsc = null; }
    }
    
    playSFX(type) {
        this.initContext();
        if(this.isMuted) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        const now = this.ctx.currentTime;
        if (type === 'click') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'win') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.setValueAtTime(554.37, now + 0.1);
            osc.frequency.setValueAtTime(659.25, now + 0.2);
            osc.frequency.setValueAtTime(880, now + 0.3);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.6);
            osc.start(now);
            osc.stop(now + 0.6);
        } else if (type === 'lose') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.5);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);
        }
    }
}
const sound = new SoundEngine();

document.addEventListener('DOMContentLoaded', () => {
    // ===== GAME STATE =====
    let state = {
        level: 1,
        stack: 0,
        score: 0,
        bestScore: localStorage.getItem('tspBestScore') || 0,
        timeLeft: 0,
        timerId: null,
        jamTimerId: null, 
        numNodes: 4,
        nodes: [],
        adjMatrix: [],
        myRoute: [0],
        isPlaying: false,
        isGameOver: false,
        particles: [],
        avatarProgress: 0,
        
        // Game Mode
        gameMode: 'normal'
    };

    // ===== DOM ELEMENTS =====
    const canvas = document.getElementById('mapCanvas');
    const ctx = canvas.getContext('2d');
    
    const ui = {
        level: document.getElementById('levelDisplay'),
        stack: document.getElementById('stackDisplay'),
        score: document.getElementById('scoreDisplay'),
        bestScore: document.getElementById('bestScoreDisplay'),
        time: document.getElementById('timeDisplay'),
        
        routeSteps: document.getElementById('routeSteps'),
        myDist: document.getElementById('myDistDisplay'),
        matrixTable: document.getElementById('matrixTable'),
        
        startOverlay: document.getElementById('startOverlay'),
        gameOverlay: document.getElementById('gameOverlay'),
        
        btnStart: document.getElementById('startGameBtn'),
        btnReset: document.getElementById('resetRouteBtn'),
        btnNext: document.getElementById('nextLevelBtn'),
        btnRetry: document.getElementById('retryBtn'),
        
        // Multiplayer
        modeRadios: document.getElementsByName('gameMode')
    };

    // ===== INITIALIZATION =====
    function init() {
        ui.bestScore.textContent = state.bestScore;
        if(ui.stack) updateStackUI();
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        ui.btnStart.addEventListener('click', () => {
            sound.initBGM(); // 첫 클릭 시 BGM 재생
            startLevel(true);
        });
        ui.btnReset.addEventListener('click', resetRoute);
        ui.btnNext.addEventListener('click', nextLevel);
        ui.btnRetry.addEventListener('click', resetGame);
        
        canvas.addEventListener('mousedown', handleCanvasClick);
        canvas.addEventListener('mousemove', handleCanvasMove);
        canvas.addEventListener('mouseup', () => isDragging = false);
        
        // Mode Selection
        ui.modeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                state.gameMode = e.target.value;
            });
        });
        
        // 탭 리스너
        document.querySelectorAll('.tab-btn').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
            });
        });
    }

    // ===== GAME LOOP =====
    function startLevel(shouldGenerate = true) {
        ui.startOverlay.classList.add('hidden');
        ui.gameOverlay.classList.add('hidden');
        
        if (shouldGenerate) {
            if (state.gameMode === 'crazy') {
                state.numNodes = Math.min(10 + Math.floor((state.level - 1) / 2), 12);
            } else {
                state.numNodes = Math.min(3 + state.level, 8); 
            }
            generateNodes();
            generateMatrix();
            if (state.gameMode === 'timeattack') {
                spawnSpecialRoads();
            }
        } else {
            renderMatrixHTML();
        }
        
        // 모드별 시간 설정
        if (state.gameMode === 'timeattack') {
            state.timeLeft = (state.numNodes - 1) * 2.0; 
        } else {
            state.timeLeft = (state.numNodes - 1) * 5.0; 
        }
        
        resetRoute();
        
        state.isPlaying = true;
        state.isGameOver = false;
        state.opponentRoute = [];
        state.opponentFinished = false;
        
        if (state.numNodes >= 7) {
            document.body.classList.add('boss-mode');
        } else {
            document.body.classList.remove('boss-mode');
        }

        ui.level.textContent = state.level;
        ui.score.textContent = state.score;
        updateTimerDisplay();
        
        clearInterval(state.timerId);
        clearInterval(state.jamTimerId);
        
        state.timerId = setInterval(() => {
            state.timeLeft -= 0.1;
            if (state.timeLeft <= 0) {
                state.timeLeft = 0;
                endGame(false, "TIME OVER", null, "시간이 다 되었습니다!");
            }
            updateTimerDisplay();
        }, 100);
        
        if (state.gameMode === 'timeattack' && state.level >= 2) {
            state.jamTimerId = setInterval(triggerTrafficJam, 3000 + Math.random() * 3000);
        }
        
        requestAnimationFrame(gameLoop);
    }

    function generateNodes() {
        state.nodes = [{ id: 0, symbol: '🏠', isBase: true, x: 0.5, y: 0.8 }];
        const symbols = ['🏫', '📚', '🛒', '🌲', '🏥', '🏭', '🏟️'];
        
        for (let i = 1; i < state.numNodes; i++) {
            let x, y, valid;
            let attempts = 0;
            do {
                valid = true;
                x = 0.1 + Math.random() * 0.8;
                y = 0.1 + Math.random() * 0.8;
                
                for(let j=0; j<state.nodes.length; j++) {
                    const dx = state.nodes[j].x - x;
                    const dy = state.nodes[j].y - y;
                    if (Math.sqrt(dx*dx + dy*dy) < 0.15) {
                        valid = false;
                        break;
                    }
                }
                attempts++;
            } while(!valid && attempts < 50);
            
            state.nodes.push({
                id: i,
                symbol: symbols[(i-1) % symbols.length],
                isBase: false,
                x: x,
                y: y
            });
        }
    }

    function generateMatrix() {
        state.adjMatrix = Array(state.numNodes).fill(null).map(() => Array(state.numNodes).fill(0));
        for (let i = 0; i < state.numNodes; i++) {
            for (let j = 0; j < state.numNodes; j++) {
                if (i === j) {
                    state.adjMatrix[i][j] = 0;
                } else {
                    const dx = state.nodes[i].x - state.nodes[j].x;
                    const dy = state.nodes[i].y - state.nodes[j].y;
                    let dist = parseFloat((Math.sqrt(dx*dx + dy*dy) * 20).toFixed(1));
                    if (state.gameMode === 'chaos') {
                        // 완전히 무작위 운빨 가중치 (거리와 무관)
                        let multiplier = 0.2 + Math.random() * 2.8; 
                        dist = parseFloat((dist * multiplier).toFixed(1));
                    }
                    state.adjMatrix[i][j] = dist;
                }
            }
        }
        renderMatrixHTML();
    }
    
    function renderMatrixHTML() {
        let html = '<tr><th>거점</th>';
        for(let i=0; i<state.numNodes; i++) html += `<th>${state.nodes[i].symbol}</th>`;
        html += '</tr>';

        for (let i = 0; i < state.numNodes; i++) {
            html += `<tr><th>${state.nodes[i].symbol}</th>`;
            for (let j = 0; j < state.numNodes; j++) {
                if (i === j) {
                    html += `<td class="diagonal">-</td>`;
                } else {
                    if (state.gameMode === 'chaos') {
                        html += `<td id="cell-${i}-${j}" style="color: #a78bfa; font-weight: bold; text-shadow: 0 0 5px #a78bfa;">???</td>`;
                    } else {
                        html += `<td id="cell-${i}-${j}">${state.adjMatrix[i][j].toFixed(1)}</td>`;
                    }
                }
            }
            html += '</tr>';
        }
        ui.matrixTable.innerHTML = html;
    }
    
    function spawnSpecialRoads() {
        let edges = [];
        for(let i=0; i<state.numNodes; i++) {
            for(let j=i+1; j<state.numNodes; j++) {
                edges.push([i, j]);
            }
        }
        edges.sort(() => Math.random() - 0.5);
        if(edges.length >= 2) {
            let [b_u, b_v] = edges[0];
            let [p_u, p_v] = edges[1];
            
            state.adjMatrix[b_u][b_v] = parseFloat((state.adjMatrix[b_u][b_v] * 0.3).toFixed(1));
            state.adjMatrix[b_v][b_u] = state.adjMatrix[b_u][b_v];
            
            state.adjMatrix[p_u][p_v] = parseFloat((state.adjMatrix[p_u][p_v] * 2.5).toFixed(1));
            state.adjMatrix[p_v][p_u] = state.adjMatrix[p_u][p_v];
            
            renderMatrixHTML();
            
            let bc1 = document.getElementById(`cell-${b_u}-${b_v}`);
            let bc2 = document.getElementById(`cell-${b_v}-${b_u}`);
            if(bc1) bc1.classList.add('bonus-road');
            if(bc2) bc2.classList.add('bonus-road');
            
            let pc1 = document.getElementById(`cell-${p_u}-${p_v}`);
            let pc2 = document.getElementById(`cell-${p_v}-${p_u}`);
            if(pc1) pc1.classList.add('penalty-road');
            if(pc2) pc2.classList.add('penalty-road');
        }
    }

    // ===== ROUTE LOGIC =====
    let isDragging = false;
    
    function handleCanvasClick(e) {
        if (!state.isPlaying) return;
        isDragging = true;
        checkNodeHit(e);
    }
    
    function handleCanvasMove(e) {
        if (!state.isPlaying || !isDragging) return;
        checkNodeHit(e);
    }

    function checkNodeHit(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const radius = 25; 
        for (let i = 0; i < state.numNodes; i++) {
            const nx = state.nodes[i].x * canvas.width;
            const ny = state.nodes[i].y * canvas.height;
            const dist = Math.sqrt((x - nx)**2 + (y - ny)**2);
            
            if (dist <= radius) {
                addNodeToRoute(i);
                break;
            }
        }
    }

    function addNodeToRoute(nodeId) {
        sound.playSFX('click');
        const lastNode = state.myRoute[state.myRoute.length - 1];
        
        if (nodeId === 0) {
            if (state.myRoute.length === state.numNodes && lastNode !== 0) {
                state.myRoute.push(0);
                spawnParticles(state.nodes[0].x, state.nodes[0].y, '#ef4444');
                updateRouteUI();
                checkWin();
            }
        } else {
            if (!state.myRoute.includes(nodeId)) {
                state.myRoute.push(nodeId);
                spawnParticles(state.nodes[nodeId].x, state.nodes[nodeId].y, '#3b82f6');
                updateRouteUI();
            }
        }
    }

    function resetRoute() {
        state.myRoute = [0];
        updateRouteUI();
    }

    function updateRouteUI() {
        let html = '';
        state.myRoute.forEach((id) => {
            const cls = id === 0 ? 'base-node' : '';
            html += `<div class="route-node ${cls}">${state.nodes[id].symbol}</div>`;
        });
        ui.routeSteps.innerHTML = html;

        const dist = calculateDistance(state.myRoute);
        ui.myDist.textContent = dist > 0 ? `${dist.toFixed(1)} km` : '0.0 km';

        document.querySelectorAll('.matrix-table td').forEach(td => td.classList.remove('highlight-edge'));
        for (let i = 0; i < state.myRoute.length - 1; i++) {
            const from = state.myRoute[i];
            const to = state.myRoute[i+1];
            const cell = document.getElementById(`cell-${from}-${to}`);
            if (cell) cell.classList.add('highlight-edge');
            
            const cellSym = document.getElementById(`cell-${to}-${from}`);
            if (cellSym) cellSym.classList.add('highlight-edge');
        }
        drawMap();
    }

    function calculateDistance(routeArr) {
        let dist = 0;
        for (let i = 0; i < routeArr.length - 1; i++) {
            dist += state.adjMatrix[routeArr[i]][routeArr[i+1]];
        }
        return dist;
    }

    // ===== ALGORITHM & ENDGAME =====
    function checkWin() {
        clearInterval(state.timerId);
        state.isPlaying = false;
        
        const myDist = calculateDistance(state.myRoute);
        const optDist = findOptimalRoute();
        
        state.isGameOver = true;
        
        const diff = myDist - optDist;
        const diffPercent = (diff / optDist) * 100;
        
        if (state.gameMode === 'perfect') {
            if (Math.abs(diff) > 0.1) {
                endGame(false, "PERFECT FAILED", optDist, `오차: ${diff.toFixed(1)}km. 완벽한 최적화가 아닙니다.`);
            } else {
                endGame(true, "PERFECT CLEAR", optDist, "인간 승리! 알고리즘과 100% 일치합니다.");
            }
        } else {
            if (diff <= 0.1) {
                endGame(true, "PERFECT!", optDist, "알고리즘과 완벽히 일치합니다.");
            } else if (diffPercent <= 10) {
                endGame(true, "GREAT", optDist, `오차: ${diff.toFixed(1)}km`);
            } else {
                endGame(false, "GAME OVER", optDist, `최적화 실패. 알고리즘이 ${diff.toFixed(1)}km 빠릅니다.`);
            }
        }
    }

    function updateStackUI() {
        let maxStack = 3;
        let s = state.stack;
        if(s > maxStack) s = maxStack;
        let html = '';
        for(let i=0; i<s; i++) html += '🟩';
        for(let i=s; i<maxStack; i++) html += '⬜';
        if(ui.stack) ui.stack.textContent = html;
    }

    function endGame(isWin, title, optDist, descText) {
        ui.gameOverlay.classList.remove('hidden', 'perfect', 'great', 'fail');
        
        const myDist = calculateDistance(state.myRoute);
        document.getElementById('overlayTitle').textContent = title;
        document.getElementById('overlayMyDist').textContent = myDist.toFixed(1) + ' km';
        document.getElementById('overlayOptDist').textContent = optDist ? optDist.toFixed(1) + ' km' : '-';
        document.getElementById('overlayDesc').textContent = descText || '';
        
        if (isWin) {
            sound.playSFX('win');
            let addStack = title.includes("PERFECT") || title.includes("WIN") ? 2 : 1;
            state.stack += addStack;
            
            ui.gameOverlay.classList.add(title.includes("PERFECT") || title === "YOU WIN!" ? 'perfect' : 'great');
            ui.btnNext.classList.remove('hidden');
            ui.btnRetry.classList.add('hidden');
            
            const baseScore = state.level * 1000;
            const timeBonus = Math.floor(state.timeLeft * 100);
            const perfBonus = title.includes("PERFECT") ? 500 : 0;
            state.score += baseScore + timeBonus + perfBonus;
            
            animateScore(state.score);
            
            if (state.score > state.bestScore) {
                state.bestScore = state.score;
                localStorage.setItem('tspBestScore', state.bestScore);
                ui.bestScore.textContent = state.bestScore;
            }
        } else {
            sound.playSFX('lose');
            if (state.gameMode === 'perfect') {
                state.stack = 0;
                state.level = 1;
            } else {
                state.stack = Math.max(0, state.stack - 1);
            }
            ui.gameOverlay.classList.add('fail');
            ui.btnNext.classList.add('hidden');
            ui.btnRetry.classList.remove('hidden');
        }
        updateStackUI();
    }

    function findOptimalRoute() {
        const arr = [];
        for(let i=1; i<state.numNodes; i++) arr.push(i);
        
        let min = Infinity;
        
        function permute(curr, rest) {
            if (rest.length === 0) {
                const route = [0, ...curr, 0];
                const d = calculateDistance(route);
                if (d < min) min = d;
                return;
            }
            for (let i = 0; i < rest.length; i++) {
                permute([...curr, rest[i]], [...rest.slice(0,i), ...rest.slice(i+1)]);
            }
        }
        
        permute([], arr);
        return min;
    }

    function nextLevel() {
        if (state.stack >= 3) {
            state.level++;
            state.stack -= 3;
        }
        updateStackUI();
        startLevel(true);
    }
    
    function resetGame() {
        state.level = 1;
        state.score = 0;
        state.stack = 0;
        updateStackUI();
        ui.gameOverlay.classList.add('hidden');
        ui.startOverlay.classList.remove('hidden');
    }

    function updateTimerDisplay() {
        ui.time.textContent = state.timeLeft.toFixed(1);
    }
    
    function animateScore(target) {
        const start = parseInt(ui.score.textContent) || 0;
        const duration = 1000;
        const stepTime = 20;
        const steps = duration / stepTime;
        const increment = (target - start) / steps;
        
        let current = start;
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            ui.score.textContent = Math.floor(current);
            ui.score.style.transform = 'scale(1.2)';
            setTimeout(() => ui.score.style.transform = 'scale(1)', 100);
        }, stepTime);
    }

    // ===== ARCADE EFFECTS =====
    function spawnParticles(nx, ny, color) {
        const x = nx * canvas.width;
        const y = ny * canvas.height;
        for (let i = 0; i < 15; i++) {
            state.particles.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1.0,
                color: color
            });
        }
    }

    function triggerTrafficJam() {
        if (!state.isPlaying || state.isGameOver) return;
        if (Math.random() > 0.6) return; 

        let availableEdges = [];
        for (let i = 0; i < state.numNodes; i++) {
            for (let j = i + 1; j < state.numNodes; j++) {
                availableEdges.push([i, j]);
            }
        }
        
        if (availableEdges.length === 0) return;
        const edge = availableEdges[Math.floor(Math.random() * availableEdges.length)];
        const [u, v] = edge;
        
        const extraDist = parseFloat((Math.random() * 5 + 5).toFixed(1));
        state.adjMatrix[u][v] = parseFloat((state.adjMatrix[u][v] + extraDist).toFixed(1));
        state.adjMatrix[v][u] = state.adjMatrix[u][v];
        
        const cell1 = document.getElementById(`cell-${u}-${v}`);
        const cell2 = document.getElementById(`cell-${v}-${u}`);
        if (cell1) { cell1.textContent = state.adjMatrix[u][v].toFixed(1); cell1.classList.add('jammed'); }
        if (cell2) { cell2.textContent = state.adjMatrix[v][u].toFixed(1); cell2.classList.add('jammed'); }
        
        setTimeout(() => {
            if (cell1) cell1.classList.remove('jammed');
            if (cell2) cell2.classList.remove('jammed');
        }, 3000);

        const noti = document.getElementById('eventNotification');
        noti.classList.remove('hidden');
        document.body.classList.add('shake-effect');
        setTimeout(() => document.body.classList.remove('shake-effect'), 500);
        setTimeout(() => noti.classList.add('hidden'), 2500);
        
        updateRouteUI();
    }
    
    function gameLoop() {
        if (!state.isPlaying && !state.isGameOver) return;
        
        if (state.isGameOver && state.myRoute.length === state.numNodes + 1) {
            state.avatarProgress += 0.02;
            if (state.avatarProgress > state.myRoute.length - 1) {
                state.avatarProgress = state.myRoute.length - 1;
            }
        }
        
        for (let i = state.particles.length - 1; i >= 0; i--) {
            let p = state.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;
            if (p.life <= 0) state.particles.splice(i, 1);
        }
        
        drawMap();
        
        if (state.isPlaying || state.particles.length > 0 || (state.isGameOver && state.avatarProgress < state.myRoute.length - 1)) {
            requestAnimationFrame(gameLoop);
        }
    }

    // ===== CANVAS DRAWING =====
    function resizeCanvas() {
        const wrapper = canvas.parentElement;
        canvas.width = wrapper.clientWidth;
        canvas.height = wrapper.clientHeight;
        drawMap();
    }

    function drawMap() {
        if (state.nodes.length === 0) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const w = canvas.width;
        const h = canvas.height;
        
        // 1. 간선 그리기
        for (let i = 0; i < state.numNodes; i++) {
            for (let j = i + 1; j < state.numNodes; j++) {
                const dx = state.nodes[i].x - state.nodes[j].x;
                const dy = state.nodes[i].y - state.nodes[j].y;
                const baseDist = Math.sqrt(dx*dx + dy*dy) * 20;
                const currentDist = state.adjMatrix[i][j];
                
                let strokeColor = 'rgba(255, 255, 255, 0.05)';
                let lineWidth = 1;
                
                // 럭키(chaos) 모드가 아닐 때만 가중치 시각화
                if (state.gameMode !== 'chaos') {
                    if (currentDist < baseDist * 0.5) { // 보너스 도로 (0.3배)
                        strokeColor = 'rgba(16, 185, 129, 0.8)'; // Green
                        lineWidth = 3;
                    } else if (currentDist > baseDist * 1.5) { // 페널티 도로 (2.5배) 또는 교통체증
                        strokeColor = 'rgba(239, 68, 68, 0.8)'; // Red
                        lineWidth = 3;
                    }
                }
                
                ctx.beginPath();
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = lineWidth;
                ctx.moveTo(state.nodes[i].x * w, state.nodes[i].y * h);
                ctx.lineTo(state.nodes[j].x * w, state.nodes[j].y * h);
                ctx.stroke();
            }
        }
        
        // 2. 내 경로
        if (state.myRoute.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 4;
            
            for (let i = 0; i < state.myRoute.length - 1; i++) {
                const from = state.nodes[state.myRoute[i]];
                const to = state.nodes[state.myRoute[i+1]];
                
                const dx = (to.x - from.x) * w;
                const dy = (to.y - from.y) * h;
                const angle = Math.atan2(dy, dx);
                
                const startX = from.x * w + Math.cos(angle) * 16;
                const startY = from.y * h + Math.sin(angle) * 16;
                const endX = to.x * w - Math.cos(angle) * 20;
                const endY = to.y * h - Math.sin(angle) * 20;
                
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                
                // 화살표
                const headlen = 12;
                ctx.lineTo(endX - headlen * Math.cos(angle - Math.PI / 6), endY - headlen * Math.sin(angle - Math.PI / 6));
                ctx.moveTo(endX, endY);
                ctx.lineTo(endX - headlen * Math.cos(angle + Math.PI / 6), endY - headlen * Math.sin(angle + Math.PI / 6));
            }
            ctx.stroke();
        }
        
        // 3. 노드 그리기
        for (let i = 0; i < state.numNodes; i++) {
            const n = state.nodes[i];
            const x = n.x * w;
            const y = n.y * h;
            
            ctx.beginPath();
            ctx.arc(x, y, 20, 0, Math.PI * 2);
            ctx.fillStyle = i === 0 ? '#ef4444' : '#1e293b';
            ctx.fill();
            
            ctx.strokeStyle = i === 0 ? '#fca5a5' : '#475569';
            if (state.myRoute.includes(i) && i !== 0) ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(n.symbol, x, y + 2);
        }

        // 4. 파티클 렌더링
        for (let i = 0; i < state.particles.length; i++) {
            let p = state.particles[i];
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
        
        // 5. 오토바이 아바타 애니메이션
        if (state.isGameOver && state.myRoute.length === state.numNodes + 1 && state.avatarProgress > 0) {
            let idx = Math.floor(state.avatarProgress);
            let nextIdx = idx + 1;
            
            if (nextIdx < state.myRoute.length) {
                let from = state.nodes[state.myRoute[idx]];
                let to = state.nodes[state.myRoute[nextIdx]];
                let t = state.avatarProgress - idx;
                
                let cx = (from.x + (to.x - from.x) * t) * w;
                let cy = (from.y + (to.y - from.y) * t) * h;
                
                ctx.font = '30px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🛵', cx, cy - 10);
            }
        }
    }

    init();
});
