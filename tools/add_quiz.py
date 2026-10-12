#!/usr/bin/env python3
"""Install a new quiz questions.json; update the catalog automatically.

Usage: python3 tools/add_quiz.py /path/to/questions.json
The JSON needs slug, id, title, subtitle, description, category, difficulty,
version, storagePrefix, and rounds. See existing quizzes for examples.
"""
import json
import shutil
import sys
from pathlib import Path
from refresh_catalog import ROOT, SLUG, validate, main as refresh_catalog


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python3 tools/add_quiz.py /path/to/questions.json')
    source = Path(sys.argv[1]).resolve()
    data = json.loads(source.read_text(encoding='utf-8'))
    slug = data.get('slug', '')
    if not isinstance(slug, str) or not SLUG.fullmatch(slug):
        raise SystemExit('Error: JSON must contain a safe lowercase slug, e.g. kino-serialy')
    validate(data, slug)
    destination = ROOT/'quizzes'/slug
    if destination.exists():
        raise SystemExit(f'Quiz already exists: {slug}. To edit it, change its questions.json then run refresh_catalog.py')
    destination.mkdir(parents=True)
    shutil.copy2(ROOT/'tools'/'quiz-template.html', destination/'index.html')
    (destination/'questions.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    refresh_catalog()
    print('New page:', destination/'index.html')

if __name__ == '__main__':
    main()
