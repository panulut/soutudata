const $ = (selector) => document.querySelector(selector);
const state = { all: [], filtered: [], page: 1, pageSize: 20 };
const normalize = (value = "") => value.toLocaleLowerCase("fi").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
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
  if (/nais|naisten/.test(value)) return "naiset";
  if (/mies|miehet|miesten/.test(value)) return "miehet";
  if (/\bn\b/.test(value)) return "naiset";
  if (/\bm\b/.test(value)) return "miehet";
  return "";
};

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
  $("#nameQuery").addEventListener("input", () => { $("#clearName").classList.toggle("visible", !!$("#nameQuery").value); clearTimeout(timer); timer=setTimeout(search,180); });
  $("#nameQuery").addEventListener("keydown", (event) => { if (event.key === "Enter") search(); });
  $("#yearSelect").addEventListener("change", () => { populateGenders(); populateSeries(); search(); });
  $("#boatClassSelect").addEventListener("change", () => { populateGenders(); populateSeries(); search(); });
  $("#genderSelect").addEventListener("change", () => { populateSeries(); search(); });
  $("#seriesSelect").addEventListener("change", search);
  $("#searchButton").addEventListener("click", search);
  $("#results").addEventListener("click", (event) => {
    const button = event.target.closest(".crew-link");
    if (!button) return;
    $("#nameQuery").value = button.dataset.query || button.textContent;
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
  $("#clearName").addEventListener("click", () => { $("#nameQuery").value=""; $("#clearName").classList.remove("visible"); search(); $("#nameQuery").focus(); });
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

function formatResult(item) {
  let crew = item.crew || item.details || "Tulostieto";
  let club = "";
  const crewParts = crew.match(/^(.+?)\s+\(\d{1,3}\)(?:,\s*|\s+)(.+)$/);
  if (crewParts) {
    crew = crewParts[1].trim();
    club = crewParts[2].trim();
  }

  const infoParts = String(item.members || "").split("·").map((part) => part.trim()).filter(Boolean);
  const rank = item.rank || infoParts.find((part) => /^\d{1,3}\.?$/.test(part))?.replace(".", "") || "";
  const info = infoParts.filter((part) => !/^\d{1,3}\.?$/.test(part) && !/^\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?$/.test(part) && !/^(?:-|ei|dnf|dns|dsq)$/i.test(part));
  if (club && !info.includes(club)) info.unshift(club);

  return { crew, rank, members: info.join(" · ") };
}

function search() {
  const query = normalize($("#nameQuery").value.trim());
  const year = $("#yearSelect").value;
  const boat = $("#boatClassSelect").value;
  const gender = $("#genderSelect").value;
  const series = $("#seriesSelect").value;
  state.filtered = state.all.filter((item) => {
    const categoryMatch = (!boat || classifyBoat(item.category) === boat) && (!gender || classifyGender(item.category) === gender) && (!series || item.category === series);
    return (!year || String(item.year) === year) && categoryMatch && matchesQuery(item, query);
  }).sort((a, b) => {
    const yearOrder = Number(b.year) - Number(a.year);
    if (yearOrder) return yearOrder;
    const rankA = Number.parseInt(a.rank, 10);
    const rankB = Number.parseInt(b.rank, 10);
    if (Number.isNaN(rankA)) return Number.isNaN(rankB) ? 0 : 1;
    if (Number.isNaN(rankB)) return -1;
    return rankA - rankB;
  });
  state.page = 1;
  render(query, year, series);
}

function render(query = normalize($("#nameQuery").value.trim()), year = $("#yearSelect").value, series = $("#seriesSelect").value) {
  const start = (state.page - 1) * state.pageSize;
  const visible = state.filtered.slice(start, start + state.pageSize);
  $("#resultCount").textContent = state.filtered.length.toLocaleString("fi-FI");
  const filters = [$("#boatClassSelect").value && $("#boatClassSelect").selectedOptions[0]?.textContent, $("#genderSelect").value && $("#genderSelect").selectedOptions[0]?.textContent, series && $("#seriesSelect").selectedOptions[0]?.textContent].filter(Boolean);
  $("#summaryText").textContent = query || year || filters.length ? [query && `Haku “${$("#nameQuery").value.trim()}”`, year && `vuosi ${year}`, ...filters].filter(Boolean).join(" · ") : "Kaikki arkistosta tunnistetut tulosrivit";
  const root = $("#results"); root.innerHTML = "";
  if (!visible.length) { root.innerHTML = `<div class="empty"><strong>Ei osumia</strong>Kokeile nimen osaa, toista kirjoitusasua tai kaikkia vuosia.</div>`; renderPagination(); return; }
  const template = $("#resultTemplate");
  for (const item of visible) {
    const card = template.content.cloneNode(true);
    const formatted = formatResult(item);
    card.querySelector(".year-badge").textContent = item.year;
    card.querySelector(".category").textContent = item.category || "Tulos";
    const crewLink = card.querySelector(".crew-link");
    crewLink.textContent = formatted.crew;
    crewLink.dataset.query = formatted.crew;
    card.querySelector(".members").textContent = formatted.members;
    card.querySelector(".rank").textContent = formatted.rank || "—";
    card.querySelector(".time").textContent = item.time || "—";
    card.querySelector(".source").href = item.source;
    root.append(card);
  }
  renderPagination();
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
