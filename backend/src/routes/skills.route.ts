import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { getDb } from '../utils/database';
import { z } from 'zod';

const router = Router();
router.use(authMiddleware);

const SkillSchema = z.object({
  name: z.string().min(1, 'Nama skill tidak boleh kosong'),
  description: z.string().optional(),
  prompt_injection: z.string().min(1, 'Instruksi tidak boleh kosong'),
  is_active: z.boolean().default(true),
});

// GET /skills
router.get('/', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const skills = db.prepare('SELECT * FROM ai_skills WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
    // Convert is_active back to boolean
    const formatted = skills.map((s: any) => ({
      ...s,
      is_active: s.is_active === 1
    }));
    res.json({ success: true, skills: formatted });
  } catch (err) { next(err); }
});

// POST /skills
router.post('/', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = SkillSchema.parse(req.body);
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO ai_skills (user_id, name, description, prompt_injection, is_active) 
      VALUES (?, ?, ?, ?, ?) 
      RETURNING *
    `);
    const skill = stmt.get(req.userId, data.name, data.description || '', data.prompt_injection, data.is_active ? 1 : 0) as any;
    skill.is_active = skill.is_active === 1;
    res.json({ success: true, skill });
  } catch (err) { next(err); }
});

// PUT /skills/:id
router.put('/:id', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = SkillSchema.parse(req.body);
    const db = getDb();
    
    // Pastikan skill milik user
    const exists = db.prepare('SELECT id FROM ai_skills WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!exists) {
      return res.status(404).json({ error: 'Skill tidak ditemukan' });
    }

    const stmt = db.prepare(`
      UPDATE ai_skills 
      SET name = ?, description = ?, prompt_injection = ?, is_active = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `);
    stmt.run(data.name, data.description || '', data.prompt_injection, data.is_active ? 1 : 0, req.params.id, req.userId);
    
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /skills/:id
router.delete('/:id', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM ai_skills WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
