import React from 'react';
import { Box, Typography } from '@mui/material';

const InvoiceDetailPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Invoice Details
      </Typography>
      <Typography variant="body1">
        Invoice detail view with tracking timeline, payment recording, and resend options.
      </Typography>
    </Box>
  );
};

export default InvoiceDetailPage;