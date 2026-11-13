# Testes e desempenho

## Como rodar

```sh
python3 -m pytest tests/test_neurodefender.py      # tudo abaixo, em uns 25 s
node --test tests/neurodefender/                   # só o motor
QT_QPA_PLATFORM=offscreen /usr/lib/qt6/bin/qmltestrunner -input tests/neurodefender/tst_slideshow.qml
tools/neurodefender-sfx.py --check                 # os WAV batem com o sintetizador
```

O `qml`, o `qmllint` e o `qmltestrunner` precisam ser os do Qt 6
(`/usr/lib/qt6/bin/`): em alguns sistemas, o `qml` do `PATH` é o do Qt 5.

## O que é testado

**Motor (`engine.test.cjs`, Node, 31 testes):**

- movimento, limites da arena, diagonal normalizada e direção pelo mouse;
- cadência e pool de tiros, leque do tiro espalhado, colisões, abates e
  pontuação;
- combo, dano, invulnerabilidade, vidas e fim de jogo;
- quase acerto e trombada com nanobot;
- as 7 cápsulas e seus limites, escudo e bomba;
- laser atravessando fracos e queimando fortes;
- clonagem com limite, escudo direcional, ciclo de camuflagem (e escondido não
  atira), teletransporte com aviso, pausa e limite, mergulho que passa pela
  nave, bolha e pinça dos coordenadores, regeneração que um acerto
  interrompe;
- cada setor trazendo o seu comportamento, e o Neural Core combinando;
- a máquina de estados;
- ondas, aviso e chefe, Desafio Neural sem tiros e passagem de setor;
- todos os chefes derrotáveis pelo piloto em menos de 4 minutos;
- fases e geradores do Overmind, vitória e reinício sem recarregar (o
  recorde fica);
- determinismo, pools respeitados em 6 minutos de demonstração e passos
  limitados num quadro lento;
- custo do motor e desenho de todas as telas num Canvas simulado;
- textos com as mesmas chaves em inglês e português.

**QML (`tst_slideshow.qml`, `qmltestrunner`, 11 testes):**

- nada roda antes do `onActivate()`: o jogo nem é carregado;
- o título aparece e o som começa desligado;
- teclado: Enter inicia, setas movem, espaço segurado atira em sequência e P
  pausa e retoma;
- mouse: botão esquerdo atira e o direito solta bomba;
- `onLeave()` para o laço, o som e o tempo do jogo;
- perder o foco pausa;
- uma falha devolve a apresentação estática;
- a demonstração começa sozinha e Enter assume;
- o layout cabe em 1000×600, 810×470, 640×360 e 520×300;
- ajuda e banco de nanobots não rodam o laço;
- o idioma segue o do instalador.

**`test_neurodefender.py` (pytest):**

- arquivos, imports e sons existem;
- nenhuma rede, processo ou gravação no código;
- os sons batem com o sintetizador;
- o `qmllint` do Qt 6 não dá erro;
- os testes acima passam;
- **um `GameRoot.qml` que não compila deixa os slides na tela**;
- **dentro de um `QQuickWidget` como o do Calamares** (PySide6): o jogo roda,
  pausa ao esconder o widget (o log do Calamares) e para no `onLeave()`.

O resto da suíte do repositório passa. Neste computador falham dois testes
anteriores ao jogo, que dependem do ambiente:

- `test_mypy_plugins`, por causa do mypy instalado;
- `test_language_suggestion`, porque falta o módulo `babel`.

## Desempenho medido

**Motor no Node:** cerca de 19 µs por passo (10 minutos simulados de combate
no setor 7).

**Processo QML inteiro**, com o Qt 6.11 sem tela (`offscreen`), na área de
810×470. Cada cenário é um processo próprio, medido por 20 s em `/proc`, em
percentual de um núcleo:

| Cenário | CPU | Memória (RSS) |
|---|---|---|
| Slideshow ainda inativo | 0% | 60 MB |
| Título (30 Hz) | 8% | 68 MB |
| Demonstração (30 Hz, efeitos mínimos) | 8% | 66 MB |
| Partida com tiro rápido triplo (60 Hz) | 12% | 66 MB |
| Chefe final | 11% | 66 MB |
| Pausa | 0% | 65 MB |

Em todos os cenários os registros não trouxeram nenhum aviso de QML. O jogo
acrescenta cerca de 6–8 MB ao processo.

**No Calamares real** (VM QEMU/KVM com 4 vCPUs, vídeo `bochs-drm` sem 3D e
llvmpipe), a CPU é a do processo `calamares` inteiro, já com a instalação
rodando:

| Momento | CPU |
|---|---|
| Título | 15% |
| Partida | 20% |
| Tela final, depois do `onLeave()` | 2% (o anel animado do Calamares) |

O QtMultimedia não foi carregado, porque o som estava desligado.

O ajuste automático entra depois de 120 quadros. Se atualizar e pintar
custam mais de 11 ms por quadro, o jogo passa para efeitos mínimos; acima de
22 ms, para 30 atualizações por segundo. Na VM e no Qt sem tela nenhum dos
dois foi acionado.

## Validação em VM (13/11/2026)

**Ambiente:** ISO de 12/11 (r41) com este branding copiado para o live. O
disco virtual era descartável (30 GB, qcow2), a única unidade da VM.

1. Live, sessão X11. O Calamares abre pelo `calamares-biglinux_polkit`.
2. Idioma, localização, teclado, "Apagar disco" no `vda` e usuário de teste.
3. Ao iniciar a instalação, o NeuroDefender aparece na área da apresentação.
   A barra real (1% → 19% …) e o status ficam embaixo.
4. Jogado com teclado simulado (`xdotool`): a nave se move, atira, marca
   pontos e toma tiros, com a instalação seguindo.
5. A instalação terminou nos mesmos ~3,5 min de uma rodada anterior com o
   jogo parado. O Calamares foi para "Instalação concluída" sozinho, e o jogo
   foi encerrado pelo `onLeave()`.
6. O sistema instalado inicia até a tela de entrada do Big WindowMaker.
7. **No Wayland**, na sessão wlmaker do live, o jogo roda numa janela Qt
   Wayland nativa: 1115 quadros em cerca de 25 s, partida jogada e conquista
   exibida.

**Achados que não são do jogo:**

- **Defeito encontrado e corrigido nesta validação:** na primeira rodada, o
  jogo congelava no Calamares. O `QQuickWidget` informa `visible=false` na
  sua janela interna, e o jogo usava isso para decidir se estava na tela. A
  correção é a detecção pela pintura, com teste no hospedeiro PySide6.
- **Compositor:** na sessão X11 da VM, o picom deixou de pintar partes da
  tela: dockapps, os lançadores do Clip e, durante a partida, a moldura
  estática da janela do Calamares. Um `SIGUSR1` no picom repinta tudo, então o
  problema é do compositor da sessão (big-wm), não do jogo nem do Calamares.
  Bate com o relato de "dockapps sumindo" no VirtualBox.
- **Entrada EFI:** depois da segunda instalação seguida no mesmo disco, a
  entrada "Big" da NVRAM continuou apontando para a partição da primeira, e
  o boot falhou até a entrada ser recriada. É um teste incomum (dois installs
  em sequência), registrado para investigar no instalador.

**Não verificado:**

- uma instalação completa com o Calamares na sessão Wayland;
- som saindo pelo instalador;
- hardware real.
