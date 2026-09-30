"""Generates the soundtrack: an original music-box lullaby + synced effects (44.1 kHz WAV)."""
import numpy as np, wave, sys
SR = 44100; DUR = 52.0
N = int(SR * DUR)
out = np.zeros(N)
rng = np.random.default_rng(3)

def f(n): return 440 * 2 ** ((n - 69) / 12)
def bell(t0, note, amp=0.2, dec=1.6, length=2.5):
    i0 = int(t0 * SR); n = int(length * SR)
    if i0 >= N: return
    n = min(n, N - i0); t = np.arange(n) / SR; fr = f(note)
    env = np.exp(-t * dec / 0.6) * (1 - np.exp(-t * 400))
    s = np.sin(2*np.pi*fr*t) + 0.35*np.sin(2*np.pi*fr*2*t)*np.exp(-t*3) + 0.12*np.sin(2*np.pi*fr*4.2*t)*np.exp(-t*6)
    out[i0:i0+n] += amp * env * s
def pad(t0, notes, length, amp=0.05):
    i0 = int(t0 * SR); n = min(int(length * SR), N - i0)
    if n <= 0: return
    t = np.arange(n) / SR
    env = np.minimum(1, t / 0.8) * np.minimum(1, (length - t) / 0.8)
    s = sum(np.sin(2*np.pi*f(x)*t) + 0.3*np.sin(2*np.pi*f(x)*2.003*t) for x in notes)
    out[i0:i0+n] += amp * env * s / len(notes)
def noise(t0, length, amp, lo=0.0, rise=True):
    i0 = int(t0 * SR); n = min(int(length * SR), N - i0)
    t = np.arange(n) / SR
    w = rng.standard_normal(n)
    w = np.convolve(w, np.ones(12) / 12, 'same')
    env = (t / length) ** 2 if rise else np.exp(-t * 8)
    out[i0:i0+n] += amp * env * w

# lullaby: 80 bpm, arpeggiated I–vi–IV–V in F major, melody on top
beat = 60 / 80
chords = [(53, [65, 69, 72]), (50, [62, 65, 69]), (46, [58, 62, 65]), (48, [60, 64, 67])]
melody = [77, 76, 74, 72, 74, 72, 69, None, 74, 72, 70, 69, 67, 69, 72, None]
t = 0.4; bar = 0
while t < 49.0:
    root, tri = chords[bar % 4]
    pad(t, [root, root + 12] + tri[:1], beat * 4 + 0.6, 0.035)
    arp = [tri[0], tri[1], tri[2], tri[1] + 12, tri[2], tri[1], tri[0] + 12, tri[2]]
    for k, n in enumerate(arp):
        bell(t + k * beat / 2, n, 0.055, 2.2)
    if bar >= 2:
        for k in range(2):
            m = melody[((bar - 2) * 2 + k) % len(melody)]
            if m: bell(t + k * beat * 2, m + 12, 0.07, 1.4, 3)
    t += beat * 4; bar += 1
pad(49.2, [53, 65, 69, 72, 77], 2.8, 0.06)
bell(49.4, 89, 0.08, 1); bell(49.8, 84, 0.07, 1); bell(50.2, 81, 0.07, 1); bell(50.6, 77, 0.09, 0.8, 4)

# effects synced to the picture
bell(1.9, 93, 0.16, 1.2, 3); bell(1.95, 100, 0.07, 2)                          # second line appears
for i in range(9): bell(6.3 + i * 0.45 + 1.6, 96 + (i % 3) * 3, 0.05, 3, 1)   # stars dive in
bell(11.4, 84, 0.1, 1.2); bell(11.5, 91, 0.06, 1.5)                           # paw touch
noise(16.9, 1.1, 0.12)                                                        # whoosh into window
for i, n in enumerate([84, 88, 91, 96]): bell(17.9 + i * 0.06, n, 0.06, 2)
noise(21.5, 1.3, 0.07)                                                        # galaxy collapses
for i in range(3): bell(25.6 + i * 0.45, 98 - i * 2, 0.08, 3, 1)              # scratches
bell(27.6, 91, 0.05, 4, 0.6)                                                  # blink
noise(29.05, 0.5, 0.35, rise=False)                                           # burst pop
for i, n in enumerate([77, 81, 84, 89, 93, 96]): bell(29.1 + i * 0.04, n, 0.08, 1.5)
for i in range(12): bell(32.0 + i * 0.19, 84 + [0, 2, 4, 7, 9, 12][i % 6] + 12 * (i // 6), 0.05, 2, 1.5)  # weaving
bell(34.9, 96, 0.12, 1.6); bell(35.55, 77, 0.1, 1.2)                          # pearl dot, lion lands

# gentle master: fade, soft limiter
env = np.ones(N); fi = int(0.3 * SR); fo = int(1.5 * SR)
env[:fi] = np.linspace(0, 1, fi); env[-fo:] = np.linspace(1, 0, fo)
out *= env
out = np.tanh(out * 1.6) / np.tanh(1.6) * 0.8
st = np.stack([out, np.roll(out, 220) * 0.92 + out * 0.08], 1)  # tiny stereo spread
pcm = (np.clip(st, -1, 1) * 32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
