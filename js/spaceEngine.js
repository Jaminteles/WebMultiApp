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

    // vida do player
    const PLAYER_MAX_LIFE = 3;
    let playerLife = PLAYER_MAX_LIFE;
    let playerInvulnerable = false;
    const PLAYER_INVUL_MS = 1200; // invulnerabilidade após hit (ms)

    // Sistema de teclas pressionadas
    const keysPressed = {};

    // --- PRELOAD EXPLOSION SPRITE ---
    const explosionSprite = {
        src: "../images/space/effects/sprExplosion_enemy1.png",
        img: null,
        frames: 0,
        fw: 0,
        fh: 0,
        loaded: false
    };

    // ===== SISTEMA DE DIFICULDADE =====
    let difficulty = "normal"; // easy / normal / hard / insane

    const difficultyConfig = {
        easy: {
            enemySpawnRateMin: 1500,
            enemySpawnRateMax: 2400,
            gravity: 0.35,
            terminalVy: 3,
            cannonPickupChance: 0.45,
        },

        normal: {
            enemySpawnRateMin: 1000,
            enemySpawnRateMax: 1800,
            gravity: 0.45,
            terminalVy: 4,
            cannonPickupChance: 0.30,
        },

        hard: {
            enemySpawnRateMin: 800,
            enemySpawnRateMax: 1400,
            gravity: 0.55,
            terminalVy: 5,
            cannonPickupChance: 0.20,
        },

        insane: {
            enemySpawnRateMin: 550,
            enemySpawnRateMax: 900,
            gravity: 0.75,
            terminalVy: 6,
            cannonPickupChance: 0.10,
        }
    };

    // ---- SISTEMA DE ARMAS ----
    let currentWeapon = "default";
    const weaponConfig = {
        default: {
            cooldown: 220,
            projectileSprite: null,
            multiShot: false,
            offset: [{ x: -9, y: 0 }]
        },
        cannon: {
            cooldown: 140,
            projectileSprite: "../images/space/effects/projectiles/projectile_autoCannon.png",
            multiShot: true,
            offset: [
                { x: -25, y: 18 }, // cano esquerdo
                { x: 10, y: 18 } // cano direito
            ]
        }
    };

    // ---- SPRITE ANIMADA DO PICKUP ----
    const pickupCannonSprite = {
        src: "../images/space/pickups/pickupCannon.png",
        img: null,
        frames: 15, // 720 / 48
        fw: 48,
        fh: 48,
        loaded: true
    };

    // ---- SPRITE ANIMADA DO PROJETIL ----
    const cannonProjectileSprite = {
        src: "../images/space/effects/projectiles/projectile_autoCannon.png",
        img: null,
        frames: 4, // 72 / 18
        fw: 18,
        fh: 18,
        loaded: true
    };

    function animateSprite($el, sprite, speedMs = 80, removeOnEnd = false) {
        let frame = 0;
        const iv = setInterval(() => {
            const posX = -frame * sprite.fw;
            $el.css("background-position", posX + "px 0px");
            frame++;
            if (frame >= sprite.frames) {
                if (removeOnEnd) {
                    $el.remove();
                    clearInterval(iv);
                    return;
                }
                frame = 0; // loop
            }
        }, speedMs);
        return iv;
    }


    (function preloadExplosion() {
        const img = new Image();
        img.src = explosionSprite.src;
        img.onload = () => {
            explosionSprite.img = img;
            explosionSprite.fh = img.height;
            // assume sprite strip with square frames: frames = width / height
            explosionSprite.frames = Math.max(1, Math.round(img.width / img.height));
            explosionSprite.fw = Math.round(img.width / explosionSprite.frames);
            explosionSprite.loaded = true;
        };
        img.onerror = () => { explosionSprite.loaded = false; };
    })();

    // cria explosão animada na posição (px, py) - px,py em coordenadas do gameArea
    function spawnExplosion(px, py) {
        const el = $("<div/>").addClass("explosion").css({
            left: (px) + "px",
            top: (py) + "px",
            position: "absolute",
            "pointer-events": "none",
            "z-index": 120
        });

        gameArea.append(el);

        if (!explosionSprite.loaded) {
            // fallback: mostrar imagem inteira e remover rápido
            el.css({
                width: 64 + "px",
                height: 64 + "px",
                "background-image": `url("${explosionSprite.src}")`,
                "background-size": "contain",
                "background-repeat": "no-repeat",
                "background-position": "center"
            });
            setTimeout(() => el.remove(), 600);
            return;
        }

        const frames = explosionSprite.frames;
        const fw = explosionSprite.fw;
        const fh = explosionSprite.fh;

        el.css({
            width: fw + "px",
            height: fh + "px",
            "background-image": `url("${explosionSprite.src}")`,
            "background-repeat": "no-repeat",
            "background-position": "0px 0px"
        });

        let fi = 0;
        const stepMs = 60; // velocidade do frame (ajuste conforme necessário)
        const iv = setInterval(() => {
            if (fi >= frames) {
                clearInterval(iv);
                el.remove();
                return;
            }
            const posX = -fi * fw;
            el.css("background-position", posX + "px 0px");
            fi++;
        }, stepMs);
    }

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

                // Se for o player, adiciona classe de imagem e aplica sprite inicial
                if (id === "player") {
                    $obj.addClass("player-ship");
                    // remove o fundo colorido e força sprite inicial para 3 vidas
                    $obj.css({
                        "background": "none",
                        "background-image": 'url("../images/space/player/spaceShip_3Life.png")',
                        "background-size": "contain",
                        "background-repeat": "no-repeat",
                        "background-position": "center",
                        "z-index": 50
                    });
                    // Cria o sprite do canhão (fica separado)
                    const cannonEl = $("<div/>").attr("id", "playerCannon").css({
                        position: "absolute",
                        width: "70px",
                        height: "70px",
                        left: el.getAttribute("x") + "px",
                        top: el.getAttribute("y") + "px",
                        "pointer-events": "none",
                        "background-image": "none",
                        "background-size": "contain",
                        "background-repeat": "no-repeat",
                        "z-index": 40 // fica atrás da nave
                    });
                    gameArea.append(cannonEl);
                    components["playerCannon"] = cannonEl;
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

                // se for scoreText, exibir também vidas
                if (id === "scoreText") {
                    $obj.text("Score: 0");
                }
            }

            $obj.attr("id", id);
            gameArea.append($obj);
            components[id] = $obj;
        }
    }

    function parseActions(xml) {
        const acts = xml.getElementsByTagName("action");

        for (let a of acts) {
            // Não bind de tecla aqui — input tratado por setupKeyListeners()
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
        const pw = parseInt(player.css("width")) || 70;
        x = Math.max(0, Math.min(GAME_W - pw, x));
        player.css("left", x + "px");
    }

    // ----- TIRO -----
    function shoot() {
        const weapon = weaponConfig[currentWeapon];
        const player = components["player"];
        if (!player) return;

        const px = parseInt(player.css("left"));
        const py = parseInt(player.css("top"));
        const pw = parseInt(player.css("width"));

        weapon.offset.forEach(pt => {
            const bx = px + pw / 2 + pt.x;
            const by = py + pt.y;

            const bgSizeW = cannonProjectileSprite.fw * cannonProjectileSprite.frames;
            const bgSizeH = cannonProjectileSprite.fh;

            const bulletEl = $("<div/>").addClass("bullet").css({
                left: bx + "px",
                top: by + "px",
                width: cannonProjectileSprite.fw + "px",
                height: cannonProjectileSprite.fh + "px",
                position: "absolute",
                // usa 'background' (shorthand) para sobrescrever qualquer background definido em CSS
                "background": `url("${cannonProjectileSprite.src}") no-repeat 0 0 / ${bgSizeW}px ${bgSizeH}px`,
                "pointer-events": "none"
            });

            const bulletObj = {
                el: bulletEl,
                x: bx,
                y: by,
                w: cannonProjectileSprite.fw,
                h: cannonProjectileSprite.fh,
                vy: -BULLET_SPEED,
                anim: animateSprite(bulletEl, cannonProjectileSprite, 55)
            };

            bullets.push(bulletObj);
            gameArea.append(bulletEl);
        });
    }

    // atualiza sprite do player baseado nas vidas atuais
    function updatePlayerSprite() {
        const p = components["player"];
        if (!p) return;
        const imgMap = {
            3: '../images/space/player/spaceShip_3Life.png',
            2: '../images/space/player/spaceShip_2Life.png',
            1: '../images/space/player/spaceShip_1Life.png'
        };
        const url = imgMap[Math.max(1, Math.min(3, playerLife))];
        p.css("background-image", 'url("' + url + '")');
    }

    let blinkInterval = null;

    function setPlayerInvulnerable(state) {
        playerInvulnerable = !!state;
        const p = components["player"];
        if (!p) return;

        // parar piscada antiga se existir
        if (blinkInterval) {
            clearInterval(blinkInterval);
            blinkInterval = null;
        }

        if (playerInvulnerable) {

            // inicia piscamento a cada 120ms
            blinkInterval = setInterval(() => {
                const current = p.css("opacity");
                p.css("opacity", current === "1" ? "0.2" : "1");
            }, 120);

        } else {
            // desativa piscar e restaura opacidade
            p.css("opacity", "1");
        }
    }

    function damagePlayer(amount = 1) {
        if (playerInvulnerable) return;
        playerLife -= amount;
        if (playerLife < 0) playerLife = 0;
        updatePlayerSprite();

        // efeito de invulnerabilidade curto
        setPlayerInvulnerable(true);
        setTimeout(() => setPlayerInvulnerable(false), PLAYER_INVUL_MS);

        if (components["scoreText"]) {
            components["scoreText"].text("Score: " + score);
        } else {
            updateInfo();
        }

        if (playerLife <= 0) {
            // game over
            clearInterval(spawnInterval);
            clearInterval(gameLoop);
            updateInfo("Game Over! Score: " + score);
            const p = components["player"];
            if (p) p.remove();
        }
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

    function spawnCannonPickup() {
        const size = 48;
        const x = Math.random() * (GAME_W - size);
        const y = -60;

        const el = $("<div/>").addClass("pickupCannon").css({
            width: size + "px",
            height: size + "px",
            left: x + "px",
            top: y + "px",
            position: "absolute",
            "background-image": `url("${pickupCannonSprite.src}")`,
            "background-size": (pickupCannonSprite.fw * pickupCannonSprite.frames) + "px " + size + "px",
            "background-repeat": "no-repeat",
            "background-position": "0px 0px",
            "pointer-events": "none",
            "z-index": 30
        });

        gameArea.append(el);

        const obj = {
            el,
            x,
            y,
            w: size,
            h: size,
            anim: animateSprite(el, pickupCannonSprite, 70)
        };

        cannonPickups.push(obj);
    }


    let cannonPickups = [];

    function equipCannon() {
        currentWeapon = "cannon";

        // NÃO altera a sprite principal do jogador (evita duplicar/ocultar)
        // apenas exibe o sprite do canhão por baixo (playerCannon)
        if (components["playerCannon"]) {
            components["playerCannon"].css("background-image",
                'url("../images/space/player/pickupsPlayer/spaceShip_Cannon.png")');
        }

        // temporário (30s) ou infinito — você escolhe
        setTimeout(() => {
            if (currentWeapon === "cannon") {
                currentWeapon = "default";
                // restaura apenas o canhão (esconde-o)
                if (components["playerCannon"]) components["playerCannon"].css("background-image", "none");
                // garante sprite principal volta a mostrar 3 vidas (se necessário)
                if (components["player"]) components["player"].css("background-image",
                    'url("../images/space/player/spaceShip_3Life.png")');
            }
        }, 30000);
    }

    // ----- GAME LOOP -----
    function startGame() {
        const cfg = difficultyConfig[difficulty];

        function startEnemySpawner() {
            const delay = Math.floor(
                cfg.enemySpawnRateMin + Math.random() * (cfg.enemySpawnRateMax - cfg.enemySpawnRateMin)
            );
            spawnInterval = setTimeout(() => {
                spawnEnemy();
                startEnemySpawner();
            }, delay);
        }

        startEnemySpawner();
        setInterval(() => {
            const cfg = difficultyConfig[difficulty];

            if (Math.random() < cfg.cannonPickupChance)
                spawnCannonPickup();
        }, 6000);

        gameLoop = setInterval(() => {
            // Atualizar movimento do player continuamente
            if (keysPressed["ArrowLeft"]) {
                movePlayer(-PLAYER_SPEED);
            }
            if (keysPressed["ArrowRight"]) {
                movePlayer(PLAYER_SPEED);
            }

            // seguir o player
            if (components["playerCannon"]) {
                const p = components["player"];
                const pc = components["playerCannon"];
                const x = parseInt(p.css("left"));
                const y = parseInt(p.css("top"));
                pc.css({ left: x + "px", top: (y + 20) + "px" });
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

                const cfg = difficultyConfig[difficulty];

                e.vy += cfg.gravity;
                if (e.vy > cfg.terminalVy) e.vy = cfg.terminalVy;

                e.y += e.vy;

                if (e.y > GAME_H + 50) {
                    e.el.remove();
                    enemies.splice(i, 1);
                    continue;
                }

                e.el.css({ left: Math.round(e.x) + "px", top: Math.round(e.y) + "px" });
            }

            // checar colisão inimigo <-> player (usa posições DOM reais)
            const player = components["player"];
            if (player) {
                const pPos = player.position();
                const px = pPos.left;
                const py = pPos.top;
                const pw = parseInt(player.css("width")) || 70;
                const ph = parseInt(player.css("height")) || 70;

                for (let ei = enemies.length - 1; ei >= 0; ei--) {
                    const e = enemies[ei];
                    const ePos = e.el.position();
                    if (rectsIntersect(px, py, pw, ph, ePos.left, ePos.top, e.w, e.h)) {

                        // calcula posição centralizada para a explosão (ajusta visual)
                        const expX = Math.round(ePos.left + e.w / 2 - (explosionSprite.fw || 32) / 2);
                        const expY = Math.round(ePos.top + e.h / 2 - (explosionSprite.fh || 32) / 2);

                        // chama a explosão
                        spawnExplosion(expX, expY);

                        // dano ao player e remove inimigo
                        damagePlayer(1);
                        e.el.remove();
                        enemies.splice(ei, 1);
                    }
                }
            }

            // pickup do canhão
            for (let i = cannonPickups.length - 1; i >= 0; i--) {
                const p = cannonPickups[i];
                p.y += 2;
                p.el.css("top", p.y + "px");

                // colisão player ↔ pickup
                const player = components["player"];
                const pp = player.position();
                if (rectsIntersect(pp.left, pp.top, 70, 70, p.x, p.y, p.w, p.h)) {

                    // 🔥 PARA A ANIMAÇÃO ANTES DE REMOVER
                    if (p.anim) clearInterval(p.anim);

                    p.el.remove();
                    cannonPickups.splice(i, 1);
                    equipCannon();
                    updatePlayerSprite();
                    continue;
                }

                // sai da tela
                if (p.y > GAME_H + 40) {
                    // PARA A ANIMAÇÃO ANTES DE REMOVER
                    if (p.anim) clearInterval(p.anim);

                    p.el.remove();
                    cannonPickups.splice(i, 1);
                    continue;
                }
            }
            checkCollisions();
            updatePlayerSprite();

        }, TICK_MS);
    }

    // ----- COLISÕES -----
    function rectsIntersect(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    function checkCollisions() {
        for (let bi = bullets.length - 1; bi >= 0; bi--) {
            const b = bullets[bi];
            const bPos = b.el.position();
            const bx = bPos.left;
            const by = bPos.top;
            let hit = false;

            for (let ei = enemies.length - 1; ei >= 0; ei--) {
                const e = enemies[ei];
                const ePos = e.el.position();
                if (rectsIntersect(bx, by, b.w, b.h, ePos.left, ePos.top, e.w, e.h)) {
                    // calcula posição centralizada para a explosão (ajusta visual)
                    const expX = Math.round(ePos.left + e.w / 2 - (explosionSprite.fw || 32) / 2);
                    const expY = Math.round(ePos.top + e.h / 2 - (explosionSprite.fh || 32) / 2);

                    // chama a explosão
                    spawnExplosion(expX, expY);
                    if (b.anim) clearInterval(b.anim);

                    b.el.remove();
                    e.el.remove();

                    bullets.splice(bi, 1);
                    enemies.splice(ei, 1);

                    score += 10;
                    if (components["scoreText"]) components["scoreText"].text("Score: " + score);
                    if (score >= 200 && difficulty === "normal") difficulty = "hard";
                    if (score >= 500 && difficulty === "hard") difficulty = "insane";

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