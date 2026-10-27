# Klassequiz Arena

Gratis quizspil til undervisning, inspireret af Kahoot og Blooket. Kører som en almindelig hjemmeside på GitHub Pages.

**Spil:** https://junnez.github.io/klassequiz-arena/

## Sådan spiller man

- **Tavle:** Én skærm på projektoren. Klassen svarer højt eller på hold, og læreren giver point med et klik.
- **Live:** Læreren trykker Spil → Live, vælger spillets længde og får en firecifret kode og en QR-kode. Eleverne åbner siden, trykker *Deltag i spil*, skriver koden og vælger en figur. Hver elev spiller i eget tempo på sin egen enhed; tavlen viser den samlede stilling live. Intet login.
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
| Pindekrig – Rød mod Blå: rigtige svar giver guld til soldater, slaget kører live på tavlen | | ✓ |
| Klassen mod computeren – runde for runde: svar, køb soldater og fælles opgraderinger, se kampen på tavlen; forkerte svar styrker computeren | | ✓ |
| Pindekrig solo – hver elev fører sin hær mod computeren og rykker op slag for slag | | ✓ |
| Selvstudie – eget tempo, læreren følger fremgangen | | ✓ |

## Musik

Hver spiltype har sin egen pausemusik (Quizshow, Skattejagt, Stadion, Racerbane, Havnen, Borgen, Duel, Slagmarken, Felttoget og Fokus), komponeret til spillet og afspillet direkte i browseren. Slå den til og fra på lærerskærmen.

## Quizzer og billeder

- Byg quizzer i editoren. Hvert spørgsmål kan have et billede: søg frie billeder på Wikimedia Commons, upload dit eget eller indsæt et link. *Find billeder automatisk* foreslår billeder til alle spørgsmål på én gang.
- Importér Blookets CSV-skabelon eller en simpel CSV (spørgsmål; svar 1–4; rigtigt svar; tid; billedlink).
- Eksportér som Blooket-CSV eller som backupfil (.json med billeder).
- Quizzer gemmes i browseren på den computer, du bruger. Tag en backup, hvis du skifter computer.

## Teknik og privatliv

- Ren HTML/CSS/JavaScript uden byggetrin.
- Live-spil kører peer-to-peer med [PeerJS](https://peerjs.com/) (MIT). Lærerens browser er vært; svar sendes direkte mellem enhederne. Der gemmes ingen elevdata på nogen server. PeerJS' gratis forbindelsesserver bruges kun til at finde hinanden.
- Hvis en direkte forbindelse ikke lykkes (fx på styrede Chromebooks), skifter eleven automatisk til et TURN-relæ fra [Open Relay](https://www.metered.ca/tools/openrelay/) over port 443/80. Kun spillets beskeder sendes igennem.
- QR-koder: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT).
- Billeder i eksempelquizzerne er fra Wikimedia Commons under frie licenser. Fotograf og licens vises under hvert billede.

Lokal test af live-spil med egen PeerJS-server: tilføj `?peer=localhost:9000` til adressen.
