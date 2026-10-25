# Contact sheet of the preview renders: python3 sheet.py lightTank heavyTank ...
import sys, os
from PIL import Image, ImageDraw
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
ids = sys.argv[1:] or sorted(f[:-4] for f in os.listdir(out) if f.endswith('.png') and f != 'sheet.png')
T = 320
cols = min(4, len(ids))
rows = (len(ids) + cols - 1) // cols
sheet = Image.new('RGB', (cols * T, rows * T), (40, 40, 40))
d = ImageDraw.Draw(sheet)
for i, id in enumerate(ids):
    im = Image.open(os.path.join(out, f'{id}.png')).convert('RGB').resize((T, T))
    x, y = (i % cols) * T, (i // cols) * T
    sheet.paste(im, (x, y))
    d.text((x + 6, y + 4), id, fill=(255, 255, 255))
sheet.save(os.path.join(out, 'sheet.png'))
print(os.path.join(out, 'sheet.png'))
