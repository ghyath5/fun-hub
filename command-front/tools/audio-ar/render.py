#!/usr/bin/env python3
"""Render the Arabic voice set (lines_ar.py) into assets/sound/v-ar/ and
list it in assets/sound/sounds.json under "voiceAr".

Speech: Arabic Piper/VITS voices run with sherpa-onnx (offline). Each voice
set gets its own speaker and treatment — the announcers clean with a little
room, field units through a radio band — then loudness-normalised and
encoded as small mono MP3s like the English set.

Clarity: the voices are rendered with less sampling noise than Piper's
default (clearer consonants, fewer swallowed endings), a little slower, and
with light treatments; silence is trimmed gently at the end so a final
consonant is never shaved off. With --check, every line is rendered several
times (VITS varies between takes), each take transcribed back with Whisper
(sherpa-onnx), and the take heard most accurately is kept.

usage: python3 render.py --models <dir with vits-piper-ar_JO-* and sherpa-onnx-whisper-small> [--check] [--takes N] [--only set ...] [--lines set/key/i ...]
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf
import sherpa_onnx

from lines_ar import ANNOUNCER_COALITION, ANNOUNCER_UNION, UNITS

HERE = os.path.dirname(os.path.abspath(__file__))
SOUND = os.path.normpath(os.path.join(HERE, '..', '..', 'assets', 'sound'))
OUT_DIR = 'v-ar'

FEMALE = 'vits-piper-ar_JO-SA_dii-high'
MALE_A = 'vits-piper-ar_JO-SA_miro_V2-high'
MALE_B = 'vits-piper-ar_JO-SA_miro-high'
MALE_C = 'vits-piper-ar_JO-kareem-medium'

# Treatments (ffmpeg filter chains, before loudness and encoding). No echo on the
# announcer: it blurs word endings (measured with the Whisper check).
# Light on purpose: a narrow radio band made short commands hard to make out.
ROOM = 'highpass=f=90,acompressor=threshold=-20dB:ratio=2.5:attack=6:release=120'
RADIO = 'highpass=f=180,lowpass=f=5200,acompressor=threshold=-20dB:ratio=3:attack=4:release=90'
FIELD = 'highpass=f=100,lowpass=f=7500,acompressor=threshold=-20dB:ratio=2.5:attack=5:release=100'
# Sampling noise (Piper's defaults are 0.667 / 0.8): lower is clearer and steadier.
NOISE = 0.4
NOISE_W = 0.6
# Everyone speaks this much slower than the cast below says (word endings get their time).
PACE = 0.9

# set → (voice, speed, pitch factor, treatment)
CAST = {
    # The female voice says word endings fully only when it takes its time.
    'eva-coalition': (FEMALE, 0.86, 1.0, ROOM),
    # The Union's announcer is a commander on the field radio: a man's voice, lightly filtered.
    'eva-union': (MALE_C, 0.95, 0.97, FIELD + ',aecho=0.8:0.35:30:0.1'),
    # Units: the kareem voice says short commands most clearly; pitch, pace and
    # radio treatment give every set its own character.
    'coalition-infantry': (MALE_C, 1.0, 1.04, FIELD),
    'coalition-vehicle': (MALE_C, 0.98, 0.95, FIELD + ',lowpass=f=5000'),
    'coalition-aircraft': (MALE_C, 1.02, 1.07, RADIO),
    'coalition-naval': (MALE_C, 0.96, 0.92, FIELD + ',aecho=0.8:0.3:45:0.12'),
    'union-infantry': (MALE_C, 1.0, 0.97, FIELD),
    'union-vehicle': (MALE_C, 0.95, 0.88, FIELD + ',lowpass=f=4800'),
    'union-aircraft': (MALE_C, 1.02, 1.0, RADIO),
    'union-naval': (MALE_C, 0.95, 0.9, FIELD + ',aecho=0.8:0.3:45:0.12'),
    'commando': (MALE_C, 1.0, 1.06, FIELD + ',lowpass=f=5500'),
    'engineer': (MALE_C, 1.0, 1.1, FIELD),
    'harvester': (MALE_C, 0.98, 0.93, RADIO),
    'mcv': (MALE_C, 0.96, 0.9, RADIO),
    'medic': (FEMALE, 0.88, 1.02, FIELD),
    'spy': (MALE_C, 0.94, 0.94, FIELD + ',aecho=0.8:0.25:20:0.08'),
    'thief': (MALE_C, 1.02, 1.12, FIELD),
}


def engine(models, name, cache={}):
    if name not in cache:
        d = os.path.join(models, name)
        onnx = next(f for f in os.listdir(d) if f.endswith('.onnx'))
        cfg = sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(
                vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=os.path.join(d, onnx), tokens=os.path.join(d, 'tokens.txt'), data_dir=os.path.join(d, 'espeak-ng-data'),
                                                           noise_scale=NOISE, noise_scale_w=NOISE_W),
                num_threads=4),
            max_num_sentences=2)
        cache[name] = sherpa_onnx.OfflineTts(cfg)
    return cache[name]


def render_line(models, text, cast, out_mp3):
    voice, speed, pitch, chain = cast
    a = engine(models, voice).generate(text, sid=0, speed=speed * PACE)
    x = np.array(a.samples, dtype=np.float32)
    with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
        sf.write(tmp.name, x, a.sample_rate)
        filters = []
        if abs(pitch - 1) > 1e-3:
            filters.append(f'rubberband=pitch={pitch}')
        # Trim silence at both ends only (a pause between words must survive): trim the start,
        # reverse, trim the start again, reverse back. The end is trimmed gently (lower
        # threshold, more kept) so a soft final consonant is never shaved off.
        head = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03'
        tail = 'silenceremove=start_periods=1:start_threshold=-58dB:start_silence=0.1'
        filters.extend([head, 'areverse', tail, 'areverse'])
        filters.append(chain)
        filters.append('loudnorm=I=-15:TP=-1.5:LRA=7')
        filters.append('apad=pad_dur=0.12')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp.name, '-af', ','.join(filters), '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '56k', out_mp3], check=True)
    return x, a.sample_rate


def decode_padded(path):
    """The rendered file as 16 kHz samples with a little silence around it (Whisper clips bare edges)."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-af', 'adelay=300,apad=pad_dur=0.4', '-ar', '16000', '-ac', '1', '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32), 16000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', required=True)
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--only', nargs='*')
    ap.add_argument('--takes', type=int, default=4, help='with --check: render each line this many times and keep the clearest')
    ap.add_argument('--lines', nargs='*', help='only these lines, as set/key/variant (the rest of the set is kept as it is)')
    args = ap.parse_args()

    sets = {'eva-coalition': {k: [v] for k, v in ANNOUNCER_COALITION.items()}, 'eva-union': {k: [v] for k, v in ANNOUNCER_UNION.items()}, **UNITS}
    index = json.load(open(os.path.join(SOUND, 'sounds.json')))
    english = index['voice']
    voice_ar = index.get('voiceAr', {})
    check = None
    if args.check:
        sys.path.insert(0, HERE)
        from asr_check import Checker
        check = Checker(args.models)
    bad = []
    for set_id, keys in sets.items():
        if args.only and set_id not in args.only:
            continue
        missing = set(english.get(set_id, {})) - set(keys)
        if missing:
            print(f'{set_id}: no Arabic for {sorted(missing)}', file=sys.stderr)
        os.makedirs(os.path.join(SOUND, OUT_DIR, set_id), exist_ok=True)
        voice_ar[set_id] = {}
        for key, lines in keys.items():
            files = []
            for i, text in enumerate(lines):
                rel = f'{OUT_DIR}/{set_id}/{key}-{i}.mp3'
                out = os.path.join(SOUND, rel)
                files.append(rel)
                if args.lines and f'{set_id}/{key}/{i}' not in args.lines and os.path.exists(out):
                    continue
                if not check:
                    render_line(args.models, text, CAST[set_id], out)
                    continue
                # Several takes; keep the one Whisper hears closest to the text.
                best = None
                for take in range(max(1, args.takes)):
                    cand = f'{out}.take{take}.mp3'
                    render_line(args.models, text, CAST[set_id], cand)
                    x, sr = decode_padded(cand)
                    heard, err = check.score(x, sr, text)
                    if best is None or err < best[0]:
                        if best: os.remove(best[2])
                        best = (err, heard, cand)
                    else:
                        os.remove(cand)
                    if err == 0:
                        break
                err, heard, cand = best
                os.replace(cand, out)
                flag = '  <<' if err > 0.34 else ''
                if flag:
                    bad.append((set_id, key, i, text, heard, err))
                print(f'{set_id:20} {key:22} {err:.2f}  {heard}{flag}', flush=True)
            voice_ar[set_id][key] = files
    index['voiceAr'] = dict(sorted(voice_ar.items()))
    with open(os.path.join(SOUND, 'sounds.json'), 'w') as f:
        json.dump(index, f, ensure_ascii=False, separators=(',', ':'))
    if bad:
        print(f'\n{len(bad)} lines to listen to:')
        for b in bad:
            print('  ', b)


if __name__ == '__main__':
    main()
