import { SmartComply } from "../client/Smartcomply";
import { SDKInitConfig, VerifyIdentityResponse } from "../types/onboarding";
import { LivenessSubmitResponse, ChallengeAction } from "../types/liveness";
import { ThemeColors, getTheme } from "./theme";
import { DocumentCapture } from "./DocumentCapture";
import { Environment } from "../client/Config";

// ─────────────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────────────

export interface FlowOptions {
  apiKey: string;
  clientId: string;
  environment?: Environment;
  timeout?: number;
  onComplete?: (result: FlowResult) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export interface FlowResult {
  entryId: number;
  status: string;
  submittedAt: string | null;
  verificationResult?: VerifyIdentityResponse;
}

// ─────────────────────────────────────────────────────────────────────
// Step definitions
// ─────────────────────────────────────────────────────────────────────

type StepName =
  | "loading"
  | "welcome"
  | "country"
  | "id_type"
  | "id_input"
  | "slip_upload"     // Nigeria only: upload physical NIN/BVN slip
  | "document_capture"
  | "liveness"
  | "result"
  | "error";

const STEP_ORDER: StepName[] = [
  "loading",
  "welcome",
  "country",
  "id_type",
  "id_input",
  "slip_upload",
  "document_capture",
  "liveness",
  "result",
];

const COUNTRY_LABELS: Record<string, string> = {
  nigeria: "🇳🇬  Nigeria",
  global: "🌍  Other Countries",
  ghana: "🇬🇭  Ghana",
  kenya: "🇰🇪  Kenya",
  south_africa: "🇿🇦  South Africa",
  united_states: "🇺🇸  United States",
  united_kingdom: "🇬🇧  United Kingdom",
};

const ID_TYPE_LABELS: Record<string, { label: string; icon: string; desc: string }> = {
  nin: { label: "National ID Number (NIN)", icon: "🆔", desc: "11-digit NIN" },
  bvn: { label: "Bank Verification Number", icon: "🏦", desc: "11-digit BVN" },
  passport: { label: "International Passport", icon: "📘", desc: "Upload passport photo" },
  national_id: { label: "National ID Card", icon: "🪪", desc: "Upload ID card photo" },
  drivers_license: { label: "Driver's License", icon: "🚗", desc: "Upload license photo" },
  voters_id: { label: "Voter's Card", icon: "🗳️", desc: "Voter's ID number" },
};

const DATA_ID_TYPES = new Set(["nin", "bvn", "voters_id"]);

// ─────────────────────────────────────────────────────────────────────
// SmartComplyFlow
// ─────────────────────────────────────────────────────────────────────

export class SmartComplyFlow {
  private sdk: SmartComply;
  private options: FlowOptions;
  private theme: ThemeColors = getTheme("default");

  // DOM
  private overlay: HTMLDivElement | null = null;
  private modal: HTMLDivElement | null = null;
  private contentArea: HTMLDivElement | null = null;
  private progressBar: HTMLDivElement | null = null;
  private stepLabel: HTMLDivElement | null = null;
  private brandLabel: HTMLDivElement | null = null;

  // State
  private sdkConfig: SDKInitConfig | null = null;
  private currentStep: StepName = "loading";
  private selectedCountry: string = "";
  private selectedIdType: string = "";
  private idNumber: string = "";
  private documentBlob: Blob | null = null;
  private slipBlob: Blob | null = null;       // NIN/BVN physical slip upload
  private verificationResult: VerifyIdentityResponse | null = null;
  private isDestroyed = false;

  // Components
  private docCapture: DocumentCapture | null = null;

  private constructor(options: FlowOptions) {
    this.options = options;
    this.sdk = new SmartComply({
      apiKey: options.apiKey,
      clientId: options.clientId,
      environment: options.environment || "sandbox",
      timeout: options.timeout,
    });
  }

  /**
   * Open the SmartComply verification flow.
   *
   * Usage:
   *   SmartComplyFlow.open({
   *     apiKey: "pk_live_...",
   *     clientId: "uuid-...",
   *     environment: "production",
   *     onComplete: (result) => console.log("Done!", result),
   *     onError: (err) => console.error(err),
   *     onClose: () => console.log("Closed"),
   *   });
   */
  static open(options: FlowOptions): SmartComplyFlow {
    const flow = new SmartComplyFlow(options);
    flow.mount();
    flow.initialize();
    return flow;
  }

  /**
   * Close and destroy the flow widget.
   */
  close(): void {
    this.isDestroyed = true;
    this.docCapture?.destroy();

    if (this.overlay) {
      this.overlay.style.opacity = "0";
      setTimeout(() => {
        if (this.overlay?.parentElement) {
          this.overlay.parentElement.removeChild(this.overlay);
        }
        this.overlay = null;
        this.modal = null;
        this.contentArea = null;
      }, 300);
    }

    this.options.onClose?.();
  }

  // ─────────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────────

