"""
Statistics data bridge functions for the StatistikView.
Queries Anki's revlog to compute trajectory, daily breakdown, year heatmap,
and time-of-day distributions.
"""

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

# Anki day rollover hour (04:00 local time)
_DAY_ROLLOVER_HOUR = 4


def _compute_daily_mature_pct(revlog_rows, dates, total_cards):
    """Reconstruct daily mastery from review history using continuous weighting.

    Each card contributes min(1.0, max(0, interval) / 21) instead of a binary
    mature/young classification.

    Args:
        revlog_rows: list of (card_id, date_str, interval) tuples from revlog.
        dates: ordered list of date strings to compute pct for.
        total_cards: total card count in collection.

    Returns:
        list of floats — one mastery percentage per date.
    """
    if total_cards == 0 or not dates:
        return [0.0] * len(dates)

    card_intervals = {}
    from collections import defaultdict
    reviews_by_date = defaultdict(list)
    for card_id, date_str, interval in revlog_rows:
        reviews_by_date[date_str].append((card_id, interval))

    result = []
    for d in dates:
        for card_id, interval in reviews_by_date.get(d, []):
            card_intervals[card_id] = interval
        weighted = sum(min(1.0, max(0, ivl) / 21) for ivl in card_intervals.values())
        pct = round(weighted / total_cards * 100, 1)
        result.append(pct)

    return result


def get_trajectory_data():
    """Daily progress for the last 180 days.

    Returns:
        dict with keys:
          - days: list of 180 dicts [{date, mature_pct, review_count, new_count}]
          - current_pct: float — (mature + young*0.5) / total cards
          - avg_new_7d: float — 7-day rolling average of new cards learned
    """
    try:
        from ..utils.anki import run_on_main_thread
    except ImportError:
        from utils.anki import run_on_main_thread

    def _collect():
        from aqt import mw
        from datetime import date, timedelta, datetime

        if mw is None or mw.col is None:
            return {"error": "No collection"}

        today = date.today()
        days_back = 180

        # Build per-day stats from revlog
        # revlog.id is epoch ms; rollover at 04:00 means day boundary shifts by 4h
        rollover_offset_ms = _DAY_ROLLOVER_HOUR * 3600 * 1000

        rows = mw.col.db.all(
            "SELECT id, type FROM revlog WHERE id >= ?",
            (int((datetime.combine(today - timedelta(days=days_back), datetime.min.time()).timestamp()) * 1000
                 - rollover_offset_ms),)
        )

        # Bucket by calendar day (shifted by rollover)
        from collections import defaultdict
        day_reviews = defaultdict(int)   # date_str → total reviews
        day_new = defaultdict(int)       # date_str → new-card reviews (type == 0)

        for rev_id, rev_type in rows:
            shifted_ms = rev_id - rollover_offset_ms
            shifted_s = shifted_ms / 1000
            day_str = date.fromtimestamp(shifted_s).isoformat()
            day_reviews[day_str] += 1
            if rev_type == 0:
                day_new[day_str] += 1

        # Build ordered list
        days_data = []
        date_strings = []
        new_counts_last_7 = []
        for i in range(days_back - 1, -1, -1):
            d = today - timedelta(days=i)
            d_str = d.isoformat()
            rev_count = day_reviews.get(d_str, 0)
            n_count = day_new.get(d_str, 0)
            days_data.append({
                "date": d_str,
                "review_count": rev_count,
                "new_count": n_count,
            })
            date_strings.append(d_str)
            if i < 7:
                new_counts_last_7.append(n_count)

        avg_new_7d = round(sum(new_counts_last_7) / max(len(new_counts_last_7), 1), 1)

        # Current mastery using retrieval probability
        try:
            from .retrieval import compute_deck_mastery
        except ImportError:
            from ui.retrieval import compute_deck_mastery

        try:
            fsrs_enabled = False
            try:
                fsrs_enabled = mw.col.get_config("fsrs", False)
            except Exception:
                pass

            today_dn = mw.col.sched.today
            card_rows = mw.col.db.all(
                "SELECT ivl, due, queue, data FROM cards"
            )
            current_pct = compute_deck_mastery(card_rows, today_dn, fsrs_enabled)
            total = len(card_rows)
            mature = sum(1 for ivl, _, q, _ in card_rows if ivl >= 21 and q >= 0)
            young = sum(1 for ivl, _, q, _ in card_rows if 0 < ivl < 21 and q >= 0)
        except Exception as e:
            logger.warning("get_trajectory_data: mastery query failed: %s", e)
            current_pct = 0.0
            total = 0
            mature = 0
            young = 0

        # Reconstruct daily mature_pct from revlog intervals
        try:
            ivl_rows = mw.col.db.all(
                "SELECT cid, date(id/1000 - ?, 'unixepoch', 'localtime'), ivl "
                "FROM revlog WHERE id >= ? ORDER BY id",
                _DAY_ROLLOVER_HOUR * 3600,
                int((datetime.combine(today - timedelta(days=days_back),
                     datetime.min.time()).timestamp()) * 1000
                    - _DAY_ROLLOVER_HOUR * 3600 * 1000),
            )
            daily_pcts = _compute_daily_mature_pct(ivl_rows, date_strings, total)
            for entry, pct in zip(days_data, daily_pcts):
                entry["mature_pct"] = pct
        except Exception as e:
            logger.warning("get_trajectory_data: mature_pct reconstruction failed: %s", e)
            for entry in days_data:
                entry["mature_pct"] = 0.0

        return {
            "days": days_data,
            "current_pct": current_pct,
            "avg_new_7d": avg_new_7d,
            "total_cards": total,
            "mature_cards": mature,
            "young_cards": young,
        }

    try:
        return run_on_main_thread(_collect, timeout=9)
    except Exception as e:
        logger.exception("get_trajectory_data failed: %s", e)
        return {"error": str(e)}


