# DDA Wikimon Tools v6

Ferramenta de auditoria para comparar Actors Digimon/NPC exportados do Foundry VTT com páginas do Wikimon.

Esta versão foi criada para o fluxo do sistema **Digimon Digital Adventures V2** e continua conservadora: ela não renomeia Actors e só aplica automaticamente campos marcados como seguros.

## Uso básico

```powershell
python tools/dda_wikimon_tools.py audit-profiles --project-root ./tools/armor-actors --stage armor --dry-run
```

Saídas padrão:

```txt
reports/wikimon-armor-audit.json
reports/wikimon-armor-audit.md
```

## O que a v6 muda

### 1. Parser de Level composto

O Wikimon frequentemente mostra Level como uma sequência no mesmo bloco, por exemplo:

```txt
Armor Adult
Armor Adult Child
Armor Adult Perfect
Armor Adult Perfect Unknown
```

A v6 mantém a quebra em vários níveis:

```json
"levels_raw": ["Armor", "Adult"],
"levels": ["armor", "adult"],
"level_status": "multiple"
```

Para Actors `stage: armor`, o script mantém `stage: armor` e sugere apenas:

```txt
specialForm.equivalentStage = adult
```

### 2. Parser de ficha lateral por texto renderizado

A v6 troca a prioridade do parser da ficha lateral: primeiro tenta ler a ficha como texto renderizado em pares `Level → Type → Attribute → Field → Group`; depois usa o parser por links como fallback. Isso evita que campos como `Field` engulam rótulos japoneses ou seções como:

```txt
レベル, アーマー体, 成熟期, 型（タイプ）, 属性, フィールド
```

Ela reconhece e normaliza campos como:

```txt
Level / レベル
Type / 型（タイプ）
Attribute / 属性
Field / フィールド
Group / グループ
```

A v6 também procura valores conhecidos dentro do trecho renderizado, então casos como este passam a ser lidos corretamente:

```txt
Level Armor Adult
Type Holy Beast
Attribute Free Vaccine
Field Nature Spirits Virus Busters
```

Resultado esperado:

```json
"levels": ["armor", "adult"],
"type_raw": "Holy Beast",
"attribute_raw": "Free, Vaccine",
"fields": ["natureSpirits", "virusBusters"]
```


### 3. Digimental como requisito de relação

A v6 não trata `Digimental of Light` como origem comum e também não joga a informação fora sem contexto.

Quando uma relação aparece assim no Wikimon:

```txt
Tailmon (with or without the Digimental of Light)
```

ela é modelada como relação:

```json
{
  "name": "Tailmon",
  "key": "tailmon",
  "requirements": ["Digimental of Light"],
  "requirement_mode": "optional",
  "dda_requirement_mode": "required_for_armor",
  "method": "armor"
}
```

No relatório resumido aparecem também:

```txt
Requisitos From: Digimental of Light
Requisitos To: ...
```

### 4. Aliases e variantes

Aliases servem só para comparação. Eles não renomeiam Actors.

Exemplos:

```txt
Gatomon ↔ Tailmon
Black Tailmon ↔ BlackTailmon
Black Tailmon Uver. ↔ BlackTailmonUver
V-mon ↔ Veemon
Fladramon ↔ Flamedramon
Lighdramon ↔ Raidramon
Holsmon ↔ Halsemon
Pegasmon ↔ Pegasusmon
Tocanmon ↔ Toucanmon
Bitmon ↔ Rabbitmon
Coatlmon ↔ Quetzalmon
```

X-Antibody grudado no nome é tratado como variante especial:

```txt
TailmonXAntibody → base_key: tailmon, variant: xAntibody
Tailmon X-Antibody → base_key: tailmon, variant: xAntibody
Tailmon (X-Antibody) → base_key: tailmon, variant: xAntibody
```

## Apply

Ainda use `--dry-run` até o relatório estar limpo.

Quando for usar `--apply`, ele só altera campos seguros, como:

```txt
system.attribute
system.group
system.specialForm.equivalentStage
```

Type e Field continuam entrando como sugestão de revisão, não como aplicação automática.

## Observações

A ferramenta mantém dados brutos e dados limpos. As relações evolutivas do Wikimon misturam fontes como anime, jogos, V-Pets, Vital Bracelet e Card Game. A v6 filtra entradas genéricas, mas não tenta decidir sozinha qual fonte é válida para o DDA.

## Notas da v7

A v7 ajusta a leitura dos campos de perfil do Wikimon depois do teste da v6:

