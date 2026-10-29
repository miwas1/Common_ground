// Turns a written palette ("warm butter yellow, enamel red, flour white") into swatches.
// Only colour words we recognise get a swatch; the written name is always shown with it.

const COLOUR: Record<string, string> = {
  white: "#f7f5f0", ivory: "#f4efe1", cream: "#f1e6cc", flour: "#f3efe6", beige: "#e3d5b8", sand: "#d9c49c", linen: "#ece3d0",
  yellow: "#e8c547", butter: "#f0d77a", mustard: "#c9a227", gold: "#c9a24a", ochre: "#c4892f", amber: "#d18b2c",
  orange: "#e0722f", terracotta: "#c4643f", rust: "#a8502c", coral: "#e5765f", peach: "#efb38f",
  red: "#c0392b", crimson: "#a3192f", burgundy: "#6d1f2c", pink: "#e59cb0", blush: "#e8b9b0", rose: "#c97585",
  purple: "#6f4a8e", lilac: "#b9a3d3", lavender: "#b8a9d9", plum: "#673a59",
  blue: "#2f5e9e", navy: "#1f2f4f", denim: "#4f6d8f", cobalt: "#2347a0", sky: "#8cb8de", indigo: "#33337a",
  teal: "#1f7a7a", turquoise: "#3fb0a8", aqua: "#68c6c1", cyan: "#3fb7cf",
  green: "#3d7a4a", sage: "#9aaa88", olive: "#73753a", forest: "#2f4f35", mint: "#a8d5ba", emerald: "#2d8a5f", moss: "#6b7a3a",
  brown: "#6b4a33", espresso: "#3b2a20", chocolate: "#4a2f22", walnut: "#5b3e2b", tan: "#c49a6c", caramel: "#b5793f", coffee: "#5a4030",
  grey: "#8a8d91", gray: "#8a8d91", charcoal: "#36393d", slate: "#5d6b78", steel: "#7a8794", silver: "#c2c6cb", asphalt: "#4a4d52",
  black: "#1d1d1f",
};

export type Swatch = { name: string; hex: string | null };

export function paletteSwatches(palette: string | undefined): Swatch[] {
  if (!palette) return [];
  return palette
    .split(/,|;|\band\b|\bwith\b/i)
    .map((part) => part.replace(/^\s*(a|an|the|single|one)\s+/i, "").trim())
    .filter(Boolean)
    .map((name) => {
      const words = name.toLowerCase().match(/[a-z]+/g) ?? [];
      // The colour noun usually comes last ("deep espresso brown"); fall back to any known word.
      const known = [...words].reverse().find((w) => COLOUR[w]);
      return { name: name.charAt(0).toUpperCase() + name.slice(1), hex: known ? COLOUR[known] : null };
    });
}