def _sql_in(ids):
    """Build a SQL IN clause string from a collection of IDs."""
    if not ids:
        return "(0)"
    return "(%s)" % ",".join(str(int(i)) for i in ids)


def get_deck_trajectory(deck_id_str):
    """Daily progress for the last 180 days, scoped to a single deck.

    Same structure as get_trajectory_data() but filtered to cards in the
    given deck (including child decks via name prefix matching).

    Args:
        deck_id_str: deck ID as string.

    Returns:
        dict with keys:
          - days: list of 180 dicts [{date, mature_pct, review_count, new_count}]
          - current_pct: float
          - avg_new_7d: float
          - total_cards, mature_cards, young_cards: int
    """
    try:
        from ..utils.anki import run_on_main_thread
    except ImportError:
        from utils.anki import run_on_main_thread

    def _collect():
        from aqt import mw
        from datetime import date, timedelta, datetime

        if mw is None or mw.col is None:
            return {"error": "No collection"}

        try:
            deck_id = int(deck_id_str)
        except (ValueError, TypeError):
            return {"error": "Invalid deck_id"}

        # Resolve deck name for child-deck matching
        deck = mw.col.decks.get(deck_id)
        if deck is None:
            return {"error": "Deck not found"}
        deck_name = deck["name"]

        # Collect this deck + all child deck IDs by name prefix
        all_decks = mw.col.decks.all()
        prefix = deck_name + "::"
        all_dids = [deck_id]
        for d in all_decks:
            if d["name"].startswith(prefix):
                all_dids.append(d["id"])

        # Get all card IDs in these decks
        all_card_ids = set(mw.col.db.list(
            "SELECT id FROM cards WHERE did IN " + _sql_in(all_dids)
        ))

        total = len(all_card_ids)
        if total == 0:
            empty_days = []
            today = date.today()
            for i in range(179, -1, -1):
                d = today - timedelta(days=i)
                empty_days.append({
                    "date": d.isoformat(),
                    "mature_pct": 0.0,
                    "review_count": 0,
                    "new_count": 0,
                })
            return {
                "days": empty_days,
                "current_pct": 0.0,
                "avg_new_7d": 0.0,
                "total_cards": 0,
                "mature_cards": 0,
                "young_cards": 0,
            }

        card_in_clause = _sql_in(all_card_ids)

        today = date.today()
        days_back = 180
        rollover_offset_ms = _DAY_ROLLOVER_HOUR * 3600 * 1000

        rows = mw.col.db.all(
            "SELECT r.id, r.type FROM revlog r WHERE r.cid IN %s AND r.id >= ?"
            % card_in_clause,
            int((datetime.combine(today - timedelta(days=days_back),
                 datetime.min.time()).timestamp()) * 1000
                - rollover_offset_ms),
        )

        from collections import defaultdict
        day_reviews = defaultdict(int)
        day_new = defaultdict(int)

        for rev_id, rev_type in rows:
            shifted_ms = rev_id - rollover_offset_ms
            shifted_s = shifted_ms / 1000
            day_str = date.fromtimestamp(shifted_s).isoformat()
            day_reviews[day_str] += 1
            if rev_type == 0:
                day_new[day_str] += 1

        days_data = []
        date_strings = []
        new_counts_last_7 = []
        for i in range(days_back - 1, -1, -1):
            d = today - timedelta(days=i)
            d_str = d.isoformat()
            rev_count = day_reviews.get(d_str, 0)
            n_count = day_new.get(d_str, 0)
            days_data.append({
                "date": d_str,
                "review_count": rev_count,
                "new_count": n_count,
            })
            date_strings.append(d_str)
            if i < 7:
                new_counts_last_7.append(n_count)

        avg_new_7d = round(sum(new_counts_last_7) / max(len(new_counts_last_7), 1), 1)

        # Current mastery using retrieval probability
        try:
            from .retrieval import compute_deck_mastery
        except ImportError:
            from ui.retrieval import compute_deck_mastery

        try:
            fsrs_enabled = False
            try:
                fsrs_enabled = mw.col.get_config("fsrs", False)
            except Exception:
                pass

            today_dn = mw.col.sched.today
            card_rows = mw.col.db.all(
                "SELECT ivl, due, queue, data FROM cards WHERE id IN %s"
                % card_in_clause
            )
            current_pct = compute_deck_mastery(card_rows, today_dn, fsrs_enabled)
            mature = sum(1 for ivl, _, q, _ in card_rows if ivl >= 21 and q >= 0)
            young = sum(1 for ivl, _, q, _ in card_rows if 0 < ivl < 21 and q >= 0)
        except Exception as e:
            logger.warning("get_deck_trajectory: mastery query failed: %s", e)
            current_pct = 0.0
            mature = 0
            young = 0

        # Reconstruct daily mature_pct from revlog intervals
        try:
            ivl_rows = mw.col.db.all(
                "SELECT r.cid, date(r.id/1000 - ?, 'unixepoch', 'localtime'), r.ivl "
                "FROM revlog r WHERE r.cid IN %s AND r.id >= ? ORDER BY r.id"
                % card_in_clause,
                _DAY_ROLLOVER_HOUR * 3600,
                int((datetime.combine(today - timedelta(days=days_back),
                     datetime.min.time()).timestamp()) * 1000
                    - _DAY_ROLLOVER_HOUR * 3600 * 1000),
            )
            daily_pcts = _compute_daily_mature_pct(ivl_rows, date_strings, total)
            for entry, pct in zip(days_data, daily_pcts):
                entry["mature_pct"] = pct
        except Exception as e:
            logger.warning("get_deck_trajectory: mature_pct reconstruction failed: %s", e)
            for entry in days_data:
                entry["mature_pct"] = 0.0

        return {
            "days": days_data,
            "current_pct": current_pct,
            "avg_new_7d": avg_new_7d,
            "total_cards": total,
            "mature_cards": mature,
            "young_cards": young,
        }

    try:
        return run_on_main_thread(_collect, timeout=9)
    except Exception as e:
        logger.exception("get_deck_trajectory failed: %s", e)
        return {"error": str(e)}


