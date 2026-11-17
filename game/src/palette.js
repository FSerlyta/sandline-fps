// The look plan, in one place: a desert outpost at golden hour. Six named values plus the
// two team colours; the lighting makes every shade the game needs, so no other colour
// appears in the code. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#1a140e', // dusk sky / page background
  surface: '#2b2115', // sandstone walls
  hairline: '#6b543a', // rock and crate edges
  ink: '#f2e8d5', // pale sand text
  muted: '#a89880', // dusty secondary text
  accent: '#e07830', // sunset orange, the one accent
  sand: '#c9a86a', // ground
  falcon: '#2f8f7a', // Falcons (attackers, the player's team)
  viper: '#c0452f', // Vipers (defenders)
};

export function shade(name) {
  return PALETTE[name];
}
