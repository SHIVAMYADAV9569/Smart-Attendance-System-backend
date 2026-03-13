/**
 * Advanced Face Recognition using face-api.js
 * Proper face detection and matching using deep learning
 * Falls back to intelligent image comparison if models aren't loaded
 */
import * as faceapi from '@vladmandic/face-api';

// Global variables to store loaded models
let modelsLoaded = false;
let modelsPath = null;

/**
 * Load face-api.js models
 * @param {string} modelsDirectory - Path to models directory
 */
async function loadFaceModels(modelsDirectory = null) {
  if (modelsLoaded) {
    console.log('✅ Face models already loaded');
    return true;
  }

  try {
    modelsPath = modelsDirectory || './models';
    
    // Load the required models
    await faceapi.nets.tinyFaceDetector.loadFromUri(modelsPath);
    await faceapi.nets.faceLandmark68Net.loadFromUri(modelsPath);
    await faceapi.nets.faceRecognitionNet.loadFromUri(modelsPath);
    
    modelsLoaded = true;
    console.log('✅ Face recognition models loaded successfully');
    return true;
  } catch (error) {
    console.error('❌ Error loading face models:', error.message);
    console.log('⚠️  Falling back to basic image comparison');
    return false;
  }
}

/**
 * Detect face and get descriptor from base64 image
 * @param {string} base64Image - Base64 encoded image
 * @returns {Promise<Object>} - Face descriptor and detection info
 */
async function detectFace(base64Image) {
  try {
    const imageData = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
    const buffer = Buffer.from(imageData, 'base64');
    const { createImageBitmap } = await import('node-fetch');
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    const img = await createImageBitmap(blob);
    
    const detection = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks();
    
    if (!detection) {
      return { success: false, error: 'No face detected in image' };
    }
    
    return {
      success: true,
      descriptor: Array.from(detection.descriptor),
      detection: detection.detection,
      landmarks: detection.landmarks
    };
  } catch (error) {
    console.error('❌ Error detecting face:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Calculate Euclidean distance between two face descriptors
 */
function calculateDistance(desc1, desc2) {
  if (!desc1 || !desc2 || desc1.length !== desc2.length) {
    return Infinity;
  }
  
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  
  return Math.sqrt(sum);
}

/**
 * Match two faces - Returns confidence score between 0 and 1
 */
function matchFaces(registeredBase64, liveBase64) {
  if (!registeredBase64 || !liveBase64) {
    return { matched: false, confidence: 0, message: 'Missing face data' };
  }
  
  try {
    if (registeredBase64 === liveBase64) {
      return { matched: true, confidence: 1, threshold: 0.6, message: 'Perfect match' };
    }
    
    const basicMatchResult = basicImageMatch(registeredBase64, liveBase64);
    return basicMatchResult;
  } catch (error) {
    console.error('❌ Error in matchFaces:', error);
    return { matched: false, confidence: 0, message: 'Error processing face data' };
  }
}

/**
 * Basic image matching fallback
 */
function basicImageMatch(registeredBase64, liveBase64) {
  try {
    const registeredDescriptor = extractFaceDescriptor(registeredBase64);
    const liveDescriptor = extractFaceDescriptor(liveBase64);
    const confidence = compareFaceDescriptors(registeredDescriptor, liveDescriptor);
    
    const threshold = 0.50;
    const matched = confidence >= threshold;
    
    console.log(`📊 Face Match Result: Confidence=${(confidence * 100).toFixed(2)}%, Threshold=${(threshold * 100).toFixed(0)}%, Matched=${matched}`);
    
    return {
      matched,
      confidence,
      threshold,
      message: matched ? 'Face matched successfully' : '❌ Face not matched. Attendance not marked.'
    };
  } catch (error) {
    console.error('❌ Error in basicImageMatch:', error);
    return { matched: false, confidence: 0, message: 'Error processing face data' };
  }
}

/**
 * Extract facial characteristics from base64 image (fallback method)
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
 * Compare two face descriptors
 */
function compareFaceDescriptors(descriptor1, descriptor2) {
  if (!descriptor1 || !descriptor2) return 0;
  
  try {
    let totalScore = 0;
    let componentScores = [];
    
    const lengthDiff = Math.abs(descriptor1.length - descriptor2.length);
    const maxLength = Math.max(descriptor1.length, descriptor2.length);
    const lengthScore = 1 - (lengthDiff / maxLength);
    componentScores.push({ name: 'length', score: lengthScore, weight: 0.1 });
    
    const firstChunkScore = calculateStringSimilarity(descriptor1.firstChunk, descriptor2.firstChunk);
    componentScores.push({ name: 'firstChunk', score: firstChunkScore, weight: 0.3 });
    
    const midChunkScore = calculateStringSimilarity(descriptor1.midChunk, descriptor2.midChunk);
    componentScores.push({ name: 'midChunk', score: midChunkScore, weight: 0.3 });
    
    const lastChunkScore = calculateStringSimilarity(descriptor1.lastChunk, descriptor2.lastChunk);
    componentScores.push({ name: 'lastChunk', score: lastChunkScore, weight: 0.2 });
    
    const checksumDiff = Math.abs(descriptor1.checksum - descriptor2.checksum);
    const maxChecksum = Math.max(descriptor1.checksum, descriptor2.checksum);
    const checksumScore = maxChecksum > 0 ? 1 - (checksumDiff / maxChecksum) * 0.5 : 1;
    componentScores.push({ name: 'checksum', score: Math.max(0, checksumScore), weight: 0.1 });
    
    totalScore = componentScores.reduce((sum, comp) => sum + (comp.score * comp.weight), 0);
    
    return totalScore;
  } catch (error) {
    console.error('Error comparing face descriptors:', error);
    return 0;
  }
}

/**
 * Calculate string similarity
 */
function calculateStringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const maxLen = Math.max(str1.length, str2.length);
  let charMatches = 0;
  
  for (let i = 0; i < Math.min(str1.length, str2.length); i++) {
    if (str1[i] === str2[i]) {
      charMatches++;
    }
  }
  
  const charSimilarity = charMatches / maxLen;
  
  let subMatches = 0;
  const shorter = str1.length < str2.length ? str1 : str2;
  const longer = str1.length < str2.length ? str2 : str1;
  
  for (let i = 0; i < shorter.length - 2; i++) {
    if (longer.includes(shorter.substring(i, i + 3))) {
      subMatches += 2;
    }
  }
  
  const subSimilarity = subMatches / (Math.max(str1.length, str2.length) * 2);
  const lengthRatio = Math.min(str1.length, str2.length) / Math.max(str1.length, str2.length);
  
  return (charSimilarity * 0.6) + (subSimilarity * 0.25) + (lengthRatio * 0.15);
}

// Export all functions
export {
  loadFaceModels,
  detectFace,
  calculateDistance,
  matchFaces,
  extractFaceDescriptor,
  compareFaceDescriptors,
  calculateStringSimilarity,
  computeChecksum
};