  private mount(): void {
    // Inject keyframes
    this.injectStyles();

    // Overlay
    this.overlay = document.createElement("div");
    this.overlay.id = "sc-flow-overlay";
    this.overlay.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      display:flex;align-items:center;justify-content:center;
      background:${this.theme.overlay};
      backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
      opacity:0;transition:opacity 0.3s ease;
      font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;
    `;

    // Modal
    this.modal = document.createElement("div");
    this.modal.id = "sc-flow-modal";
    this.modal.style.cssText = `
      width:100%;max-width:440px;max-height:92vh;
      background:${this.theme.bg};
      border-radius:20px;overflow:hidden;
      box-shadow:${this.theme.shadow};
      display:flex;flex-direction:column;
      transform:translateY(20px) scale(0.97);
      transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);
    `;

    // Header
    const header = this.createHeader();
    this.modal.appendChild(header);

    // Progress bar
    const progressWrap = document.createElement("div");
    progressWrap.style.cssText = `height:3px;background:${this.theme.shimmer};`;
    this.progressBar = document.createElement("div");
    this.progressBar.style.cssText = `
      height:100%;width:0%;background:linear-gradient(90deg,${this.theme.primary},${this.theme.primaryHover});
      border-radius:0 2px 2px 0;transition:width 0.5s ease;
    `;
    progressWrap.appendChild(this.progressBar);
    this.modal.appendChild(progressWrap);

    // Content area (scrollable)
    this.contentArea = document.createElement("div");
    this.contentArea.id = "sc-flow-content";
    this.contentArea.style.cssText = `
      flex:1;overflow-y:auto;padding:24px;
      -webkit-overflow-scrolling:touch;
    `;
    this.modal.appendChild(this.contentArea);

    // Footer
    const footer = this.createFooter();
    this.modal.appendChild(footer);

    this.overlay.appendChild(this.modal);
    document.body.appendChild(this.overlay);

    // Animate in
    requestAnimationFrame(() => {
      if (this.overlay) this.overlay.style.opacity = "1";
      if (this.modal) this.modal.style.transform = "translateY(0) scale(1)";
    });
  }

  private async initialize(): Promise<void> {
    this.showStep("loading");

    try {
      // Create session
      await this.sdk.createSession();

      // Load config
      this.sdkConfig = await this.sdk.initializeConfig();

      // Apply theme from config
      if (this.sdkConfig.theme) {
        this.theme = getTheme(this.sdkConfig.theme);
        this.applyTheme();
      }

      // Update brand name
      if (this.brandLabel && this.sdkConfig.brand_name) {
        this.brandLabel.textContent = this.sdkConfig.brand_name;
      }

      if (this.isDestroyed) return;

      this.showStep("welcome");

    } catch (err: any) {
      // Surface the "already used" error as a dedicated, clear screen
      if (err?.code === "CLIENT_ID_ALREADY_USED" || (typeof err?.message === "string" && err.message.includes("already been used"))) {
        this.showAlreadyUsedStep();
      } else {
        this.showErrorStep(err.message || "Failed to initialize. Please try again.");
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Step rendering
  // ─────────────────────────────────────────────────────────────────

  private showStep(step: StepName): void {
    this.currentStep = step;
    if (!this.contentArea) return;

    // Update progress
    this.updateProgress();

    // Animate out current content
    const oldContent = this.contentArea.firstChild as HTMLElement | null;
    if (oldContent) {
      oldContent.style.cssText += "opacity:0;transform:translateX(-20px);transition:all 0.2s ease;";
      setTimeout(() => {
        if (this.contentArea) this.contentArea.innerHTML = "";
        this.renderStep(step);
      }, 200);
    } else {
      this.renderStep(step);
    }
  }

  private renderStep(step: StepName): void {
    if (!this.contentArea) return;

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "opacity:0;transform:translateX(20px);transition:all 0.3s ease;";

    switch (step) {
      case "loading":
        this.renderLoading(wrapper);
        break;
      case "welcome":
        this.renderWelcome(wrapper);
        break;
      case "country":
        this.renderCountrySelect(wrapper);
        break;
      case "id_type":
        this.renderIdTypeSelect(wrapper);
        break;
      case "id_input":
        this.renderIdInput(wrapper);
        break;
      case "slip_upload":
        this.renderSlipUpload(wrapper);
        break;
      case "document_capture":
        this.renderDocumentCapture(wrapper);
        break;
      case "liveness":
        this.renderLiveness(wrapper);
        break;
      case "result":
        this.renderResult(wrapper);
        break;
      case "error":
        break; // handled separately
    }

    this.contentArea.appendChild(wrapper);

    // Animate in
    requestAnimationFrame(() => {
      wrapper.style.opacity = "1";
      wrapper.style.transform = "translateX(0)";
    });
  }

  // ── Loading ─────────────────────────────────────────────────────

  private renderLoading(container: HTMLElement): void {
    container.style.cssText += "display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;gap:20px;";

    const spinner = document.createElement("div");
    spinner.style.cssText = `
      width:40px;height:40px;border-radius:50%;
      border:3px solid ${this.theme.border};
      border-top-color:${this.theme.primary};
      animation:sc-spin 0.8s linear infinite;
    `;
    container.appendChild(spinner);

    const label = document.createElement("div");
    label.style.cssText = `color:${this.theme.textSecondary};font-size:14px;`;
    label.textContent = "Setting up secure session...";
    container.appendChild(label);
  }

  // ── Welcome ────────────────────────────────────────────────────

  private renderWelcome(container: HTMLElement): void {
    container.style.cssText += "display:flex;flex-direction:column;align-items:center;text-align:center;gap:16px;";

    // Icon
    const iconWrap = document.createElement("div");
    iconWrap.style.cssText = `
      width:72px;height:72px;border-radius:18px;
      display:flex;align-items:center;justify-content:center;
      font-size:32px;
      background:linear-gradient(135deg,${this.theme.primaryGlow},${this.theme.shimmer});
      border:1px solid ${this.theme.border};
      margin-bottom:4px;
    `;
    iconWrap.textContent = "🛡️";
    container.appendChild(iconWrap);

    // Title
    const title = document.createElement("h2");
    title.style.cssText = `
      color:${this.theme.text};font-size:22px;font-weight:700;
      margin:0;line-height:1.3;
    `;
    title.textContent = "Identity Verification";
    container.appendChild(title);

    // Description
    const desc = document.createElement("p");
    desc.style.cssText = `
      color:${this.theme.textSecondary};font-size:14px;line-height:1.6;
      margin:0;max-width:320px;
    `;
    desc.textContent = this.sdkConfig?.description ||
      "We need to verify your identity to keep your account safe. This takes about 2 minutes.";
    container.appendChild(desc);

    // Steps preview
    const steps = [
      { icon: "📋", text: "Select your ID type" },
      { icon: "🆔", text: "Enter or upload your ID" },
      { icon: "📹", text: "Quick face verification" },
    ];

    const stepsWrap = document.createElement("div");
    stepsWrap.style.cssText = `
      width:100%;display:flex;flex-direction:column;gap:10px;
      margin:8px 0;padding:16px;border-radius:12px;
      background:${this.theme.cardBg};border:1px solid ${this.theme.border};
    `;

    for (const step of steps) {
      const row = document.createElement("div");
      row.style.cssText = `display:flex;align-items:center;gap:12px;`;

      const icon = document.createElement("span");
      icon.style.cssText = "font-size:18px;flex-shrink:0;";
      icon.textContent = step.icon;

      const text = document.createElement("span");
      text.style.cssText = `color:${this.theme.text};font-size:13px;`;
      text.textContent = step.text;

      row.appendChild(icon);
      row.appendChild(text);
      stepsWrap.appendChild(row);
    }

    container.appendChild(stepsWrap);

    // CTA
    const btn = this.createPrimaryButton("Get Started");
    btn.addEventListener("click", () => {
      const channels = this.sdkConfig?.channels;
      if (channels && Object.keys(channels).length === 1) {
        // Skip country selection if only one channel
        this.selectedCountry = Object.keys(channels)[0];
        this.showStep("id_type");
      } else {
        this.showStep("country");
      }
    });
    container.appendChild(btn);

    // Trust badge
    const trust = document.createElement("div");
    trust.style.cssText = `
      display:flex;align-items:center;gap:6px;
      color:${this.theme.textMuted};font-size:11px;margin-top:4px;
    `;
    trust.textContent = "🔒  Your data is encrypted and secure";
    container.appendChild(trust);
  }

  // ── Country Select ──────────────────────────────────────────────

  private renderCountrySelect(container: HTMLElement): void {
    container.style.cssText += "display:flex;flex-direction:column;gap:16px;";

    const title = this.createStepTitle("Select your country");
    container.appendChild(title);

    const subtitle = document.createElement("div");
    subtitle.style.cssText = `color:${this.theme.textSecondary};font-size:13px;margin-top:-8px;`;
    subtitle.textContent = "Choose the country that issued your ID";
    container.appendChild(subtitle);

    const channels = this.sdkConfig?.channels || {};

    for (const country of Object.keys(channels)) {
      const card = this.createOptionCard(
        COUNTRY_LABELS[country] || country,
        `${channels[country].length} ID type${channels[country].length > 1 ? "s" : ""} available`,
        () => {
          this.selectedCountry = country;
          this.showStep("id_type");
        }
      );
      container.appendChild(card);
    }
  }

  // ── ID Type Select ──────────────────────────────────────────────

  private renderIdTypeSelect(container: HTMLElement): void {
    container.style.cssText += "display:flex;flex-direction:column;gap:16px;";

    const title = this.createStepTitle("Select ID type");
    container.appendChild(title);

    const channels = this.sdkConfig?.channels || {};
    const idTypes = channels[this.selectedCountry] || [];

    for (const idType of idTypes) {
      const info = ID_TYPE_LABELS[idType] || {
        label: idType,
        icon: "📄",
        desc: "",
      };

      const card = this.createOptionCard(
        `${info.icon}  ${info.label}`,
        info.desc,
        () => {
          this.selectedIdType = idType;
          if (DATA_ID_TYPES.has(idType)) {
            this.showStep("id_input");
          } else {
            this.showStep("document_capture");
          }
        }
      );
      container.appendChild(card);
    }

    // Back button
    const backBtn = this.createSecondaryButton("← Back");
    backBtn.addEventListener("click", () => this.showStep("country"));
    container.appendChild(backBtn);
  }

  // ── ID Input (data verification: NIN, BVN) ─────────────────────

  private renderIdInput(container: HTMLElement): void {
    container.style.cssText += "display:flex;flex-direction:column;gap:16px;";

    const info = ID_TYPE_LABELS[this.selectedIdType] || { label: this.selectedIdType, icon: "🆔", desc: "" };

    const title = this.createStepTitle(`Enter your ${info.label}`);
    container.appendChild(title);

    // Input field
    const inputWrap = document.createElement("div");
    inputWrap.style.cssText = "position:relative;";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = info.desc || `Enter your ${this.selectedIdType.toUpperCase()} number`;
    input.maxLength = 20;
    input.style.cssText = `
      width:100%;padding:14px 16px;border-radius:12px;
      font-size:16px;font-weight:500;
      background:${this.theme.inputBg};
      color:${this.theme.text};
      border:2px solid ${this.theme.border};
      outline:none;transition:border-color 0.2s ease;
      box-sizing:border-box;
      letter-spacing:1px;
    `;
    input.addEventListener("focus", () => {
      input.style.borderColor = this.theme.primary;
    });
    input.addEventListener("blur", () => {
      input.style.borderColor = this.theme.border;
    });
    input.addEventListener("input", () => {
      this.idNumber = input.value.trim();
      submitBtn.disabled = this.idNumber.length < 5;
      submitBtn.style.opacity = this.idNumber.length < 5 ? "0.5" : "1";
    });
    inputWrap.appendChild(input);
    container.appendChild(inputWrap);

    // Error area
    const errorEl = document.createElement("div");
    errorEl.id = "sc-id-error";
    errorEl.style.cssText = `
      color:${this.theme.error};font-size:13px;display:none;
      padding:8px 12px;border-radius:8px;background:${this.theme.errorBg};
    `;
    container.appendChild(errorEl);

    // Submit
    const submitBtn = this.createPrimaryButton("Verify & Continue");
    submitBtn.disabled = true;
    submitBtn.style.opacity = "0.5";
    submitBtn.addEventListener("click", async () => {
      if (!this.idNumber) return;

      submitBtn.disabled = true;
      submitBtn.textContent = "Verifying...";

      try {
        const country = this.selectedCountry === "nigeria" ? "NG" : this.selectedCountry.toUpperCase().slice(0, 2);

        this.verificationResult = await this.sdk.onboarding.verify({
          onboarding_type: this.selectedIdType as any,
          id_number: this.idNumber,
          country,
        });

        if (this.verificationResult.status === "verified") {
          // Nigeria flow: go to slip upload step after NIN/BVN is verified
          this.showStep("slip_upload");
        } else {
          errorEl.textContent = this.verificationResult.message || "Verification failed. Please check your ID number.";
          errorEl.style.display = "block";
          submitBtn.textContent = "Verify & Continue";
          submitBtn.disabled = false;
          submitBtn.style.opacity = "1";
        }
      } catch (err: any) {
        errorEl.textContent = err.message || "Verification failed";
        errorEl.style.display = "block";
        submitBtn.textContent = "Verify & Continue";
        submitBtn.disabled = false;
        submitBtn.style.opacity = "1";
      }
    });
    container.appendChild(submitBtn);

    // Back
    const backBtn = this.createSecondaryButton("← Back");
    backBtn.addEventListener("click", () => this.showStep("id_type"));
    container.appendChild(backBtn);

    // Focus input
    setTimeout(() => input.focus(), 350);
  }

  // ── Slip Upload (Nigeria: physical NIN/BVN slip) ────────────────

  private renderSlipUpload(container: HTMLElement): void {
    container.style.cssText += "display:flex;flex-direction:column;gap:16px;";

    const idLabel = this.selectedIdType === "bvn" ? "BVN" : "NIN";

    const title = this.createStepTitle(`Upload ${idLabel} Slip`);
    container.appendChild(title);

    const subtitle = document.createElement("div");
    subtitle.style.cssText = `color:${this.theme.textSecondary};font-size:13px;margin-top:-8px;line-height:1.5;`;
    subtitle.textContent = `Please upload a clear photo of your ${idLabel} slip or card. Accepted: JPG, PNG (max 5MB).`;
    container.appendChild(subtitle);

    // Drop zone
    const dropZone = document.createElement("div");
    dropZone.style.cssText = `
      border:2px dashed ${this.theme.border};border-radius:14px;
      padding:32px 16px;text-align:center;cursor:pointer;
      background:${this.theme.cardBg};
      transition:all 0.2s ease;
      display:flex;flex-direction:column;align-items:center;gap:12px;
    `;

    const dropIcon = document.createElement("div");
    dropIcon.style.cssText = "font-size:36px;";
    dropIcon.textContent = "📄";
    dropZone.appendChild(dropIcon);

    const dropText = document.createElement("div");
    dropText.style.cssText = `color:${this.theme.textSecondary};font-size:13px;line-height:1.5;`;
    dropText.innerHTML = `<strong style="color:${this.theme.primary}">Click to upload</strong> or drag and drop<br>your ${idLabel} slip / card image`;
    dropZone.appendChild(dropText);

    // Hidden file input
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/jpg,image/png";
    fileInput.style.display = "none";
    container.appendChild(fileInput);

    // Preview element
    const preview = document.createElement("div");
    preview.style.cssText = "display:none;";
    const previewImg = document.createElement("img");
    previewImg.style.cssText = `
      width:100%;max-height:180px;object-fit:cover;
      border-radius:10px;border:2px solid ${this.theme.border};
    `;
    const previewName = document.createElement("div");
    previewName.style.cssText = `color:${this.theme.textSecondary};font-size:12px;margin-top:6px;text-align:center;`;
    preview.appendChild(previewImg);
    preview.appendChild(previewName);

    // Error area
    const errorEl = document.createElement("div");
    errorEl.style.cssText = `
      color:${this.theme.error};font-size:13px;display:none;
      padding:8px 12px;border-radius:8px;background:${this.theme.errorBg};
    `;

    // Continue button (disabled until file chosen)
    const continueBtn = this.createPrimaryButton(`Continue to Face Verification`);
    continueBtn.id = "sc-slip-continue";
    continueBtn.disabled = true;
    continueBtn.style.opacity = "0.5";

    const processFile = (file: File) => {
      errorEl.style.display = "none";

      // Validate type
      if (!['image/jpeg','image/jpg','image/png'].includes(file.type)) {
        errorEl.textContent = "Only JPG and PNG images are accepted.";
        errorEl.style.display = "block";
        return;
      }
      // Validate size (5 MB)
      if (file.size > 5 * 1024 * 1024) {
        errorEl.textContent = "File too large. Maximum size is 5 MB.";
        errorEl.style.display = "block";
        return;
      }

      this.slipBlob = file;

      // Show preview
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImg.src = e.target?.result as string;
        previewName.textContent = file.name;
        preview.style.display = "block";
        dropZone.style.borderStyle = "solid";
        dropZone.style.borderColor = this.theme.primary;
        dropIcon.textContent = "✅";
        dropText.innerHTML = `<strong style="color:${this.theme.success || '#22c55e'}">File selected</strong> — click to change`;
      };
      reader.readAsDataURL(file);

      continueBtn.disabled = false;
      continueBtn.style.opacity = "1";
    };

    // Click to open file dialog
    dropZone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      if (fileInput.files?.[0]) processFile(fileInput.files[0]);
    });

    // Drag-and-drop support
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.style.borderColor = this.theme.primary;
      dropZone.style.background = this.theme.shimmer;
    });
    dropZone.addEventListener("dragleave", () => {
      dropZone.style.borderColor = this.theme.border;
      dropZone.style.background = this.theme.cardBg;
    });
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.style.borderColor = this.theme.border;
      dropZone.style.background = this.theme.cardBg;
      const file = e.dataTransfer?.files[0];
      if (file) processFile(file);
    });

    continueBtn.addEventListener("click", () => {
      if (this.slipBlob) this.showStep("liveness");
    });

    container.appendChild(dropZone);
    container.appendChild(preview);
    container.appendChild(errorEl);
    container.appendChild(continueBtn);

    // Back
    const backBtn = this.createSecondaryButton("← Back");
    backBtn.addEventListener("click", () => this.showStep("id_input"));
    container.appendChild(backBtn);
  }

  // ── Document Capture ────────────────────────────────────────────

  private renderDocumentCapture(container: HTMLElement): void {
    container.style.cssText += "display:flex;flex-direction:column;gap:16px;";

    const title = this.createStepTitle("Capture your document");
    container.appendChild(title);

    // Register intent with backend
    this.registerDocumentIntent();

    const captureContainer = document.createElement("div");
    container.appendChild(captureContainer);

    this.docCapture = new DocumentCapture();
    this.docCapture
      .capture(captureContainer, this.theme, this.selectedIdType)
      .then((blob) => {
        this.documentBlob = blob;
        this.showStep("liveness");
      })
      .catch((err) => {
        this.showErrorStep(err.message || "Document capture failed");
      });

    // Back
    const backBtn = this.createSecondaryButton("← Back");
    backBtn.style.marginTop = "8px";
    backBtn.addEventListener("click", () => {
      this.docCapture?.destroy();
      this.showStep("id_type");
    });
    container.appendChild(backBtn);
  }

  private async registerDocumentIntent(): Promise<void> {
    try {
      const country = this.selectedCountry === "nigeria"
        ? "NG"
        : this.selectedCountry === "global"
        ? "US"
        : this.selectedCountry.toUpperCase().slice(0, 2);

      this.verificationResult = await this.sdk.onboarding.verify({
        onboarding_type: this.selectedIdType as any,
        country,
      });
    } catch {
      // Non-blocking — document intent is optional
    }
  }

  // ── Liveness ────────────────────────────────────────────────────

  private renderLiveness(container: HTMLElement): void {
    container.style.cssText += "display:flex;flex-direction:column;gap:16px;";

    const title = this.createStepTitle("Face verification");
    container.appendChild(title);

    const desc = document.createElement("div");
    desc.style.cssText = `color:${this.theme.textSecondary};font-size:13px;margin-top:-8px;line-height:1.5;`;
    desc.textContent = "Position your face in the oval and follow the on-screen instructions.";
    container.appendChild(desc);

    // Liveness mount point
    const livenessContainer = document.createElement("div");
    livenessContainer.style.cssText = "margin:8px 0;";
    container.appendChild(livenessContainer);

    const identifier = this.idNumber || `DOC-${Date.now()}`;
    const country = this.selectedCountry === "nigeria"
      ? "NG"
      : this.selectedCountry === "global"
      ? "US"
      : this.selectedCountry.toUpperCase().slice(0, 2);

    // id_file: use the NIN/BVN slip blob (Nigeria) or document blob (international)
    const idFile = this.slipBlob ?? this.documentBlob ?? undefined;

    // Start liveness check (this handles camera, detection, recording, submission)
    this.sdk.liveness
      .startCheck(
        livenessContainer,
        {
          identifier,
          identifier_type: this.selectedIdType,
          country,
          id_file: idFile,
        },
        ["BLINK", "TURN_LEFT", "OPEN_MOUTH"] as ChallengeAction[]
      )
      .then((result) => {
        this.showResult(result);
      })
      .catch((err) => {
        if (err?.code === "CLIENT_ID_ALREADY_USED" || (typeof err?.message === "string" && err.message.includes("already been used"))) {
          this.showAlreadyUsedStep();
        } else {
          this.showErrorStep(err.message || "Liveness verification failed. Please try again.");
        }
      });
  }

  // ── Result ──────────────────────────────────────────────────────

  private showResult(submitResult: LivenessSubmitResponse): void {
    this.currentStep = "result";
    this.updateProgress();

    if (!this.contentArea) return;
    this.contentArea.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.style.cssText = `
      display:flex;flex-direction:column;align-items:center;
      text-align:center;gap:16px;padding:20px 0;
      opacity:0;transform:scale(0.95);transition:all 0.4s ease;
    `;

    // Success icon
    const iconWrap = document.createElement("div");
    iconWrap.style.cssText = `
      width:80px;height:80px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:36px;
      background:${this.theme.successBg};
      border:3px solid ${this.theme.success};
      animation:sc-pop 0.4s ease;
    `;
    iconWrap.textContent = "✓";
    wrapper.appendChild(iconWrap);

    const title = document.createElement("h2");
    title.style.cssText = `color:${this.theme.text};font-size:20px;font-weight:700;margin:0;`;
    title.textContent = "Verification Submitted";
    wrapper.appendChild(title);

    const desc = document.createElement("p");
    desc.style.cssText = `color:${this.theme.textSecondary};font-size:14px;line-height:1.6;margin:0;max-width:300px;`;
    desc.textContent = "Your identity is being verified. You'll receive the results shortly.";
    wrapper.appendChild(desc);

    // Details card
    const details = document.createElement("div");
    details.style.cssText = `
      width:100%;padding:16px;border-radius:12px;
      background:${this.theme.cardBg};border:1px solid ${this.theme.border};
      text-align:left;
    `;
    details.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="color:${this.theme.textMuted};font-size:12px;">Entry ID</span>
        <span style="color:${this.theme.text};font-size:12px;font-weight:600;">${submitResult.id}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="color:${this.theme.textMuted};font-size:12px;">Status</span>
        <span style="color:${this.theme.warning};font-size:12px;font-weight:600;">Processing</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:${this.theme.textMuted};font-size:12px;">Submitted</span>
        <span style="color:${this.theme.text};font-size:12px;">${new Date(submitResult.submitted_at || "").toLocaleString()}</span>
      </div>
    `;
    wrapper.appendChild(details);

