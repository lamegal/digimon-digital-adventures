export async function openEncounterCalculator() {
  const stages = CONFIG.DDA?.stages ?? {};

  const stageOptions = Object.entries(stages)
    .map(([key, stage]) => {
      const baseDp = Number(stage.baseDp ?? stage.startingDp ?? 0);
      const label = game.i18n.localize(stage.label ?? key);

      return `<option value="${key}">${label} — ${baseDp} ${game.i18n.localize("DDA.Encounter.BaseDP")}</option>`;
    })
    .join("");

  const content = `
    <div class="dda-roll-dialog">
      <h2>${game.i18n.localize("DDA.Encounter.Group")}</h2>

      <div class="form-group">
        <label>${game.i18n.localize("DDA.Encounter.PartySize")}</label>
        <input type="number" name="partySize" value="4" min="1" />
      </div>

      <div class="form-group">
        <label>${game.i18n.localize("DDA.Encounter.PartyMilestones")}</label>
        <input type="number" name="milestones" value="0" min="0" />
      </div>

      <div class="form-group">
        <label>${game.i18n.localize("DDA.Encounter.DefaultRangeBaseStage")}</label>
        <select name="defaultStage">
          ${stageOptions}
        </select>
      </div>

      <div class="form-group">
        <label>${game.i18n.localize("DDA.Encounter.Difficulty")}</label>
        <select name="difficulty">
          <option value="easy">${game.i18n.localize("DDA.Difficulty.Easy")} (+0)</option>
          <option value="normal" selected>${game.i18n.localize("DDA.Difficulty.Normal")} (+5)</option>
          <option value="hard">${game.i18n.localize("DDA.Difficulty.Hard")} (+10)</option>
        </select>
      </div>

      <hr />

      <h2>${game.i18n.localize("DDA.Encounter.Enemies")}</h2>

      <p class="notes">
        ${game.i18n.localize("DDA.Encounter.EnemiesHint")}
      </p>

      <div class="form-group">
        <label>${game.i18n.localize("DDA.Stage.Baby1")}</label>
        <input type="number" name="enemy_baby1" value="0" min="0" />
      </div>

      <div class="form-group">
        <label>${game.i18n.localize("DDA.Stage.Baby2")}</label>
        <input type="number" name="enemy_baby2" value="0" min="0" />
      </div>

      <div class="form-group">
        <label>${game.i18n.localize("DDA.Stage.Child")}</label>
        <input type="number" name="enemy_child" value="0" min="0" />
      </div>

      <div class="form-group">
        <label>${game.i18n.localize("DDA.Stage.Adult")}</label>
        <input type="number" name="enemy_adult" value="0" min="0" />
      </div>

      <div class="form-group">
        <label>${game.i18n.localize("DDA.Stage.Perfect")}</label>
        <input type="number" name="enemy_perfect" value="0" min="0" />
      </div>

      <div class="form-group">
        <label>${game.i18n.localize("DDA.Stage.Ultimate")}</label>
        <input type="number" name="enemy_ultimate" value="0" min="0" />
      </div>

      <div class="form-group">
        <label>${game.i18n.localize("DDA.Stage.UltimatePlus")}</label>
        <input type="number" name="enemy_ultimatePlus" value="0" min="0" />
      </div>
    </div>
  `;

  const data = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("DDA.Encounter.Calculator") },
    content,
    buttons: [
      {
        action: "calculate",
        label: game.i18n.localize("DDA.Button.Calculate"),
        icon: "fa-solid fa-calculator",
        default: true,
        callback: (_event, button) => {
          const form = button.form;
          if (!form) return null;

          return {
            partySize: Number(form.elements.partySize?.value ?? 1),
            milestones: Number(form.elements.milestones?.value ?? 0),
            defaultStage: form.elements.defaultStage?.value,
            difficulty: form.elements.difficulty?.value,
            enemies: {
              baby1: Number(form.elements.enemy_baby1?.value ?? 0),
              baby2: Number(form.elements.enemy_baby2?.value ?? 0),
              child: Number(form.elements.enemy_child?.value ?? 0),
              adult: Number(form.elements.enemy_adult?.value ?? 0),
              perfect: Number(form.elements.enemy_perfect?.value ?? 0),
              ultimate: Number(form.elements.enemy_ultimate?.value ?? 0),
              ultimatePlus: Number(form.elements.enemy_ultimatePlus?.value ?? 0)
            }
          };
        }
      }
    ],
    rejectClose: false,
    modal: true
  });

  if (!data) return;

  const result = calculateEncounterBudget(data);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    content: buildEncounterCard(result)
  });

  return result;
}

