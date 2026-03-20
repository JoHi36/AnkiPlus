"""Tests for utils/text.py — HTML cleaning and image extraction."""

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
