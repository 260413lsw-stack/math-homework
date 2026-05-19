import re

with open('app.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add SoundEngine at the top
sound_engine = '''
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
'''
code = code.replace("document.addEventListener('DOMContentLoaded', () => {", sound_engine, 1)

# 2. Add state variables
state_replace = '''
    let state = {
        level: 1,
        stack: 0,
'''
code = code.replace("    let state = {\n        level: 1,", state_replace, 1)

# 3. Add guestReady
guest_ready = '''
        opponentDist: 0,
        guestReady: false
    };
'''
code = code.replace("        opponentDist: 0\n    };", guest_ready, 1)

# 4. Add UI elements
ui_elements = '''
        level: document.getElementById('levelDisplay'),
        stack: document.getElementById('stackDisplay'),
'''
code = code.replace("        level: document.getElementById('levelDisplay'),", ui_elements, 1)

# 5. Handshake check in btnStart
btn_start_check = '''
        ui.btnStart.addEventListener('click', () => {
            sound.initBGM(); // Start BGM on first click
            if (state.gameMode === 'versus' && !state.conn) {
                alert("대결 모드에서는 방을 만들거나 접속해야 시작할 수 있습니다!");
                return;
            }
            if (state.gameMode === 'versus' && !state.isHost) {
                alert("방장이 게임을 시작할 때까지 기다려주세요.");
                return;
            }
            if (state.gameMode === 'versus' && state.isHost && !state.guestReady) {
                alert("참가자가 아직 준비되지 않았습니다. 조금만 기다려주세요.");
                return;
            }
'''
code = re.sub(r"        ui\.btnStart\.addEventListener\('click', \(\) => \{[\s\S]*?startLevel\(true\);\n        \}\);", btn_start_check + "            startLevel(true);\n        });", code, 1)

# 6. Guest send guest_ready
guest_send = '''
                state.isHost = false;
                setupConnection();
                ui.multiStatus.textContent = "방 접속 완료! 방장의 시작을 기다리세요.";
                state.conn.send({ type: 'guest_ready' });
'''
code = code.replace('''                state.isHost = false;
                setupConnection();
                ui.multiStatus.textContent = "방 접속 완료! 방장의 시작을 기다리세요.";''', guest_send, 1)

# 7. Host receive guest_ready
setup_conn = '''
    function setupConnection() {
        state.conn.on('data', (data) => {
            if (data.type === 'guest_ready') {
                state.guestReady = true;
                if (state.isHost) ui.multiStatus.textContent = "참가자 준비 완료! [게임 시작]을 눌러주세요.";
            } else if (data.type === 'start_game') {
'''
code = code.replace('''    function setupConnection() {
        state.conn.on('data', (data) => {
            if (data.type === 'start_game') {''', setup_conn, 1)

# 8. Sound on click
click_node = '''
    function addNodeToRoute(nodeId) {
        sound.playSFX('click');
        const lastNode = state.myRoute[state.myRoute.length - 1];
'''
code = code.replace("    function addNodeToRoute(nodeId) {\n        const lastNode", click_node, 1)

# 9. Update stack logic in endGame
end_game_logic = '''
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
'''
code = re.sub(r"    function endGame\(isWin, title, optDist, descText\) \{[\s\S]*?        \}\n    \}", end_game_logic, code, 1)

# 10. nextLevel logic
next_level_logic = '''
    function nextLevel() {
        if (state.stack >= 3) {
            state.level++;
            state.stack -= 3;
        }
        updateStackUI();
        
        if (state.gameMode === 'versus' && !state.isHost) {
'''
code = code.replace('''    function nextLevel() {
        state.level++;
        if (state.gameMode === 'versus' && !state.isHost) {''', next_level_logic, 1)

# 11. Initial stack UI call in init
init_stack = '''
        ui.bestScore.textContent = state.bestScore;
        if(ui.stack) updateStackUI();
'''
code = code.replace("        ui.bestScore.textContent = state.bestScore;", init_stack, 1)

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(code)
print("Patched app.js successfully")
