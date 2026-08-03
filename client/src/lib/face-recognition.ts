import * as faceapi from '@vladmandic/face-api';

let modelsLoaded = false;
let modelsLoading = false;

const TINY_OPTIONS = new faceapi.TinyFaceDetectorOptions({ 
  inputSize: 608,
  scoreThreshold: 0.3
});

const SSD_OPTIONS = new faceapi.SsdMobilenetv1Options({
  minConfidence: 0.2,
  maxResults: 10
});

// @vladmandic/face-api bundles TensorFlow.js, but the `tf` namespace in its own type definitions
// re-exports only the tensor/layer subset — backend selection is absent even though it works at
// runtime. Declaring just the two functions used here keeps them type-checked instead of `any`.
type TfBackendControls = {
  setBackend(backendName: string): Promise<boolean>;
  ready(): Promise<void>;
};

export async function loadFaceModels(): Promise<boolean> {
  if (modelsLoaded) return true;
  if (modelsLoading) {
    while (modelsLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return modelsLoaded;
  }

  modelsLoading = true;
  try {
    const tf = faceapi.tf as unknown as TfBackendControls;
    await tf.setBackend('webgl');
    await tf.ready();
    
    const MODEL_URL = '/models';
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    console.log('Face recognition models loaded successfully (TinyFaceDetector + SSD)');
    return true;
  } catch (error) {
    console.error('Failed to load face models:', error);
    return false;
  } finally {
    modelsLoading = false;
  }
}

export function areModelsLoaded(): boolean {
  return modelsLoaded;
}

export async function detectFace(input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): Promise<faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }, faceapi.FaceLandmarks68>> | undefined> {
  if (!modelsLoaded) {
    await loadFaceModels();
  }

  const processed = preprocessImage(input);

  let detection = await faceapi
    .detectSingleFace(processed, TINY_OPTIONS)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    detection = await faceapi
      .detectSingleFace(processed, SSD_OPTIONS)
      .withFaceLandmarks()
      .withFaceDescriptor();
  }

  return detection;
}

export async function extractFaceDescriptor(input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): Promise<Float32Array | null> {
  const detection = await detectFace(input);
  if (!detection) {
    return null;
  }
  return detection.descriptor;
}

export async function extractFaceDescriptorFromBase64(base64Image: string): Promise<Float32Array | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const descriptor = await extractFaceDescriptor(canvas);
        resolve(descriptor);
      } catch (err) {
        console.error('Face extraction error:', err);
        resolve(null);
      }
    };
    img.onerror = (err) => {
      console.error('Image load error:', err);
      resolve(null);
    };
    img.src = base64Image;
  });
}

export function compareFaceDescriptors(descriptor1: Float32Array | number[], descriptor2: Float32Array | number[]): number {
  const arr1 = descriptor1 instanceof Float32Array ? Array.from(descriptor1) : descriptor1;
  const arr2 = descriptor2 instanceof Float32Array ? Array.from(descriptor2) : descriptor2;
  
  if (arr1.length !== arr2.length || arr1.length !== 128) {
    return Infinity;
  }

  let sum = 0;
  for (let i = 0; i < arr1.length; i++) {
    const diff = arr1[i] - arr2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function isFaceMatch(distance: number, threshold: number = 0.6): boolean {
  return distance < threshold;
}

export function descriptorToJson(descriptor: Float32Array): string {
  return JSON.stringify(Array.from(descriptor));
}

export function jsonToDescriptor(json: string): number[] | null {
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr) && arr.length === 128) {
      return arr;
    }
    return null;
  } catch {
    return null;
  }
}

export interface MultiDescriptorMatch {
  userId: string;
  distance: number;
  isMatch: boolean;
}

export function findBestMatchFromMultipleDescriptors(
  queryDescriptor: Float32Array | number[],
  descriptors: { userId: string; descriptor: string }[],
  threshold: number = 0.6
): MultiDescriptorMatch | null {
  let bestMatch: MultiDescriptorMatch | null = null;
  
  for (const item of descriptors) {
    const storedDescriptor = jsonToDescriptor(item.descriptor);
    if (!storedDescriptor) continue;
    
    const distance = compareFaceDescriptors(queryDescriptor, storedDescriptor);
    
    if (bestMatch === null || distance < bestMatch.distance) {
      bestMatch = {
        userId: item.userId,
        distance,
        isMatch: distance < threshold,
      };
    }
  }
  
  return bestMatch;
}

