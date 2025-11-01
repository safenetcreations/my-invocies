/**
 * Branding Cloud Functions
 * Intelligent color extraction from logos with Firebase Storage triggers
 */

import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import multer from 'multer';
import { brandingService } from './services/brandingService';
import { tenantService, Collections, Tenant } from './services/multiTenantFirestore';

const storage = admin.storage();
const db = admin.firestore();

// ============================================================================
// STORAGE TRIGGER - AUTO COLOR EXTRACTION
// ============================================================================

/**
 * Automatically extract colors when a logo is uploaded
 * Triggered when file is uploaded to: tenants/{tenantId}/logo.{ext}
 */
export const onLogoUploaded = functions.storage.onObjectFinalized(
  {
    bucket: process.env.FIREBASE_STORAGE_BUCKET,
  },
  async (event) => {
    const filePath = event.data.name;
    const contentType = event.data.contentType;

    console.log('File uploaded:', filePath, contentType);

    // Only process logo files
    if (!filePath.includes('/logo.') || !contentType?.startsWith('image/')) {
      console.log('Skipping non-logo file');
      return;
    }

    // Extract tenant ID from path: tenants/{tenantId}/logo.ext
    const pathParts = filePath.split('/');
    if (pathParts.length < 3 || pathParts[0] !== 'tenants') {
      console.log('Invalid file path format');
      return;
    }

    const tenantId = pathParts[1];

    try {
      // Download the logo
      const bucket = storage.bucket(event.data.bucket);
      const file = bucket.file(filePath);
      const [fileBuffer] = await file.download();

      console.log(`Processing logo for tenant ${tenantId}...`);

      // Extract colors from logo
      const colorPalette = await brandingService.extractColorsFromLogo(fileBuffer);

      console.log('Color palette extracted:', colorPalette);

      // Get public URL
      const [metadata] = await file.getMetadata();
      const logoUrl = `https://storage.googleapis.com/${event.data.bucket}/${filePath}`;

      // Update tenant with extracted branding
      await db
        .collection(Collections.TENANTS)
        .doc(tenantId)
        .update({
          'branding.logoUrl': logoUrl,
          'branding.primaryColor': colorPalette.primaryColor,
          'branding.secondaryColor': colorPalette.secondaryColor,
          'branding.accentColor': colorPalette.accentColor,
          'branding.textOnPrimary': colorPalette.textOnPrimary,
          'branding.textOnSecondary': colorPalette.textOnSecondary,
          'branding.textOnAccent': colorPalette.textOnAccent,
          'branding.autoExtracted': colorPalette.autoExtracted,
          'branding.dominantColors': colorPalette.dominantColors,
          'branding.contrastRatios': colorPalette.contrastRatios,
          'branding.wcagCompliant': colorPalette.wcagCompliant,
          updatedAt: admin.firestore.Timestamp.now(),
        });

      console.log(`✓ Branding updated for tenant ${tenantId}`);

      // Generate color report
      const report = brandingService.generateColorReport(colorPalette);
      console.log(report);

      return {
        success: true,
        tenantId,
        colorPalette,
      };
    } catch (error) {
      console.error('Error processing logo:', error);
      throw error;
    }
  }
);

// ============================================================================
// LOGO UPLOAD ENDPOINT
// ============================================================================

/**
 * Upload logo endpoint with direct cloud storage
 */
export async function uploadLogo(req: any, res: any) {
  try {
    const { tenantId } = req.params;

    // Verify tenant access
    if (tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Cannot upload logo for other tenants' });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        error: 'Invalid file type. Allowed types: JPG, PNG, SVG, WebP',
      });
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return res.status(400).json({
        error: 'File too large. Maximum size is 5MB',
      });
    }

    // Determine file extension
    const ext = file.originalname.split('.').pop() || 'png';
    const fileName = `tenants/${tenantId}/logo.${ext}`;

    // Upload to Firebase Storage
    const bucket = storage.bucket();
    const fileRef = bucket.file(fileName);

    await fileRef.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
        metadata: {
          uploadedBy: req.user?.uid,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    // Make file publicly readable
    await fileRef.makePublic();

    // Get public URL
    const logoUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    // Note: Color extraction will be done automatically by onLogoUploaded trigger
    // Return immediately with logo URL
    res.json({
      message: 'Logo uploaded successfully. Color extraction in progress...',
      logoUrl,
      processingStatus: 'pending',
    });
  } catch (error: any) {
    console.error('Error uploading logo:', error);
    res.status(500).json({ error: error.message });
  }
}

// ============================================================================
// MANUAL COLOR ADJUSTMENT ENDPOINT
// ============================================================================

/**
 * Manually set or adjust tenant colors
 */
