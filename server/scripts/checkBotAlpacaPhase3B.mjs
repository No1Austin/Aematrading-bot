import { reconcileBotAlpacaPaperPositions } from '../src/crypto/bot/alpaca/botAlpacaPaperPositionManager.js';
console.log(JSON.stringify(await reconcileBotAlpacaPaperPositions(), null, 2));
