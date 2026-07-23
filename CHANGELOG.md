# Digimon Digital Adventures V2 — v2.0.7-beta

## Partner Form Planner

- Added support for preparing future Partner forms before their Evolution Stages are unlocked.
- Added support for Normal, special, Side Evolution and Dark Evolution planning.
- Added compatibility percentages and compatibility explanations to form selection.
- Added controls for removing planned forms.
- Added GM controls for releasing planned forms whose Stages are already unlocked.
- Added stable identities for planned forms, preventing forms from overwriting entries in other Stages.
- Added visual states for planned, available and released forms.
- Improved category pills and card layout.

## Evolution

- Added Side Evolution selection to the Partner Form Planner.
- Added Dark Evolution planning through the GM Partner Progress Manager.
- Added automatic Evolution Map registration for released planned forms.
- Added automatic evolution links when a valid and unambiguous origin is available.
- Improved preservation of snapshots, portraits, tokens and special-form metadata.
- Fixed higher-Stage forms appearing in lower-Stage slots.
- Fixed removal of planned forms from snapshots, the Evolution Map, evolution links and unlocked-form records.
- Fixed an Evolution Map refresh error caused by assigning to the read-only `ActorSheet.actor` getter.

## Images

- Reworked Digimon image resolution around assets that actually exist in the system.
- Added generated static portrait and token manifests.
- Fixed repeated image `404` errors caused by obsolete Stage-folder paths.
- Improved image fallbacks across Actors, the Planner, Wizard, Evolution Map and Evolution Browser.
- Fixed old snapshots overriding the portrait of the selected form.
- Fixed portraits leaking between different forms and Stages.

## Localization and stability

- Fixed localization key collisions in English and Brazilian Portuguese.
- Improved repeated release and repair operations to avoid duplicate forms, nodes and links.
- Improved compatibility with existing Actors and snapshots created before this release.

## Planned for v2.0.8-beta

- Add the Prevent combat reaction through the pending Dodge chat card context menu.

---


# Digimon Digital Adventures V2 — v2.0.6-beta

## Release Highlights

### Player-Controlled Partner Form Planning

This release introduces the new **Partner Form Planner**, allowing players to prepare and review future Digimon forms before those Stages are unlocked.

Players can now:

- review the current form and every prepared form in one place;
- inspect Attributes, Attacks, Qualities, total DP, spent DP, and remaining DP per form;
- identify overspent builds before the form becomes available;
- prepare additional forms through a visual Digimon picker;
- search forms by name, original name, Type, or Attribute;
- configure a future form without triggering Digivolution or unlocking its Stage.

Stage unlocking remains a GM responsibility. The Planner only prepares the build and stores it in the partner’s form snapshots.

### Shared Tamer and Partner Combat Activation

Tamer and partner Digimon combatants are now treated as a shared initiative unit when properly linked.

The new combat flow includes:

- paired initiative entries for linked Tamers and Digimon;
- shared activation tracking;
- separate participation states for the Tamer and Digimon;
- Combat Tracker advancement only after both participants have ended their part of the activation;
- validation that prevents actors outside the active unit from spending restricted combat actions;
- improved end-turn handling for paired and solo combatants;
- a dedicated paired-unit presentation in the Combat Tracker.

Existing combats should be ended and recreated after updating so that the new initiative flags and unit data are generated correctly.

### Digimon Action Menu and Unified Action Economy

Added a dedicated **Digimon Actions** menu and a shared Action-spending foundation.

The menu now exposes automated or assisted flows for:

- Move;
- Attack;
- Difficult Move;
- Hold Back;
- Check;
- Change Stance;
- Clash;
- Resist;
- Bolster;
- Aid;
- Guard;
- Coordinated Assault;
- Called Shot;
- Hold Breath;
- NPC Evolution.

Action validation now checks the acting combat unit, available Actions, turn participation, and per-turn usage where applicable.

**Aid** and **Guard** now create temporary bonuses that are consumed by compatible Accuracy or Dodge rolls.

**Coordinated Assault** can mark a target and increase the group’s applicable Accuracy bonus against that target.

### Tamer Combat Actions

The Tamer Actions interface has been expanded with direct combat support.

New or expanded actions include:

- Move;
- Difficult Move;
- Tamer Attack;
- Skill Check;
- Direct;
- Reposition;
- Reinforce;
- Hold Breath;
- Hold;
- Evolution declaration;
- Teamwork;
- automated and assisted Special Order entries.

#### Tamer Attack

Tamers can now make melee or ranged attacks from the Tamer Actions menu.

Current implementation:

- spends 1 Action;
- allows one Tamer Attack per Round;
- uses Precision by default;
- allows Feats of Strength when Heavy Force is available;
- requires adjacency for melee attacks;
- uses a ranged limit of `2 + floor(Precision / 2)` Spaces;
- resolves Tamer-versus-Tamer attacks as Precision or Feats of Strength versus Evade;
- resolves Tamer-versus-Digimon attacks against `TN 12 + (2 × SV)`;
- deals 1 Unalterable Damage on a normal hit;
- deals 2 Unalterable Damage on a critical hit;
- prevents ordinary human attacks from damaging sufficiently large targets or Digimon with SV 5 or greater.

Damage is applied from the generated chat card.

### Standard Intercede and Fate’s Protection

Added the first complete standard **Intercede** response flow.

When a valid attack is declared, the system can:

- discover eligible allied Tamers, Digimon, and NPC Digimon on the Scene;
- verify Movement, Action availability, ownership, combat readiness, and distance;
- create an interactive chat response window;
- allow an authorized user or GM to accept the Intercede;
- pay the required Action or supported free-use exception;
- move the interceding token adjacent to the protected target;
- redirect the attack to the interceder;
- resolve the redirected attack without a Dodge roll.

Implemented interactions include:

- Warden’s supported free Intercede use;
- Pack Master’s supported free Intercede use;
- Tamer Intercede damage resolution;
- Fate’s Protection prompts when an Interceding Tamer would be reduced below the protected threshold;
- general Fate’s Protection response handling and resource costs.

**Area Intercede is not automated in this release.** The new flow covers standard single-target Intercede only.

### Positioning, Aggressive Flank, and Coordinated Assault

Added shared token-distance and combat-readiness utilities for positioning-based mechanics.

**Aggressive Flank** now activates only when:

- the attacker and target are opponents;
- a valid ally of the attacker is adjacent to the target;
- that ally is also an opponent of the target;
- the ally is visible, not defeated, and has remaining Wound Boxes;
- the same Actor is not counted more than once.

The attack summary now identifies which ally or allies enabled the flank bonus.

The rule checks adjacency only. It does not require strict opposite-side geometry.

**Current behavior note:** any valid allied combatant can satisfy the condition, including a Tamer. This should be confirmed as the intended final rules interpretation during release testing.

### GM Combat Overrides

The GM Tools window now includes temporary combat overrides for selected participants.

GMs can:

- grant additional Actions;
- clear spent Actions;
- clear the per-Round Attack limit;
- clear spent Movement;
- clear the “ended participation” marker;
- grant unrestricted Movement;
- end unrestricted Movement.

These tools use the existing GM target-selection mode and are intended for exceptional rulings, corrections, and narrative effects.

### Group Sheet Redesign and Jogress Discovery

