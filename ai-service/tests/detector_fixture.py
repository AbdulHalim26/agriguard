"""Tiny constant-output ONNX for unit plumbing ONLY, never trained predictions.

Uses the ONNX protobuf wire format to avoid installing training dependencies.
The manifest purpose is synthetic_test; the production loader rejects it.
"""
import hashlib
import json
import struct
from pathlib import Path

import numpy as np


def varint(value):
    out = bytearray()
    while value > 127:
        out.append((value & 127) | 128)
        value >>= 7
    return bytes(out + bytes([value]))


def integer(number, value):
    return varint(number << 3) + varint(value)


def field(number, value):
    value = value.encode() if isinstance(value, str) else value
    return varint((number << 3) | 2) + varint(len(value)) + value


def value_info(name, dimensions):
    shape = b"".join(field(1, integer(1, n)) for n in dimensions)
    tensor_type = integer(1, 1) + field(2, shape)  # FLOAT, TensorShapeProto
    return field(1, name) + field(2, field(1, tensor_type))


def write_model(directory: Path, output=None, output_format="end2end_xyxy", input_shape=(1, 3, 64, 64)):
    output = np.asarray([[[8, 8, 32, 32, 0.9, 0]]], dtype=np.float32) if output is None else np.asarray(output, dtype=np.float32)
    labels = [
        {"class_id": 0, "class_name": "leaf_blast", "annotation_level": "lesion"},
        {"class_id": 5, "class_name": "leaf_folder_damage", "annotation_level": "leaf"},
    ]
    tensor = b"".join(integer(1, int(n)) for n in output.shape) + integer(2, 1) + field(8, "fixture") + field(9, output.tobytes())
    identity = field(1, "fixture") + field(2, "output0") + field(4, "Identity")
    graph = field(1, identity) + field(2, "synthetic_unit_test_only") + field(5, tensor)
    graph += field(11, value_info("images", input_shape)) + field(12, value_info("output0", output.shape))
    model = integer(1, 9) + field(2, "agriguard-synthetic-test") + field(7, graph) + field(8, integer(2, 13))
    for key, value in {
        "task": "detect", "names": str({i: label["class_name"] for i, label in enumerate(labels)}),
        "agriguard_output_format": output_format, "agriguard_model_family": "yolo26n",
    }.items():
        model += field(14, field(1, key) + field(2, value))
    path = directory / "synthetic.onnx"
    path.write_bytes(model)
    spec = {
        "schema_version": 1, "purpose": "synthetic_test", "model_version": "unit-fixture",
        "model_family": "yolo26n", "model_sha256": hashlib.sha256(model).hexdigest(),
        "dataset_manifest_sha256": "0" * 64, "export_parity_verified": True,
        "input_name": "images", "output_name": "output0", "input_size": list(input_shape[-2:]),
        "output_format": output_format, "classes": labels,
    }
    path.with_suffix(".metadata.json").write_text(json.dumps(spec))
    return path, spec
