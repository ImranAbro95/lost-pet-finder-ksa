// Small line-icon set (24x24, stroke = currentColor). Decorative by default (aria-hidden).
const P = {
  paw: '<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6.5" r="2"/><circle cx="17" cy="9" r="2"/><path d="M12 12c-3 0-6 3.5-6 6.2C6 20 7.4 21 9 21c1.3 0 2-.7 3-.7s1.7.7 3 .7c1.6 0 3-1 3-2.8C18 15.5 15 12 12 12z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.6-4.6"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-7.5-10.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  whatsapp: '<path d="M4 20l1.2-3.6A8 8 0 1 1 8 19.1z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z"/>',
  poster: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 15.5l2.5-3 2 2 1.5-1.5 1.5 2.5M9 8h6"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
  printer: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  message: '<path d="M4 5.5h16v10.5H9l-5 4z"/>',
  camera: '<path d="M4 8h3l1.6-2.5h6.8L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  home: '<path d="M4 11l8-6.5 8 6.5v9H4z"/><path d="M10 20v-5h4v5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  text: '<path d="M4 18L8.5 6h1L14 18M5.6 14h6.8M15 18l3-7.5h.5L21.5 18M15.9 15.8h4.2"/>',
  shield: '<path d="M12 3l7.5 3v6c0 4.6-3.2 7.8-7.5 9-4.3-1.2-7.5-4.4-7.5-9V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5L9 15M15 9l2.5-2.5"/>'
};
export function icon(name, cls = "ic", label = "") {
  const a = label ? `role="img" aria-label="${label.replace(/"/g, "&quot;")}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${a}>${P[name] || ""}</svg>`;
}

// Hero illustration: a neighbourhood map with paw pins (no external images).
export const HERO_ART = `<svg class="hero-art" viewBox="0 0 360 300" aria-hidden="true" focusable="false">
  <rect x="10" y="10" width="340" height="280" rx="28" fill="var(--map-bg)"/>
  <g stroke="var(--map-road)" stroke-width="14" stroke-linecap="round" fill="none">
    <path d="M10 92 H350"/><path d="M10 206 H350"/><path d="M118 10 V290"/><path d="M250 10 V290"/><path d="M118 150 C170 150 200 120 250 120"/>
  </g>
  <g fill="var(--map-block)">
    <rect x="30" y="112" width="70" height="76" rx="10"/><rect x="136" y="26" width="96" height="50" rx="10"/><rect x="268" y="224" width="64" height="50" rx="10"/>
    <rect x="30" y="224" width="70" height="50" rx="10"/><rect x="268" y="26" width="64" height="50" rx="10"/>
  </g>
  <circle cx="186" cy="176" r="62" fill="var(--map-ring)"/>
  <circle cx="186" cy="176" r="34" fill="var(--map-ring2)"/>
  <g transform="translate(160 136)"><path d="M26 74s-26-23-26-43a26 26 0 0 1 52 0c0 20-26 43-26 43z" fill="var(--lost)"/>
    <g fill="#fff"><circle cx="17" cy="27" r="3.6"/><circle cx="26" cy="22" r="3.6"/><circle cx="35" cy="27" r="3.6"/><path d="M26 31c-5 0-9 5-9 8.5 0 2.3 2 3.5 4 3.5 1.8 0 3-1 5-1s3.2 1 5 1c2 0 4-1.2 4-3.5 0-3.5-4-8.5-9-8.5z"/></g></g>
  <g transform="translate(270 128)"><path d="M18 52s-18-16-18-30a18 18 0 0 1 36 0c0 14-18 30-18 30z" fill="var(--found)"/><path d="M11 21l5 5 9-10" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
  <g transform="translate(58 40)"><path d="M18 52s-18-16-18-30a18 18 0 0 1 36 0c0 14-18 30-18 30z" fill="var(--found)"/><path d="M11 21l5 5 9-10" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
</svg>`;
