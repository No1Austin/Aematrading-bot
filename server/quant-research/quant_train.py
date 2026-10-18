"""Chronological baseline and logistic prediction validation; no live trading authority."""
import argparse, csv, json, math, hashlib
from pathlib import Path
from datetime import datetime
from quant_dataset import FEATURES, HORIZONS

def evaluate(y, prob, ret):
    eps=1e-9
    return {'samples':len(y),'accuracy':sum((p>=.5)==bool(t) for p,t in zip(prob,y))/len(y),
            'brier':sum((p-t)**2 for p,t in zip(prob,y))/len(y),
            'log_loss':-sum(t*math.log(max(eps,min(1-eps,p)))+(1-t)*math.log(max(eps,min(1-eps,1-p))) for p,t in zip(prob,y))/len(y),
            'mean_realized_return':sum(ret)/len(ret)}

def main():
    p=argparse.ArgumentParser();p.add_argument('--dataset',required=True);p.add_argument('--output',required=True);p.add_argument('--min-rows',type=int,default=1500);a=p.parse_args()
    try:
        import numpy as np
        from sklearn.pipeline import make_pipeline
        from sklearn.impute import SimpleImputer
        from sklearn.preprocessing import StandardScaler
        from sklearn.linear_model import LogisticRegression
    except ImportError as e: raise SystemExit('Install dependencies: python3 -m pip install -r quant-research/requirements.txt') from e
    with open(a.dataset,newline='') as f:rows=list(csv.DictReader(f))
    if len(rows)<a.min_rows:raise SystemExit(f'Insufficient dataset: {len(rows)} rows; require >= {a.min_rows}. Collect more real historical candles.')
    times=[datetime.fromisoformat(r['timestamp']) for r in rows]
    if times!=sorted(times) or len(set(times))!=len(times):raise SystemExit('Dataset must be chronological with unique timestamps')
    X=np.array([[float(r[k]) for k in FEATURES] for r in rows]);n=len(rows)
    # Purge 60 observations at each boundary to avoid overlapping label leakage.
    train_end=int(n*.6);val_end=int(n*.8);embargo=max(HORIZONS)
    splits={'train':slice(0,train_end-embargo),'validation':slice(train_end,val_end-embargo),'test':slice(val_end,n)}
    if min(len(X[s]) for s in splits.values())<100:raise SystemExit('Too few rows after purged splits')
    result={'schemaVersion':'ema-quant-validation-v1','validationStatus':'RESEARCH_ONLY_NOT_PRODUCTION_VALIDATED',
        'features':FEATURES,'purgeRows':embargo,'split':{k:{'start':rows[s.start or 0]['timestamp'],'end':rows[s.stop-1]['timestamp'] if s.stop is not None else rows[-1]['timestamp'],'rows':len(X[s])} for k,s in splits.items()},'horizons':{}}
    for h in HORIZONS:
        y=np.array([int(r[f'bull_{h}m']) for r in rows]);returns=np.array([float(r[f'return_{h}m']) for r in rows]);
        base=float(np.mean(y[splits['train']]))
        baseline={part:evaluate(y[s],np.full(len(y[s]),base),returns[s]) for part,s in splits.items()}
        if len(set(y[splits['train']]))<2:
            result['horizons'][f'{h}m']={'baseline':baseline,'model':'NOT_TRAINABLE_SINGLE_CLASS'};continue
        model=make_pipeline(SimpleImputer(strategy='median'),StandardScaler(),LogisticRegression(max_iter=1000,random_state=42))
        model.fit(X[splits['train']],y[splits['train']]);prediction={part:evaluate(y[s],model.predict_proba(X[s])[:,1],returns[s]) for part,s in splits.items()}
        result['horizons'][f'{h}m']={'baseline':baseline,'logistic':prediction,'test_brier_improvement':baseline['test']['brier']-prediction['test']['brier']}
    source_hash=hashlib.sha256(Path(a.dataset).read_bytes()).hexdigest()
    result['datasetSha256']=source_hash
    Path(a.output).parent.mkdir(parents=True,exist_ok=True)
    Path(a.output).write_text(json.dumps(result,indent=2))
    print(json.dumps({'output':a.output,'datasetSha256':source_hash,'validationStatus':result['validationStatus']}))
if __name__=='__main__':main()
