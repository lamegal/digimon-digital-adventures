// Macro de Script: selecione somente o token do parceiro que deseja corrigir.
try {
  const selected = canvas.tokens.controlled;
  const actor = selected.length === 1 ? selected[0].actor : null;
  if (!actor || actor.type !== "digimon" || !actor.isOwner) {
    ui.notifications.warn("Selecione um único token de parceiro Digimon que você pode editar.");
  } else {
    const { getDdaTokenPath } = await import("/systems/digimon-digital-adventures/scripts/data/dda-portrait-and-manual-digimon-data.js");
    const { applyDigimonTokenAppearanceToActorAndPlacedTokens } = await import("/systems/digimon-digital-adventures/scripts/tokens/digimon-token-scale.js");
    const names = actor.system.names ?? {};
    const textureSrc = await getDdaTokenPath({
      key: actor.system.sourceId || names.canonical || "",
      species: actor.system.species || actor.name,
      name: actor.system.species || actor.name,
      aliases: [names.original, names.dub, ...(names.aliases ?? [])].filter(Boolean)
    });
    if (!textureSrc) {
      ui.notifications.warn("Não foi encontrado um token oficial para esta espécie.");
    } else {
      await actor.update({ "system.evolution.tokenImg": textureSrc });
      await applyDigimonTokenAppearanceToActorAndPlacedTokens(actor, { textureSrc });
      ui.notifications.info(`Token de ${actor.name} corrigido.`);
    }
  }
} catch (error) {
  console.error("DDA | Falha ao corrigir o token do parceiro selecionado.", error);
  ui.notifications.error("Não foi possível corrigir o token. Consulte o console do Foundry.");
}
