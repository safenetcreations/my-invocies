import React from 'react';
import { Box, Typography } from '@mui/material';

const ProductsPage: React.FC = () => (
  <Box>
    <Typography variant="h4" component="h1" gutterBottom>Products</Typography>
    <Typography variant="body1">Product catalog management will be here.</Typography>
  </Box>
);

const ContactsPage: React.FC = () => (
  <Box>
    <Typography variant="h4" component="h1" gutterBottom>Contacts</Typography>
    <Typography variant="body1">Customer contact management will be here.</Typography>
  </Box>
);

const SettingsPage: React.FC = () => (
  <Box>
    <Typography variant="h4" component="h1" gutterBottom>Settings</Typography>
    <Typography variant="body1">Business settings and integrations will be here.</Typography>
  </Box>
);

export { ProductsPage, ContactsPage, SettingsPage };