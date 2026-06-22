import os
import json
import sys
import requests
from datetime import datetime
from zoneinfo import ZoneInfo

LOGIN    = os.environ['DATAFORSEO_LOGIN']
PASSWORD = os.environ['DATAFORSEO_PASSWORD']
KEYWORD  = 'Serponado'
OWN_DOMAIN  = 'optimerch.de'
OWN_URL     = 'optimerch.de/serponado'
MAX_DISPLAY = 10
MAX_HISTORY = 1440   # 30 Tage à 48 Halbstunden

BASE_PARAMS = {
    "keyword":                     KEYWORD,
    "location_name":               "Germany",
    "language_code":               "de",
    "se_domain":                   "google.de",
    "depth":                       10,
    "browser_screen_width":        1920,
    "browser_screen_height":       1080,
    "browser_screen_scale_factor": 1,
}

CONFIGS = {
    'mobile': {
        'output':  'public/rankings.json',
        'payload': [{**BASE_PARAMS, 'device': 'mobile', 'os': 'android'}],
    },
    'desktop': {
        'output':  'public/rankings-desktop.json',
        'payload': [{**BASE_PARAMS, 'device': 'desktop', 'os': 'windows'}],
    },
}


def fetch_once(payload):
    try:
        resp = requests.post(
            'https://api.dataforseo.com/v3/serp/google/organic/live/advanced',
            auth=(LOGIN, PASSWORD),
            json=payload,
            timeout=60
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        print(f"  ⚠️  API-Fehler: {e}", file=sys.stderr)
        return None

    try:
        items   = data['tasks'][0]['result'][0]['items']
        organic = [i for i in items if i.get('type') == 'organic']
    except (KeyError, IndexError, TypeError) as e:
        print(f"  ⚠️  Parsing-Fehler: {e}", file=sys.stderr)
        return None

    return [
        {
            'position': item.get('rank_group'),
            'domain':   item.get('domain'),
            'url':      item.get('url'),
            'title':    item.get('title', ''),
        }
        for item in organic
    ]


def fetch_and_save(device_name, config, now):
    output  = config['output']
    payload = config['payload']

    existing_data = {}
    history       = []

    if os.path.exists(output):
        try:
            with open(output, 'r', encoding='utf-8') as f:
                existing_data = json.load(f)
                history       = existing_data.get('history', [])
        except (json.JSONDecodeError, IOError):
            pass

    print(f"\n📡 {device_name.upper()} – Abfrage läuft...")
    rankings = fetch_once(payload)

    if rankings is None:
        print(f"❌ [{device_name}] Abfrage fehlgeschlagen.", file=sys.stderr)
        return False

    print(f"  {len(rankings)} Ergebnisse erhalten.")

    top10     = rankings[:MAX_DISPLAY]
    positions = {r['domain']: r['position'] for r in top10 if r['domain']}

    own_url_result = next(
        (r for r in rankings if r['url'] and OWN_URL in r['url']),
        None
    )
    if own_url_result:
        own_url_data = {
            'url':      'https://www.optimerch.de/serponado/',
            'position': own_url_result['position'],
            'title':    own_url_result['title'],
            'stale':    False,
        }
    else:
        last = existing_data.get('own_url', {})
        own_url_data = {
            'url':      'https://www.optimerch.de/serponado/',
            'position': last.get('position'),
            'title':    last.get('title', ''),
            'stale':    True,
        }

    own_position = next(
        (r['position'] for r in rankings if r['domain'] and OWN_DOMAIN in r['domain']),
        None
    )

    history.append({'ts': now, 'positions': positions})
    history = history[-MAX_HISTORY:]

    top3_moments = existing_data.get('top3_moments', [])
    today        = now.split(' ')[0]
    if not own_url_data['stale'] and own_url_data['position'] and own_url_data['position'] <= 3:
        today_entry = next((m for m in top3_moments if m['date'] == today), None)
        if today_entry:
            if own_url_data['position'] < today_entry['position']:
                today_entry['position'] = own_url_data['position']
        else:
            top3_moments.append({'date': today, 'position': own_url_data['position']})
    top3_moments.sort(key=lambda m: m['date'], reverse=True)
    top3_moments = top3_moments[:90]

    output_data = {
        'keyword':      KEYWORD,
        'updated_at':   now,
        'own_url':      own_url_data,
        'top3_moments': top3_moments,
        'rankings':     top10,
        'history':      history,
    }

    os.makedirs(os.path.dirname(output), exist_ok=True)
    with open(output, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    stale_note = ' (zuletzt gesehen)' if own_url_data['stale'] else ''
    print(
        f"✅ [{device_name}] Gespeichert. "
        f"{OWN_DOMAIN}: Position {own_position} | "
        f"/serponado/: Position {own_url_data['position']}{stale_note}"
    )
    return True


now = datetime.now(ZoneInfo('Europe/Berlin')).strftime('%Y-%m-%d %H:%M (Berlin)')

ok_mobile  = fetch_and_save('mobile',  CONFIGS['mobile'],  now)
ok_desktop = fetch_and_save('desktop', CONFIGS['desktop'], now)

if not ok_mobile and not ok_desktop:
    sys.exit(1)
