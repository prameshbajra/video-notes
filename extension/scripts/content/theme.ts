import { state, themePalettes, themeState, ui } from './state.js';
import { applyStyles } from './utils.js';
import { renderNotesTrack } from './notes.js';

let themeObserver: MutationObserver | null = null;
let themeMediaQuery: MediaQueryList | null = null;
let themeAppObserver: MutationObserver | null = null;

const parseRgbColor = (value: unknown): ParsedColor | null => {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const match = value.match(/rgba?\(([^)]+)\)/i);
    if (!match || !match[1]) {
        return null;
    }

    const parts = match[1]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length < 3) {
        return null;
    }

    const [rRaw, gRaw, bRaw, aRaw] = parts as [string, string, string, string?];
    const r = Number.parseFloat(rRaw);
    const g = Number.parseFloat(gRaw);
    const b = Number.parseFloat(bRaw);
    const a = aRaw !== undefined ? Number.parseFloat(aRaw) : 1;

    if ([r, g, b].some((component) => !Number.isFinite(component))) {
        return null;
    }

    const alpha = Number.isFinite(a) ? a : 1;
    return { r, g, b, a: alpha };
};

const parseHexColor = (value: unknown): ParsedColor | null => {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim().replace(/^#/, '');
    if (![3, 4, 6, 8].includes(trimmed.length)) {
        return null;
    }

    const expand = (component: string): string => {
        if (component.length === 1) {
            return component.repeat(2);
        }
        return component;
    };

    const pairs =
        trimmed.length === 3 || trimmed.length === 4
            ? trimmed.split('').map((char) => expand(char))
            : trimmed.match(/.{2}/g);

    if (!pairs || (pairs.length !== 3 && pairs.length !== 4)) {
        return null;
    }

    const [rRaw, gRaw, bRaw, aRaw] = pairs as [string, string, string, string?];
    const r = Number.parseInt(rRaw, 16);
    const g = Number.parseInt(gRaw, 16);
    const b = Number.parseInt(bRaw, 16);
    const a = aRaw !== undefined ? Number.parseInt(aRaw, 16) : undefined;
    if ([r, g, b].some((component) => !Number.isFinite(component))) {
        return null;
    }

    const alpha = typeof a === 'number' && Number.isFinite(a) ? a / 255 : 1;

    return {
        r,
        g,
        b,
        a: alpha
    };
};

const parseColorString = (value: unknown): ParsedColor | null => {
    if (!value || typeof value !== 'string') {
        return null;
    }

    if (value.includes('var(')) {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.startsWith('#')) {
        return parseHexColor(trimmed);
    }

    if (trimmed.startsWith('rgb')) {
        return parseRgbColor(trimmed);
    }

    return null;
};

const calculateLuminance = (color: ParsedColor | null): number | null => {
    if (!color) {
        return null;
    }

    const alpha = Number.isFinite(color.a) ? color.a : 1;
    if (alpha <= 0.05) {
        return null;
    }

    const r = color.r / 255;
    const g = color.g / 255;
    const b = color.b / 255;

    const transform = (channel: number): number =>
        channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);

    return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
};

const resolveColorSchemeString = (value: unknown): ThemeMode | null => {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const normalized = value.toLowerCase();
    const hasLight = normalized.includes('light');
    const hasDark = normalized.includes('dark');

    if (hasDark && !hasLight) {
        return 'dark';
    }
    if (hasLight && !hasDark) {
        return 'light';
    }

    if (hasDark && hasLight) {
        const first = normalized.trim().split(/\s+/)[0];
        if (first === 'dark' || first === 'light') {
            return first;
        }
    }

    return null;
};