    // Done button
    const doneBtn = this.createPrimaryButton("Done");
    doneBtn.addEventListener("click", () => {
      this.options.onComplete?.({
        entryId: submitResult.id,
        status: submitResult.status,
        submittedAt: submitResult.submitted_at,
        verificationResult: this.verificationResult || undefined,
      });
      this.close();
    });
    wrapper.appendChild(doneBtn);

    this.contentArea.appendChild(wrapper);

    requestAnimationFrame(() => {
      wrapper.style.opacity = "1";
      wrapper.style.transform = "scale(1)";
    });
  }

  private renderResult(_container: HTMLElement): void {
    // Handled by showResult() directly
  }

  // ── Error ───────────────────────────────────────────────────────

  /** Shown when the client_id has already been used for a verified submission. */
  private showAlreadyUsedStep(): void {
    this.currentStep = "error";
    if (!this.contentArea) return;
    this.contentArea.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.style.cssText = `
      display:flex;flex-direction:column;align-items:center;
      text-align:center;gap:16px;padding:20px 0;
    `;

    const iconWrap = document.createElement("div");
    iconWrap.style.cssText = `
      width:72px;height:72px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:32px;
      background:${this.theme.shimmer};
      border:3px solid ${this.theme.border};
    `;
    iconWrap.textContent = "🔒";
    wrapper.appendChild(iconWrap);

    const title = document.createElement("h2");
    title.style.cssText = `color:${this.theme.text};font-size:18px;font-weight:700;margin:0;`;
    title.textContent = "Already Verified";
    wrapper.appendChild(title);

    const desc = document.createElement("p");
    desc.style.cssText = `color:${this.theme.textSecondary};font-size:14px;line-height:1.6;margin:0;max-width:300px;`;
    desc.textContent = "This verification link has already been used. Each link can only be used once. Please contact support if you believe this is an error.";
    wrapper.appendChild(desc);

    const infoCard = document.createElement("div");
    infoCard.style.cssText = `
      width:100%;padding:14px 16px;border-radius:12px;
      background:${this.theme.cardBg};border:1px solid ${this.theme.border};
      display:flex;align-items:center;gap:12px;text-align:left;
    `;
    infoCard.innerHTML = `
      <span style="font-size:20px;">ℹ️</span>
      <span style="color:${this.theme.textSecondary};font-size:13px;line-height:1.5;">
        If you need to re-verify, ask the issuing organisation to generate a new link for you.
      </span>
    `;
    wrapper.appendChild(infoCard);

    const closeBtn = this.createPrimaryButton("Close");
    closeBtn.addEventListener("click", () => {
      this.options.onError?.(new Error("CLIENT_ID_ALREADY_USED"));
      this.close();
    });
    wrapper.appendChild(closeBtn);

    this.contentArea.appendChild(wrapper);
  }

