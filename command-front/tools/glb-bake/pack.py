#!/usr/bin/env python3
"""Pack the studio's renders into Command Front's sprite atlas.

Reads out/meta.json and the PNGs bake.mjs wrote, splits every image into the
two layers the game draws — `paint` (grey, tinted with the player colour at
runtime) and `detail` (its own colours) — and repacks them together with every
frame already in assets/art/atlas.json into as few 2048² pages as fit. Frames
from the studio replace existing frames with the same key, so a re-run is
safe. Writes atlas-N.webp and atlas.json in place, and a preview sheet.

Also writes decor-0.webp: the flat terrain decor (ore, gems, craters,
rubble) at half resolution on a page of its own, so the 3D renderer — which
draws units, buildings, trees and boulders as models — can load the ground
without the sprite pages.

usage: python3 pack.py [--preview out/preview.png] [--decor-only]
"""
import argparse
import colorsys
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.normpath(os.path.join(HERE, '..', '..', 'assets', 'art'))
OUT = os.path.join(HERE, 'out')
PAGE = 2048
GAP = 6
SUPERSAMPLE = 2


def load_rgba(path, scale_to=None):
    im = Image.open(path).convert('RGBA')
    if scale_to and im.size != scale_to:
        im = im.convert('RGBa').resize(scale_to, Image.LANCZOS).convert('RGBA')
    return np.asarray(im).astype(np.float32) / 255.0


def smooth(edge0, edge1, x):
    d = edge1 - edge0
    t = np.clip((x - edge0) / (d if abs(d) > 1e-6 else 1e-6), 0, 1)
    return t * t * (3 - 2 * t)


def team_weight(rgb, team):
    """0–1 per pixel: how much of it takes the player colour."""
    if not team:
        return np.zeros(rgb.shape[:2], np.float32)
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
    if isinstance(team, list):
        return np.max([team_weight(rgb, t) for t in team], axis=0)
    if 'neutral' in team:
        n = team['neutral']
        return smooth(n['maxSat'] + 0.06, n['maxSat'] - 0.02, sat) * smooth(n['minVal'] - 0.08, n['minVal'] + 0.04, mx)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    delta = np.maximum(mx - mn, 1e-6)
    hue = np.where(mx == r, ((g - b) / delta) % 6, np.where(mx == g, (b - r) / delta + 2, (r - g) / delta + 4)) * 60
    dist = np.abs(((hue - team['hue']) + 180) % 360 - 180)
    w = smooth(team['tol'] + 8, team['tol'] - 4, dist)
    w *= smooth(team['sat'] - 0.08, team['sat'] + 0.08, sat)
    w *= smooth(team['val'] - 0.06, team['val'] + 0.06, mx)
    return w.astype(np.float32)


def split_layers(color, mask_alpha, team):
    """color: H×W×4 (straight alpha). mask_alpha: model coverage (structures) or None."""
    rgb, a = color[..., :3], color[..., 3]
    w = team_weight(rgb, team)
    if mask_alpha is not None:
        w = w * np.clip(mask_alpha * 1.2, 0, 1)
    grey = np.clip(rgb.max(axis=2) * 1.08, 0, 1)
    paint = np.dstack([grey, grey, grey, a * w])
    detail = np.dstack([rgb, a * (1 - w)])
    return paint, detail


def to_image(arr):
    return Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def radius_of(alpha, px_per_cell):
    ys, xs = np.nonzero(alpha > 0.5)
    if len(xs) == 0:
        return 0.2
    h, w = alpha.shape
    half = max(abs(xs.min() - w / 2), abs(xs.max() - w / 2), abs(ys.min() - h / 2), abs(ys.max() - h / 2))
    return round(float(half) / px_per_cell * 0.88, 4)


