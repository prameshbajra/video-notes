#!/usr/bin/env python3
"""Generate the speech-cloud-on-red-triangle Video Notes icons."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "icons"
BASE_SIZE = 1024
TARGET_SIZES = (128, 48, 16)
TRIANGLE_COLOR = (255, 48, 48, 255)
BACKGROUND_COLOR = (255, 255, 255, 255)


def create_triangle_layer(size: int) -> Image.Image:
    """Paint the bold red right-pointing triangle."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    margin = int(size * 0.08)
    triangle = [
        (margin, margin),
        (margin, size - margin),
        (size - margin, size // 2),
    ]

    draw.polygon(triangle, fill=TRIANGLE_COLOR)

    # Soften the leading edge so it looks closer to the provided artwork.
    blur = layer.filter(ImageFilter.GaussianBlur(radius=int(size * 0.002)))
    layer = Image.alpha_composite(Image.new("RGBA", (size, size)), blur)
    return layer


def build_bubble_mask(size: int) -> Image.Image:
    """Return a mask approximating the fluffy speech cloud + tail."""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)

    circles = [
        (0.48, 0.40, 0.17),
        (0.60, 0.45, 0.16),
        (0.44, 0.55, 0.18),
        (0.58, 0.60, 0.15),
        (0.34, 0.50, 0.14),
    ]
    for cx_ratio, cy_ratio, radius_ratio in circles:
        radius = int(size * radius_ratio)
        cx = int(size * cx_ratio)
        cy = int(size * cy_ratio)
        draw.ellipse(
            (cx - radius, cy - radius, cx + radius, cy + radius),
            fill=255,
        )

    tail = [
        (int(size * 0.34), int(size * 0.63)),
        (int(size * 0.27), int(size * 0.77)),
        (int(size * 0.39), int(size * 0.62)),
    ]
    draw.polygon(tail, fill=255)
    return mask


def create_speech_bubble_layer(size: int) -> Image.Image:
    """Add the white speech cloud with a subtle drop shadow."""
    mask = build_bubble_mask(size)
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_color = Image.new("RGBA", (size, size), (0, 0, 0, 120))
    shadow.paste(shadow_color, mask=mask)
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(size * 0.008)))
    offset = (int(size * 0.01), int(size * 0.01))
    layer.paste(shadow, offset, shadow)

    bubble = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bubble_color = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    bubble.paste(bubble_color, mask=mask)
    layer = Image.alpha_composite(layer, bubble)

    return layer


def build_icon_artwork(size: int) -> Image.Image:
    """Compose the white background, triangle, and speech cloud."""
    canvas = Image.new("RGBA", (size, size), BACKGROUND_COLOR)
    canvas = Image.alpha_composite(canvas, create_triangle_layer(size))
    canvas = Image.alpha_composite(canvas, create_speech_bubble_layer(size))
    return canvas


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    base = build_icon_artwork(BASE_SIZE)
    for icon_size in TARGET_SIZES:
        resized = base.resize((icon_size, icon_size), Image.LANCZOS)
        resized.save(OUTPUT_DIR / f"icon-{icon_size}.png")


if __name__ == "__main__":
    main()
