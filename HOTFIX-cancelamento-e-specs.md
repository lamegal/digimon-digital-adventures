# Cancelamento e testes de Specs / Cancel buttons and Spec checks

Base: Digimon Digital Adventures v2.0.26-beta, Foundry VTT v13.

Nota histórica: este documento descreve o patch anterior à release. As correções foram incorporadas à v2.0.27-beta; consulte `RELEASE-NOTES-v2.0.27-beta.md` para as notas atuais. / Historical note: this document describes the patch before release. These fixes are included in v2.0.27-beta; see `RELEASE-NOTES-v2.0.27-beta.md` for current release notes.

Este documento descreve a correção de cancelamento anterior. O pacote cumulativo atual também inclui o editor de tamanhos por forma, descrito em `HOTFIX-tamanhos-por-forma.md`. / This document describes the earlier cancellation patch. The current cumulative package also includes the per-form Token size editor documented in `HOTFIX-tamanhos-por-forma.md`.

## Português

O botão Cancelar do Direct e dos Skill Checks do Tamer e do Digimon devolvia `null`. O DialogV2 pode substituir esse retorno pelo identificador textual do botão (`"cancel"`), que passava pela verificação anterior e fazia o sistema continuar. Os botões agora devolvem `false`, e os fluxos de formulário rejeitam identificadores textuais no lugar dos dados confirmados.

- Cancelar, X e Esc interrompem os testes, sem rolagem ou mensagem de resultado. No Direct, o cancelamento não aplica o bônus nem marca a ação como usada. O Skill Check pela barra do Tamer devolve a Ação que havia reservado.
- A barra do Digimon oferece Ações → Teste → Teste de Pool ou Teste de Perícia (Specs). O segundo caminho permite BIT, DOS, RAM e CPU e abre o mesmo diálogo da ficha, com perícia disponível, modificador e NA opcional.
- A ação Teste pela barra continua custando 2 Ações. O pagamento só ocorre ao confirmar Rolar; cancelar ou fechar o diálogo não gasta Ações. Rolar diretamente na ficha mantém seu comportamento anterior, sem cobrança automática nova.
- Textos novos disponíveis em português e inglês. Macros e código de tamanho, ocupação e evolução dos tokens não foram alterados.

Instalação: encerre o mundo, copie o conteúdo da pasta `digimon-digital-adventures` deste ZIP sobre a pasta de mesmo nome em `Data/systems`, substitua os arquivos e reabra o mundo. Atualize a página de cada cliente com Ctrl+F5. O pacote contém somente os arquivos da correção; instale-o sobre a versão 2.0.26-beta já existente. A versão do manifest continua 2.0.26-beta; não há publicação nova no GitHub neste pacote.

## English

Direct and Tamer/Digimon Skill Check Cancel buttons returned `null`. DialogV2 can replace this nullish callback result with the button's action identifier (`"cancel"`), which passed the old check and allowed execution to continue. Cancel buttons now return `false`, and form-based workflows reject action strings instead of treating them as confirmed form data.

- Cancel, X and Esc stop the checks without rolling or posting a result. Cancelling Direct does not apply its bonus or record its use. Cancelling a Tamer Action-bar Skill Check refunds its reserved Action.
- The Digimon Action bar offers Actions → Check → Pool Check or Skill Check (Specs). The latter exposes BIT, DOS, RAM and CPU and reuses the sheet dialog, including an available Skill bonus, manual modifier and optional TN.
- A Check from the Action menu retains its 2-Action cost. Payment occurs only after Roll is confirmed; cancellation or dismissal preserves Actions. Direct sheet-roll shortcuts retain their previous behavior without a new automatic Action charge.
- New labels are available in English and Portuguese. Token size, footprint, evolution and repair macro code have not changed.

Installation: shut down the world, copy the contents of this ZIP's `digimon-digital-adventures` folder over the same folder in `Data/systems`, replace the files and reopen the world. Refresh each client's page with Ctrl+F5. This is a patch containing only the changed files; apply it to an existing v2.0.26-beta installation. The manifest version remains 2.0.26-beta; this package does not publish a new GitHub release.

## Validation

66 new tests passed in PT-BR and English using production modules and simulated Foundry v13 DialogV2 callbacks. Coverage includes Cancel, native dismissal, correct confirmed rolls and Direct bonuses, Action costs/refunds, insufficient Actions, both Check branches and all four Specs. The previous 133 combat/area/support/token tests and 83 wizard/progression assertions passed as well. Live Foundry validation is still needed.

Run the new tests with:

```sh
node --experimental-vm-modules --test tests/dialog-cancel-specs.mjs
```
