import { StyleDefinition, KeyframeDefinition } from '../types';

export const generateCssString = (styles: StyleDefinition[], keyframes: KeyframeDefinition[]): string => {
  // Check if any style uses animations
  const hasAnimations = styles.some(style =>
    style.rules.some(rule =>
      rule.property.toLowerCase() === 'animation' &&
      rule.value.includes('kf-')
    )
  );

  const classesCSS = styles.map(style => {
    const selectorString = style.selectors.join(', ');
    const rulesString = style.rules
      .map(rule => `  ${rule.property}: ${rule.value};`)
      .join('\n');

    return `${selectorString} {\n${rulesString}\n}`;
  }).join('\n\n');

  // If animations are used, prepend the keyframes
  if (hasAnimations && keyframes.length > 0) {
    const keyframesCSS = keyframes
      .map(kf => `@keyframes ${kf.name} {\n  ${kf.keyframes.split('\n').join('\n  ')}\n}`)
      .join('\n\n');

    return `/* Keyframes for animations */\n${keyframesCSS}\n\n/* Style Classes */\n${classesCSS}`;
  }

  return classesCSS;
};

export const updateDynamicStyles = (styles: StyleDefinition[], keyframes: KeyframeDefinition[]) => {
  const css = generateCssString(styles, keyframes);
  const styleTag = document.getElementById('dynamic-svg-styles');
  if (styleTag) {
    styleTag.textContent = css;
  }
};
