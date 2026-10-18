// Macro de Script, somente leitura: selecione um único token do parceiro.
try {
  const selected = canvas.tokens.controlled;
  const token = selected.length === 1 ? selected[0] : null;
  if (!token?.actor || token.actor.type !== "digimon" || !token.actor.isOwner) {
    ui.notifications.warn("Selecione um único token de parceiro Digimon que você pode editar.");
  } else {
    const actor = token.actor;
    const document = token.document;
    const dimensions = (data) => data ? {
      width: data.width ?? null, height: data.height ?? null
    } : null;
    const history = document.movementHistory ?? [];
    const report = {
      foundry: game.version,
      system: game.system.version,
      actor: actor.name,
      stage: actor.system.stage,
      size: actor.system.size,
      humanScaling: game.settings.get("digimon-digital-adventures", "humanScaling"),
      manualGridSize: actor.flags?.["digimon-digital-adventures"]?.tokenGridSizeOverride ?? null,
      prototype: dimensions(actor.prototypeToken),
      saved: dimensions(document._source),
      prepared: dimensions(document),
      renderedPixels: { width: token.w, height: token.h },
      shape: dimensions(token.shape?.getBounds?.() ?? token.shape),
      occupiedCells: document.getOccupiedGridSpaceOffsets?.().length ?? null,
      historyDimensions: history.map((waypoint) => dimensions(waypoint)),
      currentForm: actor.system.evolution?.currentFormUuid ?? "",
      forms: Object.values(actor.system.evolution?.formSnapshots ?? {}).map((form) => ({
        name: form.sourceFormName || form.species || form.name,
        stage: form.stage,
        size: form.size,
        tokenGridSize: form.tokenGridSize ?? null
      }))
    };
    const text = JSON.stringify(report, null, 2);
    console.info("DDA | Diagnóstico de ocupação do token", report);
    const escaped = text.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);
    await foundry.applications.api.DialogV2.wait({
      window: { title: "DDA — Diagnóstico de ocupação" },
      position: { width: 600 },
      content: `<p>Copie este relatório para identificar qual tamanho ficou diferente. Esta macro não altera o token.</p><textarea readonly style="width:100%;height:360px;font-family:monospace">${escaped}</textarea>`,
      buttons: [{ action: "close", label: "Fechar", default: true }],
      rejectClose: false
    });
  }
} catch (error) {
  console.error("DDA | Falha no diagnóstico de ocupação.", error);
  ui.notifications.error("Não foi possível obter o diagnóstico. Consulte o console do Foundry.");
}
