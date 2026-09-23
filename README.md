# Soutudata

Kevyt selainpohjainen hakutyökalu Sulkavan Suursoutujen julkisille tuloksille. Haku toimii nimellä, venekunnalla, seuralla, vuodella ja soutusarjalla. Sarjoiksi voi rajata yksin-, pari-, vuoro-, kirkko-, retki- ja erikoisvenesoudut sekä kanootit ja kajakit. Näkyvät tulokset voi ladata CSV-tiedostona.

## Käyttöönotto

```powershell
npm run data
npm start
```

Avaa `http://localhost:4173`. Aineiston päivitys tehdään ajamalla `npm run data` uudelleen. Kerääjä lukee vuosilinkit Suursoutujen tulosarkistosta ja tallentaa normalisoidut hakurivit tiedostoon `data/results.json`.

Vuosi 2019 ei ole lähdesivun mukaan saatavilla. Eri vuosien lähdeaineistot poikkeavat rakenteeltaan, joten `data/results.json` sisältää myös vuosikohtaisen keräysraportin.