The Group Sheet has received a major visual and functional redesign.

Changes include:

- a corrected localized window title;
- compact member cards;
- Tamer and current partner form displayed side by side;
- direct buttons for opening the Tamer and current Digimon form;
- removal of oversized redundant member sections;
- a renewed visual style closer to the Digimon NPC Wizard;
- a redesigned Jogress tab and empty state.

Jogress recipe discovery now considers:

- each partner’s current form;
- prepared future-form snapshots;
- recipe component UUIDs;
- species and normalized names;
- required Stages.

Recipe components identify whether they were matched from a **Current** or **Prepared** form.

A recipe becomes executable only when every component can be assigned to a distinct participant and the result Digimon exists as a World Actor.

### Evolution Interface Cleanup

The Evolution tab on Digimon and NPC sheets has been reorganized into a compact **Evolution Tools** toolbar.

The toolbar now prioritizes:

- Plan / Review Stages;
- Evolution Map;
- independent NPC Evolution when available;
- Clear Graph.

Duplicate or obsolete entry points were removed from the toolbar.

The **Evolution Map** toolbar button now opens the same functional graph pop-out as the existing **Open Evolution Map** button.

The Clear Graph action remains visually distinct and destructive.

### Partner Starting Stage and Tamer Advancement UX

The Partner Starting Stage field on the Tamer sheet has been compacted and clarified.

Changes include:

- shorter campaign-default labels;
- clearer GM override guidance;
- a player-facing explanation when the value is inherited;
- improved field alignment and responsive behavior.

The Tamer Advancement window now includes:

- a three-step visual guide;
- a clearer Attribute-versus-Skills mode choice;
- explicit Growth Point package guidance;
- improved review and confirmation messaging.

### Quality Browser and Attack-Quality Configuration

The Digimon Quality Browser now includes broader category filtering:

- Core;
- Attack and Offensive;
- Defense;
- Clash;
- Effect and Conjuration;
- Utility;
- Stance and Mode;
- Digizoid.

Added or improved configuration support for:

- Basic Effect;
- Advanced Effect;
- Master Effect;
- compatible Attack selection;
- compatible Attack Tag selection;
- missing or invalid saved Attack choices;
- empty compatible-Attack warnings.

Expanded attack and Quality automation includes visible rule summaries for:

- Natural Weakness;
- Armor Piercing;
- Certain;
- Signature Move Battery interactions;
- Fumble;
- Fragile;
- Aggressive Flank;
- Coordinated Assault.

### Interface, Localization, and ApplicationV2 Work

- Added English and Brazilian Portuguese localization for the new combat, planning, advancement, Group Sheet, and GM Tool flows.
- Added dedicated stylesheets for:
  - Partner Form Planner;
  - Combat Tracker pairing;
  - Tamer Advancement.
- Enabled the system socket channel required by multi-user combat responses and GM-authoritative actions.
- Added new ApplicationV2-based Partner Form Planner and visual future-form picker.
- Improved compact layouts across Evolution Tools, Partner Bond controls, Group Sheet cards, Jogress recipes, and advancement windows.
- Expanded chat-card styling for Intercede, Action bonuses, Tamer attacks, and shared combat results.

## Fixes

- Fixed the Evolution Map toolbar button not opening the graph pop-out.
- Fixed oversized Evolution Tools buttons and reorganized them into a compact responsive layout.
- Fixed Group Sheet titles falling back to generic Actor-type labels.
- Fixed Group Sheet member cards consuming excessive vertical space.
- Fixed Jogress discovery ignoring prepared partner forms.
- Fixed the Partner Starting Stage control overlapping or becoming unreadable.
- Fixed Action restoration leaving stale Attack, Movement, or participation limits.
- Fixed Direct requiring an invalid or missing allied target.
- Added clearer messages for actors attempting actions outside the active combat unit.
- Added combat-readiness checks for hidden, defeated, or depleted tokens in positioning and response mechanics.
- Added new Actor defaults for incapacitation state, Digimon Action usage, and per-Stage form DP summaries.

## Compatibility and Data Notes

- Minimum Foundry VTT version remains **13**.
- This release enables `"socket": true` in `system.json`.
- New Actor data fields are additive and should receive defaults through the system template, but old Actors must be tested after migration.
- Existing partner form snapshots remain supported, although older snapshots may not contain every field used by the new Planner.
- Existing combats do not contain the new shared-unit initiative flags and should be recreated after updating.
- The project continues to use a mixed sheet architecture: new standalone interfaces use ApplicationV2, while some primary Actor sheets still use the existing sheet framework.

## Known Risks and What May Break

### Multi-User and Socket Flows

Intercede, GM-authoritative Combat Tracker advancement, and several chat responses depend on the system socket and an active GM.

Possible failures:

- no active GM is available;
- the GM client is paused, disconnected, or loading another Scene;
- ownership differs from the expected Actor owner;
- a response arrives after its request timeout;
- two users answer the same request almost simultaneously.

These cases may leave a chat card unresolved or require the GM to correct Actions manually.

### Existing Combats and Stale Actor State

Updating while a Combat is active can leave:

- old initiative ordering;
- missing unit identifiers;
- stale “ended participation” flags;
- stale Attack-per-Round state;
- old Movement sessions;
- Action totals that do not match the new shared activation.

End the existing Combat, reload the world, and create a new Combat before testing.

### Movement and Token Placement

The Movement tracker and Intercede relocation use Scene grid coordinates and Foundry collision checks.

Potential edge cases:

- gridless Scenes;
- hex grids;
- very large tokens;
- tokens with non-standard dimensions;
- narrow corridors;
- walls, doors, elevation, or multilevel modules;
- teleportation or external token-movement modules;
- drag cancellation during a paid movement session.

Intercede may choose an unexpected adjacent square when every ideal destination is blocked.

### Standard Intercede Scope

This release automates standard single-target Intercede.

Not fully covered:

- Area Intercede;
- every Clash-specific restriction;
- every third-party reaction or movement replacement;
- simultaneous Intercede candidates resolving at the exact same moment;
- uncommon combinations of Fastball, Warden, Pack Master, and external Action modifiers.

These interactions require focused testing and may need GM adjudication.

### Tamer Attack Rules

Tamer Attacks introduce new assumptions that may expose inconsistent Actor data.

Potential issues:

- SV values not matching the intended Stage;
- custom size labels not matching the supported immunity keys;
- old Tamers missing expected Skill paths;
- external modules changing target selection or chat-card buttons;
- contested checks being canceled after the Action has already been reserved;
- actor permissions preventing the target’s Evade roll.

The implementation refunds the spent Action when the required roll cannot be completed, but this must be verified in multiplayer.

### Aggressive Flank Interpretation

The current implementation:

- requires adjacency, not opposite-side positioning;
- ignores hidden, defeated, depleted, duplicate, neutral, or friendly-to-the-target tokens;
- currently allows a Tamer to count as the adjacent ally.

Confirm the Tamer interaction before publishing. If only Digimon should enable Aggressive Flank, an Actor-type restriction must be added before release.

### Prepared Forms and Form Snapshots

The Planner reads and writes partner form snapshots.

Potential issues:

