import fs from 'fs';
import path from 'path';

/** Pictures of menu groups / items live here (served as /uploads/...). Override with UPLOAD_DIR. */
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
export const MENU_IMG_DIR = path.join(UPLOAD_DIR, 'menu');
fs.mkdirSync(MENU_IMG_DIR, { recursive: true });

/** Web path of a stored menu picture file name. */
export const imageUrl = (file: string | null | undefined) => (file ? `/uploads/menu/${file}` : null);
