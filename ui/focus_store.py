"""Focus persistence — save/load/delete focuses in config.json."""

import time
import json

try:
    from ..utils.logging import get_logger
    from ..config import get_config, save_config
except ImportError:
    from utils.logging import get_logger
    from config import get_config, save_config

logger = get_logger(__name__)

MAX_FOCUSES = 5

FOCUS_COLORS = [
    [74, 222, 128],
    [96, 165, 250],
    [251, 191, 36],
    [168, 85, 247],
    [248, 113, 113],
]


def get_focuses():
    config = get_config(force_reload=True)
    focuses = config.get("focuses", [])
    return [f for f in focuses if not f.get("archived", False)]


def save_focus(focus_data):
    config = get_config(force_reload=True)
    focuses = config.get("focuses", [])
    active = [f for f in focuses if not f.get("archived", False)]

    if len(active) >= MAX_FOCUSES:
        return {"error": "Maximum %s focuses reached" % MAX_FOCUSES}

    existing_deck_ids = set()
    for f in active:
        for did in f.get("deckIds", []):
            existing_deck_ids.add(did)

    for did in focus_data.get("deckIds", []):
        if did in existing_deck_ids:
            return {"error": "Deck %s is already in another focus" % did}

    used_colors = {f.get("colorIndex", 0) for f in active}
    color_index = 0
    for i in range(len(FOCUS_COLORS)):
        if i not in used_colors:
            color_index = i
            break

    focus = {
        "id": "focus_%d" % int(time.time()),
        "deckIds": focus_data.get("deckIds", []),
        "deckNames": focus_data.get("deckNames", []),
        "deadline": focus_data.get("deadline", ""),
        "colorIndex": color_index,
        "createdAt": time.strftime("%Y-%m-%d"),
        "archived": False,
    }

    focuses.append(focus)
    config["focuses"] = focuses
    save_config(config)
    logger.info("Saved focus %s with %s decks, deadline %s",
                focus["id"], len(focus["deckIds"]), focus["deadline"])
    return focus


def delete_focus(focus_id):
    config = get_config(force_reload=True)
    focuses = config.get("focuses", [])
    found = False
    for f in focuses:
        if f.get("id") == focus_id:
            f["archived"] = True
            found = True
            break
    if found:
        config["focuses"] = focuses
        save_config(config)
        logger.info("Archived focus %s", focus_id)
        return {"success": True}
    return {"error": "Focus not found"}
