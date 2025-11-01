/**
 * Company Switcher Component
 * Allows users to switch between their tenant memberships
 */

import React, { useState } from 'react';
import {
  Box,
  Button,
  Menu,
  MenuItem,
  Avatar,
  Typography,
  Divider,
  ListItemIcon,
  ListItemText,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import {
  Business as BusinessIcon,
  ExpandMore as ExpandMoreIcon,
  Add as AddIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useEnhancedAuth';

export function CompanySwitcher() {
  const { activeTenant, tenants, switchTenant } = useAuth();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSwitchTenant = async (tenantId: string) => {
    if (tenantId === activeTenant?.id) {
      handleClose();
      return;
    }

    setSwitching(true);
    try {
      await switchTenant(tenantId);
      handleClose();
    } catch (error: any) {
      console.error('Error switching tenant:', error);
      alert(error.message);
      setSwitching(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'error';
      case 'admin':
        return 'warning';
      case 'accountant':
        return 'info';
      case 'sales':
        return 'success';
      default:
        return 'default';
    }
  };

  if (!activeTenant) return null;

  return (
    <>
      <Button
        onClick={handleClick}
        variant="outlined"
        endIcon={<ExpandMoreIcon />}
        disabled={switching}
        sx={{
          justifyContent: 'space-between',
          textTransform: 'none',
          borderColor: 'divider',
          color: 'text.primary',
          minWidth: 200,
          '&:hover': {
            borderColor: 'primary.main',
            backgroundColor: 'action.hover',
          },
        }}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <Avatar
            src={activeTenant.branding?.logoUrl}
            sx={{
              width: 24,
              height: 24,
              bgcolor: activeTenant.branding?.primaryColor || 'primary.main',
            }}
          >
            <BusinessIcon fontSize="small" />
          </Avatar>
          <Typography variant="body2" noWrap sx={{ maxWidth: 140 }}>
            {activeTenant.name}
          </Typography>
        </Box>
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        PaperProps={{
          sx: {
            minWidth: 280,
            mt: 1,
          },
        }}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
      >
        <Box px={2} py={1}>
          <Typography variant="overline" color="text.secondary">
            Switch Company
          </Typography>
        </Box>

        <Divider />

        {tenants.map((tenant) => {
          const isActive = tenant.id === activeTenant?.id;
          const membership = activeTenant?.role || 'viewer';

          return (
            <MenuItem
              key={tenant.id}
              onClick={() => handleSwitchTenant(tenant.id)}
              selected={isActive}
              sx={{
                py: 1.5,
                px: 2,
              }}
            >
              <ListItemIcon>
                <Avatar
                  src={tenant.branding?.logoUrl}
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: tenant.branding?.primaryColor || 'primary.main',
                  }}
                >
                  <BusinessIcon fontSize="small" />
                </Avatar>
              </ListItemIcon>

              <ListItemText
                primary={
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="body2" fontWeight={isActive ? 600 : 400}>
                      {tenant.name}
                    </Typography>
                    {isActive && <CheckIcon fontSize="small" color="primary" />}
                  </Box>
                }
                secondary={
                  <Box mt={0.5}>
                    <Chip
                      label={membership.toUpperCase()}
                      size="small"
                      color={getRoleBadgeColor(membership)}
                      sx={{ height: 18, fontSize: '0.65rem' }}
                    />
                  </Box>
                }
              />
            </MenuItem>
          );
        })}

        <Divider />

        <MenuItem
          onClick={() => {
            handleClose();
            setCreateDialogOpen(true);
          }}
          sx={{ py: 1.5, px: 2 }}
        >
          <ListItemIcon>
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'action.selected' }}>
              <AddIcon fontSize="small" />
            </Avatar>
          </ListItemIcon>
          <ListItemText primary="Create New Company" />
        </MenuItem>
      </Menu>

      {/* Create Company Dialog */}
      <CreateCompanyDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />
    </>
  );
}

// ============================================================================
// CREATE COMPANY DIALOG
// ============================================================================

interface CreateCompanyDialogProps {
  open: boolean;
  onClose: () => void;
}

function CreateCompanyDialog({ open, onClose }: CreateCompanyDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    legalName: '',
    tin: '',
    address: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // TODO: Call API to create new tenant
      console.log('Creating tenant:', formData);

      // Close dialog and refresh
      onClose();
      window.location.reload();
    } catch (error: any) {
      console.error('Error creating tenant:', error);
      alert(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Company</DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} mt={1}>
          <TextField
            label="Company Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            fullWidth
          />
          <TextField
            label="Legal Name"
            value={formData.legalName}
            onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
            required
            fullWidth
          />
          <TextField
            label="TIN Number"
            value={formData.tin}
            onChange={(e) => setFormData({ ...formData, tin: e.target.value })}
            fullWidth
          />
          <TextField
            label="Address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            multiline
            rows={3}
            fullWidth
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!formData.name || !formData.legalName || submitting}
        >
          {submitting ? 'Creating...' : 'Create Company'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
