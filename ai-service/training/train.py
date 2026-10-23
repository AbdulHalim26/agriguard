"""Fine-tune a three-label EfficientNet-B0; full training is run manually in Colab."""

import argparse
import os
import random
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader
from torchvision.models import EfficientNet_B0_Weights

from common import (
    LABELS, ManifestDataset, environment_versions, load_checkpoint, load_manifest, make_model,
    model_metadata, save_checkpoint, seed_everything, utc_now, write_json,
)

# Configuration: modest defaults for Colab's free GPU. Override with CLI flags.
SEED = 42
EPOCHS = 15
BATCH_SIZE = 32
LEARNING_RATE = 1e-4
WEIGHT_DECAY = 1e-4
FREEZE_EPOCHS = 2
PATIENCE = 5
NUM_WORKERS = 2
CPU_THREADS = min(4, os.cpu_count() or 1)


def epoch_pass(model, loader, device, criterion, optimizer=None, scaler=None, max_batches=None):
    training = optimizer is not None
    model.train(training)
    if training and not any(parameter.requires_grad for parameter in model.features.parameters()):
        # Keep pretrained running statistics unchanged while warming up the head.
        model.features.eval()
    total, correct, loss_sum = 0, 0, 0.0
    with torch.set_grad_enabled(training):
        for index, (images, targets) in enumerate(loader):
            if max_batches is not None and index >= max_batches:
                break
            images, targets = images.to(device), targets.to(device)
            if training:
                optimizer.zero_grad(set_to_none=True)
            amp = training and device.type == "cuda"
            with torch.autocast(device_type=device.type, enabled=amp):
                logits = model(images)
                loss = criterion(logits, targets)
            if not torch.isfinite(loss):
                raise ValueError("Loss bukan angka finite; periksa data/learning rate")
            if training:
                scaler.scale(loss).backward()
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                scaler.step(optimizer)
                scaler.update()
            total += targets.size(0)
            correct += (logits.argmax(1) == targets).sum().item()
            loss_sum += loss.item() * targets.size(0)
    if total == 0:
        raise ValueError("Loader tidak menghasilkan gambar")
    return {"loss": loss_sum / total, "class_accuracy": correct / total, "samples": total}