- snapshots created by much older builds may lack `sourceFormUuid`, Stage, token image, portrait image, or DP summaries;
- duplicate forms with different aliases may appear as separate choices;
- a prepared form can be mechanically invalid if its saved Items were manually edited outside the Planner;
- an overspent form remains saved until the player corrects it;
- preparing a form does not guarantee that the Actor used by that form still exists.

Test regression and advancement between every prepared Stage, including portrait, token, Attacks, Qualities, and nickname persistence.

### Jogress Recipe Matching

Recipe discovery matches current and prepared forms by UUID, species/name, and Stage.

Potential issues:

- duplicate or ambiguous species names;
- DUB/original-name mismatches;
- a recipe result existing only in a Compendium rather than as a World Actor;
- one Tamer preparing multiple candidate forms;
- recipes requiring two entries that normalize to the same name;
- stale snapshots referencing deleted Actors.

The matching code prevents the same candidate entry from filling two components, but unusual recipe sets must be tested.

### UI and CSS Conflicts

The release contains extensive CSS changes.

Potential issues:

- custom themes;
- browser zoom other than 100%;
- narrow Actor-sheet widths;
- translated strings longer than the English labels;
- modules that modify Actor sheet tabs or window frames;
- cached CSS after updating.

Perform a full browser reload after installation and test at common desktop widths.

### Compendium and Repository Noise

The submitted working tree contains generated LevelDB artifacts, including rotated manifests and `packs/*/lost/` directories.

Do not blindly commit every file shown by VS Code Source Control.

Possible damage:

- committing recovery files and obsolete manifests;
- deleting valid `.ldb` files;
- publishing corrupted or partially recovered Compendium packs;
- greatly increasing repository and release size;
- mixing generated pack state from two different Foundry sessions.

Only commit pack changes after opening every affected Compendium in Foundry and confirming that its documents load correctly.

### Mixed Application Frameworks

The Partner Form Planner uses ApplicationV2, while several main Actor sheets still use the prior sheet framework.

Possible issues:

- lifecycle differences between old and new windows;
- stale jQuery assumptions;
- window-size persistence differences;
- modules that patch old sheet methods but not ApplicationV2 actions.

The new Planner and picker must be tested through repeated open, close, refresh, and re-render cycles.

## Required Release Testing

The following checks are release blockers.

### Installation and Migration

- [ ] Install the release ZIP into a clean Foundry VTT v13 data directory.
- [ ] Update an existing world from v2.0.5-beta.
- [ ] Open old Tamer, Digimon, NPC, Group, Attack, Quality, Talent, and Torment documents.
- [ ] Confirm that no migration or data-path errors appear in the console.
- [ ] Confirm that all configured system stylesheets load.
- [ ] Confirm that the system socket initializes.

### Multi-User Test

Use at least one GM client and one player client.

- [ ] Player can open the Partner Form Planner.
- [ ] Player can prepare a locked-Stage form without unlocking the Stage.
- [ ] Player cannot perform GM-only progression actions.
- [ ] Chat response buttons respect Actor ownership.
- [ ] GM receives and resolves authoritative requests.
- [ ] No request is processed twice.

### Shared Combat Activation

- [ ] Add a linked Tamer and partner to Combat.
- [ ] Roll initiative and confirm they appear as a shared unit.
- [ ] End only the Tamer’s participation; Combat must wait for the Digimon.
- [ ] End the Digimon’s participation; Combat must advance.
- [ ] Repeat with Digimon ending first.
- [ ] Test a solo Tamer, solo Digimon, and NPC.
- [ ] Start a new Round and confirm all participation markers reset.

### Digimon Actions and Action Economy

- [ ] Move spends the expected Actions and Movement.
- [ ] Difficult Move applies the expected cost.
- [ ] Attack respects the one-Attack-per-Round limit.
- [ ] Aid applies only to the next compatible roll and is consumed once.
- [ ] Guard applies only to the next compatible Dodge and is consumed once.
- [ ] Bolster, Resist, Stance, Clash, Hold Back, Called Shot, and Hold Breath do not duplicate usage.
- [ ] Restoring Actions through GM Tools clears the intended temporary limits.

### Tamer Actions

- [ ] Melee Attack rejects non-adjacent targets.
- [ ] Ranged Attack respects `2 + floor(Precision / 2)`.
- [ ] Heavy Force allows Feats of Strength.
- [ ] Tamer-versus-Tamer uses a contested Evade check.
- [ ] Tamer-versus-Digimon uses the expected TN.
- [ ] Normal hit deals 1 Unalterable Damage.
- [ ] Critical hit deals 2 Unalterable Damage.
- [ ] Size and SV immunities work as intended.
- [ ] Canceled or failed rolls refund the reserved Action.
- [ ] One-Attack-per-Round state resets correctly.
- [ ] Direct requires exactly one allied Digimon target.
- [ ] Hold and Teamwork chat workflows work across GM and player clients.

### Intercede and Fate’s Protection

- [ ] Eligible candidates are detected by distance, Movement, Actions, alliance, ownership, and readiness.
- [ ] Hidden, defeated, depleted, neutral, and duplicate Actors are excluded.
- [ ] Intercede moves the token adjacent to the protected target.
- [ ] The redirected attack does not request Dodge.
- [ ] The correct Actor pays the Action.
- [ ] Warden and Pack Master free uses trigger only at their intended frequency.
- [ ] A Tamer Intercede can be resolved from the chat card.
- [ ] Fate’s Protection charges the correct Action and IP costs.
- [ ] Declining Intercede lets the original attack continue.
- [ ] Request timeout and disconnected-user behavior are acceptable.
- [ ] Area attacks are clearly handled manually rather than incorrectly using standard Intercede.

### Aggressive Flank and Positioning

- [ ] No bonus without an adjacent ally.
- [ ] Bonus with one valid adjacent ally.
- [ ] Bonus does not require opposite-side geometry.
- [ ] Hidden, defeated, depleted, neutral, or duplicate tokens do not count.
- [ ] The chat summary identifies the enabling ally.
- [ ] Confirm whether a Tamer should count.
- [ ] Test large targets and large allies.
- [ ] Test square and hex grids.

### Partner Form Planner and Evolution

- [ ] Current and prepared forms display correct Stage, images, Attributes, Items, and DP.
- [ ] Locked Stages remain locked after preparing a form.
- [ ] Visual picker search and Attribute filters work.
- [ ] Duplicate forms are not added unintentionally.
- [ ] Overspent forms are clearly identified.
- [ ] Adjusting a form preserves portrait and token separately.
- [ ] Digivolution and regression restore Attacks, Qualities, portrait, token, species, and nickname.
- [ ] Evolution Map toolbar button opens the graph pop-out.
- [ ] The lower Open Evolution Map button still works.
- [ ] NPC evolution controls still appear only when appropriate.
- [ ] Clear Graph remains destructive and requires confirmation.

### Group Sheet and Jogress

- [ ] Group window title is localized correctly.
- [ ] Tamer and current partner form appear side by side.
- [ ] Open Tamer and Open Current Form buttons work.
- [ ] Jogress recipes appear when a current form matches.
- [ ] Jogress recipes appear when only a prepared form matches.
- [ ] Current and Prepared source labels are correct.
- [ ] The same candidate cannot satisfy two recipe components.
- [ ] Missing components are reported correctly.
- [ ] Missing result World Actor is reported correctly.
- [ ] DUB and original-name variants match intended recipes.
- [ ] Executing and ending Jogress preserves both participants correctly.

