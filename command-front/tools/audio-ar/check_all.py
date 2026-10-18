#!/usr/bin/env python3
"""Transcribe every rendered Arabic line (assets/sound/v-ar) with Whisper and
print the character error rate against its text — the lines worth a listen
come last. usage: python3 check_all.py --models <dir> [--only set ...]"""
import argparse
import json
import os

from lines_ar import ANNOUNCER_COALITION, ANNOUNCER_UNION, UNITS
from asr_check import Checker
from render import SOUND, decode_padded

ap = argparse.ArgumentParser()
ap.add_argument('--models', required=True)
ap.add_argument('--only', nargs='*')
args = ap.parse_args()
sets = {'eva-coalition': {k: [v] for k, v in ANNOUNCER_COALITION.items()}, 'eva-union': {k: [v] for k, v in ANNOUNCER_UNION.items()}, **UNITS}
check = Checker(args.models)
rows = []
for set_id, keys in sets.items():
    if args.only and set_id not in args.only:
        continue
    for key, lines in keys.items():
        for i, text in enumerate(lines):
            x, sr = decode_padded(os.path.join(SOUND, f'v-ar/{set_id}/{key}-{i}.mp3'))
            heard, err = check.score(x, sr, text)
            rows.append((err, set_id, key, i, text, heard))
            print(f'{err:.2f} {set_id:20} {key:22} {i} {heard}', flush=True)
rows.sort()
print('\nworst:')
for r in rows[-25:]:
    print(json.dumps(r, ensure_ascii=False))