// The field is `faceDescriptor`, matching GET /api/users/face-descriptors and FaceDescriptorUser.
// It was previously declared as `descriptor`, which no caller ever supplied: item.descriptor came
// back undefined for every row, so bestDistance stayed Infinity and the attendance kiosk never
// recognised anyone. Two other type errors were masking the mismatch.
export function findMatchesForUser(
  queryDescriptor: Float32Array | number[],
  userDescriptors: { faceDescriptor: string }[],
  threshold: number = 0.6
): { bestDistance: number; isMatch: boolean } {
  let bestDistance = Infinity;

  for (const item of userDescriptors) {
    const storedDescriptor = jsonToDescriptor(item.faceDescriptor);
    if (!storedDescriptor) continue;
    
    const distance = compareFaceDescriptors(queryDescriptor, storedDescriptor);
    if (distance < bestDistance) {
      bestDistance = distance;
    }
  }
  
  return {
    bestDistance,
    isMatch: bestDistance < threshold,
  };
}

export type FaceDetectionStatus = 
  | 'no_face'
  | 'face_detected'
  | 'poor_lighting'
  | 'face_too_small'
  | 'face_too_large'
  | 'face_not_centered'
  | 'multiple_faces'
  | 'matched'
  | 'not_matched';

export interface FaceDetectionResult {
  status: FaceDetectionStatus;
  message: string;
  descriptor: Float32Array | null;
  confidence?: number;
}

function preprocessImage(input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const w = 'videoWidth' in input ? input.videoWidth : input.width;
  const h = 'videoHeight' in input ? input.videoHeight : input.height;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(input, 0, 0, w, h);
  
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += gray;
    count++;
  }
  const mean = sum / count;
  
  let varianceSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    varianceSum += (gray - mean) ** 2;
  }
  const stdDev = Math.sqrt(varianceSum / count);
  
  const targetMean = 128;
  const targetStdDev = 64;
  const scale = stdDev > 0 ? targetStdDev / stdDev : 1;
  
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const val = (data[i + c] - mean) * scale + targetMean;
      data[i + c] = Math.max(0, Math.min(255, val));
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export async function detectFaceWithFeedback(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<FaceDetectionResult> {
  if (!modelsLoaded) {
    await loadFaceModels();
  }

  const processed = preprocessImage(input);

  try {
    let detections = await faceapi
      .detectAllFaces(processed, TINY_OPTIONS)
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (detections.length === 0) {
      detections = await faceapi
        .detectAllFaces(processed, SSD_OPTIONS)
        .withFaceLandmarks()
        .withFaceDescriptors();
    }

    if (detections.length === 0) {
      return {
        status: 'no_face',
        message: 'No face detected - position your face in the frame',
        descriptor: null
      };
    }

    if (detections.length > 1) {
      return {
        status: 'multiple_faces',
        message: 'Multiple faces detected - only one person at a time',
        descriptor: null
      };
    }

    const detection = detections[0];
    const box = detection.detection.box;
    
    const inputWidth = processed.width;
    const inputHeight = processed.height;
    
    const faceWidth = box.width;
    const faceHeight = box.height;
    const faceCenterX = box.x + faceWidth / 2;
    const faceCenterY = box.y + faceHeight / 2;
    
    const minFaceSize = Math.min(inputWidth, inputHeight) * 0.05;
    const maxFaceSize = Math.min(inputWidth, inputHeight) * 0.98;
    
    if (faceWidth < minFaceSize || faceHeight < minFaceSize) {
      return {
        status: 'face_too_small',
        message: 'Move closer to the camera',
        descriptor: null
      };
    }
    
    if (faceWidth > maxFaceSize || faceHeight > maxFaceSize) {
      return {
        status: 'face_too_large',
        message: 'Move back from the camera',
        descriptor: null
      };
    }
    
    const centerThreshold = 0.45;
    const normalizedCenterX = faceCenterX / inputWidth;
    const normalizedCenterY = faceCenterY / inputHeight;
    
    if (
      normalizedCenterX < (0.5 - centerThreshold) ||
      normalizedCenterX > (0.5 + centerThreshold) ||
      normalizedCenterY < (0.5 - centerThreshold) ||
      normalizedCenterY > (0.5 + centerThreshold)
    ) {
      return {
        status: 'face_not_centered',
        message: 'Center your face in the frame',
        descriptor: null
      };
    }
    
    const score = detection.detection.score;
    if (score < 0.2) {
      return {
        status: 'poor_lighting',
        message: 'Poor lighting - try moving to a brighter area',
        descriptor: null,
        confidence: score
      };
    }

    return {
      status: 'face_detected',
      message: 'Face detected - scanning...',
      descriptor: detection.descriptor,
      confidence: score
    };
  } catch (error) {
    console.error('Face detection error:', error);
    return {
      status: 'no_face',
      message: 'Detection error - please try again',
      descriptor: null
    };
  }
}
