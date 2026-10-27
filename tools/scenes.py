# Genererer silhuet-scener til hver spilverden som CSS (data-URI'er).
# Kør: python3 tools/scenes.py > css/scenes.css
from urllib.parse import quote

W, H = 1200, 180
def svg(body, w=W, h=H):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMax slice">{body}</svg>'

S = {}
# Tavlen: kridtliste med kridt og svamp
S['classic'] = svg(
    '<rect x="0" y="150" width="1200" height="30" fill="#6b4a2c"/><rect x="0" y="146" width="1200" height="6" fill="#8a6440"/>'
    '<rect x="160" y="136" width="70" height="12" rx="6" fill="#f3f0e2"/><rect x="250" y="139" width="44" height="9" rx="4.5" fill="#f2d15c"/>'
    '<rect x="320" y="138" width="52" height="10" rx="5" fill="#9fd6f0"/><rect x="860" y="122" width="120" height="26" rx="5" fill="#3b4a5c"/>'
    '<rect x="860" y="122" width="120" height="10" rx="4" fill="#c9b48a"/>'
    '<path d="M60 60 l10 -24 l10 24 l-24 -15 h28 z M1080 40 v24 M1068 52 h24 M520 70 q20 -30 40 0 t40 0" fill="none" stroke="#eef0e4" stroke-opacity=".18" stroke-width="3"/>')
# Skattehulen: mønter og kiste
coins = ''.join(f'<ellipse cx="{x}" cy="{170 - (abs((x % 140) - 70) // 4)}" rx="22" ry="9" fill="#f5b53d" stroke="#b07a1a" stroke-width="2"/>' for x in range(20, 1200, 34))
S['gold'] = svg(
    '<path d="M0 180 V150 Q300 110 600 140 T1200 130 V180 Z" fill="#4a331c"/>' + coins +
    '<rect x="540" y="96" width="120" height="70" rx="8" fill="#8a5a2b" stroke="#4d2f12" stroke-width="6"/><path d="M534 100 Q600 50 666 100 Z" fill="#9b6834" stroke="#4d2f12" stroke-width="6"/>'
    '<rect x="590" y="106" width="20" height="24" rx="3" fill="#f5b53d" stroke="#4d2f12" stroke-width="4"/>')
# Stadion: tilskuere og bane
crowd = ''.join(f'<circle cx="{x}" cy="{70 + (x * 7) % 18}" r="11" fill="{["#e05a4f","#3d8fd6","#e8bf3c","#8d62cc","#5fbf6b","#f08a3c"][(x // 26) % 6]}" opacity=".55"/>' for x in range(10, 1200, 26))
S['team'] = svg('<rect x="0" y="60" width="1200" height="50" fill="#0d2416"/>' + crowd +
    '<rect x="0" y="108" width="1200" height="72" fill="#1d5a30"/><path d="M0 108 H1200 M600 108 V180" stroke="#eef0e4" stroke-opacity=".6" stroke-width="4"/><ellipse cx="600" cy="150" rx="70" ry="22" fill="none" stroke="#eef0e4" stroke-opacity=".6" stroke-width="4"/>')
# Racerbanen: asfalt, striber og ternet mål
checks = ''.join(f'<rect x="{1100 + (i % 4) * 25}" y="{70 + (i // 4) * 25}" width="25" height="25" fill="{"#f2f2f2" if (i + i // 4) % 2 == 0 else "#111"}"/>' for i in range(16))
S['race'] = svg('<rect x="0" y="70" width="1200" height="110" fill="#1a1c21"/><path d="M0 125 H1200" stroke="#f2d15c" stroke-width="6" stroke-dasharray="60 40"/>'
    '<path d="M0 74 H1200 M0 176 H1200" stroke="#eef0e4" stroke-width="5"/>' + checks)
# Havnen: bølger og båd
S['fish'] = svg('<path d="M0 120 Q60 100 120 120 T240 120 T360 120 T480 120 T600 120 T720 120 T840 120 T960 120 T1080 120 T1200 120 V180 H0 Z" fill="#1b5a82"/>'
    '<path d="M0 140 Q75 120 150 140 T300 140 T450 140 T600 140 T750 140 T900 140 T1050 140 T1200 140 V180 H0 Z" fill="#14476a"/>'
    '<path d="M760 98 H900 L880 122 H780 Z" fill="#c75a3a"/><path d="M830 98 V40 L870 92 Z" fill="#f2f0e6"/><path d="M830 40 V98" stroke="#3a2a1a" stroke-width="4"/>'
    '<path d="M790 98 L740 60" stroke="#3a2a1a" stroke-width="3"/><path d="M740 60 V128" stroke="#eef0e4" stroke-width="1.5" stroke-opacity=".7"/>')
# Borgen: murkrone og tårne
cren = ''.join(f'<rect x="{x}" y="96" width="30" height="24" fill="#3a3742"/>' for x in range(0, 1200, 50))
S['tower'] = svg('<rect x="0" y="118" width="1200" height="62" fill="#3a3742"/>' + cren +
    '<rect x="120" y="50" width="90" height="130" fill="#34313b"/><rect x="990" y="40" width="100" height="140" fill="#34313b"/>'
    + ''.join(f'<rect x="{x}" y="{y}" width="22" height="20" fill="#34313b"/>' for x, y in [(120, 32), (154, 32), (188, 32), (990, 22), (1029, 22), (1068, 22)]) +
    '<path d="M1040 22 V-10" stroke="#5a5560" stroke-width="3"/><path d="M1040 -10 L1080 2 L1040 12 Z" fill="#e05a4f"/>'
    '<path d="M150 100 a15 15 0 0 1 30 0 V130 H150 Z M1025 90 a15 15 0 0 1 30 0 V122 H1025 Z" fill="#1d1b22"/>')
# Arenaen: buer
arches = ''.join(f'<path d="M{x} 180 V110 a40 40 0 0 1 80 0 V180" fill="#1a0f20"/>' for x in range(20, 1200, 110))
S['duel'] = svg('<rect x="0" y="80" width="1200" height="100" fill="#3c2348"/>' + arches + '<rect x="0" y="70" width="1200" height="14" fill="#4c2d5a"/>')
# Læsesalen: bogryg-reol
cols = ['#c75a5a', '#3d8fd6', '#e8bf3c', '#5fbf6b', '#8d62cc', '#d9894a', '#4aa3a0']
books, x = '', 0
while x < 1200:
    w = 18 + (x * 13) % 22; h = 70 + (x * 17) % 40
    books += f'<rect x="{x}" y="{170 - h}" width="{w}" height="{h}" fill="{cols[(x // 7) % len(cols)]}" opacity=".7"/>'
    x += w + 3
S['self'] = svg(books + '<rect x="0" y="168" width="1200" height="12" fill="#6b4a2c"/>')

print('/* Genereret af tools/scenes.py: silhuetter i bunden af hver spilverden */')
for k, v in S.items():
    print(f'[data-world="{k}"]{{--scene:url("data:image/svg+xml,{quote(v, safe="")}")}}')
