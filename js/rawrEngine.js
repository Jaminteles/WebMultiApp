/**
 * rawrEngine.js
 * Motor do jogo "Rawr Rawr" — leitura do XML, criação dos componentes, loops de física, spawn de obstáculos e pontuação.
 *
 * Mantive a lógica original, reorganizei e adicionei JSDoc.
 *
 * Referência original: rawrEngine.js fornecido pelo usuário. :contentReference[oaicite:2]{index=2}
 */

$(document).ready(function () {
    // ---------- Configurações / Estado global ----------

    const gameArea = $('#gameArea');
    const info = $('#info');

    /** @type {number} Pontuação atual do jogador */
    let score = 0;

    /** @type {Object.<string, JQuery>} Elementos do jogo indexados por id do XML */
    let components = {};

    /** @type {boolean} Flag que impede pulo múltiplo */
    let isJumping = false;

    /** @type {number} Velocidade vertical atual do jogador (px/tick) */
    let velocityY = 0;

    /** @type {number} Gravidade aplicada ao jogador (px/tick^2) */
    const GRAVITY = 1;

    /** @type {number} Velocidade inicial do pulo (negativa = sobe) */
    const JUMP_POWER = -16;

    /** @type {number} Y do chão (posição top em px) */
    const GROUND_LEVEL = 230;

    /** @type {number|null} Interval que gera obstáculos */
    let blockSpawner = null;

    /** @type {Array<Object>} Lista de obstáculos ativos */
    let obstacles = [];

    /** @type {boolean} Se o jogo está em execução */
    let gameRunning = true;

    /** @type {number|null} Interval de física */
    let physicsInterval = null;

    /** @type {number|null} Interval de score */
    let scoreInterval = null;

    /** @type {number} Velocidade que os blocos se deslocam para a esquerda */
    let blockSpeed = 5;

    /** @type {number} Último score em que houve aumento de velocidade */
    let lastSpeedUpScore = 0;

    /** @type {number} Offset do background para loop infinito */
    let backgroundOffset = 0;

    /** @type {number} Largura da imagem de background (px) */
    const BACKGROUND_WIDTH = 1600;

    // ---------- Helpers de UI ----------

    /**
     * Atualiza o texto de informação abaixo do jogo.
     * @param {string} text Texto a exibir.
     */
    function updateInfo(text) {
        info.text(text);
    }

    // ---------- Leitura e parsing do XML ----------

    /**
     * Carrega o XML do jogo (rawr-rawr.xml) e inicializa componentes e ações.
     * Em caso de erro exibe mensagem em #info.
     */
    function loadXML() {
        fetch('../rawr-rawr.xml')
            .then(r => r.text())
            .then(str => (new window.DOMParser()).parseFromString(str, "text/xml"))
            .then(xml => {
                updateInfo('Use SETA PARA CIMA para pular!');
                parseComponents(xml);
                parseActions(xml);
                startGame();
            })
            .catch(err => {
                updateInfo('Erro ao carregar game.xml — ' + err);
            });
    }

    /**
     * Cria componentes DOM a partir das tags <component> do XML.
     * Suporta type="rectangle" e type="text".
     * O player recebe classes e sprite iniciais.
     * @param {Document} xml Document XML já parseado.
     */
    function parseComponents(xml) {
        const nodes = xml.getElementsByTagName('component');
        for (let i = 0; i < nodes.length; i++) {
            const c = nodes[i];
            const id = c.getAttribute('id');
            const type = c.getAttribute('type');
            let $el = null;

            if (type === 'rectangle') {
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
                if (id === 'player') {
                    // aplica classes para sprite animada do player
                    $el.addClass('player-sprite');
                    $el.removeClass('paused');
                    $el.removeClass('dino-static');
                }
            }
        }
    }

    /**
     * Lê as ações do XML e binda eventos de teclado (keydown).
     * O engine usa runEffect para mapear efeito -> função.
     * @param {Document} xml Document XML já parseado.
     */
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

    /**
     * Executa o efeito mapeado no XML (string).
     * Expandir conforme necessário.
     * @param {string} effect Nome do efeito (ex: 'jump').
     */
    function runEffect(effect) {
        if (effect === 'jump') {
            jump();
        }
    }

    // ---------- Mecânicas do jogador ----------

    /**
     * Inicia o pulo caso o jogador esteja no chão.
     * Define velocidade vertical inicial e marca que está no ar.
     */
    function jump() {
        const player = components['player'];
        if (!player || isJumping) return;

        isJumping = true;
        velocityY = JUMP_POWER;
        // pausa animação de corrida enquanto no ar
        player.addClass('paused');
    }

    // ---------- Início do jogo e loops ----------

    /**
     * Inicia loops de física, spawn de blocos e incremento de score.
     */
    function startGame() {
        physicsInterval = setInterval(updatePhysics, 30);
        blockSpawner = setInterval(spawnBlock, 2000);
        scoreInterval = setInterval(() => {
            if (gameRunning) {
                score += 10;
                updateScoreText(score);
                checkSpeedUp();
            }
        }, 1000);
    }

    /**
     * Verifica se atingiu novo limiar de score para aumentar velocidade dos blocos.
     * A cada 100 pontos aumenta blockSpeed em 2.
     */
    function checkSpeedUp() {
        const speedUpThreshold = Math.floor(score / 100) * 100;
        if (speedUpThreshold > lastSpeedUpScore && speedUpThreshold > 0) {
            lastSpeedUpScore = speedUpThreshold;
            blockSpeed += 2;
        }
    }

    // ---------- Obstáculos ----------

    /**
     * Spawn de obstáculo fixo (spike) alinhado ao chão.
     * Usa createObstacle para criar a entidade com animação de frames.
     */
    function spawnBlock() {
        if (!gameRunning) return;
        const x = gameArea.width();
        createObstacle(x, GROUND_LEVEL + 32, '#E53935');
    }

    /**
     * Cria um obstáculo animado (spritesheet). Cada frame tem dimensões distintas.
     * @param {number} x Posição X inicial (px)
     * @param {number} y Y base (px) - será ajustado com base na altura do frame
     * @param {string} color Cor (não usada diretamente se spritesheet presente)
     */
    function createObstacle(x, y, color) {
        const frameDimensions = [
            { width: 66, height: 15 },
            { width: 66, height: 27 },
            { width: 66, height: 39 },
            { width: 66, height: 51 },
            { width: 66, height: 39 },
            { width: 66, height: 27 },
            { width: 66, height: 15 }
        ];

        const $block = $('<div/>').addClass('g-entity obstacle-sprite').css({
            left: x + 'px',
            top: y + 'px',
            width: 66 + 'px',
            height: 0 + 'px',
            borderRadius: '0px',
            backgroundImage: 'url("../images/dinosaur/spr_spikes_moving.png")',
            backgroundSize: '462px 51px'
        });
        gameArea.append($block);

        let currentFrame = 0;
        const animationInterval = setInterval(() => {
            const { width: w, height: h } = frameDimensions[currentFrame];
            const backgroundPositionX = -(currentFrame * 66);
            const adjustedY = y - h;

            $block.css({
                backgroundPosition: backgroundPositionX + 'px center',
                top: adjustedY + 'px',
                height: h + 'px'
            });

            currentFrame = (currentFrame + 1) % frameDimensions.length;
        }, 200);

        const collW = 62;
        const collH = 15;

        obstacles.push({
            el: $block,
            x: x,
            y: y,
            width: collW,
            height: collH,
            frameIndex: 0,
            frameDimensions: frameDimensions,
            animationInterval: animationInterval
        });
    }

    // ---------- Background ----------

    /**
     * Move o background horizontal para criar ilusão de deslocamento.
     * Deve ser chamado a cada tick de física.
     */
    function updateBackground() {
        backgroundOffset += blockSpeed * 0.5;
        if (backgroundOffset >= BACKGROUND_WIDTH) backgroundOffset = 0;
        gameArea.css('background-position', (-backgroundOffset) + 'px center');
    }

    // ---------- Física e colisões ----------

    /**
     * Loop de física: aplica gravidade, atualiza posição do player, checa colisões com obstáculos, move obstáculos.
     * Chamado periodicamente por physicsInterval.
     */
    function updatePhysics() {
        if (!gameRunning) return;
        const player = components['player'];
        if (!player) return;

        const pW = parseInt(player.css('width')) || 24;
        const pH = parseInt(player.css('height')) || 35;
        const playerLeft = parseInt(player.css('left')) || 200;
        let playerTop = parseInt(player.css('top')) || GROUND_LEVEL;

        velocityY += GRAVITY;
        playerTop += velocityY;

        // não deixar atravessar o chão
        if (playerTop >= GROUND_LEVEL) {
            playerTop = GROUND_LEVEL;
            velocityY = 0;
            isJumping = false;
            player.removeClass('paused');
        }

        let collided = false;
        obstacles.forEach(obs => {
            const obsLeft = parseInt(obs.el.css('left'));
            const obsTop = parseInt(obs.el.css('top'));

            const obsHeight = parseInt(obs.el.css('height'));

            if (
                playerLeft < obsLeft + obs.width &&
                playerLeft + pW > obsLeft &&
                playerTop < obsTop + obsHeight &&
                playerTop + pH > obsTop
            ) collided = true;
        });

        if (collided) {
            gameRunning = false;
            resetGame();
            return;
        }

        // move e limpa obstáculos fora da tela
        obstacles = obstacles.filter(obs => {
            const obsLeft = parseInt(obs.el.css('left'));
            obs.el.css('left', (obsLeft - blockSpeed) + 'px');
            if (obsLeft < -obs.width) {
                clearInterval(obs.animationInterval);
                obs.el.remove();
                return false;
            }
            return true;
        });

        updateBackground();
        player.css('top', playerTop + 'px');
    }

    /**
     * Atualiza o texto do score no DOM.
     * @param {number} s Novo score.
     */
    function updateScoreText(s) {
        if (components['scoreText']) {
            components['scoreText'].text('Score: ' + s);
        }
    }

    /**
     * Reseta o jogo quando ocorrer Game Over:
     * - para timers
     * - pausa animações
     * - exibe mensagem e espera ESPAÇO para reload
     */
    function resetGame() {
        clearInterval(blockSpawner);
        clearInterval(physicsInterval);
        clearInterval(scoreInterval);
        gameRunning = false;
        updateInfo('Game Over! Score: ' + score + '. Pressione ESPAÇO para recomeçar.');

        components['player'] && components['player'].addClass('paused');

        obstacles.forEach(obs => {
            if (obs && obs.animationInterval) {
                clearInterval(obs.animationInterval);
                obs.animationInterval = null;
            }
            if (obs && obs.el) {
                obs.el.css('animation-play-state', 'paused');
            }
        });

        // rebind para permitir reload por ESPAÇO (namespace .restart)
        $(document).off('keydown.restart');

        $(document).on('keydown.restart', function (ev) {
            const key = ev.code || ev.key || ev.keyCode || ev.which;
            const isSpace = key === 'Space' || key === ' ' || key === 'Spacebar' || key === 32 || key === '32';
            if (isSpace) {
                ev.preventDefault();
                $(document).off('keydown.restart');
                location.reload();
            }
        });
    }

    // ---------- Inicialização ----------
    loadXML();
});
