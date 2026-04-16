import { HttpClient } from "../../client/HttpClient";
import {
  ChallengeAction,
  LivenessCreateRequest,
  LivenessCreateResponse,
  LivenessSubmitResponse,
} from "../../types/liveness";
import { CameraManager } from "../../camera/CameraManager";
import { VideoRecorder } from "../../camera/VideoRecorder";
import { FaceDetectorEngine } from "../../camera/FaceDetector";
import { ActionDetector } from "../../camera/ActionDetector";
import { LivenessUI } from "./LivenessUI";

/**
 * Liveness module — 3-step flow aligned with Adhere backend.
 *
 * Flow:
 *   Step 1: liveness.create()  → POST /v1/sdk/liveness/create/  (multipart)
 *   Step 2: [camera runs, user performs challenge actions]
 *   Step 3: liveness.submit()  → POST /v1/sdk/liveness/submit/  (multipart)
 *
 * After submit, the backend returns status: "processing".
 * Final results are delivered via webhook (liveness.completed event).
 */
export class LivenessModule {
  constructor(private http: HttpClient) { }

  /**
   * Step 1: Create a liveness challenge entry.
   *
   * POST /v1/sdk/liveness/create/
   * Auth: x-access-token: <sessionToken>
   * Content-Type: multipart/form-data
   */
  async create(params: LivenessCreateRequest): Promise<LivenessCreateResponse> {
    const formData = new FormData();
    formData.append("identifier", params.identifier);
    formData.append("identifier_type", params.identifier_type);
    formData.append("country", params.country);
    formData.append(
      "challenge_actions",
      JSON.stringify(params.challenge_actions)
    );
    formData.append("autoshot_file", params.autoshot_file, "autoshot.jpg");

    if (params.id_file) {
      formData.append("id_file", params.id_file, "id_document.jpg");
    }
    if (params.snapshot_file) {
      formData.append("snapshot_file", params.snapshot_file, "snapshot.jpg");
    }

    return this.http.uploadWithSession<LivenessCreateResponse>(
      "/v1/sdk/liveness/create/",
      formData
    );
  }

  /**
   * Step 3: Submit liveness video recording.
   *
   * POST /v1/sdk/liveness/submit/
   * Auth: x-access-token: <sessionToken>
   * Content-Type: multipart/form-data
   *
   * Note: After submission, the session is revoked (single-use).
   * The backend returns status: "processing" — results come via webhook.
   */
  async submit(entryId: number, videoBlob: Blob, snapshotBlob?: Blob): Promise<LivenessSubmitResponse> {
    const formData = new FormData();
    formData.append("entry", String(entryId));
    formData.append("video_file", videoBlob, "liveness.webm");
    
    if (snapshotBlob) {
      formData.append("snapshot_file", snapshotBlob, "snapshot.jpg");
    }

    return this.http.uploadWithSession<LivenessSubmitResponse>(
      "/v1/sdk/liveness/submit/",
      formData
    );
  }

  /**
   * Full liveness check — orchestrates the entire flow:
   *
   * 1. Take autoshot selfie from camera
   * 2. Create liveness entry on backend (with challenge actions + selfie + optional doc)
   * 3. Run action detection loop (camera + MediaPipe)
   * 4. Record video and submit to backend
   * 5. Return submit response (status: "processing")
   *
   * @param container - DOM element to mount the liveness UI into
   * @param params - identifier info and optional document image
   * @param actions - override challenge actions (default: BLINK, TURN_LEFT, OPEN_MOUTH)
   */
  async startCheck(
    container: HTMLElement,
    params: {
      identifier: string;
      identifier_type: string;
      country: string;
      id_file?: File | Blob;
    },
    actions?: ChallengeAction[]
  ): Promise<LivenessSubmitResponse> {
    const camera = new CameraManager();
    const recorder = new VideoRecorder();
    const faceEngine = new FaceDetectorEngine();
    const ui = new LivenessUI();

    // Tracks whether cleanup has already been called (so the finally block
    // doesn't double-destroy when retry takes over).
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      faceEngine.destroy();
      camera.stop();
      ui.unmount();
    };

