# Arquitetura e integração com o Calamares

## Arquivos

Ficam em
`biglinux-livecd/usr/share/biglinux/calamares-profiles/bigwindowmaker/branding/bigwindowmaker/`:

| Arquivo | Papel |
|---|---|
| `BigWindowMakerSlides.qml` | Ponto de entrada do `branding.desc` (`slideshow`, `slideshowAPI: 2`). Mostra a apresentação estática do Big WindowMaker e carrega o jogo. |
| `neurodefender/GameRoot.qml` | Gabinete do jogo (painéis laterais e tela), menus, teclado, mouse e o laço. |
| `neurodefender/engine.js` | As regras: estado, pools, máquina de estados dos nanobots, ondas, chefes, cápsulas, colisões, pontuação e piloto da demonstração. É JavaScript puro, sem tipos QML. |
| `neurodefender/render.js` | Desenho da arena: sprites de pixel art escritos como texto (a nave muda com a arma), avisos e tela de título. |
| `neurodefender/art.js` | Fonte de pixels 5×7 com acentos, degradês dos títulos, HUD (placar no alto; vidas, bombas, energia, arma e combo embaixo), painéis laterais, telas de ajuda, banco de nanobots, pausa e fim de jogo. |
| `neurodefender/PixelText.qml`, `PixelMenu.qml` | Texto e menu de fliperama na fonte de pixels, no mesmo tamanho de pixel da arena. |
| `neurodefender/config.js` | Todos os números ajustáveis: velocidades, dano, durações, raridade das cápsulas, setores e chefes. |
| `neurodefender/strings.js` | Textos em português e inglês. Um idioma novo é uma tabela nova com as mesmas chaves. |
| `neurodefender/RetroButton.qml` | Botão quadrado com relevo. |
| `neurodefender/SoundBank.qml` | Efeitos sonoros (QtMultimedia). Só é carregado quando o jogador liga o som. |
| `neurodefender/sfx/*.wav` | 12 efeitos de 8 bits (107 KB) sintetizados por `tools/neurodefender-sfx.py`. |

Não há imagens: a nave, os nanobots, os chefes e as cápsulas são linhas de
texto em `render.js`, guardadas uma vez em `ImageData` e copiadas com
`drawImage`. Se o contexto não aceitar `ImageData`, o desenho cai para
`fillRect`.

## Ciclo de vida (Calamares 3.4, API 2)

O Calamares cria o objeto da apresentação logo ao abrir o instalador. Ele
chama `onActivate()` ao entrar na etapa de instalação e `onLeave()` ao sair,
e então destrói o objeto (`Slideshow.cpp`).

- **Antes do `onActivate()`:** o `Loader` do jogo está desligado. O
  instalador nem lê o `GameRoot.qml` ao abrir.
- **No `onActivate()`:** o jogo é carregado em segundo plano
  (`asynchronous: true`). Em seguida o slideshow chama `activate()`, que
  escolhe o idioma (`Qt.locale()`, já com a escolha feita no instalador) e
  abre a tela de título.
- **No `onLeave()`:** `deactivate()` para o laço, pausa a partida e
  descarrega o som.
- **Um único `Timer` é o laço inteiro**, com três ritmos:
  - 60 Hz na partida;
  - 30 Hz no título e na demonstração, ou em modo econômico;
  - 4 Hz em repouso.

  Ele para de vez na pausa, na ajuda, no banco de nanobots, no fim de jogo e
  depois do `onLeave()`.
- **Detecção de janela escondida:** o Calamares mostra a apresentação num
  `QQuickWidget`, cuja janela interna informa `visible=false` mesmo com tudo
  na tela. Por isso o jogo usa a pintura do Canvas para saber se está
  escondido: se nada é pintado por mais de 0,7 s (o usuário abriu o log do
  Calamares, por exemplo), a partida pausa e o título e a demonstração entram
  em repouso. Esse caso tem teste (`tests/neurodefender/calamares_host.py`).
- **Pausa automática:** acontece também quando a arena perde o foco do teclado.

## O que fica embaixo do jogo

A barra de progresso (`exec-progress`), a mensagem de status
(`exec-message`) e o botão do log são widgets nativos do Calamares, colocados
abaixo da apresentação no `ExecutionViewStep`. O jogo não consegue cobri-los e
não lê nem inventa porcentagens. A tela do jogo (320×264 pixels lógicos: arena
4:3 de 320×240 com uma faixa de HUD de 12 pixels em cima e outra embaixo)
aumenta ou diminui para caber na área que o Calamares der; os painéis
laterais só aparecem quando sobra largura.

## Apresentação de reserva

A apresentação estática do Big WindowMaker volta nestes casos:

1. **O jogo não carrega:** o `GameRoot.qml` não compila, falta um arquivo ou
   falta um módulo do Qt. O `Loader` informa `Error` e o slideshow mostra os
   slides.
2. **Um quadro dá erro:** o laço e o desenho rodam dentro de `try/catch`. O
   erro vai para o log do Calamares (`console.warn`), o jogo para e sinaliza
   `failure`, e os slides assumem.
3. **O som não carrega:** o jogo continua, só que em silêncio.

## O que o jogo não faz

- Não acessa a rede.
- Não abre processos.
- Não pede privilégios.
- Não grava arquivos e não usa `LocalStorage` nem `Settings`.
- Não intercepta o teclado fora da arena.
- Não mexe em nenhuma etapa da instalação.

`tests/test_neurodefender.py` confere essa lista no código.

## Empacotamento

O `pkgbuild/PKGBUILD` do `biglinux-livecd` copia a árvore `usr/` inteira, e a
pasta `neurodefender/` vai junto. Nenhuma dependência nova:

- `qt6-declarative` já é dependência do Calamares;
- `qt6-multimedia` já está na ISO e é opcional para o jogo.

Para chegar à ISO, o PKGBUILD de `biglinux-livecd` no repositório `packages`
precisa apontar para o commit com o jogo e subir o `pkgrel`.
