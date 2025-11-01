import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
} from '@mui/material';
import {
  Receipt,
  TrendingUp,
  AttachMoney,
  Schedule,
} from '@mui/icons-material';

const DashboardPage: React.FC = () => {
  const stats = [
    {
      title: 'Total Invoices',
      value: '156',
      icon: Receipt,
      color: 'primary.main',
      change: '+12% from last month',
    },
    {
      title: 'Revenue',
      value: 'LKR 2,450,000',
      icon: AttachMoney,
      color: 'success.main',
      change: '+8% from last month',
    },
    {
      title: 'Pending',
      value: '23',
      icon: Schedule,
      color: 'warning.main',
      change: '5 overdue',
    },
    {
      title: 'Paid Rate',
      value: '87%',
      icon: TrendingUp,
      color: 'info.main',
      change: '+3% from last month',
    },
  ];

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Dashboard
      </Typography>
      
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Grid item xs={12} sm={6} md={3} key={stat.title}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Icon sx={{ color: stat.color, mr: 1 }} />
                    <Typography variant="h6" component="h2">
                      {stat.title}
                    </Typography>
                  </Box>
                  <Typography variant="h4" component="p" gutterBottom>
                    {stat.value}
                  </Typography>
                  <Chip
                    label={stat.change}
                    size="small"
                    color={stat.change.includes('+') ? 'success' : 'warning'}
                    variant="outlined"
                  />
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Invoices
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Invoice list will be displayed here
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Actions
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Quick action buttons will be here
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;