$(document).ready(() => {
    const gameArea = $("#gameArea");
    const info = $("#info");

    const GAME_W = gameArea.width();
    const GAME_H = gameArea.height();

    let components = {};
    let score = 0;

    let bullets = [];
    let enemies = [];

    let spawnInterval;
    let gameLoop;

    const BULLET_SPEED = 15; // px per tick (sobe)
    const ENEMY_INITIAL_VY = 0; // inicial
    const GRAVITY = 0.45; // aceleração por tick (gravidade)
    const ENEMY_TERMINAL_VY = 4; // velocidade máxima de queda
    const TICK_MS = 30;
    const PLAYER_SPEED = 8; // velocidade contínua do player

    const SHOOT_COOLDOWN_MS = 220; // intervalo entre tiros quando segurando SPACE
    let lastShotAt = 0;

    // Sistema de teclas pressionadas
    const keysPressed = {};

    function updateInfo(t) { info.text(t); }

    function loadXML() {
        fetch("../space.xml")
            .then(r => r.text())
            .then(str => new DOMParser().parseFromString(str, "text/xml"))
            .then(xml => {
                updateInfo("Pressione ← → para mover e ESPAÇO para atirar");
                parseComponents(xml);
                parseActions(xml);
                setupKeyListeners();
                startGame();
            })
            .catch(err => updateInfo("Erro ao carregar XML: " + err));
    }

    function parseComponents(xml) {
        const list = xml.getElementsByTagName("component");
        for (let el of list) {
            const id = el.getAttribute("id");
            const type = el.getAttribute("type");

            let $obj;

            if (type === "rectangle") {
                $obj = $("<div/>").addClass("g-entity").css({
                    left: el.getAttribute("x") + "px",
                    top: el.getAttribute("y") + "px",
                    width: el.getAttribute("width") + "px",
                    height: el.getAttribute("height") + "px",
                    background: el.getAttribute("color")
                });

                // Se for o player, adiciona classe de imagem
                if (id === "player") {
                    $obj.addClass("player-ship");
                    $obj.css("background", "");
                }
            }

            if (type === "text") {
                $obj = $("<div/>").addClass("g-entity").css({
                    left: el.getAttribute("x") + "px",
                    top: el.getAttribute("y") + "px",
                    color: "#fff",
                    fontSize: "20px",
                    fontWeight: "bold"
                }).text(el.getAttribute("text"));
            }

            $obj.attr("id", id);
            gameArea.append($obj);
            components[id] = $obj;
        }
    }

    function parseActions(xml) {
        const acts = xml.getElementsByTagName("action");

        for (let a of acts) {
            const trigger = a.getAttribute("trigger");
            const key = a.getAttribute("key");
            const target = a.getAttribute("target");
            const effect = a.getAttribute("effect");

            // Removido: não mais fazer binding de keydown aqui
            // Tudo é tratado via setupKeyListeners() + keysPressed
        }
    }

    // ----- SISTEMA DE TECLAS -----
    function setupKeyListeners() {
        $(document).on("keydown.spaceengine", ev => {
            const key = ev.code || ev.key;
            keysPressed[key] = true;
        });

        $(document).on("keyup.spaceengine", ev => {
            const key = ev.code || ev.key;
            keysPressed[key] = false;
        });
    }

    function anyOtherKeyPressedBesidesSpace() {
        // considera possíveis nomes do espaço para compatibilidade
        const spaceNames = new Set(['Space', ' ', 'Spacebar']);
        const arrowKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

        for (let k in keysPressed) {
            if (!keysPressed[k]) continue;
            // ignora espaço e setas - permite atirar + mover ao mesmo tempo
            if (!spaceNames.has(k) && !arrowKeys.has(k)) return true;
        }
        return false;
    }

    function movePlayer(dx) {
        const player = components["player"];
        if (!player) return;
        let x = parseInt(player.css("left")) || 0;
        x += dx;
        const pw = parseInt(player.css("width")) || 60;
        x = Math.max(0, Math.min(GAME_W - pw, x));
        player.css("left", x + "px");
    }

    // ----- TIRO -----
    function shoot() {
        const player = components["player"];
        if (!player) return;

        const pw = parseInt(player.css("width")) || 60;
        const ph = parseInt(player.css("height")) || 40;

        const px = parseInt(player.css("left")) + Math.floor(pw / 2) - 3;
        const py = parseInt(player.css("top")) - 10;

        const bulletEl = $("<div/>").addClass("bullet").css({
            left: px + "px",
            top: py + "px",
            width: "6px",
            height: "18px",
            position: "absolute"
        });

        const bulletObj = {
            el: bulletEl,
            x: px,
            y: py,
            w: 6,
            h: 18,
            vy: -BULLET_SPEED
        };

        bullets.push(bulletObj);
        gameArea.append(bulletEl);
    }

    // ----- INIMIGOS -----
    function spawnEnemy() {
        const ENEMY_W = 64;
        const ENEMY_H = 64;

        const x = Math.floor(Math.random() * Math.max(1, GAME_W - ENEMY_W));
        const y = -(ENEMY_H + Math.floor(Math.random() * 40));

        const enemyEl = $("<div/>").addClass("enemy").css({
            left: x + "px",
            top: y + "px",
            width: ENEMY_W + "px",
            height: ENEMY_H + "px",
            position: "absolute"
        });

        const enemyObj = {
            el: enemyEl,
            x: x,
            y: y,
            w: ENEMY_W,
            h: ENEMY_H,
            vy: ENEMY_INITIAL_VY
        };

        enemies.push(enemyObj);
        gameArea.append(enemyEl);
    }

    // ----- GAME LOOP -----
    function startGame() {
        spawnInterval = setInterval(spawnEnemy, 1000 + Math.floor(Math.random() * 800));

        gameLoop = setInterval(() => {
            // Atualizar movimento do player continuamente
            if (keysPressed["ArrowLeft"]) {
                movePlayer(-PLAYER_SPEED);
            }
            if (keysPressed["ArrowRight"]) {
                movePlayer(PLAYER_SPEED);
            }

            // Controle de tiro com cooldown:
            const now = Date.now();
            const spacePressed = !!(keysPressed["Space"] || keysPressed[" "] || keysPressed["Spacebar"]);
            if (spacePressed && !anyOtherKeyPressedBesidesSpace()) {
                if (now - lastShotAt >= SHOOT_COOLDOWN_MS) {
                    shoot();
                    lastShotAt = now;
                }
            }

            // atualizar bullets
            for (let i = bullets.length - 1; i >= 0; i--) {
                const b = bullets[i];
                b.y += b.vy;
                if (b.y + b.h < -10) {
                    b.el.remove();
                    bullets.splice(i, 1);
                    continue;
                }
                b.el.css({ left: b.x + "px", top: b.y + "px" });
            }

            // atualizar enemies com gravidade
            for (let i = enemies.length - 1; i >= 0; i--) {
                const e = enemies[i];
                e.vy += GRAVITY;
                if (e.vy > ENEMY_TERMINAL_VY) e.vy = ENEMY_TERMINAL_VY;
                e.y += e.vy;

                if (e.y > GAME_H + 50) {
                    e.el.remove();
                    enemies.splice(i, 1);
                    continue;
                }

                e.el.css({ left: Math.round(e.x) + "px", top: Math.round(e.y) + "px" });
            }

            checkCollisions();

        }, TICK_MS);
    }

    // ----- COLISÕES -----
    function rectsIntersect(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    function checkCollisions() {
        for (let bi = bullets.length - 1; bi >= 0; bi--) {
            const b = bullets[bi];
            let hit = false;

            for (let ei = enemies.length - 1; ei >= 0; ei--) {
                const e = enemies[ei];
                if (rectsIntersect(b.x, b.y, b.w, b.h, e.x, e.y, e.w, e.h)) {
                    b.el.remove();
                    e.el.remove();

                    bullets.splice(bi, 1);
                    enemies.splice(ei, 1);

                    score += 10;
                    if (components["scoreText"]) components["scoreText"].text("Score: " + score);

                    hit = true;
                    break;
                }
            }

            if (hit) continue;
        }
    }

    $(window).on("beforeunload", () => {
        clearInterval(spawnInterval);
        clearInterval(gameLoop);
    });

    loadXML();
});