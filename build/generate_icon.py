from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent
SCALE = 4
SIZE = 256
canvas = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)

def box(values):
    return tuple(int(value * SCALE) for value in values)

draw.rounded_rectangle(box((18, 18, 238, 238)), radius=48 * SCALE, fill=(39, 40, 42, 255))
draw.rounded_rectangle(box((38, 38, 218, 218)), radius=34 * SCALE, fill=(48, 50, 54, 255))
draw.polygon([box((166, 38))[0:2], box((218, 90))[0:2], box((218, 38))[0:2]], fill=(112, 126, 244, 255))
draw.rounded_rectangle(box((74, 65, 96, 191)), radius=10 * SCALE, fill=(245, 245, 242, 255))
draw.rounded_rectangle(box((63, 65, 141, 87)), radius=10 * SCALE, fill=(245, 245, 242, 255))
draw.rounded_rectangle(box((63, 169, 141, 191)), radius=10 * SCALE, fill=(245, 245, 242, 255))
draw.rounded_rectangle(box((117, 108, 188, 124)), radius=8 * SCALE, fill=(137, 151, 255, 255))
draw.rounded_rectangle(box((117, 137, 173, 153)), radius=8 * SCALE, fill=(102, 112, 190, 255))

canvas = canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
canvas.save(ROOT / "icon.png")
canvas.save(ROOT / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


def create_markdown_file_icon():
    file_canvas = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE), (0, 0, 0, 0))
    shadow = Image.new("RGBA", file_canvas.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(box((34, 18, 222, 240)), radius=13 * SCALE, fill=(0, 0, 0, 64))
    shadow = shadow.filter(ImageFilter.GaussianBlur(8 * SCALE))
    file_canvas.alpha_composite(shadow)
    file_draw = ImageDraw.Draw(file_canvas)

    file_draw.rounded_rectangle(box((36, 14, 218, 238)), radius=12 * SCALE, fill=(248, 248, 246, 255), outline=(210, 211, 213, 255), width=2 * SCALE)
    file_draw.polygon([box((162, 14))[0:2], box((162, 62))[0:2], box((170, 70))[0:2], box((218, 70))[0:2]], fill=(215, 216, 220, 255))
    file_draw.polygon([box((164, 14))[0:2], box((218, 68))[0:2], box((218, 14))[0:2]], fill=(247, 247, 245, 255))

    for y, width in [(91, 103), (108, 103), (125, 82), (142, 70), (159, 58)]:
        file_draw.rounded_rectangle(box((61, y, 61 + width, y + 7)), radius=3 * SCALE, fill=(217, 218, 220, 255))

    file_draw.rounded_rectangle(box((112, 164, 195, 210)), radius=9 * SCALE, fill=(43, 45, 49, 255))
    file_draw.rounded_rectangle(box((112, 164, 195, 171)), radius=4 * SCALE, fill=(112, 126, 244, 255))
    font = ImageFont.truetype("arialbd.ttf", 27 * SCALE)
    bounds = file_draw.textbbox((0, 0), "MD", font=font)
    text_width = bounds[2] - bounds[0]
    text_height = bounds[3] - bounds[1]
    file_draw.text((153.5 * SCALE - text_width / 2, 187 * SCALE - text_height / 2 - bounds[1]), "MD", font=font, fill=(248, 248, 246, 255))

    file_canvas = file_canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    file_canvas.save(ROOT / "markdown-file.png")
    file_canvas.save(ROOT / "markdown-file.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


create_markdown_file_icon()
