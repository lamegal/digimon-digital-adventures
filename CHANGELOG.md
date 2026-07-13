## 2.0.4-beta

### English

This update focuses on Partner creation and form persistence, combat stability, Tamer Talent automation, Quality handling, progression fixes, and general system polish.

#### Partner Creation and Evolution

- Expanded the Partner Creation Wizard with improved per-form mechanical building.
- Improved Starting Stage and Main Form handling.
- Improved persistence of Partner form snapshots.
- Improved preservation of Attacks between Partner forms.
- Improved preservation of portrait and token images between evolution and regression.
- Removed the redundant Tamer creation prompt when editing an existing Partner form.
- Improved current-form and future-form editing workflows.
- Added scrolling to the selected Qualities column in Partner Creation.
- Improved the Quality Browser filter layout and collapsible filter controls.
- Improved Build Template and form-specific configuration handling.
- Fixed Algomon Perfect using Algomon Ultimate's profile portrait.
- Fixed several Partner Wizard DP, image, selection, and rendering issues.

#### Tamer Talents

- Added automation for Experienced.
- Added automation for Break the Chain.
- Added automation for Avoiding Consequences.
- Added automation for Tuck and Roll.
- Added automation for No Pain, No Gain.
- Added Grit defense automation, allowing Endurance to replace Evade.
- Added Grit survival automation, allowing a Tamer to remain at 1 Wound Box.
- Improved Lucky Number automation and reward handling.
- Improved triggered Talent usage, charges, Rest recovery, and chat feedback.

#### Combat and Damage

- Improved Dodge request cancellation and timeout handling.
- Fixed stale or unresolved Dodge requests.
- Fixed Fumble Attack tie behavior so equal Accuracy and Dodge correctly results in a miss.
- Improved stable Attack identification between chat cards and resolution.
- Fixed Attack resolution errors involving undefined Dodge data.
- Fixed temporal initialization errors in Attack resolution.
- Added minimum Damage handling for Grit defenses.
- Improved central Damage application and survival interception.
- Improved damage card feedback for Talents and automated effects.
- Fixed Signature Move battery consumption.
- Improved direct Digimon Main Stat rolls.
- Improved combat effect and end-of-turn handling.

#### Rest and Resources

- Tamer Rest now also applies Rest recovery to the linked Partner Digimon.
- Improved Tamer Talent use recovery during Rest.
- Improved shared Partner and Tamer resource recovery.
- Improved action and combat resource synchronization.

#### Digivolution and Progression

- Normal Digivolution now restores the Digimon to full Wound Boxes.
- Fixed Tamer Attribute Cap progression after Milestones.
- Increased the supported Digimon Main Stat cap to 20.
- Improved evolution form data and snapshot normalization.
- Improved portrait and token selection during form transitions.

#### Qualities and Attacks

- Improved Area Attack Quality selection and synchronization.
- Improved Advanced Effect Quality selection and synchronization.
- Improved Quality choice cleanup in Item sheets.
- Improved unavailable Quality detection and filtering.
- Improved Core Discount, free Quality, and Negative Quality calculations.
- Improved form-specific Quality storage and restoration.
- Fixed multiple Quality Browser display and interaction issues.

#### Interface and Localization

- Added missing English and Brazilian Portuguese localization keys.
- Improved Tamer Talent prompts, cards, costs, and result messages.
- Improved Partner Creation interface scrolling and layout.
- Improved several chat cards and system notifications.
- Fixed assorted interface, localization, portrait, Rest, combat, and Wizard issues.

### Português

Esta atualização é focada na criação e persistência do Parceiro, estabilidade do combate, automação de Talentos de Digi-Escolhido, funcionamento das Qualidades, progressão e melhorias gerais do sistema.

#### Criação do Parceiro e Evolução

