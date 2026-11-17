// Collect full upload histories for finance/explainer channels, score each long-form video against the median of its
// 30 neighbouring uploads (age- and channel-size-neutral), keep the outliers. Output: workspace/_ideas/swipe/
import fs from "node:fs"; import path from "node:path";
const REPO = path.resolve(import.meta.dir, "../../../..");
const OUT = path.join(REPO, "workspace/_ideas/swipe"); fs.mkdirSync(OUT, { recursive: true });
const KEY = process.env.YOUTUBE_API_KEY!; let units = 0;
const yt = async (q: string) => { units++; const r = await fetch(`https://www.googleapis.com/youtube/v3/${q}&key=${KEY}`); const j: any = await r.json(); if (!r.ok) throw new Error(j?.error?.message); return j; };
const watch = JSON.parse(fs.readFileSync(path.join(REPO, "workflow/01-ideation/watchlist.json"), "utf8")).channels.map((c: any) => c.handle);
const extra = ["@MagnatesMedia","@Wendoverproductions","@PolyMatter","@CompanyMan","@business","@VisualPoliticEN","@EconomyMedia","@TheMoneyGuyShow","@CalebHammer","@humphrey","@NateOBrien","@howtomoney","@minoritymindset","@TheRamseyShowEpisodes","@MoneyWithKatie","@HeresyFinancial","@GeorgeKamel","@AliAbdaal","@thecompounder","@NewMoneyYouTube","@TLDRnews","@Vox","@BloombergOriginals","@WSJ","@thefinancialdiet","@FinancialEducation","@MeetKevin","@ThePlanBagel","@DamienTalksMoney","@MarkoWhiteBoardFinance","@ModernWisdom","@TheSwedishInvestor","@Economist","@CNBC","@NerdWallet","@TwoCentsPBS","@MrWhosetheboss","@Hoog","@TheCodeReport","@ImanGadzhi","@JakeTran","@SunnyLenarduzzi","@HowMoneyWorks","@neoeconomist","@ThePaulMerrimanChannel","@LearnwithLeah","@BoringMoney","@WealthHacker","@SimplyExplained","@DaveRamseyShow"];
const handles = [...new Set([...watch, ...extra].map((h: string) => h.toLowerCase()))];
const iso = (s: string) => { const m = s?.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); return m ? (+(m[1]??0))*86400+(+(m[2]??0))*3600+(+(m[3]??0))*60+(+(m[4]??0)) : 0; };
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const all: any[] = [], chans: any[] = [], missing: string[] = [];
fs.mkdirSync(path.join(OUT,'ch'),{recursive:true});
for (const h of handles) { try {
  const cf = path.join(OUT,'ch',h.slice(1)+'.json'); if (fs.existsSync(cf)) { const k = JSON.parse(fs.readFileSync(cf,'utf8')); all.push(...k.vids); chans.push(k.chan); continue; }
  const c = (await yt(`channels?part=snippet,statistics,contentDetails&forHandle=${encodeURIComponent(h)}`)).items?.[0];
  if (!c) { missing.push(h); continue; }
  const up = c.contentDetails.relatedPlaylists.uploads; let ids: string[] = [], tok = "";
  for (let p = 0; p < 12; p++) { const j = await yt(`playlistItems?part=contentDetails&maxResults=50&playlistId=${up}${tok ? `&pageToken=${tok}` : ""}`); ids.push(...j.items.map((i: any) => i.contentDetails.videoId)); if (!(tok = j.nextPageToken)) break; }
  const vids: any[] = [];
  for (let i = 0; i < ids.length; i += 50) { const j = await yt(`videos?part=snippet,statistics,contentDetails&id=${ids.slice(i, i + 50).join(",")}`); for (const v of j.items) { const d = iso(v.contentDetails.duration); if (d <= 180) continue; const t = v.snippet.thumbnails; vids.push({ id: v.id, channel: c.snippet.title, handle: h, subs: +c.statistics.subscriberCount || 0, title: v.snippet.title, published: v.snippet.publishedAt, durS: d, views: +v.statistics.viewCount || 0, thumb: (t.maxres ?? t.standard ?? t.high).url }); } }
  vids.sort((a, b) => a.published.localeCompare(b.published));
  const now = Date.now();
  vids.forEach((v, i) => { const nb = vids.slice(Math.max(0, i - 15), i + 16).filter((x) => x !== v).map((x) => x.views); v.localMedian = median(nb); v.multiple = v.localMedian ? +(v.views / v.localMedian).toFixed(2) : 0; v.ageDays = Math.round((now - Date.parse(v.published)) / 864e5); });
  const keep = vids.filter((v) => v.ageDays >= 14); all.push(...keep); const chan = { handle: h, title: c.snippet.title, subs: +c.statistics.subscriberCount, longform: vids.length }; chans.push(chan); fs.writeFileSync(cf, JSON.stringify({ chan, vids: keep }));
  console.log(`${h.padEnd(28)} ${String(vids.length).padStart(4)} long-form  units ${units}`);
 } catch (e) { missing.push(h + ' (' + (e as Error).message.slice(0,40) + ')'); }
}
fs.writeFileSync(path.join(OUT, "all.json"), JSON.stringify(all));
fs.writeFileSync(path.join(OUT, "channels.json"), JSON.stringify({ chans, missing }, null, 1));
console.log(`missing: ${missing.join(" ")}\nvideos ${all.length}, units ${units}`);
