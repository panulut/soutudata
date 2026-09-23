const $ = (selector) => document.querySelector(selector);
const state = { all: [], filtered: [], page: 1, pageSize: 20, focusedName: "", focusedIdentity: "" };
const normalize = (value = "") => value.toLocaleLowerCase("fi").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
const titleCaseName = (value = "") => value.toLocaleLowerCase("fi").split(/([\s-]+)/).map((part) => /^[a-zåäö]/i.test(part) ? `${part[0].toLocaleUpperCase("fi")}${part.slice(1)}` : part).join("");
const classifyBoat = (category) => {
  const value = normalize(category);
  if (/kanoo|kajak/.test(value)) return "kanootti";
  if (value.includes("kirkkovene")) return "kirkkovene";
  if (value.includes("vuorosoutu")) return "vuorosoutu";
  if (value.includes("retkisoutu")) return "retkisoutu";
  if (value.includes("erikoisvene")) return "erikoisvene";
  if (value.includes("yksinsoutu")) return "yksinsoutu";
  if (value.includes("parisoutu")) return "parisoutu";
  return "muu";
};
const classifyGender = (category) => {
  const value = normalize(category);
  const words = value.split(/[^a-z0-9]+/).filter(Boolean);
    if (/nais|naisten/.test(value)) return "naiset"; 
  if (/mies|miehet|miesten/.test(value)) return "miehet";
  if (words.includes("n")) return "naiset";
  if (words.includes("m")) return "miehet";
  if (/seka|mixed/.test(value)) return "";
  if (/(yksinsoutu|vuorosoutu|parisoutu|kirkkoveneet)/.test(value) && /(yleinen|avoin|yli\s*\d+|alle\s*\d+)/.test(value)) return "miehet";
  return "";
};

function canonicalSeries(category) {
  const value = normalize(category);
  const boat = classifyBoat(category);
  const gender = /seka|mixed/.test(value) ? "seka" : classifyGender(category) || "avoin";
  const age = value.match(/(?:yli|alle)\s*\d+/)?.[0] || "yleinen";
  return `${boat}|${gender}|${age}`;
}
async function init() {
  try {
    const response = await fetch("data/results.json");
    if (!response.ok) throw new Error("Aineisto puuttuu");
    const payload = await response.json();
    state.all = payload.results || [];
    const years = [...new Set(state.all.map((item) => item.year))].sort((a,b) => b-a);
    $("#yearSelect").insertAdjacentHTML("beforeend", years.map((year) => `<option>${year}</option>`).join(""));
    state.categories = [...new Set(state.all.map((item) => item.category).filter(Boolean))].map((name) => ({name, boat: classifyBoat(name), gender: classifyGender(name)}));
    populateBoatClasses();
    $("#dataStatus").textContent = `${state.all.length.toLocaleString("fi-FI")} riviä · ${payload.updated || "paikallinen aineisto"}`;
    $(".source-status").classList.add("ready");
    bind();
    search();
  } catch (error) {
    $("#dataStatus").textContent = "Aineistoa ei löytynyt";
    $("#results").innerHTML = `<div class="empty"><strong>Aineisto puuttuu</strong>Suorita ensin <code>npm run data</code> ja lataa sivu uudelleen.</div>`;
    $("#resultCount").textContent = "0";
  }
}