### UI and Localization

- [ ] Test English and Brazilian Portuguese.
- [ ] No raw `DDA.*` localization keys are visible.
- [ ] Evolution Tools buttons remain compact and side by side.
- [ ] Group member and Jogress cards fit at normal sheet widths.
- [ ] Partner Starting Stage does not overlap.
- [ ] Tamer Actions remains usable at common resolutions.
- [ ] Test browser zoom at 100%, 90%, and 125%.
- [ ] Perform a hard reload and confirm no old CSS remains cached.

### Compendiums and Packaging

- [ ] Open every system Compendium.
- [ ] Open sample Actors from each Stage pack.
- [ ] Confirm no LevelDB recovery warning appears.
- [ ] Remove `packs/*/lost/` from the release package.
- [ ] Exclude `.git`, development reports, tools, temporary files, and old release ZIPs.
- [ ] Confirm `system.json` version, manifest, download, and changelog URLs.
- [ ] Confirm the release ZIP contains one top-level `digimon-digital-adventures` folder.
- [ ] Install the final ZIP and repeat a smoke test before publishing.

## Recommended Release Classification

This build should remain labeled **beta**.

The release introduces substantial combat-state, socket, movement, reaction, snapshot, and UI changes. It is suitable for public beta testing after the blocker checklist passes, but it should not be presented as feature-complete automation of every combat rule.


# v2.0.5-beta
# English

## Highlights

Version `2.0.5-beta` significantly expands GM-controlled Digimon creation and management, strengthens independent evolution, and completes another major stage of Tamer Action and Tamer Talent automation.

## Digimon NPC Builder

- The former **Create Enemy Digimon** button has been renamed to **Create Digimon NPC**.
- Added an **Ally ↔ Enemy** selector to the Digimon NPC Builder.
- Ally Digimon NPCs use:
  - friendly token disposition;
  - player-side initiative;
  - the standard Digivice appearance;
  - green Wound indicators.
- Enemy Digimon NPCs keep:
  - hostile disposition;
  - enemy-side initiative;
  - the dark Digivice appearance;
  - red Wound indicators.
- Allies and enemies created by the Wizard are now identified as autonomous Digimon NPCs.
- Fixed persistence of NPC alignment and presentation metadata.
- Maintained compatibility with enemies created in earlier versions.

## Autonomous NPC Evolution

- Ally Digimon NPCs can now choose and apply their own evolutions.
- Enemy Digimon NPCs can also evolve directly from their own sheet.
- GM-controlled autonomous evolutions spend no:
  - EP;
  - IP;
  - Actions.
- Added separate buttons:
  - **Evolve Ally NPC**;
  - **Evolve Enemy Digimon**.
- Free NPC evolution still respects:
  - registered paths;
  - direct links;
  - Slide Evolution;
  - Warp Evolution;
  - combat locks;
  - global evolution-method settings.
- Special methods with dedicated flows remain protected from incorrect use through autonomous evolution.

## Current Form Wizard and Choose Evolution

- The **Current Form Wizard** can now be opened directly from:
  - partner Digimon sheets;
  - ally Digimon NPC sheets;
  - enemy Digimon NPC sheets.
- The Current Form Wizard no longer requires an empty Tamer to edit an independent Digimon.
- Fixed the validation that rejected `npc` Actors with “The chosen form is not a Digimon”.
- **Choose Evolution** now works directly on Digimon without a Tamer.
- Stages are no longer artificially locked when no Tamer is linked.
- Evolution choices can be saved, restored, and cleared directly from the Digimon's `evolutionLine`.
- Fixed the missing listener that caused Choose Evolution to appear but not react to clicks.
- Improved error reporting when opening the Evolution Browser.

## Hybrid Forms as Digimon Evolutions

- Hybrid forms may now appear as possible evolutions for regular Digimon.
- Hybrids may be found through:
  - curated direct relations;
  - uncommon-path exploration.
- Virtual Hybrid database entries are now indexed for name and reference lookup.
- Special-category metadata is preserved through:
  - selection;
  - saving;
  - graph node creation;
  - snapshots;
  - form changes.
- Evolving into a Hybrid preserves its identity and equivalent stage instead of reducing it to a visual-only normal form.

## Evolution Browser and Graph

- Canonical direct database relations can no longer disappear because of stale exclusion lists or duplicate-cleanup exclusions.
- Explicit hide overrides remain supported.
- Fixed valid evolutions such as **Monodramon → Strikedramon** disappearing from the Browser.
- The selected evolution is placed first in its stage without deleting other registered forms.
- Fixed restoring the saved selection when reopening the Browser.
- Fixed clearing choices on Digimon without Tamers.
- The graph now marks only the truly active form.
- Fixed both the original and evolved forms appearing as active at the same time.
- The evolution map is correctly recentered after autonomous evolution.
- Fixed graph connection and persistence for ally NPCs.

## Identity After Evolution

- Fixed NPCs evolving mechanically while keeping the previous form's displayed name and species.
- Form changes now correctly update:
  - Actor name;
  - custom name;
  - species;
  - `sourceId`;
  - `databaseId`;
  - canonical, original, and DUB names;
  - aliases;
  - current form name;
  - source form name.
- Ally and enemy NPCs are no longer treated as persistent Tamer partners.
- Actual Tamer partners still preserve their nickname between forms.
- Fixed **Motimon → Kokabuterimon** still displaying Motimon after evolution.
- Old and new snapshots now carry complete form identity data.

## NPC Builder and Qualities

- Added full **Naturewalk** configuration support to the Digimon NPC Builder.
- The NPC Quality Browser now supports selecting:
  - element/terrain;
  - associated Main Stat.
- Naturewalk choices are correctly preserved in the created Quality.
- Fixed configurable Quality integration with the NPC DP budget.
- Improved rank-based Quality selection and persistence in the Creator.

## Wizard, Filters, and Catalogs

- Reordered filter rows to match the intended visual flow.
- Wizard filters can now be collapsed.
- Fixed card ordering in catalogs/compendia.
- Fixed opening the Quality catalog while configuring **Superior Mode Change**.
- Scroll position is preserved while updating Creator filters and options.
- Fixed integration points between the Current Form Wizard, Quality Browser, and persistent snapshots.

## Rest and Partner Linking

- Tamer Rest now also applies the corresponding rest to the linked partner Digimon.
- Rest-related resources, uses, and states are synchronized between Tamer and partner.
- Independent Digimon NPCs remain supported without requiring a Tamer.

## Tamer Actions and Talents

- Expanded the Tamer Action foundation.
- Implemented **Hold**:
  - preparation from the sheet;
  - trigger and response through chat;
  - out-of-turn attack window;
  - support for prepared 1-Action attacks;
  - Intelligence bonus integration;
  - **Best Laid Plans** integration.
- Implemented **Teamwork**:
  - cooperative check support;
  - related Talent integration;
  - normalized chat results.
- Added or expanded Tamer Talent automation, including:
  - Quick Step;
  - Bulk Up;
  - Direct Team;
  - Experienced;
  - Calculated;
  - Potential;
  - Aim Assist;
  - Experienced Step;
  - Joint Effort;
  - Academic Advice;
  - Danger Sense;
  - Calming Influence;
  - Team Player;
  - Break the Chain;
  - With the Will;
  - Evasive Maneuvers;
  - Undefeated Endurance;
  - Best Laid Plans.
