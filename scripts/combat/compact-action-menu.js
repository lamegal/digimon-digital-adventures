const ACTION_VISUALS = {
  move: { icon: "fa-solid fa-person-running", tone: "movement" },
  difficultMove: { icon: "fa-solid fa-mountain", tone: "movement" },
  reposition: { icon: "fa-solid fa-arrows-up-down-left-right", tone: "movement" },

  attack: { icon: "fa-solid fa-crosshairs", tone: "offense" },
  holdBack: { icon: "fa-solid fa-hand", tone: "offense" },
  clash: { icon: "fa-solid fa-hand-fist", tone: "offense" },
  calledShot: { icon: "fa-solid fa-bullseye", tone: "offense" },
  coordinatedAssault: { icon: "fa-solid fa-people-group", tone: "offense" },

  resist: { icon: "fa-solid fa-shield-halved", tone: "defense" },
  guard: { icon: "fa-solid fa-shield", tone: "defense" },
  reinforce: { icon: "fa-solid fa-shield-heart", tone: "defense" },

  direct: { icon: "fa-solid fa-bullhorn", tone: "support" },
  bolster: { icon: "fa-solid fa-arrow-trend-up", tone: "support" },
  aid: { icon: "fa-solid fa-hand-holding-heart", tone: "support" },
  teamwork: { icon: "fa-solid fa-people-arrows", tone: "support" },

  check: { icon: "fa-solid fa-dice-d20", tone: "tactical" },
  stance: { icon: "fa-solid fa-person", tone: "tactical" },
  hold: { icon: "fa-solid fa-hourglass-half", tone: "tactical" },
  holdBreath: { icon: "fa-solid fa-lungs", tone: "tactical" },
  enemyScan: { icon: "fa-solid fa-magnifying-glass", tone: "tactical" },

  evolution: { icon: "fa-solid fa-dna", tone: "special" },
  peakPerformance: { icon: "fa-solid fa-star", tone: "special" },
  breakClash: { icon: "fa-solid fa-link-slash", tone: "special" },
  conjure: { icon: "fa-solid fa-wand-magic-sparkles", tone: "special" },
  summon: { icon: "fa-solid fa-wand-magic-sparkles", tone: "special" },
  commandMinion: { icon: "fa-solid fa-chess-knight", tone: "special" },
  omnievoker: { icon: "fa-solid fa-wand-sparkles", tone: "special" },
  fastball: { icon: "fa-solid fa-baseball", tone: "special" },
  giantHijacker: { icon: "fa-solid fa-person-falling-burst", tone: "special" },
  endGiantHijacker: { icon: "fa-solid fa-person-circle-xmark", tone: "special" },
  shakeOffGiantHijacker: { icon: "fa-solid fa-person-burst", tone: "special" },
  distantForce: { icon: "fa-solid fa-tower-broadcast", tone: "special" }
};

function text(pt, en) {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("pt") ? pt : en;
}

