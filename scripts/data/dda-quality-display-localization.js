/**
 * Centralized presentation layer for Digimon Qualities.
 *
 * The mechanical dataset keeps stable ids and automation fields. This helper
 * only localizes labels and corrects legacy English display text that had been
 * partially translated word-by-word.
 */

const DDA_QUALITY_SECTION_LABELS = {
  "Core Qualities": {
    "pt-BR": "Qualidades Centrais",
    "en": "Core Qualities"
  },
  "Offensive Qualities": {
    "pt-BR": "Qualidades Ofensivas",
    "en": "Offensive Qualities"
  },
  "Defensive Qualities": {
    "pt-BR": "Qualidades Defensivas",
    "en": "Defensive Qualities"
  },
  "Clash Qualities": {
    "pt-BR": "Qualidades de Clash",
    "en": "Clash Qualities"
  },
  "Digizoid Armor": {
    "pt-BR": "Armaduras de Digizoide",
    "en": "Digizoid Armor"
  },
  "Digizoid Weaponry": {
    "pt-BR": "Armamentos de Digizoide",
    "en": "Digizoid Weaponry"
  },
  "Effect Qualities": {
    "pt-BR": "Qualidades de Efeito",
    "en": "Effect Qualities"
  },
  /*
   * Mantém a chave antiga para Items e compêndios
   * que ainda tenham "Evoker Qualities".
   */
  "Evoker Qualities": {
    "pt-BR": "Qualidades de Conjuração",
    "en": "Omnievoker Qualities"
  },

  "Omnievoker Qualities": {
    "pt-BR": "Qualidades de Conjuração",
    "en": "Omnievoker Qualities"
  },
  "Free Qualities": {
    "pt-BR": "Qualidades Gratuitas",
    "en": "Free Qualities"
  },
  "Gain Force Qualities": {
    "pt-BR": "Qualidades de Força Crescente",
    "en": "Gain Force Qualities"
  },
  "Mode Change Qualities": {
    "pt-BR": "Qualidades de Mudança de Modo",
    "en": "Mode Change Qualities"
  },
  "Negative Qualities": {
    "pt-BR": "Qualidades Negativas",
    "en": "Negative Qualities"
  },
  "Optional Qualities": {
    "pt-BR": "Qualidades Opcionais",
    "en": "Optional Qualities"
  },
  "Preservation Qualities": {
    "pt-BR": "Qualidades de Preservação",
    "en": "Preservation Qualities"
  },
  "Stance Qualities": {
    "pt-BR": "Qualidades de Postura",
    "en": "Stance Qualities"
  },
  "Utility Qualities": {
    "pt-BR": "Qualidades Utilitárias",
    "en": "Utility Qualities"
  }
};

const DDA_QUALITY_AVAILABILITY_LABELS = {
  "starting": {
    "pt-BR": "Qualidade Inicial",
    "en": "Starting Quality"
  },
  "champion": {
    "pt-BR": "Qualidade de Adulto",
    "en": "Champion Quality"
  },
  "perfect": {
    "pt-BR": "Qualidade de Perfeito",
    "en": "Ultimate Quality"
  },
  "mega": {
    "pt-BR": "Qualidade de Mega",
    "en": "Mega Quality"
  },
  "free": {
    "pt-BR": "Qualidade Gratuita",
    "en": "Free Quality"
  },
  "negative": {
    "pt-BR": "Qualidade Negativa",
    "en": "Negative Quality"
  },
  "optional": {
    "pt-BR": "Qualidade Opcional",
    "en": "Optional Quality"
  }
};

const DDA_QUALITY_I18N_PRESENTATION = {
  efeitoBasico: {
    nameKey: "DDA.Quality.Name.BasicEffect",
    choiceLabelKey: "DDA.Quality.Choice.BasicEffectTag"
  },
  efeitoAvancado: {
    nameKey: "DDA.Quality.Name.AdvancedEffect",
    choiceLabelKey: "DDA.Quality.Choice.AdvancedEffectTag"
  },
  efeitoMestre: {
    nameKey: "DDA.Quality.Name.MasterEffect",
    choiceLabelKey: "DDA.Quality.Choice.MasterEffectTag"
  }
};