- Improved temporary-effect, next-check bonus, granted-Action, healing, and multi-target effect infrastructure.

## Overclock and Mode Changes

- Implemented **Overclock** automation.
- Overclock now lets the Digimon apply a purchased Positive Effect to itself.
- Added rule support for success, critical success, and critical failure.
- Implemented the standard **Mode Change** flow.
- Expanded **Superior Mode Change** configuration in the NPC Builder:
  - Default Quality selection;
  - Mode Quality selection;
  - cost tracking;
  - stage-limit validation;
  - Attack and special configuration integration.
- Fixed opening the Mode Quality Browser.

## Interface and Stability

- Added Portuguese and English localization for the new flows.
- Improved ally and enemy visual presentation.
- Fixed imports, listeners, and validations that prevented applications from opening.
- Preserved form-specific portraits and tokens through form changes and snapshots.
- Maintained Foundry VTT v13 compatibility.

---
# Português (Brasil)

## Destaques

A versão `2.0.5-beta` amplia significativamente as ferramentas de criação e controle de Digimon do Narrador, fortalece o sistema de evolução independente e conclui uma nova etapa das automações de Talentos e Ações do Tamer.

## Criador de Digimon NPC

- O antigo botão **Criar Digimon Inimigo / Create Enemy Digimon** foi renomeado para **Criar Digimon NPC / Create Digimon NPC**.
- Adicionado um seletor **Aliado ↔ Inimigo** ao Criador de Digimon NPC.
- Digimon NPCs aliados usam:
  - disposição amigável no token;
  - iniciativa no lado dos jogadores;
  - Digivice com aparência normal;
  - indicadores de Ferimentos em verde.
- Digimon NPCs inimigos continuam usando:
  - disposição hostil;
  - iniciativa no lado dos inimigos;
  - Digivice escuro;
  - indicadores de Ferimentos em vermelho.
- Aliados e inimigos criados pelo Wizard agora são identificados como Digimon NPCs autônomos.
- Corrigida a persistência dos metadados de alinhamento e apresentação dos NPCs.
- Mantida compatibilidade com inimigos criados em versões anteriores.

## Evolução autônoma de NPCs

- Digimon NPCs aliados agora podem escolher e aplicar suas próprias evoluções.
- Digimon NPCs inimigos também podem evoluir diretamente pela própria ficha.
- Evoluções autônomas do Narrador não gastam:
  - PE;
  - PI;
  - Ações.
- Adicionados botões distintos:
  - **Evoluir NPC Aliado**;
  - **Evoluir Digimon Inimigo**.
- O seletor de evolução gratuita continua respeitando:
  - caminhos registrados;
  - ligações diretas;
  - Slide Evolution;
  - Warp Evolution;
  - bloqueios de combate;
  - configurações globais de métodos de evolução.
- Métodos especiais que possuem fluxo próprio continuam protegidos contra uso incorreto pelo fluxo autônomo.

## Current Form Wizard e Choose Evolution

- O **Current Form Wizard** agora pode ser aberto diretamente pela ficha de:
  - Digimon parceiros;
  - Digimon NPCs aliados;
  - Digimon NPCs inimigos.
- O Current Form Wizard não exige mais a criação de um Tamer vazio para editar um Digimon independente.
- Corrigida a validação que rejeitava Actors `npc` com a mensagem “The chosen form is not a Digimon”.
- O **Choose Evolution** agora funciona diretamente em Digimon sem Tamer.
- Estágios deixam de ser bloqueados artificialmente quando não existe Tamer vinculado.
- Escolhas de evolução podem ser salvas, recuperadas e removidas diretamente no `evolutionLine` do Digimon.
- Corrigido o listener ausente que fazia o botão Choose Evolution aparecer sem responder ao clique.
- Melhorado o tratamento de erros ao abrir o Browser de Evolução.

## Híbridos como evoluções de Digimon

- Formas Híbridas agora podem aparecer como evoluções possíveis para Digimon comuns.
- Híbridos podem ser encontrados tanto:
  - em relações diretas curadas;
  - quanto na exploração de caminhos incomuns.
- Formas Híbridas virtuais da database agora são indexadas para buscas por nome e referência.
- Metadados de categoria especial são preservados durante:
  - seleção;
  - salvamento;
  - criação de nós;
  - snapshots;
  - troca de forma.
- Uma evolução para uma forma Híbrida mantém corretamente sua identidade e estágio equivalente, em vez de ser reduzida a uma forma normal apenas visual.

## Browser e grafo de evolução

- Relações diretas canônicas da database não podem mais desaparecer por causa de listas de exclusão antigas ou geradas pela limpeza de duplicatas.
- Overrides explícitos de ocultação continuam sendo respeitados.
- Corrigido o caso em que evoluções válidas, como **Monodramon → Strikedramon**, podiam desaparecer do Browser.
- A evolução selecionada passa a ocupar a posição principal do estágio sem apagar outras formas registradas.
- Corrigida a recuperação da forma selecionada ao reabrir o Browser.
- Corrigida a remoção de escolhas em Digimon sem Tamer.
- O grafo agora marca apenas a forma realmente ativa.
- Corrigido o caso em que a forma original e a forma evoluída apareciam simultaneamente como forma atual.
- O mapa de evolução é recentralizado corretamente após uma evolução autônoma.
- Corrigida a ligação e a persistência do grafo em NPCs aliados.

## Identidade após evolução

- Corrigido o problema em que um NPC evoluía mecanicamente, mas mantinha o nome e a espécie da forma anterior.
- A troca de forma agora atualiza corretamente:
  - nome do Actor;
  - nome customizado;
  - espécie;
  - `sourceId`;
  - `databaseId`;
  - nomes canônico, original e DUB;
  - aliases;
  - nome da forma atual;
  - nome da forma-fonte.
- NPCs aliados e inimigos deixam de ser tratados como parceiros persistentes de Tamer.
- Parceiros reais de Tamer continuam preservando seu apelido entre formas.
- Corrigido o caso **Motimon → Kokabuterimon**, em que a ficha continuava exibindo Motimon após a evolução.
- Snapshots antigos e novos passam a carregar os dados completos de identidade da forma.

## Criador de NPC e Qualidades

- Adicionado suporte completo à configuração de **Naturewalk / Passo Natural** no Criador de Digimon NPC.
- O Browser de Qualidades do NPC agora permite selecionar:
  - o elemento/terreno;
  - o Main Stat associado.
- As escolhas de Naturewalk são preservadas corretamente na Qualidade criada.
- Corrigida a integração de Qualidades configuráveis com o orçamento de PD do NPC.
- Melhorada a seleção e a persistência de Qualidades por rank no Creator.

## Wizard, filtros e catálogos

- Reorganizada a ordem das linhas de filtros para corresponder ao fluxo visual planejado.
- O menu de filtros do Wizard agora pode ser recolhido.
- Corrigida a ordem de apresentação dos cards no catálogo/compêndio.
- Corrigido o fluxo de abertura do catálogo de Qualidades durante a configuração de **Superior Mode Change**.
- Mantida a rolagem dos painéis ao atualizar filtros e opções do Creator.
- Corrigidos pontos de integração entre o Wizard de forma atual, Browser de Qualidades e snapshots persistentes.

