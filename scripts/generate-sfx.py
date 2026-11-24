"""Synthesize crisp Kaya-wood Go/Gomoku stone and outcome SFX using Python stdlib."""
import math
import random
import struct
import wave
from pathlib import Path

ASSETS_DIR = Path(__file__).resolve().parents[1] / 'assets'


def write_wav(path: Path, sample_rate: int, samples: list[float]) -> None:
    peak = max((abs(x) for x in samples), default=1.0)
    scale = 0.88 / peak if peak > 0.88 else 1.0
    frames = b''.join(
        struct.pack('<h', round(max(-1.0, min(1.0, x * scale)) * 32767))
        for x in samples
    )
    with wave.open(str(path), 'wb') as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate)
        audio.writeframes(frames)


def synthesize_stone() -> tuple[int, list[float]]:
    # 22050 Hz, 0.22s (~9.7 KB): crisp shell click + warm Kaya board resonance
    rate = 22050
    duration = 0.22
    count = int(rate * duration)
    rng = random.Random(20261124)
    samples = [0.0] * count
    lp = 0.0
    for i in range(count):
        t = i / rate
        # 0-4ms initial contact transient (filtered noise burst)
        noise = rng.uniform(-1.0, 1.0)
        lp = 0.62 * lp + 0.38 * noise
        click_env = math.exp(-t / 0.0018) if t < 0.012 else 0.0
        transient = 0.72 * click_env * (noise * 0.55 + lp * 0.45)

        # Clamshell stone crisp overtones (1850 Hz & 3100 Hz)
        stone = (
            0.34 * math.exp(-t / 0.0085) * math.sin(2 * math.pi * 1850 * t)
            + 0.22 * math.exp(-t / 0.0055) * math.sin(2 * math.pi * 3100 * t + 0.4)
        )

        # Kaya wood body damped resonance (175 / 340 / 580 Hz)
        attack = min(1.0, t / 0.0025)
        wood = attack * (
            0.55 * math.exp(-t / 0.042) * math.sin(2 * math.pi * 175 * t)
            + 0.36 * math.exp(-t / 0.028) * math.sin(2 * math.pi * 340 * t + 0.2)
            + 0.20 * math.exp(-t / 0.018) * math.sin(2 * math.pi * 580 * t + 0.7)
        )

        fade_out = min(1.0, (count - i - 1) / (rate * 0.025))
        samples[i] = (transient + stone + wood) * fade_out
    return rate, samples


def synthesize_select() -> tuple[int, list[float]]:
    # 22050 Hz, 0.06s (~2.7 KB): light wooden tap for preview selection
    rate = 22050
    duration = 0.06
    count = int(rate * duration)
    rng = random.Random(20261125)
    samples = [0.0] * count
    for i in range(count):
        t = i / rate
        noise = rng.uniform(-1.0, 1.0) * math.exp(-t / 0.0014)
        tap = (
            0.52 * math.exp(-t / 0.011) * math.sin(2 * math.pi * 760 * t)
            + 0.28 * math.exp(-t / 0.007) * math.sin(2 * math.pi * 1420 * t + 0.3)
        )
        fade_out = min(1.0, (count - i - 1) / (rate * 0.008))
        samples[i] = (0.35 * noise + tap) * fade_out * 0.75
    return rate, samples


def synthesize_plucked_notes(rate: int, duration: float, notes: list[tuple[float, int, float, float]]) -> list[float]:
    count = int(rate * duration)
    samples = [0.0] * count
    for start_s, midi, decay, amp in notes:
        freq = 440.0 * (2.0 ** ((midi - 69) / 12.0))
        start_idx = int(start_s * rate)
        for i in range(start_idx, count):
            t = (i - start_idx) / rate
            attack = min(1.0, t / 0.010)
            env = attack * math.exp(-t / decay)
            tone = (
                math.sin(2 * math.pi * freq * t)
                + 0.24 * math.sin(4 * math.pi * freq * t)
                + 0.08 * math.sin(6 * math.pi * freq * t)
            )
            samples[i] += amp * env * tone
    fade_samples = int(rate * 0.06)
    for i in range(count):
        tail = min(1.0, (count - i - 1) / max(1, fade_samples))
        samples[i] *= tail
    return samples


def main() -> None:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    files = {
        'stone.wav': synthesize_stone(),
        'stone-select.wav': synthesize_select(),
        # Pentatonic ascending chime: A4 - C5 - E5 - A5
        'win.wav': (
            16000,
            synthesize_plucked_notes(
                16000,
                0.90,
                [
                    (0.00, 69, 0.28, 0.30),
                    (0.11, 72, 0.28, 0.32),
                    (0.22, 76, 0.32, 0.34),
                    (0.34, 81, 0.42, 0.38),
                ],
            ),
        ),
        # Calm descending resolution: E4 - C4
        'lose.wav': (
            16000,
            synthesize_plucked_notes(
                16000,
                0.70,
                [
                    (0.00, 64, 0.26, 0.34),
                    (0.18, 60, 0.38, 0.36),
                ],
            ),
        ),
    }
    for name, (rate, data) in files.items():
        target = ASSETS_DIR / name
        write_wav(target, rate, data)
        print(f'{name}: {rate} Hz, {len(data) / rate:.3f}s, {target.stat().st_size} bytes')


if __name__ == '__main__':
    main()