  private showErrorStep(message: string): void {
    this.currentStep = "error";
    if (!this.contentArea) return;
    this.contentArea.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.style.cssText = `
      display:flex;flex-direction:column;align-items:center;
      text-align:center;gap:16px;padding:20px 0;
    `;

    const iconWrap = document.createElement("div");
    iconWrap.style.cssText = `
      width:72px;height:72px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:32px;
      background:${this.theme.errorBg};
      border:3px solid ${this.theme.error};
    `;
    iconWrap.textContent = "✗";
    wrapper.appendChild(iconWrap);

    const title = document.createElement("h2");
    title.style.cssText = `color:${this.theme.text};font-size:18px;font-weight:700;margin:0;`;
    title.textContent = "Something Went Wrong";
    wrapper.appendChild(title);

    const desc = document.createElement("p");
    desc.style.cssText = `color:${this.theme.textSecondary};font-size:14px;line-height:1.6;margin:0;max-width:300px;`;
    desc.textContent = message;
    wrapper.appendChild(desc);

    const retryBtn = this.createPrimaryButton("Try Again");
    retryBtn.addEventListener("click", () => {
      this.showStep("welcome");
      this.initialize();
    });
    wrapper.appendChild(retryBtn);

    const closeBtn = this.createSecondaryButton("Close");
    closeBtn.addEventListener("click", () => {
      this.options.onError?.(new Error(message));
      this.close();
    });
    wrapper.appendChild(closeBtn);

    this.contentArea.appendChild(wrapper);
  }