function localize(key, fallback = key) {
  if (!key) return fallback;
  const value = game?.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function number(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function visualFor(entry) {
  const key = String(entry?.key ?? "");
  if (key.startsWith("talent:")) {
    return { icon: "fa-solid fa-bolt", tone: "special" };
  }
  if (key.startsWith("gainForce")) {
    return { icon: "fa-solid fa-burst", tone: "special" };
  }
  return ACTION_VISUALS[key] ?? {
    icon: "fa-solid fa-circle-dot",
    tone: "tactical"
  };
}

function normalizeEntry(entry) {
  const visual = visualFor(entry);
  return {
    key: String(entry?.key ?? ""),
    title: String(entry?.title ?? localize(entry?.titleKey, entry?.key ?? "")),
    summary: String(entry?.summary ?? localize(entry?.summaryKey, "")),
    cost: String(entry?.cost ?? "—"),
    automationStatus: String(entry?.automationStatus ?? ""),
    automationClass: String(entry?.automationClass ?? ""),
    ...visual
  };
}

function renderAutomation(entry) {
  if (!entry.automationStatus) return "";
  const automated = entry.automationClass.includes("automated");
  const icon = automated ? "fa-solid fa-gears" : "fa-solid fa-hand";
  return `
    <i
      class="${icon} dda-compact-action__automation ${escapeHtml(entry.automationClass)}"
      title="${escapeHtml(entry.automationStatus)}"
      aria-label="${escapeHtml(entry.automationStatus)}"
    ></i>
  `;
}

function renderEntry(entry, index, detailId) {
  return `
    <button
      type="button"
      class="dda-compact-action is-${entry.tone}"
      data-action-key="${escapeHtml(entry.key)}"
      data-title="${escapeHtml(entry.title)}"
      data-summary="${escapeHtml(entry.summary)}"
      data-cost="${escapeHtml(entry.cost)}"
      data-icon="${escapeHtml(entry.icon)}"
      aria-describedby="${escapeHtml(detailId)}"
      ${index === 0 ? "autofocus" : ""}
    >
      <span class="dda-compact-action__icon" aria-hidden="true">
        <i class="${escapeHtml(entry.icon)}"></i>
      </span>
      <span class="dda-compact-action__label">
        <strong>${escapeHtml(entry.title)}</strong>
        ${renderAutomation(entry)}
      </span>
      <span class="dda-compact-action__cost">${escapeHtml(entry.cost)}</span>
    </button>
  `;
}

function renderRules(notes) {
  if (!notes.length) return "";
  return `
    <details class="dda-compact-action-rules">
      <summary>
        <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
        ${escapeHtml(text("Regras automáticas", "Automatic rules"))}
      </summary>
      <div>
        ${notes.map((note) => `
          <p>
            <strong>${escapeHtml(note.title)}:</strong>
            ${escapeHtml(note.body)}
          </p>
        `).join("")}
      </div>
    </details>
  `;
}

function renderActionCounter(actor) {
  const actions = actor?.system?.combat?.actions ?? {};
  const value = Math.max(0, number(actions.value));
  const maximum = Math.max(value, number(actions.max, value));
  if (maximum <= 0) return "";
  return `
    <div class="dda-compact-action-counter" title="${escapeHtml(text("Ações restantes", "Actions remaining"))}">
      <i class="fa-solid fa-bolt" aria-hidden="true"></i>
      <strong>${value}</strong>
      <span>/ ${maximum}</span>
    </div>
  `;
}

/**
 * Render a compact action console using Foundry v13 DialogV2.
 * The caller owns the action handlers; this module only presents and selects them.
 */
export function openCompactActionMenu({
  actor,
  kind,
  title,
  hint,
  entries = [],
  notes = [],
  onSelect
}) {
  const normalized = entries.map(normalizeEntry).filter((entry) => entry.key);
  if (!normalized.length) return Promise.resolve(null);

  const detailId = `dda-action-detail-${foundry.utils.randomID()}`;
  const first = normalized[0];
  // DialogV2 accepts an HTMLElement as content only when the outer element has
  // no attributes. Keep the Foundry-owned content node clean and place the
  // styled action console in a child wrapper.
  const content = document.createElement("div");
  content.innerHTML = `
    <div class="dda-compact-action-menu dda-compact-action-menu--${escapeHtml(kind)}">
      <header class="dda-compact-action-hero">
        <img src="${escapeHtml(actor?.img || "icons/svg/mystery-man.svg")}" alt="" />
        <div class="dda-compact-action-identity">
          <span>${escapeHtml(text("Console de combate", "Combat console"))}</span>
          <strong>${escapeHtml(actor?.name ?? title)}</strong>
          <small>${escapeHtml(hint)}</small>
        </div>
        ${renderActionCounter(actor)}
      </header>

      <div class="dda-compact-action-grid" role="toolbar" aria-label="${escapeHtml(title)}">
        ${normalized.map((entry, index) => renderEntry(entry, index, detailId)).join("")}
      </div>

      <aside id="${escapeHtml(detailId)}" class="dda-compact-action-detail" aria-live="polite">
        <span class="dda-compact-action-detail__icon" aria-hidden="true">
          <i class="${escapeHtml(first.icon)}"></i>
        </span>
        <span class="dda-compact-action-detail__copy">
          <strong>${escapeHtml(first.title)}</strong>
          <small>${escapeHtml(first.summary || text("Sem descrição adicional.", "No additional description."))}</small>
        </span>
        <span class="dda-compact-action-detail__cost">${escapeHtml(first.cost)}</span>
      </aside>

      ${renderRules(notes)}
    </div>
  `;

  return new Promise((resolve) => {
    let settled = false;
    let busy = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value ?? null);
    };

    const DialogV2 = foundry.applications.api.DialogV2;
    let dialog;

    try {
      dialog = new DialogV2({
        classes: [
          "dda",
          "dda-compact-action-dialog",
          `dda-compact-action-dialog--${kind}`
        ],
        window: { title },
        position: { width: 620, height: "auto" },
        content,
        // DialogV2 requires at least one configured button in Foundry v13.
        // The compact console closes through its Action cards, X or Escape, so
        // this API-required fallback is hidden by dda-action-menus.css.
        buttons: [{
          action: "close",
          label: text("Fechar", "Close")
        }]
      });
    } catch (error) {
      console.error("DDA | Compact action menu could not be initialized.", error);
      ui.notifications.error(
        text("Não foi possível abrir o painel de Ações.", "The Action panel could not be opened.")
      );
      finish(null);
      return;
    }

    dialog.addEventListener("close", () => finish(null), { once: true });
    void dialog.render({ force: true }).then(() => {
      // ApplicationV2 replaces the configured content while rendering. Bind to
      // the mounted Dialog element, never to the pre-render content fragment,
      // otherwise the visible Action cards have no event listeners.
      const root = dialog.element;
      const menu = root?.querySelector(".dda-compact-action-menu");
      const detailIcon = root?.querySelector(".dda-compact-action-detail__icon i");
      const detailTitle = root?.querySelector(".dda-compact-action-detail__copy strong");
      const detailSummary = root?.querySelector(".dda-compact-action-detail__copy small");
      const detailCost = root?.querySelector(".dda-compact-action-detail__cost");

      if (!root || !menu || !detailIcon || !detailTitle || !detailSummary || !detailCost) {
        throw new Error("The rendered compact Action menu is incomplete.");
      }

      const getActionButton = (event) => {
        const button = event.target?.closest?.("[data-action-key]");
        return button && root.contains(button) ? button : null;
      };

      const updateDetail = (button) => {
        detailIcon.className = String(button.dataset.icon ?? "fa-solid fa-circle-dot");
        detailTitle.textContent = String(button.dataset.title ?? "");
        detailSummary.textContent = String(
          button.dataset.summary || text("Sem descrição adicional.", "No additional description.")
        );
        detailCost.textContent = String(button.dataset.cost ?? "—");
      };

      root.addEventListener("pointerover", (event) => {
        const button = getActionButton(event);
        if (button) updateDetail(button);
      });

      root.addEventListener("focusin", (event) => {
        const button = getActionButton(event);
        if (button) updateDetail(button);
      });

      root.addEventListener("click", async (event) => {
        const button = getActionButton(event);
        if (!button) return;

        event.preventDefault();
        if (busy) return;
        busy = true;
        menu.classList.add("is-busy");
        try {
          const result = await onSelect?.(String(button.dataset.actionKey ?? ""));
          finish(result);
          await dialog.close();
        } catch (error) {
          busy = false;
          menu.classList.remove("is-busy");
          console.error("DDA | Compact action menu handler failed.", error);
          ui.notifications.error(
            text("Não foi possível executar esta Ação.", "This Action could not be executed.")
          );
        }
      });
    }).catch((error) => {
      console.error("DDA | Compact action menu could not be rendered.", error);
      ui.notifications.error(
        text("Não foi possível abrir o painel de Ações.", "The Action panel could not be opened.")
      );
      finish(null);
    });
  });
}
