# Hitster Fake

Um site para jogar Hitster com músicas aleatórias. Toca um excerto (10 s por defeito). Quando carregas em **Revelar**, a carta vira e mostra o artista, o ano e o título.

As músicas e os excertos de 30 s vêm da **Deezer**. Não é preciso conta nem configuração.

**Jogar online:** https://hitsterfake.vercel.app

## Como abrir

```sh
./start.sh
```

Depois abre **http://127.0.0.1:8888/**. Na primeira vez, o script instala as dependências (`npm install`). O site é feito em React + TypeScript com Vite: `npm run build` gera o site estático em `dist/`, que pode ser alojado em qualquer servidor estático. O Vercel faz o build sozinho a cada push (ver `vercel.json`). `npm test` corre os testes.

## Categorias do Hitster Bingo

Antes de cada música é sorteada uma categoria, como a bola de espelhos do Hitster Bingo. Escolhe o lado no início (ou nas definições):

| Lado A · Iniciante | Lado B · Experiente |
|---|---|
| Grupo ou solo (duetos e "feat." contam como grupo) | Título da música |
| Antes de 2000? | Ano exato |
| 4 anos para cima ou para baixo | Grupo ou cantor |
| Década | Década |
| 2 anos para cima ou para baixo | 3 anos para cima ou para baixo |

Todas as categorias têm a mesma probabilidade. Ao revelar, a carta mostra a resposta certa dessa categoria. Para saber se é grupo ou solo, o site usa o tipo do artista no MusicBrainz. Com "Sem categoria" o jogo fica como antes, só a adivinhar o ano.

## Escolher as músicas

**Por língua e década** (modo por defeito)
- **Décadas:** escolhe uma ou mais.
- **Línguas:** cada língua tem um peso. A percentagem ao lado é a probabilidade de a próxima música ser dessa língua. Por exemplo, Inglês 90 e Português 10 dão 90% / 10%. Com "+ Adicionar língua" podes juntar Português (Brasil), Espanhol, Francês, Italiano ou Alemão. Por defeito é 50% Inglês e 50% Português (Portugal). Portugal e Brasil são grupos separados: cada um tem a sua percentagem, as suas playlists e a sua própria fama relativa.
- Como funciona: para cada língua e década, o site pesquisa playlists públicas da Deezer (ex.: "portugal anos 80", "mpb anos 80", "80s hits"). Só usa as que têm no título sinais dessa língua. Antes de tocar, cada música é confirmada pelo título e pelo país do artista, segundo o MusicBrainz. Assim, Rosalía (Espanha) não entra como música portuguesa, e um artista brasileiro não entra em Portugal (nem o contrário). Quando o MusicBrainz não sabe o país do artista, o site pergunta à **Wikidata** (país de origem, nacionalidade ou, em último caso, a descrição, ex.: "São-Toméan musical duo"). Em Portugal e no Brasil, um artista sem país conhecido fica de fora, porque só o país os distingue. No inglês são aceites artistas de países sem língua na lista, como ABBA ou Kygo. Em contrapartida, uma música em inglês de um artista espanhol ou português (ex.: Shakira) fica de fora do inglês.

**Uma playlist:** cola o link de uma playlist da Deezer.

**Fama:** filtra as músicas pouco conhecidas. A Deezer dá a cada faixa um *rank* conforme é ouvida, mas uma música portuguesa conhecida tem muito menos ouvintes do que um êxito americano. Por isso cada música é comparada só com as outras da mesma língua e década (ou da mesma playlist): **Conhecidas** aceita as 50% mais ouvidas desse grupo, **Só êxitos** as 20%, **Todas** não filtra. Os ranks vistos ficam guardados no browser e a comparação fica mais certa à medida que se joga.

### Adicionar outra língua

Junta uma entrada a `LANGUAGE_DEFINITIONS` em [src/languages/definitions.ts](src/languages/definitions.ts):

```ts
nl: {
  name: 'Neerlandês',
  code: 'NL',
  queries: (d) => [`nederlandstalige hits jaren ${String(d).slice(2)}`],
  must: /nederland|hollands|🇳🇱/i,
  words: 'de het een en ik je jij mijn liefde niet met voor zijn',
  countries: 'NL',
},
```

