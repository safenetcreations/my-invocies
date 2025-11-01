import React from 'react';
import { Box, Typography } from '@mui/material';

const InvoicesPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Invoices
      </Typography>
      <Typography variant="body1">
        Invoice management interface will be implemented here.
        Features: List, Create, Edit, Send, Track invoices.
      </Typography>
    </Box>
  );
};

export default InvoicesPage;