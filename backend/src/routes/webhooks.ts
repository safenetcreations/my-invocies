import { Router, Request, Response } from 'express';
import { prisma } from '../index';

const router = Router();

// Email webhook (SendGrid example)
router.post('/email', async (req: Request, res: Response) => {
  try {
    // Verify webhook signature here in production
    const events = req.body;

    for (const event of events) {
      const { event: eventType, email, sg_message_id } = event;
      
      // Find invoice by message ID (stored in tracking metadata)
      const trackingEvent = await prisma.trackingEvent.findFirst({
        where: {
          kind: 'EMAIL_SENT',
          metadata: {
            path: ['messageId'],
            equals: sg_message_id,
          },
        },
      });

      if (trackingEvent) {
        let kind: any = null;
        
        switch (eventType) {
          case 'bounce':
          case 'blocked':
          case 'dropped':
            kind = 'EMAIL_BOUNCE';
            break;
          case 'delivered':
            // Already tracked on send
            continue;
          case 'open':
            kind = 'EMAIL_OPEN';
            break;
          case 'click':
            kind = 'LINK_CLICK';
            break;
        }

        if (kind) {
          await prisma.trackingEvent.create({
            data: {
              invoiceId: trackingEvent.invoiceId,
              kind,
              metadata: {
                email,
                messageId: sg_message_id,
                webhookEvent: event,
              },
            },
          });
        }
      }
    }

    res.status(200).json({ message: 'Webhook processed' });
  } catch (error) {
    console.error('Email webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// WhatsApp webhook
router.post('/whatsapp', async (req: Request, res: Response) => {
  try {
    const { entry } = req.body;

    for (const entryItem of entry) {
      const { changes } = entryItem;
      
      for (const change of changes) {
        const { value } = change;
        const { statuses, messages } = value;

        // Handle status updates
        if (statuses) {
          for (const status of statuses) {
            const { id: messageId, status: messageStatus } = status;
            
            // Find tracking event by message ID
            const trackingEvent = await prisma.trackingEvent.findFirst({
              where: {
                kind: 'WHATSAPP_SENT',
                metadata: {
                  path: ['messageId'],
                  equals: messageId,
                },
              },
            });

            if (trackingEvent) {
              let kind: any = null;
              
              switch (messageStatus) {
                case 'delivered':
                  kind = 'WHATSAPP_DELIVERED';
                  break;
                case 'read':
                  kind = 'WHATSAPP_READ';
                  break;
                case 'failed':
                  kind = 'WHATSAPP_FAILED';
                  break;
              }

              if (kind) {
                await prisma.trackingEvent.create({
                  data: {
                    invoiceId: trackingEvent.invoiceId,
                    kind,
                    metadata: {
                      messageId,
                      status: messageStatus,
                      timestamp: status.timestamp,
                    },
                  },
                });
              }
            }
          }
        }
      }
    }

    res.status(200).json({ message: 'Webhook processed' });
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Stripe webhook
router.post('/stripe', async (req: Request, res: Response) => {
  try {
    const sig = req.headers['stripe-signature'];
    // Verify webhook signature in production
    
    const event = req.body;

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const { metadata } = paymentIntent;
      
      if (metadata.invoiceId) {
        // Record payment
        await prisma.payment.create({
          data: {
            invoiceId: metadata.invoiceId,
            amount: paymentIntent.amount / 100, // Convert from cents
            currency: paymentIntent.currency.toUpperCase(),
            paymentMethod: 'ONLINE',
            dateReceived: new Date(),
            gatewayReference: paymentIntent.id,
          },
        });

        // Update invoice status
        const invoice = await prisma.invoice.findUnique({
          where: { id: metadata.invoiceId },
        });

        if (invoice) {
          const totalPaid = invoice.amountPaid + (paymentIntent.amount / 100);
          const status = totalPaid >= invoice.total ? 'PAID' : 'PARTIAL_PAID';

          await prisma.invoice.update({
            where: { id: metadata.invoiceId },
            data: {
              amountPaid: totalPaid,
              status,
            },
          });

          // Record tracking event
          await prisma.trackingEvent.create({
            data: {
              invoiceId: metadata.invoiceId,
              kind: 'PAYMENT_RECEIVED',
              metadata: {
                amount: paymentIntent.amount / 100,
                paymentMethod: 'ONLINE',
                gatewayReference: paymentIntent.id,
                gateway: 'stripe',
              },
            },
          });
        }
      }
    }

    res.status(200).json({ message: 'Webhook processed' });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// WhatsApp webhook verification (GET request)
router.get('/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.status(403).json({ error: 'Verification failed' });
  }
});

export default router;