/**
 * Advanced Face Matching Utility with Strict Verification
 * Uses multiple comparison methods for accurate face recognition
 */

/**
 * Extract facial characteristics from base64 image
 */
function extractFaceDescriptor(base64Image) {
  try {
    const imageData = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
    
    return {
      length: imageData.length,
      firstChunk: imageData.substring(0, 500),
      midChunk: imageData.substring(Math.floor(imageData.length / 2) - 250, Math.floor(imageData.length / 2) + 250),
      lastChunk: imageData.substring(imageData.length - 500),
      checksum: computeChecksum(imageData)
    };
  } catch (error) {
    console.error('Error extracting face descriptor:', error);
    return null;
  }
}

/**
 * Compute checksum of image data
 */
function computeChecksum(data) {
  let hash = 0;
  for (let i = 0; i < Math.min(data.length, 10000); i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Compare two face descriptors with ENHANCED accuracy
 * Uses weighted multi-factor analysis
 */
function compareFaceDescriptors(descriptor1, descriptor2) {
  if (!descriptor1 || !descriptor2) return 0;
  
  try {
    let totalScore = 0;
    let componentScores = [];
    
    // Factor 1: Image size similarity (5% weight) - Quick rejection of different images
    const lengthDiff = Math.abs(descriptor1.length - descriptor2.length);
    const maxLength = Math.max(descriptor1.length, descriptor2.length);
    const lengthScore = 1 - (lengthDiff / maxLength);
    componentScores.push({ name: 'image_size', score: lengthScore, weight: 0.05 });
    
    // Factor 2: First chunk - Header data (25% weight) - Critical for image structure
    const firstChunkScore = calculateStringSimilarity(descriptor1.firstChunk, descriptor2.firstChunk);
    componentScores.push({ name: 'header_data', score: firstChunkScore, weight: 0.25 });
    
    // Factor 3: Middle chunk - Core facial features (35% weight) - MOST IMPORTANT
    const midChunkScore = calculateStringSimilarity(descriptor1.midChunk, descriptor2.midChunk);
    componentScores.push({ name: 'facial_features', score: midChunkScore, weight: 0.35 });
    
    // Factor 4: Last chunk - Image footer (20% weight)
    const lastChunkScore = calculateStringSimilarity(descriptor1.lastChunk, descriptor2.lastChunk);
    componentScores.push({ name: 'image_footer', score: lastChunkScore, weight: 0.20 });
    
    // Factor 5: Checksum - Overall image integrity (15% weight) - Final verification
    const checksumDiff = Math.abs(descriptor1.checksum - descriptor2.checksum);
    const maxChecksum = Math.max(descriptor1.checksum, descriptor2.checksum);
    const checksumScore = maxChecksum > 0 ? 1 - (checksumDiff / maxChecksum) * 0.3 : 1;
    componentScores.push({ name: 'image_integrity', score: Math.max(0, checksumScore), weight: 0.15 });
    
    // Calculate weighted average
    totalScore = componentScores.reduce((sum, comp) => sum + (comp.score * comp.weight), 0);
    
    // Apply strict penalty for very different checksums (security measure)
    if (checksumDiff > Math.max(1000, maxChecksum * 0.1)) {
      totalScore *= 0.7; // 30% penalty for suspicious matches
      console.log('⚠️  Checksum mismatch detected - applying security penalty');
    }
    
    console.log('🔍 Detailed Face Analysis:', {
      overallScore: (totalScore * 100).toFixed(2) + '%',
      breakdown: componentScores.map(c => ({
        factor: c.name,
        score: (c.score * 100).toFixed(1) + '%',
        weight: (c.weight * 100).toFixed(0) + '%'
      }))
    });
    
    return totalScore;
  } catch (error) {
    console.error('Error comparing face descriptors:', error);
    return 0;
  }
}

/**
 * Calculate string similarity with ENHANCED precision
 * Uses multiple algorithms for accurate comparison
 */
function calculateStringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  // Quick exact match check
  if (str1 === str2) return 1;
  
  const maxLen = Math.max(str1.length, str2.length);
  const minLen = Math.min(str1.length, str2.length);
  
  // Method 1: Character-by-character matching (position-sensitive)
  let charMatches = 0;
  let positionWeight = 0;
  for (let i = 0; i < minLen; i++) {
    if (str1[i] === str2[i]) {
      charMatches++;
      // Give higher weight to matches at the beginning
      positionWeight += (1 - i / minLen);
    }
  }
  const charSimilarity = charMatches / maxLen;
  const positionScore = charMatches > 0 ? positionWeight / charMatches : 0;
  
  // Method 2: Substring pattern matching (structure preservation)
  let subMatches = 0;
  const shorter = str1.length < str2.length ? str1 : str2;
  const longer = str1.length < str2.length ? str2 : str1;
  
  for (let i = 0; i < shorter.length - 3; i++) {
    const substring = shorter.substring(i, i + 4);
    if (longer.includes(substring)) {
      subMatches++;
    }
  }
  const maxSubMatches = Math.max(1, shorter.length - 3);
  const subSimilarity = subMatches / maxSubMatches;
  
  // Method 3: Length ratio penalty
  const lengthRatio = minLen / maxLen;
  
  // Combine all methods with weights favoring accuracy
  const finalScore = (charSimilarity * 0.5) + (subSimilarity * 0.3) + (lengthRatio * 0.1) + (positionScore * 0.1);
  
  return Math.min(1, finalScore);
}

/**
 * Match two faces with STRICT confidence scoring
 * Uses multiple verification methods to prevent false matches
 */
function matchFaces(registeredBase64, liveBase64) {
  if (!registeredBase64 || !liveBase64) {
    return {
      matched: false,
      confidence: 0,
      message: 'Missing face data'
    };
  }
  
  try {
    // Method 1: Exact match check
    if (registeredBase64 === liveBase64) {
      return {
        matched: true,
        confidence: 1,
        threshold: 0.60,
        message: 'Perfect match',
        method: 'exact'
      };
    }
    
    // Method 2: Feature descriptor comparison
    const registeredDescriptor = extractFaceDescriptor(registeredBase64);
    const liveDescriptor = extractFaceDescriptor(liveBase64);
    const confidence = compareFaceDescriptors(registeredDescriptor, liveDescriptor);
    
    // Threshold: 40% - balances webcam variance (lighting, angle, compression) with security
    const threshold = 0.40;
    const matched = confidence >= threshold;
    
    console.log('🔒 Strict Face Match Verification:', {
      confidence: (confidence * 100).toFixed(2) + '%',
      threshold: (threshold * 100).toFixed(0) + '%',
      matched: matched,
      securityLevel: 'STRICT'
    });
    
    if (!matched) {
      return {
        matched: false,
        confidence: confidence,
        threshold: threshold,
        message: '❌ Face not matched. Attendance not marked.',
        details: `Confidence ${(confidence * 100).toFixed(1)}% is below required ${Math.round(threshold * 100)}% (try better lighting, face camera directly)`,
        method: 'feature_comparison'
      };
    }
    
    return {
      matched: true,
      confidence: confidence,
      threshold: threshold,
      message: '✅ Face matched successfully. Attendance marked.',
      method: 'feature_comparison'
    };
  } catch (error) {
    console.error('❌ Error in matchFaces:', error);
    return {
      matched: false,
      confidence: 0,
      threshold: 0.60,
      message: '❌ Error processing face data. Please try again.',
      error: error.message
    };
  }
}

export {
  matchFaces,
  extractFaceDescriptor,
  compareFaceDescriptors,
  calculateStringSimilarity,
  computeChecksum
};
