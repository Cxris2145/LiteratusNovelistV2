"""Publish reviewed local generation indexes using the guarded portrait importer.

Run from Producto/backend. Does not generate images. Defaults to dry-run; every
source must be contained in media/portrait_sources and match its recorded SHA256.
"""
import argparse
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import sys


BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from ai_engine.models import AIAvatar
from ai_engine.portraits import PortraitError, contained_path, import_manifest, validate_manifest, verified_image


def atomic_json(path, value):
    temporary = path.with_suffix(path.suffix + ".new")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def publish(args):
    working = BACKEND / ".tmp-portraits"
    manifest = json.loads((working / "catalog-manifest.json").read_text(encoding="utf-8"))
    records = {record["avatar_id"]: record for record in validate_manifest(manifest)}
    state_path = working / "publisher-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {"published": {}, "batches": []}
    reviewed = {}
    blocked_identities = set()
    problems = []
    for index_path in sorted(working.glob("generation-*.json")):
        try:
            entries = json.loads(index_path.read_text(encoding="utf-8"))
        except (ValueError, OSError) as exc:
            problems.append({"index": index_path.name, "error": "Index incompleto: " + str(exc)})
            continue
        if not isinstance(entries, list):
            problems.append({"index": index_path.name, "error": "Se esperaba una lista de retratos."})
            continue
        for entry in entries:
            if not isinstance(entry, dict) or entry.get("status") not in ("generated_reviewed", "reused_reviewed"):
                continue
            identity = entry.get("identity_key")
            if identity in blocked_identities:
                continue
            try:
                source = entry["source"]
                # Workers may use either media-relative or portrait_sources-relative paths.
                if not source.startswith("portrait_sources/"):
                    source = "portrait_sources/" + source
                image = contained_path(settings.MEDIA_ROOT, source)
                approved_root = (Path(settings.MEDIA_ROOT) / "portrait_sources").resolve()
                if not image.is_relative_to(approved_root) or not image.is_file():
                    raise PortraitError("La imagen no existe dentro de media/portrait_sources.")
                actual_hash = hashlib.sha256(image.read_bytes()).hexdigest()
                if actual_hash != entry.get("sha256"):
                    raise PortraitError("El SHA256 de la imagen generada no coincide.")
                verified_image(image)
                avatar_ids = entry.get("avatar_ids")
                if not isinstance(avatar_ids, list) or not avatar_ids or len(avatar_ids) != len(set(avatar_ids)):
                    raise PortraitError("avatar_ids debe contener UUID únicos.")
                for avatar_id in avatar_ids:
                    record = records.get(avatar_id)
                    if not record or record["identity_key"] != identity:
                        raise PortraitError("Los UUID no pertenecen a la identidad del catálogo exportado.")
                publication_key = str(identity) + ":" + actual_hash
                if publication_key in state["published"]:
                    continue
                candidate = dict(entry, source=source, publication_key=publication_key)
                if identity in reviewed and reviewed[identity]["sha256"] != actual_hash:
                    reviewed.pop(identity)
                    blocked_identities.add(identity)
                    raise PortraitError("Existen imágenes revisadas distintas para una misma identidad.")
                if identity in reviewed:
                    candidate["avatar_ids"] = sorted(set(reviewed[identity]["avatar_ids"]) | set(avatar_ids))
                reviewed[identity] = candidate
            except (PortraitError, ValueError, TypeError, KeyError, OSError) as exc:
                problems.append({"index": index_path.name, "identity_key": identity, "error": str(exc)})
    entries = list(reviewed.values())
    latest_report = None
    if entries and (len(entries) >= args.minimum or args.flush):
        batch_number = len(state["batches"]) + 1
        batch_stem = f"publication-{batch_number:04d}"
        selected = []
        for entry in entries:
            for avatar_id in entry["avatar_ids"]:
                record = deepcopy(records[avatar_id])
                record["output_image"] = entry["source"]
                selected.append(record)
        deployment = {key: value for key, value in manifest.items() if key != "avatars"}
        deployment["avatars"] = selected
        atomic_json(working / (batch_stem + "-manifest.json"), deployment)
        latest_report = import_manifest(deployment, settings.MEDIA_ROOT, apply=args.apply,
                                        expected_fingerprint=args.expected_database_fingerprint,
                                        upload=args.apply, replace=False)
        atomic_json(working / (batch_stem + "-report.json"), latest_report)
        if args.apply:
            outcomes = {item["avatar_id"]: item for item in latest_report["results"]}
            for entry in entries:
                successes = [outcomes[avatar_id] for avatar_id in entry["avatar_ids"]
                             if outcomes[avatar_id]["status"] in ("linked", "already_linked", "preserved_existing")]
                if len(successes) == len(entry["avatar_ids"]):
                    state["published"][entry["publication_key"]] = {
                        "identity_key": entry["identity_key"], "avatar_ids": entry["avatar_ids"],
                        "source": entry["source"], "sha256": entry["sha256"],
                        "origin_status": entry["status"],
                        "results": successes, "published_at": timezone.now().isoformat(),
                    }
            state["batches"].append({"name": batch_stem, "counts": latest_report["counts"],
                                     "finished_at": timezone.now().isoformat()})
            atomic_json(state_path, state)
    completed_avatars = set()
    newly_linked = set()
    for batch in state["batches"]:
        batch_report = json.loads((working / (batch["name"] + "-report.json")).read_text(encoding="utf-8"))
        for result in batch_report["results"]:
            if result["status"] in ("linked", "already_linked"):
                completed_avatars.add(result["avatar_id"])
            if result["status"] == "linked":
                newly_linked.add(result["avatar_id"])
    for entry in state["published"].values():
        for result in entry["results"]:
            if result["status"] in ("linked", "already_linked"):
                completed_avatars.add(result["avatar_id"])
            if result["status"] == "linked":
                newly_linked.add(result["avatar_id"])
    approved_path = working / "approved-aquiles-applied.json"
    if approved_path.exists():
        approved_report = json.loads(approved_path.read_text(encoding="utf-8"))
        for result in approved_report.get("results", []):
            if result.get("status") in ("linked", "already_linked"):
                completed_avatars.add(result["avatar_id"])
                if result["status"] == "linked":
                    newly_linked.add(result["avatar_id"])
    pending_count = AIAvatar.objects.filter(Q(avatar_image="") | Q(avatar_image__isnull=True)).count()
    generated_count = sum(entry.get("origin_status", "generated_reviewed") == "generated_reviewed"
                          for entry in state["published"].values())
    reused_count = sum(entry.get("origin_status") == "reused_reviewed" for entry in state["published"].values())
    summary = {
        "updated_at": timezone.now().isoformat(), "catalog_total": len(records),
        "catalog_remaining_without_image": pending_count,
        "reviewed_identities_waiting": (sum(entry["publication_key"] not in state["published"] for entry in entries)
                                        if args.apply else len(entries)),
        "published_generated_identities": generated_count + (1 if approved_path.exists() else 0),
        "published_reused_identities": reused_count,
        "published_unique_generated_images": len({entry["sha256"] for entry in state["published"].values()}) + (1 if approved_path.exists() else 0),
        "generated_avatars_linked": len(completed_avatars), "newly_linked_avatars": len(newly_linked),
        "latest_batch_counts": latest_report["counts"] if latest_report else {}, "problems": problems,
        "dry_run": not args.apply,
    }
    atomic_json(working / "published-summary.json", summary)
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-database-fingerprint")
    parser.add_argument("--minimum", type=int, default=3)
    parser.add_argument("--flush", action="store_true", help="Publica incluso un lote menor al mínimo.")
    args = parser.parse_args()
    try:
        print(json.dumps(publish(args), ensure_ascii=False, indent=2))
    except (PortraitError, ValueError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
