"""Shared training-only contracts. Importing this module does not load PyTorch."""

import ast
import hashlib
import json
import random
import platform
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

# Configuration shared by the four scripts. Runtime v1 is not modified.
LABEL_SCHEMA = "v2_3label"
LABELS = [
    "tanpa_kerusakan_terlihat",
    "kerusakan_ringan_terlihat",
    "kerusakan_berat_terlihat",
]
LABEL_TO_STATUS = dict(zip(LABELS, ["aman", "rusak_ringan", "rusak_berat"]))
STATUSES = ["aman", "rusak_ringan", "rusak_berat"]
IMAGE_SIZE = 224
IMAGE_MEAN = [0.485, 0.456, 0.406]
IMAGE_STD = [0.229, 0.224, 0.225]
SPLITS = ["train", "val", "test"]
REFLECTION_PROBABILITY = 0.15
REFLECTION_OPACITY = 0.12
SCHEMA_VERSION = 1


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(
        json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def json_sha256(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def file_sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def environment_versions():
    return {"python": platform.python_version(), **{
        package: version(package)
        for package in ("torch", "torchvision", "numpy", "pillow", "onnx", "onnxruntime")
    }}


def save_checkpoint(path, checkpoint):
    import torch

    path = Path(path)
    temporary = path.with_name(path.name + ".tmp")
    torch.save(checkpoint, temporary)
    temporary.replace(path)


def manifest_digest(manifest):
    return json_sha256({
        key: value for key, value in manifest.items()
        if key not in {"created_at", "manifest_sha256"}
    })


def runtime_constants():
    """Read literal v1 constants without importing its inference dependencies."""
    source = Path(__file__).resolve().parents[1] / "predict.py"
    wanted = {"ID2LABEL", "LABEL_TO_STATUS", "DAMAGE_RANGE", "DAMAGE_MAX",
              "VEGETATION_MIN_RATIO", "CONFIDENCE_MIN"}
    result = {}
    for node in ast.parse(source.read_text(encoding="utf-8")).body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in wanted:
                    result[target.id] = ast.literal_eval(node.value)
    if result.keys() != wanted:
        raise ValueError("Konstanta kontrak v1 berubah; periksa predict.py sebelum training.")
    return result


def model_metadata():
    contract = runtime_constants()
    return {
        "model_version": "v2",
        "architecture": "torchvision.efficientnet_b0",
        "label_schema": LABEL_SCHEMA,
        "labels": LABELS,
        "label_to_status": LABEL_TO_STATUS,
        "preprocessing": {
            "image_size": IMAGE_SIZE, "resize": "bicubic", "color_mode": "RGB",
            "rescale": 1 / 255, "mean": IMAGE_MEAN, "std": IMAGE_STD,
            "exif_transpose": True,
        },
        "domain_gate": {
            "vegetation_min_ratio": contract["VEGETATION_MIN_RATIO"],
            "confidence_min": contract["CONFIDENCE_MIN"],
        },
        "damage_pct_range": contract["DAMAGE_RANGE"],
        "damage_pct_estimation": {
            "method": "confidence_scaled_status_range",
            "calibrated_against_measured_damage": False,
            "maximum": contract["DAMAGE_MAX"],
            "context": (
                "v1 memetakan penyakit ke status; v2 memetakan tingkat kerusakan visual "
                "langsung ke status. Rentang dan rumus kompatibel dengan v1, bukan "
                "pengukuran persen luas rusak, kehilangan hasil, atau bukti penyebab banjir."
            ),
        },
    }


def estimate_damage_pct(status, confidence):
    """Training-side check of the existing API estimate, for both label schemas."""
    if status not in STATUSES or not 0 <= confidence <= 1:
        raise ValueError("Status/confidence tidak valid")
    contract = runtime_constants()
    low, high = contract["DAMAGE_RANGE"][status]
    value = (1 - confidence) * high if status == "aman" else low + (high - low) * confidence
    return int(round(min(max(value, 0), contract["DAMAGE_MAX"])))


def inside(root, relative):
    root = Path(root).resolve()
    path = (root / relative).resolve()
    if not path.is_relative_to(root):
        raise ValueError("Path gambar harus berada di dalam folder dataset")
    return path


def load_manifest(dataset, verify_images=True):
    root = Path(dataset).resolve()
    manifest = read_json(root / "manifest.json")
    if manifest.get("manifest_sha256") != manifest_digest(manifest):
        raise ValueError("Manifest berubah / checksum tidak cocok; siapkan dataset ulang.")
    if (manifest.get("label_schema") != LABEL_SCHEMA or manifest.get("labels") != LABELS
            or manifest.get("label_to_status") != LABEL_TO_STATUS):
        raise ValueError("Label/order/mapping dataset tidak sesuai kontrak v2_3label.")
    groups = {}
    hashes = set()
    for row in manifest["samples"]:
        if row["split"] not in SPLITS or row["label"] not in LABELS:
            raise ValueError("Split/label tidak dikenal")
        expected = f'{row["split"]}/{row["label"]}/{row["id"]}.jpg'
        if row["path"] != expected or row["id"] in hashes:
            raise ValueError("Path tidak sesuai / gambar duplikat di manifest")
        hashes.add(row["id"])
        previous = groups.setdefault(row["group_id"], row["split"])
        if previous != row["split"]:
            raise ValueError("Kebocoran group antar split")
        if row["kind"] == "disease_support" and row["split"] != "train":
            raise ValueError("Data penyakit pendukung hanya boleh masuk train")
        if verify_images and file_sha256(inside(root, row["path"])) != row["sha256"]:
            raise ValueError(f'Gambar berubah: {row["path"]}')
    for split in SPLITS:
        for label in LABELS:
            if not any(row["split"] == split and row["label"] == label for row in manifest["samples"]):
                raise ValueError(f"Split {split} tidak memiliki kelas {label}")
    return manifest


def seed_everything(seed):
    import numpy as np
    import torch

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.benchmark = False
    torch.backends.cudnn.deterministic = True
    torch.use_deterministic_algorithms(True, warn_only=True)


class FieldReflection:
    """Subtle local glare, not a generator of flooded scenes or severity labels."""

    def __call__(self, image):
        import torch
        from PIL import Image, ImageDraw

        if torch.rand(()).item() >= REFLECTION_PROBABILITY:
            return image
        width, height = image.size
        y = int(torch.rand(()).item() * height)
        mask = Image.new("L", image.size, 0)
        ImageDraw.Draw(mask).polygon(
            [(0, y), (width, y - height // 12), (width, y), (0, y + height // 12)],
            fill=round(255 * REFLECTION_OPACITY),
        )
        return Image.composite(Image.new("RGB", image.size, "white"), image, mask)


def image_transform(training=False):
    from torchvision import transforms as T
    from torchvision.transforms import InterpolationMode

    steps = [T.Resize((IMAGE_SIZE, IMAGE_SIZE), interpolation=InterpolationMode.BICUBIC)]
    if training:
        steps += [
            T.RandomHorizontalFlip(),
            T.RandomAffine(12, translate=(0.04, 0.04), scale=(0.95, 1.05),
                           interpolation=InterpolationMode.BICUBIC, fill=(124, 116, 104)),
            T.ColorJitter(brightness=0.25, contrast=0.2, saturation=0.15, hue=0.02),
            T.RandomApply([T.GaussianBlur(5, sigma=(0.1, 1.2))], p=0.2),
            FieldReflection(),
        ]
    return T.Compose(steps + [T.ToTensor(), T.Normalize(IMAGE_MEAN, IMAGE_STD)])


class ManifestDataset:
    def __init__(self, root, samples, training=False):
        self.root = Path(root)
        self.samples = samples
        self.transform = image_transform(training)

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, index):
        from PIL import Image, ImageOps

        row = self.samples[index]
        with Image.open(inside(self.root, row["path"])) as image:
            tensor = self.transform(ImageOps.exif_transpose(image).convert("RGB"))
        return tensor, LABELS.index(row["label"])


def make_model(pretrained=False):
    from torch import nn
    from torchvision.models import EfficientNet_B0_Weights, efficientnet_b0

    model = efficientnet_b0(weights=EfficientNet_B0_Weights.DEFAULT if pretrained else None)
    model.classifier[-1] = nn.Linear(model.classifier[-1].in_features, len(LABELS))
    return model


def load_checkpoint(path):
    import torch

    checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    for key, value in model_metadata().items():
        if checkpoint.get("model", {}).get(key) != value:
            raise ValueError(f"Metadata checkpoint tidak cocok: {key}")
    return checkpoint


def classification_metrics(truth, predictions, labels, mapping):
    if not truth or len(truth) != len(predictions):
        raise ValueError("Evaluasi memerlukan pasangan label/prediksi yang tidak kosong")
    matrix = [[0 for _ in labels] for _ in labels]
    status_matrix = [[0 for _ in STATUSES] for _ in STATUSES]
    for actual, predicted in zip(truth, predictions):
        matrix[labels.index(actual)][labels.index(predicted)] += 1
        status_matrix[STATUSES.index(mapping[actual])][STATUSES.index(mapping[predicted])] += 1
    return {
        "class_accuracy": sum(matrix[i][i] for i in range(len(labels))) / len(truth),
        "status_accuracy": sum(status_matrix[i][i] for i in range(len(STATUSES))) / len(truth),
        "per_class": [
            {"label": label, "support": sum(matrix[i]),
             "accuracy": matrix[i][i] / sum(matrix[i]) if sum(matrix[i]) else None}
            for i, label in enumerate(labels)
        ],
        "confusion_matrix": {"labels": labels, "rows": "actual", "columns": "predicted", "values": matrix},
        "status_confusion_matrix": {
            "labels": STATUSES, "rows": "actual", "columns": "predicted", "values": status_matrix,
        },
    }