const detectThemeMode = (): ThemeMode => {
    const root = document.documentElement;
    const htmlAttr = root ? root.getAttribute('dark') : null;

    if (htmlAttr === '' || htmlAttr === 'true') {
        return 'dark';
    }
    if (htmlAttr === 'false') {
        return 'light';
    }
    if (root && root.hasAttribute('dark') && htmlAttr !== 'false') {
        return 'dark';
    }

    const inlineScheme = root && typeof root.style !== 'undefined' ? root.style.colorScheme : null;
    const resolvedInlineScheme = resolveColorSchemeString(inlineScheme);
    if (resolvedInlineScheme) {
        return resolvedInlineScheme;
    }

    const rootStyle = root ? window.getComputedStyle(root) : null;
    const computedScheme = rootStyle ? resolveColorSchemeString(rootStyle.colorScheme) : null;
    if (computedScheme) {
        return computedScheme;
    }

    const appElement = document.querySelector<HTMLElement>('ytd-app');
    if (appElement) {
        const appDarkAttr = appElement.getAttribute('dark') || appElement.getAttribute('dark-theme');
        const appLightAttr = appElement.getAttribute('light') || appElement.getAttribute('light-theme');
        if (appDarkAttr && appDarkAttr !== 'false') {
            return 'dark';
        }
        if (appLightAttr && appLightAttr !== 'false') {
            return 'light';
        }
        if (appDarkAttr === 'false') {
            return 'light';
        }
        if (
            appElement.classList.contains('dark') ||
            appElement.classList.contains('dark-theme') ||
            appElement.matches('[dark-theme]')
        ) {
            return 'dark';
        }
        if (
            appElement.classList.contains('light') ||
            appElement.classList.contains('light-theme') ||
            appElement.matches('[light-theme]')
        ) {
            return 'light';
        }

        const appScheme = resolveColorSchemeString(
            typeof appElement.style !== 'undefined' ? appElement.style.colorScheme : null
        );
        if (appScheme) {
            return appScheme;
        }
        const appComputedStyle = window.getComputedStyle(appElement);
        const appComputedScheme = resolveColorSchemeString(appComputedStyle.colorScheme);
        if (appComputedScheme) {
            return appComputedScheme;
        }
    }

    const luminanceCandidates = [root, appElement, document.querySelector('#content'), document.body];

    for (const candidate of luminanceCandidates) {
        if (!candidate) {
            continue;
        }

        const style = window.getComputedStyle(candidate);
        const colorStrings = [
            style.backgroundColor,
            style.getPropertyValue('--yt-spec-base-background'),
            style.getPropertyValue('--yt-spec-base-background-a'),
            style.getPropertyValue('--yt-spec-general-background-a'),
            style.getPropertyValue('--yt-spec-additive-background'),
            style.getPropertyValue('--yt-spec-raised-background')
        ];

        for (const colorString of colorStrings) {
            const parsed = parseColorString(colorString);
            const luminance = calculateLuminance(parsed);
            if (luminance !== null && Number.isFinite(luminance)) {
                if (luminance >= 0.5) {
                    return 'light';
                }
                if (luminance <= 0.4) {
                    return 'dark';
                }
            }
        }
    }

    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }

    return 'light';
};

const getThemePalette = (): ThemePalette => {
    const detectedMode = detectThemeMode();
    if (detectedMode !== themeState.mode) {
        themeState.mode = detectedMode;
        themeState.palette = themePalettes[detectedMode] || themePalettes.dark;
    }
    return themeState.palette;
};

const syncZenButtonAppearance = (palette: ThemePalette | null): void => {
    if (!palette || !ui.zenButton) {
        return;
    }

    const accent = '#3ea6ff';
    const isActive = state.isZenModeEnabled;
    const activeBackground =
        themeState.mode === 'dark' ? 'rgba(62, 166, 255, 0.2)' : 'rgba(62, 166, 255, 0.12)';

    applyStyles(ui.zenButton, {
        borderRadius: '999px',
        padding: '6px 12px',
        border: isActive ? '1px solid rgba(62, 166, 255, 0.7)' : palette.surfaceBorder,
        backgroundColor: isActive ? activeBackground : palette.surfaceMuted,
        color: isActive ? accent : palette.textPrimary,
        boxShadow: isActive ? '0 4px 12px rgba(62, 166, 255, 0.18)' : 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '13px',
        fontWeight: '600',
        lineHeight: '1.2',
        cursor: 'pointer'
    });

    ui.zenButton.textContent = isActive ? 'Zen mode on' : 'Zen mode';
    ui.zenButton.setAttribute('aria-pressed', isActive ? 'true' : 'false');
};

