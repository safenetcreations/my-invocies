/**
 * Intelligent Branding Service
 * Extracts dominant colors from company logos using advanced image processing
 * and ensures WCAG accessibility compliance
 */

import sharp from 'sharp';
import chroma from 'chroma-js';

// ============================================================================
// TYPES
// ============================================================================

export interface ColorPalette {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textOnPrimary: string;
  textOnSecondary: string;
  textOnAccent: string;
}

export interface ColorExtractionResult extends ColorPalette {
  dominantColors: string[];
  autoExtracted: boolean;
  contrastRatios: {
    primaryContrast: number;
    secondaryContrast: number;
    accentContrast: number;
  };
  wcagCompliant: boolean;
}

interface RGBColor {
  r: number;
  g: number;
  b: number;
  count: number;
}

// ============================================================================
// COLOR EXTRACTION SERVICE
// ============================================================================

export class BrandingService {
  /**
   * Extract color palette from logo image buffer
   */
  async extractColorsFromLogo(
    imageBuffer: Buffer,
    options: {
      numColors?: number;
      minBrightness?: number;
      maxBrightness?: number;
    } = {}
  ): Promise<ColorExtractionResult> {
    const {
      numColors = 10,
      minBrightness = 0.2,
      maxBrightness = 0.95,
    } = options;

    // Step 1: Process image with Sharp
    const processedImage = await sharp(imageBuffer)
      .resize(200, 200, { fit: 'inside' }) // Resize for faster processing
      .removeAlpha() // Remove transparency
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Step 2: Extract dominant colors using custom K-means clustering
    const dominantColors = await this.extractDominantColors(
      processedImage.data,
      processedImage.info.width,
      processedImage.info.height,
      numColors,
      minBrightness,
      maxBrightness
    );

    // Step 3: Select primary, secondary, and accent colors
    const { primary, secondary, accent } = this.selectColorScheme(dominantColors);

    // Step 4: Validate and adjust for WCAG compliance
    const adjustedPalette = this.ensureWCAGCompliance({
      primaryColor: primary,
      secondaryColor: secondary,
      accentColor: accent,
    });

    // Step 5: Calculate contrast ratios
    const contrastRatios = {
      primaryContrast: this.calculateContrast(
        adjustedPalette.primaryColor,
        adjustedPalette.textOnPrimary
      ),
      secondaryContrast: this.calculateContrast(
        adjustedPalette.secondaryColor,
        adjustedPalette.textOnSecondary
      ),
      accentContrast: this.calculateContrast(
        adjustedPalette.accentColor,
        adjustedPalette.textOnAccent
      ),
    };

    return {
      ...adjustedPalette,
      dominantColors,
      autoExtracted: true,
      contrastRatios,
      wcagCompliant:
        contrastRatios.primaryContrast >= 4.5 &&
        contrastRatios.secondaryContrast >= 4.5 &&
        contrastRatios.accentContrast >= 4.5,
    };
  }

  /**
   * Extract dominant colors using K-means clustering
   */
  private async extractDominantColors(
    pixels: Buffer,
    width: number,
    height: number,
    numColors: number,
    minBrightness: number,
    maxBrightness: number
  ): Promise<string[]> {
    // Convert buffer to RGB array
    const colors: RGBColor[] = [];
    const colorMap = new Map<string, RGBColor>();

    // Sample pixels (skip every N pixels for performance)
    const sampleRate = 4;

    for (let i = 0; i < pixels.length; i += 3 * sampleRate) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      // Filter by brightness
      const brightness = this.getBrightness(r, g, b);
      if (brightness < minBrightness || brightness > maxBrightness) {
        continue;
      }

      // Filter out near-grayscale colors (low saturation)
      const saturation = this.getSaturation(r, g, b);
      if (saturation < 0.1) {
        continue;
      }

      const key = `${r},${g},${b}`;
      const existing = colorMap.get(key);

      if (existing) {
        existing.count++;
      } else {
        colorMap.set(key, { r, g, b, count: 1 });
      }
    }

    // Convert map to array
    const colorArray = Array.from(colorMap.values());

    // Perform K-means clustering
    const clusters = this.kMeansClustering(colorArray, numColors);

