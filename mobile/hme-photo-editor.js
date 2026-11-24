/**
 * HME Industrial Shared Photo Editor — Web Component (<hme-photo-editor>)
 * Complies strictly with PHOTO_EDITOR_STANDARD.md
 * Standardized across FIR, RCA, NCR, Asset Down Notes, and CM Dashboards.
 */

(function () {
  const TEMPLATE = document.createElement('template');
  TEMPLATE.innerHTML = `
    <style>
      :host {
        --bg-main: #181b1f;
        --bg-panel: #21252b;
        --bg-stage: #0f1115;
        --border-color: #333842;
        --text-primary: #e6e8eb;
        --text-muted: #8b929e;
        --signal-amber: #ffa000;
        --signal-amber-hover: #ffb300;
        --signal-amber-subtle: rgba(255, 160, 0, 0.15);
        --accent-blue: #2563eb;
        --danger-red: #ef4444;
        display: block;
        width: 100%;
        height: 100%;
        min-height: 720px;
        background: var(--bg-main);
        color: var(--text-primary);
        font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        box-sizing: border-box;
        overflow: hidden;
        user-select: none;
      }

      * { box-sizing: border-box; }

      .editor-shell {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
      }

      /* TOP BAR */
      .top-bar {
        height: 52px;
        background: var(--bg-panel);
        border-bottom: 1px solid var(--border-color);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        gap: 12px;
        flex-shrink: 0;
      }

      .brand-title {
        font-weight: 600;
        font-size: 15px;
        display: flex;
        align-items: center;
        gap: 8px;
        color: #fff;
      }

      .brand-title .badge {
        font-size: 10px;
        font-family: 'IBM Plex Mono', monospace;
        background: var(--signal-amber);
        color: #000;
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 700;
      }

      .btn-group {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      button.btn {
        background: #2b3038;
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: 6px 12px;
        border-radius: 4px;
        font-family: inherit;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: all 0.15s ease;
        height: 32px;
      }

      button.btn:hover:not(:disabled) {
        background: #363c46;
        border-color: #4f5666;
      }

      button.btn:active:not(:disabled) {
        background: #1f2329;
      }

      button.btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      button.btn.active, button.btn[aria-pressed="true"] {
        background: var(--signal-amber-subtle);
        border-color: var(--signal-amber);
        color: var(--signal-amber);
      }

      button.btn.primary {
        background: var(--signal-amber);
        color: #111;
        font-weight: 600;
        border-color: var(--signal-amber);
      }

      button.btn.primary:hover:not(:disabled) {
        background: var(--signal-amber-hover);
      }

      /* MAIN WORKSPACE */
      .main-body {
        display: flex;
        flex: 1;
        overflow: hidden;
        position: relative;
      }

      /* LEFT TOOLBAR */
      .left-toolbar {
        width: 68px;
        background: var(--bg-panel);
        border-right: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 12px 0;
        gap: 16px;
        overflow-y: auto;
        flex-shrink: 0;
      }

      .tool-group {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        width: 100%;
        padding: 0 8px;
      }

      .group-label {
        font-size: 9px;
        font-weight: 700;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 2px;
      }

      .tool-btn {
        width: 44px;
        height: 40px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 6px;
        color: var(--text-primary);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 14px;
        position: relative;
        transition: all 0.15s ease;
      }

      .tool-btn span.label {
        font-size: 9px;
        margin-top: 2px;
      }

      .tool-btn:hover {
        background: #2c323b;
        color: #fff;
      }

      .tool-btn.active {
        background: var(--signal-amber-subtle);
        border-color: var(--signal-amber);
        color: var(--signal-amber);
      }

      /* CENTER CANVAS STAGE */
      .stage-area {
        flex: 1;
        background: var(--bg-stage);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
      }

      .canvas-viewport {
        position: relative;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        background: #000;
        max-width: 95%;
        max-height: 95%;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      canvas#mainCanvas {
        display: block;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }

      /* OVERLAYS (Crop Box, Magnifier Lens) */
      .crop-box {
        position: absolute;
        border: 2px dashed var(--signal-amber);
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
        pointer-events: none;
      }

      .magnifier-lens {
        position: absolute;
        width: 160px;
        height: 160px;
        border: 2px solid var(--signal-amber);
        border-radius: 50%;
        background-repeat: no-repeat;
        box-shadow: 0 4px 20px rgba(0,0,0,0.8), inset 0 0 10px rgba(0,0,0,0.5);
        pointer-events: all;
        cursor: move;
        overflow: hidden;
        z-index: 10;
        display: none;
      }

      .magnifier-lens.square {
        border-radius: 8px;
      }

      .lens-badge {
        position: absolute;
        bottom: 6px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.75);
        color: var(--signal-amber);
        font-family: 'IBM Plex Mono', monospace;
        font-size: 10px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 3px;
        pointer-events: none;
      }

      /* RIGHT PANEL (CHECK & SUGGEST) */
      .right-panel {
        width: 290px;
        background: var(--bg-panel);
        border-left: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
        padding: 16px;
        gap: 16px;
        overflow-y: auto;
        flex-shrink: 0;
      }

      .panel-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .panel-section-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--text-muted);
        letter-spacing: 0.5px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .select-input, .text-input {
        background: #181b1f;
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: 6px 10px;
        border-radius: 4px;
        font-family: inherit;
        font-size: 12px;
        outline: none;
        width: 100%;
      }

      .select-input:focus, .text-input:focus {
        border-color: var(--signal-amber);
      }

      .suggest-chip {
        background: #2b3038;
        border: 1px solid var(--border-color);
        border-left: 3px solid var(--signal-amber);
        padding: 8px 10px;
        border-radius: 4px;
        font-size: 11px;
        line-height: 1.4;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .suggest-chip b {
        color: var(--signal-amber);
      }

      /* BOTTOM PHOTOS STRIP */
      .bottom-strip {
        height: 124px;
        background: var(--bg-panel);
        border-top: 1px solid var(--border-color);
        display: flex;
        align-items: center;
        padding: 8px 16px;
        gap: 14px;
        overflow-x: auto;
        flex-shrink: 0;
      }

      .pool-header {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        min-width: 110px;
      }

      .pool-counter {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 12px;
        font-weight: 600;
        color: var(--signal-amber);
      }

      .photos-container {
        display: flex;
        align-items: center;
        gap: 10px;
        height: 100%;
      }

      .photo-card {
        height: 96px;
        width: 130px;
        background: #181b1f;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        position: relative;
        cursor: pointer;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        transition: border-color 0.15s ease;
      }

      .photo-card.selected {
        border: 2px solid var(--signal-amber);
      }

      .photo-card.active {
        box-shadow: 0 0 0 2px var(--accent-blue);
      }

      .photo-card img {
        width: 100%;
        height: 64px;
        object-fit: cover;
      }

      .photo-card-info {
        padding: 2px 6px;
        font-size: 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--text-muted);
        background: #181b1f;
      }

      .photo-card-checkbox {
        position: absolute;
        top: 4px;
        left: 4px;
        z-index: 2;
        background: rgba(0,0,0,0.6);
        border-radius: 3px;
        padding: 2px;
      }

      .photo-card-nav {
        position: absolute;
        top: 4px;
        right: 4px;
        display: flex;
        gap: 2px;
        z-index: 2;
      }

      .photo-card-nav button {
        background: rgba(0,0,0,0.7);
        border: none;
        color: #fff;
        width: 18px;
        height: 18px;
        border-radius: 3px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
      }

      .photo-card-nav button:hover {
        background: var(--signal-amber);
        color: #000;
      }

      /* COLLAGE MODAL */
      .modal-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.75);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
      }

      .modal-box {
        background: var(--bg-panel);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 20px;
        width: 440px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.8);
      }

      .modal-title {
        font-size: 16px;
        font-weight: 600;
        color: #fff;
      }

      .hidden { display: none !important; }
    </style>

    <div class="editor-shell">
      <!-- TOP BAR -->
      <div class="top-bar">
        <div class="brand-title">
          <span>HME PHOTO EDITOR</span>
          <span class="badge">STD-2.0</span>
        </div>
        <div class="btn-group">
          <button class="btn" id="btnUndo" title="Undo (Ctrl+Z)" disabled>↶ Undo</button>
          <button class="btn" id="btnRedo" title="Redo (Ctrl+Shift+Z)" disabled>↷ Redo</button>
          <div style="width: 1px; height: 20px; background: var(--border-color); margin: 0 4px;"></div>
          <button class="btn" id="btnCompare">Before / after</button>
          <button class="btn" id="btnCollage">⊞ Collage</button>
          <button class="btn" id="btnKeys">⌨ Keys</button>
          <button class="btn" id="btnReset">Reset</button>
        </div>
        <div class="btn-group">
          <button class="btn" id="btnCancel">Cancel</button>
          <button class="btn primary" id="btnSave">Save as new version</button>
        </div>
      </div>

      <!-- MAIN WORKSPACE -->
      <div class="main-body">
        <!-- LEFT TOOLBAR -->
        <div class="left-toolbar">
          <div class="tool-group">
            <span class="group-label">View</span>
            <button class="tool-btn active" id="toolSelect" title="Select / Move">
              <span>↖</span><span class="label">Move</span>
            </button>
            <button class="tool-btn" id="toolPan" title="Pan (Space drag)">
              <span>✋</span><span class="label">Pan</span>
            </button>
          </div>

          <div class="tool-group">
            <span class="group-label">Frame</span>
            <button class="tool-btn" id="toolCrop" title="Crop Presets">
              <span>✂</span><span class="label">Crop</span>
            </button>
            <button class="tool-btn" id="toolRotL" title="Rotate Left 90°">
              <span>⟲</span><span class="label">Rot L</span>
            </button>
            <button class="tool-btn" id="toolRotR" title="Rotate Right 90°">
              <span>⟳</span><span class="label">Rot R</span>
            </button>
            <button class="tool-btn" id="toolFlipH" title="Flip Horizontal">
              <span>⇄</span><span class="label">Flip H</span>
            </button>
          </div>

          <div class="tool-group">
            <span class="group-label">Mark</span>
            <button class="tool-btn" id="toolCircle" title="Circle defect">
              <span>◯</span><span class="label">Ring</span>
            </button>
            <button class="tool-btn" id="toolBox" title="Rectangle defect">
              <span>□</span><span class="label">Box</span>
            </button>
            <button class="tool-btn" id="toolArrow" title="Arrow indicator">
              <span>↗</span><span class="label">Arrow</span>
            </button>
            <button class="tool-btn" id="toolPen" title="Freehand pen">
              <span>✎</span><span class="label">Pen</span>
            </button>
            <button class="tool-btn" id="toolHighlight" title="Defect highlight">
              <span>░</span><span class="label">HiLite</span>
            </button>
          </div>

          <div class="tool-group">
            <span class="group-label">Label</span>
            <button class="tool-btn" id="toolText" title="Add text label">
              <span>T</span><span class="label">Text</span>
            </button>
            <button class="tool-btn" id="toolCallout" title="Pointer Callout">
              <span>💬</span><span class="label">Callout</span>
            </button>
            <button class="tool-btn" id="toolBadge" title="Number Badge (1,2,3)">
              <span>①</span><span class="label">Badge</span>
            </button>
          </div>

          <div class="tool-group">
            <span class="group-label">Measure</span>
            <button class="tool-btn" id="toolScale" title="Calibrated scale (mm)">
              <span>📏</span><span class="label">Scale</span>
            </button>
            <button class="tool-btn" id="toolAngle" title="Angle measurement">
              <span>∠</span><span class="label">Angle</span>
            </button>
          </div>
        </div>

        <!-- CANVAS STAGE -->
        <div class="stage-area" id="stageArea">
          <div class="canvas-viewport" id="canvasViewport">
            <canvas id="mainCanvas"></canvas>
            <div class="magnifier-lens" id="magnifierLens">
              <div class="lens-badge" id="lensBadge">2.5x</div>
            </div>
          </div>
        </div>

        <!-- RIGHT PANEL (CHECK & SUGGEST) -->
        <div class="right-panel">
          <div class="panel-section">
            <div class="panel-section-title">
              <span>Module / Component</span>
            </div>
            <select class="select-input" id="componentSelect">
              <option value="gear">Gear & Teeth Transmission</option>
              <option value="bearing">Bearing / Race / Roller</option>
              <option value="hydraulics">Hydraulic Cylinder & Seals</option>
              <option value="structure">Frame / Chassis Structure</option>
              <option value="general" selected>General Inspection Preset</option>
            </select>
          </div>

          <div class="panel-section">
            <div class="panel-section-title">
              <span>Check & Suggest</span>
            </div>
            <div id="suggestChipsContainer" style="display: flex; flex-direction: column; gap: 8px;">
              <!-- Dynamic suggestion chips injected here -->
            </div>
          </div>

          <div class="panel-section">
            <div class="panel-section-title">
              <span>Fast Actions</span>
            </div>
            <button class="btn" id="btnFastMagnify">🔍 Toggle Magnifier</button>
            <button class="btn" id="btnSwapCloseUp">📸 Swap Close-Up Photo</button>
            <button class="btn" id="btnAutoFrame">⛶ Auto-Frame Defect</button>
            <button class="btn" id="btnAddDefectCallout">💬 Add Defect Callout</button>
          </div>

          <div class="panel-section">
            <div class="panel-section-title">
              <span>Magnifier Settings</span>
            </div>
            <label style="font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between;">
              <span>Zoom Factor</span>
              <b id="zoomVal" style="color: var(--signal-amber)">2.5x</b>
            </label>
            <input type="range" id="zoomSlider" min="1.5" max="5.0" step="0.5" value="2.5" style="accent-color: var(--signal-amber);">
            <button class="btn" id="btnRevertZoomSource" style="margin-top: 4px;">Revert to Base Crop</button>
          </div>

          <div class="panel-section">
            <div class="panel-section-title">
              <span>Photo Metadata</span>
            </div>
            <label style="font-size: 11px; color: var(--text-muted);">Title</label>
            <input type="text" class="text-input" id="photoTitle" placeholder="e.g. Tooth Spalling #14">
            <label style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Caption</label>
            <input type="text" class="text-input" id="photoCaption" placeholder="Detailed engineering observation">
          </div>
        </div>
      </div>

      <!-- BOTTOM PHOTOS STRIP -->
      <div class="bottom-strip">
        <div class="pool-header">
          <span style="font-weight: 600; font-size: 12px;">PHOTO POOL</span>
          <span class="pool-counter" id="poolCounter">Selected: 0 / 6</span>
          <button class="btn" id="btnAddPhoto" style="height: 24px; padding: 0 8px; font-size: 11px;">+ Upload</button>
          <input type="file" id="fileUploadInput" multiple accept="image/*" class="hidden">
        </div>
        <div class="photos-container" id="photosContainer">
          <!-- Dynamic photo cards injected here -->
        </div>
      </div>
    </div>

    <!-- COLLAGE MODAL -->
    <div class="modal-backdrop hidden" id="collageModal">
      <div class="modal-box">
        <div class="modal-title">Collage Composer</div>
        <div style="font-size: 12px; color: var(--text-muted);">
          Select a multi-photo layout to combine selected evidence into a unified block for reporting.
        </div>
        <select class="select-input" id="collageLayoutSelect">
          <option value="2-up-v">2 Photos Up/Down (Vertical Stack)</option>
          <option value="2-up-h">2 Photos Side-by-Side (Horizontal)</option>
          <option value="inset">Main Photo + Inset Micro-Callout</option>
          <option value="grid-4">2x2 Multi-Photo Symmetrical Grid</option>
        </select>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button class="btn" id="btnCollageCancel">Cancel</button>
          <button class="btn primary" id="btnCollageApply">Generate Collage</button>
        </div>
      </div>
    </div>
  `;

  class HmePhotoEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));

      // State Management
      this.photos = [];
      this.activePhotoIndex = 0;
      this.history = [];
      this.historyStep = -1;
      this.activeTool = 'select';
      this.zoomFactor = 2.5;
      this.magnifierActive = false;
      this.closeUpPhotoUrl = null;
      this.marks = [];
      this.rotation = 0;
      this.flipH = false;
      this.flipV = false;
      this.cropRect = null;
      this.badgeCounter = 1;

      // Suggestion dictionary
      this.suggestions = {
        gear: [
          { title: "Flank Spalling", desc: "Check drive tooth face for progressive pitting or spalling fatigue." },
          { title: "Root Crack", desc: "Inspect root fillet under 3x magnification for tensile cracking." },
          { title: "Scuffing", desc: "Look for adhesive wear from lubrication breakdown along pitch line." }
        ],
        bearing: [
          { title: "Spalling on Race", desc: "Evaluate raceway subsurface fatigue spalling." },
          { title: "Cage Damage", desc: "Verify retainer / cage pockets for fracture or thermal distortion." },
          { title: "Contamination Pits", desc: "Check for debris indentations and lubricant contamination." }
        ],
        hydraulics: [
          { title: "Rod Scoring", desc: "Longitudinal scratch marks across the chromed piston rod surface." },
          { title: "Seal Extrusion", desc: "Thermal degradation or high-pressure bite marks on wiper seal." },
          { title: "Barrel Swelling", desc: "Measure barrel dilation near the end cap with calibrated gauge." }
        ],
        structure: [
          { title: "Weld Toe Crack", desc: "Inspect high-stress gusset welds for heat-affected zone cracking." },
          { title: "Bushing Play", desc: "Measure pin-to-bore tolerance clearance." },
          { title: "Impact Distortion", desc: "Check for permanent plastic deformation on lower flange." }
        ],
        general: [
          { title: "General Inspection", desc: "Standard component review. Verify dimensions and cleanliness." },
          { title: "Fastener Check", desc: "Inspect torque marks and thread engagement." }
        ]
      };
    }

    connectedCallback() {
      this._bindElements();
      this._setupEventListeners();
      this._updateSuggestions();
    }

    _bindElements() {
      const $ = (id) => this.shadowRoot.getElementById(id);
      this.canvas = $('mainCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.photosContainer = $('photosContainer');
      this.poolCounter = $('poolCounter');
      this.fileUploadInput = $('fileUploadInput');
      this.magnifierLens = $('magnifierLens');
      this.lensBadge = $('lensBadge');
      this.zoomSlider = $('zoomSlider');
      this.zoomVal = $('zoomVal');
      this.suggestChipsContainer = $('suggestChipsContainer');
      this.componentSelect = $('componentSelect');
      this.photoTitle = $('photoTitle');
      this.photoCaption = $('photoCaption');
      this.collageModal = $('collageModal');

      // Top bar buttons
      this.btnUndo = $('btnUndo');
      this.btnRedo = $('btnRedo');
      this.btnCompare = $('btnCompare');
      this.btnCollage = $('btnCollage');
      this.btnReset = $('btnReset');
      this.btnCancel = $('btnCancel');
      this.btnSave = $('btnSave');

      // Fast actions
      this.btnFastMagnify = $('btnFastMagnify');
      this.btnSwapCloseUp = $('btnSwapCloseUp');
      this.btnAutoFrame = $('btnAutoFrame');
      this.btnAddDefectCallout = $('btnAddDefectCallout');
      this.btnRevertZoomSource = $('btnRevertZoomSource');
    }

    _setupEventListeners() {
      const $ = (id) => this.shadowRoot.getElementById(id);

      // Top bar events
      this.btnUndo.onclick = () => this.undo();
      this.btnRedo.onclick = () => this.redo();
      this.btnReset.onclick = () => this.reset();
      this.btnCancel.onclick = () => this.dispatchEvent(new CustomEvent('cancel'));
      this.btnSave.onclick = () => this.save();

      // Tool switches
      const tools = ['toolSelect', 'toolPan', 'toolCrop', 'toolCircle', 'toolBox', 'toolArrow', 'toolPen', 'toolHighlight', 'toolText', 'toolCallout', 'toolBadge', 'toolScale', 'toolAngle'];
      tools.forEach(toolId => {
        const el = $(toolId);
        if (el) {
          el.onclick = () => {
            this.shadowRoot.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            el.classList.add('active');
            this.activeTool = toolId.replace('tool', '').toLowerCase();
          };
        }
      });

      // Frame transformations
      $('toolRotL').onclick = () => { this.rotation = (this.rotation - 90) % 360; this.recordState(); this.render(); };
      $('toolRotR').onclick = () => { this.rotation = (this.rotation + 90) % 360; this.recordState(); this.render(); };
      $('toolFlipH').onclick = () => { this.flipH = !this.flipH; this.recordState(); this.render(); };

      // Component context change
      this.componentSelect.onchange = () => this._updateSuggestions();

      // Magnifier slider & controls
      this.zoomSlider.oninput = (e) => {
        this.zoomFactor = parseFloat(e.target.value);
        this.zoomVal.textContent = this.zoomFactor.toFixed(1) + 'x';
        this.lensBadge.textContent = this.zoomFactor.toFixed(1) + 'x';
        this.render();
      };

      this.btnFastMagnify.onclick = () => {
        this.magnifierActive = !this.magnifierActive;
        this.magnifierLens.style.display = this.magnifierActive ? 'block' : 'none';
        this.render();
      };

      this.btnSwapCloseUp.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (re) => {
              this.closeUpPhotoUrl = re.target.result;
              this.magnifierActive = true;
              this.magnifierLens.style.display = 'block';
              this.render();
            };
            reader.readAsDataURL(file);
          }
        };
        input.click();
      };

      this.btnRevertZoomSource.onclick = () => {
        this.closeUpPhotoUrl = null;
        this.render();
      };

      // Auto-Frame & Callout
      this.btnAutoFrame.onclick = () => {
        this.cropRect = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
        this.recordState();
        this.render();
      };

      this.btnAddDefectCallout.onclick = () => {
        this.marks.push({
          type: 'callout',
          x: 200,
          y: 200,
          text: this.photoTitle.value || 'Defect Region',
          color: '#ffa000'
        });
        this.recordState();
        this.render();
      };

      // Multi-Photo Upload
      $('btnAddPhoto').onclick = () => this.fileUploadInput.click();
      this.fileUploadInput.onchange = (e) => {
        const files = Array.from(e.target.files);
        files.forEach(f => {
          const r = new FileReader();
          r.onload = (ev) => {
            this.addPhoto({
              url: ev.target.result,
              title: f.name.replace(/\.[^/.]+$/, ""),
              caption: "",
              selected: this.photos.filter(p => p.selected).length < 6
            });
          };
          r.readAsDataURL(f);
        });
      };

      // Metadata sync
      this.photoTitle.oninput = () => {
        if (this.photos[this.activePhotoIndex]) {
          this.photos[this.activePhotoIndex].title = this.photoTitle.value;
          this._renderPhotoStrip();
        }
      };

      this.photoCaption.oninput = () => {
        if (this.photos[this.activePhotoIndex]) {
          this.photos[this.activePhotoIndex].caption = this.photoCaption.value;
        }
      };

      // Collage Modal
      this.btnCollage.onclick = () => this.collageModal.classList.remove('hidden');
      $('btnCollageCancel').onclick = () => this.collageModal.classList.add('hidden');
      $('btnCollageApply').onclick = () => {
        this._buildCollage($('collageLayoutSelect').value);
        this.collageModal.classList.add('hidden');
      };

      // Interactive Canvas Click / Drag
      let isDrawing = false;
      let startX, startY;

      this.canvas.onmousedown = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        startX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        startY = (e.clientY - rect.top) * (this.canvas.height / rect.height);

        if (this.activeTool === 'circle' || this.activeTool === 'box' || this.activeTool === 'arrow') {
          isDrawing = true;
        } else if (this.activeTool === 'badge') {
          this.marks.push({
            type: 'badge',
            x: startX,
            y: startY,
            num: this.badgeCounter++
          });
          this.recordState();
          this.render();
        }
      };

      this.canvas.onmouseup = (e) => {
        if (!isDrawing) return;
        isDrawing = false;
        const rect = this.canvas.getBoundingClientRect();
        const endX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        const endY = (e.clientY - rect.top) * (this.canvas.height / rect.height);

        if (this.activeTool === 'circle') {
          const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
          this.marks.push({ type: 'circle', cx: startX, cy: startY, r: radius, color: '#ffa000' });
        } else if (this.activeTool === 'box') {
          this.marks.push({ type: 'box', x: Math.min(startX, endX), y: Math.min(startY, endY), w: Math.abs(endX - startX), h: Math.abs(endY - startY), color: '#ffa000' });
        } else if (this.activeTool === 'arrow') {
          this.marks.push({ type: 'arrow', x1: startX, y1: startY, x2: endX, y2: endY, color: '#ffa000' });
        }
        this.recordState();
        this.render();
      };
    }

    _updateSuggestions() {
      const cat = this.componentSelect.value;
      const list = this.suggestions[cat] || this.suggestions.general;
      this.suggestChipsContainer.innerHTML = '';
      list.forEach(s => {
        const div = document.createElement('div');
        div.className = 'suggest-chip';
        div.innerHTML = `<b>${s.title}</b><span>${s.desc}</span>`;
        div.onclick = () => {
          this.photoTitle.value = s.title;
          this.photoCaption.value = s.desc;
          if (this.photos[this.activePhotoIndex]) {
            this.photos[this.activePhotoIndex].title = s.title;
            this.photos[this.activePhotoIndex].caption = s.desc;
            this._renderPhotoStrip();
          }
        };
        this.suggestChipsContainer.appendChild(div);
      });
    }

    addPhoto(photoObj) {
      this.photos.push(photoObj);
      this._renderPhotoStrip();
      if (this.photos.length === 1) {
        this.loadPhoto(0);
      }
    }

    loadPhoto(index) {
      if (!this.photos[index]) return;
      this.activePhotoIndex = index;
      const current = this.photos[index];
      this.photoTitle.value = current.title || '';
      this.photoCaption.value = current.caption || '';
      this.rotation = 0;
      this.flipH = false;
      this.flipV = false;
      this.cropRect = null;
      this.marks = [];
      this.history = [];
      this.historyStep = -1;

      this.activeImage = new Image();
      this.activeImage.onload = () => {
        this.canvas.width = this.activeImage.naturalWidth || 1200;
        this.canvas.height = this.activeImage.naturalHeight || 900;
        this.recordState();
        this.render();
      };
      this.activeImage.src = current.url;
      this._renderPhotoStrip();
    }

    _renderPhotoStrip() {
      this.photosContainer.innerHTML = '';
      const selectedCount = this.photos.filter(p => p.selected).length;
      this.poolCounter.textContent = `Selected: ${selectedCount} / 6`;

      this.photos.forEach((photo, idx) => {
        const card = document.createElement('div');
        card.className = `photo-card ${photo.selected ? 'selected' : ''} ${idx === this.activePhotoIndex ? 'active' : ''}`;

        const img = document.createElement('img');
        img.src = photo.url;

        const info = document.createElement('div');
        info.className = 'photo-card-info';
        info.textContent = photo.title || `Photo ${idx + 1}`;

        const cbWrap = document.createElement('div');
        cbWrap.className = 'photo-card-checkbox';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!photo.selected;
        cb.onclick = (e) => {
          e.stopPropagation();
          photo.selected = cb.checked;
          this._renderPhotoStrip();
        };
        cbWrap.appendChild(cb);

        const navWrap = document.createElement('div');
        navWrap.className = 'photo-card-nav';
        if (idx > 0) {
          const btnL = document.createElement('button');
          btnL.textContent = '◀';
          btnL.onclick = (e) => {
            e.stopPropagation();
            const temp = this.photos[idx - 1];
            this.photos[idx - 1] = this.photos[idx];
            this.photos[idx] = temp;
            if (this.activePhotoIndex === idx) this.activePhotoIndex = idx - 1;
            this._renderPhotoStrip();
          };
          navWrap.appendChild(btnL);
        }
        if (idx < this.photos.length - 1) {
          const btnR = document.createElement('button');
          btnR.textContent = '▶';
          btnR.onclick = (e) => {
            e.stopPropagation();
            const temp = this.photos[idx + 1];
            this.photos[idx + 1] = this.photos[idx];
            this.photos[idx] = temp;
            if (this.activePhotoIndex === idx) this.activePhotoIndex = idx + 1;
            this._renderPhotoStrip();
          };
          navWrap.appendChild(btnR);
        }

        card.appendChild(cbWrap);
        card.appendChild(navWrap);
        card.appendChild(img);
        card.appendChild(info);

        card.onclick = () => this.loadPhoto(idx);
        this.photosContainer.appendChild(card);
      });
    }

    _buildCollage(layout) {
      const selected = this.photos.filter(p => p.selected);
      if (selected.length < 2) {
        alert('Please select at least 2 photos from the bottom strip to generate a collage.');
        return;
      }

      const cW = 1600;
      const cH = 1200;
      this.canvas.width = cW;
      this.canvas.height = cH;

      const img1 = new Image();
      const img2 = new Image();

      img1.onload = () => {
        img2.onload = () => {
          this.ctx.fillStyle = '#111';
          this.ctx.fillRect(0, 0, cW, cH);

          if (layout === '2-up-v') {
            // Stacked vertical
            this.ctx.drawImage(img1, 0, 0, cW, cH / 2 - 4);
            this.ctx.drawImage(img2, 0, cH / 2 + 4, cW, cH / 2 - 4);
          } else if (layout === '2-up-h') {
            // Side by Side
            this.ctx.drawImage(img1, 0, 0, cW / 2 - 4, cH);
            this.ctx.drawImage(img2, cW / 2 + 4, 0, cW / 2 - 4, cH);
          } else if (layout === 'inset') {
            // Main + Inset Callout
            this.ctx.drawImage(img1, 0, 0, cW, cH);
            const inW = 480;
            const inH = 360;
            this.ctx.strokeStyle = '#ffa000';
            this.ctx.lineWidth = 6;
            this.ctx.strokeRect(cW - inW - 20, cH - inH - 20, inW, inH);
            this.ctx.drawImage(img2, cW - inW - 20, cH - inH - 20, inW, inH);
          }

          // Replace active canvas state
          const flatUrl = this.canvas.toDataURL('image/jpeg', 0.95);
          this.addPhoto({
            url: flatUrl,
            title: `Collage (${layout})`,
            caption: 'Composite evidence view',
            selected: true
          });
          this.loadPhoto(this.photos.length - 1);
        };
        img2.src = selected[1].url;
      };
      img1.src = selected[0].url;
    }

    recordState() {
      const state = {
        rotation: this.rotation,
        flipH: this.flipH,
        flipV: this.flipV,
        cropRect: this.cropRect ? { ...this.cropRect } : null,
        marks: JSON.parse(JSON.stringify(this.marks)),
        zoomFactor: this.zoomFactor,
        magnifierActive: this.magnifierActive,
        closeUpPhotoUrl: this.closeUpPhotoUrl
      };
      this.history = this.history.slice(0, this.historyStep + 1);
      this.history.push(state);
      this.historyStep++;
      this._updateHistoryButtons();
    }

    undo() {
      if (this.historyStep > 0) {
        this.historyStep--;
        this._applyState(this.history[this.historyStep]);
      }
    }

    redo() {
      if (this.historyStep < this.history.length - 1) {
        this.historyStep++;
        this._applyState(this.history[this.historyStep]);
      }
    }

    _applyState(state) {
      this.rotation = state.rotation;
      this.flipH = state.flipH;
      this.flipV = state.flipV;
      this.cropRect = state.cropRect;
      this.marks = state.marks;
      this.zoomFactor = state.zoomFactor;
      this.magnifierActive = state.magnifierActive;
      this.closeUpPhotoUrl = state.closeUpPhotoUrl;
      this._updateHistoryButtons();
      this.render();
    }

    _updateHistoryButtons() {
      this.btnUndo.disabled = this.historyStep <= 0;
      this.btnRedo.disabled = this.historyStep >= this.history.length - 1;
    }

    reset() {
      if (confirm('Reset all edits to the original photo?')) {
        this.rotation = 0;
        this.flipH = false;
        this.flipV = false;
        this.cropRect = null;
        this.marks = [];
        this.magnifierActive = false;
        this.closeUpPhotoUrl = null;
        this.recordState();
        this.render();
      }
    }

    render() {
      if (!this.activeImage || !this.activeImage.complete) return;
      const ctx = this.ctx;
      const cW = this.canvas.width;
      const cH = this.canvas.height;

      ctx.clearRect(0, 0, cW, cH);
      ctx.save();

      // Transform pipeline
      ctx.translate(cW / 2, cH / 2);
      ctx.rotate((this.rotation * Math.PI) / 180);
      ctx.scale(this.flipH ? -1 : 1, this.flipV ? -1 : 1);
      ctx.translate(-cW / 2, -cH / 2);

      // Base Image
      if (this.cropRect) {
        const sx = this.cropRect.x * this.activeImage.naturalWidth;
        const sy = this.cropRect.y * this.activeImage.naturalHeight;
        const sw = this.cropRect.w * this.activeImage.naturalWidth;
        const sh = this.cropRect.h * this.activeImage.naturalHeight;
        ctx.drawImage(this.activeImage, sx, sy, sw, sh, 0, 0, cW, cH);
      } else {
        ctx.drawImage(this.activeImage, 0, 0, cW, cH);
      }

      ctx.restore();

      // Render vector marks
      this.marks.forEach(m => {
        ctx.save();
        ctx.strokeStyle = m.color || '#ffa000';
        ctx.lineWidth = 4;
        ctx.fillStyle = m.color || '#ffa000';

        if (m.type === 'circle') {
          ctx.beginPath();
          ctx.arc(m.cx, m.cy, m.r, 0, 2 * Math.PI);
          ctx.stroke();
        } else if (m.type === 'box') {
          ctx.strokeRect(m.x, m.y, m.w, m.h);
        } else if (m.type === 'arrow') {
          this._drawArrow(ctx, m.x1, m.y1, m.x2, m.y2);
        } else if (m.type === 'badge') {
          ctx.beginPath();
          ctx.arc(m.x, m.y, 16, 0, 2 * Math.PI);
          ctx.fill();
          ctx.fillStyle = '#000';
          ctx.font = 'bold 14px "IBM Plex Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(m.num, m.x, m.y);
        } else if (m.type === 'callout') {
          this._drawCallout(ctx, m.x, m.y, m.text);
        }
        ctx.restore();
      });

      // Magnifier overlay rendering onto the flattened buffer
      if (this.magnifierActive) {
        ctx.save();
        const lensRadius = 100;
        const lensX = cW - lensRadius - 40;
        const lensY = lensRadius + 40;

        // Outer lens boundary
        ctx.beginPath();
        ctx.arc(lensX, lensY, lensRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#ffa000';
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.clip();

        if (this.closeUpPhotoUrl) {
          const cImg = new Image();
          cImg.src = this.closeUpPhotoUrl;
          if (cImg.complete) {
            ctx.drawImage(cImg, lensX - lensRadius, lensY - lensRadius, lensRadius * 2, lensRadius * 2);
          }
        } else {
          // Zoomed center section
          const zSize = (lensRadius * 2) / this.zoomFactor;
          ctx.drawImage(this.activeImage, cW / 2 - zSize / 2, cH / 2 - zSize / 2, zSize, zSize, lensX - lensRadius, lensY - lensRadius, lensRadius * 2, lensRadius * 2);
        }

        ctx.restore();

        // Target pointer
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 160, 0, 0.6)';
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(cW / 2, cH / 2);
        ctx.lineTo(lensX, lensY + lensRadius);
        ctx.stroke();
        ctx.restore();
      }
    }

    _drawArrow(ctx, fromx, fromy, tox, toy) {
      const headlen = 16;
      const angle = Math.atan2(toy - fromy, tox - fromx);
      ctx.beginPath();
      ctx.moveTo(fromx, fromy);
      ctx.lineTo(tox, toy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tox, toy);
      ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }

    _drawCallout(ctx, x, y, text) {
      ctx.font = 'bold 13px "IBM Plex Sans", sans-serif';
      const textWidth = ctx.measureText(text).width;
      const padding = 8;
      const boxW = textWidth + padding * 2;
      const boxH = 26;

      ctx.fillStyle = 'rgba(24, 27, 31, 0.9)';
      ctx.strokeStyle = '#ffa000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y - boxH / 2, boxW, boxH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffa000';
      ctx.fillText(text, x + padding, y + 5);
    }

    save() {
      // 1. Render complete flattened high-DPI image
      const flatDataUrl = this.canvas.toDataURL('image/jpeg', 0.95);

      // 2. Build metadata schema (photoDocument:2)
      const current = this.photos[this.activePhotoIndex] || {};
      const metadata = {
        version: 2,
        schema: "photoDocument:2",
        originalUrl: current.url,
        flattenedUrl: flatDataUrl,
        aspectRatio: this.canvas.width / this.canvas.height,
        dimensions: { width: this.canvas.width, height: this.canvas.height },
        transform: {
          rotation: this.rotation,
          flipH: this.flipH,
          flipV: this.flipV,
          crop: this.cropRect
        },
        marks: this.marks,
        magnifier: {
          active: this.magnifierActive,
          zoomFactor: this.zoomFactor,
          hasCloseUpSwap: !!this.closeUpPhotoUrl
        },
        title: this.photoTitle.value,
        caption: this.photoCaption.value,
        selectedForReport: !!current.selected
      };

      // Dispatch event with flattened output + recipe
      this.dispatchEvent(new CustomEvent('save', {
        detail: {
          flattenedBlob: flatDataUrl,
          metadata: metadata,
          allPhotos: this.photos
        }
      }));
    }
  }

  customElements.define('hme-photo-editor', HmePhotoEditor);
})();
