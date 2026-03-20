"""
Centralized logging configuration for AnkiPlus.

Usage in any module:
    from utils.logging import get_logger
    logger = get_logger(__name__)

    logger.info("Something happened")
    logger.debug("Detail: %s", detail)
    logger.warning("Something unexpected")
    logger.error("Something failed: %s", err)
    logger.exception("Something failed with traceback")  # auto-includes traceback
"""

import logging
import sys


# ---------------------------------------------------------------------------
# Custom Formatter — clean, aligned, human-readable console output
# ---------------------------------------------------------------------------
class AnkiPlusFormatter(logging.Formatter):
    """
    Output format:
        12:34:56 INFO  [ai.handler]   Request started
        12:34:57 DEBUG [ui.bridge]     fetchImage loading URL...
        12:35:01 WARN  [plusi]         reflect: no query generated
        12:35:02 ERROR [storage]       Database write failed: ...
    """

    LEVEL_NAMES = {
        logging.DEBUG: "DEBUG",
        logging.INFO: "INFO ",
        logging.WARNING: "WARN ",
        logging.ERROR: "ERROR",
        logging.CRITICAL: "CRIT ",
    }

    # Module name display width for alignment
    MODULE_WIDTH = 18

    def format(self, record):
        # Time — HH:MM:SS only (date not needed for console)
        time_str = self.formatTime(record, "%H:%M:%S")

        # Level — fixed width
        level = self.LEVEL_NAMES.get(record.levelno, record.levelname[:5])

        # Module name — shorten the package prefix for readability
        name = record.name
        # Strip common prefix: "AnkiPlus_main." or package dots for cleaner output
        for prefix in ("AnkiPlus_main.", "ankiplus."):
            if name.startswith(prefix):
                name = name[len(prefix):]
                break

        # Pad module name for alignment
        module = f"[{name}]"
        module = module.ljust(self.MODULE_WIDTH)

        # Message
        msg = record.getMessage()

        # Base line
        line = f"{time_str} {level} {module} {msg}"

        # Append traceback if present (logger.exception() or exc_info=True)
        if record.exc_info and record.exc_info[0] is not None:
            if not record.exc_text:
                record.exc_text = self.formatException(record.exc_info)
            line += "\n" + record.exc_text

        return line


# ---------------------------------------------------------------------------
# Logger factory
# ---------------------------------------------------------------------------
_root_logger_configured = False


def _setup_root_logger():
    """Configure the root AnkiPlus logger once."""
    global _root_logger_configured
    if _root_logger_configured:
        return

    root = logging.getLogger("ankiplus")
    root.setLevel(logging.DEBUG)  # Allow everything; handler filters

    # Console handler — stdout (NOT stderr! Anki monitors stderr for addon errors
    # and shows error popups when it detects output there)
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.DEBUG)  # Show everything in dev; change to INFO for production
    handler.setFormatter(AnkiPlusFormatter())

    root.addHandler(handler)

    # Don't propagate to Python's root logger (avoids duplicate output)
    root.propagate = False

    _root_logger_configured = True


def get_logger(name: str) -> logging.Logger:
    """
    Get a named logger for a module.

    Recommended usage:
        logger = get_logger(__name__)

    This creates loggers like:
        ankiplus.ai.handler
        ankiplus.ui.bridge
        ankiplus.plusi.agent
        ankiplus.storage.card_sessions

    The module hierarchy enables filtering:
        logging.getLogger("ankiplus.ai").setLevel(logging.WARNING)
        → silences all DEBUG/INFO from AI modules
    """
    _setup_root_logger()

    # Normalize module name: strip addon package prefix, add our namespace
    clean_name = name
    for prefix in ("AnkiPlus_main.", ""):
        if clean_name.startswith(prefix) and prefix:
            clean_name = clean_name[len(prefix):]
            break

    # Map to our namespace
    logger_name = f"ankiplus.{clean_name}" if clean_name else "ankiplus"

    return logging.getLogger(logger_name)


def set_log_level(level: str = "DEBUG"):
    """
    Set the global log level. Call from config or settings.

    Args:
        level: "DEBUG", "INFO", "WARNING", "ERROR"
    """
    _setup_root_logger()
    numeric = getattr(logging, level.upper(), logging.DEBUG)
    root = logging.getLogger("ankiplus")
    for handler in root.handlers:
        handler.setLevel(numeric)
