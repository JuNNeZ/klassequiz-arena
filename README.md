# Klassequiz Arena

Gratis quizspil til undervisning, inspireret af Kahoot og Blooket. Kører som en almindelig hjemmeside på GitHub Pages.

**Spil:** https://junnez.github.io/klassequiz-arena/

## Sådan spiller man

- **Tavle:** Én skærm på projektoren. Klassen svarer højt eller på hold, og læreren giver point med et klik.
- **Live:** Læreren trykker Spil → Live og får en firecifret kode og en QR-kode. Eleverne åbner siden på iPad eller telefon, trykker *Deltag i spil* og skriver koden. Intet login, kun et kaldenavn.
- **Øv selv:** Del et øvelink, som eleverne kan åbne på enhver enhed.

## Spiltyper

| Spil | Tavle | Live |
|---|---|---|
| Klassisk – hurtige rigtige svar giver flest point | ✓ | ✓ |
| Guldjagt – rigtigt svar giver en kiste (guld, dobbelt op, stjæl) | ✓ hold | ✓ |
| Holdkamp – klassen deles i hold | ✓ | ✓ |
| Racerløb – rigtige svar sender dig frem mod målstregen | ✓ hold | ✓ |
| Fiskeri – rigtigt svar = kast snøren, tungeste fangst vinder | ✓ hold | ✓ |
| Tårnforsvar – tjen mønter, byg tårne, stop monstrene | | ✓ |
| Duel – to og to mod hinanden | | ✓ |
| Selvstudie – eget tempo, læreren følger fremgangen | | ✓ |

## Quizzer og billeder

- Byg quizzer i editoren. Hvert spørgsmål kan have et billede: søg frie billeder på Wikimedia Commons, upload dit eget eller indsæt et link. *Find billeder automatisk* foreslår billeder til alle spørgsmål på én gang.
- Importér Blookets CSV-skabelon eller en simpel CSV (spørgsmål; svar 1–4; rigtigt svar; tid; billedlink).
- Eksportér som Blooket-CSV eller som backupfil (.json med billeder).
- Quizzer gemmes i browseren på den computer, du bruger. Tag en backup, hvis du skifter computer.

## Teknik og privatliv

- Ren HTML/CSS/JavaScript uden byggetrin.
- Live-spil kører peer-to-peer med [PeerJS](https://peerjs.com/) (MIT). Lærerens browser er vært; svar sendes direkte mellem enhederne. Der gemmes ingen elevdata på nogen server. PeerJS' gratis forbindelsesserver bruges kun til at finde hinanden.
- Er skolens netværk meget lukket, kan direkte forbindelser blive blokeret. Brug så Tavle.
- QR-koder: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT).
- Billeder i eksempelquizzerne er fra Wikimedia Commons under frie licenser. Fotograf og licens vises under hvert billede.

Lokal test af live-spil med egen PeerJS-server: tilføj `?peer=localhost:9000` til adressen.