## Descanso e vínculo

- O descanso do Tamer agora também aplica o descanso correspondente ao Digimon parceiro vinculado.
- Recursos, usos e estados associados ao descanso passam a ser sincronizados corretamente entre Tamer e parceiro.
- Mantido o fluxo independente para Digimon NPCs sem Tamer.

## Ações do Tamer e Talentos

- Expandida a fundação das Ações do Tamer.
- Implementado **Segurar / Hold**:
  - criação de preparação pela ficha;
  - gatilho e resposta por chat;
  - janela de ataque fora do turno;
  - suporte a ataques preparados de 1 Ação;
  - integração com bônus de Inteligência;
  - integração com **Best Laid Plans**.
- Implementado **Trabalho em Equipe / Teamwork**:
  - suporte a testes cooperativos;
  - integração com Talentos relacionados;
  - normalização dos resultados no chat.
- Adicionadas ou ampliadas automações de Talentos do Tamer, incluindo:
  - Quick Step;
  - Bulk Up;
  - Direct Team;
  - Experienced;
  - Calculated;
  - Potential;
  - Aim Assist;
  - Experienced Step;
  - Joint Effort;
  - Academic Advice;
  - Danger Sense;
  - Calming Influence;
  - Team Player;
  - Break the Chain;
  - With the Will;
  - Evasive Maneuvers;
  - Undefeated Endurance;
  - Best Laid Plans.
- Melhorada a infraestrutura de efeitos temporários, próximos testes, concessão de Ações, cura e efeitos aplicados a múltiplos alvos.

## Overclock e mudanças de modo

- Implementada a automação de **Overclock**.
- Overclock agora permite aplicar ao próprio Digimon um Efeito Positivo adquirido.
- Suporte aos resultados de sucesso, sucesso crítico e falha crítica conforme as regras.
- Implementado o fluxo normal de **Mode Change**.
- Expandida a configuração de **Superior Mode Change** no Criador de NPC:
  - escolha de Qualidades padrão;
  - escolha de Qualidades do Modo;
  - controle de custo;
  - validação do limite do estágio;
  - integração com ataques e configurações especiais.
- Corrigida a abertura do Browser de Qualidades do Modo.

## Interface e estabilidade

- Adicionadas traduções em português e inglês para os novos fluxos.
- Melhorada a apresentação visual de aliados e inimigos.
- Corrigidos imports, listeners e validações que impediam a abertura de aplicações.
- Preservados retrato e token específicos de cada forma durante mudanças e snapshots.
- Mantida compatibilidade com Foundry VTT v13.

---

## 2.0.4-beta

### English

This update focuses on Partner creation and form persistence, combat stability, Tamer Talent automation, Quality handling, progression fixes, and general system polish.

#### Partner Creation and Evolution

- Expanded the Partner Creation Wizard with improved per-form mechanical building.
- Improved Starting Stage and Main Form handling.
- Improved persistence of Partner form snapshots.
- Improved preservation of Attacks between Partner forms.
- Improved preservation of portrait and token images between evolution and regression.
- Removed the redundant Tamer creation prompt when editing an existing Partner form.
- Improved current-form and future-form editing workflows.
- Added scrolling to the selected Qualities column in Partner Creation.
- Improved the Quality Browser filter layout and collapsible filter controls.
- Improved Build Template and form-specific configuration handling.
- Fixed Algomon Perfect using Algomon Ultimate's profile portrait.
- Fixed several Partner Wizard DP, image, selection, and rendering issues.

#### Tamer Talents

- Added automation for Experienced.
- Added automation for Break the Chain.
- Added automation for Avoiding Consequences.
- Added automation for Tuck and Roll.
- Added automation for No Pain, No Gain.
- Added Grit defense automation, allowing Endurance to replace Evade.
- Added Grit survival automation, allowing a Tamer to remain at 1 Wound Box.
- Improved Lucky Number automation and reward handling.
- Improved triggered Talent usage, charges, Rest recovery, and chat feedback.

#### Combat and Damage

- Improved Dodge request cancellation and timeout handling.
- Fixed stale or unresolved Dodge requests.
- Fixed Fumble Attack tie behavior so equal Accuracy and Dodge correctly results in a miss.
- Improved stable Attack identification between chat cards and resolution.
- Fixed Attack resolution errors involving undefined Dodge data.
- Fixed temporal initialization errors in Attack resolution.
- Added minimum Damage handling for Grit defenses.
- Improved central Damage application and survival interception.
- Improved damage card feedback for Talents and automated effects.
- Fixed Signature Move battery consumption.
- Improved direct Digimon Main Stat rolls.
- Improved combat effect and end-of-turn handling.

#### Rest and Resources

- Tamer Rest now also applies Rest recovery to the linked Partner Digimon.
- Improved Tamer Talent use recovery during Rest.
- Improved shared Partner and Tamer resource recovery.
- Improved action and combat resource synchronization.

#### Digivolution and Progression

- Normal Digivolution now restores the Digimon to full Wound Boxes.
- Fixed Tamer Attribute Cap progression after Milestones.
- Increased the supported Digimon Main Stat cap to 20.
- Improved evolution form data and snapshot normalization.
- Improved portrait and token selection during form transitions.

#### Qualities and Attacks

- Improved Area Attack Quality selection and synchronization.
- Improved Advanced Effect Quality selection and synchronization.
- Improved Quality choice cleanup in Item sheets.
- Improved unavailable Quality detection and filtering.
- Improved Core Discount, free Quality, and Negative Quality calculations.
- Improved form-specific Quality storage and restoration.
- Fixed multiple Quality Browser display and interaction issues.

#### Interface and Localization

- Added missing English and Brazilian Portuguese localization keys.
- Improved Tamer Talent prompts, cards, costs, and result messages.
- Improved Partner Creation interface scrolling and layout.
- Improved several chat cards and system notifications.
- Fixed assorted interface, localization, portrait, Rest, combat, and Wizard issues.

### Português

Esta atualização é focada na criação e persistência do Parceiro, estabilidade do combate, automação de Talentos de Digi-Escolhido, funcionamento das Qualidades, progressão e melhorias gerais do sistema.

#### Criação do Parceiro e Evolução

- Expandido o Wizard de Criação do Parceiro com melhorias no builder mecânico por forma.
- Melhorado o funcionamento do Estágio Inicial e da Forma Principal.
- Melhorada a persistência dos snapshots das formas do Parceiro.
- Melhorada a preservação dos Ataques entre as formas do Parceiro.
- Melhorada a preservação de retratos e tokens durante evolução e regressão.
- Removida a pergunta redundante de criação de Digi-Escolhido ao editar uma forma de Parceiro existente.
- Melhorados os fluxos de edição da forma atual e de formas futuras.
- Adicionada rolagem à coluna de Qualidades selecionadas na Criação do Parceiro.
- Melhorado o layout dos filtros e o painel colapsável do Browser de Qualidades.
- Melhorado o funcionamento dos Templates de Build e configurações específicas por forma.
- Corrigido Algomon Perfect usando o retrato de perfil de Algomon Ultimate.
- Corrigidos diversos problemas de PD, imagens, seleção e renderização no Wizard do Parceiro.

