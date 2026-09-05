import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { db } from './src/db';
import { performers, auditions, auditionSlots, callbacks, customAttributes, users, loginTokens } from './src/db/schema';
import { eq, and, asc, gt } from 'drizzle-orm';
import cors from 'cors';
import { BrevoClient } from '@getbrevo/brevo';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const client = new BrevoClient({ apiKey: process.env.BREVO_API_KEY || '' });

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cors());

  // --- API Routes ---

  // Custom Attributes
  app.get('/api/custom-attributes', async (req, res) => {
    try {
      const attrs = await db.select().from(customAttributes).orderBy(asc(customAttributes.order));
      res.json(attrs);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch custom attributes' });
    }
  });

  app.post('/api/custom-attributes', async (req, res) => {
    try {
      const newAttr = await db.insert(customAttributes).values(req.body).returning();
      res.json(newAttr[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create custom attribute' });
    }
  });

  app.delete('/api/custom-attributes/:id', async (req, res) => {
    try {
      await db.delete(customAttributes).where(eq(customAttributes.id, parseInt(req.params.id)));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete custom attribute' });
    }
  });

  // Performers
  app.get('/api/performers', async (req, res) => {
    try {
      const allPerformers = await db.select().from(performers);
      res.json(allPerformers);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch performers' });
    }
  });

  app.post('/api/performers', async (req, res) => {
    try {
      const newPerformer = await db.insert(performers).values(req.body).returning();
      res.json(newPerformer[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create performer' });
    }
  });

  // Auditions
  app.get('/api/auditions', async (req, res) => {
    try {
      const allAuditions = await db.select().from(auditions);
      res.json(allAuditions);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch auditions' });
    }
  });

  app.post('/api/auditions', async (req, res) => {
    try {
      const newAudition = await db.insert(auditions).values(req.body).returning();
      res.json(newAudition[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create audition' });
    }
  });

  // Slots
  app.get('/api/auditions/:id/slots', async (req, res) => {
    try {
      const slots = await db.select().from(auditionSlots).where(eq(auditionSlots.auditionId, parseInt(req.params.id)));
      res.json(slots);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch slots' });
    }
  });

  app.post('/api/slots', async (req, res) => {
    try {
      const newSlot = await db.insert(auditionSlots).values(req.body).returning();
      res.json(newSlot[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create slot' });
    }
  });

  app.patch('/api/slots/:id', async (req, res) => {
    try {
      const updatedSlot = await db.update(auditionSlots)
        .set(req.body)
        .where(eq(auditionSlots.id, parseInt(req.params.id)))
        .returning();
      res.json(updatedSlot[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update slot' });
    }
  });

  // Callbacks
  app.get('/api/auditions/:id/callbacks', async (req, res) => {
    try {
      const auditionCallbacks = await db.select().from(callbacks).where(eq(callbacks.auditionId, parseInt(req.params.id)));
      res.json(auditionCallbacks);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch callbacks' });
    }
  });

  app.post('/api/callbacks', async (req, res) => {
    try {
      const newCallback = await db.insert(callbacks).values(req.body).returning();
      res.json(newCallback[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create callback' });
    }
  });

  // --- Auth Routes ---

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { firstName, lastName, email } = req.body;
      const newUser = await db.insert(users).values({ firstName, lastName, email }).returning();
      res.json(newUser[0]);
    } catch (err: any) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ error: 'Email already registered' });
      }
      res.status(500).json({ error: 'Failed to register user' });
    }
  });

  app.post('/api/auth/login-request', async (req, res) => {
    try {
      const { email } = req.body;
      const user = await db.select().from(users).where(eq(users.email, email)).get();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await db.insert(loginTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });

      const loginLink = `${APP_URL}/verify?token=${token}`;

      if (process.env.BREVO_API_KEY) {
        await client.transactionalEmails.sendTransacEmail({
          subject: "Login to AuditionEase",
          htmlContent: `<p>Click the link below to login to your AuditionEase account:</p><p><a href="${loginLink}">${loginLink}</a></p><p>This link expires in 15 minutes.</p>`,
          sender: { "name": "AuditionEase", "email": "noreply@auditionease.com" },
          to: [{ "email": email }],
        });
      } else {
        console.log('--- LOGIN LINK (No Brevo API Key) ---');
        console.log(loginLink);
        console.log('-----------------------------------------');
      }

      res.json({ success: true, message: 'Login email sent' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to process login request' });
    }
  });

  app.post('/api/auth/verify-token', async (req, res) => {
    try {
      const { token } = req.body;
      const loginToken = await db.select().from(loginTokens)
        .where(and(
          eq(loginTokens.token, token),
          eq(loginTokens.used, false),
          gt(loginTokens.expiresAt, new Date())
        ))
        .get();

      if (!loginToken) {
        return res.status(400).json({ error: 'Invalid or expired token' });
      }

      // Mark token as used
      await db.update(loginTokens)
        .set({ used: true })
        .where(eq(loginTokens.id, loginToken.id));

      const user = await db.select().from(users).where(eq(users.id, loginToken.userId)).get();
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const sessionToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

      res.json({ user, sessionToken });
    } catch (err) {
      res.status(500).json({ error: 'Failed to verify token' });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'No token provided' });

      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
      
      const user = await db.select().from(users).where(eq(users.id, decoded.userId)).get();
      if (!user) return res.status(404).json({ error: 'User not found' });

      res.json(user);
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
