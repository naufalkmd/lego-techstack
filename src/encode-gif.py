from pathlib import Path
import sys

from PIL import Image


def rgba_to_gif_frame(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    rgb = Image.new("RGB", rgba.size, (0, 0, 0))
    rgb.paste(rgba, mask=alpha)
    palette_frame = rgb.quantize(colors=255)
    transparent_mask = Image.eval(alpha, lambda value: 255 if value <= 16 else 0)
    palette_frame.paste(255, mask=transparent_mask)

    palette = palette_frame.getpalette() or []
    if len(palette) < 768:
        palette.extend([0] * (768 - len(palette)))
    palette[255 * 3 : 255 * 3 + 3] = [0, 0, 0]
    palette_frame.putpalette(palette)
    palette_frame.info["transparency"] = 255
    return palette_frame


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: python src/encode-gif.py <frames-dir> <output.gif> [duration-ms]")
        return 1

    frames_dir = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    duration = int(sys.argv[3]) if len(sys.argv) > 3 else 70

    frame_paths = sorted(frames_dir.glob("frame-*.png"))
    if not frame_paths:
        print(f"No frames found in {frames_dir}")
        return 1

    images = []
    for path in frame_paths:
        with Image.open(path) as image:
            images.append(rgba_to_gif_frame(image))
    first, rest = images[0], images[1:]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    first.save(
        output_path,
        save_all=True,
        append_images=rest,
        duration=duration,
        loop=0,
        disposal=2,
        optimize=False,
        transparency=255,
    )

    for image in images:
        image.close()

    print(f"Generated {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