  // ─────────────────────────────────────────────────────────────────
  // UI Helpers
  // ─────────────────────────────────────────────────────────────────

  private createHeader(): HTMLElement {
    const header = document.createElement("div");
    header.style.cssText = `
      display:flex;align-items:center;justify-content:space-between;
      padding:16px 20px;border-bottom:1px solid ${this.theme.border};
    `;

    // Brand
    this.brandLabel = document.createElement("div");
    this.brandLabel.style.cssText = `
      font-size:15px;font-weight:700;color:${this.theme.text};
      display:flex;align-items:center;gap:8px;
    `;
    this.brandLabel.textContent = this.sdkConfig?.brand_name || "SmartComply";
    header.appendChild(this.brandLabel);

    // Step indicator
    this.stepLabel = document.createElement("div");
    this.stepLabel.style.cssText = `
      font-size:12px;color:${this.theme.textMuted};
      font-variant-numeric:tabular-nums;
    `;
    header.appendChild(this.stepLabel);

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "✕";
    closeBtn.style.cssText = `
      width:32px;height:32px;border-radius:8px;
      display:flex;align-items:center;justify-content:center;
      border:none;cursor:pointer;font-size:16px;
      background:${this.theme.shimmer};color:${this.theme.textMuted};
      transition:all 0.2s ease;
    `;
    closeBtn.addEventListener("mouseenter", () => {
      closeBtn.style.background = this.theme.errorBg;
      closeBtn.style.color = this.theme.error;
    });
    closeBtn.addEventListener("mouseleave", () => {
      closeBtn.style.background = this.theme.shimmer;
      closeBtn.style.color = this.theme.textMuted;
    });
    closeBtn.addEventListener("click", () => this.close());
    header.appendChild(closeBtn);

    return header;
  }

