import re

with open('app.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Remove multiplayer state
multi_state = r"""        // Multi mode & PeerJS
        gameMode: 'normal',
        peer: null,
        conn: null,
        roomId: null,
        isHost: false,
        opponentRoute: \[\],
        opponentFinished: false,
        opponentDist: 0,
        guestReady: false"""

new_multi_state = """        // Game Mode
        gameMode: 'normal'"""
code = re.sub(multi_state, new_multi_state, code)

# 2. Remove multiplayer UI elements from `ui` object
ui_multi = r"""        // Multiplayer
        modeRadios: document\.getElementsByName\('gameMode'\),
        multiSetup: document\.getElementById\('multiplayerSetup'\),
        btnCreateRoom: document\.getElementById\('createRoomBtn'\),
        btnJoinRoom: document\.getElementById\('joinRoomBtn'\),
        joinCodeInput: document\.getElementById\('joinCodeInput'\),
        multiStatus: document\.getElementById\('multiStatusText'\)"""
new_ui_multi = """        modeRadios: document.getElementsByName('gameMode')"""
code = re.sub(ui_multi, new_ui_multi, code)

# 3. Simplify btnStart click and mode selection
btn_start = r"""        ui\.btnStart\.addEventListener\('click', \(\) => \{
            sound\.initBGM\(\); // 첫 클릭 시 BGM 재생
            if \(state\.gameMode === 'versus' && !state\.conn\) \{
                alert\("대결 모드에서는 방을 만들거나 접속해야 시작할 수 있습니다!"\);
                return;
            \}
            if \(state\.gameMode === 'versus' && !state\.isHost\) \{
                alert\("방장이 게임을 시작할 때까지 기다려주세요\."\);
                return;
            \}
            if \(state\.gameMode === 'versus' && state\.isHost && !state\.guestReady\) \{
                alert\("참가자가 아직 준비되지 않았습니다\. 조금만 기다려주세요\."\);
                return;
            \}
            startLevel\(true\);
        \}\);"""

new_btn_start = """        ui.btnStart.addEventListener('click', () => {
            sound.initBGM(); // 첫 클릭 시 BGM 재생
            startLevel(true);
        });"""
code = re.sub(btn_start, new_btn_start, code)

mode_sel = r"""                if \(state\.gameMode === 'versus'\) \{
                    ui\.multiSetup\.classList\.remove\('hidden'\);
                \} else \{
                    ui\.multiSetup\.classList\.add\('hidden'\);
                \}"""
code = re.sub(mode_sel, "", code)

# Remove initHost, initGuest, setupConnection
peerjs_block = r"""        ui\.btnCreateRoom\.addEventListener\('click', initHost\);
        ui\.btnJoinRoom\.addEventListener\('click', initGuest\);[\s\S]*?    // ===== GAME LOOP ====="""
code = re.sub(peerjs_block, "    // ===== GAME LOOP =====", code)


# 4. Modify startLevel (generate nodes / matrix / special roads)
start_level_replace = r"""        if \(shouldGenerate\) \{
            state\.numNodes = Math\.min\(3 \+ state\.level, 8\); 
            generateNodes\(\);
            generateMatrix\(\);
            if \(state\.gameMode === 'timeattack'\) \{
                spawnSpecialRoads\(\);
            \}
            
            // 호스트일 경우, 맵 생성 직후 게스트에게 전송
            if \(state\.gameMode === 'versus' && state\.isHost && state\.conn\) \{
                state\.conn\.send\(\{ 
                    type: 'start_game', 
                    nodes: state\.nodes, 
                    adjMatrix: state\.adjMatrix, 
                    numNodes: state\.numNodes, 
                    level: state\.level 
                \}\);
            \}
        \} else \{"""

new_start_level = """        if (shouldGenerate) {
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
        } else {"""
code = re.sub(start_level_replace, new_start_level, code)

# 5. Modify generateMatrix for Chaos Mode
gen_matrix_replace = r"""                    const dx = state\.nodes\[i\]\.x - state\.nodes\[j\]\.x;
                    const dy = state\.nodes\[i\]\.y - state\.nodes\[j\]\.y;
                    const dist = parseFloat\(\(Math\.sqrt\(dx\*dx \+ dy\*dy\) \* 20\)\.toFixed\(1\)\);
                    state\.adjMatrix\[i\]\[j\] = dist;"""

new_gen_matrix = """                    const dx = state.nodes[i].x - state.nodes[j].x;
                    const dy = state.nodes[i].y - state.nodes[j].y;
                    let dist = parseFloat((Math.sqrt(dx*dx + dy*dy) * 20).toFixed(1));
                    if (state.gameMode === 'chaos') {
                        // 완전히 무작위 운빨 가중치 (거리와 무관)
                        let multiplier = 0.2 + Math.random() * 2.8; 
                        dist = parseFloat((dist * multiplier).toFixed(1));
                    }
                    state.adjMatrix[i][j] = dist;"""
code = re.sub(gen_matrix_replace, new_gen_matrix, code)

# 6. Modify renderMatrixHTML for Chaos Mode
render_matrix_replace = r"""                    html \+= `<td id="cell-\$\{i\}-\$\{j\}">\$\{state\.adjMatrix\[i\]\[j\]\.toFixed\(1\)\}<\/td>`;"""
new_render_matrix = """                    if (state.gameMode === 'chaos') {
                        html += `<td id="cell-${i}-${j}" style="color: #a78bfa; font-weight: bold; text-shadow: 0 0 5px #a78bfa;">???</td>`;
                    } else {
                        html += `<td id="cell-${i}-${j}">${state.adjMatrix[i][j].toFixed(1)}</td>`;
                    }"""
code = re.sub(render_matrix_replace, new_render_matrix, code)

# 7. CheckVersusEnd 제거, checkWin에서 versus 로직 제거, updateRouteUI에서 conn.send 제거
checkwin_replace = r"""        const optDist = findOptimalRoute\(\);
        
        if \(state\.gameMode === 'versus'\) \{
            state\.conn\.send\(\{ type: 'finish', dist: myDist \}\);
            state\.isGameOver = true;
            checkVersusEnd\(\);
            return;
        \}
        
        state\.isGameOver = true;"""
new_checkwin = """        const optDist = findOptimalRoute();
        state.isGameOver = true;"""
code = re.sub(checkwin_replace, new_checkwin, code)

# Remove checkVersusEnd function completely
checkversusend_block = r"""    function checkVersusEnd\(\) \{[\s\S]*?    function updateStackUI\(\) \{"""
code = re.sub(checkversusend_block, "    function updateStackUI() {", code)

# 8. Remove connection route update
conn_route = r"""        if \(state\.gameMode === 'versus' && state\.conn\) \{
            state\.conn\.send\(\{ type: 'route_update', route: state\.myRoute \}\);
        \}"""
code = re.sub(conn_route, "", code)

# 9. Fix nextLevel and resetGame versus blocks
nextlevel_replace = r"""        if \(state\.gameMode === 'versus' && !state\.isHost\) \{
            ui\.gameOverlay\.classList\.add\('hidden'\);
            ui\.startOverlay\.classList\.remove\('hidden'\);
            ui\.multiStatus\.textContent = "방장의 다음 라운드 시작을 기다립니다\.\.\.";
        \} else \{
            startLevel\(true\);
        \}"""
code = re.sub(nextlevel_replace, "        startLevel(true);", code)

resetgame_replace = r"""        if \(state\.gameMode === 'versus' && !state\.isHost\) \{
            ui\.gameOverlay\.classList\.add\('hidden'\);
            ui\.startOverlay\.classList\.remove\('hidden'\);
            ui\.multiStatus\.textContent = "방장의 시작을 기다립니다\.\.\.";
        \} else \{
            startLevel\(true\);
        \}"""
code = re.sub(resetgame_replace, "        startLevel(true);", code)

# 10. DrawMap - remove ghost route
ghost_route = r"""        // 상대방 경로 \(고스트\)
        if \(state\.opponentRoute && state\.opponentRoute\.length > 1\) \{
            ctx\.beginPath\(\);
            ctx\.strokeStyle = 'rgba\(16, 185, 129, 0\.3\)'; // Green transparent
            ctx\.lineWidth = 6;
            for \(let i = 0; i < state\.opponentRoute\.length - 1; i\+\+\) \{
                const from = state\.nodes\[state\.opponentRoute\[i\]\];
                const to = state\.nodes\[state\.opponentRoute\[i\+1\]\];
                if\(!from \|\| !to\) continue;
                ctx\.moveTo\(from\.x \* w, from\.y \* h\);
                ctx\.lineTo\(to\.x \* w, to\.y \* h\);
            \}
            ctx\.stroke\(\);
        \}"""
code = re.sub(ghost_route, "", code)

# Write output
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("Patch applied to app.js")
