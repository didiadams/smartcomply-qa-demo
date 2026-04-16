import { ActionState } from "../../camera/ActionDetector";

/**
 * Icons for the 5 backend-supported challenge actions (UPPERCASE).
 */
const ICONS: Record<string, string> = {
  BLINK: "\uD83D\uDE09",
  TURN_LEFT: "\u2B05",
  TURN_RIGHT: "\u27A1",
  TURN_HEAD: "\uD83D\uDE42",
  OPEN_MOUTH: "\uD83D\uDE2E",
};

/**
 * Large animated SVG/HTML cues shown in the centre of the camera frame
 * so the user knows exactly what to do — like a real liveness test.
 */
const ACTION_CUES: Record<string, string> = {
  BLINK: `
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
      <div style="font-size:64px;line-height:1;animation:sc-blink 1.2s ease-in-out infinite;">👁️</div>
      <div style="font-size:13px;font-weight:600;color:#fff;opacity:0.9;letter-spacing:0.5px;">BLINK YOUR EYES</div>
    </div>`,
  TURN_LEFT: `
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
      <div style="font-size:56px;line-height:1;animation:sc-slide-left 1s ease-in-out infinite;">⬅️</div>
      <div style="font-size:13px;font-weight:600;color:#fff;opacity:0.9;letter-spacing:0.5px;">TURN HEAD LEFT</div>
    </div>`,
  TURN_RIGHT: `
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
      <div style="font-size:56px;line-height:1;animation:sc-slide-right 1s ease-in-out infinite;">➡️</div>
      <div style="font-size:13px;font-weight:600;color:#fff;opacity:0.9;letter-spacing:0.5px;">TURN HEAD RIGHT</div>
    </div>`,
  TURN_HEAD: `
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
      <div style="font-size:56px;line-height:1;animation:sc-turn-head 1.4s ease-in-out infinite;">↔️</div>
      <div style="font-size:13px;font-weight:600;color:#fff;opacity:0.9;letter-spacing:0.5px;">TURN HEAD SIDE TO SIDE</div>
    </div>`,
  OPEN_MOUTH: `
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
      <div style="font-size:64px;line-height:1;animation:sc-mouth 1.2s ease-in-out infinite;">😮</div>
      <div style="font-size:13px;font-weight:600;color:#fff;opacity:0.9;letter-spacing:0.5px;">OPEN YOUR MOUTH</div>
    </div>`,
};

/** Keyframe CSS injected once */
function injectLivenessKeyframes(): void {
  if (document.getElementById("sc-liveness-kf")) return;
  const s = document.createElement("style");
  s.id = "sc-liveness-kf";
  s.textContent = `
    @keyframes sc-blink {
      0%,100% { transform:scaleY(1); }
      40%      { transform:scaleY(0.1); }
      50%      { transform:scaleY(1); }
    }
    @keyframes sc-slide-left {
      0%,100% { transform:translateX(0);   opacity:1; }
      50%      { transform:translateX(-14px); opacity:0.6; }
    }
    @keyframes sc-slide-right {
      0%,100% { transform:translateX(0);    opacity:1; }
      50%      { transform:translateX(14px); opacity:0.6; }
    }
    @keyframes sc-turn-head {
      0%,100% { transform:translateX(0);    }
      25%      { transform:translateX(-12px); }
      75%      { transform:translateX(12px);  }
    }
    @keyframes sc-mouth {
      0%,100% { transform:scaleY(1);   }
      40%      { transform:scaleY(1.25); }
      60%      { transform:scaleY(1);   }
    }
    @keyframes sc-pop-in {
      0%   { transform:scale(0.7); opacity:0; }
      60%  { transform:scale(1.05); }
      100% { transform:scale(1);   opacity:1; }
    }
    @keyframes sc-cue-fade {
      0%   { opacity:0; transform:translateY(8px);  }
      20%  { opacity:1; transform:translateY(0);    }
      80%  { opacity:1; transform:translateY(0);    }
      100% { opacity:0; transform:translateY(-8px); }
    }
  `;
  document.head.appendChild(s);
}