function localizeQualityPresentationKey(key = "", fallback = "") {
  const value = globalThis.game?.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

/*
 * These are presentation-only corrections for entries whose English copy was
 * historically saved as a Portuguese/English hybrid. Do not put mechanics,
 * source ids, formulas, or automation values here.
 */
const DDA_QUALITY_EN_DISPLAY_OVERRIDES = {
  "perfuracaoDeArmadura": {
    "fields": {
      "requirements.text": "Requires Total Damage 4 for Rank 1, 8 for Rank 2, and 12 for Rank 3.",
      "incompatible.text": "[PIERCING] and [CERTAIN] cannot be applied to the same Attack unless both are applied to the Signature Move.",
      "choices.label": "Attack with [PIERCING]",
      "effect": "On first purchase, apply the [PIERCING] Tag to one [DAMAGE] Attack. An Attack with [PIERCING] deals Unalterable Damage on a hit equal to twice this Quality's Ranks, or equal to this Quality's Ranks on an Area Attack. [PIERCING] may only be applied to one Attack per Digimon. If [PIERCING] is applied to a Signature Move, Battery added to the Attack's Damage may become Unalterable Damage instead, up to this Quality's Ranks, chosen when the Tag is applied to the Attack.",
      "description": "Armor Piercing allows one specific [DAMAGE] Attack to bypass defenses and deal fixed Unalterable Damage on a hit."
    }
  },
  "golpeCerteiro": {
    "fields": {
      "requirements.text": "Requires Total Accuracy 4 for Rank 1, 8 for Rank 2, and 12 for Rank 3.",
      "incompatible.text": "[CERTAIN] and [PIERCING] cannot be applied to the same Attack unless both are applied to the Signature Move.",
      "choices.label": "Attack with [CERTAIN]",
      "effect": "On first purchase, apply the [CERTAIN] Tag to one [DAMAGE] Attack. An Attack with [CERTAIN] gains automatic Successes equal to this Quality's Ranks. [CERTAIN] may only be applied to one Attack per Digimon. If [CERTAIN] is applied to a Signature Move and the Digimon has 2 Battery or more, the Attack gains +1 additional automatic Success.",
      "description": "Certain Strike makes one specific [DAMAGE] Attack more reliable by granting automatic Accuracy Successes."
    }
  },
  "ataqueDeInvestida": {
    "fields": {
      "requirements.text": "The [CHARGE] Tag must be applied to a [MELEE] Attack."
    }
  },
  "municao": {
    "fields": {
      "requirements.text": "Cannot be applied to a Signature Move."
    }
  },
  "recuoPesado": {
    "fields": {
      "requirements.text": "The [RECOIL] Tag must be applied to a [RANGE] Attack.",
      "incompatible.text": "Cannot be used in Sentry Stance."
    }
  },
  "duelistaDeHordas": {
    "fields": {
      "incompatible.text": "Incompatible with Aggressive Flank.",
      "effect": "When adjacent only to enemies, the Digimon may spend 1 Action to make a BIT (Survival) Check. The TN is 10 + the highest Stage among adjacent enemies + the number of adjacent enemies. On a success, it gains an Accuracy bonus equal to BIT against adjacent enemies that have no allies adjacent to the target until the start of its next turn. On a critical success, it recovers the spent Action. On a critical failure, it cannot use this Quality again until the end of the Combat."
    }
  },
  "ocultarAVista": {
    "requiredFor": [
      "Shade Cloak",
      "Sneak Attack"
    ],
    "fields": {
      "effect": "The Digimon may make a Stealth Check as 1 Action once per turn to hide even while in plain sight, treating itself as Obscured for that purpose. When it interferes with combat, such as by attacking, it is no longer hidden."
    }
  },
  "mantoDeSombras": {
    "fields": {
      "requirements.text": "Requires Hide in Plain Sight.",
      "effect": "When making a RAM (Stealth) Check, the Digimon may spend +1 Action so that allies within a distance equal to its RAM receive the same result and benefit while they remain within that distance. In Combat, if any benefiting ally interferes, the effect ends for everyone."
    }
  },
  "ataqueFurtivo": {
    "fields": {
      "requirements.text": "Requires Hide in Plain Sight.",
      "choices.label": "Attack with [SNEAK]",
      "effect": "Apply [SNEAK] to one Attack. [RANGE][SNEAK] Attacks cost +1 Action, except for a Signature Move. When attacking an enemy from whom it is hidden, the Digimon gains an Accuracy bonus equal to RAM."
    }
  },
  "golpeSimplificado": {
    "fields": {
      "choices.label": "Attack with [SIMPLE]",
      "effect": "Apply [SIMPLE] to one Attack. Whenever the Digimon uses that Attack, its Action cost is reduced by 1, to a minimum of 1."
    }
  },
  "gritoDeGuerra": {
    "fields": {
      "effect": "As 1 Action, make a DOS (Bravery) Check. The TN is 10 + the highest enemy SV + the total number of enemies in Combat. Allies within a number of spaces equal to DOS gain [BASTION] for 1 Round. On a failure they gain [BASTION 1], on a success [BASTION 2], and on a critical success the Digimon also recovers the Action. A critical failure also prevents another use until the end of the Combat."
    }
  },
  "cacadorVigilante": {
    "fields": {
      "effect": "Once per Round during its turn, the Digimon may make a DOS (Awareness) Check as a Free Action, ignoring vision penalties except Blind. As this Quality's Free Action or by spending 2 Actions, it chooses an enemy and makes a DOS (Awareness) Check against TN 12 + the target's RAM. On a success, it gains +2 Accuracy with [MELEE] Attacks against that target until the start of its next turn and treats the target as not Obscured. On a critical success, the bonus also applies to [RANGE] Attacks."
    }
  },
  "venenoso": {
    "fields": {
      "choices.label": "[DAMAGE] Attack with [VENOM]",
      "effect": "Apply [VENOM] to one [DAMAGE] Attack. If the Attack hits, the attacker makes a BIT (Survival) Check against TN 10 + the target's RAM. On a success, the target suffers [POISON] for 1 Round; if it already has [POISON], the Potency increases by 1. On a critical success, the Potency increases by an additional +1. Area Attacks do not receive this benefit."
    }
  },
  "alcance": {
    "fields": {
      "choices.label": "Reach Option",
      "effect": "Choose Wide Swings, Long Arms, or Extended Grapple. The chosen option increases the reach of melee Attacks or Clashes according to this Quality's Ranks."
    },
    "choiceOptions": {
      "wideSwings": {
        "label": "Wide Swings"
      },
      "longArms": {
        "label": "Long Arms"
      },
      "extendedGrapple": {
        "label": "Extended Grapple"
      }
    }
  },
  "evasaoAbsoluta": {
    "fields": {
      "requirements.text": "Requires Total Dodge 4 for Rank 1, 8 for Rank 2, and 12 for Rank 3."
    }
  },
  "substituir": {
    "fields": {
      "requirements.text": "Cannot be used to avoid an Attack while in a Clash. It may be used to escape a Clash when that Clash begins, as though it were an Attack."
    }
  },
  "segundoFolego": {
    "fields": {
      "requirements.text": "Can only be used in Combat."
    }
  },
  "impulsoDeSistema": {
    "fields": {
      "requirements.text": "The number of Ranks the Digimon may purchase in this Quality equals its Stage, up to a maximum of 4."
    }
  },
  "sobreposicaoIlusoria": {
    "fields": {
      "requirements.text": "When purchasing this Quality, choose Illusionary Shroud or Illusionary Barriers. Illusionary Shroud requires Naturewalk."
    }
  },
  "arremessoEspecial": {
    "fields": {
      "requirements.text": "The thrown ally must be willing and at least one Size smaller, unless the Digimon also has Monster Strength."
    }
  },
  "sequestradorDeGigantes": {
    "fields": {
      "requirements.text": "Can only be used against a Digimon at least one Size larger.",
      "incompatible.text": "A Digimon cannot enter a Clash with another Digimon that shares its Space through this Quality."
    }
  },
  "efeitoBasico": {
    "fields": {
      "requirements.text": "The Digimon cannot purchase the same Effect twice. An Attack cannot have more than one Attack Effect Tag."
    }
  },
  "efeitoAvancado": {
    "fields": {
      "requirements.text": "The Digimon cannot purchase the same Effect twice. An Attack cannot have more than one Attack Effect Tag."
    }
  },
  "orientacaoInspiradora": {
    "fields": {
      "requirements.text": "Requires 1 Rank of Basic Effect, Advanced Effect, or Master Effect. Can only be applied to a [SUPPORT] Attack with a Positive Effect."
    }
  },
  "overclock": {
    "fields": {
      "requirements.text": "When purchasing this Quality, the Digimon must also purchase a Positive Effect that requires a Caster Derived Stat, paying the DP normally. That Effect is applied to this Quality instead of an Attack, and the Digimon cannot purchase that Effect again."
    }
  },
  "escudoProtetor": {
    "fields": {
      "requirements.text": "Can only be applied to a [SUPPORT] Attack. Cannot be acquired as part of Overclock.",
      "incompatible.text": "The Digimon cannot have [SHIELD] and another Effect Tag on the same Attack. A Digimon with this Quality cannot benefit from [SHIELD] granted by this Quality."
    }
  },
  "forcaElemental": {
    "fields": {
      "incompatible.text": "Multiple Elemental Force Tags cannot be placed on the same Attack, even when they use different Elements."
    }
  },
  "golpePoderoso": {
    "fields": {
      "requirements.text": "Requires Champion. The [T:MIGHTY] Tag must be applied to a [MELEE][DAMAGE] Attack."
    }
  },
  "focoPreciso": {
    "fields": {
      "requirements.text": "Requires Champion. The [FOCUS] Tag must be applied to a [RANGE] Attack.",
      "incompatible.text": "This Tag grants no benefits to Area Attacks."
    }
  },
  "ataqueDeFinta": {
    "fields": {
      "requirements.text": "Requires Champion. The [T:FEINT] Tag must be applied to a [MELEE] Attack.",
      "incompatible.text": "A Digimon cannot have [PIERCING] or [STUN] on a [T:FEINT] Attack. This Quality cannot be used during a Clash or when activating Counterattack."
    }
  },
  "rouboDeVida": {
    "fields": {
      "incompatible.text": "The [DRAIN] Tag cannot be applied to an Attack with an Effect Tag."
    }
  },
  "controleDeDominio": {
    "choiceOptions": {
      "floodVortex": {
        "effect": "The area counts as Difficult Terrain for all Digimon within it except the Domain Controller, unless a Digimon has Advanced Mobility: Swimmer. When the Domain is created and at the start of each of the Controller's following turns, [PULL] is applied to any Digimon chosen by the Controller. That [PULL] has Potency equal to the Controller's CPU."
      },
      "gustyGarden": {
        "effect": "The area counts as Difficult Terrain for all Digimon within it except the Domain Controller, unless a Digimon has Advanced Mobility: Flight. When the Domain is created and at the start of each of the Controller's following turns, [PUSH] is applied to any Digimon chosen by the Controller. That [PUSH] has Potency equal to the Controller's RAM."
      },
      "iceField": {
        "effect": "The area counts as Difficult Terrain for enemies, and enemies within it suffer [FREEZE] while they remain in the Domain."
      },
      "poisonousGrowth": {
        "effect": "The area counts as Difficult Terrain for enemies, and enemies within it suffer [POISON] while they remain in the Domain."
      },
      "rejuvenatingLight": {
        "effect": "When the Domain is created and at the start of each of the Controller's following turns, the Controller chooses a number of Digimon up to its Stage and rolls 1d6 for each. On a result of 5 or higher, [REGEN] is applied to that Digimon until the Controller's next turn. That [REGEN] has Potency equal to the Controller's CPU."
      }
    }
  },
  "invocador": {
    "choiceOptions": {
      "recon": {
        "effect": "Costs 2 Mastery, is Medium, and gains Accuracy equal to Stage. It may make [RANGE] Attacks using the Summoner's Range and Effective Limit, and the Summoner can see through its eyes."
      },

      "volatile": {
        "effect": "Requires Element Master. Costs 1 Mastery, is Large, and gains Damage equal to Stage. Choose one owned Naturewalk Element when summoned. At 0 Wound Boxes it makes a free minimum-range [RANGE][DAMAGE][T:BURST] Attack."
      }
    }
  },
  "especializacaoDeDados": {
    "fields": {
      "requirements.text": "Requires Ultimate or higher and Data Optimization. Only Digimon at Ultimate Stage or higher may purchase 2 Ranks in this Quality."
    },
    "choiceOptions": {
      "fistfulOfForce": {
        "dataOptimizationLabel": "Close Combat",
        "effect": "The Digimon gains 1 free Rank in Area Attack. Its [MELEE] Area Attacks can now use Maximum Size, and targets within the Base Size of a [DAMAGE][MELEE] Area Attack do not halve Damage after Armor."
      },
      "mobileArtillery": {
        "dataOptimizationLabel": "Ranged Striker",
        "effect": "The Digimon gains 1 free Rank in Area Attack. Targets within the Base Size of its [DAMAGE][RANGE] Area Attack do not halve Damage after Armor. [DAMAGE][RANGE] Area Attacks with an Effect Tag must deal 4 or more Damage to apply the Effect to targets within the Base Size. In addition, when making a [RANGE] Area Attack, if the Digimon has at least 1 Rank in Naturewalk, it may spend 1 extra Action. If it does, the area becomes Difficult Terrain associated with one Element it possesses until the start of the Digimon's next turn. The Digimon must choose between surface and air when it declares the Attack."
      },
      "trySomething": {
        "dataOptimizationLabel": "Warden",
        "effect": "The Digimon gains 1 free Rank in Counterattack and +3 Health. Whenever it would make an Attack outside its turn using an Interrupt Action, it ignores the one Attack per Round rule and does not count against it. This also applies to the Prepare Action, provided the trigger is an enemy missing an Attack against a predetermined target."
      },
      "wrestlemania": {
        "dataOptimizationLabel": "Brawler",
        "effect": "The Digimon gains 1 free Rank in Prodigious Skill. Whenever it makes a Check that normally uses Clash, it may use Clash, CPU (Feats of Strength), or BIT (Performance). Any bonus to Clash, such as Data Optimization: Brawler or a larger Size, applies to any of those options. Whenever it deals Damage through an Attack while in a Clash, it makes a Check using one of those options to deal additional Damage. The TN is 12 + the higher of the target's CPU or RAM. On a critical failure, it deals no extra Damage; on a failure, +1 Damage; on a success, +3 Damage; and on a critical success, +5 Damage. The Digimon may also use the Finisher Clash Action."
      },
      "hitAndRun": {
        "dataOptimizationLabel": "Speedster",
        "effect": "The Digimon gains Charge Attack or Heavy Recoil for free. When it uses an Attack with [CHARGE] or [RECOIL], it is no longer restricted to moving in a straight line and gains additional benefits. With [CHARGE], if it moves at least 2 spaces before attacking, add its RAM to Damage; if [CHARGE] was used to move before attacking a target, it may be used again to move after the Attack. With [RECOIL], the Digimon may move before attacking as part of the same Action, but it must move closer to an opponent; if it moves at least 2 spaces before attacking, add its RAM to Damage. While using either option, the Digimon cannot be attacked with Punishing Strike."
      },
      "statusWarlord": {
        "dataOptimizationLabel": "Effect Warrior",
        "effect": "The Digimon gains a one-time 1 DP discount on an Attack Effect. When it makes a [DAMAGE] Attack without an Effect Tag on its turn, it may make a [SUPPORT] Attack during the same turn, ignoring the one Attack per Round rule. The reverse also works, allowing a [DAMAGE] Attack after a [SUPPORT] Attack."
      },
      "codeWizard": {
        "dataOptimizationLabel": "Effect Warrior"
      },
      "tacticalAdaptation": {
        "dataOptimizationLabel": "Variable",
        "effect": "The Digimon gains one Stance Quality for free or may acquire 2 Ranks of Mode Change for free. When Initiative is rolled, the Digimon may immediately take the Change Stance Action as a Free Action. In addition, it may take the Change Stance Action as a Free Action during its turn. If it has the Mode Change Quality, it may change Mode instead of changing Stance with this Quality.",
        "grants": {
          "freeQualityChoice": [
            "One Stance Quality",
            "2 Ranks of Mode Change"
          ]
        }
      }
    }
  },
  "protecaoSagrada": {
    "fields": {
      "requirements.text": "Requires Ultimate or higher and 1 Rank of Basic Effect, Advanced Effect, or Master Effect with a Positive Effect."
    }
  },
  "emblemaSombrio": {
    "fields": {
      "requirements.text": "Requires Ultimate or higher and 1 Rank of Basic Effect, Advanced Effect, or Master Effect with a Negative Effect."
    }
  },
  "efeitoMestre": {
    "fields": {
      "requirements.text": "Requires Ultimate or higher. The Digimon cannot purchase the same Effect twice. An Attack cannot have more than one Attack Effect Tag."
    }
  },
  "mudancaDeModoSuperior": {
    "fields": {
      "incompatible.text": "Mode Change and Superior Mode Change cannot be selected as standard Qualities."
    }
  },
  "perigoDigital": {
    "fields": {
      "choices.label": "Attack with [HAZARD]"
    }
  },
  "unidadeZero": {
    "fields": {
      "choices.label": "[SUPPORT] Attack with [ZERO]"
    }
  },
  "melhoriaDeMemoria": {
    "fields": {
      "requirements.text": "The Digimon may purchase 1 Rank in this Quality for every 3 Attack Tags gained from Qualities."
    }
  },
  "matador": {
    "fields": {
      "requirements.text": "When purchasing this Quality, choose a Family, Digimon Type, or Naturewalk Element.",
      "choices.label": "Slayer Target"
    }
  },
  "justicaECega": {
    "fields": {
      "requirements.text": "The Digimon is visually impaired or blind and cannot see."
    }
  },
  "tamanhoInconsistente": {
    "fields": {
      "requirements.text": "Requires Champion. It has no effect if the Digimon returns to its Standard Stage."
    }
  },
  "assinaturaComplexa": {
    "fields": {
      "requirements.text": "The Signature Move must have at least 2 other Tags granted by non-Negative Qualities. The Attack cannot already require 2 or more Actions."
    }
  },
  "vulneravel": {
    "fields": {
      "requirements.text": "The Digimon cannot purchase Ranks in this Quality if its Endurance is already 0."
    }
  },
  "perfuracaoDesastrada": {
    "fields": {
      "requirements.text": "Requires 1 or more Ranks of Armor Piercing. It can have no more Ranks in this Quality than it has in Certain Strike, as stated in the original text.",
      "choices.label": "[PIERCING] Attack that gains [FUMBLE]"
    }
  },
  "golpeEnfraquecido": {
    "fields": {
      "requirements.text": "Requires 1 or more Ranks of Certain Strike. Cannot be applied to an Attack with the [SUPPORT] Tag.",
      "incompatible.text": "Cannot be applied to a [SUPPORT] Attack.",
      "choices.label": "[CERTAIN] Attack that gains [FRAGILE]"
    }
  },
    "decepcionante": {
    "fields": {
      "incompatible.text": "Huge Power can no longer be used on an Attack with the [CERTAIN] Tag."
    }
  },

  "algoritmo": {
    "fields": {
      "incompatible.text": "Incompatible with any other Digizoid Weaponry Quality and any other Gain Force Quality."
    }
  },

  "mobilidadeAvancada": {
    "fields": {
      "requirements.text": "Requires Champion and 1 Rank of Extra Movement."
    }
  },

  "mestreElemental": {
    "fields": {
      "requirements.text": "Requires Champion and 1 or more Ranks of Naturewalk.",
      "activation.chatMessage": "Manipulate a natural aspect of an Element associated with your Naturewalk.",
      "check.notes": "During its turn, the Digimon may make a DOS (Fortitude) Check as a Free Action once per Round when manipulating its Element is difficult or complex, at the GM's discretion."
    }
  },

  "contraGolpe": {
    "fields": {
      "requirements.text": "Requires Champion and 1 Rank of Counterattack.",
      "activation.chatMessage": "When activating Counterattack, choose to halve Dodge, halve Armor, or spend two uses to apply both effects.",
      "counterattackOptions.0.label": "Halve Dodge",
      "counterattackOptions.0.effect": "The target rolls half of its Dodge Pool.",
      "counterattackOptions.1.label": "Halve Armor",
      "counterattackOptions.1.effect": "The target's Armor is halved against the Attack.",
      "counterattackOptions.2.label": "Both",
      "counterattackOptions.2.effect": "Spend two Counterattack uses to apply both effects."
    }
  },

  "contraGolpeCruzado": {
    "fields": {
      "requirements.text": "Requires Champion and 1 Rank of Counterattack.",
      "activation.chatMessage": "If an Enemy hits with a [MELEE] Attack and deals Damage at least equal to the Digimon's Stage + 1, you may trigger Counterattack."
    }
  },

  "fogoDeRetorno": {
    "fields": {
      "requirements.text": "Requires Champion and 1 Rank of Counterattack.",
      "activation.chatMessage": "Use a [RANGE][COUNTER] Attack when activating Counterattack."
    }
  },

  "recarregar": {
    "fields": {
      "requirements.text": "Requires Champion and Ammo.",
      "activation.chatMessage": "Attempt to restore the use of an [AMMO] Attack already used this Combat.",
      "effect": "As 2 Actions, the Digimon may attempt to restore the use of an [AMMO] Attack after using it in Combat. Make a BIT (Precision) Check with a TN equal to 18 minus the Digimon's RAM. On a success, the Attack can be used again as though it had not been used this Combat. On a critical success, the Digimon also recovers 1 Action spent on this Quality. Each successful use increases the TN by 3 until the end of Combat."
    }
  },

  "impulsoHibrido": {
    "fields": {
      "requirements.text": "Requires Ultimate or higher and Data Optimization."
    }
  },

  "miriadeElemental": {
    "fields": {
      "requirements.text": "Requires Ultimate or higher and Element Master."
    }
  },

  "acelerar": {
    "fields": {
      "requirements.text": "The maximum number of Ranks in Accelerate equals the Digimon's RAM.",
      "effect": "The Digimon gains +1 Movement for each Rank in this Quality. The maximum number of Ranks it can purchase in Accelerate equals its RAM.",
      "description": "Accelerate directly increases the Digimon's Movement."
    }
  },

  "melhoriaDeMemoria": {
    "fields": {
      "requirements.text": "The Digimon may purchase 1 Rank in this Quality for every 3 Attack Tags gained from Qualities.",
      "effect": "The Digimon increases its Attack List by 1 per Rank. It may purchase 1 Rank in this Quality for every 3 Attack Tags gained from Qualities. For example, to purchase 1 Rank of Memory Upgrade, the Digimon could have [PIERCING 1], [CERTAIN 1], and [CHARGE]. This Quality does not count against the Digimon's Free Quality limit.",
      "description": "Memory Upgrade expands the Digimon's Attack List as it gains Attack Tags."
    }
  },

  "modoMisericordioso": {
    "fields": {
      "effect": "The Digimon's Attacks are non-lethal by default. It may take the Hold Back Action in place of the Attack Action and may use Hold Back regardless of its Stance.",
      "description": "Merciful Mode represents a Digimon that avoids inflicting lethal wounds."
    }
  }
};

function cloneQualityValue(value) {
  if (globalThis.foundry?.utils?.deepClone) {
    return globalThis.foundry.utils.deepClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function normalizeQualityLanguage(language = "") {
  return String(language ?? "")
    .toLowerCase()
    .startsWith("en")
    ? "en"
    : "pt-BR";
}

function setQualityValueAtPath(target, path, value) {
  const segments = String(path ?? "")
    .split(".")
    .filter(Boolean);

  if (!segments.length) return;

  let cursor = target;

  for (const segment of segments.slice(0, -1)) {
    cursor[segment] ??= {};
    cursor = cursor[segment];
  }

  cursor[segments.at(-1)] = cloneQualityValue(value);
}

function applyEnglishDisplayOverrides(quality) {
  const patch = DDA_QUALITY_EN_DISPLAY_OVERRIDES[quality?.id];

  if (!patch) return quality;

  const next = cloneQualityValue(quality);

  for (const [path, value] of Object.entries(patch.fields ?? {})) {
    setQualityValueAtPath(next, path, value);
  }

  if (Array.isArray(patch.requiredFor)) {
    next.requiredFor = cloneQualityValue(patch.requiredFor);
  }

  if (patch.choiceOptions && Array.isArray(next.choices?.options)) {
    next.choices.options = next.choices.options.map((option) => {
      const optionPatch = patch.choiceOptions[option?.key];

      return optionPatch
        ? { ...option, ...cloneQualityValue(optionPatch) }
        : option;
    });
  }

  return next;
}

const DDA_QUALITY_EN_DISPLAY_SKIP_KEYS = new Set([
  "id",
  "key",
  "sourceId",
  "qualityNames",
  "originalName",
  "originalLabel",
  "type",
  "mode",
  "action",
  "stat",
  "skill",
  "tnFormula",
  "formula",
  "appliesTo",
  "grantsTags",
  "recharge"
]);

function normalizeLegacyEnglishQualityText(value = "") {
  let next = String(value ?? "");

  const exactReplacements = [
    [
      /Any other DIGIZOID WEAPONRY\s*\n\s*Any other GAIN FORCE\s*\n\s*Core Discount Available/gi,
      "Cannot be combined with any other Digizoid Weaponry or Gain Force Quality. Core Discount Available."
    ],
    [
      /ALGORITHM\s*\|\s*Any other DIGIZOID WEAPONRY/gi,
      "Requires Algorithm. Cannot be combined with any other Digizoid Weaponry."
    ],
    [
      /ALGORITHM\s*\|\s*Any other GAIN FORCE/gi,
      "Requires Algorithm. Cannot be combined with any other Gain Force Quality."
    ],
    [
      /Any other DIGIZOID ARMOR/gi,
      "Cannot be combined with any other Digizoid Armor."
    ],
    [
      /Incompatible with qualquer outra Quality de Weaponmento de Digizóide e qualquer outra Quality de Força Crescente\./gi,
      "Incompatible with any other Digizoid Weaponry Quality and any other Gain Force Quality."
    ],
    [
      /Any other Weaponmento de Digizóide, Any other Força Crescente/gi,
      "Any other Digizoid Weaponry, Any other Gain Force Quality"
    ]
  ];

  for (const [pattern, replacement] of exactReplacements) {
    next = next.replace(pattern, replacement);
  }

  return next
    .replace(/\bUltimate\s+ou\s+superior\b/gi, "Ultimate or higher")
    .replace(/\bChampion\s+e\s+/gi, "Champion and ")
    .replace(/\bMega\s+e\s+/gi, "Mega and ")
    .replace(/\s+ou\s+/gi, " or ")
    .replace(/\s+e\s+/gi, " and ");
}

function normalizeLegacyEnglishQualityDisplayTree(
  value,
  propertyName = ""
) {
  if (typeof value === "string") {
    if (DDA_QUALITY_EN_DISPLAY_SKIP_KEYS.has(propertyName)) {
      return value;
    }

    return normalizeLegacyEnglishQualityText(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => {
      return normalizeLegacyEnglishQualityDisplayTree(
        entry,
        propertyName
      );
    });
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        return [
          key,
          normalizeLegacyEnglishQualityDisplayTree(entry, key)
        ];
      })
    );
  }

  return value;
}