def train(args):
    if args.epochs < 1 or args.batch_size < 1 or args.workers < 0:
        raise ValueError("epochs/batch-size harus positif; workers tidak boleh negatif")
    if args.max_batches is not None and args.max_batches < 1:
        raise ValueError("max-batches harus positif")
    if (args.pretrained == "none" or args.max_batches is not None) and not args.smoke_test:
        raise ValueError("--pretrained none / --max-batches hanya untuk --smoke-test")
    manifest = load_manifest(args.dataset)
    smoke = args.smoke_test or manifest["purpose"] == "pipeline_smoke_test"
    device = torch.device("cuda" if args.device == "auto" and torch.cuda.is_available()
                          else "cpu" if args.device == "auto" else args.device)
    if device.type == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA tidak tersedia; pilih GPU di Colab atau --device cpu untuk smoke test")
    torch.set_num_threads(CPU_THREADS)
    seed_everything(args.seed)
    args.output.mkdir(parents=True, exist_ok=True)
    if any(args.output.iterdir()) and args.resume is None:
        raise ValueError("Output tidak kosong; gunakan --resume atau folder output baru")
    train_rows = [row for row in manifest["samples"] if row["split"] == "train"]
    val_rows = [row for row in manifest["samples"] if row["split"] == "val"]
    counts = [sum(row["label"] == label for row in train_rows) for label in LABELS]
    weights = [len(train_rows) / (len(LABELS) * count) for count in counts]
    config = {
        "seed": args.seed, "epochs": args.epochs, "batch_size": args.batch_size,
        "workers": args.workers, "learning_rate": LEARNING_RATE, "weight_decay": WEIGHT_DECAY,
        "freeze_epochs": FREEZE_EPOCHS, "patience": PATIENCE,
        "pretrained": args.pretrained, "class_counts": counts, "class_weights": weights,
        "pretrained_reference": {
            "name": str(EfficientNet_B0_Weights.DEFAULT), "url": EfficientNet_B0_Weights.DEFAULT.url,
        } if args.pretrained == "imagenet" else None,
        "max_batches": args.max_batches, "amp": device.type == "cuda",
        "selection": "highest validation class accuracy; test split is never loaded",
    }
    checkpoint = load_checkpoint(args.resume) if args.resume else None
    if checkpoint:
        if checkpoint.get("evaluation_snapshot"):
            raise ValueError("Resume harus dari epoch_NNN.pt, bukan snapshot best.pt untuk evaluasi")
        if checkpoint["stale_epochs"] >= PATIENCE:
            raise ValueError("Run sudah early-stop; resume hanya untuk run yang terputus")
        if any((args.output / f"epoch_{epoch:03d}.pt").exists()
               for epoch in range(checkpoint["epoch"] + 1, args.epochs + 1)):
            raise ValueError("Output memiliki epoch lebih baru; pilih checkpoint terakhir atau folder output baru")
        if checkpoint["dataset"]["manifest_sha256"] != manifest["manifest_sha256"]:
            raise ValueError("Dataset/split berbeda dari checkpoint; resume ditolak")
        if checkpoint["training_config"] != config or checkpoint["purpose"] != ("pipeline_smoke_test" if smoke else "model_training"):
            raise ValueError("Konfigurasi resume berbeda; gunakan parameter run semula")
    model = make_model(pretrained=args.pretrained == "imagenet" and checkpoint is None).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    scaler = torch.amp.GradScaler("cuda", enabled=device.type == "cuda")
    criterion = nn.CrossEntropyLoss(weight=torch.tensor(weights, dtype=torch.float32, device=device))
    start, best_accuracy, best_epoch, stale = 1, -1.0, 0, 0
    history, best_state, best_created_at = [], None, None
    if checkpoint:
        model.load_state_dict(checkpoint["model_state"])
        optimizer.load_state_dict(checkpoint["optimizer_state"])
        scheduler.load_state_dict(checkpoint["scheduler_state"])
        scaler.load_state_dict(checkpoint["scaler_state"])
        start = checkpoint["epoch"] + 1
        best_accuracy, best_epoch = checkpoint["best_val_accuracy"], checkpoint["best_epoch"]
        stale, history, best_state = checkpoint["stale_epochs"], checkpoint["history"], checkpoint["best_model_state"]
        best_created_at = checkpoint["best_created_at"]
        random.setstate(checkpoint["rng"]["python"])
        torch.set_rng_state(checkpoint["rng"]["torch"])
        if device.type == "cuda":
            torch.cuda.set_rng_state_all(checkpoint["rng"]["cuda"])
    if start > args.epochs:
        raise ValueError("Checkpoint sudah mencapai batas epochs; tidak ada training untuk dilanjutkan")
    if checkpoint:
        best_copy = {**checkpoint, "model_state": best_state, "epoch": best_epoch,
                     "created_at": best_created_at, "evaluation_snapshot": True}
        save_checkpoint(args.output / "best.pt", best_copy)
    dataset_info = {key: manifest[key] for key in (
        "manifest_sha256", "dataset_size", "dataset_sources", "composition", "split", "distribution",
    )}
    status = {
        "stage": "training", "purpose": "pipeline_smoke_test" if smoke else "model_training",
        "image_count": manifest["dataset_size"],
        "source_count": sum(source["image_count"] > 0 for source in manifest["dataset_sources"]),
        "split_id": manifest["split"]["id"], "manifest_sha256": manifest["manifest_sha256"],
    }
    write_json(args.output / "run.json", {
        "model": model_metadata(), "dataset": dataset_info, "training_config": config,
        "purpose": status["purpose"], "started_at": utc_now(),
        "environment": {**environment_versions(), "device": str(device)},
    })
    status_path = args.dataset / "retraining_status.json"
    write_json(status_path, {**status, "updated_at": utc_now()})
    train_dataset = ManifestDataset(args.dataset, train_rows, training=True)
    val_loader = DataLoader(ManifestDataset(args.dataset, val_rows), batch_size=args.batch_size,
                            shuffle=False, num_workers=args.workers, pin_memory=device.type == "cuda")
    try:
        for epoch in range(start, args.epochs + 1):
            for parameter in model.features.parameters():
                parameter.requires_grad = epoch > FREEZE_EPOCHS
            generator = torch.Generator().manual_seed(args.seed + epoch)
            train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True,
                                      num_workers=args.workers, generator=generator,
                                      pin_memory=device.type == "cuda")
            train_metrics = epoch_pass(model, train_loader, device, criterion, optimizer, scaler, args.max_batches)
            val_metrics = epoch_pass(model, val_loader, device, nn.CrossEntropyLoss(), max_batches=args.max_batches)
            scheduler.step()
            improved = val_metrics["class_accuracy"] > best_accuracy
            if improved:
                best_accuracy, best_epoch, stale = val_metrics["class_accuracy"], epoch, 0
                best_created_at = utc_now()
                best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
            else:
                stale += 1
            history.append({"epoch": epoch, "train": train_metrics, "val": val_metrics})
            checkpoint = {
                "schema_version": 1, "model": model_metadata(), "purpose": status["purpose"],
                "created_at": utc_now(), "epoch": epoch,
                "model_state": {key: value.detach().cpu() for key, value in model.state_dict().items()},
                "best_model_state": best_state, "best_epoch": best_epoch, "best_val_accuracy": best_accuracy,
                "best_created_at": best_created_at,
                "stale_epochs": stale, "optimizer_state": optimizer.state_dict(),
                "scheduler_state": scheduler.state_dict(), "scaler_state": scaler.state_dict(),
                "dataset": dataset_info, "training_config": config, "history": history,
                "environment": {**environment_versions(), "device": str(device)},
                "rng": {"python": random.getstate(), "torch": torch.get_rng_state(),
                        "cuda": torch.cuda.get_rng_state_all() if device.type == "cuda" else []},
            }
            save_checkpoint(args.output / f"epoch_{epoch:03d}.pt", checkpoint)
            if improved:
                save_checkpoint(args.output / "best.pt", {
                    **checkpoint, "created_at": best_created_at, "evaluation_snapshot": True,
                })
            write_json(args.output / "history.json", history)
            write_json(status_path, {**status, "last_epoch": epoch, "updated_at": utc_now()})
            print(f'Epoch {epoch:02d}/{args.epochs}: train_acc={train_metrics["class_accuracy"]:.4f} '
                  f'val_acc={val_metrics["class_accuracy"]:.4f} checkpoint=epoch_{epoch:03d}.pt', flush=True)
            if stale >= PATIENCE:
                print(f"Early stopping: validation tidak membaik selama {PATIENCE} epoch.")
                break
    except (Exception, KeyboardInterrupt):
        write_json(status_path, {**status, "stage": "training_interrupted", "updated_at": utc_now()})
        raise
    write_json(status_path, {
        **status, "stage": "training_completed", "best_epoch": best_epoch, "updated_at": utc_now(),
    })
    print(f"Checkpoint terpilih: {args.output / 'best.pt'} (epoch {best_epoch}). Jalankan evaluate.py.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("training-artifacts/v2"))
    parser.add_argument("--epochs", type=int, default=EPOCHS)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--workers", type=int, default=NUM_WORKERS)
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    parser.add_argument("--pretrained", choices=["imagenet", "none"], default="imagenet")
    parser.add_argument("--resume", type=Path)
    parser.add_argument("--max-batches", type=int)
    parser.add_argument("--smoke-test", action="store_true")
    args = parser.parse_args()
    try:
        train(args)
    except (ValueError, OSError) as exc:
        parser.exit(1, f"train: {exc}\n")


if __name__ == "__main__":
    main()
