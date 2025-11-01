import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { TrackingService } from '../services/firestoreService';

const router = Router();

// Email open tracking pixel
router.get('/open/:trackingId.png', async (req: Request, res: Response) => {
  try {
    const { trackingId } = req.params;
    
    // Decode tracking ID to get invoice ID
    const invoiceId = decodeTrackingId(trackingId);
    
    if (invoiceId) {
      // Record tracking event
      await TrackingService.recordEvent(invoiceId, 'EMAIL_OPEN', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        referer: req.get('Referer'),
        timestamp: new Date().toISOString(),
      });

      console.log(`📧 Email opened for invoice: ${invoiceId}`);
    }

    // Return a 1x1 transparent PNG
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );

    res.set({
      'Content-Type': 'image/png',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });

    res.send(pixel);
  } catch (error) {
    console.error('Tracking pixel error:', error);
    
    // Still return a pixel even on error
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );
    res.set('Content-Type', 'image/png');
    res.send(pixel);
  }
});

// Link click tracking
router.get('/click/:trackingId', async (req: Request, res: Response) => {
  try {
    const { trackingId } = req.params;
    const { r: redirectUrl } = req.query;
    
    // Decode tracking ID to get invoice ID
    const invoiceId = decodeTrackingId(trackingId);
    
    if (invoiceId) {
      // Record tracking event
      await TrackingService.recordEvent(invoiceId, 'LINK_CLICK', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        referer: req.get('Referer'),
        redirectUrl,
        timestamp: new Date().toISOString(),
      });

      console.log(`🔗 Link clicked for invoice: ${invoiceId}`);
    }

    // Validate and redirect
    if (redirectUrl && typeof redirectUrl === 'string') {
      const validatedUrl = validateRedirectUrl(redirectUrl);
      if (validatedUrl) {
        return res.redirect(302, validatedUrl);
      }
    }

    // Default redirect to frontend
    res.redirect(302, process.env.FRONTEND_URL || 'http://localhost:3000');
  } catch (error) {
    console.error('Click tracking error:', error);
    res.redirect(302, process.env.FRONTEND_URL || 'http://localhost:3000');
  }
});

// Generate tracking ID (encode invoice ID with HMAC for security)
export const generateTrackingId = (invoiceId: string): string => {
  const secret = process.env.TRACKING_SECRET || 'default-secret';
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(invoiceId);
  const signature = hmac.digest('hex').substring(0, 16);
  
  // Combine invoice ID with signature
  const payload = Buffer.from(JSON.stringify({ id: invoiceId, sig: signature })).toString('base64url');
  return payload;
};

// Decode tracking ID and verify HMAC
const decodeTrackingId = (trackingId: string): string | null => {
  try {
    const decoded = JSON.parse(Buffer.from(trackingId, 'base64url').toString());
    const { id: invoiceId, sig: signature } = decoded;
    
    // Verify signature
    const secret = process.env.TRACKING_SECRET || 'default-secret';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(invoiceId);
    const expectedSignature = hmac.digest('hex').substring(0, 16);
    
    if (signature === expectedSignature) {
      return invoiceId;
    }
    
    return null;
  } catch {
    return null;
  }
};

// Validate redirect URL to prevent open redirect attacks
const validateRedirectUrl = (url: string): string | null => {
  try {
    const parsedUrl = new URL(url);
    const allowedDomains = [
      'localhost',
      '127.0.0.1',
      process.env.FRONTEND_DOMAIN,
      process.env.INVOICE_DOMAIN,
    ].filter(Boolean);

    // Allow relative URLs
    if (url.startsWith('/')) {
      return url;
    }

    // Check if domain is allowed
    if (allowedDomains.some(domain => parsedUrl.hostname.endsWith(domain!))) {
      return url;
    }

    return null;
  } catch {
    return null;
  }
};

export default router;