/**
 * Challenge shape used by LivenessUI.mount().
 */
export interface UIChallenge {
  actions: string[];
  time_limit_seconds: number;
  instruction: string;
}

export class LivenessUI {
  private root: HTMLDivElement | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private instructionEl: HTMLDivElement | null = null;
  private stepsEl: HTMLDivElement | null = null;
  private progressBarEl: HTMLDivElement | null = null;
  private confidenceRingEl: SVGCircleElement | null = null;
  private timerEl: HTMLDivElement | null = null;
  private overlayEl: HTMLDivElement | null = null;
  private actionCueEl: HTMLDivElement | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private totalActions = 0;
  private currentCueAction: string | null = null;

  mount(
    container: HTMLElement,
    challenge: UIChallenge
  ): HTMLVideoElement {
    injectLivenessKeyframes();
    this.totalActions = challenge.actions.length;

    this.root = document.createElement("div");
    this.root.style.cssText = `
      position:relative;width:100%;max-width:420px;margin:0 auto;
      background:#0a0a0a;border-radius:16px;overflow:hidden;
      font-family:system-ui,-apple-system,sans-serif;
      box-shadow:0 8px 32px rgba(0,0,0,0.4);
    `;

    // Video
    this.videoEl = document.createElement("video");
    this.videoEl.autoplay = true;
    this.videoEl.playsInline = true;
    this.videoEl.muted = true;
    this.videoEl.style.cssText =
      "width:100%;display:block;transform:scaleX(-1);aspect-ratio:3/4;object-fit:cover;";

    // Face guide — oval with confidence ring
    const guideWrap = document.createElement("div");
    guideWrap.style.cssText = `
      position:absolute;top:8%;left:50%;transform:translateX(-50%);
      width:180px;height:240px;pointer-events:none;
    `;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 180 240");
    svg.style.cssText = "width:100%;height:100%;";

    // Background oval (guide)
    const bgOval = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "ellipse"
    );
    bgOval.setAttribute("cx", "90");
    bgOval.setAttribute("cy", "120");
    bgOval.setAttribute("rx", "85");
    bgOval.setAttribute("ry", "115");
    bgOval.setAttribute("fill", "none");
    bgOval.setAttribute("stroke", "rgba(255,255,255,0.25)");
    bgOval.setAttribute("stroke-width", "2.5");
    bgOval.setAttribute("stroke-dasharray", "8 4");

