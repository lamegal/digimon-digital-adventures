# Digimon Digital Adventures V2 for Foundry VTT

![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v13-informational)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Languages](https://img.shields.io/badge/languages-en%20%7C%20pt--BR-blue)

## Install now

**Use Foundry Virtual Tabletop Version 13 (V13).** This alpha currently declares compatibility with V13 only; compatibility with other Foundry releases is not declared.

1. Open the **Foundry Setup** screen.
2. Go to **Game Systems** → **Install System**.
3. Paste this Manifest URL into the field:

```txt
https://raw.githubusercontent.com/lamegal/digimon-digital-adventures/main/system.json
```

4. Click **Install**. After installation, create or open a world and select **Digimon Digital Adventures V2** as its game system.

For detailed installation, update, and troubleshooting instructions, see the [GitHub Wiki](https://github.com/lamegal/digimon-digital-adventures/wiki/Installation-and-Updates).

> ## ⚠️ Alpha Pre-Release
>
> This is an early testing build. Features may be incomplete, unstable, unbalanced, temporarily unavailable, or subject to breaking changes. Alpha updates may modify Actor data, worlds, automation, compendiums, and interface behavior.
>
> **Back up your world before installing or updating. Do not rely on work-in-progress automation during an important session.**

Digimon Digital Adventures V2 is an unofficial, fan-made Foundry Virtual Tabletop system for playing **Digimon Digital Adventures 2nd Edition**.

The project provides practical tools for DigiDestined, Tamers, Digimon partners, progression, evolution, tactical play, and campaign management inside Foundry VTT. It is not an official product and has no affiliation with, endorsement from, sponsorship by, or approval from Bandai, Toei Animation, Akiyoshi Hongo, WiZ, Digimon, Foundry Virtual Tabletop, The Forge, With the Will, or any related rights holder.

## Current development status

```txt
Supported Foundry VTT version: V13
Release channel: Alpha / Pre-Release
Languages: English and Portuguese (Brazil)
```

Development is active. The alpha is intended for testing, feedback, regression discovery, usability improvements, and automation validation before a stable release. Some features are finished enough for table use; others remain experimental or are still being expanded.

### Included or actively tested

- separate Actor sheets for DigiDestined / Tamers, Digimon partners, NPCs, and an active-player Group sheet for party tracking and Jogress discovery;
- Tamer and Digimon creation flows, including a current-form Digimon builder;
- Digimon DP, Qualities, Negative Qualities, Torments, attacks, and form-specific items;
- persistent partner forms, evolution, regression, and form swapping;
- portrait and token fields stored independently by Digimon form;
- visual evolution graphs and an evolution-choice browser;
- Game Master tools for partner progression;
- combat initiative that pairs a Tamer and their partner in the turn order;
- rolls for Tests and Reserves, combat actions, postures, and automated Core, Offensive, and Defensive Quality workflows;
- Digimon derived statistics: BIT, DOS, RAM, and CPU;
- compendium packs for Digimon stages and special-form templates;
- English and Brazilian Portuguese localization;
- optional rules and experimental automation.

Read the [GitHub Wiki home page](https://github.com/lamegal/digimon-digital-adventures/wiki/Home) for a guided overview, or start with [Quick Start](https://github.com/lamegal/digimon-digital-adventures/wiki/Quick-Start).

## Feedback and bug reports

When opening an issue, include the Foundry version, system version, browser/operating system, exact reproduction steps, screenshots, console errors when available, and whether the problem happens in a fresh world or an existing campaign. File reports at https://github.com/lamegal/digimon-digital-adventures/issues.

## Credits

### Foundry VTT implementation

Created and maintained by:

```txt
Murilo Lamegal
```

Special thanks to **ZeppyDingus**, creator of the current 2nd Edition of Digimon Digital Adventures, and to everyone who helped build, test, review, and keep the game alive through the years.

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

### Initial closed test of this Foundry VTT system

Special thanks to the people who took part in the first closed test of this implementation:

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

My sincere apologies if someone important has been unintentionally left out. A huge thank-you also goes to the entire **Digimon Digital Adventures Discord community** for conversations, ideas, testing, rules discussions, encouragement, and continued passion for the game.

### Personal thanks

I want to thank my friends and players **Mário F. Nulle, Aline de Santis, Guilherme França, Jennifer Ortega França, Murilo Anderson, Maicon Minatti, Renato Zacarias, Layle Garcia, Cloves Ferreira, Ariel Xavier, Jean Nakamoto, Felipe de Carvalho,** and **Ana Carolina de Carvalho**; and, of course, my dear brother **Gabriel Augusto** and my incredible wife **Luiza Lamegal**.

Thank you all for always supporting me and lifting me up when I need it. Without you, I certainly would not have found the strength to get this far. Thank you, every one of you, for every moment we have shared and every die we have rolled.

### Digivice Artwork

The Digivices used in this project were created by [Zeniltonjrart](https://www.deviantart.com/zeniltonjrart), with the exception of the **Kindness**, **Miracles**, and **Fate** Digivices, which were created by [indigoblue36](https://www.deviantart.com/indigoblue36).

### General thanks

Thanks to the Digimon Digital Adventures community, the Foundry VTT community, testers, contributors, and everyone keeping Digimon tabletop campaigns alive.

## Legal notice

Digimon, Digital Monsters, and all related names, trademarks, characters, creatures, concepts, images, and references belong to their respective rights holders.

This project is unofficial, non-commercial, fan-made, intended for tabletop RPG use, and not a replacement for original books, materials, or publications. The repository does not provide original Digimon Digital Adventures books, scans, or complete copyrighted rule text. Each user is responsible for obtaining and using external game materials lawfully.

If you represent a rights holder and believe repository content should be reviewed, corrected, or removed, please contact the maintainer through the repository.

## License

The original code written for this Foundry VTT system may be used, modified, and shared for non-commercial purposes, provided that the included license notice is preserved. Do not add copyrighted material to the repository unless it can be legally redistributed.

---

# Digimon Digital Adventures V2 para Foundry VTT

![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v13-informational)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Idiomas](https://img.shields.io/badge/idiomas-en%20%7C%20pt--BR-blue)

## Instale agora

**Use o Foundry Virtual Tabletop Versão 13 (V13).** Esta alpha declara compatibilidade apenas com V13; a compatibilidade com outras versões do Foundry não está declarada.

1. Abra a tela **Setup** do Foundry.
2. Vá em **Game Systems** → **Install System**.
3. Cole esta URL de Manifest no campo:

```txt
https://raw.githubusercontent.com/lamegal/digimon-digital-adventures/main/system.json
```

4. Clique em **Install**. Ao terminar, crie ou abra um mundo e selecione **Digimon Digital Adventures V2** como sistema de jogo.

Para instruções detalhadas de instalação, atualização e solução de problemas, veja a [Wiki do GitHub](https://github.com/lamegal/digimon-digital-adventures/wiki/Installation-and-Updates).

> ## ⚠️ Pré-release Alpha
>
> Esta é uma versão inicial de testes. Recursos podem estar incompletos, instáveis, desbalanceados, temporariamente indisponíveis ou sofrer alterações que quebrem compatibilidade. Atualizações alpha podem modificar dados de Atores, mundos, automações, compêndios e comportamento da interface.
>
> **Faça backup do mundo antes de instalar ou atualizar. Não dependa de automações em desenvolvimento durante uma sessão importante.**

Digimon Digital Adventures V2 é um sistema não oficial, feito por fãs, para jogar **Digimon Digital Adventures 2ª Edição** no **Foundry Virtual Tabletop**.

O projeto oferece ferramentas práticas para Digi-Escolhidos, Tamers, Digimon parceiros, progressão, evolução, jogo tático e gerenciamento de campanha dentro do Foundry VTT. Não é um produto oficial e não possui afiliação, endosso, patrocínio ou aprovação de Bandai, Toei Animation, Akiyoshi Hongo, WiZ, Digimon, Foundry Virtual Tabletop, The Forge, With the Will ou quaisquer detentores de direitos relacionados.

## Estado atual do desenvolvimento

```txt
Versão compatível do Foundry VTT: V13
Canal de lançamento: Alpha / Pré-release
Idiomas: English e Português (Brasil)
```

O desenvolvimento está ativo. A alpha existe para testes, feedback, descoberta de regressões, melhorias de usabilidade e validação de automações antes de uma versão estável. Alguns recursos já estão suficientemente prontos para uso em mesa; outros são experimentais ou ainda estão sendo ampliados.

### Incluído ou em teste ativo

- fichas separadas de Digi-Escolhido / Tamer, Digimon parceiro, NPC e um Grupo de jogadores ativos para acompanhar a party e descobrir possíveis Jogress;
- fluxos de criação de Tamer e Digimon, incluindo o builder da forma atual do Digimon;
- PD de Digimon, Qualidades, Qualidades Negativas, Tormentos, ataques e itens específicos de cada forma;
- formas persistentes do parceiro, evolução, regressão e troca de forma;
- retrato e token armazenados de maneira independente por forma do Digimon;
- grafo visual e navegador de escolhas evolutivas;
- ferramentas de Mestre para a progressão do parceiro;
- iniciativa de combate que pareia Tamer e parceiro na ordem de turnos;
- rolagens de Testes e Reservas, ações de combate, posturas e fluxos automatizados de Qualidades Centrais, Ofensivas e Defensivas;
- estatísticas derivadas BIT, DOS, RAM e CPU;
- compêndios de Digimon por estágio e de modelos de formas especiais;
- localização em inglês e português brasileiro;
- regras opcionais e automações experimentais.

Leia a [página inicial da Wiki](https://github.com/lamegal/digimon-digital-adventures/wiki/Home) para uma visão guiada ou comece em [Quick Start](https://github.com/lamegal/digimon-digital-adventures/wiki/Quick-Start).

## Feedback e relatos de bugs

Ao abrir uma issue, inclua a versão do Foundry, versão do sistema, navegador/sistema operacional, passos exatos para reproduzir, capturas de tela, erros de console quando existirem e se o problema ocorre em mundo novo ou campanha existente. Envie em https://github.com/lamegal/digimon-digital-adventures/issues.

## Créditos

### Implementação para Foundry VTT

Criado e mantido por:

```txt
Murilo Lamegal
```

Agradecimentos especiais a **ZeppyDingus**, criador da atual 2ª Edição de Digimon Digital Adventures, e a todas as pessoas que ajudaram a construir, testar, revisar e manter o jogo vivo ao longo dos anos.

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

### Teste fechado inicial deste sistema para Foundry VTT

Agradecimentos especiais às pessoas que participaram do primeiro teste fechado desta implementação:

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

Desculpas sinceras caso alguém importante tenha sido esquecido. Também fica um enorme agradecimento a toda a comunidade do Discord de **Digimon Digital Adventures**, pelas conversas, ideias, testes, discussões de regras, incentivo e paixão contínua pelo jogo.

### Agradecimentos pessoais

Agradeço aos meus amigos e jogadores **Mário F. Nulle, Aline de Santis, Guilherme França, Jennifer Ortega França, Murilo Anderson, Maicon Minatti, Renato Zacarias, Layle Garcia, Cloves Ferreira, Ariel Xavier, Jean Nakamoto, Felipe de Carvalho** e **Ana Carolina de Carvalho**; e é claro, meu querido irmão **Gabriel Augusto** e minha esposa incrível **Luiza Lamegal**.

Obrigado por sempre me apoiarem e me levantarem quando eu preciso, galera. Sem vocês, eu com certeza não teria tido forças para chegar até aqui. Obrigado a cada um de vocês por cada momento que compartilhamos e cada dado lançado!

### Artes dos Digivices

Os Digivices usados neste projeto foram feitos por [Zeniltonjrart](https://www.deviantart.com/zeniltonjrart), com exceção dos Digivices de **Compaixão (Kindness)**, **Milagre (Miracles)** e **Destino (Fate)**, criados por [indigoblue36](https://www.deviantart.com/indigoblue36).

### Agradecimentos gerais

Agradecimentos à comunidade de Digimon Digital Adventures, à comunidade do Foundry VTT, às pessoas testadoras, colaboradoras e a todos que mantêm campanhas de Digimon vivas nas mesas de RPG.

## Aviso legal

Digimon, Digital Monsters e todos os nomes, marcas, personagens, criaturas, conceitos, imagens e referências relacionados pertencem aos seus respectivos detentores de direitos.

Este projeto é não oficial, não comercial, feito por fãs, destinado ao uso em mesas de RPG e não substitui livros, materiais ou publicações originais. Este repositório não fornece livros originais de Digimon Digital Adventures, scans ou texto integral protegido por direitos autorais. Cada pessoa usuária é responsável por obter e usar materiais externos de forma legal.

Caso você represente algum detentor de direitos e acredite que conteúdo do repositório deve ser revisado, corrigido ou removido, entre em contato pelo repositório.

## Licença

O código original desta implementação para Foundry VTT pode ser usado, modificado e compartilhado para fins não comerciais, desde que o aviso de licença incluído seja preservado. Não adicione material protegido por direitos autorais ao repositório sem autorização ou sem que ele possa ser redistribuído legalmente.