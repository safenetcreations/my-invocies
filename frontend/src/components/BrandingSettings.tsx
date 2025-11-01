/**
 * Branding Settings Component
 * Logo upload and color scheme management with intelligent extraction
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Avatar,
  Grid,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  Stack,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Palette as PaletteIcon,
  AutoFixHigh as AutoIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useEnhancedAuth';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/my-invocies/us-central1/api';

export function BrandingSettings() {
  const { activeTenant, user } = useAuth();
  const [branding, setBranding] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [manualColors, setManualColors] = useState({
    primaryColor: '',
    secondaryColor: '',
    accentColor: '',
  });
  const [showManualEdit, setShowManualEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load branding data
  useEffect(() => {
    loadBranding();
  }, [activeTenant]);

  const loadBranding = async () => {
    if (!activeTenant) return;

    try {
      setLoading(true);
      const token = await user?.getIdToken();
      const response = await axios.get(
        `${API_URL}/api/tenants/${activeTenant.id}/branding`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setBranding(response.data.branding);
      if (response.data.branding) {
        setManualColors({
          primaryColor: response.data.branding.primaryColor || '',
          secondaryColor: response.data.branding.secondaryColor || '',
          accentColor: response.data.branding.accentColor || '',
        });
      }
    } catch (error: any) {
      console.error('Error loading branding:', error);
      setError('Failed to load branding settings');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Please upload JPG, PNG, SVG, or WebP');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large. Maximum size is 5MB');
      return;
    }

    setSelectedFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    setError(null);
  };

  const handleUploadLogo = async () => {
    if (!selectedFile || !activeTenant) return;

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('logo', selectedFile);

      const token = await user?.getIdToken();
      const response = await axios.post(
        `${API_URL}/api/tenants/${activeTenant.id}/branding/logo`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      setSuccess('Logo uploaded! Extracting colors...');
      setProcessing(true);

      // Poll for color extraction completion
      setTimeout(() => {
        loadBranding();
        setProcessing(false);
        setSuccess('Logo and colors updated successfully!');
        setSelectedFile(null);
        setLogoPreview(null);

        // Refresh page to apply new theme
        setTimeout(() => window.location.reload(), 1500);
      }, 3000);
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      setError(error.response?.data?.error || 'Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateColors = async () => {
    if (!activeTenant) return;

    try {
      setLoading(true);
      setError(null);

      const token = await user?.getIdToken();
      await axios.put(
        `${API_URL}/api/tenants/${activeTenant.id}/branding/colors`,
        manualColors,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setSuccess('Colors updated successfully!');
      await loadBranding();

      // Refresh page to apply new theme
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      console.error('Error updating colors:', error);
      setError(error.response?.data?.error || 'Failed to update colors');
    } finally {
      setLoading(false);
    }
  };

  const handleReExtractColors = async () => {
    if (!activeTenant) return;

    try {
      setLoading(true);
      setError(null);

      const token = await user?.getIdToken();
      await axios.post(
        `${API_URL}/api/tenants/${activeTenant.id}/branding/re-extract`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setSuccess('Colors re-extracted successfully!');
      await loadBranding();

      // Refresh page to apply new theme
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      console.error('Error re-extracting colors:', error);
      setError(error.response?.data?.error || 'Failed to re-extract colors');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !branding) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Intelligent Branding
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Upload your company logo and we'll automatically extract the perfect color scheme with WCAG compliance
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Logo Upload Card */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Company Logo
              </Typography>

              <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                <Avatar
                  src={logoPreview || branding?.logoUrl}
                  sx={{
                    width: 150,
                    height: 150,
                    bgcolor: branding?.primaryColor || 'primary.main',
                  }}
                >
                  <PaletteIcon sx={{ fontSize: 60 }} />
                </Avatar>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/svg+xml,image/webp"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />

                <Button
                  variant="outlined"
                  startIcon={<UploadIcon />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  Choose Logo
                </Button>

                {selectedFile && (
                  <Box textAlign="center">
                    <Typography variant="caption" display="block">
                      {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
                    </Typography>
                    <Box mt={1}>
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={handleUploadLogo}
                        disabled={uploading || processing}
                        startIcon={uploading ? <CircularProgress size={16} /> : <UploadIcon />}
                      >
                        {uploading ? 'Uploading...' : processing ? 'Processing...' : 'Upload & Extract Colors'}
                      </Button>
                    </Box>
                  </Box>
                )}

                {branding?.logoUrl && !selectedFile && (
                  <Button
                    size="small"
                    startIcon={<RefreshIcon />}
                    onClick={handleReExtractColors}
                    disabled={loading}
                  >
                    Re-extract Colors
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Color Palette Card */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">Color Palette</Typography>
                {branding?.autoExtracted && (
                  <Chip
                    icon={<AutoIcon />}
                    label="Auto-Extracted"
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                )}
              </Box>

              {branding ? (
                <Stack spacing={2}>
                  <ColorPreview
                    label="Primary"
                    color={branding.primaryColor}
                    textColor={branding.textOnPrimary}
                    contrastRatio={branding.contrastRatios?.primaryContrast}
                  />
                  <ColorPreview
                    label="Secondary"
                    color={branding.secondaryColor}
                    textColor={branding.textOnSecondary}
                    contrastRatio={branding.contrastRatios?.secondaryContrast}
                  />
                  <ColorPreview
                    label="Accent"
                    color={branding.accentColor}
                    textColor={branding.textOnAccent}
                    contrastRatio={branding.contrastRatios?.accentContrast}
                  />

                  <Divider sx={{ my: 2 }} />

                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="caption" color="text.secondary">
                      WCAG Compliance:
                    </Typography>
                    {branding.wcagCompliant ? (
                      <Chip icon={<CheckIcon />} label="Compliant" color="success" size="small" />
                    ) : (
                      <Chip icon={<CloseIcon />} label="Non-Compliant" color="error" size="small" />
                    )}
                  </Box>

                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setShowManualEdit(!showManualEdit)}
                  >
                    {showManualEdit ? 'Cancel Manual Edit' : 'Manually Adjust Colors'}
                  </Button>
                </Stack>
              ) : (
                <Alert severity="info">Upload a logo to extract colors automatically</Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Manual Color Edit */}
        {showManualEdit && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Manual Color Adjustment
                </Typography>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label="Primary Color"
                      value={manualColors.primaryColor}
                      onChange={(e) =>
                        setManualColors({ ...manualColors, primaryColor: e.target.value })
                      }
                      placeholder="#2563eb"
                      helperText="Hex, RGB, or named color"
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label="Secondary Color"
                      value={manualColors.secondaryColor}
                      onChange={(e) =>
                        setManualColors({ ...manualColors, secondaryColor: e.target.value })
                      }
                      placeholder="#10b981"
                      helperText="Optional"
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label="Accent Color"
                      value={manualColors.accentColor}
                      onChange={(e) =>
                        setManualColors({ ...manualColors, accentColor: e.target.value })
                      }
                      placeholder="#f59e0b"
                      helperText="Optional"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Button
                      variant="contained"
                      onClick={handleUpdateColors}
                      disabled={!manualColors.primaryColor || loading}
                    >
                      Update Colors
                    </Button>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}

// Color Preview Component
function ColorPreview({
  label,
  color,
  textColor,
  contrastRatio,
}: {
  label: string;
  color: string;
  textColor: string;
  contrastRatio?: number;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" gutterBottom display="block">
        {label}
      </Typography>
      <Box
        sx={{
          bgcolor: color,
          color: textColor,
          p: 2,
          borderRadius: 1,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography variant="body1" fontWeight="bold">
          {color}
        </Typography>
        {contrastRatio && (
          <Chip
            label={`${contrastRatio.toFixed(2)}:1`}
            size="small"
            sx={{
              bgcolor: textColor,
              color: color,
            }}
          />
        )}
      </Box>
    </Box>
  );
}
