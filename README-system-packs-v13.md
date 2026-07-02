# DDA System Packs — v13

Este patch transforma os exports de compêndios de mundo em arquivos de apoio para packs de sistema.

## Packs registrados no `system.json`

- baby1
- baby2
- child
- adult
- perfect
- ultimate
- ultimateplus
- armor
- hybrid

## Contagem de documentos importáveis

- adult: 277
- armor: 68
- baby1: 48
- baby2: 59
- child: 175
- hybrid: 0
- perfect: 278
- ultimate: 0
- ultimateplus: 0

## Regra importante de Armor

Armor **não foi tratado como estágio mecânico válido** neste patch. O pack continua se chamando `armor`, mas os atores dentro dele foram normalizados assim:

```json
"system.stage": "adult",
"system.stageValue": 3,
"system.specialForm.kind": "armor",
"system.specialForm.method": "armor",
"system.specialForm.equivalentStage": "adult"
```

Ou seja: Armor é uma forma especial/pseudo-stage com equivalência mecânica de Adulto.

## Como usar

1. Aplique este patch no root do sistema `digimon-digital-adventures`.
2. Reinicie o Foundry.
3. Confirme que os packs aparecem como compêndios do sistema.
4. Crie uma Macro do tipo Script e cole o conteúdo de:

```txt
tools/foundry/import-exported-actor-compendia-into-system-packs.js
```

5. Rode primeiro com:

```js
DRY_RUN: true
```

6. Se o console estiver correto, rode com:

```js
DRY_RUN: false
```

Por padrão, a macro limpa cada pack antes de importar:

```js
CLEAR_PACK_BEFORE_IMPORT: true
```

## Arquivos incluídos

- `system.json` atualizado com `packs`.
- `packs/<pack>/_source/*.json` para controle de fonte.
- `packs-json/<pack>.json` para a macro de importação.
- `tools/foundry/import-exported-actor-compendia-into-system-packs.js`.
