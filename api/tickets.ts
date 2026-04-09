import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sql = neon(process.env.DATABASE_URL!);

  if (req.method === 'GET') {
    try {
      const tickets = await sql`SELECT * FROM tickets ORDER BY date DESC`;
      return res.status(200).json(tickets);
    } catch (error) {
      console.error('[GET /api/tickets]', error);
      return res.status(500).json({ error: 'Error cargando tickets' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { description, amount, date, category, user_name, user_id = null } = req.body;

      const result = await sql`
        INSERT INTO tickets (description, amount, date, category, user_name, user_id)
        VALUES (${description}, ${amount}, ${date}, ${category}, ${user_name}, ${user_id})
        RETURNING *
      `;

      return res.status(200).json(result[0]);
    } catch (error) {
      console.error('[POST /api/tickets]', error);
      return res.status(500).json({ error: 'Error guardando ticket' });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}