- `type_raw` passa a representar o Type bruto do Wikimon, como `Holy Beast`, `Demon Beast`, `Machine`, `Insect`, `Mammal` etc.
- `type_hint` fica apenas como dica auxiliar/família aproximada e não deve substituir `system.type`.
- Sugestões de `type` usam `type_raw` confiável, não `type_hint`.
- Types contaminados por texto de descrição/lore são descartados e registrados em nota.
- Attributes múltiplos, como `Free, Vaccine`, não são aplicados automaticamente e entram como nota de revisão.

Exemplo esperado:

```txt
Type: Holy Beast → family hint beast
Attribute: Free, Vaccine → revisão, sem aplicação automática
Field: Nature Spirits, Virus Busters → fields múltiplos, revisão
```

## v8 — foco em estágio e relações com parceiros

A v8 é uma revisão pequena em cima da v7:

- O parser de `Level` agora descarta trechos longos de descrição/lore antes de normalizar, evitando casos como Sheepmon/Orcamon virarem `unknown: texto enorme`.
- Para Armor, a ferramenta tenta páginas alternativas quando a página principal é ambígua; por enquanto, `Rapidmon` também tenta `Rapidmon Armor` e `Rapidmon (Armor)`.
- Relações de evolução com cláusula `with` agora separam o alvo principal dos parceiros:
  - `Ancient Sphinxmon (with Digitamamon, Scorpiomon and Skull Baluchimon)` passa a manter `Ancient Sphinxmon` como destino e registra os demais em `partners` / `partner_keys`.
  - Esses parceiros deixam de entrar em `evolves_to` como destinos independentes.

Ainda recomenda-se rodar primeiro com `--dry-run`.

## v9 — aplicação controlada

A v9 mantém a auditoria da v8 e adiciona modos de aplicação mais seguros para preparar lotes maiores.

Novos modos:

```powershell
python tools/dda_wikimon_tools.py audit-profiles --project-root ./tools/armor-actors --stage armor --apply-equivalent-stage-only
python tools/dda_wikimon_tools.py audit-profiles --project-root ./tools/armor-actors --stage armor --apply-stage-only
python tools/dda_wikimon_tools.py audit-profiles --project-root ./tools/armor-actors --stage armor --apply-safe-only
```

- `--apply-equivalent-stage-only`: aplica apenas `system.specialForm.equivalentStage` quando a sugestão for segura. É o modo recomendado para Armor.
- `--apply-stage-only`: aplica apenas `system.stage` e `system.specialForm.equivalentStage`, quando forem seguros.
- `--apply-safe-only`: aplica todas as sugestões marcadas com `safe_apply: true`.
- `--apply` continua existindo como alias legado de `--apply-safe-only`.

Mesmo nos modos de aplicação, `type` e `field` continuam fora da aplicação automática porque são sugestões de revisão. A ferramenta também não escreve relações evolutivas em nenhum grafo do sistema; `Evolves From`, `Evolves To`, `partners` e `requirements` são apenas dados de auditoria/browser neste momento.

Para o lote Armor atual, o comando mais conservador é:

```powershell
python tools/dda_wikimon_tools.py audit-profiles --project-root ./tools/armor-actors --stage armor --apply-equivalent-stage-only
```

## v10 — aplicação em JSON exportado como lista

A v10 corrige a escrita em exports do Foundry salvos como um único JSON contendo uma lista de Actors.

Antes, caminhos como estes eram lidos corretamente pela auditoria, mas não eram editados:

```txt
dda-armor-actors-export.json#1
dda-armor-actors-export.json#22
```

Agora a ferramenta:

- reconhece o sufixo `#índice` como posição dentro da lista JSON;
- abre o arquivo exportado inteiro;
- valida se o Actor naquele índice tem o mesmo `name` esperado;
- se o índice não bater, tenta fallback por nome único dentro do mesmo arquivo;
- aplica a sugestão segura no Actor correto;
- salva o JSON inteiro novamente;
- cria backup `.bak` antes da primeira alteração;
- atualiza o relatório da própria execução depois do apply, removendo sugestões já aplicadas.

O comando recomendado para Armor continua sendo:

```powershell
python tools/dda_wikimon_tools.py audit-profiles --project-root ./tools/armor-actors --stage armor --apply-equivalent-stage-only
```

O log esperado agora deve ter linhas do tipo:

```txt
[APPLY:equivalent-stage-only] Nefertimon: specialForm.equivalentStage: '' → 'adult'
```

Se aparecer `[OK:equivalent-stage-only]`, significa que o campo já estava atualizado.
