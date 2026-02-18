from __future__ import annotations

import logging
import time

import schedule

logger = logging.getLogger(__name__)


def start(run_fn, interval_hours: float = 12) -> None:  # noqa: ANN001
    """Run *run_fn* immediately, then repeat every *interval_hours* hours."""
    logger.info("Scheduler started — interval: every %s hour(s)", interval_hours)
    schedule.every(interval_hours).hours.do(run_fn)

    run_fn()

    while True:
        schedule.run_pending()
        time.sleep(30)
