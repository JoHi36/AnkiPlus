"""
Text-Utilities: HTML-Bereinigung und Bildextraktion
Zentrale Funktionen, die an mehreren Stellen im Projekt verwendet werden.
"""

import re


def clean_html(text, max_len=1500):
    """Bereinigt HTML-Tags, Entities, Cloze-Markup, LaTeX und begrenzt die Textlänge."""
    if not text:
        return ""
    clean = text
    # Sound and image references
    clean = re.sub(r'\[sound:[^\]]+\]', '', clean)
    clean = re.sub(r'\[image:[^\]]+\]', '', clean)
    # LaTeX: keep content inside \(...\) and \[...\]
    clean = re.sub(r'\\\((.+?)\\\)', r'\1', clean)
    clean = re.sub(r'\\\[(.+?)\\\]', r'\1', clean)
    clean = re.sub(r'\\(?:text|mathrm|textbf|textit)\{([^}]*)\}', r'\1', clean)
    clean = re.sub(r'\\[a-zA-Z]+', ' ', clean)
    clean = re.sub(r'[{}]', '', clean)
    # HTML tags and entities
    clean = re.sub(r'<[^>]+>', ' ', clean)
    clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)
    clean = re.sub(r'&#?\w+;', ' ', clean)
    # Cloze markers: {{c1::answer}} → answer, {{c1::answer::hint}} → answer
    clean = re.sub(r'\{\{c\d+::(.*?)(?:::[^}]*)?\}\}', r'\1', clean)
    # URLs
    clean = re.sub(r'https?://\S+', '', clean)
    # Normalize whitespace
    clean = re.sub(r'\s+', ' ', clean).strip()
    if len(clean) > max_len:
        clean = clean[:max_len] + "..."
    return clean


def extract_images_from_html(text):
    """Extrahiert alle Bild-URLs aus HTML-Text."""
    if not text:
        return []
    img_pattern = r'<img[^>]+src=["\']([^"\']+)["\']'
    matches = re.findall(img_pattern, text, re.IGNORECASE)
    return [url.strip() for url in matches if url.strip()]


def clean_html_with_images(text, max_len=2000):
    """Bereinigt HTML und extrahiert gleichzeitig Bilder. Gibt (clean_text, image_urls) zurück."""
    if not text:
        return ("", [])
    image_urls = extract_images_from_html(text)
    clean = clean_html(text, max_len)
    return (clean, image_urls)
