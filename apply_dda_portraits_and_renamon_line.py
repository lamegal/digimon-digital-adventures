from __future__ import annotations

import base64
import shutil
import subprocess
import sys
import zlib
from datetime import datetime
from pathlib import Path


# =========================================================
# DDA — Portraits + linha Renamon / Tenkomon / Sekkamon / Yukinamon
#
# Uso: coloque este arquivo na raiz do sistema Foundry
#      (a pasta que contém assets/, scripts/, templates/, data/)
#      e rode: python apply_dda_portraits_and_renamon_line.py
#
# O script não modifica o JSON V6 gerado. Ele cria uma sobreposição
# durável em scripts/data/ e aplica somente os pequenos imports/fluxos
# necessários no runtime e no browser de evolução.
# =========================================================

SYSTEM_ROOT = Path(__file__).resolve().parent
PATCH_MARKER = "DDA Portrait Integration — Renamon Line"
OVERLAY_RELATIVE_PATH = Path("scripts/data/dda-portrait-and-manual-digimon-data.js")

OVERLAY_ZLIB_BASE64 = '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'


class PatchError(RuntimeError):
    pass


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8", newline="\n")


def require_file(relative: str) -> Path:
    path = SYSTEM_ROOT / relative
    if not path.is_file():
        raise PatchError(f"Arquivo esperado não encontrado: {relative}")
    return path


def backup_file(path: Path, backup_root: Path) -> None:
    relative = path.relative_to(SYSTEM_ROOT)
    destination = backup_root / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, destination)


def inject_once(text: str, old: str, new: str, label: str) -> tuple[str, bool]:
    if new in text:
        return text, False

    count = text.count(old)
    if count != 1:
        raise PatchError(
            f"Não consegui localizar com segurança o ponto de edição: {label}. "
            f"Ocorrências encontradas: {count}."
        )

    return text.replace(old, new, 1), True


def patch_file(path: Path, changes: list[tuple[str, str, str]], backup_root: Path) -> bool:
    original = read_text(path)
    updated = original
    changed = False

    for label, old, new in changes:
        updated, did_change = inject_once(updated, old, new, label)
        changed = changed or did_change

    if changed:
        backup_file(path, backup_root)
        write_text(path, updated)

    return changed


def get_overlay_source() -> str:
    return zlib.decompress(base64.b64decode(OVERLAY_ZLIB_BASE64)).decode("utf-8")


