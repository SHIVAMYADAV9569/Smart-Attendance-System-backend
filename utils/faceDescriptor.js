/**
 * Face descriptor comparison using Euclidean distance
 * Threshold: distance < 0.9 = Face Matched (very lenient - matches even slight similarity)
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
 * Compare face descriptors - distance < 0.9 = match (very lenient)
 * Even slight face match will mark attendance; only clearly different faces rejected
 */
function matchDescriptors(registeredDescriptor, liveDescriptor) {
  const distance = euclideanDistance(registeredDescriptor, liveDescriptor);
  const threshold = 0.9;
  const matched = distance < threshold;

  return {
    matched,
    distance,
    threshold,
    confidence: matched ? Math.max(0, 1 - distance / threshold) : 0
  };
}

export { euclideanDistance, matchDescriptors };
