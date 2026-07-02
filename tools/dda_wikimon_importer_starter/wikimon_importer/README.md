# DDA Wikimon Importer Starter

Importador inicial para gerar atores de Digimon para o sistema Digimon Digital Adventures 2E no Foundry VTT.

## Instalação

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Uso básico

```powershell
python -m wikimon_importer.cli --pages Tailmon --aliases samples/aliases.json --out output/tailmon.json
```

Por padrão, o importador agora:

1. busca a página do Wikimon para linhas evolutivas;
2. busca o perfil oficial em `https://digimon.net/reference_en/` para Level, Type, Attribute, display name e imagem;
3. baixa a imagem oficial e converte para `.webp` em `output/images`;
4. grava o campo `img` como `output/images/{sourceId}.webp`.

## Desativar imagem

```powershell
python -m wikimon_importer.cli --pages Tailmon --aliases samples/aliases.json --out output/tailmon.json --no-download-images
```

## Desativar Reference oficial

```powershell
python -m wikimon_importer.cli --pages Tailmon --aliases samples/aliases.json --out output/tailmon.json --no-official-reference
```

## Caminho de imagem para Foundry

Se quiser que o campo `img` já saia com um caminho do sistema, use:

```powershell
python -m wikimon_importer.cli --pages Tailmon --aliases samples/aliases.json --out output/tailmon.json --image-output-dir output/images --image-path-prefix systems/digimon-digital-adventures/assets/digimon
```

Nesse caso, copie os `.webp` gerados para a pasta correspondente do sistema.
