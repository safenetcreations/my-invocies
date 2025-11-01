/**
 * Tax Configuration Settings Component
 * Allows tenant admins to configure VAT, SVAT, SSCL settings
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Switch,
  FormControlLabel,
  TextField,
  Button,
  Grid,
  Alert,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Save as SaveIcon,
  Info as InfoIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useEnhancedAuth';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

interface TaxConfig {
  vatRegistered: boolean;
  vatNumber?: string;
  svatRegistered: boolean;
  ssclApplicable: boolean;
  defaultVatRate: number;
  fiscalYearStart: string; // MM-DD format
}

interface TenantInfo {
  id: string;
  name: string;
  legalName: string;
  tin?: string;
  brn?: string;
  taxConfig: TaxConfig;
}

export const TaxConfigurationSettings: React.FC = () => {
  const { activeTenant, getAuthToken } = useAuth();
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [taxConfig, setTaxConfig] = useState<TaxConfig>({
    vatRegistered: false,
    vatNumber: '',
    svatRegistered: false,
    ssclApplicable: false,
    defaultVatRate: 0.15, // 15% default
    fiscalYearStart: '01-01', // January 1st default
  });

  useEffect(() => {
    loadTenantData();
  }, [activeTenant]);

  const loadTenantData = async () => {
    if (!activeTenant) return;

    try {
      setLoading(true);
      const token = await getAuthToken();
      const response = await axios.get(`${API_URL}/api/tenants/current`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setTenant(response.data);
      setTaxConfig(response.data.taxConfig || taxConfig);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load tenant data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // Validate
      if (taxConfig.vatRegistered && !taxConfig.vatNumber) {
        setError('VAT Number is required when VAT Registered');
        setSaving(false);
        return;
      }

      if (!tenant?.tin && taxConfig.vatRegistered) {
        setError('TIN is required for VAT registration. Please update company details first.');
        setSaving(false);
        return;
      }

      const token = await getAuthToken();
      await axios.put(
        `${API_URL}/api/tenants/${activeTenant?.id}`,
        { taxConfig },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setSuccess('Tax configuration saved successfully');
      await loadTenantData(); // Reload to get updated data
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save tax configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof TaxConfig, value: any) => {
    setTaxConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading tax configuration...</Typography>
      </Box>
    );
  }

  const isVatValid = taxConfig.vatRegistered && taxConfig.vatNumber && tenant?.tin;
  const isSvatValid = taxConfig.svatRegistered;
  const isSsclValid = taxConfig.ssclApplicable;

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Tax Configuration
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Configure your tax settings for Sri Lankan IRD compliance
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mt: 2, mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mt: 2, mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Grid container spacing={3} sx={{ mt: 2 }}>
        {/* Company Tax Identifiers */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Company Tax Identifiers
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Legal Name"
                    value={tenant?.legalName || ''}
                    disabled
                    helperText="Company legal name (readonly)"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Business Registration Number (BRN)"
                    value={tenant?.brn || 'Not set'}
                    disabled
                    helperText="Set in company details"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Taxpayer Identification Number (TIN)"
                    value={tenant?.tin || 'Not set'}
                    disabled
                    helperText="Required for VAT registration"
                    error={!tenant?.tin}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* VAT Configuration */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                  VAT (Value Added Tax)
                </Typography>
                {isVatValid && <CheckCircleIcon color="success" />}
                {taxConfig.vatRegistered && !isVatValid && <WarningIcon color="warning" />}
              </Box>
              <Divider sx={{ mb: 2 }} />

              <FormControlLabel
                control={
                  <Switch
                    checked={taxConfig.vatRegistered}
                    onChange={(e) => handleChange('vatRegistered', e.target.checked)}
                  />
                }
                label={
                  <Box>
                    <Typography>VAT Registered</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Enable if your company is registered for VAT with IRD
                    </Typography>
                  </Box>
                }
              />

              {taxConfig.vatRegistered && (
                <Box sx={{ mt: 2 }}>
                  <TextField
                    fullWidth
                    label="VAT Registration Number"
                    value={taxConfig.vatNumber || ''}
                    onChange={(e) => handleChange('vatNumber', e.target.value)}
                    placeholder="e.g., 123456789V"
                    required
                    error={!taxConfig.vatNumber}
                    helperText={
                      !taxConfig.vatNumber
                        ? 'VAT Number is required'
                        : 'As registered with IRD'
                    }
                    sx={{ mb: 2 }}
                  />

                  <FormControl fullWidth>
                    <InputLabel>Default VAT Rate</InputLabel>
                    <Select
                      value={taxConfig.defaultVatRate}
                      onChange={(e) => handleChange('defaultVatRate', e.target.value)}
                      label="Default VAT Rate"
                    >
                      <MenuItem value={0.15}>15% (Standard Rate)</MenuItem>
                      <MenuItem value={0.08}>8% (Reduced Rate - if applicable)</MenuItem>
                      <MenuItem value={0.0}>0% (Zero-Rated)</MenuItem>
                    </Select>
                    <FormHelperText>
                      Current standard rate: 15% (as of 2024)
                    </FormHelperText>
                  </FormControl>

                  <Alert severity="info" sx={{ mt: 2 }}>
                    <Typography variant="caption">
                      <strong>VAT Registration Requirements:</strong>
                      <br />• Annual turnover exceeds LKR 12 million
                      <br />• TIN is required
                      <br />• Must file VAT returns monthly/quarterly
                    </Typography>
                  </Alert>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* SVAT Configuration */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                  SVAT (Simplified VAT)
                </Typography>
                {isSvatValid && taxConfig.svatRegistered && <CheckCircleIcon color="success" />}
              </Box>
              <Divider sx={{ mb: 2 }} />

              <FormControlLabel
                control={
                  <Switch
                    checked={taxConfig.svatRegistered}
                    onChange={(e) => handleChange('svatRegistered', e.target.checked)}
                    disabled={taxConfig.vatRegistered}
                  />
                }
                label={
                  <Box>
                    <Typography>SVAT Registered</Typography>
                    <Typography variant="caption" color="text.secondary">
                      For businesses under VAT threshold
                    </Typography>
                  </Box>
                }
              />

              {taxConfig.svatRegistered && (
                <Box sx={{ mt: 2 }}>
                  <Chip
                    label="SVAT Rate: 3%"
                    color="primary"
                    sx={{ mb: 2 }}
                  />

                  <Alert severity="info">
                    <Typography variant="caption">
                      <strong>SVAT Requirements:</strong>
                      <br />• Annual turnover: LKR 3M - 12M
                      <br />• Fixed 3% rate on taxable supplies
                      <br />• Cannot claim input VAT
                      <br />• Quarterly voucher purchases required
                    </Typography>
                  </Alert>
                </Box>
              )}

              {taxConfig.vatRegistered && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  SVAT is not applicable for VAT registered businesses
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* SSCL Configuration */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                  SSCL (Social Security Contribution Levy)
                </Typography>
                <Tooltip title="SSCL is applied on top of VAT for most goods and services">
                  <IconButton size="small">
                    <InfoIcon />
                  </IconButton>
                </Tooltip>
              </Box>
              <Divider sx={{ mb: 2 }} />

              <FormControlLabel
                control={
                  <Switch
                    checked={taxConfig.ssclApplicable}
                    onChange={(e) => handleChange('ssclApplicable', e.target.checked)}
                  />
                }
                label={
                  <Box>
                    <Typography>SSCL Applicable</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Enable if your products/services are subject to SSCL
                    </Typography>
                  </Box>
                }
              />

              {taxConfig.ssclApplicable && (
                <Box sx={{ mt: 2 }}>
                  <Chip
                    label="SSCL Rate: 2.5%"
                    color="secondary"
                    sx={{ mb: 2 }}
                  />

                  <Alert severity="info">
                    <Typography variant="caption">
                      <strong>SSCL Details:</strong>
                      <br />• Applies to most goods and services
                      <br />• Charged on value including VAT
                      <br />• Rate: 2.5% (as of 2024)
                      <br />• Certain exemptions apply
                    </Typography>
                  </Alert>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Fiscal Year Configuration */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Fiscal Year
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <FormControl fullWidth>
                <InputLabel>Fiscal Year Start</InputLabel>
                <Select
                  value={taxConfig.fiscalYearStart}
                  onChange={(e) => handleChange('fiscalYearStart', e.target.value)}
                  label="Fiscal Year Start"
                >
                  <MenuItem value="01-01">January 1st (Calendar Year)</MenuItem>
                  <MenuItem value="04-01">April 1st</MenuItem>
                  <MenuItem value="07-01">July 1st</MenuItem>
                  <MenuItem value="10-01">October 1st</MenuItem>
                </Select>
                <FormHelperText>
                  Select your company's fiscal year start date
                </FormHelperText>
              </FormControl>

              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="caption">
                  Most Sri Lankan businesses use April 1st fiscal year
                </Typography>
              </Alert>
            </CardContent>
          </Card>
        </Grid>

        {/* Save Button */}
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button
              variant="outlined"
              onClick={loadTenantData}
              disabled={saving}
            >
              Reset
            </Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={saving || !activeTenant}
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </Box>
        </Grid>

        {/* Compliance Summary */}
        <Grid item xs={12}>
          <Card sx={{ bgcolor: 'background.default' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Tax Compliance Summary
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {isVatValid ? (
                      <CheckCircleIcon color="success" />
                    ) : (
                      <WarningIcon color="disabled" />
                    )}
                    <Box>
                      <Typography variant="subtitle2">VAT Registration</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {taxConfig.vatRegistered
                          ? `Registered: ${taxConfig.vatNumber}`
                          : 'Not registered'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                <Grid item xs={12} md={4}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {taxConfig.svatRegistered ? (
                      <CheckCircleIcon color="success" />
                    ) : (
                      <WarningIcon color="disabled" />
                    )}
                    <Box>
                      <Typography variant="subtitle2">SVAT Registration</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {taxConfig.svatRegistered ? 'Registered (3%)' : 'Not registered'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                <Grid item xs={12} md={4}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {taxConfig.ssclApplicable ? (
                      <CheckCircleIcon color="success" />
                    ) : (
                      <WarningIcon color="disabled" />
                    )}
                    <Box>
                      <Typography variant="subtitle2">SSCL</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {taxConfig.ssclApplicable ? 'Applicable (2.5%)' : 'Not applicable'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default TaxConfigurationSettings;
