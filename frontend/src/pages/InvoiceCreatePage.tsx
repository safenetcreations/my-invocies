import React from 'react';
import { Box, Typography } from '@mui/material';

const InvoiceCreatePage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Create Invoice
      </Typography>
      <Typography variant="body1">
        Invoice creation form with Sri Lankan tax compliance will be here.
      </Typography>
    </Box>
  );
};

export default InvoiceCreatePage;