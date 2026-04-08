"""plusi/mood_avatars.py — Generate Plusi mood PNGs for Telegram profile photos.

Ports the face definitions from shared/plusi-renderer.js to Python,
renders SVGs, converts to 640x640 PNGs via cairosvg, caches on disk.
"""

import os
import hashlib

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BODY_COLOR = '#0a84ff'
AVATAR_SIZE = 640
CACHE_DIR = os.path.join(os.path.dirname(__file__), '.mood_avatars')

# ---------------------------------------------------------------------------
# Mood face definitions (ported from shared/plusi-renderer.js)
# ---------------------------------------------------------------------------

MOODS = {
    'neutral': {
        'eyes':   '<ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/>',
        'pupils': '<ellipse cx="49" cy="50" rx="4" ry="4" fill="#1a1a1a"/><ellipse cx="71" cy="50" rx="4" ry="4" fill="#1a1a1a"/>',
        'mouth':  '<path d="M 48 68 Q 60 74 72 68" stroke="#1a1a1a" stroke-width="3" fill="none" stroke-linecap="round"/>',
        'lids':   None,
        'extras': None,
        'color':  '#38bdf8',
    },
    'curious': {
        'eyes':   '<ellipse cx="48" cy="47" rx="7" ry="10" fill="white"/><ellipse cx="72" cy="51" rx="7" ry="6" fill="white"/>',
        'pupils': '<ellipse cx="51" cy="48" rx="4" ry="4" fill="#1a1a1a"/><ellipse cx="74" cy="52" rx="3" ry="2.5" fill="#1a1a1a"/>',
        'mouth':  '<path d="M 52 67 Q 58 71 66 68" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        'lids':   '<rect x="65" y="45" width="14" height="5" fill="currentColor"/>',
        'extras': None,
        'color':  '#7c3aed',
    },
    'thinking': {
        'eyes':   '<ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/>',
        'pupils': '<ellipse cx="46" cy="45" rx="3.5" ry="3.5" fill="#1a1a1a"/><ellipse cx="70" cy="45" rx="3.5" ry="3.5" fill="#1a1a1a"/>',
        'mouth':  '<line x1="54" y1="69" x2="66" y2="68" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>',
        'lids':   None,
        'extras': None,
        'color':  '#22d3ee',
    },
    'annoyed': {
        'eyes':   '<ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/>',
        'pupils': '<ellipse cx="49" cy="52" rx="4" ry="3" fill="#1a1a1a"/><ellipse cx="71" cy="52" rx="4" ry="3" fill="#1a1a1a"/>',
        'mouth':  '<line x1="50" y1="70" x2="70" y2="70" stroke="#1a1a1a" stroke-width="3" stroke-linecap="round"/>',
        'lids':   '<rect x="41" y="41" width="14" height="7" fill="currentColor"/><rect x="65" y="41" width="14" height="7" fill="currentColor"/>',
        'extras': None,
        'color':  '#fbbf24',
    },
    'empathy': {
        'eyes':   '<ellipse cx="48" cy="50" rx="7" ry="7" fill="white"/><ellipse cx="72" cy="50" rx="7" ry="7" fill="white"/>',
        'pupils': '<ellipse cx="49" cy="52" rx="4" ry="4" fill="#1a1a1a"/><ellipse cx="71" cy="52" rx="4" ry="4" fill="#1a1a1a"/>',
        'mouth':  '<path d="M 50 68 Q 60 73 70 68" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        'lids':   '<rect x="41" y="43" width="14" height="3" fill="currentColor"/><rect x="65" y="43" width="14" height="3" fill="currentColor"/>',
        'extras': None,
        'color':  '#2dd4bf',
    },
    'happy': {
        'eyes':   '<path d="M 41 51 Q 48 43 55 51" stroke="white" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M 65 51 Q 72 43 79 51" stroke="white" stroke-width="3" fill="none" stroke-linecap="round"/>',
        'pupils': None,
        'mouth':  '<path d="M 50 67 Q 60 73 70 67" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        'lids':   None,
        'extras': None,
        'color':  '#4ade80',
    },
    'excited': {
        'eyes':   '<ellipse cx="48" cy="47" rx="8" ry="9" fill="white"/><ellipse cx="72" cy="47" rx="8" ry="9" fill="white"/>',
        'pupils': '<ellipse cx="49" cy="46" rx="4.5" ry="4.5" fill="#1a1a1a"/><ellipse cx="71" cy="46" rx="4.5" ry="4.5" fill="#1a1a1a"/>',
        'mouth':  '<path d="M 48 65 Q 60 76 72 65" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        'lids':   None,
        'extras': '<circle cx="39" cy="38" r="2.5" fill="white" opacity="0.5"/><circle cx="81" cy="38" r="2.5" fill="white" opacity="0.5"/><circle cx="42" cy="34" r="1.5" fill="white" opacity="0.3"/><circle cx="78" cy="34" r="1.5" fill="white" opacity="0.3"/>',
        'color':  '#a855f6',
    },
    'surprised': {
        'eyes':   '<ellipse cx="48" cy="46" rx="9" ry="11" fill="white"/><ellipse cx="72" cy="46" rx="9" ry="11" fill="white"/>',
        'pupils': '<ellipse cx="49" cy="46" rx="5" ry="5" fill="#1a1a1a"/><ellipse cx="71" cy="46" rx="5" ry="5" fill="#1a1a1a"/>',
        'mouth':  '<ellipse cx="60" cy="71" rx="4" ry="3.5" fill="#1a1a1a"/>',
        'lids':   None,
        'extras': None,
        'color':  '#a3e635',
    },
    'flustered': {
        'eyes':   '<ellipse cx="48" cy="50" rx="6" ry="5" fill="white"/><ellipse cx="72" cy="50" rx="6" ry="5" fill="white"/>',
        'pupils': '<ellipse cx="52" cy="51" rx="2.5" ry="2.5" fill="#1a1a1a"/><ellipse cx="76" cy="51" rx="2.5" ry="2.5" fill="#1a1a1a"/>',
        'mouth':  '<path d="M 53 69 Q 57 67 60 70 Q 63 67 67 69" stroke="#1a1a1a" stroke-width="2" fill="none" stroke-linecap="round"/>',
        'lids':   '<rect x="41" y="45" width="14" height="5" fill="currentColor"/><rect x="65" y="45" width="14" height="5" fill="currentColor"/>',
        'extras': '<ellipse cx="37" cy="58" rx="7" ry="4" fill="#f87171" opacity="0.35"/><ellipse cx="83" cy="58" rx="7" ry="4" fill="#f87171" opacity="0.35"/>',
        'color':  '#f472b6',
    },
    'proud': {
        'eyes':   '<ellipse cx="48" cy="51" rx="7" ry="5" fill="white"/><ellipse cx="72" cy="51" rx="7" ry="5" fill="white"/>',
        'pupils': '<ellipse cx="49" cy="52" rx="3.5" ry="2.5" fill="#1a1a1a"/><ellipse cx="71" cy="52" rx="3.5" ry="2.5" fill="#1a1a1a"/>',
        'mouth':  '<path d="M 50 69 Q 55 69 60 68 Q 67 74 74 66" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        'lids':   '<rect x="41" y="44" width="14" height="7" fill="currentColor"/><rect x="65" y="44" width="14" height="7" fill="currentColor"/>',
        'extras': None,
        'color':  '#22c55e',
    },
    'worried': {
        'eyes':   '<ellipse cx="48" cy="47" rx="8" ry="10" fill="white"/><ellipse cx="72" cy="47" rx="8" ry="10" fill="white"/>',
        'pupils': '<ellipse cx="49" cy="48" rx="4" ry="4" fill="#1a1a1a"/><ellipse cx="71" cy="48" rx="4" ry="4" fill="#1a1a1a"/>',
        'mouth':  '<path d="M 52 70 Q 60 67 68 70" stroke="#1a1a1a" stroke-width="2" fill="none" stroke-linecap="round"/>',
        'lids':   None,
        'extras': '<ellipse cx="82" cy="46" rx="3" ry="4" fill="white" opacity="0.25"/>',
        'color':  '#fb923c',
    },
    'frustrated': {
        'eyes':   '<ellipse cx="48" cy="50" rx="7" ry="6" fill="white"/><ellipse cx="72" cy="50" rx="7" ry="6" fill="white"/>',
        'pupils': '<ellipse cx="49" cy="51" rx="3" ry="2.5" fill="#1a1a1a"/><ellipse cx="71" cy="51" rx="3" ry="2.5" fill="#1a1a1a"/>',
        'mouth':  '<path d="M 48 70 Q 60 64 72 70" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        'lids':   '<rect x="41" y="42" width="14" height="8" fill="currentColor"/><rect x="65" y="42" width="14" height="8" fill="currentColor"/>',
        'extras': None,
        'color':  '#ef4444',
    },
    'jealous': {
        'eyes':   '<ellipse cx="48" cy="50" rx="7" ry="6" fill="white"/><ellipse cx="72" cy="50" rx="7" ry="6" fill="white"/>',
        'pupils': '<ellipse cx="52" cy="51" rx="3" ry="2.5" fill="#1a1a1a"/><ellipse cx="76" cy="51" rx="3" ry="2.5" fill="#1a1a1a"/>',
        'mouth':  '<path d="M 52 69 Q 56 69 60 68 Q 64 70 68 69" stroke="#1a1a1a" stroke-width="2" fill="none" stroke-linecap="round"/>',
        'lids':   '<rect x="41" y="44" width="14" height="6" fill="currentColor"/><rect x="65" y="44" width="14" height="6" fill="currentColor"/>',
        'extras': None,
        'color':  '#e11d48',
    },
    'sleepy': {
        'eyes':   '<ellipse cx="48" cy="52" rx="7" ry="3" fill="white"/><ellipse cx="72" cy="52" rx="7" ry="3" fill="white"/>',
        'pupils': None,
        'mouth':  '<line x1="54" y1="70" x2="66" y2="71" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round"/>',
        'lids':   None,
        'extras': None,
        'color':  '#94a3b8',
    },
}


