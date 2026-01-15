"""
Card Markdown Renderer
Separater Markdown-Parser für Anki-Karten mit Amboss-ähnlicher Formatierung
Komplett getrennt vom Chat-Markdown für maximale Lesbarkeit und Aufnehmbarkeit
"""

import re
import html


def render_card_markdown(markdown_text):
    """
    Rendert Markdown zu HTML mit Amboss-ähnlicher Formatierung.
    
    Features:
    - [[term]] - Medizinische Begriffe (fett + teal-farbig)
    - ### Überschriften - Strukturierte Überschriften mit größerem Abstand
    - > Merke:/Warnung:/Tipp:/Definition: - Spezielle Amboss-Boxes
    - Optimierte Listen-Formatierung
    - Premium-Typografie für maximale Lesbarkeit
    
    Args:
        markdown_text: Der Markdown-Text
        
    Returns:
        HTML-String mit card-markdown CSS-Klassen
    """
    if not markdown_text:
        return ""
    
    # Escape HTML in Markdown (außer in Code-Blöcken)
    # Wir müssen vorsichtig sein, um Code-Blöcke nicht zu zerstören
    text = markdown_text
    
    # 1. Code-Blöcke extrahieren und temporär ersetzen
    code_blocks = []
    code_block_pattern = r'```[\s\S]*?```'
    code_matches = list(re.finditer(code_block_pattern, text))
    for i, match in enumerate(code_matches):
        placeholder = f"__CODE_BLOCK_{i}__"
        code_blocks.append(match.group(0))
        text = text.replace(match.group(0), placeholder, 1)
    
    # 2. Inline Code extrahieren
    inline_code_pattern = r'`[^`]+`'
    inline_code_matches = list(re.finditer(inline_code_pattern, text))
    inline_codes = []
    for i, match in enumerate(inline_code_matches):
        placeholder = f"__INLINE_CODE_{i}__"
        inline_codes.append(match.group(0))
        text = text.replace(match.group(0), placeholder, 1)
    
    # 3. HTML escapen (außer Platzhalter)
    text = html.escape(text)
    
    # 4. Code-Blöcke wieder einfügen
    for i, code_block in enumerate(code_blocks):
        placeholder = f"__CODE_BLOCK_{i}__"
        # Code-Blöcke nicht escapen, nur Formatierung
        code_content = code_block.replace('```', '')
        language = ''
        if '\n' in code_content:
            first_line = code_content.split('\n')[0]
            if first_line.strip() and not first_line.strip().startswith('<'):
                language = first_line.strip()
                code_content = '\n'.join(code_content.split('\n')[1:])
        text = text.replace(placeholder, f'<pre><code class="language-{language}">{html.escape(code_content)}</code></pre>')
    
    # 5. Inline Code wieder einfügen
    for i, inline_code in enumerate(inline_codes):
        placeholder = f"__INLINE_CODE_{i}__"
        code_content = inline_code.strip('`')
        text = text.replace(placeholder, f'<code>{html.escape(code_content)}</code>')
    
    # 6. Term Highlighting: [[term]] → <span class="term-highlight">term</span>
    text = re.sub(
        r'\[\[([^\]]+)\]\]',
        r'<span class="term-highlight">\1</span>',
        text
    )
    
    # 7. Überschriften (### → h3)
    text = re.sub(
        r'^###\s+(.+)$',
        r'<h3>\1</h3>',
        text,
        flags=re.MULTILINE
    )
    
    # 8. Amboss-Boxes: > Merke:/Warnung:/Tipp:/Definition:
    # Merke-Box (gelb)
    text = re.sub(
        r'^>\s*Merke:\s*(.+?)(?=\n\n|\n>|\Z)',
        r'<div class="amboss-box merke"><strong>Merke:</strong> \1</div>',
        text,
        flags=re.MULTILINE | re.DOTALL
    )
    
    # Warnung-Box (rot)
    text = re.sub(
        r'^>\s*Warnung:\s*(.+?)(?=\n\n|\n>|\Z)',
        r'<div class="amboss-box warnung"><strong>Warnung:</strong> \1</div>',
        text,
        flags=re.MULTILINE | re.DOTALL
    )
    
    # Tipp-Box (blau)
    text = re.sub(
        r'^>\s*Tipp:\s*(.+?)(?=\n\n|\n>|\Z)',
        r'<div class="amboss-box tipp"><strong>Tipp:</strong> \1</div>',
        text,
        flags=re.MULTILINE | re.DOTALL
    )
    
    # Definition-Box (grau)
    text = re.sub(
        r'^>\s*Definition:\s*(.+?)(?=\n\n|\n>|\Z)',
        r'<div class="amboss-box definition"><strong>Definition:</strong> \1</div>',
        text,
        flags=re.MULTILINE | re.DOTALL
    )
    
    # 9. Fett: **text** → <strong>text</strong>
    text = re.sub(
        r'\*\*([^\*]+)\*\*',
        r'<strong>\1</strong>',
        text
    )
    
    # 10. Kursiv: *text* → <em>text</em>
    text = re.sub(
        r'(?<!\*)\*([^\*]+)\*(?!\*)',
        r'<em>\1</em>',
        text
    )
    
    # 11. Listen (nummeriert und unnummeriert)
    # Unnummerierte Listen
    lines = text.split('\n')
    in_list = False
    list_type = None
    result_lines = []
    
    for line in lines:
        # Unnummerierte Liste
        if re.match(r'^[\-\*]\s+', line):
            if not in_list or list_type != 'ul':
                if in_list:
                    result_lines.append(f'</{list_type}>')
                result_lines.append('<ul>')
                in_list = True
                list_type = 'ul'
            item_text = re.sub(r'^[\-\*]\s+', '', line)
            result_lines.append(f'<li>{item_text}</li>')
        # Nummerierte Liste
        elif re.match(r'^\d+\.\s+', line):
            if not in_list or list_type != 'ol':
                if in_list:
                    result_lines.append(f'</{list_type}>')
                result_lines.append('<ol>')
                in_list = True
                list_type = 'ol'
            item_text = re.sub(r'^\d+\.\s+', '', line)
            result_lines.append(f'<li>{item_text}</li>')
        else:
            if in_list:
                result_lines.append(f'</{list_type}>')
                in_list = False
                list_type = None
            result_lines.append(line)
    
    if in_list:
        result_lines.append(f'</{list_type}>')
    
    text = '\n'.join(result_lines)
    
    # 12. Absätze (doppelte Zeilenumbrüche)
    text = re.sub(r'\n\n+', '</p><p>', text)
    text = '<p>' + text + '</p>'
    text = text.replace('<p></p>', '')  # Entferne leere Absätze
    
    # 13. Einzelne Zeilenumbrüche → <br>
    text = re.sub(r'(?<!</p>)\n(?!<)', '<br>', text)
    
    # 14. Links: [text](url) → <a href="url">text</a>
    text = re.sub(
        r'\[([^\]]+)\]\(([^\)]+)\)',
        r'<a href="\2" target="_blank" rel="noopener noreferrer">\1</a>',
        text
    )
    
    # Wrappe in div mit card-markdown Klasse
    return f'<div class="anki-card-markdown">{text}</div>'


def upgrade_standard_markdown(markdown_text):
    """
    Upgraded Standard-Anki-Markdown zu Card-Markdown.
    Konvertiert bestehende Karten (z.B. Amboss) zu Premium-Look.
    
    - **fett** → [[term]]-Style (farbig + fett)
    - Blockquotes → Amboss-Boxes
    - Überschriften → Serif-Font mit größerem Abstand
    """
    if not markdown_text:
        return markdown_text
    
    text = markdown_text
    
    # Konvertiere **term** zu [[term]] für medizinische Begriffe
    # (nur wenn es wie ein medizinischer Begriff aussieht - Großbuchstaben, etc.)
    # Für jetzt: Konvertiere alle **text** zu [[text]] für Highlighting
    text = re.sub(
        r'\*\*([^\*]+)\*\*',
        r'[[\1]]',
        text
    )
    
    # Konvertiere Standard-Blockquotes zu Merke-Boxes
    text = re.sub(
        r'^>\s*(.+?)(?=\n\n|\n>|\Z)',
        r'> Merke: \1',
        text,
        flags=re.MULTILINE | re.DOTALL
    )
    
    return text
