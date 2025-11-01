import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { authenticate, requireBusinessAccess, AuthRequest } from '../middleware/auth';
import { validateBusiness } from '../utils/validation';

const router = Router();

// Get user's businesses
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const businesses = await prisma.business.findMany({
      where: {
        businessUsers: {
          some: {
            userId: req.user!.id,
          },
        },
      },
      include: {
        businessUsers: {
          where: {
            userId: req.user!.id,
          },
          select: {
            role: true,
          },
        },
      },
    });

    res.json(businesses);
  } catch (error) {
    console.error('Get businesses error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create business
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { error } = validateBusiness(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Create business and add user as owner
    const business = await prisma.business.create({
      data: {
        ...req.body,
        businessUsers: {
          create: {
            userId: req.user!.id,
            role: 'OWNER',
          },
        },
      },
      include: {
        businessUsers: true,
      },
    });

    res.status(201).json(business);
  } catch (error) {
    console.error('Create business error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get business details
router.get('/:businessId', authenticate, requireBusinessAccess, async (req: AuthRequest, res: Response) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      include: {
        products: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
        },
        contacts: {
          orderBy: { name: 'asc' },
        },
        _count: {
          select: {
            invoices: true,
            products: true,
            contacts: true,
          },
        },
      },
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    res.json(business);
  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update business
router.put('/:businessId', authenticate, requireBusinessAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { error } = validateBusiness(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const business = await prisma.business.update({
      where: { id: req.businessId },
      data: req.body,
    });

    res.json(business);
  } catch (error) {
    console.error('Update business error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Products routes
router.get('/:businessId/products', authenticate, requireBusinessAccess, async (req: AuthRequest, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        businessId: req.businessId,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json(products);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:businessId/products', authenticate, requireBusinessAccess, async (req: AuthRequest, res: Response) => {
  try {
    const product = await prisma.product.create({
      data: {
        ...req.body,
        businessId: req.businessId,
      },
    });

    res.status(201).json(product);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Contacts routes
router.get('/:businessId/contacts', authenticate, requireBusinessAccess, async (req: AuthRequest, res: Response) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: {
        businessId: req.businessId,
      },
      orderBy: { name: 'asc' },
    });

    res.json(contacts);
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:businessId/contacts', authenticate, requireBusinessAccess, async (req: AuthRequest, res: Response) => {
  try {
    const contact = await prisma.contact.create({
      data: {
        ...req.body,
        businessId: req.businessId,
      },
    });

    res.status(201).json(contact);
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;