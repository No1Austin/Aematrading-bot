"""Tests for gap-tolerant, leakage-safe EMA Quant dataset generation."""
import csv
import os
import tempfile
import unittest
from quant_dataset import make_dataset, read_candles


class DatasetTests(unittest.TestCase):
    def test_future_prices_not_in_features(self):
        candles = [
            {'timestamp': i * 60, 'open': 100 + i * .01,
             'high': 101 + i * .01, 'low': 99 + i * .01,
             'close': 100 + i * .01, 'volume': 100}
            for i in range(200)
        ]
        original = make_dataset(candles)
        altered = [dict(c) for c in candles]
        for i in range(100, len(altered)):
            for key in ('close', 'open', 'high', 'low'):
                altered[i][key] *= 1.01
        new = make_dataset(altered)
        for key in ('roc_5', 'roc_15', 'vol_20', 'atr_pct_14',
                    'relative_volume_20', 'vwap_deviation_20', 'range_pct_5'):
            self.assertEqual(original[60][key], new[60][key])
        self.assertNotEqual(original[60]['return_60m'], new[60]['return_60m'])

    def test_gaps_preserved_and_not_crossed(self):
        # Two sufficiently long contiguous segments separated by a missing minute.
        timestamps = [i * 60 for i in range(150)] + [i * 60 for i in range(151, 301)]
        with tempfile.NamedTemporaryFile('w', suffix='.csv', delete=False) as f:
            name = f.name
            writer = csv.DictWriter(f, fieldnames=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            writer.writeheader()
            for t in timestamps:
                writer.writerow({'timestamp': t, 'open': 100, 'high': 101,
                                 'low': 99, 'close': 100, 'volume': 1})
        try:
            candles = read_candles(name)
            self.assertEqual(len(candles), 300)
            self.assertEqual(candles[150]['timestamp'] - candles[149]['timestamp'], 120)
            rows = make_dataset(candles)
            self.assertGreater(len(rows), 0)
            gap_start = timestamps[149]
            gap_end = timestamps[150]
            for row in rows:
                start = __import__('datetime').datetime.fromisoformat(row['timestamp']).timestamp()
                for horizon in (5, 15, 60):
                    end = __import__('datetime').datetime.fromisoformat(row[f'label_end_{horizon}m']).timestamp()
                    self.assertFalse(start <= gap_start and end >= gap_end,
                                     'Feature/label window crossed a missing candle')
        finally:
            os.unlink(name)


if __name__ == '__main__':
    unittest.main()