def get_daily_breakdown():
    """Today's reviews split by card type, plus remaining due count.

    Returns:
        dict with keys:
          - new: int — cards reviewed today with type 0 (learn/new)
          - young: int — cards reviewed today with type 1 (review, interval < 21)
          - mature: int — cards reviewed today with type 2+ (relearn / review, interval >= 21)
          - due: int — cards currently due (remaining)
          - total_today: int — total reviews done today
    """
    try:
        from ..utils.anki import run_on_main_thread
    except ImportError:
        from utils.anki import run_on_main_thread

    def _collect():
        from aqt import mw
        from datetime import date, datetime, timedelta

        if mw is None or mw.col is None:
            return {"error": "No collection"}

        today = date.today()
        rollover_offset_ms = _DAY_ROLLOVER_HOUR * 3600 * 1000

        # Day start in ms (shifted by rollover)
        day_start_ms = int(datetime.combine(today, datetime.min.time()).timestamp() * 1000) - rollover_offset_ms
        day_end_ms = day_start_ms + 86400 * 1000

        rows = mw.col.db.all(
            "SELECT r.type, c.ivl FROM revlog r "
            "LEFT JOIN cards c ON r.cid = c.id "
            "WHERE r.id >= ? AND r.id < ?",
            day_start_ms, day_end_ms
        )

        new_count = 0
        young_count = 0
        mature_count = 0

        for rev_type, ivl in rows:
            ivl = ivl or 0
            if rev_type == 0:
                new_count += 1
            elif rev_type == 1:
                # review — split by interval
                if ivl >= 21:
                    mature_count += 1
                else:
                    young_count += 1
            else:
                # relearn (type 2) or other — treat as mature touch
                mature_count += 1

        total_today = new_count + young_count + mature_count

        # Due count: new + review + relearn due today
        try:
            due_count = mw.col.db.scalar(
                "SELECT COUNT(*) FROM cards WHERE queue IN (0, 1, 2, 3) AND due <= ?",
                mw.col.sched.today
            ) or 0
        except Exception:
            try:
                due_count = mw.col.db.scalar(
                    "SELECT COUNT(*) FROM cards WHERE queue IN (0, 1, 2, 3)"
                ) or 0
            except Exception:
                due_count = 0

        return {
            "new": new_count,
            "young": young_count,
            "mature": mature_count,
            "due": due_count,
            "total_today": total_today,
        }

    try:
        return run_on_main_thread(_collect, timeout=9)
    except Exception as e:
        logger.exception("get_daily_breakdown failed: %s", e)
        return {"error": str(e)}