    // Convert to hex colors
    return clusters.map((cluster) => this.rgbToHex(cluster.r, cluster.g, cluster.b));
  }

  /**
   * K-means clustering algorithm for color quantization
   */
  private kMeansClustering(colors: RGBColor[], k: number): RGBColor[] {
    if (colors.length === 0) {
      // Return default colors if no colors found
      return [
        { r: 37, g: 99, b: 235, count: 1 }, // Blue
        { r: 16, g: 185, b: 129, count: 1 }, // Green
        { r: 245, g: 158, b: 11, count: 1 }, // Orange
      ];
    }

    // Initialize centroids with most frequent colors
    const sortedColors = colors.sort((a, b) => b.count - a.count);
    let centroids = sortedColors.slice(0, Math.min(k, sortedColors.length));

    // If we don't have enough colors, pad with defaults
    while (centroids.length < k) {
      centroids.push({ r: 128, g: 128, b: 128, count: 1 });
    }

    const maxIterations = 20;
    let iterations = 0;

    while (iterations < maxIterations) {
      // Assign colors to nearest centroid
      const assignments = new Array(k).fill(0).map(() => [] as RGBColor[]);

      for (const color of colors) {
        let minDistance = Infinity;
        let closestCentroid = 0;

        for (let i = 0; i < centroids.length; i++) {
          const distance = this.colorDistance(color, centroids[i]);
          if (distance < minDistance) {
            minDistance = distance;
            closestCentroid = i;
          }
        }

        assignments[closestCentroid].push(color);
      }

      // Recalculate centroids
      const newCentroids: RGBColor[] = [];
      let changed = false;

      for (let i = 0; i < k; i++) {
        if (assignments[i].length === 0) {
          newCentroids.push(centroids[i]);
          continue;
        }

        const totalWeight = assignments[i].reduce((sum, c) => sum + c.count, 0);
        const r = Math.round(
          assignments[i].reduce((sum, c) => sum + c.r * c.count, 0) / totalWeight
        );
        const g = Math.round(
          assignments[i].reduce((sum, c) => sum + c.g * c.count, 0) / totalWeight
        );
        const b = Math.round(
          assignments[i].reduce((sum, c) => sum + c.b * c.count, 0) / totalWeight
        );

        newCentroids.push({ r, g, b, count: totalWeight });

        if (
          centroids[i].r !== r ||
          centroids[i].g !== g ||
          centroids[i].b !== b
        ) {
          changed = true;
        }
      }

      centroids = newCentroids;

      if (!changed) break;
      iterations++;
    }

    // Sort by frequency
    return centroids.sort((a, b) => b.count - a.count);
  }

  /**
   * Calculate Euclidean distance between two colors
   */
  private colorDistance(c1: RGBColor, c2: RGBColor): number {
    return Math.sqrt(
      Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2)
    );
  }

  /**
   * Select primary, secondary, and accent colors from palette
   */
  private selectColorScheme(colors: string[]): {
    primary: string;
    secondary: string;
    accent: string;
  } {
    if (colors.length === 0) {
      // Default color scheme
      return {
        primary: '#2563eb',
        secondary: '#10b981',
        accent: '#f59e0b',
      };
    }

    // Primary: Most dominant color
    const primary = colors[0];

    // Secondary: Color with different hue from primary
    let secondary = colors[1] || primary;
    for (let i = 1; i < colors.length; i++) {
      const hueDiff = Math.abs(
        chroma(colors[i]).get('hsl.h') - chroma(primary).get('hsl.h')
      );
      if (hueDiff > 30 && hueDiff < 330) {
        secondary = colors[i];
        break;
      }
    }

    // Accent: Complementary or triadic color
    let accent = colors[2] || secondary;
    const primaryHue = chroma(primary).get('hsl.h');

    // Try to find a complementary color
    for (let i = 2; i < colors.length; i++) {
      const hue = chroma(colors[i]).get('hsl.h');
      const hueDiff = Math.abs(hue - primaryHue);

      // Look for complementary (180°) or triadic (120°) colors
      if (
        (hueDiff > 160 && hueDiff < 200) ||
        (hueDiff > 100 && hueDiff < 140)
      ) {
        accent = colors[i];
        break;
      }
    }

    return { primary, secondary, accent };
  }

  /**
   * Ensure WCAG AA compliance (4.5:1 contrast ratio)
   */
  private ensureWCAGCompliance(colors: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
  }): ColorPalette {
    const adjustColor = (bgColor: string) => {
      const bg = chroma(bgColor);
      const whiteContrast = chroma.contrast(bg, '#ffffff');
      const blackContrast = chroma.contrast(bg, '#000000');

      // Determine best text color
      let textColor = whiteContrast > blackContrast ? '#ffffff' : '#000000';
      let contrast = Math.max(whiteContrast, blackContrast);

      // If contrast is insufficient, adjust background color
      if (contrast < 4.5) {
        const luminance = bg.luminance();

        if (luminance > 0.5) {
          // Light background, darken it
          const darkened = bg.darken(1.5);
          textColor = '#ffffff';
          contrast = chroma.contrast(darkened, textColor);
          if (contrast >= 4.5) {
            return { bgColor: darkened.hex(), textColor };
          }
        } else {
          // Dark background, lighten it
          const lightened = bg.brighten(1.5);
          textColor = '#000000';
          contrast = chroma.contrast(lightened, textColor);
          if (contrast >= 4.5) {
            return { bgColor: lightened.hex(), textColor };
          }
        }
      }

      return { bgColor: bg.hex(), textColor };
    };

    const primary = adjustColor(colors.primaryColor);
    const secondary = adjustColor(colors.secondaryColor);
    const accent = adjustColor(colors.accentColor);

    return {
      primaryColor: primary.bgColor,
      secondaryColor: secondary.bgColor,
      accentColor: accent.bgColor,
      textOnPrimary: primary.textColor,
      textOnSecondary: secondary.textColor,
      textOnAccent: accent.textColor,
    };
  }

  /**
   * Calculate WCAG contrast ratio
   */
  calculateContrast(color1: string, color2: string): number {
    return chroma.contrast(color1, color2);
  }

  /**
   * Validate if contrast ratio meets WCAG AA standard
   */
  isWCAGCompliant(color1: string, color2: string, level: 'AA' | 'AAA' = 'AA'): boolean {
    const contrast = this.calculateContrast(color1, color2);
    return level === 'AA' ? contrast >= 4.5 : contrast >= 7;
  }

  /**
   * Get brightness of RGB color (0-1)
   */
  private getBrightness(r: number, g: number, b: number): number {
    return (r * 299 + g * 587 + b * 114) / 255000;
  }

  /**
   * Get saturation of RGB color (0-1)
   */
  private getSaturation(r: number, g: number, b: number): number {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    if (max === 0) return 0;
    return delta / max;
  }

  /**
   * Convert RGB to hex
   */
  private rgbToHex(r: number, g: number, b: number): string {
    return (
      '#' +
      [r, g, b]
        .map((x) => {
          const hex = x.toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        })
        .join('')
    );
  }

  /**
   * Manual color palette validation and adjustment
   */
  validateAndAdjustPalette(
    primaryColor: string,
    secondaryColor?: string,
    accentColor?: string
  ): ColorPalette {
    try {
      // Validate colors
      chroma(primaryColor);
      const validSecondary = secondaryColor
        ? chroma(secondaryColor).hex()
        : chroma(primaryColor).darken(0.5).hex();
      const validAccent = accentColor
        ? chroma(accentColor).hex()
        : chroma(primaryColor).set('hsl.h', '+120').hex();

      return this.ensureWCAGCompliance({
        primaryColor: chroma(primaryColor).hex(),
        secondaryColor: validSecondary,
        accentColor: validAccent,
      });
    } catch (error) {
      throw new Error('Invalid color format. Please use hex, rgb, or named colors.');
    }
  }

  /**
   * Generate CSS variables from color palette
   */
  generateCSSVariables(palette: ColorPalette): string {
    return `
:root {
  --primary-color: ${palette.primaryColor};
  --secondary-color: ${palette.secondaryColor};
  --accent-color: ${palette.accentColor};
  --text-on-primary: ${palette.textOnPrimary};
  --text-on-secondary: ${palette.textOnSecondary};
  --text-on-accent: ${palette.textOnAccent};

  /* Shades */
  --primary-light: ${chroma(palette.primaryColor).brighten(1).hex()};
  --primary-dark: ${chroma(palette.primaryColor).darken(1).hex()};
  --secondary-light: ${chroma(palette.secondaryColor).brighten(1).hex()};
  --secondary-dark: ${chroma(palette.secondaryColor).darken(1).hex()};
  --accent-light: ${chroma(palette.accentColor).brighten(1).hex()};
  --accent-dark: ${chroma(palette.accentColor).darken(1).hex()};
}
    `.trim();
  }

  /**
   * Generate color analysis report
   */
  generateColorReport(result: ColorExtractionResult): string {
    return `
Intelligent Branding Analysis Report
=====================================

Primary Color: ${result.primaryColor}
Secondary Color: ${result.secondaryColor}
Accent Color: ${result.accentColor}

Text Colors:
- On Primary: ${result.textOnPrimary}
- On Secondary: ${result.textOnSecondary}
- On Accent: ${result.textOnAccent}

Contrast Ratios (WCAG AA requires 4.5:1):
- Primary: ${result.contrastRatios.primaryContrast.toFixed(2)}:1 ${result.contrastRatios.primaryContrast >= 4.5 ? '✓' : '✗'}
- Secondary: ${result.contrastRatios.secondaryContrast.toFixed(2)}:1 ${result.contrastRatios.secondaryContrast >= 4.5 ? '✓' : '✗'}
- Accent: ${result.contrastRatios.accentContrast.toFixed(2)}:1 ${result.contrastRatios.accentContrast >= 4.5 ? '✓' : '✗'}

WCAG Compliance: ${result.wcagCompliant ? 'PASS ✓' : 'FAIL ✗'}

Dominant Colors Extracted:
${result.dominantColors.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Auto-Extracted: ${result.autoExtracted ? 'Yes' : 'No (Manual Override)'}
    `.trim();
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const brandingService = new BrandingService();
