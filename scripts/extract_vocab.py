from __future__ import annotations

import json
import re
from pathlib import Path

import pdfplumber


ROOT = Path(__file__).resolve().parent.parent
PDF_PATH = next(ROOT.glob("*.pdf"))
OUTPUT_PATH = ROOT / "data" / "vocab.json"

MANUAL_CLASS_ONE_ROWS = [
    {"rank": 16, "word": "fertiliser", "meaning": "n.化肥，肥料", "synonyms": ["chemical", "toxic", "unnatural"]},
    {
        "rank": 17,
        "word": "that*",
        "meaning": "pron.那；那个",
        "synonyms": ["this", "it", "they", "those", "these", "such"],
        "notes": "指代是雅思阅读的重要考点",
    },
    {
        "rank": 18,
        "word": "and*",
        "meaning": "conj.和，而且",
        "synonyms": [
            "or",
            "as well as",
            "both…and",
            "not only…but also…",
            "other than",
            "in addition",
            "besides",
            "on the one hand…on the other hand…",
            "neither…nor…",
        ],
        "notes": "并列结构是雅思阅读的重要考点",
    },
    {
        "rank": 19,
        "word": "rather than*",
        "meaning": "而非，不是",
        "synonyms": [
            "but",
            "yet",
            "however",
            "whereas",
            "nonetheless",
            "nevertheless",
            "although",
            "notwithstanding though",
            "instead",
        ],
        "notes": "转折结构是雅思阅读的重要考点",
    },
    {
        "rank": 20,
        "word": "thanks to*",
        "meaning": "由于，幸亏",
        "synonyms": [
            "stem from",
            "derive",
            "owing to",
            "due to",
            "according to",
            "because of",
            "on account of",
            "as a result of",
            "leading to",
            "because",
            "since",
            "for",
            "in that",
            "as",
            "therefore",
            "hence",
        ],
        "notes": "因果关系是雅思阅读重要考点",
    },
]


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    value = value.replace("\n", " ").strip()
    return re.sub(r"\s+", " ", value)


def split_synonyms(value: str) -> list[str]:
    cleaned = clean_text(value)
    if not cleaned:
        return []
    return [part.strip() for part in re.split(r"\s*[，,;；]\s*", cleaned) if part.strip()]


def level_for_rank(rank: int | None, page: int) -> int:
    if rank is not None:
        if rank <= 20:
            return 1
        if rank <= 120:
            return 2
    if page >= 6:
        return 3
    raise ValueError(f"Unable to infer level for rank={rank}, page={page}")


def importance_label(level: int, rank: int | None) -> str:
    if level == 1:
        return "S" if rank and rank <= 10 else "A+"
    if level == 2:
        if rank and rank <= 60:
            return "A"
        return "B+" if rank and rank <= 90 else "B"
    return "C"


def build_entry(*, word: str, meaning: str, synonyms: list[str], level: int, page: int, order: int, rank: int | None = None, notes: str = "") -> dict:
    return {
        "id": f"w{order:03d}",
        "word": clean_text(word),
        "meaning": clean_text(meaning),
        "synonyms": synonyms,
        "level": level,
        "levelName": f"第{level}类",
        "importanceRank": rank,
        "importanceLabel": importance_label(level, rank),
        "sourcePage": page,
        "notes": clean_text(notes),
        "bookOrder": order,
    }


def parse_rank_row(row: list[str | None]) -> tuple[int | None, str, str, str]:
    rank = None
    word = meaning = synonyms = ""
    for cell in row:
        text = clean_text(cell)
        if not text:
            continue
        if rank is None and re.fullmatch(r"\d+", text):
            rank = int(text)
            continue
        if not word:
            word = text
            continue
        if not meaning:
            meaning = text
            continue
        if not synonyms:
            synonyms = text
    return rank, word, meaning, synonyms


def extract_entries() -> list[dict]:
    entries: list[dict] = []
    order = 1
    with pdfplumber.open(str(PDF_PATH)) as pdf:
        for page_index, page in enumerate(pdf.pages, start=1):
            table = page.extract_table()
            if not table:
                continue

            rows = table[1:]
            if page_index == 1:
                rows = rows[2:]

            for row in rows:
                if not row or not any(row):
                    continue

                if page_index <= 5:
                    rank, word, meaning, synonyms = parse_rank_row(row)
                    if not word or word == "考点词":
                        continue
                    entries.append(
                        build_entry(
                            word=word,
                            meaning=meaning,
                            synonyms=split_synonyms(synonyms),
                            level=level_for_rank(rank, page_index),
                            page=page_index,
                            order=order,
                            rank=rank,
                        )
                    )
                else:
                    word = clean_text(row[0])
                    if not word or word == "考点词":
                        continue
                    entries.append(
                        build_entry(
                            word=word,
                            meaning=clean_text(row[1]),
                            synonyms=split_synonyms(clean_text(row[2])),
                            level=3,
                            page=page_index,
                            order=order,
                        )
                    )
                order += 1

    insert_at = next(index for index, entry in enumerate(entries) if entry["importanceRank"] == 21)
    manual_entries = [
        build_entry(
            word=row["word"],
            meaning=row["meaning"],
            synonyms=row["synonyms"],
            level=1,
            page=2,
            order=0,
            rank=row["rank"],
            notes=row.get("notes", ""),
        )
        for row in MANUAL_CLASS_ONE_ROWS
    ]
    entries[insert_at:insert_at] = manual_entries

    for index, entry in enumerate(entries, start=1):
        entry["id"] = f"w{index:03d}"
        entry["bookOrder"] = index

    return entries


def main() -> None:
    entries = extract_entries()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "title": "雅思阅读考点词真经 538 词背诵库",
        "source": PDF_PATH.name,
        "entryCount": len(entries),
        "levels": {"1": "第1类：超高频核心词", "2": "第2类：高频重点词", "3": "第3类：已考过词汇"},
        "reviewIntervalsDays": [0, 1, 2, 4, 7, 15, 30],
        "entries": entries,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(entries)} entries to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