def get_year_heatmap():
    """365 days of review counts as levels 0-4 (quantile-based), with streak info.

    Returns:
        dict with keys:
          - days: list of 365 dicts [{date, count, level}]
          - streak: int — current streak in days
          - best_streak: int — longest streak ever
          - is_record: bool — current streak equals best
    """
    try:
        from ..utils.anki import run_on_main_thread
    except ImportError:
        from utils.anki import run_on_main_thread

    def _collect():
        from aqt import mw
        from datetime import date, datetime, timedelta

        if mw is None or mw.col is None:
            return {"error": "No collection"}

        today = date.today()
        rollover_offset_ms = _DAY_ROLLOVER_HOUR * 3600 * 1000
        days_back = 365

        start_ms = (
            int(datetime.combine(today - timedelta(days=days_back - 1), datetime.min.time()).timestamp() * 1000)
            - rollover_offset_ms
        )

        rows = mw.col.db.all(
            "SELECT id FROM revlog WHERE id >= ?", start_ms
        )

        from collections import defaultdict
        day_counts = defaultdict(int)
        for (rev_id,) in rows:
            shifted_ms = rev_id - rollover_offset_ms
            day_str = date.fromtimestamp(shifted_ms / 1000).isoformat()
            day_counts[day_str] += 1

        # Build ordered list for last 365 days
        counts = []
        days_data = []
        for i in range(days_back - 1, -1, -1):
            d = today - timedelta(days=i)
            d_str = d.isoformat()
            c = day_counts.get(d_str, 0)
            counts.append(c)
            days_data.append({"date": d_str, "count": c, "level": 0})

        # Quantile-based levels on non-zero days
        non_zero = sorted(c for c in counts if c > 0)
        if non_zero:
            def _quantile(data, q):
                idx = int(len(data) * q)
                return data[min(idx, len(data) - 1)]

            q25 = _quantile(non_zero, 0.25)
            q50 = _quantile(non_zero, 0.50)
            q75 = _quantile(non_zero, 0.75)

            for entry in days_data:
                c = entry["count"]
                if c == 0:
                    entry["level"] = 0
                elif c <= q25:
                    entry["level"] = 1
                elif c <= q50:
                    entry["level"] = 2
                elif c <= q75:
                    entry["level"] = 3
                else:
                    entry["level"] = 4

        # Streak: from all-time revlog for accuracy
        all_dates_rows = mw.col.db.all(
            "SELECT DISTINCT date(id/1000 - ?, 'unixepoch', 'localtime') as d FROM revlog ORDER BY d DESC",
            _DAY_ROLLOVER_HOUR * 3600
        )
        review_dates = {row[0] for row in all_dates_rows}

        # Current streak
        current_streak = 0
        check = today
        while check.isoformat() in review_dates:
            current_streak += 1
            check -= timedelta(days=1)

        # Best streak (all-time)
        best_streak = 0
        if review_dates:
            sorted_dates = sorted(review_dates)
            run = 1
            for i in range(1, len(sorted_dates)):
                try:
                    d1 = date.fromisoformat(sorted_dates[i - 1])
                    d2 = date.fromisoformat(sorted_dates[i])
                    if (d2 - d1).days == 1:
                        run += 1
                    else:
                        best_streak = max(best_streak, run)
                        run = 1
                except (ValueError, TypeError):
                    run = 1
            best_streak = max(best_streak, run)

        is_record = current_streak > 0 and current_streak >= best_streak

        return {
            "days": days_data,
            "streak": current_streak,
            "best_streak": best_streak,
            "is_record": is_record,
        }

    try:
        return run_on_main_thread(_collect, timeout=9)
    except Exception as e:
        logger.exception("get_year_heatmap failed: %s", e)
        return {"error": str(e)}


