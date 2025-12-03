/**
 * spaceEngine.js
 * Motor do jogo "Space Shooter" — carregamento do XML, parse dos componentes,
 * sistema de entrada, spawn de inimigos/pickups, armas, projéteis, colisões e UI.
 *
 * Mantive toda a lógica original, reorganizei, padronizei nomes e incluí JSDoc.
 *
 * Referência original: spaceEngine.js fornecido pelo usuário. :contentReference[oaicite:3]{index=3}
 */

$(document).ready(() => {
    // ---------- Constantes de UI e loop ----------
    const gameArea = $("#gameArea");
    const info = $("#info");

    const GAME_W = gameArea.width();
    const GAME_H = gameArea.height();

    // ---------- Estado global ----------
    /** @type {Object.<string, JQuery>} Componentes carregados do XML */
    let components = {};

    /** @type {number} Pontuação atual */
    let score = 0;

    /** @type {Array<Object>} Projetéis ativos */
    let bullets = [];

    /** @type {Array<Object>} Inimigos ativos */
    let enemies = [];

    /** @type {number|null} Timeout/Interval responsável por spawn de inimigos */
    let spawnInterval;

    /** @type {number|null} Interval do loop principal */
    let gameLoop;

    const BULLET_SPEED = 15;
    const ENEMY_INITIAL_VY = 0;
    const TICK_MS = 30;

    // velocidade do player (ajustada por engine boost)
    let PLAYER_SPEED = 8;

    // offsets para posicionamento de sprites que acompanham a nave
    const PLAYER_CANNON_OFFSET = { x: 0, y: 20 };
    const PLAYER_ENGINE_OFFSET = { x: 0, y: 5 };

    // cooldown de tiro (ms)
    const SHOOT_COOLDOWN_MS = 220;
    let lastShotAt = 0;

    // vida do player
    const PLAYER_MAX_LIFE = 3;
    let playerLife = PLAYER_MAX_LIFE;

    // invulnerabilidade após hit
    let playerInvulnerable = false;
    const PLAYER_INVUL_MS = 1200;

    // registra teclas pressionadas
    const keysPressed = {};

    // ---------- Sprites / Assets (pré-configuração) ----------
    const explosionSprite = {
        src: "../images/space/effects/sprExplosion_enemy1.png",
        img: null,
        frames: 0,
        fw: 0,
        fh: 0,
        loaded: false
    };

    // configuração de dificuldade (parâmetros por nível)
    let difficulty = "normal";
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

    // ---- Sistema de armas ----
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
                { x: -25, y: 18 },
                { x: 10, y: 18 }
            ]
        }
    };

    // ---- Sprites animados de pickups / projetéis ----
    const pickupEngineSprite = {
        src: "../images/space/pickups/pickpup_engineLaser.png",
        img: null,
        frames: 15,
        fw: 48,
        fh: 48,
        loaded: true
    };

    const pickupCannonSprite = {
        src: "../images/space/pickups/pickupCannon.png",
        img: null,
        frames: 15,
        fw: 48,
        fh: 48,
        loaded: true
    };

    let engineBoost = false;
    let engineBoostEndAt = 0;

    const cannonProjectileSprite = {
        src: "../images/space/effects/projectiles/projectile_autoCannon.png",
        img: null,
        frames: 4,
        fw: 18,
        fh: 18,
        loaded: true
    };

    /**
     * Equip a engine boost: aumenta a velocidade do jogador por um período e aplica sprite do motor.
     * Duração: 25s
     */
    function equipEngineBoost() {
        engineBoost = true;
        engineBoostEndAt = Date.now() + 25000;

        if (components["playerEngine"]) {
            components["playerEngine"].css("background-image",
                'url("../images/space/player/pickupsPlayer/spaceShip_engineLaser.png")');
        }
    }

    /**
     * Anima um elemento usando spritesheet.
     * @param {JQuery} $el Elemento jQuery a animar.
     * @param {Object} sprite Config do sprite: {frames, fw, fh, src}
     * @param {number} [speedMs=80] Intervalo entre frames (ms)
     * @param {boolean} [removeOnEnd=false] Se verdadeiro remove elemento ao terminar (quando não looping).
     * @returns {number} ID do interval criado, para poder limpar.
     */
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
                frame = 0;
            }
        }, speedMs);
        return iv;
    }

    // ---------- Preload sprites (explosão) ----------
    (function preloadExplosion() {
        const img = new Image();
        img.src = explosionSprite.src;
        img.onload = () => {
            explosionSprite.img = img;
            explosionSprite.fh = img.height;
            explosionSprite.frames = Math.max(1, Math.round(img.width / img.height));
            explosionSprite.fw = Math.round(img.width / explosionSprite.frames);
            explosionSprite.loaded = true;
        };
        img.onerror = () => { explosionSprite.loaded = false; };
    })();

    /**
     * Cria uma explosão animada em px,py relativos ao gameArea.
     * @param {number} px Coordenada X (px)
     * @param {number} py Coordenada Y (px)
     */
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
        const stepMs = 60;
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

    /**
     * Atualiza texto informativo.
     * @param {string} t Texto para exibir.
     */
    function updateInfo(t) {
        info.text(t);
    }

    // ---------- Carregamento do XML ----------

    /**
     * Carrega space.xml, parseia componentes e inicia o jogo.
     */
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

    /**
     * Cria elementos DOM para cada <component> do XML.
     * Cria também playerCannon e playerEngine para exibir pickups por baixo/atrás.
     * @param {Document} xml Document XML parseado.
     */
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

                if (id === "player") {
                    $obj.addClass("player-ship");
                    $obj.css({
                        "background": "none",
                        "background-image": 'url("../images/space/player/spaceShip_3Life.png")',
                        "background-size": "contain",
                        "background-repeat": "no-repeat",
                        "background-position": "center",
                        "z-index": 50
                    });

                    // canhão (fica por baixo da nave)
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
                        "z-index": 40
                    });
                    gameArea.append(cannonEl);
                    components["playerCannon"] = cannonEl;

                    // motor (engine boost)
                    const engineEl = $("<div/>").attr("id", "playerEngine").css({
                        position: "absolute",
                        width: "70px",
                        height: "70px",
                        left: (parseInt(el.getAttribute("x")) + PLAYER_ENGINE_OFFSET.x) + "px",
                        top: (parseInt(el.getAttribute("y")) + PLAYER_ENGINE_OFFSET.y) + "px",
                        "pointer-events": "none",
                        "background-size": "contain",
                        "background-repeat": "no-repeat",
                        "background-image": "none",
                        "z-index": 35
                    });
                    gameArea.append(engineEl);
                    components["playerEngine"] = engineEl;
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

                if (id === "scoreText") {
                    $obj.text("Score: 0");
                }
            }

            $obj.attr("id", id);
            gameArea.append($obj);
            components[id] = $obj;
        }
    }

    /**
     * parseActions no XML não binda teclas (input é tratado por setupKeyListeners)
     * Mantido para compatibilidade futura.
     * @param {Document} xml Document XML parseado.
     */
    function parseActions(xml) {
        // Intencionalmente vazio: input centralizado em setupKeyListeners()
    }

    // ---------- Input / Teclas ----------

    /**
     * Setup listeners de keydown / keyup para controlar teclas pressionadas.
     * Usa o mapa keysPressed para comportamento contínuo no loop.
     */
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

    /**
     * Retorna true se existe alguma tecla diferente de espaço ou setas pressionada.
     * Usado para permitir atirar sem bloquear outras ações.
     * @returns {boolean}
     */
    function anyOtherKeyPressedBesidesSpace() {
        const spaceNames = new Set(['Space', ' ', 'Spacebar']);
        const arrowKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

        for (let k in keysPressed) {
            if (!keysPressed[k]) continue;
            if (!spaceNames.has(k) && !arrowKeys.has(k)) return true;
        }
        return false;
    }

    /**
     * Move o player em dx,dy respeitando os limites do canvas.
     * @param {number} dx Delta X em px
     * @param {number} dy Delta Y em px
     */
    function movePlayer(dx, dy) {
        const player = components["player"];
        if (!player) return;

        let x = parseInt(player.css("left")) || 0;
        let y = parseInt(player.css("top")) || 0;

        const pw = parseInt(player.css("width")) || 70;
        const ph = parseInt(player.css("height")) || 70;

        x += dx;
        y += dy;

        x = Math.max(0, Math.min(GAME_W - pw, x));
        y = Math.max(0, Math.min(GAME_H - ph, y));

        player.css({ left: x + "px", top: y + "px" });
    }

    // ---------- Tiro / Projetéis ----------

    /**
     * Dispara projéteis com base na arma atual (currentWeapon).
     * Cria elementos DOM e objetos em bullets[] com animação de sprite.
     */
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

    /**
     * Atualiza sprite do player de acordo com a vida restante (3/2/1).
     */
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

    // ---------- Invulnerabilidade / dano ----------

    let blinkInterval = null;

    /**
     * Ativa/desativa invulnerabilidade visual do player (piscar).
     * @param {boolean} state true para ativar, false para desativar
     */
    function setPlayerInvulnerable(state) {
        playerInvulnerable = !!state;
        const p = components["player"];
        if (!p) return;

        if (blinkInterval) {
            clearInterval(blinkInterval);
            blinkInterval = null;
        }

        if (playerInvulnerable) {
            blinkInterval = setInterval(() => {
                const current = p.css("opacity");
                p.css("opacity", current === "1" ? "0.2" : "1");
            }, 120);
        } else {
            p.css("opacity", "1");
        }
    }

    /**
     * Aplica dano ao player e faz checagem de game over.
     * @param {number} [amount=1] Quantidade de vidas a subtrair.
     */
    function damagePlayer(amount = 1) {
        if (playerInvulnerable) return;
        playerLife -= amount;
        if (playerLife < 0) playerLife = 0;
        updatePlayerSprite();

        setPlayerInvulnerable(true);
        setTimeout(() => setPlayerInvulnerable(false), PLAYER_INVUL_MS);

        if (components["scoreText"]) {
            components["scoreText"].text("Score: " + score);
        } else {
            updateInfo();
        }

        if (playerLife <= 0) {
            clearInterval(spawnInterval);
            clearInterval(gameLoop);
            updateInfo("Game Over! Score: " + score);
            const p = components["player"];
            if (p) p.remove();
        }
    }

    // ---------- Inimigos / Pickups ----------

    /**
     * Cria um inimigo em X aleatório acima da tela.
     */
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

    /**
     * Spawn de pickup de canhão (anima e adiciona à lista).
     */
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

    /**
     * Spawn de pickup de engine (anima e adiciona à lista).
     */
    function spawnEnginePickup() {
        const size = 48;
        const x = Math.random() * (GAME_W - size);
        const y = -60;

        const el = $("<div/>").addClass("pickupEngine").css({
            width: size + "px",
            height: size + "px",
            left: x + "px",
            top: y + "px",
            position: "absolute",
            "background-image": `url("${pickupEngineSprite.src}")`,
            "background-size": (pickupEngineSprite.fw * pickupEngineSprite.frames) + "px " + size + "px",
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
            anim: animateSprite(el, pickupEngineSprite, 70)
        };

        enginePickups.push(obj);
    }

    let enginePickups = [];
    let cannonPickups = [];

    /**
     * Equipa arma "cannon" por 30s (aplica sprite do canhão por baixo da nave).
     * Após expirar, reverte para arma default.
     */
    function equipCannon() {
        currentWeapon = "cannon";
        if (components["playerCannon"]) {
            components["playerCannon"].css("background-image",
                'url("../images/space/player/pickupsPlayer/spaceShip_Cannon.png")');
        }

        setTimeout(() => {
            if (currentWeapon === "cannon") {
                currentWeapon = "default";
                if (components["playerCannon"]) components["playerCannon"].css("background-image", "none");
                if (components["player"]) components["player"].css("background-image",
                    'url("../images/space/player/spaceShip_3Life.png")');
            }
        }, 30000);
    }

    // ---------- Loop principal / Início de jogo ----------

    /**
     * Inicia spawn de inimigos e pickups (baseado na dificuldade) e inicia gameLoop.
     */
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

            if (Math.random() < 0.50)
                spawnEnginePickup();
        }, 6000);

        gameLoop = setInterval(() => {
            // Controla engine boost e tempo
            if (engineBoost && Date.now() > engineBoostEndAt) {
                engineBoost = false;
                PLAYER_SPEED = 8;
                components["playerEngine"].css("background-image", "none");
            }

            if (engineBoost) {
                PLAYER_SPEED = 14;
            }

            // Movimento contínuo do player a partir do mapa keysPressed
            if (keysPressed["ArrowLeft"]) {
                movePlayer(-PLAYER_SPEED, 0);
            }
            if (keysPressed["ArrowRight"]) {
                movePlayer(PLAYER_SPEED, 0);
            }
            if (keysPressed["ArrowDown"]) {
                movePlayer(0, PLAYER_SPEED);
            }
            if (keysPressed["ArrowUp"]) {
                movePlayer(0, -PLAYER_SPEED);
            }

            // Sincroniza canhão e motor com a posição do player usando offsets configuráveis
            if (components["playerCannon"]) {
                const p = components["player"];
                const pc = components["playerCannon"];
                const x = parseInt(p.css("left"));
                const y = parseInt(p.css("top"));
                pc.css({ left: x + "px", top: (y + 20) + "px" });
            }
            if (components["playerEngine"]) {
                const p = components["player"];
                const pe = components["playerEngine"];
                const x = parseInt(p.css("left"));
                const y = parseInt(p.css("top"));
                pe.css({
                    left: (x + PLAYER_ENGINE_OFFSET.x) + "px",
                    top: (y + PLAYER_ENGINE_OFFSET.y) + "px"
                });
            }

            // Controle de tiro com cooldown (permite segurar space)
            const now = Date.now();
            const spacePressed = !!(keysPressed["Space"] || keysPressed[" "] || keysPressed["Spacebar"]);
            if (spacePressed && !anyOtherKeyPressedBesidesSpace()) {
                if (now - lastShotAt >= SHOOT_COOLDOWN_MS) {
                    shoot();
                    lastShotAt = now;
                }
            }

            // Atualiza projéteis
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

            // Atualiza inimigos com gravidade conforme configuração de dificuldade
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

            // Checa colisões inimigo <-> player
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
                        const expX = Math.round(ePos.left + e.w / 2 - (explosionSprite.fw || 32) / 2);
                        const expY = Math.round(ePos.top + e.h / 2 - (explosionSprite.fh || 32) / 2);

                        spawnExplosion(expX, expY);

                        damagePlayer(1);
                        e.el.remove();
                        enemies.splice(ei, 1);
                    }
                }
            }

            // Pickups: canhão
            for (let i = cannonPickups.length - 1; i >= 0; i--) {
                const p = cannonPickups[i];
                p.y += 2;
                p.el.css("top", p.y + "px");

                const player = components["player"];
                const pp = player.position();
                if (rectsIntersect(pp.left, pp.top, 70, 70, p.x, p.y, p.w, p.h)) {
                    if (p.anim) clearInterval(p.anim);
                    p.el.remove();
                    cannonPickups.splice(i, 1);
                    equipCannon();
                    updatePlayerSprite();
                    continue;
                }

                if (p.y > GAME_H + 40) {
                    if (p.anim) clearInterval(p.anim);
                    p.el.remove();
                    cannonPickups.splice(i, 1);
                    continue;
                }
            }

            // Pickups: engine
            for (let i = enginePickups.length - 1; i >= 0; i--) {
                const p = enginePickups[i];
                p.y += 2;
                p.el.css("top", p.y + "px");

                const player = components["player"];
                const pp = player.position();

                if (rectsIntersect(pp.left, pp.top, 70, 70, p.x, p.y, p.w, p.h)) {
                    if (p.anim) clearInterval(p.anim);
                    p.el.remove();
                    enginePickups.splice(i, 1);
                    equipEngineBoost();
                    continue;
                }

                if (p.y > GAME_H + 40) {
                    if (p.anim) clearInterval(p.anim);
                    p.el.remove();
                    enginePickups.splice(i, 1);
                }
            }

            checkCollisions();
            updatePlayerSprite();

        }, TICK_MS);
    }

    // ---------- Colisões ----------

    /**
     * Teste AABB entre dois retângulos.
     * @param {number} ax X do retângulo A
     * @param {number} ay Y do retângulo A
     * @param {number} aw Largura do retângulo A
     * @param {number} ah Altura do retângulo A
     * @param {number} bx X do retângulo B
     * @param {number} by Y do retângulo B
     * @param {number} bw Largura do retângulo B
     * @param {number} bh Altura do retângulo B
     * @returns {boolean} true se intersectam
     */
    function rectsIntersect(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    /**
     * Checa colisões entre projéteis e inimigos, aplica explosões, remove elementos e atualiza score/dificuldade.
     */
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
                    const expX = Math.round(ePos.left + e.w / 2 - (explosionSprite.fw || 32) / 2);
                    const expY = Math.round(ePos.top + e.h / 2 - (explosionSprite.fh || 32) / 2);

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

    // ---------- Finalização ----------

    $(window).on("beforeunload", () => {
        clearInterval(spawnInterval);
        clearInterval(gameLoop);
    });

    // ---------- Inicialização ----------
    loadXML();
});