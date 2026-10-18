import unittest, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from quant_dataset import make_dataset
class GapSafety(unittest.TestCase):
 def test_gap_exclusion(self):
  def candle(t):return dict(timestamp=t,open=100.,high=101.,low=99.,close=100.+(t%600)/10000,volume=10.)
  candles=[candle(i*60) for i in range(100)]+[candle((i+101)*60) for i in range(100)]
  rows=make_dataset(candles)
  self.assertEqual(len(rows),2*(100-21-60))
  for r in rows:
   for h in (5,15,60):
    from datetime import datetime
    self.assertEqual((datetime.fromisoformat(r[f'label_end_{h}m'])-datetime.fromisoformat(r['timestamp'])).total_seconds(),h*60)
if __name__=='__main__':unittest.main()