def get_time_of_day():
    """Reviews by hour (last 30 days), normalized 0-1, with best 2h window.

    Returns:
        dict with keys:
          - hours: list of 24 dicts [{hour, count, normalized}]
          - best_window_start: int — start hour of best 2-hour window (0-23)
          - best_window_end: int — end hour (exclusive, wraps at 24)
          - peak_hour: int — single busiest hour
    """
    try:
        from ..utils.anki import run_on_main_thread
    except ImportError:
        from utils.anki import run_on_main_thread

    def _collect():
        from aqt import mw
        from datetime import date, datetime, timedelta

        if mw is None or mw.col is None:
            return {"error": "No collection"}

        today = date.today()
        rollover_offset_ms = _DAY_ROLLOVER_HOUR * 3600 * 1000
        start_ms = (
            int(datetime.combine(today - timedelta(days=30), datetime.min.time()).timestamp() * 1000)
            - rollover_offset_ms
        )

        rows = mw.col.db.all(
            "SELECT id FROM revlog WHERE id >= ?", start_ms
        )

        hour_counts = [0] * 24
        for (rev_id,) in rows:
            # Use actual local time (not shifted — hour of day is real clock time)
            local_dt = datetime.fromtimestamp(rev_id / 1000)
            hour_counts[local_dt.hour] += 1

        max_count = max(hour_counts) if any(hour_counts) else 1

        hours_data = []
        for h, c in enumerate(hour_counts):
            hours_data.append({
                "hour": h,
                "count": c,
                "normalized": round(c / max_count, 3) if max_count > 0 else 0.0,
            })

        # Best 2-hour window (sliding, non-wrapping for simplicity)
        best_window_start = 0
        best_window_sum = 0
        for start in range(23):
            s = hour_counts[start] + hour_counts[start + 1]
            if s > best_window_sum:
                best_window_sum = s
                best_window_start = start

        best_window_end = best_window_start + 2

        peak_hour = hour_counts.index(max(hour_counts))

        return {
            "hours": hours_data,
            "best_window_start": best_window_start,
            "best_window_end": best_window_end,
            "peak_hour": peak_hour,
        }

    try:
        return run_on_main_thread(_collect, timeout=9)
    except Exception as e:
        logger.exception("get_time_of_day failed: %s", e)
        return {"error": str(e)}