function calculateEncounterBudget(data) {
  const stages = CONFIG.DDA?.stages ?? {};

  const difficultyBonuses = {
    easy: 0,
    normal: 5,
    hard: 10
  };

  const difficultyLabels = {
    easy: "DDA.Difficulty.Easy",
    normal: "DDA.Difficulty.Normal",
    hard: "DDA.Difficulty.Hard"
  };

  const partySize = Math.max(1, Number(data.partySize ?? 1));
  const milestones = Math.max(0, Number(data.milestones ?? 0));
  const defaultStageKey = data.defaultStage ?? "child";
  const defaultStage = stages[defaultStageKey] ?? stages.child;

  const defaultStageLabel = game.i18n.localize(defaultStage?.label ?? defaultStageKey);
  const defaultStageValue = Number(defaultStage?.stageValue ?? 0);
  const defaultBaseDp = Number(defaultStage?.baseDp ?? defaultStage?.startingDp ?? 0);

  const difficulty = data.difficulty ?? "normal";
  const difficultyBonus = Number(difficultyBonuses[difficulty] ?? 0);
  const difficultyLabel = game.i18n.localize(difficultyLabels[difficulty] ?? difficulty);

  const budgetPerPlayer = defaultBaseDp + milestones * 4 + difficultyBonus;
  const totalBudget = budgetPerPlayer * partySize;

  const enemyRows = [];
  let enemyCount = 0;
  let enemyBaseCost = 0;
  let enemyStageCost = 0;

  for (const [stageKey, amountRaw] of Object.entries(data.enemies ?? {})) {
    const amount = Math.max(0, Number(amountRaw ?? 0));
    if (amount <= 0) continue;

    const stage = stages[stageKey] ?? {};
    const stageLabel = game.i18n.localize(stage.label ?? stageKey);
    const stageValue = Number(stage.stageValue ?? 0);

    const baseCost = amount * 10;
    const stageDifference = Math.max(0, stageValue - defaultStageValue);
    const stageCost = amount * stageDifference * 20;
    const totalCost = baseCost + stageCost;

    enemyCount += amount;
    enemyBaseCost += baseCost;
    enemyStageCost += stageCost;

    enemyRows.push({
      stageKey,
      stageLabel,
      amount,
      stageDifference,
      baseCost,
      stageCost,
      totalCost
    });
  }

  const enemyTotalCost = enemyBaseCost + enemyStageCost;
  const remainingBudget = totalBudget - enemyTotalCost;
  const bonusDpPerEnemy = enemyCount > 0
    ? Math.floor(remainingBudget / enemyCount)
    : 0;
  const leftoverAfterEvenSplit = enemyCount > 0
    ? remainingBudget - bonusDpPerEnemy * enemyCount
    : remainingBudget;

  return {
    partySize,
    milestones,
    defaultStageKey,
    defaultStageLabel,
    defaultStageValue,
    defaultBaseDp,
    difficulty,
    difficultyLabel,
    difficultyBonus,
    budgetPerPlayer,
    totalBudget,
    enemyRows,
    enemyCount,
    enemyBaseCost,
    enemyStageCost,
    enemyTotalCost,
    remainingBudget,
    bonusDpPerEnemy,
    leftoverAfterEvenSplit
  };
}

