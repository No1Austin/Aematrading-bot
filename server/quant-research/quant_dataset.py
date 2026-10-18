"""Leakage-safe 1-minute OHLCV dataset for EMA Quant V1. Research only."""
import argparse, csv, json, math
from datetime import datetime, timezone
from pathlib import Path

HORIZONS=(5,15,60)
FEATURES=('roc_5','roc_15','vol_20','atr_pct_14','relative_volume_20','vwap_deviation_20','range_pct_5')

def timestamp(value):
    if value.isdigit():
        n=int(value)
        return n/1000 if n>10**11 else float(n)
    return datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()

def read_candles(path):
    with open(path,newline='') as f: rows=list(csv.DictReader(f))
    required={'timestamp','open','high','low','close','volume'}
    if not rows or not required.issubset(rows[0]): raise ValueError(f'CSV must have columns {sorted(required)}')
    candles=[]
    for r in rows:
        c={'timestamp':timestamp(r['timestamp'])}
        c.update({k:float(r[k]) for k in ('open','high','low','close','volume')})
        if not all(math.isfinite(v) for v in c.values()): raise ValueError('Nonfinite candle')
        if c['close']<=0 or c['open']<=0 or c['volume']<0 or c['low']<=0 or c['high']<max(c['open'],c['close'],c['low']) or c['low']>min(c['open'],c['close']): raise ValueError('Invalid OHLCV candle')
        candles.append(c)
    candles.sort(key=lambda x:x['timestamp'])
    if len({c['timestamp'] for c in candles})!=len(candles): raise ValueError('Duplicate timestamps')
    # Gaps are allowed in raw history; feature and label windows must remain contiguous.
    return candles

def make_dataset(candles):
    # O(N) history traversal; process contiguous segments independently so neither
    # features nor future labels cross an exchange-data gap.
    result=[]
    boundaries=[0]
    for i in range(1,len(candles)):
        if round(candles[i]['timestamp']-candles[i-1]['timestamp'])!=60:
            boundaries.append(i)
    boundaries.append(len(candles))
    for left,right in zip(boundaries,boundaries[1:]):
        for i in range(left+21,right-max(HORIZONS)):
            last=candles[i]; close=last['close'];window=candles[i-19:i+1]
            returns=[math.log(candles[j]['close']/candles[j-1]['close']) for j in range(i-19,i+1)]
            avg=sum(returns)/len(returns)
            volatility=math.sqrt(sum((x-avg)**2 for x in returns)/len(returns))
            trs=[max(candles[j]['high']-candles[j]['low'],abs(candles[j]['high']-candles[j-1]['close']),abs(candles[j]['low']-candles[j-1]['close'])) for j in range(i-13,i+1)]
            volume_avg=sum(c['volume'] for c in candles[i-20:i])/20
            total_volume=sum(c['volume'] for c in window)
            vwap=sum((c['high']+c['low']+c['close'])/3*c['volume'] for c in window)/total_volume if total_volume>0 else close
            row={'timestamp':datetime.fromtimestamp(last['timestamp'],tz=timezone.utc).isoformat(),'close':close,
                'roc_5':close/candles[i-5]['close']-1,'roc_15':close/candles[i-15]['close']-1,
                'vol_20':volatility,'atr_pct_14':sum(trs)/14/close,
                'relative_volume_20':last['volume']/volume_avg if volume_avg>0 else 0,
                'vwap_deviation_20':close/vwap-1,
                'range_pct_5':(max(c['high'] for c in candles[i-4:i+1])-min(c['low'] for c in candles[i-4:i+1]))/close}
            for horizon in HORIZONS:
                future=candles[i+horizon]['close']; r=future/close-1
                row[f'return_{horizon}m']=r
                row[f'bull_{horizon}m']=int(r>0)
                row[f'label_end_{horizon}m']=datetime.fromtimestamp(candles[i+horizon]['timestamp'],tz=timezone.utc).isoformat()
            result.append(row)
    return result

def main():
    p=argparse.ArgumentParser(); p.add_argument('--candles',required=True); p.add_argument('--output',required=True); a=p.parse_args()
    rows=make_dataset(read_candles(a.candles))
    if not rows: raise SystemExit('Not enough history for 60-minute labels; need at least 83 contiguous candles')
    Path(a.output).parent.mkdir(parents=True,exist_ok=True)
    with open(a.output,'w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    print(json.dumps({'rows':len(rows),'output':a.output,'horizons':HORIZONS,'note':'Historical labels are for offline training only; never expose as live features'}))
if __name__=='__main__':main()
