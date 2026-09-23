import { mkdir, writeFile } from "node:fs/promises";

const INDEX = "https://www.suursoudut.fi/soutuhistoria/soututulokset/";
const decode = (s="") => s.replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&auml;|&#228;/gi,"ä").replace(/&ouml;|&#246;/gi,"ö").replace(/&aring;|&#229;/gi,"å").replace(/&Auml;|&#196;/g,"Ä").replace(/&Ouml;|&#214;/g,"Ö").replace(/&Aring;|&#197;/g,"Å").replace(/&#8211;|&ndash;/g,"–").replace(/&#8212;|&mdash;/g,"—").replace(/&quot;/g,'"').replace(/&#039;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
const clean = (s="") => decode(s.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim());
const absolute = (href, base=INDEX) => new URL(href,base).href;

async function get(url) {
  const response=await fetch(url,{headers:{"user-agent":"Soutudata/1.0 (public results indexer)"}});
  if(!response.ok) throw new Error(`${response.status} ${url}`);
  const bytes=await response.arrayBuffer();
  const probe=new TextDecoder("windows-1252").decode(bytes.slice(0,1500));
  const charset=/charset=["']?([\w-]+)/i.exec(probe)?.[1]?.toLowerCase();
  return new TextDecoder(charset?.includes("1252") ? "windows-1252" : "utf-8").decode(bytes);
}

function yearLinks(html) {
  const links=[];
  for(const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label=clean(match[2]);
    if(/^(?:19|20)\d{2}$/.test(label) && Number(label)>=1996 && Number(label)<=2025) links.push({year:Number(label),url:absolute(match[1])});
  }
  links.push({year:2026,url:"https://www.suursoudut.fi/sulkavan-suursoudut-2026/tulokset-2026/"});
  return [...new Map(links.map((x)=>[x.year,x])).values()].sort((a,b)=>b.year-a.year);
}

function extractTables(html, year, source, categoryHint="") {
  const results=[]; let category=""; let tableHeaders=[];
  const hasRankColumn=/<t[dh]\b[^>]*>\s*(?:<[^>]+>\s*)*(?:Sija|Place)(?:\s*<\/[^>]+>)*\s*<\/t[dh]>/i.test(html);
  const body=(html.match(/<main[\s\S]*?<\/main>/i)||html.match(/<body[\s\S]*?<\/body>/i)||[html])[0];
  const tokenRe=/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>|<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  for(const token of body.matchAll(tokenRe)) {
    if(token[1]) { const heading=clean(token[1]); if(heading && !/^tulokset?\s*\d*$/i.test(heading)) category=heading; continue; }
    const rawCells=[...token[2].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m)=>clean(m[1]));
    const cells=rawCells.filter(Boolean);
    const headerNames=rawCells.map((cell)=>cell.toLocaleLowerCase("fi"));
    if (headerNames.includes("nimi")) { tableHeaders=headerNames; continue; }
    if (rawCells.length===1) tableHeaders=[];
    if (tableHeaders.includes("nimi")) {
      const nameIndex=tableHeaders.indexOf("nimi");
      const clubIndex=tableHeaders.indexOf("seura");
      const name=rawCells[nameIndex] || "";
      if (name) {
        const club=clubIndex >= 0 ? rawCells[clubIndex] : "";
        const occupation=tableHeaders.includes("ammatti") ? rawCells[tableHeaders.indexOf("ammatti")] : "";
        const normalizedName=name.includes(",") ? name.split(",").map((part)=>part.trim()).reverse().join(" ") : name;
        results.push(make({year,category:categoryHint||category,rank:"",crew:normalizedName,time:"",members:[club,occupation].filter(Boolean).join(" · "),details:rawCells.filter(Boolean).join(" · "),source}));
      }
      continue;
    }
    if(cells.length<2 || cells.join(" ").length<5 || cells.some((c)=>/^(nimi|name)$/i.test(c)) || /^(sija|place|lähtö|sarja|vene)$/i.test(cells[0])) continue;
    const joined=cells.join(" · ");
    const rank=hasRankColumn ? (cells.find((c)=>/^\d{1,3}\.?$/.test(c))||"").replace(".","") : "";
    const time=cells.find((c)=>/^(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?$|^(DNF|DNS|DSQ)$/i.test(c))||"";
    const meaningful=cells.filter((c)=>c!==time && c!==rank && !/^\d{1,4}$/.test(c));
    if(!time && !meaningful.some((c)=>/[A-Za-zÅÄÖåäö]{3}/.test(c))) continue;
    results.push(make({year,category:categoryHint||category,rank,crew:meaningful[0]||cells[1],time,members:meaningful.slice(1).join(" · "),details:joined,source}));
  }
  return results;
}

function extractInlineResults(line, year, source, category="") {
  const results=[];
  const matches=[...line.matchAll(/(\d{1,3})\)\s*([^,]+?)\s+((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?|DNF|DNS|DSQ)(?=(?:\s*\(|\s*,\s*\d{1,3}\)|\s*$))/gi)];
  if(!matches.length) return results;

  for(const match of matches) {
    const rank=String(match[1]).trim();
    const crewText=clean(match[2]).trim();
    const time=match[3].trim();
    if(!crewText || !time) continue;
    results.push(make({year,category,rank,crew:crewText,time,members:"",details:`${rank}) ${crewText} ${time}`,source}));
  }
  return results;
}

function extractLines(html, year, source) {
  const results=[];
  let content=(html.match(/<main[\s\S]*?<\/main>/i)||html.match(/class=["'][^"']*(?:entry-content|content-area)[^"']*["'][\s\S]*?<\/main>/i)||[html])[0];
  content=content.replace(/<h([2-6])\b[^>]*>/gi,"\n§H§").replace(/<\/(?:h[2-6]|p|div|li|tr)>/gi,"\n").replace(/<br\s*\/?>/gi,"\n");
  const lines=content.split(/\n+/).map(clean).filter((line)=>line.length>1 && line.length<3000);
  let category="";
  for(let i=0;i<lines.length;i++) {
    let line=lines[i];
    if(line.startsWith("§H§")) { category=line.slice(3).trim(); continue; }
    const inlineResults=extractInlineResults(line, year, source, category);
    if(inlineResults.length) {
      results.push(...inlineResults);
      continue;
    }
    const result=line.match(/^(\d{1,3})[).]\s*(.+?)\s+[–—-]\s*((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?|DNF|DNS|DSQ)\s*$/i);
    if(!result) continue;
    const next=lines[i+1]&&!lines[i+1].startsWith("§H§")&&!/^\d{1,3}[).]/.test(lines[i+1])?lines[i+1]:"";
    results.push(make({year,category,rank:result[1],crew:result[2],time:result[3],members:next,details:line+(next?` · ${next}`:""),source}));
  }
  return results;
}

function make(item) {
  item.category=item.category.replace(/^§H§/,"").trim()||"Tulokset";
  item.searchText=[item.year,item.category,item.rank,item.crew,item.time,item.members,item.details].join(" ");
  item.id=`${item.year}-${hash(item.searchText)}`;
  return item;
}
function hash(value) { let h=2166136261; for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)} return (h>>>0).toString(36); }

function resultLinks(html, base) {
  const links=[];
  for(const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href=decode(match[1]).replace(/&amp;/g,"&");
    const label=clean(match[2]);
    let url; try { url=absolute(href,base); } catch { continue; }
    const parsed=new URL(url);
    if(parsed.hostname!=="www.suursoudut.fi" || !label || /takaisin|gps|tekstitiedosto|soutajien tiedot|lähtölista/i.test(label)) continue;
    const dynamic=/\/listaa(?:_\d{4})?\.php\?sarja=/i.test(url);
    const oldPage=/\/kaikkitulokset\/tulos\d{2}\/[^/]+\.html?$/i.test(parsed.pathname) && !/\/soutul\d{2}\.html?$/i.test(parsed.pathname);
    if(dynamic||oldPage) links.push({url,label});
  }
  return [...new Map(links.map((x)=>[x.url,x])).values()];
}

async function inBatches(items, size, work) {
  const output=[];
  for(let i=0;i<items.length;i+=size) output.push(...await Promise.all(items.slice(i,i+size).map(work)));
  return output;
}

const indexHtml=await get(INDEX);
const links=yearLinks(indexHtml);
console.log(`Löytyi ${links.length} vuosilinkkiä.`);
const all=[]; const years=[];
for(const {year,url} of links) {
  try {
    const html=await get(url);
    const lineResults=extractLines(html,year,url);
    const tableResults=extractTables(html,year,url);
    const children=resultLinks(html,url);
    const childResults=(await inBatches(children,8,async (child)=>{
      try { const childHtml=await get(child.url); return [...extractLines(childHtml,year,child.url),...extractTables(childHtml,year,child.url,child.label)]; }
      catch(error) { console.warn(`  ${child.url}: ${error.message}`); return []; }
    })).flat();
    const combined=[...lineResults,...tableResults,...childResults];
    const unique=[...new Map(combined.map((r)=>[r.id,r])).values()];
    all.push(...unique); years.push({year,url,count:unique.length,status:unique.length?"ok":"ei tunnistettuja rivejä"});
    console.log(`${year}: ${unique.length} riviä (${children.length} sarjasivua)`);
  } catch(error) { years.push({year,url,count:0,status:error.message}); console.warn(`${year}: ${error.message}`); }
}
all.sort((a,b)=>b.year-a.year-(Number(a.rank)||999)+(Number(b.rank)||999));
await mkdir("data",{recursive:true});
await writeFile("data/results.json",JSON.stringify({updated:new Date().toISOString().slice(0,10),source:INDEX,missingYears:[2019,2020],years,results:all},null,2));
console.log(`Valmis: ${all.length} hakuriviä tiedostossa data/results.json`);
