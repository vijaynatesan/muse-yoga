"""Voice 'Ready' phrase matcher — POC g. Pure logic, no API, no storage.

Accepted (after normalisation): ready | i'm ready | let us start
(and spelling variants: im ready, i am ready, lets start, let's start).
Matching is on whole word tokens, never substrings: 'already' must not match.
A negation just before the key word vetoes: 'not ready' must not match.
"""
import re

ACCEPTED = [
    ("let us start", ["let", "us", "start"]),
    ("let's start", ["lets", "start"]),
    ("let's start", ["let", "s", "start"]),
    ("i'm ready", ["i", "m", "ready"]),
    ("i'm ready", ["im", "ready"]),
    ("i'm ready", ["i", "am", "ready"]),
    ("ready", ["ready"]),
]
NEGATIONS = {"not", "no", "never", "dont"}


def normalize(text):
    t = (text or "").lower().replace("\u2019", "'")
    t = re.sub(r"[^a-z' ]+", " ", t)
    toks = []
    for w in t.split():
        toks.extend(w.split("'")) if "'" in w else toks.append(w)
    # split("'") drops the apostrophe: i'm -> [i, m]; don't -> [don, t]
    return [w for w in toks if w]


def _contains_phrase(tokens, phrase):
    n = len(phrase)
    return any(tokens[i:i + n] == phrase for i in range(len(tokens) - n + 1))


def match_ready(text):
    """Return {'matched': bool, 'phrase': str|None, 'tokens': [...]}"""
    tokens = normalize(text)
    if not tokens:
        return {"matched": False, "phrase": None, "tokens": tokens}
    for label, phrase in ACCEPTED:
        if not _contains_phrase(tokens, phrase):
            continue
        start = next(i for i in range(len(tokens) - len(phrase) + 1)
                     if tokens[i:i + len(phrase)] == phrase)
        window = tokens[max(0, start - 2):start]
        if any(w in NEGATIONS or w == "don" for w in window):
            return {"matched": False, "phrase": None, "tokens": tokens}
        return {"matched": True, "phrase": label, "tokens": tokens}
    return {"matched": False, "phrase": None, "tokens": tokens}
