#!/usr/bin/env python3
"""
Test runner for AnkiPlus.

Mocks Anki's aqt/PyQt module tree so tests run without Anki installed.

Usage:
    python3 run_tests.py          # run all tests
    python3 run_tests.py -v       # verbose
    python3 run_tests.py -k text  # only tests matching "text"
"""

import sys
import types
import os
from importlib.machinery import ModuleSpec

os.chdir(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# Universal mock that handles attribute access, calls, iteration, etc.
# ---------------------------------------------------------------------------
class _Mock:
    """Object that accepts any operation without error."""
    def __init__(self, name="mock"):
        self._name = name
    def __repr__(self):
        return f"<Mock {self._name}>"
    def __call__(self, *a, **kw):
        return _Mock(f"{self._name}()")
    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        m = _Mock(f"{self._name}.{name}")
        object.__setattr__(self, name, m)
        return m
    def __bool__(self):
        return False
    def __iter__(self):
        return iter([])
    def __len__(self):
        return 0
    # Support use as base class
    def __init_subclass__(cls, **kw):
        pass
    # Hook-like operations
    def append(self, *a): pass
    def remove(self, *a): pass
    def connect(self, *a): pass
    def disconnect(self, *a): pass
    def emit(self, *a): pass

# Make _Mock usable as a base class for inheritance (class Foo(_Mock): ...)
# by creating a proper metaclass-compatible version
class _MockClass(type):
    """Metaclass that makes mock classes inheritable."""
    def __getattr__(cls, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return _Mock(name)

class MockBase(metaclass=_MockClass):
    """Base class that can be inherited from in mocked code."""
    def __init__(self, *a, **kw):
        pass


class _MockModule(types.ModuleType):
    """Module mock that returns _Mock for any attribute and supports star-import."""

    # Qt class names commonly used via 'from aqt.qt import *'
    _QT_NAMES = [
        "QWidget", "QDialog", "QMainWindow", "QApplication",
        "QTimer", "QAction", "QKeySequence", "QDockWidget",
        "QVBoxLayout", "QHBoxLayout", "QFormLayout", "QGridLayout",
        "QLabel", "QPushButton", "QLineEdit", "QTextEdit", "QPlainTextEdit",
        "QComboBox", "QCheckBox", "QSpinBox", "QSlider", "QProgressBar",
        "QTabWidget", "QGroupBox", "QScrollArea", "QFrame", "QSplitter",
        "QMenu", "QMenuBar", "QToolBar", "QStatusBar", "QSystemTrayIcon",
        "QSizePolicy", "QFont", "QColor", "QPalette", "QPixmap", "QIcon",
        "QUrl", "QSize", "QPoint", "QRect", "QMargins",
        "QObject", "QThread", "QRunnable", "QThreadPool",
        "QEvent", "QShortcut", "QStandardPaths",
        "QWebEngineView", "QWebChannel", "QWebEnginePage",
    ]

    def __init__(self, name):
        super().__init__(name)
        self.__path__ = []
        self.__package__ = name

        # Pre-populate Qt-style modules with inheritable mock classes
        is_qt = any(x in name.lower() for x in ("qt", "core", "widgets", "gui", "webengine", "webchannel"))
        if is_qt:
            for qname in self._QT_NAMES:
                setattr(self, qname, type(qname, (MockBase,), {}))
            # Special cases
            self.Qt = type("Qt", (), {
                "RightDockWidgetArea": 2, "AlignCenter": 0, "AlignLeft": 0,
                "AlignRight": 0, "WindowType": 0, "WidgetAttribute": 0,
                "Horizontal": 1, "Vertical": 2,
            })
            self.pyqtSignal = lambda *a, **kw: _Mock("pyqtSignal")
            self.pyqtSlot = lambda *a, **kw: (lambda f: f)
            self.__all__ = self._QT_NAMES + ["Qt", "pyqtSignal", "pyqtSlot"]

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        # Check for submodule in sys.modules
        submod = f"{self.__name__}.{name}"
        if submod in sys.modules:
            mod = sys.modules[submod]
            object.__setattr__(self, name, mod)
            return mod
        # Return a generic mock
        m = _Mock(f"{self.__name__}.{name}")
        object.__setattr__(self, name, m)
        return m


# ---------------------------------------------------------------------------
# Import finder — intercepts aqt/anki/PyQt imports
# ---------------------------------------------------------------------------
_MOCK_PREFIXES = ("aqt", "anki", "PyQt6", "PyQt5")

class _MockFinder:
    def find_spec(self, fullname, path=None, target=None):
        for prefix in _MOCK_PREFIXES:
            if fullname == prefix or fullname.startswith(prefix + "."):
                return ModuleSpec(fullname, loader=self)
        return None

    def create_module(self, spec):
        if spec.name in sys.modules:
            return sys.modules[spec.name]
        mod = _MockModule(spec.name)
        # Special: aqt.mw = None
        if spec.name == "aqt":
            mod.mw = None
        sys.modules[spec.name] = mod
        # Link to parent module
        parts = spec.name.rsplit(".", 1)
        if len(parts) == 2:
            parent_name, child_name = parts
            if parent_name in sys.modules:
                setattr(sys.modules[parent_name], child_name, mod)
        return mod

    def exec_module(self, module):
        pass


# Install the mock finder
sys.meta_path.insert(0, _MockFinder())

# Pre-create key aqt submodules so 'from aqt import X' works
for submod in ("aqt", "aqt.qt", "aqt.utils", "aqt.gui_hooks",
               "aqt.reviewer", "aqt.webview", "aqt.browser"):
    if submod not in sys.modules:
        finder = sys.meta_path[0]
        spec = finder.find_spec(submod)
        finder.create_module(spec)

# Mock 'requests' if not installed
try:
    import requests
except ImportError:
    sys.modules["requests"] = _MockModule("requests")

# ---------------------------------------------------------------------------
# Prevent pytest from importing the root __init__.py
# ---------------------------------------------------------------------------
# The addon's __init__.py has heavy side-effects (Qt timer creation, Anki
# hook registration, monkey-patching) that cannot run in test mode.
# Register a lightweight stub so pytest's importlib mode never executes it.
_root_pkg = types.ModuleType("AnkiPlus_main")
_root_pkg.__path__ = [os.getcwd()]
_root_pkg.__package__ = "AnkiPlus_main"
_root_pkg.__file__ = os.path.join(os.getcwd(), "__init__.py")
sys.modules["AnkiPlus_main"] = _root_pkg

# ---------------------------------------------------------------------------
# Run pytest
# ---------------------------------------------------------------------------
import pytest
sys.exit(pytest.main([
    "tests/",
    "--import-mode=importlib",
    "--rootdir=.",
    "-p", "no:cacheprovider",
] + sys.argv[1:]))
