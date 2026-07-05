# Digimon Digital Adventures V2 for Foundry VTT

![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v13-informational)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Languages](https://img.shields.io/badge/languages-pt--BR%20%7C%20en-blue)

> ## ⚠️ Alpha Pre-Release
>
> This is an early testing build. Features may be incomplete, unstable, unbalanced, temporarily unavailable, or subject to breaking changes.
>
> Alpha updates may modify character sheets, Actor data, worlds, automation, compendiums, and interface behavior.
>
> **Do not use this version in an important campaign without backups.**

Digimon Digital Adventures V2 is an unofficial, fan-made Foundry Virtual Tabletop system for playing **Digimon Digital Adventures 2nd Edition**.

The project aims to provide practical tools for DigiDestined, Tamers, Digimon partners, progression, evolution, tactical combat, and campaign management inside Foundry VTT.

This project is not official and is not affiliated with, endorsed by, sponsored by, or approved by Bandai, Toei Animation, Akiyoshi Hongo, WiZ, Digimon, Foundry Virtual Tabletop, The Forge, With the Will, or any related rights holders.

---

## Current status

```txt
System version: 2.0.0-alpha.1
Foundry VTT: v13
Release channel: Alpha / Pre-Release
```

Development is active. This build exists to gather testing feedback, identify regressions, improve usability, and validate automation before a stable release.

Expect unfinished features, visual inconsistencies, partial localization, balance adjustments, and occasional bugs.

---

## Important testing notice

Before installing or updating the system:

- back up your Foundry world;
- use a separate testing world whenever possible;
- do not assume alpha updates are compatible with older data;
- do not rely on work-in-progress automation during an important session;
- report unexpected behavior with as much detail as possible.

When reporting a bug, include:

- Foundry VTT version;
- system version;
- browser and operating system;
- steps required to reproduce the issue;
- screenshots or console errors, when available;
- whether the issue happens in a new world or an existing world.

---

## Features under testing

The alpha currently includes, in varying stages of development:

- DigiDestined / Tamer sheets;
- Digimon partner sheets;
- NPC and group sheets;
- Aspects, PI, PE, milestones, and progression;
- Digimon DP, Qualities, Negative Qualities, and attacks;
- Torments;
- combat actions, stances, checks, and reserves;
- Digimon derived statistics: BIT, DOS, RAM, and CPU;
- evolution stages;
- visual evolution graphs;
- evolution-choice browser;
- Game Master tools for partner progression;
- Digimon creation wizard;
- current-form and future-form builders;
- persistent forms, evolution, regression, and form swapping;
- automatic Digimon token resolution;
- Portuguese (Brazil) and English localization;
- optional rules and experimental automation.

Not every feature is final, fully automated, balanced, or ready for long-running campaign use.

---

## Compatibility

The system currently targets:

```txt
Foundry Virtual Tabletop v13
```

Declared compatibility:

```json
{
  "minimum": "13",
  "verified": "13"
}
```

Compatibility with future Foundry VTT versions is not guaranteed.

---

## Installation

Future public alpha releases will provide an installation manifest and a downloadable `.zip` archive.

Until a public manifest is available, install manually:

1. Download the release archive.
2. Extract the folder into:

```txt
FoundryVTT/Data/systems/digimon-digital-adventures
```

3. Restart Foundry VTT.
4. Create or open a world using **Digimon Digital Adventures V2**.

Expected structure:

```txt
digimon-digital-adventures/
  system.json
  template.json
  scripts/
  styles/
  templates/
  lang/
  assets/
  LICENSE
  README.md
```

---

## Languages

The system currently includes:

- Portuguese (Brazil) — `pt-BR`
- English — `en`

Portuguese (Brazil) is the primary development language.

---

## Feedback and testing

Feedback is especially welcome regarding:

- bugs and regressions;
- broken sheets, windows, or dialogs;
- evolution and persistent-form behavior;
- Digimon creation and form builders;
- combat flow;
- token behavior;
- localization issues;
- visual or accessibility issues;
- compatibility with Foundry VTT v13.

Please test carefully and keep backups of your worlds before updating.

---

## Credits

### Foundry VTT implementation

Created and maintained by:

```txt
Murilo Lamegal
```
Special thanks to my players and friends **Mário F. Nulle** (https://github.com/mariofnulle), **Guilherme França**, **Murilo Anderson**, **Maicon Minatti**, **Cloves Ferreira**, **Renato Zacarias**, **Aline de Santis**, **Layle Garcia**, **Jean Nakamoto**, **Ariel Xavier**, **Victor Barrio**, and—of course—my dear brother **Gabriel Augusto** and my dear wife **Luiza Lamegal**, for always supporting me whenever I decide to do something crazy like this. Thanks for always having my back, everyone!
Special thanks to **ZeppyDingus**, creator of the current 2nd Edition of Digimon Digital Adventures, and to everyone who helped build, test, review, and maintain the game through the years.

### Digimon Digital Adventures development

The following credits are attributed to the people responsible for the development of Digimon Digital Adventures, as listed on the final page of the *Player's Guide*.

#### System Developers

```txt
Digimon Emperor
(Start - Version 8)

TM93
(Version 9 - Version 13)

Alycoris
(Version 14 + Illustrations)

ZeppyDingus, Alycoris and Kranic
(2nd Edition)
```

#### Contributors

```txt
223hero7
heliotropeHero
Koru
Mallow
SirTideTheHunter
SmugCoffeeMan
Vyrozeal
```

#### 2nd Edition Playtesters

```txt
Zenxas
Dr. Digitama
ItsGaz
TheMeev
Boz
ZeroHeart10
DeltaMachina
Kritik Kainan & Friends
N1ro_the_GM
heliotropeHero
SmugCoffeeMan
CaptainCrossbones
Vyrozeal
Figon
```

### Initial closed test of this system

Special thanks to the people who took part in the first closed test of this Foundry VTT implementation:

```txt
DeltaMachina
Quag
Rordrik
Ruby Summer
Burningchill
Temmye
heliotropeHero
Figon
```

My sincere apologies if someone important has been unintentionally left out of this list.

A huge thank-you also goes to the entire **Digimon Digital Adventures Discord community** for the conversations, ideas, testing, rules discussions, encouragement, and continued passion for the game.

### Digivice Artwork

The Digivices used in this project were created by [Zeniltonjrart](https://www.deviantart.com/zeniltonjrart), with the exception of the **Kindness**, **Miracles**, and **Fate** Digivices, which were created by [indigoblue36](https://www.deviantart.com/indigoblue36).

It was not possible to contact indigoblue36 before this publication. If the artist wishes for their artwork to be removed from the project, the maintainer undertakes to promptly remove the corresponding content.

### General thanks

Thanks to the Digimon Digital Adventures community, the Foundry VTT community, testers, contributors, and everyone keeping Digimon tabletop campaigns alive.

---

## Legal notice

Digimon, Digital Monsters, and all related names, trademarks, characters, creatures, concepts, images, and references belong to their respective rights holders.

This project is:

- unofficial;
- non-commercial;
- fan-made;
- intended for tabletop RPG use;
- not a replacement for original books, materials, or publications.

This repository does not provide original Digimon Digital Adventures books, scans, or complete copyrighted rule text. Each user is responsible for obtaining and using external game material lawfully.

If you represent a rights holder and believe content in this repository should be reviewed, corrected, or removed, please contact the maintainer through the repository.

---

## License

The original code written for this Foundry VTT system may be used, modified, and shared for non-commercial purposes, provided that the included license notice is preserved.

Do not add copyrighted material to the repository unless it can be legally redistributed.

---

# Digimon Digital Adventures V2 para Foundry VTT

![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v13-informational)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Idiomas](https://img.shields.io/badge/idiomas-pt--BR%20%7C%20en-blue)

> ## ⚠️ Pré-release Alpha
>
> Esta é uma versão inicial de testes. Recursos podem estar incompletos, instáveis, desbalanceados, temporariamente indisponíveis ou sofrer alterações que quebrem compatibilidade.
>
> Atualizações alpha podem modificar fichas, dados de Atores, mundos, automações, compêndios e comportamento da interface.
>
> **Não use esta versão em uma campanha importante sem fazer backups.**

Sistema não oficial, feito por fãs, para jogar **Digimon Digital Adventures 2ª Edição** no **Foundry Virtual Tabletop**.

O projeto busca oferecer ferramentas práticas para Digi-Escolhidos, Tamers, Digimon parceiros, progressão, evolução, combate tático e gerenciamento de campanha dentro do Foundry VTT.

Este projeto não é oficial e não possui afiliação, patrocínio, aprovação ou endosso de Bandai, Toei Animation, Akiyoshi Hongo, WiZ, Digimon, Foundry Virtual Tabletop, The Forge, With the Will ou quaisquer outros detentores de direitos relacionados.

---

## Estado atual

```txt
Versão do sistema: 2.0.0-alpha.1
Foundry VTT: v13
Canal de lançamento: Alpha / Pré-release
```

O desenvolvimento está ativo. Esta versão existe para receber testes, encontrar regressões, melhorar a usabilidade e validar automações antes de uma versão estável.

Espere recursos incompletos, inconsistências visuais, localização parcial, ajustes de balanceamento e bugs ocasionais.

---

## Aviso importante para testes

Antes de instalar ou atualizar o sistema:

- faça backup do seu mundo no Foundry;
- use, sempre que possível, um mundo separado para testes;
- não presuma que uma atualização alpha manterá compatibilidade com dados antigos;
- não dependa de automações em desenvolvimento durante uma sessão importante;
- reporte comportamentos inesperados com o máximo de detalhes possível.

Ao reportar um bug, inclua: 

- versão do Foundry VTT;
- versão do sistema;
- navegador e sistema operacional;
- passos necessários para reproduzir o problema;
- capturas de tela ou erros do console, quando possível;
- se o problema acontece em um mundo novo ou em um mundo já existente.

---

## Recursos em teste

A versão alpha inclui, em diferentes estágios de desenvolvimento:

- fichas de Digi-Escolhido / Tamer;
- fichas de Digimon parceiros;
- fichas de NPCs e grupos;
- Aspectos, PI, PE, Marcos e progressão;
- PD, Qualidades, Qualidades Negativas e Ataques;
- Tormentos;
- Ações de Combate, Posturas, Testes e Reservas;
- atributos derivados de Digimon: BIT, DOS, RAM e CPU;
- estágios evolutivos;
- grafo visual de evolução;
- navegador de escolhas evolutivas;
- ferramentas de Mestre para progresso de parceiros;
- Wizard de criação de Digimon;
- Builder de forma atual e de formas futuras;
- formas persistentes, evolução, regressão e troca de forma;
- resolução automática de tokens de Digimon;
- localização em Português do Brasil e Inglês;
- regras opcionais e automações experimentais.

Nem todos os recursos estão finalizados, completamente automatizados, balanceados ou prontos para uma campanha longa.

---

## Compatibilidade

O sistema foi desenvolvido atualmente para:

```txt
Foundry Virtual Tabletop v13
```

Compatibilidade declarada:

```json
{
  "minimum": "13",
  "verified": "13"
}
```

A compatibilidade com versões futuras do Foundry VTT não é garantida.

---

## Instalação

As futuras releases públicas alpha disponibilizarão um manifesto de instalação e um arquivo `.zip` para download.

Enquanto não houver um manifesto público, a instalação deve ser feita manualmente:

1. Baixe o arquivo da release.
2. Extraia a pasta em:

```txt
FoundryVTT/Data/systems/digimon-digital-adventures
```

3. Reinicie o Foundry VTT.
4. Crie ou abra um mundo usando o sistema **Digimon Digital Adventures V2**.

Estrutura esperada:

```txt
digimon-digital-adventures/
  system.json
  template.json
  scripts/
  styles/
  templates/
  lang/
  assets/
  LICENSE
  README.md
```

---

## Idiomas

O sistema inclui atualmente:

- Português (Brasil) — `pt-BR`
- English — `en`

O Português do Brasil é o idioma principal de desenvolvimento.

---

## Feedback e testes

Feedback é muito bem-vindo, especialmente sobre:

- bugs e regressões;
- fichas, janelas ou diálogos quebrados;
- evolução e persistência de formas;
- criação de Digimon e builders de forma;
- fluxo de combate;
- comportamento dos tokens;
- problemas de localização;
- problemas visuais ou de acessibilidade;
- compatibilidade com Foundry VTT v13.

Teste com cuidado e mantenha backups dos seus mundos antes de atualizar.

---

## Créditos

### Implementação para Foundry VTT

Criado e mantido por:

```txt
Murilo Lamegal
```
Agradecimentos a meus jogadores e amigos **Mário F. Nulle** (https://github.com/mariofnulle), **Guilherme França**, **Murilo Anderson**, **Maicon Minatti**, **Cloves Ferreira**, **Renato Zacarias**, **Aline de Santis**, **Layle Garcia**, **Jean Nakamoto**, **Ariel Xavier**, **Victor Barrio** e é claro, meu querido irmão **Gabriel Augusto** e minha esposa **Luiza Lamegal**, por sempre me apoiarem quando eu decido cometer uma loucura como essa. Obrigado por sempre me apoiarem galera!
Agradecimentos especiais a **ZeppyDingus**, criador da atual 2ª Edição de Digimon Digital Adventures, e a todas as pessoas que ajudaram a construir, testar, revisar e manter esse sistema vivo ao longo dos anos.

### Desenvolvimento de Digimon Digital Adventures

Os créditos abaixo são atribuídos às pessoas responsáveis pelo desenvolvimento de Digimon Digital Adventures, conforme apresentados na página final do *Player's Guide*.

#### Desenvolvedores do Sistema

```txt
Digimon Emperor
(Start - Version 8)

TM93
(Version 9 - Version 13)

Alycoris
(Version 14 + Illustrations)

ZeppyDingus, Alycoris and Kranic
(2nd Edition)
```

#### Contribuidores

```txt
223hero7
heliotropeHero
Koru
Mallow
SirTideTheHunter
SmugCoffeeMan
Vyrozeal
```

#### Playtesters da 2ª Edição

```txt
Zenxas
Dr. Digitama
ItsGaz
TheMeev
Boz
ZeroHeart10
DeltaMachina
Kritik Kainan & Friends
N1ro_the_GM
heliotropeHero
SmugCoffeeMan
CaptainCrossbones
Vyrozeal
Figon
```

### Teste fechado inicial deste sistema

Agradecimentos especiais às pessoas que participaram do primeiro teste fechado desta implementação para Foundry VTT:

```txt
DeltaMachina
Quag
Rordrik
Ruby Summer
Burningchill
Temmye
heliotropeHero
Figon
```

Desculpas sinceras caso alguém importante tenha sido esquecido nesta lista.

Também fica um enorme agradecimento a toda a comunidade do Discord de **Digimon Digital Adventures**, pelas conversas, ideias, testes, discussões de regras, incentivo e paixão contínua pelo jogo.

### Artes dos Digivices

Os Digivices utilizados neste projeto foram feitos por [Zeniltonjrart](https://www.deviantart.com/zeniltonjrart), com exceção dos Digivices de **Compaixão (Kindness)**, **Milagre (Miracles)** e **Destino (Fate)**, que foram feitos por [indigoblue36](https://www.deviantart.com/indigoblue36).

Não foi possível estabelecer contato com indigoblue36 antes desta publicação. Caso o artista deseje que suas artes sejam removidas do projeto, o mantenedor se compromete a remover prontamente os conteúdos correspondentes.

### Agradecimentos gerais

Agradecimentos à comunidade de Digimon Digital Adventures, à comunidade do Foundry VTT, às pessoas testadoras, colaboradoras e a todos que mantêm campanhas de Digimon vivas nas mesas de RPG.

---

## Aviso legal

Digimon, Digital Monsters e todos os nomes, marcas, personagens, criaturas, conceitos, imagens e referências relacionados pertencem aos seus respectivos detentores de direitos.

Este projeto é:

- não oficial;
- não comercial;
- feito por fãs;
- destinado ao uso em mesas de RPG;
- não substitui livros, materiais ou publicações originais.

Este repositório não fornece os livros originais de Digimon Digital Adventures, scans ou texto integral protegido por direitos autorais. Cada usuário é responsável por obter e utilizar qualquer material externo de forma legal.

Caso você represente algum detentor de direitos e acredite que algum conteúdo deste repositório deve ser revisado, corrigido ou removido, entre em contato por meio do repositório.

---

## Licença

O código original desta implementação para Foundry VTT pode ser usado, modificado e compartilhado para fins não comerciais, desde que o aviso de licença incluído seja preservado.

Não adicione material protegido por direitos autorais ao repositório sem autorização ou sem que ele possa ser redistribuído legalmente.

---
