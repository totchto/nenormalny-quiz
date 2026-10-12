#!/usr/bin/env python3
"""Validate quiz JSON files and regenerate the public catalogue. No dependencies."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLUG = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')


def validate(data, slug):
    if not isinstance(data, dict):
        raise ValueError(f'{slug}: quiz must be an object')
    if not SLUG.fullmatch(slug) or data.get('slug') != slug:
        raise ValueError(f'{slug}: slug mismatch or unsafe slug')
    for name in ('id', 'title', 'subtitle', 'description', 'category', 'difficulty', 'storagePrefix'):
        if not isinstance(data.get(name), str) or not data[name].strip():
            raise ValueError(f'{slug}: missing {name}')
    if not isinstance(data.get('version'), int) or data['version'] < 1:
        raise ValueError(f'{slug}: version must be positive integer')
    rounds = data.get('rounds')
    if not isinstance(rounds, list) or not rounds:
        raise ValueError(f'{slug}: no rounds')
    for r, round_ in enumerate(rounds, 1):
        if not isinstance(round_.get('title'), str) or not round_['title']:
            raise ValueError(f'{slug}: round {r} has no title')
        qs = round_.get('questions')
        if not isinstance(qs, list) or not qs:
            raise ValueError(f'{slug}: round {r} has no questions')
        if not isinstance(round_.get('multiplier', 1), int) or round_.get('multiplier', 1) < 1:
            raise ValueError(f'{slug}: round {r} invalid multiplier')
        for i, q in enumerate(qs, 1):
            desc = f'{slug}, round {r}, question {i}'
            if not isinstance(q.get('question'), str) or not q['question'].strip():
                raise ValueError(f'{desc}: missing question')
            if q.get('type') == 'choice':
                if not isinstance(q.get('choices'), list) or len(q['choices']) != 4 or not all(isinstance(x, str) and x.strip() for x in q['choices']):
                    raise ValueError(f'{desc}: exactly 4 text choices required')
                if not isinstance(q.get('correct'), int) or q['correct'] not in range(4):
                    raise ValueError(f'{desc}: correct answer index must be 0-3')
            elif q.get('type') == 'text':
                if not isinstance(q.get('answers'), list) or not q['answers'] or not all(isinstance(x, str) and x.strip() for x in q['answers']):
                    raise ValueError(f'{desc}: accepted answers required')
                if not isinstance(q.get('displayAnswer'), str) or not q['displayAnswer']:
                    raise ValueError(f'{desc}: displayAnswer required')
            else:
                raise ValueError(f'{desc}: unsupported question type')
    return {
        'id': data['id'], 'slug': slug, 'title': data['title'],
        'subtitle': data['subtitle'], 'description': data['description'],
        'edition': data.get('edition', ''), 'category': data['category'],
        'difficulty': data['difficulty'], 'durationMinutes': data.get('durationMinutes', 18),
        'version': data['version'], 'storagePrefix': data['storagePrefix'],
        'questionCount': sum(len(r['questions']) for r in rounds),
        'roundCount': len(rounds),
        'maxScore': sum(len(r['questions']) * r.get('multiplier', 1) for r in rounds),
    }


def main():
    quizzes = []
    seen_ids = set()
    for path in sorted((ROOT/'quizzes').glob('*/questions.json')):
        slug = path.parent.name
        data = json.loads(path.read_text(encoding='utf-8'))
        entry = validate(data, slug)
        if entry['id'] in seen_ids:
            raise ValueError(f'duplicate quiz ID: {entry["id"]}')
        seen_ids.add(entry['id'])
        if not (path.parent/'index.html').exists():
            raise ValueError(f'no page for {slug}')
        quizzes.append(entry)
    if not quizzes:
        raise ValueError('no quizzes found')
    # Fixed site display order by edition, not directory-name order.
    quizzes.sort(key=lambda q: (q['edition'], q['slug']))
    result = {'schemaVersion': 1, 'quizzes': quizzes}
    (ROOT/'quizzes.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'Updated quizzes.json: {len(quizzes)} quizzes, {sum(x["questionCount"] for x in quizzes)} questions')

if __name__ == '__main__':
    main()
