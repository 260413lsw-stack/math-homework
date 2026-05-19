/**
 * TSP 게임화 로직 (Brute Force Algorithm)
 */

document.addEventListener('DOMContentLoaded', () => {
    // ===== GAME STATE =====
    let state = {
        level: 1,
        score: 0,
        bestScore: localStorage.getItem('tspBestScore') || 0,
        timeLeft: 0,
        timerId: null,
        jamTimerId: null, // 교통체증 타이머
        numNodes: 4,
        nodes: [],
        adjMatrix: [],
        myRoute: [0],
        isPlaying: false,
        isGameOver: false,
        combo: 0,
        lastClickTime: 0,
        particles: [],
        avatarProgress: 0 // 오토바이 이동 진행도
    };

    // ===== DOM ELEMENTS =====
    const canvas = document.getElementById('mapCanvas');
    const ctx = canvas.getContext('2d');
    
    const ui = {
        level: document.getElementById('levelDisplay'),
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
        btnRetry: document.getElementById('retryBtn')
    };

    // ===== INITIALIZATION =====
    function init() {
        ui.bestScore.textContent = state.bestScore;
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        ui.btnStart.addEventListener('click', startLevel);
        ui.btnReset.addEventListener('click', resetRoute);
        ui.btnNext.addEventListener('click', nextLevel);
        ui.btnRetry.addEventListener('click', resetGame);
        
        canvas.addEventListener('mousedown', handleCanvasClick);
        canvas.addEventListener('mousemove', handleCanvasMove);
        canvas.addEventListener('mouseup', () => isDragging = false);
        
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
    function startLevel() {
        ui.startOverlay.classList.add('hidden');
        ui.gameOverlay.classList.add('hidden');
        
        // 레벨별 노드 수 설정 (최대 8개)
        state.numNodes = Math.min(3 + state.level, 8); 
        
        // 시간 설정 (거점 당 3초)
        state.timeLeft = (state.numNodes - 1) * 3.0; 
        
        generateNodes();
        generateMatrix();
        resetRoute();
        
        state.isPlaying = true;
        state.isGameOver = false;
        
        // 보스 모드 (레벨 4부터, 거점 7개)
        if (state.numNodes >= 7) {
            document.body.classList.add('boss-mode');
        } else {
            document.body.classList.remove('boss-mode');
        }

        // UI 업데이트
        ui.level.textContent = state.level;
        ui.score.textContent = state.score;
        updateTimerDisplay();
        
        // 타이머 시작
        clearInterval(state.timerId);
        clearInterval(state.jamTimerId);
        
        state.timerId = setInterval(() => {
            state.timeLeft -= 0.1;
            if (state.timeLeft <= 0) {
                state.timeLeft = 0;
                endGame(false, "TIME OVER");
            }
            updateTimerDisplay();
        }, 100);
        
        // 교통 체증 이벤트 (랜덤)
        if (state.level >= 2) {
            state.jamTimerId = setInterval(triggerTrafficJam, 4000 + Math.random() * 3000);
        }
        
        requestAnimationFrame(gameLoop);
    }

    function generateNodes() {
        state.nodes = [{ id: 0, symbol: '🏠', isBase: true, x: 0.5, y: 0.8 }];
        const symbols = ['🏫', '📚', '🛒', '🌲', '🏥', '🏭', '🏟️'];
        
        for (let i = 1; i < state.numNodes; i++) {
            // 랜덤 위치 생성하되 너무 겹치지 않게
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
        let html = '<tr><th>거점</th>';
        for(let i=0; i<state.numNodes; i++) html += `<th>${state.nodes[i].symbol}</th>`;
        html += '</tr>';

        for (let i = 0; i < state.numNodes; i++) {
            html += `<tr><th>${state.nodes[i].symbol}</th>`;
            for (let j = 0; j < state.numNodes; j++) {
                if (i === j) {
                    state.adjMatrix[i][j] = 0;
                    html += `<td class="diagonal">-</td>`;
                } else {
                    const dx = state.nodes[i].x - state.nodes[j].x;
                    const dy = state.nodes[i].y - state.nodes[j].y;
                    const dist = parseFloat((Math.sqrt(dx*dx + dy*dy) * 20).toFixed(1));
                    state.adjMatrix[i][j] = dist;
                    html += `<td id="cell-${i}-${j}">${dist}</td>`;
                }
            }
            html += '</tr>';
        }
        ui.matrixTable.innerHTML = html;
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
        
        const radius = 25; // 히트박스 크기
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
        const lastNode = state.myRoute[state.myRoute.length - 1];
        
        if (nodeId === 0) {
            // 기지 복귀
            if (state.myRoute.length === state.numNodes && lastNode !== 0) {
                state.myRoute.push(0);
                spawnParticles(state.nodes[0].x, state.nodes[0].y, '#ef4444');
                updateRouteUI();
                checkWin();
            }
        } else {
            // 안 가본 거점
            if (!state.myRoute.includes(nodeId)) {
                state.myRoute.push(nodeId);
                
                // 콤보 계산
                const now = Date.now();
                if (state.lastClickTime > 0 && (now - state.lastClickTime) < 1500) {
                    state.combo++;
                    showComboPopup(state.combo);
                    state.score += (state.combo * 50);
                    ui.score.textContent = state.score;
                } else {
                    state.combo = 0;
                }
                state.lastClickTime = now;
                
                // 파티클
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

        // 매트릭스 하이라이트
        document.querySelectorAll('.matrix-table td').forEach(td => td.classList.remove('highlight-edge'));
        for (let i = 0; i < state.myRoute.length - 1; i++) {
            const from = state.myRoute[i];
            const to = state.myRoute[i+1];
            const cell = document.getElementById(`cell-${from}-${to}`);
            if (cell) cell.classList.add('highlight-edge');
            
            // 대칭되는 행렬도 하이라이트
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
        state.isGameOver = true;
        
        const myDist = calculateDistance(state.myRoute);
        const optDist = findOptimalRoute();
        
        const diff = myDist - optDist;
        const diffPercent = (diff / optDist) * 100;
        
        if (diff <= 0.1) {
            endGame(true, "PERFECT!", optDist);
        } else if (diffPercent <= 10) {
            endGame(true, "GREAT", optDist);
        } else {
            endGame(false, "GAME OVER", optDist);
        }
    }

    function endGame(isWin, title, optDist) {
        ui.gameOverlay.classList.remove('hidden', 'perfect', 'great', 'fail');
        
        const myDist = calculateDistance(state.myRoute);
        document.getElementById('overlayTitle').textContent = title;
        document.getElementById('overlayMyDist').textContent = myDist.toFixed(1) + ' km';
        document.getElementById('overlayOptDist').textContent = optDist ? optDist.toFixed(1) + ' km' : '-';
        
        if (isWin) {
            ui.gameOverlay.classList.add(title === "PERFECT!" ? 'perfect' : 'great');
            document.getElementById('overlayDesc').textContent = `알고리즘과의 오차: ${(myDist - optDist).toFixed(1)}km`;
            ui.btnNext.classList.remove('hidden');
            ui.btnRetry.classList.add('hidden');
            
            // 점수 계산
            const baseScore = state.level * 1000;
            const timeBonus = Math.floor(state.timeLeft * 100);
            const perfBonus = title === "PERFECT!" ? 500 : 0;
            state.score += baseScore + timeBonus + perfBonus;
            
            animateScore(state.score);
            
            if (state.score > state.bestScore) {
                state.bestScore = state.score;
                localStorage.setItem('tspBestScore', state.bestScore);
                ui.bestScore.textContent = state.bestScore;
            }
        } else {
            ui.gameOverlay.classList.add('fail');
            document.getElementById('overlayDesc').textContent = optDist ? 
                `산업공학 최적화 실패! 알고리즘이 ${(myDist - optDist).toFixed(1)}km 더 빠릅니다.` : 
                `시간 초과! 피자가 다 식었습니다.`;
            ui.btnNext.classList.add('hidden');
            ui.btnRetry.classList.remove('hidden');
        }
    }

    function findOptimalRoute() {
        // Brute Force for shortest path
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
        state.level++;
        startLevel();
    }
    
    function resetGame() {
        state.level = 1;
        state.score = 0;
        startLevel();
    }

    function updateTimerDisplay() {
        ui.time.textContent = state.timeLeft.toFixed(1);
    }
    
    function animateScore(target) {
        const start = parseInt(ui.score.textContent);
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
    
    function showComboPopup(comboCount) {
        const container = document.getElementById('comboContainer');
        const el = document.createElement('div');
        el.className = 'combo-popup';
        el.textContent = comboCount + ' COMBO!';
        container.appendChild(el);
        setTimeout(() => el.remove(), 1000);
    }

    function triggerTrafficJam() {
        if (!state.isPlaying || state.isGameOver) return;
        // 빈번하게 일어나지 않게 조절
        if (Math.random() > 0.6) return; 

        // 안 가본 경로 중 하나 랜덤 선택
        let availableEdges = [];
        for (let i = 0; i < state.numNodes; i++) {
            for (let j = i + 1; j < state.numNodes; j++) {
                availableEdges.push([i, j]);
            }
        }
        
        if (availableEdges.length === 0) return;
        const edge = availableEdges[Math.floor(Math.random() * availableEdges.length)];
        const [u, v] = edge;
        
        // 가중치 증가
        const extraDist = parseFloat((Math.random() * 5 + 2).toFixed(1));
        state.adjMatrix[u][v] += extraDist;
        state.adjMatrix[v][u] += extraDist;
        
        // 테이블 업데이트 및 하이라이트
        const cell1 = document.getElementById(`cell-${u}-${v}`);
        const cell2 = document.getElementById(`cell-${v}-${u}`);
        if (cell1) { cell1.textContent = state.adjMatrix[u][v].toFixed(1); cell1.classList.add('jammed'); }
        if (cell2) { cell2.textContent = state.adjMatrix[v][u].toFixed(1); cell2.classList.add('jammed'); }
        
        setTimeout(() => {
            if (cell1) cell1.classList.remove('jammed');
            if (cell2) cell2.classList.remove('jammed');
        }, 3000);

        // 알림
        const noti = document.getElementById('eventNotification');
        noti.classList.remove('hidden');
        document.body.classList.add('shake-effect');
        setTimeout(() => document.body.classList.remove('shake-effect'), 500);
        setTimeout(() => noti.classList.add('hidden'), 2500);
        
        // 경로 거리 재계산 (이미 지난 경로에 영향이 갔다면 갱신)
        updateRouteUI();
    }
    
    function gameLoop() {
        if (!state.isPlaying && !state.isGameOver) return;
        
        // 오토바이 이동 애니메이션
        if (state.isGameOver && state.myRoute.length === state.numNodes + 1) {
            state.avatarProgress += 0.02;
            if (state.avatarProgress > state.myRoute.length - 1) {
                state.avatarProgress = state.myRoute.length - 1;
            }
        }
        
        // 파티클 업데이트
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
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i < state.numNodes; i++) {
            for (let j = i + 1; j < state.numNodes; j++) {
                ctx.beginPath();
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
            
            // 테두리 강조
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