export function localizeDigimonQualityPresentation(
  quality,
  language = ""
) {
  const locale = normalizeQualityLanguage(language);
  let next = cloneQualityValue(quality ?? {});

  const sectionKey = String(next.section ?? "");
  const availabilityKey = sectionKey === "Optional Qualities"
    ? "optional"
    : String(next.tier ?? "starting");

  const localizedSection = DDA_QUALITY_SECTION_LABELS[sectionKey]?.[locale];

  if (localizedSection) {
    next.section = localizedSection;
  }

  const localizedAvailability =
    DDA_QUALITY_AVAILABILITY_LABELS[availabilityKey]?.[locale];

  if (localizedAvailability) {
    next.availability = {
      ...(next.availability ?? {}),
      label: localizedAvailability
    };
  }

  const i18nPresentation = DDA_QUALITY_I18N_PRESENTATION[next.id];

  if (i18nPresentation) {
    next.name = localizeQualityPresentationKey(
      i18nPresentation.nameKey,
      next.name
    );

    if (next.choices) {
      next.choices = {
        ...next.choices,
        label: localizeQualityPresentationKey(
          i18nPresentation.choiceLabelKey,
          next.choices.label
        )
      };
    }
  }

  if (locale === "en") {
    next = applyEnglishDisplayOverrides(next);
    next = normalizeLegacyEnglishQualityDisplayTree(next);
  }

  return next;
}