# Relevo Espectral

Estudo de visualizador para sintetizadores. O espectro do som vira uma cordilheira impressa em gráfica:
frequência no eixo horizontal, energia na altura das cristas, tempo na profundidade. A tinta é retícula,
pontilhado ou trama de linhas.

O site tem a prova ao vivo (synth embutido em Web Audio ou um arquivo de áudio seu), o moodboard, a
especificação som → relevo e prévias em dois alvos de hardware: a tela 240 × 240 do FM-1 e a faixa de
devices do Ableton Live (Max for Live).

## Rodar localmente

```bash
python3 -m http.server 8737
```

Depois abra http://localhost:8737.

## Publicar no GitHub Pages

Settings → Pages → Source: *Deploy from a branch*, branch `main`, pasta `/ (root)`.
O arquivo `.nojekyll` faz o Pages servir os arquivos como estão.

## Estrutura

- `index.html`: a página
- `assets/relevo.js`: motor de desenho (canvas 2D, sem bibliotecas) e synth
- `assets/style.css`: estilos
- `refs/`: referências do moodboard