- Expandido o Wizard de Criação do Parceiro com melhorias no builder mecânico por forma.
- Melhorado o funcionamento do Estágio Inicial e da Forma Principal.
- Melhorada a persistência dos snapshots das formas do Parceiro.
- Melhorada a preservação dos Ataques entre as formas do Parceiro.
- Melhorada a preservação de retratos e tokens durante evolução e regressão.
- Removida a pergunta redundante de criação de Digi-Escolhido ao editar uma forma de Parceiro existente.
- Melhorados os fluxos de edição da forma atual e de formas futuras.
- Adicionada rolagem à coluna de Qualidades selecionadas na Criação do Parceiro.
- Melhorado o layout dos filtros e o painel colapsável do Browser de Qualidades.
- Melhorado o funcionamento dos Templates de Build e configurações específicas por forma.
- Corrigido Algomon Perfect usando o retrato de perfil de Algomon Ultimate.
- Corrigidos diversos problemas de PD, imagens, seleção e renderização no Wizard do Parceiro.

#### Talentos de Digi-Escolhido

- Adicionada automação para Experienced.
- Adicionada automação para Break the Chain.
- Adicionada automação para Avoiding Consequences.
- Adicionada automação para Tuck and Roll.
- Adicionada automação para No Pain, No Gain.
- Adicionada automação de defesa para Grit, permitindo usar Resistência no lugar de Evasão.
- Adicionada automação de sobrevivência para Grit, permitindo permanecer com 1 Caixa de Ferimento.
- Melhorada a automação e concessão de recompensas de Lucky Number.
- Melhorados os usos, cargas, recuperação por Descanso e mensagens dos Talentos ativados por gatilho.

#### Combate e Dano

- Melhorado o cancelamento e o timeout das solicitações de Esquiva.
- Corrigidas solicitações de Esquiva antigas ou que permaneciam sem resolução.
- Corrigido o empate de Acerto e Esquiva durante um Ataque Fumble para resultar corretamente em erro.
- Melhorada a identificação estável de Ataques entre os cards e a resolução.
- Corrigidos erros de resolução envolvendo dados de Esquiva indefinidos.
- Corrigidos erros de inicialização temporal durante a resolução de Ataques.
- Adicionado o Dano mínimo das defesas realizadas com Grit.
- Melhorada a aplicação central de Dano e a interceptação de efeitos de sobrevivência.
- Melhorados os cards de Dano para Talentos e efeitos automatizados.
- Corrigido o consumo de Bateria de Signature Move.
- Melhoradas as rolagens diretas dos Atributos Principais de Digimon.
- Melhorado o processamento de efeitos de combate e fim de turno.

#### Descanso e Recursos

- O Descanso do Digi-Escolhido agora também aplica a recuperação de Descanso ao Digimon Parceiro vinculado.
- Melhorada a recuperação dos usos dos Talentos durante o Descanso.
- Melhorada a recuperação compartilhada de recursos entre Parceiro e Digi-Escolhido.
- Melhorada a sincronização de Ações e recursos de combate.

#### Digievolução e Progressão

- A Digievolução normal agora restaura completamente as Caixas de Ferimento do Digimon.
- Corrigida a progressão do Limite de Atributos do Digi-Escolhido após Marcos.
- Aumentado para 20 o limite suportado dos Atributos Principais de Digimon.
- Melhoradas a normalização e persistência dos dados das formas evolutivas.
- Melhorada a seleção de retratos e tokens durante transições de forma.

#### Qualidades e Ataques

- Melhorada a seleção e sincronização de Qualidades de Ataque em Área.
- Melhorada a seleção e sincronização de Qualidades de Efeito Avançado.
- Melhorada a limpeza das escolhas de Qualidade nas fichas de Item.
- Melhorados a detecção e o filtro de Qualidades indisponíveis.
- Melhorados os cálculos de Desconto Central, Qualidade gratuita e Qualidades Negativas.
- Melhorado o armazenamento e a restauração de Qualidades específicas por forma.
- Corrigidos diversos problemas visuais e de interação no Browser de Qualidades.