    // Confidence progress ring
    const confOval = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "ellipse"
    );
    confOval.setAttribute("cx", "90");
    confOval.setAttribute("cy", "120");
    confOval.setAttribute("rx", "85");
    confOval.setAttribute("ry", "115");
    confOval.setAttribute("fill", "none");
    confOval.setAttribute("stroke", "#22c55e");
    confOval.setAttribute("stroke-width", "3.5");
    const circumference =
      2 * Math.PI * Math.sqrt((85 * 85 + 115 * 115) / 2);
    confOval.setAttribute(
      "stroke-dasharray",
      `${circumference}`
    );
    confOval.setAttribute("stroke-dashoffset", `${circumference}`);
    confOval.style.cssText =
      "transition:stroke-dashoffset 0.15s ease;transform:rotate(-90deg);transform-origin:90px 120px;";
    this.confidenceRingEl = confOval as unknown as SVGCircleElement;

    svg.appendChild(bgOval);
    svg.appendChild(confOval);
    guideWrap.appendChild(svg);

    // Top bar — instruction
    const topBar = document.createElement("div");
    topBar.style.cssText = `
      position:absolute;top:0;left:0;right:0;
      background:linear-gradient(180deg,rgba(0,0,0,0.7) 0%,transparent 100%);
      padding:16px 16px 32px;
    `;

    this.instructionEl = document.createElement("div");
    this.instructionEl.style.cssText = `
      color:#fff;font-size:15px;font-weight:600;text-align:center;
      line-height:1.4;
    `;
    this.instructionEl.textContent = challenge.instruction;
    topBar.appendChild(this.instructionEl);

    // Bottom panel
    const bottomPanel = document.createElement("div");
    bottomPanel.style.cssText = `
      position:absolute;bottom:0;left:0;right:0;
      background:linear-gradient(0deg,rgba(0,0,0,0.85) 0%,rgba(0,0,0,0.6) 60%,transparent 100%);
      padding:24px 16px 16px;
    `;

    // Progress bar
    const progressWrap = document.createElement("div");
    progressWrap.style.cssText = `
      height:3px;background:rgba(255,255,255,0.15);border-radius:2px;
      margin-bottom:14px;overflow:hidden;
    `;
    this.progressBarEl = document.createElement("div");
    this.progressBarEl.style.cssText = `
      height:100%;width:0%;background:linear-gradient(90deg,#22c55e,#4ade80);
      border-radius:2px;transition:width 0.4s ease;
    `;
    progressWrap.appendChild(this.progressBarEl);
    bottomPanel.appendChild(progressWrap);

    // Steps list
    this.stepsEl = document.createElement("div");
    this.stepsEl.style.cssText = `
      display:flex;flex-direction:column;gap:8px;margin-bottom:12px;
    `;

    for (let i = 0; i < challenge.actions.length; i++) {
      const action = challenge.actions[i];
      const step = document.createElement("div");
      step.dataset.action = action;
      step.style.cssText = `
        display:flex;align-items:center;gap:10px;
        padding:8px 12px;border-radius:10px;
        background:rgba(255,255,255,0.06);
        transition:all 0.3s ease;
        opacity:${i === 0 ? "1" : "0.4"};
      `;

      const num = document.createElement("div");
      num.className = "sc-step-num";
      num.style.cssText = `
        width:28px;height:28px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        font-size:13px;font-weight:700;color:#fff;
        background:rgba(255,255,255,0.12);
        border:2px solid rgba(255,255,255,0.2);
        transition:all 0.3s ease;flex-shrink:0;
      `;
      num.textContent = String(i + 1);

      const label = document.createElement("div");
      label.style.cssText = "color:#fff;font-size:13px;flex:1;";
      label.textContent = this.describeAction(action);

      const icon = document.createElement("div");
      icon.className = "sc-step-icon";
      icon.style.cssText = "font-size:18px;flex-shrink:0;";
      icon.textContent = ICONS[action] || "";

      step.appendChild(num);
      step.appendChild(label);
      step.appendChild(icon);
      this.stepsEl.appendChild(step);
    }

    bottomPanel.appendChild(this.stepsEl);

    // Timer
    this.timerEl = document.createElement("div");
    this.timerEl.style.cssText = `
      text-align:center;color:rgba(255,255,255,0.5);
      font-size:11px;font-variant-numeric:tabular-nums;
    `;
    bottomPanel.appendChild(this.timerEl);

    // Result overlay (used for success / failure / timeout)
    this.overlayEl = document.createElement("div");
    this.overlayEl.style.cssText = `
      position:absolute;inset:0;display:none;align-items:center;
      justify-content:center;z-index:10;
      background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);
      transition:opacity 0.3s ease;
    `;

    // Action cue — large centred animation shown when an action is active
    this.actionCueEl = document.createElement("div");
    this.actionCueEl.style.cssText = `
      position:absolute;
      top:50%;left:50%;transform:translate(-50%,-50%);
      z-index:5;pointer-events:none;
      display:none;
      text-align:center;
      background:rgba(0,0,0,0.55);
      backdrop-filter:blur(4px);
      border-radius:20px;
      padding:18px 28px;
      min-width:160px;
      border:1.5px solid rgba(255,255,255,0.15);
    `;

    // Assemble
    this.root.appendChild(this.videoEl);
    this.root.appendChild(guideWrap);
    this.root.appendChild(topBar);
    this.root.appendChild(bottomPanel);
    this.root.appendChild(this.actionCueEl);
    this.root.appendChild(this.overlayEl);

    container.appendChild(this.root);
    this.startTimer(challenge.time_limit_seconds);

    return this.videoEl;
  }

  updateActions(states: ActionState[]): void {
    if (!this.stepsEl || !this.progressBarEl) return;

    let completed = 0;
    const activeState = states.find((s) => s.active && !s.detected) ?? null;
    const activeAction = activeState?.action ?? null;

    for (const state of states) {
      const step = this.stepsEl.querySelector(
        `[data-action="${state.action}"]`
      ) as HTMLDivElement | null;
      if (!step) continue;

      const num = step.querySelector(".sc-step-num") as HTMLElement | null;

      if (state.detected) {
        completed++;
        step.style.opacity = "1";
        step.style.background = "rgba(34,197,94,0.15)";
        if (num) {
          num.style.background = "#22c55e";
          num.style.borderColor = "#22c55e";
          num.textContent = "\u2713";
        }
      } else if (state.active) {
        step.style.opacity = "1";
        step.style.background = "rgba(59,130,246,0.15)";
        if (num) {
          num.style.borderColor = "#3b82f6";
          num.style.background = "rgba(59,130,246,0.3)";
        }
      }
    }

    // Update progress bar
    const pct = this.totalActions > 0 ? (completed / this.totalActions) * 100 : 0;
    this.progressBarEl.style.width = `${pct}%`;

    // Update confidence ring for the active action
    if (this.confidenceRingEl) {
      const circumference =
        2 * Math.PI * Math.sqrt((85 * 85 + 115 * 115) / 2);
      const conf = activeState ? activeState.confidence : 0;
      const offset = circumference * (1 - conf);
      this.confidenceRingEl.setAttribute("stroke-dashoffset", `${offset}`);
      this.confidenceRingEl.setAttribute(
        "stroke",
        conf > 0.6 ? "#22c55e" : "#3b82f6"
      );
    }

    // Show / switch large animated action cue
    this.updateActionCue(activeAction);
  }

  private updateActionCue(action: string | null): void {
    if (!this.actionCueEl) return;

    // No active action → hide cue
    if (!action) {
      this.actionCueEl.style.display = "none";
      this.currentCueAction = null;
      return;
    }

    // Same action already showing — no DOM thrash
    if (action === this.currentCueAction) return;

    this.currentCueAction = action;
    const cueHtml = ACTION_CUES[action];
    if (!cueHtml) {
      this.actionCueEl.style.display = "none";
      return;
    }

    // Inject content and animate in
    this.actionCueEl.innerHTML = cueHtml;
    this.actionCueEl.style.display = "block";
    this.actionCueEl.style.animation = "none";
    // Force reflow then trigger animation
    void this.actionCueEl.offsetWidth;
    this.actionCueEl.style.animation = "sc-pop-in 0.3s ease forwards";
  }

  updateInstruction(text: string): void {
    if (this.instructionEl) {
      this.instructionEl.textContent = text;
    }
  }

  stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.timerEl) {
      this.timerEl.textContent = "";
    }
  }

  showResult(status: "processing" | "failed"): Promise<void> {
    return new Promise((resolve) => {
      if (!this.overlayEl) { resolve(); return; }

      // Hide action cue before showing result
      if (this.actionCueEl) this.actionCueEl.style.display = "none";
      this.stopTimer();

      const isProcessing = status === "processing";
      this.overlayEl.style.display = "flex";

      this.overlayEl.innerHTML = `
        <div style="text-align:center;color:#fff;animation:sc-pop-in 0.35s ease;">
          <div style="
            width:80px;height:80px;border-radius:50%;margin:0 auto 16px;
            display:flex;align-items:center;justify-content:center;
            font-size:36px;
            background:${isProcessing ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"};
            border:3px solid ${isProcessing ? "#22c55e" : "#ef4444"};
          ">${isProcessing ? "\u2713" : "\u2717"}</div>
          <div style="font-size:18px;font-weight:700;margin-bottom:8px;">
            ${isProcessing ? "Submitted Successfully" : "Verification Failed"}
          </div>
          <div style="font-size:13px;opacity:0.65;">
            ${isProcessing ? "Results will arrive via webhook" : "Please try again"}
          </div>
        </div>
      `;

      setTimeout(resolve, 2200);
    });
  }

  /**
   * Show timeout screen with an optional retry callback.
   * Resolves immediately so the orchestrator can move to next step.
   */
  showTimeout(onRetry: () => void): Promise<void> {
    return new Promise((resolve) => {
      if (!this.overlayEl) { resolve(); return; }

      if (this.actionCueEl) this.actionCueEl.style.display = "none";
      this.stopTimer();

      this.overlayEl.style.display = "flex";
      this.overlayEl.innerHTML = `
        <div style="text-align:center;color:#fff;animation:sc-pop-in 0.35s ease;padding:24px;">
          <div style="
            width:80px;height:80px;border-radius:50%;margin:0 auto 16px;
            display:flex;align-items:center;justify-content:center;
            font-size:36px;
            background:rgba(251,191,36,0.15);
            border:3px solid #fbbf24;
          ">⏱</div>
          <div style="font-size:18px;font-weight:700;margin-bottom:8px;">Time's Up</div>
          <div style="font-size:13px;opacity:0.65;margin-bottom:20px;">
            You ran out of time. Please try again.
          </div>
          <button id="sc-retry-btn" style="
            padding:12px 28px;border-radius:10px;
            background:#3b82f6;color:#fff;
            border:none;cursor:pointer;
            font-size:14px;font-weight:600;
            width:100%;max-width:200px;
          ">Try Again</button>
        </div>
      `;

      // Wire retry button
      const retryBtn = this.overlayEl.querySelector("#sc-retry-btn") as HTMLButtonElement | null;
      if (retryBtn) {
        retryBtn.addEventListener("click", () => {
          onRetry();
          resolve();
        });
      } else {
        // fallback — auto-resolve after 5s
        setTimeout(resolve, 5000);
      }
    });
  }

  unmount(): void {
    this.stopTimer();
    if (this.root && this.root.parentElement) {
      this.root.parentElement.removeChild(this.root);
    }
    this.root = null;
    this.videoEl = null;
    this.instructionEl = null;
    this.stepsEl = null;
    this.progressBarEl = null;
    this.confidenceRingEl = null;
    this.timerEl = null;
    this.overlayEl = null;
    this.actionCueEl = null;
  }

  private startTimer(seconds: number): void {
    let remaining = seconds;

    const update = () => {
      if (!this.timerEl) return;
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      const display = m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
      this.timerEl.textContent = `${display} remaining`;

      if (remaining <= 5) {
        this.timerEl.style.color = "#ef4444";
      }
    };

    update();
    this.timerInterval = setInterval(() => {
      remaining--;
      update();
      if (remaining <= 0 && this.timerInterval) {
        clearInterval(this.timerInterval);
      }
    }, 1000);
  }

  private describeAction(action: string): string {
    const labels: Record<string, string> = {
      BLINK: "Blink your eyes",
      TURN_LEFT: "Turn your head left",
      TURN_RIGHT: "Turn your head right",
      TURN_HEAD: "Turn your head side to side",
      OPEN_MOUTH: "Open your mouth wide",
    };
    return labels[action] || action.replace(/_/g, " ").toLowerCase();
  }
}
