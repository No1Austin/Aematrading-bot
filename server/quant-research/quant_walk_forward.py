"""EMA Quant Phase 3: purged walk-forward research, not live trading evidence.
Input: Phase 2 quant_dataset.py CSV. Models: prior-frequency and logistic regression.
Each fold refits on earlier data only; no tuning on the test fold.
"""
import argparse, csv, hashlib, json, math
from pathlib import Path
from datetime import datetime

FEATURES=('roc_5','roc_15','vol_20','atr_pct_14','relative_volume_20','vwap_deviation_20','range_pct_5')
HORIZONS=(5,15,60)

def folds(n, train, test, purge=60, step=None):
    step=step or test
    start=train+purge
    while start+test<=n:
        yield slice(0,start-purge),slice(start,start+test)
        start+=step

def regime(row):
    vol=float(row['vol_20']); trend=float(row['roc_15'])
    if abs(trend)>max(.001,vol*3):return 'TREND_BULL' if trend>0 else 'TREND_BEAR'
    return 'RANGE_OR_UNCLEAR'

def stats(y,p,ret,threshold,cost_bps):
    import numpy as np
    y=np.asarray(y);p=np.asarray(p);ret=np.asarray(ret)
    if not len(y):return None
    signal=np.where(p>=threshold,1,np.where(p<=1-threshold,-1,0))
    active=signal!=0
    net=signal[active]*ret[active]-cost_bps/10000
    # Direction-only hypothetical net returns; NOT executable setup PnL.
    return {'samples':int(len(y)),'accuracy':float(np.mean((p>=.5)==y)),
      'brier':float(np.mean((p-y)**2)), 'logLoss':float(-np.mean(y*np.log(np.clip(p,1e-9,1-1e-9))+(1-y)*np.log(np.clip(1-p,1e-9,1-1e-9)))),
      'selected':int(active.sum()),'selectionRate':float(active.mean()),
      'hypotheticalMeanNetReturnPerSelection':float(net.mean()) if len(net) else None,
      'hypotheticalMeanNetReturnPerObservation':float(net.sum()/len(y)),
      'costBpsRoundTripAssumed':cost_bps}

def run(dataset, output, train_rows=3000, test_rows=1000, step_rows=1000, threshold=.55, cost_bps=12):
    import numpy as np
    from sklearn.pipeline import make_pipeline
    from sklearn.impute import SimpleImputer
    from sklearn.preprocessing import StandardScaler
    from sklearn.linear_model import LogisticRegression
    if not (.5<=threshold<1):raise ValueError('threshold must be in [0.5,1)')
    if cost_bps<0:raise ValueError('cost-bps must be nonnegative')
    with open(dataset,newline='') as f:rows=list(csv.DictReader(f))
    if not rows or not set(FEATURES).issubset(rows[0]):raise ValueError('Missing Phase 2 dataset features')
    ts=[datetime.fromisoformat(r['timestamp']) for r in rows]
    if ts!=sorted(ts) or len(set(ts))!=len(ts):raise ValueError('Nonchronological or duplicate timestamps')
    x=np.array([[float(r[k]) for k in FEATURES] for r in rows]); regimes=[regime(r) for r in rows]
    all_folds=list(folds(len(rows),train_rows,test_rows,max(HORIZONS),step_rows))
    if not all_folds:raise ValueError('Insufficient data for a purged walk-forward fold; collect more candles or reduce --train-rows/--test-rows')
    result={'schemaVersion':'ema-quant-walk-forward-v1','validationStatus':'RESEARCH_ONLY_NOT_PRODUCTION_VALIDATED',
      'marketType':'SPOT_RESEARCH_INPUT_VERIFY_SOURCE','datasetSha256':hashlib.sha256(Path(dataset).read_bytes()).hexdigest(),
      'features':FEATURES,'purgeRows':max(HORIZONS),'threshold':threshold,'costBpsRoundTripAssumed':cost_bps,
      'caveats':['Spot candle-based direction proxy, not futures setup execution or target-before-stop simulation',
                 'Overlapping forecast labels and rolling tests remain serially dependent',
                 'Model threshold and costs are assumptions, not optimized or exchange-verified'], 'horizons':{}}
    for h in HORIZONS:
        y=np.array([int(r[f'bull_{h}m']) for r in rows]);ret=np.array([float(r[f'return_{h}m']) for r in rows]);reports=[]
        for i,(tr,te) in enumerate(all_folds,1):
            # Verify future label end of training precedes first test observation.
            last_label=datetime.fromisoformat(rows[tr.stop-1][f'label_end_{h}m'])
            if last_label>=ts[te.start]:raise ValueError('Training label overlaps test period')
            base=float(np.mean(y[tr])); baseline=np.full(te.stop-te.start,base)
            fold={'fold':i,'trainStart':rows[tr.start]['timestamp'],'trainEnd':rows[tr.stop-1]['timestamp'],
                  'testStart':rows[te.start]['timestamp'],'testEnd':rows[te.stop-1]['timestamp'],
                  'baseline':stats(y[te],baseline,ret[te],threshold,cost_bps)}
            if len(set(y[tr]))==2:
                model=make_pipeline(SimpleImputer(strategy='median'),StandardScaler(),LogisticRegression(max_iter=1000,random_state=42))
                model.fit(x[tr],y[tr]);probs=model.predict_proba(x[te])[:,1]
                fold['logistic']=stats(y[te],probs,ret[te],threshold,cost_bps)
                fold['byRegime']={k:stats(y[te][np.array(regimes[te])==k],probs[np.array(regimes[te])==k],ret[te][np.array(regimes[te])==k],threshold,cost_bps) for k in sorted(set(regimes[te]))}
            else:fold['logistic']=None
            reports.append(fold)
        result['horizons'][f'{h}m']={'folds':reports,'foldCount':len(reports)}
    Path(output).parent.mkdir(parents=True,exist_ok=True)
    Path(output).write_text(json.dumps(result,indent=2)+'\n')
    return {'output':output,'folds':len(all_folds),'status':result['validationStatus']}

def main():
    p=argparse.ArgumentParser();p.add_argument('--dataset',required=True);p.add_argument('--output',required=True)
    p.add_argument('--train-rows',type=int,default=3000);p.add_argument('--test-rows',type=int,default=1000)
    p.add_argument('--step-rows',type=int,default=1000);p.add_argument('--threshold',type=float,default=.55);p.add_argument('--cost-bps',type=float,default=12)
    a=p.parse_args()
    if min(a.train_rows,a.test_rows,a.step_rows)<1:raise SystemExit('Row windows must be positive')
    print(json.dumps(run(a.dataset,a.output,a.train_rows,a.test_rows,a.step_rows,a.threshold,a.cost_bps)))
if __name__=='__main__':main()