#### Interface e Localização

- Adicionadas traduções ausentes em inglês e português brasileiro.
- Melhorados os prompts, cards, custos e resultados dos Talentos de Digi-Escolhido.
- Melhorados a rolagem e o layout da interface de Criação do Parceiro.
- Melhorados diversos cards de chat e notificações do sistema.
- Corrigidos diversos problemas de interface, tradução, retratos, Descanso, combate e Wizards.

---

## 2.0.3-beta

### English

This release marks the official transition of Digimon Digital Adventures V2 from alpha into beta. Version 2.0.3-beta consolidates several major systems into a more playable, testable, and visually polished foundation, including enemy creation tools, partner progression tools, canvas health indicators, Digivice control improvements, and Actor Directory UI polish.

This is still a beta release. Some advanced automations, special evolution flows, and deeper quality interactions are still in development, but the system now has a much stronger gameplay foundation for real table use.

#### Highlights

- Added the Enemy Digimon Wizard.
- Added the Enemy Quality Browser.
- Added Tamer Advancement tools.
- Added GM Partner Progress tools.
- Added canvas health pips.
- Added enemy Digivice assets.
- Added custom Actor Directory action icons.
- Improved Digivice physical button behavior.
- Fixed player access to Digivice sheet close controls.
- Improved visual consistency across Tamer, Partner Digimon, and Enemy Digimon sheets.
- Updated the project version to 2.0.3-beta.

#### Enemy Digimon Wizard

- Added a new wizard for creating Enemy Digimon directly from the Actor Directory.
- Added support for enemy species, stage, type, attribute, family, field, and group data.
- Added DP budget tracking for enemy creation.
- Added attribute distribution during enemy creation.
- Added attack creation inside the wizard.
- Added quality selection for enemies.
- Added support for positive, negative, and free qualities.
- Added DP spent, DP remaining, and budget overflow display.
- Added automatic creation of NPC actors with selected attacks and qualities.
- Added dedicated styling for the Enemy Digimon Wizard.

#### Enemy Quality Browser

- Added a dedicated quality browser for Enemy Digimon creation.
- Added search and filtering tools.
- Added support for quality cost/tier filtering.
- Added support for displaying requirements and incompatibilities.
- Added support for qualities that require choices.
- Added support for qualities that require selecting an attack.
- Added integration with attacks created during the Enemy Digimon Wizard flow.
- Added visual feedback for unavailable or blocked qualities.

#### Canvas and Combat UI

- Added health pips around tokens on the canvas.
- Added visual health tracking for Tamers, Partner Digimon, and Enemy Digimon.
- Added separate visual behavior for friendly and enemy tokens.
- Improved token readability during combat scenes.
- Added canvas-side support for clearer health state feedback.

#### Partner Progress and Tamer Advancement

- Added GM Partner Progress Panel.
- Added support for campaign milestones.
- Added support for individual milestone handling.
- Added support for party/group milestone handling.
- Added tools for tracking linked Tamers and Partner Digimon.
- Added stage unlock controls for partner evolution progress.
- Added support for crest/Digivice reveal handling when the compatibility questionnaire is enabled.
- Added Tamer Advancement interface and related progression support.

#### Digivice Sheet Controls

- Fixed Digivice close button behavior for non-GM players.
- Reworked Digivice physical button markup to avoid sheet permission conflicts.
- Improved Close, Sheet Configuration, and Prototype Token button behavior.
- Reordered physical Digivice button roles:
  - left button: Close;
  - upper-right button: Sheet Configuration;
  - lower-right button: Prototype Token.
- Removed old conflicting glow effects from Digivice buttons.
- Improved hover effects so the real underlying Digivice button color is enhanced instead of replaced.
- Removed duplicate/legacy button tooltip behavior.
- Improved Digivice button visuals across Tamer, Partner Digimon, and Enemy Digimon sheets.

