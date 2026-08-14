document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: App Initialized");

    // --- DOM Elements ---
    const directoryUploadInput = document.getElementById('directory-upload');
    const photoUploadInput = document.getElementById('photo-upload');
    const csvUploadInput = document.getElementById('csv-upload');
    const uploadSection = document.getElementById('upload-section');
    const editorSection = document.getElementById('editor-section');
    const previewCanvas = document.getElementById('preview-canvas');
    const exportBtn = document.getElementById('export-btn');
    const downloadCurrentBtn = document.getElementById('download-current-btn');
    const uploadStatus = document.getElementById('upload-status');
    const exportStatus = document.getElementById('export-status');
    const previewCtx = previewCanvas.getContext('2d');

    // Main Customization Controls
    const addTitleToggle = document.getElementById('add-title-toggle');
    const filenameSpacingSelect = document.getElementById('filename-spacing-select');
    const downscaleSpacingSelect = document.getElementById('downscale-spacing-select');
    const titleOptionsWrapper = document.getElementById('title-options-wrapper');
    const titleModeSelect = document.getElementById('title-mode-select');
    const fontSizeSlider = document.getElementById('font-size-slider');
    const fontSizeValueSpan = document.getElementById('font-size-value');
    const textColorPicker = document.getElementById('text-color-picker');
    const autoScaleToggle = document.getElementById('auto-scale-toggle');
    const relativeSizeToggle = document.getElementById('relative-size-toggle');
    const fontSizeUnitSpan = document.getElementById('font-size-unit');
    const headerHeightUnitSpan = document.getElementById('header-height-unit');
    const textOffsetUnitSpan = document.getElementById('text-offset-unit');
    const RELATIVE_SIZE_REFERENCE_WIDTH = 1000;

    // Sequence number controls
    const addNumbersToggle = document.getElementById('add-numbers-toggle');
    const numberOptionsWrapper = document.getElementById('number-options-wrapper');
    const numberCornerSelect = document.getElementById('number-corner-select');
    const numberOffsetSlider = document.getElementById('number-offset-slider');
    const numberOffsetValueSpan = document.getElementById('number-offset-value');
    const numberOffsetUnitSpan = document.getElementById('number-offset-unit');
    const numberSizeSlider = document.getElementById('number-size-slider');
    const numberSizeValueSpan = document.getElementById('number-size-value');
    const numberSizeUnitSpan = document.getElementById('number-size-unit');
    const numberStartInput = document.getElementById('number-start-input');
    const numberColorPicker = document.getElementById('number-color-picker');

    // Padding controls
    const addPaddingToggle = document.getElementById('add-padding-toggle');
    const paddingOptionsWrapper = document.getElementById('padding-options-wrapper');
    const paddingModeSelect = document.getElementById('padding-mode-select');
    const paddingAbsoluteGroup = document.getElementById('padding-absolute-group');
    const paddingRelativeGroup = document.getElementById('padding-relative-group');
    const paddingPxSlider = document.getElementById('padding-px-slider');
    const paddingPxInput = document.getElementById('padding-px-input');
    const paddingPxValue = document.getElementById('padding-px-value');
    const paddingPercentSlider = document.getElementById('padding-percent-slider');
    const paddingPercentInput = document.getElementById('padding-percent-input');
    const paddingPercentValue = document.getElementById('padding-percent-value');
    const paddingColorPicker = document.getElementById('padding-color-picker');
    const paddingAlphaToggle = document.getElementById('padding-alpha-toggle');
    const paddingHint = document.getElementById('padding-hint');
    const paddingFormatWarning = document.getElementById('padding-format-warning');
    const fitAspectToggle = document.getElementById('fit-aspect-toggle');
    const aspectOptionsWrapper = document.getElementById('aspect-options-wrapper');
    const paddingFillWrapper = document.getElementById('padding-fill-wrapper');
    const paddingAspectCustomGroup = document.getElementById('padding-aspect-custom-group');
    const paddingAspectSelect = document.getElementById('padding-aspect-select');
    const paddingAspectWInput = document.getElementById('padding-aspect-w');
    const paddingAspectHInput = document.getElementById('padding-aspect-h');
    const paddingPreviewWrap = document.getElementById('padding-preview-wrap');
    const paddingPreviewCanvas = document.getElementById('padding-preview-canvas');
    const paddingPreviewCaption = document.getElementById('padding-preview-caption');
    const paddingPreviewCounter = document.getElementById('padding-preview-counter');
    const paddingPrevBtn = document.getElementById('padding-prev-btn');
    const paddingNextBtn = document.getElementById('padding-next-btn');
    const paddingPreviewCtx = paddingPreviewCanvas.getContext('2d');
    let paddingPreviewToken = 0;

    const fillAlphaToggle = document.getElementById('fill-alpha-toggle');
    const fillAlphaOptionsWrapper = document.getElementById('fill-alpha-options-wrapper');
    const fillAlphaColorPicker = document.getElementById('fill-alpha-color-picker');
    const fillAlphaPresetBtns = document.querySelectorAll('.fill-alpha-preset-btn');

    const squircleToggle = document.getElementById('squircle-toggle');
    const squircleOptionsWrapper = document.getElementById('squircle-options-wrapper');
    const squircleShapeSelect = document.getElementById('squircle-shape-select');
    const squircleColorPicker = document.getElementById('squircle-color-picker');
    const squircleInnerSlider = document.getElementById('squircle-inner-slider');
    const squircleInnerValue = document.getElementById('squircle-inner-value');
    const squircleOuterSlider = document.getElementById('squircle-outer-slider');
    const squircleOuterValue = document.getElementById('squircle-outer-value');
    const squircleShapePreview = document.getElementById('squircle-shape-preview');
    const squircleShapePreviewCtx = squircleShapePreview.getContext('2d');
    const squirclePresetBtns = document.querySelectorAll('.squircle-preset-btn');
    const SQUIRCLE_SVG_URLS = [
        '/assets/SVGs/Perfect%20SquircleIcons.svg',
        '../../assets/SVGs/Perfect%20SquircleIcons.svg'
    ];
    let squircleSvgText = null;
    const squircleImageCache = new Map();

    // Lightweight Image Editor Controls
    const exposureSlider = document.getElementById('exposure-slider');
    const exposureValue = document.getElementById('exposure-value');
    const brightnessSlider = document.getElementById('brightness-slider');
    const brightnessValue = document.getElementById('brightness-value');
    const contrastSlider = document.getElementById('contrast-slider');
    const contrastValue = document.getElementById('contrast-value');
    const saturationSlider = document.getElementById('saturation-slider');
    const saturationValue = document.getElementById('saturation-value');
    const hueSlider = document.getElementById('hue-slider');
    const hueValue = document.getElementById('hue-value');
    const warmthSlider = document.getElementById('warmth-slider');
    const warmthValue = document.getElementById('warmth-value');
    const grayscaleSlider = document.getElementById('grayscale-slider');
    const grayscaleValue = document.getElementById('grayscale-value');
    const sepiaSlider = document.getElementById('sepia-slider');
    const sepiaValue = document.getElementById('sepia-value');
    const blurSlider = document.getElementById('blur-slider');
    const blurValue = document.getElementById('blur-value');
    const resetAdjustmentsBtn = document.getElementById('reset-adjustments-btn');
    const resetAdjustmentBtns = document.querySelectorAll('.slider-reset-btn');

    // New Main Export Controls (Format, Quality, Prefix/Suffix)
    const exportFormatSelect = document.getElementById('export-format-select');
    const mainQualityWrapper = document.getElementById('main-quality-wrapper');
    const mainQualitySlider = document.getElementById('main-quality-slider');
    const mainQualityValue = document.getElementById('main-quality-value');
    const filenamePrefixInput = document.getElementById('filename-prefix');
    const filenameSuffixInput = document.getElementById('filename-suffix');

    // Naming Mode DOM
    const filenameModeSelect = document.getElementById('filename-mode-select');
    const namingOriginalInputs = document.getElementById('naming-original-inputs');
    const namingSequentialInputs = document.getElementById('naming-sequential-inputs');
    const filenameBaseInput = document.getElementById('filename-base');
    const filenameStartNumInput = document.getElementById('filename-start-num');
    const filenamePaddingInput = document.getElementById('filename-padding');
    const namingExampleText = document.getElementById('naming-example-text');

    // Height/Pos Controls
    const headerHeightSlider = document.getElementById('header-height-slider');
    const headerHeightValueSpan = document.getElementById('header-height-value');
    const bgColorPicker = document.getElementById('bg-color-picker');
    const positionToggle = document.getElementById('position-toggle'); // Bottom toggle
    const textPositionSlider = document.getElementById('text-position-slider'); // Overlay Y
    const textPositionValueSpan = document.getElementById('text-position-value');
    const textOffsetSlider = document.getElementById('text-offset-slider'); // Bleed offset
    const textOffsetValueSpan = document.getElementById('text-offset-value');

    // Groups for visibility toggling
    const headerHeightGroup = document.getElementById('header-height-group');
    const textOffsetGroup = document.getElementById('text-offset-group');
    const textPosGroup = document.getElementById('text-pos-group');
    const bgColorGroup = document.getElementById('bg-color-group');

    // Nav Controls
    const previewControls = document.getElementById('preview-controls');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const titleInput = document.getElementById('title-input');
    const imageCounter = document.getElementById('image-counter');
    const newFolderInput = document.getElementById('new-folder-input');
    const addFolderBtn = document.getElementById('add-folder-btn');
    const folderSelect = document.getElementById('folder-select');

    // Grid DOM
    const openGridModalBtn = document.getElementById('open-grid-modal-btn');
    const gridPopup = document.getElementById('grid-popup');
    const closeGridPopupBtn = gridPopup.querySelector('.popup-close-btn');
    const gridSourceSelect = document.getElementById('grid-source-select');
    const gridColumnsInput = document.getElementById('grid-columns-input');
    const gridAddTitlesToggle = document.getElementById('grid-add-titles-toggle');
    const gridMatchSmallestToggle = document.getElementById('grid-match-smallest-toggle');
    const gridGroupFolderToggle = document.getElementById('grid-group-folder-toggle');
    const gridDrawBordersToggle = document.getElementById('grid-draw-borders-toggle');
    const gridWarningBox = document.getElementById('grid-warning-box');
    const gridDownscaleToggle = document.getElementById('grid-downscale-toggle');
    const gridOutputSize = document.getElementById('grid-output-size');
    const gridOutputMegapixels = document.getElementById('grid-output-megapixels');
    const gridPreviewCanvas = document.getElementById('grid-preview-canvas');
    const gridPreviewCtx = gridPreviewCanvas.getContext('2d');
    const generateGridBtn = document.getElementById('generate-grid-btn');
    const gridStatus = document.getElementById('grid-status');
    const openGridTabBtn = document.getElementById('open-grid-tab-btn');
    const gridProgressContainer = document.getElementById('grid-progress-container');
    const gridProgressBar = document.getElementById('grid-progress-bar');
    const gridProgressText = document.getElementById('grid-progress-text');

    // Grid Visual Controls
    const gridShowPreviewToggle = document.getElementById('grid-show-preview-toggle');
    const gridBorderWidthInput = document.getElementById('grid-border-width-input');
    const gridBorderColorInput = document.getElementById('grid-border-color-input');
    const gridBgColorInput = document.getElementById('grid-bg-color-input');

    // Downscale DOM
    const openDownscaleModalBtn = document.getElementById('open-downscale-modal-btn');
    const downscalePopup = document.getElementById('downscale-popup');
    const closeDownscalePopupBtn = downscalePopup.querySelector('.popup-close-btn');
    const downscaleModeSelect = document.getElementById('downscale-mode-select');
    const downscaleDimensionsControls = document.getElementById('downscale-dimensions-controls');
    const downscaleMpControls = document.getElementById('downscale-mp-controls');
    const downscaleAspectLockToggle = document.getElementById('downscale-aspect-lock-toggle');
    const downscaleWidthInput = document.getElementById('downscale-width-input');
    const downscaleHeightInput = document.getElementById('downscale-height-input');
    const downscaleFitControls = document.getElementById('downscale-fit-controls');
    const downscaleFitSelect = document.getElementById('downscale-fit-select');
    const downscalePadColorWrapper = document.getElementById('downscale-pad-color-wrapper');
    const downscaleMpInput = document.getElementById('downscale-mp-input');
    const downscaleFormatSelect = document.getElementById('downscale-format-select');
    const downscaleQualityWrapper = document.getElementById('downscale-quality-wrapper');
    const downscaleQualitySlider = document.getElementById('downscale-quality-slider');
    const downscaleQualityValue = document.getElementById('downscale-quality-value');
    const downscalePrefixInput = document.getElementById('downscale-prefix');
    const downscaleSuffixInput = document.getElementById('downscale-suffix');
    const downscaleGenerateBtn = document.getElementById('downscale-generate-btn');
    const downscaleStatus = document.getElementById('downscale-status');
    const downscaleErrorMessage = document.getElementById('downscale-error-message');
    const downscaleOriginalResolution = document.getElementById('downscale-original-resolution');
    const downscaleApplyTitlesToggle = document.getElementById('downscale-apply-titles-toggle');

    const downscaleUseSubfoldersToggle = document.getElementById('downscale-use-subfolders-toggle');

    // Upscale DOM
    const openUpscaleModalBtn = document.getElementById('open-upscale-modal-btn');
    const upscalePopup = document.getElementById('upscale-popup');
    const closeUpscalePopupBtn = upscalePopup.querySelector('.popup-close-btn');
    const upscaleModeSelect = document.getElementById('upscale-mode-select');
    const upscaleFactorControls = document.getElementById('upscale-factor-controls');
    const upscaleFactorSelect = document.getElementById('upscale-factor-select');
    const upscaleCustomFactorWrapper = document.getElementById('upscale-custom-factor-wrapper');
    const upscaleCustomFactorInput = document.getElementById('upscale-custom-factor-input');
    const upscaleDimensionsControls = document.getElementById('upscale-dimensions-controls');
    const upscaleMpControls = document.getElementById('upscale-mp-controls');
    const upscaleAspectLockToggle = document.getElementById('upscale-aspect-lock-toggle');
    const upscaleWidthInput = document.getElementById('upscale-width-input');
    const upscaleHeightInput = document.getElementById('upscale-height-input');
    const upscaleMpInput = document.getElementById('upscale-mp-input');
    const upscaleFormatSelect = document.getElementById('upscale-format-select');
    const upscaleQualityWrapper = document.getElementById('upscale-quality-wrapper');
    const upscaleQualitySlider = document.getElementById('upscale-quality-slider');
    const upscaleQualityValue = document.getElementById('upscale-quality-value');
    const upscalePrefixInput = document.getElementById('upscale-prefix');
    const upscaleSuffixInput = document.getElementById('upscale-suffix');
    const upscaleGenerateBtn = document.getElementById('upscale-generate-btn');
    const upscaleCancelBtn = document.getElementById('upscale-cancel-btn');
    const upscaleStatus = document.getElementById('upscale-status');
    const upscaleErrorMessage = document.getElementById('upscale-error-message');
    const upscaleOriginalResolution = document.getElementById('upscale-original-resolution');
    const upscaleOutputPreview = document.getElementById('upscale-output-preview');
    const upscaleWarningBox = document.getElementById('upscale-warning-box');
    const upscaleApplyTitlesToggle = document.getElementById('upscale-apply-titles-toggle');
    const upscaleSpacingSelect = document.getElementById('upscale-spacing-select');
    const upscaleUseSubfoldersToggle = document.getElementById('upscale-use-subfolders-toggle');
    const upscaleProgressContainer = document.getElementById('upscale-progress-container');
    const upscaleBatchBar = document.getElementById('upscale-batch-bar');
    const upscaleBatchPercent = document.getElementById('upscale-batch-percent');
    const upscaleBatchDetail = document.getElementById('upscale-batch-detail');
    const upscaleImageBar = document.getElementById('upscale-image-bar');
    const upscaleImagePercent = document.getElementById('upscale-image-percent');
    const upscaleImageDetail = document.getElementById('upscale-image-detail');
    const upscaleImageLabel = document.getElementById('upscale-image-label');

    let upscaleCancelRequested = false;
    let upscaleRunning = false;

    // Reorder DOM
    const openReorderModalBtn = document.getElementById('open-reorder-modal-btn');
    const reorderPopup = document.getElementById('reorder-popup');
    const closeReorderPopupBtn = reorderPopup.querySelector('.popup-close-btn');
    const reorderList = document.getElementById('reorder-list');
    const saveReorderBtn = document.getElementById('save-reorder-btn');

    // PDF DOM
    const pdfConversionPopup = document.getElementById('pdf-conversion-popup');
    const pdfCountDisplay = document.getElementById('pdf-count-display');
    const startPdfConversionBtn = document.getElementById('start-pdf-conversion-btn');
    const skipPdfBtn = document.getElementById('skip-pdf-btn');
    const pdfProgressContainer = document.getElementById('pdf-progress-container');
    const pdfProgressBar = document.getElementById('pdf-progress-bar');
    const pdfProgressStatus = document.getElementById('pdf-progress-status');
    const pdfProgressPercent = document.getElementById('pdf-progress-percent');

    // Crop DOM
    const openCropModalBtn = document.getElementById('open-crop-modal-btn');
    const cropPopup = document.getElementById('crop-popup');
    const closeCropPopupBtn = cropPopup.querySelector('.popup-close-btn');
    const cropCanvas = document.getElementById('crop-canvas');
    const cropCtx = cropCanvas.getContext('2d');
    const cropProgressText = document.getElementById('crop-progress-text');
    const cropAspectRatioSelect = document.getElementById('crop-aspect-ratio');
    const cropBackBtn = document.getElementById('crop-back-btn');
    const cropUndoBtn = document.getElementById('crop-undo-btn');
    const cropSkipBtn = document.getElementById('crop-skip-btn');
    const cropFinishBtn = document.getElementById('crop-finish-btn');
    const cropInterfaceContainer = document.getElementById('crop-interface-container');

    // Match Overall Colour DOM
    const openColourMatchModalBtn = document.getElementById('open-colour-match-modal-btn');
    const colourMatchPopup = document.getElementById('colour-match-popup');
    const closeColourMatchPopupBtn = colourMatchPopup.querySelector('.popup-close-btn');
    const colourReferenceUpload = document.getElementById('colour-reference-upload');
    const colourTargetUpload = document.getElementById('colour-target-upload');
    const colourReferenceName = document.getElementById('colour-reference-name');
    const colourTargetName = document.getElementById('colour-target-name');
    const colourReferenceCanvas = document.getElementById('colour-reference-canvas');
    const colourTargetCanvas = document.getElementById('colour-target-canvas');
    const colourOutputCanvas = document.getElementById('colour-output-canvas');
    const colourBeforeCanvas = document.getElementById('colour-before-canvas');
    const colourAfterCanvas = document.getElementById('colour-after-canvas');
    const colourAfterLayer = document.getElementById('colour-after-layer');
    const colourComparisonFrame = document.getElementById('colour-comparison-frame');
    const colourComparisonSlider = document.getElementById('colour-comparison-slider');
    const colourComparisonValue = document.getElementById('colour-comparison-value');
    const colourStrengthSlider = document.getElementById('colour-strength-slider');
    const colourStrengthValue = document.getElementById('colour-strength-value');
    const colourBrightnessSlider = document.getElementById('colour-brightness-slider');
    const colourBrightnessValue = document.getElementById('colour-brightness-value');
    const colourContrastSlider = document.getElementById('colour-contrast-slider');
    const colourContrastValue = document.getElementById('colour-contrast-value');
    const colourSaturationSlider = document.getElementById('colour-saturation-slider');
    const colourSaturationValue = document.getElementById('colour-saturation-value');
    const colourTemperatureSlider = document.getElementById('colour-temperature-slider');
    const colourTemperatureValue = document.getElementById('colour-temperature-value');
    const colourTintSlider = document.getElementById('colour-tint-slider');
    const colourTintValue = document.getElementById('colour-tint-value');
    const colourGammaSlider = document.getElementById('colour-gamma-slider');
    const colourGammaValue = document.getElementById('colour-gamma-value');
    const colourMatchResetBtn = document.getElementById('colour-match-reset-btn');
    const colourMatchFormatSelect = document.getElementById('colour-match-format-select');
    const colourMatchDownloadBtn = document.getElementById('colour-match-download-btn');
    const colourMatchSendBtn = document.getElementById('colour-match-send-btn');
    const colourMatchStatus = document.getElementById('colour-match-status');
    const colourMatchProgress = document.getElementById('colour-match-progress');
    const colourMatchProgressStatus = document.getElementById('colour-match-progress-status');
    const colourMatchProgressPercent = document.getElementById('colour-match-progress-percent');
    const colourMatchProgressBar = document.getElementById('colour-match-progress-bar');

    // Save Preview Modal (iOS Safety Net)
    const savePreviewPopup = document.getElementById('save-preview-popup');
    const savePreviewImageContainer = document.getElementById('save-preview-image-container');
    const closeSavePreviewBtn = savePreviewPopup.querySelector('.popup-close-btn');

    const LOADER_HTML = `
<svg class="loader-svg" width="80" height="120" viewBox="0 -30 100 160" xmlns="http://www.w3.org/2000/svg">
  <g>
    <path d="M 50,100 A 50,50 0 0 1 50,0"/>
  </g>
  <g>
    <path d="M 50,75 A 50,50 0 0 0 50,-25"/>
  </g>
</svg>`;

    // --- State ---
    let imageFiles = [];
    let originalImageFiles = []; // [NEW] Keep originals for re-cropping
    let pdfFiles = []; // [NEW] Store PDFs temporarily
    let imageTitles = [];

    let imageFolders = [];
    let availableFolders = ["(Root)"];
    let currentIndex = 0;
    const MEGAPixel_limit = 24 * 1000 * 1000;

    // Crop State
    let isCropMode = false;
    let cropIndex = 0;
    let isDraggingCrop = false;
    let cropStart = { x: 0, y: 0 };
    let cropEnd = { x: 0, y: 0 };
    let activeCropImage = null; // HTMLImageElement
    let cropDisplayScale = 1; // Scale factor from actual pixels to canvas pixels
    let cropOffset = { x: 0, y: 0 }; // Offset of image on canvas if centered
    let cropAppliedOnLast = false;

    let colourReferenceImage = null;
    let colourTargetImage = null;
    let colourReferenceFile = null;
    let colourTargetFile = null;
    let colourMatchPreviewTimer = null;
    let colourMatchRunToken = 0;
    let colourTransferStats = null;

    // --- Event Listeners ---
    directoryUploadInput.addEventListener('change', handleDirectoryUpload);
    photoUploadInput.addEventListener('change', handleDirectoryUpload);
    csvUploadInput.addEventListener('change', handleCSVUpload);
    exportBtn.addEventListener('click', handleExport);
    downloadCurrentBtn.addEventListener('click', handleDownloadCurrentImage);

    // PDF Listeners
    startPdfConversionBtn.addEventListener('click', handlePdfConversion);
    skipPdfBtn.addEventListener('click', () => {
        pdfConversionPopup.classList.add('hidden');
        if (imageFiles.length > 0) {
            setupEditor();
        } else {
            showStatus(uploadStatus, 'No images to edit. Please upload images or convert PDFs.', true);
        }
    });

    // Main Control Listeners
    const allControls = [
        titleModeSelect, fontSizeSlider, headerHeightSlider, textColorPicker,
        bgColorPicker, positionToggle, addTitleToggle, filenameSpacingSelect,
        textPositionSlider, textOffsetSlider, autoScaleToggle, relativeSizeToggle,
        addNumbersToggle, numberCornerSelect, numberOffsetSlider, numberSizeSlider,
        numberStartInput, numberColorPicker,
        addPaddingToggle, paddingModeSelect, paddingPxSlider, paddingPxInput,
        paddingPercentSlider, paddingPercentInput, paddingColorPicker, paddingAlphaToggle,
        fitAspectToggle, paddingAspectSelect, paddingAspectWInput, paddingAspectHInput,
        fillAlphaToggle, fillAlphaColorPicker,
        squircleToggle, squircleShapeSelect, squircleColorPicker, squircleInnerSlider, squircleOuterSlider,
        exposureSlider, brightnessSlider, contrastSlider, saturationSlider,
        hueSlider, warmthSlider, grayscaleSlider, sepiaSlider, blurSlider
    ];
    allControls.forEach(el => el.addEventListener('input', handleControlsChange));
    resetAdjustmentsBtn.addEventListener('click', resetImageAdjustments);
    resetAdjustmentBtns.forEach(btn => btn.addEventListener('click', resetSingleImageAdjustment));
    fillAlphaPresetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            fillAlphaToggle.checked = true;
            fillAlphaColorPicker.value = btn.dataset.alphaBg;
            handleControlsChange();
        });
    });
    squirclePresetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            squircleToggle.checked = true;
            squircleColorPicker.value = btn.dataset.squircleColor;
            handleControlsChange();
        });
    });

    // New Format Listeners
    exportFormatSelect.addEventListener('change', () => {
        const format = exportFormatSelect.value;
        const hideQuality = format === 'image/png' || format === 'original' || format === 'image/svg+xml';
        mainQualityWrapper.classList.toggle('hidden', hideQuality);
        updateNamingUI();
        updatePaddingControlState();
        if (addPaddingToggle.checked || fitAspectToggle.checked || fillAlphaToggle.checked || squircleToggle.checked) renderPreview();
    });
    mainQualitySlider.addEventListener('input', () => {
        mainQualityValue.textContent = mainQualitySlider.value;
    });

    // Naming Mode Listeners
    filenameModeSelect.addEventListener('change', updateNamingUI);
    [filenamePrefixInput, filenameSuffixInput, filenameBaseInput, filenameStartNumInput, filenamePaddingInput, filenameSpacingSelect].forEach(el => {
        el.addEventListener('input', updateNamingUI);
    });

    // Navigation
    prevBtn.addEventListener('click', navigatePrev);
    nextBtn.addEventListener('click', navigateNext);
    paddingPrevBtn.addEventListener('click', navigatePrev);
    paddingNextBtn.addEventListener('click', navigateNext);
    titleInput.addEventListener('input', handleTitleChange);
    document.addEventListener('keydown', handleKeyPress);

    // Folders
    addFolderBtn.addEventListener('click', handleAddFolder);
    folderSelect.addEventListener('change', handleFolderAssignment);

    // Grid Listeners
    openGridModalBtn.addEventListener('click', openGridModal);
    closeGridPopupBtn.addEventListener('click', closeGridModal);
    gridPopup.addEventListener('click', (e) => { if (e.target === gridPopup) closeGridModal(); });
    gridSourceSelect.addEventListener('change', updateGridPreview);
    gridColumnsInput.addEventListener('input', updateGridPreview);
    gridAddTitlesToggle.addEventListener('change', updateGridPreview);
    gridMatchSmallestToggle.addEventListener('change', updateGridPreview);
    gridGroupFolderToggle.addEventListener('change', updateGridPreview);
    gridDrawBordersToggle.addEventListener('change', updateGridPreview);

    // Grid Visual Listeners
    gridShowPreviewToggle.addEventListener('change', updateGridPreview);
    gridBorderWidthInput.addEventListener('input', updateGridPreview);
    gridBorderColorInput.addEventListener('input', updateGridPreview);
    gridBgColorInput.addEventListener('input', updateGridPreview);
    generateGridBtn.addEventListener('click', handleGenerateGrid);
    openGridTabBtn.addEventListener('click', handleOpenGridInTab);

    // Downscale Listeners
    openDownscaleModalBtn.addEventListener('click', openDownscaleModal);
    closeDownscalePopupBtn.addEventListener('click', closeDownscaleModal);
    downscalePopup.addEventListener('click', (e) => { if (e.target === downscalePopup) closeDownscaleModal(); });
    downscaleModeSelect.addEventListener('input', updateDownscaleUI);
    downscaleAspectLockToggle.addEventListener('input', handleAspectRatioInputChange);
    downscaleWidthInput.addEventListener('input', () => handleAspectRatioInputChange('width'));
    downscaleHeightInput.addEventListener('input', () => handleAspectRatioInputChange('height'));
    downscaleFitSelect.addEventListener('input', updateDownscaleUI);
    downscaleFormatSelect.addEventListener('input', updateDownscaleUI);
    downscaleQualitySlider.addEventListener('input', () => {
        downscaleQualityValue.textContent = downscaleQualitySlider.value;
    });
    downscaleGenerateBtn.addEventListener('click', handleDownscaleGeneration);

    // Upscale Listeners
    openUpscaleModalBtn.addEventListener('click', openUpscaleModal);
    closeUpscalePopupBtn.addEventListener('click', closeUpscaleModal);
    upscalePopup.addEventListener('click', (e) => { if (e.target === upscalePopup && !upscaleRunning) closeUpscaleModal(); });
    upscaleModeSelect.addEventListener('input', () => { updateUpscaleUI(); refreshUpscalePreview(); });
    upscaleFactorSelect.addEventListener('input', () => { updateUpscaleUI(); refreshUpscalePreview(); });
    upscaleCustomFactorInput.addEventListener('input', refreshUpscalePreview);
    upscaleAspectLockToggle.addEventListener('input', () => handleUpscaleAspectInputChange());
    upscaleWidthInput.addEventListener('input', () => { handleUpscaleAspectInputChange('width'); refreshUpscalePreview(); });
    upscaleHeightInput.addEventListener('input', () => { handleUpscaleAspectInputChange('height'); refreshUpscalePreview(); });
    upscaleMpInput.addEventListener('input', refreshUpscalePreview);
    upscaleFormatSelect.addEventListener('input', updateUpscaleUI);
    upscaleQualitySlider.addEventListener('input', () => {
        upscaleQualityValue.textContent = upscaleQualitySlider.value;
    });
    upscaleGenerateBtn.addEventListener('click', handleUpscaleGeneration);
    upscaleCancelBtn.addEventListener('click', () => {
        if (upscaleRunning) {
            upscaleCancelRequested = true;
            upscaleCancelBtn.disabled = true;
            upscaleCancelBtn.textContent = 'Cancelling…';
            showStatus(upscaleStatus, 'Cancel requested — finishing current image…', false);
        }
    });

    // Reorder Listeners
    openReorderModalBtn.addEventListener('click', openReorderModal);
    closeReorderPopupBtn.addEventListener('click', closeReorderModal);
    reorderPopup.addEventListener('click', (e) => { if (e.target === reorderPopup) closeReorderModal(); });
    saveReorderBtn.addEventListener('click', saveReorder);

    // Crop Listeners
    openCropModalBtn.addEventListener('click', openCropModal);
    closeCropPopupBtn.addEventListener('click', closeCropModal);
    cropPopup.addEventListener('click', (e) => { if (e.target === cropPopup) closeCropModal(); });
    cropBackBtn.addEventListener('click', navigateCropPrev);
    cropUndoBtn.addEventListener('click', undoCropOnCurrent);
    cropSkipBtn.addEventListener('click', navigateCropNext);
    cropFinishBtn.addEventListener('click', handleCropFinish);

    // Match Overall Colour Listeners
    openColourMatchModalBtn.addEventListener('click', openColourMatchModal);
    closeColourMatchPopupBtn.addEventListener('click', closeColourMatchModal);
    colourMatchPopup.addEventListener('click', (e) => { if (e.target === colourMatchPopup) closeColourMatchModal(); });
    colourReferenceUpload.addEventListener('change', handleColourReferenceUpload);
    colourTargetUpload.addEventListener('change', handleColourTargetUpload);
    colourComparisonSlider.addEventListener('input', updateColourComparisonSlider);
    colourComparisonFrame.addEventListener('mousemove', handleColourComparisonHover);
    colourComparisonFrame.addEventListener('touchmove', handleColourComparisonTouch, { passive: false });
    [
        colourStrengthSlider, colourBrightnessSlider, colourContrastSlider,
        colourSaturationSlider, colourTemperatureSlider, colourTintSlider,
        colourGammaSlider
    ].forEach(slider => slider.addEventListener('input', () => {
        updateColourMatchLabels();
        scheduleColourMatchPreview();
    }));
    colourMatchResetBtn.addEventListener('click', resetColourMatchControls);
    colourMatchDownloadBtn.addEventListener('click', handleColourMatchDownload);
    colourMatchSendBtn.addEventListener('click', handleColourMatchSendToManager);

    // Save Preview Listeners
    closeSavePreviewBtn.addEventListener('click', () => savePreviewPopup.classList.add('hidden'));
    savePreviewPopup.addEventListener('click', (e) => { if (e.target === savePreviewPopup) savePreviewPopup.classList.add('hidden'); });

    cropCanvas.addEventListener('mousedown', handleCropMouseDown);
    window.addEventListener('mousemove', handleCropMouseMove);
    window.addEventListener('mouseup', handleCropMouseUp);
    window.addEventListener('resize', syncColourComparisonCanvasSize);

    // Touch support for crop
    cropCanvas.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        cropCanvas.dispatchEvent(mouseEvent);
        e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (!isDraggingCrop) return;
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        window.dispatchEvent(mouseEvent);
        e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
        if (!isDraggingCrop) return;
        const mouseEvent = new MouseEvent('mouseup', {});
        window.dispatchEvent(mouseEvent);
    });

    updateNamingUI();
    updateAdjustmentLabels();
    updateColourMatchLabels();
    updateColourComparisonSlider();
    updatePaddingControlState();
    updateSquircleControlState();


    // --- Functions ---

    function handleDirectoryUpload(e) {
        const files = Array.from(e.target.files);
        console.log(`DEBUG: Upload started. Found ${files.length} files.`);

        imageFiles = []; imageTitles = []; imageFolders = []; pdfFiles = [];
        availableFolders = ["(Root)"]; currentIndex = 0;

        const imageRegex = /\.(jpe?g|png|gif|webp|bmp|svg|avif)$/i;
        const pdfRegex = /\.pdf$/i;

        // Separate Images/SVGs and PDFs (extension check covers empty/odd MIME types like text/xml for SVG)
        imageFiles = files.filter(file => file.type.startsWith('image/') || imageRegex.test(file.name));
        sortImageFiles(imageFiles);
        originalImageFiles = [...imageFiles]; // Store originals
        pdfFiles = files.filter(file => file.type === 'application/pdf' || pdfRegex.test(file.name));

        console.log(`DEBUG: Found ${imageFiles.length} images/SVGs and ${pdfFiles.length} PDFs.`);

        // 1. If we have PDFs, interrupt flow
        if (pdfFiles.length > 0) {
            pdfCountDisplay.textContent = pdfFiles.length;
            pdfConversionPopup.classList.remove('hidden');
            // If we also have images, we can prep them in background, but don't show editor yet
            if (imageFiles.length > 0) {
                prepImages(false); // Prep but don't show
            }
            return;
        }

        // 2. If only images / SVGs
        if (imageFiles.length > 0) {
            prepImages(true);
        } else {
            showStatus(uploadStatus, 'No valid image, SVG, or PDF files found.', true);
        }
    }

    function isSvgFile(file) {
        if (!file) return false;
        return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || '');
    }

    function getOriginalExtension(file) {
        if (!file || !file.name) return '';
        const idx = file.name.lastIndexOf('.');
        return idx >= 0 ? file.name.slice(idx) : '';
    }

    function isPassthroughExportFormat(format) {
        return format === 'original' || format === 'image/svg+xml';
    }

    /** Ensure SVGs without width/height still draw on canvas (use viewBox). */
    async function prepareFileForCanvas(file) {
        if (!isSvgFile(file)) return file;

        try {
            const text = await file.text();
            const rootMatch = text.match(/<svg\b[^>]*>/i);
            if (!rootMatch) return file;

            const rootTag = rootMatch[0];
            const hasWidth = /\swidth\s*=/i.test(rootTag);
            const hasHeight = /\sheight\s*=/i.test(rootTag);
            if (hasWidth && hasHeight) {
                return file.type === 'image/svg+xml'
                    ? file
                    : new File([text], file.name, { type: 'image/svg+xml' });
            }

            let width = 512;
            let height = 512;
            const viewBoxMatch = rootTag.match(/viewBox\s*=\s*["']?\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/i);
            if (viewBoxMatch) {
                width = Math.max(1, Math.abs(parseFloat(viewBoxMatch[3])) || 512);
                height = Math.max(1, Math.abs(parseFloat(viewBoxMatch[4])) || 512);
            }

            let patchedRoot = rootTag;
            if (!hasWidth) patchedRoot = patchedRoot.replace(/<svg\b/i, `<svg width="${width}"`);
            if (!/\sheight\s*=/i.test(patchedRoot)) {
                patchedRoot = patchedRoot.replace(/<svg\b/i, `<svg height="${height}"`);
            }

            const patched = text.replace(rootTag, patchedRoot);
            return new File([patched], file.name, { type: 'image/svg+xml' });
        } catch (err) {
            console.warn('SVG prepare failed, using original file:', err);
            return file;
        }
    }

    function getUploadSortPath(file) {
        return (file.webkitRelativePath || file.name || '').toLowerCase();
    }

    function getUploadFolderPath(file) {
        const relative = (file && file.webkitRelativePath) || '';
        if (!relative) return '(Root)';
        const parts = relative.split(/[/\\]/).filter((part) => part && part !== '.' && part !== '..');
        if (parts.length <= 2) return '(Root)';
        const subfolder = parts.slice(1, -1).join('/');
        return subfolder || '(Root)';
    }

    function sortImageFiles(files) {
        files.sort((a, b) => getUploadSortPath(a).localeCompare(getUploadSortPath(b), undefined, {
            numeric: true,
            sensitivity: 'base'
        }));
    }

    function sortFolderList(folders) {
        const rest = folders
            .filter((folder) => folder !== '(Root)')
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        return ['(Root)', ...rest];
    }

    function addFolderToAvailable(folderName) {
        if (folderName && !availableFolders.includes(folderName)) {
            availableFolders.push(folderName);
        }
    }

    function prepImages(showEditor = true) {
        sortImageFiles(imageFiles);
        imageFiles.forEach(file => {
            imageTitles.push(formatTitle(file.name));
            const folder = getUploadFolderPath(file);
            imageFolders.push(folder);
            addFolderToAvailable(folder);
        });
        availableFolders = sortFolderList(availableFolders);

        if (showEditor) setupEditor();
    }

    function setupEditor() {
        const svgCount = imageFiles.filter(isSvgFile).length;
        const folderCount = new Set(imageFolders.filter((folder) => folder !== '(Root)')).size;
        const folderNote = folderCount
            ? ` in ${folderCount} subfolder${folderCount === 1 ? '' : 's'}`
            : '';
        const label = svgCount === imageFiles.length
            ? `Loaded ${imageFiles.length} SVG${imageFiles.length === 1 ? '' : 's'}${folderNote}. Format set to Original (Rename Only) — export to ZIP with new names.`
            : `Loaded ${imageFiles.length} file${imageFiles.length === 1 ? '' : 's'}${svgCount ? ` (${svgCount} SVG)` : ''}${folderNote}. You can now Upload a CSV or scroll down to customize.`;
        showStatus(uploadStatus, label, false);
        editorSection.classList.remove('hidden');
        previewControls.classList.remove('hidden');
        updateFolderDropdown();
        handleControlsChange();
        updateUIForCurrentIndex();

        // SVG-only batches: default to rename-only so vectors stay vectors
        if (svgCount === imageFiles.length && imageFiles.length > 0) {
            exportFormatSelect.value = 'original';
            addTitleToggle.checked = false;
            updateTitleControlState();
            mainQualityWrapper.classList.add('hidden');
            updateNamingUI();
            handleControlsChange();
        }
    }

    async function handlePdfConversion() {
        if (typeof pdfjsLib === 'undefined') {
            alert("PDF.js library not loaded. Please check your internet connection.");
            return;
        }

        startPdfConversionBtn.disabled = true;
        skipPdfBtn.classList.add('hidden');
        pdfProgressContainer.classList.remove('hidden');
        showStatus(pdfProgressStatus, "Preparing conversion...", false, true);

        let totalPagesConverted = 0;

        try {
            for (let i = 0; i < pdfFiles.length; i++) {
                const file = pdfFiles[i];
                const arrayBuffer = await file.arrayBuffer();

                // Load PDF
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                console.log(`Processing PDF: ${file.name} with ${pdf.numPages} pages.`);

                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    // Status
                    const percent = Math.round(((i) / pdfFiles.length) * 100); // Rough file progress
                    pdfProgressStatus.textContent = `${file.name} (Page ${pageNum}/${pdf.numPages})`;
                    pdfProgressBar.style.width = `${percent}%`;
                    pdfProgressPercent.textContent = `${percent}%`;

                    const page = await pdf.getPage(pageNum);
                    const viewport = page.getViewport({ scale: 2.0 }); // High quality render

                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport: viewport }).promise;

                    // Convert to Blob/File
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    const pageName = `${file.name.replace('.pdf', '')}_page_${pageNum}.png`;
                    const imageFile = new File([blob], pageName, { type: 'image/png' });

                    // Add to main arrays
                    imageFiles.push(imageFile);
                    originalImageFiles.push(imageFile);
                    imageTitles.push(formatTitle(pageName));
                    const folder = getUploadFolderPath(file);
                    imageFolders.push(folder);
                    addFolderToAvailable(folder);

                    totalPagesConverted++;
                }
            }

            // Done
            pdfProgressBar.style.width = '100%';
            pdfProgressPercent.textContent = '100%';
            pdfProgressStatus.textContent = "Conversion Complete!";
            showStatus(pdfProgressStatus, "Conversion Complete!", false, false);

            setTimeout(() => {
                pdfConversionPopup.classList.add('hidden');
                availableFolders = sortFolderList(availableFolders);
                setupEditor(); // Now load the editor with everything
            }, 800);

        } catch (error) {
            console.error("PDF Conversion Error:", error);
            alert(`Error converting PDF: ${error.message}`);
            startPdfConversionBtn.disabled = false;
            skipPdfBtn.classList.remove('hidden');
        }
    }

    // --- CSV PARSING LOGIC ---
    function handleCSVUpload(e) {
        if (imageFiles.length === 0) {
            showStatus(uploadStatus, "Please upload images first.", true);
            e.target.value = '';
            return;
        }

        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (event) {
            const text = event.target.result;
            processCSV(text);
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    function processCSV(csvText) {
        const lines = csvText.split(/\r\n|\n/);
        let matchCount = 0;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const cols = line.split(',');
            if (cols.length < 3) continue;

            const itemName = cols[1].trim();
            const category = cols[2].trim();

            if (itemName && category) {
                const index = imageTitles.findIndex(t => t.toLowerCase() === itemName.toLowerCase());

                if (index !== -1) {
                    imageFolders[index] = category;
                    if (!availableFolders.includes(category)) {
                        availableFolders.push(category);
                    }
                    matchCount++;
                }
            }
        }

        updateFolderDropdown();
        updateUIForCurrentIndex();
        showStatus(uploadStatus, `CSV Map Applied! Matched ${matchCount} images to categories.`, false);
    }

    function handleControlsChange(e) {
        fontSizeValueSpan.textContent = fontSizeSlider.value;
        headerHeightValueSpan.textContent = headerHeightSlider.value;
        textPositionValueSpan.textContent = textPositionSlider.value;
        textOffsetValueSpan.textContent = textOffsetSlider.value;
        numberOffsetValueSpan.textContent = numberOffsetSlider.value;
        numberSizeValueSpan.textContent = numberSizeSlider.value;
        updateSizeUnitLabels();
        updateAdjustmentLabels();

        updateControlVisibility();
        updateTitleControlState();
        updateNumberControlState();
        syncPaddingAmountInputs(e?.target);
        updatePaddingControlState();
        updateSquircleControlState();
        renderPreview();
    }

    function updateSizeUnitLabels() {
        const unit = relativeSizeToggle.checked ? ' rel' : 'px';
        fontSizeUnitSpan.textContent = unit;
        headerHeightUnitSpan.textContent = unit;
        textOffsetUnitSpan.textContent = unit;
        numberOffsetUnitSpan.textContent = unit;
        numberSizeUnitSpan.textContent = unit;
    }

    function updateControlVisibility() {
        const mode = titleModeSelect.value;
        headerHeightGroup.classList.toggle('hidden', mode === 'overlay');
        bgColorGroup.classList.toggle('hidden', mode === 'overlay');
        textPosGroup.classList.toggle('hidden', mode !== 'overlay');
        textOffsetGroup.classList.toggle('hidden', mode !== 'bleed');
    }

    function handleTitleChange() {
        if (imageFiles.length > 0) {
            imageTitles[currentIndex] = titleInput.value;
            renderPreview();
        }
    }

    function updateTitleControlState() {
        titleOptionsWrapper.classList.toggle('disabled', !addTitleToggle.checked);
    }

    function updateNumberControlState() {
        numberOptionsWrapper.classList.toggle('disabled', !addNumbersToggle.checked);
    }

    function formatSupportsAlpha(format) {
        return format === 'image/png' || format === 'image/webp' || format === 'image/avif';
    }

    function syncPaddingAmountInputs(source) {
        if (source === paddingPxSlider) paddingPxInput.value = paddingPxSlider.value;
        else if (source === paddingPxInput) paddingPxSlider.value = Math.min(Number(paddingPxSlider.max), Math.max(0, Number(paddingPxInput.value) || 0));
        else if (source === paddingPercentSlider) paddingPercentInput.value = paddingPercentSlider.value;
        else if (source === paddingPercentInput) paddingPercentSlider.value = Math.min(Number(paddingPercentSlider.max), Math.max(0, Number(paddingPercentInput.value) || 0));

        paddingPxValue.textContent = paddingPxInput.value;
        paddingPercentValue.textContent = paddingPercentInput.value;
    }

    function usesCanvasExpansion(options = getTitleOptionsFromUI()) {
        return !!(options.addPadding || options.fitAspect || options.addSquircle);
    }

    function usesTransparentPadding(options = getTitleOptionsFromUI()) {
        return !!(usesCanvasExpansion(options) && !options.paddingFlatten && (options.paddingAlpha || options.addSquircle));
    }

    function fillExpandedCanvas(ctx, options, layout) {
        const {
            canvasW,
            canvasH,
            boxX,
            boxY,
            boxW,
            boxH,
            contentTop = 0,
            contentBottom = canvasH
        } = layout;

        if (options.paddingFlatten) {
            ctx.fillStyle = options.paddingColor || '#FFFFFF';
            ctx.fillRect(0, contentTop, canvasW, Math.max(0, contentBottom - contentTop));
            return;
        }

        const fillAroundBadge = !options.paddingAlpha && (options.addPadding || options.fitAspect);
        if (!fillAroundBadge) return;

        ctx.fillStyle = options.paddingColor || '#FFFFFF';
        if (boxY > contentTop) ctx.fillRect(0, contentTop, canvasW, boxY - contentTop);
        const belowY = boxY + boxH;
        if (belowY < contentBottom) ctx.fillRect(0, belowY, canvasW, contentBottom - belowY);
        if (boxX > 0) ctx.fillRect(0, boxY, boxX, boxH);
        const rightX = boxX + boxW;
        if (rightX < canvasW) ctx.fillRect(rightX, boxY, canvasW - rightX, boxH);
    }

    function updatePaddingControlState() {
        const paddingOn = addPaddingToggle.checked;
        const aspectOn = fitAspectToggle.checked;
        const squircleOn = squircleToggle.checked;
        const canvasOn = paddingOn || aspectOn || squircleOn;

        paddingOptionsWrapper.classList.toggle('disabled', !paddingOn);
        aspectOptionsWrapper.classList.toggle('disabled', !aspectOn);
        paddingFillWrapper.classList.toggle('disabled', !canvasOn);
        fillAlphaOptionsWrapper.classList.toggle('disabled', !fillAlphaToggle.checked);

        const mode = paddingModeSelect.value;
        paddingAbsoluteGroup.classList.toggle('hidden', mode !== 'absolute');
        paddingRelativeGroup.classList.toggle('hidden', mode !== 'relative');
        paddingAspectCustomGroup.classList.toggle('hidden', paddingAspectSelect.value !== 'custom');

        const flattenAlpha = !formatSupportsAlpha(exportFormatSelect.value) && (
            (canvasOn && paddingAlphaToggle.checked) || squircleOn
        );
        paddingFormatWarning.classList.toggle('hidden', !flattenAlpha);

        const showCheckerboard = formatSupportsAlpha(exportFormatSelect.value) && (
            squircleOn || (canvasOn && paddingAlphaToggle.checked)
        );
        previewCanvas.classList.toggle('alpha-preview', showCheckerboard);
        paddingPreviewCanvas.classList.toggle('alpha-preview', showCheckerboard);

        paddingPxValue.textContent = paddingPxInput.value;
        paddingPercentValue.textContent = paddingPercentInput.value;

        paddingPreviewWrap.classList.toggle('hidden', !canvasOn);

        if (imageFiles.length === 0) {
            if (canvasOn) {
                if (squircleOn) {
                    paddingHint.textContent = 'Squircle is applied first (image padding inside the shape, squircle padding outside). Aspect ratio and extra padding then wrap the badge.';
                } else if (aspectOn && paddingOn) {
                    paddingHint.textContent = 'Aspect ratio is applied first, then padding is added around that result. Both use the pad colour.';
                } else if (aspectOn) {
                    paddingHint.textContent = 'Aspect Ratio: every image is padded to the same target ratio without cropping. Portrait can become square, 16:9, and so on.';
                } else if (mode === 'relative') {
                    paddingHint.textContent = 'Relative: each image gets padding as a % of its own width (left/right) and height (top/bottom).';
                } else {
                    paddingHint.textContent = 'Absolute: the same pixel amount is added on every side of every image.';
                }
            }
            renderPaddingPreview();
        }
    }

    function getTargetAspectRatio(options) {
        if (options.paddingAspect === 'custom') {
            const w = Math.max(1, Number(options.paddingAspectW) || 1);
            const h = Math.max(1, Number(options.paddingAspectH) || 1);
            return w / h;
        }
        const parts = String(options.paddingAspect || '').split(':');
        const w = Number(parts[0]);
        const h = Number(parts[1]);
        if (!w || !h) return null;
        return w / h;
    }

    function describeAspect(width, height) {
        if (!width || !height) return '—';
        const ratio = width / height;
        const presets = {
            '1:1': 1,
            '4:5': 4 / 5,
            '5:4': 5 / 4,
            '3:4': 3 / 4,
            '4:3': 4 / 3,
            '2:3': 2 / 3,
            '3:2': 3 / 2,
            '9:16': 9 / 16,
            '16:9': 16 / 9
        };
        const match = Object.keys(presets).find((key) => Math.abs(presets[key] - ratio) < 0.012);
        return match ? match : `${ratio.toFixed(2)}:1`;
    }

    function getAspectPadding(imgW, imgH, options) {
        const none = { padLeft: 0, padRight: 0, padTop: 0, padBottom: 0 };
        if (!options.fitAspect) return none;
        const target = getTargetAspectRatio(options);
        if (!target) return none;
        const current = imgW / imgH;
        let canvasW = imgW;
        let canvasH = imgH;
        const epsilon = 0.0001;
        if (current < target - epsilon) {
            canvasW = Math.round(imgH * target);
        } else if (current > target + epsilon) {
            canvasH = Math.round(imgW / target);
        }
        const extraW = Math.max(0, canvasW - imgW);
        const extraH = Math.max(0, canvasH - imgH);
        const padLeft = Math.floor(extraW / 2);
        const padTop = Math.floor(extraH / 2);
        return {
            padLeft,
            padRight: extraW - padLeft,
            padTop,
            padBottom: extraH - padTop
        };
    }

    function getEvenPadding(fittedW, fittedH, options) {
        const none = { padLeft: 0, padRight: 0, padTop: 0, padBottom: 0 };
        if (!options.addPadding) return none;
        if (options.paddingMode === 'relative') {
            const percent = Math.max(0, options.paddingAmount || 0) / 100;
            const padX = Math.round(fittedW * percent);
            const padY = Math.round(fittedH * percent);
            return { padLeft: padX, padRight: padX, padTop: padY, padBottom: padY };
        }
        const px = Math.max(0, Math.round(options.paddingAmount || 0));
        return { padLeft: px, padRight: px, padTop: px, padBottom: px };
    }

    function combinePads(a, b) {
        return {
            padLeft: a.padLeft + b.padLeft,
            padRight: a.padRight + b.padRight,
            padTop: a.padTop + b.padTop,
            padBottom: a.padBottom + b.padBottom
        };
    }

    function getSquircleExpansion(imgW, imgH, options) {
        const none = { padLeft: 0, padRight: 0, padTop: 0, padBottom: 0, squircle: null };
        if (!options.addSquircle) return none;
        const base = Math.max(imgW, imgH, 1);
        const inner = Math.round(base * Math.max(0, options.squircleInnerPad || 0) / 100);
        const innerBox = base + inner * 2;
        const outer = Math.round(innerBox * Math.max(0, options.squircleOuterPad || 0) / 100);
        const square = innerBox + outer * 2;
        const extraW = Math.max(0, square - imgW);
        const extraH = Math.max(0, square - imgH);
        const padLeft = Math.floor(extraW / 2);
        const padTop = Math.floor(extraH / 2);
        return {
            padLeft,
            padRight: extraW - padLeft,
            padTop,
            padBottom: extraH - padTop,
            squircle: {
                size: innerBox,
                outer,
                badgeSize: square
            }
        };
    }

    function getPaddingForImage(imgW, imgH, options) {
        const squircleExp = getSquircleExpansion(imgW, imgH, options);
        const afterSqW = imgW + squircleExp.padLeft + squircleExp.padRight;
        const afterSqH = imgH + squircleExp.padTop + squircleExp.padBottom;
        const aspectPad = getAspectPadding(afterSqW, afterSqH, options);
        const afterAspectW = afterSqW + aspectPad.padLeft + aspectPad.padRight;
        const afterAspectH = afterSqH + aspectPad.padTop + aspectPad.padBottom;
        const evenPad = getEvenPadding(afterAspectW, afterAspectH, options);
        const combined = combinePads(combinePads(squircleExp, aspectPad), evenPad);
        combined.aspect = aspectPad;
        combined.even = evenPad;
        combined.squircle = squircleExp.squircle;
        combined.squirclePad = squircleExp;
        combined.badgeW = afterSqW;
        combined.badgeH = afterSqH;
        combined.fittedW = afterAspectW;
        combined.fittedH = afterAspectH;
        return combined;
    }

    function generateSquirclePath(minX, minY, w, h) {
        const sx = w / 223.2;
        const sy = h / 223.2;
        const f = (val) => Number(val.toFixed(4));
        const m_x = f(minX + 161.9 * sx);
        const m_y = f(minY + 220.3 * sy);
        return `M${m_x},${m_y}` +
            `c${f(-33.53 * sx)},${f(3.88 * sy)},${f(-67.06 * sx)},${f(3.88 * sy)},${f(-100.6 * sx)},${f(0 * sy)}` +
            `c${f(-30.6 * sx)},${f(-3.54 * sy)},${f(-54.86 * sx)},${f(-27.8 * sy)},${f(-58.4 * sx)},${f(-58.4 * sy)}` +
            `c${f(-3.88 * sx)},${f(-33.53 * sy)},${f(-3.88 * sx)},${f(-67.06 * sy)},${f(0 * sx)},${f(-100.6 * sy)}` +
            `C${f(minX + 6.44 * sx)},${f(minY + 30.7 * sy)},${f(minX + 30.7 * sx)},${f(minY + 6.44 * sy)},${f(minX + 61.3 * sx)},${f(minY + 2.91 * sy)}` +
            `c${f(33.53 * sx)},${f(-3.88 * sy)},${f(67.06 * sx)},${f(-3.88 * sy)},${f(100.6 * sx)},${f(0 * sy)}` +
            `c${f(30.6 * sx)},${f(3.54 * sy)},${f(54.86 * sx)},${f(27.8 * sy)},${f(58.4 * sx)},${f(58.4 * sy)}` +
            `c${f(3.88 * sx)},${f(33.53 * sy)},${f(3.88 * sx)},${f(67.06 * sy)},${f(0 * sx)},${f(100.6 * sy)}` +
            `c${f(-3.54 * sx)},${f(30.6 * sy)},${f(-27.8 * sx)},${f(54.86 * sy)},${f(-58.4 * sx)},${f(58.4 * sy)}Z`;
    }

    function drawSquirclePath(ctx, x, y, size, color) {
        const path = new Path2D(generateSquirclePath(x, y, size, size));
        ctx.fillStyle = color || '#8b5cf6';
        ctx.fill(path);
    }

    async function loadSquircleSvgText() {
        if (squircleSvgText !== null) return squircleSvgText;
        for (const url of SQUIRCLE_SVG_URLS) {
            try {
                const response = await fetch(url);
                if (!response.ok) continue;
                squircleSvgText = await response.text();
                if (squircleSvgText) return squircleSvgText;
            } catch (error) {
                // Try the next candidate path.
            }
        }
        console.warn('Could not load Perfect Squircle SVG, using built-in path.');
        squircleSvgText = '';
        return squircleSvgText;
    }

    async function getSquircleImage(color) {
        const key = (color || '#8b5cf6').toLowerCase();
        if (squircleImageCache.has(key)) return squircleImageCache.get(key);
        const svgText = await loadSquircleSvgText();
        if (!svgText) return null;
        const recolored = svgText
            .replace(/#95979a/gi, color)
            .replace(/fill:\s*#[0-9a-fA-F]{3,8}/g, `fill: ${color}`);
        const blob = new Blob([recolored], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const image = new Image();
        const loaded = new Promise((resolve, reject) => {
            image.onload = () => resolve(image);
            image.onerror = reject;
        });
        image.src = url;
        try {
            await loaded;
            URL.revokeObjectURL(url);
            squircleImageCache.set(key, image);
            return image;
        } catch (error) {
            URL.revokeObjectURL(url);
            return null;
        }
    }

    async function drawSquircleShape(ctx, x, y, size, color) {
        const image = await getSquircleImage(color);
        if (image) {
            ctx.drawImage(image, x, y, size, size);
            return;
        }
        drawSquirclePath(ctx, x, y, size, color);
    }

    function updateSquircleControlState() {
        squircleOptionsWrapper.classList.toggle('disabled', !squircleToggle.checked);
        squircleInnerValue.textContent = squircleInnerSlider.value;
        squircleOuterValue.textContent = squircleOuterSlider.value;
        drawSquircleShapePreview();
    }

    async function drawSquircleShapePreview() {
        const size = squircleShapePreview.width;
        squircleShapePreviewCtx.clearRect(0, 0, size, size);
        fillCheckerboard(squircleShapePreviewCtx, size, size, 6);
        await drawSquircleShape(
            squircleShapePreviewCtx,
            4,
            4,
            size - 8,
            squircleColorPicker.value
        );
    }

    function updatePaddingHint(imgW, imgH, pad, options) {
        if (!paddingHint) return;
        const padLeft = pad.padLeft || 0;
        const padRight = pad.padRight || 0;
        const padTop = pad.padTop || 0;
        const padBottom = pad.padBottom || 0;
        const outW = imgW + padLeft + padRight;
        const outH = imgH + padTop + padBottom;
        const usingAspect = !!options.fitAspect;
        const usingPad = !!options.addPadding;
        const usingSquircle = !!options.addSquircle;

        if (!usingAspect && !usingPad && !usingSquircle) {
            paddingHint.textContent = '';
            return;
        }

        const parts = [`${imgW} × ${imgH} (${describeAspect(imgW, imgH)})`];
        if (usingSquircle && pad.squircle) {
            parts.push(`${pad.badgeW} × ${pad.badgeH} squircle`);
        }
        if (usingAspect) {
            const fittedW = pad.fittedW || outW;
            const fittedH = pad.fittedH || outH;
            if (!usingSquircle || fittedW !== pad.badgeW || fittedH !== pad.badgeH) {
                parts.push(`${fittedW} × ${fittedH} (${describeAspect(fittedW, fittedH)})`);
            }
        }
        if (usingPad) {
            const evenPx = pad.even?.padLeft || 0;
            parts.push(options.paddingMode === 'relative' ? 'relative padding' : `+${evenPx}px each side`);
        }
        if (padLeft + padRight + padTop + padBottom === 0) {
            paddingHint.textContent = usingAspect
                ? `This image is already ${describeAspect(imgW, imgH)} — no extra canvas needed.`
                : 'No extra canvas added for this image.';
            return;
        }
        const lastSize = `${outW} × ${outH}`;
        if (!parts[parts.length - 1].startsWith(lastSize)) {
            parts.push(lastSize);
        }
        paddingHint.textContent = parts.join(' → ');
    }

    function fillCheckerboard(ctx, width, height, size = 10) {
        ctx.fillStyle = '#16161c';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#2a2a32';
        for (let y = 0; y < height; y += size) {
            for (let x = 0; x < width; x += size) {
                if (((x / size) + (y / size)) % 2 === 0) {
                    ctx.fillRect(x, y, size, size);
                }
            }
        }
    }

    async function renderPaddingPreview() {
        const token = ++paddingPreviewToken;
        if (!usesCanvasExpansion(getTitleOptionsFromUI())) {
            paddingPreviewWrap.classList.add('hidden');
            return;
        }

        paddingPreviewWrap.classList.remove('hidden');
        updatePaddingPreviewNav();
        const options = getTitleOptionsFromUI();
        const transparentPad = usesTransparentPadding(options);
        const sampleW = 800;
        const sampleH = 1200;
        let sourceImage = null;
        let imgW = sampleW;
        let imgH = sampleH;

        if (imageFiles.length > 0) {
            try {
                sourceImage = await loadImage(imageFiles[currentIndex]);
                if (token !== paddingPreviewToken) return;
                imgW = sourceImage.naturalWidth || sourceImage.width || sampleW;
                imgH = sourceImage.naturalHeight || sourceImage.height || sampleH;
            } catch (error) {
                console.error('Padding preview failed to load image', error);
            }
        }

        const pad = getPaddingForImage(imgW, imgH, options);
        const outW = Math.max(1, imgW + pad.padLeft + pad.padRight);
        const outH = Math.max(1, imgH + pad.padTop + pad.padBottom);
        const maxW = 400;
        const maxH = 260;
        const scale = Math.min(maxW / outW, maxH / outH, 1);
        const canvasW = Math.max(1, Math.round(outW * scale));
        const canvasH = Math.max(1, Math.round(outH * scale));
        paddingPreviewCanvas.width = canvasW;
        paddingPreviewCanvas.height = canvasH;

        if (transparentPad) {
            fillCheckerboard(paddingPreviewCtx, canvasW, canvasH);
        }

        const drawX = Math.round(pad.padLeft * scale);
        const drawY = Math.round(pad.padTop * scale);
        const drawW = Math.max(1, Math.round(imgW * scale));
        const drawH = Math.max(1, Math.round(imgH * scale));
        const squircle = pad.squircle;
        const boxW = squircle ? Math.max(1, Math.round(squircle.badgeSize * scale)) : drawW;
        const boxH = squircle ? Math.max(1, Math.round(squircle.badgeSize * scale)) : drawH;
        const boxX = squircle
            ? Math.round((pad.padLeft - (pad.squirclePad?.padLeft || 0)) * scale)
            : drawX;
        const boxY = squircle
            ? Math.round((pad.padTop - (pad.squirclePad?.padTop || 0)) * scale)
            : drawY;

        fillExpandedCanvas(paddingPreviewCtx, options, {
            canvasW,
            canvasH,
            boxX,
            boxY,
            boxW,
            boxH
        });

        if (options.addSquircle && squircle) {
            await drawSquircleShape(
                paddingPreviewCtx,
                boxX + Math.round(squircle.outer * scale),
                boxY + Math.round(squircle.outer * scale),
                Math.max(1, Math.round(squircle.size * scale)),
                options.squircleColor || '#8b5cf6'
            );
            if (token !== paddingPreviewToken) return;
        }

        if (options.fillAlphaBackground) {
            paddingPreviewCtx.fillStyle = options.alphaBackgroundColor || '#FFFFFF';
            paddingPreviewCtx.fillRect(drawX, drawY, drawW, drawH);
        }

        if (sourceImage) {
            paddingPreviewCtx.drawImage(sourceImage, drawX, drawY, drawW, drawH);
        } else {
            paddingPreviewCtx.fillStyle = '#3f3f46';
            paddingPreviewCtx.fillRect(drawX, drawY, drawW, drawH);
            paddingPreviewCtx.fillStyle = '#a1a1aa';
            paddingPreviewCtx.font = '12px Inter, sans-serif';
            paddingPreviewCtx.textAlign = 'center';
            paddingPreviewCtx.textBaseline = 'middle';
            paddingPreviewCtx.fillText('Sample portrait', drawX + drawW / 2, drawY + drawH / 2);
        }

        paddingPreviewCtx.strokeStyle = 'rgba(6, 182, 212, 0.85)';
        paddingPreviewCtx.lineWidth = 1;
        paddingPreviewCtx.strokeRect(drawX + 0.5, drawY + 0.5, Math.max(0, drawW - 1), Math.max(0, drawH - 1));

        if (paddingPreviewCaption) {
            if (sourceImage) {
                paddingPreviewCaption.textContent = `Preview: ${imgW} × ${imgH} (${describeAspect(imgW, imgH)}) → ${outW} × ${outH} (${describeAspect(outW, outH)})`;
            } else {
                paddingPreviewCaption.textContent = `Sample preview: ${imgW} × ${imgH} portrait → ${outW} × ${outH} (${describeAspect(outW, outH)}). Upload images to preview your batch.`;
            }
        }
    }

    function updatePaddingPreviewNav() {
        const total = imageFiles.length;
        const canNavigate = total > 1;
        if (paddingPreviewCounter) {
            paddingPreviewCounter.textContent = total
                ? `${currentIndex + 1} / ${total}`
                : '0 / 0';
        }
        if (paddingPrevBtn) paddingPrevBtn.disabled = !canNavigate;
        if (paddingNextBtn) paddingNextBtn.disabled = !canNavigate;
    }

    function formatTitle(filename) {
        const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
        return nameWithoutExt.replace(/_/g, ' ').replace(/-/g, ' ');
    }

    function getFileExtension(mimeType, file) {
        switch (mimeType) {
            case 'original':
                return getOriginalExtension(file) || '.png';
            case 'image/svg+xml':
                return '.svg';
            case 'image/jpeg':
                return '.jpg';
            case 'image/webp':
                return '.webp';
            case 'image/avif':
                return '.avif';
            default:
                return '.png';
        }
    }

    async function getExportBlobForFile(file, index, options, format, quality, processCtx) {
        // Rename-only / SVG passthrough: keep original vector (or bytes) intact
        if (format === 'original') {
            return file;
        }
        if (format === 'image/svg+xml') {
            if (!isSvgFile(file)) {
                throw new Error(`${file.name} is not an SVG — skip or choose PNG/JPG to rasterize.`);
            }
            return file;
        }

        await drawImageWithTitle(processCtx, file, imageTitles[index], options, index);
        const blob = await new Promise(resolve => processCtx.canvas.toBlob(resolve, format, quality));
        if (!blob) throw new Error(`Failed to create blob for ${file.name}`);
        return blob;
    }

    function updateAdjustmentLabels() {
        exposureValue.textContent = exposureSlider.value;
        brightnessValue.textContent = brightnessSlider.value;
        contrastValue.textContent = contrastSlider.value;
        saturationValue.textContent = saturationSlider.value;
        hueValue.textContent = hueSlider.value;
        warmthValue.textContent = warmthSlider.value;
        grayscaleValue.textContent = grayscaleSlider.value;
        sepiaValue.textContent = sepiaSlider.value;
        blurValue.textContent = Number(blurSlider.value).toFixed(1).replace('.0', '');
    }

    function resetImageAdjustments() {
        exposureSlider.value = 0;
        brightnessSlider.value = 100;
        contrastSlider.value = 100;
        saturationSlider.value = 100;
        hueSlider.value = 0;
        warmthSlider.value = 0;
        grayscaleSlider.value = 0;
        sepiaSlider.value = 0;
        blurSlider.value = 0;
        handleControlsChange();
    }

    function resetSingleImageAdjustment(e) {
        const slider = document.getElementById(e.currentTarget.dataset.resetSlider);
        if (!slider) return;
        slider.value = e.currentTarget.dataset.resetValue;
        handleControlsChange();
    }

    function getImageAdjustmentsFromUI() {
        return {
            exposure: parseInt(exposureSlider.value, 10),
            brightness: parseInt(brightnessSlider.value, 10),
            contrast: parseInt(contrastSlider.value, 10),
            saturation: parseInt(saturationSlider.value, 10),
            hue: parseInt(hueSlider.value, 10),
            warmth: parseInt(warmthSlider.value, 10),
            grayscale: parseInt(grayscaleSlider.value, 10),
            sepia: parseInt(sepiaSlider.value, 10),
            blur: parseFloat(blurSlider.value)
        };
    }

    function buildCanvasFilter(adjustments = {}) {
        const exposureFactor = Math.pow(2, (adjustments.exposure || 0) / 100);
        const brightness = Math.max(0, ((adjustments.brightness ?? 100) / 100) * exposureFactor * 100);
        const contrast = adjustments.contrast ?? 100;
        const saturation = adjustments.saturation ?? 100;
        const hue = adjustments.hue || 0;
        const grayscale = adjustments.grayscale || 0;
        const sepia = adjustments.sepia || 0;
        const blur = adjustments.blur || 0;

        return [
            `brightness(${brightness}%)`,
            `contrast(${contrast}%)`,
            `saturate(${saturation}%)`,
            `hue-rotate(${hue}deg)`,
            `grayscale(${grayscale}%)`,
            `sepia(${sepia}%)`,
            `blur(${blur}px)`
        ].join(' ');
    }

    function drawAdjustedImage(ctx, img, x, y, width, height, adjustments) {
        ctx.save();
        ctx.filter = buildCanvasFilter(adjustments);
        ctx.drawImage(img, x, y, width, height);
        ctx.restore();
        applyWarmthOverlay(ctx, x, y, width, height, adjustments?.warmth || 0);
    }

    function applyWarmthOverlay(ctx, x, y, width, height, warmth) {
        if (!warmth) return;
        const strength = Math.min(Math.abs(warmth) / 100, 1) * 0.18;
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = warmth > 0
            ? `rgba(255, 148, 64, ${strength})`
            : `rgba(64, 180, 255, ${strength})`;
        ctx.fillRect(x, y, width, height);
        ctx.restore();
    }

    async function drawImageWithTitle(ctx, imageFile, title, options, sequenceIndex = 0) {
        const drawableFile = await prepareFileForCanvas(imageFile);
        return new Promise((resolve, reject) => {
            const img = new Image();
            // Use object URL
            const url = URL.createObjectURL(drawableFile);

            img.onload = async () => {
                try {
                const imgW = img.naturalWidth || img.width || 512;
                const imgH = img.naturalHeight || img.height || 512;
                const pad = getPaddingForImage(imgW, imgH, options);
                const contentW = imgW + pad.padLeft + pad.padRight;
                const contentH = imgH + pad.padTop + pad.padBottom;

                if (ctx === previewCtx) {
                    updatePaddingHint(imgW, imgH, pad, options);
                }

                let sizeScale = 1;
                if (options.relativeSize) {
                    sizeScale = imgW / RELATIVE_SIZE_REFERENCE_WIDTH;
                }

                const titleActive = !!options.addTitle;
                let headerHeight = 0;
                if (titleActive && (options.mode === 'add-space' || options.mode === 'bleed')) {
                    headerHeight = Math.max(1, Math.round(options.headerHeight * sizeScale));
                }

                ctx.canvas.width = contentW;
                ctx.canvas.height = (titleActive && options.mode === 'add-space') ? contentH + headerHeight : contentH;

                const isBelow = options.position === 'below';
                const imageX = pad.padLeft;
                let imageY = pad.padTop;
                if (titleActive && options.mode === 'add-space' && !isBelow) {
                    imageY = headerHeight + pad.padTop;
                }

                const squircle = pad.squircle;
                const boxW = squircle ? squircle.badgeSize : imgW;
                const boxH = squircle ? squircle.badgeSize : imgH;
                const boxX = squircle ? imageX - (pad.squirclePad?.padLeft || 0) : imageX;
                const boxY = squircle ? imageY - (pad.squirclePad?.padTop || 0) : imageY;
                const contentTop = (titleActive && options.mode === 'add-space' && !isBelow) ? headerHeight : 0;
                const contentBottom = (titleActive && options.mode === 'add-space' && isBelow) ? contentH : ctx.canvas.height;

                fillExpandedCanvas(ctx, options, {
                    canvasW: ctx.canvas.width,
                    canvasH: ctx.canvas.height,
                    boxX,
                    boxY,
                    boxW,
                    boxH,
                    contentTop,
                    contentBottom
                });

                if (options.addSquircle && squircle) {
                    await drawSquircleShape(
                        ctx,
                        boxX + squircle.outer,
                        boxY + squircle.outer,
                        squircle.size,
                        options.squircleColor || '#8b5cf6'
                    );
                }

                if (options.fillAlphaBackground) {
                    ctx.fillStyle = options.alphaBackgroundColor || '#FFFFFF';
                    ctx.fillRect(imageX, imageY, imgW, imgH);
                }

                if (!titleActive) {
                    drawAdjustedImage(ctx, img, imageX, imageY, imgW, imgH, options.adjustments);
                } else {
                    const scaledTextOffset = options.textOffset * sizeScale;
                    const scaledFontSize = Math.max(1, options.fontSize * sizeScale);

                    if (options.mode === 'add-space') {
                        const headerY = isBelow ? contentH : 0;
                        ctx.fillStyle = options.bgColor;
                        ctx.fillRect(0, headerY, ctx.canvas.width, headerHeight);
                        drawAdjustedImage(ctx, img, imageX, imageY, imgW, imgH, options.adjustments);
                    } else {
                        drawAdjustedImage(ctx, img, imageX, imageY, imgW, imgH, options.adjustments);
                        if (options.mode === 'bleed') {
                            const rectY = isBelow ? ctx.canvas.height - headerHeight : 0;
                            ctx.fillStyle = options.bgColor;
                            ctx.fillRect(0, rectY, ctx.canvas.width, headerHeight);
                        }
                    }

                    let finalFontSize = scaledFontSize;
                    if (options.autoScale) {
                        const maxW = ctx.canvas.width * 0.9;
                        let testSize = scaledFontSize;
                        ctx.font = `bold ${testSize}px Inter, sans-serif`;
                        while (ctx.measureText(title).width > maxW && testSize > 10) {
                            testSize -= 2;
                            ctx.font = `bold ${testSize}px Inter, sans-serif`;
                        }
                        finalFontSize = testSize;
                    }

                    ctx.font = `bold ${finalFontSize}px Inter, sans-serif`;
                    ctx.fillStyle = options.textColor;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    if (options.mode === 'overlay') {
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                        ctx.shadowBlur = 8 * sizeScale;
                    }

                    let textY;
                    if (options.mode === 'overlay') {
                        textY = ctx.canvas.height * (options.textYPercent / 100);
                    } else if (options.mode === 'add-space') {
                        const headerY = isBelow ? contentH : 0;
                        textY = headerY + (headerHeight / 2);
                    } else { // bleed
                        const rectY = isBelow ? ctx.canvas.height - headerHeight : 0;
                        textY = rectY + (headerHeight / 2) + scaledTextOffset;
                    }

                    ctx.fillText(title, ctx.canvas.width / 2, textY);
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                }

                if (options.addNumbers) {
                    drawSequenceNumber(ctx, options, sequenceIndex, {
                        imgW,
                        imgH,
                        headerHeight,
                        sizeScale,
                        titleActive,
                        contentH
                    });
                }

                URL.revokeObjectURL(url); // Clean up memory
                resolve();
                } catch (error) {
                    URL.revokeObjectURL(url);
                    reject(error);
                }
            };

            img.onerror = (e) => {
                console.error("DEBUG: Image load failed", e);
                URL.revokeObjectURL(url); // Clean up memory
                reject(new Error(`Could not load image: ${imageFile.name}`));
            };

            img.src = url;
        });
    }

    function drawSequenceNumber(ctx, options, sequenceIndex, layout) {
        const { imgH, headerHeight, sizeScale, titleActive, contentH } = layout;
        const canvasW = ctx.canvas.width;
        const canvasH = ctx.canvas.height;
        const offset = Math.max(0, options.numberOffset * sizeScale);
        const fontSize = Math.max(1, options.numberSize * sizeScale);
        const numberText = String((options.numberStart || 1) + sequenceIndex);
        const corner = options.numberCorner || 'bottom-left';
        const isTop = corner.startsWith('top');
        const isLeft = corner.endsWith('left');

        const clearsTitleBand = titleActive && headerHeight > 0;
        const titleAbove = clearsTitleBand && options.position === 'above';
        const titleBelow = clearsTitleBand && options.position === 'below';
        const paddedContentH = contentH || imgH;

        let x;
        let y;

        if (isLeft) {
            x = offset;
            ctx.textAlign = 'left';
        } else {
            x = canvasW - offset;
            ctx.textAlign = 'right';
        }

        if (isTop) {
            ctx.textBaseline = 'top';
            y = titleAbove ? (headerHeight + offset) : offset;
        } else {
            ctx.textBaseline = 'bottom';
            if (titleBelow) {
                // Sit above the title band (add-space extension or bleed overlay)
                const bandTop = options.mode === 'add-space'
                    ? paddedContentH
                    : (canvasH - headerHeight);
                y = bandTop - offset;
            } else {
                y = canvasH - offset;
            }
        }

        ctx.save();
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        ctx.fillStyle = options.numberColor || '#FFFFFF';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = 6 * sizeScale;
        ctx.fillText(numberText, x, y);
        ctx.restore();
    }

    function updateUIForCurrentIndex() {
        if (imageFiles.length === 0) return;
        imageCounter.textContent = `${currentIndex + 1} / ${imageFiles.length}`;
        titleInput.value = imageTitles[currentIndex];
        folderSelect.value = imageFolders[currentIndex];
        renderPreview();
    }

    async function renderPreview() {
        renderPaddingPreview();
        if (imageFiles.length === 0) return;
        try {
            await drawImageWithTitle(previewCtx, imageFiles[currentIndex], imageTitles[currentIndex], getTitleOptionsFromUI(), currentIndex);
        } catch (error) {
            showStatus(exportStatus, `Error: ${error.message}`, true);
        }
    }

    async function handleExport() {
        if (imageFiles.length === 0) return;

        exportBtn.disabled = true;
        exportBtn.textContent = 'Processing...';
        showStatus(exportStatus, `Processing ${imageFiles.length} files...`, false, true);

        const zip = new JSZip();
        const options = getTitleOptionsFromUI();
        const processCanvas = document.createElement('canvas');
        const processCtx = processCanvas.getContext('2d');
        const format = exportFormatSelect.value;
        const quality = parseInt(mainQualitySlider.value, 10) / 100;
        const passthrough = isPassthroughExportFormat(format);

        let successCount = 0;
        let skippedCount = 0;

        try {
            for (let i = 0; i < imageFiles.length; i++) {
                const pct = Math.round(((i + 1) / imageFiles.length) * 100);
                showStatus(exportStatus, `Processing ${i + 1}/${imageFiles.length} (${pct}%)`, false);
                exportBtn.textContent = `Processing ${pct}%...`;

                try {
                    const file = imageFiles[i];
                    const blob = await getExportBlobForFile(file, i, options, format, quality, processCtx);
                    const ext = getFileExtension(format, file);
                    const finalName = generateFilename(i, imageTitles[i], ext);

                    if (imageFolders[i] !== "(Root)") {
                        zip.folder(imageFolders[i]).file(finalName, blob);
                    } else {
                        zip.file(finalName, blob);
                    }
                    successCount++;

                    if (!passthrough) {
                        processCtx.clearRect(0, 0, processCanvas.width, processCanvas.height);
                    }
                } catch (imgError) {
                    console.error(`Error processing image ${imageFiles[i].name}:`, imgError);
                    skippedCount++;
                }
            }

            if (successCount === 0) {
                throw new Error(skippedCount
                    ? 'No files exported. For SVG rename, set Format to Original or SVG.'
                    : 'No files to export.');
            }

            showStatus(exportStatus, `Zipping ${successCount} file${successCount === 1 ? '' : 's'}...`, false);
            const zipBlob = await zip.generateAsync({ type: 'blob' });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = passthrough ? 'renamed_files.zip' : 'processed_images.zip';
            document.body.appendChild(link); link.click(); document.body.removeChild(link);

            const skipNote = skippedCount ? ` (${skippedCount} skipped)` : '';
            showStatus(exportStatus, `Download Started!${skipNote}`, false);
        } catch (error) {
            console.error("DEBUG: Export Error", error);
            showStatus(exportStatus, `Error: ${error.message}`, true);
        } finally {
            exportBtn.disabled = false;
            exportBtn.textContent = 'Export All as .ZIP';
        }
    }

    async function handleDownloadCurrentImage() {
        if (imageFiles.length === 0) return;

        const format = exportFormatSelect.value;
        const quality = parseInt(mainQualitySlider.value, 10) / 100;
        const file = imageFiles[currentIndex];
        const ext = getFileExtension(format, file);
        const finalName = generateFilename(currentIndex, imageTitles[currentIndex], ext);

        try {
            if (isPassthroughExportFormat(format)) {
                if (format === 'image/svg+xml' && !isSvgFile(file)) {
                    showStatus(exportStatus, 'Current file is not an SVG. Choose PNG/JPG or Original.', true);
                    return;
                }
                await safeDownload(file, finalName);
                return;
            }

            previewCanvas.toBlob(async (blob) => {
                if (!blob) return;
                await safeDownload(blob, finalName);
            }, format, quality);
        } catch (err) {
            showStatus(exportStatus, `Error: ${err.message}`, true);
        }
    }

    async function handleOpenGridInTab() {
        // Just use the improved handleGenerateGrid which now uses safeDownload correctly
        handleGenerateGrid(true);
    }

    async function safeDownload(blob, filename) {
        const ua = navigator.userAgent;
        const isIOS = /iPhone|iPad|iPod/.test(ua);
        const isChromeIOS = /CriOS/.test(ua);
        const isSafariIOS = isIOS && /Safari/i.test(ua) && !isChromeIOS;

        console.log(`DEBUG: safeDownload called for ${filename}. isIOS: ${isIOS}, isChromeIOS: ${isChromeIOS}`);

        // 1. PRIMARY FOR iOS: Web Share API (Most robust way to save to Photos)
        if (isIOS && navigator.share) {
            try {
                const file = new File([blob], filename, { type: blob.type });
                await navigator.share({
                    files: [file],
                    title: filename,
                });
                return; // Success!
            } catch (err) {
                console.log("DEBUG: navigator.share failed or cancelled", err);
                // If it's just a user cancel, we don't need to force another popup, 
                // but if it's an error, we fall back.
                if (err.name !== 'AbortError') {
                    // Fall through to other methods
                } else {
                    return; // User cancelled
                }
            }
        }

        // 2. SECONDARY FOR iOS: Standard link or Data URL
        if (isIOS) {
            // Create a physical link to click
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;

            if (isChromeIOS) {
                // iOS Chrome is extremely finicky with blobs. 
                // We'll attempt a Data URL for iOS Chrome as it's more "sticky" than Blobs.
                const reader = new FileReader();
                reader.onloadend = function() {
                    const dataUrl = reader.result;
                    // For Chrome iOS, sometimes we need to open in a new tab OR change location
                    // We'll try changing location for the "Download" experience
                    window.location.href = dataUrl;
                    
                    // If after 2 seconds we haven't left the page (some browsers block location change for data urls),
                    // we show the safety net modal.
                    setTimeout(() => {
                        showSavePreviewModal(dataUrl);
                    }, 2000);
                };
                reader.readAsDataURL(blob);
            } else {
                // iOS Safari
                document.body.appendChild(link);
                link.click();
                setTimeout(() => {
                    if (document.body.contains(link)) document.body.removeChild(link);
                    // Long delay for revocation
                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                }, 1000);
            }
            return;
        }

        // 3. Desktop: Standard Download
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function showSavePreviewModal(imageDataUrl) {
        savePreviewImageContainer.innerHTML = '';
        const img = new Image();
        img.src = imageDataUrl;
        img.style.width = '100%';
        img.style.display = 'block';
        savePreviewImageContainer.appendChild(img);
        savePreviewPopup.classList.remove('hidden');
    }

    function handleAddFolder() {
        const newFolderName = newFolderInput.value.trim();
        if (newFolderName && !availableFolders.includes(newFolderName)) {
            availableFolders.push(newFolderName);
            updateFolderDropdown();
            folderSelect.value = newFolderName;
            handleFolderAssignment();
            newFolderInput.value = '';
        }
    }

    function handleFolderAssignment() {
        if (imageFiles.length > 0) imageFolders[currentIndex] = folderSelect.value;
    }

    function updateFolderDropdown() {
        availableFolders = sortFolderList(availableFolders);
        folderSelect.innerHTML = '';
        availableFolders.forEach(folderName => {
            const option = document.createElement('option');
            option.value = folderName; option.textContent = folderName;
            folderSelect.appendChild(option);
        });
    }

    function navigatePrev() {
        if (imageFiles.length === 0) return;
        currentIndex = (currentIndex - 1 + imageFiles.length) % imageFiles.length;
        updateUIForCurrentIndex();
    }

    function navigateNext() {
        if (imageFiles.length === 0) return;
        currentIndex = (currentIndex + 1) % imageFiles.length;
        updateUIForCurrentIndex();
    }

    function handleKeyPress(e) {
        if (editorSection.classList.contains('hidden') || document.activeElement.tagName === 'INPUT' || !gridPopup.classList.contains('hidden') || !downscalePopup.classList.contains('hidden') || !upscalePopup.classList.contains('hidden') || !colourMatchPopup.classList.contains('hidden')) { return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); navigatePrev(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); navigateNext(); }
    }

    function showStatus(element, message, isError = false, showLoader = false) {
        console.log(`DEBUG: showStatus called for ${element.id}, showLoader: ${showLoader}`);
        element.textContent = message;
        element.style.color = isError ? 'var(--accent-orange)' : 'var(--text-secondary)';
        element.classList.remove('hidden');

        // Remove any existing loader
        const existingLoader = element.parentElement.querySelector('.loader-container');
        if (existingLoader) {
            console.log("DEBUG: Removing existing loader");
            existingLoader.remove();
        }

        if (showLoader) {
            console.log("DEBUG: Creating new loader");
            const loaderDiv = document.createElement('div');
            loaderDiv.className = 'loader-container';
            loaderDiv.style.position = 'relative';
            loaderDiv.style.zIndex = '100';
            loaderDiv.innerHTML = LOADER_HTML;
            element.parentElement.insertBefore(loaderDiv, element);
        }
    }

    // --- Grid Feature ---
    function openGridModal() {
        gridStatus.textContent = ''; gridStatus.classList.add('hidden');
        gridProgressContainer.classList.add('hidden'); // Hide progress bar on open

        // Ensure preview toggle is unchecked by default to prevent immediate freeze
        gridShowPreviewToggle.checked = false;

        // Reset/Clear canvas for clean slate
        const w = gridPreviewCanvas.clientWidth || 800;
        gridPreviewCanvas.width = w;
        gridPreviewCanvas.height = 300;
        gridPreviewCtx.fillStyle = '#111115';
        gridPreviewCtx.fillRect(0, 0, w, 300);
        gridPreviewCtx.fillStyle = '#71717a';
        gridPreviewCtx.textAlign = 'center';
        gridPreviewCtx.font = '20px Inter';
        gridPreviewCtx.fillText("Preview Paused", w / 2, 150);

        gridSourceSelect.innerHTML = '';
        ["All Images", ...new Set(imageFolders)].forEach(folder => {
            const option = document.createElement('option');
            option.value = folder; option.textContent = folder;
            gridSourceSelect.appendChild(option);
        });
        document.body.classList.add('popup-open');
        gridPopup.classList.remove('hidden');

        // We do NOT call updateGridPreview() here because toggle is off. 
        // User must toggle ON to see it.
    }

    function closeGridModal() {
        document.body.classList.remove('popup-open');
        gridPopup.classList.add('hidden');
    }

    // --- Reorder Feature ---
    let dragStartIndex;

    function openReorderModal() {
        if (imageFiles.length === 0) {
            alert("No images loaded to reorder.");
            return;
        }

        reorderList.innerHTML = '';
        imageFiles.forEach((file, index) => {
            const li = document.createElement('li');
            li.setAttribute('data-index', index); // Current visual index
            li.setAttribute('data-original-index', index); // Track origin for saving
            li.classList.add('reorder-item');
            li.draggable = true;

            li.innerHTML = `
                <span style="pointer-events:none;">${file.name}${imageFolders[index] && imageFolders[index] !== '(Root)' ? ` <span style="color:var(--text-muted);">(${imageFolders[index]})</span>` : ''}</span>
                <span style="color:var(--text-secondary); pointer-events:none;">☰</span>
            `;

            addDragEvents(li);
            reorderList.appendChild(li);
        });

        document.body.classList.add('popup-open');
        reorderPopup.classList.remove('hidden');
    }

    function closeReorderModal() {
        document.body.classList.remove('popup-open');
        reorderPopup.classList.add('hidden');
    }

    function addDragEvents(item) {
        item.addEventListener('dragstart', dragStart);
        item.addEventListener('dragenter', dragEnter);
        item.addEventListener('dragover', dragOver);
        item.addEventListener('dragleave', dragLeave);
        item.addEventListener('drop', dragDrop);
    }

    function dragStart() {
        dragStartIndex = +this.getAttribute('data-index');
        this.classList.add('dragging');
    }

    function dragEnter() {
        this.classList.add('drag-over');
    }

    function dragLeave() {
        this.classList.remove('drag-over');
    }

    function dragOver(e) {
        e.preventDefault();
    }

    function dragDrop() {
        const dragEndIndex = +this.getAttribute('data-index');
        swapItems(dragStartIndex, dragEndIndex);
        this.classList.remove('drag-over');
        document.querySelector('.dragging') && document.querySelector('.dragging').classList.remove('dragging');
    }

    function swapItems(fromIndex, toIndex) {
        const items = Array.from(reorderList.querySelectorAll('.reorder-item'));
        const itemOne = items[fromIndex];
        const itemTwo = items[toIndex];

        if (fromIndex < toIndex) {
            itemTwo.parentNode.insertBefore(itemOne, itemTwo.nextSibling);
        } else {
            itemTwo.parentNode.insertBefore(itemOne, itemTwo);
        }

        // Re-index attributes after swap
        const newItems = Array.from(reorderList.querySelectorAll('.reorder-item'));
        newItems.forEach((item, index) => {
            item.setAttribute('data-index', index);
        });
    }

    function saveReorder() {
        const listItems = Array.from(reorderList.querySelectorAll('.reorder-item'));

        // Rebuild arrays based on the original indices
        const newImageFiles = [];
        const newOriginalFiles = [];
        const newImageTitles = [];
        const newImageFolders = [];

        listItems.forEach(item => {
            const oldIndex = parseInt(item.getAttribute('data-original-index'), 10);
            newImageFiles.push(imageFiles[oldIndex]);
            newOriginalFiles.push(originalImageFiles[oldIndex]);
            newImageTitles.push(imageTitles[oldIndex]);
            newImageFolders.push(imageFolders[oldIndex]);
        });

        // Update Global State
        imageFiles = newImageFiles;
        originalImageFiles = newOriginalFiles;
        imageTitles = newImageTitles;
        imageFolders = newImageFolders;

        // Reset View
        currentIndex = 0;
        updateUIForCurrentIndex();

        // Feedback
        showStatus(uploadStatus, "Images reordered successfully!", false);
        closeReorderModal();
    }

    // Helper: Draw borders for "Tetris" style grouping
    function drawTetrisBorders(ctx, layoutData, columns, finalWidth, finalHeight, scale, lineWidth, color) {
        // Create a 2D map of the grid to check neighbors
        const gridMap = {};
        const cellW = layoutData[0].w;
        const cellH = layoutData[0].h;

        layoutData.forEach(item => {
            const col = Math.round(item.x / cellW);
            const row = Math.round(item.y / cellH);
            if (!gridMap[row]) gridMap[row] = {};
            gridMap[row][col] = item.folder;
        });

        // 2. Draw Borders
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth * scale;
        ctx.lineCap = 'round';

        layoutData.forEach(item => {
            const col = Math.round(item.x / cellW);
            const row = Math.round(item.y / cellH);
            const currentFolder = item.folder;

            // Coords for this cell scaled
            const x = item.x * scale;
            const y = item.y * scale;
            const w = item.w * scale;
            const h = item.h * scale;

            ctx.beginPath();

            // Check Top
            if (row === 0 || !gridMap[row - 1] || gridMap[row - 1][col] !== currentFolder) {
                ctx.moveTo(x, y);
                ctx.lineTo(x + w, y);
            }
            // Check Bottom
            if (!gridMap[row + 1] || gridMap[row + 1][col] !== currentFolder) {
                ctx.moveTo(x, y + h);
                ctx.lineTo(x + w, y + h);
            }
            // Check Left
            if (col === 0 || gridMap[row][col - 1] !== currentFolder) {
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + h);
            }
            // Check Right
            if (gridMap[row][col + 1] !== currentFolder) {
                ctx.moveTo(x + w, y);
                ctx.lineTo(x + w, y + h);
            }
            ctx.stroke();
        });
    }

    async function updateGridPreview() {
        // CHECK TOGGLE FIRST
        if (!gridShowPreviewToggle.checked) {
            // Clear canvas to indicate paused state
            const w = gridPreviewCanvas.clientWidth || 800;
            gridPreviewCanvas.width = w;
            gridPreviewCanvas.height = 300;
            gridPreviewCtx.fillStyle = '#111115';
            gridPreviewCtx.fillRect(0, 0, w, 300);
            gridPreviewCtx.fillStyle = '#71717a';
            gridPreviewCtx.textAlign = 'center';
            gridPreviewCtx.font = '20px Inter';
            gridPreviewCtx.fillText("Preview Paused", w / 2, 150);

            gridProgressContainer.classList.add('hidden');
            gridOutputSize.textContent = "0 x 0 px";
            gridOutputMegapixels.textContent = "0.0 MP";
            return;
        }

        const source = gridSourceSelect.value;
        const columns = parseInt(gridColumnsInput.value, 10) || 1;
        const matchSmallest = gridMatchSmallestToggle.checked;
        const isGrouped = gridGroupFolderToggle.checked && source === "All Images";
        const drawBorders = gridDrawBordersToggle.checked;

        // Visuals
        const borderWidth = parseInt(gridBorderWidthInput.value, 10) || 4;
        const borderColor = gridBorderColorInput.value;
        const bgColor = gridBgColorInput.value;

        // Toggle visibility of group border option
        gridDrawBordersToggle.closest('.control-group').classList.toggle('hidden', !isGrouped);
        gridBorderWidthInput.closest('.control-group').classList.toggle('hidden', !isGrouped || !drawBorders);

        let filteredIndices = getFilteredImageIndices(source);
        if (filteredIndices.length === 0) return;

        // Show Progress Bar
        gridProgressContainer.classList.remove('hidden');
        gridProgressBar.style.width = '0%';
        gridProgressText.textContent = '0%';

        // If grouped, sort the indices by folder name
        if (isGrouped) {
            filteredIndices.sort((a, b) => imageFolders[a].localeCompare(imageFolders[b]));
        }

        try {
            const titleOptions = getTitleOptionsFromUI();
            titleOptions.addTitle = gridAddTitlesToggle.checked;

            // Prepare images
            let completedCount = 0;
            const totalImages = filteredIndices.length;

            const processedImages = await Promise.all(
                filteredIndices.map(async (i, seq) => {
                    const img = await getProcessedImage(imageFiles[i], imageTitles[i], titleOptions, seq);

                    // Update Progress
                    completedCount++;
                    const percent = Math.round((completedCount / totalImages) * 100);
                    gridProgressBar.style.width = `${percent}%`;
                    gridProgressText.textContent = `${percent}%`;

                    return { img, folder: imageFolders[i] };
                })
            );

            // 1. Determine Cell Size
            let cellWidth, cellHeight;
            const rawImgs = processedImages.map(p => p.img);
            if (matchSmallest) {
                cellWidth = Math.min(...rawImgs.map(img => img.width));
                cellHeight = Math.min(...rawImgs.map(img => img.height));
            } else {
                cellWidth = Math.max(...rawImgs.map(img => img.width));
                cellHeight = Math.max(...rawImgs.map(img => img.height));
            }

            // 2. Calculate Layout (Continuous Flow)
            const rows = Math.ceil(processedImages.length / columns);
            const finalWidth = cellWidth * columns;
            const finalHeight = rows * cellHeight;
            let layoutData = [];

            processedImages.forEach((item, index) => {
                const row = Math.floor(index / columns);
                const col = index % columns;
                layoutData.push({
                    img: item.img,
                    folder: item.folder,
                    x: col * cellWidth,
                    y: row * cellHeight,
                    w: cellWidth,
                    h: cellHeight
                });
            });

            // Stats
            const totalPixels = finalWidth * finalHeight;
            const megapixels = (totalPixels / 1000000).toFixed(1);
            gridOutputSize.textContent = `${finalWidth} x ${finalHeight} px`;
            gridOutputMegapixels.textContent = `${megapixels} MP`;
            gridWarningBox.classList.toggle('hidden', totalPixels <= MEGAPixel_limit);

            // Render to Preview Canvas
            const previewWidth = gridPreviewCanvas.clientWidth || 800;
            const scale = previewWidth / finalWidth;
            gridPreviewCanvas.width = previewWidth;
            gridPreviewCanvas.height = finalHeight * scale;

            gridPreviewCtx.fillStyle = bgColor;
            gridPreviewCtx.fillRect(0, 0, gridPreviewCanvas.width, gridPreviewCanvas.height);

            // Draw Images
            layoutData.forEach(item => {
                const aspect = item.img.width / item.img.height;
                let dw = item.w * scale;
                let dh = (item.w / aspect) * scale;
                const cellH = item.h * scale;

                if (dh > cellH) {
                    dh = cellH;
                    dw = (item.h * aspect) * scale;
                }

                const dx = (item.x * scale) + (item.w * scale - dw) / 2;
                const dy = (item.y * scale) + (cellH - dh) / 2;

                gridPreviewCtx.drawImage(item.img, dx, dy, dw, dh);
            });

            // Draw Group Borders (Tetris Style)
            if (isGrouped && drawBorders) {
                drawTetrisBorders(gridPreviewCtx, layoutData, columns, finalWidth, finalHeight, scale, borderWidth, borderColor);
            }

            // Hide Progress
            setTimeout(() => { gridProgressContainer.classList.add('hidden'); }, 500);

        } catch (error) {
            console.error("DEBUG: Grid Preview Error", error);
            gridProgressContainer.classList.add('hidden');
        }
    }

    async function handleGenerateGrid(openInTab = false) {
        generateGridBtn.disabled = true; generateGridBtn.textContent = 'Generating...';
        showStatus(gridStatus, 'Preparing Grid...', false, true);

        // Show Progress Bar
        gridProgressContainer.classList.remove('hidden');
        gridProgressBar.style.width = '0%';
        gridProgressText.textContent = '0%';

        const source = gridSourceSelect.value;
        const columns = parseInt(gridColumnsInput.value, 10) || 1;
        const matchSmallest = gridMatchSmallestToggle.checked;
        const isGrouped = gridGroupFolderToggle.checked && source === "All Images";
        const drawBorders = gridDrawBordersToggle.checked;
        const shouldDownscale = gridDownscaleToggle.checked;

        // Visuals
        const borderWidth = parseInt(gridBorderWidthInput.value, 10) || 4;
        const borderColor = gridBorderColorInput.value;
        const bgColor = gridBgColorInput.value;

        let filteredIndices = getFilteredImageIndices(source);

        if (isGrouped) {
            filteredIndices.sort((a, b) => imageFolders[a].localeCompare(imageFolders[b]));
        }

        try {
            const titleOptions = getTitleOptionsFromUI();
            titleOptions.addTitle = gridAddTitlesToggle.checked;

            // PROCESS IMAGES WITH PROGRESS BAR
            let completedCount = 0;
            const totalImages = filteredIndices.length;

            const processedImages = await Promise.all(
                filteredIndices.map(async (i, seq) => {
                    const img = await getProcessedImage(imageFiles[i], imageTitles[i], titleOptions, seq);

                    // Update Progress
                    completedCount++;
                    const percent = Math.round((completedCount / totalImages) * 100);
                    gridProgressBar.style.width = `${percent}%`;
                    gridProgressText.textContent = `${percent}%`;

                    return { img, folder: imageFolders[i] };
                })
            );

            showStatus(gridStatus, 'Assembling Layout...', false);

            // 1. Determine Cell Size
            let cellWidth, cellHeight;
            const rawImgs = processedImages.map(p => p.img);
            if (matchSmallest) {
                cellWidth = Math.min(...rawImgs.map(img => img.width));
                cellHeight = Math.min(...rawImgs.map(img => img.height));
            } else {
                cellWidth = Math.max(...rawImgs.map(img => img.width));
                cellHeight = Math.max(...rawImgs.map(img => img.height));
            }

            // 2. Calculate Layout
            const rows = Math.ceil(processedImages.length / columns);
            let finalWidth = cellWidth * columns;
            let finalHeight = rows * cellHeight;
            let layoutData = [];

            processedImages.forEach((item, index) => {
                const row = Math.floor(index / columns);
                const col = index % columns;
                layoutData.push({
                    img: item.img,
                    folder: item.folder,
                    x: col * cellWidth,
                    y: row * cellHeight,
                    w: cellWidth,
                    h: cellHeight
                });
            });

            // Check Downscale
            let scaleFactor = 1;
            const totalPixels = finalWidth * finalHeight;
            if (shouldDownscale && totalPixels > MEGAPixel_limit) {
                scaleFactor = Math.sqrt(MEGAPixel_limit / totalPixels);
                finalWidth = Math.floor(finalWidth * scaleFactor);
                finalHeight = Math.floor(finalHeight * scaleFactor);
            }

            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = finalWidth; finalCanvas.height = finalHeight;
            const finalCtx = finalCanvas.getContext('2d');
            finalCtx.fillStyle = bgColor;
            finalCtx.fillRect(0, 0, finalWidth, finalHeight);

            // Draw Images
            layoutData.forEach(item => {
                const aspect = item.img.width / item.img.height;
                const targetW = item.w * scaleFactor;
                const targetH = item.h * scaleFactor;
                let dw = targetW, dh = targetW / aspect;

                if (dh > targetH) { dh = targetH; dw = targetH * aspect; }

                const x = (item.x * scaleFactor) + (targetW - dw) / 2;
                const y = (item.y * scaleFactor) + (targetH - dh) / 2;
                finalCtx.drawImage(item.img, x, y, dw, dh);
            });

            // Draw Borders
            if (isGrouped && drawBorders) {
                drawTetrisBorders(finalCtx, layoutData, columns, finalWidth, finalHeight, scaleFactor, borderWidth, borderColor);
            }

            finalCanvas.toBlob(async (blob) => {
                if (openInTab) {
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                    showStatus(gridStatus, `Opened in New Tab!`, false, false);
                } else {
                    const filename = `grid_${source.replace(/\s/g, '_')}.png`;
                    await safeDownload(blob, filename);
                    showStatus(gridStatus, `Downloaded!`, false, false);
                }
                // Hide progress bar after short delay
                setTimeout(() => { gridProgressContainer.classList.add('hidden'); }, 2000);
            }, 'image/png');

        } catch (error) {
            console.error("DEBUG: Grid Gen Error", error);
            showStatus(gridStatus, 'Error occurred.', true);
            gridProgressContainer.classList.add('hidden');
        } finally {
            generateGridBtn.disabled = false; generateGridBtn.textContent = 'Download Grid (PNG)';
        }
    }

    // --- Downscale Feature ---

    async function openDownscaleModal() {
        downscaleStatus.textContent = '';
        downscaleErrorMessage.textContent = '';

        if (imageFiles.length > 0) {
            const img = await loadImage(imageFiles[currentIndex]);
            downscaleOriginalResolution.textContent = `Current Image: ${img.width} x ${img.height} px`;
        }

        document.body.classList.add('popup-open');
        downscalePopup.classList.remove('hidden');
        updateDownscaleUI();
        handleAspectRatioInputChange();
    }

    function closeDownscaleModal() {
        document.body.classList.remove('popup-open');
        downscalePopup.classList.add('hidden');
    }

    function updateDownscaleUI() {
        const mode = downscaleModeSelect.value;
        const isDimensions = mode === 'dimensions';
        downscaleDimensionsControls.classList.toggle('hidden', !isDimensions);
        downscaleMpControls.classList.toggle('hidden', isDimensions);

        const isLocked = downscaleAspectLockToggle.checked;
        downscaleFitControls.classList.toggle('hidden', isLocked || !isDimensions);

        const isPad = downscaleFitSelect.value === 'pad';
        downscalePadColorWrapper.classList.toggle('hidden', !isPad || isLocked || !isDimensions);

        const format = downscaleFormatSelect.value;
        downscaleQualityWrapper.classList.toggle('hidden', format === 'image/png');
        downscaleQualityValue.textContent = downscaleQualitySlider.value;
    }

    async function handleAspectRatioInputChange(source) {
        if (!downscaleAspectLockToggle.checked || imageFiles.length === 0) return;
        const img = await loadImage(imageFiles[currentIndex]);
        const aspectRatio = img.width / img.height;
        const w = parseInt(downscaleWidthInput.value, 10);
        const h = parseInt(downscaleHeightInput.value, 10);

        if (source === 'width' && w > 0) downscaleHeightInput.value = Math.round(w / aspectRatio);
        else if (source === 'height' && h > 0) downscaleWidthInput.value = Math.round(h * aspectRatio);
        else if (w > 0) downscaleHeightInput.value = Math.round(w / aspectRatio);
    }

    async function handleDownscaleGeneration() {
        if (imageFiles.length === 0) return;

        downscaleGenerateBtn.disabled = true;
        downscaleGenerateBtn.textContent = 'Processing...';
        showStatus(downscaleStatus, `Starting batch process...`, false, true);
        downscaleErrorMessage.textContent = '';

        const zip = new JSZip();
        const processCanvas = document.createElement('canvas');
        const processCtx = processCanvas.getContext('2d');

        const format = downscaleFormatSelect.value;
        const quality = parseInt(downscaleQualitySlider.value, 10) / 100;
        const ext = getFileExtension(format);
        const prefix = downscalePrefixInput.value || "";
        const suffix = downscaleSuffixInput.value || "";
        const applyTitles = downscaleApplyTitlesToggle.checked;
        const useSubfolders = downscaleUseSubfoldersToggle.checked;
        const resizeMode = downscaleModeSelect.value;

        console.log(`DEBUG: Downscale Start. Mode: ${resizeMode}, Format: ${format}`);

        try {
            for (let i = 0; i < imageFiles.length; i++) {
                showStatus(downscaleStatus, `Converting ${i + 1}/${imageFiles.length}...`, false);

                const sourceOptions = getTitleOptionsFromUI();
                sourceOptions.addTitle = applyTitles;
                const sourceImage = await getProcessedImage(imageFiles[i], imageTitles[i], sourceOptions, i);

                let targetWidth, targetHeight;
                if (resizeMode === 'megapixels') {
                    const targetMP = parseFloat(downscaleMpInput.value) * 1000000;
                    const aspectRatio = sourceImage.width / sourceImage.height;
                    targetHeight = Math.sqrt(targetMP / aspectRatio);
                    targetWidth = targetHeight * aspectRatio;
                } else {
                    targetWidth = parseInt(downscaleWidthInput.value, 10);
                    targetHeight = parseInt(downscaleHeightInput.value, 10);
                }

                processCanvas.width = Math.round(targetWidth);
                processCanvas.height = Math.round(targetHeight);
                const fitMode = downscaleAspectLockToggle.checked ? 'stretch' : downscaleFitSelect.value;

                if (fitMode === 'pad') {
                    processCtx.fillStyle = document.getElementById('downscale-pad-color-picker').value;
                    processCtx.fillRect(0, 0, processCanvas.width, processCanvas.height);
                }

                const imgAspectRatio = sourceImage.width / sourceImage.height;
                const canvasAspectRatio = processCanvas.width / processCanvas.height;
                let drawWidth, drawHeight, offsetX, offsetY;

                if (fitMode === 'stretch') {
                    drawWidth = processCanvas.width; drawHeight = processCanvas.height;
                    offsetX = 0; offsetY = 0;
                } else { // Pad
                    if (imgAspectRatio > canvasAspectRatio) {
                        drawWidth = processCanvas.width; drawHeight = drawWidth / imgAspectRatio;
                    } else {
                        drawHeight = processCanvas.height; drawWidth = drawHeight * imgAspectRatio;
                    }
                    offsetX = (processCanvas.width - drawWidth) / 2;
                    offsetY = (processCanvas.height - drawHeight) / 2;
                }

                processCtx.drawImage(sourceImage, offsetX, offsetY, drawWidth, drawHeight);

                const blob = await new Promise(resolve => processCanvas.toBlob(resolve, format, quality));

                let baseName = imageTitles[i];
                baseName = applySpacing(baseName, downscaleSpacingSelect.value);
                const finalName = `${prefix}${baseName}${suffix}${ext}`;

                if (useSubfolders && imageFolders[i] !== "(Root)") {
                    zip.folder(imageFolders[i]).file(finalName, blob);
                } else {
                    zip.file(finalName, blob);
                }
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = 'batch_converted_images.zip';
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            showStatus(downscaleStatus, `Download Started!`, false, false);

        } catch (error) {
            console.error('DEBUG: Downscale Error', error);
            showStatus(downscaleErrorMessage, error.message, true);
        } finally {
            downscaleGenerateBtn.disabled = false;
            downscaleGenerateBtn.textContent = 'Generate & Download ZIP';
        }
    }

    // --- Batch Bicubic Upscale Feature ---

    const UPSCALE_MAX_DIM = 16384;
    const UPSCALE_MAX_AREA = 268_435_456;

    function cubicHermite(a, b, c, d, t) {
        const t2 = t * t;
        const t3 = t2 * t;
        return 0.5 * (
            (2 * b) +
            (-a + c) * t +
            (2 * a - 5 * b + 4 * c - d) * t2 +
            (-a + 3 * b - 3 * c + d) * t3
        );
    }

    function sampleChannelBicubic(data, width, height, x, y, channel) {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = x - x0;
        const fy = y - y0;
        const cols = new Array(4);
        for (let j = 0; j < 4; j++) {
            const sy = Math.min(height - 1, Math.max(0, y0 - 1 + j));
            const row = new Array(4);
            for (let i = 0; i < 4; i++) {
                const sx = Math.min(width - 1, Math.max(0, x0 - 1 + i));
                row[i] = data[(sy * width + sx) * 4 + channel];
            }
            cols[j] = cubicHermite(row[0], row[1], row[2], row[3], fx);
        }
        return cubicHermite(cols[0], cols[1], cols[2], cols[3], fy);
    }

    function getUpscaleSafeScale(width, height) {
        if (!width || !height) return 1;
        let scale = 1;
        const maxSide = Math.max(width, height);
        if (maxSide > UPSCALE_MAX_DIM) scale = UPSCALE_MAX_DIM / maxSide;
        const area = width * height * scale * scale;
        if (area > UPSCALE_MAX_AREA) scale *= Math.sqrt(UPSCALE_MAX_AREA / area);
        return Math.min(1, scale);
    }

    function yieldToUI() {
        return new Promise((resolve) => {
            requestAnimationFrame(() => setTimeout(resolve, 0));
        });
    }

    /**
     * True bicubic resize with per-row progress callbacks.
     * Falls back to canvas high-quality for oversized buffers.
     */
    async function resizeImageBicubicWithProgress(source, destW, destH, onProgress) {
        destW = Math.max(1, Math.round(destW));
        destH = Math.max(1, Math.round(destH));

        const srcW = source.width;
        const srcH = source.height;
        const dest = document.createElement('canvas');
        dest.width = destW;
        dest.height = destH;
        const destCtx = dest.getContext('2d');

        if (srcW === destW && srcH === destH) {
            destCtx.drawImage(source, 0, 0);
            if (onProgress) onProgress(1);
            return dest;
        }

        const MAX_KERNEL_PIXELS = 16_777_216;
        const canUseKernel = srcW * srcH <= MAX_KERNEL_PIXELS && destW * destH <= MAX_KERNEL_PIXELS;

        if (canUseKernel) {
            try {
                const srcCanvas = document.createElement('canvas');
                srcCanvas.width = srcW;
                srcCanvas.height = srcH;
                const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
                srcCtx.drawImage(source, 0, 0);
                if (onProgress) onProgress(0.02);
                await yieldToUI();

                const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;
                const out = destCtx.createImageData(destW, destH);
                const outData = out.data;
                const xRatio = srcW / destW;
                const yRatio = srcH / destH;
                const yieldEvery = Math.max(1, Math.floor(destH / 40));

                for (let y = 0; y < destH; y++) {
                    if (upscaleCancelRequested) throw new Error('Cancelled');
                    const srcY = (y + 0.5) * yRatio - 0.5;
                    for (let x = 0; x < destW; x++) {
                        const srcX = (x + 0.5) * xRatio - 0.5;
                        const idx = (y * destW + x) * 4;
                        outData[idx] = Math.min(255, Math.max(0, sampleChannelBicubic(srcData, srcW, srcH, srcX, srcY, 0)));
                        outData[idx + 1] = Math.min(255, Math.max(0, sampleChannelBicubic(srcData, srcW, srcH, srcX, srcY, 1)));
                        outData[idx + 2] = Math.min(255, Math.max(0, sampleChannelBicubic(srcData, srcW, srcH, srcX, srcY, 2)));
                        outData[idx + 3] = Math.min(255, Math.max(0, sampleChannelBicubic(srcData, srcW, srcH, srcX, srcY, 3)));
                    }
                    if (y % yieldEvery === 0 || y === destH - 1) {
                        if (onProgress) onProgress(0.05 + 0.9 * ((y + 1) / destH));
                        await yieldToUI();
                    }
                }

                destCtx.putImageData(out, 0, 0);
                if (onProgress) onProgress(1);
                return dest;
            } catch (err) {
                if (err.message === 'Cancelled') throw err;
                console.warn('Bicubic kernel failed, using canvas high-quality fallback:', err);
            }
        }

        // Fallback: staged canvas draws so the individual bar still moves.
        if (onProgress) onProgress(0.15);
        await yieldToUI();
        destCtx.imageSmoothingEnabled = true;
        destCtx.imageSmoothingQuality = 'high';
        if (onProgress) onProgress(0.45);
        await yieldToUI();
        destCtx.drawImage(source, 0, 0, destW, destH);
        if (onProgress) onProgress(1);
        return dest;
    }

    function getUpscaleFactorValue() {
        if (upscaleFactorSelect.value === 'custom') {
            return Math.max(1.01, parseFloat(upscaleCustomFactorInput.value) || 1.5);
        }
        return parseFloat(upscaleFactorSelect.value) || 2;
    }

    function computeUpscaleTargetSize(srcW, srcH) {
        const mode = upscaleModeSelect.value;
        let targetW;
        let targetH;

        if (mode === 'factor') {
            const factor = getUpscaleFactorValue();
            targetW = srcW * factor;
            targetH = srcH * factor;
        } else if (mode === 'megapixels') {
            const targetMP = Math.max(0.1, parseFloat(upscaleMpInput.value) || 8) * 1_000_000;
            const aspect = srcW / srcH;
            targetH = Math.sqrt(targetMP / aspect);
            targetW = targetH * aspect;
        } else {
            targetW = parseInt(upscaleWidthInput.value, 10) || srcW;
            targetH = parseInt(upscaleHeightInput.value, 10) || srcH;
            if (upscaleAspectLockToggle.checked) {
                const aspect = srcW / srcH;
                // Prefer width as driver when locked
                targetH = targetW / aspect;
            }
        }

        targetW = Math.max(1, Math.round(targetW));
        targetH = Math.max(1, Math.round(targetH));

        const safeScale = getUpscaleSafeScale(targetW, targetH);
        const clamped = safeScale < 1;
        const appliedW = Math.max(1, Math.round(targetW * safeScale));
        const appliedH = Math.max(1, Math.round(targetH * safeScale));

        return {
            idealW: targetW,
            idealH: targetH,
            appliedW,
            appliedH,
            clamped,
            scaleX: appliedW / srcW,
            scaleY: appliedH / srcH
        };
    }

    function setUpscaleBatchProgress(pct, detail) {
        const clamped = Math.max(0, Math.min(100, Math.round(pct)));
        upscaleBatchBar.style.width = `${clamped}%`;
        upscaleBatchPercent.textContent = `${clamped}%`;
        if (detail != null) upscaleBatchDetail.textContent = detail;
    }

    function setUpscaleImageProgress(pct, detail) {
        const clamped = Math.max(0, Math.min(100, Math.round(pct)));
        upscaleImageBar.style.width = `${clamped}%`;
        upscaleImagePercent.textContent = `${clamped}%`;
        if (detail != null) upscaleImageDetail.textContent = detail;
    }

    function resetUpscaleProgressUI() {
        upscaleProgressContainer.classList.add('hidden');
        setUpscaleBatchProgress(0, 'Waiting…');
        setUpscaleImageProgress(0, '—');
        upscaleImageLabel.textContent = 'Current image';
        upscaleCancelBtn.classList.add('hidden');
        upscaleCancelBtn.disabled = false;
        upscaleCancelBtn.textContent = 'Cancel';
    }

    async function openUpscaleModal() {
        upscaleStatus.textContent = '';
        upscaleErrorMessage.textContent = '';
        resetUpscaleProgressUI();
        upscaleCancelRequested = false;
        upscaleRunning = false;

        document.body.classList.add('popup-open');
        upscalePopup.classList.remove('hidden');
        updateUpscaleUI();
        await refreshUpscalePreview();
    }

    function closeUpscaleModal() {
        if (upscaleRunning) return;
        document.body.classList.remove('popup-open');
        upscalePopup.classList.add('hidden');
    }

    function updateUpscaleUI() {
        const mode = upscaleModeSelect.value;
        upscaleFactorControls.classList.toggle('hidden', mode !== 'factor');
        upscaleDimensionsControls.classList.toggle('hidden', mode !== 'dimensions');
        upscaleMpControls.classList.toggle('hidden', mode !== 'megapixels');
        upscaleCustomFactorWrapper.classList.toggle(
            'hidden',
            mode !== 'factor' || upscaleFactorSelect.value !== 'custom'
        );

        const format = upscaleFormatSelect.value;
        upscaleQualityWrapper.classList.toggle('hidden', format === 'image/png');
        upscaleQualityValue.textContent = upscaleQualitySlider.value;
    }

    async function handleUpscaleAspectInputChange(source) {
        if (!upscaleAspectLockToggle.checked || imageFiles.length === 0) return;
        const img = await loadImage(imageFiles[currentIndex]);
        const aspectRatio = img.width / img.height;
        const w = parseInt(upscaleWidthInput.value, 10);
        const h = parseInt(upscaleHeightInput.value, 10);

        if (source === 'width' && w > 0) upscaleHeightInput.value = Math.round(w / aspectRatio);
        else if (source === 'height' && h > 0) upscaleWidthInput.value = Math.round(h * aspectRatio);
        else if (w > 0) upscaleHeightInput.value = Math.round(w / aspectRatio);
    }

    async function refreshUpscalePreview() {
        if (imageFiles.length === 0) {
            upscaleOriginalResolution.textContent = 'No images loaded.';
            upscaleOutputPreview.textContent = 'Output preview: —';
            upscaleWarningBox.classList.add('hidden');
            return;
        }

        try {
            const img = await loadImage(imageFiles[currentIndex]);
            const srcW = img.width;
            const srcH = img.height;
            upscaleOriginalResolution.textContent =
                `Current image: ${srcW} × ${srcH} px · Batch: ${imageFiles.length} image${imageFiles.length === 1 ? '' : 's'}`;

            const target = computeUpscaleTargetSize(srcW, srcH);
            const mp = (target.appliedW * target.appliedH) / 1_000_000;
            upscaleOutputPreview.textContent =
                `Output preview: ${target.appliedW} × ${target.appliedH} px (${mp.toFixed(2)} MP)` +
                (target.clamped ? ' — clamped to browser limit' : '');

            const maxFactor = Math.max(target.scaleX, target.scaleY);
            const warnings = [];
            if (target.clamped) {
                warnings.push(
                    `Ideal size ${target.idealW} × ${target.idealH} exceeds browser canvas limits. Will clamp to ${target.appliedW} × ${target.appliedH}.`
                );
            }
            if (maxFactor >= 4) {
                warnings.push(`Large ${maxFactor.toFixed(2)}× upscale — bicubic cannot invent real detail; expect softness.`);
            } else if (maxFactor >= 2) {
                warnings.push(`${maxFactor.toFixed(2)}× upscale uses interpolated pixels. Fine for size, soft on fine detail.`);
            }
            if (mp >= 36) {
                warnings.push(`Very high output (~${mp.toFixed(1)} MP). Batch processing may be slow and memory-heavy.`);
            } else if (mp >= 16) {
                warnings.push(`High output (~${mp.toFixed(1)} MP). Expect longer processing per image.`);
            }
            if (target.appliedW < srcW && target.appliedH < srcH) {
                warnings.push('Target is smaller than the source — this will downscale, not upscale.');
            }

            if (warnings.length) {
                upscaleWarningBox.classList.remove('hidden');
                upscaleWarningBox.classList.toggle('danger', target.clamped || maxFactor >= 4 || mp >= 36);
                upscaleWarningBox.innerHTML = warnings.map((w) => `<div>${w}</div>`).join('');
            } else {
                upscaleWarningBox.classList.add('hidden');
                upscaleWarningBox.innerHTML = '';
            }
        } catch (err) {
            console.error(err);
            upscaleOriginalResolution.textContent = 'Could not read current image size.';
        }
    }

    async function handleUpscaleGeneration() {
        if (imageFiles.length === 0 || upscaleRunning) return;

        upscaleCancelRequested = false;
        upscaleRunning = true;
        upscaleGenerateBtn.disabled = true;
        upscaleGenerateBtn.textContent = 'Processing…';
        upscaleCancelBtn.classList.remove('hidden');
        upscaleCancelBtn.disabled = false;
        upscaleCancelBtn.textContent = 'Cancel';
        upscaleErrorMessage.textContent = '';
        upscaleProgressContainer.classList.remove('hidden');
        setUpscaleBatchProgress(0, `Starting batch of ${imageFiles.length}…`);
        setUpscaleImageProgress(0, 'Preparing…');
        showStatus(upscaleStatus, 'Upscaling with bicubic…', false, true);

        const zip = new JSZip();
        const format = upscaleFormatSelect.value;
        const quality = parseInt(upscaleQualitySlider.value, 10) / 100;
        const ext = getFileExtension(format);
        const prefix = upscalePrefixInput.value || '';
        const suffix = upscaleSuffixInput.value || '';
        const applyTitles = upscaleApplyTitlesToggle.checked;
        const useSubfolders = upscaleUseSubfoldersToggle.checked;

        let processed = 0;
        let failed = 0;

        try {
            for (let i = 0; i < imageFiles.length; i++) {
                if (upscaleCancelRequested) break;

                const title = imageTitles[i] || imageFiles[i].name;
                upscaleImageLabel.textContent = `Image ${i + 1} of ${imageFiles.length}`;
                setUpscaleBatchProgress(
                    (processed / imageFiles.length) * 100,
                    `Processing ${i + 1}/${imageFiles.length}: ${title}`
                );
                setUpscaleImageProgress(0, 'Loading…');
                await yieldToUI();

                try {
                    const sourceOptions = getTitleOptionsFromUI();
                    sourceOptions.addTitle = applyTitles;
                    const sourceImage = await getProcessedImage(imageFiles[i], imageTitles[i], sourceOptions, i);

                    const target = computeUpscaleTargetSize(sourceImage.width, sourceImage.height);
                    setUpscaleImageProgress(
                        3,
                        `Bicubic → ${target.appliedW} × ${target.appliedH}` +
                        (target.clamped ? ' (clamped)' : '')
                    );
                    await yieldToUI();

                    const upscaled = await resizeImageBicubicWithProgress(
                        sourceImage,
                        target.appliedW,
                        target.appliedH,
                        (p) => {
                            const pct = Math.round(p * 100);
                            setUpscaleImageProgress(
                                pct,
                                pct < 100
                                    ? `Upscaling rows… ${pct}%`
                                    : 'Encoding…'
                            );
                            const overall = ((processed + p) / imageFiles.length) * 100;
                            setUpscaleBatchProgress(
                                overall,
                                `Processing ${i + 1}/${imageFiles.length}: ${title} (${pct}%)`
                            );
                        }
                    );

                    if (upscaleCancelRequested) break;

                    setUpscaleImageProgress(97, 'Creating file…');
                    await yieldToUI();
                    const blob = await new Promise((resolve, reject) => {
                        upscaled.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to encode image'))), format, quality);
                    });

                    let baseName = imageTitles[i];
                    baseName = applySpacing(baseName, upscaleSpacingSelect.value);
                    const finalName = `${prefix}${baseName}${suffix}${ext}`;

                    if (useSubfolders && imageFolders[i] !== '(Root)') {
                        zip.folder(imageFolders[i]).file(finalName, blob);
                    } else {
                        zip.file(finalName, blob);
                    }

                    processed++;
                    setUpscaleImageProgress(100, `Done — ${target.appliedW} × ${target.appliedH}`);
                    setUpscaleBatchProgress(
                        (processed / imageFiles.length) * 100,
                        `Finished ${processed}/${imageFiles.length}`
                    );
                } catch (imgErr) {
                    if (imgErr.message === 'Cancelled') throw imgErr;
                    failed++;
                    processed++;
                    console.error(`Upscale failed for ${imageFiles[i].name}:`, imgErr);
                    setUpscaleImageProgress(100, `Failed: ${imgErr.message}`);
                    setUpscaleBatchProgress(
                        (processed / imageFiles.length) * 100,
                        `Finished ${processed}/${imageFiles.length} (${failed} failed)`
                    );
                }
            }

            if (upscaleCancelRequested) {
                const ok = processed - failed;
                showStatus(upscaleStatus, `Cancelled after ${ok} image(s). Partial ZIP not downloaded.`, true);
                setUpscaleBatchProgress(
                    (processed / imageFiles.length) * 100,
                    `Cancelled — ${processed}/${imageFiles.length} processed`
                );
            } else {
                setUpscaleBatchProgress(100, 'Building ZIP…');
                setUpscaleImageProgress(100, 'Packaging download…');
                await yieldToUI();

                const zipBlob = await zip.generateAsync(
                    { type: 'blob', streamFiles: true },
                    (meta) => {
                        const pct = Math.round(meta.percent || 0);
                        setUpscaleImageProgress(pct, `Zipping… ${pct}%`);
                    }
                );

                const link = document.createElement('a');
                link.href = URL.createObjectURL(zipBlob);
                link.download = 'batch_upscaled_images.zip';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);

                const ok = processed - failed;
                const msg = failed
                    ? `Download started — ${ok} ok, ${failed} failed.`
                    : `Download started! Upscaled ${ok} image(s).`;
                showStatus(upscaleStatus, msg, failed > 0, false);
                setUpscaleBatchProgress(100, 'Complete');
                setUpscaleImageProgress(100, 'ZIP ready');
            }
        } catch (error) {
            console.error('DEBUG: Upscale Error', error);
            if (error.message === 'Cancelled') {
                showStatus(upscaleStatus, 'Cancelled.', true);
            } else {
                showStatus(upscaleErrorMessage, error.message, true);
                showStatus(upscaleStatus, 'Upscale failed.', true);
            }
        } finally {
            upscaleRunning = false;
            upscaleCancelRequested = false;
            upscaleGenerateBtn.disabled = false;
            upscaleGenerateBtn.textContent = 'Upscale & Download ZIP';
            upscaleCancelBtn.classList.add('hidden');
            upscaleCancelBtn.disabled = false;
            upscaleCancelBtn.textContent = 'Cancel';
            // Remove spinner from status if present
            const loader = upscaleStatus.parentElement.querySelector('.loader-container');
            if (loader) loader.remove();
        }
    }

    // --- Match Overall Colour Feature ---
    function openColourMatchModal() {
        document.body.classList.add('popup-open');
        colourMatchPopup.classList.remove('hidden');
        updateColourMatchLabels();
        updateColourComparisonSlider();
        syncColourComparisonCanvasSize();
    }

    function closeColourMatchModal() {
        document.body.classList.remove('popup-open');
        colourMatchPopup.classList.add('hidden');
    }

    async function handleColourReferenceUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            colourReferenceFile = file;
            colourReferenceImage = await loadImage(file);
            colourReferenceName.textContent = file.name;
            colourTransferStats = null;
            drawImageToPreviewCanvas(colourReferenceCanvas, colourReferenceImage);
            scheduleColourMatchPreview();
        } catch (error) {
            showStatus(colourMatchStatus, `Could not load reference image: ${error.message}`, true);
        }
    }

    async function handleColourTargetUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            colourTargetFile = file;
            colourTargetImage = await loadImage(file);
            colourTargetName.textContent = file.name;
            colourTransferStats = null;
            drawImageToPreviewCanvas(colourTargetCanvas, colourTargetImage);
            drawImageToPreviewCanvas(colourBeforeCanvas, colourTargetImage);
            colourMatchDownloadBtn.disabled = true;
            colourMatchSendBtn.disabled = true;
            scheduleColourMatchPreview();
        } catch (error) {
            showStatus(colourMatchStatus, `Could not load target image: ${error.message}`, true);
        }
    }

    function drawImageToPreviewCanvas(canvas, img, maxDim = 900) {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }

    function getColourMatchControls() {
        return {
            strength: parseInt(colourStrengthSlider.value, 10) / 100,
            brightness: parseInt(colourBrightnessSlider.value, 10),
            contrast: parseInt(colourContrastSlider.value, 10),
            saturation: parseInt(colourSaturationSlider.value, 10),
            temperature: parseInt(colourTemperatureSlider.value, 10),
            tint: parseInt(colourTintSlider.value, 10),
            gamma: parseFloat(colourGammaSlider.value)
        };
    }

    function updateColourMatchLabels() {
        colourStrengthValue.textContent = colourStrengthSlider.value;
        colourBrightnessValue.textContent = colourBrightnessSlider.value;
        colourContrastValue.textContent = colourContrastSlider.value;
        colourSaturationValue.textContent = colourSaturationSlider.value;
        colourTemperatureValue.textContent = colourTemperatureSlider.value;
        colourTintValue.textContent = colourTintSlider.value;
        colourGammaValue.textContent = Number(colourGammaSlider.value).toFixed(2);
    }

    function resetColourMatchControls() {
        colourStrengthSlider.value = 80;
        colourBrightnessSlider.value = 0;
        colourContrastSlider.value = 0;
        colourSaturationSlider.value = 0;
        colourTemperatureSlider.value = 0;
        colourTintSlider.value = 0;
        colourGammaSlider.value = 1;
        updateColourMatchLabels();
        scheduleColourMatchPreview();
    }

    function scheduleColourMatchPreview() {
        if (!colourReferenceImage || !colourTargetImage) {
            colourMatchStatus.textContent = 'Upload a reference and target image to begin.';
            colourMatchStatus.classList.remove('hidden');
            return;
        }

        clearTimeout(colourMatchPreviewTimer);
        colourMatchPreviewTimer = setTimeout(() => {
            runColourMatchPreview();
        }, 120);
    }

    async function runColourMatchPreview() {
        if (!colourReferenceImage || !colourTargetImage) return;

        const token = ++colourMatchRunToken;
        colourMatchDownloadBtn.disabled = true;
        colourMatchSendBtn.disabled = true;
        setColourMatchProgress(5, 'Analysing colour...');
        showStatus(colourMatchStatus, 'Analysing reference and target colour...', false);

        try {
            if (!colourTransferStats) {
                colourTransferStats = buildLabHistogramMaps(colourReferenceImage, colourTargetImage, 520);
            }

            const scale = Math.min(1, 900 / Math.max(colourTargetImage.width, colourTargetImage.height));
            const width = Math.max(1, Math.round(colourTargetImage.width * scale));
            const height = Math.max(1, Math.round(colourTargetImage.height * scale));

            drawImageToSizedCanvas(colourTargetCanvas, colourTargetImage, width, height);

            const completed = await processColourMatchedImage(
                colourTargetImage,
                colourOutputCanvas,
                width,
                height,
                colourTransferStats,
                getColourMatchControls(),
                token,
                (percent) => setColourMatchProgress(percent, 'Generating corrected preview...')
            );

            if (!completed || token !== colourMatchRunToken) return;
            copyCanvas(colourOutputCanvas, colourBeforeCanvas);
            drawImageToSizedCanvas(colourAfterCanvas, colourReferenceImage, width, height);
            syncColourComparisonCanvasSize();
            updateColourComparisonSlider();
            colourMatchDownloadBtn.disabled = false;
            colourMatchSendBtn.disabled = false;
            setColourMatchProgress(100, 'Preview ready');
            showStatus(colourMatchStatus, 'Corrected preview ready. Download preserves the target image resolution.', false);
            setTimeout(() => colourMatchProgress.classList.add('hidden'), 600);
        } catch (error) {
            console.error('Colour match preview error:', error);
            showStatus(colourMatchStatus, `Error: ${error.message}`, true);
            colourMatchProgress.classList.add('hidden');
        }
    }

    async function getColourMatchedExportBlob(token, onProgress) {
        if (!colourReferenceImage || !colourTargetImage || !colourTargetFile) return null;

        if (!colourTransferStats) {
            colourTransferStats = buildLabHistogramMaps(colourReferenceImage, colourTargetImage, 520);
        }

        const exportCanvas = document.createElement('canvas');
        const completed = await processColourMatchedImage(
            colourTargetImage,
            exportCanvas,
            colourTargetImage.width,
            colourTargetImage.height,
            colourTransferStats,
            getColourMatchControls(),
            token,
            onProgress
        );

        if (!completed || token !== colourMatchRunToken) return null;

        const format = colourMatchFormatSelect.value;
        const quality = format === 'image/jpeg' ? 0.95 : undefined;
        const blob = await new Promise(resolve => exportCanvas.toBlob(resolve, format, quality));
        if (!blob) throw new Error('Could not generate corrected image.');

        const baseName = colourTargetFile.name.replace(/\.[^/.]+$/, '') || 'corrected_target';
        const ext = getFileExtension(format);

        return {
            blob,
            format,
            fileName: `${baseName}_colour_matched${ext}`
        };
    }

    function setColourMatchActionButtonsDisabled(disabled) {
        colourMatchDownloadBtn.disabled = disabled;
        colourMatchSendBtn.disabled = disabled;
    }

    async function handleColourMatchDownload() {
        if (!colourReferenceImage || !colourTargetImage || !colourTargetFile) return;

        const token = ++colourMatchRunToken;
        setColourMatchActionButtonsDisabled(true);
        colourMatchDownloadBtn.textContent = 'Processing...';
        setColourMatchProgress(5, 'Processing full resolution...');
        showStatus(colourMatchStatus, 'Processing full-resolution target image...', false);

        try {
            const exportResult = await getColourMatchedExportBlob(
                token,
                (percent) => setColourMatchProgress(percent, 'Processing full resolution...')
            );
            if (!exportResult) return;

            await safeDownload(exportResult.blob, exportResult.fileName);
            setColourMatchProgress(100, 'Download ready');
            showStatus(colourMatchStatus, 'Download started.', false);
        } catch (error) {
            console.error('Colour match download error:', error);
            showStatus(colourMatchStatus, `Error: ${error.message}`, true);
        } finally {
            colourMatchDownloadBtn.textContent = 'Download Corrected Image';
            setColourMatchActionButtonsDisabled(false);
            setTimeout(() => colourMatchProgress.classList.add('hidden'), 800);
        }
    }

    async function handleColourMatchSendToManager() {
        if (!colourReferenceImage || !colourTargetImage || !colourTargetFile) return;

        const token = ++colourMatchRunToken;
        setColourMatchActionButtonsDisabled(true);
        colourMatchSendBtn.textContent = 'Adding...';
        setColourMatchProgress(5, 'Preparing image for manager...');
        showStatus(colourMatchStatus, 'Adding corrected image to the batch manager...', false);

        try {
            const exportResult = await getColourMatchedExportBlob(
                token,
                (percent) => setColourMatchProgress(percent, 'Preparing image for manager...')
            );
            if (!exportResult) return;

            const file = new File([exportResult.blob], exportResult.fileName, { type: exportResult.format });
            imageFiles.push(file);
            originalImageFiles.push(file);
            imageTitles.push(formatTitle(exportResult.fileName));
            imageFolders.push("(Root)");

            currentIndex = imageFiles.length - 1;
            setupEditor();
            updateUIForCurrentIndex();

            setColourMatchProgress(100, 'Added to manager');
            showStatus(colourMatchStatus, `Added "${exportResult.fileName}" to the image manager.`, false);
            showStatus(uploadStatus, `Added "${exportResult.fileName}" from colour match.`, false);
            closeColourMatchModal();
            editorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (error) {
            console.error('Colour match send error:', error);
            showStatus(colourMatchStatus, `Error: ${error.message}`, true);
        } finally {
            colourMatchSendBtn.textContent = 'Send to Image Manager';
            setColourMatchActionButtonsDisabled(false);
            setTimeout(() => colourMatchProgress.classList.add('hidden'), 800);
        }
    }

    function setColourMatchProgress(percent, message) {
        const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
        colourMatchProgress.classList.remove('hidden');
        colourMatchProgressStatus.textContent = message;
        colourMatchProgressPercent.textContent = `${clampedPercent}%`;
        colourMatchProgressBar.style.width = `${clampedPercent}%`;
    }

    function updateColourComparisonSlider() {
        const value = colourComparisonSlider.value;
        colourComparisonValue.textContent = `${value}% reference`;
        colourAfterLayer.style.width = `${value}%`;
    }

    function setColourComparisonFromPointer(clientX) {
        const rect = colourComparisonFrame.getBoundingClientRect();
        if (!rect.width) return;
        const percent = Math.round(clamp(((clientX - rect.left) / rect.width) * 100, 0, 100));
        colourComparisonSlider.value = percent;
        updateColourComparisonSlider();
    }

    function handleColourComparisonHover(e) {
        setColourComparisonFromPointer(e.clientX);
    }

    function handleColourComparisonTouch(e) {
        if (!e.touches.length) return;
        setColourComparisonFromPointer(e.touches[0].clientX);
        e.preventDefault();
    }

    function syncColourComparisonCanvasSize() {
        const rect = colourBeforeCanvas.getBoundingClientRect();
        if (!rect.width) return;
        colourAfterCanvas.style.width = `${rect.width}px`;
        colourAfterCanvas.style.height = `${rect.height}px`;
    }

    function drawImageToSizedCanvas(canvas, img, width, height) {
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
    }

    function copyCanvas(sourceCanvas, targetCanvas) {
        targetCanvas.width = sourceCanvas.width;
        targetCanvas.height = sourceCanvas.height;
        const ctx = targetCanvas.getContext('2d');
        ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
        ctx.drawImage(sourceCanvas, 0, 0);
    }

    function buildLabHistogramMaps(referenceImg, targetImg, maxDim = 520) {
        const referenceHistograms = computeLabHistograms(referenceImg, maxDim);
        const targetHistograms = computeLabHistograms(targetImg, maxDim);
        return {
            maps: [
                buildHistogramMatchMap(targetHistograms[0], referenceHistograms[0]),
                buildHistogramMatchMap(targetHistograms[1], referenceHistograms[1]),
                buildHistogramMatchMap(targetHistograms[2], referenceHistograms[2])
            ]
        };
    }

    function computeLabHistograms(img, maxDim = 520) {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        const histograms = [
            new Uint32Array(256),
            new Uint32Array(256),
            new Uint32Array(256)
        ];

        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) continue;
            const lab = rgbToLab(data[i], data[i + 1], data[i + 2]);
            histograms[0][labToHistogramBin(lab[0], 0)]++;
            histograms[1][labToHistogramBin(lab[1], 1)]++;
            histograms[2][labToHistogramBin(lab[2], 2)]++;
        }

        return histograms;
    }

    function buildHistogramMatchMap(sourceHistogram, referenceHistogram) {
        const sourceCdf = histogramToCdf(sourceHistogram);
        const referenceCdf = histogramToCdf(referenceHistogram);
        const map = new Uint8Array(256);
        let referenceIndex = 0;

        for (let sourceIndex = 0; sourceIndex < 256; sourceIndex++) {
            while (referenceIndex < 255 && referenceCdf[referenceIndex] < sourceCdf[sourceIndex]) {
                referenceIndex++;
            }
            map[sourceIndex] = referenceIndex;
        }

        return map;
    }

    function histogramToCdf(histogram) {
        const total = histogram.reduce((sum, value) => sum + value, 0) || 1;
        const cdf = new Float32Array(256);
        let cumulative = 0;

        for (let i = 0; i < histogram.length; i++) {
            cumulative += histogram[i];
            cdf[i] = cumulative / total;
        }

        return cdf;
    }

    function labToHistogramBin(value, channel) {
        if (channel === 0) {
            return clampChannel((clamp(value, 0, 100) / 100) * 255);
        }
        return clampChannel(((clamp(value, -128, 127) + 128) / 255) * 255);
    }

    function histogramBinToLab(bin, channel) {
        if (channel === 0) {
            return (bin / 255) * 100;
        }
        return (bin / 255) * 255 - 128;
    }

    async function processColourMatchedImage(img, canvas, width, height, stats, controls, token, onProgress) {
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const maps = stats.maps;
        const chunkRows = Math.max(8, Math.floor(450000 / Math.max(width, 1)));

        for (let y = 0; y < height; y++) {
            const rowStart = y * width * 4;
            const rowEnd = rowStart + width * 4;

            for (let i = rowStart; i < rowEnd; i += 4) {
                if (data[i + 3] === 0) continue;

                const originalLab = rgbToLab(data[i], data[i + 1], data[i + 2]);
                const bins = [
                    labToHistogramBin(originalLab[0], 0),
                    labToHistogramBin(originalLab[1], 1),
                    labToHistogramBin(originalLab[2], 2)
                ];
                const matchedLab = [
                    histogramBinToLab(maps[0][bins[0]], 0),
                    histogramBinToLab(maps[1][bins[1]], 1),
                    histogramBinToLab(maps[2][bins[2]], 2)
                ];

                const blendedLab = [
                    lerp(originalLab[0], matchedLab[0], controls.strength),
                    lerp(originalLab[1], matchedLab[1], controls.strength),
                    lerp(originalLab[2], matchedLab[2], controls.strength)
                ];

                let [r, g, b] = labToRgb(blendedLab[0], blendedLab[1], blendedLab[2]);
                [r, g, b] = applyManualColourControls(r, g, b, controls);

                data[i] = clampChannel(r);
                data[i + 1] = clampChannel(g);
                data[i + 2] = clampChannel(b);
            }

            if (y % chunkRows === 0) {
                if (token !== colourMatchRunToken) return false;
                onProgress?.(10 + ((y / height) * 88));
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        }

        ctx.putImageData(imageData, 0, 0);
        onProgress?.(100);
        return token === colourMatchRunToken;
    }

    function applyManualColourControls(r, g, b, controls) {
        const contrastFactor = (259 * (controls.contrast + 255)) / (255 * (259 - controls.contrast));
        r = contrastFactor * (r - 128) + 128 + (controls.brightness * 1.2);
        g = contrastFactor * (g - 128) + 128 + (controls.brightness * 1.2);
        b = contrastFactor * (b - 128) + 128 + (controls.brightness * 1.2);

        r += controls.temperature * 0.45;
        b -= controls.temperature * 0.45;
        r += controls.tint * 0.22;
        b += controls.tint * 0.22;
        g -= controls.tint * 0.35;

        const saturationFactor = 1 + (controls.saturation / 100);
        const gray = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
        r = gray + ((r - gray) * saturationFactor);
        g = gray + ((g - gray) * saturationFactor);
        b = gray + ((b - gray) * saturationFactor);

        if (controls.gamma !== 1) {
            r = 255 * Math.pow(clamp(r, 0, 255) / 255, 1 / controls.gamma);
            g = 255 * Math.pow(clamp(g, 0, 255) / 255, 1 / controls.gamma);
            b = 255 * Math.pow(clamp(b, 0, 255) / 255, 1 / controls.gamma);
        }

        return [r, g, b];
    }

    function rgbToLab(r, g, b) {
        let x;
        let y;
        let z;

        r = srgbToLinear(r / 255);
        g = srgbToLinear(g / 255);
        b = srgbToLinear(b / 255);

        x = (r * 0.4124564) + (g * 0.3575761) + (b * 0.1804375);
        y = (r * 0.2126729) + (g * 0.7151522) + (b * 0.0721750);
        z = (r * 0.0193339) + (g * 0.1191920) + (b * 0.9503041);

        x /= 0.95047;
        z /= 1.08883;

        x = xyzToLabPivot(x);
        y = xyzToLabPivot(y);
        z = xyzToLabPivot(z);

        return [
            (116 * y) - 16,
            500 * (x - y),
            200 * (y - z)
        ];
    }

    function labToRgb(l, a, b) {
        let y = (l + 16) / 116;
        let x = a / 500 + y;
        let z = y - b / 200;

        x = labToXyzPivot(x) * 0.95047;
        y = labToXyzPivot(y);
        z = labToXyzPivot(z) * 1.08883;

        let r = (x * 3.2404542) + (y * -1.5371385) + (z * -0.4985314);
        let g = (x * -0.9692660) + (y * 1.8760108) + (z * 0.0415560);
        let blue = (x * 0.0556434) + (y * -0.2040259) + (z * 1.0572252);

        r = linearToSrgb(r) * 255;
        g = linearToSrgb(g) * 255;
        blue = linearToSrgb(blue) * 255;

        return [r, g, blue];
    }

    function srgbToLinear(value) {
        return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    }

    function linearToSrgb(value) {
        value = clamp(value, 0, 1);
        return value <= 0.0031308 ? value * 12.92 : (1.055 * Math.pow(value, 1 / 2.4)) - 0.055;
    }

    function xyzToLabPivot(value) {
        return value > 0.008856 ? Math.cbrt(value) : (7.787 * value) + (16 / 116);
    }

    function labToXyzPivot(value) {
        const valueCubed = value * value * value;
        return valueCubed > 0.008856 ? valueCubed : (value - 16 / 116) / 7.787;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function clampChannel(value) {
        return Math.max(0, Math.min(255, Math.round(value)));
    }

    function lerp(start, end, amount) {
        return start + ((end - start) * amount);
    }

    // --- Helpers ---

    function getTitleOptionsFromUI() {
        return {
            addTitle: addTitleToggle.checked,
            mode: titleModeSelect.value,
            fontSize: parseInt(fontSizeSlider.value, 10),
            textColor: textColorPicker.value,
            headerHeight: parseInt(headerHeightSlider.value, 10),
            bgColor: bgColorPicker.value,
            position: positionToggle.checked ? 'below' : 'above',
            textYPercent: parseInt(textPositionSlider.value, 10),
            textOffset: parseInt(textOffsetSlider.value, 10),
            autoScale: autoScaleToggle.checked,
            relativeSize: relativeSizeToggle.checked,
            addNumbers: addNumbersToggle.checked,
            numberCorner: numberCornerSelect.value,
            numberOffset: parseInt(numberOffsetSlider.value, 10),
            numberSize: parseInt(numberSizeSlider.value, 10),
            numberStart: parseInt(numberStartInput.value, 10) || 1,
            numberColor: numberColorPicker.value,
            addPadding: addPaddingToggle.checked,
            fitAspect: fitAspectToggle.checked,
            paddingMode: paddingModeSelect.value,
            paddingAmount: paddingModeSelect.value === 'relative'
                ? (parseFloat(paddingPercentInput.value) || 0)
                : (parseFloat(paddingPxInput.value) || 0),
            paddingAspect: paddingAspectSelect.value,
            paddingAspectW: parseFloat(paddingAspectWInput.value) || 1,
            paddingAspectH: parseFloat(paddingAspectHInput.value) || 1,
            paddingColor: paddingColorPicker.value,
            paddingAlpha: paddingAlphaToggle.checked,
            paddingFlatten: (paddingAlphaToggle.checked || squircleToggle.checked) && !formatSupportsAlpha(exportFormatSelect.value),
            fillAlphaBackground: fillAlphaToggle.checked,
            alphaBackgroundColor: fillAlphaColorPicker.value,
            addSquircle: squircleToggle.checked,
            squircleShape: squircleShapeSelect.value,
            squircleColor: squircleColorPicker.value,
            squircleInnerPad: parseFloat(squircleInnerSlider.value) || 0,
            squircleOuterPad: parseFloat(squircleOuterSlider.value) || 0,
            adjustments: getImageAdjustmentsFromUI()
        };
    }

    async function getProcessedImage(file, title, options, sequenceIndex = 0) {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        await drawImageWithTitle(tempCtx, file, title, options, sequenceIndex);
        const finalImage = new Image();
        finalImage.src = tempCanvas.toDataURL();
        await new Promise(r => finalImage.onload = r);
        return finalImage;
    }

    function getFilteredImageIndices(source) {
        if (source === "All Images") return imageFiles.map((_, index) => index);
        return imageFolders.map((folder, index) => (folder === source ? index : -1)).filter(index => index !== -1);
    }

    async function loadImage(file) {
        const drawableFile = await prepareFileForCanvas(file);
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Could not load image ${file.name}`));
            img.src = URL.createObjectURL(drawableFile);
        });
    }

    function applySpacing(text, mode) {
        if (!text) return "";
        switch (mode) {
            case 'underscores':
                return text.replace(/\s+/g, '_').replace(/-+/g, '_');
            case 'hyphens':
                return text.replace(/\s+/g, '-').replace(/_+/g, '-');
            case 'spaces':
                return text.replace(/_+/g, ' ').replace(/-+/g, ' ');
            default:
                return text;
        }
    }

    function generateFilename(index, originalName, ext) {
        const mode = filenameModeSelect.value;
        const spacingMode = filenameSpacingSelect.value;
        let finalBase = "";

        if (mode === 'sequential') {
            const base = filenameBaseInput.value || "Image";
            const startNum = parseInt(filenameStartNumInput.value, 10) || 0;
            const padding = parseInt(filenamePaddingInput.value, 10) || 1;
            const numStr = (startNum + index).toString().padStart(padding, '0');
            finalBase = `${base}_${numStr}`;
        } else {
            const prefix = filenamePrefixInput.value || "";
            const suffix = filenameSuffixInput.value || "";
            finalBase = `${prefix}${originalName}${suffix}`;
        }

        return applySpacing(finalBase, spacingMode) + ext;
    }

    function updateNamingUI() {
        const mode = filenameModeSelect.value;
        namingOriginalInputs.classList.toggle('hidden', mode !== 'original');
        namingSequentialInputs.classList.toggle('hidden', mode !== 'sequential');

        // Update example
        const format = exportFormatSelect.value;
        const sampleFile = imageFiles[0] || { name: 'icon.svg' };
        const ext = getFileExtension(format, sampleFile);
        const exampleName = generateFilename(0, "Image Name", ext);
        const passthroughHint = isPassthroughExportFormat(format)
            ? ' — keeps original file bytes (ideal for SVG rename)'
            : '';
        namingExampleText.textContent = `Example: ${exampleName}${passthroughHint}`;
    }

    // --- Batch Fast Crop Logic ---
    async function openCropModal() {
        if (imageFiles.length === 0) {
            alert("No images loaded to crop.");
            return;
        }
        isCropMode = true;
        cropIndex = currentIndex; // Start from current image
        cropAppliedOnLast = false;
        document.body.classList.add('popup-open');
        cropPopup.classList.remove('hidden');
        await loadCropImage(cropIndex);
    }

    function closeCropModal() {
        isCropMode = false;
        document.body.classList.remove('popup-open');
        cropPopup.classList.add('hidden');
        updateUIForCurrentIndex(); // Ensure main UI stays in sync
    }

    async function loadCropImage(index) {
        const isLast = index === imageFiles.length - 1;
        cropProgressText.textContent = `Image ${index + 1} of ${imageFiles.length}`;
        if (isLast && cropAppliedOnLast) {
            cropProgressText.textContent += ' — click Confirm & Finish when ready';
        }
        try {
            const sourceFile = (isLast && cropAppliedOnLast) ? imageFiles[index] : originalImageFiles[index];
            activeCropImage = await loadImage(sourceFile);
            resizeCropCanvas();
            renderCropUI();
            updateCropNavigationUI();
        } catch (err) {
            console.error(err);
        }
    }

    function updateCropNavigationUI() {
        const isSingleImage = imageFiles.length === 1;
        const isLast = cropIndex === imageFiles.length - 1;
        cropBackBtn.classList.toggle('hidden', isSingleImage);
        cropUndoBtn.classList.toggle('hidden', !(isSingleImage && cropAppliedOnLast));
        cropSkipBtn.textContent = isLast ? 'Skip & Finish' : 'Skip Current →';
        if (isLast && cropAppliedOnLast) {
            cropFinishBtn.textContent = 'Confirm & Finish';
        } else if (isLast) {
            cropFinishBtn.textContent = 'Finish Without Crop';
        } else {
            cropFinishBtn.textContent = 'Done';
        }
    }

    function undoCropOnCurrent() {
        imageFiles[cropIndex] = originalImageFiles[cropIndex];
        cropAppliedOnLast = false;
        cropStart = { x: 0, y: 0 };
        cropEnd = { x: 0, y: 0 };
        loadCropImage(cropIndex);
    }

    function handleCropFinish() {
        closeCropModal();
        showStatus(exportStatus, 'Batch cropping complete!', false);
    }

    function resizeCropCanvas() {
        // Set canvas to occupy most of the container
        const containerRect = cropInterfaceContainer.getBoundingClientRect();
        const padding = 20;
        const maxWidth = containerRect.width - padding;
        const maxHeight = containerRect.height - padding;

        const imgRatio = activeCropImage.width / activeCropImage.height;
        const containerRatio = maxWidth / maxHeight;

        if (imgRatio > containerRatio) {
            cropCanvas.width = maxWidth;
            cropCanvas.height = maxWidth / imgRatio;
        } else {
            cropCanvas.height = maxHeight;
            cropCanvas.width = maxHeight * imgRatio;
        }

        cropDisplayScale = cropCanvas.width / activeCropImage.width;
        // Since we center it in container using Flexbox, offset is just (0,0) relative to canvas
        cropOffset = { x: 0, y: 0 };
    }

    function renderCropUI() {
        if (!activeCropImage) return;

        // Draw Image
        cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
        cropCtx.drawImage(activeCropImage, 0, 0, cropCanvas.width, cropCanvas.height);

        // Draw Selection Overlay
        if (isDraggingCrop || (cropStart.x !== cropEnd.x && cropStart.y !== cropEnd.y)) {
            // Darken outside
            cropCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            
            const x = Math.min(cropStart.x, cropEnd.x);
            const y = Math.min(cropStart.y, cropEnd.y);
            const w = Math.abs(cropStart.x - cropEnd.x);
            const h = Math.abs(cropStart.y - cropEnd.y);

            // top
            cropCtx.fillRect(0, 0, cropCanvas.width, y);
            // bottom
            cropCtx.fillRect(0, y + h, cropCanvas.width, cropCanvas.height - (y + h));
            // left
            cropCtx.fillRect(0, y, x, h);
            // right
            cropCtx.fillRect(x + w, y, cropCanvas.width - (x + w), h);

            // Selection Border
            cropCtx.strokeStyle = 'var(--accent-cyan)';
            cropCtx.lineWidth = 2;
            cropCtx.setLineDash([5, 5]);
            cropCtx.strokeRect(x, y, w, h);
            cropCtx.setLineDash([]);
            
            // Corner handles (purely visual)
            cropCtx.fillStyle = 'var(--accent-cyan)';
            const sz = 6;
            cropCtx.fillRect(x - sz/2, y - sz/2, sz, sz);
            cropCtx.fillRect(x + w - sz/2, y - sz/2, sz, sz);
            cropCtx.fillRect(x - sz/2, y + h - sz/2, sz, sz);
            cropCtx.fillRect(x + w - sz/2, y + h - sz/2, sz, sz);
        }
    }

    function handleCropMouseDown(e) {
        const rect = cropCanvas.getBoundingClientRect();
        cropStart.x = e.clientX - rect.left;
        cropStart.y = e.clientY - rect.top;
        cropEnd.x = cropStart.x;
        cropEnd.y = cropStart.y;
        isDraggingCrop = true;
    }

    function handleCropMouseMove(e) {
        if (!isDraggingCrop) return;
        const rect = cropCanvas.getBoundingClientRect();
        let curX = e.clientX - rect.left;
        let curY = e.clientY - rect.top;

        // Constrain to canvas
        curX = Math.max(0, Math.min(curX, cropCanvas.width));
        curY = Math.max(0, Math.min(curY, cropCanvas.height));

        const aspect = cropAspectRatioSelect.value;
        if (aspect !== 'free') {
            const [ratioW, ratioH] = aspect.split(':').map(Number);
            const targetRatio = ratioW / ratioH;
            
            let dx = curX - cropStart.x;
            let dy = curY - cropStart.y;
            
            // Maintain ratio based on largest movement
            if (Math.abs(dx) / targetRatio > Math.abs(dy)) {
                dy = Math.sign(dy) * Math.abs(dx) / targetRatio;
            } else {
                dx = Math.sign(dx) * Math.abs(dy) * targetRatio;
            }
            
            curX = cropStart.x + dx;
            curY = cropStart.y + dy;

            // Re-constrain after ratio adjustment
            if (curX < 0 || curX > cropCanvas.width || curY < 0 || curY > cropCanvas.height) {
                // If out of bounds, scale back until inside
                const scaleX = curX < 0 ? (cropStart.x / Math.abs(dx)) : (curX > cropCanvas.width ? (cropCanvas.width - cropStart.x) / Math.abs(dx) : 1);
                const scaleY = curY < 0 ? (cropStart.y / Math.abs(dy)) : (curY > cropCanvas.height ? (cropCanvas.height - cropStart.y) / Math.abs(dy) : 1);
                const minScale = Math.min(scaleX, scaleY);
                curX = cropStart.x + dx * minScale;
                curY = cropStart.y + dy * minScale;
            }
        }

        cropEnd.x = curX;
        cropEnd.y = curY;
        renderCropUI();
    }

    async function handleCropMouseUp() {
        if (!isDraggingCrop) return;
        isDraggingCrop = false;

        const w = Math.abs(cropStart.x - cropEnd.x);
        const h = Math.abs(cropStart.y - cropEnd.y);

        // Min size threshold to prevent accidental clicks
        if (w > 10 && h > 10) {
            await applyCrop(cropIndex);
            if (cropIndex < imageFiles.length - 1) {
                navigateCropNext();
            } else {
                cropAppliedOnLast = true;
                await loadCropImage(cropIndex);
            }
        } else {
            // Reset selection on accidental click
            cropStart = { x: 0, y: 0 };
            cropEnd = { x: 0, y: 0 };
            renderCropUI();
        }
    }

    async function applyCrop(index) {
        const x = Math.min(cropStart.x, cropEnd.x) / cropDisplayScale;
        const y = Math.min(cropStart.y, cropEnd.y) / cropDisplayScale;
        const w = Math.abs(cropStart.x - cropEnd.x) / cropDisplayScale;
        const h = Math.abs(cropStart.y - cropEnd.y) / cropDisplayScale;

        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = w;
        offscreenCanvas.height = h;
        const octx = offscreenCanvas.getContext('2d');

        octx.drawImage(activeCropImage, x, y, w, h, 0, 0, w, h);

        const format = exportFormatSelect.value;
        const quality = parseInt(mainQualitySlider.value, 10) / 100;
        const blob = await new Promise(resolve => offscreenCanvas.toBlob(resolve, format, quality));
        
        const originalFile = imageFiles[index];
        const newFile = new File([blob], originalFile.name, { type: format });
        
        // Update state
        imageFiles[index] = newFile;
        
        // Reset selection for next image
        cropStart = { x: 0, y: 0 };
        cropEnd = { x: 0, y: 0 };
    }

    function navigateCropNext() {
        if (cropIndex < imageFiles.length - 1) {
            cropIndex++;
            cropAppliedOnLast = false;
            loadCropImage(cropIndex);
        } else {
            closeCropModal();
            showStatus(exportStatus, "Batch cropping complete!", false);
        }
    }

    function navigateCropPrev() {
        if (cropIndex > 0) {
            cropIndex--;
            loadCropImage(cropIndex);
        }
    }
});