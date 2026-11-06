import express from "express";
import yahooFinance from "yahoo-finance2";
try { yahooFinance.suppressNotices(["yahooSurvey"]); } catch {}
const app = express();
app.use(express.static("public"));
const n = v => (typeof v === "number" && isFinite(v) ? v : null);
const r2 = v => (v === null ? null : Math.round(v * 100) / 100);
const pct = v => (n(v) === null ? null : r2(v * 100));
const div = (a, b) => (n(a) !== null && n(b) !== null && b !== 0 ? a / b : null);

app.get("/api/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.json([]);
    const s = await yahooFinance.search(q, { quotesCount: 15, newsCount: 0 });
    const out = (s.quotes || [])
      .filter(x => x.quoteType === "EQUITY" && /\.(NS|BO)$/.test(x.symbol || ""))
      .map(x => ({ symbol: x.symbol, name: x.shortname || x.longname || x.symbol }));
    res.json(out.slice(0, 8));
  } catch (e) { res.json([]); }
});

app.get("/api/stock", async (req, res) => {
  let sym = String(req.query.symbol || "").trim().toUpperCase();
  if (!sym) return res.status(400).json({ error: "symbol required" });
  if (!/\.(NS|BO)$/.test(sym)) sym += ".NS";
  try {
    const d = await yahooFinance.quoteSummary(sym, {
      modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "majorHoldersBreakdown", "assetProfile"],
    }, { validateResult: false });
    const sd = d.summaryDetail || {}, ks = d.defaultKeyStatistics || {}, fd = d.financialData || {};
    const mc = n(d.price?.marketCap) ?? n(sd.marketCap);
    const ocf = n(fd.operatingCashflow), fcf = n(fd.freeCashflow);
    const debt = n(fd.totalDebt), cash = n(fd.totalCash), ebitda = n(fd.ebitda);
    const dyRaw = n(sd.dividendYield) ?? n(sd.trailingAnnualDividendYield);
    const v = {
      pe: n(sd.trailingPE), pb: n(ks.priceToBook), peg: n(ks.pegRatio ?? ks.trailingPegRatio),
      ev: n(ks.enterpriseToEbitda), ps: n(sd.priceToSalesTrailing12Months),
      roe: pct(fd.returnOnEquity), roa: pct(fd.returnOnAssets),
      opm: pct(fd.operatingMargins), npm: pct(fd.profitMargins),
      de: n(fd.debtToEquity) === null ? null : r2(fd.debtToEquity / 100),
      cr: n(fd.currentRatio), qr: n(fd.quickRatio),
      nde: debt !== null && cash !== null && ebitda ? r2((debt - cash) / ebitda) : null,
      ocf: (x => (x === null ? null : r2(x * 100)))(div(ocf, ks.netIncomeToCommon)),
      fcfm: (x => (x === null ? null : r2(x * 100)))(div(fcf, fd.totalRevenue)),
      fcfy: (x => (x === null ? null : r2(x * 100)))(div(fcf, mc)),
      capex: ocf && fcf !== null ? r2(((ocf - fcf) / ocf) * 100) : null,
      pro: pct(d.majorHoldersBreakdown?.insidersPercentHeldByInsiders),
      dy: dyRaw === null ? null : r2(dyRaw < 1 ? dyRaw * 100 : dyRaw),
    };
    Object.keys(v).forEach(k => v[k] === null && delete v[k]);
    res.json({
      symbol: sym, name: d.price?.longName || d.price?.shortName || sym,
      sector: d.assetProfile?.sector || "", industry: d.assetProfile?.industry || "",
      price: n(d.price?.regularMarketPrice), values: v,
    });
  } catch (e) { res.status(404).json({ error: "Could not fetch " + sym }); }
});

app.listen(process.env.PORT || 3000, () => console.log("Running"));