## Modo por artista

Em "Músicas", escolhe **Por artista**, pesquisa um ou mais artistas e adiciona-os (até 10). Só tocam músicas deles, e as categorias do Bingo passam a ser sobre o artista, com as mesmas cores:

| Cor | Lado A · Iniciante | Lado B · Experiente |
|---|---|---|
| Rosa | Título da música | Nome do álbum |
| Amarelo | Antes ou depois de X? | Ano exato |
| Azul | 3 anos para cima ou para baixo | Qual dos artistas? (com 2 ou mais) / Nº da faixa no álbum (com 1) |
| Laranja | Qual é o álbum? (3 opções) | Que álbum é? (1.º, 2.º… de estúdio) |
| Roxo | Completar o refrão | 1 ano para cima ou para baixo |

- As músicas, os excertos e a fama vêm da Deezer (as mais ouvidas de cada artista). Os **álbuns de estúdio**, a sua ordem, o ano original e o número da faixa vêm do **MusicBrainz**, porque a Deezer mistura álbuns de estúdio com edições de aniversário, ao vivo e compilações, e dá muitas vezes o ano da reedição.
- Só entram músicas que saíram num álbum de estúdio. O ano é o do álbum, e o X de "Antes ou depois" é a mediana dos anos dos álbuns.
- "Completar o refrão" mostra o verso que mais se repete na letra (do LRCLIB) com as últimas 2 ou 3 palavras em branco. A letra é lida no momento e não é guardada.
- Se uma categoria não tiver dados para aquela música (ex.: sem refrão claro ou menos de 3 álbuns), o site sorteia outra.
- A primeira música de cada artista demora uns segundos (o MusicBrainz aceita um pedido por segundo); as seguintes preparam-se enquanto se joga.

## Artistas bloqueados

Para que as músicas de um artista não voltem a aparecer, bloqueia-o de três maneiras:
- nas definições, em **Artistas bloqueados** (escreve o nome e carrega em Bloquear);
- na carta revelada, no botão **Bloquear <artista>**;
- no histórico, no botão ao lado do ano.

Também ficam de fora os duetos e as participações ("feat.") desse artista. A comparação ignora maiúsculas, acentos e palavras de ligação ("Xutos e Pontapés" = "Xutos & Pontapés"). Para desbloquear, carrega no × ao lado do nome nas definições.

## O ano

A Deezer dá muitas vezes o ano de uma compilação ou reedição. Por isso, o site procura também no **MusicBrainz** a primeira edição oficial, ignorando compilações e versões ao vivo, e mostra o ano mais antigo que encontrar. Nas músicas internacionais quase sempre acerta. Nas portuguesas mais antigas os dados são mais pobres e às vezes aparece o ano de uma compilação.

## Atalhos

| Tecla | Ação |
|---|---|
| Espaço | Tocar / parar |
| R | Ouvir outra vez |
| Enter | Revelar / próxima |
| N ou → | Próxima música |

## Ficheiros

- `index.html`, `src/main.tsx`, `src/App.tsx`, `src/style.css`: página e interface
- `src/components/`: componentes React (carta, controlos, histórico, barra de progresso) e `settings/` com um painel por secção das definições
- `src/hooks/useGame.ts`: lógica do jogo (escolher, tocar e revelar músicas, sorteio das categorias)
- `src/hooks/useSettings.ts`: definições guardadas e a sua migração
- `src/categories/`: categorias do Hitster Bingo como classes (`Category.ts`) e os lados A/B (`sides.ts`), normais e do modo por artista
- `src/languages/`: classe `Language`, as línguas (`definitions.ts`) e o `LanguageService` (detetor de língua, país do artista, sorteio)
- `src/services/`: Deezer (JSONP), MusicBrainz, Wikidata, LRCLIB (refrão), modo por artista, artistas bloqueados, leitor de áudio e `TrackPicker` (escolha da próxima música)
- `src/lib/`: funções auxiliares, percentagens das línguas e fila de pedidos com pausa

As definições e o histórico ficam guardados no `localStorage` do browser.
