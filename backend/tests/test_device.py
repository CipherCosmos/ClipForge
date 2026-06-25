from app.services.device import get_optimal_device, get_whisper_compute_type, get_whisper_device


def test_get_optimal_device_returns_valid():
    device = get_optimal_device()
    assert device in ("cuda", "mps", "cpu")


def test_get_whisper_device_never_mps():
    device = get_whisper_device()
    assert device in ("cuda", "cpu")


def test_get_whisper_compute_type_cuda():
    assert get_whisper_compute_type("cuda") == "float16"


def test_get_whisper_compute_type_cpu():
    assert get_whisper_compute_type("cpu") == "int8"


def test_get_whisper_compute_type_unknown():
    assert get_whisper_compute_type("rocm") == "int8"
