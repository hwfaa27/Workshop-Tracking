import express from 'express';
import * as dotenv from 'dotenv';
import { createApiRouter } from '../src/server-routes.ts';

dotenv.config();

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use('/api', createApiRouter(() => {}));

export default app;
