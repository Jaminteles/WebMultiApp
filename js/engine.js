// engine.js - motor simples que lê game.xml e cria elementos
$(document).ready(function() {
    const gameArea = $('#gameArea');
    const info = $('#info');
    let score = 0;
    let components = {};
    let isJumping = false;
    let velocityY = 0;
    const gravity = 1;
    const jumpPower = -16;
    const groundLevel = 230; // ajustado para novo mapa
    let blockSpawner = null;
    let obstacles = [];
    let gameRunning = true;
    let physicsInterval = null;
    let scoreInterval = null;
    let blockSpeed = 5;
    let lastSpeedUpScore = 0;
    let backgroundOffset = 0;
    const backgroundWidth = 1600; // largura da imagem spr_forest.png

    function updateInfo(text) { info.text(text); }

    function loadXML() {
        fetch('game.xml')
            .then(r => r.text())
            .then(str => (new window.DOMParser()).parseFromString(str, "text/xml"))
            .then(xml => {
                updateInfo('Jogo carregado. Use SETA PARA CIMA para pular!');
                parseComponents(xml);
                parseActions(xml);
                startGame();
            })
            .catch(err => {
                updateInfo('Erro ao carregar game.xml — ' + err);
            });
    }

    function parseComponents(xml) {
        const nodes = xml.getElementsByTagName('component');
        for (let i = 0; i < nodes.length; i++) {
            const c = nodes[i];
            const id = c.getAttribute('id');
            const type = c.getAttribute('type');
            let $el = null;

            if (type === 'rectangle') {
                // cria estilo base; se for player, não define background inline
                const styleObj = {
                    left: c.getAttribute('x') + 'px',
                    top: c.getAttribute('y') + 'px',
                    width: c.getAttribute('width') + 'px',
                    height: c.getAttribute('height') + 'px',
                    borderRadius: '4px'
                };
                if (id !== 'player') {
                    styleObj.background = c.getAttribute('color') || '#888';
                }
                $el = $('<div/>').addClass('g-entity').css(styleObj);
            } else if (type === 'text') {
                $el = $('<div/>').addClass('g-entity g-text').text(c.getAttribute('text') || '').css({
                    left: c.getAttribute('x') + 'px',
                    top: c.getAttribute('y') + 'px',
                    fontSize: '18px',
                    fontWeight: 'bold'
                });
            }

            if ($el) {
                $el.attr('id', id);
                gameArea.append($el);
                components[id] = $el;
                // se for player, aplica sprite/parado para teste
                if (id === 'player') {
                    // usa a animação (spritesheet) para o player
                    $el.addClass('player-sprite');
                    $el.removeClass('paused');
                    $el.removeClass('dino-static');
                }
            }
        }
    }

    function parseActions(xml) {
        const actions = xml.getElementsByTagName('action');
        for (let i = 0; i < actions.length; i++) {
            const a = actions[i];
            const trigger = a.getAttribute('trigger');
            const key = a.getAttribute('key');
            const effect = a.getAttribute('effect');

            if (trigger === 'keydown' && key) {
                $(document).on('keydown', (ev) => {
                    if (ev.key === key && gameRunning) {
                        runEffect(effect);
                    }
                });
            }
        }
    }

    function runEffect(effect) {
        if (effect === 'jump') {
            jump();
        }
    }

    function jump() {
        const player = components['player'];
        if (!player || isJumping) return;

        isJumping = true;
        velocityY = jumpPower;
        // pausar ciclo de corrida enquanto está no ar (mostrar frame de salto)
        player.addClass('paused');
    }

    function startGame() {
        // loop de física
        physicsInterval = setInterval(updatePhysics, 30);

        // spawn de um novo bloco a cada 2 segundos
        blockSpawner = setInterval(spawnBlock, 2000);

        // aumentar score a cada segundo (10 pontos)
        scoreInterval = setInterval(() => {
            if (gameRunning) {
                score += 10;
                updateScoreText(score);
                checkSpeedUp();
            }
        }, 1000);
    }

    function checkSpeedUp() {
        // a cada 100 pontos, aumentar velocidade em +1
        const speedUpTreshold = Math.floor(score / 100) * 100;
        if (speedUpTreshold > lastSpeedUpScore && speedUpTreshold > 0) {
            lastSpeedUpScore = speedUpTreshold;
            blockSpeed += 2;
        }
    }

    function spawnBlock() {
        if (!gameRunning) return;
        const x = gameArea.width();
        // y ajustado para que o spike fique encostado no chão (groundLevel - altura)
        const obstacleHeight = 15;
        createObstacle(x, groundLevel - obstacleHeight, '#E53935');
    }

    function createObstacle(x, y, color) {
        const w = 64,
            h = 48; // obstáculo visual 64x48
        const $block = $('<div/>').addClass('g-entity obstacle-sprite').css({
            left: x + 'px',
            top: y + 'px',
            width: w + 'px',
            height: h + 'px',
            borderRadius: '0px'
        });
        gameArea.append($block);

        // reduzir caixa de colisão em 4px horizontal e 4px vertical
        const collW = Math.max(1, w - 4);
        const collH = Math.max(1, h - 4);

        obstacles.push({
            el: $block,
            x: x,
            y: y,
            width: collW,
            height: collH
        });
    }

    function updateBackground() {
        backgroundOffset += blockSpeed * 0.5;
        if (backgroundOffset >= backgroundWidth) backgroundOffset = 0;
        gameArea.css('background-position', (-backgroundOffset) + 'px center');
    }

    function updatePhysics() {
        if (!gameRunning) return;
        const player = components['player'];
        if (!player) return;

        const pW = parseInt(player.css('width')) || 24;
        const pH = parseInt(player.css('height')) || 35;
        const playerLeft = parseInt(player.css('left')) || 200;
        let playerTop = parseInt(player.css('top')) || groundLevel;

        velocityY += gravity;
        playerTop += velocityY;

        // impedir que saia do chão
        if (playerTop >= groundLevel) {
            playerTop = groundLevel;
            velocityY = 0;
            isJumping = false;
            // reaplicar animação de corrida ao aterrissar
            player.removeClass('paused');
        }

        let collided = false;
        obstacles.forEach(obs => {
            const obsLeft = parseInt(obs.el.css('left'));
            const obsTop = parseInt(obs.el.css('top'));
            if (
                playerLeft < obsLeft + obs.width &&
                playerLeft + pW > obsLeft &&
                playerTop < obsTop + obs.height &&
                playerTop + pH > obsTop
            ) collided = true;
        });

        if (collided) {
            gameRunning = false;
            resetGame();
            return;
        }

        obstacles = obstacles.filter(obs => {
            const obsLeft = parseInt(obs.el.css('left'));
            obs.el.css('left', (obsLeft - blockSpeed) + 'px');
            if (obsLeft < -obs.width) { obs.el.remove(); return false; }
            return true;
        });

        updateBackground();
        player.css('top', playerTop + 'px');
    }

    function updateScoreText(s) {
        if (components['scoreText']) {
            components['scoreText'].text('Score: ' + s);
        }
    }

    function resetGame() {
        clearInterval(blockSpawner);
        clearInterval(physicsInterval);
        clearInterval(scoreInterval);
        gameRunning = false;
        updateInfo('Game Over! Score: ' + score + '. Pressione ESPAÇO para recomeçar.');

        // pausar animação do player se existir
        components['player'] && components['player'].addClass('paused');

        // remove qualquer listener antigo e adiciona um novo com namespace
        $(document).off('keydown.restart');

        $(document).on('keydown.restart', function(ev) {
            // normaliza várias formas de detectar a tecla espaço
            const key = ev.code || ev.key || ev.keyCode || ev.which;
            const isSpace = key === 'Space' || key === ' ' || key === 'Spacebar' || key === 32 || key === '32';
            if (isSpace) {
                ev.preventDefault();
                $(document).off('keydown.restart'); // remove o listener
                location.reload();
            }
        });
    }

    loadXML();
});