const applyThemeToUi = (palette: ThemePalette | null): void => {
    if (!palette) {
        return;
    }

    if (ui.heading) {
        ui.heading.style.color = palette.textPrimary;
    }
    if (ui.timestampLabel) {
        ui.timestampLabel.style.color = palette.textSecondary;
    }
    if (ui.container) {
        ui.container.style.color = palette.textPrimary;
    }
    if (ui.track) {
        ui.track.style.backgroundColor = palette.surfaceMuted;
        ui.track.style.border = palette.surfaceBorder;
    }
    if (ui.trackBaseline) {
        ui.trackBaseline.style.backgroundColor = palette.surfaceBaseline;
    }
    if (ui.emptyState) {
        ui.emptyState.style.color = palette.textSecondary;
    }
    if (ui.tooltip) {
        ui.tooltip.style.backgroundColor = palette.tooltipBackground;
        ui.tooltip.style.color = palette.tooltipText;
        ui.tooltip.style.boxShadow = palette.tooltipShadow;
    }
    if (ui.textarea) {
        ui.textarea.style.backgroundColor = palette.textareaBackground;
        ui.textarea.style.color = palette.textareaText;
        ui.textarea.style.border = palette.textareaBorder;
    }
    if (ui.deleteButton) {
        ui.deleteButton.style.color = palette.deleteText;
        ui.deleteButton.style.border = palette.deleteBorder;
    }
    if (ui.cancelButton) {
        ui.cancelButton.style.color = palette.cancelText;
    }
    if (ui.previewText) {
        ui.previewText.style.backgroundColor = palette.previewBackground;
        ui.previewText.style.color = palette.previewText;
        ui.previewText.style.border = palette.previewBorder;
        ui.previewText.style.boxShadow = palette.previewShadow;
    }
    if (ui.trackHoverTooltip) {
        ui.trackHoverTooltip.style.backgroundColor = palette.previewBackground;
        ui.trackHoverTooltip.style.color = palette.previewText;
        ui.trackHoverTooltip.style.border = palette.previewBorder;
        ui.trackHoverTooltip.style.boxShadow = palette.previewShadow;
    }

    syncZenButtonAppearance(palette);
};

const handleThemeChange = (): void => {
    const palette = getThemePalette();
    applyThemeToUi(palette);
    if (ui.track) {
        renderNotesTrack();
    }
};

const watchThemeChanges = (): void => {
    if (themeObserver) {
        return;
    }

    const scheduleUpdate = (): void => {
        window.requestAnimationFrame(handleThemeChange);
    };

    themeObserver = new MutationObserver(scheduleUpdate);

    const root = document.documentElement;
    if (root) {
        themeObserver.observe(root, {
            attributes: true,
            attributeFilter: ['dark', 'class', 'style']
        });
    }

    const observeYtdApp = (): boolean => {
        const observerRef = themeObserver;
        if (!observerRef) {
            return false;
        }
        const appElement = document.querySelector('ytd-app');
        if (!appElement) {
            return false;
        }

        observerRef.observe(appElement, {
            attributes: true,
            attributeFilter: ['dark', 'class', 'style']
        });
        return true;
    };

    if (!observeYtdApp()) {
        themeAppObserver = new MutationObserver(() => {
            if (observeYtdApp() && themeAppObserver) {
                themeAppObserver.disconnect();
                themeAppObserver = null;
            }
        });

        if (root) {
            themeAppObserver.observe(root, { childList: true, subtree: true });
        }
    }

    if (window.matchMedia) {
        themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const mediaListener = (): void => scheduleUpdate();
        if (themeMediaQuery.addEventListener) {
            themeMediaQuery.addEventListener('change', mediaListener);
        } else if (themeMediaQuery.addListener) {
            themeMediaQuery.addListener(mediaListener);
        }
    }
};

export { applyThemeToUi, getThemePalette, handleThemeChange, syncZenButtonAppearance, watchThemeChanges };
