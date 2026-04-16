import { ThemeColors } from "./theme";

/**
 * Document capture UI — camera-based or file-upload for ID documents.
 *
 * Supports:
 *  - Camera capture (rear camera preferred on mobile)
 *  - File upload fallback
 *  - Preview with retake/confirm
 */
export class DocumentCapture {
  private root: HTMLDivElement | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private resolveCapture: ((blob: Blob) => void) | null = null;
  private rejectCapture: ((err: Error) => void) | null = null;

  /**
   * Mount the document capture UI and return a promise that resolves
   * with the captured document image Blob.
   */
  capture(
    container: HTMLElement,
    theme: ThemeColors,
    documentType: string
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.resolveCapture = resolve;
      this.rejectCapture = reject;
      this.renderChoiceScreen(container, theme, documentType);
    });
  }

  destroy(): void {
    this.stopCamera();
    if (this.root && this.root.parentElement) {
      this.root.parentElement.removeChild(this.root);
    }
    this.root = null;
  }

  private renderChoiceScreen(
    container: HTMLElement,
    theme: ThemeColors,
    documentType: string
  ): void {
    this.root = document.createElement("div");
    this.root.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:20px;padding:20px 0;";

    const docLabel = this.getDocumentLabel(documentType);

    // Illustration
    const icon = document.createElement("div");
    icon.style.cssText = `
      width:80px;height:80px;border-radius:16px;
      display:flex;align-items:center;justify-content:center;
      font-size:36px;background:${theme.shimmer};
      border:2px dashed ${theme.border};
    `;
    icon.textContent = "🪪";
    this.root.appendChild(icon);

    const label = document.createElement("div");
    label.style.cssText = `color:${theme.textSecondary};font-size:14px;text-align:center;line-height:1.5;`;
    label.textContent = `Take a clear photo of your ${docLabel}. Ensure all text is readable.`;
    this.root.appendChild(label);

    // Camera button
    const cameraBtn = this.createButton(
      "📷  Take Photo",
      theme,
      true
    );
    cameraBtn.addEventListener("click", () => {
      this.root!.innerHTML = "";
      this.renderCameraView(this.root!, theme, documentType);
    });
    this.root.appendChild(cameraBtn);

    // Upload button
    const uploadBtn = this.createButton(
      "📁  Upload File",
      theme,
      false
    );
    uploadBtn.addEventListener("click", () => {
      this.handleFileUpload(container, theme);
    });
    this.root.appendChild(uploadBtn);

    // File input (hidden)
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png";
    fileInput.style.display = "none";
    fileInput.id = "sc-doc-file-input";
    fileInput.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.showPreview(container, theme, file);
      }
    });
    this.root.appendChild(fileInput);

    container.appendChild(this.root);
  }

  private renderCameraView(
    container: HTMLElement,
    theme: ThemeColors,
    documentType: string
  ): void {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "position:relative;width:100%;border-radius:12px;overflow:hidden;background:#000;";

    this.videoEl = document.createElement("video");
    this.videoEl.autoplay = true;
    this.videoEl.playsInline = true;
    this.videoEl.muted = true;
    this.videoEl.style.cssText = "width:100%;display:block;aspect-ratio:4/3;object-fit:cover;";
    wrapper.appendChild(this.videoEl);

    // Guide overlay — rectangular
    const guide = document.createElement("div");
    guide.style.cssText = `
      position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
      pointer-events:none;
    `;
    const rect = document.createElement("div");
    rect.style.cssText = `
      width:85%;height:60%;border:2px solid rgba(255,255,255,0.6);
      border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,0.4);
    `;
    guide.appendChild(rect);
    wrapper.appendChild(guide);

    // Guide label
    const guideLbl = document.createElement("div");
    guideLbl.style.cssText = `
      position:absolute;bottom:60px;left:0;right:0;text-align:center;
      color:#fff;font-size:13px;font-weight:600;
      text-shadow:0 1px 3px rgba(0,0,0,0.5);
    `;
    guideLbl.textContent = `Align your ${this.getDocumentLabel(documentType)} within the frame`;
    wrapper.appendChild(guideLbl);

    container.appendChild(wrapper);

    // Capture button
    const captureBtn = document.createElement("button");
    captureBtn.style.cssText = `
      display:block;margin:16px auto 0;width:64px;height:64px;
      border-radius:50%;border:4px solid ${theme.primary};
      background:transparent;cursor:pointer;position:relative;
      transition:all 0.2s ease;
    `;
    const inner = document.createElement("div");
    inner.style.cssText = `
      width:48px;height:48px;border-radius:50%;background:${theme.primary};
      position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
      transition:all 0.15s ease;
    `;
    captureBtn.appendChild(inner);
    captureBtn.addEventListener("mousedown", () => {
      inner.style.transform = "translate(-50%,-50%) scale(0.9)";
    });
    captureBtn.addEventListener("mouseup", () => {
      inner.style.transform = "translate(-50%,-50%) scale(1)";
    });
    captureBtn.addEventListener("click", () => {
      this.captureFrame(container, theme);
    });
    container.appendChild(captureBtn);

    // Open camera
    this.openCamera();
  }

  private async openCamera(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
      });
      if (this.videoEl) {
        this.videoEl.srcObject = this.stream;
      }
    } catch (err) {
      // Fallback to any camera
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 } },
        });
        if (this.videoEl) {
          this.videoEl.srcObject = this.stream;
        }
      } catch {
        this.rejectCapture?.(new Error("Camera access denied. Please allow camera permissions."));
      }
    }
  }

  private captureFrame(container: HTMLElement, theme: ThemeColors): void {
    if (!this.videoEl) return;

    const canvas = document.createElement("canvas");
    canvas.width = this.videoEl.videoWidth;
    canvas.height = this.videoEl.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(this.videoEl, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          this.stopCamera();
          this.showPreview(container, theme, blob);
        }
      },
      "image/jpeg",
      0.92
    );
  }

  private showPreview(
    container: HTMLElement,
    theme: ThemeColors,
    imageData: Blob | File
  ): void {
    if (this.root) this.root.innerHTML = "";
    else {
      this.root = document.createElement("div");
      container.appendChild(this.root);
    }

    this.root.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:16px;";

    // Preview image
    const img = document.createElement("img");
    img.src = URL.createObjectURL(imageData);
    img.style.cssText = `
      width:100%;max-height:300px;object-fit:contain;border-radius:12px;
      border:2px solid ${theme.border};
    `;
    this.root.appendChild(img);

    const label = document.createElement("div");
    label.style.cssText = `color:${theme.textSecondary};font-size:13px;text-align:center;`;
    label.textContent = "Is the document clearly visible?";
    this.root.appendChild(label);

    // Buttons
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:12px;width:100%;";

    const retakeBtn = this.createButton("Retake", theme, false);
    retakeBtn.style.flex = "1";
    retakeBtn.addEventListener("click", () => {
      URL.revokeObjectURL(img.src);
      this.root!.innerHTML = "";
      this.renderChoiceScreen(container, theme, "document");
    });

    const useBtn = this.createButton("Use Photo ✓", theme, true);
    useBtn.style.flex = "1";
    useBtn.addEventListener("click", () => {
      URL.revokeObjectURL(img.src);
      this.resolveCapture?.(imageData);
    });

    btnRow.appendChild(retakeBtn);
    btnRow.appendChild(useBtn);
    this.root.appendChild(btnRow);
  }

  private handleFileUpload(container: HTMLElement, theme: ThemeColors): void {
    const input = this.root?.querySelector("#sc-doc-file-input") as HTMLInputElement;
    if (input) input.click();
  }

  private stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
  }

  private createButton(
    label: string,
    theme: ThemeColors,
    isPrimary: boolean
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.cssText = `
      padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;
      cursor:pointer;transition:all 0.2s ease;border:none;width:100%;
      ${
        isPrimary
          ? `background:${theme.primary};color:#fff;`
          : `background:${theme.inputBg};color:${theme.text};border:1px solid ${theme.border};`
      }
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "translateY(-1px)";
      if (isPrimary) btn.style.background = theme.primaryHover;
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "translateY(0)";
      if (isPrimary) btn.style.background = theme.primary;
    });
    return btn;
  }

  private getDocumentLabel(type: string): string {
    const labels: Record<string, string> = {
      passport: "passport",
      national_id: "national ID card",
      drivers_license: "driver's license",
    };
    return labels[type] || "identity document";
  }
}