  private createFooter(): HTMLElement {
    const footer = document.createElement("div");
    footer.style.cssText = `
      padding:12px 20px;border-top:1px solid ${this.theme.border};
      display:flex;align-items:center;justify-content:center;gap:6px;
    `;

    const powered = document.createElement("span");
    powered.style.cssText = `font-size:11px;color:${this.theme.textMuted};`;
    powered.textContent = "Powered by ";

    const brand = document.createElement("span");
    brand.style.cssText = `font-size:11px;font-weight:700;color:${this.theme.primary};`;
    brand.textContent = "Adhere";

    footer.appendChild(powered);
    footer.appendChild(brand);
    return footer;
  }

  private createStepTitle(text: string): HTMLElement {
    const el = document.createElement("h3");
    el.style.cssText = `
      color:${this.theme.text};font-size:18px;font-weight:700;
      margin:0;
    `;
    el.textContent = text;
    return el;
  }

  private createOptionCard(
    title: string,
    subtitle: string,
    onClick: () => void
  ): HTMLElement {
    const card = document.createElement("button");
    card.style.cssText = `
      width:100%;padding:16px;border-radius:12px;
      background:${this.theme.cardBg};
      border:2px solid ${this.theme.border};
      cursor:pointer;text-align:left;
      display:flex;align-items:center;justify-content:space-between;
      transition:all 0.2s ease;
    `;
    card.addEventListener("mouseenter", () => {
      card.style.borderColor = this.theme.primary;
      card.style.background = this.theme.shimmer;
      card.style.transform = "translateY(-1px)";
    });
    card.addEventListener("mouseleave", () => {
      card.style.borderColor = this.theme.border;
      card.style.background = this.theme.cardBg;
      card.style.transform = "translateY(0)";
    });
    card.addEventListener("click", onClick);

    const textWrap = document.createElement("div");

    const titleEl = document.createElement("div");
    titleEl.style.cssText = `color:${this.theme.text};font-size:14px;font-weight:600;`;
    titleEl.textContent = title;
    textWrap.appendChild(titleEl);

    if (subtitle) {
      const subEl = document.createElement("div");
      subEl.style.cssText = `color:${this.theme.textMuted};font-size:12px;margin-top:2px;`;
      subEl.textContent = subtitle;
      textWrap.appendChild(subEl);
    }

    const arrow = document.createElement("span");
    arrow.style.cssText = `color:${this.theme.textMuted};font-size:18px;flex-shrink:0;`;
    arrow.textContent = "→";

    card.appendChild(textWrap);
    card.appendChild(arrow);
    return card;
  }

