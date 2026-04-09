import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sql = neon(process.env.DATABASE_URL!);

  if (req.method === 'GET') {
    try {
      const result = await sql`
        SELECT monthly_limit
        FROM app_settings
        WHERE id = 1
      `;

      return res.status(200).json(result[0] ?? null);
    } catch (error) {
      console.error('[GET /api/settings]', error);
      return res.status(500).json({ error: 'Error cargando límite mensual' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { monthly_limit } = req.body;

      await sql`
        INSERT INTO app_settings (id, monthly_limit)
        VALUES (1, ${monthly_limit})
        ON CONFLICT (id)
        DO UPDATE SET monthly_limit = EXCLUDED.monthly_limit
      `;

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('[PUT /api/settings]', error);
      return res.status(500).json({ error: 'Error guardando límite mensual' });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}