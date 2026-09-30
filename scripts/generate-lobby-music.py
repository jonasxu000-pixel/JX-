"""Original sparse pentatonic plucked loop; standard library only, no samples."""
import math
import struct
import wave
from pathlib import Path

RATE = 16000
DURATION = 12
notes = [57, 60, 64, 67, 64, 62, 60, 57, 55, 60, 62, 64, 67, 64, 60, 57]
samples = [0.0] * (RATE * DURATION)
for beat, note in enumerate(notes):
    start = int(beat * 0.75 * RATE)
    frequency = 440 * 2 ** ((note - 69) / 12)
    for i in range(min(int(RATE * 2.7), len(samples) - start)):
        t = i / RATE
        attack = min(1, t / 0.012)
        tone = math.sin(2 * math.pi * frequency * t) + 0.18 * math.sin(4 * math.pi * frequency * t)
        samples[start + i] += 0.20 * attack * math.exp(-2.4 * t) * tone
for i in range(len(samples)):
    fade = min(1, i / (RATE * 0.05), (len(samples) - i - 1) / (RATE * 0.5))
    samples[i] *= fade
output = Path(__file__).resolve().parents[1] / 'assets' / 'lobby-music.wav'
with wave.open(str(output), 'wb') as audio:
    audio.setnchannels(1)
    audio.setsampwidth(2)
    audio.setframerate(RATE)
    audio.writeframes(b''.join(struct.pack('<h', round(max(-1, min(1, x)) * 32767)) for x in samples))
print(f'Original loop: {output.name}, {DURATION}s, {output.stat().st_size} bytes')
