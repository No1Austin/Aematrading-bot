import unittest
from datetime import datetime,timedelta,timezone
from quant_setup_outcomes import label_setup

T=datetime(2026,1,1,tzinfo=timezone.utc)
def setup(direction='BULL'):
    return dict(timestamp=T.isoformat(),symbol='BTC-USD',instrument_type='SPOT',strategy='TEST',direction=direction,entry='100',stop='99' if direction=='BULL' else '101',target='102' if direction=='BULL' else '98')
def candles(changes=None,n=10):
    changes={1:(103,104,103,103),2:(100,100.2,99.8,100),**(changes or {})}
    return [(T+timedelta(minutes=i),*changes.get(i,(100,100.2,99.8,100))) for i in range(1,n+1)]
class Tests(unittest.TestCase):
    def test_target_first(self):
        c=candles({3:(100,102.1,99.9,101)})
        r=label_setup(setup(),c,10,5)
        self.assertEqual(r['outcome'],'TARGET_FIRST')
        self.assertAlmostEqual(r['hypotheticalNetR'],1.88)
    def test_stop_first(self):
        c=candles({3:(100,100.1,98.9,99)})
        self.assertEqual(label_setup(setup(),c,10,5)['outcome'],'STOP_FIRST')
    def test_ambiguous_entry(self):
        c=candles({1:(100,102.1,99.9,101)})
        self.assertEqual(label_setup(setup(),c,10,5)['outcome'],'AMBIGUOUS_ENTRY_CANDLE')
    def test_ambiguous_both(self):
        c=candles({3:(100,102.2,98.8,100)})
        self.assertEqual(label_setup(setup(),c,10,5)['outcome'],'AMBIGUOUS_BOTH_HIT')
    def test_gap(self):
        c=[x for x in candles() if x[0]!=T+timedelta(minutes=4)]
        self.assertEqual(label_setup(setup(),c,10,5)['outcome'],'DATA_GAP')
    def test_no_entry(self):
        c=[(x[0],105,106,104,105) for x in candles()]
        self.assertEqual(label_setup(setup(),c,10,5)['outcome'],'NO_ENTRY')
    def test_bear_target(self):
        c=candles({3:(100,100.1,97.9,99)})
        self.assertEqual(label_setup(setup('BEAR'),c,10,5)['outcome'],'TARGET_FIRST')
    def test_no_lookahead(self):
        c=candles({3:(100,102.1,99.9,101)})
        self.assertEqual(label_setup(setup(),c,10,5)['entryActivatedAt'],(T+timedelta(minutes=2)).isoformat())
if __name__=='__main__':unittest.main()
