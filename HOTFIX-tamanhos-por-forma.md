# Tamanho dos tokens por forma / Token sizes by form

Base: Digimon Digital Adventures v2.0.26-beta, Foundry VTT v13.

Nota histórica: este documento descreve o patch anterior à release. A funcionalidade foi incorporada à v2.0.27-beta; consulte `RELEASE-NOTES-v2.0.27-beta.md` para as notas atuais. / Historical note: this document describes the patch before release. This feature is included in v2.0.27-beta; see `RELEASE-NOTES-v2.0.27-beta.md` for current release notes.

## Português

Na ficha do Digimon, use o botão **Token de Protótipo** do Digivice e abra a aba **Formas**. A aba lista as formas salvas e os templates acessíveis do grafo, identifica a forma atual e permite configurar cada uma individualmente. O cabeçalho oculto da ficha continua oculto; o acesso não depende do menu de três pontos.

- **Ocupação real (quadrados):** largura × altura do token no mapa, como **1 × 1**, **2 × 2** ou **2 × 3**. Esses valores determinam a área ocupada, incluindo borda de seleção e geometria usada pelo Foundry. Aceita incrementos de 0,5.
- **Escala visual (×):** escala horizontal × vertical da imagem. **1 × 1** corresponde a 100%; **1,5 × 1,5** aumenta a imagem em 50% sem alterar sua ocupação. As inversões de imagem já existentes são preservadas.
- **Padrão:** restaura a ocupação automática conforme o tamanho da forma e a configuração de escala humana do mundo, com escala visual **1 × 1**. A alteração só é gravada ao salvar.
- **Salvar alterações:** use o botão nativo da configuração de token. Ele salva os campos normais do protótipo, como nome, visão e iluminação, e as linhas alteradas da aba Formas, cada uma no snapshot da própria forma. Se a forma atual foi alterada, aplica seus valores ao token de protótipo e aos tokens colocados nas cenas. As demais serão aplicadas quando você evoluir ou regredir para elas.
- **Fechar sem salvar/X:** descarta as alterações da aba. Consultar a janela não ativa formas, não altera suas fichas e não encerra Mode Change. Uma forma cujo template não possa ser carregado aparece sem permitir edição, evitando a criação de um snapshot incompleto.

Alterações de tamanho e escala feitas na aba nativa Aparência também são registradas no snapshot da forma atual. Se o tamanho da forma atual for editado nas duas abas no mesmo salvamento, os valores da aba Formas têm prioridade; inversões de imagem feitas em Aparência são preservadas. Se o Digimon mudar de forma com a janela aberta, reabra a configuração antes de salvar. A configuração individual de tokens no mapa e a configuração de protótipos de Tamers permanecem nativas.

Reabrir e salvar o wizard preserva as dimensões retangulares e a escala visual. Alterar explicitamente o tamanho quadrado no wizard passa a usar esse novo tamanho quadrado, mantendo a escala visual.

Este pacote é cumulativo: também contém as correções de cancelamento do Direct e dos Skill Checks e a seleção de Specs na barra de ações, entregues anteriormente.

**Instalação:** feche o mundo, sobreponha a pasta `digimon-digital-adventures` do ZIP à pasta de mesmo nome em `Data/systems` e reabra o mundo. Atualize os clientes com Ctrl+F5. O pacote contém apenas os arquivos alterados e deve ser instalado sobre a versão 2.0.26-beta. A versão do manifest permanece igual; nenhuma nova release foi publicada no GitHub.

## English

On the Digimon sheet, use the Digivice's **Prototype Token** button and open the **Forms** tab. It lists stored forms and accessible graph templates, marks the current form and lets you configure each one separately. The sheet header remains hidden; access does not require the three-dot menu.

- **Footprint (grid units):** the Token's width × height on the map, such as **1 × 1**, **2 × 2** or **2 × 3**. This controls the occupied area, including the selection border and Foundry geometry. Values use increments of 0.5.
- **Visual scale (×):** horizontal × vertical image scale. **1 × 1** means 100%; **1.5 × 1.5** enlarges the artwork by 50% without changing its footprint. Existing image flips are preserved.
- **Default:** restores automatic footprint calculation from the form's size and the world's human-scale setting, with **1 × 1** visual scale. It takes effect only after Save.
- **Save Changes:** use the native Token configuration button. It saves regular prototype fields, including name, vision and lighting, together with edited Forms rows, each to its own form snapshot. If the active form's settings changed, its prototype and placed Tokens are updated. Other forms use their saved settings when you evolve or regress to them.
- **Close without saving/X:** discards Forms drafts. Viewing the window does not activate forms, change their builds or end Mode Change. A form with an inaccessible template is shown without editing controls, avoiding incomplete evolution builds.

Size and scale edits in the native Appearance tab are also stored in the current form's snapshot. If the current form's dimensions are edited in both tabs in the same submission, Forms values take priority; image flips changed in Appearance are retained. If the Digimon changes form while the window is open, reopen configuration before saving. Individual placed-Token configuration and Tamer prototype configuration retain their native behavior.

Reopening and saving the form wizard preserves rectangular footprints and visual scale. Explicitly changing its square Token-size setting uses that new square size while retaining visual scale.

This cumulative patch also includes the previous Direct/Skill Check cancellation fixes and Spec checks in the Action bar.

**Installation:** close the world, copy the ZIP's `digimon-digital-adventures` folder over the matching folder in `Data/systems` and reopen the world. Refresh each client with Ctrl+F5. This patch contains only changed files and requires v2.0.26-beta. The manifest version is unchanged; no new GitHub release is published by this package.

## Validation

229 automated tests and 90 wizard/progression assertions passed using production modules and simulated Foundry APIs. Coverage includes the Prototype Token Forms tab and registration, native parts and submission, normal prototype fields, independent snapshots, repeated evolution/regression, placed Tokens, rectangular footprints, visual scales/flips, legacy data, Default/Close/Save, validation before submission, stale-form protection, ownership, inaccessible templates, wizard preservation and all previous cancellation/area/support checks. Live Foundry UI validation remains pending.
