/**
 * Download face-api.js models
 * Run this script once to download required models
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modelsDir = path.join(__dirname, '..', 'models');
const modelUrl = 'https://github.com/justadudewhohacks/face-api.js/raw/master/weights';

// Models to download
const models = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2'
];

// Create models directory if it doesn't exist
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
  console.log('✅ Created models directory');
}

// Download function
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        downloadFile(response.headers.location, dest)
          .then(resolve)
          .catch(reject);
      } else if (response.statusCode === 200) {
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          console.log(`✅ Downloaded: ${path.basename(dest)}`);
          resolve();
        });
      } else {
        file.close();
        reject(new Error(`Request failed with status code ${response.statusCode}`));
      }
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

// Main download function
async function downloadModels() {
  console.log('🚀 Starting face-api.js models download...\n');
  
  for (const model of models) {
    const destPath = path.join(modelsDir, model);
    const url = `${modelUrl}/${model}`;
    
    // Skip if already exists
    if (fs.existsSync(destPath)) {
      console.log(`⏭️  Already exists: ${model}`);
      continue;
    }
    
    try {
      await downloadFile(url, destPath);
    } catch (error) {
      console.error(`❌ Failed to download ${model}:`, error.message);
    }
  }
  
  console.log('\n✅ Model download complete!');
  console.log('📁 Models saved to:', modelsDir);
}

// Run download
downloadModels().catch(console.error);
