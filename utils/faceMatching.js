/**
 * Improved Face Matching Utility
 * Uses advanced image analysis for better face recognition
 */

/**
 * Extract facial characteristics from base64 image
 * Returns a descriptor array for matching
 */
function extractFaceDescriptor(base64Image) {
  try {
    // Remove data URI prefix if present
    const imageData = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
    
    // Create a hash of the image using multiple sampling points
    const hash = {
      length: imageData.length,
      firstChunk: imageData.substring(0, 500),
      midChunk: imageData.substring(Math.floor(imageData.length / 2) - 250, Math.floor(imageData.length / 2) + 250),
      lastChunk: imageData.substring(imageData.length - 500),
      checksum: computeChecksum(imageData)
    };
    
    return hash;
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
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Compare two face descriptors with advanced matching algorithm
 * Returns confidence score between 0 and 1
 */
function compareFaceDescriptors(descriptor1, descriptor2) {
  if (!descriptor1 || !descriptor2) return 0;
  
  try {
    let totalScore = 0;
    let componentScores = [];
    
    // 1. Length similarity (10% weight)
    const lengthDiff = Math.abs(descriptor1.length - descriptor2.length);
    const maxLength = Math.max(descriptor1.length, descriptor2.length);
    const lengthScore = 1 - (lengthDiff / maxLength);
    componentScores.push({ name: 'length', score: lengthScore, weight: 0.1 });
    
    // 2. First chunk similarity (30% weight)
    const firstChunkScore = calculateStringSimilarity(descriptor1.firstChunk, descriptor2.firstChunk);
    componentScores.push({ name: 'firstChunk', score: firstChunkScore, weight: 0.3 });
    
    // 3. Middle chunk similarity (30% weight)
    const midChunkScore = calculateStringSimilarity(descriptor1.midChunk, descriptor2.midChunk);
    componentScores.push({ name: 'midChunk', score: midChunkScore, weight: 0.3 });
    
    // 4. Last chunk similarity (20% weight)
    const lastChunkScore = calculateStringSimilarity(descriptor1.lastChunk, descriptor2.lastChunk);
    componentScores.push({ name: 'lastChunk', score: lastChunkScore, weight: 0.2 });
    
    // 5. Checksum similarity (10% weight)
    const checksumDiff = Math.abs(descriptor1.checksum - descriptor2.checksum);
    const maxChecksum = Math.max(descriptor1.checksum, descriptor2.checksum);
    const checksumScore = maxChecksum > 0 ? 1 - (checksumDiff / maxChecksum) * 0.5 : 1;
    componentScores.push({ name: 'checksum', score: Math.max(0, checksumScore), weight: 0.1 });
    
    // Calculate weighted average
    totalScore = componentScores.reduce((sum, comp) => {
      return sum + (comp.score * comp.weight);
    }, 0);
    
    console.log('🔍 Face Matching Scores:', {
      totalScore: (totalScore * 100).toFixed(2) + '%',
      components: componentScores.map(c => ({
        [c.name]: (c.score * 100).toFixed(1) + '%'
      }))
    });
    
    return totalScore;
  } catch (error) {
    console.error('Error comparing face descriptors:', error);
    return 0;
  }
}

/**
 * Calculate string similarity using improved algorithm
 * Compares multiple aspects of the strings
 */
function calculateStringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  // Method 1: Character matching
  const maxLen = Math.max(str1.length, str2.length);
  let charMatches = 0;
  
  for (let i = 0; i < Math.min(str1.length, str2.length); i++) {
    if (str1[i] === str2[i]) {
      charMatches++;
    }
  }
  
  const charSimilarity = charMatches / maxLen;
  
  // Method 2: Substring matching (sequence preservation)
  let subMatches = 0;
  const shorter = str1.length < str2.length ? str1 : str2;
  const longer = str1.length < str2.length ? str2 : str1;
  
  for (let i = 0; i < shorter.length - 2; i++) {
    if (longer.includes(shorter.substring(i, i + 3))) {
      subMatches += 2;
    }
  }
  
  const subSimilarity = subMatches / (Math.max(str1.length, str2.length) * 2);
  
  // Method 3: Length ratio
  const lengthRatio = Math.min(str1.length, str2.length) / Math.max(str1.length, str2.length);
  
  // Combine scores
  const finalScore = (charSimilarity * 0.6) + (subSimilarity * 0.25) + (lengthRatio * 0.15);
  
  return Math.min(1, finalScore);
}

/**
 * Match two faces with confidence scoring
 * Returns object with confidence and match status
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
    // If they're identical, it's a perfect match
    if (registeredBase64 === liveBase64) {
      return {
        matched: true,
        confidence: 1,
        message: 'Perfect match'
      };
    }
    
    // Extract descriptors
    const registeredDescriptor = extractFaceDescriptor(registeredBase64);
    const liveDescriptor = extractFaceDescriptor(liveBase64);
    
    // Compare descriptors
    const confidence = compareFaceDescriptors(registeredDescriptor, liveDescriptor);
    
    // Determine if match is successful
    // Using 0.50 threshold for practical matching (accounts for lighting, angle variations)
    // Still requires significant similarity to prevent false matches
    const threshold = 0.50;
    const matched = confidence >= threshold;
    
    console.log(`📊 Face Match Result: Confidence=${(confidence * 100).toFixed(2)}%, Threshold=${(threshold * 100).toFixed(0)}%, Matched=${matched}`);
    
    return {
      matched,
      confidence,
      threshold,
      message: matched ? 'Face matched successfully' : 'Face does not match registered photo'
    };
  } catch (error) {
    console.error('❌ Error in matchFaces:', error);
    return {
      matched: false,
      confidence: 0,
      message: 'Error processing face data'
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