# ---------------------------------------------------------------------------
# SVG builder
# ---------------------------------------------------------------------------

def build_mood_svg(mood_name: str) -> str:
    """Build a static SVG string for the given mood (no animations)."""
    mood = MOODS.get(mood_name, MOODS['neutral'])
    aura_color = mood['color']
    body_color = BODY_COLOR

    face_parts = []
    if mood['eyes']:
        face_parts.append(mood['eyes'])
    if mood['pupils']:
        face_parts.append(mood['pupils'])
    if mood['lids']:
        face_parts.append(mood['lids'].replace('currentColor', body_color))
    if mood['mouth']:
        face_parts.append(mood['mouth'])
    if mood['extras']:
        face_parts.append(mood['extras'])

    face_svg = ''.join(face_parts)

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"'
        f' width="{AVATAR_SIZE}" height="{AVATAR_SIZE}">'
        '<defs><filter id="glow" x="-60%" y="-60%" width="220%" height="220%">'
        '<feGaussianBlur stdDeviation="8"/>'
        '</filter></defs>'
        # Background — dark circle for Telegram profile photo framing
        '<rect width="120" height="120" rx="60" fill="#111113"/>'
        # Aura glow
        f'<rect x="40" y="5" width="40" height="110" rx="8" fill="{aura_color}" opacity="0.45" filter="url(#glow)"/>'
        f'<rect x="5" y="35" width="110" height="40" rx="8" fill="{aura_color}" opacity="0.45" filter="url(#glow)"/>'
        # Body
        f'<rect x="40" y="5" width="40" height="110" rx="8" fill="{body_color}"/>'
        f'<rect x="5" y="35" width="110" height="40" rx="8" fill="{body_color}"/>'
        f'<rect x="40" y="35" width="40" height="40" fill="{body_color}"/>'
        # Face
        f'<g>{face_svg}</g>'
        '</svg>'
    )