def get_deck_session_suggestion(deck_id_str):
    """Session suggestion for a specific deck: due reviews + recommended new cards.

    Args:
        deck_id_str: deck ID as string.

    Returns:
        dict with keys:
          - dueReview: int — cards due for review today
          - recommendedNew: int — new cards to study (deck daily limit minus already done)
          - total: int — dueReview + recommendedNew
          - deckName: str
          - totalCards: int — all cards in deck (including children)
          - matureCards: int — cards with ivl >= 21
          - youngCards: int — cards with 0 < ivl < 21
          - newAvailable: int — unseen cards (queue == 0)
    """
    try:
        from ..utils.anki import run_on_main_thread
    except ImportError:
        from utils.anki import run_on_main_thread

    def _collect():
        from aqt import mw
        from datetime import date, datetime

        if mw is None or mw.col is None:
            return {"error": "No collection"}

        try:
            did = int(deck_id_str)
        except (ValueError, TypeError):
            return {"error": "Invalid deck_id"}

        deck = mw.col.decks.get(did)
        if deck is None:
            return {"error": "Deck not found"}

        deck_name = deck.get("name", "")

        # Collect this deck + all child deck IDs by name prefix
        all_decks = mw.col.decks.all()
        prefix = deck_name + "::"
        child_dids = [did]
        for d in all_decks:
            if d["name"].startswith(prefix):
                child_dids.append(d["id"])

        # Build placeholder string for SQL IN clause
        placeholders = ",".join("?" * len(child_dids))

        # Card counts
        total_cards = mw.col.db.scalar(
            "SELECT COUNT(*) FROM cards WHERE did IN (%s)" % placeholders,
            *child_dids
        ) or 0

        mature_cards = mw.col.db.scalar(
            "SELECT COUNT(*) FROM cards WHERE did IN (%s) AND ivl >= 21" % placeholders,
            *child_dids
        ) or 0

        young_cards = mw.col.db.scalar(
            "SELECT COUNT(*) FROM cards WHERE did IN (%s) AND ivl > 0 AND ivl < 21" % placeholders,
            *child_dids
        ) or 0

        new_available = mw.col.db.scalar(
            "SELECT COUNT(*) FROM cards WHERE did IN (%s) AND queue = 0" % placeholders,
            *child_dids
        ) or 0

        # Due reviews: queue IN (1, 2, 3)
        due_review = mw.col.db.scalar(
            "SELECT COUNT(*) FROM cards WHERE did IN (%s) AND queue IN (1, 2, 3)" % placeholders,
            *child_dids
        ) or 0

        # Deck daily new card limit from config
        try:
            conf = mw.col.decks.config_dict_for_deck_id(did)
            daily_new_limit = conf.get("new", {}).get("perDay", 20)
        except Exception:
            daily_new_limit = 20

        # New cards already studied today (type == 0 in revlog)
        rollover_offset_ms = _DAY_ROLLOVER_HOUR * 3600 * 1000
        today = date.today()
        day_start_ms = int(datetime.combine(today, datetime.min.time()).timestamp() * 1000) - rollover_offset_ms

        new_studied_today = mw.col.db.scalar(
            "SELECT COUNT(*) FROM revlog r JOIN cards c ON r.cid = c.id "
            "WHERE c.did IN (%s) AND r.type = 0 AND r.id >= ?" % placeholders,
            *(child_dids + [day_start_ms])
        ) or 0

        recommended_new = max(0, daily_new_limit - new_studied_today)
        # Cap at available new cards
        recommended_new = min(recommended_new, new_available)

        return {
            "dueReview": due_review,
            "recommendedNew": recommended_new,
            "total": due_review + recommended_new,
            "deckName": deck_name,
            "totalCards": total_cards,
            "matureCards": mature_cards,
            "youngCards": young_cards,
            "newAvailable": new_available,
        }

    try:
        return run_on_main_thread(_collect, timeout=9)
    except Exception as e:
        logger.exception("get_deck_session_suggestion failed: %s", e)
        return {"error": str(e)}
