# Hitster Fake

Um site para jogar Hitster com músicas aleatórias. Toca um excerto (10 s por defeito). Quando carregas em **Revelar**, a carta vira e mostra o artista, o ano e o título.

As músicas e os excertos de 30 s vêm da **Deezer**. Não é preciso conta nem configuração.

**Jogar online:** https://hitsterfake.vercel.app

## Como abrir

```sh
./start.sh
```

Depois abre **http://127.0.0.1:8888/**. O site é só HTML, CSS e JavaScript, por isso também pode ser alojado em qualquer servidor estático, como o GitHub Pages.

## Escolher as músicas

**Por língua e década** (modo por defeito)
- **Décadas:** escolhe uma ou mais.
- **Línguas:** cada língua tem um peso. A percentagem ao lado é a probabilidade de a próxima música ser dessa língua. Por exemplo, Inglês 90 e Português 10 dão 90% / 10%. Com "+ Adicionar língua" podes juntar Espanhol, Francês, Italiano ou Alemão. Por defeito é 50% Inglês e 50% Português (Portugal e Brasil).
- Como funciona: para cada língua e década, o site pesquisa playlists públicas da Deezer (ex.: "portugal anos 80", "mpb anos 80", "80s hits"). Só usa as que têm no título sinais dessa língua. Antes de tocar, cada música é confirmada pelo título e pelo país do artista, segundo o MusicBrainz. Assim, Rosalía (Espanha) não entra como música portuguesa. No inglês são aceites artistas de países sem língua na lista, como ABBA ou Kygo. Em contrapartida, uma música em inglês de um artista espanhol ou português (ex.: Shakira) fica de fora do inglês.

**Uma playlist:** cola o link de uma playlist da Deezer.

### Adicionar outra língua

Junta uma entrada a `LANGUAGES` em [js/languages.js](js/languages.js):

```js
nl: {
  name: 'Neerlandês',
  code: 'NL',
  queries: (d) => [`nederlandstalige hits jaren ${String(d).slice(2)}`],
  must: /nederland|hollands|🇳🇱/i,
  words: 'de het een en ik je jij mijn liefde niet met voor zijn',
  countries: 'NL',
},
```

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

- `index.html` e `css/style.css`: interface
- `js/app.js`: lógica do jogo e das definições
- `js/languages.js`: línguas, pesquisas de playlists e detetor de língua
- `js/deezer.js`: pesquisa e excertos da Deezer (JSONP)
- `js/musicbrainz.js`: ano original
- `js/util.js`: funções auxiliares

As definições e o histórico ficam guardados no `localStorage` do browser.
