# Õppeainete tagasiside

Veebirakendus, kus õpilane saab anda läbitud õppeainele hinnangu (1–5) ja soovi korral kommentaari ning õpetaja / kooli töötaja näeb kogu tagasisidet ja ainete keskmisi hindeid.

## Käivitamine

Vaja on **Node.js 18 või uuemat** (kontrolli: `node -v`) ja ligipääsu MongoDB serverile.

1. Andmebaasi ühendus on failis `.env` (see fail ei lähe GitHubi, vaata `.gitignore`). Kui `.env` puudub, kopeeri `.env.example` → `.env` ja pane sinna oma `MONGODB_URI`.
2. Käivita:

```bash
npm install
npm start
```

Ava brauseris:

- Tagasiside vorm: http://localhost:3000
- Õpetaja ülevaade: http://localhost:3000/ylevaade.html

Näidisandmed demo jaoks: `npm run seed` (lisab 12 tagasisidet) või `npm run seed -- --reset` (kustutab enne vanad tagasisided).

Testid: `npm test` (kasutavad eraldi andmebaasi `tagasiside_test`, mis kustutatakse pärast teste).

Andmed salvestuvad MongoDB andmebaasi `tagasiside` (nime saab muuta `.env` failis `MONGODB_DB`). Õppeainete nimekiri lisatakse automaatselt esimesel käivitusel. Kui server ei saa andmebaasiga ühendust, kirjutab ta selle 5 sekundi jooksul terminali.

## Õppeained ja õpetajad

Õppeainete nimekiri ja õpetajate nimed on failis `subjects.json`:

```json
[
  { "name": "Matemaatika", "teacher": "Mari Tamm" },
  { "name": "Vene keel", "teacher": "" }
]
```

Muuda faili ja taaskäivita server (`npm start`). Uued ained lisatakse andmebaasi ja olemasolevate ainete õpetaja nimi uuendatakse. Tühi `teacher` tähendab, et õpetajat ei näidata. Faili eemaldatud aine jääb andmebaasi alles, et vanad tagasisided ei kaoks.

## Kui ei käivitu

| Terminalis | Põhjus ja lahendus |
|---|---|
| `MONGODB_URI puudub` | `.env` fail puudub. Kontrolli, et see on samas kaustas kus `package.json` (Windowsis lülita sisse "peidetud failid"). |
| `Server selection timed out` | MongoDB serverit ei leita. Arvuti peab olema samas võrgus kui andmebaas; kontrolli IP-d ja et MongoDB töötab. |
| `Authentication failed` | Vale kasutajanimi või parool `MONGODB_URI`-s. |
| `Port 3000 on juba kasutusel` | Pane `.env` faili `PORT=3001`. |
| `Cannot find module 'express'` | Käivita `npm install` samas kaustas, kus on `package.json`. |

## Funktsionaalsus

**Õpilane**
- sisestab nime (või valib "Saada anonüümselt", siis nime ei küsita ega salvestata) ja klassi, valib õppeaine, annab hinde 1–5, lisab soovi korral kommentaari;
- kõik kohustuslikud väljad valideeritakse nii brauseris kui serveris;
- vigade korral näeb kokkuvõtet vormi kohal ja veateadet iga vigase välja all; viga kaob, kui välja parandad;
- pärast edukat saatmist näeb kinnitust "Tagasiside on salvestatud" koos saadetud andmetega.

**Õpetaja / kooli töötaja**
- näeb tabelit: kuupäev, õppeaine ja õpetaja, õpilane (anonüümse puhul "Anonüümne"), klass, hinne, kommentaar;
- näeb õppeainete võrdlust: õpetaja, vastuste arv ja keskmine hinne;
- saab filtreerida ühe õppeaine järgi (rippmenüü või aine kaardil klõps).

Kujundus on responsive: telefonis muutuvad tabelid kaartideks.

## Tehniline lahendus

| Osa | Tehnoloogia |
|---|---|
| Frontend | HTML, CSS, JavaScript (ilma raamistikuta) |
| Backend | Node.js + Express |
| Andmebaas | MongoDB (ametlik `mongodb` draiver) |
| Testid | Node.js sisseehitatud testija (`node --test`) |

### Failid

```
backend/
  server.js        Express server ja API (serveerib ka kausta frontend/)
  config.js        .env faili lugemine
  db.js            MongoDB ühendus, skeem, indeksid ja päringud
  seed.js          näidisandmete lisamine (npm run seed)
  subjects.json    õppeained ja õpetajad
  .env.example     ühenduse seadistuse näidis
  validate.js      serveripoolne valideerimine
  test/            API testid
frontend/          index.html = vorm, ylevaade.html = õpetaja vaade, style.css
docs/              Figma, Jira ja demo abimaterjal + ekraanipildid
```

### Andmebaas

Kaks kollektsiooni:

```
subjects { _id, name, teacher | null }       (name on unikaalne)
feedback { _id, studentName | null, anonymous, className, subjectId → subjects._id,
           grade (1..5), comment | null, createdAt }
```

Andmebaas luuakse koodis automaatselt esimesel käivitusel (`db.js`):
- kollektsioonid luuakse **skeemi valideerimisega** (`$jsonSchema`): kohustuslikud väljad, hinne täisarv 1–5, nime ja kommentaari pikkus. Nii ei saa valesid andmeid salvestada isegi otse andmebaasi kirjutades;
- indeksid: `subjects.name` (unikaalne) ja `feedback.subjectId + createdAt` (kiire filtreerimine ja sortimine);
- õppeainete nimekiri lisatakse, kui seda veel pole.

Ülevaate jaoks kasutatakse aggregation pipeline'i: `$group` õppeaine järgi (`$sum` vastuste arv, `$avg` keskmine hinne) ja `$lookup`, et saada aine nimi.

### API

| Meetod | Aadress | Kirjeldus |
|---|---|---|
| GET | `/api/subjects` | õppeainete nimekiri |
| POST | `/api/feedback` | salvesta tagasiside (vigade korral 400 + `errors`) |
| GET | `/api/feedback?subjectId=` | kõik tagasisided, valikuliselt ühe aine kaupa |
| GET | `/api/stats` | aine, vastuste arv, keskmine hinne |

Näide vastusest vigase vormi korral:

```json
{ "errors": { "studentName": "Palun sisesta oma nimi.", "grade": "Palun anna õppeainele hinne 1 kuni 5." } }
```
