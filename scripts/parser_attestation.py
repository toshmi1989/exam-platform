#!/usr/bin/env python3
"""
Daily cron-ready parser for attestation lists from tmbm.ssv.uz.
Fetches first 5 publications per category (no pagination, no archive before 2025),
parses HTML tables, normalizes names, and upserts into attestation_people.
Requires: DATABASE_URL in environment.
"""

import os
import re
import time
import uuid
import logging
from datetime import datetime
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

USER_AGENT = "ZiyoMed-Attestation-Parser/1.0"
TIMEOUT = 10
SLEEP_BETWEEN_REQUESTS = 1
MAX_POSTS_PER_CATEGORY = 5
MIN_PUBLISH_YEAR = 2025

# Параметр ?l= на странице категории выбирает регион (1–14: Qoraqalpog'iston, Andijon, ... Xorazm).
REGION_IDS = list(range(1, 15))  # 1..14

SOURCES = [
    {"url": "https://tmbm.ssv.uz/post/category/testers_list_doctors", "stage": 1, "profession": "doctor", "by_region": True},
    {"url": "https://tmbm.ssv.uz/post/category/testers_list_nurses", "stage": 1, "profession": "nurse", "by_region": True},
    {"url": "https://tmbm.ssv.uz/post/category/testers_doctors", "stage": 2, "profession": "doctor", "by_region": True},
    {"url": "https://tmbm.ssv.uz/post/category/testers_nurses", "stage": 2, "profession": "nurse", "by_region": True},
]


def normalize_name(name: str) -> str:
    if not name or not isinstance(name, str):
        return ""
    s = name.strip().lower()
    s = re.sub(r"\s+", " ", s)
    for old in ("oʻ", "o'", "ў", "'", "\u2019"):
        s = s.replace(old, "'")
    return s.strip()


def url_with_region(url: str, region_id: int) -> str:
    """Add or replace ?l=region_id in category URL."""
    parsed = urlparse(url)
    query = parsed.query
    if query:
        parts = [p for p in query.split("&") if not p.startswith("l=")]
        parts.append(f"l={region_id}")
        new_query = "&".join(parts)
    else:
        new_query = f"l={region_id}"
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, parsed.fragment))


def get_session() -> requests.Session:
    return requests.Session()


def fetch(session: requests.Session, url: str) -> str | None:
    try:
        r = session.get(
            url,
            headers={"User-Agent": USER_AGENT},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        size = len(r.text) if r.text else 0
        logger.info("GET OK %s -> %d bytes", url, size)
        return r.text
    except Exception as e:
        logger.warning("GET FAIL %s -> %s", url, e)
        return None


def parse_category_links(html: str, base_url: str, limit: int = 5) -> list[tuple[str, str | None, datetime | None]]:
    """Return list of (post_url, title, published_date). Only posts with year >= MIN_PUBLISH_YEAR."""
    out = []
    try:
        soup = BeautifulSoup(html, "html.parser")
        for a in soup.find_all("a", href=True):
            href = a.get("href", "")
            if "/post/view/" not in href:
                continue
            full_url = urljoin(base_url, href)
            text = (a.get_text() or "").strip()
            date_parsed = None
            if text:
                m = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{4})\s*[-–—]", text)
                if m:
                    try:
                        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
                        if year < MIN_PUBLISH_YEAR:
                            continue
                        date_parsed = datetime(year, month, day)
                    except ValueError:
                        pass
            out.append((full_url, text or None, date_parsed))
            if len(out) >= limit:
                break
    except Exception as e:
        logger.exception("Parse category links failed: %s", e)
    return out


def parse_table_rows(soup: BeautifulSoup) -> list[dict]:
    """Extract rows from first table(s). Each row: full_name, specialty?, region?, exam_date?, exam_time?"""
    rows = []
    try:
        for table in soup.find_all("table"):
            trs = table.find_all("tr")
            for tr in trs:
                tds = tr.find_all("td")
                if len(tds) < 2:
                    continue
                cells = [td.get_text(strip=True) for td in tds]
                if not cells:
                    continue
                first = cells[0]
                if first.isdigit():
                    idx = 1
                else:
                    idx = 0
                if idx >= len(cells):
                    continue
                full_name = cells[idx]
                if not full_name or len(full_name) < 3:
                    continue
                specialty = cells[idx + 1] if idx + 1 < len(cells) else None
                region = None
                exam_date = None
                exam_time = None
                if idx + 2 < len(cells):
                    maybe_region_or_date = cells[idx + 2]
                    if re.match(r"\d{1,2}\.\d{1,2}\.\d{4}", maybe_region_or_date):
                        exam_date = maybe_region_or_date
                    else:
                        region = maybe_region_or_date
                if idx + 3 < len(cells):
                    third = cells[idx + 3]
                    if re.match(r"\d{1,2}\.\d{1,2}\.\d{4}", third):
                        exam_date = third
                    elif re.match(r"\d{1,2}:\d{2}", third):
                        exam_time = third
                if idx + 4 < len(cells):
                    fourth = cells[idx + 4]
                    if re.match(r"\d{1,2}\.\d{1,2}\.\d{4}", fourth):
                        exam_date = fourth
                    elif re.match(r"\d{1,2}:\d{2}", fourth):
                        exam_time = fourth
                if idx + 5 < len(cells):
                    fifth = cells[idx + 5]
                    if re.match(r"\d{1,2}:\d{2}", fifth):
                        exam_time = fifth
                rows.append({
                    "full_name": full_name,
                    "specialty": specialty or None,
                    "region": region or None,
                    "exam_date": exam_date or None,
                    "exam_time": exam_time or None,
                })
    except Exception as e:
        logger.exception("Parse table failed: %s", e)
    return rows


