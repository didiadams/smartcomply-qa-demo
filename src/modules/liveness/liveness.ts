import { HttpClient } from "../../client/HttpClient";
import {
  LivenessChallengeResponse,
  LivenessVerifyResponse,
} from "../../types/liveness";
import { CameraManager } from "../../camera/CameraManager";
import { VideoRecorder } from "../../camera/VideoRecorder";
import { FaceDetectorEngine } from "../../camera/FaceDetector";
import { ActionDetector } from "../../camera/ActionDetector";
import { LivenessUI } from "./LivenessUI";

export class LivenessModule {
  private sessionId: string | null = null;

  constructor(private http: HttpClient) {}

  setSessionId(sessionId: string) {
    this.sessionId = sessionId;
  }

  private requireSession(): string {
    if (!this.sessionId) {
      throw new Error(
        "No active session. Call sdk.createSession() before using liveness methods."
      );
    }
    return this.sessionId;
  }

  async start(
    actions?: string[]
  ): Promise<LivenessChallengeResponse> {
    const sessionId = this.requireSession();

    const payload: Record<string, unknown> = { session_id: sessionId };
    if (actions && actions.length > 0) {
      payload.actions = actions;
    }

    return this.http.request<LivenessChallengeResponse>(
      "POST",
      "/v1/liveness/start",
      payload
    );
  }

  async verify(
    challengeId: string,
    video: Blob
  ): Promise<LivenessVerifyResponse> {
    const formData = new FormData();
    formData.append("challenge_id", challengeId);
    formData.append("video", video);

    return this.http.upload<LivenessVerifyResponse>(
      "/v1/liveness/verify",
      formData
    );
  }

  async startCheck(
    container: HTMLElement,
    actions?: string[]
  ): Promise<LivenessVerifyResponse> {
    this.requireSession();

    const camera = new CameraManager();
    const recorder = new VideoRecorder();
    const faceEngine = new FaceDetectorEngine();
    const ui = new LivenessUI();

    try {
      // 1. Get challenge from backend
      const challenge = await this.start(actions);

      // 2. Mount UI and get video element
      const videoEl = ui.mount(container, challenge);

      // 3. Open camera and attach to video
      const stream = await camera.open();
      videoEl.srcObject = stream;
      await videoEl.play();

      // 4. Init MediaPipe FaceLandmarker
      ui.updateInstruction("Loading face detection...");
      await faceEngine.init();

      // 5. Start recording
      recorder.start(stream);
      ui.updateInstruction(challenge.instruction);

      // 6. Run detection loop (sequential — one action at a time)
      const actionDetector = new ActionDetector(challenge.actions);
      let lastAction: string | null = null;

      const result = await new Promise<"completed" | "timeout">(
        (resolve) => {
          let animFrameId: number;

          const timeout = setTimeout(() => {
            cancelAnimationFrame(animFrameId);
            resolve("timeout");
          }, challenge.time_limit_seconds * 1000);

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
                  ui.updateInstruction(
                    this.describeAction(current)
                  );
                }
              } else {
                ui.updateInstruction("All actions completed!");
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

      // 7. Stop recording
      const videoBlob = await recorder.stop();

      // 8. Submit to backend
      const verifyResult = await this.verify(
        challenge.challenge_id,
        videoBlob
      );

      // 9. Show result
      if (result === "timeout" && verifyResult.status !== "verified") {
        ui.updateInstruction("Time expired");
      }

      await ui.showResult(verifyResult.status);

      return verifyResult;
    } finally {
      // Cleanup
      faceEngine.destroy();
      camera.stop();
      ui.unmount();
    }
  }

  private describeAction(action: string): string {
    const descriptions: Record<string, string> = {
      smile: "Smile naturally",
      blink: "Blink your eyes",
      turn_left: "Turn your head left",
      turn_right: "Turn your head right",
      nod: "Nod your head",
      open_mouth: "Open your mouth wide",
      raise_eyebrows: "Raise your eyebrows",
      close_eyes: "Close both eyes",
      look_up: "Look upward",
      look_down: "Look downward",
      puff_cheeks: "Puff your cheeks",
      pucker_lips: "Pucker your lips",
    };
    return descriptions[action] || action.replace(/_/g, " ");
  }
}
