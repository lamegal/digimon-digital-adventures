# Academia DDA com Hina / DDA Academy with Hina

## Português (Brasil)

Academia DDA com Hina - DDA 2.0.28-beta / Foundry VTT v13. 14 capitulos e 84 etapas integradas aos Tours nativos. Consulte as notas desta atualizacao para conhecer tambem as correcoes de idioma e os visuais de condicoes.

### Instalar

1. Feche o mundo e faça uma cópia da pasta atual do sistema.
2. Extraia o ZIP em `Data/systems`, substituindo os arquivos da pasta `digimon-digital-adventures`. O pacote é uma atualização: mantenha os demais arquivos do sistema instalado.
3. Abra o mundo e atualize a página com `Ctrl+F5` para carregar os novos módulos, estilos e traduções.

### Abrir e usar

- Na barra lateral **Configurações**, clique em **Academia DDA com Hina**.
- A entrada também aparece em **Configurar definições → Digimon Digital Adventures**.
- Nas fichas de Tamer e Digimon há um botão com **chapéu de formatura** ao lado das abas.
- Os capítulos também ficam no **Gerenciamento de Tours** do Foundry, com progresso, retomada e reinício nativos.

Escolha suas fichas na Academia para visitar seus controles. A opção **Sem ficha** permite acompanhar as explicações sem abrir outra ficha. Para o menu radial, coloque um token na cena; a etapa de Direct/Reinforce usa o Tamer e a de Specs usa o Digimon. A ausência de uma ficha, token ou ramificação do wizard não impede a leitura.

Use os botões e setas do Tour para conhecer as telas. **Fazer esta etapa com a Hina** pausa o Tour e abre uma janela de acompanhamento que deixa a interface livre. Preencha os campos, use os botões normais do criador ou faça a atividade indicada. A explicação acompanha as mudanças de etapa do criador e reconhece a criação da ficha. **Continuar / pular etapa** permanece disponível mesmo sem concluir a atividade; não confirma escolhas nem salva personagens.

A Hina não executa ações por você. As atividades de Check, Direct e ataques usam as regras, custos e consequências reais da mesa, incluindo Ações em combate. Prepare a cena e os alvos com o narrador. Cancelar um diálogo não é registrado como atividade concluída. A resolução de um alvo de área não substitui as respostas dos demais.

Quando uma ficha, token ou tela estiver indisponível, o acompanhamento informa o que falta. **Mostrar os controles** reabre a tela da etapa sem avançar a explicação ou apagar o resultado observado. Escolher **Sem ficha** mantém essa escolha também nas etapas do menu radial; tokens não vinculados ao ator continuam sendo reconhecidos quando pertencem à ficha escolhida e você pode controlá-los.

O percurso do narrador também oferece acompanhamento no criador de NPCs. Você escolhe espécie, alinhamento, orçamento e construção no próprio criador e confirma a criação pelo botão normal. A Hina reconhece o novo NPC e mantém a dupla Tamer–Digimon escolhida para o restante do tutorial.

Ao concluir um capítulo, a Academia sugere o próximo e mantém as fichas escolhidas. O Tamer ou Digimon criado com acompanhamento passa a ser a referência do percurso. Se o criador abrir o parceiro em seguida, esse rascunho e suas escolhas são reaproveitados. Um criador novo só recebe um vínculo pendente quando isso não substitui o parceiro já cadastrado. A criação e a vinculação continuam dependendo da confirmação normal do jogador.

Em leitura, um wizard preexistente volta à sua página original ao sair do Tour. Durante a prática, a última página editada é preservada. Fechar o acompanhamento retira seus observadores e deixa o rascunho disponível. A seleção de fichas e o ponto do acompanhamento são guardados nas preferências do usuário. Rascunhos não confirmados são preservados apenas na sessão atual do navegador; atualizar a página não salva nem recupera suas escolhas automaticamente.

O planejador aberto pela visita usa um contexto de consulta: não atualiza snapshots nem encerra um Mode Change ativo. Os comandos normais de edição continuam exigindo uma escolha sua.

Se houver uma falha temporária ao salvar o progresso do Tour depois de criar a ficha, o capítulo mantém **Continuar** e reaproveita o registro da criação na retomada. **Recomeçar** continua sendo uma escolha explícita para iniciar o capítulo novamente.

### Conteúdo

| Percurso do jogador | Percurso do narrador |
| --- | --- |
| Primeiros passos e a dupla Tamer–Digimon | Ferramentas, sessão e permissões |
| Criação de Tamer | Painel de Progresso e liberação de estágios |
| Criação de Digimon | Criação de NPCs e preparação de encontros |
| Fichas e recursos | Regras opcionais e valores atuais das configurações |
| Checks, Pools, Specs e Inspiração | Aviso de integração em desenvolvimento |
| Menu radial e Ações | |
| Vínculo da dupla e links entre formas | |
| Planejamento e snapshots | |
| Evolução, regressão e tamanhos dos tokens | |
| Combate, áreas e Efeitos | |
| Prática opcional: Check, Direct, ataque e área | |

