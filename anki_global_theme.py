"""
Globales Anki-Theming
Styled ALLE Anki-Komponenten über Qt
"""

from aqt import mw, gui_hooks
from aqt.qt import QTimer

def apply_global_dark_theme():
    """Wendet ein globales dunkles Theme auf ALLE Anki-Komponenten an"""
    if not mw:
        return
    
    # Ultra-aggressives Qt-Stylesheet für ALLES
    global_stylesheet = """
    /* ============================================
       GLOBAL: Alle Widgets
       ============================================ */
    
    QWidget {
        background-color: #1A1A1A;
        color: rgba(255, 255, 255, 0.9);
    }
    
    QMainWindow {
        background-color: #1A1A1A;
    }
    
    /* ============================================
       TOOLBAR (oben) - ULTRA AGGRESSIV
       ============================================ */
    
    QToolBar,
    QToolBar *,
    QMainWindow QToolBar,
    QMainWindow QToolBar * {
        background-color: #1A1A1A;
        background: #1A1A1A;
        border: none;
        spacing: 3px;
        padding: 4px;
    }
    
    QToolButton,
    QToolBar QToolButton,
    QMainWindow QToolBar QToolButton {
        background-color: rgba(255, 255, 255, 0.05);
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 4px;
        padding: 4px 8px;
        color: rgba(255, 255, 255, 0.9);
    }
    
    QToolButton:hover,
    QToolBar QToolButton:hover {
        background-color: rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.15);
    }
    
    /* ============================================
       MENUBAR (ganz oben)
       ============================================ */
    
    QMenuBar {
        background-color: #1A1A1A;
        color: rgba(255, 255, 255, 0.9);
        border: none;
    }
    
    QMenuBar::item {
        background-color: transparent;
        padding: 4px 12px;
    }
    
    QMenuBar::item:selected {
        background-color: rgba(255, 255, 255, 0.1);
    }
    
    QMenu {
        background-color: #1A1A1A;
        color: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    QMenu::item:selected {
        background-color: rgba(255, 255, 255, 0.1);
    }
    
    /* ============================================
       STATUSBAR (unten)
       ============================================ */
    
    QStatusBar {
        background-color: #1A1A1A;
        color: rgba(255, 255, 255, 0.7);
        border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    /* ============================================
       BUTTONS (alle)
       ============================================ */
    
    QPushButton {
        background-color: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 6px;
        padding: 6px 16px;
        color: rgba(255, 255, 255, 0.95);
        font-weight: 500;
    }
    
    QPushButton:hover {
        background-color: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.18);
    }
    
    QPushButton:pressed {
        background-color: rgba(255, 255, 255, 0.06);
    }
    
    /* ============================================
       SPLITTER (Resize-Handles)
       ============================================ */
    
    QSplitter::handle {
        background-color: rgba(255, 255, 255, 0.01);
    }
    
    QSplitter::handle:hover {
        background-color: rgba(255, 255, 255, 0.03);
    }
    
    QMainWindow::separator {
        background: rgba(255, 255, 255, 0.01);
        width: 1px;
        height: 1px;
    }
    
    QMainWindow::separator:hover {
        background: rgba(255, 255, 255, 0.03);
    }
    
    /* ============================================
       DOCK WIDGETS
       ============================================ */
    
    QDockWidget {
        background-color: #1A1A1A;
        color: rgba(255, 255, 255, 0.9);
        titlebar-close-icon: none;
        titlebar-normal-icon: none;
    }
    
    QDockWidget::title {
        background-color: rgba(255, 255, 255, 0.03);
        padding: 8px;
    }
    
    /* ============================================
       SCROLLBARS
       ============================================ */
    
    QScrollBar:vertical {
        background: #1A1A1A;
        width: 8px;
        margin: 0;
    }
    
    QScrollBar::handle:vertical {
        background: rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        min-height: 20px;
    }
    
    QScrollBar::handle:vertical:hover {
        background: rgba(255, 255, 255, 0.25);
    }
    
    QScrollBar::add-line:vertical,
    QScrollBar::sub-line:vertical {
        height: 0px;
    }
    
    QScrollBar:horizontal {
        background: #1A1A1A;
        height: 8px;
        margin: 0;
    }
    
    QScrollBar::handle:horizontal {
        background: rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        min-width: 20px;
    }
    
    QScrollBar::handle:horizontal:hover {
        background: rgba(255, 255, 255, 0.25);
    }
    
    /* ============================================
       INPUT FIELDS
       ============================================ */
    
    QLineEdit, QTextEdit, QPlainTextEdit {
        background-color: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        padding: 6px;
        color: rgba(255, 255, 255, 0.95);
    }
    
    QLineEdit:focus, QTextEdit:focus, QPlainTextEdit:focus {
        border-color: rgba(20, 184, 166, 0.5);
        background-color: rgba(255, 255, 255, 0.08);
    }
    
    /* ============================================
       TABLES & LISTS
       ============================================ */
    
    QTableWidget, QListWidget, QTreeWidget {
        background-color: #1A1A1A;
        alternate-background-color: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.9);
    }
    
    QHeaderView::section {
        background-color: rgba(255, 255, 255, 0.05);
        border: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding: 6px;
        color: rgba(255, 255, 255, 0.9);
    }
    
    /* ============================================
       TABS
       ============================================ */
    
    QTabWidget::pane {
        background-color: #1A1A1A;
        border: 1px solid rgba(255, 255, 255, 0.08);
    }
    
    QTabBar::tab {
        background-color: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        padding: 6px 12px;
        color: rgba(255, 255, 255, 0.7);
    }
    
    QTabBar::tab:selected {
        background-color: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.95);
    }
    
    QTabBar::tab:hover {
        background-color: rgba(255, 255, 255, 0.06);
    }
    """
    
    try:
        # Setze Stylesheet auf Main Window
        mw.setStyleSheet(global_stylesheet)
        print("✅ Globales Dark Theme angewendet")
        
        # AGGRESSIV: Finde und style ALLE Widgets, besonders Toolbar
        from aqt.qt import QToolBar, QMenuBar, QStatusBar, QWidget, QPalette, QColor
        
        # 1. Alle Toolbars - DIREKT über Palette (höchste Priorität)
        for toolbar in mw.findChildren(QToolBar):
            toolbar.setStyleSheet(global_stylesheet)
            # Zusätzlich: Direktes Palette-Styling
            palette = toolbar.palette()
            palette.setColor(toolbar.backgroundRole(), QColor("#1A1A1A"))
            palette.setColor(toolbar.foregroundRole(), QColor("rgba(255, 255, 255, 0.9)"))
            toolbar.setPalette(palette)
            toolbar.setAutoFillBackground(True)  # WICHTIG: Aktiviert Background-Fill
            print(f"  ✅ Toolbar gestylt: {toolbar.objectName()}")
        
        # 2. Alle MenuBars
        for menubar in mw.findChildren(QMenuBar):
            menubar.setStyleSheet(global_stylesheet)
            palette = menubar.palette()
            palette.setColor(menubar.backgroundRole(), QColor("#1A1A1A"))
            menubar.setPalette(palette)
            menubar.setAutoFillBackground(True)
            print(f"  ✅ MenuBar gestylt: {menubar.objectName()}")
        
        # 3. Alle StatusBars
        for statusbar in mw.findChildren(QStatusBar):
            statusbar.setStyleSheet(global_stylesheet)
            palette = statusbar.palette()
            palette.setColor(statusbar.backgroundRole(), QColor("#1A1A1A"))
            statusbar.setPalette(palette)
            statusbar.setAutoFillBackground(True)
            print(f"  ✅ StatusBar gestylt: {statusbar.objectName()}")
        
        # 4. Alle anderen Widgets
        for widget in mw.findChildren(QWidget):
            try:
                # Überschreibe IMMER (auch wenn schon Stylesheet vorhanden)
                widget.setStyleSheet(global_stylesheet)
                # Zusätzlich Palette für kritische Widgets
                if widget.objectName() in ['', 'toolbar', 'menubar', 'statusbar']:
                    palette = widget.palette()
                    palette.setColor(widget.backgroundRole(), QColor("#1A1A1A"))
                    widget.setPalette(palette)
                    widget.setAutoFillBackground(True)
            except:
                pass
                
    except Exception as e:
        print(f"❌ Fehler beim Anwenden des Themes: {e}")
        import traceback
        traceback.print_exc()

