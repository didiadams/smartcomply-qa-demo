import {
  FilesetResolver,
  FaceLandmarker,
  FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

export interface FaceDetectionResult {
  faceDetected: boolean;
  blendshapes: Map<string, number>;
  transformMatrix: number[] | null;
}

export class FaceDetectorEngine {
  private landmarker: FaceLandmarker | null = null;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);

    // Fetch model ourselves to avoid MediaPipe internal path resolution issues
    const modelResponse = await fetch(MODEL_URL);
    if (!modelResponse.ok) {
      throw new Error(`Failed to download face model (${modelResponse.status})`);
    }
    const modelBuffer = await modelResponse.arrayBuffer();

    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetBuffer: new Uint8Array(modelBuffer),
      },
      runningMode: "VIDEO",
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      numFaces: 1,
    });
  }

  detect(video: HTMLVideoElement, timestamp: number): FaceDetectionResult {
    if (!this.landmarker) {
      return { faceDetected: false, blendshapes: new Map(), transformMatrix: null };
    }

    const result: FaceLandmarkerResult = this.landmarker.detectForVideo(
      video,
      timestamp
    );

    if (!result.faceBlendshapes || result.faceBlendshapes.length === 0) {
      return { faceDetected: false, blendshapes: new Map(), transformMatrix: null };
    }

    const blendshapes = new Map<string, number>();
    for (const bs of result.faceBlendshapes[0].categories) {
      blendshapes.set(bs.categoryName, bs.score);
    }

    const transformMatrix =
      result.facialTransformationMatrixes &&
      result.facialTransformationMatrixes.length > 0
        ? Array.from(result.facialTransformationMatrixes[0].data)
        : null;

    return { faceDetected: true, blendshapes, transformMatrix };
  }

  destroy(): void {
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
  }
}
