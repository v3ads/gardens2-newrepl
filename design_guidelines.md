# Design Guidelines: Node.js Backup Restoration Tool

## Design Approach
**Selected Approach:** Design System - Material Design  
**Justification:** Developer-focused utility application requiring clarity, efficiency, and familiar patterns. Material Design provides excellent file upload interactions and clear visual feedback.

## Core Design Elements

### A. Color Palette
**Dark Mode (Primary):**
- Background: 222 14% 12% (deep slate)
- Surface: 222 14% 16% (elevated cards)
- Primary: 217 91% 60% (trustworthy blue)
- Success: 142 71% 45% (file upload success)
- Text Primary: 0 0% 95%
- Text Secondary: 0 0% 65%

**Light Mode:**
- Background: 0 0% 98%
- Surface: 0 0% 100%
- Primary: 217 91% 50%
- Text Primary: 0 0% 15%

### B. Typography
**Font Stack:** Inter (Google Fonts)
- Headings: 600 weight, tight tracking
- Body: 400 weight, relaxed line-height (1.6)
- Code/Filenames: JetBrains Mono, 400 weight
- Sizes: text-sm (body), text-base (labels), text-2xl (headings)

### C. Layout System
**Spacing Units:** Tailwind primitives of 2, 4, 6, 8, 12, 16
- Container: max-w-4xl mx-auto
- Section padding: px-6 py-12
- Component gaps: gap-6 (standard), gap-4 (compact)
- Card padding: p-8

### D. Component Library

**Upload Zone (Hero Component):**
- Large dashed border dropzone (border-2 border-dashed)
- Centered upload icon (64px) with animation on drag-over
- Clear instructional text: "Drag and drop your backup file" with supported formats below
- Browse button as secondary action
- Visual feedback states: idle, drag-over, uploading, success, error

**File Browser Card:**
- Compact file list with icons indicating file types
- Filename (code font), size, and last modified columns
- Expandable folder structure with indent levels
- Search/filter input at top

**Progress Indicators:**
- Linear progress bar for upload/extraction
- Percentage and file name display
- Animated checkmark on completion

**Status Messages:**
- Toast notifications (top-right): success (green), error (red), info (blue)
- Inline validation messages below inputs
- Clear error states with actionable guidance

**Navigation:**
- Minimal top bar with project name and basic actions
- No complex navigation needed - single-page focus

### E. Animations
**Minimal & Purposeful:**
- Upload zone: Scale pulse on drag-over (scale-105)
- File extraction: Smooth height expansion for folder contents
- Success state: Checkmark draw animation (300ms)
- NO decorative or distracting animations

## Images
**No hero images needed.** This is a functional developer tool - icon-based visuals only:
- Large upload icon (cloud upload) in dropzone center
- File type icons (folder, .zip, .tar, .json icons) in file browser
- All icons from Heroicons via CDN

## Key Principles
- **Clarity First:** Every element serves a clear functional purpose
- **Immediate Feedback:** Visual confirmation for all user actions
- **Error Prevention:** Clear file type/size requirements upfront
- **Developer-Friendly:** Code font for filenames, clear file structure representation
- **Single-Task Focus:** Streamlined for upload → extract → verify workflow