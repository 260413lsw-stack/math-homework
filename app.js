/**
 * TSP 게임화 로직 (Brute Force Algorithm) + 멀티플레이어 + 다중 모드
 */

document.addEventListener('DOMContentLoaded', () => {
    // ===== GAME STATE =====
    let state = {
        level: 1,
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
        
        // Multi mode & PeerJS
        gameMode: 'normal',
        peer: null,
        conn: null,
        roomId: null,
        isHost: false,
        opponentRoute: [],
        opponentFinished: false,
        opponentDist: 0
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
        btnRetry: document.getElementById('retryBtn'),
        
        // Multiplayer
        modeRadios: document.getElementsByName('gameMode'),
        multiSetup: document.getElementById('multiplayerSetup'),
        btnCreateRoom: document.getElementById('createRoomBtn'),
        btnJoinRoom: document.getElementById('joinRoomBtn'),
        joinCodeInput: document.getElementById('joinCodeInput'),
        multiStatus: document.getElementById('multiStatusText')
    };

    // ===== INITIALIZATION =====
    function init() {
        ui.bestScore.textContent = state.bestScore;
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        ui.btnStart.addEventListener('click', () => {
            if (state.gameMode === 'versus' && !state.conn) {
                alert("대결 모드에서는 방을 만들거나 접속해야 시작할 수 있습니다!");
                return;
            }
            if (state.gameMode === 'versus' && state.isHost) {
                state.numNodes = Math.min(3 + state.level, 8); 
                generateNodes();
                generateMatrix();
                state.conn.send({ type: 'start_game', nodes: state.nodes, adjMatrix: state.adjMatrix, numNodes: state.numNodes, level: state.level });
                startLevel(true);
            } else if (state.gameMode !== 'versus') {
                startLevel(true);
            } else {
                alert("방장이 게임을 시작할 때까지 기다려주세요.");
            }
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
                if (state.gameMode === 'versus') {
                    ui.multiSetup.classList.remove('hidden');
                } else {
                    ui.multiSetup.classList.add('hidden');
                }
            });
        });
        
        ui.btnCreateRoom.addEventListener('click', initHost);
        ui.btnJoinRoom.addEventListener('click', initGuest);
        
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

    // ===== PEERJS MULTIPLAYER =====
    function initHost() {
        ui.multiStatus.textContent = "방 생성 중...";
        state.peer = new Peer();
        state.peer.on('open', (id) => {
            state.roomId = id.substring(0, 5).toUpperCase();
            ui.multiStatus.textContent = `방 생성 완료! 초대 코드: ${state.roomId}`;
            state.isHost = true;
            
            state.peer.destroy();
            state.peer = new Peer(state.roomId);
            state.peer.on('connection', (conn) => {
                state.conn = conn;
                setupConnection();
                ui.multiStatus.textContent = `친구가 접속했습니다! [게임 시작]을 눌러주세요.`;
            });
        });
    }
    
    function initGuest() {
        const code = ui.joinCodeInput.value.trim().toUpperCase();
        if (!code) return alert("코드를 입력하세요!");
        ui.multiStatus.textContent = "접속 중...";
        state.peer = new Peer();
        state.peer.on('open', () => {
            state.conn = state.peer.connect(code);
            state.conn.on('open', () => {
                state.isHost = false;
                setupConnection();
                ui.multiStatus.textContent = "방 접속 완료! 방장의 시작을 기다리세요.";
            });
        });
    }
    
    function setupConnection() {
        state.conn.on('data', (data) => {
            if (data.type === 'start_game') {
                state.nodes = data.nodes;
                state.adjMatrix = data.adjMatrix;
                state.numNodes = data.numNodes;
                state.level = data.level;
                startLevel(false);
            } else if (data.type === 'route_update') {
                state.opponentRoute = data.route;
                drawMap();
            } else if (data.type === 'finish') {
                state.opponentFinished = true;
                state.opponentDist = data.dist;
                checkVersusEnd();
            }
        });
    }

    // ===== GAME LOOP =====
    function startLevel(shouldGenerate = true) {
        ui.startOverlay.classList.add('hidden');
        ui.gameOverlay.classList.add('hidden');
        
        if (shouldGenerate) {
            state.numNodes = Math.min(3 + state.level, 8); 
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
        } else if (state.gameMode === 'normal' || state.gameMode === 'perfect' || state.gameMode === 'versus') {
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
                    const dist = parseFloat((Math.sqrt(dx*dx + dy*dy) * 20).toFixed(1));
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
                    html += `<td id="cell-${i}-${j}">${state.adjMatrix[i][j].toFixed(1)}</td>`;
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
        
        if (state.gameMode === 'versus' && state.conn) {
            state.conn.send({ type: 'route_update', route: state.myRoute });
        }
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
        
        if (state.gameMode === 'versus') {
            state.conn.send({ type: 'finish', dist: myDist });
            state.isGameOver = true;
            checkVersusEnd();
            return;
        }
        
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
    
    function checkVersusEnd() {
        if (state.isGameOver && state.opponentFinished) {
            const myDist = calculateDistance(state.myRoute);
            const optDist = findOptimalRoute();
            
            let title = "";
            let desc = "";
            if (Math.abs(myDist - state.opponentDist) < 0.1) {
                title = "DRAW";
                desc = "무승부! 동일한 거리를 찾았습니다.";
            } else if (myDist < state.opponentDist) {
                title = "YOU WIN!";
                desc = `나: ${myDist.toFixed(1)}km / 상대: ${state.opponentDist.toFixed(1)}km`;
            } else {
                title = "YOU LOSE";
                desc = `상대방이 더 최적화된 경로를 찾았습니다! (${state.opponentDist.toFixed(1)}km)`;
            }
            
            endGame(myDist <= state.opponentDist, title, optDist, desc);
        } else if (state.isGameOver && !state.opponentFinished) {
            ui.gameOverlay.classList.remove('hidden', 'perfect', 'great', 'fail');
            ui.gameOverlay.classList.add('great');
            document.getElementById('overlayTitle').textContent = "WAITING...";
            document.getElementById('overlayDesc').textContent = "상대방의 완료를 기다리는 중입니다...";
            document.getElementById('overlayMyDist').textContent = calculateDistance(state.myRoute).toFixed(1) + ' km';
            document.getElementById('overlayOptDist').textContent = '-';
            ui.btnNext.classList.add('hidden');
            ui.btnRetry.classList.add('hidden');
        }
    }

    function endGame(isWin, title, optDist, descText) {
        ui.gameOverlay.classList.remove('hidden', 'perfect', 'great', 'fail');
        
        const myDist = calculateDistance(state.myRoute);
        document.getElementById('overlayTitle').textContent = title;
        document.getElementById('overlayMyDist').textContent = myDist.toFixed(1) + ' km';
        document.getElementById('overlayOptDist').textContent = optDist ? optDist.toFixed(1) + ' km' : '-';
        document.getElementById('overlayDesc').textContent = descText || '';
        
        if (isWin) {
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
            ui.gameOverlay.classList.add('fail');
            ui.btnNext.classList.add('hidden');
            ui.btnRetry.classList.remove('hidden');
        }
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
        state.level++;
        if (state.gameMode === 'versus') {
            if (state.isHost) {
                state.numNodes = Math.min(3 + state.level, 8); 
                generateNodes();
                generateMatrix();
                state.conn.send({ type: 'start_game', nodes: state.nodes, adjMatrix: state.adjMatrix, numNodes: state.numNodes, level: state.level });
                startLevel(true);
            } else {
                ui.gameOverlay.classList.add('hidden');
                ui.startOverlay.classList.remove('hidden');
                ui.multiStatus.textContent = "방장의 다음 라운드 시작을 기다립니다...";
            }
        } else {
            startLevel(true);
        }
    }
    
    function resetGame() {
        state.level = 1;
        state.score = 0;
        if (state.gameMode === 'versus') {
            if (state.isHost) {
                state.numNodes = Math.min(3 + state.level, 8); 
                generateNodes();
                generateMatrix();
                state.conn.send({ type: 'start_game', nodes: state.nodes, adjMatrix: state.adjMatrix, numNodes: state.numNodes, level: state.level });
                startLevel(true);
            } else {
                ui.gameOverlay.classList.add('hidden');
                ui.startOverlay.classList.remove('hidden');
            }
        } else {
            startLevel(true);
        }
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
        
        // 상대방 경로 (고스트)
        if (state.opponentRoute && state.opponentRoute.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)'; // Green transparent
            ctx.lineWidth = 6;
            for (let i = 0; i < state.opponentRoute.length - 1; i++) {
                const from = state.nodes[state.opponentRoute[i]];
                const to = state.nodes[state.opponentRoute[i+1]];
                if(!from || !to) continue;
                ctx.moveTo(from.x * w, from.y * h);
                ctx.lineTo(to.x * w, to.y * h);
            }
            ctx.stroke();
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
