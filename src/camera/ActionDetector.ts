import { FaceDetectionResult } from "./FaceDetector";

export interface ActionState {
  action: string;
  detected: boolean;
  active: boolean;
  confidence: number;
}

const HOLD_FRAMES = 8;

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

      if (conf > 0.6) {
        const count = (this.holdCounters.get(currentAction) || 0) + 1;
        this.holdCounters.set(currentAction, count);

        if (count >= HOLD_FRAMES) {
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
      case "smile": {
        const left = bs.get("mouthSmileLeft") || 0;
        const right = bs.get("mouthSmileRight") || 0;
        return (left + right) / 2;
      }

      case "blink": {
        const left = bs.get("eyeBlinkLeft") || 0;
        const right = bs.get("eyeBlinkRight") || 0;
        return (left + right) / 2;
      }

      case "turn_left": {
        const yaw = this.getHeadYaw(matrix);
        return yaw < -12 ? Math.min(1, Math.abs(yaw) / 30) : 0;
      }

      case "turn_right": {
        const yaw = this.getHeadYaw(matrix);
        return yaw > 12 ? Math.min(1, yaw / 30) : 0;
      }

      case "nod": {
        const pitch = this.getHeadPitch(matrix);
        return pitch > 12 ? Math.min(1, pitch / 25) : 0;
      }

      case "open_mouth":
        return bs.get("jawOpen") || 0;

      case "raise_eyebrows": {
        const left = bs.get("browInnerUp") || 0;
        const outer =
          ((bs.get("browOuterUpLeft") || 0) +
            (bs.get("browOuterUpRight") || 0)) /
          2;
        return Math.max(left, outer);
      }

      case "close_eyes": {
        const left = bs.get("eyeBlinkLeft") || 0;
        const right = bs.get("eyeBlinkRight") || 0;
        return Math.min(left, right);
      }

      case "look_up": {
        const left = bs.get("eyeLookUpLeft") || 0;
        const right = bs.get("eyeLookUpRight") || 0;
        return (left + right) / 2;
      }

      case "look_down": {
        const left = bs.get("eyeLookDownLeft") || 0;
        const right = bs.get("eyeLookDownRight") || 0;
        return (left + right) / 2;
      }

      case "puff_cheeks": {
        const left = bs.get("cheekPuff") || 0;
        return left;
      }

      case "pucker_lips":
        return bs.get("mouthPucker") || 0;

      default:
        return 0;
    }
  }

  private getHeadYaw(matrix: number[] | null): number {
    if (!matrix || matrix.length < 16) return 0;
    return Math.atan2(matrix[8], matrix[0]) * (180 / Math.PI);
  }

  private getHeadPitch(matrix: number[] | null): number {
    if (!matrix || matrix.length < 16) return 0;
    return Math.atan2(-matrix[9], matrix[5]) * (180 / Math.PI);
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
