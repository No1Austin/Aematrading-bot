#!/usr/bin/env python3
"""Offline point-in-time setup outcome labeler. Research only, never execution."""
import argparse,csv,json,math
from datetime import datetime,timezone,timedelta
from pathlib import Path

REQUIRED_SETUP=('timestamp','symbol','instrument_type','strategy','direction','entry','stop','target')
REQUIRED_CANDLE=('timestamp','open','high','low','close','volume')

def stamp(s):
    s=str(s).strip()
    if s.endswith('Z'):s=s[:-1]+'+00:00'
    d=datetime.fromisoformat(s)
    if d.tzinfo is None:raise ValueError('Timestamps must include timezone')
    return d.astimezone(timezone.utc)

def number(s):
    v=float(s)
    if not math.isfinite(v):raise ValueError('nonfinite price')
    return v

def load_candles(path):
    out=[]
    with open(path,newline='') as f:
        r=csv.DictReader(f)
        if not set(REQUIRED_CANDLE)<=set(r.fieldnames or []):raise ValueError('missing candle columns')
        for row in r:
            t=stamp(row['timestamp']);o,h,l,c=[number(row[k]) for k in ('open','high','low','close')]
            if min(o,h,l,c)<=0 or h<max(o,c,l) or l>min(o,c,h):raise ValueError('invalid OHLC at '+str(t))
            out.append((t,o,h,l,c))
    out.sort(key=lambda x:x[0])
    if len(set(x[0] for x in out))!=len(out):raise ValueError('duplicate candle timestamp')
    return out

def label_setup(s,candles,horizon_minutes=60,entry_window_minutes=15,cost_bps=12):
    """Candle timestamps are OPEN times. Signal must be at a completed minute boundary.
    Entry is conservatively filled at requested price only if later candle range touches it.
    Same-candle entry + exit cannot be sequenced from OHLC -> AMBIGUOUS.
    """
    t=stamp(s['timestamp']);direction=s['direction'].upper()
    if direction not in ('BULL','BEAR'):raise ValueError('direction must be BULL or BEAR')
    instrument=s['instrument_type'].upper()
    if instrument not in ('SPOT','PERPETUAL'):raise ValueError('instrument_type must be SPOT or PERPETUAL')
    e,stop,target=[number(s[k]) for k in ('entry','stop','target')]
    if not (min(e,stop,target)>0 and (stop<e<target if direction=='BULL' else target<e<stop)):
        raise ValueError('invalid setup geometry')
    if horizon_minutes<=0 or entry_window_minutes<=0:raise ValueError('invalid time window')
    if t.second or t.microsecond:raise ValueError('signal timestamp must align to minute')
    # Signal at t means t is the timestamp of the last CLOSED candle. Earliest next candle opens at t+1min.
    start=t+timedelta(minutes=1)
    end=t+timedelta(minutes=horizon_minutes)
    window=[c for c in candles if start<=c[0]<=end]
    base={k:s[k] for k in REQUIRED_SETUP}
    base.update({'schemaVersion':'ema-quant-setup-outcomes-v1','horizonMinutes':horizon_minutes,
                 'entryWindowMinutes':entry_window_minutes,'roundTripCostBpsAssumed':cost_bps,
                 'outcome':None,'entryActivatedAt':None,'resolvedAt':None,'hypotheticalNetR':None,
                 'researchOnly':True,'executionAuthority':False})
    if len(window)!=horizon_minutes or any(c[0]!=start+timedelta(minutes=i) for i,c in enumerate(window)):
        base['outcome']='DATA_GAP';return base
    active=False
    for i,(ct,o,h,l,c) in enumerate(window):
        if not active:
            if i>=entry_window_minutes:
                base['outcome']='NO_ENTRY';return base
            if not l<=e<=h:continue
            active=True;base['entryActivatedAt']=ct.isoformat()
            # OHLC cannot resolve whether stop/target was hit before/after the entry touch.
            if ((l<=stop or h>=target) if direction=='BULL' else (h>=stop or l<=target)):
                base['outcome']='AMBIGUOUS_ENTRY_CANDLE';base['resolvedAt']=ct.isoformat();return base
            continue
        hit_stop=l<=stop if direction=='BULL' else h>=stop
        hit_target=h>=target if direction=='BULL' else l<=target
        if hit_stop and hit_target:
            base['outcome']='AMBIGUOUS_BOTH_HIT';base['resolvedAt']=ct.isoformat();return base
        if hit_stop or hit_target:
            base['outcome']='STOP_FIRST' if hit_stop else 'TARGET_FIRST'
            base['resolvedAt']=ct.isoformat()
            risk=abs(e-stop)/e;gross=(-risk if hit_stop else abs(target-e)/e)
            base['hypotheticalNetR']=(gross-cost_bps/10000)/risk
            return base
    base['outcome']='UNRESOLVED' if active else 'NO_ENTRY'
    return base

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--candles',required=True);p.add_argument('--setups',required=True)
    p.add_argument('--output',required=True);p.add_argument('--horizon-minutes',type=int,default=60)
    p.add_argument('--entry-window-minutes',type=int,default=15)
    p.add_argument('--cost-bps',type=float,default=12)
    p.add_argument('--candle-symbol',required=True)
    p.add_argument('--instrument-type',choices=['SPOT','PERPETUAL'],required=True)
    a=p.parse_args()
    if a.cost_bps<0 or not math.isfinite(a.cost_bps):p.error('invalid cost')
    candles=load_candles(a.candles)
    with open(a.setups,newline='') as f:
        reader=csv.DictReader(f)
        if not set(REQUIRED_SETUP)<=set(reader.fieldnames or []):p.error('missing setup columns')
        setups=list(reader)
    output=[]
    for s in setups:
        if s['symbol']!=a.candle_symbol or s['instrument_type'].upper()!=a.instrument_type:
            raise ValueError('INSTRUMENT_MISMATCH: '+s['symbol']+' '+s['instrument_type'])
        output.append(label_setup(s,candles,a.horizon_minutes,a.entry_window_minutes,a.cost_bps))
    dest=Path(a.output);dest.parent.mkdir(parents=True,exist_ok=True)
    with dest.open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(REQUIRED_SETUP)+[k for k in (output[0] if output else {}) if k not in REQUIRED_SETUP]);writer.writeheader();writer.writerows(output)
    counts={k:sum(x['outcome']==k for x in output) for k in sorted(set(x['outcome'] for x in output))}
    print(json.dumps({'output':str(dest),'rows':len(output),'outcomes':counts,'status':'RESEARCH_ONLY_NOT_PRODUCTION_VALIDATED'}))

if __name__=='__main__':main()
