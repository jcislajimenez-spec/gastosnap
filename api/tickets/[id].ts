import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sql = neon(process.env.DATABASE_URL!);

  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;

      await sql`
        DELETE FROM tickets
        WHERE id = ${id}
      `;

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('[DELETE /api/tickets/[id]]', error);
      return res.status(500).json({ error: 'Error borrando ticket' });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}