As falas acompanham o idioma do Foundry: **Português (Brasil)** ou **English**. Os capítulos exclusivos do narrador não aparecem no percurso do jogador. As explicações foram conferidas nos arquivos fornecidos do *Player’s Companion* e do *Game Master’s Index* e nas telas da implementação publicada. Referências de seção aparecem nas etapas correspondentes; os livros não são incluídos neste pacote.

### Imagens e validação

As **oito expressões da Hina** usam recortes de **248 × 496 px**, todos da primeira fileira da imagem fornecida. O arquivo original é preservado e os recortes são feitos pelo estilo da interface. A exibição é sempre **160 × 320 px**, com largura e altura mínimas e máximas fixas, inclusive em janelas estreitas e antes do carregamento da imagem. A troca de humor mantém a escala e a caixa da personagem.

Foram verificados os módulos reais do tutorial com APIs simuladas do Foundry, as duas traduções, os recortes, permissões, seleção de fichas, retomada, preservação de rascunhos, cancelamento e isolamento entre participantes. Os métodos reais de criação de Tamer, Digimon e NPC também são exercitados. No Chromium, os templates, estilos e os percursos de acompanhamento de jogador e narrador são conferidos com uma sessão simulada. Isso **não substitui a validação de uma sessão ativa do Foundry v13**: confira abertura das telas, destaques, posicionamento dos balões e retorno aos rascunhos antes da publicação.

Testes, na raiz do sistema:

```powershell
node --experimental-vm-modules --test tests/hina-academy.mjs
node --experimental-vm-modules --test tests/academy-creation-events.mjs
node --experimental-vm-modules --test tests/area-template-geometry.mjs tests/blast-turn-regression.mjs tests/dialog-cancel-specs.mjs tests/huge-power-area-dodge.mjs tests/partner-token-creation.mjs tests/support-quality-attacks.mjs
node --experimental-vm-modules tests/wizard-hotfix.mjs
```

### Conferência em uma sessão real

Use uma cena de preparação e fichas de teste. Faça o percurso como jogador e como narrador, em português e inglês:

1. Abra a Academia pelas Configurações e pelo botão da ficha. Confira os capítulos disponíveis para cada papel, os destaques e o tamanho constante da Hina.
2. Comece a criação de Tamer e Digimon, edite campos, feche o acompanhamento e retome. Crie pelo botão normal do criador e confira se o próximo capítulo usa a ficha criada e preserva o rascunho do parceiro.
3. Escolha **Sem ficha**, visite o menu radial e use **Mostrar os controles**. Depois escolha uma ficha e coloque seu token na cena; confira também um token não vinculado.
4. Visite vínculo, links evolutivos, planejamento e tamanhos por forma. Confira que a leitura não altera snapshots nem encerra um Mode Change. Confirme ajustes, evolução ou regressão apenas se desejar aplicá-los à ficha de teste.
5. Na prática, cancele um Check e um Direct antes de confirmar outros. Resolva um ataque e um ataque em área com pelo menos dois alvos. Confira as respostas individuais, a continuidade do ataque e os custos normais das ações.
6. Como narrador, crie um NPC com acompanhamento e confira que a dupla selecionada permanece a mesma. Visite o Painel de Progresso e as regras opcionais sem alterar valores; confira o aviso de integração em desenvolvimento.

Esses passos exigem uma sessão ativa do Foundry v13; não estão marcados como concluídos pela validação automatizada.

## English

DDA Academy with Hina - DDA 2.0.28-beta / Foundry VTT v13. 14 chapters and 84 steps using native Tours. See this release's notes for the language fixes and condition visuals as well.

### Install

1. Close the world and back up the current system folder.
2. Extract the ZIP into `Data/systems`, replacing files in `digimon-digital-adventures`. This is an update package: retain the installed system’s other files.
3. Open the world and refresh with `Ctrl+F5` to load the new modules, styles and translations.

### Open and follow

- Click **DDA Academy with Hina** in the **Settings** sidebar.
- It is also available under **Configure Settings → Digimon Digital Adventures**.
- Tamer and Digimon sheets have a **graduation-cap button** beside their tabs.
- Chapters also appear in Foundry **Tour Management**, with native progress, resume and restart controls.

Choose your sheets in the Academy to visit their controls. **No sheet** lets you read without opening another character. Place a Token in the Scene for radial-menu lessons: Direct/Reinforce uses a Tamer Token and Spec Checks use a Digimon Token. Missing sheets, Tokens or wizard branches do not prevent reading.