function bind() {
  let timer;
  $("#nameQuery").addEventListener("input", () => { state.focusedName = ""; state.focusedIdentity = ""; $("#clearName").classList.toggle("visible", !!$("#nameQuery").value); clearTimeout(timer); timer=setTimeout(() => { updateSuggestions(); search(); },180); });
  $("#nameQuery").addEventListener("keydown", (event) => { if (event.key === "Enter") search(); });
  $("#yearSelect").addEventListener("change", () => { populateGenders(); populateSeries(); search(); });
  $("#boatClassSelect").addEventListener("change", () => { populateGenders(); populateSeries(); search(); });
  $("#genderSelect").addEventListener("change", () => { populateSeries(); search(); });
  $("#seriesSelect").addEventListener("change", search);
  $("#searchButton").addEventListener("click", search);
  $("#nameSuggestions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-suggestion]");
    if (!button) return;
    const name = button.getAttribute("data-suggestion");
    $("#nameQuery").value = name;
    state.focusedName = name;
    state.focusedIdentity = "";
    $("#nameSuggestions").hidden = true;
    search();
    $("#result-panel").scrollIntoView({behavior:"smooth", block:"start"});
  });
  $("#results").addEventListener("click", (event) => {
    const button = event.target.closest(".crew-link");
    if (!button) return;
    $("#nameQuery").value = button.dataset.query || button.textContent;
    state.focusedName = $("#nameQuery").value;
    state.focusedIdentity = "";
    $("#nameSuggestions").hidden = true;
    $("#clearName").classList.add("visible");
    $("#yearSelect").value = "";
    $("#boatClassSelect").value = "";
    $("#genderSelect").value = "";
    $("#seriesSelect").value = "";
    populateGenders();
    populateSeries();
    search();
    $("#result-panel").scrollIntoView({behavior:"smooth", block:"start"});
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-identity]");
    if (!button || !$("#athleteCard")?.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    state.focusedIdentity = button.getAttribute("data-identity") || "";
    state.page = 1;
    search();
    $("#results").scrollIntoView({behavior:"smooth", block:"start"});
  });
  $("#clearName").addEventListener("click", () => { state.focusedName = ""; state.focusedIdentity = ""; $("#nameQuery").value=""; $("#nameSuggestions").hidden = true; $("#clearName").classList.remove("visible"); search(); $("#nameQuery").focus(); });
  $("#downloadButton").addEventListener("click", downloadCsv);
}

function populateBoatClasses() {
  const labels = {yksinsoutu:"Yksinsoutu", parisoutu:"Parisoutu", vuorosoutu:"Vuorosoutu", kirkkovene:"Kirkkoveneet", retkisoutu:"Retkisoutu", kanootti:"Kanootit ja kajakit", erikoisvene:"Erikoisveneet", muu:"Muut"};
  const values = [...new Set(state.categories.map((item) => item.boat))].sort((a,b) => labels[a].localeCompare(labels[b], "fi"));
  $("#boatClassSelect").insertAdjacentHTML("beforeend", values.map((value) => `<option value="${value}">${labels[value]}</option>`).join(""));
  populateGenders();
  populateSeries();
}

function populateGenders() {
  const boat = $("#boatClassSelect").value;
  const year = $("#yearSelect").value;
  const values = [...new Set(state.categories.filter((item) => (!boat || item.boat === boat) && hasResults(item, year)).map((item) => item.gender).filter(Boolean))];
  const labels = {miehet:"Miehet", naiset:"Naiset"};
  const select = $("#genderSelect");
  const selected = select.value;
  select.innerHTML = `<option value="">Kaikki sukupuolet</option>${values.sort((a,b) => labels[a].localeCompare(labels[b], "fi")).map((value) => `<option value="${value}">${labels[value]}</option>`).join("")}`;
  if (values.includes(selected)) select.value = selected;
}

function populateSeries() {
  const boat = $("#boatClassSelect").value;
  const gender = $("#genderSelect").value;
  const year = $("#yearSelect").value;
  const categories = state.categories.filter((item) => (!boat || item.boat === boat) && (!gender || item.gender === gender) && hasResults(item, year)).sort((a,b) => a.name.localeCompare(b.name, "fi"));
  const select = $("#seriesSelect");
  const selected = select.value;
  select.innerHTML = `<option value="">Kaikki sarjat</option>${categories.map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("")}`;
  if (categories.some((item) => item.name === selected)) select.value = selected;
}

function hasResults(category, year) {
  return state.all.some((item) => item.category === category.name && (!year || String(item.year) === year));
}

