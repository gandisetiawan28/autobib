# AutoBib UI/UX Theme & Design System

## Core Philosophy

The AutoBib extension utilizes a **Premium, Modern, and Seamless Design System** tailored for Microsoft Word's taskpane constraints. The styling focuses heavily on:

1. **Dynamic Highlighting & Feedback**: Elements should react physically (scale, glow) using buttery smooth `cubic-bezier` curves.
2. **Universal Motion Blur**: All elements appearing/disappearing (toast, dropdowns, chat bubbles, dialogs) MUST use motion blur (`filter: blur(...)`) during their transition to emulate an iOS/macOS premium feel.
3. **No Native OS Controls**: Native `<select>`, `<input type="checkbox">` are strictly banned. Use custom-styled components built in `components.css` and JS classes (e.g., `CustomDropdown`).

---

## 1. Core CSS Variables (`main.css`)

Always use these variables. **NEVER use hardcoded colors** (e.g., `#333`, `red`) unless for very specific un-themeable elements.

### Colors (Dark & Light Mode Aware)

- `--bg-base`: Background color for the absolute underlying layer.
- `--bg-surface`: Primary background for containers, headers, and standard blocks.
- `--bg-elevated`: Used for floating elements (dropdowns, cards, popups) to separate them from the surface.
- `--bg-hover`: Background for hover states on list items and buttons.
- `--bg-glass`: Used for elements needing backdrop filters.
- `--border`: Standard subtle borders.
- `--border-hover`: Slightly brighter borders for hovered elements.
- `--border-active`: Bright border for active or focused inputs.

### Typography & Text

- **Font**: Inter (`--font: 'Inter', -apple-system, sans-serif;`)
- `--text-primary`: Primary headings, titles, active text.
- `--text-secondary`: Body text, descriptions.
- `--text-muted`: Placeholder text, inactive tabs, subtle hints.

### Accents & Status Colors

- **Primary Accent**: `--accent` (Vibrant Indigo `#6366f1`). Used for primary buttons, active tabs, highlights.
- **Accent Utilities**: `--accent-hover`, `--accent-glow`, `--accent-light`.
- **Status Colors**: `--green`, `--yellow`, `--red` (and their `-light` equivalents for soft backgrounds).

### Layout & Sizing

- **Border Radii**:
  - `--radius-sm` (8px): Mini buttons, small inputs.
  - `--radius` (12px): Standard cards, toast notifications.
  - `--radius-lg` (16px): Large dialogs.
  - `--radius-full` (9999px): Pills, badges.
- **Shadows**:
  - `--shadow-sm`: Subtle elevation for sticky headers.
  - `--shadow`: Floating depth for dropdowns/popups.
  - `--shadow-glow`: Accent glow for focused items.

---

## 2. Animation & Transitions

**Standard Transition:**
`transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);`

**Universal Motion Blur Rule:**
When animating an element into view (e.g. `display: none` to visible), DO NOT just fade it in. You must scale, slide, and blur.

Example of standard IN/OUT animation:

```css
.premium-popup {
  opacity: 0;
  pointer-events: none;
  filter: blur(8px);
  transform: translateY(15px) scale(0.95);
  transition:
    opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
    filter 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.premium-popup.active {
  opacity: 1;
  pointer-events: all;
  filter: blur(0px);
  transform: translateY(0) scale(1);
}
```

---

## 3. UI Component Patterns

When building new UI, follow these pre-existing patterns in `components.css`:

1. **Buttons (`.btn`)**:
   - Add `.btn-primary` for the main action.
   - Add `.btn-outline` for secondary actions.
   - Buttons should scale down on `:active` (`transform: scale(0.95)`).

2. **Inputs (`.input-field`)**:
   - Inputs must have smooth focus transitions with `--shadow-glow` and `--border-active`.

3. **Checkboxes (`.icon-toggle`)**:
   - Use visually hidden checkboxes (`.hidden-checkbox`) with custom SVG icons wrapped in `.icon-toggle-btn`. Let the `input:checked + .icon-toggle-btn` handle the active state.

4. **Dropdowns (`.custom-select-wrapper`)**:
   - Native `<select>` elements are dynamically converted by `custom-dropdown.js`. Do not write new CSS for `<select>`, just ensure the HTML has standard `<select>` and `<option>` and let the script inject the premium UI.

## 4. Dark Mode / Light Mode

AutoBib handles themes via the `data-theme` attribute on the `<html>` tag.

- DO NOT use media queries (`@media (prefers-color-scheme: dark)`) for core color overriding.
- Put your light mode overrides inside `[data-theme="light"] { ... }` in `main.css`.