function buildEncounterCard(result) {
  const enemyRowsHtml = result.enemyRows.length > 0
    ? result.enemyRows
        .map((row) => {
          return `
            <div class="dda-encounter-enemy-row">
              <h4>${row.amount}× ${row.stageLabel}</h4>
              <p><strong>${game.i18n.localize("DDA.Encounter.BaseCost")}:</strong> ${row.baseCost} ${game.i18n.localize("DDA.Resource.DP.Short")}</p>
              <p><strong>${game.i18n.localize("DDA.Encounter.StageCost")}:</strong> ${row.stageCost} ${game.i18n.localize("DDA.Resource.DP.Short")}</p>
              <p><strong>${game.i18n.localize("DDA.Encounter.Total")}:</strong> ${row.totalCost} ${game.i18n.localize("DDA.Resource.DP.Short")}</p>
            </div>
          `;
        })
        .join("")
    : `<p>${game.i18n.localize("DDA.Encounter.NoEnemiesProvided")}</p>`;

  const remainingClass = result.remainingBudget < 0 ? "danger" : "safe";

  return `
    <div class="dda-chat-card dda-encounter-card">
      <h2>${game.i18n.localize("DDA.Encounter.Calculator")}</h2>

      <h3>${game.i18n.localize("DDA.Encounter.PartyBudget")}</h3>

      <p><strong>${game.i18n.localize("DDA.Encounter.PartySize")}:</strong> ${result.partySize}</p>
      <p><strong>${game.i18n.localize("DDA.Encounter.PartyMilestones")}:</strong> ${result.milestones}</p>
      <p><strong>${game.i18n.localize("DDA.Encounter.BaseStage")}:</strong> ${result.defaultStageLabel} (${result.defaultBaseDp} ${game.i18n.localize("DDA.Resource.DP.Short")})</p>
      <p><strong>${game.i18n.localize("DDA.Encounter.Difficulty")}:</strong> ${result.difficultyLabel} (+${result.difficultyBonus})</p>

      <hr />

      <p>
        <strong>${game.i18n.localize("DDA.Encounter.Formula")}:</strong>
        (${result.defaultBaseDp} + ${result.milestones} × 4 + ${result.difficultyBonus}) × ${result.partySize}
      </p>

      <h3>${game.i18n.format("DDA.Encounter.TotalBudget", {
        total: result.totalBudget,
        dp: game.i18n.localize("DDA.Resource.DP.Short")
      })}</h3>

      <hr />

      <h3>${game.i18n.localize("DDA.Encounter.Enemies")}</h3>

      <div class="dda-encounter-enemy-list">
        ${enemyRowsHtml}
      </div>

      <hr />

      <p><strong>${game.i18n.localize("DDA.Encounter.EnemyBaseCost")}:</strong> ${result.enemyBaseCost} ${game.i18n.localize("DDA.Resource.DP.Short")}</p>
      <p><strong>${game.i18n.localize("DDA.Encounter.EnemyStageCostAboveBase")}:</strong> ${result.enemyStageCost} ${game.i18n.localize("DDA.Resource.DP.Short")}</p>
      <p><strong>${game.i18n.localize("DDA.Encounter.EnemyTotalCost")}:</strong> ${result.enemyTotalCost} ${game.i18n.localize("DDA.Resource.DP.Short")}</p>

      <h3 class="${remainingClass}">
        ${game.i18n.format("DDA.Encounter.RemainingDPToDistribute", {
          remaining: result.remainingBudget
        })}
      </h3>

      ${
        result.enemyCount > 0
          ? `
            <p><strong>${game.i18n.localize("DDA.Encounter.SuggestedEvenSplit")}:</strong> ${result.bonusDpPerEnemy} ${game.i18n.localize("DDA.Encounter.BonusDPPerEnemy")}.</p>
            <p><strong>${game.i18n.localize("DDA.Encounter.LeftoverAfterEvenSplit")}:</strong> ${result.leftoverAfterEvenSplit} ${game.i18n.localize("DDA.Resource.DP.Short")}.</p>
          `
          : ""
      }

      ${
        result.remainingBudget < 0
          ? `<p><strong>${game.i18n.localize("DDA.Warning.Label")}:</strong> ${game.i18n.localize("DDA.Encounter.OverBudgetWarning")}</p>`
          : ""
      }
    </div>
  `;
}