function matchesQuery(item, query) {
  if (!query) return true;
  const haystack = normalize([
    item.crew || "",
    item.members || "",
    item.details || "",
    item.category || "",
    item.searchText || "",
    item.year || "",
  ].join(" "));

  const terms = query.split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  if (terms.length === 1) return haystack.includes(terms[0]);

  return terms.every((term) => haystack.includes(term));
}

function updateSuggestions() {
  const input = $("#nameQuery");
  const root = $("#nameSuggestions");
  const query = normalize(input.value.trim());
  if (query.length < 3 || state.focusedName) { root.hidden = true; root.innerHTML = ""; return; }
  const names = [...new Set(state.all.flatMap((item) => [formatResult(item).crew]))]
    .filter((name) => normalize(name).startsWith(query))
    .sort((a,b) => a.length - b.length || a.localeCompare(b, "fi"))
    .slice(0, 8);
  root.innerHTML = names.map((name) => `<button type="button" data-suggestion="${esc(name)}">${esc(titleCaseName(name))}</button>`).join("");
  root.hidden = !names.length;
}

function formatResult(item, participantName = "") {
  let crew = item.crew || item.details || "Tulostieto";
  let club = "";
  let starts = item.crew?.match(/\((\d+)\)/)?.[1] || "";
  let partner = "";
  const crewParts = crew.match(/^(.+?)\s+\(\d{1,3}\)(?:,\s*|\s+)(.+)$/);
  if (crewParts) {
    crew = crewParts[1].trim();
    club = crewParts[2].trim();
  }
  if (participantName && normalize(crew).includes(normalize(participantName)) && !crewParts) {
    const participantPattern = new RegExp(participantName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    partner = crew.replace(participantPattern, "").replace(/\s+/g, " ").trim();
    crew = titleCaseName(participantName.trim());
  }

  const infoParts = String(item.members || "").split("·").map((part) => part.trim()).filter(Boolean);
  const rank = item.rank || infoParts.find((part) => /^\d{1,3}\.?$/.test(part))?.replace(".", "") || "";
  const info = infoParts.filter((part) => !/^\d{1,3}\.?$/.test(part) && !/^\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?$/.test(part) && !/^(?:-|ei|dnf|dns|dsq)$/i.test(part));
  if (club && !info.includes(club)) info.unshift(club);
  if (partner && !info.includes(partner)) info.push(partner);

  return { crew, rank, starts, members: info.join(" · ") };
}

function search() {
  const query = normalize($("#nameQuery").value.trim());
  const resultQuery = state.focusedIdentity && state.focusedName ? normalize(state.focusedName) : query;
  const year = $("#yearSelect").value;
  const boat = $("#boatClassSelect").value;
  const gender = $("#genderSelect").value;
  const series = $("#seriesSelect").value;
  state.filtered = state.all.filter((item) => {
    const categoryMatch = (!boat || classifyBoat(item.category) === boat) && (!gender || classifyGender(item.category) === gender) && (!series || item.category === series);
    const identityMatch = !state.focusedIdentity || identityKey(item) === state.focusedIdentity;
    const participantMatch = state.focusedIdentity && state.focusedName ? normalize(item.crew || "").includes(normalize(state.focusedName)) : matchesQuery(item, resultQuery);
    return (!year || String(item.year) === year) && categoryMatch && identityMatch && participantMatch;
  }).sort((a, b) => {
    const yearOrder = Number(b.year) - Number(a.year);
    if (yearOrder) return yearOrder;
    const rankA = Number.parseInt(a.rank, 10);
    const rankB = Number.parseInt(b.rank, 10);
    if (Number.isNaN(rankA)) return Number.isNaN(rankB) ? 0 : 1;
    if (Number.isNaN(rankB)) return -1;
    return rankA - rankB;
  });
  if (query) {
    if (!state.focusedName) state.focusedIdentity = "";
  } else {
    state.focusedName = "";
    state.focusedIdentity = "";
  }
  state.page = 1;
  render(query, year, series);
}

function render(query = normalize($("#nameQuery").value.trim()), year = $("#yearSelect").value, series = $("#seriesSelect").value) {
  const start = (state.page - 1) * state.pageSize;
  const visible = state.filtered.slice(start, start + state.pageSize);
  $("#resultCount").textContent = state.filtered.length.toLocaleString("fi-FI");
  const filters = [$("#boatClassSelect").value && $("#boatClassSelect").selectedOptions[0]?.textContent, $("#genderSelect").value && $("#genderSelect").selectedOptions[0]?.textContent, series && $("#seriesSelect").selectedOptions[0]?.textContent].filter(Boolean);
  $("#summaryText").textContent = query || year || filters.length ? [query && `Haku “${$("#nameQuery").value.trim()}”`, year && `vuosi ${year}`, ...filters].filter(Boolean).join(" · ") : "Kaikki arkistosta tunnistetut tulosrivit";
  renderAthleteCard();
  const root = $("#results"); root.innerHTML = "";
  if (!visible.length) { root.innerHTML = `<div class="empty"><strong>Ei osumia</strong>Kokeile nimen osaa, toista kirjoitusasua tai kaikkia vuosia.</div>`; renderPagination(); return; }
  const template = $("#resultTemplate");
  for (const item of visible) {
    const card = template.content.cloneNode(true);
    const formatted = formatResult(item, state.focusedName || $("#nameQuery").value.trim());
    card.querySelector(".year-badge").textContent = item.year;
    card.querySelector(".category").textContent = item.category || "Tulos";
    const crewLink = card.querySelector(".crew-link");
    crewLink.textContent = formatted.crew;
    crewLink.dataset.query = formatted.crew;
    card.querySelector(".members").textContent = [formatted.members, formatted.starts && `${formatted.starts}. soutukerta`].filter(Boolean).join(" · ");
    card.querySelector(".rank").textContent = formatted.rank || "—";
    card.querySelector(".time").textContent = item.time || "—";
    card.querySelector(".source").href = item.source;
    root.append(card);
  }
  renderPagination();
}

function renderAthleteCard() {
  const card = $("#athleteCard");
  if (!state.focusedName) { card.hidden = true; card.innerHTML = ""; return; }
  const name = state.focusedName;
  const matchingRows = state.all.filter((item) => matchesQuery(item, normalize(name)));
  const identityGroups = groupIdentities(matchingRows);
  const isBoatParticipant = matchingRows.some((item) => classifyBoat(item.category) === "kirkkovene");
  const rows = state.focusedIdentity ? identityGroups.find((group) => group.key === state.focusedIdentity)?.rows || matchingRows : matchingRows;
  if (!state.focusedIdentity && identityGroups.length > 1 && !isBoatParticipant) {
    card.hidden = false;
    card.innerHTML = `<div class="athlete-heading"><span class="athlete-kicker">Samannimisiä soutajia</span><h2>${esc(titleCaseName(name))}</h2><p>Valitse oikea soutaja. Vaihtoehdot on eroteltu soutumuodon, venekunnan ja soutukertojen perusteella.</p></div><div class="identity-choices">${identityGroups.map((group) => `<button type="button" data-identity="${esc(group.key)}"><strong>${esc(titleCaseName(name))} · ${esc(group.boatLabel)}</strong><span>${esc(group.label)} · ${group.starts ? `${group.starts} soutukertaa · ` : ""}${group.years.join(", ")}</span></button>`).join("")}</div>`;
    card.querySelectorAll("[data-identity]").forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      state.focusedIdentity = button.getAttribute("data-identity") || "";
      state.page = 1;
      search();
      $("#results").scrollIntoView({behavior:"smooth", block:"start"});
    }));
    return;
  }
  const series = [...new Set(rows.map((item) => canonicalSeries(item.category)).filter(Boolean))];
  const latestRow = rows.slice().sort((a,b) => Number(b.year) - Number(a.year))[0];
  const latestStarts = participantStarts(name, latestRow) || rows.length;
  const latestYear = latestRow?.year || "–";
  card.hidden = false;
  card.innerHTML = `<div class="athlete-heading"><span class="athlete-kicker">Soutajan oma kortti</span><h2>${esc(titleCaseName(name))}</h2></div><div class="athlete-stats"><div><strong>${latestStarts}</strong><span>soutukertaa</span></div><div><strong>${latestYear}</strong><span>viimeisin</span></div></div><p class="athlete-series">${series.length} eri sarjaa · kaikki tulokset uusimmasta vanhimpaan</p>`;
}

