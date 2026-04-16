import { FaceDetectionResult } from "./FaceDetector";

export interface ActionState {
  action: string;
  detected: boolean;
  active: boolean;
  confidence: number;
}

/**
 * Per-action detection tuning.
 * - threshold : minimum confidence score required to start counting.
 * - holdFrames: consecutive frames above threshold before action is confirmed.
 *
 * BLINK is a fast reflex (~100-200ms) so we use a low threshold and only 2
 * frames. Head-turn and mouth-open are sustained movements so they need a
 * slightly longer hold to avoid false positives.
 */
const ACTION_CONFIGS: Record<string, { threshold: number; holdFrames: number }> = {
  BLINK:        { threshold: 0.30, holdFrames: 2 },
  TURN_LEFT:    { threshold: 0.45, holdFrames: 6 },
  TURN_RIGHT:   { threshold: 0.45, holdFrames: 6 },
  TURN_HEAD:    { threshold: 0.45, holdFrames: 6 },
  OPEN_MOUTH:   { threshold: 0.40, holdFrames: 3 },
};
const DEFAULT_CONFIG = { threshold: 0.55, holdFrames: 8 };

/**
 * Sequential action detector aligned with backend's 5 UPPERCASE actions:
 *   BLINK, TURN_LEFT, TURN_RIGHT, TURN_HEAD, OPEN_MOUTH
 */
export class ActionDetector {
  private completedActions = new Set<string>();
  private holdCounters = new Map<string, number>();

  constructor(private requiredActions: string[]) {}

  check(result: FaceDetectionResult): ActionState[] {
    const currentAction = this.getCurrentAction();

    if (!result.faceDetected) {
      return this.buildStates(currentAction, 0);
    }

    const bs = result.blendshapes;

    // Only check the current active action (sequential flow)
    if (currentAction && !this.completedActions.has(currentAction)) {
      const conf = this.getConfidence(currentAction, bs, result.transformMatrix);
      const cfg = ACTION_CONFIGS[currentAction] ?? DEFAULT_CONFIG;

      if (conf >= cfg.threshold) {
        const count = (this.holdCounters.get(currentAction) || 0) + 1;
        this.holdCounters.set(currentAction, count);

        if (count >= cfg.holdFrames) {
          this.completedActions.add(currentAction);
          this.holdCounters.delete(currentAction);
        }
      } else {
        this.holdCounters.set(currentAction, 0);
      }

      return this.buildStates(currentAction, conf);
    }

    return this.buildStates(currentAction, 0);
  }

  getCurrentAction(): string | null {
    for (const action of this.requiredActions) {
      if (!this.completedActions.has(action)) return action;
    }
    return null;
  }

  private buildStates(
    currentAction: string | null,
    currentConf: number
  ): ActionState[] {
    return this.requiredActions.map((action) => ({
      action,
      detected: this.completedActions.has(action),
      active: action === currentAction,
      confidence: action === currentAction ? currentConf : 0,
    }));
  }

  private getConfidence(
    action: string,
    bs: Map<string, number>,
    matrix: number[] | null
  ): number {
    switch (action) {
      case "BLINK": {
        const left = bs.get("eyeBlinkLeft") || 0;
        const right = bs.get("eyeBlinkRight") || 0;
        return (left + right) / 2;
      }

      case "TURN_LEFT": {
        const yaw = this.getHeadYaw(matrix);
        return yaw < -12 ? Math.min(1, Math.abs(yaw) / 30) : 0;
      }

      case "TURN_RIGHT": {
        const yaw = this.getHeadYaw(matrix);
        return yaw > 12 ? Math.min(1, yaw / 30) : 0;
      }

      case "TURN_HEAD": {
        // Any significant yaw (left OR right) counts
        const yaw = Math.abs(this.getHeadYaw(matrix));
        return yaw > 15 ? Math.min(1, yaw / 30) : 0;
      }

      case "OPEN_MOUTH":
        return bs.get("jawOpen") || 0;

      default:
        return 0;
    }
  }

  private getHeadYaw(matrix: number[] | null): number {
    if (!matrix || matrix.length < 16) return 0;
    return Math.atan2(matrix[8], matrix[0]) * (180 / Math.PI);
  }

  allCompleted(): boolean {
    return this.requiredActions.every((a) => this.completedActions.has(a));
  }

  completedCount(): number {
    return this.completedActions.size;
  }

  reset(): void {
    this.completedActions.clear();
    this.holdCounters.clear();
  }
}
