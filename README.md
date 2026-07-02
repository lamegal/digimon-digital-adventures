# Digimon Digital Adventures V2 para Foundry VTT

![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v13-informational)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Idioma](https://img.shields.io/badge/idiomas-pt--BR%20%7C%20en-blue)

Sistema não oficial para jogar **Digimon Digital Adventures 2ª Edição** no **Foundry Virtual Tabletop**.

Este projeto é uma implementação feita por fã, para uso em mesas caseiras e campanhas pessoais. Ele busca oferecer uma experiência prática, organizada e agradável para narradores e jogadores que desejam usar o sistema **Digimon Digital Adventures** dentro do Foundry VTT.

> **Aviso importante:** este módulo/sistema não é oficial, não é comercial e não possui afiliação, patrocínio, aprovação ou endosso de Bandai, Toei Animation, Akiyoshi Hongo, WiZ, Digimon, Foundry Virtual Tabletop, The Forge, With the Will ou quaisquer outros detentores de direitos relacionados.

---

## Sobre o projeto

**Digimon Digital Adventures V2 para Foundry VTT** adapta para o Foundry uma estrutura de jogo voltada a campanhas com Digi-Escolhidos, Tamers, Digimon parceiros, evolução, vínculos, crescimento e combate tático-narrativo.

A proposta não é substituir os materiais originais do RPG, mas servir como uma ferramenta digital de mesa para quem já usa o sistema e deseja automatizar partes da experiência.

Atualmente o projeto está em estado **alpha**, com foco em funcionalidade, usabilidade e testes contínuos.

---

## Recursos principais

O sistema inclui suporte para:

- fichas de **Digi-Escolhido / Tamer**;
- fichas de **Digimon parceiro**;
- fichas de **NPCs**;
- ficha de **grupo**;
- Aspectos;
- PI, PE, Marcos e progressão;
- PD, Qualidades e Qualidades Negativas;
- Ataques, Tags e efeitos de combate;
- Tormentos;
- Posturas;
- Ações de Combate;
- Testes e Reservas;
- rolagens de Acerto, Dano, Esquiva, Armadura e Saúde;
- atributos derivados de Digimon: BIT, DOS, RAM e CPU;
- estágios evolutivos;
- grafo visual de evolução;
- Browser de escolhas evolutivas;
- ferramentas de Mestre para progresso do parceiro;
- suporte a regras opcionais e variações em desenvolvimento.

---

## Compatibilidade

Este sistema foi desenvolvido inicialmente para:

```txt
Foundry VTT v13
```

Compatibilidade declarada no `system.json`:

```json
{
  "minimum": "13",
  "verified": "13"
}
```

Versões futuras do Foundry podem exigir ajustes. O projeto foi estruturado com a intenção de facilitar manutenção e compatibilidade futura, mas não há garantia de funcionamento fora das versões testadas.

---

## Idiomas

O sistema inclui arquivos de localização para:

- Português (Brasil) — `pt-BR`
- English — `en`

O português brasileiro é o idioma principal de desenvolvimento deste projeto.

---

## Instalação manual

Enquanto não houver manifesto público de release, a instalação pode ser feita manualmente.

1. Baixe ou clone este repositório.
2. Coloque a pasta do sistema em:

```txt
FoundryVTT/Data/systems/digimon-digital-adventures
```

3. Reinicie o Foundry VTT.
4. Crie um novo mundo usando o sistema **Digimon Digital Adventures V2**.

A estrutura esperada é:

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

## Estado atual

Este projeto ainda está em desenvolvimento ativo.

Algumas ferramentas internas podem existir para testes, curadoria ou preparação de dados. Essas ferramentas são voltadas ao desenvolvimento e não necessariamente representam recursos finais para jogadores.

Antes de usar em uma campanha longa, recomenda-se testar:

- criação de Digi-Escolhido;
- criação de Digimon parceiro;
- vínculo entre Tamer e parceiro;
- rolagens principais;
- ataques;
- evolução;
- regressão ou troca de forma;
- Browser de evolução;
- grafo de evolução;
- progressão de PD e Qualidades.

---

## O que este repositório não inclui

Este repositório não deve incluir:

- texto integral de livros ou PDFs protegidos por direitos autorais;
- logotipos oficiais;
- scans de materiais publicados;

Qualquer referência a Digimon, nomes de Digimon, conceitos de evolução, Mundo Digital ou elementos associados existe apenas como referência nominativa e contextual para mesas de RPG feitas por fãs.

---

## Créditos e agradecimentos

Este projeto só existe por causa do trabalho de muitas pessoas que mantêm viva a ideia de jogar aventuras de Digimon na mesa.

Agradecimentos especiais aos **criadores, autores e mantenedores originais de Digimon Digital Adventures**, por terem construído e compartilhado com a comunidade uma base de RPG feita por fãs, para fãs. Este sistema de Foundry VTT é uma homenagem e uma ferramenta de apoio a esse trabalho, não uma substituição dele.

Também ficam os agradecimentos:

- à comunidade de jogadores e narradores de **Digimon Digital Adventures**;
- às pessoas que documentaram, testaram e discutiram regras ao longo dos anos;
- aos fãs que continuam criando campanhas, personagens, linhas evolutivas e mundos digitais próprios;
- à comunidade do **Foundry Virtual Tabletop**, por tornar possível esse tipo de automação para RPGs de mesa.

Desenvolvimento desta implementação para Foundry VTT:

```txt
Murilo Lamegal
```

---

## Aviso legal

**Digimon**, **Digital Monsters** e todos os nomes, marcas, personagens, criaturas, conceitos, imagens e referências relacionados pertencem aos seus respectivos detentores de direitos.

Este projeto é:

- não oficial;
- não comercial;
- feito por fã;
- distribuído sem intenção de violar propriedade intelectual;
- destinado apenas ao uso em mesas de RPG.

Este projeto não é afiliado, endossado, patrocinado ou aprovado por Bandai, Toei Animation, WiZ, Akiyoshi Hongo, Digimon, Foundry Virtual Tabletop ou quaisquer detentores de direitos associados.

Se você representa algum detentor de direitos e acredita que algum conteúdo deste repositório deve ser removido ou ajustado, abra uma issue ou entre em contato pelo repositório.

---

## Licença

Consulte o arquivo [`LICENSE`](LICENSE).

O código original desta implementação para Foundry VTT pode ser usado, modificado e compartilhado para fins não comerciais, desde que o aviso de licença seja preservado.

Nenhum conteúdo protegido por direitos autorais deve ser adicionado ao repositório sem permissão explícita dos respectivos detentores de direitos.

---

## Contribuições

Contribuições, correções e sugestões são bem-vindas, especialmente em áreas como:

- correção de bugs;
- melhorias de interface;
- revisão de localização;
- compatibilidade com novas versões do Foundry VTT;
- automação de regras;
- documentação.

Ao contribuir, evite incluir material protegido por direitos autorais que não possa ser redistribuído.

---

## Status de desenvolvimento

```txt
Versão atual: 2.0.0-alpha.1
Foundry VTT: v13
Status: em desenvolvimento ativo
```

Use em mesa com carinho, teste antes de sessões importantes e faça backup dos mundos regularmente.