#### Talentos de Digi-Escolhido

- Adicionada automação para Experienced.
- Adicionada automação para Break the Chain.
- Adicionada automação para Avoiding Consequences.
- Adicionada automação para Tuck and Roll.
- Adicionada automação para No Pain, No Gain.
- Adicionada automação de defesa para Grit, permitindo usar Resistência no lugar de Evasão.
- Adicionada automação de sobrevivência para Grit, permitindo permanecer com 1 Caixa de Ferimento.
- Melhorada a automação e concessão de recompensas de Lucky Number.
- Melhorados os usos, cargas, recuperação por Descanso e mensagens dos Talentos ativados por gatilho.

#### Combate e Dano

- Melhorado o cancelamento e o timeout das solicitações de Esquiva.
- Corrigidas solicitações de Esquiva antigas ou que permaneciam sem resolução.
- Corrigido o empate de Acerto e Esquiva durante um Ataque Fumble para resultar corretamente em erro.
- Melhorada a identificação estável de Ataques entre os cards e a resolução.
- Corrigidos erros de resolução envolvendo dados de Esquiva indefinidos.
- Corrigidos erros de inicialização temporal durante a resolução de Ataques.
- Adicionado o Dano mínimo das defesas realizadas com Grit.
- Melhorada a aplicação central de Dano e a interceptação de efeitos de sobrevivência.
- Melhorados os cards de Dano para Talentos e efeitos automatizados.
- Corrigido o consumo de Bateria de Signature Move.
- Melhoradas as rolagens diretas dos Atributos Principais de Digimon.
- Melhorado o processamento de efeitos de combate e fim de turno.

#### Descanso e Recursos

- O Descanso do Digi-Escolhido agora também aplica a recuperação de Descanso ao Digimon Parceiro vinculado.
- Melhorada a recuperação dos usos dos Talentos durante o Descanso.
- Melhorada a recuperação compartilhada de recursos entre Parceiro e Digi-Escolhido.
- Melhorada a sincronização de Ações e recursos de combate.

#### Digievolução e Progressão

- A Digievolução normal agora restaura completamente as Caixas de Ferimento do Digimon.
- Corrigida a progressão do Limite de Atributos do Digi-Escolhido após Marcos.
- Aumentado para 20 o limite suportado dos Atributos Principais de Digimon.
- Melhoradas a normalização e persistência dos dados das formas evolutivas.
- Melhorada a seleção de retratos e tokens durante transições de forma.

#### Qualidades e Ataques

- Melhorada a seleção e sincronização de Qualidades de Ataque em Área.
- Melhorada a seleção e sincronização de Qualidades de Efeito Avançado.
- Melhorada a limpeza das escolhas de Qualidade nas fichas de Item.
- Melhorados a detecção e o filtro de Qualidades indisponíveis.
- Melhorados os cálculos de Desconto Central, Qualidade gratuita e Qualidades Negativas.
- Melhorado o armazenamento e a restauração de Qualidades específicas por forma.
- Corrigidos diversos problemas visuais e de interação no Browser de Qualidades.

#### Interface e Localização

- Adicionadas traduções ausentes em inglês e português brasileiro.
- Melhorados os prompts, cards, custos e resultados dos Talentos de Digi-Escolhido.
- Melhorados a rolagem e o layout da interface de Criação do Parceiro.
- Melhorados diversos cards de chat e notificações do sistema.
- Corrigidos diversos problemas de interface, tradução, retratos, Descanso, combate e Wizards.

---

## 2.0.3-beta

### English

This release marks the official transition of Digimon Digital Adventures V2 from alpha into beta. Version 2.0.3-beta consolidates several major systems into a more playable, testable, and visually polished foundation, including enemy creation tools, partner progression tools, canvas health indicators, Digivice control improvements, and Actor Directory UI polish.

This is still a beta release. Some advanced automations, special evolution flows, and deeper quality interactions are still in development, but the system now has a much stronger gameplay foundation for real table use.

#### Highlights

- Added the Enemy Digimon Wizard.
- Added the Enemy Quality Browser.
- Added Tamer Advancement tools.
- Added GM Partner Progress tools.
- Added canvas health pips.
- Added enemy Digivice assets.
- Added custom Actor Directory action icons.
- Improved Digivice physical button behavior.
- Fixed player access to Digivice sheet close controls.
- Improved visual consistency across Tamer, Partner Digimon, and Enemy Digimon sheets.
- Updated the project version to 2.0.3-beta.

#### Enemy Digimon Wizard

- Added a new wizard for creating Enemy Digimon directly from the Actor Directory.
- Added support for enemy species, stage, type, attribute, family, field, and group data.
- Added DP budget tracking for enemy creation.
- Added attribute distribution during enemy creation.
- Added attack creation inside the wizard.
- Added quality selection for enemies.
- Added support for positive, negative, and free qualities.
- Added DP spent, DP remaining, and budget overflow display.
- Added automatic creation of NPC actors with selected attacks and qualities.
- Added dedicated styling for the Enemy Digimon Wizard.

#### Enemy Quality Browser

- Added a dedicated quality browser for Enemy Digimon creation.
- Added search and filtering tools.
- Added support for quality cost/tier filtering.
- Added support for displaying requirements and incompatibilities.
- Added support for qualities that require choices.
- Added support for qualities that require selecting an attack.
- Added integration with attacks created during the Enemy Digimon Wizard flow.
- Added visual feedback for unavailable or blocked qualities.

#### Canvas and Combat UI

- Added health pips around tokens on the canvas.
- Added visual health tracking for Tamers, Partner Digimon, and Enemy Digimon.
- Added separate visual behavior for friendly and enemy tokens.
- Improved token readability during combat scenes.
- Added canvas-side support for clearer health state feedback.

#### Partner Progress and Tamer Advancement

- Added GM Partner Progress Panel.
- Added support for campaign milestones.
- Added support for individual milestone handling.
- Added support for party/group milestone handling.
- Added tools for tracking linked Tamers and Partner Digimon.
- Added stage unlock controls for partner evolution progress.
- Added support for crest/Digivice reveal handling when the compatibility questionnaire is enabled.
- Added Tamer Advancement interface and related progression support.

#### Digivice Sheet Controls

- Fixed Digivice close button behavior for non-GM players.
- Reworked Digivice physical button markup to avoid sheet permission conflicts.
- Improved Close, Sheet Configuration, and Prototype Token button behavior.
- Reordered physical Digivice button roles:
  - left button: Close;
  - upper-right button: Sheet Configuration;
  - lower-right button: Prototype Token.
- Removed old conflicting glow effects from Digivice buttons.
- Improved hover effects so the real underlying Digivice button color is enhanced instead of replaced.
- Removed duplicate/legacy button tooltip behavior.
- Improved Digivice button visuals across Tamer, Partner Digimon, and Enemy Digimon sheets.

#### Actor Directory UI

- Added custom icons for Actor Directory action buttons:
  - Partner Progress;
  - Create Tamer;
  - Create Partner Digimon;
  - Create Enemy Digimon.
- Added distinct button colors for faster recognition:
  - blue for Partner Progress;
  - amber for Tamer creation;
  - green for Partner Digimon creation;
  - purple/magenta for Enemy Digimon creation.
