import { LivenessChallengeResponse } from "../../types/liveness";
import { ActionState } from "../../camera/ActionDetector";

const ICONS: Record<string, string> = {
  smile: "\uD83D\uDE04",
  blink: "\uD83D\uDE09",
  turn_left: "\u2B05",
  turn_right: "\u27A1",
  nod: "\uD83D\uDE42",
  open_mouth: "\uD83D\uDE2E",
  raise_eyebrows: "\uD83D\uDE32",
  close_eyes: "\uD83D\uDE0C",
  look_up: "\uD83D\uDC40",
  look_down: "\uD83D\uDC47",
  puff_cheeks: "\uD83D\uDE24",
  pucker_lips: "\uD83D\uDE17",
};

export class LivenessUI {
  private root: HTMLDivElement | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private instructionEl: HTMLDivElement | null = null;
  private stepsEl: HTMLDivElement | null = null;
  private progressBarEl: HTMLDivElement | null = null;
  private confidenceRingEl: SVGCircleElement | null = null;
  private timerEl: HTMLDivElement | null = null;
  private overlayEl: HTMLDivElement | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private totalActions = 0;

  mount(
    container: HTMLElement,
    challenge: LivenessChallengeResponse
  ): HTMLVideoElement {
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

    // Result overlay
    this.overlayEl = document.createElement("div");
    this.overlayEl.style.cssText = `
      position:absolute;inset:0;display:none;align-items:center;
      justify-content:center;z-index:10;
      background:rgba(0,0,0,0.8);backdrop-filter:blur(8px);
      transition:opacity 0.3s ease;
    `;

    // Assemble
    this.root.appendChild(this.videoEl);
    this.root.appendChild(guideWrap);
    this.root.appendChild(topBar);
    this.root.appendChild(bottomPanel);
    this.root.appendChild(this.overlayEl);

    container.appendChild(this.root);
    this.startTimer(challenge.time_limit_seconds);

    return this.videoEl;
  }

  updateActions(states: ActionState[]): void {
    if (!this.stepsEl || !this.progressBarEl) return;

    let completed = 0;

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
    const active = states.find((s) => s.active && !s.detected);
    if (this.confidenceRingEl) {
      const circumference =
        2 * Math.PI * Math.sqrt((85 * 85 + 115 * 115) / 2);
      const conf = active ? active.confidence : 0;
      const offset = circumference * (1 - conf);
      this.confidenceRingEl.setAttribute(
        "stroke-dashoffset",
        `${offset}`
      );
      this.confidenceRingEl.setAttribute(
        "stroke",
        conf > 0.6 ? "#22c55e" : "#3b82f6"
      );
    }
  }

  updateInstruction(text: string): void {
    if (this.instructionEl) {
      this.instructionEl.textContent = text;
    }
  }

  showResult(status: "verified" | "failed"): Promise<void> {
    return new Promise((resolve) => {
      if (!this.overlayEl) {
        resolve();
        return;
      }

      const isSuccess = status === "verified";
      this.overlayEl.style.display = "flex";

      this.overlayEl.innerHTML = `
        <div style="text-align:center;color:#fff;animation:sc-pop 0.3s ease;">
          <div style="
            width:72px;height:72px;border-radius:50%;margin:0 auto 16px;
            display:flex;align-items:center;justify-content:center;
            font-size:32px;
            background:${isSuccess ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"};
            border:3px solid ${isSuccess ? "#22c55e" : "#ef4444"};
          ">${isSuccess ? "\u2713" : "\u2717"}</div>
          <div style="font-size:18px;font-weight:700;margin-bottom:6px;">
            ${isSuccess ? "Verification Passed" : "Verification Failed"}
          </div>
          <div style="font-size:13px;opacity:0.6;">
            ${isSuccess ? "Liveness confirmed" : "Please try again"}
          </div>
        </div>
      `;

      setTimeout(resolve, 2200);
    });
  }

  unmount(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
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
    return labels[action] || action.replace(/_/g, " ");
  }
}