# ---------------------------------------------------------------------------
# PNG generation + caching
# ---------------------------------------------------------------------------

def _ensure_cache_dir():
    os.makedirs(CACHE_DIR, exist_ok=True)


def _svg_to_png_pillow(svg_data: str, png_path: str) -> bool:
    """Render SVG to PNG using Pillow's built-in SVG support or subprocess."""
    import subprocess
    import tempfile

    # Strategy: use resvg/rsvg-convert if available, else try Pillow
    svg_bytes = svg_data.encode('utf-8')

    # Try rsvg-convert (commonly available via librsvg)
    for cmd in ['rsvg-convert', '/opt/homebrew/bin/rsvg-convert']:
        try:
            result = subprocess.run(
                [cmd, '-w', str(AVATAR_SIZE), '-h', str(AVATAR_SIZE), '-o', png_path],
                input=svg_bytes, capture_output=True, timeout=10,
            )
            if result.returncode == 0 and os.path.exists(png_path):
                return True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue

    # Fallback: draw with Pillow directly (simplified rendering)
    try:
        from PIL import Image, ImageDraw
        return _render_with_pillow(svg_data, png_path)
    except ImportError:
        pass

    logger.error("mood_avatars: no SVG renderer available (install librsvg: brew install librsvg)")
    return False