def write_decor_page(atlas, pages=None):
    """Copy the flat decor frames onto decor-0.webp at half size; index it in atlas['terrain']['decorPage']."""
    if pages is None:
        pages = [Image.open(os.path.join(ART, p)).convert('RGBA') for p in atlas['pages']]
    flat = ('ore', 'gem', 'crater', 'rubble')
    keys = sorted({d['key'] for s, lst in atlas['terrain']['decor'].items() if s in flat for d in lst})
    ims = {}
    for k in keys:
        f = atlas['frames'][k]
        im = pages[f['page']].crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
        ims[k] = im.resize((round(f['w'] / 2), round(f['h'] / 2)), Image.LANCZOS)
    order = sorted(keys, key=lambda k: (-ims[k].height, -ims[k].width, k))
    x = y = shelf = GAP
    shelf = 0
    frames = {}
    width = 512
    for k in order:
        w, h = ims[k].size
        if x + w + GAP > width:
            x, y, shelf = GAP, y + shelf + GAP, 0
        frames[k] = {'x': x, 'y': y, 'w': w, 'h': h}
        x += w + GAP
        shelf = max(shelf, h)
    height = 1 << (y + shelf + GAP - 1).bit_length()
    page = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    for k, f in frames.items():
        page.paste(ims[k], (f['x'], f['y']))
    page.save(os.path.join(ART, 'decor-0.webp'), 'WEBP', quality=90, method=6, alpha_quality=100)
    atlas['terrain']['decorPage'] = {'page': 'decor-0.webp', 'scale': 0.5, 'frames': frames}
    print(f'decor-0.webp {width}x{height}, {len(frames)} frames')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', default=os.path.join(OUT, 'preview.png'))
    ap.add_argument('--decor-only', action='store_true')
    args = ap.parse_args()

    atlas = json.load(open(os.path.join(ART, 'atlas.json')))
    if args.decor_only:
        write_decor_page(atlas)
        with open(os.path.join(ART, 'atlas.json'), 'w') as f:
            json.dump(atlas, f, separators=(',', ':'))
        return
    ppc = atlas['pxPerCell']
    pages = [Image.open(os.path.join(ART, p)).convert('RGBA') for p in atlas['pages']]
    meta = json.load(open(os.path.join(OUT, 'meta.json')))

    # Every existing frame, cut out of its page.
    images = {}
    for key, f in atlas['frames'].items():
        images[key] = pages[f['page']].crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))

    previews = []
    for jid, job in meta.items():
        team = job.get('team')
        if job['kind'] == 'unit':
            side = round(job['r'] * 2 * ppc)
            unit = {'r': job['r'], 'radius': 0, 'body': f'u/{jid}', 'turret': None, 'rotors': []}
            for part in job['images']:
                if part.startswith('rotor'):
                    rr = job['rotors'][int(part[5:])]
                    s = round(rr['r'] * 2 * ppc)
                    color = load_rgba(os.path.join(OUT, f'{jid}-{part}.png'), (s, s))
                else:
                    color = load_rgba(os.path.join(OUT, f'{jid}-{part}.png'), (side, side))
                paint, detail = split_layers(color, None, team)
                key = f'u/{jid}' if part == 'body' else f'u/{jid}/{part}'
                images[f'{key}:paint'] = to_image(paint)
                images[f'{key}:detail'] = to_image(detail)
                if part == 'body':
                    unit['radius'] = job.get('radius') or radius_of(color[..., 3], ppc)
                    previews.append((jid, paint, detail))
                elif part == 'turret':
                    unit['turret'] = key
                else:
                    rr = job['rotors'][int(part[5:])]
                    unit['rotors'].append({'x': rr['x'], 'z': rr['z'], 'r': rr['r'], 'layer': key})
            atlas['units'][jid] = unit
        else:
            iw, ih = job['iw'], job['ih']
            size = (round(iw * ppc), round(ih * ppc))
            color = load_rgba(os.path.join(OUT, f'{jid}-color.png'), size)
            model = load_rgba(os.path.join(OUT, f'{jid}-model.png'), size)
            paint, detail = split_layers(color, model[..., 3], team)
            key = f's/{jid}'
            images[f'{key}:paint'] = to_image(paint)
            images[f'{key}:detail'] = to_image(detail)
            atlas['structures'][jid] = {
                'w': job['w'], 'h': job['h'], 'iw': round(size[0] / ppc, 4), 'ih': round(size[1] / ppc, 4),
                'fx': 0, 'fy': round(job['fy'], 4), 'layer': key, 'parts': [],
            }
            previews.append((jid, paint, detail))

    # Shelf-pack everything, tallest first.
    order = sorted(images, key=lambda k: (-images[k].height, -images[k].width, k))
    frames = {}
    out_pages = []
    x = y = shelf = 0
    page = None
    for key in order:
        im = images[key]
        w, h = im.size
        if w + 2 * GAP > PAGE or h + 2 * GAP > PAGE:
            sys.exit(f'{key} is too large for a page ({w}×{h})')
        if page is None or x + w + GAP > PAGE:
            x, y, shelf = GAP, y + shelf + GAP if page is not None else GAP, 0
        if page is None or y + h + GAP > PAGE:
            page = Image.new('RGBA', (PAGE, PAGE), (0, 0, 0, 0))
            out_pages.append(page)
            x, y, shelf = GAP, GAP, 0
        page.paste(im, (x, y))
        frames[key] = {'page': len(out_pages) - 1, 'x': x, 'y': y, 'w': w, 'h': h}
        x += w + GAP
        shelf = max(shelf, h)

    # The last page only needs to be as tall as what it holds.
    last = out_pages[-1]
    used = max(f['y'] + f['h'] for f in frames.values() if f['page'] == len(out_pages) - 1) + GAP
    tall = 1 << (used - 1).bit_length()
    if tall < PAGE:
        out_pages[-1] = last.crop((0, 0, PAGE, tall))

    for old in atlas['pages']:
        os.remove(os.path.join(ART, old))
    names = []
    for i, p in enumerate(out_pages):
        name = f'atlas-{i}.webp'
        p.save(os.path.join(ART, name), 'WEBP', quality=90, method=6, alpha_quality=100)
        names.append(name)
    atlas['pages'] = names
    atlas['frames'] = frames
    write_decor_page(atlas, out_pages)
    with open(os.path.join(ART, 'atlas.json'), 'w') as f:
        json.dump(atlas, f, separators=(',', ':'))
    print(f'{len(frames)} frames on {len(names)} pages: ' + ', '.join(f'{n} {p.size[0]}×{p.size[1]}' for n, p in zip(names, out_pages)))

    # Preview: each new sprite tinted in the four player colours over grass.
    if previews:
        tints = [(0x3f, 0x7f, 0xd9), (0xd0, 0x4a, 0x3a), (0x4f, 0xa6, 0x4a), (0xd8, 0xa7, 0x3a)]
        cell = 300
        sheet = Image.new('RGB', (cell * 4, cell * len(previews)), (84, 104, 62))
        for row, (jid, paint, detail) in enumerate(previews):
            for col, t in enumerate(tints):
                p = paint.copy()
                p[..., :3] *= np.array(t, np.float32) / 255.0
                im = to_image(p)
                im.alpha_composite(to_image(detail))
                im.thumbnail((cell - 10, cell - 10))
                sheet.paste(im, (col * cell + 5, row * cell + 5), im)
        sheet.save(args.preview)


if __name__ == '__main__':
    main()
