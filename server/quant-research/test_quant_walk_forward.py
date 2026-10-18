import unittest
from quant_walk_forward import folds
class TestWalkForward(unittest.TestCase):
    def test_purge_and_nonoverlap(self):
        windows=list(folds(1000,300,100,60))
        self.assertTrue(windows)
        self.assertEqual(len(windows),6)
        for train,test in windows:
            self.assertEqual(test.start-train.stop,60)
            self.assertLess(train.stop,test.start)
            self.assertLessEqual(test.stop,1000)
    def test_insufficient(self):
        self.assertEqual(list(folds(100,300,100)),[])
if __name__=='__main__':unittest.main()
