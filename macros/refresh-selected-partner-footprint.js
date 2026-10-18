// Macro de Script: selecione somente o token cuja ocupação deseja atualizar.
try {
  const selected = canvas.tokens.controlled;
  const actor = selected.length === 1 ? selected[0].actor : null;
  if (!actor || actor.type !== "digimon" || !actor.isOwner) {
    ui.notifications.warn("Selecione um único token de parceiro Digimon que você pode editar.");
  } else {
    const { applyDigimonTokenScaleToActorAndPlacedTokens } = await import("/systems/digimon-digital-adventures/scripts/tokens/digimon-token-scale.js");
    await applyDigimonTokenScaleToActorAndPlacedTokens(actor);
    const document = selected[0].document;
    const width = document._source?.width ?? document.width;
    const height = document._source?.height ?? document.height;
    ui.notifications.info(`Ocupação de ${actor.name}: ${width} × ${height}. Rastro antigo de outra ocupação removido, quando existente.`);
  }
} catch (error) {
  console.error("DDA | Falha ao atualizar a ocupação do token.", error);
  ui.notifications.error("Não foi possível atualizar a ocupação. Consulte o console do Foundry.");
}