Use the Tour arrows to explore the views. **Do this step with Hina** pauses the Tour and opens a movable guide while leaving the interface free. Fill fields, use the wizard’s normal buttons or perform the indicated activity. The explanation follows wizard page changes and recognizes successful character creation. **Continue / skip step** remains available without completing the activity; it does not confirm choices or save characters.

Hina does not perform Actions for you. Check, Direct and Attack activities use real game rules, costs and consequences, including combat Actions. Prepare the Scene and targets with the GM. Cancelling a dialog is not recorded as completing an activity. One Area target’s resolution does not replace the other targets’ responses.

When a sheet, Token or view is unavailable, the guide explains what is missing. **Show the controls** reopens the current view without advancing the explanation or clearing an observed result. Choosing **No sheet** also applies to radial-menu lessons. Unlinked Tokens are recognized when they belong to the selected Actor and you can control them.

The GM path also offers guided NPC creation. Choose the species, alignment, budget and build in the builder, then confirm using its normal Create NPC button. Hina recognizes the new NPC while retaining the Tamer–Digimon duo selected for the rest of the tutorial.

After completing a chapter, the Academy suggests the next one and retains your selected sheets. A Tamer or Digimon created during guided practice becomes the reference for the following chapters. If its wizard opens the partner wizard next, that draft and its choices are reused. A new creator only receives a pending bond when doing so will not replace an existing partner. Creation and linking still require the player’s normal confirmation.

In reading mode, an existing wizard returns to its original page when the Tour exits. Practice preserves the last page you edited. Closing the guide removes its listeners and leaves the draft available. Sheet selection and the guided checkpoint are retained in user preferences. Unconfirmed drafts are kept only during the current browser session; refreshing the page does not automatically save or restore their choices.

The planner opened by a guided visit uses a read-only context: it does not update snapshots or end active Mode Change. Normal editing commands still require your choice.

If saving native Tour progress temporarily fails after character creation, the chapter retains **Resume** and reuses the creation checkpoint when resumed. **Restart** remains an explicit choice to begin the chapter again.

Player chapters cover the duo, creation of both characters, sheets, Checks and Pools, Specs, Inspiration, the radial menu, Actions, duo bonds, evolution links, planning, snapshots, evolution, regression, Token dimensions, combat, areas and Effects. Optional guided practice covers a Check, Direct, an Attack with Dodge and an Area Attack. GM chapters cover permissions, session tools, the Progress Panel, Stage release, NPC creation, encounters and optional settings. Optional-feature integration is explicitly marked **in development**, alongside current setting values.

Text follows Foundry’s **English** or **Português (Brasil)** language. GM-only chapters are hidden from the player path. Explanations were checked against the supplied *Player’s Companion* and *Game Master’s Index* files and the published system’s UI. Relevant steps include section references; the books are not bundled.

### Images and validation

Hina’s **eight expressions** use equal **248 × 496 px** crops from the supplied image’s first row. The original file is preserved; interface styles select each crop. Every expression displays at a fixed **160 × 320 px**, including narrow windows and the time before image loading. Changing mood preserves the character’s scale and display box.

Tests exercise production tutorial modules against simulated Foundry APIs, both translations, crops, permissions, sheet selection, resuming, draft preservation, cancellation and participant isolation. The actual Create methods for Tamers, Digimon and NPCs are also exercised. Production templates, styles and the player and GM guided flows are checked in Chromium using a simulated session. **Live Foundry v13 validation is still required** for view opening, highlights, balloon placement and returning to drafts before publication. The test commands above apply to both languages.

### Live session checks

Use a preparation Scene and test characters. Follow the path as a player and GM, in English and Portuguese:

1. Open the Academy from Settings and the sheet button. Check role-specific chapters, highlights and Hina’s constant portrait size.
2. Start creating a Tamer and Digimon, edit fields, close the guide and resume. Confirm creation through the wizard’s normal button. Check that the next chapter uses the created sheet and preserves the partner draft.
3. Choose **No sheet**, visit the radial menu and use **Show the controls**. Then select a sheet and place its Token in the Scene; also check an unlinked Token.
4. Visit duo bonds, evolution links, planning and form Token sizes. Confirm that reading does not change snapshots or end Mode Change. Only confirm edits, evolution or regression when you intend to apply them to the test character.
5. During practice, cancel a Check and Direct before confirming other attempts. Resolve an Attack and an Area Attack with at least two targets. Check individual responses, Attack completion and normal Action costs.
6. As GM, create a guided NPC and verify that the selected duo stays unchanged. Visit the Progress Panel and optional settings without editing values; check the integration-in-development notice.

These steps require an active Foundry v13 session; automated validation does not mark them as completed.

## Art source

Hina character art: the supplied *Mobile - Digimon Links - Characters - Hina.png* sheet. Only the first outfit is displayed. No generated replacement art is used.
