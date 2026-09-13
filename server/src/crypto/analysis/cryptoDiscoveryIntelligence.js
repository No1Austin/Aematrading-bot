/**
 * ============================================================
 * CRYPTO DISCOVERY INTELLIGENCE AGGREGATOR
 * ============================================================
 */

import analyzeCryptoVolumeQuality from
  "./cryptoVolumeQualityEngine.js";

import analyzeCryptoVenues from
  "./cryptoVenueIntelligenceEngine.js";

import analyzeCryptoLiquidity from
  "./cryptoLiquidityEngine.js";

import analyzeEmergingProject from
  "./cryptoEmergingProjectEngine.js";

import analyzeProjectIntegrity from
  "./cryptoProjectIntegrityEngine.js";

export function buildCryptoDiscoveryIntelligence(
  measurement,
) {
  return {
    volumeQuality:
      analyzeCryptoVolumeQuality(
        measurement,
      ),

    venueIntelligence:
      analyzeCryptoVenues(
        measurement,
      ),

    liquidity:
      analyzeCryptoLiquidity(
        measurement,
      ),

    emergingProject:
      analyzeEmergingProject(
        measurement,
      ),

    projectIntegrity:
      analyzeProjectIntegrity(
        measurement,
      ),
  };
}

export default
  buildCryptoDiscoveryIntelligence;
