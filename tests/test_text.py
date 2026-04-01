"""Tests for utils/text.py — HTML cleaning and image extraction."""

import os

from utils.text import clean_html, extract_images_from_html, clean_html_with_images


class TestCleanHtml:
    def test_removes_tags(self):
        assert "Hallo Welt" == clean_html("<b>Hallo</b> <i>Welt</i>")

    def test_empty_input(self):
        assert clean_html("") == ""
        assert clean_html(None) == ""

    def test_plain_text_unchanged(self):
        assert clean_html("Keine Tags hier") == "Keine Tags hier"

    def test_removes_html_entities(self):
        result = clean_html("Hallo&nbsp;Welt&amp;mehr")
        assert "&" not in result
        assert "nbsp" not in result

    def test_collapses_whitespace(self):
        result = clean_html("<p>Hallo</p>   <p>Welt</p>")
        assert "  " not in result

    def test_truncates_at_max_len(self):
        long_text = "A" * 2000
        result = clean_html(long_text, max_len=100)
        assert result == "A" * 100 + "..."

    def test_no_truncation_when_short(self):
        result = clean_html("Kurz", max_len=1500)
        assert result == "Kurz"
        assert "..." not in result

    def test_custom_max_len(self):
        text = "B" * 50
        result = clean_html(text, max_len=20)
        assert len(result) == 23  # 20 + "..."

    def test_nested_tags(self):
        result = clean_html("<div><p><span>Tief</span></p></div>")
        assert "Tief" in result
        assert "<" not in result


class TestExtractImages:
    def test_extracts_single_image(self):
        html = '<img src="http://example.com/bild.png">'
        assert extract_images_from_html(html) == ["http://example.com/bild.png"]

    def test_extracts_multiple_images(self):
        html = '<img src="a.jpg"><p>text</p><img src="b.png">'
        assert extract_images_from_html(html) == ["a.jpg", "b.png"]

    def test_single_quotes(self):
        html = "<img src='photo.webp'>"
        assert extract_images_from_html(html) == ["photo.webp"]

    def test_empty_input(self):
        assert extract_images_from_html("") == []
        assert extract_images_from_html(None) == []

    def test_no_images(self):
        assert extract_images_from_html("<p>Kein Bild</p>") == []

    def test_case_insensitive(self):
        html = '<IMG SRC="bild.jpg">'
        assert extract_images_from_html(html) == ["bild.jpg"]


class TestCleanHtmlWithImages:
    def test_returns_tuple(self):
        result = clean_html_with_images('<img src="a.jpg">Text')
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_extracts_both(self):
        html = '<p>Hallo</p><img src="foto.png">'
        text, images = clean_html_with_images(html)
        assert "Hallo" in text
        assert "<" not in text
        assert images == ["foto.png"]

    def test_empty_input(self):
        text, images = clean_html_with_images("")
        assert text == ""
        assert images == []

    def test_none_input(self):
        text, images = clean_html_with_images(None)
        assert text == ""
        assert images == []


class TestExtractImagesFiltering:
    """Tests for extract_images_from_html and the filtering logic used by getCardImages."""

    def test_skips_http_urls(self):
        html = '<img src="http://example.com/pic.png"><img src="local.jpg">'
        results = extract_images_from_html(html)
        assert "http://example.com/pic.png" in results
        assert "local.jpg" in results

    def test_extracts_anki_media_filenames(self):
        html = '<img src="anatomy_forearm.jpg"><img src="schema-2.png">'
        results = extract_images_from_html(html)
        assert results == ["anatomy_forearm.jpg", "schema-2.png"]

    def test_handles_mixed_quotes_and_attrs(self):
        html = '''<img class="big" src="a.jpg" width="200"><img src='b.png'>'''
        results = extract_images_from_html(html)
        assert results == ["a.jpg", "b.png"]


class TestImageDeduplication:
    """Tests for the dedup + URL-filtering logic that _msg_get_card_images uses."""

    def _filter_and_dedup(self, fields_by_card):
        """Simulate the dedup logic from _msg_get_card_images."""
        seen = {}
        for cid, fields in fields_by_card.items():
            for field in fields:
                for raw_src in extract_images_from_html(field):
                    if raw_src.startswith(('http://', 'https://', 'file://', '/')):
                        continue
                    filename = os.path.basename(raw_src)
                    if not filename:
                        continue
                    if filename not in seen:
                        seen[filename] = {"filename": filename, "cardIds": []}
                    if cid not in seen[filename]["cardIds"]:
                        seen[filename]["cardIds"].append(cid)
        return seen

    def test_deduplicates_same_image_across_cards(self):
        fields = {
            1: ['<img src="anatomy.jpg">'],
            2: ['<img src="anatomy.jpg">'],
            3: ['<img src="other.png">'],
        }
        result = self._filter_and_dedup(fields)
        assert len(result) == 2
        assert result["anatomy.jpg"]["cardIds"] == [1, 2]
        assert result["other.png"]["cardIds"] == [3]

    def test_filters_remote_urls(self):
        fields = {
            1: ['<img src="http://example.com/pic.png"><img src="local.jpg">'],
        }
        result = self._filter_and_dedup(fields)
        assert "pic.png" not in result
        assert "local.jpg" in result

    def test_filters_absolute_paths(self):
        fields = {
            1: ['<img src="/usr/share/pic.png"><img src="relative.jpg">'],
        }
        result = self._filter_and_dedup(fields)
        assert "pic.png" not in result
        assert "relative.jpg" in result

    def test_normalizes_basename(self):
        fields = {
            1: ['<img src="subdir/image.jpg">'],
        }
        result = self._filter_and_dedup(fields)
        assert "image.jpg" in result

    def test_multiple_images_per_card(self):
        fields = {
            1: ['<img src="a.jpg"><img src="b.png">'],
        }
        result = self._filter_and_dedup(fields)
        assert len(result) == 2
        assert result["a.jpg"]["cardIds"] == [1]
        assert result["b.png"]["cardIds"] == [1]

    def test_empty_fields(self):
        fields = {1: ['<p>No images here</p>']}
        result = self._filter_and_dedup(fields)
        assert len(result) == 0
