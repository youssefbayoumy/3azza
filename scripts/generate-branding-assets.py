"""Generate the production 3azza branding assets deterministically.

The source of truth is assets/branding/brand-master.png.  This script never
changes the artwork; it only trims transparent padding, resizes, centers, and
composites it onto the established #081421 brand background.
"""

from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
BRANDING = ROOT / "assets" / "branding"
STORE_ASSETS = ROOT / "store-assets"
MASTER = BRANDING / "brand-master.png"
FEATURE_BACKGROUND = BRANDING / "feature-graphic-background.png"
NAVY = (8, 20, 33, 255)
BLUE = (11, 117, 229, 255)
WHITE = (246, 249, 255, 255)
MUTED = (178, 200, 226, 255)
FONT_REGULAR = Path("C:/Windows/Fonts/segoeui.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/segoeuib.ttf")


def trimmed(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    bbox = rgba.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Brand master has no visible pixels")
    return rgba.crop(bbox)


def centered_layer(source: Image.Image, canvas_size: int, content_height: int) -> Image.Image:
    source = trimmed(source)
    content_width = round(source.width * content_height / source.height)
    resized = source.resize((content_width, content_height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    position = ((canvas_size - content_width) // 2, (canvas_size - content_height) // 2)
    canvas.alpha_composite(resized, position)
    return canvas


def monochrome_from(layer: Image.Image) -> Image.Image:
    """Convert the blue artwork to a white Android mask without gradients."""
    rgba = layer.convert("RGBA")
    red, green, blue, source_alpha = rgba.split()
    brightness = ImageChops.lighter(red, ImageChops.lighter(green, blue))
    # Blue artwork becomes opaque; near-black internal strokes become holes.
    threshold = brightness.point(lambda value: 255 if value >= 48 else 0)
    alpha = ImageChops.multiply(source_alpha, threshold)
    white = Image.new("RGBA", rgba.size, (255, 255, 255, 0))
    white.putalpha(alpha)
    return white


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def feature_graphic(master: Image.Image) -> Image.Image:
    """Build the Play feature graphic from the approved background and mark."""
    background = Image.open(FEATURE_BACKGROUND).convert("RGBA")
    canvas = ImageOps.fit(
        background,
        (1024, 500),
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )

    # Keep the real mark intact and give it only a restrained ambient glow.
    mark = trimmed(master)
    mark_height = 360
    mark_width = round(mark.width * mark_height / mark.height)
    mark = mark.resize((mark_width, mark_height), Image.Resampling.LANCZOS)
    mark_position = (72, (500 - mark_height) // 2)

    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    glow_mask = Image.new("L", canvas.size, 0)
    glow_mask.paste(mark.getchannel("A"), mark_position)
    glow_mask = glow_mask.filter(ImageFilter.GaussianBlur(18))
    glow.putalpha(glow_mask.point(lambda alpha: round(alpha * 0.34)))
    blue_glow = Image.new("RGBA", canvas.size, (11, 117, 229, 0))
    blue_glow.putalpha(glow.getchannel("A"))
    canvas.alpha_composite(blue_glow)
    canvas.alpha_composite(mark, mark_position)

    draw = ImageDraw.Draw(canvas)
    brand_font = ImageFont.truetype(str(FONT_BOLD), 35)
    headline_font = ImageFont.truetype(str(FONT_BOLD), 58)
    detail_font = ImageFont.truetype(str(FONT_REGULAR), 23)

    copy_x = 430
    draw.rounded_rectangle((copy_x, 92, copy_x + 70, 98), radius=3, fill=BLUE)
    draw.text((copy_x, 114), "3azza", font=brand_font, fill=BLUE)
    draw.text((copy_x, 164), "Your scooter.", font=headline_font, fill=WHITE)
    draw.text((copy_x, 227), "On track.", font=headline_font, fill=WHITE)
    draw.text(
        (copy_x, 320),
        "Maintenance  •  Fuel  •  Records  •  Offline",
        font=detail_font,
        fill=MUTED,
    )
    return canvas.convert("RGB")


def main() -> None:
    if not MASTER.exists():
        raise FileNotFoundError(f"Missing canonical brand source: {MASTER}")
    if not FEATURE_BACKGROUND.exists():
        raise FileNotFoundError(f"Missing feature graphic background: {FEATURE_BACKGROUND}")

    master = Image.open(MASTER).convert("RGBA")

    # Standard launcher and Play icon: large enough to read, with mask-safe margin.
    standard_mark = centered_layer(master, canvas_size=1024, content_height=760)
    app_icon = Image.new("RGBA", (1024, 1024), NAVY)
    app_icon.alpha_composite(standard_mark)
    save_png(app_icon, BRANDING / "app-icon.png")

    # Android adaptive layers: artwork fits comfortably inside the 66dp safe zone.
    adaptive_foreground = centered_layer(master, canvas_size=1024, content_height=590)
    save_png(adaptive_foreground, BRANDING / "adaptive-icon-foreground.png")
    adaptive_monochrome = monochrome_from(adaptive_foreground)
    save_png(adaptive_monochrome, BRANDING / "adaptive-icon-monochrome.png")

    # Splash keeps a larger transparent logo; Expo controls its rendered width.
    splash_logo = centered_layer(master, canvas_size=1024, content_height=820)
    save_png(splash_logo, BRANDING / "splash-logo.png")

    # Expo's notification plugin requires a 96x96 all-white transparent PNG.
    notification_icon = adaptive_monochrome.resize((96, 96), Image.Resampling.LANCZOS)
    save_png(notification_icon, BRANDING / "notification-icon.png")

    favicon = app_icon.resize((48, 48), Image.Resampling.LANCZOS)
    save_png(favicon, BRANDING / "favicon.png")

    play_icon = app_icon.resize((512, 512), Image.Resampling.LANCZOS)
    save_png(play_icon, STORE_ASSETS / "play-icon.png")

    save_png(feature_graphic(master), STORE_ASSETS / "feature-graphic.png")


if __name__ == "__main__":
    main()