function participantStarts(name, row) {
  if (!row?.crew) return "";
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return row.crew.match(new RegExp(`${escaped}\\s*\\((\\d+)\\)`, "i"))?.[1] || "";
}

function identityKey(item) {
  const boat = classifyBoat(item.category);
  if (boat === "kirkkovene" || boat === "retkisoutu") {
    const crew = normalize(item.crew || item.details || "").split(/\s+/);
    const sharedCrew = boat === "retkisoutu" && crew.length > 3 ? crew.slice(2).join(" ") : crew.join(" ");
    return `${boat}|${sharedCrew}`;
  }
  return "individual";
}

function identityLabel(item) {
  const memberLabel = (item.members || "").split("·")[0].trim();
  if (memberLabel) return memberLabel;
  const crew = (item.crew || "").replace(/^\d+[).]\s*/, "").trim();
  return crew || "Seura tai venekunta ei tiedossa";
}

function groupIdentities(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = identityKey(row);
    const label = identityLabel(row);
    const starts = row.crew?.match(/\((\d+)\)/)?.[1];
    if (!groups.has(key)) groups.set(key, {key, label, starts, boatLabels:new Set(), rows:[], years:[]});
    const group = groups.get(key);
    group.rows.push(row);
    group.boatLabels.add(boatLabel(row.category));
    if (!group.years.includes(row.year)) group.years.push(row.year);
  }
  return [...groups.values()].map((group) => ({...group, boatLabel:[...group.boatLabels].join(" + ")})).sort((a,b) => Number(b.years[0]) - Number(a.years[0]));
}