def _hex_to_rgb(hex_color: str) -> tuple:
    """Convert #RRGGBB to (R, G, B)."""
    h = hex_color.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def _render_with_pillow(svg_data: str, png_path: str) -> bool:
    """Simplified Plusi renderer using Pillow drawing primitives."""
    from PIL import Image, ImageDraw
    import re

    # Parse mood from SVG (find aura color to identify mood)
    size = AVATAR_SIZE
    scale = size / 120.0  # SVG viewBox is 120x120

    img = Image.new('RGBA', (size, size), (17, 17, 19, 255))  # #111113 background
    draw = ImageDraw.Draw(img)

    # Draw rounded background
    draw.ellipse([0, 0, size-1, size-1], fill=(17, 17, 19, 255))

    # Extract colors from SVG
    body_rgb = _hex_to_rgb(BODY_COLOR)
    aura_match = re.search(r'opacity="0\.45".*?fill="(#[0-9a-fA-F]{6})"', svg_data)
    if not aura_match:
        aura_match = re.search(r'fill="(#[0-9a-fA-F]{6})".*?opacity="0\.45"', svg_data)
    aura_rgb = _hex_to_rgb(aura_match.group(1)) if aura_match else body_rgb

    # Aura glow (simplified as rectangles with alpha)
    aura_color = aura_rgb + (115,)  # 0.45 * 255
    # Vertical arm
    x1, y1 = int(40*scale), int(5*scale)
    x2, y2 = int(80*scale), int(115*scale)
    r = int(8*scale)
    draw.rounded_rectangle([x1, y1, x2, y2], radius=r, fill=aura_color)
    # Horizontal arm
    x1, y1 = int(5*scale), int(35*scale)
    x2, y2 = int(115*scale), int(75*scale)
    draw.rounded_rectangle([x1, y1, x2, y2], radius=r, fill=aura_color)

    # Body
    body_color = body_rgb + (255,)
    # Vertical arm
    x1, y1 = int(40*scale), int(5*scale)
    x2, y2 = int(80*scale), int(115*scale)
    draw.rounded_rectangle([x1, y1, x2, y2], radius=r, fill=body_color)
    # Horizontal arm
    x1, y1 = int(5*scale), int(35*scale)
    x2, y2 = int(115*scale), int(75*scale)
    draw.rounded_rectangle([x1, y1, x2, y2], radius=r, fill=body_color)
    # Center fill
    x1, y1 = int(40*scale), int(35*scale)
    x2, y2 = int(80*scale), int(75*scale)
    draw.rectangle([x1, y1, x2, y2], fill=body_color)

    # Parse and draw eyes (ellipses)
    for m in re.finditer(r'<ellipse cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)" fill="(.*?)"', svg_data):
        cx, cy, rx, ry = float(m.group(1)), float(m.group(2)), float(m.group(3)), float(m.group(4))
        fill = m.group(5)
        if fill == 'white':
            color = (255, 255, 255, 255)
        elif fill.startswith('#'):
            color = _hex_to_rgb(fill) + (255,)
        else:
            continue
        bbox = [int((cx-rx)*scale), int((cy-ry)*scale), int((cx+rx)*scale), int((cy+ry)*scale)]
        draw.ellipse(bbox, fill=color)

    # Parse happy eyes (path crescents → draw as arcs)
    for m in re.finditer(r'<path d="M ([\d.]+) ([\d.]+) Q ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)" stroke="white"', svg_data):
        x1, y1 = float(m.group(1)), float(m.group(2))
        x2, y2 = float(m.group(5)), float(m.group(6))
        qy = float(m.group(4))
        # Approximate crescent as arc
        bbox = [int(x1*scale), int(qy*scale), int(x2*scale), int(y1*scale)]
        draw.arc(bbox, 0, 180, fill=(255, 255, 255, 255), width=max(2, int(3*scale)))

    # Draw mouth (simplified)
    mouth_match = re.search(r'<path d="M ([\d.]+) ([\d.]+) Q ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)" stroke="#1a1a1a"', svg_data)
    if mouth_match:
        x1, y1 = float(mouth_match.group(1)), float(mouth_match.group(2))
        qx, qy = float(mouth_match.group(3)), float(mouth_match.group(4))
        x2, y2 = float(mouth_match.group(5)), float(mouth_match.group(6))
        mouth_color = (26, 26, 26, 255)
        if qy > y1:  # Smile
            bbox = [int(x1*scale), int(y1*scale), int(x2*scale), int(qy*scale)]
            draw.arc(bbox, 0, 180, fill=mouth_color, width=max(2, int(2.5*scale)))
        else:  # Frown
            bbox = [int(x1*scale), int(qy*scale), int(x2*scale), int(y1*scale)]
            draw.arc(bbox, 180, 360, fill=mouth_color, width=max(2, int(2.5*scale)))

    # Mouth line
    line_match = re.search(r'<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" stroke="#1a1a1a"', svg_data)
    if line_match and not mouth_match:
        x1 = int(float(line_match.group(1)) * scale)
        y1 = int(float(line_match.group(2)) * scale)
        x2 = int(float(line_match.group(3)) * scale)
        y2 = int(float(line_match.group(4)) * scale)
        draw.line([(x1, y1), (x2, y2)], fill=(26, 26, 26, 255), width=max(2, int(2.5*scale)))

    # O-mouth (surprised)
    o_match = re.search(r'<ellipse cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)" fill="#1a1a1a"/>', svg_data)
    # Only if it's in the mouth area (cy > 60)
    if o_match and float(o_match.group(2)) > 60:
        cx, cy = float(o_match.group(1)), float(o_match.group(2))
        rx, ry = float(o_match.group(3)), float(o_match.group(4))
        bbox = [int((cx-rx)*scale), int((cy-ry)*scale), int((cx+rx)*scale), int((cy+ry)*scale)]
        draw.ellipse(bbox, fill=(26, 26, 26, 255))

    # Blush marks (flustered)
    for m in re.finditer(r'<ellipse cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)" fill="#f87171" opacity="([\d.]+)"', svg_data):
        cx, cy = float(m.group(1)), float(m.group(2))
        rx, ry = float(m.group(3)), float(m.group(4))
        alpha = int(float(m.group(5)) * 255)
        bbox = [int((cx-rx)*scale), int((cy-ry)*scale), int((cx+rx)*scale), int((cy+ry)*scale)]
        draw.ellipse(bbox, fill=(248, 113, 113, alpha))

    img.save(png_path, 'PNG')
    return True


