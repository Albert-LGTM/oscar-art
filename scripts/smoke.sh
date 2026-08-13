#!/usr/bin/env bash
# Smoke-test a running Ståsted container.
#
#   ./scripts/smoke.sh [base-url]        default: http://localhost:8080
#
# Checks the things that are invisible until they are wrong: real 404s rather than soft
# 200s, reciprocal hreflang, security headers, the caching split, and — the one that
# actually breaks the page if it drifts — that the CSP hashes match the inline content
# the server is really sending.
set -uo pipefail

BASE="${1:-http://localhost:8080}"
pass=0; fail=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); }

status() { curl -s -o /dev/null -w '%{http_code}' "$BASE$1"; }
header() { curl -sI "$BASE$1" | grep -i "^$2:" | tr -d '\r' | cut -d' ' -f2-; }

echo "Ståsted smoke test — $BASE"
echo
echo "Routes"
for pair in "/:200" "/en/:200" "/da/:200" \
            "/en/works/vertical-hold/:200" "/da/vaerker/vertical-hold/:200" \
            "/sitemap-index.xml:200"; do
  u="${pair%:*}"; want="${pair##*:}"; got="$(status "$u")"
  [ "$got" = "$want" ] && ok "$u → $got" || bad "$u → $got (expected $want)"
done

# A soft 404 tells a curator a mistyped URL is a real page, and poisons indexing.
got="$(status /en/works/definitely-not-a-work/)"
[ "$got" = "404" ] && ok "missing page → 404 (not a soft 200)" || bad "missing page → $got (expected 404)"

echo
echo "Security headers"
for h in Content-Security-Policy X-Content-Type-Options Referrer-Policy Permissions-Policy; do
  v="$(header /en/ "$h")"
  [ -n "$v" ] && ok "$h present" || bad "$h MISSING"
done
csp="$(header /en/ Content-Security-Policy)"
case "$csp" in
  *unsafe-inline*) bad "CSP contains 'unsafe-inline'" ;;
  *)               ok  "CSP has no 'unsafe-inline'" ;;
esac
case "$csp" in
  *"frame-ancestors 'none'"*) ok "CSP forbids framing" ;;
  *)                          bad "CSP does not set frame-ancestors 'none'" ;;
esac

echo
echo "Caching"
c="$(header /en/ Cache-Control)"
case "$c" in *must-revalidate*) ok "HTML revalidates" ;; *) bad "HTML Cache-Control: $c" ;; esac
c="$(header /media/derived/vh-2022-01-1280.avif Cache-Control)"
case "$c" in *immutable*) ok "derivatives immutable" ;; *) bad "derivative Cache-Control: $c" ;; esac

echo
echo "Bilingual"
if curl -s "$BASE/en/works/vertical-hold/" | grep -q 'hreflang="da"' &&
   curl -s "$BASE/da/vaerker/vertical-hold/" | grep -q 'hreflang="en"'; then
  ok "hreflang is reciprocal on both sides of a record"
else
  bad "hreflang is not reciprocal — search engines discard one-sided pairs"
fi

# The language toggle must land on the EQUIVALENT RECORD, never the homepage.
if curl -s "$BASE/da/vaerker/vertical-hold/" | grep -q 'masthead__lang" href="/en/works/vertical-hold/"'; then
  ok "language toggle lands on the equivalent record"
else
  bad "language toggle does not preserve the record"
fi

echo
echo "Content integrity"
# object-fit on artwork is the single most common way artist sites destroy installation
# documentation. The build-time lint covers source; this covers what actually shipped.
if curl -s "$BASE/en/works/vertical-hold/" | grep -qE 'object-fit|filter:[[:space:]]*(grayscale|sepia|saturate)'; then
  bad "shipped CSS crops or filters artwork"
else
  ok "no crop/filter reaches artwork in shipped CSS"
fi

# Every <img> must carry alt and intrinsic dimensions.
if command -v python3 >/dev/null; then
  python3 - "$BASE" <<'PY'
import re,sys,urllib.request
base=sys.argv[1]
html=urllib.request.urlopen(base+'/en/').read().decode()
imgs=re.findall(r'<img\b[^>]*>',html)
noalt=[i for i in imgs if 'alt=' not in i]
nodim=[i for i in imgs if 'width=' not in i or 'height=' not in i]
print(('  \033[32m✓\033[0m ' if not noalt else '  \033[31m✗\033[0m ') + f'{len(imgs)} img, {len(noalt)} without alt')
print(('  \033[32m✓\033[0m ' if not nodim else '  \033[31m✗\033[0m ') + f'{len(imgs)} img, {len(nodim)} without width/height')
sys.exit(1 if (noalt or nodim) else 0)
PY
  [ $? -eq 0 ] && pass=$((pass+2)) || fail=$((fail+1))
fi

echo
echo "CSP hashes match served inline content"
python3 - "$BASE" <<'PY'
import re,sys,hashlib,base64,urllib.request
base=sys.argv[1]
r=urllib.request.urlopen(base+'/en/')
html=r.read().decode(); csp=r.headers.get('Content-Security-Policy','')
bad=0
def h(s): return "'sha256-"+base64.b64encode(hashlib.sha256(s.encode()).digest()).decode()+"'"
for m in re.finditer(r'<script\b([^>]*)>([\s\S]*?)</script>',html):
    if 'src=' in m.group(1) or not m.group(2).strip(): continue
    if h(m.group(2)) not in csp: bad+=1
for m in re.finditer(r'<style\b([^>]*)>([\s\S]*?)</style>',html):
    if not m.group(2).strip(): continue
    if h(m.group(2)) not in csp: bad+=1
print(('  \033[32m✓\033[0m every inline block is allowed by the CSP'
       if not bad else f'  \033[31m✗\033[0m {bad} inline block(s) BLOCKED by the CSP — regenerate with `npm run gen:csp`'))
sys.exit(1 if bad else 0)
PY
[ $? -eq 0 ] && pass=$((pass+1)) || fail=$((fail+1))

echo
printf '%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