    try {
      // 1. Open camera
      const stream = await camera.open();

      // 2. Create a temporary video element to capture autoshot
      const tempVideo = document.createElement("video");
      tempVideo.srcObject = stream;
      tempVideo.muted = true;
      tempVideo.playsInline = true;
      await tempVideo.play();

      // Wait a moment for camera to stabilize
      await new Promise((r) => setTimeout(r, 500));

      // 3. Capture autoshot (selfie) from camera stream
      const autoshotBlob = await this.captureFrame(tempVideo);
      tempVideo.pause();

      // 4. Create liveness entry on backend
      const challengeActions = actions || ["BLINK", "TURN_LEFT", "OPEN_MOUTH"];
      const entry = await this.create({
        identifier: params.identifier,
        identifier_type: params.identifier_type,
        country: params.country,
        challenge_actions: challengeActions,
        autoshot_file: autoshotBlob,
        id_file: params.id_file,
      });

      // 5. Mount UI with challenge actions from backend
      const uiChallenge = {
        actions: entry.challenge_actions,
        time_limit_seconds: 45,
        instruction: "Complete the following actions to verify your identity",
      };

      const videoEl = ui.mount(container, uiChallenge);
      videoEl.srcObject = stream;
      await videoEl.play();

      // 6. Init MediaPipe FaceLandmarker
      ui.updateInstruction("Loading face detection...");
      await faceEngine.init();

      // 7. Start recording
      recorder.start(stream);
      ui.updateInstruction(uiChallenge.instruction);

      // 8. Run detection loop (sequential — one action at a time)
      const actionDetector = new ActionDetector(entry.challenge_actions);
      let lastAction: string | null = null;

      const detectionResult = await new Promise<"completed" | "timeout">(
        (resolve) => {
          let animFrameId: number;

          const timeout = setTimeout(() => {
            cancelAnimationFrame(animFrameId);
            resolve("timeout");
          }, uiChallenge.time_limit_seconds * 1000);

          const detectLoop = () => {
            if (videoEl.readyState >= 2) {
              const detection = faceEngine.detect(
                videoEl,
                performance.now()
              );

              const states = actionDetector.check(detection);
              ui.updateActions(states);

              const current = actionDetector.getCurrentAction();

              if (!detection.faceDetected) {
                ui.updateInstruction("Position your face in the oval");
              } else if (current) {
                if (current !== lastAction) {
                  lastAction = current;
                  ui.updateInstruction(this.describeAction(current));
                }
              } else {
                ui.updateInstruction("All actions completed! ✓");
              }

              if (actionDetector.allCompleted()) {
                clearTimeout(timeout);
                cancelAnimationFrame(animFrameId);
                resolve("completed");
                return;
              }
            }

            animFrameId = requestAnimationFrame(detectLoop);
          };

          detectLoop();
        }
      );

      // ── On timeout: show retry screen, clean up, restart ──────────
      if (detectionResult === "timeout") {
        // IMPORTANT: mark cleanedUp=true BEFORE returning the new Promise so
        // the outer `finally` block does NOT call cleanup() immediately —
        // which would destroy the UI before the user sees the timeout screen.
        cleanedUp = true;

        recorder.stop().catch(() => { }); // discard partial recording

        return new Promise<LivenessSubmitResponse>((resolveRetry, rejectRetry) => {
          ui.showTimeout(() => {
            // User clicked "Try Again" — now it is safe to destroy this attempt
            faceEngine.destroy();
            camera.stop();
            ui.unmount();

            // Restart the full liveness flow and wire result back to caller
            this.startCheck(container, params, actions)
              .then(resolveRetry)
              .catch(rejectRetry);
          });
          // showTimeout waits for the user to click — the promise stays pending.
        });
      }

      // ── On completion: stop recording, submit, show success ────────
      
      // Capture a snapshot frame while the video is still playing
      const snapshotBlob = await this.captureFrame(videoEl);

      // 9. Stop recording
      const videoBlob = await recorder.stop();

      // 10. Submit to backend
      const submitResult = await this.submit(entry.id, videoBlob, snapshotBlob);

      // 11. Show success overlay briefly before the flow advances
      await ui.showResult(
        submitResult.status === "processing" ? "processing" : "failed"
      );

      return submitResult;

    } finally {
      cleanup();
    }
  }

  /**
   * Capture a single frame from a video element as a JPEG Blob.
   */
  private captureFrame(video: HTMLVideoElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }
      ctx.drawImage(video, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Failed to capture frame"));
        },
        "image/jpeg",
        0.9
      );
    });
  }

  private describeAction(action: string): string {
    const descriptions: Record<string, string> = {
      BLINK: "Blink your eyes",
      TURN_LEFT: "Turn your head left",
      TURN_RIGHT: "Turn your head right",
      TURN_HEAD: "Turn your head side to side",
      OPEN_MOUTH: "Open your mouth wide",
    };
    return descriptions[action] || action.replace(/_/g, " ").toLowerCase();
  }
}