export async function updateBrandingColors(req: any, res: any) {
  try {
    const { tenantId } = req.params;
    const { primaryColor, secondaryColor, accentColor } = req.body;

    // Verify tenant access
    if (tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Cannot update branding for other tenants' });
    }

    if (!primaryColor) {
      return res.status(400).json({ error: 'Primary color is required' });
    }

    // Validate and adjust colors for WCAG compliance
    const adjustedPalette = brandingService.validateAndAdjustPalette(
      primaryColor,
      secondaryColor,
      accentColor
    );

    // Calculate contrast ratios
    const contrastRatios = {
      primaryContrast: brandingService.calculateContrast(
        adjustedPalette.primaryColor,
        adjustedPalette.textOnPrimary
      ),
      secondaryContrast: brandingService.calculateContrast(
        adjustedPalette.secondaryColor,
        adjustedPalette.textOnSecondary
      ),
      accentContrast: brandingService.calculateContrast(
        adjustedPalette.accentColor,
        adjustedPalette.textOnAccent
      ),
    };

    // Update tenant branding
    await db
      .collection(Collections.TENANTS)
      .doc(tenantId)
      .update({
        'branding.primaryColor': adjustedPalette.primaryColor,
        'branding.secondaryColor': adjustedPalette.secondaryColor,
        'branding.accentColor': adjustedPalette.accentColor,
        'branding.textOnPrimary': adjustedPalette.textOnPrimary,
        'branding.textOnSecondary': adjustedPalette.textOnSecondary,
        'branding.textOnAccent': adjustedPalette.textOnAccent,
        'branding.autoExtracted': false, // Manual override
        'branding.contrastRatios': contrastRatios,
        'branding.wcagCompliant':
          contrastRatios.primaryContrast >= 4.5 &&
          contrastRatios.secondaryContrast >= 4.5 &&
          contrastRatios.accentContrast >= 4.5,
        updatedAt: admin.firestore.Timestamp.now(),
      });

    res.json({
      message: 'Branding colors updated successfully',
      branding: {
        ...adjustedPalette,
        contrastRatios,
      },
    });
  } catch (error: any) {
    console.error('Error updating branding colors:', error);
    res.status(400).json({ error: error.message });
  }
}

// ============================================================================
// GET BRANDING INFO
// ============================================================================

/**
 * Get tenant branding information
 */
export async function getBranding(req: any, res: any) {
  try {
    const { tenantId } = req.params;

    // Verify tenant access
    if (tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Cannot access branding for other tenants' });
    }

    const tenant = await tenantService.get<Tenant>(Collections.TENANTS, tenantId);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Generate CSS variables
    const cssVariables = tenant.branding
      ? brandingService.generateCSSVariables(tenant.branding as any)
      : null;

    res.json({
      branding: tenant.branding,
      cssVariables,
    });
  } catch (error: any) {
    console.error('Error getting branding:', error);
    res.status(500).json({ error: error.message });
  }
}

// ============================================================================
// RESET TO AUTO-EXTRACTED COLORS
// ============================================================================

/**
 * Re-extract colors from existing logo
 */
export async function reExtractColors(req: any, res: any) {
  try {
    const { tenantId } = req.params;

    // Verify tenant access
    if (tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Cannot re-extract colors for other tenants' });
    }

    const tenant = await tenantService.get<Tenant>(Collections.TENANTS, tenantId);

    if (!tenant || !tenant.branding?.logoUrl) {
      return res.status(404).json({ error: 'No logo found for this tenant' });
    }

    // Download logo from storage
    const logoPath = `tenants/${tenantId}/logo.png`; // Adjust extension as needed
    const bucket = storage.bucket();

    try {
      const file = bucket.file(logoPath);
      const [fileBuffer] = await file.download();

      // Extract colors
      const colorPalette = await brandingService.extractColorsFromLogo(fileBuffer);

      // Update tenant
      await db
        .collection(Collections.TENANTS)
        .doc(tenantId)
        .update({
          'branding.primaryColor': colorPalette.primaryColor,
          'branding.secondaryColor': colorPalette.secondaryColor,
          'branding.accentColor': colorPalette.accentColor,
          'branding.textOnPrimary': colorPalette.textOnPrimary,
          'branding.textOnSecondary': colorPalette.textOnSecondary,
          'branding.textOnAccent': colorPalette.textOnAccent,
          'branding.autoExtracted': true,
          'branding.dominantColors': colorPalette.dominantColors,
          'branding.contrastRatios': colorPalette.contrastRatios,
          'branding.wcagCompliant': colorPalette.wcagCompliant,
          updatedAt: admin.firestore.Timestamp.now(),
        });

      res.json({
        message: 'Colors re-extracted successfully',
        branding: colorPalette,
      });
    } catch (error) {
      return res.status(404).json({ error: 'Logo file not found in storage' });
    }
  } catch (error: any) {
    console.error('Error re-extracting colors:', error);
    res.status(500).json({ error: error.message });
  }
}