def get_mood_png_path(mood_name: str) -> str:
    """Return path to a cached PNG for the mood, generating if needed."""
    _ensure_cache_dir()
    png_path = os.path.join(CACHE_DIR, f'{mood_name}.png')

    if os.path.exists(png_path):
        return png_path

    svg_data = build_mood_svg(mood_name)

    # Try cairosvg first, then fallback chain
    try:
        import cairosvg
        cairosvg.svg2png(
            bytestring=svg_data.encode('utf-8'),
            write_to=png_path,
            output_width=AVATAR_SIZE,
            output_height=AVATAR_SIZE,
        )
        logger.info("mood_avatars: generated %s.png (cairosvg)", mood_name)
        return png_path
    except Exception:
        pass

    if _svg_to_png_pillow(svg_data, png_path):
        logger.info("mood_avatars: generated %s.png (pillow)", mood_name)
        return png_path

    logger.error("mood_avatars: failed to generate %s.png", mood_name)
    return ""


def generate_all() -> dict:
    """Pre-generate PNGs for all moods. Returns {mood: path} dict."""
    result = {}
    for mood_name in MOODS:
        path = get_mood_png_path(mood_name)
        if path:
            result[mood_name] = path
    return result


def clear_cache():
    """Delete all cached PNGs (forces regeneration)."""
    import shutil
    if os.path.isdir(CACHE_DIR):
        shutil.rmtree(CACHE_DIR)
        logger.info("mood_avatars: cache cleared")
