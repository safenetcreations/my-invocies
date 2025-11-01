/**
 * Firebase Cloud Functions - Invoicing Module
 * Handles Sequential Invoice Numbers, PDF Generation, and Invoice Operations
 */

import * as functions from 'firebase-functions/v2';
import { AuthRequest } from './middleware/rbac';
import { Response } from 'express';
import {
  db,
  Collections,
  Tenant,
  Invoice,
  invoiceService,
  tenantService,
} from './services/multiTenantFirestore';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// SEQUENTIAL INVOICE NUMBER GENERATION
// ============================================================================

/**
 * Generate next sequential invoice number for tenant
 * Uses Firestore transaction for atomic increment
 */
export const generateInvoiceNumber = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const tenantRef = db.collection(Collections.TENANTS).doc(tenantId);

    // Run transaction to ensure atomic increment
    const invoiceNumber = await db.runTransaction(async (transaction) => {
      const tenantDoc = await transaction.get(tenantRef);

      if (!tenantDoc.exists) {
        throw new Error('Tenant not found');
      }

      const tenantData = tenantDoc.data() as Tenant;
      const lastNumber = tenantData.lastInvoiceNumber || 0;
      const newNumber = lastNumber + 1;

      // Get invoice prefix from tenant settings (default: INV-)
      const prefix = tenantData.invoicePrefix || 'INV-';
      const paddingLength = tenantData.invoiceNumberPadding || 6;
      const paddedNumber = newNumber.toString().padStart(paddingLength, '0');
      const invoiceNumber = `${prefix}${paddedNumber}`;

      // Update last invoice number atomically
      transaction.update(tenantRef, {
        lastInvoiceNumber: newNumber,
        updatedAt: Timestamp.now(),
      });

      return invoiceNumber;
    });

    res.json({ invoiceNumber });
  } catch (error: any) {
    console.error('Error generating invoice number:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Validate and reserve invoice number
 * Checks if invoice number is available and reserves it
 */
export const reserveInvoiceNumber = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceNumber } = req.body;
    const tenantId = req.tenantId!;

    if (!invoiceNumber) {
      return res.status(400).json({ error: 'invoiceNumber is required' });
    }

    // Check if invoice number already exists for this tenant
    const existingInvoice = await db
      .collection(Collections.INVOICES)
      .where('tenantId', '==', tenantId)
      .where('invoiceNumber', '==', invoiceNumber)
      .limit(1)
      .get();

    if (!existingInvoice.empty) {
      return res.status(409).json({
        error: 'Invoice number already exists',
        available: false,
      });
    }

    res.json({
      available: true,
      invoiceNumber,
    });
  } catch (error: any) {
    console.error('Error reserving invoice number:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// LATE FEE APPLICATION
// ============================================================================

/**
 * Calculate late fee for overdue invoice
 */
function calculateLateFee(invoice: Invoice, tenant: Tenant): number {
  if (!invoice.dateDue || invoice.amountDue <= 0) {
    return 0;
  }

  const today = new Date();
  const dueDate = invoice.dateDue.toDate();
  const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

  if (daysOverdue <= 0) {
    return 0;
  }

  // Get late fee configuration from tenant settings
  const lateFeePercentage = tenant.lateFeePercentage || 0;
  const lateFeeGracePeriod = tenant.lateFeeGracePeriod || 0;

  if (daysOverdue <= lateFeeGracePeriod) {
    return 0;
  }

  // Calculate late fee as percentage of amount due
  const lateFee = (invoice.amountDue * lateFeePercentage) / 100;

  // Apply late fee cap if configured
  const lateFeeCap = tenant.lateFeeCap || Infinity;
  return Math.min(lateFee, lateFeeCap);
}

/**
 * Apply late fee to invoice manually
 */
export const applyLateFee = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const tenantId = req.tenantId!;

    const invoice = await invoiceService.get<Invoice>(Collections.INVOICES, invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot apply late fee to paid or cancelled invoice' });
    }

    const tenant = await tenantService.get<Tenant>(Collections.TENANTS, tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const lateFee = calculateLateFee(invoice, tenant);

    if (lateFee <= 0) {
      return res.status(400).json({ error: 'No late fee applicable' });
    }

    // Check if late fee already applied
    const existingLateFeeItem = invoice.lineItems?.find((item) => item.description?.includes('Late Fee'));

    if (existingLateFeeItem) {
      return res.status(409).json({ error: 'Late fee already applied' });
    }

    // Add late fee as line item
    const updatedLineItems = [
      ...(invoice.lineItems || []),
      {
        id: `late-fee-${Date.now()}`,
        description: `Late Fee (${tenant.lateFeePercentage}%)`,
        quantity: 1,
        unitPrice: lateFee,
        total: lateFee,
        taxRate: 0,
        taxAmount: 0,
      },
    ];

    // Recalculate totals
    const subtotal = updatedLineItems.reduce((sum, item) => sum + item.total, 0);
    const totalTax = updatedLineItems.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
    const total = subtotal + totalTax;
    const amountDue = total - (invoice.amountPaid || 0);

    await invoiceService.update<Invoice>(Collections.INVOICES, invoiceId, {
      lineItems: updatedLineItems,
      subtotal,
      totalTax,
      total,
      amountDue,
      status: 'overdue',
      updatedAt: Timestamp.now(),
    } as any);

    res.json({
      success: true,
      lateFee,
      newTotal: total,
      amountDue,
    });
  } catch (error: any) {
    console.error('Error applying late fee:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Scheduled function to automatically apply late fees
 * Runs daily at midnight
 */
export const applyLateFees = functions.scheduler.onSchedule(
  {
    schedule: 'every day 00:00',
    timeZone: 'Asia/Colombo',
  },
  async (event) => {
    console.log('Running late fee application job');

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find overdue invoices that haven't been paid or cancelled
      const overdueInvoices = await db
        .collection(Collections.INVOICES)
        .where('status', 'in', ['sent', 'delivered', 'viewed', 'overdue'])
        .where('dateDue', '<', today)
        .where('amountDue', '>', 0)
        .get();

      console.log(`Found ${overdueInvoices.size} overdue invoices`);

      let lateFeesApplied = 0;
      let totalLateFees = 0;

      for (const doc of overdueInvoices.docs) {
        const invoice = { ...doc.data(), id: doc.id } as Invoice;

        // Get tenant
        const tenant = await tenantService.get<Tenant>(Collections.TENANTS, invoice.tenantId);
        if (!tenant || !tenant.lateFeePercentage) {
          continue; // Skip if tenant doesn't have late fee configured
        }

        // Check if late fee already applied
        const hasLateFee = invoice.lineItems?.some((item) => item.description?.includes('Late Fee'));
        if (hasLateFee) {
          continue; // Already applied
        }

        const lateFee = calculateLateFee(invoice, tenant);

        if (lateFee > 0) {
          try {
            // Add late fee as line item
            const updatedLineItems = [
              ...(invoice.lineItems || []),
              {
                id: `late-fee-${Date.now()}`,
                description: `Late Fee (${tenant.lateFeePercentage}%)`,
                quantity: 1,
                unitPrice: lateFee,
                total: lateFee,
                taxRate: 0,
                taxAmount: 0,
              },
            ];

            // Recalculate totals
            const subtotal = updatedLineItems.reduce((sum, item) => sum + item.total, 0);
            const totalTax = updatedLineItems.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
            const total = subtotal + totalTax;
            const amountDue = total - (invoice.amountPaid || 0);

            await doc.ref.update({
              lineItems: updatedLineItems,
              subtotal,
              totalTax,
              total,
              amountDue,
              status: 'overdue',
              updatedAt: Timestamp.now(),
            });

            lateFeesApplied++;
            totalLateFees += lateFee;

            console.log(`Applied late fee of Rs. ${lateFee} to invoice ${invoice.invoiceNumber}`);
          } catch (error) {
            console.error(`Failed to apply late fee to invoice ${invoice.invoiceNumber}:`, error);
          }
        }
      }

      console.log(
        `Late fee job completed. Applied ${lateFeesApplied} late fees totaling Rs. ${totalLateFees.toFixed(2)}`
      );
    } catch (error) {
      console.error('Late fee application job error:', error);
    }
  }
);

// ============================================================================
// INVOICE STATUS UPDATES
// ============================================================================

/**
 * Update invoice status based on due date
 */
export const updateInvoiceStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const tenantId = req.tenantId!;

    const invoice = await invoiceService.get<Invoice>(Collections.INVOICES, invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    let newStatus = invoice.status;

    // Check if invoice is overdue
    if (invoice.dateDue && invoice.amountDue > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDate = invoice.dateDue.toDate();
      dueDate.setHours(0, 0, 0, 0);

      if (dueDate < today && invoice.status !== 'paid' && invoice.status !== 'cancelled') {
        newStatus = 'overdue';
      }
    }

    // Check if invoice is fully paid
    if (invoice.amountDue <= 0 && invoice.total > 0) {
      newStatus = 'paid';
    }

    if (newStatus !== invoice.status) {
      await invoiceService.update<Invoice>(Collections.INVOICES, invoiceId, {
        status: newStatus,
        updatedAt: Timestamp.now(),
      } as any);
    }

    res.json({
      success: true,
      oldStatus: invoice.status,
      newStatus,
    });
  } catch (error: any) {
    console.error('Error updating invoice status:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Scheduled function to update all invoice statuses
 * Runs daily at 1 AM
 */
export const updateAllInvoiceStatuses = functions.scheduler.onSchedule(
  {
    schedule: 'every day 01:00',
    timeZone: 'Asia/Colombo',
  },
  async (event) => {
    console.log('Running invoice status update job');

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find invoices that should be marked as overdue
      const invoicesToUpdate = await db
        .collection(Collections.INVOICES)
        .where('status', 'in', ['sent', 'delivered', 'viewed'])
        .where('dateDue', '<', today)
        .where('amountDue', '>', 0)
        .get();

      console.log(`Found ${invoicesToUpdate.size} invoices to mark as overdue`);

      let updatedCount = 0;

      for (const doc of invoicesToUpdate.docs) {
        try {
          await doc.ref.update({
            status: 'overdue',
            updatedAt: Timestamp.now(),
          });
          updatedCount++;
        } catch (error) {
          console.error(`Failed to update invoice ${doc.id}:`, error);
        }
      }

      console.log(`Invoice status update job completed. Updated ${updatedCount} invoices to overdue.`);
    } catch (error) {
      console.error('Invoice status update job error:', error);
    }
  }
);

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Bulk delete invoices
 */
export const bulkDeleteInvoices = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceIds } = req.body;
    const tenantId = req.tenantId!;

    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({ error: 'invoiceIds array is required' });
    }

    if (invoiceIds.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 invoices can be deleted at once' });
    }

    const batch = db.batch();
    let deleteCount = 0;

    for (const invoiceId of invoiceIds) {
      const invoice = await invoiceService.get<Invoice>(Collections.INVOICES, invoiceId);

      if (invoice && invoice.tenantId === tenantId) {
        const invoiceRef = db.collection(Collections.INVOICES).doc(invoiceId);
        batch.delete(invoiceRef);
        deleteCount++;
      }
    }

    await batch.commit();

    res.json({
      success: true,
      deletedCount: deleteCount,
    });
  } catch (error: any) {
    console.error('Error bulk deleting invoices:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Bulk update invoice status
 */
export const bulkUpdateInvoiceStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceIds, status } = req.body;
    const tenantId = req.tenantId!;

    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({ error: 'invoiceIds array is required' });
    }

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const validStatuses = ['draft', 'sent', 'delivered', 'viewed', 'overdue', 'paid', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (invoiceIds.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 invoices can be updated at once' });
    }

    const batch = db.batch();
    let updateCount = 0;

    for (const invoiceId of invoiceIds) {
      const invoice = await invoiceService.get<Invoice>(Collections.INVOICES, invoiceId);

      if (invoice && invoice.tenantId === tenantId) {
        const invoiceRef = db.collection(Collections.INVOICES).doc(invoiceId);
        batch.update(invoiceRef, {
          status,
          updatedAt: Timestamp.now(),
        });
        updateCount++;
      }
    }

    await batch.commit();

    res.json({
      success: true,
      updatedCount: updateCount,
    });
  } catch (error: any) {
    console.error('Error bulk updating invoice status:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// ALL FUNCTIONS EXPORTED INLINE ABOVE
// ============================================================================
