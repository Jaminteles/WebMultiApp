
---

# 📘 **README.md — WebMultiApp Games**

```markdown
# 🎮 WebMultiApp – Mini Games Collection  
Coleção de jogos feitos em HTML, CSS, JavaScript e XML Engine personalizado.

Atualmente o projeto inclui:

- 🦖 **Rawr Rawr** — Jogo de corrida infinita estilo Dino Run  
- 🚀 **Space Shooter** — Jogo de nave com power-ups, inimigos, armas e explosões animadas

---

## 📌 Visão Geral

O WebMultiApp é uma plataforma simples baseada em arquivos estáticos, onde cada jogo:

- Define seus **componentes e ações via XML**  
- É carregado por um **motor JavaScript (engine)** que lê o XML, instancia elementos, aplica física e gerencia o loop do jogo  
- Possui **sprites animados**, colisões, pontuação e mecânicas personalizadas

Cada jogo funciona de maneira totalmente independente, mas compartilham padrões de estrutura e arquivos globais de UI.

---

## 📁 Estrutura do Projeto

```

/css
index.css
styles.css
rawr-rawr.css
space.css

/js
rawrEngine.js
spaceEngine.js

/pages
rawr-rawr.html
space.html

/images
/dinosaur
/space
/index

rawr-rawr.xml
space.xml
index.html

```

---

## 🦖 Rawr Rawr (Runner Game)

### 🎯 Objetivo
Desviar de obstáculos (spikes) enquanto a velocidade aumenta com o tempo. O jogador ganha pontos continuamente e perde ao colidir.

### 🔧 Mecânicas Principais
- Pulo com física simples (gravidade, velocidade vertical)
- Obstáculos animados via spritesheet
- Background scroll infinito
- Aumento automático de dificuldade (spikes mais rápidos)
- Sistema de Game Over com reinício por espaço

### 📄 Arquivos
- **rawr-rawr.xml** → componentes e ações  
- **rawrEngine.js** → motor do jogo  
- **rawr-rawr.css** / **styles.css** → sprites e visual  

---

## 🚀 Space Shooter

### 🎯 Objetivo
Destruir inimigos que caem da tela, coletar pickups e sobreviver o máximo possível.

### 🔧 Mecânicas Incluídas
- Movimento em 8 direções  
- Tiro com cooldown  
- Sistema de armas (default / cannon)  
- Power-up de velocidade (engine boost)  
- Inimigos com gravidade e velocidade variável  
- Explosões animadas via spritesheet  
- Dificuldade dinâmica (normal → hard → insane)  
- Sistema de vida, invulnerabilidade e piscamento  
- Colisões Player / Enemy / Projectile / Pickup  

### 📄 Arquivos
- **space.xml** → descrição do jogo  
- **spaceEngine.js** → engine avançada  
- **space.css** → visual da nave, inimigos e fundo  

---

## 🖥 Como Rodar o Projeto

### 📌 Método 1 — Abrir pelo navegador (simples)
Apenas abra o arquivo:

```

index.html

````

E escolha o jogo no menu.

### 📌 Método 2 — Via servidor local (recomendado)
Porque alguns navegadores bloqueiam `fetch()` para arquivos locais.

Use qualquer servidor:

#### Node:
```bash
npx http-server .
````

#### Python:

```bash
python -m http.server
```

Depois acesse:

```
http://localhost:8080
```

---

## 📘 Documentação Técnica

### ✔ Engines com JSDoc

Ambos os motores possuem documentação interna detalhada:

* Explicação de cada função
* Parâmetros, retornos e comportamento
* Fluxo completo do loop do jogo
* Estrutura dos componentes criados dinamicamente

### ✔ Arquivos XML

Os jogos usam um mini-framework próprio:

```xml
<component id="player" type="rectangle" x="445" y="460" width="70" height="70" />
<action id="jump" trigger="keydown" key="ArrowUp" effect="jump" />
```

O engine interpreta:

* Atributos → posição, tamanho
* Ações → mapeamento direto para funções internas
* Componentes → criados dinamicamente no DOM

---

## 📷 Screenshots 

---

## 🛠 Tecnologias Utilizadas

* HTML5
* CSS3
* JavaScript
* jQuery
* XML Engine customizada
* Spritesheet Animation
* AABB Collision Detection

---

## 📌 Melhorias Futuras (Opcional)

* Sistema de áudio (tiros, impacto, explosão)
* Tela de ranking global
* Modularização das engines
* Suporte mobile (toque para pular/disparar)

---

## 👤 Autor

Jamínteles Desus Ribeiro Moura

---

## 📄 Licença

Este projeto pode ser usado livremente para estudo, modificação e expansão.