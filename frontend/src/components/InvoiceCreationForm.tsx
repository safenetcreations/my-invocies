/**
 * Invoice Creation Form Component
 * Comprehensive form for creating invoices with real-time tax calculations
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  Alert,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Autocomplete,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Paper,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Send as SendIcon,
  Preview as PreviewIcon,
  PictureAsPdf as PdfIcon,
  Calculate as CalculateIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useAuth } from '../hooks/useEnhancedAuth';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

interface LineItem {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxable: boolean;
  taxCategory: 'standard' | 'zero-rated' | 'exempt';
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  registrationType: 'vat' | 'svat' | 'none';
  tin?: string;
  vatNumber?: string;
}

interface Product {
  id: string;
  name: string;
  description?: string;
  unitPrice: number;
  taxCategory: 'standard' | 'zero-rated' | 'exempt';
  ssclApplicable: boolean;
}

interface TaxCalculationResult {
  lineItems: LineItem[];
  subtotal: number;
  totalDiscount: number;
  taxBreakdown: {
    vatAmount: number;
    ssclAmount: number;
    totalTax: number;
  };
  total: number;
  taxSummary: {
    taxableSupplies: number;
    zeroRatedSupplies: number;
    exemptSupplies: number;
  };
}

interface InvoiceFormData {
  invoiceType: 'proforma' | 'tax_invoice' | 'credit_note' | 'debit_note';
  clientId: string;
  dateIssued: Date;
  dateDue: Date | null;
  dateOfSupply: Date | null;
  lineItems: LineItem[];
  notes?: string;
  terms?: string;
}

export const InvoiceCreationForm: React.FC = () => {
  const { activeTenant, getAuthToken } = useAuth();

  // Form state
  const [formData, setFormData] = useState<InvoiceFormData>({
    invoiceType: 'tax_invoice',
    clientId: '',
    dateIssued: new Date(),
    dateDue: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    dateOfSupply: new Date(),
    lineItems: [],
    notes: '',
    terms: '',
  });

  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [taxCalculation, setTaxCalculation] = useState<TaxCalculationResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  useEffect(() => {
    loadClients();
    loadProducts();
  }, [activeTenant]);

  useEffect(() => {
    if (formData.lineItems.length > 0 && selectedClient) {
      calculateTaxes();
    }
  }, [formData.lineItems, selectedClient]);

  const loadClients = async () => {
    try {
      const token = await getAuthToken();
      const response = await axios.get(`${API_URL}/api/clients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setClients(response.data);
    } catch (err: any) {
      console.error('Failed to load clients:', err);
    }
  };

  const loadProducts = async () => {
    try {
      const token = await getAuthToken();
      const response = await axios.get(`${API_URL}/api/products`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProducts(response.data);
    } catch (err: any) {
      console.error('Failed to load products:', err);
    }
  };

  const calculateTaxes = useCallback(async () => {
    if (!selectedClient || formData.lineItems.length === 0) return;

    try {
      setLoading(true);
      const token = await getAuthToken();

      const response = await axios.post(
        `${API_URL}/api/invoices/calculate-taxes`,
        {
          lineItems: formData.lineItems,
          clientId: selectedClient.id,
          dateOfSupply: formData.dateOfSupply,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setTaxCalculation(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to calculate taxes');
    } finally {
      setLoading(false);
    }
  }, [selectedClient, formData.lineItems, formData.dateOfSupply]);

  const addLineItem = () => {
    const newItem: LineItem = {
      description: '',
      quantity: 1,
      unitPrice: 0,
      discount: 0,
      taxable: true,
      taxCategory: 'standard',
      taxRate: 0.15,
      taxAmount: 0,
      lineTotal: 0,
    };
    setFormData((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, newItem],
    }));
  };

  const removeLineItem = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      lineItems: prev.lineItems.filter((_, i) => i !== index),
    }));
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    setFormData((prev) => {
      const newLineItems = [...prev.lineItems];
      newLineItems[index] = {
        ...newLineItems[index],
        [field]: value,
      };

      // Recalculate line total
      const item = newLineItems[index];
      const subtotal = item.quantity * item.unitPrice;
      const discountAmount = subtotal * item.discount;
      const taxableAmount = subtotal - discountAmount;
      const taxAmount = item.taxable ? taxableAmount * item.taxRate : 0;

      newLineItems[index].taxAmount = taxAmount;
      newLineItems[index].lineTotal = taxableAmount + taxAmount;

      return {
        ...prev,
        lineItems: newLineItems,
      };
    });
  };

  const addProductToLineItems = (product: Product) => {
    const newItem: LineItem = {
      productId: product.id,
      description: product.description || product.name,
      quantity: 1,
      unitPrice: product.unitPrice,
      discount: 0,
      taxable: product.taxCategory !== 'exempt',
      taxCategory: product.taxCategory,
      taxRate: product.taxCategory === 'standard' ? 0.15 : 0,
      taxAmount: 0,
      lineTotal: product.unitPrice,
    };
    setFormData((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, newItem],
    }));
  };

  const handleClientChange = (client: Client | null) => {
    setSelectedClient(client);
    if (client) {
      setFormData((prev) => ({
        ...prev,
        clientId: client.id,
      }));
    }
  };

  const handlePreview = async () => {
    try {
      setLoading(true);
      const token = await getAuthToken();

      // First create a draft invoice
      const invoiceData = {
        ...formData,
        status: 'draft',
        lineItems: taxCalculation?.lineItems || formData.lineItems,
        subtotal: taxCalculation?.subtotal || 0,
        totalDiscount: taxCalculation?.totalDiscount || 0,
        taxBreakdown: taxCalculation?.taxBreakdown || {
          vatAmount: 0,
          ssclAmount: 0,
          totalTax: 0,
        },
        total: taxCalculation?.total || 0,
        amountPaid: 0,
        amountDue: taxCalculation?.total || 0,
        currency: 'LKR',
        clientSnapshot: {
          name: selectedClient?.name,
          email: selectedClient?.email,
          tin: selectedClient?.tin,
          vatNumber: selectedClient?.vatNumber,
        },
        createdBy: 'current-user-id', // TODO: Get from auth context
      };

      const createResponse = await axios.post(
        `${API_URL}/api/invoices`,
        invoiceData,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const invoiceId = createResponse.data.id;

      // Get preview HTML
      const previewResponse = await axios.get(
        `${API_URL}/api/invoices/${invoiceId}/preview`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setPreviewHtml(previewResponse.data.html);
      setPreviewDialogOpen(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate preview');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (status: 'draft' | 'sent') => {
    try {
      setSaving(true);
      setError(null);

      // Validate
      if (!selectedClient) {
        setError('Please select a client');
        setSaving(false);
        return;
      }

      if (formData.lineItems.length === 0) {
        setError('Please add at least one line item');
        setSaving(false);
        return;
      }

      // Validate invoice data
      const token = await getAuthToken();
      const validationResponse = await axios.post(
        `${API_URL}/api/invoices/validate`,
        {
          invoiceType: formData.invoiceType,
          clientId: selectedClient.id,
          lineItems: taxCalculation?.lineItems || formData.lineItems,
          dateOfSupply: formData.dateOfSupply,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!validationResponse.data.valid) {
        setError(`Validation failed: ${validationResponse.data.errors.join(', ')}`);
        setSaving(false);
        return;
      }

      // Create invoice
      const invoiceData = {
        ...formData,
        status,
        lineItems: taxCalculation?.lineItems || formData.lineItems,
        subtotal: taxCalculation?.subtotal || 0,
        totalDiscount: taxCalculation?.totalDiscount || 0,
        taxBreakdown: taxCalculation?.taxBreakdown || {
          vatAmount: 0,
          ssclAmount: 0,
          totalTax: 0,
        },
        total: taxCalculation?.total || 0,
        amountPaid: 0,
        amountDue: taxCalculation?.total || 0,
        currency: 'LKR',
        clientSnapshot: {
          name: selectedClient?.name,
          email: selectedClient?.email,
          tin: selectedClient?.tin,
          vatNumber: selectedClient?.vatNumber,
          address: selectedClient?.address,
        },
        createdBy: 'current-user-id', // TODO: Get from auth context
      };

      const response = await axios.post(
        `${API_URL}/api/invoices`,
        invoiceData,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setSuccess(`Invoice ${response.data.invoiceNumber} ${status === 'draft' ? 'saved as draft' : 'created successfully'}`);

      // Reset form
      setFormData({
        invoiceType: 'tax_invoice',
        clientId: '',
        dateIssued: new Date(),
        dateDue: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        dateOfSupply: new Date(),
        lineItems: [],
        notes: '',
        terms: '',
      });
      setSelectedClient(null);
      setTaxCalculation(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
        <Typography variant="h4" gutterBottom>
          Create Invoice
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Invoice Header */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Invoice Details
                </Typography>
                <Divider sx={{ mb: 2 }} />

                <Grid container spacing={2}>
                  <Grid item xs={12} md={3}>
                    <FormControl fullWidth>
                      <InputLabel>Invoice Type</InputLabel>
                      <Select
                        value={formData.invoiceType}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            invoiceType: e.target.value as any,
                          }))
                        }
                        label="Invoice Type"
                      >
                        <MenuItem value="tax_invoice">Tax Invoice</MenuItem>
                        <MenuItem value="proforma">Proforma Invoice</MenuItem>
                        <MenuItem value="credit_note">Credit Note</MenuItem>
                        <MenuItem value="debit_note">Debit Note</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} md={3}>
                    <DatePicker
                      label="Invoice Date"
                      value={formData.dateIssued}
                      onChange={(date) =>
                        setFormData((prev) => ({ ...prev, dateIssued: date || new Date() }))
                      }
                      slotProps={{ textField: { fullWidth: true } }}
                    />
                  </Grid>

                  <Grid item xs={12} md={3}>
                    <DatePicker
                      label="Due Date"
                      value={formData.dateDue}
                      onChange={(date) =>
                        setFormData((prev) => ({ ...prev, dateDue: date }))
                      }
                      slotProps={{ textField: { fullWidth: true } }}
                    />
                  </Grid>

                  <Grid item xs={12} md={3}>
                    <DatePicker
                      label="Date of Supply"
                      value={formData.dateOfSupply}
                      onChange={(date) =>
                        setFormData((prev) => ({ ...prev, dateOfSupply: date }))
                      }
                      slotProps={{ textField: { fullWidth: true } }}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Client Selection */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Client Information
                </Typography>
                <Divider sx={{ mb: 2 }} />

                <Autocomplete
                  options={clients}
                  getOptionLabel={(option) => option.name}
                  value={selectedClient}
                  onChange={(_, value) => handleClientChange(value)}
                  renderInput={(params) => (
                    <TextField {...params} label="Select Client" required />
                  )}
                  renderOption={(props, option) => (
                    <li {...props}>
                      <Box>
                        <Typography>{option.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.email} | {option.registrationType.toUpperCase()}
                        </Typography>
                      </Box>
                    </li>
                  )}
                />

                {selectedClient && (
                  <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="caption" color="text.secondary">
                          Email
                        </Typography>
                        <Typography>{selectedClient.email || 'N/A'}</Typography>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Typography variant="caption" color="text.secondary">
                          Phone
                        </Typography>
                        <Typography>{selectedClient.phone || 'N/A'}</Typography>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Typography variant="caption" color="text.secondary">
                          Registration Type
                        </Typography>
                        <Chip
                          label={selectedClient.registrationType.toUpperCase()}
                          size="small"
                          color={
                            selectedClient.registrationType === 'vat'
                              ? 'primary'
                              : selectedClient.registrationType === 'svat'
                              ? 'secondary'
                              : 'default'
                          }
                        />
                      </Grid>
                      {selectedClient.tin && (
                        <Grid item xs={12} md={6}>
                          <Typography variant="caption" color="text.secondary">
                            TIN
                          </Typography>
                          <Typography>{selectedClient.tin}</Typography>
                        </Grid>
                      )}
                    </Grid>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Line Items */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6">Line Items</Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Autocomplete
                      options={products}
                      getOptionLabel={(option) => option.name}
                      onChange={(_, value) => value && addProductToLineItems(value)}
                      renderInput={(params) => (
                        <TextField {...params} label="Quick Add Product" size="small" sx={{ width: 250 }} />
                      )}
                    />
                    <Button
                      startIcon={<AddIcon />}
                      onClick={addLineItem}
                      variant="outlined"
                    >
                      Add Line
                    </Button>
                  </Box>
                </Box>
                <Divider sx={{ mb: 2 }} />

                {formData.lineItems.length === 0 ? (
                  <Alert severity="info">
                    No line items added. Click "Add Line" or select a product to get started.
                  </Alert>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Description</TableCell>
                        <TableCell align="right" sx={{ width: 100 }}>
                          Qty
                        </TableCell>
                        <TableCell align="right" sx={{ width: 120 }}>
                          Unit Price
                        </TableCell>
                        <TableCell align="right" sx={{ width: 100 }}>
                          Discount %
                        </TableCell>
                        <TableCell sx={{ width: 150 }}>Tax Category</TableCell>
                        <TableCell align="right" sx={{ width: 120 }}>
                          Line Total
                        </TableCell>
                        <TableCell align="center" sx={{ width: 60 }}>

                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {formData.lineItems.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <TextField
                              fullWidth
                              size="small"
                              value={item.description}
                              onChange={(e) =>
                                updateLineItem(index, 'description', e.target.value)
                              }
                              placeholder="Item description"
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              fullWidth
                              size="small"
                              type="number"
                              value={item.quantity}
                              onChange={(e) =>
                                updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              fullWidth
                              size="small"
                              type="number"
                              value={item.unitPrice}
                              onChange={(e) =>
                                updateLineItem(index, 'unitPrice', parseFloat(e.target.value) || 0)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              fullWidth
                              size="small"
                              type="number"
                              value={item.discount * 100}
                              onChange={(e) =>
                                updateLineItem(
                                  index,
                                  'discount',
                                  parseFloat(e.target.value) / 100 || 0
                                )
                              }
                              inputProps={{ min: 0, max: 100 }}
                            />
                          </TableCell>
                          <TableCell>
                            <FormControl fullWidth size="small">
                              <Select
                                value={item.taxCategory}
                                onChange={(e) =>
                                  updateLineItem(index, 'taxCategory', e.target.value)
                                }
                              >
                                <MenuItem value="standard">Standard (15%)</MenuItem>
                                <MenuItem value="zero-rated">Zero-Rated</MenuItem>
                                <MenuItem value="exempt">Exempt</MenuItem>
                              </Select>
                            </FormControl>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {formatCurrency(item.lineTotal)}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <IconButton
                              size="small"
                              onClick={() => removeLineItem(index)}
                              color="error"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Tax Calculation Summary */}
          {taxCalculation && (
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <CalculateIcon sx={{ mr: 1 }} />
                    <Typography variant="h6">Tax Breakdown</Typography>
                  </Box>
                  <Divider sx={{ mb: 2 }} />

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography>Subtotal:</Typography>
                      <Typography>{formatCurrency(taxCalculation.subtotal)}</Typography>
                    </Box>

                    {taxCalculation.totalDiscount > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography>Discount:</Typography>
                        <Typography color="error">
                          -{formatCurrency(taxCalculation.totalDiscount)}
                        </Typography>
                      </Box>
                    )}

                    {taxCalculation.taxBreakdown.vatAmount > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography>VAT (15%):</Typography>
                        <Typography>{formatCurrency(taxCalculation.taxBreakdown.vatAmount)}</Typography>
                      </Box>
                    )}

                    {taxCalculation.taxBreakdown.ssclAmount > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography>SSCL (2.5%):</Typography>
                        <Typography>{formatCurrency(taxCalculation.taxBreakdown.ssclAmount)}</Typography>
                      </Box>
                    )}

                    <Divider />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="h6">Total:</Typography>
                      <Typography variant="h6" color="primary">
                        {formatCurrency(taxCalculation.total)}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Tax Summary Details */}
                  <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary" gutterBottom>
                      Tax Summary
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption">Taxable Supplies:</Typography>
                        <Typography variant="caption">
                          {formatCurrency(taxCalculation.taxSummary.taxableSupplies)}
                        </Typography>
                      </Box>
                      {taxCalculation.taxSummary.zeroRatedSupplies > 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="caption">Zero-Rated:</Typography>
                          <Typography variant="caption">
                            {formatCurrency(taxCalculation.taxSummary.zeroRatedSupplies)}
                          </Typography>
                        </Box>
                      )}
                      {taxCalculation.taxSummary.exemptSupplies > 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="caption">Exempt:</Typography>
                          <Typography variant="caption">
                            {formatCurrency(taxCalculation.taxSummary.exemptSupplies)}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          )}

          {/* Notes & Terms */}
          <Grid item xs={12} md={taxCalculation ? 6 : 12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Additional Information
                </Typography>
                <Divider sx={{ mb: 2 }} />

                <TextField
                  fullWidth
                  label="Internal Notes"
                  multiline
                  rows={3}
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Internal notes (not visible to client)"
                  sx={{ mb: 2 }}
                />

                <TextField
                  fullWidth
                  label="Payment Terms"
                  multiline
                  rows={3}
                  value={formData.terms}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, terms: e.target.value }))
                  }
                  placeholder="Payment terms and conditions"
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Action Buttons */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
              <Button
                variant="outlined"
                startIcon={<PreviewIcon />}
                onClick={handlePreview}
                disabled={loading || !selectedClient || formData.lineItems.length === 0}
              >
                Preview
              </Button>
              <Button
                variant="outlined"
                startIcon={<SaveIcon />}
                onClick={() => handleSave('draft')}
                disabled={saving || !selectedClient || formData.lineItems.length === 0}
              >
                Save Draft
              </Button>
              <Button
                variant="contained"
                startIcon={<SendIcon />}
                onClick={() => handleSave('sent')}
                disabled={saving || !selectedClient || formData.lineItems.length === 0}
              >
                {saving ? 'Creating...' : 'Create & Send'}
              </Button>
            </Paper>
          </Grid>
        </Grid>

        {/* Preview Dialog */}
        <Dialog
          open={previewDialogOpen}
          onClose={() => setPreviewDialogOpen(false)}
          maxWidth="lg"
          fullWidth
        >
          <DialogTitle>Invoice Preview</DialogTitle>
          <DialogContent>
            <Box
              dangerouslySetInnerHTML={{ __html: previewHtml }}
              sx={{
                '& img': { maxWidth: '100%' },
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                p: 2,
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPreviewDialogOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default InvoiceCreationForm;
