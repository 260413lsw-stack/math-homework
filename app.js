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
        optimalRoute: [],
        isPlaying: false,
        isGameOver: false,
        particles: [],
        avatarProgress: 0,
        
        // Game Mode
        gameMode: 'normal',

        // Timer
        isTimerRunning: false,
        lastTime: 0,
        finalTimeLeft: 0,
        isEndGameCalled: false,
        
        // Lucky Guide
        hasShownLuckyGuide: false
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
        modeRadios: document.getElementsByName('gameMode'),
        
        // Lucky Mode Guide
        luckyGuideOverlay: document.getElementById('luckyGuideOverlay'),
        luckyGuideCloseBtn: document.getElementById('luckyGuideCloseBtn')
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
        
        if (ui.luckyGuideCloseBtn) {
            ui.luckyGuideCloseBtn.addEventListener('click', () => {
                sound.playSFX('click');
                ui.luckyGuideOverlay.classList.add('hidden');
                state.lastTime = performance.now();
                state.isTimerRunning = true;
                requestAnimationFrame(gameLoop);
            });
        }
        
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

        // 행렬 경로 검색기 리스너
        const pathBtn = document.getElementById('findMatrixPathsBtn');
        if (pathBtn) {
            pathBtn.addEventListener('click', () => {
                const startIdx = parseInt(document.getElementById('pathStartNode').value);
                const endIdx = parseInt(document.getElementById('pathEndNode').value);
                const steps = parseInt(document.getElementById('pathSteps').value);
                findAndHighlightPaths(startIdx, endIdx, steps);
            });
        }
    }

    // ===== GAME LOOP =====
    function startLevel(shouldGenerate = true) {
        // 새 게임 시작 즉시 이전 판의 상태 변수들을 전면 리셋하여 런타임 렌더링(drawMap) 에러 차단
        state.lastTime = 0;
        state.isGameOver = false;
        state.optimalRoute = [];
        state.myRoute = [0];
        state.avatarProgress = 0;
        state.isPlaying = false;
        state.isEndGameCalled = false;
        state.opponentRoute = [];
        state.opponentFinished = false;

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
        } else {
            renderMatrixHTML();
        }
        
        // 모드별 시간 설정
        if (state.gameMode === 'timeattack') {
            state.timeLeft = (state.numNodes - 1) * 2.0; 
        } else {
            state.timeLeft = (state.numNodes - 1) * 5.0; 
        }
        
        // 내 경로 UI 및 캔버스 초기 갱신
        updateRouteUI();
        
        state.isPlaying = true;
        
        if (state.numNodes >= 7) {
            document.body.classList.add('boss-mode');
        } else {
            document.body.classList.remove('boss-mode');
        }

        ui.level.textContent = state.level;
        ui.score.textContent = state.score;
        updateTimerDisplay();
        
        clearInterval(state.jamTimerId);
        
        if (state.gameMode === 'chaos' && !state.hasShownLuckyGuide) {
            state.isTimerRunning = false;
            if (ui.luckyGuideOverlay) ui.luckyGuideOverlay.classList.remove('hidden');
            state.hasShownLuckyGuide = true;
        } else {
            state.isTimerRunning = true;
            state.lastTime = performance.now();
            requestAnimationFrame(gameLoop);
        }
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
        
        // 1. 기본 기하학적 거리로 대칭 행렬을 채운다
        for (let i = 0; i < state.numNodes; i++) {
            for (let j = i + 1; j < state.numNodes; j++) {
                const dx = state.nodes[i].x - state.nodes[j].x;
                const dy = state.nodes[i].y - state.nodes[j].y;
                let dist = parseFloat((Math.sqrt(dx*dx + dy*dy) * 20).toFixed(1));
                state.adjMatrix[i][j] = dist;
                state.adjMatrix[j][i] = dist;
            }
        }
        
        // 2. 럭키 모드(chaos)인 경우 특수 가중치 도로 설정 (대칭 및 최소 1개 이상 보장)
        if (state.gameMode === 'chaos') {
            let edges = [];
            for (let i = 0; i < state.numNodes; i++) {
                for (let j = i + 1; j < state.numNodes; j++) {
                    edges.push([i, j]);
                }
            }
            
            // 도로 목록 무작위 셔플
            edges.sort(() => Math.random() - 0.5);
            
            if (edges.length >= 2) {
                // 1번째 도로: 확정 보너스 도로 (0.2 ~ 0.45배)
                const [b_u, b_v] = edges[0];
                const multB = 0.2 + Math.random() * 0.25;
                state.adjMatrix[b_u][b_v] = parseFloat((state.adjMatrix[b_u][b_v] * multB).toFixed(1));
                state.adjMatrix[b_v][b_u] = state.adjMatrix[b_u][b_v];
                
                // 2번째 도로: 확정 페널티 도로 (1.6 ~ 2.5배)
                const [p_u, p_v] = edges[1];
                const multP = 1.6 + Math.random() * 0.9;
                state.adjMatrix[p_u][p_v] = parseFloat((state.adjMatrix[p_u][p_v] * multP).toFixed(1));
                state.adjMatrix[p_v][p_u] = state.adjMatrix[p_u][p_v];
                
                // 나머지 도로들에 대해 무작위 가중치 부여 (대칭 유지)
                for (let k = 2; k < edges.length; k++) {
                    const [u, v] = edges[k];
                    let rand = Math.random();
                    let multiplier;
                    if (rand < 0.90) {
                        multiplier = 0.8 + Math.random() * 0.4;
                    } else if (rand < 0.95) {
                        multiplier = 0.2 + Math.random() * 0.25;
                    } else {
                        multiplier = 1.6 + Math.random() * 0.9;
                    }
                    state.adjMatrix[u][v] = parseFloat((state.adjMatrix[u][v] * multiplier).toFixed(1));
                    state.adjMatrix[v][u] = state.adjMatrix[u][v];
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
        updateMathReport();
    }

    // ===== MATH REPORT ENGINE (고1 공통수학1 연계) =====
    
    function updateMathReport() {
        if (!state.nodes || state.nodes.length === 0) return;
        
        renderMatrixTab();
        renderPermTab();
        renderOptTab();
        renderTspTab();
    }
    
    function multiplyMatrices(A, B) {
        const n = A.length;
        const C = Array(n).fill(null).map(() => Array(n).fill(0));
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                let sum = 0;
                for (let k = 0; k < n; k++) {
                    sum += A[i][k] * B[k][j];
                }
                C[i][j] = sum;
            }
        }
        return C;
    }
    
    function factorial(n) {
        if (n <= 1) return 1;
        let res = 1;
        for (let i = 2; i <= n; i++) res *= i;
        return res;
    }
    
    function combination(n, r) {
        if (r < 0 || r > n) return 0;
        if (r === 0 || r === n) return 1;
        return Math.round(factorial(n) / (factorial(r) * factorial(n - r)));
    }
    
    function generatePermutations(arr) {
        const results = [];
        function permute(temp, remaining) {
            if (remaining.length === 0) {
                results.push([...temp]);
                return;
            }
            for (let i = 0; i < remaining.length; i++) {
                const current = remaining[i];
                const nextRemaining = remaining.slice(0, i).concat(remaining.slice(i + 1));
                temp.push(current);
                permute(temp, nextRemaining);
                temp.pop();
            }
        }
        permute([], arr);
        return results;
    }
    
    let currentMatrixM = [];
    let currentMatrixM2 = [];
    let currentMatrixM3 = [];
    
    function renderMatrixTab() {
        const n = state.numNodes;
        const M = Array(n).fill(null).map(() => Array(n).fill(0));
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (i === j) {
                    M[i][j] = 0;
                } else {
                    const dx = state.nodes[i].x - state.nodes[j].x;
                    const dy = state.nodes[i].y - state.nodes[j].y;
                    const distRatio = Math.sqrt(dx*dx + dy*dy);
                    M[i][j] = distRatio < 0.48 ? 1 : 0;
                }
            }
        }
        
        currentMatrixM = M;
        currentMatrixM2 = multiplyMatrices(M, M);
        currentMatrixM3 = multiplyMatrices(currentMatrixM2, M);
        
        const mTable = document.getElementById('matrixM');
        const m2Table = document.getElementById('matrixM2');
        const m3Table = document.getElementById('matrixM3');
        
        function renderMiniTable(tableEl, matrix) {
            if (!tableEl) return;
            let html = '<tr><td class="header-cell"></td>';
            for (let i = 0; i < n; i++) {
                html += `<td class="header-cell" title="거점 ${i}">${state.nodes[i].symbol}</td>`;
            }
            html += '</tr>';
            
            for (let i = 0; i < n; i++) {
                html += `<tr><td class="header-cell" title="거점 ${i}">${state.nodes[i].symbol}</td>`;
                for (let j = 0; j < n; j++) {
                    if (i === j) {
                        html += `<td class="diagonal">0</td>`;
                    } else {
                        html += `<td id="mini-${tableEl.id}-${i}-${j}">${matrix[i][j]}</td>`;
                    }
                }
                html += '</tr>';
            }
            tableEl.innerHTML = html;
        }
        
        renderMiniTable(mTable, currentMatrixM);
        renderMiniTable(m2Table, currentMatrixM2);
        renderMiniTable(m3Table, currentMatrixM3);
        
        const startSelect = document.getElementById('pathStartNode');
        const endSelect = document.getElementById('pathEndNode');
        if (startSelect && endSelect) {
            const prevStart = startSelect.value;
            const prevEnd = endSelect.value;
            
            let options = '';
            for (let i = 0; i < n; i++) {
                options += `<option value="${i}">${state.nodes[i].symbol} (거점 ${i})</option>`;
            }
            startSelect.innerHTML = options;
            endSelect.innerHTML = options;
            
            if (prevStart !== "" && parseInt(prevStart) < n) startSelect.value = prevStart;
            else startSelect.value = "0";
            
            if (prevEnd !== "" && parseInt(prevEnd) < n) endSelect.value = prevEnd;
            else endSelect.value = (n > 1) ? "1" : "0";
        }
    }
    
    function findAndHighlightPaths(startIdx, endIdx, steps) {
        const resultBox = document.getElementById('matrixPathResult');
        if (!resultBox) return;
        
        if (startIdx === endIdx) {
            resultBox.innerHTML = `<span style="color:var(--accent-red);">⚠️ 출발 거점과 도착 거점은 달라야 합니다.</span>`;
            return;
        }
        
        document.querySelectorAll('.matrix-mini-table td').forEach(td => td.classList.remove('path-active'));
        
        const n = state.numNodes;
        const paths = [];
        
        if (steps === 2) {
            for (let k = 0; k < n; k++) {
                if (currentMatrixM[startIdx][k] === 1 && currentMatrixM[k][endIdx] === 1) {
                    paths.push([startIdx, k, endIdx]);
                }
            }
        } else if (steps === 3) {
            for (let k = 0; k < n; k++) {
                for (let m = 0; m < n; m++) {
                    if (currentMatrixM[startIdx][k] === 1 && currentMatrixM[k][m] === 1 && currentMatrixM[m][endIdx] === 1) {
                        paths.push([startIdx, k, m, endIdx]);
                    }
                }
            }
        }
        
        const stepsName = steps === 2 ? 'M²' : 'M³';
        const expectedCount = steps === 2 ? currentMatrixM2[startIdx][endIdx] : currentMatrixM3[startIdx][endIdx];
        
        let html = `<strong>행렬 연산 검증 (${stepsName} 성분): ${expectedCount}개 경로 존재</strong><br>`;
        
        if (paths.length === 0) {
            html += `<span style="color:var(--text-muted); font-size:0.85rem;">구체적으로 경유 가능한 ${steps}단계 경로가 존재하지 않습니다.</span>`;
        } else {
            html += `<ul style="margin-left: 16px; margin-top: 6px; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; line-height: 1.6;">`;
            paths.forEach(p => {
                const pathSymbols = p.map(idx => state.nodes[idx].symbol).join(' → ');
                const pathIndices = p.join(' → ');
                html += `<li>${pathSymbols} <span style="color:var(--text-muted); font-size:0.75rem;">(인덱스: ${pathIndices})</span></li>`;
                
                for (let i = 0; i < p.length - 1; i++) {
                    const u = p[i];
                    const v = p[i+1];
                    const cell = document.getElementById(`mini-matrixM-${u}-${v}`);
                    if (cell) cell.classList.add('path-active');
                }
            });
            html += `</ul>`;
            
            const resultTableId = steps === 2 ? 'matrixM2' : 'matrixM3';
            const resCell = document.getElementById(`mini-${resultTableId}-${startIdx}-${endIdx}`);
            if (resCell) resCell.classList.add('path-active');
        }
        
        resultBox.innerHTML = html;
        sound.playSFX('click');
    }
    
    function renderPermTab() {
        const n = state.numNodes;
        const statsEl = document.getElementById('permStats');
        const tbody = document.getElementById('permTableBody');
        if (!tbody) return;
        
        if (n > 6) {
            statsEl.textContent = `거점 수: ${n-1}개 (기지 제외) | 전체 순열 가짓수: ${factorial(n-1).toLocaleString()}가지`;
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align:center; padding: 30px; color: var(--accent-red); font-weight: 500;">
                        ⚠️ 조합 폭발 발생! N이 커서 순열(${factorial(n-1).toLocaleString()}가지)을 나열하기에 브라우저 오버헤드가 큽니다.<br>
                        연산 방지 안전 장치가 작동되었습니다. 우측의 [조합 폭발] 탭에서 이론적 연산량을 확인하십시오.
                    </td>
                </tr>
            `;
            return;
        }
        
        statsEl.innerHTML = `거점 수: ${n-1}개 (기지 제외) | 전체 순열 가짓수: ${(n-1)}! = ${factorial(n-1).toLocaleString()}가지 (<sub>${n-1}</sub>P<sub>${n-1}</sub>)`;
        
        const targetNodes = [];
        for (let i = 1; i < n; i++) targetNodes.push(i);
        
        const perms = generatePermutations(targetNodes);
        const routeData = [];
        
        perms.forEach(p => {
            const fullRoute = [0, ...p, 0];
            let distSum = 0;
            let calcParts = [];
            for (let i = 0; i < fullRoute.length - 1; i++) {
                const d = state.adjMatrix[fullRoute[i]][fullRoute[i+1]];
                distSum += d;
                calcParts.push(d.toFixed(1));
            }
            routeData.push({
                permutation: p,
                fullRoute: fullRoute,
                dist: parseFloat(distSum.toFixed(1)),
                calcText: calcParts.join(' + ') + ' km'
            });
        });
        
        routeData.sort((a, b) => a.dist - b.dist);
        
        let html = '';
        const limit = 24;
        
        const renderRow = (data, idx, labelClass, labelText) => {
            const pathStr = data.fullRoute.map(idx => idx === 0 ? '🏠' : state.nodes[idx].symbol).join(' → ');
            const badge = labelClass ? `<span class="perm-badge ${labelClass}">${labelText}</span>` : '';
            const rowClass = labelClass ? (labelClass === 'best' ? 'best-route-row' : 'worst-route-row') : '';
            
            return `
                <tr class="${rowClass}">
                    <td><strong>${pathStr}</strong></td>
                    <td style="color:var(--text-muted); font-size:0.8rem;">${data.calcText}</td>
                    <td style="font-weight: 700;">${data.dist.toFixed(1)} km</td>
                    <td>${badge}</td>
                </tr>
            `;
        };
        
        if (routeData.length <= limit) {
            routeData.forEach((data, index) => {
                let labelClass = null;
                let labelText = '';
                if (index === 0) { labelClass = 'best'; labelText = '최적 경로'; }
                else if (index === routeData.length - 1) { labelClass = 'worst'; labelText = '최악 경로'; }
                
                html += renderRow(data, index, labelClass, labelText);
            });
        } else {
            for (let i = 0; i < 12; i++) {
                let labelClass = i === 0 ? 'best' : null;
                let labelText = i === 0 ? '최적 경로' : '';
                html += renderRow(routeData[i], i, labelClass, labelText);
            }
            html += `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding: 12px; font-style:italic;">... 조합 폭발 방지를 위해 중간 경로 생략 ...</td></tr>`;
            for (let i = routeData.length - 12; i < routeData.length; i++) {
                let labelClass = i === routeData.length - 1 ? 'worst' : null;
                let labelText = i === routeData.length - 1 ? '최악 경로' : '';
                html += renderRow(routeData[i], i, labelClass, labelText);
            }
        }
        
        tbody.innerHTML = html;
    }
    
    function renderOptTab() {
        const n = state.numNodes;
        const E = (n * (n - 1)) / 2;
        
        let K = 0;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const dx = state.nodes[i].x - state.nodes[j].x;
                const dy = state.nodes[i].y - state.nodes[j].y;
                const baseDist = Math.sqrt(dx*dx + dy*dy) * 20;
                const currentDist = state.adjMatrix[i][j];
                if (currentDist < baseDist * 0.5 || currentDist > baseDist * 1.5) {
                    K++;
                }
            }
        }
        
        let isExample = false;
        if (K === 0) {
            K = Math.min(3, Math.max(1, Math.floor(E / 3)));
            isExample = true;
        }
        
        const combVal = combination(E, K);
        
        const formulaEl = document.getElementById('combFormulaDisplay');
        const detailsEl = document.getElementById('combMathDetails');
        if (!formulaEl || !detailsEl) return;
        
        formulaEl.innerHTML = `<sub>${E}</sub>C<sub>${K}</sub> = ${combVal.toLocaleString()}`;
        
        let numParts = [];
        let denParts = [];
        for (let i = 0; i < K; i++) {
            numParts.push(E - i);
            denParts.push(K - i);
        }
        
        let html = `식: <sub>${E}</sub>C<sub>${K}</sub> = <span>${E}!</span> / (<span>${K}!</span> × <span>${E - K}!</span>)<br>`;
        html += `계산: <span>(${numParts.join('×')})</span> / <span>(${denParts.join('×')})</span> = <strong>${combVal.toLocaleString()}</strong> 가지 조합<br>`;
        
        if (state.gameMode === 'chaos' && !isExample) {
            html += `<span style="color:var(--accent-green); font-size:0.85rem; margin-top:8px; display:inline-block; line-height: 1.4;">🍀 <strong>[확률 공간]</strong> 현재 맵의 특수 가중치 도로 ${K}개의 배치는 총 <strong>${combVal.toLocaleString()}</strong>개의 상이한 수학적 조합 중 <strong>1/${combVal.toLocaleString()}</strong>의 확률로 획득한 고유의 지도 구조입니다.</span>`;
        } else {
            const note = isExample ? `(※ 현재 특수 도로가 없어 예시로 ${K}개 배치 기준 계산)` : '';
            html += `<span style="color:var(--text-muted); font-size:0.85rem; margin-top:8px; display:inline-block; line-height: 1.4;">💡 ${note} 전체 도로 ${E}개 중 ${K}개의 특수 도로를 무작위로 선정하여 설치하는 대수학적 방법의 수는 총 <strong>${combVal.toLocaleString()}</strong>가지가 존재합니다.</span>`;
        }
        
        detailsEl.innerHTML = html;
    }
    
    function renderTspTab() {
        const container = document.getElementById('chartBarsContainer');
        if (!container) return;
        
        let chartHtml = '';
        const nValues = [3, 4, 5, 6, 7, 8, 9, 10];
        const widths = [2, 5, 12, 25, 45, 65, 85, 100];
        const times = ["0.000000006초", "0.000000024초", "0.00000012초", "0.00000072초", "0.00000504초", "0.00004032초", "0.00036288초", "0.0036초"];
        
        for (let i = 0; i < nValues.length; i++) {
            const n = nValues[i];
            const w = widths[i];
            const val = factorial(n).toLocaleString();
            const isExplosive = n >= 8 ? ' explosive' : '';
            
            chartHtml += `
            <div class="chart-bar-row">
                <div class="chart-label">N = ${n} 거점</div>
                <div class="chart-bar-wrapper">
                    <div class="chart-bar${isExplosive}" style="width: ${w}%;"></div>
                    <span class="chart-bar-value">${val}가지 (${times[i]})</span>
                </div>
            </div>
            `;
        }
        container.innerHTML = chartHtml;
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
    let winResult = {
        isWin: false,
        title: "",
        optDist: 0,
        descText: ""
    };

    function checkWin() {
        state.isTimerRunning = false; // 완주 즉시 타이머 정지 (애니메이션 이동 시간 보정)
        state.finalTimeLeft = state.timeLeft;
        state.isPlaying = false;
        state.isGameOver = true;
        state.avatarProgress = 0;
        
        const myDist = calculateDistance(state.myRoute);
        const optDist = findOptimalRoute();
        
        const diff = myDist - optDist;
        const diffPercent = (diff / optDist) * 100;
        
        if (state.gameMode === 'perfect') {
            if (Math.abs(diff) > 0.1) {
                winResult = {
                    isWin: false,
                    title: "PERFECT FAILED",
                    optDist: optDist,
                    descText: `오차: ${diff.toFixed(1)}km. 완벽한 최적화가 아닙니다.`
                };
            } else {
                winResult = {
                    isWin: true,
                    title: "PERFECT CLEAR",
                    optDist: optDist,
                    descText: "인간 승리! 알고리즘과 100% 일치합니다."
                };
            }
        } else {
            if (diff <= 0.1) {
                winResult = {
                    isWin: true,
                    title: "PERFECT!",
                    optDist: optDist,
                    descText: "알고리즘과 완벽히 일치합니다."
                };
            } else if (diffPercent <= 10) {
                winResult = {
                    isWin: true,
                    title: "GREAT",
                    optDist: optDist,
                    descText: `오차: ${diff.toFixed(1)}km`
                };
            } else {
                winResult = {
                    isWin: false,
                    title: "GAME OVER",
                    optDist: optDist,
                    descText: `최적화 실패. 알고리즘이 ${diff.toFixed(1)}km 빠릅니다.`
                };
            }
        }
    }

    function triggerEndGameCalculation() {
        endGame(winResult.isWin, winResult.title, winResult.optDist, winResult.descText);
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
            const timeBonus = Math.floor(state.finalTimeLeft * 100);
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
        let bestRoute = [];
        
        function permute(curr, rest) {
            if (rest.length === 0) {
                const route = [0, ...curr, 0];
                const d = calculateDistance(route);
                if (d < min) {
                    min = d;
                    bestRoute = [...route];
                }
                return;
            }
            for (let i = 0; i < rest.length; i++) {
                permute([...curr, rest[i]], [...rest.slice(0,i), ...rest.slice(i+1)]);
            }
        }
        
        permute([], arr);
        state.optimalRoute = bestRoute;
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
        ui.time.textContent = state.timeLeft.toFixed(2);
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
    
    function gameLoop(timestamp) {
        if (!state.isPlaying && !state.isGameOver) return;
        
        const now = timestamp || performance.now();
        if (!state.lastTime || state.lastTime === 0) {
            state.lastTime = now;
        }
        const dt = (now - state.lastTime) / 1000;
        state.lastTime = now;
        
        if (state.isTimerRunning) {
            state.timeLeft -= dt;
            if (state.timeLeft <= 0) {
                state.timeLeft = 0;
                state.isTimerRunning = false;
                state.isPlaying = false;
                
                // 시간 초과 시 즉시 게임을 종료하지 않고, 최적화 경로 애니메이션을 실행하도록 설정
                state.isGameOver = true;
                state.avatarProgress = 0;
                const optDist = findOptimalRoute();
                
                winResult = {
                    isWin: false,
                    title: "TIME OVER",
                    optDist: optDist,
                    descText: "시간이 다 되었습니다! 최적 경로를 확인해 보세요."
                };
            }
            updateTimerDisplay();
        }
        
        if (state.isGameOver) {
            // dt 기반으로 부드럽고 일정한 속도 구현 (속도를 기존 대비 1.5배 상향하여 초당 0.975 노드 진행)
            state.avatarProgress += 0.975 * dt;
            const targetLength = (state.optimalRoute && state.optimalRoute.length > 0) ? state.optimalRoute.length : state.myRoute.length;
            if (state.avatarProgress >= targetLength - 1) {
                state.avatarProgress = targetLength - 1;
                
                if (!state.isEndGameCalled) {
                    state.isEndGameCalled = true;
                    state.isTimerRunning = false;
                    triggerEndGameCalculation();
                }
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
        
        const targetLength = (state.optimalRoute && state.optimalRoute.length > 0) ? state.optimalRoute.length : state.myRoute.length;
        if (state.isPlaying || state.particles.length > 0 || (state.isGameOver && state.avatarProgress < targetLength - 1)) {
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
                
                // 타임어택(timeattack) 모드가 아닐 때만 실제 가중치에 따른 보너스/페널티 도로 시각화 활성화
                if (state.gameMode !== 'timeattack') {
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

        // 2-2. 최적 경로 (게임 종료 시 시각화)
        if (state.isGameOver && state.optimalRoute && state.optimalRoute.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = '#10b981'; // Green
            ctx.lineWidth = 4;
            ctx.setLineDash([8, 8]); // Dashed line
            
            for (let i = 0; i < state.optimalRoute.length - 1; i++) {
                const from = state.nodes[state.optimalRoute[i]];
                const to = state.nodes[state.optimalRoute[i+1]];
                
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
            ctx.setLineDash([]); // Reset to solid
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
        
        // 5. 오토바이 아바타 애니메이션 (최적 경로 추적)
        const animationRoute = (state.optimalRoute && state.optimalRoute.length > 0) ? state.optimalRoute : state.myRoute;
        if (state.isGameOver && animationRoute.length > 1 && state.avatarProgress > 0) {
            let idx = Math.floor(state.avatarProgress);
            let nextIdx = idx + 1;
            let cx, cy;
            
            if (nextIdx < animationRoute.length) {
                let from = state.nodes[animationRoute[idx]];
                let to = state.nodes[animationRoute[nextIdx]];
                let t = state.avatarProgress - idx;
                
                cx = (from.x + (to.x - from.x) * t) * w;
                cy = (from.y + (to.y - from.y) * t) * h;
            } else {
                // 도착 완료 시 마지막 목적지(기지 🏠)에 얌전히 정차
                const lastNode = state.nodes[animationRoute[animationRoute.length - 1]];
                cx = lastNode.x * w;
                cy = lastNode.y * h;
            }
            
            ctx.font = '30px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🛵', cx, cy - 10);
        }
    }

    init();
});