def on_webview_will_set_content(web_content, context):
    """Hook: Wird aufgerufen, bevor Content in ein WebView geladen wird"""
    # Füge CSS für WebViews hinzu
    web_content.head += """
    <style>
    html, body {
        background-color: #1A1A1A !important;
        color: rgba(255, 255, 255, 0.9) !important;
    }
    </style>
    """

def on_state_change(new_state, old_state):
    """Hook: Wird bei jedem State-Change aufgerufen (z.B. Deck Browser → Reviewer)"""
    # Theme neu anwenden, da Anki Widgets neu lädt
    QTimer.singleShot(100, apply_global_dark_theme)
    QTimer.singleShot(300, apply_global_dark_theme)
    print(f"🔄 State Change: {old_state} → {new_state}, Theme wird neu angewendet")

def setup_global_theme():
    """Initialisiert das globale Theme"""
    # Sofort anwenden
    apply_global_dark_theme()
    
    # Und nach kurzer Verzögerung nochmal (für dynamisch geladene Widgets)
    QTimer.singleShot(500, apply_global_dark_theme)
    QTimer.singleShot(1000, apply_global_dark_theme)
    QTimer.singleShot(2000, apply_global_dark_theme)  # Extra für langsame Systeme
    
    # Hook für WebView-Content
    try:
        gui_hooks.webview_will_set_content.append(on_webview_will_set_content)
    except:
        pass
    
    # Hook für State-Changes (wichtig!)
    try:
        gui_hooks.state_did_change.append(on_state_change)
    except:
        pass
    
    print("✅ Global Theme Setup abgeschlossen")
