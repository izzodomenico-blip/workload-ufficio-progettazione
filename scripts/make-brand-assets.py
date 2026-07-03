from PIL import Image

SRC = 'flowrlink-mark.png'
HI, LO = 250, 205  # luminanza: >=HI -> trasparente, <=LO -> pieno, in mezzo sfuma

src = Image.open(SRC).convert('RGBA')
w, h = src.size
px = src.load()
out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
op = out.load()
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        lum = (r + g + b) / 3
        if lum >= HI:
            alpha = 0
        elif lum <= LO:
            alpha = 255
        else:
            alpha = int(255 * (HI - lum) / (HI - LO))
        op[x, y] = (r, g, b, min(a, alpha))

out.save('public/flowrlink-mark.png')

# favicon quadrato
s = max(w, h)
sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
sq.paste(out, ((s - w) // 2, (s - h) // 2), out)
sq.resize((256, 256), Image.LANCZOS).save('public/favicon.png')
print('OK: public/flowrlink-mark.png, public/favicon.png')
