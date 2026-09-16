#!/usr/bin/env bash
# brief.sh — le brief de début de session (hook SessionStart).
# Sortie injectée dans le contexte de Claude à l'ouverture : git, session.md, état des captures.
# Rester COURT et rapide — c'est un brief, pas un rapport.
cd "$(dirname "$0")/../.." 2>/dev/null || true

echo "=== BRIEF LPWS ($(date +%F)) ==="
echo "git : $(git branch --show-current 2>/dev/null) · $(git status --porcelain 2>/dev/null | wc -l) non commité(s) · dernier : $(git log -1 --format='%h %s' 2>/dev/null | cut -c1-90)"

if [ -f session.md ]; then
  echo
  cat session.md
fi

echo
echo "captures (clients/) :"
found=0
for m in clients/*/*/baseline/meta.json; do
  [ -f "$m" ] || continue
  found=1
  python3 -c "
import json
m = json.load(open('$m'))
d = m.get('diff', {})
v = 'fidèle' if m.get('fidele') else 'pas fidèle'
print(f\"  - {m.get('client','?')}/{m.get('campaign','?')} : {v} ({d.get('desktop',0)*100:.1f}% / {d.get('mobile',0)*100:.1f}%)\")" 2>/dev/null
done
[ "$found" = 0 ] && echo "  (aucune)"
exit 0