#### Actor Directory UI

- Added custom icons for Actor Directory action buttons:
  - Partner Progress;
  - Create Tamer;
  - Create Partner Digimon;
  - Create Enemy Digimon.
- Added distinct button colors for faster recognition:
  - blue for Partner Progress;
  - amber for Tamer creation;
  - green for Partner Digimon creation;
  - purple/magenta for Enemy Digimon creation.
- Improved button size, spacing, typography, hover states, and icon alignment.
- Replaced several generic Font Awesome icons with project-specific SVG assets.

#### Assets

- Added `assets/ui/digimon-enemy.webp`.
- Added `assets/ui/digimon.svg`.
- Added `assets/ui/enemy-digimon.svg`.
- Added `assets/ui/progress-partner.svg`.
- Added `assets/ui/tamer.svg`.
- Renamed `assets/digimon/tokens/ShineGreymon_Burst.webp` to `assets/digimon/tokens/ShineGreymonBurstMode.webp`.

#### Fixes

- Fixed player inability to close certain Digivice sheets.
- Fixed old Digivice hover/glow effects appearing on enemy sheets.
- Fixed inconsistent Actor Directory button styling.
- Fixed SVG icon sizing for Tamer and Partner Progress buttons.
- Fixed ShineGreymon Burst Mode token naming consistency.
- Improved several visual inconsistencies in sheet controls and wizard interfaces.
- Cleaned up UI behavior around Digivice button hitboxes.

---

### Português

Esta versão marca a transição oficial do Digimon Digital Adventures V2 do estágio alpha para beta. A versão 2.0.3-beta consolida vários sistemas importantes em uma base mais jogável, testável e visualmente polida, incluindo ferramentas de criação de inimigos, progresso de parceiros, indicadores de saúde no canvas, melhorias nos controles do Digivice e polimento da interface do Diretório de Atores.

Esta ainda é uma versão beta. Algumas automações avançadas, fluxos de evolução especial e interações mais profundas de Qualidades continuam em desenvolvimento, mas o sistema agora possui uma base muito mais sólida para uso real em mesa.

#### Destaques

- Adicionado o Enemy Digimon Wizard.
- Adicionado o Enemy Quality Browser.
- Adicionadas ferramentas de Tamer Advancement.
- Adicionadas ferramentas de GM Partner Progress.
- Adicionados pips de saúde no canvas.
- Adicionados assets de Digivice inimigo.
- Adicionados ícones customizados para ações do Diretório de Atores.
- Melhorado o comportamento dos botões físicos do Digivice.
- Corrigido o acesso de jogadores ao botão de fechar das fichas com Digivice.
- Melhorada a consistência visual entre fichas de Tamer, Partner Digimon e Enemy Digimon.
- Atualizada a versão do projeto para 2.0.3-beta.

#### Enemy Digimon Wizard

- Adicionado um novo wizard para criar Digimon inimigos diretamente pelo Diretório de Atores.
- Adicionado suporte a espécie, estágio, tipo, atributo, família, campo e grupo do inimigo.
- Adicionado controle de orçamento de DP para criação de inimigos.
- Adicionada distribuição de atributos durante a criação.
- Adicionada criação de ataques dentro do wizard.
- Adicionada seleção de Qualidades para inimigos.
- Adicionado suporte a Qualidades positivas, negativas e gratuitas.
- Adicionada exibição de DP gasto, DP restante e estouro de orçamento.
- Adicionada criação automática de atores NPC com ataques e Qualidades selecionados.
- Adicionado CSS dedicado para o Enemy Digimon Wizard.

#### Enemy Quality Browser

- Adicionado um browser de Qualidades dedicado ao fluxo de criação de Digimon inimigos.
- Adicionadas ferramentas de busca e filtro.
- Adicionado suporte a filtro por custo/tier de Qualidade.
- Adicionada exibição de requisitos e incompatibilidades.
- Adicionado suporte a Qualidades que exigem escolhas.
- Adicionado suporte a Qualidades que exigem seleção de ataque.
- Adicionada integração com ataques criados durante o fluxo do Enemy Digimon Wizard.
- Adicionado feedback visual para Qualidades indisponíveis ou bloqueadas.