def write_overlay(backup_root: Path) -> bool:
    path = SYSTEM_ROOT / OVERLAY_RELATIVE_PATH
    expected = get_overlay_source()

    if path.exists() and read_text(path) == expected:
        return False

    if path.exists():
        backup_file(path, backup_root)

    path.parent.mkdir(parents=True, exist_ok=True)
    write_text(path, expected)
    return True


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def create_static_base_asset(portrait_file: str, output_relative: str) -> bool:
    source = SYSTEM_ROOT / "assets/digimon/portraits" / portrait_file
    output = SYSTEM_ROOT / output_relative

    if not source.is_file():
        raise PatchError(f"Portrait fonte não encontrado: {source.relative_to(SYSTEM_ROOT)}")

    if output.exists():
        return False

    output.parent.mkdir(parents=True, exist_ok=True)

    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", str(source),
        "-frames:v", "1",
        "-vf", "format=rgb24",
        "-c:v", "libwebp",
        "-q:v", "90",
        str(output),
    ]

    result = subprocess.run(command, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        raise PatchError(
            f"FFmpeg falhou ao criar {output.relative_to(SYSTEM_ROOT)}:\n"
            f"{result.stderr.strip() or result.stdout.strip()}"
        )

    return True


def node_check(path: Path) -> str:
    if shutil.which("node") is None:
        return "Node.js não encontrado: validação de sintaxe JS ignorada."

    result = subprocess.run(
        ["node", "--check", str(path)],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise PatchError(
            f"Falha na checagem JavaScript de {path.relative_to(SYSTEM_ROOT)}:\n"
            f"{result.stderr.strip() or result.stdout.strip()}"
        )

    return f"Sintaxe validada: {path.relative_to(SYSTEM_ROOT)}"


def main() -> None:
    required_files = [
        "scripts/data/digimon-database.js",
        "scripts/apps/evolution-choice-browser.js",
        "scripts/sheets/digimon-sheet.js",
        "templates/apps/evolution-choice-browser.html",
        "assets/digimon/portraits/tenkomon.webm",
        "assets/digimon/portraits/sekkamon.webm",
        "assets/digimon/portraits/yukinamon.webm",
    ]

    for relative in required_files:
        require_file(relative)

    if not ffmpeg_available():
        raise PatchError(
            "FFmpeg não foi encontrado no PATH. Ele é necessário apenas para gerar "
            "as três imagens-base WEBP temporárias de Tenkomon, Sekkamon e Yukinamon."
        )

    backup_root = SYSTEM_ROOT / "_dda_portrait_integration_backups" / datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_root.mkdir(parents=True, exist_ok=True)

    data_path = SYSTEM_ROOT / "scripts/data/digimon-database.js"
    browser_path = SYSTEM_ROOT / "scripts/apps/evolution-choice-browser.js"
    template_path = SYSTEM_ROOT / "templates/apps/evolution-choice-browser.html"
    sheet_path = SYSTEM_ROOT / "scripts/sheets/digimon-sheet.js"

    data_changes = [
        (
            "import da sobreposição de portraits",
            'const DDA_SYSTEM_ID = "digimon-digital-adventures";\n',
            '// ' + PATCH_MARKER + '\n'
            'import { applyDdaPortraitAndManualDigimonData } from "./dda-portrait-and-manual-digimon-data.js";\n\n'
            'const DDA_SYSTEM_ID = "digimon-digital-adventures";\n',
        ),
        (
            "uso da sobreposição ao carregar V6",
            '    for (const actor of rawActors) {\n',
            '    for (const actor of applyDdaPortraitAndManualDigimonData(rawActors)) {\n',
        ),
    ]

    browser_changes = [
        (
            "import do resolvedor de portraits",
            '} from "../data/digimon-database.js";\n',
            '} from "../data/digimon-database.js";\n'
            'import { getDdaPortraitPath } from "../data/dda-portrait-and-manual-digimon-data.js";\n',
        ),
        (
            "portrait em candidatos de Actor",
            '    aliasesText: aliases.join("|"),\n'
            '    img: getCandidateImagePath(actor.img || "icons/svg/mystery-man.svg", {\n',
            '    aliasesText: aliases.join("|"),\n'
            '    portraitImg: String(\n'
            '      actor.system?.evolution?.portraitImg ||\n'
            '      actor.flags?.["digimon-digital-adventures"]?.digivicePortrait ||\n'
            '      getDdaPortraitPath({ key: sourceId, name: actor.name, species, aliases }) ||\n'
            '      actor.img ||\n'
            '      "icons/svg/mystery-man.svg"\n'
            '    ),\n'
            '    img: getCandidateImagePath(actor.img || "icons/svg/mystery-man.svg", {\n',
        ),
        (
            "portrait em nós do grafo",
            '    aliasesText: Array.isArray(node.aliases) ? node.aliases.join("|") : "",\n'
            '    img: getCandidateImagePath(node.img || node.image || "", { name, species: node.species, stage: node.stage }),\n',
            '    aliasesText: Array.isArray(node.aliases) ? node.aliases.join("|") : "",\n'
            '    portraitImg: String(\n'
            '      node.portraitImg ||\n'
            '      getDdaPortraitPath({\n'
            '        key: node.sourceId || node.key || node.id || "",\n'
            '        name: node.name || name,\n'
            '        species: node.species || name,\n'
            '        aliases: Array.isArray(node.aliases) ? node.aliases : []\n'
            '      }) ||\n'
            '      node.img || node.image || "icons/svg/mystery-man.svg"\n'
            '    ),\n'
            '    img: getCandidateImagePath(node.img || node.image || "", { name, species: node.species, stage: node.stage }),\n',
        ),
        (
            "portrait em entradas V6",
            '  const usable = isUsableEvolutionCandidateUuid(uuid);\n\n'
            '  return {\n'
            '    uuid,\n',
            '  const portraitImg = String(\n'
            '    system.images?.portraitImagePath ||\n'
            '    getDdaPortraitPath({ key: sourceId, name, species, aliases }) ||\n'
            '    img ||\n'
            '    "icons/svg/mystery-man.svg"\n'
            '  );\n\n'
            '  const usable = Boolean(uuid) || Boolean(sourceId);\n\n'
            '  return {\n'
            '    uuid,\n',
        ),
        (
            "retorno do portrait V6",
            '    aliasesText: aliases.join("|"),\n'
            '    img,\n'
            '    stage,\n',
            '    aliasesText: aliases.join("|"),\n'
            '    img,\n'
            '    portraitImg,\n'
            '    stage,\n',
        ),
        (
            "portrait em formulário normalizado",
            '    stage: form.stage ?? defaultStageKey,\n'
            '    img: form.img ?? ""\n',
            '    stage: form.stage ?? defaultStageKey,\n'
            '    img: form.img ?? "",\n'
            '    portraitImg: form.portraitImg ?? form.img ?? ""\n',
        ),
        (
            "portrait em formulário salvo",
            '    stage: choice.stage || "",\n'
            '    img: choice.img || "icons/svg/mystery-man.svg"\n',
            '    stage: choice.stage || "",\n'
            '    img: choice.img || "icons/svg/mystery-man.svg",\n'
            '    portraitImg: choice.portraitImg || choice.img || "icons/svg/mystery-man.svg"\n',
        ),
        (
            "portrait capturado do botão",
            '    species: button.dataset.species ?? button.dataset.name ?? "",\n'
            '    img: button.dataset.img ?? "icons/svg/mystery-man.svg",\n'
            '    stage: button.dataset.stage ?? "",\n',
            '    species: button.dataset.species ?? button.dataset.name ?? "",\n'
            '    img: button.dataset.img ?? "icons/svg/mystery-man.svg",\n'
            '    portraitImg: button.dataset.portraitImg ?? button.dataset.img ?? "icons/svg/mystery-man.svg",\n'
            '    stage: button.dataset.stage ?? "",\n',
        ),
        (
            "portrait em formulário registrado",
            '    aliases: Array.isArray(choice.aliases) ? choice.aliases : [],\n'
            '    img: choice.img || "icons/svg/mystery-man.svg",\n'
            '    stage: choice.stage || "",\n',
            '    aliases: Array.isArray(choice.aliases) ? choice.aliases : [],\n'
            '    img: choice.img || "icons/svg/mystery-man.svg",\n'
            '    portraitImg: choice.portraitImg || choice.img || "icons/svg/mystery-man.svg",\n'
            '    stage: choice.stage || "",\n',
        ),
        (
            "portrait do nó da forma atual",
            '      img: getCandidateImagePath(this.actor.img, {\n'
            '        name: this.actor.name,\n'
            '        species: this.actor.system?.species,\n'
            '        stage: this.actor.system?.stage\n'
            '      }),\n'
            '      stage: this.actor.system?.stage || ""\n',
            '      img: getCandidateImagePath(this.actor.img, {\n'
            '        name: this.actor.name,\n'
            '        species: this.actor.system?.species,\n'
            '        stage: this.actor.system?.stage\n'
            '      }),\n'
            '      portraitImg: String(\n'
            '        this.actor.system?.evolution?.portraitImg ||\n'
            '        this.actor.flags?.["digimon-digital-adventures"]?.digivicePortrait ||\n'
            '        getDdaPortraitPath({\n'
            '          key: this.actor.system?.sourceId || "",\n'
            '          name: this.actor.name,\n'
            '          species: this.actor.system?.species || this.actor.name,\n'
            '          aliases: getDigimonAliases(this.actor)\n'
            '        }) ||\n'
            '        this.actor.img || "icons/svg/mystery-man.svg"\n'
            '      ),\n'
            '      stage: this.actor.system?.stage || ""\n',
        ),
        (
            "portrait no novo nó do grafo",
            '      aliases: Array.isArray(choice.aliases) ? choice.aliases : [],\n'
            '      img: choice.img || "icons/svg/mystery-man.svg",\n'
            '      stage: choice.stage,\n',
            '      aliases: Array.isArray(choice.aliases) ? choice.aliases : [],\n'
            '      img: choice.img || "icons/svg/mystery-man.svg",\n'
            '      portraitImg: choice.portraitImg || choice.img || "icons/svg/mystery-man.svg",\n'
            '      stage: choice.stage,\n',
        ),
        (
            "portrait ao atualizar nó existente",
            '      aliases: Array.isArray(choice.aliases) ? choice.aliases : (toNode.aliases ?? []),\n'
            '      img: choice.img || toNode.img,\n'
            '      stage: choice.stage || toNode.stage,\n',
            '      aliases: Array.isArray(choice.aliases) ? choice.aliases : (toNode.aliases ?? []),\n'
            '      img: choice.img || toNode.img,\n'
            '      portraitImg: choice.portraitImg || toNode.portraitImg || choice.img || toNode.img,\n'
            '      stage: choice.stage || toNode.stage,\n',
        ),
    ]

    sheet_changes = [
        (
            "import do resolvedor de portraits na ficha",
            '} from "../helpers/digimon-stage-labels.js";\n',
            '} from "../helpers/digimon-stage-labels.js";\n'
            'import { getDdaPortraitPath } from "../data/dda-portrait-and-manual-digimon-data.js";\n',
        ),
        (
            "resolução dinâmica do portrait na ficha",
            '  const digivicePortrait = this.actor.getFlag(game.system?.id ?? "digimon-digital-adventures", "digivicePortrait") || this.actor.img;\n',
            '  const storedDigivicePortrait = String(\n'
            '    this.actor.getFlag(game.system?.id ?? "digimon-digital-adventures", "digivicePortrait") || ""\n'
            '  );\n'
            '  const storedEvolutionPortrait = String(this.actor.system?.evolution?.portraitImg || "");\n'
            '  const mappedPortrait = getDdaPortraitPath({\n'
            '    key: this.actor.system?.sourceId || this.actor.system?.names?.canonical || "",\n'
            '    name: this.actor.name,\n'
            '    species: this.actor.system?.species || this.actor.name,\n'
            '    aliases: digimonAliases\n'
            '  });\n'
            '  const digivicePortrait =\n'
            '    (storedDigivicePortrait && storedDigivicePortrait !== this.actor.img ? storedDigivicePortrait : "") ||\n'
            '    (storedEvolutionPortrait && storedEvolutionPortrait !== this.actor.img ? storedEvolutionPortrait : "") ||\n'
            '    mappedPortrait ||\n'
            '    storedDigivicePortrait ||\n'
            '    storedEvolutionPortrait ||\n'
            '    this.actor.img;\n',
        ),
    ]

    template_changes = [
        (
            "portrait da escolha pendente",
            '          data-img="{{selectedChoice.img}}"\n',
            '          data-img="{{selectedChoice.img}}"\n'
            '          data-portrait-img="{{selectedChoice.portraitImg}}"\n',
        ),
        (
            "portrait nos candidatos diretos",
            '  data-img="{{img}}"\n'
            '  data-stage="{{stage}}"\n'
            '  data-source="{{source}}"\n'
            '  data-compatibility="{{compatibility.score}}"\n'
            '  data-source-id="{{sourceId}}"\n',
            '  data-img="{{img}}"\n'
            '  data-portrait-img="{{portraitImg}}"\n'
            '  data-stage="{{stage}}"\n'
            '  data-source="{{source}}"\n'
            '  data-compatibility="{{compatibility.score}}"\n'
            '  data-source-id="{{sourceId}}"\n',
        ),
        (
            "portrait nos candidatos de exploração",
            '    data-img="{{img}}"\n'
            '    data-stage="{{stage}}"\n'
            '    data-source="{{source}}"\n'
            '    data-compatibility="{{compatibility.score}}"\n'
            '    {{#unless ../stageUnlocked}}disabled{{/unless}} {{#unless usable}}disabled{{/unless}}\n',
            '    data-img="{{img}}"\n'
            '    data-portrait-img="{{portraitImg}}"\n'
            '    data-stage="{{stage}}"\n'
            '    data-source="{{source}}"\n'
            '    data-compatibility="{{compatibility.score}}"\n'
            '    {{#unless ../stageUnlocked}}disabled{{/unless}} {{#unless usable}}disabled{{/unless}}\n',
        ),
    ]

    changed_files: list[str] = []

    if write_overlay(backup_root):
        changed_files.append(str(OVERLAY_RELATIVE_PATH))

    if patch_file(data_path, data_changes, backup_root):
        changed_files.append(str(data_path.relative_to(SYSTEM_ROOT)))

    if patch_file(browser_path, browser_changes, backup_root):
        changed_files.append(str(browser_path.relative_to(SYSTEM_ROOT)))

    if patch_file(sheet_path, sheet_changes, backup_root):
        changed_files.append(str(sheet_path.relative_to(SYSTEM_ROOT)))

    if patch_file(template_path, template_changes, backup_root):
        changed_files.append(str(template_path.relative_to(SYSTEM_ROOT)))

    created_assets = []
    for portrait_file, output_relative in [
        ("tenkomon.webm", "assets/digimon/adult/Tenkomon.webp"),
        ("sekkamon.webm", "assets/digimon/perfect/Sekkamon.webp"),
        ("yukinamon.webm", "assets/digimon/ultimate/Yukinamon.webp"),
    ]:
        if create_static_base_asset(portrait_file, output_relative):
            created_assets.append(output_relative)

    checks = [
        node_check(SYSTEM_ROOT / OVERLAY_RELATIVE_PATH),
        node_check(data_path),
        node_check(browser_path),
        node_check(sheet_path),
    ]

    print("\n" + "=" * 72)
    print("INTEGRAÇÃO DE PORTRAITS CONCLUÍDA")
    print("=" * 72)
    print(f"Backup: {backup_root}")
    print(f"Arquivos JS/HTML alterados: {len(changed_files)}")
    for file_name in changed_files:
        print(f"  + {file_name}")
    print(f"WEBPs-base criados: {len(created_assets)}")
    for file_name in created_assets:
        print(f"  + {file_name}")
    print("\nValidação:")
    for check in checks:
        print(f"  ✓ {check}")
    print("\nResumo da sobreposição:")
    print("  • 810 portraits aprovados mapeados por sourceId/aliases.")
    print("  • Tenkomon, Sekkamon e Yukinamon adicionados ao carregamento V6.")
    print("  • Relação normal: Renamon → Tenkomon → Sekkamon → Yukinamon.")
    print("  • Tokens não foram alterados; os três WEBPs são apenas imagem-base temporária.")
    print("\nNo Foundry: faça F5/reload completo antes de testar.")


if __name__ == "__main__":
    try:
        main()
    except PatchError as error:
        print(f"\nERRO: {error}")
        sys.exit(1)
    except Exception as error:
        print(f"\nERRO INESPERADO: {error}")
        sys.exit(1)
