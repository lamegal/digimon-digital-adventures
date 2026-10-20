# Digimon Digital Adventures v2.0.27-beta

## Português (Brasil)

### Correções

- Corrigido o botão Cancelar do Direct e dos Skill Checks de Tamers e Digimon. Cancelar ou fechar o diálogo interrompe a ação sem rolagem, mensagem de resultado, aplicação de Direct ou custo de Ações. A ação reservada pelo Skill Check do Tamer é devolvida.
- Testes de Pool pela barra de ações agora cobram Ações somente depois da confirmação da rolagem. Cancelar preserva as Ações e os bônus temporários.

### Novidades

- A barra de ações do Digimon oferece **Ações → Teste → Teste de Pool / Teste de Perícia (Specs)**. O teste de Specs permite escolher BIT, DOS, RAM ou CPU, com bônus de perícia, modificador manual e NA opcional. A ação Teste pela barra mantém o custo de 2 Ações, pago somente ao confirmar; os atalhos de rolagem direta da ficha mantêm seu funcionamento anterior.
- Nova aba **Formas** em **Ficha do Digimon → Token de Protótipo no Digivice → Formas**. Ela reúne as formas salvas e permite configurar, individualmente, a **ocupação real no mapa (largura × altura)** e a **escala visual da imagem (horizontal × vertical)**. Cada forma possui sua própria opção Padrão.
- Os tamanhos são salvos no snapshot de cada forma. Evolução e regressão restauram a ocupação e a escala da forma de destino, incluindo dimensões retangulares e inversões de imagem. Alterações da forma atual também são aplicadas ao protótipo e aos tokens nas cenas.
- O botão nativo de salvar registra os campos normais do Token de Protótipo e as alterações da aba Formas. Alterações de tamanho e escala na aba Aparência também são registradas na forma atual. Se as duas abas alterarem suas dimensões, os valores de Formas têm prioridade, preservando as inversões de imagem feitas em Aparência.
- Fechar sem salvar descarta as alterações da aba Formas. Consultar as formas não as ativa nem encerra Mode Change. Formas com templates inacessíveis aparecem sem edição, e a janela solicita reabertura caso o Digimon mude de forma antes de salvar.
- O wizard preserva dimensões retangulares e escala visual já configuradas. Alterar explicitamente seu tamanho quadrado substitui a ocupação por esse novo tamanho.
- Novos textos disponíveis em português e inglês.

## English

### Fixes

- Fixed Cancel on Direct and Tamer/Digimon Skill Checks. Cancelling or dismissing the dialog stops the action without rolling, posting a result, applying Direct or spending Actions. Tamer Skill Checks refund their reserved Action.
- Action-bar Pool Checks now charge Actions only after the roll is confirmed. Cancelling preserves Actions and temporary bonuses.

### New features

- The Digimon Action bar now offers **Actions → Check → Pool Check / Skill Check (Specs)**. Spec checks support BIT, DOS, RAM and CPU, with a Skill bonus, manual modifier and optional TN. The Action-menu Check retains its 2-Action cost, paid only after confirmation; direct sheet-roll shortcuts retain their previous behavior.
- Added a **Forms** tab at **Digimon sheet → Prototype Token on the Digivice → Forms**. It lists saved forms and lets you set each form's **map footprint (width × height)** and **artwork scale (horizontal × vertical)** independently. Every form has its own Default option.
- Settings are saved in each form's snapshot. Evolution and regression restore the destination form's footprint and scale, including rectangular dimensions and image flips. Edits to the active form also update its prototype and placed Tokens.
- The native Save button handles regular Prototype Token fields and Forms edits together. Size and scale edits in Appearance are also recorded in the active form's snapshot. When both tabs edit its dimensions, Forms values take priority while retaining image flips changed in Appearance.
- Closing without saving discards Forms drafts. Viewing forms does not activate them or end Mode Change. Forms with inaccessible templates are shown without editing controls, and the window requests reopening if the Digimon changes form before submission.
- The form wizard preserves configured rectangular footprints and visual scale. Explicitly changing its square-size setting replaces the footprint with that square size.
- New text is available in English and Portuguese.

## Compatibilidade e validação / Compatibility and validation

- Foundry Virtual Tabletop **v13**. Pré-release / Pre-release.
- **229 testes automatizados e 90 verificações do wizard/progressão aprovados**, usando os módulos reais do sistema com APIs simuladas do Foundry. / **229 automated tests and 90 wizard/progression assertions passed**, using production system modules with simulated Foundry APIs.
- A aparência da nova aba e seu comportamento em uma sessão ativa do Foundry ainda precisam de validação no jogo. / The new tab's appearance and behavior in a live Foundry session still need in-game validation.