  private createPrimaryButton(text: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.style.cssText = `
      width:100%;padding:14px;border-radius:12px;
      font-size:15px;font-weight:600;
      background:${this.theme.primary};color:#fff;
      border:none;cursor:pointer;
      transition:all 0.2s ease;
      box-shadow:0 2px 8px ${this.theme.primaryGlow};
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.background = this.theme.primaryHover;
      btn.style.transform = "translateY(-1px)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = this.theme.primary;
      btn.style.transform = "translateY(0)";
    });
    return btn;
  }

  private createSecondaryButton(text: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.style.cssText = `
      width:100%;padding:12px;border-radius:12px;
      font-size:14px;font-weight:500;
      background:transparent;color:${this.theme.textSecondary};
      border:none;cursor:pointer;
      transition:all 0.2s ease;
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.color = this.theme.text;
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.color = this.theme.textSecondary;
    });
    return btn;
  }

  private updateProgress(): void {
    const stepIndex = STEP_ORDER.indexOf(this.currentStep);
    const total = STEP_ORDER.length;
    const pct = stepIndex >= 0 ? ((stepIndex + 1) / total) * 100 : 0;

    if (this.progressBar) {
      this.progressBar.style.width = `${pct}%`;
    }
    if (this.stepLabel) {
      if (this.currentStep === "loading") {
        this.stepLabel.textContent = "";
      } else if (this.currentStep === "result") {
        this.stepLabel.textContent = "Complete";
      } else {
        const visibleStep = Math.max(1, stepIndex);
        this.stepLabel.textContent = `Step ${visibleStep} of ${total - 2}`;
      }
    }
  }

  private applyTheme(): void {
    if (this.overlay) {
      this.overlay.style.background = this.theme.overlay;
    }
    if (this.modal) {
      this.modal.style.background = this.theme.bg;
      this.modal.style.boxShadow = this.theme.shadow;
    }
  }

  private injectStyles(): void {
    if (document.getElementById("sc-flow-styles")) return;

    const style = document.createElement("style");
    style.id = "sc-flow-styles";
    style.textContent = `
      @keyframes sc-spin {
        to { transform: rotate(360deg); }
      }
      @keyframes sc-pop {
        0% { transform: scale(0.8); opacity: 0; }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); opacity: 1; }
      }
      #sc-flow-modal * {
        box-sizing: border-box;
      }
      #sc-flow-modal::-webkit-scrollbar {
        width: 4px;
      }
      #sc-flow-content::-webkit-scrollbar {
        width: 4px;
      }
      #sc-flow-content::-webkit-scrollbar-thumb {
        background: rgba(128,128,128,0.3);
        border-radius: 4px;
      }
    `;
    document.head.appendChild(style);
  }
}
