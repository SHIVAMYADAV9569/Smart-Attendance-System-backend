/**
 * Face descriptor comparison using Euclidean distance
 * Threshold: distance < 0.4 = Face Matched (strict - requires high similarity)
 */

function euclideanDistance(desc1, desc2) {
  if (!desc1 || !desc2 || !Array.isArray(desc1) || !Array.isArray(desc2)) {
    return Infinity;
  }
  if (desc1.length !== 128 || desc2.length !== 128) {
    return Infinity;
  }

  let sum = 0;
  for (let i = 0; i < 128; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Compare face descriptors - distance < 0.4 = match (strict)
 * Only highly similar faces will be accepted; prevents false matches between different students
 */
function matchDescriptors(registeredDescriptor, liveDescriptor) {
  const distance = euclideanDistance(registeredDescriptor, liveDescriptor);
  const threshold = 0.4;
  const matched = distance < threshold;

  console.log('🔍 Face Matching Details:', {
    distance: distance.toFixed(4),
    threshold,
    matched,
    verdict: matched ? '✅ FACE MATCHED' : '❌ FACE NOT MATCHED - Too different'
  });

  return {
    matched,
    distance,
    threshold,
    confidence: matched ? Math.max(0, 1 - distance / threshold) : 0
  };
}

export { euclideanDistance, matchDescriptors };