def extract_region_from_page(soup: BeautifulSoup) -> str | None:
    """Try to get region from h2 or first heading on the page."""
    try:
        h2 = soup.find("h2")
        if h2:
            return h2.get_text(strip=True)[:500] or None
    except Exception:
        pass
    return None


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url or not database_url.strip():
        logger.error("DATABASE_URL is not set. Exit.")
        raise SystemExit(1)

    conn = None
    try:
        conn = psycopg2.connect(database_url)
    except Exception as e:
        logger.error("DB connect failed: %s", e)
        raise SystemExit(1)

    session = requests.Session()
    all_rows = []

    for source in SOURCES:
        url = source["url"]
        stage = source["stage"]
        profession = source["profession"]
        by_region = source.get("by_region", False)
        urls_to_fetch = [url_with_region(url, rid) for rid in REGION_IDS] if by_region else [url]

        for idx, cat_url in enumerate(urls_to_fetch):
            region_id = REGION_IDS[idx] if by_region else None
            region_label = f" l={region_id}" if region_id is not None else ""
            logger.info("Category: %s stage=%s profession=%s%s", cat_url, stage, profession, region_label)

            html = fetch(session, cat_url)
            if not html:
                logger.warning("Category skipped (no content): %s", cat_url)
                continue
            time.sleep(SLEEP_BETWEEN_REQUESTS)

            links = parse_category_links(html, cat_url, limit=MAX_POSTS_PER_CATEGORY)
            if not links:
                logger.info("Category %s: 0 post links (empty or all before %d)", cat_url, MIN_PUBLISH_YEAR)
                if by_region:
                    continue
            else:
                logger.info("Category %s: found %d post links", cat_url, len(links))

            for post_url, _title, published_date in links:
                time.sleep(SLEEP_BETWEEN_REQUESTS)
                post_html = fetch(session, post_url)
                if not post_html:
                    logger.warning("Post skipped (no content): %s", post_url)
                    continue
                try:
                    post_soup = BeautifulSoup(post_html, "html.parser")
                    page_region = extract_region_from_page(post_soup)
                    table_rows = parse_table_rows(post_soup)
                    for row in table_rows:
                        if not row.get("full_name"):
                            continue
                        if not row.get("region") and page_region:
                            row["region"] = page_region
                        row["stage"] = stage
                        row["profession"] = profession
                        row["source_url"] = post_url
                        row["published_date"] = published_date
                        all_rows.append(row)
                    logger.info("Post OK %s -> %d rows", post_url, len(table_rows))
                except Exception as e:
                    logger.warning("Post FAIL %s -> %s", post_url, e)

    logger.info("Total rows to insert: %d", len(all_rows))

    if not all_rows:
        logger.warning("No rows to insert.")
        conn.close()
        return

    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM attestation_people")
            deleted = cur.rowcount
            logger.info("Deleted %d existing rows", deleted)

            def gen():
                for r in all_rows:
                    normalized = normalize_name(r["full_name"])
                    if not normalized:
                        continue
                    pub_ts = r.get("published_date")
                    pub_date = pub_ts.date() if pub_ts else None
                    yield (
                        str(uuid.uuid4()),
                        r["full_name"],
                        normalized,
                        r.get("specialty"),
                        r.get("region"),
                        r["stage"],
                        r["profession"],
                        r.get("exam_date"),
                        r.get("exam_time"),
                        r["source_url"],
                        pub_date,
                    )

            execute_values(
                cur,
                """
                INSERT INTO attestation_people (
                    id, full_name, full_name_normalized, specialty, region, stage, profession,
                    exam_date, exam_time, source_url, published_date
                ) VALUES %s
                """,
                list(gen()),
                template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            )
            conn.commit()
            logger.info("Inserted attestation rows successfully.")
    except Exception as e:
        logger.exception("DB write failed: %s", e)
        conn.rollback()
        raise SystemExit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