function boatLabel(category) {
  return {yksinsoutu:"Yksinsoutu", parisoutu:"Parisoutu", vuorosoutu:"Vuorosoutu", kirkkovene:"Kirkkovene", retkisoutu:"Retkisoutu", kanootti:"Kanootit ja kajakit", erikoisvene:"Erikoisvene", muu:"Muu"}[classifyBoat(category)];
}

function renderPagination() {
  const pages = Math.ceil(state.filtered.length / state.pageSize), root = $("#pagination"); root.innerHTML="";
  if (pages <= 1) return;
  const candidates = [...new Set([1, pages, state.page-1, state.page, state.page+1].filter((n) => n>0 && n<=pages))].sort((a,b)=>a-b);
  let previous=0;
  for (const page of candidates) {
    if (page-previous>1) root.insertAdjacentHTML("beforeend","<span>…</span>");
    const button=document.createElement("button"); button.textContent=page; button.classList.toggle("active",page===state.page);
    button.addEventListener("click",()=>{state.page=page;render();window.scrollTo({top:$(".summary").offsetTop,behavior:"smooth"});}); root.append(button); previous=page;
  }
}

function downloadCsv() {
  const header=["Vuosi","Sarja","Sija","Venekunta / osallistuja","Tulos","Soutajat / tiedot","Lähde"];
  const quote=(v)=>`"${String(v??"").replaceAll('"','""')}"`;
  const rows=state.filtered.map((r)=>[r.year,r.category,r.rank,r.crew,r.time,r.members||r.details,r.source]);
  const blob=new Blob(["\ufeff"+[header,...rows].map((row)=>row.map(quote).join(";")).join("\n")],{type:"text/csv;charset=utf-8"});
  const series = $("#seriesSelect").value;
  const link=document.createElement("a"); link.href=URL.createObjectURL(blob); link.download=`soututulokset-${series||"kaikki-sarjat"}-${$("#yearSelect").value||"kaikki-vuodet"}.csv`; link.click(); URL.revokeObjectURL(link.href);
}
init();
