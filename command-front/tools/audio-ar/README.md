# Arabic voices

The Arabic announcer and unit replies (Settings → Language → Voices →
العربية) are rendered offline from `lines_ar.py` — every line fully vowelled
so it is said as written — into `assets/sound/v-ar/`, and listed in
`assets/sound/sounds.json` under `voiceAr` (same sets, keys and number of
variants as the English set in `voice`). Any line without an Arabic
recording falls back to English in the game.

Speech: the Arabic Piper/VITS voices `ar_JO-SA_dii-high` (female: the
Coalition announcer and the medic), `ar_JO-kareem-medium` (male: the Union
announcer and most units — the clearest on short commands in the Whisper
check) and `ar_JO-SA_miro_V2-high` (commando, spy), run with
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

`--check` transcribes every line back with Whisper and prints its character
error rate, so a word the voice says wrongly stands out. After rendering,
bump `CACHE` in `sw.js` (the files are listed there).
