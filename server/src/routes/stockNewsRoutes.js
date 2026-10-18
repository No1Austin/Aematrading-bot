import express from "express";
import { getMarketNewsFeed } from "../services/marketNewsService.js";
const router = express.Router();
router.get("/", async (req, res) => {
  const symbol = String(req.query.symbol ?? "").trim().toUpperCase();
  if (symbol && !/^[A-Z][A-Z0-9.\-]{0,14}$/.test(symbol)) return res.status(400).json({error:"Invalid stock ticker."});
  try {
    const result = await getMarketNewsFeed({symbols:symbol?[symbol]:[],limit:20,bypassCache:req.query.refresh === "true"});
    const news = (result.news ?? []).map(article => ({
      id: article.id ?? article.url ?? article.headline,
      title: article.headline ?? "",
      description: article.summary ?? "",
      source: article.source ?? article.provider ?? "Market News",
      publishedAt: article.createdAt ?? article.updatedAt ?? null,
      articleUrl: article.url ?? null,
      imageUrl: article.imageUrl ?? article.image_url ?? null,
      symbols: article.symbols ?? [],
    })).filter(article => article.title && (!symbol || article.symbols.includes(symbol)));
    // Provider results are not padded with unrelated stories.
    const featured = [...news.filter(item=>item.imageUrl),...news.filter(item=>!item.imageUrl)].slice(0,4);
    res.json({approved:result.approved === true,status:result.status,source:result.source,stale:result.cache?.stale===true,fetchedAt:result.timestamp,count:news.length,news,latest:news,featured,errors:result.errors ?? []});
  } catch (error) {
    res.status(503).json({approved:false,error:"Stock news service unavailable.",news:[],latest:[],featured:[]});
  }
});
export default router;
