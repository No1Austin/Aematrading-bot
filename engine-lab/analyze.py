#!/usr/bin/env python3
"""Offline diagnostic only. No trades or bot settings are changed."""
import json,sys,csv,collections,statistics,pathlib
memory=json.load(open(sys.argv[1]))['records']; ledger=json.load(open(sys.argv[2])); out=pathlib.Path(sys.argv[3] if len(sys.argv)>3 else '.');out.mkdir(parents=True,exist_ok=True)
def total(rs):return sum(float(x.get('realizedPnlUsd') or 0) for x in rs)
def stats(rs):
 w=[r for r in rs if r['realizedPnlUsd']>0];loss=[r for r in rs if r['realizedPnlUsd']<0]
 return {'n':len(rs),'wins':len(w),'losses':len(loss),'win_rate':round(len(w)/len(rs)*100,1) if rs else None,'net_usd':round(total(rs),2),'avg_win':round(total(w)/len(w),2) if w else None,'avg_loss':round(total(loss)/len(loss),2) if loss else None,'profit_factor':round(total(w)/abs(total(loss)),2) if loss and total(loss) else None}
def score(r,engine):
 d=r.get('entrySnapshot',{}).get('directionDecision',{});e=d.get('contributions',{}).get(engine,{})
 return e.get('long' if r.get('direction')=='LONG' else 'short') if e.get('available') else None
m={r['tradeId']:r for r in memory};l={r['id']:r for r in ledger['closedPositions']}
common=m.keys()&l.keys(); discrepancies=[{'id':k,'symbol':m[k]['symbol'],'memory':round(m[k]['realizedPnlUsd'],2),'ledger':round(l[k]['realizedPnlUsd'],2),'partial':round(m[k].get('partialRealizedPnlUsd',0),2)} for k in common if abs(m[k]['realizedPnlUsd']-l[k]['realizedPnlUsd'])>.01]
bydirection={d:stats([r for r in memory if r['direction']==d]) for d in ('LONG','SHORT')}
byexit={k:stats(v) for k,v in sorted(((k,[r for r in memory if r.get('exitReason')==k]) for k in set(r.get('exitReason') for r in memory)))}
engines={}
for engine in ('technical','fundamental','marketStructure','liquidity'):
 engines[engine]={}
 for outcome in ('WIN','LOSS'):
  vals=[score(r,engine) for r in memory if r['outcome']==outcome]; vals=[v for v in vals if isinstance(v,(int,float))]
  engines[engine][outcome]={'count':len(vals),'mean':round(statistics.mean(vals),2) if vals else None}
# Strictly exploratory counterfactual selection on *already executed* trades. Not a backtest.
experiments={}
for label,predicate in {
 'technical_and_structure_both_favor_direction':lambda r:all(score(r,e) is not None and score(r,e)>50 for e in ('technical','marketStructure')),
 'technical_and_structure_both_at_least_60':lambda r:all(score(r,e) is not None and score(r,e)>=60 for e in ('technical','marketStructure')),
 'technical_and_structure_both_at_least_65':lambda r:all(score(r,e) is not None and score(r,e)>=65 for e in ('technical','marketStructure')),
 'direction_separation_at_least_20':lambda r:(r.get('entrySnapshot',{}).get('directionDecision',{}).get('separation') or 0)>=20,
 'bullish_only':lambda r:r['direction']=='LONG',
}.items():
 subset=[r for r in memory if predicate(r)];experiments[label]=stats(subset)
result={'source_note':'Uploaded snapshot; exploratory, not forward-tested. Existing trades only; rejected setups and future opportunity costs unknown.','memory':stats(memory),'ledger':{'reported_realized':round(ledger['realizedPnlUsd'],2),'closed_positions_sum':round(total(ledger['closedPositions']),2),'open_positions_partial_sum':round(sum(p.get('partialRealizedPnlUsd',0) for p in ledger['positions']),2),'closed_count':len(ledger['closedPositions'])},'reconciliation':{'matched_ids':len(common),'only_memory':[{'id':k,'symbol':m[k]['symbol']} for k in m.keys()-l.keys()],'only_ledger':[{'id':k,'symbol':l[k]['symbol']} for k in l.keys()-m.keys()],'pnl_disagreements':discrepancies},'by_direction':bydirection,'by_exit':byexit,'engine_directional_entry_scores':engines,'exploratory_executed_trade_subsets':experiments}
(out/'analysis.json').write_text(json.dumps(result,indent=2,ensure_ascii=False))
with (out/'trade_features.csv').open('w',newline='') as f:
 keys=['trade_id','symbol','direction','opened_at','outcome','pnl_usd','r_multiple','exit_reason','technical','fundamental','market_structure','liquidity','separation','confidence','risk_reward','spread_percent','slippage_percent','duration_minutes','mfe_usd','mae_usd']
 w=csv.DictWriter(f,fieldnames=keys);w.writeheader()
 for r in memory:
  s=r.get('entrySnapshot',{});d=s.get('directionDecision',{});setup=s.get('setup',{})
  w.writerow(dict(zip(keys,[r['tradeId'],r['symbol'],r['direction'],r['openedAt'],r['outcome'],r['realizedPnlUsd'],r.get('rMultiple'),r.get('exitReason'),score(r,'technical'),score(r,'fundamental'),score(r,'marketStructure'),score(r,'liquidity'),d.get('separation'),d.get('confidence'),setup.get('riskReward'),setup.get('spreadPercent'),setup.get('slippagePercent'),r.get('durationMinutes'),r.get('mfeUsd'),r.get('maeUsd')])))
print(json.dumps(result,indent=2,ensure_ascii=False))
