"""Whisper (sherpa-onnx) round trip: what a listener would hear, and how far
it is from the written line (character error rate, vowel marks ignored)."""
import os
import re

import numpy as np
import sherpa_onnx

HARAKAT = re.compile('[ً-ْٰـ]')


def norm(t):
    t = HARAKAT.sub('', t)
    t = re.sub('[إأآا]', 'ا', t).replace('ة', 'ه').replace('ى', 'ي')
    return ''.join(re.sub(r'[^ء-ي]', '', t))


def cer(ref, hyp):
    a, b = norm(ref), norm(hyp)
    d = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        p, d[0] = d[0], i
        for j, cb in enumerate(b, 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (ca != cb))
    return d[len(b)] / max(1, len(a))


class Checker:
    def __init__(self, models):
        w = os.path.join(models, 'sherpa-onnx-whisper-small')
        self.rec = sherpa_onnx.OfflineRecognizer.from_whisper(
            encoder=os.path.join(w, 'small-encoder.int8.onnx'), decoder=os.path.join(w, 'small-decoder.int8.onnx'),
            tokens=os.path.join(w, 'small-tokens.txt'), language='ar', task='transcribe', num_threads=max(1, os.cpu_count() or 1))

    def score(self, x, sr, text):
        if sr != 16000:
            n = int(len(x) * 16000 / sr)
            x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)
        s = self.rec.create_stream()
        s.accept_waveform(16000, x)
        self.rec.decode_stream(s)
        heard = s.result.text.strip()
        return heard, cer(text, heard)