#### Canvas e interface de combate

- Adicionados pips de saúde ao redor dos tokens no canvas.
- Adicionado acompanhamento visual de saúde para Tamers, Partner Digimon e Enemy Digimon.
- Adicionado comportamento visual separado para tokens aliados e inimigos.
- Melhorada a leitura dos tokens durante cenas de combate.
- Adicionado suporte visual no canvas para representar melhor o estado de saúde.

#### Partner Progress e Tamer Advancement

- Adicionado o painel de GM Partner Progress.
- Adicionado suporte a marcos de campanha.
- Adicionado suporte a marcos individuais.
- Adicionado suporte a marcos de grupo/party.
- Adicionadas ferramentas para acompanhar Tamers e Partner Digimon vinculados.
- Adicionados controles de liberação de estágios para progresso de evolução do parceiro.
- Adicionado suporte à revelação de brasão/Digivice quando o questionário de compatibilidade estiver ativo.
- Adicionada interface de Tamer Advancement e suporte relacionado à progressão.

#### Controles das fichas com Digivice

- Corrigido o comportamento do botão de fechar do Digivice para jogadores não-GM.
- Reestruturado o markup dos botões físicos do Digivice para evitar conflitos de permissão da ficha.
- Melhorado o comportamento dos botões Close, Sheet Configuration e Prototype Token.
- Reordenadas as funções dos botões físicos do Digivice:
  - botão esquerdo: Close;
  - botão direito superior: Sheet Configuration;
  - botão direito inferior: Prototype Token.
- Removidos brilhos antigos conflitantes dos botões do Digivice.
- Melhorado o efeito de hover para intensificar a cor real do botão por baixo, em vez de substituir a aparência dele.
- Removido comportamento duplicado/antigo de tooltips dos botões.
- Melhorado o visual dos botões do Digivice em fichas de Tamer, Partner Digimon e Enemy Digimon.

#### Interface do Diretório de Atores

- Adicionados ícones customizados para botões de ação do Diretório de Atores:
  - Partner Progress;
  - Create Tamer;
  - Create Partner Digimon;
  - Create Enemy Digimon.
- Adicionadas cores distintas para reconhecimento rápido:
  - azul para Partner Progress;
  - âmbar para criação de Tamer;
  - verde para criação de Partner Digimon;
  - roxo/magenta para criação de Enemy Digimon.
- Melhorados tamanho, espaçamento, tipografia, hover e alinhamento dos ícones.
- Substituídos vários ícones genéricos do Font Awesome por SVGs próprios do projeto.

#### Assets

- Adicionado `assets/ui/digimon-enemy.webp`.
- Adicionado `assets/ui/digimon.svg`.
- Adicionado `assets/ui/enemy-digimon.svg`.
- Adicionado `assets/ui/progress-partner.svg`.
- Adicionado `assets/ui/tamer.svg`.
- Renomeado `assets/digimon/tokens/ShineGreymon_Burst.webp` para `assets/digimon/tokens/ShineGreymonBurstMode.webp`.

#### Correções

- Corrigida a impossibilidade de jogadores fecharem certas fichas com Digivice.
- Corrigidos efeitos antigos de hover/glow aparecendo em fichas de inimigos.
- Corrigida a inconsistência visual dos botões do Diretório de Atores.
- Corrigido o tamanho dos ícones SVG dos botões de Tamer e Partner Progress.
- Corrigida a consistência do nome do token de ShineGreymon Burst Mode.
- Melhoradas inconsistências visuais em controles de ficha e interfaces de wizard.
- Ajustado o comportamento visual das áreas clicáveis dos botões do Digivice.