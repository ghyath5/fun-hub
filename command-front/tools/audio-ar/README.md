# Arabic voices

The Arabic announcer and unit replies (Settings → Language → Voices →
العربية) are rendered offline from `lines_ar.py` — every line fully vowelled
so it is said as written — into `assets/sound/v-ar/`, and listed in
`assets/sound/sounds.json` under `voiceAr` (same sets, keys and number of
variants as the English set in `voice`). Any line without an Arabic
recording falls back to English in the game.

Speech: the Arabic Piper/VITS voices `ar_JO-SA_dii-high` (female: the
Coalition announcer and the medic, spoken slowly so word endings are not
swallowed) and `ar_JO-kareem-medium` (male: the Union announcer and every
unit — the clearest on short commands in the Whisper check), run with
[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx). `render.py` gives each
voice set its speaker, speed, pitch and treatment (announcers clean with a
little room, field units through a radio band), normalises loudness and
encodes small mono MP3s.

```sh
pip install sherpa-onnx soundfile numpy        # plus ffmpeg with libmp3lame
# models (from the sherpa-onnx "tts-models" and "asr-models" releases on GitHub):
#   vits-piper-ar_JO-SA_dii-high, vits-piper-ar_JO-SA_miro_V2-high,
#   vits-piper-ar_JO-SA_miro-high, vits-piper-ar_JO-kareem-medium,
#   sherpa-onnx-whisper-small (only for --check)
python3 render.py --models /path/to/models --check
```

For clarity the voices run with less sampling noise than Piper's default,
about 10% slower, through light treatments, and the end of each line is
trimmed gently so a final consonant is never shaved off. With `--check`
every line is rendered several times (`--takes`, default 4: the voice varies
between takes), each take is transcribed back with Whisper, and the take
heard most accurately is kept; its character error rate is printed and lines
still above 0.34 are listed. Very short lines (one word) are the hardest to
hear on a battlefield, so lines are kept to two words or more. Re-render a
few lines only with `--only <set> --lines <set>/<key>/<variant> …`. After rendering,
bump `CACHE` in `sw.js` (the files are listed there).
