"""
UI Manager: Zentrales Management der nativen Anki-UI-Elemente.
Toolbar, Bottom Bar, Splitter — hide/show/restore.

Ansatz: Statt Timer-basiertem Verstecken (Flackern!) patchen wir die show()-Methode
der Widgets, sodass Anki sie gar nicht erst anzeigen kann. Beim Deaktivieren werden
die Original-Methoden wiederhergestellt.
"""

try:
    from aqt import mw
except ImportError:
    mw = None

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# Gespeicherte Original-show()-Methoden für sauberes Restore
_patched_widgets = {}  # widget_id -> original_show_method


def _suppress_widget(web):
    """Patcht show() eines QWidget, sodass es ein No-Op wird. Versteckt sofort."""
    wid = id(web)
    if wid in _patched_widgets:
        return  # Bereits gepatcht
    _patched_widgets[wid] = web.show
    web.show = lambda: None
    web.hide()
    web.setFixedHeight(0)
    web.setMaximumHeight(0)
    web.setMinimumHeight(0)


def _unsuppress_widget(web):
    """Stellt die originale show()-Methode wieder her und zeigt das Widget."""
    wid = id(web)
    orig = _patched_widgets.pop(wid, None)
    if orig:
        web.show = orig
    web.setMaximumHeight(16777215)
    web.setMinimumHeight(0)
    if hasattr(web, 'adjustHeightToFit'):
        web.adjustHeightToFit()
    web.show()


def hide_native_bottom_bar():
    """Unterdrückt die native Anki Bottom Bar (Reviewer) permanent."""
    try:
        if mw and hasattr(mw, 'reviewer') and mw.reviewer:
            if hasattr(mw.reviewer, 'bottom') and mw.reviewer.bottom:
                _suppress_widget(mw.reviewer.bottom.web)
            if hasattr(mw.reviewer, '_bottomWeb') and mw.reviewer._bottomWeb:
                _suppress_widget(mw.reviewer._bottomWeb)
    except Exception as e:
        logger.warning("⚠️ Could not hide native bottom bar: %s", e)


def show_native_bottom_bar():
    """Stellt die native Anki Bottom Bar wieder her."""
    try:
        if mw and hasattr(mw, 'reviewer') and mw.reviewer:
            if hasattr(mw.reviewer, 'bottom') and mw.reviewer.bottom:
                _unsuppress_widget(mw.reviewer.bottom.web)
            if hasattr(mw.reviewer, '_bottomWeb') and mw.reviewer._bottomWeb:
                _unsuppress_widget(mw.reviewer._bottomWeb)
    except Exception as e:
        logger.warning("⚠️ Could not restore native bottom bar: %s", e)


def hide_deckbrowser_bottom():
    """Unterdrückt die DeckBrowser Bottom Bar permanent."""
    try:
        if mw and hasattr(mw, 'deckBrowser') and mw.deckBrowser:
            if hasattr(mw.deckBrowser, 'bottom') and mw.deckBrowser.bottom:
                if hasattr(mw.deckBrowser.bottom, 'web'):
                    _suppress_widget(mw.deckBrowser.bottom.web)
    except Exception as e:
        logger.warning("⚠️ Could not hide deckBrowser bottom: %s", e)


def show_deckbrowser_bottom():
    """Stellt die DeckBrowser Bottom Bar wieder her."""
    try:
        if mw and hasattr(mw, 'deckBrowser') and mw.deckBrowser:
            if hasattr(mw.deckBrowser, 'bottom') and mw.deckBrowser.bottom:
                if hasattr(mw.deckBrowser.bottom, 'web'):
                    _unsuppress_widget(mw.deckBrowser.bottom.web)
    except Exception as e:
        logger.warning("⚠️ Could not restore deckBrowser bottom: %s", e)


def hide_native_toolbar():
    """Unterdrückt die native Anki Toolbar permanent (Immersive Mode).
    WICHTIG: mw.toolbar ist KEIN QWidget, nur mw.toolbar.web ist ein QWidget.
    """
    try:
        if not mw:
            return

        if hasattr(mw, 'toolbar') and mw.toolbar and hasattr(mw.toolbar, 'web'):
            try:
                _suppress_widget(mw.toolbar.web)
            except (RuntimeError, AttributeError) as e:
                logger.warning("⚠️ toolbar.web error: %s", e)

        if hasattr(mw, 'toolbarWeb') and mw.toolbarWeb:
            try:
                _suppress_widget(mw.toolbarWeb)
            except (RuntimeError, AttributeError) as e:
                logger.warning("⚠️ toolbarWeb error: %s", e)

    except Exception as e:
        logger.warning("⚠️ Could not hide native toolbar: %s", e)


def show_native_toolbar():
    """Stellt die native Anki Toolbar wieder her."""
    try:
        if not mw:
            return

        if hasattr(mw, 'toolbar') and mw.toolbar and hasattr(mw.toolbar, 'web'):
            try:
                _unsuppress_widget(mw.toolbar.web)
            except (RuntimeError, AttributeError) as e:
                logger.warning("⚠️ toolbar.web restore error: %s", e)

        if hasattr(mw, 'toolbarWeb') and mw.toolbarWeb:
            try:
                _unsuppress_widget(mw.toolbarWeb)
            except (RuntimeError, AttributeError) as e:
                logger.warning("⚠️ toolbarWeb restore error: %s", e)

    except Exception as e:
        logger.warning("⚠️ Could not restore native toolbar: %s", e)


def unsuppress_all():
    """Stellt alle gepatchten Widgets wieder her. Für Profile-Wechsel / Cleanup."""
    for wid, orig_show in list(_patched_widgets.items()):
        # Widget-Objekt ist nicht mehr direkt erreichbar über die ID,
        # daher räumen wir nur das Dict auf. Die show/hide-Funktionen
        # oben werden beim Restore explizit aufgerufen.
        pass
    _patched_widgets.clear()


def hide_native_top_separator():
    """Kompatibilitäts-Stub — Hauptarbeit macht hide_native_toolbar()."""
    pass


def show_native_top_separator():
    """Kompatibilitäts-Stub — Hauptarbeit macht show_native_toolbar()."""
    pass


def hide_splitter_visuals():
    """Macht den Resize-Handle zwischen Hauptfenster und Chat-Panel unsichtbar (Ghost Handle)."""
    if mw is None:
        return

    try:
        style = """
        QMainWindow::separator {
            background: rgba(255, 255, 255, 0.04);
            width: 1px !important;
            height: 1px !important;
            border: none;
            margin: 0px;
            padding: 0px;
        }
        QMainWindow::separator:hover {
            background: rgba(255, 255, 255, 0.08);
            width: 1px !important;
        }
        QSplitter::handle {
            background: rgba(255, 255, 255, 0.04);
            width: 1px !important;
            border: none;
            margin: 0px;
            padding: 0px;
        }
        QSplitter::handle:hover {
            background: rgba(255, 255, 255, 0.08);
            width: 1px !important;
        }
        """
        current_style = mw.styleSheet()
        mw.setStyleSheet(current_style + style)
    except Exception as e:
        logger.warning("⚠️ Fehler beim Verstecken des Splitters: %s", e)


def focus_reviewer_webview():
    """Force focus back to the reviewer webview so keyboard shortcuts work."""
    try:
        if mw and hasattr(mw, 'reviewer') and mw.reviewer and hasattr(mw.reviewer, 'web'):
            web = mw.reviewer.web
            if web and hasattr(web, 'setFocus'):
                web.setFocus()
                web.eval('document.body.focus(); window.focus();')
    except Exception as e:
        logger.warning("⚠️ Could not focus reviewer webview: %s", e)
