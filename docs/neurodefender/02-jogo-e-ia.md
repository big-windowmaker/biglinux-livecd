# Regras, armas e a evolução dos nanobots

Os números citados aqui estão em `neurodefender/config.js`.

## Nave

A nave é uma célula de defesa neural, com núcleo luminoso, asas, propulsores
animados e o visual mudando conforme a arma.

- **Movimento:** 118 px/s, normalizado na diagonal. A nave fica presa no
  quarto de baixo da arena.
- **Área de acerto:** um círculo de 3 px no núcleo, para não haver mortes
  injustas.
- **Energia:** 100.
  - Um tiro inimigo tira 25.
  - Encostar num nanobot tira 40.
  - Encostar no chefe tira 55.
- **Vidas:** 3, no máximo 5. Ao perder uma vida, a nave fica 2 s invulnerável
  e a arma espalhada cai um nível.
- **Bombas:** começa com 2, no máximo 5.

## Cápsulas

Todo nanobot "carregador" (2 por onda, com brilho dourado) solta uma cápsula.
Os outros soltam com 10% de chance.

| Cápsula | Efeito | Peso |
|---|---|---|
| S | Tiro espalhado: 2 e depois 3 vias | 26 |
| R | Tiro rápido por 10 s (cadência dobrada) | 22 |
| L | Laser neural por 7 s: atravessa nanobots fracos e queima os fortes (7 de dano/s) | 14 |
| O | Escudo por 8 s (a bolha pisca nos 2 s finais) | 14 |
| B | Uma bomba de pulso neural a mais | 11 |
| + | Repara 45 de energia | 10 |
| 1 | Uma vida a mais | 3 |

Quando o recurso já está no máximo, a cápsula vira pontos.

A **bomba de pulso neural** é um anel que cresce até 92 px em 0,55 s. Ela
apaga os tiros inimigos dentro do anel, quebra escudos e bolhas, causa 3 de
dano nos nanobots e 9 nas partes do chefe.

## Pontuação

- **Combo:** abates com menos de 1,25 s de intervalo somam +0,5× a cada 5,
  até ×4.
- **Quase acerto:** escapar raspando de um tiro dá 25 × o multiplicador.
- **Mergulhadores:** abatidos no meio do mergulho valem o dobro.
- **Onda perfeita:** terminar a onda sem dano dá 1000.
- **Chefes:** cada parte vale 300, o núcleo 5000 e o setor limpo mais 2000.
- **Desafio Neural:** 100 por acerto e 5000 se acertar todos os 24.

## Máquina de estados dos nanobots

```
SPAWNING  ->  FORMATION  ->  ATTACKING  ->  RETREATING  ->  FORMATION
(curva de     (vai e vem      (rasante em    (volta pelo
 entrada)      em formação)    zigue-zague,   alto da arena)
                               mergulho ou
                               pinça)

Em qualquer estado, ao morrer: DESTROYED
```

Todas as trajetórias são curvas de Bézier cúbicas.

Camuflagem, escudo, regeneração e aviso de teletransporte correm em paralelo
como cronômetros. Assim os comportamentos se combinam sem multiplicar os
estados.

## Árvore de evolução

| Setor | Comportamento novo | Como funciona |
|---|---|---|
| 1 Neural Gateway | Básico | Formação que vai e vem, rasantes em zigue-zague que não descem até a nave, tiros lentos e retos. |
| 2 Synaptic Fields | Clonagem | Ao ser atingido, divide-se em dois clones menores e mais rápidos, que nunca se dividem de novo. |
| 3 Memory Cortex | Escudo reativo | Uma barra frontal bloqueia tiros retos e racha conforme enfraquece. Tiros em ângulo, o laser ou a bomba passam. |
| 4 Dream Network | Camuflagem | 3 s visível, 0,7 s piscando como aviso e 2,2 s quase invisível (20%). Escondido, não atira. |
| 5 Electric Labyrinth | Teletransporte | Sente um tiro a até 56 px, marca o destino com colchetes por 0,12 s e salta 26–44 px. Tem pausa de 2,6 s entre saltos e no máximo 4 saltos. |
| 6 Phantom Neurons | Kamikaze | Mergulho curvo que passa pela posição da nave, sai por baixo e volta pelo alto. |
| 7 Cortex Inferno | Coordenação | Protege um vizinho com uma bolha que absorve 2 tiros (refeita a cada 4 s) e ataca em pinça com um parceiro pelos dois lados. |
| 8 Quantum Synapse | Regeneração | Ganha +1 de vida máxima e recupera 1 a cada 1,4 s se ficar 1 s sem ser atingido. Um acerto interrompe. |
| 9 The Neural Core | Inteligência coletiva | Cada nanobot recebe de 0 a 2 comportamentos sorteados, com mais combinações nas ondas finais. |

Nos setores seguintes, os comportamentos anteriores continuam aparecendo,
com chance menor (9%). Por setor também crescem a cadência e a velocidade dos
tiros inimigos e a frequência dos ataques. A partir do setor 2, quem está
atacando mira na nave.

A **dificuldade adaptativa** (de 0,85 a 1,15) cai a cada vida perdida e sobe
a cada onda perfeita. Ela ajusta a cadência e a velocidade dos tiros inimigos
e a frequência dos ataques. Uma onda que se arrasta por mais de 40 s fica mais
agressiva, para não empacar.

O jogo é determinístico: um gerador aleatório com semente e passo fixo de
1/60 s, com no máximo 4 passos por quadro.

## Chefes

Todos têm núcleo, partes destrutíveis, barra de energia no topo e explosão
em sequência ao morrer.

| Setor | Chefe | Destaques |
|---|---|---|
| 1 | Synapse Warden | Duas torres que miram e um leque de tiros |
| 2 | Mitosis Engine | Invoca nanobots que se dividem |
| 3 | Cortex Bastion | Dois geradores blindam o núcleo. Destruídos os dois, uma contagem visível de 14 s corre até eles voltarem com metade da energia |
| 4 | Dream Weaver | Rajadas em espiral e véu de camuflagem |
| 5 | Volt Shifter | Teletransporte com marcação do destino |
| 6 | Kamikaze Hive | Lança mergulhadores na direção da nave |
| 7 | Inferno Legion | Quatro torres em fogo cruzado e invocação de coordenadores |
| 8 | Quantum Healer | Cura todas as partes depois de 2 s sem ser atingido |
| 9 | Neural Overmind | Três fases pela energia do núcleo (acima de 66%, até 33%, abaixo de 33%) |

As três fases do Neural Overmind:

1. Leque, tiros mirados e chuva de projéteis.
2. Clones que se dividem, geradores reconstruídos e espirais.
3. Teletransporte, fogo cruzado, mergulhadores e rajadas.

O piloto da demonstração vence cada chefe em 14–31 s e o Overmind em
cerca de 2 minutos. Há um teste para isso.

## Modo demonstração

O piloto mira o nanobot mais próximo, calculando o deslocamento do chefe
durante o voo do tiro. Ele desvia só de tiros que vão chegar em até 0,45 s,
busca cápsulas próximas e usa bomba quando cinco ou mais tiros ameaçam a
nave.

A demonstração roda com efeitos mínimos e troca de setor a cada rodada. Ela
volta ao título depois de um fim de jogo ou de 75 s.