- Improved button size, spacing, typography, hover states, and icon alignment.
- Replaced several generic Font Awesome icons with project-specific SVG assets.

#### Assets

- Added `assets/ui/digimon-enemy.webp`.
- Added `assets/ui/digimon.svg`.
- Added `assets/ui/enemy-digimon.svg`.
- Added `assets/ui/progress-partner.svg`.
- Added `assets/ui/tamer.svg`.
- Renamed `assets/digimon/tokens/ShineGreymon_Burst.webp` to `assets/digimon/tokens/ShineGreymonBurstMode.webp`.

#### Fixes

- Fixed player inability to close certain Digivice sheets.
- Fixed old Digivice hover/glow effects appearing on enemy sheets.
- Fixed inconsistent Actor Directory button styling.
- Fixed SVG icon sizing for Tamer and Partner Progress buttons.
- Fixed ShineGreymon Burst Mode token naming consistency.
- Improved several visual inconsistencies in sheet controls and wizard interfaces.
- Cleaned up UI behavior around Digivice button hitboxes.

---

### Português

Esta versão marca a transição oficial do Digimon Digital Adventures V2 do estágio alpha para beta. A versão 2.0.3-beta consolida vários sistemas importantes em uma base mais jogável, testável e visualmente polida, incluindo ferramentas de criação de inimigos, progresso de parceiros, indicadores de saúde no canvas, melhorias nos controles do Digivice e polimento da interface do Diretório de Atores.

Esta ainda é uma versão beta. Algumas automações avançadas, fluxos de evolução especial e interações mais profundas de Qualidades continuam em desenvolvimento, mas o sistema agora possui uma base muito mais sólida para uso real em mesa.

#### Destaques

- Adicionado o Enemy Digimon Wizard.
- Adicionado o Enemy Quality Browser.
- Adicionadas ferramentas de Tamer Advancement.
- Adicionadas ferramentas de GM Partner Progress.
- Adicionados pips de saúde no canvas.
- Adicionados assets de Digivice inimigo.
- Adicionados ícones customizados para ações do Diretório de Atores.
- Melhorado o comportamento dos botões físicos do Digivice.
- Corrigido o acesso de jogadores ao botão de fechar das fichas com Digivice.
- Melhorada a consistência visual entre fichas de Tamer, Partner Digimon e Enemy Digimon.
- Atualizada a versão do projeto para 2.0.3-beta.

#### Enemy Digimon Wizard

- Adicionado um novo wizard para criar Digimon inimigos diretamente pelo Diretório de Atores.
- Adicionado suporte a espécie, estágio, tipo, atributo, família, campo e grupo do inimigo.
- Adicionado controle de orçamento de DP para criação de inimigos.
- Adicionada distribuição de atributos durante a criação.
- Adicionada criação de ataques dentro do wizard.
- Adicionada seleção de Qualidades para inimigos.
- Adicionado suporte a Qualidades positivas, negativas e gratuitas.
- Adicionada exibição de DP gasto, DP restante e estouro de orçamento.
- Adicionada criação automática de atores NPC com ataques e Qualidades selecionados.
- Adicionado CSS dedicado para o Enemy Digimon Wizard.

#### Enemy Quality Browser

- Adicionado um browser de Qualidades dedicado ao fluxo de criação de Digimon inimigos.
- Adicionadas ferramentas de busca e filtro.
- Adicionado suporte a filtro por custo/tier de Qualidade.
- Adicionada exibição de requisitos e incompatibilidades.
- Adicionado suporte a Qualidades que exigem escolhas.
- Adicionado suporte a Qualidades que exigem seleção de ataque.
- Adicionada integração com ataques criados durante o fluxo do Enemy Digimon Wizard.
- Adicionado feedback visual para Qualidades indisponíveis ou bloqueadas.

#### Canvas e interface de combate

- Adicionados pips de saúde ao redor dos tokens no canvas.
- Adicionado acompanhamento visual de saúde para Tamers, Partner Digimon e Enemy Digimon.
- Adicionado comportamento visual separado para tokens aliados e inimigos.
- Melhorada a leitura dos tokens durante cenas de combate.
- Adicionado suporte visual no canvas para representar melhor o estado de saúde.

#### Partner Progress e Tamer Advancement

- Adicionado o painel de GM Partner Progress.
- Adicionado suporte a marcos de campanha.
- Adicionado suporte a marcos individuais.
- Adicionado suporte a marcos de grupo/party.
- Adicionadas ferramentas para acompanhar Tamers e Partner Digimon vinculados.
- Adicionados controles de liberação de estágios para progresso de evolução do parceiro.
- Adicionado suporte à revelação de brasão/Digivice quando o questionário de compatibilidade estiver ativo.
- Adicionada interface de Tamer Advancement e suporte relacionado à progressão.

#### Controles das fichas com Digivice

- Corrigido o comportamento do botão de fechar do Digivice para jogadores não-GM.
- Reestruturado o markup dos botões físicos do Digivice para evitar conflitos de permissão da ficha.
- Melhorado o comportamento dos botões Close, Sheet Configuration e Prototype Token.
- Reordenadas as funções dos botões físicos do Digivice:
  - botão esquerdo: Close;
  - botão direito superior: Sheet Configuration;
  - botão direito inferior: Prototype Token.
- Removidos brilhos antigos conflitantes dos botões do Digivice.
- Melhorado o efeito de hover para intensificar a cor real do botão por baixo, em vez de substituir a aparência dele.
- Removido comportamento duplicado/antigo de tooltips dos botões.
- Melhorado o visual dos botões do Digivice em fichas de Tamer, Partner Digimon e Enemy Digimon.

#### Interface do Diretório de Atores

- Adicionados ícones customizados para botões de ação do Diretório de Atores:
  - Partner Progress;
  - Create Tamer;
  - Create Partner Digimon;
  - Create Enemy Digimon.
- Adicionadas cores distintas para reconhecimento rápido:
  - azul para Partner Progress;
  - âmbar para criação de Tamer;
  - verde para criação de Partner Digimon;
  - roxo/magenta para criação de Enemy Digimon.
- Melhorados tamanho, espaçamento, tipografia, hover e alinhamento dos ícones.
- Substituídos vários ícones genéricos do Font Awesome por SVGs próprios do projeto.

#### Assets

- Adicionado `assets/ui/digimon-enemy.webp`.
- Adicionado `assets/ui/digimon.svg`.
- Adicionado `assets/ui/enemy-digimon.svg`.
- Adicionado `assets/ui/progress-partner.svg`.
- Adicionado `assets/ui/tamer.svg`.
- Renomeado `assets/digimon/tokens/ShineGreymon_Burst.webp` para `assets/digimon/tokens/ShineGreymonBurstMode.webp`.

#### Correções

- Corrigida a impossibilidade de jogadores fecharem certas fichas com Digivice.
- Corrigidos efeitos antigos de hover/glow aparecendo em fichas de inimigos.
- Corrigida a inconsistência visual dos botões do Diretório de Atores.
- Corrigido o tamanho dos ícones SVG dos botões de Tamer e Partner Progress.
- Corrigida a consistência do nome do token de ShineGreymon Burst Mode.
- Melhoradas inconsistências visuais em controles de ficha e interfaces de wizard.
- Ajustado o comportamento visual das áreas clicáveis dos botões do Digivice.